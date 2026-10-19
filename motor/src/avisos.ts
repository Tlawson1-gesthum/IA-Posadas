// Avisos al equipo del cliente (por ahora, de Instagram): una charla que pasó a una persona, una pieza para subir a mano,
// una publicación que falló. Siempre quedan como evento "instagram" en las alertas del panel del motor.
// Además, si están cargadas, salen por mail (RESEND_API_KEY + AVISOS_DESDE + AVISOS_MAIL_<FICHA>) o a un webhook (AVISOS_WEBHOOK).
import { obtenerAlmacen } from "./almacen.js";

export async function avisarEquipo(fichaId: string, conversacionId: string | null, titulo: string, detalle: string): Promise<void> {
  const texto = `${titulo}: ${detalle}`.slice(0, 1000);
  await obtenerAlmacen().evento(fichaId, conversacionId, "instagram", texto);

  const envios: Promise<unknown>[] = [];
  const mail = process.env[`AVISOS_MAIL_${fichaId.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`];
  if (process.env.RESEND_API_KEY && process.env.AVISOS_DESDE && mail) {
    envios.push(
      fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
        body: JSON.stringify({ from: process.env.AVISOS_DESDE, to: mail.split(",").map((m) => m.trim()), subject: `[${fichaId}] ${titulo}`, text: texto }),
        signal: AbortSignal.timeout(10000),
      }),
    );
  }
  if (process.env.AVISOS_WEBHOOK) {
    envios.push(
      fetch(process.env.AVISOS_WEBHOOK, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ficha: fichaId, titulo, detalle, conversacion: conversacionId }),
        signal: AbortSignal.timeout(10000),
      }),
    );
  }
  // Un aviso que no sale no corta lo demás: el evento ya quedó en el panel.
  for (const r of await Promise.allSettled(envios)) if (r.status === "rejected") console.error("No salió un aviso", r.reason);
}
