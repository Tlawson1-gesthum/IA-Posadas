// Carga una semana de ejemplo para mostrar el tablero sin esperar partes reales (semillas/<ficha>.json).
// Los partes pasan por los mismos controles que un parte real: las alertas las calcula el motor, no la semilla.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { RAIZ } from "../raiz.js";
import type { Ficha } from "../tipos.js";
import { almacenObra } from "./almacen.js";
import { controlarParte, hoyAR, sumarDias } from "./control.js";
import type { Parte } from "./modelo.js";

type ParteSemilla = Partial<Omit<Parte, "recepciones" | "combustible">> & {
  dia: number;
  recepciones?: (Omit<Parte["recepciones"][number], "cantidad_recibida"> & { cantidad_recibida?: number })[];
  combustible?: (Omit<Parte["combustible"][number], "horas" | "horometro"> & { horas?: number; horometro?: number })[];
};

export function haySemilla(fichaId: string): boolean {
  return /^[a-z0-9-]+$/.test(fichaId) && existsSync(path.join(RAIZ, "semillas", `${fichaId}.json`));
}

/** Borra los partes de la ficha y carga la semana de ejemplo. Devuelve cuántos partes cargó. */
export async function cargarSemilla(ficha: Ficha): Promise<number> {
  if (!ficha.obra || !haySemilla(ficha.id)) throw new Error("Esta ficha no tiene semana de ejemplo");
  const semilla = JSON.parse(readFileSync(path.join(RAIZ, "semillas", `${ficha.id}.json`), "utf8")) as { obra: string; partes: ParteSemilla[] };
  const obra = ficha.obra.obras.find((o) => o.id === semilla.obra);
  if (!obra) throw new Error(`La semilla usa la obra ${semilla.obra}, que no está en la ficha`);

  const almacen = almacenObra();
  await almacen.borrar(ficha.id);
  const hoy = hoyAR();
  const cargados: Parte[] = [];
  for (const s of semilla.partes) {
    const fecha = sumarDias(hoy, s.dia);
    const p: Parte = {
      id: randomUUID(),
      ficha_id: ficha.id,
      obra_id: obra.id,
      fecha,
      estado: "confirmado",
      telefono: "semilla",
      responsable: s.responsable ?? "",
      clima: s.clima ?? "",
      personal: s.personal ?? null,
      avances: s.avances ?? [],
      recepciones: (s.recepciones ?? []).map((r) => ({ ...r, cantidad_recibida: r.cantidad_recibida ?? null })),
      consumos: s.consumos ?? [],
      combustible: (s.combustible ?? []).map((x) => ({ ...x, horas: x.horas ?? null, horometro: x.horometro ?? null })),
      stock_medido: s.stock_medido ?? [],
      incidentes: s.incidentes ?? [],
      pedidos: s.pedidos ?? [],
      observaciones: s.observaciones ?? "",
      alertas: [],
      reemplaza: null,
      // Cierre del día, hora de Argentina.
      creado: new Date(`${fecha}T19:00:00-03:00`).toISOString(),
    };
    p.alertas = controlarParte(ficha.obra, obra, p, cargados);
    await almacen.guardar(p);
    cargados.push(p);
  }
  return cargados.length;
}
