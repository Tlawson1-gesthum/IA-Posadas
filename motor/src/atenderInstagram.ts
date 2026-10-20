// Un mensaje directo de Instagram: se busca la ficha por la cuenta que lo recibió y pasa por el mismo recorrido que WhatsApp
// (atender), con la respuesta por Instagram y un aviso al equipo cuando la charla pasa a una persona.
import { obtenerAlmacen } from "./almacen.js";
import { atender } from "./atender.js";
import { avisarEquipo } from "./avisos.js";
import { fichaDesdeFila } from "./fichas.js";
import { FOTO_ENVIADA } from "./herramientas/viandas.js";
import { enviarMensaje, paraInstagram, tokenDe, VENTANA_MS, type EcoInstagram, type MensajeInstagram } from "./instagram.js";

/** Cosas que llegan como mensaje pero no son para contestar (un corazón, compartir una publicación). */
const SOLO_GUARDAR = new Set(["like_heart", "share", "ig_reel", "reel", "ig_post", "story_mention", "otro"]);

export async function atenderMensajeInstagram(m: MensajeInstagram): Promise<void> {
  const almacen = obtenerAlmacen();
  const fila = await almacen.fichaPorInstagram(m.cuenta);
  if (!fila) {
    console.warn(`Mensaje de Instagram a una cuenta sin ficha: ${m.cuenta}`);
    return;
  }
  const ficha = fichaDesdeFila(fila);
  const de = `ig:${m.de}`;
  const negocio = `ig:${m.cuenta}`;

  // Sin respuesta automática, fuera de la ventana de 24 h de Meta o algo que no es para contestar: solo se guarda.
  const soloGuardar =
    ficha.estado !== "activo" || !ficha.instagram?.responder_mensajes || Date.now() - m.hora > VENTANA_MS || SOLO_GUARDAR.has(m.noSoportado ?? "");
  if (soloGuardar) {
    const conv = await almacen.conversacion(ficha.id, de, negocio);
    const texto = m.noSoportado ? `[${m.noSoportado}]` : m.texto;
    const nuevo = await almacen.guardar({ conversacionId: conv.id, fichaId: ficha.id, rol: "cliente", texto, waId: `ig:${m.mid}` });
    if (nuevo && m.noSoportado === "story_mention") await avisarEquipo(ficha.id, conv.id, "Te mencionaron en una historia", "Miralo en la app de Instagram.");
    return;
  }

  await atender(
    { phoneNumberId: negocio, de, waId: `ig:${m.mid}`, texto: m.texto, noSoportado: m.noSoportado },
    {
      ficha,
      enviar: async (texto) => enviarMensaje(m.cuenta, await tokenDe(ficha), m.de, texto),
      alDerivar: (motivo, resumen, conversacionId) => avisarEquipo(ficha.id, conversacionId, "Charla de Instagram para una persona", `${motivo}: ${resumen}`),
    },
  );
}

/** Cuánto se espera antes de mirar un eco: el agente guarda lo que mandó recién después de mandarlo. */
const ESPERA_ECO_MS = Number(process.env.INSTAGRAM_ESPERA_ECO_MS ?? 8000);
const VENTANA_PROPIOS_MS = 15 * 60_000;
const comparable = (t: string) => paraInstagram(t).replace(/\s+/g, " ").trim().toLowerCase();

/** ¿El eco es algo que mandó el motor (agente, respuesta a un comentario o una persona desde el panel)? */
export function esNuestro(eco: EcoInstagram, recientes: { rol: string; texto: string; creado: string }[], ahora = Date.now(), fotos: string[] = []): boolean {
  // Fotos: el motor solo manda las que anota (FOTO_ENVIADA, con el id del mensaje). Cualquier otra la mandó una persona.
  if (eco.adjunto) return !!eco.mid && fotos.includes(eco.mid);
  const texto = comparable(eco.texto);
  if (!texto) return true;
  if (texto.startsWith("[charla reiniciada")) return true;
  // Igual a un mensaje del motor, o una parte larga de uno (los largos salen en partes). Un "gracias" suelto no alcanza.
  return recientes.some((m) => {
    if (m.rol === "cliente" || ahora - Date.parse(m.creado) >= VENTANA_PROPIOS_MS) return false;
    const propio = comparable(m.texto);
    return propio === texto || (texto.length >= 20 && propio.includes(texto));
  });
}

/**
 * Eco de un mensaje que salió de la cuenta. Si no lo mandó el motor, lo escribió una persona del equipo desde la app de
 * Instagram: la charla pasa a esa persona y el agente se calla ahí hasta que la liberen desde el panel.
 */
export async function atenderEcoInstagram(eco: EcoInstagram, espera = ESPERA_ECO_MS): Promise<void> {
  const almacen = obtenerAlmacen();
  const fila = await almacen.fichaPorInstagram(eco.cuenta);
  if (!fila) return;
  const ficha = fichaDesdeFila(fila);
  if (espera > 0) await new Promise((r) => setTimeout(r, espera));
  const conv = await almacen.conversacion(ficha.id, `ig:${eco.para}`, `ig:${eco.cuenta}`);
  // Las respuestas fijas a comentarios también son del motor (sin el autor del comentario, no quedan en esta charla).
  const fijas = (ficha.instagram?.comentarios?.reglas ?? []).map((r) => ({ rol: "agente", texto: r.respuesta, creado: new Date().toISOString() }));
  const fotos = eco.adjunto
    ? (await almacen.eventos(new Date(Date.now() - VENTANA_PROPIOS_MS), [FOTO_ENVIADA])).filter((e) => e.ficha_id === ficha.id).map((e) => e.detalle ?? "")
    : [];
  if (esNuestro(eco, [...(await almacen.mensajes(conv.id)), ...fijas], Date.now(), fotos)) return;
  const nuevo = await almacen.guardar({ conversacionId: conv.id, fichaId: ficha.id, rol: "humano", texto: eco.texto || `[${eco.adjunto}]`, waId: `ig:${eco.mid}` });
  if (!nuevo || conv.estado === "humano") return;
  await almacen.derivar(conv.id, "tomada", "Una persona del equipo contestó desde la app de Instagram.");
  await almacen.evento(ficha.id, conv.id, "tomada", "Una persona del equipo contestó desde la app de Instagram: el agente no sigue en esta charla.");
}
