// Panel de gobierno de la agencia (página en public/panel.html). Todo entra por POST con {accion, ...}.
// Solo funciona con sesión (PANEL_CLAVE). Pedir JSON + cookie SameSite=Strict evita que otra web actúe en nombre de uno.
import { obtenerAlmacen, type ConfigFicha, type FilaFicha } from "../src/almacen.js";
import { camposDePlantilla, fichaDesdeFila, MODELOS, plantillasDisponibles, validarFicha } from "../src/fichas.js";
import { REGISTRO } from "../src/herramientas/index.js";
import { COOKIE_SALIR, entrar, sesionValida } from "../src/sesion.js";
import { LIMITES_POR_DEFECTO } from "../src/tipos.js";
import { enviarTexto } from "../src/whatsapp.js";

type Cuerpo = Record<string, any>;
const json = (datos: unknown, status = 200, extra: HeadersInit = {}) =>
  Response.json(datos, { status, headers: { "cache-control": "no-store", ...extra } });
const falla = (mensaje: string, status = 400) => json({ error: mensaje }, status);

export async function POST(request: Request): Promise<Response> {
  if (!(request.headers.get("content-type") ?? "").includes("application/json")) return falla("Pedido inválido");
  let b: Cuerpo;
  try {
    b = await request.json();
  } catch {
    return falla("Pedido inválido");
  }

  if (b.accion === "entrar") {
    const r = await entrar(request, String(b.clave ?? ""));
    return "error" in r ? falla(r.error, r.status) : json({ ok: true }, 200, { "set-cookie": r.cookie });
  }
  if (b.accion === "salir") return json({ ok: true }, 200, { "set-cookie": COOKIE_SALIR });
  if (!sesionValida(request)) return falla("Sesión vencida. Entrá de nuevo.", 401);

  const accion = ACCIONES[String(b.accion)];
  if (!accion) return falla("Acción desconocida");
  try {
    return await accion(b);
  } catch (e) {
    console.error(`Panel · ${b.accion}`, e);
    return falla((e as Error).message, 500);
  }
}

async function fichaOFalla(id: unknown): Promise<FilaFicha> {
  const f = await obtenerAlmacen().fichaPorId(String(id ?? ""));
  if (!f) throw new Error("No existe esa ficha");
  return f;
}

const minutosDesde = (iso: string | null) => (iso ? Math.round((Date.now() - Date.parse(iso)) / 60_000) : null);

