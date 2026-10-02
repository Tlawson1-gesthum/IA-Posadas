// El cerebro: recibe la ficha, el historial y el mensaje nuevo; devuelve qué contestar.
// No sabe nada de WhatsApp ni de la base de datos: eso lo hacen las capas de afuera.
import Anthropic from "@anthropic-ai/sdk";
import { leerConocimiento } from "./conocimiento.js";
import { armarPrompt } from "./fichas.js";
import { REGISTRO } from "./herramientas/index.js";
import type { ContextoHerramienta, Ficha, Respuesta, Turno } from "./tipos.js";

const client = new Anthropic();

/** USD por millón de tokens: [entrada, salida, lectura de caché, escritura de caché]. */
const PRECIOS: Record<string, [number, number, number, number]> = {
  "claude-opus-5-5": [4, 20, 0.2, 5],
  "claude-sonnet-5-5": [2, 10, 0.2, 2.5],
  "claude-haiku-4-5": [1, 5, 0.1, 1.25],
};

/** Cuántos turnos anteriores se le pasan al modelo. */
const MAX_TURNOS = 20;
/** Vueltas máximas de herramientas por mensaje, para que un error no gire en falso. */
const MAX_VUELTAS = 5;

const TEXTO_SI_FALLA = "Uh, se me trabó algo. Ya le aviso a alguien del equipo para que te responda.";

/** Red de seguridad: deja el texto como lo muestra WhatsApp, aunque el modelo se escape del formato. */
export function paraWhatsApp(texto: string): string {
  return texto
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(b|strong)>/gi, "*")
    .replace(/<\/?[a-z][^>]*>/gi, "")
    .replace(/\*\*(.+?)\*\*/g, "*$1*")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, "$1: $2")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function responder(
  ficha: Ficha,
  historial: Turno[],
  mensaje: string,
  telefono: string,
  credencial?: string,
): Promise<Respuesta> {
  const ctx: ContextoHerramienta = { ficha, telefono, credencial };
  const herramientas = ficha.herramientas.map((nombre) => {
    const h = REGISTRO[nombre];
    if (!h) throw new Error(`Herramienta desconocida en la ficha ${ficha.id}: ${nombre}`);
    return h;
  });

  const mensajes: Anthropic.Beta.BetaMessageParam[] = [
    ...historial.slice(-MAX_TURNOS).map((t) => ({
      role: t.rol === "cliente" ? ("user" as const) : ("assistant" as const),
      content: t.texto,
    })),
    { role: "user", content: mensaje },
  ];

  const uso = { entrada: 0, salida: 0, cacheLeida: 0, cacheEscrita: 0, usd: 0 };
  const herramientasUsadas: string[] = [];
  let derivada: Respuesta["derivada"];
  const precio = PRECIOS[ficha.modelo] ?? PRECIOS["claude-opus-5-5"];

  // El prompt se arma una vez por mensaje; si la ficha tiene conocimiento en vivo, se lee antes (con caché).
  const prompt = armarPrompt(ficha, ficha.conocimiento?.url ? await leerConocimiento(ficha.conocimiento.url) : undefined);

  for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
    const r = await client.beta.messages.create({
      model: ficha.modelo,
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: ficha.esfuerzo },
      cache_control: { type: "ephemeral" },
      system: [{ type: "text", text: prompt, cache_control: { type: "ephemeral" } }],
      tools: herramientas.map((h) => h.definicion as Anthropic.Beta.BetaTool),
      messages: mensajes,
    });

    uso.entrada += r.usage.input_tokens;
    uso.salida += r.usage.output_tokens;
    uso.cacheLeida += r.usage.cache_read_input_tokens ?? 0;
    uso.cacheEscrita += r.usage.cache_creation_input_tokens ?? 0;
    uso.usd =
      (uso.entrada * precio[0] + uso.salida * precio[1] + uso.cacheLeida * precio[2] + uso.cacheEscrita * precio[3]) /
      1_000_000;

    if (r.stop_reason === "refusal") {
      return { texto: TEXTO_SI_FALLA, derivada: { motivo: "otro", resumen: "El modelo no pudo responder." }, herramientasUsadas, uso };
    }

    const llamadas = r.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (r.stop_reason !== "tool_use" || llamadas.length === 0) {
      const texto = r.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n");
      return { texto: paraWhatsApp(texto), derivada, herramientasUsadas, uso };
    }

    // Se devuelve el turno completo (con sus bloques de pensamiento) tal cual: el historial solo crece.
    mensajes.push({ role: "assistant", content: r.content });
    const resultados: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const llamada of llamadas) {
      herramientasUsadas.push(llamada.name);
      const entrada = (llamada.input ?? {}) as Record<string, unknown>;
      if (llamada.name === "derivar_a_persona") {
        derivada = { motivo: String(entrada.motivo ?? "otro"), resumen: String(entrada.resumen ?? "") };
      }
      try {
        const h = REGISTRO[llamada.name];
        if (!h || !ficha.herramientas.includes(llamada.name)) throw new Error("Herramienta no habilitada");
        resultados.push({ type: "tool_result", tool_use_id: llamada.id, content: await h.ejecutar(entrada, ctx) });
      } catch (e) {
        resultados.push({
          type: "tool_result",
          tool_use_id: llamada.id,
          is_error: true,
          content: `No se pudo consultar: ${(e as Error).message}. No inventes el dato: decí que ahora no lo podés ver y ofrecé el link de la web o derivá.`,
        });
      }
    }
    mensajes.push({ role: "user", content: resultados });
  }

  return { texto: TEXTO_SI_FALLA, derivada: { motivo: "otro", resumen: "El agente no llegó a una respuesta." }, herramientasUsadas, uso };
}
