// Cola de publicaciones de Instagram. Solo publica lo que una persona marcó "aprobado", a la hora fijada, y anota el resultado.
// Lo que la API no permite (piezas hechas con IA mientras no esté comprobada la etiqueta, música, colaboradores) no se
// publica: a la hora se avisa al equipo para subirlo a mano desde la app.
// Pasos de Meta: crear el contenedor (POST /<cuenta>/media) → esperar que esté listo → publicarlo (POST /<cuenta>/media_publish).
import { obtenerAlmacen } from "./almacen.js";
import { avisarEquipo } from "./avisos.js";
import { cargarFicha } from "./fichas.js";
import { ErrorInstagram, graph, tokenDe } from "./instagram.js";
import type { Ficha, Publicacion } from "./tipos.js";

/** Si la tarea no corrió a tiempo (internet, Vercel), hasta cuánto después de la hora todavía se publica. */
export const TOLERANCIA_MS = 2 * 3600_000;
/** Un contenedor que Meta no termina de preparar en este tiempo se da por fallido. */
const ESPERA_MAXIMA_MS = 60 * 60_000;
/** Si una publicación quedó "publicando" más que esto (se cortó la tarea en el medio), hay que revisar a mano. */
const PUBLICANDO_TRABADA_MS = 15 * 60_000;
const MAX_INTENTOS = 3;

export interface ResumenCola {
  publicadas: number;
  esperando: number;
  manuales: number;
  vencidas: number;
  errores: number;
}

/** Errores de Meta que suelen pasar solos (límite de pedidos, servicio ocupado, contenedor todavía no listo). */
const esPasajero = (e: unknown) => e instanceof ErrorInstagram && [1, 2, 4, 17, 32, 341, 9004, 9007].includes(e.codigo ?? 0);

const hora = (iso: string) => new Date(iso).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", dateStyle: "short", timeStyle: "short" });

export async function correrCola(ahora = Date.now()): Promise<ResumenCola> {
  const almacen = obtenerAlmacen();
  const r: ResumenCola = { publicadas: 0, esperando: 0, manuales: 0, vencidas: 0, errores: 0 };
  const pendientes = await almacen.publicaciones({ estados: ["aprobado", "procesando", "publicando"], limite: 50 });
  for (const p of pendientes) {
    if (p.estado === "aprobado" && Date.parse(p.hora) > ahora) continue;
    try {
      const ficha = await cargarFicha(p.ficha_id);
      const resultado = await avanzar(p, ficha, ahora);
      if (resultado) r[resultado]++;
    } catch (e) {
      console.error(`Cola · publicación ${p.id}`, e);
      r.errores++;
      await fallar(p, e, p.estado === "publicando" ? ["publicando"] : ["aprobado", "procesando"]);
    }
  }
  return r;
}

