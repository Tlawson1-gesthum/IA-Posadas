// Carga motor/.env si existe (solo para correr en la compu; en Vercel las claves son variables de entorno).
import { existsSync } from "node:fs";

const archivo = new URL("../.env", import.meta.url);
if (existsSync(archivo)) process.loadEnvFile(archivo);
