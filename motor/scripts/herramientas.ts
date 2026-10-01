// Prueba las herramientas contra el sistema real del cliente, sin llamar a Claude.
// Uso: npm run herramientas -- morfa [CODIGO_DE_PEDIDO]
import { cargarFicha } from "../src/fichas.js";
import { armarPrompt } from "../src/fichas.js";
import { REGISTRO } from "../src/herramientas/index.js";

const ficha = cargarFicha(process.argv[2] ?? "morfa");
const ctx = { ficha, telefono: "5493760000000" };

const prompt = armarPrompt(ficha);
console.log(`Prompt armado: ${prompt.length} caracteres, sin campos vacíos.\n`);

const carta = JSON.parse(await REGISTRO.ver_carta_y_estado.ejecutar({}, ctx));
console.log("Estado:", carta.estado.motivo || (carta.estado.abierto ? "abierto" : "cerrado"));
console.log("Demora:", carta.demora, "· Efectivo:", carta.efectivo, "· Envío:", JSON.stringify(carta.envio));
for (const p of carta.productos) {
  console.log(`  ${p.disponible ? " " : "✗"} ${p.categoria.padEnd(10)} ${p.nombre.padEnd(28)} $${p.precio.toLocaleString("es-AR")}`);
}

const codigo = process.argv[3] ?? "ZZZZZZ9";
console.log(`\nPedido ${codigo}:`, await REGISTRO.consultar_pedido.ejecutar({ codigo }, ctx));
console.log(`Código inválido:`, await REGISTRO.consultar_pedido.ejecutar({ codigo: "hola mundo" }, ctx));
