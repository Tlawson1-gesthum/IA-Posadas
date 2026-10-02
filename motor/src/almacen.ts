// Dónde se guarda todo: fichas, charlas, eventos. En Vercel: Supabase. En la compu sin Supabase: en memoria,
// con las fichas de la carpeta fichas/ (se pierde al cerrar; sirve para probar).
import { createClient } from "@supabase/supabase-js";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { RAIZ } from "./raiz.js";
import type { Ficha, Turno } from "./tipos.js";

/** Se arranca una charla nueva (sin historial) si pasaron más de estas horas desde el último mensaje. */
const HORAS_DE_CHARLA = 12;
const MAX_TURNOS = 20;

/** La ficha sin los campos que viven en columnas propias. */
export type ConfigFicha = Omit<Ficha, "id" | "estado" | "whatsapp_phone_number_id">;

export interface FilaFicha {
  id: string;
  estado: "activo" | "pausado";
  whatsapp_phone_number_id: string | null;
  abono_usd_mes: number;
  config: ConfigFicha;
  borrador: ConfigFicha | null;
  version: number;
  actualizada: string;
}

export interface Conversacion {
  id: string;
  estado: "agente" | "humano";
}

export interface DetalleConversacion {
  id: string;
  ficha_id: string;
  telefono: string;
  numero_negocio: string | null;
  estado: "agente" | "humano";
  derivada_motivo: string | null;
  derivada_resumen: string | null;
  derivada_en: string | null;
  actualizada: string;
}

export interface FilaConversacion extends DetalleConversacion {
  mensajes: number;
  usd: number;
  ultimo_texto: string | null;
  ultimo_rol: string | null;
  ultimo_creado: string | null;
}

export interface MensajeGuardado {
  rol: "cliente" | "agente" | "humano";
  texto: string;
  herramientas: string[];
  usd: number;
  creado: string;
}

export interface MensajeAGuardar {
  conversacionId: string;
  fichaId: string;
  rol: "cliente" | "agente" | "humano";
  texto: string;
  waId?: string;
  herramientas?: string[];
  tokensEntrada?: number;
  tokensSalida?: number;
  usd?: number;
}

export interface Evento {
  ficha_id: string | null;
  conversacion_id: string | null;
  tipo: string;
  detalle: string | null;
  creado: string;
}

export interface ResumenMes {
  ficha_id: string;
  usd: number;
  mensajes: number;
  conversaciones: number;
  ultimo: string | null;
}

export interface VersionFicha {
  version: number;
  autor: string;
  nota: string | null;
  creado: string;
  config: ConfigFicha;
}

export interface Almacen {
  // Fichas
  fichaPorId(id: string): Promise<FilaFicha | null>;
  fichaPorNumero(phoneNumberId: string): Promise<FilaFicha | null>;
  listarFichas(): Promise<FilaFicha[]>;
  crearFicha(f: Omit<FilaFicha, "actualizada">): Promise<void>;
  actualizarFicha(id: string, cambios: Partial<Omit<FilaFicha, "id" | "actualizada">>): Promise<void>;
  historialFicha(id: string): Promise<VersionFicha[]>;
  agregarHistorial(id: string, version: number, config: ConfigFicha, autor: string, nota: string): Promise<void>;

  // Charlas
  conversacion(fichaId: string, telefono: string, numeroNegocio?: string): Promise<Conversacion>;
  detalleConversacion(id: string): Promise<DetalleConversacion | null>;
  /** La charla de esa persona con esa ficha, si existe (sin crearla). */
  buscarConversacion(fichaId: string, telefono: string): Promise<DetalleConversacion | null>;
  listarConversaciones(fichaId: string | null, soloDerivadas: boolean, limite: number): Promise<FilaConversacion[]>;
  mensajes(conversacionId: string): Promise<MensajeGuardado[]>;
  historial(conversacionId: string): Promise<Turno[]>;
  /** Guarda el mensaje. Devuelve false si ese mensaje de WhatsApp ya estaba (Meta lo reenvió). */
  guardar(m: MensajeAGuardar): Promise<boolean>;
  derivar(conversacionId: string, motivo: string, resumen: string): Promise<void>;
  /** Devuelve la charla al agente, conservando lo hablado. */
  liberar(conversacionId: string): Promise<void>;
  /** Devuelve la charla al agente y empieza de cero (el historial queda guardado, pero no se usa). */
  reiniciar(conversacionId: string): Promise<void>;

