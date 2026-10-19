// Cola de publicaciones de Instagram desde la compu (con SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en motor/.env).
//   npm run cola -- listar [ficha]
//   npm run cola -- agregar pieza.json        sube las fotos/videos y la deja en BORRADOR
//   npm run cola -- aprobar <id> "<quién>"     la cola la publica sola a su hora
//   npm run cola -- cancelar <id>
// pieza.json: { "ficha": "gozza", "tipo": "reel" | "imagen" | "carrusel" | "historia", "hora": "2026-10-21T10:30:00-03:00",
//   "texto": "...", "medios": ["ruta/al/video.mp4" o "https://..."], "hecha_con_ia": false, "manual_motivo": null }
import "./entorno.js";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import path from "node:path";
import { obtenerAlmacen } from "../src/almacen.js";
import type { NuevaPublicacion, TipoPublicacion } from "../src/tipos.js";

const [comando, ...args] = process.argv.slice(2);
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en motor/.env (la cola vive en Supabase).");
  process.exit(1);
}
const almacen = obtenerAlmacen();
const TIPOS: TipoPublicacion[] = ["imagen", "reel", "carrusel", "historia"];
const CONTENIDO: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".mp4": "video/mp4", ".mov": "video/quicktime" };

/** Sube un archivo local al depósito público "publicaciones" (Instagram lo baja de ahí). Las direcciones https quedan como están. */
async function subir(ficha: string, medio: string): Promise<{ url: string; tipo: "imagen" | "video" }> {
  const ext = path.extname(medio.split("?")[0]).toLowerCase();
  const tipo = [".mp4", ".mov"].includes(ext) ? "video" : "imagen";
  if (tipo === "imagen" && ![".jpg", ".jpeg"].includes(ext)) throw new Error(`Instagram solo acepta fotos JPEG: ${medio}`);
  if (/^https:\/\//.test(medio)) return { url: medio, tipo };
  const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const destino = `${ficha}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
  const r = await db.storage.from("publicaciones").upload(destino, readFileSync(medio), { contentType: CONTENIDO[ext] });
  if (r.error) throw new Error(`No se pudo subir ${medio}: ${r.error.message}`);
  return { url: db.storage.from("publicaciones").getPublicUrl(destino).data.publicUrl, tipo };
}

const hora = (iso: string) => new Date(iso).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", dateStyle: "short", timeStyle: "short" });

if (comando === "listar") {
  for (const p of await almacen.publicaciones({ fichaId: args[0], limite: 200 })) {
    console.log(`${p.id}  ${hora(p.hora)}  ${p.tipo.padEnd(8)} ${p.estado.padEnd(10)} ${p.hecha_con_ia ? "IA " : ""}${p.texto.slice(0, 50).replace(/\n/g, " ")}${p.error ? `  ⚠ ${p.error}` : ""}${p.permalink ? `  ${p.permalink}` : ""}`);
  }
} else if (comando === "agregar") {
  const pieza = JSON.parse(readFileSync(args[0], "utf8"));
  if (!TIPOS.includes(pieza.tipo)) throw new Error(`Tipo inválido: ${pieza.tipo}`);
  if (Number.isNaN(Date.parse(pieza.hora)) || !/[+-]\d\d:\d\d$|Z$/.test(pieza.hora)) throw new Error("La hora va con zona, ej. 2026-10-21T10:30:00-03:00");
  const base = path.dirname(path.resolve(args[0]));
  const medios = [];
  for (const m of pieza.medios ?? []) medios.push(await subir(pieza.ficha, /^https:\/\//.test(m) ? m : path.resolve(base, m)));
  const nueva: NuevaPublicacion = {
    ficha_id: pieza.ficha,
    tipo: pieza.tipo,
    medios,
    texto: String(pieza.texto ?? ""),
    hora: new Date(pieza.hora).toISOString(),
    hecha_con_ia: !!pieza.hecha_con_ia,
    manual_motivo: pieza.manual_motivo ?? null,
  };
  const p = await almacen.crearPublicacion(nueva);
  console.log(`En borrador: ${p.id} · ${hora(p.hora)} · ${p.tipo}${p.hecha_con_ia ? " · hecha con IA (se sube a mano)" : ""}`);
} else if (comando === "aprobar") {
  const [id, por] = args;
  if (!id || !por) throw new Error('Uso: npm run cola -- aprobar <id> "<quién la aprueba>"');
  const p = await almacen.cambiarPublicacion(id, ["borrador"], { estado: "aprobado", aprobada_por: por, aprobada_en: new Date().toISOString() });
  if (!p) throw new Error("Solo se aprueba una publicación en borrador.");
  await almacen.evento(p.ficha_id, null, "publicacion", `Aprobada por ${por} para ${p.hora}`);
  console.log(`Aprobada: sale el ${hora(p.hora)}.`);
} else if (comando === "cancelar") {
  const p = await almacen.cambiarPublicacion(args[0], ["borrador", "aprobado", "manual", "vencida", "error"], { estado: "cancelado" });
  console.log(p ? "Cancelada." : "Esa publicación ya salió o se está publicando.");
} else {
  console.log("Comandos: listar [ficha] · agregar pieza.json · aprobar <id> \"<quién>\" · cancelar <id>");
}
