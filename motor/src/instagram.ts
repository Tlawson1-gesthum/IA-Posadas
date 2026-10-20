// Todo lo que habla con la API de Instagram (inicio de sesión con Instagram, graph.instagram.com):
// leer los avisos de Meta, mandar mensajes directos, responder comentarios por privado y renovar el token.
// Documentación (leída el 19/10/2026): https://developers.facebook.com/docs/instagram-platform
import { obtenerAlmacen } from "./almacen.js";
import type { CuentaInstagram, Ficha } from "./tipos.js";

const VERSION = () => process.env.INSTAGRAM_GRAPH_VERSION ?? "v26.0";
const BASE = "https://graph.instagram.com";

/** Un mensaje directo que entró a la cuenta del negocio. */
export interface MensajeInstagram {
  /** Id de la cuenta profesional que recibió el mensaje (entry.id). */
  cuenta: string;
  /** Id de quien escribe, propio de Instagram (IGSID). */
  de: string;
  mid: string;
  texto: string;
  /** El mensaje es de un tipo que el agente no lee (foto, audio, video, historia…). */
  noSoportado?: string;
  /** Cuándo lo mandó (ms). */
  hora: number;
}

/** Un comentario en una publicación de la cuenta. */
export interface ComentarioInstagram {
  cuenta: string;
  id: string;
  texto: string;
  /** Id de quien comentó, si Meta lo manda. */
  de?: string;
  usuario?: string;
  media?: string;
  /** Cuándo se comentó (ms). */
  hora: number;
}

/** Saca los mensajes directos y los comentarios de un aviso de Meta. Ignora los ecos (lo que manda la propia cuenta), leídos y reacciones. */
/** Lo que mandó la propia cuenta (eco de Meta): puede ser el agente o una persona del equipo desde la app de Instagram. */
export interface EcoInstagram {
  cuenta: string;
  /** A quién se lo mandó (IGSID del cliente). */
  para: string;
  mid: string;
  texto: string;
  /** Si no es texto: foto, audio, etc. El agente solo manda texto, así que eso lo mandó una persona. */
  adjunto?: string;
}

export function leerAvisoInstagram(aviso: any): { mensajes: MensajeInstagram[]; comentarios: ComentarioInstagram[]; ecos: EcoInstagram[] } {
  const mensajes: MensajeInstagram[] = [];
  const comentarios: ComentarioInstagram[] = [];
  const ecos: EcoInstagram[] = [];
  if (aviso?.object !== "instagram") return { mensajes, comentarios, ecos };
  for (const entry of aviso.entry ?? []) {
    const cuenta = String(entry.id ?? "");
    // Los mensajes llegan en entry.messaging; la prueba del panel de Meta los manda como un cambio del campo "messages".
    const recibidos = [...(entry.messaging ?? []), ...(entry.changes ?? []).filter((c: any) => c.field === "messages").map((c: any) => c.value)];
    for (const m of recibidos) {
      const msg = m.message;
      if (msg?.is_echo && !msg.is_deleted && m.recipient?.id && String(m.recipient.id) !== cuenta) {
        const texto = typeof msg.text === "string" ? msg.text : "";
        ecos.push({ cuenta, para: String(m.recipient.id), mid: String(msg.mid ?? ""), texto, adjunto: texto.trim() ? undefined : msg.attachments?.[0]?.type ?? "otro" });
        continue;
      }
      if (!msg || msg.is_echo || msg.is_deleted || !m.sender?.id || m.sender.id === cuenta) continue;
      const base = { cuenta, de: String(m.sender.id), mid: String(msg.mid ?? ""), hora: Number(m.timestamp) || Date.now() };
      if (typeof msg.text === "string" && msg.text.trim()) mensajes.push({ ...base, texto: msg.text });
      else mensajes.push({ ...base, texto: "", noSoportado: msg.attachments?.[0]?.type ?? "otro" });
    }
    for (const c of entry.changes ?? []) {
      if (c.field !== "comments" || !c.value?.id) continue;
      const v = c.value;
      if (v.from?.id && String(v.from.id) === cuenta) continue; // comentario de la propia cuenta
      comentarios.push({
        cuenta,
        id: String(v.id),
        texto: String(v.text ?? ""),
        de: v.from?.id ? String(v.from.id) : undefined,
        usuario: v.from?.username,
        media: v.media?.id ? String(v.media.id) : undefined,
        hora: Number(entry.time) * 1000 || Date.now(),
      });
    }
  }
  return { mensajes, comentarios, ecos };
}

