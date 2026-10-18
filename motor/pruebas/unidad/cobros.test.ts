// npm run unidad · links de pago (paso 24, T16): el agente solo pasa links de Mercado Pago o del sistema de la propia distribuidora.
import { test } from "node:test";
import assert from "node:assert/strict";
import { linkSeguro } from "../../src/herramientas/distribuidora.js";

const ficha = { integracion: { base_url: "https://prueba.distri-demo.pages.dev" } };

test("solo links de Mercado Pago o del propio sistema", () => {
  assert.ok(linkSeguro("https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=1", ficha));
  assert.ok(linkSeguro("https://mercadopago.com/checkout", ficha));
  assert.ok(linkSeguro("https://prueba.distri-demo.pages.dev/#/mock-pago/CC-1-0-100-abcdef", ficha));
  assert.equal(linkSeguro("https://mercadopago.com.ar.estafa.com/pagar", ficha), null, "un dominio que solo empieza igual");
  assert.equal(linkSeguro("https://otra-distri.pages.dev/pagar", ficha), null, "el sistema de otro local");
  assert.equal(linkSeguro("http://www.mercadopago.com.ar/x", ficha), null, "sin https");
  assert.equal(linkSeguro("javascript:alert(1)", ficha), null);
  assert.equal(linkSeguro("no es un link", ficha), null);
  assert.ok(linkSeguro("http://127.0.0.1:8795/#/mock-pago/CC-1-0-100-abcdef", { integracion: { base_url: "http://127.0.0.1:8795" } }), "el servidor local de prueba");
});
