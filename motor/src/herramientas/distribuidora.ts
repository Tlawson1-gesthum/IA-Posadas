// Herramientas del agente de una distribuidora (integracion.tipo "distribuidora"): hablan con /api/agente/distri/* del sistema
// de la distribuidora (Pensa) con su clave. El teléfono SIEMPRE sale de ctx.telefono (quien escribe), nunca de lo que diga el modelo.
// Precios, totales, mínimo, límite, stock y días los calcula el sistema: acá solo se pasan a texto para el modelo.
import { createHash } from "node:crypto";
import type { ContextoHerramienta, Herramienta } from "../tipos.js";
import { autorizacion, baseUrl } from "./semorfa.js";

// Si el sistema tarda más de 10 s (pico de pedidos) o se corta la conexión, se reintenta una vez con más tiempo. Es seguro:
// cada pedido va con el id del mensaje y el sistema no lo carga dos veces (mismo mensaje_id → mismo pedido). Sin el reintento,
// en la prueba de carga (paso 29) el agente decía "no pude" de pedidos que el sistema sí había cargado.
async function pedirJson(url: string, init: RequestInit = {}): Promise<{ status: number; cuerpo: any }> {
  const intentar = async (ms: number) => {
    const r = await fetch(url, { signal: AbortSignal.timeout(ms), ...init, headers: { accept: "application/json", ...init.headers } });
    const cuerpo = await r.json().catch(() => null);
    return { status: r.status, cuerpo };
  };
  // solo lo que se puede repetir sin efectos: consultas y lo que lleva mensaje_id (pedido); una promesa o un alta no se reintenta
  const repetible = !init.method || init.method === "GET" || String(init.body ?? "").includes('"mensaje_id"');
  try {
    return await intentar(10000);
  } catch (e) {
    if (!repetible) throw e;
    return intentar(25000);
  }
}

const api = (ctx: ContextoHerramienta, ruta: string, cuerpo?: unknown) =>
  pedirJson(`${baseUrl(ctx)}/api/agente/distri/${ruta}`, cuerpo === undefined
    ? { headers: autorizacion(ctx) }
    : { method: "POST", headers: { "content-type": "application/json", ...autorizacion(ctx) }, body: JSON.stringify(cuerpo) });

/** Centavos → "$ 1.234" o "$ 1.234,50" (sin que el modelo haga cuentas). */
export const pesos = (c: unknown) => {
  const n = Number(c);
  if (!Number.isFinite(n)) return null;
  return "$ " + (n / 100).toLocaleString("es-AR", { minimumFractionDigits: n % 100 ? 2 : 0, maximumFractionDigits: 2 });
};

/** Lo que el modelo tiene que saber de una respuesta que no salió bien. Nunca le pasa datos internos. */
function problema(status: number, cuerpo: any): string {
  if (status === 401) return JSON.stringify({ ok: false, motivo: "El sistema de la distribuidora no reconoce al asistente. Derivá a una persona." });
  if (status === 403) return JSON.stringify({ ok: false, motivo: "El asistente de pedidos está apagado en la distribuidora. Derivá a una persona." });
  if (status === 429) return JSON.stringify({ ok: false, motivo: "Hubo demasiadas consultas seguidas desde este número. Pedile que espere un rato o derivá." });
  return JSON.stringify({ ok: false, motivo: cuerpo?.error ?? `El sistema respondió ${status}.`, errores: cuerpo?.errores });
}

// Renglones del pedido: id del catálogo y cantidad. Sin precios ni descuentos (el agente nunca los pone).
const ESQUEMA_ITEMS = {
  type: "array",
  description: "Productos del pedido con el producto_id de ver_catalogo y la cantidad que pidió el cliente.",
  items: {
    type: "object",
    properties: { producto_id: { type: "integer" }, cantidad: { type: "number" } },
    required: ["producto_id", "cantidad"],
    additionalProperties: false,
  },
} as const;
const lineasDe = (v: unknown) => (Array.isArray(v) ? v : []).map((l: any) => ({ producto_id: Number(l?.producto_id), cantidad: Number(l?.cantidad) }));
const DIA = /^\d{4}-\d{2}-\d{2}$/;

