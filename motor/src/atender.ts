// El recorrido completo de un mensaje: ficha → reglas → cerebro → respuesta → registro.
// Sirve para WhatsApp y para el chat web: lo único que cambia es cómo se manda la respuesta.
import { obtenerAlmacen } from "./almacen.js";
import { responder } from "./cerebro.js";
import { fichaPorNumero } from "./fichas.js";
import { REPETIR_SIN_TEXTO_MS, respuestaSinTexto } from "./sinTexto.js";
import { LIMITES_POR_DEFECTO, type Ficha } from "./tipos.js";
import { enviarTexto, type MensajeEntrante } from "./whatsapp.js";

const ERROR = "Uh, se me trabó algo. Ya le aviso a alguien del equipo para que te responda.";
const MUCHOS_MENSAJES = "Recibimos muchos mensajes seguidos. Para seguir, escribinos más tarde.";
const SIN_SALDO = "Ahora no puedo responderte por acá. Ya le aviso a alguien del equipo.";
/** Si alguien del equipo escribió hace menos de esto en una charla derivada de soporte, el agente no se mete. */
const EQUIPO_ACTIVO_MS = 30 * 60_000;

interface Opciones {
  /** Cómo mandar la respuesta. Por defecto, por WhatsApp. */
  enviar?: (texto: string) => Promise<void>;
  /** Ficha a usar. Por defecto, la del número que recibió el mensaje. (El chat web la pasa, a veces en borrador.) */
  ficha?: Ficha;
  /** Ticket de la web del cliente para las herramientas (no se guarda). */
  credencial?: string;
  /** Se llama cuando la charla pasa a una persona (Instagram avisa al equipo). WhatsApp y la web no lo usan. */
  alDerivar?: (motivo: string, resumen: string, conversacionId: string) => Promise<void>;
  /** Se llama una vez guardado un mensaje nuevo (no con los avisos repetidos de Meta). */
  alGuardar?: (conversacionId: string) => Promise<void>;
}

