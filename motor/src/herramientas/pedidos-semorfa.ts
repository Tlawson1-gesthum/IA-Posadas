// Tomar pedidos por WhatsApp y cargarlos en el sistema de MORFA (POST /api/pedidos, el mismo que usa la web).
// Los precios y el envío los calcula este código con la carta en vivo, nunca el modelo.
import type { ContextoHerramienta, Herramienta } from "../tipos.js";
import { autorizacion, baseUrl, esChatWeb, traerCarta } from "./semorfa.js";

interface LineaEntrada {
  id: string;
  cantidad: number;
  adicionales?: { id: string; cantidad: number }[];
}

/** Distancia en línea recta en km, igual que la calcula la web. */
function distanciaKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

interface Cotizacion {
  ok: boolean;
  errores: string[];
  lineas: { texto: string; importe: number }[];
  subtotal: number;
  envio: number | null;
  total: number | null;
  fuera_de_zona: boolean;
  falta_ubicacion: boolean;
  abierto: boolean;
  motivo_cerrado?: string;
  efectivo: boolean;
}

async function cotizar(entrada: Record<string, unknown>, ctx: ContextoHerramienta): Promise<Cotizacion> {
  const carta = await traerCarta(ctx);
  const productos = new Map<string, any>(carta.productos.map((p: any) => [p.id, p]));
  const extras = new Map<string, any>(carta.extras.map((e: any) => [e.id, e]));
  const errores: string[] = [];
  const lineas: Cotizacion["lineas"] = [];

  const items = Array.isArray(entrada.items) ? (entrada.items as LineaEntrada[]) : [];
  if (!items.length) errores.push("El pedido no tiene productos.");
  for (const it of items) {
    const p = productos.get(it.id);
    if (!p) { errores.push(`No existe el producto "${it.id}".`); continue; }
    const nombre = p.variante ? `${p.nombre} (${p.variante})` : p.nombre;
    if (p.activo !== 1) { errores.push(`${nombre}: hoy no hay.`); continue; }
    if (!Number.isInteger(it.cantidad) || it.cantidad < 1 || it.cantidad > 30) {
      errores.push(`${nombre}: cantidad inválida.`);
      continue;
    }
    let unitario = p.precio;
    const textos: string[] = [];
    for (const a of it.adicionales ?? []) {
      const e = extras.get(a.id);
      if (!e || !(p.extras ?? []).includes(a.id)) { errores.push(`${nombre} no admite el adicional "${a.id}".`); continue; }
      if (e.activo !== 1) { errores.push(`${e.nombre}: hoy no hay.`); continue; }
      if (!Number.isInteger(a.cantidad) || a.cantidad < 1 || a.cantidad > e.max) {
        errores.push(`${e.nombre}: máximo ${e.max} por producto.`);
        continue;
      }
      unitario += e.precio * a.cantidad;
      textos.push(a.cantidad > 1 ? `${a.cantidad} × ${e.nombre}` : e.nombre);
    }
    lineas.push({
      texto: `${it.cantidad} × ${nombre}${textos.length ? ` + ${textos.join(" + ")}` : ""}`,
      importe: unitario * it.cantidad,
    });
  }

  const subtotal = lineas.reduce((s, l) => s + l.importe, 0);
  const lat = typeof entrada.lat === "number" ? entrada.lat : null;
  const lng = typeof entrada.lng === "number" ? entrada.lng : null;
  let envio: number | null = null;
  let fueraDeZona = false;
  if (lat !== null && lng !== null) {
    const km = distanciaKm(carta.cocina, { lat, lng });
    const tramo = (carta.envio ?? []).find((t: any) => km <= t.hasta_km);
    if (tramo) envio = tramo.precio;
    else fueraDeZona = true;
  }

  return {
    ok: errores.length === 0 && !fueraDeZona,
    errores,
    lineas,
    subtotal,
    envio,
    total: envio === null ? null : subtotal + envio,
    fuera_de_zona: fueraDeZona,
    falta_ubicacion: lat === null || lng === null,
    abierto: !!carta.estado?.abierto,
    motivo_cerrado: carta.estado?.abierto ? undefined : carta.estado?.motivo,
    efectivo: !!carta.efectivo,
  };
}

const ESQUEMA_ITEMS = {
  type: "array",
  description: "Productos con su id de ver_carta_y_estado.",
  items: {
    type: "object",
    properties: {
      id: { type: "string" },
      cantidad: { type: "integer" },
      adicionales: {
        type: "array",
        items: {
          type: "object",
          properties: { id: { type: "string" }, cantidad: { type: "integer" } },
          required: ["id", "cantidad"],
          additionalProperties: false,
        },
      },
    },
    required: ["id", "cantidad"],
    additionalProperties: false,
  },
} as const;

