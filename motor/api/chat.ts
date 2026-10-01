// Chat web para probar al agente sin WhatsApp (página en public/index.html).
// Protegido con CHAT_CLAVE: sin esa variable en Vercel, el chat está apagado.
import { atender } from "../src/atender.js";

export async function POST(request: Request): Promise<Response> {
  const clave = process.env.CHAT_CLAVE;
  let b: { clave?: string; sesion?: string; texto?: string };
  try {
    b = await request.json();
  } catch {
    return Response.json({ error: "Pedido inválido" }, { status: 400 });
  }
  if (!clave || b.clave !== clave) return Response.json({ error: "Clave incorrecta" }, { status: 403 });

  const sesion = String(b.sesion ?? "").replace(/[^a-z0-9]/gi, "").slice(0, 32);
  const texto = String(b.texto ?? "").trim().slice(0, 2000);
  if (!sesion || !texto) return Response.json({ error: "Falta el mensaje" }, { status: 400 });

  const respuestas: string[] = [];
  await atender(
    // En el chat web el "teléfono" es la sesión del navegador. "web-" la distingue de un número real.
    { phoneNumberId: "web", de: `web-${sesion}`, waId: `web-${sesion}-${Date.now()}`, texto },
    async (t) => {
      respuestas.push(t);
    },
  );
  return Response.json({ respuestas });
}
