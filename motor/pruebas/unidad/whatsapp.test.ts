// npm run unidad · avisos de Meta de ejemplo (formato de la documentación de WhatsApp Cloud API) y envíos simulados.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { leerAviso, firmaValida, enviarBotones, enviarPlantilla, enviarTexto, descargarMedia } from "../../src/whatsapp.js";

const aviso = (mensaje: Record<string, unknown>) => ({
  object: "whatsapp_business_account",
  entry: [{ id: "WABA", changes: [{ field: "messages", value: {
    messaging_product: "whatsapp",
    metadata: { display_phone_number: "5493760000000", phone_number_id: "PNID123" },
    contacts: [{ profile: { name: "Kiosco Prueba" }, wa_id: "5493764123456" }],
    messages: [{ from: "5493764123456", id: "wamid.X1", timestamp: "1760000000", ...mensaje }],
  } }] }],
});

test("texto: llega el texto, sin media", () => {
  const [m] = leerAviso(aviso({ type: "text", text: { body: "2 cajas de coca" } }));
  assert.equal(m.texto, "2 cajas de coca");
  assert.equal(m.phoneNumberId, "PNID123");
  assert.equal(m.de, "5493764123456");
  assert.equal(m.nombre, "Kiosco Prueba");
  assert.equal(m.media, undefined);
  assert.equal(m.noSoportado, undefined);
});

test("audio (nota de voz): media con id y mime; sigue marcado noSoportado para los agentes que no leen audios", () => {
  const [m] = leerAviso(aviso({ type: "audio", audio: { id: "MEDIA_AUDIO_1", mime_type: "audio/ogg; codecs=opus", voice: true } }));
  assert.deepEqual(m.media, { tipo: "audio", id: "MEDIA_AUDIO_1", mime: "audio/ogg; codecs=opus", voz: true });
  assert.equal(m.noSoportado, "audio");
  assert.equal(m.texto, "");
});

test("foto con epígrafe: media con el texto que escribió", () => {
  const [m] = leerAviso(aviso({ type: "image", image: { id: "MEDIA_IMG_1", mime_type: "image/jpeg", sha256: "x", caption: "lo de siempre" } }));
  assert.deepEqual(m.media, { tipo: "image", id: "MEDIA_IMG_1", mime: "image/jpeg", epigrafe: "lo de siempre" });
  assert.equal(m.texto, "lo de siempre");
  assert.equal(m.noSoportado, "image");
});

test("botón de respuesta rápida y botón de plantilla: llegan como texto", () => {
  const [a] = leerAviso(aviso({ type: "interactive", interactive: { type: "button_reply", button_reply: { id: "si", title: "Sí" } } }));
  assert.equal(a.texto, "Sí");
  const [b] = leerAviso(aviso({ type: "button", button: { payload: "BAJA", text: "No quiero más avisos" } }));
  assert.equal(b.texto, "No quiero más avisos");
});

test("sticker: no soportado y sin media", () => {
  const [m] = leerAviso(aviso({ type: "sticker", sticker: { id: "S1", mime_type: "image/webp" } }));
  assert.equal(m.noSoportado, "sticker");
  assert.equal(m.media, undefined);
});

test("avisos de estado (entregado, leído): no son mensajes", () => {
  const estado = { entry: [{ changes: [{ value: { metadata: { phone_number_id: "PNID123" }, statuses: [{ id: "wamid.X1", status: "read" }] } }] }] };
  assert.deepEqual(leerAviso(estado), []);
});

test("firmaValida: la buena pasa; firma mala, sin prefijo o vacía → false", () => {
  const cuerpo = JSON.stringify(aviso({ type: "text", text: { body: "hola" } }));
  const buena = "sha256=" + createHmac("sha256", "secreto").update(cuerpo, "utf8").digest("hex");
  assert.equal(firmaValida(cuerpo, buena, "secreto"), true);
  assert.equal(firmaValida(cuerpo, buena, "otro-secreto"), false);
  assert.equal(firmaValida(cuerpo + " ", buena, "secreto"), false);
  assert.equal(firmaValida(cuerpo, "sha256=" + "0".repeat(64), "secreto"), false);
  assert.equal(firmaValida(cuerpo, buena.slice(7), "secreto"), false);
  assert.equal(firmaValida(cuerpo, null, "secreto"), false);
});

