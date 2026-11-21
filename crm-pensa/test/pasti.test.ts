import { test } from "node:test";
import assert from "node:assert/strict";
import { parseClassification } from "../src/agents/pasti.js";

test("lee JSON envuelto en ```json", () => {
  const r = parseClassification('```json\n{"intent":"pedido","lead_score":82,"action":"auto_respond","suggested_response":"¡Hola!","reason":"quiere comprar"}\n```');
  assert.equal(r.intent, "pedido");
  assert.equal(r.lead_score, 82);
  assert.equal(r.action, "auto_respond");
});

test("deriva a una persona si el texto no es JSON", () => {
  assert.equal(parseClassification("no sé").action, "assign_agent");
});

test("rechaza intenciones desconocidas y acota el puntaje", () => {
  assert.equal(parseClassification('{"intent":"spam","lead_score":5,"action":"auto_respond"}').action, "assign_agent");
  assert.equal(parseClassification('{"intent":"queja","lead_score":400,"action":"create_task"}').lead_score, 100);
});
