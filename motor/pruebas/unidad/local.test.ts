// npm run unidad · panel del agente para el sistema de un local (api/local.ts, paso 19): clave por ficha, solo sus charlas,
// pausa del dueño con aviso y devolución al agente. Sin Claude ni Supabase: almacén en memoria con las fichas de fichas/.
import { test } from "node:test";
import assert from "node:assert/strict";

delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
process.env.LOCALES_CLAVE_MAESTRA = "maestra-de-prueba-que-no-es-real-123456";
const { POST, claveLocal } = await import("../../api/local.js");
const { atender, AVISO_PAUSA } = await import("../../src/atender.js");
const { cargarFicha } = await import("../../src/fichas.js");
const { obtenerAlmacen } = await import("../../src/almacen.js");

const pedir = (ficha: string, clave: string | null, cuerpo: Record<string, unknown>) =>
  POST(new Request("http://motor/api/local", {
    method: "POST",
    headers: { "content-type": "application/json", "x-ficha": ficha, ...(clave ? { authorization: `Bearer ${clave}` } : {}) },
    body: JSON.stringify(cuerpo),
  }));
const A = "distri-demo", B = "distri-otra";
const claveA = claveLocal(A)!, claveB = claveLocal(B)!;
let n = 0;
const msj = (de: string, texto: string) => ({ phoneNumberId: "PNID-LOCAL", de, waId: `wamid.local.${++n}`, texto });
const cerebro = (async () => ({ texto: "Hola, soy el agente", herramientasUsadas: [], uso: { entrada: 0, salida: 0, cacheLeida: 0, cacheEscrita: 0, usd: 0 } })) as any;

test("cada local entra solo con la clave de su ficha", async () => {
  assert.notEqual(claveA, claveB);
  assert.equal((await pedir(A, claveA, { accion: "resumen" })).status, 200);
  assert.equal((await pedir(A, claveB, { accion: "resumen" })).status, 401, "la clave de B no abre A");
  assert.equal((await pedir(A, null, { accion: "resumen" })).status, 401);
  assert.equal((await pedir("no-existe", claveLocal("no-existe"), { accion: "resumen" })).status, 401);
});

test("un local no ve ni toca las charlas de otro", async () => {
  const fichaB = await cargarFicha(B);
  await atender(msj("5493761234001", "hola"), { ficha: fichaB, cerebro, enviar: async () => {}, esperaMs: 0 });
  const [charlaB] = (await (await pedir(B, claveB, { accion: "conversaciones" })).json()).conversaciones;
  assert.ok(charlaB, "B ve su charla");
  const listaA = (await (await pedir(A, claveA, { accion: "conversaciones" })).json()).conversaciones;
  assert.ok(!listaA.some((c: any) => c.id === charlaB.id), "A no la ve en su lista");
  for (const accion of ["conversacion", "tomar", "liberar", "marcar"]) {
    assert.equal((await pedir(A, claveA, { accion, id: charlaB.id, nota: "x" })).status, 404, `A no puede ${accion} una charla de B`);
  }
});

test("pausa del dueño: avisa una vez, la charla pasa al equipo y al sacar la pausa vuelve al agente", async () => {
  const tel = "5493761234002";
  const r = await (await pedir(A, claveA, { accion: "pausar", pausa: true, por: "Tomás" })).json();
  assert.equal(r.cambiado, true);
  const enviados: string[] = [];
  let llamadas = 0;
  const op = { ficha: await cargarFicha(A), cerebro: (async (...x: any[]) => { llamadas++; return cerebro(...x); }) as any, enviar: async (t: string) => { enviados.push(t); }, esperaMs: 0 };
  await atender(msj(tel, "mandame 2 cajas de coca"), op);
  await atender(msj(tel, "hola?"), op);
  assert.deepEqual(enviados, [AVISO_PAUSA], "un solo aviso, sin pasar por Claude");
  assert.equal(llamadas, 0);
  const resumen = await (await pedir(A, claveA, { accion: "resumen" })).json();
  assert.equal(resumen.pausa_local.por, "Tomás");
  assert.equal(resumen.estado, "activo", "la pausa del dueño no toca el estado que maneja Pensa");
  const fin = await (await pedir(A, claveA, { accion: "pausar", pausa: false })).json();
  assert.ok(fin.devueltas >= 1, "la charla que entró en pausa vuelve al agente");
  await atender(msj(tel, "sigo acá"), { ...op, ficha: await cargarFicha(A) });
  assert.equal(llamadas, 1, "sin pausa responde el agente");
});

test("tomar, responder, marcar y devolver una charla", async () => {
  const tel = "5493761234003";
  await atender(msj(tel, "hola"), { ficha: await cargarFicha(A), cerebro, enviar: async () => {}, esperaMs: 0 });
  const c = (await (await pedir(A, claveA, { accion: "conversaciones" })).json()).conversaciones.find((x: any) => x.telefono === tel);
  assert.equal((await pedir(A, claveA, { accion: "tomar", id: c.id, por: "Ana" })).status, 200);
  assert.equal((await obtenerAlmacen().detalleConversacion(c.id))!.estado, "humano");
  assert.equal((await pedir(A, claveA, { accion: "marcar", id: c.id, nota: "" })).status, 400, "marcar pide qué entendió mal");
  assert.equal((await pedir(A, claveA, { accion: "marcar", id: c.id, nota: "Entendió 2 cajas y eran 2 botellas" })).status, 200);
  const mal = (await (await pedir(A, claveA, { accion: "conversaciones", filtro: "mal" })).json()).conversaciones;
  assert.deepEqual(mal.map((x: any) => x.id), [c.id]);
  const detalle = await (await pedir(A, claveA, { accion: "conversacion", id: c.id })).json();
  assert.equal(detalle.marcas[0].nota, "Entendió 2 cajas y eran 2 botellas");
  assert.ok(!("numero_negocio" in detalle.conversacion) && !("usd" in detalle.mensajes[0]), "no pasa datos internos");
  assert.equal((await pedir(A, claveA, { accion: "liberar", id: c.id })).status, 200);
  assert.equal((await obtenerAlmacen().detalleConversacion(c.id))!.estado, "agente");
});