/** Cotización del sistema → texto corto para el modelo (con los montos ya escritos). */
function resumenCotizacion(d: any) {
  return {
    renglones: (d.lineas ?? []).map((l: any) => ({
      producto_id: l.producto_id,
      texto: `${l.cantidad} × ${l.nombre}${l.presentacion ? ` (${l.presentacion})` : ""}`,
      precio_unitario_sin_iva: pesos(l.precio_centavos),
      importe_sin_iva: pesos(l.subtotal_centavos),
      ...(l.sin_stock ? { sin_stock: true } : {}),
    })),
    subtotal_sin_iva: pesos(d.subtotal_centavos),
    iva: pesos(d.iva_centavos),
    total_con_iva: pesos(d.total_centavos),
    compra_minima: d.minimo_centavos ? pesos(d.minimo_centavos) : null,
    entrega: d.fecha_entrega,
    necesita_aprobacion: (d.motivos ?? []).length ? d.motivos : null,
    no_se_pudo: (d.errores ?? []).length ? d.errores : null,
  };
}

/** Pedido del sistema → lo que el modelo puede contar. */
function resumenPedido(p: any) {
  const ESTADO: Record<string, string> = {
    borrador: "esperando confirmación o aprobación", confirmado: "confirmado, para armar", armado: "armado, listo para salir",
    en_reparto: "en reparto", entregado: "entregado", cancelado: "cancelado",
  };
  return {
    codigo: p.codigo, estado: ESTADO[p.estado] ?? p.estado, entrega: p.fecha_entrega, total_con_iva: pesos(p.total_centavos),
    productos: (p.items ?? []).map((i: any) => `${i.cantidad} × ${i.nombre}${i.presentacion ? ` (${i.presentacion})` : ""}`),
    ...(p.motivos?.length ? { motivos: p.motivos } : {}),
  };
}

/**
 * Id del mensaje para que el mismo pedido no se cargue dos veces. Con WhatsApp es el id del mensaje de Meta;
 * sin él (simulador), uno estable por teléfono + productos + franja de 2 minutos.
 */
function mensajeId(ctx: ContextoHerramienta, items: unknown): string {
  if (ctx.mensaje?.id) return ctx.mensaje.id;
  const franja = Math.floor(Date.now() / 120000);
  return "sim-" + createHash("sha256").update(`${ctx.telefono}|${JSON.stringify(items)}|${franja}`).digest("hex").slice(0, 32);
}

export const verCatalogo: Herramienta = {
  definicion: {
    name: "ver_catalogo",
    description:
      "Productos de la distribuidora con su presentación, cómo los suelen pedir (alias), si hay stock y, si el cliente que escribe ya está aprobado, el precio de SU lista (sin IVA). Usala para encontrar el producto_id de lo que pide. Con `buscar` trae solo lo que coincide.",
    input_schema: {
      type: "object",
      properties: { buscar: { type: "string", description: "Palabra para filtrar (ej. 'coca', 'yerba'). Vacío = todo." } },
      required: [],
      additionalProperties: false,
    },
  },
  async ejecutar(entrada, ctx) {
    const { status, cuerpo } = await api(ctx, `catalogo?telefono=${encodeURIComponent(ctx.telefono)}`);
    if (status !== 200 || !cuerpo) return problema(status, cuerpo);
    const norm = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    const q = norm(String(entrada.buscar ?? "").trim());
    const productos = (cuerpo.productos ?? [])
      .filter((p: any) => !q || norm([p.nombre, p.presentacion, p.marca, p.categoria, ...(p.alias ?? [])].join(" ")).split(/\s+/).some((w) => w.includes(q)) || norm(p.nombre).includes(q))
      .slice(0, 60)
      .map((p: any) => ({
        producto_id: p.producto_id, nombre: p.nombre, presentacion: p.presentacion || undefined, lo_piden_como: p.alias?.length ? p.alias : undefined,
        hay_stock: p.hay_stock, ...(cuerpo.con_precios ? { precio_sin_iva: pesos(p.precio_centavos) } : {}),
      }));
    return JSON.stringify({ cliente: cuerpo.cliente, con_precios: cuerpo.con_precios, aviso: cuerpo.aviso, productos, ...(productos.length === 60 ? { nota: "Hay más: buscá con una palabra." } : {}) });
  },
};

