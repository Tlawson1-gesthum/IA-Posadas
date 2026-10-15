// Zona de entrega: en qué país cae una ubicación y dónde queda un barrio o lugar que nombra el cliente.
// Usa el mapa de OpenStreetMap (Nominatim) en el momento, con caché. La distancia es en línea recta, como en la web.
import type { Herramienta } from "../tipos.js";
import { traerCarta } from "./semorfa.js";

interface Punto {
  lat: number;
  lng: number;
}

/** Distancia en línea recta en km, igual que la calcula la web. */
export function distanciaKm(a: Punto, b: Punto): number {
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** El tramo de envío que corresponde a una distancia, o null si queda fuera de zona. */
export function tramoDeEnvio(envio: { hasta_km: number; precio: number }[], km: number) {
  return [...envio].sort((a, b) => a.hasta_km - b.hasta_km).find((t) => km <= t.hasta_km) ?? null;
}

const NOMINATIM = "https://nominatim.openstreetmap.org";
const CACHE_MS = 24 * 3600_000;
const cache = new Map<string, { hasta: number; valor: any }>();

async function nominatim(ruta: string, params: Record<string, string>): Promise<any> {
  const url = `${NOMINATIM}/${ruta}?${new URLSearchParams({ format: "jsonv2", "accept-language": "es", ...params })}`;
  const guardado = cache.get(url);
  if (guardado && guardado.hasta > Date.now()) return guardado.valor;
  // Nominatim pide identificarse con un User-Agent propio.
  const r = await fetch(url, {
    headers: { "user-agent": "motor-agentes-pensa/1.0 (+https://ia-posadas.vercel.app)" },
    signal: AbortSignal.timeout(5000),
  });
  if (!r.ok) throw new Error(`El mapa respondió ${r.status}`);
  const valor = await r.json();
  if (cache.size > 500) cache.clear();
  cache.set(url, { hasta: Date.now() + CACHE_MS, valor });
  return valor;
}

/** Código de país (ar, py, br...) de una ubicación, o null si el mapa no responde (se reintenta una vez). */
export async function paisDe(p: Punto): Promise<string | null> {
  for (let intento = 0; intento < 2; intento++) {
    try {
      // Se redondea a ~100 m para aprovechar la caché.
      const r = await nominatim("reverse", { lat: p.lat.toFixed(3), lon: p.lng.toFixed(3), zoom: "10", addressdetails: "1" });
      return r?.address?.country_code ?? null;
    } catch (e) {
      if (intento === 1) console.warn("No se pudo ver el país de la ubicación", (e as Error).message);
    }
  }
  return null;
}

const TIPOS_DE_ZONA = new Set(["suburb", "neighbourhood", "quarter", "city_district", "administrative", "residential", "village", "town", "hamlet", "city", "locality"]);

/** Resultado de ubicar un barrio o lugar respecto de la cocina. Exportado para probarlo sin red. */
export function evaluarLugar(lugar: any, cocina: Punto, envio: { hasta_km: number; precio: number }[]) {
  const nombre = String(lugar.name || lugar.display_name || "").trim();
  const zona = [lugar.address?.suburb, lugar.address?.city || lugar.address?.town || lugar.address?.village].filter((x) => x && x !== nombre);
  const descripcion = [nombre, ...zona].filter(Boolean).join(", ");
  const pais = lugar.address?.country_code;
  if (pais && pais !== "ar") {
    return { encontrado: true, lugar: descripcion, llega: "no", motivo: "Queda fuera de Argentina: no hacemos envíos a Paraguay ni a otros países." };
  }
  const centro = { lat: Number(lugar.lat), lng: Number(lugar.lon) };
  // Una dirección con altura (calle y número) es un punto: sirve para cotizar y cargar el pedido sin el pin de ubicación.
  if (lugar.address?.house_number) {
    const a = lugar.address;
    const direccion = [`${a.road ?? nombre} ${a.house_number}`.trim(), a.suburb, a.city || a.town || a.village].filter(Boolean).join(", ");
    const tramo = tramoDeEnvio(envio, distanciaKm(cocina, centro));
    return tramo
      ? {
          encontrado: true,
          precision: "direccion",
          lugar: direccion,
          llega: "si",
          envio: { precio: tramo.precio },
          ubicacion: { lat: Number(centro.lat.toFixed(6)), lng: Number(centro.lng.toFixed(6)) },
          nota: "Confirmale a la persona que la dirección es esa. Si dice que sí, usá ubicacion.lat y ubicacion.lng en cotizar_pedido y crear_pedido.",
        }
      : { encontrado: true, precision: "direccion", lugar: direccion, llega: "no", motivo: "Queda fuera de la zona de entrega." };
  }
  // boundingbox = [sur, norte, oeste, este]. Un barrio grande puede quedar en parte dentro y en parte fuera.
  const [s, n, o, e] = (lugar.boundingbox ?? []).map(Number);
  const esquinas = [s, n, o, e].every(Number.isFinite)
    ? [{ lat: s, lng: o }, { lat: s, lng: e }, { lat: n, lng: o }, { lat: n, lng: e }]
    : [centro];
  const dentroDelRecuadro = Number.isFinite(s) && cocina.lat >= s && cocina.lat <= n && cocina.lng >= o && cocina.lng <= e;
  const lejos = Math.max(...esquinas.map((x) => distanciaKm(cocina, x)), distanciaKm(cocina, centro));
  // El punto más cercano del recuadro a la cocina.
  const cerca = dentroDelRecuadro
    ? 0
    : distanciaKm(cocina, {
        lat: Math.min(Math.max(cocina.lat, Number.isFinite(s) ? s : centro.lat), Number.isFinite(n) ? n : centro.lat),
        lng: Math.min(Math.max(cocina.lng, Number.isFinite(o) ? o : centro.lng), Number.isFinite(e) ? e : centro.lng),
      });
  const tCerca = tramoDeEnvio(envio, cerca);
  const tLejos = tramoDeEnvio(envio, lejos);
  const tCentro = tramoDeEnvio(envio, distanciaKm(cocina, centro));
  if (tLejos) {
    return {
      encontrado: true,
      lugar: descripcion,
      llega: "si",
      envio: tCerca && tCerca.precio !== tLejos.precio ? { desde: tCerca.precio, hasta: tLejos.precio } : { precio: tLejos.precio },
      nota: "El costo exacto sale de cotizar_pedido con la ubicación.",
    };
  }
  if (!tCerca) return { encontrado: true, lugar: descripcion, llega: "no", motivo: "Queda fuera de la zona de entrega." };
  return {
    encontrado: true,
    lugar: descripcion,
    llega: "en_parte",
    centro_del_lugar: tCentro ? "dentro de la zona" : "fuera de la zona",
    nota: "Es un lugar grande: una parte entra en la zona y otra no. Pedí la ubicación para confirmar con cotizar_pedido.",
  };
}

export const consultarZona: Herramienta = {
  definicion: {
    name: "consultar_zona",
    description:
      "Busca en el mapa un barrio, lugar o dirección que nombra la persona (ej. \"Itaembé Miní\", \"la UNaM\", \"Bolívar 1850\") y dice si hacemos envíos: llega si / no / en_parte y el costo de envío posible. Con calle y número, si la encuentra, devuelve precision \"direccion\" y la ubicacion (lat, lng) para usar en cotizar_pedido y crear_pedido cuando la persona no puede compartir el pin (por ejemplo, si pide para otra persona). Si da en_parte o no lo encuentra, pedí la ubicación o que marquen la dirección en el mapa de la web.",
    input_schema: {
      type: "object",
      properties: { lugar: { type: "string", description: "Barrio, calle o lugar, tal como lo escribió la persona." } },
      required: ["lugar"],
      additionalProperties: false,
    },
    strict: true,
  },
  async ejecutar(entrada, ctx) {
    const texto = String(entrada.lugar ?? "").trim().slice(0, 120);
    if (!texto) return JSON.stringify({ encontrado: false, nota: "Falta el lugar." });
    const carta = await traerCarta(ctx);
    const cocina: Punto = carta.cocina;
    const envio = carta.envio ?? [];
    const radio = Math.max(...envio.map((t: any) => t.hasta_km), 1);
    // Se busca solo cerca de la cocina, para no confundir con lugares del mismo nombre en otras ciudades.
    const margen = (radio + 7) / 111;
    const viewbox = [cocina.lng - margen, cocina.lat + margen, cocina.lng + margen, cocina.lat - margen].map((x) => x.toFixed(4)).join(",");
    let lugares: any[];
    try {
      lugares = await nominatim("search", { q: texto, viewbox, bounded: "1", limit: "5", addressdetails: "1" });
    } catch (e) {
      return JSON.stringify({ encontrado: false, nota: "No se pudo consultar el mapa ahora. Pedí la ubicación y usá cotizar_pedido." });
    }
    if (!lugares?.length) {
      return JSON.stringify({ encontrado: false, nota: "No encontré ese lugar en el mapa cerca de la cocina. Pedí la ubicación o que marque la dirección en la web." });
    }
    // Con número, se busca la dirección exacta; sin número, el barrio o lugar.
    const conAltura = /\d/.test(texto);
    const lugar =
      (conAltura && lugares.find((l) => l.address?.house_number)) ||
      lugares.find((l) => TIPOS_DE_ZONA.has(l.type) || l.category === "boundary" || l.category === "place") ||
      lugares[0];
    const r: Record<string, unknown> = evaluarLugar(lugar, cocina, envio);
    if (conAltura && !lugar.address?.house_number && r.llega !== "no") {
      r.altura_no_encontrada = true;
      r.nota = "No encontré esa altura exacta en el mapa: no uses este lugar para el pedido. Pedí que la persona que recibe comparta su ubicación, o que marquen la dirección en el mapa de la web.";
    }
    return JSON.stringify(r);
  },
};
