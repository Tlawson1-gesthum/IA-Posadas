// Las fichas viven en la base (tabla `fichas`). Cada una se completa con la plantilla de su rubro (plantillas/<rubro>.md),
// que está en el código: una mejora de plantilla pasa por las pruebas antes de llegar a todos los clientes del rubro.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { obtenerAlmacen, type FilaFicha } from "./almacen.js";
import { REGISTRO } from "./herramientas/index.js";
import { RAIZ } from "./raiz.js";
import type { Ficha } from "./tipos.js";

export const MODELOS = ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-4-5"];

/** Arma la ficha completa a partir de la fila de la base. Con `borrador`, usa los cambios sin publicar. */
export function fichaDesdeFila(f: FilaFicha, borrador = false): Ficha {
  const config = borrador && f.borrador ? f.borrador : f.config;
  return { ...config, id: f.id, estado: f.estado, whatsapp_phone_number_id: f.whatsapp_phone_number_id ?? undefined };
}

export async function cargarFicha(id: string, borrador = false): Promise<Ficha> {
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error(`Id de ficha inválido: ${id}`);
  const f = await obtenerAlmacen().fichaPorId(id);
  if (!f) throw new Error(`No existe la ficha ${id}`);
  return fichaDesdeFila(f, borrador);
}

/**
 * La ficha que atiende un número de WhatsApp: la que tiene ese whatsapp_phone_number_id.
 * Mientras se prueba con un solo cliente, FICHA_POR_DEFECTO atiende cualquier número sin ficha.
 */
export async function fichaPorNumero(phoneNumberId: string): Promise<Ficha | null> {
  const f = await obtenerAlmacen().fichaPorNumero(phoneNumberId);
  if (f) return fichaDesdeFila(f);
  const porDefecto = process.env.FICHA_POR_DEFECTO;
  return porDefecto ? cargarFicha(porDefecto) : null;
}

export function plantillasDisponibles(): string[] {
  const dir = path.join(RAIZ, "plantillas");
  return existsSync(dir) ? readdirSync(dir).filter((a) => a.endsWith(".md")).map((a) => a.slice(0, -3)) : [];
}

/** Datos de ejemplo con los que arranca una ficha nueva (plantillas/<plantilla>.json), si la plantilla los trae. */
export function ejemploDePlantilla(plantilla: string): Record<string, string> {
  const archivo = path.join(RAIZ, "plantillas", `${plantilla}.json`);
  if (!existsSync(archivo)) return {};
  try {
    const datos = JSON.parse(readFileSync(archivo, "utf8")).datos ?? {};
    return Object.fromEntries(Object.entries(datos).filter(([, v]) => typeof v === "string")) as Record<string, string>;
  } catch {
    return {};
  }
}

/** Los {{campos}} que pide una plantilla, en orden. */
export function camposDePlantilla(plantilla: string): string[] {
  const texto = readFileSync(path.join(RAIZ, "plantillas", `${plantilla}.md`), "utf8");
  // "nombre" sale de la ficha y "conocimiento" se lee en vivo de ficha.conocimiento.url: no se escriben a mano.
  return [...new Set([...texto.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]))].filter((c) => c !== "nombre" && c !== "conocimiento");
}

/**
 * Reemplaza cada {{campo}} de la plantilla. Falla si queda alguno sin completar.
 * `conocimiento` es el texto leído en vivo; sin él (al validar) alcanza con que la ficha tenga la dirección.
 */
export function armarPrompt(ficha: Ficha, conocimiento?: string): string {
  if (!plantillasDisponibles().includes(ficha.plantilla)) throw new Error(`No existe la plantilla ${ficha.plantilla}`);
  const plantilla = readFileSync(path.join(RAIZ, "plantillas", `${ficha.plantilla}.md`), "utf8");
  const valores: Record<string, string> = { nombre: ficha.nombre, ...ficha.datos };
  const enVivo = conocimiento ?? (ficha.conocimiento?.url ? "(se lee en vivo de la dirección de la ficha)" : undefined);
  if (enVivo !== undefined) valores.conocimiento = enVivo;
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

/** Revisa una ficha antes de publicarla. Devuelve la lista de problemas (vacía si está bien). */
export function validarFicha(ficha: Ficha): string[] {
  const problemas: string[] = [];
  if (!ficha.nombre?.trim()) problemas.push("Falta el nombre.");
  if (!MODELOS.includes(ficha.modelo)) problemas.push(`Modelo desconocido: ${ficha.modelo}.`);
  if (!["low", "medium", "high"].includes(ficha.esfuerzo)) problemas.push("El esfuerzo tiene que ser low, medium o high.");
  if (!(ficha.tope_usd_mes > 0)) problemas.push("El tope de gasto mensual tiene que ser mayor que 0.");
  for (const h of ficha.herramientas ?? []) if (!REGISTRO[h]) problemas.push(`Herramienta desconocida: ${h}.`);
  const integra = (ficha.herramientas ?? []).some((h) => h !== "derivar_a_persona");
  if (integra && !ficha.integracion?.base_url) problemas.push("Las herramientas elegidas necesitan integracion.base_url.");
  if (ficha.conocimiento?.url && !/^https:\/\//.test(ficha.conocimiento.url)) problemas.push("La dirección del conocimiento tiene que empezar con https://.");
  if (ficha.herramientas?.includes("crear_pedido") && ficha.integracion?.pagos_agente?.length === 0)
    problemas.push("Elegí al menos una forma de pago para los pedidos que toma el agente.");
  try {
    armarPrompt(ficha);
  } catch (e) {
    problemas.push((e as Error).message);
  }
  return problemas;
}