export const cotizarPedidoB2b: Herramienta = {
  definicion: {
    name: "cotizar_pedido_b2b",
    description:
      "Calcula el pedido con la lista de precios del cliente que escribe: cada renglón, subtotal sin IVA, IVA, total con IVA, día de entrega y si necesita aprobación (mínimo, límite de crédito, stock, día o zona). No guarda nada. Usala siempre antes de mostrar un total.",
    input_schema: {
      type: "object",
      properties: { items: ESQUEMA_ITEMS, fecha_entrega: { type: "string", description: "AAAA-MM-DD solo si el cliente pidió un día. Si no, el sistema pone el próximo día de reparto." } },
      required: ["items"],
      additionalProperties: false,
    },
  },
  async ejecutar(entrada, ctx) {
    const { status, cuerpo } = await api(ctx, "cotizar", {
      telefono: ctx.telefono, lineas: lineasDe(entrada.items), ...(DIA.test(String(entrada.fecha_entrega ?? "")) ? { fecha_entrega: entrada.fecha_entrega } : {}),
    });
    if (status !== 200 || !cuerpo) return problema(status, cuerpo);
    return JSON.stringify({ ok: true, ...resumenCotizacion(cuerpo) });
  },
};

export const crearPedidoBorrador: Herramienta = {
  definicion: {
    name: "crear_pedido_borrador",
    description:
      "Carga el pedido en el sistema de la distribuidora. Entra confirmado solo si el cliente ya dijo que sí al resumen con el total, estás seguro de lo que pidió y cumple todas las reglas; si no, queda en borrador para que lo revise una persona (y te dice por qué). Nunca lo uses sin haber mostrado antes el resumen de cotizar_pedido_b2b.",
    input_schema: {
      type: "object",
      properties: {
        items: ESQUEMA_ITEMS,
        fecha_entrega: { type: "string", description: "AAAA-MM-DD, la misma que usaste al cotizar (si el cliente pidió un día)." },
        cliente_confirmo: { type: "boolean", description: "true solo si el cliente respondió que sí al resumen con el total." },
        seguro_de_lo_que_entendiste: { type: "boolean", description: "false si algún producto o cantidad quedó dudoso (audio confuso, letra que no se lee, algo que adivinaste)." },
        notas: { type: "string", description: "Aclaraciones del cliente para el depósito o el reparto (horario para recibir, a quién entregar)." },
      },
      required: ["items", "cliente_confirmo", "seguro_de_lo_que_entendiste"],
      additionalProperties: false,
    },
  },
  async ejecutar(entrada, ctx) {
    const lineas = lineasDe(entrada.items);
    // confianza: la de la transcripción del audio (si hubo) y lo que dice el modelo; la más baja manda
    const confianza = Math.min(ctx.mensaje?.confianza ?? 1, entrada.seguro_de_lo_que_entendiste === true ? 1 : 0.5);
    const cuerpo = {
      telefono: ctx.telefono, mensaje_id: mensajeId(ctx, lineas), lineas, confianza, confirmado_por_cliente: entrada.cliente_confirmo === true,
      texto: String(ctx.mensaje?.texto ?? "").slice(0, 2000), notas: String(entrada.notas ?? "").slice(0, 500),
      ...(DIA.test(String(entrada.fecha_entrega ?? "")) ? { fecha_entrega: entrada.fecha_entrega } : {}),
    };
    // Mientras la ficha no lo habilite, no se toca el sistema real (igual que crear_pedido de MORFA)
    if (!ctx.ficha.integracion?.crear_pedidos) {
      return JSON.stringify({ ok: true, simulado: true, codigo: "PRUEBA1", estado: cuerpo.confirmado_por_cliente && confianza >= 0.8 ? "confirmado" : "borrador", enviado: cuerpo });
    }
    const { status, cuerpo: r } = await api(ctx, "pedido", cuerpo);
    if (status !== 200 || !r) return problema(status, r);
    if (r.estado === "para_revisar") return JSON.stringify({ ok: true, cargado: false, lo_revisa_una_persona: true, motivos: r.motivos, que_decir: "Lo revisa una persona de la distribuidora y le escribe." });
    const p = resumenPedido(r.pedido);
    if (r.estado === "confirmado") return JSON.stringify({ ok: true, ...p, que_decir: "Quedó confirmado: pasale el código, el total y el día de entrega." });
    if (r.lo_revisa_una_persona) return JSON.stringify({ ok: true, ...p, lo_revisa_una_persona: true, que_decir: "Quedó cargado pero lo tiene que aprobar una persona de la distribuidora (decí el motivo en simple)." });
    return JSON.stringify({ ok: true, ...p, espera_el_si_del_cliente: true, que_decir: "Mostrale el resumen y preguntale si lo confirma. Si dice que sí, usá confirmar_pedido con este código." });
  },
};

