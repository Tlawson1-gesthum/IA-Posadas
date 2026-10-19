// Un mensaje directo de Instagram: se busca la ficha por la cuenta que lo recibió y pasa por el mismo recorrido que WhatsApp
// (atender), con la respuesta por Instagram y un aviso al equipo cuando la charla pasa a una persona.
import { obtenerAlmacen } from "./almacen.js";
import { atender } from "./atender.js";
import { avisarEquipo } from "./avisos.js";
import { fichaDesdeFila } from "./fichas.js";
import { enviarMensaje, tokenDe, VENTANA_MS, type MensajeInstagram } from "./instagram.js";

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