  // Consumo y eventos
  gastoDelMes(fichaId: string): Promise<number>;
  /** Gasto de IA de todos los clientes desde una fecha (para estimar el saldo de Claude). */
  gastoDesde(desde: Date): Promise<number>;
  resumenDelMes(): Promise<ResumenMes[]>;
  /** Cuántos mensajes mandó la persona y cuánto gastó el agente con ella desde una fecha. */
  actividad(conversacionId: string, desde: Date): Promise<{ mensajes: number; usd: number }>;
  evento(fichaId: string | null, conversacionId: string | null, tipo: string, detalle: string): Promise<void>;
  eventos(desde: Date, tipos?: string[]): Promise<Evento[]>;
  /** Chat público de la web: registra un mensaje de una conexión (IP anonimizada) y cuenta los recientes. */
  registrarAccesoWeb(fichaId: string, ipHash: string): Promise<void>;
  contarAccesosWeb(fichaId: string, ipHash: string | null, desde: Date): Promise<number>;
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
  const CAMPOS_FICHA = "id, estado, whatsapp_phone_number_id, abono_usd_mes, config, borrador, version, actualizada";
  const fila = (f: any): FilaFicha => ({ ...f, abono_usd_mes: Number(f.abono_usd_mes) });

  return {
    async fichaPorId(id) {
      const f = ok(await db.from("fichas").select(CAMPOS_FICHA).eq("id", id).maybeSingle());
      return f ? fila(f) : null;
    },
    async fichaPorNumero(phoneNumberId) {
      const f = ok(await db.from("fichas").select(CAMPOS_FICHA).eq("whatsapp_phone_number_id", phoneNumberId).maybeSingle());
      return f ? fila(f) : null;
    },
    async listarFichas() {
      return (ok(await db.from("fichas").select(CAMPOS_FICHA).order("id")) as any[]).map(fila);
    },
    async crearFicha(f) {
      ok(await db.from("fichas").insert(f));
    },
    async actualizarFicha(id, cambios) {
      ok(await db.from("fichas").update({ ...cambios, actualizada: new Date().toISOString() }).eq("id", id));
    },
    async historialFicha(id) {
      return ok(
        await db
          .from("fichas_historial")
          .select("version, autor, nota, creado, config")
          .eq("ficha_id", id)
          .order("version", { ascending: false })
          .limit(50),
      ) as VersionFicha[];
    },
    async agregarHistorial(id, version, config, autor, nota) {
      ok(await db.from("fichas_historial").insert({ ficha_id: id, version, config, autor, nota }));
    },

    async conversacion(fichaId, telefono, numeroNegocio) {
      const fila = {
        ficha_id: fichaId,
        telefono,
        actualizada: new Date().toISOString(),
        ...(numeroNegocio ? { numero_negocio: numeroNegocio } : {}),
      };
      return ok(
        await db
          .from("conversaciones")
          .upsert(fila, { onConflict: "ficha_id,telefono" })
          .select("id, estado")
          .single(),
      ) as Conversacion;
    },
    async detalleConversacion(id) {
      return ok(
        await db
          .from("conversaciones")
          .select("id, ficha_id, telefono, numero_negocio, estado, derivada_motivo, derivada_resumen, derivada_en, actualizada")
          .eq("id", id)
          .maybeSingle(),
      ) as DetalleConversacion | null;
    },
    async buscarConversacion(fichaId, telefono) {
      return ok(
        await db
          .from("conversaciones")
          .select("id, ficha_id, telefono, numero_negocio, estado, derivada_motivo, derivada_resumen, derivada_en, actualizada")
          .eq("ficha_id", fichaId)
          .eq("telefono", telefono)
          .maybeSingle(),
      ) as DetalleConversacion | null;
    },
    async listarConversaciones(fichaId, soloDerivadas, limite) {
      const filas = ok(
        await db.rpc("conversaciones_lista", { p_ficha: fichaId, p_solo_derivadas: soloDerivadas, p_limite: limite }),
      ) as any[];
      return filas.map((f) => ({ ...f, mensajes: Number(f.mensajes), usd: Number(f.usd) }));
    },
    async mensajes(conversacionId) {
      const filas = ok(
        await db
          .from("mensajes")
          .select("rol, texto, herramientas, usd, creado")
          .eq("conversacion_id", conversacionId)
          .order("creado", { ascending: false })
          .limit(300),
      ) as any[];
      return filas.reverse().map((f) => ({ ...f, usd: Number(f.usd) }));
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
    async liberar(conversacionId) {
      ok(await db.from("conversaciones").update({ estado: "agente" }).eq("id", conversacionId));
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
      return Number(ok(await db.rpc("gasto_mes", { p_ficha: fichaId })));
    },
    async gastoDesde(desde) {
      return Number(ok(await db.rpc("gasto_desde", { p_desde: desde.toISOString() })));
    },
    async resumenDelMes() {
      const filas = ok(await db.rpc("resumen_mes")) as any[];
      return filas.map((f) => ({ ...f, usd: Number(f.usd), mensajes: Number(f.mensajes), conversaciones: Number(f.conversaciones) }));
    },
    async actividad(conversacionId, desdeFecha) {
      const filas = ok(
        await db.from("mensajes").select("rol, usd").eq("conversacion_id", conversacionId).gte("creado", desdeFecha.toISOString()),
      ) as { rol: string; usd: number }[];
      return {
        mensajes: filas.filter((f) => f.rol === "cliente").length,
        usd: filas.reduce((s, f) => s + Number(f.usd), 0),
      };
    },
    async evento(fichaId, conversacionId, tipo, detalle) {
      // Un evento que no se puede guardar no debe cortar la atención.
      const r = await db
        .from("eventos")
        .insert({ ficha_id: fichaId, conversacion_id: conversacionId, tipo, detalle: detalle.slice(0, 1000) });
      if (r.error) console.error("No se pudo guardar el evento", r.error.message);
    },
    async registrarAccesoWeb(fichaId, ipHash) {
      ok(await db.from("accesos_web").insert({ ficha_id: fichaId, ip_hash: ipHash }));
    },
    async contarAccesosWeb(fichaId, ipHash, desdeFecha) {
      let q = db.from("accesos_web").select("id", { count: "exact", head: true }).eq("ficha_id", fichaId).gte("creado", desdeFecha.toISOString());
      if (ipHash) q = q.eq("ip_hash", ipHash);
      const r = await q;
      if (r.error) throw new Error(`Supabase: ${r.error.message}`);
      return r.count ?? 0;
    },
    async eventos(desdeFecha, tipos) {
      let q = db.from("eventos").select("ficha_id, conversacion_id, tipo, detalle, creado").gte("creado", desdeFecha.toISOString());
      if (tipos?.length) q = q.in("tipo", tipos);
      return ok(await q.order("creado", { ascending: false }).limit(200)) as Evento[];
    },
  };
}

/** Lee las fichas de la carpeta fichas/: semilla para probar sin Supabase. */
export function fichasDeArchivos(): FilaFicha[] {
  const dir = path.join(RAIZ, "fichas");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((a) => a.endsWith(".json"))
    .map((a) => {
      const { id, estado, whatsapp_phone_number_id, ...config } = JSON.parse(readFileSync(path.join(dir, a), "utf8")) as Ficha;
      return {
        id,
        estado,
        whatsapp_phone_number_id: whatsapp_phone_number_id ?? null,
        abono_usd_mes: 0,
        config,
        borrador: null,
        version: 1,
        actualizada: new Date().toISOString(),
      };
    });
}

function almacenEnMemoria(): Almacen {
  const ahora = () => new Date().toISOString();
  const fichas = new Map(fichasDeArchivos().map((f) => [f.id, f]));
  const versiones: (VersionFicha & { ficha_id: string })[] = [...fichas.values()].map((f) => ({
    ficha_id: f.id,
    version: 1,
    autor: "archivo",
    nota: "Versión inicial",
    creado: ahora(),
    config: f.config,
  }));
  const convs = new Map<string, DetalleConversacion & { reiniciada?: number }>();
  const msgs: (MensajeAGuardar & { creado: number })[] = [];
  const evs: Evento[] = [];
  const accesos: { fichaId: string; ipHash: string; creado: number }[] = [];
  const inicioMes = () => {
    const d = new Date();
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  };
  const sinReinicio = ({ reiniciada: _, ...c }: DetalleConversacion & { reiniciada?: number }): DetalleConversacion => c;

  return {
    async fichaPorId(id) {
      return structuredClone(fichas.get(id) ?? null);
    },
    async fichaPorNumero(n) {
      return structuredClone([...fichas.values()].find((f) => f.whatsapp_phone_number_id === n) ?? null);
    },
    async listarFichas() {
      return structuredClone([...fichas.values()].sort((a, b) => a.id.localeCompare(b.id)));
    },
    async crearFicha(f) {
      if (fichas.has(f.id)) throw new Error("Ya existe una ficha con ese id");
      fichas.set(f.id, { ...structuredClone(f), actualizada: ahora() });
    },
    async actualizarFicha(id, cambios) {
      const f = fichas.get(id);
      if (f) Object.assign(f, structuredClone(cambios), { actualizada: ahora() });
    },
    async historialFicha(id) {
      return structuredClone(versiones.filter((h) => h.ficha_id === id).sort((a, b) => b.version - a.version));
    },
    async agregarHistorial(id, version, config, autor, nota) {
      versiones.push({ ficha_id: id, version, config: structuredClone(config), autor, nota, creado: ahora() });
    },

    async conversacion(fichaId, telefono, numeroNegocio) {
      let c = [...convs.values()].find((x) => x.ficha_id === fichaId && x.telefono === telefono);
      if (!c) {
        c = {
          id: `00000000-0000-4000-8000-${String(convs.size + 1).padStart(12, "0")}`,
          ficha_id: fichaId,
          telefono,
          numero_negocio: numeroNegocio ?? null,
          estado: "agente",
          derivada_motivo: null,
          derivada_resumen: null,
          derivada_en: null,
          actualizada: ahora(),
        };
        convs.set(c.id, c);
      }
      return { id: c.id, estado: c.estado };
    },
    async detalleConversacion(id) {
      const c = convs.get(id);
      return c ? structuredClone(sinReinicio(c)) : null;
    },
    async buscarConversacion(fichaId, telefono) {
      const c = [...convs.values()].find((x) => x.ficha_id === fichaId && x.telefono === telefono);
      return c ? structuredClone(sinReinicio(c)) : null;
    },
    async listarConversaciones(fichaId, soloDerivadas, limite) {
      return [...convs.values()]
        .filter((c) => (!fichaId || c.ficha_id === fichaId) && (!soloDerivadas || c.estado === "humano"))
        .map((c) => {
          const propios = msgs.filter((m) => m.conversacionId === c.id);
          const u = propios.at(-1);
          return {
            ...sinReinicio(c),
            mensajes: propios.length,
            usd: propios.reduce((s, m) => s + (m.usd ?? 0), 0),
            ultimo_texto: u?.texto ?? null,
            ultimo_rol: u?.rol ?? null,
            ultimo_creado: u ? new Date(u.creado).toISOString() : null,
          };
        })
        .sort((a, b) => (b.ultimo_creado ?? b.actualizada).localeCompare(a.ultimo_creado ?? a.actualizada))
        .slice(0, limite);
    },
    async mensajes(id) {
      return msgs
        .filter((m) => m.conversacionId === id)
        .map((m) => ({ rol: m.rol, texto: m.texto, herramientas: m.herramientas ?? [], usd: m.usd ?? 0, creado: new Date(m.creado).toISOString() }));
    },
    async historial(id) {
      const limite = Math.max(Date.now() - HORAS_DE_CHARLA * 3600_000, convs.get(id)?.reiniciada ?? 0);
      return msgs
        .filter((m) => m.conversacionId === id && m.creado > limite)
        .slice(-MAX_TURNOS)
        .map((m) => ({ rol: m.rol === "cliente" ? "cliente" : "agente", texto: m.texto }));
    },
    async guardar(m) {
      if (m.waId && msgs.some((x) => x.waId === m.waId)) return false;
      msgs.push({ ...m, creado: Date.now() });
      return true;
    },
    async derivar(id, motivo, resumen) {
      const c = convs.get(id);
      if (c) Object.assign(c, { estado: "humano", derivada_motivo: motivo, derivada_resumen: resumen, derivada_en: ahora() });
    },
    async liberar(id) {
      const c = convs.get(id);
      if (c) c.estado = "agente";
    },
    async reiniciar(id) {
      const c = convs.get(id);
      if (c) Object.assign(c, { estado: "agente", reiniciada: Date.now(), derivada_motivo: null, derivada_resumen: null });
    },

    async gastoDesde(desde) {
      return msgs.filter((m) => m.creado >= desde.getTime()).reduce((s, m) => s + (m.usd ?? 0), 0);
    },
    async gastoDelMes(fichaId) {
      return msgs.filter((m) => m.fichaId === fichaId && m.creado >= inicioMes()).reduce((s, m) => s + (m.usd ?? 0), 0);
    },
    async resumenDelMes() {
      const por = new Map<string, ResumenMes & { convs: Set<string> }>();
      for (const m of msgs.filter((x) => x.creado >= inicioMes())) {
        const r = por.get(m.fichaId) ?? { ficha_id: m.fichaId, usd: 0, mensajes: 0, conversaciones: 0, ultimo: null, convs: new Set<string>() };
        r.usd += m.usd ?? 0;
        if (m.rol === "cliente") r.mensajes++;
        r.convs.add(m.conversacionId);
        r.ultimo = new Date(m.creado).toISOString();
        por.set(m.fichaId, r);
      }
      return [...por.values()].map(({ convs: c, ...r }) => ({ ...r, conversaciones: c.size }));
    },
    async actividad(id, desdeFecha) {
      const propios = msgs.filter((m) => m.conversacionId === id && m.creado >= desdeFecha.getTime());
      return {
        mensajes: propios.filter((m) => m.rol === "cliente").length,
        usd: propios.reduce((s, m) => s + (m.usd ?? 0), 0),
      };
    },
    async evento(fichaId, conversacionId, tipo, detalle) {
      evs.unshift({ ficha_id: fichaId, conversacion_id: conversacionId, tipo, detalle, creado: ahora() });
    },
    async registrarAccesoWeb(fichaId, ipHash) {
      accesos.push({ fichaId, ipHash, creado: Date.now() });
    },
    async contarAccesosWeb(fichaId, ipHash, desdeFecha) {
      return accesos.filter((a) => a.fichaId === fichaId && (!ipHash || a.ipHash === ipHash) && a.creado >= desdeFecha.getTime()).length;
    },
    async eventos(desdeFecha, tipos) {
      return evs.filter((e) => e.creado >= desdeFecha.toISOString() && (!tipos?.length || tipos.includes(e.tipo)));
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