export const confirmarPedido: Herramienta = {
  definicion: {
    name: "confirmar_pedido",
    description: "El cliente dijo que sí a un pedido que quedó esperando su confirmación (código de crear_pedido_borrador). Lo pasa a confirmado si sigue cumpliendo las reglas; si no, queda para que lo apruebe una persona.",
    input_schema: { type: "object", properties: { codigo: { type: "string" } }, required: ["codigo"], additionalProperties: false },
  },
  async ejecutar(entrada, ctx) {
    if (!ctx.ficha.integracion?.crear_pedidos) return JSON.stringify({ ok: true, simulado: true, codigo: String(entrada.codigo ?? ""), estado: "confirmado" });
    const { status, cuerpo } = await api(ctx, "confirmar", { telefono: ctx.telefono, codigo: String(entrada.codigo ?? "") });
    if (status !== 200 || !cuerpo) return problema(status, cuerpo);
    return JSON.stringify({ ok: true, ...resumenPedido(cuerpo.pedido), ...(cuerpo.lo_revisa_una_persona ? { lo_revisa_una_persona: true } : {}) });
  },
};

export const consultarPedidoB2b: Herramienta = {
  definicion: {
    name: "consultar_pedido_b2b",
    description: "Pedidos de los últimos 30 días del cliente que escribe (busca por su número: no hace falta el código). Con `codigo` trae solo ese.",
    input_schema: { type: "object", properties: { codigo: { type: "string" } }, required: [], additionalProperties: false },
  },
  async ejecutar(entrada, ctx) {
    const { status, cuerpo } = await api(ctx, `pedidos?telefono=${encodeURIComponent(ctx.telefono)}`);
    if (status !== 200 || !cuerpo) return problema(status, cuerpo);
    const codigo = String(entrada.codigo ?? "").trim().toUpperCase();
    const pedidos = (cuerpo.pedidos ?? []).filter((p: any) => !codigo || p.codigo === codigo).map(resumenPedido);
    return JSON.stringify({ cliente: cuerpo.cliente, pedidos, ...(codigo && !pedidos.length ? { nota: "Ese código no es de un pedido de este cliente." } : {}) });
  },
};

export const altaClientePendiente: Herramienta = {
  definicion: {
    name: "alta_cliente_pendiente",
    description: "Da de alta al comercio que escribe por primera vez (con SU número). Queda para aprobar: la distribuidora le asigna la lista de precios. Hasta entonces no ve precios ni puede comprar.",
    input_schema: {
      type: "object",
      properties: {
        nombre_negocio: { type: "string" },
        direccion: { type: "string" },
        zona: { type: "string", description: "Barrio o localidad." },
        cuit: { type: "string", description: "Si lo dio." },
      },
      required: ["nombre_negocio"],
      additionalProperties: false,
    },
  },
  async ejecutar(entrada, ctx) {
    const { status, cuerpo } = await api(ctx, "cliente-pendiente", {
      telefono: ctx.telefono, nombre: String(entrada.nombre_negocio ?? ""), direccion: String(entrada.direccion ?? ""), zona: String(entrada.zona ?? ""), cuit: String(entrada.cuit ?? ""),
    });
    if (status !== 200 || !cuerpo) return problema(status, cuerpo);
    return JSON.stringify({ ok: true, ya_era_cliente: !!cuerpo.ya_existia, estado: cuerpo.cliente?.estado, que_decir: cuerpo.ya_existia ? "Ya está registrado." : "Quedó registrado: la distribuidora lo aprueba y le asigna los precios." });
  },
};

