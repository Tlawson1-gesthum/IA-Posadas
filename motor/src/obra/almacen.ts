// Dónde se guardan los partes de obra. En Vercel: tabla partes_obra de Supabase (supabase/008_obra.sql).
// En la compu sin Supabase: en memoria (se pierde al cerrar).
import { createClient } from "@supabase/supabase-js";
import type { Parte } from "./modelo.js";

export interface AlmacenObra {
  /** Guarda el parte (lo crea o lo reemplaza por id). */
  guardar(p: Parte): Promise<void>;
  parte(id: string): Promise<Parte | null>;
  /** Todos los partes de una obra, del más viejo al más nuevo. */
  partes(fichaId: string, obraId: string): Promise<Parte[]>;
  /** El último parte pendiente de confirmar que mandó esa persona. */
  ultimoPendiente(fichaId: string, telefono: string): Promise<Parte | null>;
  /** Borra los partes de una ficha (para reiniciar el demo). */
  borrar(fichaId: string): Promise<void>;
}

function almacenSupabase(url: string, clave: string): AlmacenObra {
  const db = createClient(url, clave, { auth: { persistSession: false } });
  const ok = <T>(r: { data: T; error: { message: string } | null }): T => {
    if (r.error) throw new Error(`Supabase: ${r.error.message}`);
    return r.data;
  };
  return {
    async guardar(p) {
      ok(
        await db.from("partes_obra").upsert({
          id: p.id,
          ficha_id: p.ficha_id,
          obra_id: p.obra_id,
          fecha: p.fecha,
          estado: p.estado,
          telefono: p.telefono,
          datos: p,
          creado: p.creado,
        }),
      );
    },
    async parte(id) {
      if (!/^[0-9a-f-]{36}$/.test(id)) return null;
      const f = ok(await db.from("partes_obra").select("datos").eq("id", id).maybeSingle()) as { datos: Parte } | null;
      return f?.datos ?? null;
    },
    async partes(fichaId, obraId) {
      const filas = ok(
        await db.from("partes_obra").select("datos").eq("ficha_id", fichaId).eq("obra_id", obraId).order("fecha").order("creado").limit(2000),
      ) as { datos: Parte }[];
      return filas.map((f) => f.datos);
    },
    async ultimoPendiente(fichaId, telefono) {
      const f = ok(
        await db
          .from("partes_obra")
          .select("datos")
          .eq("ficha_id", fichaId)
          .eq("telefono", telefono)
          .eq("estado", "pendiente")
          .order("creado", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ) as { datos: Parte } | null;
      return f?.datos ?? null;
    },
    async borrar(fichaId) {
      ok(await db.from("partes_obra").delete().eq("ficha_id", fichaId));
    },
  };
}

function almacenEnMemoria(): AlmacenObra {
  const partes = new Map<string, Parte>();
  return {
    async guardar(p) {
      partes.set(p.id, structuredClone(p));
    },
    async parte(id) {
      return structuredClone(partes.get(id) ?? null);
    },
    async partes(fichaId, obraId) {
      return structuredClone(
        [...partes.values()]
          .filter((p) => p.ficha_id === fichaId && p.obra_id === obraId)
          .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.creado.localeCompare(b.creado)),
      );
    },
    async ultimoPendiente(fichaId, telefono) {
      const lista = [...partes.values()]
        .filter((p) => p.ficha_id === fichaId && p.telefono === telefono && p.estado === "pendiente")
        .sort((a, b) => b.creado.localeCompare(a.creado));
      return structuredClone(lista[0] ?? null);
    },
    async borrar(fichaId) {
      for (const [id, p] of partes) if (p.ficha_id === fichaId) partes.delete(id);
    },
  };
}

let almacen: AlmacenObra | null = null;

export function almacenObra(): AlmacenObra {
  if (almacen) return almacen;
  const url = process.env.SUPABASE_URL;
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && clave) almacen = almacenSupabase(url, clave);
  else {
    if (process.env.VERCEL) throw new Error("Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en Vercel");
    almacen = almacenEnMemoria();
  }
  return almacen;
}
