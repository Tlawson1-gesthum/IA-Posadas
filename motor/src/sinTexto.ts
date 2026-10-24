// Qué se contesta cuando llega algo que no es texto (WhatsApp e Instagram). Textos fijos, sin IA y sin decir que responde
// un programa: lo que lee el cliente nunca menciona la IA y siempre cierra agradeciendo.
// Regla: si la persona pide algo (audio, foto, archivo), se le pide con amabilidad que lo escriba. Si solo comparte,
// reacciona o manda un sticker, no se contesta (queda guardado para que lo vea el equipo), salvo cuando nos menciona o
// nos elogia: ahí, un agradecimiento corto.

export const SIN_TEXTO = {
  audio: "¡Hola! Por acá no podemos escuchar audios. ¿Nos lo escribís en un mensaje? ¡Gracias!",
  adjunto: "¡Hola! Por acá no podemos abrir fotos, videos ni archivos. Si nos querés consultar algo, ¿nos lo escribís en un mensaje? ¡Gracias!",
  agradecer: "¡Qué lindo que te guste lo que hacemos! Muchas gracias 💚",
} as const;

/** Tipo que llega en noSoportado (WhatsApp: m.type; Instagram: el tipo del adjunto o "agradecer") → respuesta fija o null (no contestar). */
export function respuestaSinTexto(tipo: string | undefined): string | null {
  switch (tipo) {
    case "audio":
    case "voice":
      return SIN_TEXTO.audio;
    case "image":
    case "video":
    case "file":
    case "document":
      return SIN_TEXTO.adjunto;
    case "agradecer":
      return SIN_TEXTO.agradecer;
    default:
      // Stickers, reacciones, corazones, publicaciones compartidas sin texto, contactos y tipos nuevos de Meta: no se contesta.
      return null;
  }
}

/** Para no repetir la misma respuesta fija si la persona manda varias fotos o audios seguidos. */
export const REPETIR_SIN_TEXTO_MS = 6 * 3600_000;
