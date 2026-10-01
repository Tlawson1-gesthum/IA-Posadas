// Prueba el webhook sin Meta ni Vercel: arma avisos firmados como los manda Meta y muestra qué contestaría.
// Uso: npm run webhook-local
import "./entorno.js";
import { createHmac } from "node:crypto";

process.env.WHATSAPP_SIMULAR = "1";
process.env.WHATSAPP_VERIFY_TOKEN ??= "token-de-prueba";
process.env.META_APP_SECRET ??= "secreto-de-prueba";
process.env.FICHA_POR_DEFECTO ??= "morfa";
process.env.ADMIN_TELEFONOS ??= "5493760000000";

const { GET, POST } = await import("../api/whatsapp.js");
const URL_BASE = "https://motor.local/api/whatsapp";

const v = await GET(new Request(`${URL_BASE}?hub.mode=subscribe&hub.verify_token=${process.env.WHATSAPP_VERIFY_TOKEN}&hub.challenge=12345`));
console.log("Verificación de Meta (token bien):", v.status, await v.text());
console.log("Verificación de Meta (token mal):", (await GET(new Request(`${URL_BASE}?hub.mode=subscribe&hub.verify_token=x&hub.challenge=1`))).status);

let n = 0;
function aviso(mensaje: object) {
  return {
    object: "whatsapp_business_account",
    entry: [{ changes: [{ field: "messages", value: {
      metadata: { phone_number_id: "000000" },
      contacts: [{ wa_id: "5493760000000", profile: { name: "Cliente de prueba" } }],
      messages: [{ from: "5493760000000", id: `wamid.prueba${++n}`, timestamp: "0", ...mensaje }],
    } }] }],
  };
}

async function mandar(cuerpo: object, firmar = true) {
  const texto = JSON.stringify(cuerpo);
  const firma = "sha256=" + createHmac("sha256", process.env.META_APP_SECRET!).update(texto).digest("hex");
  const r = await POST(new Request(URL_BASE, { method: "POST", body: texto, headers: firmar ? { "x-hub-signature-256": firma } : {} }));
  return r.status;
}

console.log("Aviso sin firma:", await mandar(aviso({ type: "text", text: { body: "hola" } }), false));
const mensajes = [
  aviso({ type: "text", text: { body: "hola" } }),
  aviso({ type: "text", text: { body: "/reiniciar" } }),
  aviso({ type: "location", location: { latitude: -27.37, longitude: -55.9 } }),
  aviso({ type: "audio", audio: { id: "1" } }),
];
for (const m of mensajes) {
  console.log(`\nCliente → ${JSON.stringify((m.entry[0].changes[0].value.messages[0] as any).text ?? (m.entry[0].changes[0].value.messages[0] as any).type)}`);
  console.log("Respuesta HTTP a Meta:", await mandar(m));
  await new Promise((r) => setTimeout(r, 4000 + (process.env.ANTHROPIC_API_KEY ? 20000 : 0)));
}
console.log("\nReenvío del mismo aviso (no debe contestar dos veces):", await mandar(mensajes[0]));
await new Promise((r) => setTimeout(r, 2000));
