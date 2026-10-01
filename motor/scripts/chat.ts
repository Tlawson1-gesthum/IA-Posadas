// Simulador: chateá con el agente en la terminal, sin WhatsApp ni base de datos.
// Uso: npm run chat -- morfa
import "./entorno.js";
import readline from "node:readline/promises";
import { responder } from "../src/cerebro.js";
import { cargarFicha } from "../src/fichas.js";
import type { Turno } from "../src/tipos.js";

const ficha = cargarFicha(process.argv[2] ?? "morfa");
const historial: Turno[] = [];
let total = 0;
let derivada = false;

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
console.log(`Chateando con el agente de ${ficha.nombre} (${ficha.modelo}). "salir" para terminar, "liberar" para devolverle la charla al agente.\n`);

while (true) {
  const mensaje = (await rl.question("vos> ")).trim();
  if (!mensaje) continue;
  if (mensaje === "salir") break;
  if (mensaje === "liberar") {
    derivada = false;
    console.log("[la charla vuelve al agente]\n");
    continue;
  }
  if (derivada) {
    console.log("[charla derivada: el agente no responde hasta que la liberes]\n");
    historial.push({ rol: "cliente", texto: mensaje });
    continue;
  }
  const r = await responder(ficha, historial, mensaje, "5493760000000");
  historial.push({ rol: "cliente", texto: mensaje }, { rol: "agente", texto: r.texto });
  total += r.uso.usd;
  console.log(`\n${ficha.nombre}> ${r.texto}\n`);
  const extra = r.herramientasUsadas.length ? ` · herramientas: ${r.herramientasUsadas.join(", ")}` : "";
  console.log(`  [US$ ${r.uso.usd.toFixed(4)} · acumulado US$ ${total.toFixed(4)}${extra}]`);
  if (r.derivada) {
    derivada = true;
    console.log(`  [DERIVADA a una persona · ${r.derivada.motivo}: ${r.derivada.resumen}]`);
  }
  console.log();
}
rl.close();