export const consultarCuenta: Herramienta = {
  definicion: {
    name: "consultar_cuenta",
    description: "Cuenta corriente del cliente que escribe (busca por SU número; nunca la de otro): saldo, vencido, lo que tiene abierto, próximo vencimiento, lo que dejó a cuenta y si ya prometió pagar. Trae también la fecha de hoy.",
    input_schema: { type: "object", properties: {}, required: [], additionalProperties: false },
  },
  async ejecutar(_entrada, ctx) {
    const { status, cuerpo } = await api(ctx, `cuenta?telefono=${encodeURIComponent(ctx.telefono)}`);
    if (status !== 200 || !cuerpo) return problema(status, cuerpo);
    if (!cuerpo.cliente?.conocido) return JSON.stringify({ hoy: cuerpo.hoy_texto, cliente: { conocido: false }, que_decir: "No tengo una cuenta asociada a este número: pasale la charla a una persona (derivar_a_persona, motivo plata)." });
    return JSON.stringify({
      hoy: `${cuerpo.hoy_texto} (${cuerpo.hoy})`,
      cliente: cuerpo.cliente,
      saldo: pesos(cuerpo.saldo_centavos),
      saldo_a_favor: cuerpo.saldo_centavos < 0,
      vencido: pesos(cuerpo.vencido_centavos),
      a_cuenta_sin_aplicar: cuerpo.a_cuenta_centavos ? pesos(cuerpo.a_cuenta_centavos) : undefined,
      proximo_vencimiento: cuerpo.proximo_vencimiento ? `${cuerpo.proximo_vencimiento.dia_texto}: ${pesos(cuerpo.proximo_vencimiento.centavos)}` : null,
      abierto: (cuerpo.abiertos ?? []).map((a: any) => `${a.tipo} ${a.referencia} · falta ${pesos(a.pendiente_centavos)} · ${a.vencido ? "venció" : "vence"} el ${a.vence_texto}`),
      promesa_vigente: cuerpo.promesa_vigente ? `${cuerpo.promesa_vigente.fecha_texto}${cuerpo.promesa_vigente.monto_centavos ? ` por ${pesos(cuerpo.promesa_vigente.monto_centavos)}` : ""}` : null,
    });
  },
};

export const registrarPromesa: Herramienta = {
  definicion: {
    name: "registrar_promesa",
    description: "Anota que el cliente que escribe promete pagar en una fecha (\"te pago el viernes\"). Hasta 7 días desde hoy (usá la fecha de hoy que trae consultar_cuenta). Si es más lejos o ya tenía una promesa, no se anota y hay que derivar. Nunca ofrezcas quitas, cuotas ni otro plazo.",
    input_schema: {
      type: "object",
      properties: {
        fecha: { type: "string", description: "AAAA-MM-DD del día que dijo que paga." },
        monto: { type: "number", description: "Pesos que dijo que paga, si dijo un monto." },
      },
      required: ["fecha"],
      additionalProperties: false,
    },
  },
  async ejecutar(entrada, ctx) {
    const fecha = String(entrada.fecha ?? "");
    if (!DIA.test(fecha)) return JSON.stringify({ ok: false, motivo: "La fecha va como AAAA-MM-DD." });
    const monto = Number(entrada.monto);
    const { status, cuerpo } = await api(ctx, "promesa", { telefono: ctx.telefono, fecha, ...(Number.isFinite(monto) && monto > 0 ? { monto } : {}), nota: "Por WhatsApp" });
    if (status !== 200 || !cuerpo) return problema(status, cuerpo);
    if (cuerpo.deriva) return JSON.stringify({ ok: false, deriva: true, motivo: cuerpo.motivo, que_decir: "No lo anotes: decile que lo ve una persona del equipo y usá derivar_a_persona (motivo plata)." });
    if (cuerpo.sin_deuda) return JSON.stringify({ ok: false, motivo: "No tiene saldo para pagar." });
    return JSON.stringify({ ok: true, fecha: cuerpo.fecha_texto, monto: cuerpo.monto_centavos ? pesos(cuerpo.monto_centavos) : null, que_decir: "Confirmale la fecha (y el monto si lo dijo) y agradecele." });
  },
};

