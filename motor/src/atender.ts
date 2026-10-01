// El recorrido completo de un mensaje de WhatsApp: ficha → reglas → cerebro → respuesta → registro.
import { obtenerAlmacen } from "./almacen.js";
import { responder } from "./cerebro.js";
import { fichaPorNumero } from "./fichas.js";
import { enviarTexto, type MensajeEntrante } from "./whatsapp.js";

const NO_LEO = "Por ahora solo leo mensajes de texto y ubicaciones. ¿Me lo escribís?";
const ERROR = "Uh, se me trabó algo. Ya le aviso a alguien del equipo para que te responda.";
const SIN_SALDO = "Ahora no puedo responderte por acá. Ya le aviso a alguien del equipo.";

export async function atender(m: MensajeEntrante): Promise<void> {
  const ficha = fichaPorNumero(m.phoneNumberId);
  if (!ficha) {
    console.warn(`Mensaje a un número sin ficha: ${m.phoneNumberId}`);
    return;
  }
  // Agente pausado (falta de pago o pedido del cliente): no responde ni gasta.
  if (ficha.estado !== "activo") return;

  const almacen = obtenerAlmacen();
  const conv = await almacen.conversacion(ficha.id, m.de);
  const textoGuardado = m.noSoportado ? `[${m.noSoportado}]` : m.texto;
  const nuevo = await almacen.guardar({ conversacionId: conv.id, fichaId: ficha.id, rol: "cliente", texto: textoGuardado, waId: m.waId });
  if (!nuevo) return; // Meta reenvió un aviso que ya atendimos.

  // Solo para pruebas: un administrador escribe /reiniciar y la charla vuelve al agente, de cero.
  const admins = (process.env.ADMIN_TELEFONOS ?? "").split(",").map((t) => t.trim()).filter(Boolean);
  if (m.texto.trim().toLowerCase() === "/reiniciar" && admins.includes(m.de)) {
    await almacen.reiniciar(conv.id);
    await enviarTexto(m.phoneNumberId, m.de, "[Charla reiniciada: Morfi vuelve a responder, sin memoria de lo anterior]");
    return;
  }

  // Charla derivada: la atiende una persona, el agente no se mete.
  if (conv.estado === "humano") return;

  const contestar = async (texto: string, extra: Partial<Parameters<typeof almacen.guardar>[0]> = {}) => {
    await enviarTexto(m.phoneNumberId, m.de, texto);
    await almacen.guardar({ conversacionId: conv.id, fichaId: ficha.id, rol: "agente", texto, ...extra });
  };

  if (m.noSoportado) return contestar(NO_LEO);
  if (!m.texto.trim()) return;

  if ((await almacen.gastoDelMes(ficha.id)) >= ficha.tope_usd_mes) {
    console.error(`Ficha ${ficha.id}: se alcanzó el tope mensual de US$ ${ficha.tope_usd_mes}`);
    await almacen.derivar(conv.id, "otro", "Se alcanzó el tope de gasto mensual del agente.");
    return contestar(SIN_SALDO);
  }

  // El historial se lee sin el mensaje recién guardado: el cerebro lo recibe aparte.
  const historial = (await almacen.historial(conv.id)).slice(0, -1);
  let r: Awaited<ReturnType<typeof responder>>;
  try {
    r = await responder(ficha, historial, m.texto, m.de);
  } catch (e) {
    console.error(`Ficha ${ficha.id}: falló el cerebro`, e);
    await almacen.derivar(conv.id, "otro", `Error del agente: ${(e as Error).message}`.slice(0, 300));
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
    console.log(`DERIVADA · ${ficha.id} · ${m.de} · ${r.derivada.motivo}: ${r.derivada.resumen}`);
  }
}
