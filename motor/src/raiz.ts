// La carpeta motor/: en la compu está un nivel arriba de src/; en Vercel, es la carpeta de trabajo.
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const RAIZ =
  [path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), process.cwd()].find((d) =>
    existsSync(path.join(d, "plantillas")),
  ) ?? process.cwd();
