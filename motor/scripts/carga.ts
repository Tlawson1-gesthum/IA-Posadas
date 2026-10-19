// Prueba de carga del agente de una distribuidora (paso 29). Uso:
//   npm run carga -- distri-demo 6000 [--minutos 20] [--base http://127.0.0.1:8797]
// Manda N avisos de WhatsApp firmados como Meta al mismo webhook de producción (api/whatsapp.ts), repartidos en un "día"
// comprimido a 20 minutos con dos picos (mediodía y tarde), 10 % de audios, 2 % de fotos y 3 % de avisos repetidos por Meta.
// Cada cliente manda tandas de 1 a 3 mensajes ("hola" / el pedido / "gracias") como en la vida real.
// Con CLAUDE_SIMULAR=1 (de fábrica) no se llama a Claude: una respuesta fija que tarda ~2,5 s y que, si el texto es un pedido,
// cotiza y lo carga con las herramientas de verdad contra el sistema (por eso hace falta una copia del sistema andando:
// en pensa-distribuidoras, `node scripts/distri/carga-local.mjs --preparar 700` y después `node scripts/distri/carga-local.mjs`).
// WhatsApp simulado (no sale nada), charlas en memoria (sin Supabase). Mide: respuesta por mensaje (p50/p95), tiempo al pedido,
// errores por minuto, pedidos y avisos duplicados y filas escritas en la base del sistema.
// Con Claude real (--real) cuesta plata: solo con el OK de Tomás.
import "./entorno.js";
import { createHmac, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { RAIZ } from "../src/raiz.js";

const args = process.argv.slice(2);
const opcion = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const fichaId = args[0] ?? "distri-demo";
const N = Math.max(10, Number(args[1]) || 6000);
const MINUTOS = Number(opcion("--minutos") ?? 20);
const REAL = args.includes("--real");
const RUN = "carga" + Date.now().toString(36);

// todo en la compu: sin Supabase, WhatsApp simulado y (salvo --real) sin Claude
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
process.env.WHATSAPP_SIMULAR = "1";
if (!REAL) process.env.CLAUDE_SIMULAR = "1";
process.env.META_APP_SECRET = randomBytes(24).toString("hex");
const _log = console.log;
console.log = (...a: unknown[]) => { if (!String(a[0] ?? "").startsWith("[WhatsApp simulado")) _log(...a); }; // sin el eco de cada respuesta

const { POST } = await import("../api/whatsapp.js");
const { obtenerAlmacen } = await import("../src/almacen.js");
const { cargaSimulada } = await import("../src/atender.js");
const { correrAvisos } = await import("../api/cron-avisos.js");

const almacen = obtenerAlmacen();
const fila = await almacen.fichaPorId(fichaId);
if (!fila) throw new Error(`No existe la ficha ${fichaId}`);
const base = opcion("--base") ?? "http://127.0.0.1:8797";
const PNID = "PNID-CARGA";
await almacen.actualizarFicha(fichaId, { whatsapp_phone_number_id: PNID, config: { ...fila.config, integracion: { ...fila.config.integracion!, base_url: base } } } as never);
try { if (!(await fetch(base + "/api/salud")).ok) throw 0; } catch { throw new Error(`El sistema no contesta en ${base}: levantá la copia de carga (scripts/distri/carga-local.mjs).`); }

// la base del sistema (la copia de carga): filas antes y después
const SISTEMA = process.env.SISTEMA_DIR ?? path.resolve(RAIZ, "..", "..", "pensa-distribuidoras");
const desdeISO = new Date().toISOString();
const contar = (): any => {
  if (!existsSync(path.join(SISTEMA, "scripts", "distri", "carga-local.mjs"))) return null;
  const s = execFileSync(process.execPath, ["--no-warnings", "scripts/distri/carga-local.mjs", "--contar", RUN, desdeISO], { cwd: SISTEMA, encoding: "utf8" });
  return JSON.parse(s.trim().split("\n").at(-1)!);
};
const antes = contar();

// ---------------------------------------------------------------- el día comprimido
const DIA_MS = MINUTOS * 60_000;
const VENTANA_ARMADO_MS = 5.5 * 60_000; // tandas del mismo cliente separadas más que la ventana del pedido en armado
// dos picos (mediodía y tarde, como en 03): cada uno con el 20 % de los mensajes en el 15 % del día (unas 1,3 veces el promedio)
function momento(): number {
  const r = Math.random();
  const pico = (centro: number) => Math.min(0.999, Math.max(0, centro + (Math.random() - 0.5) * 0.15));
  return (r < 0.2 ? pico(0.3) : r < 0.4 ? pico(0.75) : Math.random()) * DIA_MS;
}
type Msg = { t: number; de: string; waId: string; tipo: "text" | "audio" | "image"; texto: string; tanda: number; repetido?: boolean };
type Tanda = { n: number; de: string; clase: "pedido" | "cuenta" | "consulta"; msgs: Msg[] };
const tandas: Tanda[] = [];
const libres: { de: string; desde: number }[] = Array.from({ length: Math.ceil(N / 5) }, (_, i) => ({ de: "54937695" + String(i).padStart(5, "0"), desde: 0 }));
let id = 0, total = 0;
const inicios = Array.from({ length: Math.ceil(N / 1.5) }, momento).sort((a, b) => a - b);
for (const t0 of inicios) {
  if (total >= N) break;
  const i = libres.findIndex((l) => l.desde <= t0);
  if (i < 0) continue; // ningún cliente libre en ese momento: se saltea
  const [cli] = libres.splice(i, 1);
  libres.push({ de: cli.de, desde: t0 + VENTANA_ARMADO_MS });
  const r = Math.random();
  const clase = r < 0.55 ? "pedido" : r < 0.75 ? "cuenta" : "consulta";
  const textos = clase === "pedido" ? ["hola", "mandame 3 gaseosas y 4 harinas PEDIDO", "gracias"]
    : clase === "cuenta" ? ["hola, cuánto debo? CUENTA", "gracias"] : ["a qué hora reparten mañana?"];
  const tanda: Tanda = { n: tandas.length, de: cli.de, clase, msgs: [] };
  let t = t0;
  for (const texto of textos.slice(0, Math.max(1, Math.min(textos.length, N - total)))) {
    const x = Math.random();
    const tipo = x < 0.1 ? "audio" : x < 0.12 ? "image" : "text";
    tanda.msgs.push({ t, de: cli.de, waId: `wamid.${RUN}.${++id}`, tipo, texto: tipo === "text" ? texto : "", tanda: tanda.n });
    t += 2000 + Math.random() * 3000;
    total++;
  }
  tandas.push(tanda);
}
const msgs = tandas.flatMap((t) => t.msgs);
// Meta a veces manda el mismo aviso dos veces: 3 % repetidos, 1 a 3 s después
const repetidos = msgs.filter(() => Math.random() < 0.03).map((m) => ({ ...m, t: m.t + 1000 + Math.random() * 2000, repetido: true }));
const envios = [...msgs, ...repetidos].sort((a, b) => a.t - b.t);

const pico15 = (() => { let mx = 0, j = 0; for (let i = 0; i < envios.length; i++) { while (envios[i].t - envios[j].t > 15_000) j++; mx = Math.max(mx, i - j + 1); } return mx; })();
_log(`Carga ${RUN}: ${msgs.length} mensajes (+${repetidos.length} repetidos por Meta) de ${new Set(msgs.map((m) => m.de)).size} clientes en ${MINUTOS} min · ${tandas.filter((t) => t.clase === "pedido").length} tandas con pedido · pico ${pico15} mensajes en 15 s · ${REAL ? "CLAUDE REAL" : "Claude simulado"} · sistema ${base}`);

// ---------------------------------------------------------------- mandar
const aviso = (m: Msg) => JSON.stringify({
  object: "whatsapp_business_account",
  entry: [{ id: "WABA", changes: [{ field: "messages", value: {
    messaging_product: "whatsapp",
    metadata: { display_phone_number: "5493760000000", phone_number_id: PNID },
    contacts: [{ profile: { name: "Cliente de carga" }, wa_id: m.de }],
    messages: [{ from: m.de, id: m.waId, timestamp: String(Math.floor(Date.now() / 1000)), type: m.tipo,
      ...(m.tipo === "text" ? { text: { body: m.texto } } : m.tipo === "audio" ? { audio: { id: "MEDIA-" + m.waId, mime_type: "audio/ogg", voice: true } } : { image: { id: "MEDIA-" + m.waId, mime_type: "image/jpeg" } }) }],
  } }] }],
});
const enviado = new Map<string, number>();
const fallasWebhook: number[] = [];
const webhookMs: number[] = [];
const inicio = Date.now();
await Promise.all(envios.map(async (m) => {
  await new Promise((r) => setTimeout(r, Math.max(0, inicio + m.t - Date.now())));
  const cuerpo = aviso(m);
  const firma = "sha256=" + createHmac("sha256", process.env.META_APP_SECRET!).update(cuerpo, "utf8").digest("hex");
  const t0 = Date.now();
  if (!m.repetido) enviado.set(m.waId, t0);
  const r = await POST(new Request("http://motor/api/whatsapp", { method: "POST", body: cuerpo, headers: { "content-type": "application/json", "x-hub-signature-256": firma } }));
  webhookMs.push(Date.now() - t0);
  if (r.status !== 200) fallasWebhook.push(Date.now() - inicio);
}));
_log(`Mandados en ${((Date.now() - inicio) / 60000).toFixed(1)} min. Esperando las últimas respuestas…`);
await new Promise((r) => setTimeout(r, 90_000));

// ---------------------------------------------------------------- medir
const pct = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] : NaN; };
const seg = (ms: number) => (ms / 1000).toFixed(1) + " s";
const porMensaje: number[] = [], sinRespuesta: Msg[] = [], alPedido: number[] = [];
let usd = 0, llamadasClaude = 0;
for (const t of tandas) {
  const conv = await almacen.buscarConversacion(fichaId, t.de);
  const delAgente = conv ? (await almacen.mensajes(conv.id)).filter((x) => x.rol === "agente") : [];
  const respuestas = delAgente.map((x) => Date.parse(x.creado));
  if (t.n === tandas.findIndex((o) => o.de === t.de)) for (const x of delAgente) { usd += x.usd || 0; if (x.usd) llamadasClaude++; } // una vez por charla
  const siguiente = tandas.find((o) => o.de === t.de && o.n > t.n);
  const hasta = siguiente ? enviado.get(siguiente.msgs[0].waId) ?? Infinity : Infinity;
  for (const m of t.msgs) {
    const t0 = enviado.get(m.waId)!;
    const r = respuestas.find((x) => x >= t0 - 5 && x < hasta);
    if (r === undefined) sinRespuesta.push(m); else porMensaje.push(r - t0);
  }
}
const tandaDe = new Map(msgs.map((m) => [m.waId, m.tanda]));
const creados = cargaSimulada.filter((x) => x.herramienta === "crear_pedido_borrador" && x.id.startsWith(`wamid.${RUN}.`));
for (const c of creados) { const t = tandas[tandaDe.get(c.id)!]; if (t) alPedido.push(c.cuando - enviado.get(t.msgs[0].waId)!); }
const intentos = new Set(creados.map((c) => c.id));
const conPedido = tandas.filter((t) => t.clase === "pedido");
const pedidoEsMedia = conPedido.filter((t) => t.msgs[1] && t.msgs[1].tipo !== "text").length;
const mediaDespues = conPedido.filter((t) => t.msgs[1]?.tipo === "text" && t.msgs.slice(2).some((m) => m.tipo !== "text")).length;
const pedidosOk = new Set(creados.filter((c) => c.ok).map((c) => c.id));
const herramientasMal = cargaSimulada.filter((x) => x.id.startsWith(`wamid.${RUN}.`) && !x.ok);

