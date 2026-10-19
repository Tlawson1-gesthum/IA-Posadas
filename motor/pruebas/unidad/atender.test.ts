// npm run unidad · mensajes seguidos, pedido en armado, wa_id repetido y retención (paso 16). Sin Claude ni Supabase: almacén en memoria
// con las fichas de fichas/ y un cerebro de prueba que cuenta cuántas veces se llama y cuántos pedidos cargaría.
import { test } from "node:test";
import assert from "node:assert/strict";

delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
const { atender } = await import("../../src/atender.js");
const { cargarFicha, fichaPorNumero } = await import("../../src/fichas.js");
const { obtenerAlmacen, podarConversaciones, TEXTO_PODADO } = await import("../../src/almacen.js");

const distri = await cargarFicha("distri-demo");
const morfa = await cargarFicha("morfa");
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));
let n = 0;
const msj = (de: string, texto: string, waId = `wamid.prueba.${++n}`) => ({ phoneNumberId: "PNID-PRUEBA", de, waId, texto });

// Cerebro de prueba: cada llamada "carga" un pedido con el id del mensaje que le pasan (como crear_pedido_borrador)
function cerebroDePrueba() {
  const llamadas: { texto: string; meta?: { id?: string; texto?: string } }[] = [];
  const cerebro = async (_f: unknown, _h: unknown, texto: string, _t: string, _c?: string, meta?: { id?: string; texto?: string }) => {
    llamadas.push({ texto, meta });
    return { texto: "Listo", herramientasUsadas: ["crear_pedido_borrador"], uso: { entrada: 0, salida: 0, cacheLeida: 0, cacheEscrita: 0, usd: 0 } };
  };
  return { llamadas, cerebro: cerebro as any };
}

test("tres mensajes de texto seguidos → una sola respuesta y una sola carga del pedido (P4)", async () => {
  const { llamadas, cerebro } = cerebroDePrueba();
  const enviados: string[] = [];
  const enviar = async (t: string) => { enviados.push(t); };
  const tel = "5493761110001";
  const op = { ficha: distri, cerebro, enviar, esperaMs: 200 };
  await Promise.all([
    atender(msj(tel, "Mandame 2 cajas de coca grande"), op),
    espera(30).then(() => atender(msj(tel, "y una de yerba"), op)),
    espera(60).then(() => atender(msj(tel, "y 3 aguas"), op)),
  ]);
  assert.equal(llamadas.length, 1, "el agente responde una sola vez");
  assert.equal(llamadas[0].texto, "Mandame 2 cajas de coca grande\ny una de yerba\ny 3 aguas");
  assert.equal(enviados.length, 1);
  assert.equal(llamadas.filter((l) => l.meta?.id).length, 1, "a lo sumo un crear_pedido_borrador");
});

test("mensajes de la misma intención dentro de 5 minutos comparten el id del pedido (mismo mensaje_id → mismo pedido)", async () => {
  const { llamadas, cerebro } = cerebroDePrueba();
  const tel = "5493761110002";
  const op = { ficha: distri, cerebro, enviar: async () => {}, esperaMs: 10 };
  const primero = msj(tel, "Quiero 5 cajas de agua");
  await atender(primero, op);
  await atender(msj(tel, "Sí, confirmalo"), op);
  await atender(msj(tel, "dale, confirmalo"), op);
  assert.equal(llamadas.length, 3);
  assert.ok(llamadas.every((l) => l.meta?.id === primero.waId), "los tres turnos cargan con el mismo id");
  assert.match(llamadas[2].meta!.texto!, /Quiero 5 cajas de agua[\s\S]*dale, confirmalo/, "el texto original junta todo el pedido");
  // pasada la ventana, una intención nueva tiene otro id
  const a = await obtenerAlmacen().armado(distri.id, tel);
  await obtenerAlmacen().guardarArmado(distri.id, tel, a!.mensajes, new Date(Date.now() - 1000));
  const nuevo = msj(tel, "Otro pedido: 2 de yerba");
  await atender(nuevo, op);
  assert.equal(llamadas[3].meta?.id, nuevo.waId);
});

test("el mismo wa_id dos veces (Meta reintenta) → una sola respuesta", async () => {
  const { llamadas, cerebro } = cerebroDePrueba();
  const enviados: string[] = [];
  const tel = "5493761110003";
  const op = { ficha: distri, cerebro, enviar: async (t: string) => { enviados.push(t); }, esperaMs: 10 };
  const m = msj(tel, "Hola, quiero hacer un pedido");
  await atender(m, op);
  await atender({ ...m }, op);
  assert.equal(llamadas.length, 1);
  assert.equal(enviados.length, 1);
});

test("MORFA (gastronomía) sigue igual: no espera, no junta, no guarda retención", async () => {
  const { llamadas, cerebro } = cerebroDePrueba();
  const tel = "5493761110004";
  const t0 = Date.now();
  await atender(msj(tel, "Hola"), { ficha: morfa, cerebro, enviar: async () => {}, esperaMs: 5000 });
  assert.ok(Date.now() - t0 < 2000, "no esperó");
  assert.equal(llamadas.length, 1);
  assert.equal(llamadas[0].meta, undefined);
  assert.equal(await podarConversaciones(new Date(Date.now() + 1000 * 86400_000)) >= 0, true);
  const c = await obtenerAlmacen().buscarConversacion(morfa.id, tel);
  assert.ok(c, "la charla de MORFA no se poda");
});

