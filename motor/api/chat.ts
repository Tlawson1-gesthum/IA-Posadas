// Chat web con un agente: la página de prueba (public/index.html) y la burbuja en la web del cliente (public/widget.*).
//   Prueba:   ?ficha=<id> con CHAT_CLAVE o sesión del panel. ?borrador=1 prueba los cambios sin publicar (solo con panel).
//   Burbuja:  sin clave, solo si la ficha tiene chat_web.activo; con límites por conexión y por día.
//   GET ?config=<id> → lo que la burbuja necesita para dibujarse (nombre, color, saludo), o {activo:false}.
import { createHash } from "node:crypto";
import { obtenerAlmacen } from "../src/almacen.js";
import { atender } from "../src/atender.js";
import { cargarFicha } from "../src/fichas.js";
import { sesionValida } from "../src/sesion.js";
import { CHAT_WEB_POR_DEFECTO, type Ficha } from "../src/tipos.js";

const MUCHOS = "Recibimos muchos mensajes desde tu conexión. Probá de nuevo en un rato.";
const CORS = { "access-control-allow-origin": "*", "cache-control": "public, max-age=30" };

async function fichaPublica(id: string): Promise<Ficha | null> {
  try {
    const f = await cargarFicha(id);
    return f.estado === "activo" && f.chat_web?.activo ? f : null;
  } catch {
    return null;
  }
}

export async function GET(request: Request): Promise<Response> {
  const id = new URL(request.url).searchParams.get("config") ?? "";
  const f = await fichaPublica(id);
  if (!f) return Response.json({ activo: false }, { headers: CORS });
  return Response.json(
    { activo: true, nombre: f.nombre, agente: f.datos?.nombre_agente ?? f.nombre, color: f.chat_web?.color ?? "#2563eb", saludo: f.chat_web?.saludo ?? "" },
    { headers: CORS },
  );
}

/** IP anonimizada: se guarda un resumen irreversible, no la IP (Ley 25.326). */
function ipHash(request: Request): string {
  const ip = (request.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();
  return createHash("sha256").update(`${process.env.PANEL_CLAVE ?? "motor"}:${ip}`).digest("hex").slice(0, 32);
}

export async function POST(request: Request): Promise<Response> {
  let b: { clave?: string; sesion?: string; texto?: string; ficha?: string; borrador?: boolean; publico?: boolean };
  try {
    b = await request.json();
  } catch {
    return Response.json({ error: "Pedido inválido" }, { status: 400 });
  }
  const sesion = String(b.sesion ?? "").replace(/[^a-z0-9]/gi, "").slice(0, 32);
  const texto = String(b.texto ?? "").trim().slice(0, 2000);
  if (!sesion || !texto) return Response.json({ error: "Falta el mensaje" }, { status: 400 });
  const fichaId = String(b.ficha || process.env.FICHA_POR_DEFECTO || "");

  const delPanel = sesionValida(request);
  const claveOk = !!process.env.CHAT_CLAVE && b.clave === process.env.CHAT_CLAVE;
  let ficha: Ficha;

  if (b.publico) {
    // Burbuja en la web del cliente: cualquiera puede escribir, así que se cuida el gasto.
    const f = await fichaPublica(fichaId);
    if (!f) return Response.json({ error: "El chat no está disponible" }, { status: 404 });
    const limites = { ...CHAT_WEB_POR_DEFECTO, ...f.chat_web };
    const almacen = obtenerAlmacen();
    const ip = ipHash(request);
    const [porIp, delDia] = await Promise.all([
      almacen.contarAccesosWeb(f.id, ip, new Date(Date.now() - 3600_000)),
      almacen.contarAccesosWeb(f.id, null, new Date(Date.now() - 24 * 3600_000)),
    ]);
    if (porIp >= limites.mensajes_por_ip_hora || delDia >= limites.mensajes_por_dia) {
      if (delDia >= limites.mensajes_por_dia) await almacen.evento(f.id, null, "limite_web", `Se alcanzó el tope de ${limites.mensajes_por_dia} mensajes por día del chat web`);
      return Response.json({ respuestas: [MUCHOS] }, { status: 429 });
    }
    await almacen.registrarAccesoWeb(f.id, ip);
    ficha = f;
  } else {
    if (!delPanel && !claveOk) return Response.json({ error: "Clave incorrecta" }, { status: 403 });
    if (b.borrador && !delPanel) return Response.json({ error: "Para probar un borrador, entrá al panel" }, { status: 403 });
    try {
      ficha = await cargarFicha(fichaId, !!b.borrador);
    } catch {
      return Response.json({ error: `No existe la ficha "${fichaId}"` }, { status: 404 });
    }
    // Al probar un borrador, el agente responde aunque la ficha esté pausada (para probar antes de activar).
    if (b.borrador) ficha = { ...ficha, estado: "activo" };
  }

  const respuestas: string[] = [];
  await atender(
    // En el chat web el "teléfono" es la sesión del navegador. "web-" la distingue de un número real.
    { phoneNumberId: "web", de: `web-${b.borrador ? "borrador-" : b.publico ? "publico-" : ""}${sesion}`, waId: `web-${sesion}-${Date.now()}`, texto },
    {
      ficha,
      enviar: async (t) => {
        respuestas.push(t);
      },
    },
  );
  return Response.json({ respuestas, ficha: { id: ficha.id, nombre: ficha.nombre, agente: ficha.datos?.nombre_agente } });
}
