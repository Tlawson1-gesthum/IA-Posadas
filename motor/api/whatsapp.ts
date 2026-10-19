// Webhook de WhatsApp Cloud API. Meta llama a esta dirección cada vez que alguien le escribe a un número conectado.
//   GET  → Meta verifica la dirección al configurarla (una vez).
//   POST → llega un mensaje: se responde 200 enseguida y se atiende en segundo plano.
import { waitUntil } from "@vercel/functions";
import { atender } from "../src/atender.js";
import { firmaValida, leerAviso } from "../src/whatsapp.js";
import { sinTelefonos } from "../src/enmascarar.js";

export function GET(request: Request): Response {
  const q = new URL(request.url).searchParams;
  const tokenOk = !!process.env.WHATSAPP_VERIFY_TOKEN && q.get("hub.verify_token") === process.env.WHATSAPP_VERIFY_TOKEN;
  if (q.get("hub.mode") === "subscribe" && tokenOk) return new Response(q.get("hub.challenge") ?? "", { status: 200 });
  return new Response("No autorizado", { status: 403 });
}

// Los avisos de Meta pesan pocos KB: más de 1 MB no es de Meta y no se lee
const MAX_CUERPO = 1_000_000;

export async function POST(request: Request): Promise<Response> {
  // sin secreto o sin firma se rechaza antes de leer el cuerpo; con firma, el cuerpo se lee solo para comprobarla
  // (no se interpreta ni se atiende nada hasta que la firma es válida)
  const secreto = process.env.META_APP_SECRET;
  const firma = request.headers.get("x-hub-signature-256");
  if (!secreto || !firma?.startsWith("sha256=")) return new Response("Firma inválida", { status: 401 });
  if (Number(request.headers.get("content-length") || 0) > MAX_CUERPO) return new Response("Demasiado grande", { status: 413 });
  const cuerpo = await request.text();
  if (cuerpo.length > MAX_CUERPO || !firmaValida(cuerpo, firma, secreto)) {
    return new Response("Firma inválida", { status: 401 });
  }
  let aviso: unknown;
  try {
    aviso = JSON.parse(cuerpo);
  } catch {
    return new Response("JSON inválido", { status: 400 });
  }
  const mensajes = leerAviso(aviso);
  waitUntil(
    Promise.allSettled(mensajes.map((m) => atender(m))).then((rs) =>
      rs.forEach((r) => r.status === "rejected" && console.error("Error atendiendo mensaje", sinTelefonos((r.reason as Error)?.stack ?? r.reason))),
    ),
  );
  return new Response("ok", { status: 200 });
}
