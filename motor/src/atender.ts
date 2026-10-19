// El recorrido completo de un mensaje: ficha → reglas → cerebro → respuesta → registro.
// Sirve para WhatsApp y para el chat web: lo único que cambia es cómo se manda la respuesta.
import { obtenerAlmacen, type MensajeArmado } from "./almacen.js";
import { responder } from "./cerebro.js";
import { fichaPorNumero } from "./fichas.js";
import { autorizacion, baseUrl } from "./herramientas/semorfa.js";
import { LIMITES_POR_DEFECTO, type ContextoHerramienta, type Ficha } from "./tipos.js";
import { enviarTexto, type MensajeEntrante } from "./whatsapp.js";
import { sinTelefonos } from "./enmascarar.js";
import { REGISTRO } from "./herramientas/index.js";

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
// Distribuidora con Claude caído (03 · degradación, paso 30): "solo acuse". El mensaje queda guardado y la charla pasa a una
// persona del local con el texto del cliente (lo ve en Agente → charlas derivadas); el agente no promete nada que no hizo.
export const SOLO_ACUSE = "Recibí tu mensaje. Lo registré y te confirmo en unos minutos. Gracias.";
const MUCHOS_MENSAJES = "Recibimos muchos mensajes seguidos. Para seguir, escribinos más tarde.";
const SIN_SALDO = "Ahora no puedo responderte por acá. Ya le aviso a alguien del equipo.";
const ES_BAJA = /^s*baja[s.!]*$/i;
export const AVISO_BAJA = "Listo, no te vamos a mandar más avisos de cobranza por acá. Podés seguir haciendo tus pedidos cuando quieras. Gracias.";
const AVISO_BAJA_A_MANO = "Recibimos tu pedido de BAJA: una persona del equipo la anota para que no te lleguen más avisos de cobranza. Podés seguir haciendo tus pedidos por acá. Gracias.";

/** Avisa al sistema de la distribuidora que ese número no quiere más avisos. */
async function anotarBaja(ficha: Ficha, telefono: string): Promise<boolean> {
  if (!ficha.integracion?.crear_pedidos) return true; // ficha de prueba sin sistema real: se hace de cuenta
  try {
    const ctx = { ficha, telefono };
    const r = await fetch(`${baseUrl(ctx)}/api/agente/distri/avisos`, {
      method: "POST", headers: { "content-type": "application/json", ...autorizacion(ctx) }, body: JSON.stringify({ accion: "baja", telefono }), signal: AbortSignal.timeout(10000),
    });
    return r.ok;
  } catch {
    return false;
  }
}
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

// Solo para la prueba de carga (CLAUDE_SIMULAR=1, scripts/carga.ts): no llama a Claude. Tarda lo que tarda Claude más o menos
// (CLAUDE_SIMULAR_MS, de fábrica 2500 ms) y, en una distribuidora, si el texto dice PEDIDO cotiza y carga un pedido con las
// herramientas de verdad (contra el sistema de la ficha); si dice CUENTA, consulta la cuenta. Anota en `cargaSimulada` qué hizo.
export const cargaSimulada: { id: string; telefono: string; herramienta: string; ok: boolean; motivo?: string; ms: number; cuando: number }[] = [];
const cerebroSimulado: typeof responder = async (ficha, _historial, texto, telefono, _credencial, meta) => {
  await esperar(Number(process.env.CLAUDE_SIMULAR_MS ?? 2500));
  const ctx: ContextoHerramienta = { ficha, telefono, mensaje: meta };
  const usadas: string[] = [];
  const usar = async (nombre: string, entrada: Record<string, unknown>) => {
    const t0 = Date.now();
    let ok = false, motivo: string | undefined;
    try { const r = JSON.parse(await REGISTRO[nombre].ejecutar(entrada, ctx)); ok = r?.ok !== false; motivo = ok ? undefined : String(r?.motivo ?? r?.error ?? ""); } catch (e) { motivo = (e as Error).message; }
    cargaSimulada.push({ id: meta?.id ?? "", telefono, herramienta: nombre, ok, motivo, ms: Date.now() - t0, cuando: Date.now() });
    usadas.push(nombre);
    return ok;
  };
  let respuesta = "Hola, gracias por escribir. ¿Qué necesitás?";
  if (esDistribuidora(ficha) && /PEDIDO/.test(texto)) {
    const items = JSON.parse(process.env.CLAUDE_SIMULAR_ITEMS ?? '[{"producto_id":1,"cantidad":3},{"producto_id":16,"cantidad":4}]');
    await usar("cotizar_pedido_b2b", { items });
    const ok = await usar("crear_pedido_borrador", { items, cliente_confirmo: true, seguro_de_lo_que_entendiste: true });
    respuesta = ok ? "Listo, cargué tu pedido. Gracias." : "No pude cargar el pedido: lo revisa una persona. Gracias.";
  } else if (esDistribuidora(ficha) && /CUENTA/.test(texto)) {
    await usar("consultar_cuenta", {});
    respuesta = "Te paso tu saldo. Gracias.";
  }
  return { texto: respuesta, herramientasUsadas: usadas, uso: { entrada: 0, salida: 0, cacheLeida: 0, cacheEscrita: 0, usd: 0 } };
};

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

  // Distribuidora: "BAJA" corta los avisos de cobranza de ese número (C13), sin pasar por Claude. Sigue pudiendo pedir.
  if (distri && ES_BAJA.test(m.texto)) {
    const anotada = await anotarBaja(ficha, m.de);
    if (!anotada) await almacen.derivar(conv.id, "plata", "Pidió BAJA de los avisos de cobranza y no se pudo anotar sola: marcala en Cobranzas.");
    await mandar(anotada ? AVISO_BAJA : AVISO_BAJA_A_MANO);
    await almacen.guardar({ conversacionId: conv.id, fichaId: ficha.id, rol: "agente", texto: anotada ? AVISO_BAJA : AVISO_BAJA_A_MANO });
    return;
  }

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
    r = await (opciones.cerebro ?? (process.env.CLAUDE_SIMULAR === "1" ? cerebroSimulado : responder))(ficha, historial, texto, m.de, opciones.credencial, meta);
  } catch (e) {
    console.error(`Ficha ${ficha.id}: falló el cerebro`, sinTelefonos((e as Error)?.stack ?? e));
    const detalle = `Error del agente: ${(e as Error).message}`.slice(0, 300);
    if (distri) {
      // solo acuse: lo que pidió queda escrito para la persona que toma la charla
      await almacen.derivar(conv.id, "otro", `El agente no pudo responder (Claude no contestó). El cliente escribió: ${texto}`.slice(0, 1000));
      await evento("solo_acuse", detalle);
      return contestar(SOLO_ACUSE);
    }
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
