// Panel del agente para el sistema de UN cliente (por ahora, la pantalla Agente de una distribuidora en Pensa).
// A diferencia de api/panel.ts (Pensa, todas las fichas, con PANEL_CLAVE), acá cada local entra con SU clave y solo ve y toca
// su ficha: clave = HMAC-SHA256(LOCALES_CLAVE_MAESTRA, "local:" + id de la ficha) en base64url (claveLocal, npm run clave-local).
// La clave vive en un secreto del local (Pages: MOTOR_CLAVE) y la usa su servidor; nunca llega al navegador.
// POST {accion, ...} con  authorization: Bearer <clave>  y  x-ficha: <id>.
//   resumen                      → estado, pausa del dueño, gasto y tope del mes, charlas
//   conversaciones {filtro}      → las últimas 100 (filtro: "derivadas" | "mal" = marcadas "lo entendió mal")
//   conversacion {id}            → la charla completa (solo si es de esta ficha)
//   pausar {pausa, por}          → pausa del dueño (no la de Pensa: esa sigue en fichas.estado y el dueño no la puede sacar)
//   tomar / liberar {id}         → una persona toma la charla / se la devuelve al agente
//   responder {id, texto, por}   → una persona le escribe al cliente (la charla queda tomada)
//   marcar {id, nota}            → "lo entendió mal": queda un evento para sumar el caso a la batería de pruebas
import { createHmac, timingSafeEqual } from "node:crypto";
import { obtenerAlmacen, type FilaFicha } from "../src/almacen.js";
import { MOTIVO_PAUSA } from "../src/atender.js";
import { enviarTexto } from "../src/whatsapp.js";

type Cuerpo = Record<string, any>;
const json = (datos: unknown, status = 200) => Response.json(datos, { status, headers: { "cache-control": "no-store" } });
const falla = (mensaje: string, status = 400) => json({ error: mensaje }, status);
const DIAS_MARCAS = 90;

/** La clave con la que el sistema de un local habla con su ficha. Sin LOCALES_CLAVE_MAESTRA no hay ninguna. */
export function claveLocal(fichaId: string, maestra = process.env.LOCALES_CLAVE_MAESTRA): string | null {
  if (!maestra || maestra.length < 20) return null;
  return createHmac("sha256", maestra).update(`local:${fichaId}`).digest("base64url");
}

function claveValida(fichaId: string, dada: string): boolean {
  const esperada = claveLocal(fichaId);
  if (!esperada || !dada) return false;
  const a = Buffer.from(esperada), b = Buffer.from(dada);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request): Promise<Response> {
  if (!(request.headers.get("content-type") ?? "").includes("application/json")) return falla("Pedido inválido");
  const fichaId = request.headers.get("x-ficha") ?? "";
  const dada = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!/^[a-z0-9-]+$/.test(fichaId) || !claveValida(fichaId, dada)) return falla("Clave incorrecta", 401);
  const ficha = await obtenerAlmacen().fichaPorId(fichaId);
  if (!ficha) return falla("Clave incorrecta", 401);
  let b: Cuerpo;
  try {
    b = await request.json();
  } catch {
    return falla("Pedido inválido");
  }
  const accion = ACCIONES[String(b.accion)];
  if (!accion) return falla("Acción desconocida");
  try {
    return await accion(ficha, b);
  } catch (e) {
    console.error(`Local ${fichaId} · ${b.accion}`, e);
    return falla("No se pudo hacer. Probá de nuevo en un rato.", 500);
  }
}

/** La charla, solo si es de esta ficha (la de otro cliente es como si no existiera). */
async function charlaDe(ficha: FilaFicha, id: unknown) {
  const c = await obtenerAlmacen().detalleConversacion(String(id ?? ""));
  return c && c.ficha_id === ficha.id ? c : null;
}

const quien = (b: Cuerpo) => String(b.por ?? "").trim().slice(0, 60) || "el dueño";

async function marcadas(ficha: FilaFicha) {
  const evs = await obtenerAlmacen().eventos(new Date(Date.now() - DIAS_MARCAS * 86400_000), ["mal_entendido"]);
  return evs.filter((e) => e.ficha_id === ficha.id && e.conversacion_id);
}

