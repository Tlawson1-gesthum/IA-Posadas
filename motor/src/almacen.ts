// Dónde se guardan las charlas. En Vercel: Supabase. En la compu sin Supabase: en memoria (se pierde al cerrar).
import { createClient } from "@supabase/supabase-js";
import type { Turno } from "./tipos.js";

/** Se arranca una charla nueva (sin historial) si pasaron más de estas horas desde el último mensaje. */
const HORAS_DE_CHARLA = 12;
const MAX_TURNOS = 20;

export interface Conversacion {
  id: string;
  estado: "agente" | "humano";
}

export interface MensajeAGuardar {
  conversacionId: string;
  fichaId: string;
  rol: "cliente" | "agente";
  texto: string;
  waId?: string;
  herramientas?: string[];
  tokensEntrada?: number;
  tokensSalida?: number;
  usd?: number;
}

export interface Almacen {
  conversacion(fichaId: string, telefono: string): Promise<Conversacion>;
  historial(conversacionId: string): Promise<Turno[]>;
  /** Guarda el mensaje. Devuelve false si ese mensaje de WhatsApp ya estaba (Meta lo reenvió). */
  guardar(m: MensajeAGuardar): Promise<boolean>;
  derivar(conversacionId: string, motivo: string, resumen: string): Promise<void>;
  /** Devuelve la charla al agente y empieza de cero (el historial queda guardado, pero no se usa). */
  reiniciar(conversacionId: string): Promise<void>;
  gastoDelMes(fichaId: string): Promise<number>;
}

function inicioDeMes(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
}

function desde(): string {
  return new Date(Date.now() - HORAS_DE_CHARLA * 3600_000).toISOString();
}

function almacenSupabase(url: string, clave: string): Almacen {
  const db = createClient(url, clave, { auth: { persistSession: false } });
  const ok = <T>(r: { data: T; error: { message: string } | null }): T => {
    if (r.error) throw new Error(`Supabase: ${r.error.message}`);
    return r.data;
  };
  return {
    async conversacion(fichaId, telefono) {
      const fila = ok(
        await db
          .from("conversaciones")
          .upsert({ ficha_id: fichaId, telefono, actualizada: new Date().toISOString() }, { onConflict: "ficha_id,telefono" })
          .select("id, estado")
          .single(),
      );
      return fila as Conversacion;
    },
    async historial(conversacionId) {
      const conv = ok(await db.from("conversaciones").select("reiniciada").eq("id", conversacionId).single()) as {
        reiniciada: string | null;
      };
      const reiniciada = conv.reiniciada ? new Date(conv.reiniciada).toISOString() : "";
      const minimo = reiniciada > desde() ? reiniciada : desde();
      const filas = ok(
        await db
          .from("mensajes")
          .select("rol, texto")
          .eq("conversacion_id", conversacionId)
          .gt("creado", minimo)
          .order("creado", { ascending: false })
          .limit(MAX_TURNOS),
      ) as { rol: string; texto: string }[];
      // Lo que escribió una persona del equipo cuenta como respuesta del negocio.
      return filas.reverse().map((f) => ({ rol: f.rol === "cliente" ? "cliente" : "agente", texto: f.texto }));
    },
    async guardar(m) {
      const r = await db.from("mensajes").insert({
        conversacion_id: m.conversacionId,
        ficha_id: m.fichaId,
        rol: m.rol,
        texto: m.texto,
        wa_id: m.waId ?? null,
        herramientas: m.herramientas ?? [],
        tokens_entrada: m.tokensEntrada ?? 0,
        tokens_salida: m.tokensSalida ?? 0,
        usd: m.usd ?? 0,
      });
      if (r.error?.code === "23505") return false; // wa_id repetido
      ok(r);
      return true;
    },
    async derivar(conversacionId, motivo, resumen) {
      ok(
        await db
          .from("conversaciones")
          .update({ estado: "humano", derivada_motivo: motivo, derivada_resumen: resumen, derivada_en: new Date().toISOString() })
          .eq("id", conversacionId),
      );
    },
    async reiniciar(conversacionId) {
      ok(
        await db
          .from("conversaciones")
          .update({ estado: "agente", reiniciada: new Date().toISOString(), derivada_motivo: null, derivada_resumen: null })
          .eq("id", conversacionId),
      );
    },
    async gastoDelMes(fichaId) {
      const filas = ok(
        await db.from("mensajes").select("usd").eq("ficha_id", fichaId).gte("creado", inicioDeMes()),
      ) as { usd: number }[];
      return filas.reduce((s, f) => s + Number(f.usd), 0);
    },
  };
}

function almacenEnMemoria(): Almacen {
  const convs = new Map<string, Conversacion & { clave: string; reiniciada?: number }>();
  const msgs: (MensajeAGuardar & { creado: number })[] = [];
  return {
    async conversacion(fichaId, telefono) {
      const clave = `${fichaId}:${telefono}`;
      let c = [...convs.values()].find((x) => x.clave === clave);
      if (!c) {
        c = { id: String(convs.size + 1), estado: "agente", clave };
        convs.set(c.id, c);
      }
      return c;
    },
    async historial(id) {
      const limite = Math.max(Date.now() - HORAS_DE_CHARLA * 3600_000, convs.get(id)?.reiniciada ?? 0);
      return msgs
        .filter((m) => m.conversacionId === id && m.creado > limite)
        .slice(-MAX_TURNOS)
        .map((m) => ({ rol: m.rol, texto: m.texto }));
    },
    async guardar(m) {
      if (m.waId && msgs.some((x) => x.waId === m.waId)) return false;
      msgs.push({ ...m, creado: Date.now() });
      return true;
    },
    async derivar(id) {
      const c = convs.get(id);
      if (c) c.estado = "humano";
    },
    async reiniciar(id) {
      const c = convs.get(id);
      if (c) Object.assign(c, { estado: "agente", reiniciada: Date.now() });
    },
    async gastoDelMes(fichaId) {
      return msgs.filter((m) => m.fichaId === fichaId).reduce((s, m) => s + (m.usd ?? 0), 0);
    },
  };
}

let almacen: Almacen | null = null;

export function obtenerAlmacen(): Almacen {
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