const ACCIONES: Record<string, (b: Cuerpo) => Promise<Response>> = {
  /** Tablero: todos los clientes con su semáforo, consumo y margen; más las alertas. */
  async tablero() {
    const almacen = obtenerAlmacen();
    const hace24 = new Date(Date.now() - 24 * 3600_000);
    const [fichas, resumen, problemas, derivadas] = await Promise.all([
      almacen.listarFichas(),
      almacen.resumenDelMes(),
      almacen.eventos(hace24, ["error", "tope_mes"]),
      almacen.listarConversaciones(null, true, 500),
    ]);
    const clientes = fichas.map((f) => {
      const r = resumen.find((x) => x.ficha_id === f.id);
      const gasto = r?.usd ?? 0;
      const errores = problemas.filter((e) => e.ficha_id === f.id).length;
      const pendientes = derivadas.filter((d) => d.ficha_id === f.id).length;
      const semaforo = f.estado === "pausado" ? "gris" : errores || gasto >= f.config.tope_usd_mes ? "rojo" : pendientes ? "amarillo" : "verde";
      return {
        id: f.id,
        nombre: f.config.nombre,
        rubro: f.config.rubro,
        estado: f.estado,
        semaforo,
        version: f.version,
        hay_borrador: !!f.borrador,
        whatsapp: !!f.whatsapp_phone_number_id,
        gasto_mes: gasto,
        tope_mes: f.config.tope_usd_mes,
        abono_mes: f.abono_usd_mes,
        mensajes_mes: r?.mensajes ?? 0,
        charlas_mes: r?.conversaciones ?? 0,
        ultimo_mensaje: r?.ultimo ?? null,
        errores_24h: errores,
        derivadas_pendientes: pendientes,
      };
    });
    const nombre = (id: string | null) => fichas.find((f) => f.id === id)?.config.nombre ?? id;
    const alertas = [
      ...derivadas.map((d) => ({
        tipo: "derivada",
        ficha_id: d.ficha_id,
        cliente: nombre(d.ficha_id),
        conversacion_id: d.id,
        detalle: `${d.derivada_motivo ?? "derivada"}: ${d.derivada_resumen ?? ""}`,
        minutos: minutosDesde(d.derivada_en),
      })),
      ...problemas.map((e) => ({
        tipo: e.tipo,
        ficha_id: e.ficha_id,
        cliente: nombre(e.ficha_id),
        conversacion_id: e.conversacion_id,
        detalle: e.detalle,
        minutos: minutosDesde(e.creado),
      })),
    ].sort((a, b) => (a.minutos ?? 0) - (b.minutos ?? 0));
    return json({ clientes, alertas });
  },

  async conversaciones(b) {
    const lista = await obtenerAlmacen().listarConversaciones(b.ficha_id ? String(b.ficha_id) : null, !!b.solo_derivadas, 100);
    return json({ conversaciones: lista });
  },

  async conversacion(b) {
    const almacen = obtenerAlmacen();
    const c = await almacen.detalleConversacion(String(b.id ?? ""));
    if (!c) return falla("No existe esa charla", 404);
    return json({ conversacion: c, mensajes: await almacen.mensajes(c.id) });
  },

  /** Devuelve la charla al agente (después de que la atendió una persona). */
  async liberar(b) {
    const almacen = obtenerAlmacen();
    const c = await almacen.detalleConversacion(String(b.id ?? ""));
    if (!c) return falla("No existe esa charla", 404);
    await almacen.liberar(c.id);
    await almacen.evento(c.ficha_id, c.id, "liberada", "Desde el panel");
    return json({ ok: true });
  },

  /** Una persona del equipo le escribe al cliente por WhatsApp desde el panel. La charla queda en manos humanas. */
  async responder(b) {
    const almacen = obtenerAlmacen();
    const texto = String(b.texto ?? "").trim().slice(0, 4000);
    if (!texto) return falla("Escribí un mensaje");
    const c = await almacen.detalleConversacion(String(b.id ?? ""));
    if (!c) return falla("No existe esa charla", 404);
    if (c.telefono.startsWith("web-")) return falla("Es una charla del chat web de prueba: no se le puede escribir.");
    if (!c.numero_negocio) return falla("No se sabe por qué número entró esta charla.");
    try {
      await enviarTexto(c.numero_negocio, c.telefono, texto);
    } catch (e) {
      const m = (e as Error).message;
      // Meta solo deja escribir libremente hasta 24 h después del último mensaje del cliente.
      if (m.includes("131047")) return falla("Pasaron más de 24 horas desde el último mensaje del cliente: WhatsApp no deja escribirle sin una plantilla aprobada.");
      throw e;
    }
    if (c.estado !== "humano") await almacen.derivar(c.id, "tomada", "Una persona tomó la charla desde el panel.");
    await almacen.guardar({ conversacionId: c.id, fichaId: c.ficha_id, rol: "humano", texto });
    return json({ ok: true });
  },

  /** Pausar o activar un agente (por ejemplo, por falta de pago). */
  async estado(b) {
    const f = await fichaOFalla(b.id);
    const estado = b.estado === "activo" ? "activo" : "pausado";
    if (estado === "activo") {
      const problemas = validarFicha(fichaDesdeFila(f));
      if (problemas.length) return falla(`No se puede activar: ${problemas.join(" ")}`);
    }
    await obtenerAlmacen().actualizarFicha(f.id, { estado });
    await obtenerAlmacen().evento(f.id, null, estado === "activo" ? "activado" : "pausado", "Desde el panel");
    return json({ ok: true });
  },

  /** Todo lo necesario para editar una ficha. */
  async ficha(b) {
    const f = await fichaOFalla(b.id);
    const config = f.borrador ?? f.config;
    return json({
      ficha: f,
      historial: (await obtenerAlmacen().historialFicha(f.id)).map(({ config: _, ...v }) => v),
      opciones: {
        modelos: MODELOS,
        plantillas: plantillasDisponibles(),
        herramientas: Object.values(REGISTRO).map((h) => ({ nombre: h.definicion.name, descripcion: h.definicion.description })),
        campos: plantillasDisponibles().includes(config.plantilla) ? camposDePlantilla(config.plantilla) : [],
        limites: LIMITES_POR_DEFECTO,
      },
      problemas: validarFicha(fichaDesdeFila(f, true)),
    });
  },

  /** Guarda cambios como borrador (no afectan al agente hasta publicar). Abono y número de WhatsApp se guardan directo. */
  async guardar(b) {
    const f = await fichaOFalla(b.id);
    const cambios: Partial<FilaFicha> = {};
    if (b.config) {
      const config = b.config as ConfigFicha;
      if (typeof config !== "object" || typeof config.datos !== "object") return falla("La ficha no tiene el formato esperado");
      cambios.borrador = config;
    }
    if (b.abono_usd_mes !== undefined) cambios.abono_usd_mes = Math.max(0, Number(b.abono_usd_mes) || 0);
    if (b.whatsapp_phone_number_id !== undefined) {
      const n = String(b.whatsapp_phone_number_id ?? "").trim();
      if (n && !/^\d{6,20}$/.test(n)) return falla("El Phone number ID de Meta son solo números.");
      cambios.whatsapp_phone_number_id = n || null;
    }
    await obtenerAlmacen().actualizarFicha(f.id, cambios);
    const actualizada = await fichaOFalla(f.id);
    return json({ ok: true, problemas: validarFicha(fichaDesdeFila(actualizada, true)) });
  },

  /** El borrador pasa a ser la versión activa. Queda en el historial con una nota. */
  async publicar(b) {
    const f = await fichaOFalla(b.id);
    if (!f.borrador) return falla("No hay cambios para publicar");
    const problemas = validarFicha(fichaDesdeFila(f, true));
    if (problemas.length) return falla(`Hay que corregir antes de publicar: ${problemas.join(" ")}`);
    const nota = String(b.nota ?? "").trim().slice(0, 300);
    if (nota.length < 3) return falla("Escribí qué cambiaste (queda en el historial)");
    const version = f.version + 1;
    const almacen = obtenerAlmacen();
    await almacen.agregarHistorial(f.id, version, f.borrador, String(b.autor ?? "panel").slice(0, 60) || "panel", nota);
    await almacen.actualizarFicha(f.id, { config: f.borrador, borrador: null, version });
    await almacen.evento(f.id, null, "publicacion", `v${version}: ${nota}`);
    return json({ ok: true, version });
  },

  async descartar(b) {
    const f = await fichaOFalla(b.id);
    await obtenerAlmacen().actualizarFicha(f.id, { borrador: null });
    return json({ ok: true });
  },

  /** Carga una versión anterior como borrador, para probarla y volver a publicarla. */
  async restaurar(b) {
    const f = await fichaOFalla(b.id);
    const v = (await obtenerAlmacen().historialFicha(f.id)).find((x) => x.version === Number(b.version));
    if (!v) return falla("No existe esa versión");
    await obtenerAlmacen().actualizarFicha(f.id, { borrador: v.config });
    return json({ ok: true });
  },

  /** Cliente nuevo a partir de la plantilla de su rubro. Arranca pausado y en borrador. */
  async crear(b) {
    const id = String(b.id ?? "").trim().toLowerCase();
    const nombre = String(b.nombre ?? "").trim();
    const plantilla = String(b.plantilla ?? "");
    if (!/^[a-z0-9-]{2,40}$/.test(id)) return falla("El id va en minúsculas, sin espacios ni acentos (ej. clinica-sonrisa)");
    if (!nombre) return falla("Falta el nombre del negocio");
    if (!plantillasDisponibles().includes(plantilla)) return falla("Elegí una plantilla");
    if (await obtenerAlmacen().fichaPorId(id)) return falla("Ya existe un cliente con ese id");
    const config: ConfigFicha = {
      nombre,
      rubro: plantilla,
      plantilla,
      modelo: MODELOS[0],
      esfuerzo: "low",
      tope_usd_mes: 30,
      limites: { ...LIMITES_POR_DEFECTO },
      herramientas: ["derivar_a_persona"],
      datos: Object.fromEntries(camposDePlantilla(plantilla).map((c) => [c, ""])),
    };
    await obtenerAlmacen().crearFicha({
      id,
      estado: "pausado",
      whatsapp_phone_number_id: null,
      abono_usd_mes: Math.max(0, Number(b.abono_usd_mes) || 0),
      config,
      borrador: config,
      version: 0,
    });
    await obtenerAlmacen().evento(id, null, "alta", `Cliente nuevo desde la plantilla ${plantilla}`);
    return json({ ok: true, id });
  },

  async opciones() {
    return json({ plantillas: plantillasDisponibles(), modelos: MODELOS });
  },

  async eventos(b) {
    const dias = Math.min(30, Math.max(1, Number(b.dias) || 7));
    const lista = await obtenerAlmacen().eventos(new Date(Date.now() - dias * 24 * 3600_000));
    return json({ eventos: lista.filter((e) => e.tipo !== "login_fallido" && (!b.ficha_id || e.ficha_id === b.ficha_id)) });
  },
};
