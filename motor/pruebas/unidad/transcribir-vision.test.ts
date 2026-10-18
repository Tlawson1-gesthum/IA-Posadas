// npm run unidad · transcripción (fetch simulado: no se gasta) y normalización de la lectura de una foto.
import { test } from "node:test";
import assert from "node:assert/strict";
import { transcribir, confianzaDe, MAX_BYTES } from "../../src/transcribir.js";
import { normalizarLista, leerListaEnFoto } from "../../src/vision.js";

test("confianza: e^(promedio de avg_logprob); sin segmentos → null", () => {
  assert.equal(confianzaDe([{ avg_logprob: -0.1 }, { avg_logprob: -0.3 }]), Math.round(Math.exp(-0.2) * 1000) / 1000);
  assert.equal(confianzaDe([]), null);
  assert.equal(confianzaDe(undefined), null);
});

test("transcribir: manda modelo, idioma, verbose_json y el prompt de alias (hasta 200 palabras)", async () => {
  process.env.TRANSCRIPCION_CLAVE = "clave-de-prueba";
  delete process.env.TRANSCRIPCION_URL;
  delete process.env.TRANSCRIPCION_MODELO;
  let visto: { url: string; auth: string; form: FormData } | null = null;
  const fetchViejo = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: any) => {
    visto = { url, auth: init.headers.authorization, form: init.body };
    return new Response(JSON.stringify({ text: " dos cajas de coca grande ", duration: 6.2, segments: [{ avg_logprob: -0.05 }, { avg_logprob: -0.15 }] }), { status: 200 });
  }) as typeof fetch;
  let r;
  try { r = await transcribir(new Uint8Array(2000).buffer, "audio/ogg; codecs=opus", { prompt: Array(300).fill("coca").join(" ") }); }
  finally { globalThis.fetch = fetchViejo; }
  assert.equal(r.texto, "dos cajas de coca grande");
  assert.equal(r.segundos, 6.2);
  assert.ok(r.confianza! > 0.9 && r.confianza! < 1);
  assert.equal(visto!.url, "https://api.groq.com/openai/v1/audio/transcriptions");
  assert.equal(visto!.auth, "Bearer clave-de-prueba");
  assert.equal(visto!.form.get("model"), "whisper-large-v3");
  assert.equal(visto!.form.get("language"), "es");
  assert.equal(visto!.form.get("response_format"), "verbose_json");
  assert.equal(String(visto!.form.get("prompt")).split(" ").length, 200);
  assert.equal((visto!.form.get("file") as File).name, "audio.ogg");
});

test("transcribir: más de 2 minutos no se transcribe (por tamaño, sin llamar; o por la duración que informa)", async () => {
  process.env.TRANSCRIPCION_CLAVE = "clave-de-prueba";
  let llamadas = 0;
  const fetchViejo = globalThis.fetch;
  globalThis.fetch = (async () => { llamadas++; return new Response(JSON.stringify({ text: "algo", duration: 130 }), { status: 200 }); }) as typeof fetch;
  try {
    const grande = await transcribir(new Uint8Array(MAX_BYTES + 1).buffer, "audio/ogg");
    assert.equal(grande.largo, true);
    assert.equal(llamadas, 0);
    const largo = await transcribir(new Uint8Array(1000).buffer, "audio/ogg");
    assert.equal(largo.largo, true);
    assert.equal(largo.texto, "");
  } finally { globalThis.fetch = fetchViejo; }
});

test("transcribir: un audio en silencio no devuelve palabras inventadas (caso real del 17/10)", async () => {
  process.env.TRANSCRIPCION_CLAVE = "clave-de-prueba";
  const fetchViejo = globalThis.fetch;
  const responde = (segments: unknown[]) => { globalThis.fetch = (async () => new Response(JSON.stringify({ text: segments.map((s: any) => s.text).join(""), duration: 5.7, segments }), { status: 200 })) as typeof fetch; };
  try {
    responde([{ text: " el arroz de pollo", avg_logprob: -1.42, no_speech_prob: 0.538 }]);
    const r = await transcribir(new Uint8Array(1000).buffer, "audio/ogg");
    assert.deepEqual([r.texto, r.silencio, r.confianza], ["", true, null]);
    responde([{ text: " dos cajas de agua", avg_logprob: -0.15, no_speech_prob: 0.006 }, { text: " gracias", avg_logprob: -1.3, no_speech_prob: 0.7 }]);
    const r2 = await transcribir(new Uint8Array(1000).buffer, "audio/ogg");
    assert.equal(r2.texto, "dos cajas de agua");
    assert.equal(r2.silencio, undefined);
  } finally { globalThis.fetch = fetchViejo; }
});

test("transcribir: sin clave avisa; si el servicio falla, error con el estado", async () => {
  delete process.env.TRANSCRIPCION_CLAVE;
  await assert.rejects(transcribir(new Uint8Array(10).buffer, "audio/ogg"), /TRANSCRIPCION_CLAVE/);
  process.env.TRANSCRIPCION_CLAVE = "x";
  const fetchViejo = globalThis.fetch;
  globalThis.fetch = (async () => new Response("formato no soportado", { status: 400 })) as typeof fetch;
  try { await assert.rejects(transcribir(new Uint8Array(10).buffer, "audio/ogg"), /respondió 400/); }
  finally { globalThis.fetch = fetchViejo; }
});

const CATALOGO = [{ id: 1, nombre: "Coca-Cola 2,25 L", alias: ["coca grande"] }, { id: 2, nombre: "Agua 1,5 L" }];

test("foto: ids que no están en el catálogo se descartan con duda; cantidades raras quedan en null", () => {
  const r = normalizarLista({ legible: true, problema: null, renglones: [
    { texto: "2 coca grande", producto_id: 1, cantidad: 2, duda: null },
    { texto: "3 fernet", producto_id: 99, cantidad: 3, duda: null },
    { texto: "agua", producto_id: 2, cantidad: -4, duda: null },
    { texto: "", producto_id: null, cantidad: null, duda: null },
  ] }, CATALOGO);
  assert.equal(r.legible, true);
  assert.equal(r.renglones.length, 3);
  assert.deepEqual(r.renglones[0], { texto: "2 coca grande", producto_id: 1, cantidad: 2, duda: null });
  assert.equal(r.renglones[1].producto_id, null);
  assert.match(r.renglones[1].duda!, /no está en el catálogo/);
  assert.equal(r.renglones[2].cantidad, null);
  assert.match(r.renglones[2].duda!, /cantidad/);
});

test("foto ilegible o que no es una lista: legible false con el problema", () => {
  assert.deepEqual(normalizarLista({ legible: false, problema: "Es una foto de un perro.", renglones: [] }, CATALOGO), { legible: false, problema: "Es una foto de un perro.", renglones: [] });
  assert.equal(normalizarLista(null, CATALOGO).legible, false);
});

test("foto simulada (VISION_SIMULAR=1) y archivo que no es imagen", async () => {
  process.env.VISION_SIMULAR = "1";
  const r = await leerListaEnFoto(new Uint8Array(10).buffer, "image/jpeg", CATALOGO, { modelo: "claude-opus-5-5" });
  assert.equal(r.renglones.length, 2);
  delete process.env.VISION_SIMULAR;
  const pdf = await leerListaEnFoto(new Uint8Array(10).buffer, "application/pdf", CATALOGO, { modelo: "claude-opus-5-5" });
  assert.equal(pdf.legible, false);
});
