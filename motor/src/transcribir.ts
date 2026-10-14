// Notas de voz → texto. Claude no recibe audio, así que se transcribe antes con un servicio de transcripción
// compatible con /audio/transcriptions (OpenAI o Groq). Se configura con variables de entorno:
//   TRANSCRIPCION_CLAVE   la clave del servicio (sin ella, los audios no se transcriben)
//   TRANSCRIPCION_URL     por defecto OpenAI; Groq: https://api.groq.com/openai/v1/audio/transcriptions
//   TRANSCRIPCION_MODELO  por defecto whisper-1; Groq: whisper-large-v3-turbo

/** Audios más grandes que esto no se transcriben (unos 10 minutos de nota de voz de WhatsApp). */
export const MAX_BYTES_AUDIO = 4 * 1024 * 1024;

export function transcripcionConfigurada(): boolean {
  return !!process.env.TRANSCRIPCION_CLAVE;
}

/** El servicio deduce el formato por la extensión del archivo. */
function extension(tipo: string): string {
  if (tipo.includes("ogg") || tipo.includes("opus")) return "ogg";
  if (tipo.includes("webm")) return "webm";
  if (tipo.includes("mp4") || tipo.includes("m4a") || tipo.includes("aac")) return "m4a";
  if (tipo.includes("mpeg") || tipo.includes("mp3")) return "mp3";
  if (tipo.includes("wav")) return "wav";
  return "ogg";
}

/**
 * Transcribe un audio en español. `vocabulario` son palabras del negocio (equipos, materiales, nombres)
 * para que el servicio las escriba bien.
 */
export async function transcribir(audio: Blob, vocabulario = ""): Promise<string> {
  const clave = process.env.TRANSCRIPCION_CLAVE;
  if (!clave) throw new Error("Falta TRANSCRIPCION_CLAVE");
  if (audio.size > MAX_BYTES_AUDIO) throw new Error(`Audio demasiado largo (${Math.round(audio.size / 1024)} KB)`);
  const form = new FormData();
  form.append("file", audio, `audio.${extension(audio.type)}`);
  form.append("model", process.env.TRANSCRIPCION_MODELO || "whisper-1");
  form.append("language", "es");
  form.append("response_format", "json");
  if (vocabulario) form.append("prompt", vocabulario);
  const r = await fetch(process.env.TRANSCRIPCION_URL || "https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { authorization: `Bearer ${clave}` },
    body: form,
    signal: AbortSignal.timeout(45_000),
  });
  if (!r.ok) throw new Error(`Transcripción respondió ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const texto = String(((await r.json()) as { text?: string }).text ?? "").trim();
  if (!texto) throw new Error("La transcripción vino vacía");
  return texto;
}
