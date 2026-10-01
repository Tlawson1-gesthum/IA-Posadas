// Carga una ficha y arma el system prompt a partir de la plantilla de su rubro.
// En el paso 3 la ficha se lee de Supabase; la forma de armar el prompt no cambia.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Ficha } from "./tipos.js";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function cargarFicha(id: string): Ficha {
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error(`Id de ficha inválido: ${id}`);
  return JSON.parse(readFileSync(path.join(RAIZ, "fichas", `${id}.json`), "utf8")) as Ficha;
}

/** Reemplaza cada {{campo}} de la plantilla. Falla si queda alguno sin completar. */
export function armarPrompt(ficha: Ficha): string {
  const plantilla = readFileSync(path.join(RAIZ, "plantillas", `${ficha.plantilla}.md`), "utf8");
  const valores: Record<string, string> = { nombre: ficha.nombre, ...ficha.datos };
  const faltan = new Set<string>();
  const prompt = plantilla.replace(/\{\{(\w+)\}\}/g, (_, campo: string) => {
    const valor = valores[campo];
    if (valor === undefined || valor.trim() === "") {
      faltan.add(campo);
      return "";
    }
    return valor.trim();
  });
  if (faltan.size) throw new Error(`La ficha ${ficha.id} no completa: ${[...faltan].join(", ")}`);
  return prompt;
}