async function avanzar(p: Publicacion, ficha: Ficha, ahora: number): Promise<keyof ResumenCola | null> {
  const almacen = obtenerAlmacen();
  const ig = ficha.instagram;
  if (!ig) throw new Error(`La ficha ${ficha.id} no tiene Instagram configurado`);

  if (p.estado === "aprobado") {
    if (ahora - Date.parse(p.hora) > TOLERANCIA_MS) {
      if (await almacen.cambiarPublicacion(p.id, ["aprobado"], { estado: "vencida", error: "La tarea no corrió a tiempo: no se publica fuera de hora." })) {
        await avisarEquipo(ficha.id, null, "Publicación vencida", `La pieza de las ${hora(p.hora)} no salió a tiempo y no se publicó. Elegí otra hora y aprobala de nuevo.`);
      }
      return "vencidas";
    }
    const motivoManual = p.manual_motivo ?? (p.hecha_con_ia && !ig.etiqueta_ia_api ? "es una pieza hecha con IA: subila desde la app con la etiqueta \"Información de IA\"" : null);
    if (motivoManual) {
      if (await almacen.cambiarPublicacion(p.id, ["aprobado"], { estado: "manual", error: motivoManual })) {
        await avisarEquipo(ficha.id, null, "Publicación para subir a mano", `Es la hora de la pieza de las ${hora(p.hora)}: ${motivoManual}. Texto: ${p.texto}`);
      }
      return "manuales";
    }
    // "Tomar" la publicación: si otra tarea ya la tomó, esta no hace nada.
    const tomada = await almacen.cambiarPublicacion(p.id, ["aprobado"], { estado: "procesando", intentos: p.intentos + 1, error: null });
    if (!tomada) return null;
    const token = await tokenDe(ficha);
    const contenedor = await crearContenedor(tomada, ig.ig_user_id, token, ig.etiqueta_ia_api);
    p = (await almacen.cambiarPublicacion(p.id, ["procesando"], { contenedor })) ?? tomada;
  }

  if (p.estado === "publicando") {
    // Se cortó a mitad de camino: no se reintenta para no publicar dos veces.
    if (ahora - Date.parse(p.actualizado) > PUBLICANDO_TRABADA_MS) {
      await fallar(p, new Error("Se cortó mientras se publicaba. Revisá en Instagram si salió antes de volver a aprobarla."), ["publicando"]);
      return "errores";
    }
    return "esperando";
  }

  // procesando: Meta tiene que terminar de preparar el contenedor.
  const token = await tokenDe(ficha);
  const cuenta = ig.ig_user_id;
  const estado = (await graph(token, String(p.contenedor), { params: { fields: "status_code,status" } })).status_code as string | undefined;
  if (estado === "ERROR" || estado === "EXPIRED") throw new Error(`Instagram no pudo preparar la publicación (${estado}).`);
  if (estado && estado !== "FINISHED") {
    if (ahora - Date.parse(p.actualizado) > ESPERA_MAXIMA_MS) throw new Error("Instagram tardó más de una hora en preparar el video.");
    return "esperando";
  }
  const limite = (await graph(token, `${cuenta}/content_publishing_limit`, { params: { fields: "quota_usage,config" } }).catch(() => null))?.data?.[0];
  if (limite && limite.quota_usage >= (limite.config?.quota_total ?? Infinity)) return "esperando";

  const publicando = await almacen.cambiarPublicacion(p.id, ["procesando"], { estado: "publicando" });
  if (!publicando) return null;
  const { id } = await graph(token, `${cuenta}/media_publish`, { metodo: "POST", cuerpo: { creation_id: p.contenedor } });
  const permalink = (await graph(token, String(id), { params: { fields: "permalink" } }).catch(() => null))?.permalink ?? null;
  await almacen.cambiarPublicacion(p.id, ["publicando"], { estado: "publicado", media_id: String(id), permalink, error: null });
  await almacen.evento(ficha.id, null, "publicacion", `Publicada la pieza de las ${hora(p.hora)}${permalink ? `: ${permalink}` : ""}`);
  return "publicadas";
}

/** Crea el contenedor de Meta para cada tipo de pieza. Devuelve su id. */
async function crearContenedor(p: Publicacion, cuenta: string, token: string, etiquetaIa: boolean): Promise<string> {
  const ia = p.hecha_con_ia && etiquetaIa ? { is_ai_generated: true } : {};
  const medio = (m: Publicacion["medios"][number]) => (m.tipo === "video" ? { video_url: m.url } : { image_url: m.url });
  const crear = async (cuerpo: Record<string, unknown>) => String((await graph(token, `${cuenta}/media`, { metodo: "POST", cuerpo })).id);
  if (!p.medios.length) throw new Error("La publicación no tiene fotos ni videos.");

  switch (p.tipo) {
    case "imagen":
      return crear({ image_url: p.medios[0].url, caption: p.texto, ...ia });
    case "reel":
      return crear({ media_type: "REELS", video_url: p.medios[0].url, caption: p.texto, share_to_feed: true, ...ia });
    case "historia":
      return crear({ media_type: "STORIES", ...medio(p.medios[0]), ...ia });
    case "carrusel": {
      if (p.medios.length < 2 || p.medios.length > 10) throw new Error("Un carrusel lleva de 2 a 10 fotos o videos.");
      const hijos: string[] = [];
      for (const m of p.medios) hijos.push(await crear({ is_carousel_item: true, ...(m.tipo === "video" ? { media_type: "VIDEO" } : {}), ...medio(m) }));
      // La etiqueta de IA va en el carrusel, nunca en cada foto (Meta da error).
      return crear({ media_type: "CAROUSEL", children: hijos.join(","), caption: p.texto, ...ia });
    }
  }
}

/** Anota el error. Si es de los que pasan solos y quedan intentos, vuelve a "aprobado" para la próxima vuelta. */
async function fallar(p: Publicacion, e: unknown, desde: Publicacion["estado"][]): Promise<void> {
  const almacen = obtenerAlmacen();
  const mensaje = (e as Error).message.slice(0, 500);
  if (esPasajero(e) && p.intentos < MAX_INTENTOS && desde[0] !== "publicando") {
    await almacen.cambiarPublicacion(p.id, desde, { estado: "aprobado", contenedor: null, error: `Reintento: ${mensaje}` });
    return;
  }
  if (await almacen.cambiarPublicacion(p.id, desde, { estado: "error", error: mensaje })) {
    await avisarEquipo(p.ficha_id, null, "Una publicación no salió", `La pieza de las ${hora(p.hora)}: ${mensaje}`);
  }
}