// Con WHATSAPP_SIMULAR=1 nada sale: se imprime
test("envíos simulados: texto, botones (1 a 3, hasta 20 letras) y plantilla", async () => {
  process.env.WHATSAPP_SIMULAR = "1";
  const impreso: string[] = [];
  const log = console.log;
  console.log = (...a: unknown[]) => { impreso.push(a.join(" ")); };
  try {
    await enviarTexto("PNID123", "5493764123456", "Hola");
    await enviarBotones("PNID123", "5493764123456", "¿Es la factura 12?", [{ id: "si", titulo: "Sí" }, { id: "no", titulo: "No" }, { id: "otra", titulo: "Es otra cosa" }]);
    await enviarPlantilla("PNID123", "5493764123456", "aviso_vencimiento", "es_AR", ["Kiosco Prueba", "0001-00012", "$ 84.000", "20/10", "https://link"]);
  } finally { console.log = log; }
  assert.equal(impreso.length, 3);
  assert.match(impreso[1], /\[Sí\] \[No\] \[Es otra cosa\]/);
  assert.match(impreso[2], /plantilla aviso_vencimiento \(es_AR\): Kiosco Prueba \| 0001-00012/);
  await assert.rejects(enviarBotones("P", "5493764123456", "x", []), /de 1 a 3/);
  await assert.rejects(enviarBotones("P", "5493764123456", "x", [1, 2, 3, 4].map(n => ({ id: String(n), titulo: "B" + n }))), /de 1 a 3/);
  await assert.rejects(enviarBotones("P", "5493764123456", "x", [{ id: "l", titulo: "Un botón con más de veinte letras" }]), /entre 1 y 20/);
  await assert.rejects(enviarPlantilla("P", "5493764123456", "Aviso Con Espacios", "es_AR", []), /inválido/);
});

test("envío real (fetch simulado): botones van como interactive; el 549 se reintenta sin el 9 si Meta no lo reconoce", async () => {
  delete process.env.WHATSAPP_SIMULAR;
  process.env.WHATSAPP_TOKEN = "token-de-prueba";
  const pedidos: any[] = [];
  const fetchViejo = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: any) => {
    const cuerpo = JSON.parse(init.body);
    pedidos.push({ url, cuerpo });
    if (cuerpo.to === "5493764123456") return new Response(JSON.stringify({ error: { code: 131030 } }), { status: 400 });
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  try {
    await enviarBotones("PNID123", "5493764123456", "¿Confirmo?", [{ id: "si", titulo: "Sí" }]);
  } finally { globalThis.fetch = fetchViejo; }
  assert.equal(pedidos.length, 2);
  assert.match(pedidos[0].url, /\/PNID123\/messages$/);
  assert.equal(pedidos[0].cuerpo.type, "interactive");
  assert.deepEqual(pedidos[0].cuerpo.interactive.action.buttons, [{ type: "reply", reply: { id: "si", title: "Sí" } }]);
  assert.equal(pedidos[1].cuerpo.to, "543764123456");
});

test("descargarMedia (fetch simulado): pide la dirección y después el archivo, los dos con el token; no escribe a disco", async () => {
  process.env.WHATSAPP_TOKEN = "token-de-prueba";
  const llamadas: { url: string; auth: string }[] = [];
  const fetchViejo = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: any) => {
    llamadas.push({ url, auth: init?.headers?.authorization });
    if (url.includes("MEDIA_AUDIO_1")) return new Response(JSON.stringify({ url: "https://lookaside.example/archivo", mime_type: "audio/ogg" }), { status: 200 });
    return new Response(new Uint8Array([1, 2, 3, 4]), { status: 200 });
  }) as typeof fetch;
  let r;
  try { r = await descargarMedia("MEDIA_AUDIO_1"); } finally { globalThis.fetch = fetchViejo; }
  assert.equal(r.bytes, 4);
  assert.equal(r.mime, "audio/ogg");
  assert.equal(llamadas.length, 2);
  assert.ok(llamadas.every(l => l.auth === "Bearer token-de-prueba"));
});
