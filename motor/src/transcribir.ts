// Audio → texto con un servicio compatible con la API de OpenAI (Groq whisper-large-v3 por defecto; OpenAI de respaldo).
// Variables: TRANSCRIPCION_URL (por defecto https://api.groq.com/openai/v1), TRANSCRIPCION_MODELO (whisper-large-v3), TRANSCRIPCION_CLAVE.
// El audio queda en memoria: nunca se escribe a disco. Más de 2 minutos no se transcribe: el agente pide que lo escriban.

export const MAX_SEGUNDOS = 120;
// Una nota de voz de WhatsApp (opus) usa ~16 kbit/s: con 32 kbit/s de margen, 2 minutos son ~480 KB.
// Se mira antes de mandar el audio (así uno muy largo no se paga); la duración real se vuelve a mirar en la respuesta.
export const MAX_BYTES = Math.round((MAX_SEGUNDOS * 32000) / 8);

export interface Transcripcion {
  texto: string;
  /** Entre 0 y 1: e^(promedio de avg_logprob de los segmentos). null si el servicio no lo informa. */
  confianza: number | null;
  /** Duración del audio, si el servicio la informa. */
  segundos: number | null;
  /** true = pasa de 2 minutos: no se transcribió (texto vacío). */
  largo?: boolean;
  /** true = no se escuchó a nadie hablar (texto vacío): el agente pide que lo repitan. */
  silencio?: boolean;
}

// Con un audio sin voz, Whisper a veces inventa palabras (probado el 17/10: 5 s de silencio → "el arroz de pollo").
// Un segmento es silencio si el modelo duda de que haya voz y además está poco seguro de lo que escribió.
export const esSilencio = (s: any) => Number(s?.no_speech_prob) > 0.5 && Number(s?.avg_logprob) < -1;

const EXTENSION: Record<string, string> = { "audio/ogg": "ogg", "audio/opus": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/aac": "m4a", "audio/amr": "amr", "audio/wav": "wav", "audio/webm": "webm" };

/** Confianza 0–1 a partir de los segmentos de Whisper (verbose_json). */
export function confianzaDe(segmentos: unknown): number | null {
  if (!Array.isArray(segmentos)) return null;
  const v = segmentos.map((s: any) => Number(s?.avg_logprob)).filter(Number.isFinite);
  if (!v.length) return null;
  const promedio = v.reduce((a, b) => a + b, 0) / v.length;
  return Math.round(Math.exp(Math.min(0, promedio)) * 1000) / 1000;
}

/**
 * Transcribe un audio. `prompt` ayuda con palabras propias del negocio (hasta 200: alias de productos, marcas).
 */
export async function transcribir(audio: ArrayBuffer, mime: string, opciones: { prompt?: string } = {}): Promise<Transcripcion> {
  if (audio.byteLength > MAX_BYTES) return { texto: "", confianza: null, segundos: null, largo: true };
  const clave = process.env.TRANSCRIPCION_CLAVE;
  if (!clave) throw new Error("Falta TRANSCRIPCION_CLAVE");
  const url = (process.env.TRANSCRIPCION_URL || "https://api.groq.com/openai/v1").replace(/\/$/, "");
  const tipo = (mime || "audio/ogg").split(";")[0].trim().toLowerCase();

  const form = new FormData();
  form.append("file", new Blob([audio], { type: tipo }), `audio.${EXTENSION[tipo] ?? "ogg"}`);
  form.append("model", process.env.TRANSCRIPCION_MODELO || "whisper-large-v3");
  form.append("language", "es");
  form.append("response_format", "verbose_json");
  form.append("temperature", "0");
  const prompt = (opciones.prompt ?? "").split(/\s+/).filter(Boolean).slice(0, 200).join(" ");
  if (prompt) form.append("prompt", prompt);

  const r = await fetch(`${url}/audio/transcriptions`, { method: "POST", headers: { authorization: `Bearer ${clave}` }, body: form, signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw new Error(`La transcripción respondió ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const d: any = await r.json();
  const segundos = Number.isFinite(Number(d?.duration)) ? Number(d.duration) : null;
  if (segundos !== null && segundos > MAX_SEGUNDOS) return { texto: "", confianza: null, segundos, largo: true };
  const segmentos = Array.isArray(d?.segments) ? d.segments : null;
  if (segmentos) {
    const conVoz = segmentos.filter((s: any) => !esSilencio(s));
    if (!conVoz.length) return { texto: "", confianza: null, segundos, silencio: true };
    if (conVoz.length < segmentos.length) return { texto: conVoz.map((s: any) => String(s.text ?? "")).join("").trim(), confianza: confianzaDe(conVoz), segundos };
  }
  return { texto: String(d?.text ?? "").trim(), confianza: confianzaDe(segmentos), segundos };
}
