// Tablero de obra para el dueño (public/obra.html): alertas, partidas, gasoil, fletes, avance y certificable.
//   GET  ?ficha=<id>&obra=<id>&desde=AAAA-MM-DD&hasta=AAAA-MM-DD   (por defecto, los últimos 7 días)
//   POST {accion: "semilla", ficha}   borra los partes de la ficha y carga la semana de ejemplo (solo fichas con semillas/<id>.json)
// Entra con sesión del panel o con la clave del chat de prueba (encabezado x-clave = CHAT_CLAVE).
import { cargarFicha } from "../src/fichas.js";
import { almacenObra } from "../src/obra/almacen.js";
import { cronologico, hoyAR, informeParte, resumenObra, sumarDias, vigentes } from "../src/obra/control.js";
import { cargarSemilla, haySemilla } from "../src/obra/semilla.js";
import { sesionValida } from "../src/sesion.js";
import type { Ficha } from "../src/tipos.js";

const json = (datos: unknown, status = 200) => Response.json(datos, { status, headers: { "cache-control": "no-store" } });
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

function autorizado(request: Request): boolean {
  const clave = process.env.CHAT_CLAVE;
  return sesionValida(request) || (!!clave && request.headers.get("x-clave") === clave);
}

async function fichaDeObra(id: string): Promise<Ficha | null> {
  try {
    const f = await cargarFicha(id);
    return f.obra?.obras?.length ? f : null;
  } catch {
    return null;
  }
}

export async function GET(request: Request): Promise<Response> {
  if (!autorizado(request)) return json({ error: "Clave incorrecta" }, 403);
  const q = new URL(request.url).searchParams;
  const ficha = await fichaDeObra(String(q.get("ficha") || process.env.FICHA_POR_DEFECTO || ""));
  if (!ficha?.obra) return json({ error: "No existe esa ficha o no tiene obras" }, 404);
  const c = ficha.obra;
  const obra = c.obras.find((o) => o.id === q.get("obra")) ?? c.obras[0];
  const hasta = FECHA.test(q.get("hasta") ?? "") ? q.get("hasta")! : hoyAR();
  const desde = FECHA.test(q.get("desde") ?? "") ? q.get("desde")! : sumarDias(hasta, -6);

  const partes = await almacenObra().partes(ficha.id, obra.id);
  const resumen = resumenObra(c, obra, partes, desde, hasta);
  // El informe de cada parte del período, como lo vio el capataz en WhatsApp.
  const todos = vigentes(partes).sort(cronologico);
  const informes = Object.fromEntries(
    todos.filter((p) => p.fecha >= desde && p.fecha <= hasta).map((p) => [p.id, informeParte(c, obra, p, todos.filter((x) => cronologico(x, p) < 0))]),
  );
  return json({
    ficha: { id: ficha.id, nombre: ficha.nombre },
    obras: c.obras.map((o) => ({ id: o.id, nombre: o.nombre })),
    resumen,
    informes,
    semilla: haySemilla(ficha.id),
  });
}

export async function POST(request: Request): Promise<Response> {
  if (!autorizado(request)) return json({ error: "Clave incorrecta" }, 403);
  let b: { accion?: string; ficha?: string };
  try {
    b = await request.json();
  } catch {
    return json({ error: "Pedido inválido" }, 400);
  }
  if (b.accion !== "semilla") return json({ error: "Acción desconocida" }, 400);
  const ficha = await fichaDeObra(String(b.ficha ?? ""));
  if (!ficha || !haySemilla(ficha.id)) return json({ error: "Esta ficha no tiene semana de ejemplo" }, 404);
  return json({ ok: true, partes: await cargarSemilla(ficha) });
}
