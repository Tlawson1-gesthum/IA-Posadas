// Integración con el sistema propio de MORFA (semorfa.com.ar). API pública, sin login.
import type { ContextoHerramienta, Herramienta } from "../tipos.js";

const CACHE_MS = 60_000;
let cacheCarta: { url: string; hasta: number; datos: unknown } | null = null;

function baseUrl(ctx: ContextoHerramienta): string {
  const url = ctx.ficha.integracion?.base_url;
  if (!url) throw new Error(`La ficha ${ctx.ficha.id} no tiene integracion.base_url`);
  return url.replace(/\/$/, "");
}

async function pedirJson(url: string): Promise<{ status: number; cuerpo: any }> {
  const r = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { accept: "application/json" } });
  const cuerpo = await r.json().catch(() => null);
  return { status: r.status, cuerpo };
}

/** Deja solo lo que el agente necesita para responder, para gastar menos tokens. */
function resumirCarta(m: any) {
  const extras = new Map<string, any>((m.extras ?? []).map((e: any) => [e.id, e]));
  return {
    estado: m.estado,
    demora: m.demora,
    efectivo: m.efectivo,
    envio: m.envio,
    categorias: m.categorias,
    productos: (m.productos ?? []).map((p: any) => ({
      categoria: p.categoria,
      nombre: p.variante ? `${p.nombre} (${p.variante})` : p.nombre,
      descripcion: p.descripcion || undefined,
      etiqueta: p.etiqueta || undefined,
      precio: p.precio,
      disponible: p.activo === 1,
      adicionales: (p.extras ?? [])
        .map((id: string) => extras.get(id))
        .filter(Boolean)
        .map((e: any) => ({ nombre: e.nombre, precio: e.precio, max: e.max, disponible: e.activo === 1 })),
    })),
  };
}

export const verCartaYEstado: Herramienta = {
  definicion: {
    name: "ver_carta_y_estado",
    description:
      "Trae en vivo desde la web del local: carta con precios y disponibilidad, adicionales, si está abierto ahora (estado.abierto y estado.motivo, listo para mostrar), demora actual, tramos de costo de envío por distancia y si acepta efectivo. Usala siempre que la respuesta dependa de alguno de esos datos.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  async ejecutar(_entrada, ctx) {
    const url = `${baseUrl(ctx)}/api/menu`;
    if (cacheCarta && cacheCarta.url === url && cacheCarta.hasta > Date.now()) {
      return JSON.stringify(cacheCarta.datos);
    }
    const { status, cuerpo } = await pedirJson(url);
    if (status !== 200 || !cuerpo) throw new Error(`La web respondió ${status}`);
    const datos = resumirCarta(cuerpo);
    cacheCarta = { url, hasta: Date.now() + CACHE_MS, datos };
    return JSON.stringify(datos);
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
