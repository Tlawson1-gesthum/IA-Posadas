// Prueba la transcripción con un audio real (usa TRANSCRIPCION_CLAVE del .env; gasta unos centavos de dólar).
// npx tsx scripts/transcribir-prueba.ts pruebas/audio/pedido-ruido.ogg ["alias separados por espacio"]
import "./entorno.js";
import { readFileSync } from "node:fs";
import { transcribir } from "../src/transcribir.js";

const [archivo, prompt] = process.argv.slice(2);
if (!archivo) { console.log("Uso: npx tsx scripts/transcribir-prueba.ts <audio.ogg> [\"alias del catálogo\"]"); process.exit(1); }
const datos = readFileSync(archivo);
const mime = archivo.endsWith(".mp3") ? "audio/mpeg" : archivo.endsWith(".m4a") ? "audio/mp4" : "audio/ogg";
const r = await transcribir(datos.buffer.slice(datos.byteOffset, datos.byteOffset + datos.byteLength), mime, { prompt });
console.log(r.largo ? "Pasa de 2 minutos: no se transcribe (el agente pide que lo escriban)." : `Texto: ${r.texto || "(vacío)"}\nConfianza: ${r.confianza ?? "sin dato"} · Duración: ${r.segundos ?? "?"} s`);
