// Integración con el sistema propio de MORFA (semorfa.com.ar). La carta y el seguimiento son públicos;
// buscar pedidos por teléfono, confirmar efectivo y marcar los pedidos de Morfi usan una clave (integracion.clave_env).
import type { ContextoHerramienta, Herramienta } from "../tipos.js";

const CACHE_MS = 60_000;
let cacheCarta: { url: string; hasta: number; carta: any } | null = null;

export function baseUrl(ctx: ContextoHerramienta): string {
  const url = ctx.ficha.integracion?.base_url;
  if (!url) throw new Error(`La ficha ${ctx.ficha.id} no tiene integracion.base_url`);
  return url.replace(/\/$/, "");
}

/** Encabezado con la clave del agente, si la ficha tiene una configurada en Vercel. */
export function autorizacion(ctx: ContextoHerramienta): Record<string, string> {
  const nombre = ctx.ficha.integracion?.clave_env;
  const clave = nombre ? process.env[nombre] : undefined;
  return clave ? { authorization: `Bearer ${clave}` } : {};
}

/** El chat de la web no tiene un teléfono verificado (cualquiera podría escribir uno ajeno). */
export const esChatWeb = (ctx: ContextoHerramienta) => !/^\d{8,}$/.test(ctx.telefono);

async function pedirJson(url: string, init: RequestInit = {}): Promise<{ status: number; cuerpo: any }> {
  const r = await fetch(url, { signal: AbortSignal.timeout(8000), ...init, headers: { accept: "application/json", ...init.headers } });
  const cuerpo = await r.json().catch(() => null);
  return { status: r.status, cuerpo };
}

/** La respuesta cruda de /api/menu, con 60 s de caché. */
export async function traerCarta(ctx: ContextoHerramienta): Promise<any> {
  const url = `${baseUrl(ctx)}/api/menu`;
  if (cacheCarta && cacheCarta.url === url && cacheCarta.hasta > Date.now()) return conEstadoDePrueba(cacheCarta.carta);
  const { status, cuerpo } = await pedirJson(url);
  if (status !== 200 || !cuerpo) throw new Error(`La web respondió ${status}`);
  cacheCarta = { url, hasta: Date.now() + CACHE_MS, carta: cuerpo };
  return conEstadoDePrueba(cuerpo);
}

/** Solo en pruebas: FORZAR_ABIERTO=1 hace de cuenta que el local está abierto, para probar pedidos de día. */
function conEstadoDePrueba(carta: any): any {
  if (process.env.FORZAR_ABIERTO !== "1") return carta;
  return { ...carta, estado: { abierto: true, motivo: "" } };
}

/** Deja solo lo que el agente necesita para responder, para gastar menos tokens. */
function resumirCarta(m: any) {
  const extras = new Map<string, any>((m.extras ?? []).map((e: any) => [e.id, e]));
  const costosEnvio = [...new Set((m.envio ?? []).map((t: any) => t.precio))];
  return {
    estado: m.estado,
    demora: m.demora,
    efectivo: m.efectivo,
    envio: {
      costos_posibles: costosEnvio,
      nota: "Depende de la distancia a la cocina. El costo exacto sale de cotizar_pedido con la ubicación. No hables de kilómetros.",
    },
    categorias: m.categorias,
    productos: (m.productos ?? []).map((p: any) => ({
      id: p.id,
      categoria: p.categoria,
      nombre: p.variante ? `${p.nombre} (${p.variante})` : p.nombre,
      descripcion: p.descripcion || undefined,
      etiqueta: p.etiqueta || undefined,
      precio: p.precio,
      disponible: p.activo === 1,
      adicionales: (p.extras ?? [])
        .map((id: string) => extras.get(id))
        .filter(Boolean)
        .map((e: any) => ({ id: e.id, nombre: e.nombre, precio: e.precio, max: e.max, disponible: e.activo === 1 })),
    })),
  };
}

export const verCartaYEstado: Herramienta = {
  definicion: {
    name: "ver_carta_y_estado",
    description:
      "Trae en vivo desde la web del local: carta con ids, precios y disponibilidad, adicionales, si está abierto ahora (estado.abierto y estado.motivo, listo para mostrar), demora actual, costos de envío posibles y si acepta efectivo. Usala siempre que la respuesta dependa de alguno de esos datos.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  async ejecutar(_entrada, ctx) {
    return JSON.stringify(resumirCarta(await traerCarta(ctx)));
  },
};

const QUE_DECIR: Record<string, string> = {
  esperando_pago: "Todavía no se aprobó el pago en Mercado Pago.",
  pago_rechazado: "El pago no se aprobó. Puede reintentar desde el link del pedido.",
  nuevo: "Recibido.",
  preparando: "En la cocina.",
  listo: "Listo, esperando al cadete.",
  en_camino: "En camino.",
  entregado: "Entregado.",
  cancelado: "Cancelado. Si se pagó con Mercado Pago, la devolución la gestiona una persona del local.",
};

