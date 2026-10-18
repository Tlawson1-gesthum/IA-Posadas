// Escribe en un archivo la clave con la que el sistema de un local habla con su ficha (api/local.ts). Nunca la muestra.
// Uso: npm run clave-local -- <ficha> --a <archivo .dev.vars o similar> [--variable MOTOR_CLAVE]
//   npm run clave-local -- distri-demo --a ../../pensa-distribuidoras/.dev.vars
// Necesita LOCALES_CLAVE_MAESTRA en motor/.env (la misma que en Vercel). Para Cloudflare (prueba o producción) se carga
// el mismo valor como secreto MOTOR_CLAVE del proyecto Pages del local.
import "./entorno.js";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { claveLocal } from "../api/local.js";

const [ficha] = process.argv.slice(2);
const arg = (n: string) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : undefined; };
const archivo = arg("--a");
const variable = arg("--variable") ?? "MOTOR_CLAVE";
if (!ficha || !/^[a-z0-9-]+$/.test(ficha) || !archivo) {
  console.error("Uso: npm run clave-local -- <ficha> --a <archivo> [--variable MOTOR_CLAVE]");
  process.exit(1);
}
const clave = claveLocal(ficha);
if (!clave) {
  console.error("Falta LOCALES_CLAVE_MAESTRA (20 caracteres o más) en motor/.env.");
  process.exit(1);
}
let texto = existsSync(archivo) ? readFileSync(archivo, "utf8") : "";
const linea = `${variable}=${clave}`;
const re = new RegExp(`^${variable}=.*$`, "m");
texto = re.test(texto) ? texto.replace(re, linea) : texto.replace(/\n?$/, "\n") + linea + "\n";
writeFileSync(archivo, texto);
console.log(`Listo: ${variable} de la ficha ${ficha} quedó en ${archivo} (no se muestra).`);