/** Solo links de Mercado Pago, o del propio sistema de la distribuidora (modo de prueba). Nada que pueda mandar a otro lado (T16). */
export function linkSeguro(url: unknown, ficha: { integracion?: { base_url?: string } }): string | null {
  try {
    const u = new URL(String(url));
    if (u.protocol !== "https:" && !/^(127\.0\.0\.1|localhost)$/.test(u.hostname)) return null;
    if (/(^|\.)mercadopago\.com(\.ar)?$/.test(u.hostname)) return u.toString();
    const propio = ficha.integracion?.base_url ? new URL(ficha.integracion.base_url).host : null;
    return propio && u.host === propio ? u.toString() : null;
  } catch {
    return null;
  }
}

export const generarLinkPago: Herramienta = {
  definicion: {
    name: "generar_link_pago",
    description: "Link de Mercado Pago para que el cliente que escribe pague: por un pedido (código), por un monto que no pase lo que debe, o sin nada, por todo su saldo. Solo para SU cuenta. Copiá el link tal cual.",
    input_schema: {
      type: "object",
      properties: {
        codigo: { type: "string", description: "Código del pedido, si quiere pagar uno en particular." },
        monto: { type: "number", description: "Pesos, si quiere pagar una parte." },
      },
      required: [],
      additionalProperties: false,
    },
  },
  async ejecutar(entrada, ctx) {
    const monto = Number(entrada.monto);
    const { status, cuerpo } = await api(ctx, "link-pago", { telefono: ctx.telefono, codigo: String(entrada.codigo ?? ""), ...(Number.isFinite(monto) && monto > 0 ? { monto } : {}) });
    if (status !== 200 || !cuerpo) return problema(status, cuerpo);
    if (!cuerpo.ok) return JSON.stringify({ ok: false, motivo: cuerpo.motivo, ...(cuerpo.deriva ? { que_decir: "No tengo una cuenta asociada a este número: derivá a una persona (motivo plata)." } : {}) });
    const url = linkSeguro(cuerpo.url, ctx.ficha);
    if (!url) return JSON.stringify({ ok: false, motivo: "El link no es de Mercado Pago: derivá a una persona." });
    return JSON.stringify({ ok: true, link: url, monto: pesos(cuerpo.monto_centavos), por: cuerpo.por, que_decir: "Pasale el link y decile que cuando paga se acredita solo." });
  },
};

export const confirmarComprobante: Herramienta = {
  definicion: {
    name: "confirmar_comprobante",
    description: "El cliente respondió si el comprobante que mandó es por lo que dice el sistema (\"Coincide con…\"). Con sí, queda para que una persona lo controle con el banco y lo imputa; con no, lo revisa una persona. Nunca da por pagado nada.",
    input_schema: {
      type: "object",
      properties: {
        comprobante_id: { type: "integer", description: "El número de comprobante que dice el texto entre corchetes." },
        el_cliente_confirma: { type: "boolean" },
      },
      required: ["comprobante_id", "el_cliente_confirma"],
      additionalProperties: false,
    },
  },
  async ejecutar(entrada, ctx) {
    const { status, cuerpo } = await api(ctx, "comprobante", { accion: "confirmar", telefono: ctx.telefono, id: Number(entrada.comprobante_id), confirma: entrada.el_cliente_confirma === true });
    if (status !== 200 || !cuerpo) return problema(status, cuerpo);
    return JSON.stringify({ ok: true, estado: cuerpo.estado, que_decir: cuerpo.que_decir ?? "Lo revisa una persona del equipo." });
  },
};
