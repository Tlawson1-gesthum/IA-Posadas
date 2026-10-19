// npm run unidad · webhook de WhatsApp (02 · T8): un aviso con la firma mal no se interpreta ni se atiende; sin firma ni
// siquiera se lee. Sin Supabase ni Meta.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
process.env.META_APP_SECRET = "secreto-de-prueba";
const { POST } = await import("../../api/whatsapp.js");

const firmar = (cuerpo: string, secreto = "secreto-de-prueba") => "sha256=" + createHmac("sha256", secreto).update(cuerpo, "utf8").digest("hex");
// Un pedido cuyo cuerpo avisa si alguien lo leyó
function pedido(cuerpo: string, headers: Record<string, string>) {
  let leido = false;
  const r = new Request("https://motor.prueba/api/whatsapp", { method: "POST", body: cuerpo, headers });
  const text = r.text.bind(r);
  Object.defineProperty(r, "text", { value: () => { leido = true; return text(); } });
  return { r, leido: () => leido };
}

test("sin firma: 401 sin leer el cuerpo", async () => {
  const p = pedido('{"entry":[]}', {});
  const res = await POST(p.r);
  assert.equal(res.status, 401);
  assert.equal(p.leido(), false);
});

test("firma sin el formato de Meta: 401 sin leer el cuerpo", async () => {
  const p = pedido('{"entry":[]}', { "x-hub-signature-256": "abc" });
  assert.equal((await POST(p.r)).status, 401);
  assert.equal(p.leido(), false);
});

test("más de 1 MB: se rechaza sin leerlo", async () => {
  const p = pedido("x", { "x-hub-signature-256": "sha256=" + "0".repeat(64), "content-length": "2000000" });
  assert.equal((await POST(p.r)).status, 413);
  assert.equal(p.leido(), false);
});

test("firma inválida (otro secreto, o el cuerpo cambiado): 401 y no se interpreta", async () => {
  // un cuerpo que no es JSON: si se interpretara antes de la firma daría 400; con la firma mal tiene que dar 401
  assert.equal((await POST(pedido("esto no es JSON", { "x-hub-signature-256": firmar("esto no es JSON", "otro") }).r)).status, 401);
  assert.equal((await POST(pedido("esto no es JSON!", { "x-hub-signature-256": firmar("esto no es JSON") }).r)).status, 401);
});

test("sin el secreto configurado: 401 aunque la firma tenga el formato", async () => {
  const antes = process.env.META_APP_SECRET;
  delete process.env.META_APP_SECRET;
  const p = pedido('{"entry":[]}', { "x-hub-signature-256": firmar('{"entry":[]}') });
  assert.equal((await POST(p.r)).status, 401);
  assert.equal(p.leido(), false);
  process.env.META_APP_SECRET = antes;
});

test("con la firma buena recién se interpreta (un cuerpo que no es JSON da 400)", async () => {
  assert.equal((await POST(pedido("esto no es JSON", { "x-hub-signature-256": firmar("esto no es JSON") }).r)).status, 400);
});

test("registros: los teléfonos salen enmascarados (T9)", async () => {
  const { enmascarar, sinTelefonos } = await import("../../src/enmascarar.js");
  assert.equal(enmascarar("5493764123434"), "+54 376 ***-**34");
  assert.equal(enmascarar("3764123434"), "+54 376 ***-**34");
  assert.equal(sinTelefonos("Meta rechazó el envío a 5493764123434 (código 131026)"), "Meta rechazó el envío a +54 376 ***-**34 (código 131026)");
  assert.equal(sinTelefonos("pedido de $ 4500000 en 3 cajas"), "pedido de $ 4500000 en 3 cajas"); // montos y números cortos no se tocan
});
