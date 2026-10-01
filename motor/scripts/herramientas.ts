// Prueba las herramientas contra el sistema real del cliente, sin llamar a Claude.
// Uso: npm run herramientas -- morfa [CODIGO_DE_PEDIDO]
import { cargarFicha } from "../src/fichas.js";
import { armarPrompt } from "../src/fichas.js";
import { REGISTRO } from "../src/herramientas/index.js";

const ficha = await cargarFicha(process.argv[2] ?? "morfa");
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

const pedido = {
  items: [
    { id: "morfona", cantidad: 1, adicionales: [{ id: "papas", cantidad: 1 }] },
    { id: "emp-jyq", cantidad: 2 },
  ],
  lat: -27.37, lng: -55.9,
};
console.log("\nCotizar (cerca):", await REGISTRO.cotizar_pedido.ejecutar(pedido, ctx));
console.log("Cotizar (Garupá):", await REGISTRO.cotizar_pedido.ejecutar({ ...pedido, lat: -27.48, lng: -55.83 }, ctx));
console.log("Cotizar (agotado y adicional inválido):", await REGISTRO.cotizar_pedido.ejecutar({ items: [{ id: "heineken-lata", cantidad: 1 }, { id: "muzza", cantidad: 1, adicionales: [{ id: "papas", cantidad: 1 }] }] }, ctx));
process.env.FORZAR_ABIERTO = "1";
console.log("Crear (simulado):", await REGISTRO.crear_pedido.ejecutar({ ...pedido, nombre: "Rosa", direccion: "Mitre 1234", referencia: "", notas: "Paga con $50.000", pago: "efectivo" }, ctx));
