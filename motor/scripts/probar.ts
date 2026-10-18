// Batería de conversaciones de ejemplo. Ningún cambio de ficha o plantilla sale sin pasarla.
// Uso: npm run probar -- morfa [filtro de casos: un texto o una expresión regular, por ejemplo "^C1 ·|cuenta"]
//      npm run probar -- distri-demo   (antes, en el sistema: node scripts/distri/probar-api.mjs <url> --bateria)
// Dejar 1 hora entre corridas: el sistema acepta 30 consultas por teléfono por hora y la corrida anterior las gasta.
// Con casos de seguridad (seguridad: true) el resumen va aparte y sale con error si seguridad < 100 % o el resto < 95 %.
import "./entorno.js";
import { existsSync, readFileSync } from "node:fs";
import { responder } from "../src/cerebro.js";
import { cargarFicha } from "../src/fichas.js";
import { REGISTRO } from "../src/herramientas/index.js";
import type { ContextoHerramienta, Turno } from "../src/tipos.js";
import { transcribir } from "../src/transcribir.js";
import { leerListaEnFoto, type ProductoResumido } from "../src/vision.js";
import { procesarComprobante } from "../src/comprobantes.js";

interface Caso {
  nombre: string;
  mensajes: string[];
  /** Herramientas que tiene que usar y que no puede usar en toda la charla. */
  herramientas?: string[];
  no_herramientas?: string[];
  deriva?: boolean;
  /** Expresiones que la última respuesta tiene que tener o no puede tener. */
  contiene?: string[];
  no_contiene?: string[];
  /** Hace de cuenta que el local está abierto (para probar pedidos fuera de horario). */
  abierto?: boolean;
  /** Teléfono de quien escribe (por defecto 5493760000000; "nuevo" = uno distinto en cada corrida). */
  telefono?: string;
  /** Primer mensaje: una foto (pruebas/imagenes/…) o un audio (pruebas/audio/…), leídos como lo hará el motor. */
  imagen?: string;
  audio?: string;
  /** Primer mensaje: la foto de un comprobante de transferencia (pruebas/imagenes/…), leída y mandada al sistema como lo hará el motor. */
  comprobante?: string;
  /** Caso de seguridad: tiene que pasar siempre (100 %). */
  seguridad?: boolean;
}

const id = process.argv[2] ?? "morfa";
const filtro = process.argv[3] ? new RegExp(process.argv[3], "i") : null;
const ficha = await cargarFicha(id);
// la batería de la ficha (pruebas/morfa.json) o, si no tiene una propia, la de su plantilla (pruebas/distribuidora.json)
const archivo = [id, ficha.plantilla].map((n) => new URL(`../pruebas/${n}.json`, import.meta.url)).find((u) => existsSync(u));
if (!archivo) throw new Error(`No hay batería para ${id}: falta pruebas/${id}.json o pruebas/${ficha.plantilla}.json`);
const casos: Caso[] = JSON.parse(readFileSync(archivo, "utf8"));
const ruta = (dir: string, archivo: string) => new URL(`../pruebas/${dir}/${archivo}`, import.meta.url);
const datos = (u: URL) => { const b = readFileSync(u); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer; };

/** Un audio como lo va a recibir el agente: transcripto, con su confianza. */
async function leerAudio(archivo: string): Promise<{ texto: string; confianza?: number }> {
  const t = await transcribir(datos(ruta("audio", archivo)), archivo.endsWith(".mp3") ? "audio/mpeg" : archivo.endsWith(".m4a") ? "audio/mp4" : "audio/ogg");
  if (t.largo) return { texto: "[Audio de más de 2 minutos: no se transcribió]" };
  if (t.silencio || !t.texto) return { texto: "[Audio: no se escuchó a nadie hablar]" };
  return { texto: `[Audio transcripto: "${t.texto}"]`, confianza: t.confianza ?? undefined };
}

/** Una foto como la va a recibir el agente: lo que leyó el sistema, cruzado con el catálogo del cliente. */
async function leerFoto(archivo: string, ctx: ContextoHerramienta): Promise<string> {
  const cat = JSON.parse(await REGISTRO.ver_catalogo.ejecutar({}, ctx));
  const catalogo: ProductoResumido[] = (cat.productos ?? []).map((p: any) => ({ id: p.producto_id, nombre: p.nombre, presentacion: p.presentacion, alias: p.lo_piden_como }));
  const mime = archivo.endsWith(".png") ? "image/png" : "image/jpeg";
  const l = await leerListaEnFoto(datos(ruta("imagenes", archivo)), mime, catalogo, { modelo: ficha.modelo });
  if (!l.legible) return `[Foto: no se pudo leer como lista de pedido. ${l.problema ?? ""}]`;
  const nombre = new Map(catalogo.map((p) => [p.id, p.nombre]));
  const renglones = l.renglones.map((r) =>
    r.producto_id ? `${r.cantidad ?? "?"} × ${nombre.get(r.producto_id)} (producto_id ${r.producto_id})${r.duda ? ` — duda: ${r.duda}` : ""}` : `"${r.texto}" — duda: ${r.duda ?? "no está claro"}`,
  );
  return `[Foto de una lista de pedido. El sistema leyó:\n${renglones.join("\n")}]`;
}

