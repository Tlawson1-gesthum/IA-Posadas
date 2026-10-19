// Comentarios en las publicaciones: solo se responden los que tienen una palabra de las reglas aprobadas (ej. VIANDAS),
// con un mensaje privado de texto fijo (sin IA). Los demás quedan anotados para que los mire una persona: nunca se
// contesta en público.
import { obtenerAlmacen } from "./almacen.js";
import { avisarEquipo } from "./avisos.js";
import { graph, respuestaPrivada, tokenDe, VENTANA_COMENTARIO_MS, type ComentarioInstagram } from "./instagram.js";
import type { Ficha, ReglaComentario } from "./tipos.js";

const sinTildes = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toUpperCase();

/** La regla que dispara un comentario: alguna de sus palabras escrita como palabra suelta ("viandas!" sí, "viandasss" no). */
export function reglaPara(texto: string, reglas: ReglaComentario[]): ReglaComentario | null {
  const t = sinTildes(texto);
  return (
    reglas.find((r) =>
      r.palabras.some((p) => new RegExp(`(^|[^A-Z0-9])${sinTildes(p).replace(/[^A-Z0-9 ]/g, "")}([^A-Z0-9]|$)`).test(t)),
    ) ?? null
  );
}

export type ResultadoComentario = "respondido" | "revisar" | "repetido" | "viejo" | "fallo";

export async function atenderComentario(ficha: Ficha, c: ComentarioInstagram): Promise<ResultadoComentario> {
  const almacen = obtenerAlmacen();
  const regla = reglaPara(c.texto, ficha.instagram?.comentarios?.reglas ?? []);
  // Se anota antes de responder: si dos revisiones se cruzan, solo una manda el mensaje.
  if (!(await almacen.marcarComentario(ficha.id, c.id, regla?.palabras[0] ?? null))) return "repetido";
  const quien = c.usuario ? `@${c.usuario}` : "alguien";
  if (!regla) {
    await almacen.evento(ficha.id, null, "comentario", `${quien}: ${c.texto}`.slice(0, 500));
    return "revisar";
  }
  if (Date.now() - c.hora > VENTANA_COMENTARIO_MS) {
    await almacen.evento(ficha.id, null, "comentario", `${quien} (más de 7 días, no se puede responder por privado): ${c.texto}`.slice(0, 500));
    return "viejo";
  }
  try {
    await respuestaPrivada(c.cuenta, await tokenDe(ficha), c.id, regla.respuesta);
  } catch (e) {
    await avisarEquipo(ficha.id, null, "No salió la respuesta a un comentario", `${quien} escribió "${c.texto}". ${(e as Error).message}`);
    return "fallo";
  }
  // Queda en la charla de esa persona: si contesta, el agente (o una persona) sigue desde ahí.
  const conv = await almacen.conversacion(ficha.id, c.de ? `ig:${c.de}` : `ig-comentario:${c.id}`, `ig:${c.cuenta}`);
  await almacen.guardar({ conversacionId: conv.id, fichaId: ficha.id, rol: "cliente", texto: `[Comentario en una publicación] ${c.texto}`, waId: `igc:${c.id}` });
  await almacen.guardar({ conversacionId: conv.id, fichaId: ficha.id, rol: "agente", texto: regla.respuesta });
  if (regla.derivar) {
    const resumen = `${regla.derivar.resumen} (${quien}: "${c.texto}")`;
    await almacen.derivar(conv.id, regla.derivar.motivo, resumen);
    await avisarEquipo(ficha.id, conv.id, "Comentario de Instagram para una persona", resumen);
  }
  return "respondido";
}

/**
 * Lee los comentarios de las publicaciones de los últimos 30 días y atiende los nuevos.
 * Sirve sin el aviso de comentarios de Meta (que pide acceso avanzado y revisión de la app).
 */
export async function revisarComentarios(ficha: Ficha): Promise<Record<ResultadoComentario, number>> {
  const cuenta = ficha.instagram!.ig_user_id;
  const token = await tokenDe(ficha);
  const cuenta_: Record<ResultadoComentario, number> = { respondido: 0, revisar: 0, repetido: 0, viejo: 0, fallo: 0 };
  const medios = (await graph(token, `${cuenta}/media`, { params: { fields: "id,timestamp,comments_count", limit: "15" } })).data ?? [];
  const desde = Date.now() - 30 * 86400_000;
  for (const m of medios) {
    if (!m.comments_count || Date.parse(m.timestamp) < desde) continue;
    let lista: any[];
    try {
      lista = (await graph(token, `${m.id}/comments`, { params: { fields: "id,text,timestamp,username,from", limit: "50" } })).data ?? [];
    } catch {
      // Si Meta no deja pedir "from" con este acceso, se piden los demás campos.
      lista = (await graph(token, `${m.id}/comments`, { params: { fields: "id,text,timestamp,username", limit: "50" } })).data ?? [];
    }
    const recientes = lista.filter((c) => Date.now() - Date.parse(c.timestamp) < VENTANA_COMENTARIO_MS && String(c.from?.id ?? "") !== cuenta);
    const vistos = await obtenerAlmacen().comentariosVistos(ficha.id, recientes.map((c) => String(c.id)));
    for (const c of recientes) {
      if (vistos.has(String(c.id))) continue;
      const r = await atenderComentario(ficha, {
        cuenta,
        id: String(c.id),
        texto: String(c.text ?? ""),
        de: c.from?.id ? String(c.from.id) : undefined,
        usuario: c.username ?? c.from?.username,
        media: String(m.id),
        hora: Date.parse(c.timestamp),
      });
      cuenta_[r]++;
    }
  }
  return cuenta_;
}