export async function atender(m: MensajeEntrante, opciones: Opciones = {}): Promise<void> {
  const mandar = opciones.enviar ?? ((texto: string) => enviarTexto(m.phoneNumberId, m.de, texto));
  const ficha = opciones.ficha ?? (await fichaPorNumero(m.phoneNumberId));
  if (!ficha) {
    console.warn(`Mensaje a un número sin ficha: ${m.phoneNumberId}`);
    return;
  }
  // Agente pausado (falta de pago o pedido del cliente): no responde ni gasta.
  if (ficha.estado !== "activo") return;

  const limites = { ...LIMITES_POR_DEFECTO, ...ficha.limites };
  // Un mensaje larguísimo cuesta más y no lo manda un cliente real: se corta.
  m = { ...m, texto: m.texto.slice(0, limites.caracteres_por_mensaje) };

  const almacen = obtenerAlmacen();
  const conv = await almacen.conversacion(ficha.id, m.de, m.phoneNumberId);
  const evento = (tipo: string, detalle: string) => almacen.evento(ficha.id, conv.id, tipo, detalle);
  const textoGuardado = m.noSoportado ? (m.nota ?? `[${m.noSoportado}]`) : m.texto;
  const nuevo = await almacen.guardar({ conversacionId: conv.id, fichaId: ficha.id, rol: "cliente", texto: textoGuardado, waId: m.waId });
  if (!nuevo) return; // Meta reenvió un aviso que ya atendimos.
  await opciones.alGuardar?.(conv.id);

  // Solo para pruebas: un administrador escribe /reiniciar y la charla vuelve al agente, de cero.
  const lista = (v?: string) => (v ?? "").split(",").map((t) => t.trim()).filter(Boolean);
  // En Instagram, los administradores se cargan por su id de Instagram (ADMIN_INSTAGRAM) y la charla se guarda como "ig:<id>".
  const admins = [...lista(process.env.ADMIN_TELEFONOS), ...lista(process.env.ADMIN_INSTAGRAM).map((id) => `ig:${id}`)];
  // El chat web de prueba ya pide clave; la burbuja pública (web-publico-) no puede reiniciar.
  const esAdmin = admins.includes(m.de) || (m.de.startsWith("web-") && !m.de.startsWith("web-publico-"));
  if (m.texto.trim().toLowerCase() === "/reiniciar" && esAdmin) {
    await almacen.reiniciar(conv.id);
    await mandar("[Charla reiniciada: el agente vuelve a responder, sin memoria de lo anterior]");
    return;
  }

  // Charla derivada: la atiende una persona, el agente no se mete.
  // En la ayuda del sistema (plantilla soporte) la persona sigue trabajando y pregunta otras cosas: el agente vuelve a
  // responder si nadie del equipo escribió en la última media hora. La consulta pasada sigue anotada para el equipo.
  // (Antes quedaba callado para siempre: en Gozza, del 06/11 al 20/11 nadie le contestó cinco preguntas.)
  let pasadaAlEquipo: string | undefined;
  if (conv.estado === "humano") {
    if (ficha.plantilla !== "soporte") return;
    const [detalle, guardados] = await Promise.all([almacen.detalleConversacion(conv.id), almacen.mensajes(conv.id)]);
    const delEquipo = guardados.filter((t) => t.rol === "humano").at(-1);
    if (delEquipo && Date.now() - Date.parse(delEquipo.creado) < EQUIPO_ACTIVO_MS) return;
    pasadaAlEquipo = detalle?.derivada_resumen || "una consulta anterior";
  }

  const contestar = async (texto: string, extra: { herramientas?: string[]; tokensEntrada?: number; tokensSalida?: number; usd?: number } = {}) => {
    await mandar(texto);
    await almacen.guardar({ conversacionId: conv.id, fichaId: ficha.id, rol: "agente", texto, ...extra });
  };

  // Algo que no es texto: una respuesta fija según el tipo (pedir que lo escriba, agradecer) o nada. Sin IA y sin gasto.
  if (m.noSoportado) {
    const fija = respuestaSinTexto(m.noSoportado);
    if (!fija) return;
    // Si manda varias fotos o audios seguidos, se le pide una sola vez.
    const desde = Date.now() - REPETIR_SIN_TEXTO_MS;
    const yaDicho = (await almacen.mensajes(conv.id)).some((t) => t.rol === "agente" && t.texto === fija && Date.parse(t.creado) > desde);
    if (!yaDicho) await contestar(fija);
    return;
  }
  if (!m.texto.trim()) return;

  // Límites por persona: cuando se pasa, se avisa una sola vez y después el agente no responde (ni gasta).
  // Las consultas a la base van todas juntas: cada ida y vuelta suma demora.
  const [hora, dia, gastoMes, historialCompleto] = await Promise.all([
    almacen.actividad(conv.id, new Date(Date.now() - 3600_000)),
    almacen.actividad(conv.id, new Date(Date.now() - 24 * 3600_000)),
    almacen.gastoDelMes(ficha.id),
    almacen.historial(conv.id),
  ]);
  const excedido =
    hora.mensajes > limites.mensajes_por_hora || dia.mensajes > limites.mensajes_por_dia || dia.usd >= limites.usd_por_persona_dia;
  if (excedido) {
    const ultimaDelAgente = historialCompleto.filter((t) => t.rol === "agente").at(-1);
    if (ultimaDelAgente?.texto !== MUCHOS_MENSAJES) {
      await evento("limite_persona", `${m.de} · ${hora.mensajes}/h · ${dia.mensajes}/día · US$ ${dia.usd.toFixed(3)}/día`);
      return contestar(MUCHOS_MENSAJES);
    }
    return;
  }

  if (gastoMes >= ficha.tope_usd_mes) {
    await almacen.derivar(conv.id, "otro", "Se alcanzó el tope de gasto mensual del agente.");
    await evento("tope_mes", `Se alcanzó el tope mensual de US$ ${ficha.tope_usd_mes}`);
    return contestar(SIN_SALDO);
  }

  // El historial se lee sin el mensaje recién guardado: el cerebro lo recibe aparte.
  const historial = historialCompleto.slice(0, -1);
  let r: Awaited<ReturnType<typeof responder>>;
  try {
    const texto = pasadaAlEquipo
      ? `[Aviso del sistema: esta charla ya se le pasó al equipo de Pensa por esto: "${pasadaAlEquipo.slice(0, 300)}". Si vuelve sobre eso, decile que el equipo ya lo tiene y le responde por este chat. Si pregunta otra cosa, respondé normal.] ${m.texto}`
      : m.texto;
    r = await responder(ficha, historial, texto, m.de, opciones.credencial);
  } catch (e) {
    console.error(`Ficha ${ficha.id}: falló el cerebro`, e);
    const detalle = `Error del agente: ${(e as Error).message}`.slice(0, 300);
    await almacen.derivar(conv.id, "otro", detalle);
    await evento("error", detalle);
    await opciones.alDerivar?.("otro", detalle, conv.id);
    return contestar(ERROR);
  }
  if (r.texto) {
    await contestar(r.texto, {
      herramientas: r.herramientasUsadas,
      tokensEntrada: r.uso.entrada + r.uso.cacheLeida + r.uso.cacheEscrita,
      tokensSalida: r.uso.salida,
      usd: r.uso.usd,
    });
  }
  if (r.derivada) {
    // Si ya estaba derivada, el resumen nuevo no borra lo que el equipo todavía no respondió.
    if (pasadaAlEquipo) r.derivada.resumen = `${r.derivada.resumen} (Antes: ${pasadaAlEquipo})`.slice(0, 2000);
    await almacen.derivar(conv.id, r.derivada.motivo, r.derivada.resumen);
    await evento("derivacion", `${r.derivada.motivo}: ${r.derivada.resumen}`);
    await opciones.alDerivar?.(r.derivada.motivo, r.derivada.resumen, conv.id);
  }
}