export const consultarPedido: Herramienta = {
  definicion: {
    name: "consultar_pedido",
    description:
      "Consulta el estado de un pedido hecho en la web, con el código que te pasó la persona (6 o 7 letras y números, ej. B42ZPK7). Solo usala con un código que la persona escribió en esta charla. No sirve para pedidos de PedidosYa.",
    input_schema: {
      type: "object",
      properties: { codigo: { type: "string", description: "Código del pedido, tal como lo pasó la persona." } },
      required: ["codigo"],
      additionalProperties: false,
    },
    strict: true,
  },
  async ejecutar(entrada, ctx) {
    const codigo = String(entrada.codigo ?? "").trim().replace(/^#/, "").toUpperCase();
    if (!/^[A-Z0-9]{5,8}$/.test(codigo)) {
      return JSON.stringify({ encontrado: false, error: "El código no tiene el formato esperado (6 o 7 letras y números)." });
    }
    const { status, cuerpo: p } = await pedirJson(`${baseUrl(ctx)}/api/pedidos/${codigo}`);
    if (status === 404) return JSON.stringify({ encontrado: false, error: "No existe un pedido con ese código." });
    if (status !== 200 || !p) throw new Error(`La web respondió ${status}`);

    // Privacidad: no se le pasa al modelo la dirección ni otros datos personales.
    return JSON.stringify({
      encontrado: true,
      codigo: p.codigo,
      nombre: p.nombre,
      estado: p.estado,
      que_decir: QUE_DECIR[p.estado] ?? p.estado,
      pago: p.pago,
      esperando_confirmacion_del_local: p.pago === "efectivo" && p.estado === "nuevo" && !p.confirmado,
      creado: p.creado,
      pagado: p.pagado,
      salio: p.salio,
      entregado: p.entregado,
      demora: p.demora,
      items: p.items,
      total: p.total,
      seguimiento: `${baseUrl(ctx)}/#/pedido/${p.codigo}`,
    });
  },
};

export const misPedidos: Herramienta = {
  definicion: {
    name: "mis_pedidos",
    description:
      "Busca los pedidos de las últimas 48 horas hechos con el teléfono de quien te escribe por WhatsApp (no hace falta el código). Usala cuando pregunte por su pedido. En el chat de la web no funciona: ahí pedí el código y usá consultar_pedido.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  async ejecutar(_entrada, ctx) {
    if (esChatWeb(ctx)) return JSON.stringify({ error: "En el chat de la web no se busca por teléfono. Pedile el código del pedido." });
    const auth = autorizacion(ctx);
    if (!auth.authorization) return JSON.stringify({ error: "Esta búsqueda no está disponible. Pedile el código del pedido." });
    const { status, cuerpo } = await pedirJson(`${baseUrl(ctx)}/api/agente/pedidos?telefono=${encodeURIComponent(ctx.telefono)}`, { headers: auth });
    if (status !== 200 || !cuerpo) throw new Error(`La web respondió ${status}`);
    const pedidos = (cuerpo.pedidos ?? []).map((p: any) => ({
      codigo: p.codigo,
      estado: p.estado,
      que_decir: QUE_DECIR[p.estado] ?? p.estado,
      pago: p.pago,
      esperando_confirmacion_del_local: p.pago === "efectivo" && p.estado === "nuevo" && !p.confirmado,
      canal: p.canal,
      creado: p.creado,
      salio: p.salio,
      entregado: p.entregado,
      items: p.items,
      total: p.total,
      seguimiento: `${baseUrl(ctx)}/#/pedido/${p.codigo}`,
    }));
    return JSON.stringify(pedidos.length ? { pedidos } : { pedidos: [], nota: "No hay pedidos de este teléfono en las últimas 48 horas. Puede haber pedido con otro número: pedile el código." });
  },
};

export const confirmarPedidoEfectivo: Herramienta = {
  definicion: {
    name: "confirmar_pedido_efectivo",
    description:
      "Confirma un pedido en efectivo hecho en la web que está esperando confirmación, cuando la persona te dice que sí lo quiere. Solo funciona si el pedido es del mismo teléfono que te escribe por WhatsApp. Con eso el local lo pone a cocinar.",
    input_schema: {
      type: "object",
      properties: { codigo: { type: "string", description: "Código del pedido (sale de mis_pedidos o lo da la persona)." } },
      required: ["codigo"],
      additionalProperties: false,
    },
    strict: true,
  },
  async ejecutar(entrada, ctx) {
    if (esChatWeb(ctx)) return JSON.stringify({ ok: false, error: "Desde el chat de la web no se pueden confirmar pedidos. El local le va a escribir por WhatsApp." });
    const auth = autorizacion(ctx);
    if (!auth.authorization) return JSON.stringify({ ok: false, error: "No disponible: derivá a una persona para confirmar." });
    const { status, cuerpo } = await pedirJson(`${baseUrl(ctx)}/api/agente/confirmar`, {
      method: "POST",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({ codigo: String(entrada.codigo ?? ""), telefono: ctx.telefono }),
    });
    if (status === 200) return JSON.stringify({ ok: true, ...cuerpo, nota: "Pedido confirmado: el local lo pone a cocinar." });
    return JSON.stringify({ ok: false, error: cuerpo?.error ?? `La web respondió ${status}` });
  },
};
