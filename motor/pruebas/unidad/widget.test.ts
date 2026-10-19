// npm run unidad · la burbuja del chat web (public/widget.html) dibuja el texto de una respuesta sin dejar meter código:
// un link con comillas no puede cerrar el href y agregar atributos (escaneo de seguridad del 19/10/2026).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// las dos líneas de burbuja() que arman el HTML, tal cual están en el archivo
const html = readFileSync(new URL("../../public/widget.html", import.meta.url), "utf8");
const seguro = html.match(/const seguro = (.*);/)![1];
const inner = html.match(/d\.innerHTML = (.*);/)![1];
const dibujar = new Function("texto", `const seguro = ${seguro}; return ${inner};`) as (t: string) => string;

test("un link con comillas no se escapa del href", () => {
  const out = dibujar(`mirá https://x"style=position:fixed;inset:0"onmouseover=alert(1)// y 'algo'`);
  assert.ok(!/"\s*(style|onmouseover)=/.test(out) && !out.includes('"style') && !out.includes('"onmouseover'), out);
  assert.ok(!out.includes("'algo'"), "las comillas simples también van escapadas");
});

test("los links comunes y la negrita se ven igual que antes", () => {
  assert.equal(dibujar("pedí en https://pensa.com.ar/tienda y *listo*"),
    'pedí en <a href="https://pensa.com.ar/tienda" target="_blank" rel="noopener">https://pensa.com.ar/tienda</a> y <b>listo</b>');
  assert.equal(dibujar("<script>x</script>"), "&lt;script&gt;x&lt;/script&gt;");
});
