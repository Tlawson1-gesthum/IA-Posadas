// El recorrido completo de un mensaje: ficha → reglas → cerebro → respuesta → registro.
// Sirve para WhatsApp y para el chat web: lo único que cambia es cómo se manda la respuesta.
import { obtenerAlmacen } from "./almacen.js";
import { responder } from "./cerebro.js";
import { fichaPorNumero } from "./fichas.js";
import { LIMITES_POR_DEFECTO, type Ficha } from "./tipos.js";
import { enviarTexto, type MensajeEntrante } from "./whatsapp.js";

const NO_LEO = "Por ahora solo leo mensajes de texto y ubicaciones. ¿Me lo escribís?";
const ERROR = "Uh, se me trabó algo. Ya le aviso a alguien del equipo para que te responda.";
const MUCHOS_MENSAJES = "Recibimos muchos mensajes seguidos. Para seguir, escribinos más tarde.";
const SIN_SALDO = "Ahora no puedo responderte por acá. Ya le aviso a alguien del equipo.";

interface Opciones {
  /** Cómo mandar la respuesta. Por defecto, por WhatsApp. */
  enviar?: (texto: string) => Promise<void>;
  /** Ficha a usar. Por defecto, la del número que recibió el mensaje. (El chat web la pasa, a veces en borrador.) */
  ficha?: Ficha;
  /** Ticket de la web del cliente para las herramientas (no se guarda). */
  credencial?: string;
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
  const textoGuardado = m.noSoportado ? `[${m.noSoportado}]` : m.texto;
  const nuevo = await almacen.guardar({ conversacionId: conv.id, fichaId: ficha.id, rol: "cliente", texto: textoGuardado, waId: m.waId });
  if (!nuevo) return; // Meta reenvió un aviso que ya atendimos.

  // Solo para pruebas: un administrador escribe /reiniciar y la charla vuelve al agente, de cero.
  const admins = (process.env.ADMIN_TELEFONOS ?? "").split(",").map((t) => t.trim()).filter(Boolean);
  // El chat web de prueba ya pide clave; la burbuja pública (web-publico-) no puede reiniciar.
  const esAdmin = admins.includes(m.de) || (m.de.startsWith("web-") && !m.de.startsWith("web-publico-"));
  if (m.texto.trim().toLowerCase() === "/reiniciar" && esAdmin) {
    await almacen.reiniciar(conv.id);
    await mandar("[Charla reiniciada: el agente vuelve a responder, sin memoria de lo anterior]");
    return;
  }

  // Charla derivada: la atiende una persona, el agente no se mete.
  if (conv.estado === "humano") return;

  const contestar = async (texto: string, extra: { herramientas?: string[]; tokensEntrada?: number; tokensSalida?: number; usd?: number } = {}) => {
    await mandar(texto);
    await almacen.guardar({ conversacionId: conv.id, fichaId: ficha.id, rol: "agente", texto, ...extra });
  };

  if (m.noSoportado) return contestar(NO_LEO);
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
    r = await responder(ficha, historial, m.texto, m.de, opciones.credencial);
  } catch (e) {
    console.error(`Ficha ${ficha.id}: falló el cerebro`, e);
    const detalle = `Error del agente: ${(e as Error).message}`.slice(0, 300);
    await almacen.derivar(conv.id, "otro", detalle);
    await evento("error", detalle);
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
    await almacen.derivar(conv.id, r.derivada.motivo, r.derivada.resumen);
    await evento("derivacion", `${r.derivada.motivo}: ${r.derivada.resumen}`);
  }
}
