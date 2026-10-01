// Carga una ficha y arma el system prompt a partir de la plantilla de su rubro.
// En el paso 3 la ficha se lee de Supabase; la forma de armar el prompt no cambia.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Ficha } from "./tipos.js";

// En la compu, la carpeta motor/ está un nivel arriba de este archivo; en Vercel, es la carpeta de trabajo.
const RAIZ = [path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), process.cwd()].find((d) =>
  existsSync(path.join(d, "fichas")),
) ?? process.cwd();

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

/**
 * La ficha que atiende un número de WhatsApp: la que tiene ese whatsapp_phone_number_id.
 * Mientras se prueba con un solo cliente, FICHA_POR_DEFECTO atiende cualquier número sin ficha.
 */
export function fichaPorNumero(phoneNumberId: string): Ficha | null {
  for (const archivo of readdirSync(path.join(RAIZ, "fichas"))) {
    if (!archivo.endsWith(".json")) continue;
    const ficha = cargarFicha(archivo.slice(0, -5));
    if (ficha.whatsapp_phone_number_id === phoneNumberId) return ficha;
  }
  const porDefecto = process.env.FICHA_POR_DEFECTO;
  return porDefecto ? cargarFicha(porDefecto) : null;
}
