// Tarea que corre sola cada pocos minutos (UptimeRobot u otro, con ?token=TAREA_TOKEN) y una vez por día por el cron de
// Vercel (Authorization: Bearer CRON_SECRET): publica lo aprobado de la cola, revisa comentarios y renueva los tokens de Instagram.
// No muestra nada privado: solo cuántas cosas hizo.
import { timingSafeEqual } from "node:crypto";
import { obtenerAlmacen } from "../src/almacen.js";
import { correrCola } from "../src/cola.js";
import { revisarComentarios } from "../src/comentarios.js";
import { fichaDesdeFila } from "../src/fichas.js";
import { avisarEquipo } from "../src/avisos.js";
import { renovarToken } from "../src/instagram.js";

const igual = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

function autorizada(request: Request): boolean {
  const url = new URL(request.url);
  const token = process.env.TAREA_TOKEN;
  const dado = request.headers.get("x-tarea-token") ?? url.searchParams.get("token") ?? "";
  if (token && dado && igual(dado, token)) return true;
  const cron = process.env.CRON_SECRET;
  return !!cron && igual(request.headers.get("authorization") ?? "", `Bearer ${cron}`);
}

async function correr() {
  const fichas = (await obtenerAlmacen().listarFichas()).map((f) => fichaDesdeFila(f)).filter((f) => f.estado === "activo" && f.instagram);
  const cola = await correrCola();
  const cuentas: Record<string, unknown> = {};
  for (const f of fichas) {
    const r: Record<string, unknown> = {};
    try {
      r.token = await renovarToken(f);
    } catch (e) {
      r.token = "error";
      // Un token vencido frena todo: se avisa, pero una sola vez por día (la tarea corre cada pocos minutos).
      const avisados = await obtenerAlmacen().eventos(new Date(Date.now() - 24 * 3600_000), ["instagram"]);
      if (!avisados.some((ev) => ev.ficha_id === f.id && ev.detalle?.startsWith("Token de Instagram"))) {
        await avisarEquipo(f.id, null, "Token de Instagram", `${(e as Error).message}. Generá uno nuevo en Meta y cargalo en Vercel (${f.instagram!.token_env}).`);
      }
    }
    if (f.instagram!.comentarios?.leer) {
      try {
        r.comentarios = await revisarComentarios(f);
      } catch (e) {
        r.comentarios = "error";
        console.error(`Tarea · comentarios de ${f.id}`, e);
      }
    }
    cuentas[f.id] = r;
  }
  return { ok: true, cola, cuentas };
}

async function atender(request: Request): Promise<Response> {
  if (!autorizada(request)) return new Response("No autorizado", { status: 401 });
  try {
    const r = await correr();
    return request.method === "HEAD" ? new Response(null, { status: 200 }) : Response.json(r, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    console.error("Tarea", e);
    return new Response("Error", { status: 500 });
  }
}

export const GET = atender;
export const HEAD = atender;
export const POST = atender;