test("retención: vencido el plazo, la charla pierde el texto y el teléfono", async () => {
  const { cerebro } = cerebroDePrueba();
  const tel = "5493761110005";
  await atender(msj(tel, "Mi dirección es Calle Falsa 123"), { ficha: distri, cerebro, enviar: async () => {}, esperaMs: 10 });
  const almacen = obtenerAlmacen();
  const conv = await almacen.buscarConversacion(distri.id, tel);
  assert.ok(conv);
  assert.equal(await podarConversaciones(new Date()), 0, "a los 90 días todavía no venció");
  const podadas = await podarConversaciones(new Date(Date.now() + 91 * 86400_000));
  assert.ok(podadas >= 1);
  const textos = (await almacen.mensajes(conv!.id)).map((x) => x.texto);
  assert.ok(textos.length && textos.every((t) => t === TEXTO_PODADO));
  assert.equal(await almacen.buscarConversacion(distri.id, tel), null, "el teléfono ya no está");
});

test("FICHA_POR_DEFECTO solo si hay una sola ficha con número", async () => {
  const almacen = obtenerAlmacen();
  process.env.FICHA_POR_DEFECTO = "morfa";
  const con = (await almacen.listarFichas()).filter((f) => f.whatsapp_phone_number_id).length;
  if (con === 0) await almacen.actualizarFicha("morfa", { whatsapp_phone_number_id: "PNID-MORFA" });
  assert.equal((await fichaPorNumero("PNID-DESCONOCIDO"))?.id, "morfa", "con una sola ficha con número, la por defecto atiende");
  await almacen.actualizarFicha("distri-demo", { whatsapp_phone_number_id: "PNID-DISTRI" });
  assert.equal(await fichaPorNumero("PNID-DESCONOCIDO"), null, "con dos, un número desconocido no cae en ninguna");
  assert.equal((await fichaPorNumero("PNID-DISTRI"))?.id, "distri-demo");
  delete process.env.FICHA_POR_DEFECTO;
});

test("BAJA (paso 22): respuesta fija sin pasar por Claude; otro texto con 'baja' sigue al agente", async () => {
  const { AVISO_BAJA } = await import("../../src/atender.js");
  const { llamadas, cerebro } = cerebroDePrueba();
  const enviados: string[] = [];
  // ficha de prueba sin sistema real (crear_pedidos false): la baja se hace de cuenta, sin red
  const ficha = { ...distri, integracion: { ...distri.integracion!, crear_pedidos: false } };
  const op = { ficha, cerebro, enviar: async (t: string) => { enviados.push(t); }, esperaMs: 0 };
  await atender(msj("5493761110099", "BAJA"), op);
  assert.deepEqual(enviados, [AVISO_BAJA]);
  assert.equal(llamadas.length, 0, "no llama a Claude");
  await atender(msj("5493761110099", "la lavandina está en baja?"), op);
  assert.equal(llamadas.length, 1, "un mensaje que solo menciona 'baja' lo responde el agente");
  const morfaOp = { ficha: morfa, cerebro, enviar: async () => {}, esperaMs: 0 };
  await atender(msj("5493761110098", "BAJA"), morfaOp);
  assert.equal(llamadas.length, 2, "en MORFA (no es distribuidora) BAJA lo atiende el agente como siempre");
});

test("degradación (paso 30): Claude caído en una distribuidora → solo acuse, la charla pasa a una persona con el texto; MORFA sigue igual", async () => {
  const { SOLO_ACUSE } = await import("../../src/atender.js");
  const caido = (async () => { throw new Error("Claude no contesta (529 overloaded)"); }) as any;
  const enviados: string[] = [];
  await atender(msj("5493761239001", "mandame 2 cajas de gaseosa"), { ficha: distri, cerebro: caido, enviar: async (t) => { enviados.push(t); }, esperaMs: 0 });
  assert.deepEqual(enviados, [SOLO_ACUSE]);
  const c = await obtenerAlmacen().buscarConversacion(distri.id, "5493761239001");
  assert.equal(c?.estado, "humano", "la charla quedó para una persona");
  assert.match(c?.derivada_resumen ?? "", /mandame 2 cajas de gaseosa/, "la persona ve lo que pidió");
  const evs = await obtenerAlmacen().eventos(new Date(Date.now() - 60_000), ["solo_acuse"]);
  assert.ok(evs.some((e) => e.conversacion_id === c?.id), "queda anotado el evento");
  // gastronomía: el mensaje de siempre
  const deMorfa: string[] = [];
  await atender(msj("5493761239002", "hola"), { ficha: morfa, cerebro: caido, enviar: async (t) => { deMorfa.push(t); }, esperaMs: 0 });
  assert.ok(deMorfa[0] && deMorfa[0] !== SOLO_ACUSE);
});

test("degradación (paso 30): un audio que no se puede escuchar → pide que lo escriba, sin llamar a Claude", async () => {
  const { cerebro, llamadas } = cerebroDePrueba();
  const enviados: string[] = [];
  await atender({ ...msj("5493761239003", ""), noSoportado: "audio" }, { ficha: distri, cerebro, enviar: async (t) => { enviados.push(t); }, esperaMs: 0 });
  assert.equal(llamadas.length, 0);
  assert.equal(enviados.length, 1);
  assert.match(enviados[0], /escrib/i);
});
