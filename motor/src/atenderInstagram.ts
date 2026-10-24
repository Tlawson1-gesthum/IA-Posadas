// Un mensaje directo de Instagram: se busca la ficha por la cuenta que lo recibió y pasa por el mismo recorrido que WhatsApp
// (atender), con la respuesta por Instagram y un aviso al equipo cuando la charla pasa a una persona.
import { obtenerAlmacen } from "./almacen.js";
import { atender } from "./atender.js";
import { avisarEquipo } from "./avisos.js";
import { fichaDesdeFila } from "./fichas.js";
import { FOTO_ENVIADA } from "./herramientas/viandas.js";
import { enviarMensaje, paraInstagram, tokenDe, VENTANA_MS, type EcoInstagram, type MensajeInstagram } from "./instagram.js";

const normal = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/**
 * ¿Hay que agradecer? Cuando nos mencionan en una historia o comparten una publicación que nos nombra
 * (ej. "Fan de @gozzasabores"). Una publicación compartida que no nos nombra no se contesta.
 */
export function esParaAgradecer(m: Pick<MensajeInstagram, "noSoportado" | "descripcion">, nombreLocal: string): boolean {
  if (m.noSoportado === "story_mention") return true;
  const nombre = normal(nombreLocal).replace(/[^a-z0-9]/g, "");
  // Palabra por palabra (una @cuenta cuenta como palabra): "@gozzasabores" nombra a GOZZA.
  return !!m.descripcion && nombre.length >= 3 && normal(m.descripcion).split(/[^a-z0-9@_.]+/).some((p) => p.includes(nombre));
}

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

  // Una mención en una historia se avisa al equipo (una vez), aunque el agente también agradezca.
  const avisarMencion = async (conversacionId: string) => {
    if (m.noSoportado === "story_mention") await avisarEquipo(ficha.id, conversacionId, "Te mencionaron en una historia", "Miralo en la app de Instagram.");
  };
  // Sin respuesta automática o fuera de la ventana de 24 h de Meta: solo se guarda.
  const soloGuardar = ficha.estado !== "activo" || !ficha.instagram?.responder_mensajes || Date.now() - m.hora > VENTANA_MS;
  if (soloGuardar) {
    const conv = await almacen.conversacion(ficha.id, de, negocio);
    const texto = m.noSoportado ? (m.nota ?? `[${m.noSoportado}]`) : m.texto;
    if (await almacen.guardar({ conversacionId: conv.id, fichaId: ficha.id, rol: "cliente", texto, waId: `ig:${m.mid}` })) await avisarMencion(conv.id);
    return;
  }

  // Lo que no es texto lo resuelve atender con una respuesta fija según el tipo (src/sinTexto.ts).
  const noSoportado = m.noSoportado && esParaAgradecer(m, ficha.nombre) ? "agradecer" : m.noSoportado;
  await atender(
    { phoneNumberId: negocio, de, waId: `ig:${m.mid}`, texto: m.texto, noSoportado, nota: m.nota },
    {
      ficha,
      enviar: async (texto) => enviarMensaje(m.cuenta, await tokenDe(ficha), m.de, texto),
      alDerivar: (motivo, resumen, conversacionId) => avisarEquipo(ficha.id, conversacionId, "Charla de Instagram para una persona", `${motivo}: ${resumen}`),
      alGuardar: avisarMencion,
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
