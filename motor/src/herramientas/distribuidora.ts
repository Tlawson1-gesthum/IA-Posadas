// Herramientas del agente de una distribuidora (integracion.tipo "distribuidora"): hablan con /api/agente/distri/* del sistema
// de la distribuidora (Pensa) con su clave. El teléfono SIEMPRE sale de ctx.telefono (quien escribe), nunca de lo que diga el modelo.
// Precios, totales, mínimo, límite, stock y días los calcula el sistema: acá solo se pasan a texto para el modelo.
import { createHash } from "node:crypto";
import type { ContextoHerramienta, Herramienta } from "../tipos.js";
import { autorizacion, baseUrl } from "./semorfa.js";

async function pedirJson(url: string, init: RequestInit = {}): Promise<{ status: number; cuerpo: any }> {
  const r = await fetch(url, { signal: AbortSignal.timeout(10000), ...init, headers: { accept: "application/json", ...init.headers } });
  const cuerpo = await r.json().catch(() => null);
  return { status: r.status, cuerpo };
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
