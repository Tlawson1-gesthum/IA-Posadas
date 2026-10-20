// Webhook de Instagram (inicio de sesión con Instagram). Meta llama acá con cada mensaje directo y, si la app tiene
// acceso avanzado, con cada comentario.
//   GET  → Meta verifica la dirección al configurarla (INSTAGRAM_VERIFY_TOKEN).
//   POST → llega un aviso firmado con el secreto de la app de Instagram (INSTAGRAM_APP_SECRET): 200 enseguida y se atiende en segundo plano.
import { waitUntil } from "@vercel/functions";
import { obtenerAlmacen } from "../src/almacen.js";
import { atenderEcoInstagram, atenderMensajeInstagram } from "../src/atenderInstagram.js";
import { atenderComentario } from "../src/comentarios.js";
import { fichaDesdeFila } from "../src/fichas.js";
import { leerAvisoInstagram, type ComentarioInstagram } from "../src/instagram.js";
import { firmaValida } from "../src/whatsapp.js";

/** Meta firma el aviso con las letras que no son ASCII escritas como \u00f3 (la tilde de "cómo"), como las escribe JSON. */
const escapado = (t: string) => t.replace(/[\u0080-\uffff]/g, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));

/** Cuál de las formas de firmar coincide (o null). Se prueba el secreto de Instagram y, si está cargado, el de la app de Meta. */
export function firmaDeInstagram(cuerpo: string, firma: string | null): string | null {
  const secretos: [string, string | undefined][] = [["instagram", process.env.INSTAGRAM_APP_SECRET], ["meta", process.env.META_APP_SECRET]];
  const formas: [string, string][] = [["tal cual", cuerpo], ["escapado", escapado(cuerpo)], ["escapado con barras", escapado(cuerpo).replace(/\//g, "\\/")]];
  for (const [nombre, secreto] of secretos) {
    if (!secreto) continue;
    for (const [forma, texto] of formas) if (firmaValida(texto, firma, secreto)) return `${nombre}, ${forma}`;
  }
  return null;
}

export function GET(request: Request): Response {
  const q = new URL(request.url).searchParams;
  const tokenOk = !!process.env.INSTAGRAM_VERIFY_TOKEN && q.get("hub.verify_token") === process.env.INSTAGRAM_VERIFY_TOKEN;
  if (q.get("hub.mode") === "subscribe" && tokenOk) return new Response(q.get("hub.challenge") ?? "", { status: 200 });
  return new Response("No autorizado", { status: 403 });
}

async function comentario(c: ComentarioInstagram): Promise<void> {
  const fila = await obtenerAlmacen().fichaPorInstagram(c.cuenta);
  if (!fila) return;
  const ficha = fichaDesdeFila(fila);
  if (ficha.estado === "activo" && ficha.instagram?.comentarios) await atenderComentario(ficha, c);
}

export async function POST(request: Request): Promise<Response> {
  const cuerpo = await request.text();
  const firma = firmaDeInstagram(cuerpo, request.headers.get("x-hub-signature-256"));
  if (!firma) {
    // Sin datos del mensaje: solo para saber si Meta llega y si el secreto coincide.
    console.warn(`Instagram: aviso rechazado por la firma (${process.env.INSTAGRAM_APP_SECRET ? "no coincide con INSTAGRAM_APP_SECRET" : "falta INSTAGRAM_APP_SECRET"}${process.env.META_APP_SECRET ? " ni con META_APP_SECRET" : ""})`);
    return new Response("Firma inválida", { status: 401 });
  }
  let aviso: unknown;
  try {
    aviso = JSON.parse(cuerpo);
  } catch {
    return new Response("JSON inválido", { status: 400 });
  }
  const { mensajes, comentarios, ecos } = leerAvisoInstagram(aviso);
  const campos = ((aviso as any)?.entry ?? []).flatMap((e: any) => [...(e.messaging ? ["messaging"] : []), ...(e.changes ?? []).map((c: any) => c.field)]);
  console.log(`Instagram: aviso recibido, firma ${firma} (${campos.join(", ") || "sin campos"}) · ${mensajes.length} mensaje(s), ${comentarios.length} comentario(s), ${ecos.length} eco(s)`);
  waitUntil(
    Promise.allSettled([...mensajes.map((m) => atenderMensajeInstagram(m)), ...comentarios.map(comentario), ...ecos.map((e) => atenderEcoInstagram(e))]).then((rs) =>
      rs.forEach((r) => r.status === "rejected" && console.error("Error atendiendo aviso de Instagram", r.reason)),
    ),
  );
  return new Response("ok", { status: 200 });
}