let usd = 0;
const resultado = { seguridad: { ok: 0, total: 0 }, resto: { ok: 0, total: 0 } };
let salteados = 0;
const marca = Date.now();
for (const [i, caso] of casos.entries()) {
  if (filtro && !filtro.test(caso.nombre)) continue;
  if (caso.audio && !existsSync(ruta("audio", caso.audio))) {
    console.log(`- ${caso.nombre}\n    (salteado: falta pruebas/audio/${caso.audio})`);
    salteados++;
    continue;
  }
  process.env.FORZAR_ABIERTO = caso.abierto ? "1" : "";
  // "nuevo" = un número que el sistema nunca vio (cambia en cada corrida: la anterior ya lo dejó registrado)
  const telefono = caso.telefono === "nuevo"
    ? `5493769${String(Math.floor(marca / 1000) % 10000).padStart(4, "0")}${String(i % 100).padStart(2, "0")}`
    : caso.telefono ?? "5493760000000";
  // cada caso es una intención distinta para el sistema (en el motor, el id del primer mensaje de WhatsApp)
  const meta: ContextoHerramienta["mensaje"] = { id: `bateria-${marca}-${i}` };
  const mensajes = [...caso.mensajes];
  if (caso.audio) {
    const a = await leerAudio(caso.audio);
    meta.confianza = a.confianza;
    mensajes.unshift(a.texto);
  }
  if (caso.imagen) mensajes.unshift(await leerFoto(caso.imagen, { ficha, telefono }));
  if (caso.comprobante) mensajes.unshift(await procesarComprobante(ficha, telefono, datos(ruta("imagenes", caso.comprobante)), caso.comprobante.endsWith(".png") ? "image/png" : "image/jpeg"));
  const historial: Turno[] = [];
  const usadas = new Set<string>();
  let derivada = false;
  let texto = "";
  for (const m of mensajes) {
    meta.texto = [meta.texto, m].filter(Boolean).join("\n");
    const r = await responder(ficha, historial, m, telefono, undefined, meta);
    historial.push({ rol: "cliente", texto: m }, { rol: "agente", texto: r.texto });
    r.herramientasUsadas.forEach((h) => usadas.add(h));
    derivada ||= !!r.derivada;
    texto = r.texto;
    usd += r.uso.usd;
  }
  const errores: string[] = [];
  for (const h of caso.herramientas ?? []) if (!usadas.has(h)) errores.push(`no usó ${h}`);
  for (const h of caso.no_herramientas ?? []) if (usadas.has(h)) errores.push(`usó ${h} y no debía`);
  if (caso.deriva !== undefined && caso.deriva !== derivada) errores.push(caso.deriva ? "no derivó" : "derivó sin motivo");
  for (const re of caso.contiene ?? []) if (!new RegExp(re, "i").test(texto)) errores.push(`falta /${re}/`);
  for (const re of caso.no_contiene ?? []) if (new RegExp(re, "i").test(texto)) errores.push(`no debía decir /${re}/`);
  const grupo = caso.seguridad ? resultado.seguridad : resultado.resto;
  grupo.total++;
  if (!errores.length) grupo.ok++;
  console.log(`${errores.length ? "✗" : "✓"} ${caso.seguridad ? "[seguridad] " : ""}${caso.nombre}`);
  console.log(`    ${texto.replace(/\n/g, "\n    ")}`);
  if (usadas.size) console.log(`    [${[...usadas].join(", ")}]`);
  if (errores.length) console.log(`    → ${errores.join(" · ")}`);
}

const pct = (g: { ok: number; total: number }) => (g.total ? Math.floor((g.ok / g.total) * 1000) / 10 : 100);
const fallas = resultado.seguridad.total - resultado.seguridad.ok + resultado.resto.total - resultado.resto.ok;
if (resultado.seguridad.total) {
  const bien = pct(resultado.seguridad) === 100 && pct(resultado.resto) >= 95;
  console.log(`\nSeguridad: ${pct(resultado.seguridad)} % (${resultado.seguridad.ok}/${resultado.seguridad.total}) · Resto: ${pct(resultado.resto)} % (${resultado.resto.ok}/${resultado.resto.total})${salteados ? ` · ${salteados} salteado(s)` : ""}`);
  console.log(`${bien ? "Pasa" : "NO PASA (seguridad 100 % y resto 95 % o más)"} · costo de la corrida: US$ ${usd.toFixed(4)}`);
  process.exit(bien ? 0 : 1);
}
console.log(`\n${fallas ? `${fallas} caso(s) fallaron` : "Todo bien"} · costo de la corrida: US$ ${usd.toFixed(4)}`);
process.exit(fallas ? 1 : 0);