export const cotizarPedido: Herramienta = {
  definicion: {
    name: "cotizar_pedido",
    description:
      "Calcula el pedido con la carta en vivo: valida productos y adicionales, y devuelve cada línea, subtotal, costo de envío según la ubicación, total, si queda fuera de zona y si el local está abierto. No crea nada. Usala antes de mostrarle el resumen al cliente y cada vez que cambie algo.",
    input_schema: {
      type: "object",
      properties: {
        items: ESQUEMA_ITEMS,
        lat: { type: "number", description: "Latitud de la ubicación que compartió el cliente." },
        lng: { type: "number", description: "Longitud de la ubicación que compartió el cliente." },
      },
      required: ["items"],
      additionalProperties: false,
    },
  },
  async ejecutar(entrada, ctx) {
    return JSON.stringify(await cotizar(entrada, ctx));
  },
};

export const crearPedido: Herramienta = {
  definicion: {
    name: "crear_pedido",
    description:
      "Carga el pedido en el sistema del local y devuelve el código y el link. Usala una sola vez, solo después de mostrarle el resumen con el total y de que el cliente respondiera que sí. No la uses para pagos con transferencia.",
    input_schema: {
      type: "object",
      properties: {
        items: ESQUEMA_ITEMS,
        lat: { type: "number" },
        lng: { type: "number" },
        nombre: { type: "string" },
        direccion: { type: "string", description: "Calle y número, como lo escribió el cliente." },
        referencia: { type: "string", description: "Piso, depto, color de la casa, entre calles, etc." },
        notas: { type: "string", description: "Aclaraciones para la cocina, si las hay." },
        pago: { type: "string", enum: ["efectivo", "mercadopago"] },
        telefono: { type: "string", description: "Solo en el chat de la web: teléfono de contacto que te dio la persona. Por WhatsApp no hace falta." },
      },
      required: ["items", "lat", "lng", "nombre", "direccion", "pago"],
      additionalProperties: false,
    },
  },
  async ejecutar(entrada, ctx) {
    const c = await cotizar(entrada, ctx);
    if (!c.ok || c.total === null) return JSON.stringify({ creado: false, motivo: "El pedido no es válido", cotizacion: c });
    if (!c.abierto) return JSON.stringify({ creado: false, motivo: c.motivo_cerrado ?? "El local está cerrado." });
    const pago = entrada.pago === "efectivo" ? "efectivo" : "mp";
    const web = esChatWeb(ctx);
    const telefono = web ? String(entrada.telefono ?? "").replace(/[^\d+]/g, "") : ctx.telefono.replace(/^\+?549/, "");
    if (telefono.replace(/\D/g, "").length < 8) {
      return JSON.stringify({ creado: false, motivo: "Falta un teléfono de contacto: pedíselo a la persona (con característica) y volvé a intentar." });
    }
    if (pago === "efectivo" && !c.efectivo) return JSON.stringify({ creado: false, motivo: "Hoy no se acepta efectivo." });

    const cuerpo = {
      pago,
      items: (entrada.items as LineaEntrada[]).map((it) => ({
        id: it.id,
        cantidad: it.cantidad,
        extras: Object.fromEntries((it.adicionales ?? []).map((a) => [a.id, a.cantidad])),
      })),
      nombre: String(entrada.nombre ?? "").trim(),
      // La web guarda el teléfono como lo escribió el cliente: se manda sin el 549 para que el panel lo reconozca.
      telefono,
      direccion: String(entrada.direccion ?? "").trim(),
      referencia: String(entrada.referencia ?? "").trim(),
      lat: entrada.lat,
      lng: entrada.lng,
      notas: [web ? "[Morfi · chat web]" : "[Morfi · WhatsApp]", String(entrada.notas ?? "").trim()].filter(Boolean).join(" "),
      // Con la clave del agente, la web lo marca con este canal y, si es en efectivo, ya confirmado.
      canal: web ? "chat" : "whatsapp",
    };

    // Mientras la ficha no lo habilite, no se toca el sistema real: se simula para probar sin mandar pedidos a la cocina.
    if (!ctx.ficha.integracion?.crear_pedidos) {
      return JSON.stringify({
        creado: true,
        simulado: true,
        codigo: "PRUEBA1",
        total: c.total,
        link: pago === "mp" ? "https://www.mercadopago.com.ar/checkout/PRUEBA" : `${baseUrl(ctx)}/#/pedido/PRUEBA1`,
        seguimiento: `${baseUrl(ctx)}/#/pedido/PRUEBA1`,
        enviado: cuerpo,
      });
    }

    const r = await fetch(`${baseUrl(ctx)}/api/pedidos`, {
      method: "POST",
      headers: { "content-type": "application/json", ...autorizacion(ctx) },
      body: JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(15000),
    });
    const resp: any = await r.json().catch(() => ({}));
    if (!r.ok || !resp.codigo) return JSON.stringify({ creado: false, motivo: resp.error ?? `La web respondió ${r.status}` });
    return JSON.stringify({
      creado: true,
      codigo: resp.codigo,
      total: resp.total ?? c.total,
      link: resp.pagar,
      seguimiento: `${baseUrl(ctx)}/#/pedido/${resp.codigo}`,
    });
  },
};
