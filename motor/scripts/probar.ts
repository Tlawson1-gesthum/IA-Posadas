// Batería de conversaciones de ejemplo. Ningún cambio de ficha o plantilla sale sin pasarla.
// Uso: npm run probar -- morfa [texto para filtrar casos]
import "./entorno.js";
import { readFileSync } from "node:fs";
import { responder } from "../src/cerebro.js";
import { cargarFicha } from "../src/fichas.js";
import type { Turno } from "../src/tipos.js";

interface Caso {
  nombre: string;
  mensajes: string[];
  herramientas?: string[];
  deriva?: boolean;
  contiene?: string[];
  no_contiene?: string[];
  /** Hace de cuenta que el local está abierto (para probar pedidos fuera de horario). */
  abierto?: boolean;
  /** Hace de cuenta que el mapa (OpenStreetMap) no responde. */
  mapa_caido?: boolean;
}

// El país de una ubicación se consulta en OpenStreetMap: en las pruebas se simula para que no dependan de la red.
// Al norte de -27.35 (Encarnación) es Paraguay; el resto, Argentina. Lo demás pasa a la red real.
let mapaCaido = false;
const fetchReal = globalThis.fetch;
globalThis.fetch = (async (entrada: any, init?: any) => {
  const url = new URL(typeof entrada === "string" ? entrada : entrada.url ?? String(entrada));
  if (url.hostname === "nominatim.openstreetmap.org" && url.pathname === "/reverse") {
    if (mapaCaido) throw new Error("mapa simulado caído");
    const pais = Number(url.searchParams.get("lat")) > -27.35 ? "py" : "ar";
    return new Response(JSON.stringify({ address: { country_code: pais } }), { headers: { "content-type": "application/json" } });
  }
  return fetchReal(entrada, init);
}) as typeof fetch;

const id = process.argv[2] ?? "morfa";
const filtro = process.argv[3]?.toLowerCase();
const ficha = await cargarFicha(id);
const casos: Caso[] = JSON.parse(readFileSync(new URL(`../pruebas/${id}.json`, import.meta.url), "utf8"));

let fallas = 0;
let usd = 0;
for (const caso of casos.filter((c) => !filtro || c.nombre.toLowerCase().includes(filtro))) {
  process.env.FORZAR_ABIERTO = caso.abierto ? "1" : "";
  mapaCaido = !!caso.mapa_caido;
  const historial: Turno[] = [];
  const usadas = new Set<string>();
  let derivada = false;
  let texto = "";
  for (const m of caso.mensajes) {
    const r = await responder(ficha, historial, m, "5493760000000").catch((e: Error) => {
      console.log(`\n✗ ${caso.nombre}\n    La API falló: ${e.message.slice(0, 300)}`);
      console.log(`\nCorrida cortada · ${fallas} falla(s) antes del corte · costo: US$ ${usd.toFixed(4)}`);
      process.exit(2);
    });
    historial.push({ rol: "cliente", texto: m }, { rol: "agente", texto: r.texto });
    r.herramientasUsadas.forEach((h) => usadas.add(h));
    derivada ||= !!r.derivada;
    texto = r.texto;
    usd += r.uso.usd;
  }
  const errores: string[] = [];
  for (const h of caso.herramientas ?? []) if (!usadas.has(h)) errores.push(`no usó ${h}`);
  if (caso.deriva !== undefined && caso.deriva !== derivada) errores.push(caso.deriva ? "no derivó" : "derivó sin motivo");
  for (const re of caso.contiene ?? []) if (!new RegExp(re, "i").test(texto)) errores.push(`falta /${re}/`);
  for (const re of caso.no_contiene ?? []) if (new RegExp(re, "i").test(texto)) errores.push(`no debía decir /${re}/`);
  if (errores.length) fallas++;
  console.log(`${errores.length ? "✗" : "✓"} ${caso.nombre}`);
  console.log(`    ${texto.replace(/\n/g, "\n    ")}`);
  if (errores.length) console.log(`    → ${errores.join(" · ")}`);
}
console.log(`\n${fallas ? `${fallas} caso(s) fallaron` : "Todo bien"} · costo de la corrida: US$ ${usd.toFixed(4)}`);
process.exit(fallas ? 1 : 0);