// avisos de cobranza: el cron corriendo dos veces a la vez no manda nada dos veces (R23)
const [a1, a2] = await Promise.all([correrAvisos({ soloFicha: fichaId, hora: 12, log: () => {} }), correrAvisos({ soloFicha: fichaId, hora: 12, log: () => {} })]);
const avisos = { primera: a1[0]?.simulados ?? 0, segunda: a2[0]?.simulados ?? 0 };
const despues = contar();

const porMinuto = new Map<number, number>();
for (const ms of [...fallasWebhook, ...sinRespuesta.map((m) => (enviado.get(m.waId) ?? 0) - inicio), ...herramientasMal.map((h) => h.cuando - inicio)]) {
  const k = Math.floor(ms / 60000); porMinuto.set(k, (porMinuto.get(k) ?? 0) + 1);
}
const delta = antes && despues ? Object.fromEntries(Object.keys(despues.filas).map((k) => [k, (despues.filas[k] ?? 0) - (antes.filas[k] ?? 0)])) : null;
const res = {
  run: RUN, claude: REAL ? "real" : "simulado", usd_total: Number(usd.toFixed(4)), usd_por_mensaje: Number((usd / msgs.length).toFixed(5)), respuestas_con_claude: llamadasClaude, mensajes: msgs.length, repetidos_meta: repetidos.length, clientes: new Set(msgs.map((m) => m.de)).size, minutos: MINUTOS, pico_15s: pico15,
  webhook_p95_ms: pct(webhookMs, 95), webhook_fallas: fallasWebhook.length,
  respuesta_p50: seg(pct(porMensaje, 50)), respuesta_p95: seg(pct(porMensaje, 95)), respuesta_max: seg(Math.max(...porMensaje)),
  respondidos: porMensaje.length, sin_respuesta: sinRespuesta.length,
  al_pedido_p50: seg(pct(alPedido, 50)), al_pedido_p95: seg(pct(alPedido, 95)),
  tandas_con_pedido: conPedido.length, pedido_mandado_como_audio_o_foto: pedidoEsMedia, pedido_seguido_de_audio_o_foto: mediaDespues, sin_pedido_otros: conPedido.length - pedidoEsMedia - mediaDespues - intentos.size, intentos_de_pedido: intentos.size, pedidos_cargados: pedidosOk.size,
  motivos_herramientas_mal: Object.entries(herramientasMal.reduce((a: Record<string, number>, h) => { const k = h.herramienta + ": " + (h.motivo || "?").slice(0, 90); a[k] = (a[k] ?? 0) + 1; return a; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 6),
  llamadas_al_sistema: cargaSimulada.filter((x) => x.id.startsWith(`wamid.${RUN}.`)).length, herramientas_mal: herramientasMal.length,
  herramienta_p95_ms: pct(cargaSimulada.filter((x) => x.id.startsWith(`wamid.${RUN}.`)).map((x) => x.ms), 95),
  errores_por_minuto_max: Math.max(0, ...porMinuto.values()),
  base: despues ? { pedidos_en_la_base: despues.pedidos_carga, estados: despues.pedidos_carga_estados, borradores: despues.borradores_carga, pedidos_duplicados: despues.pedidos_duplicados, avisos_duplicados: despues.avisos_duplicados, filas_nuevas: delta, errores_servidor: despues.errores_servidor } : "sin acceso a la base del sistema",
  avisos,
};
_log(JSON.stringify(res, null, 2));
const bien = pct(porMensaje, 95) < 60_000 && (!despues || (despues.pedidos_duplicados === 0 && despues.avisos_duplicados === 0 && (REAL || despues.pedidos_carga + despues.borradores_sin_pedido === pedidosOk.size)));
_log(bien ? "\nOK: p95 < 60 s, sin pedidos ni avisos duplicados" : "\nFALLÓ: revisá p95, duplicados o pedidos que no coinciden");
process.exit(bien ? 0 : 1);