/** Llama a la API de Instagram. Los errores de Meta se devuelven con su código para poder explicarlos. */
export async function graph(
  token: string,
  ruta: string,
  opciones: { metodo?: "GET" | "POST"; params?: Record<string, string>; cuerpo?: unknown } = {},
): Promise<any> {
  const url = new URL(`${BASE}/${VERSION()}/${ruta.replace(/^\//, "")}`);
  for (const [k, v] of Object.entries(opciones.params ?? {})) url.searchParams.set(k, v);
  // Como en los ejemplos oficiales, el token va como access_token. Esta dirección nunca se escribe en los registros.
  url.searchParams.set("access_token", token);
  const r = await fetch(url, {
    method: opciones.metodo ?? "GET",
    headers: opciones.cuerpo ? { "content-type": "application/json" } : {},
    body: opciones.cuerpo ? JSON.stringify(opciones.cuerpo) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  const datos: any = await r.json().catch(() => ({}));
  if (!r.ok || datos?.error) {
    const e = datos?.error ?? {};
    throw new ErrorInstagram(`Instagram respondió ${r.status}: ${e.message ?? "sin detalle"}`, e.code, e.error_subcode);
  }
  return datos;
}

export class ErrorInstagram extends Error {
  constructor(mensaje: string, readonly codigo?: number, readonly subcodigo?: number) {
    super(mensaje);
  }
}

/** Instagram no muestra negritas: se sacan los asteriscos que se le escapen al modelo. */
export function paraInstagram(texto: string): string {
  return texto.replace(/\*\*?([^*\n]+)\*\*?/g, "$1").trim();
}

/** Un mensaje directo de Instagram tiene un tope de largo: si se pasa, se manda en partes, cortando entre párrafos. */
export function partir(texto: string, tope = 950): string[] {
  const partes: string[] = [];
  let actual = "";
  for (const parrafo of texto.split(/\n(?=\S)/)) {
    if ((actual + "\n" + parrafo).length > tope && actual) {
      partes.push(actual);
      actual = parrafo;
    } else actual = actual ? `${actual}\n${parrafo}` : parrafo;
  }
  if (actual) partes.push(actual);
  return partes.flatMap((p) => (p.length > tope ? p.match(new RegExp(`[\\s\\S]{1,${tope}}`, "g")) ?? [] : [p]));
}

/** Manda un mensaje directo. Solo funciona dentro de las 24 h desde el último mensaje de la persona (regla de Meta). */
export async function enviarMensaje(cuenta: string, token: string, destinatario: string, texto: string): Promise<void> {
  for (const parte of partir(paraInstagram(texto))) {
    await graph(token, `${cuenta}/messages`, { metodo: "POST", cuerpo: { recipient: { id: destinatario }, message: { text: parte } } });
  }
}

/** Respuesta privada a un comentario: un solo mensaje, hasta 7 días después del comentario (regla de Meta). */
export async function respuestaPrivada(cuenta: string, token: string, comentarioId: string, texto: string): Promise<void> {
  await graph(token, `${cuenta}/messages`, { metodo: "POST", cuerpo: { recipient: { comment_id: comentarioId }, message: { text: paraInstagram(texto) } } });
}

/** Ventana de Meta para escribirle a alguien que nos escribió. Pasada, el agente no escribe y una persona responde desde la app. */
export const VENTANA_MS = 24 * 3600_000;
/** Ventana de Meta para la respuesta privada a un comentario. */
export const VENTANA_COMENTARIO_MS = 7 * 24 * 3600_000;

/** El token vigente de la ficha: el renovado que guardó el motor o, la primera vez, el de la variable de entorno. */
export async function tokenDe(ficha: Ficha): Promise<string> {
  const ig = ficha.instagram;
  if (!ig) throw new Error(`La ficha ${ficha.id} no tiene Instagram`);
  const guardado = await obtenerAlmacen().cuentaInstagram(ficha.id).catch(() => null);
  if (guardado?.token && Date.parse(guardado.vence) > Date.now()) return guardado.token;
  const deEntorno = process.env[ig.token_env];
  if (!deEntorno) throw new Error(`Falta ${ig.token_env} en Vercel`);
  return deEntorno;
}

/** Renueva el token si tiene más de `dias` días (Meta deja renovarlo pasadas 24 h; cada renovación dura 60 días). */
export async function renovarToken(ficha: Ficha, dias = 7): Promise<"renovado" | "al_dia"> {
  const almacen = obtenerAlmacen();
  const guardado = await almacen.cuentaInstagram(ficha.id);
  if (guardado && Date.now() - Date.parse(guardado.renovado) < dias * 86400_000 && Date.parse(guardado.vence) > Date.now()) return "al_dia";
  const actual = await tokenDe(ficha);
  const url = new URL(`${BASE}/refresh_access_token`);
  url.searchParams.set("grant_type", "ig_refresh_token");
  url.searchParams.set("access_token", actual); // así lo pide Meta para este pedido
  const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
  const d: any = await r.json().catch(() => ({}));
  if (!r.ok || !d.access_token) throw new ErrorInstagram(`No se pudo renovar el token: ${d?.error?.message ?? r.status}`, d?.error?.code);
  const cuenta: CuentaInstagram = {
    ficha_id: ficha.id,
    ig_user_id: ficha.instagram!.ig_user_id,
    token: d.access_token,
    renovado: new Date().toISOString(),
    vence: new Date(Date.now() + Number(d.expires_in ?? 60 * 86400) * 1000).toISOString(),
  };
  await almacen.guardarCuentaInstagram(cuenta);
  return "renovado";
}