const ACCIONES: Record<string, (ficha: FilaFicha, b: Cuerpo) => Promise<Response>> = {
  async resumen(ficha) {
    const almacen = obtenerAlmacen();
    const [resumen, derivadas, marcas] = await Promise.all([almacen.resumenDelMes(), almacen.listarConversaciones(ficha.id, true, 500), marcadas(ficha)]);
    const r = resumen.find((x) => x.ficha_id === ficha.id);
    return json({
      nombre: ficha.config.nombre,
      // pausado = lo frenó Pensa (no responde); el dueño ve el motivo pero no lo puede cambiar desde acá
      estado: ficha.estado,
      pausa_local: ficha.pausa_local ?? null,
      gasto_mes_usd: r?.usd ?? 0,
      tope_mes_usd: ficha.config.tope_usd_mes,
      mensajes_mes: r?.mensajes ?? 0,
      charlas_mes: r?.conversaciones ?? 0,
      derivadas: derivadas.length,
      mal_entendidas: new Set(marcas.map((m) => m.conversacion_id)).size,
    });
  },

  async conversaciones(ficha, b) {
    const filtro = String(b.filtro ?? "");
    const [lista, marcas] = await Promise.all([obtenerAlmacen().listarConversaciones(ficha.id, filtro === "derivadas", 100), marcadas(ficha)]);
    const mal = new Set(marcas.map((m) => m.conversacion_id));
    const conversaciones = lista
      .filter((c) => filtro !== "mal" || mal.has(c.id))
      .map(({ usd: _, numero_negocio: __, ...c }) => ({ ...c, mal_entendida: mal.has(c.id) }));
    return json({ conversaciones });
  },

  async conversacion(ficha, b) {
    const c = await charlaDe(ficha, b.id);
    if (!c) return falla("No existe esa charla", 404);
    const [mensajes, marcas] = await Promise.all([obtenerAlmacen().mensajes(c.id), marcadas(ficha)]);
    const { numero_negocio: _, ...charla } = c;
    return json({
      conversacion: charla,
      mensajes: mensajes.map((m) => ({ rol: m.rol, texto: m.texto, creado: m.creado })),
      marcas: marcas.filter((m) => m.conversacion_id === c.id).map((m) => ({ nota: m.detalle, creado: m.creado })),
    });
  },

  async pausar(ficha, b) {
    const almacen = obtenerAlmacen();
    const pausa = b.pausa === true;
    if (pausa === !!ficha.pausa_local) return json({ ok: true, cambiado: false });
    await almacen.actualizarFicha(ficha.id, { pausa_local: pausa ? { desde: new Date().toISOString(), por: quien(b) } : null });
    await almacen.evento(ficha.id, null, pausa ? "pausa_local" : "fin_pausa_local", `Desde el panel del local (${quien(b)})`);
    let devueltas = 0;
    if (!pausa) {
      // las charlas que entraron durante la pausa vuelven al agente; las que tomó una persona siguen con ella
      for (const c of await almacen.listarConversaciones(ficha.id, true, 500)) {
        if (c.derivada_motivo !== MOTIVO_PAUSA) continue;
        await almacen.liberar(c.id);
        devueltas++;
      }
    }
    return json({ ok: true, cambiado: true, devueltas });
  },

  async tomar(ficha, b) {
    const c = await charlaDe(ficha, b.id);
    if (!c) return falla("No existe esa charla", 404);
    if (c.estado !== "humano") await obtenerAlmacen().derivar(c.id, "tomada", `La tomó ${quien(b)} desde el panel del local.`);
    return json({ ok: true });
  },

  async liberar(ficha, b) {
    const almacen = obtenerAlmacen();
    const c = await charlaDe(ficha, b.id);
    if (!c) return falla("No existe esa charla", 404);
    if (ficha.pausa_local) return falla("El agente está en pausa: sacá la pausa para devolverle las charlas.");
    await almacen.liberar(c.id);
    await almacen.evento(ficha.id, c.id, "liberada", `Desde el panel del local (${quien(b)})`);
    return json({ ok: true });
  },

  async responder(ficha, b) {
    const almacen = obtenerAlmacen();
    const texto = String(b.texto ?? "").trim().slice(0, 4000);
    if (!texto) return falla("Escribí un mensaje");
    const c = await charlaDe(ficha, b.id);
    if (!c) return falla("No existe esa charla", 404);
    if (!c.telefono.startsWith("web-")) {
      if (!c.numero_negocio) return falla("No se sabe por qué número entró esta charla.");
      try {
        await enviarTexto(c.numero_negocio, c.telefono, texto);
      } catch (e) {
        if ((e as Error).message.includes("131047")) return falla("Pasaron más de 24 horas desde el último mensaje del cliente: WhatsApp no deja escribirle sin una plantilla aprobada.");
        throw e;
      }
    }
    if (c.estado !== "humano") await almacen.derivar(c.id, "tomada", `La tomó ${quien(b)} desde el panel del local.`);
    await almacen.guardar({ conversacionId: c.id, fichaId: ficha.id, rol: "humano", texto });
    return json({ ok: true });
  },

  async marcar(ficha, b) {
    const c = await charlaDe(ficha, b.id);
    if (!c) return falla("No existe esa charla", 404);
    const nota = String(b.nota ?? "").trim().slice(0, 500);
    if (!nota) return falla("Contá en una frase qué entendió mal");
    await obtenerAlmacen().evento(ficha.id, c.id, "mal_entendido", nota);
    return json({ ok: true });
  },
};
