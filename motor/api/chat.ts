// Chat web para probar un agente sin WhatsApp (página en public/index.html).
//   ?ficha=<id>      → prueba la ficha publicada. Pide CHAT_CLAVE o una sesión del panel.
//   ?borrador=1      → prueba los cambios sin publicar. Solo con sesión del panel.
import { atender } from "../src/atender.js";
import { cargarFicha } from "../src/fichas.js";
import { sesionValida } from "../src/sesion.js";

export async function POST(request: Request): Promise<Response> {
  let b: { clave?: string; sesion?: string; texto?: string; ficha?: string; borrador?: boolean };
  try {
    b = await request.json();
  } catch {
    return Response.json({ error: "Pedido inválido" }, { status: 400 });
  }
  const delPanel = sesionValida(request);
  const claveOk = !!process.env.CHAT_CLAVE && b.clave === process.env.CHAT_CLAVE;
  if (!delPanel && !claveOk) return Response.json({ error: "Clave incorrecta" }, { status: 403 });
  if (b.borrador && !delPanel) return Response.json({ error: "Para probar un borrador, entrá al panel" }, { status: 403 });

  const sesion = String(b.sesion ?? "").replace(/[^a-z0-9]/gi, "").slice(0, 32);
  const texto = String(b.texto ?? "").trim().slice(0, 2000);
  if (!sesion || !texto) return Response.json({ error: "Falta el mensaje" }, { status: 400 });

  const fichaId = String(b.ficha || process.env.FICHA_POR_DEFECTO || "");
  let ficha;
  try {
    ficha = await cargarFicha(fichaId, !!b.borrador);
  } catch {
    return Response.json({ error: `No existe la ficha "${fichaId}"` }, { status: 404 });
  }
  // Al probar un borrador, el agente responde aunque la ficha esté pausada (para probar antes de activar).
  if (b.borrador) ficha = { ...ficha, estado: "activo" as const };

  const respuestas: string[] = [];
  await atender(
    // En el chat web el "teléfono" es la sesión del navegador. "web-" la distingue de un número real.
    { phoneNumberId: "web", de: `web-${b.borrador ? "b" : ""}${sesion}`, waId: `web-${sesion}-${Date.now()}`, texto },
    {
      ficha,
      enviar: async (t) => {
        respuestas.push(t);
      },
    },
  );
  return Response.json({ respuestas, ficha: { id: ficha.id, nombre: ficha.nombre, agente: ficha.datos?.nombre_agente } });
}
