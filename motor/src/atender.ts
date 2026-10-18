// El recorrido completo de un mensaje: ficha → reglas → cerebro → respuesta → registro.
// Sirve para WhatsApp y para el chat web: lo único que cambia es cómo se manda la respuesta.
import { obtenerAlmacen, type MensajeArmado } from "./almacen.js";
import { responder } from "./cerebro.js";
import { fichaPorNumero } from "./fichas.js";
import { LIMITES_POR_DEFECTO, type ContextoHerramienta, type Ficha } from "./tipos.js";
import { enviarTexto, type MensajeEntrante } from "./whatsapp.js";

// Distribuidoras (paso 16):
// - Mensajes seguidos: se espera ESPERA_MS; si en ese tiempo llegó otro mensaje del mismo cliente, este no responde y el último
//   atiende todos juntos (texto + foto + audio = una sola respuesta y, a lo sumo, un pedido).
// - Pedido en armado: los mensajes de los primeros 5 minutos de una misma intención comparten el id con el que se carga el pedido,
//   así el sistema de la distribuidora no carga dos pedidos (mismo mensaje_id → mismo pedido).
// - Retención: cada charla guarda hasta cuándo se conserva su texto (90 días si la ficha no dice otra cosa).
const ESPERA_MS = Number(process.env.ESPERA_MENSAJES_MS ?? 6000);
const VENTANA_ARMADO_MS = 5 * 60_000;
const DIAS_RETENCION_DISTRIBUIDORA = 90;
export const esDistribuidora = (f: Ficha) => f.integracion?.tipo === "distribuidora";
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

const NO_LEO = "Por ahora solo leo mensajes de texto y ubicaciones. ¿Me lo escribís?";
const ERROR = "Uh, se me trabó algo. Ya le aviso a alguien del equipo para que te responda.";
const MUCHOS_MENSAJES = "Recibimos muchos mensajes seguidos. Para seguir, escribinos más tarde.";
const SIN_SALDO = "Ahora no puedo responderte por acá. Ya le aviso a alguien del equipo.";
export const AVISO_PAUSA = "Hola, gracias por escribir. Ahora te responde una persona del equipo por acá.";
/** Motivo de derivación de las charlas que llegaron con el agente en pausa: al sacar la pausa vuelven solas al agente. */
export const MOTIVO_PAUSA = "pausa";

interface Opciones {
  /** Cómo mandar la respuesta. Por defecto, por WhatsApp. */
  enviar?: (texto: string) => Promise<void>;
  /** Ficha a usar. Por defecto, la del número que recibió el mensaje. (El chat web la pasa, a veces en borrador.) */
  ficha?: Ficha;
  /** Ticket de la web del cliente para las herramientas (no se guarda). */
  credencial?: string;
  /** Solo pruebas: otro cerebro (sin Claude) y otra espera para los mensajes seguidos. */
  cerebro?: typeof responder;
  esperaMs?: number;
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
  const distri = esDistribuidora(ficha);
  const dias = (ficha as Ficha & { retencion_conversaciones_dias?: number }).retencion_conversaciones_dias ?? (distri ? DIAS_RETENCION_DISTRIBUIDORA : undefined);
  if (dias) await almacen.retener(conv.id, new Date(Date.now() + dias * 86400_000));

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

  // Pausa del dueño (desde el panel de su local): un aviso y la charla pasa al equipo. Al sacar la pausa vuelve al agente.
  if (ficha.pausa_local) {
    await almacen.derivar(conv.id, MOTIVO_PAUSA, "El agente está en pausa: responde una persona del equipo.");
    await mandar(AVISO_PAUSA);
    await almacen.guardar({ conversacionId: conv.id, fichaId: ficha.id, rol: "agente", texto: AVISO_PAUSA });
    return;
  }

  const contestar = async (texto: string, extra: { herramientas?: string[]; tokensEntrada?: number; tokensSalida?: number; usd?: number } = {}) => {
    await mandar(texto);
    await almacen.guardar({ conversacionId: conv.id, fichaId: ficha.id, rol: "agente", texto, ...extra });
  };

  if (m.noSoportado) return contestar(NO_LEO);
  if (!m.texto.trim()) return;

  // Distribuidora: mensajes seguidos y pedido en armado (ver arriba)
  let texto = m.texto;
  let sinResponder = 1;
  let meta: ContextoHerramienta["mensaje"] | undefined;
  if (distri && m.waId) {
    await esperar(opciones.esperaMs ?? ESPERA_MS);
    const pendientes = await almacen.sinResponder(conv.id);
    if (pendientes.at(-1)?.waId !== m.waId) return; // llegó otro después: ese responde por todos
    const conTexto = pendientes.filter((p) => p.texto.trim() && !/^\[\w+\]$/.test(p.texto));
    texto = conTexto.map((p) => p.texto).join("\n").slice(0, limites.caracteres_por_mensaje * 3);
    sinResponder = pendientes.length;
    const a = await almacen.armado(ficha.id, m.de);
    const abierto = a && Date.parse(a.abiertoHasta) > Date.now() ? a : null;
    const ya = new Set((abierto?.mensajes ?? []).map((x) => x.waId));
    const lista: MensajeArmado[] = [
      ...(abierto?.mensajes ?? []),
      ...pendientes.filter((p) => !ya.has(p.waId)).map((p) => ({ waId: p.waId, texto: p.texto, ts: p.creado })),
    ].slice(-30);
    // la ventana se cuenta desde el primer mensaje de la intención (no se estira con cada mensaje)
    await almacen.guardarArmado(ficha.id, m.de, lista, abierto ? new Date(abierto.abiertoHasta) : new Date(Date.now() + VENTANA_ARMADO_MS));
    meta = { id: lista[0]?.waId ?? m.waId, texto: lista.map((x) => x.texto).join("\n") };
    if (!texto.trim()) return;
  }

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

  // El historial se lee sin los mensajes que se están respondiendo: el cerebro los recibe aparte (juntos, si eran varios).
  const historial = historialCompleto.slice(0, -sinResponder);
  let r: Awaited<ReturnType<typeof responder>>;
  try {
    r = await (opciones.cerebro ?? responder)(ficha, historial, texto, m.de, opciones.credencial, meta);
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
