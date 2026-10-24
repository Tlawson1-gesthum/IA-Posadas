// Prueba todo lo de Instagram sin Meta, sin Vercel, sin Supabase y (por defecto) sin gastar IA:
// arma avisos firmados como los manda Meta, simula la API de Instagram y las respuestas de Claude, y revisa cada paso.
// Uso: npm run instagram-local            (todo simulado)
//      npm run instagram-local -- --con-ia (el cerebro usa Claude de verdad: cuesta centavos; Instagram sigue simulado)
import "./entorno.js";
import { createHmac } from "node:crypto";

const CON_IA = process.argv.includes("--con-ia");
const CUENTA = "17841468279921038"; // la de la ficha gozza
const CLIENTE = "9000000000000001";
delete process.env.SUPABASE_URL; // siempre en memoria: nada de la base real
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
process.env.INSTAGRAM_VERIFY_TOKEN = "verifica-prueba";
process.env.INSTAGRAM_APP_SECRET = "secreto-prueba";
process.env.INSTAGRAM_TOKEN_GOZZA = "token-simulado";
process.env.INSTAGRAM_ESPERA_ECO_MS = "150"; // en Vercel espera 8 s a que el agente guarde lo que mandó
if (!CON_IA) process.env.ANTHROPIC_API_KEY = process.env.MORFI_ANTHROPIC_API_KEY = "simulada";

// ——— API de Instagram y de Claude simuladas ———
interface Llamada { metodo: string; ruta: string; params: Record<string, string>; cuerpo: any }
const llamadas: Llamada[] = [];
let estadoContenedor = "FINISHED";
let fallaPermanente = false;
let nContenedor = 0;
const fetchReal = globalThis.fetch;

/** Lo último que le llegó a Claude como mensaje de la persona (para ver el contexto que recibe el agente). */
const aClaude: string[] = [];
function respuestaClaude(cuerpo: any): Response {
  const ultimo = cuerpo.messages.at(-1);
  if (typeof ultimo.content === "string") aClaude.push(ultimo.content);
  const texto = typeof ultimo.content === "string" ? ultimo.content : "";
  const yaDerivo = Array.isArray(ultimo.content) && ultimo.content.some((b: any) => b.type === "tool_result");
  const base = { id: "msg_sim", type: "message", role: "assistant", model: cuerpo.model, usage: { input_tokens: 100, output_tokens: 30 } };
  let content: any[];
  let stop = "end_turn";
  if (/fr[ií]o|reclamo/i.test(texto) && !yaDerivo) {
    content = [{ type: "tool_use", id: "tu_1", name: "derivar_a_persona", input: { motivo: "reclamo", resumen: "Le llegó frío el pedido." } }];
    stop = "tool_use";
  } else if (yaDerivo) content = [{ type: "text", text: "Uh, qué macana. Ya le paso tu mensaje a alguien del equipo que te responde por acá. Gracias por la paciencia." }];
  else content = [{ type: "text", text: "¡Hola! Esta es una respuesta automática de GOZZA 🌱 Pedí en **https://gozza.com.ar/?utm_source=instagram**\n¡Gracias por escribirnos!" }];
  return Response.json({ ...base, content, stop_reason: stop, stop_sequence: null });
}

globalThis.fetch = (async (entrada: any, init?: any) => {
  const url = new URL(typeof entrada === "string" ? entrada : entrada.url ?? String(entrada));
  if (url.hostname === "api.anthropic.com" && !CON_IA) return respuestaClaude(JSON.parse(init?.body ?? "{}"));
  if (url.hostname !== "graph.instagram.com") return fetchReal(entrada, init);
  const params = Object.fromEntries(url.searchParams);
  const ruta = url.pathname.replace(/^\/v[\d.]+\//, "").replace(/^\//, "");
  const cuerpo = init?.body ? JSON.parse(init.body) : null;
  llamadas.push({ metodo: init?.method ?? "GET", ruta, params, cuerpo });
  const r = (d: unknown, status = 200) => Response.json(d, { status });
  if (ruta === "refresh_access_token") return r({ access_token: "token-renovado", token_type: "bearer", expires_in: 5184000 });
  if (ruta === `${CUENTA}/messages`) return r({ recipient_id: CLIENTE, message_id: "m_1" });
  if (ruta === `${CUENTA}/media` && init?.method === "POST") {
    if (fallaPermanente) return r({ error: { message: "La foto no es válida", code: 100 } }, 400);
    return r({ id: `cont_${++nContenedor}` });
  }
  if (ruta === `${CUENTA}/media`) return r({ data: [{ id: "media_1", timestamp: new Date().toISOString(), comments_count: 2 }] });
  if (ruta === "media_1/comments") {
    const hace = new Date(Date.now() - 3600_000).toISOString();
    return r({ data: [{ id: "c_poll_1", text: "Quiero viandas!!", timestamp: hace, username: "alguien", from: { id: "9000000000000002" } }, { id: "c_web_1", text: "VIANDAS", timestamp: hace, username: "otra" }] });
  }
  if (ruta.startsWith("cont_")) return r({ status_code: estadoContenedor });
  if (ruta === `${CUENTA}/content_publishing_limit`) return r({ data: [{ quota_usage: 1, config: { quota_total: 100 } }] });
  if (ruta === `${CUENTA}/media_publish`) return r({ id: `pub_${cuerpo.creation_id}` });
  if (ruta.startsWith("pub_")) return r({ permalink: `https://www.instagram.com/p/${ruta}/` });
  return r({ error: { message: `ruta simulada desconocida: ${ruta}`, code: 100 } }, 400);
}) as typeof fetch;

// ——— Recién ahora se carga el motor (así el cliente de Claude usa la API simulada) ———
const { GET, POST } = await import("../api/instagram.js");
const { obtenerAlmacen } = await import("../src/almacen.js");
const { correrCola } = await import("../src/cola.js");
const { revisarComentarios } = await import("../src/comentarios.js");
const { cargarFicha } = await import("../src/fichas.js");
const { renovarToken, tokenDe } = await import("../src/instagram.js");
const almacen = obtenerAlmacen();
const ficha = await cargarFicha("gozza");

let fallas = 0;
const ver = (cond: unknown, nombre: string, detalle = "") => {
  if (!cond) fallas++;
  console.log(`${cond ? "✓" : "✗"} ${nombre}${!cond && detalle ? `\n    → ${detalle}` : ""}`);
};
const esperar = async (cond: () => boolean | Promise<boolean>, ms = 8000) => {
  const fin = Date.now() + ms;
  while (Date.now() < fin) {
    if (await cond()) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return false;
};
const URL_BASE = "https://motor.local/api/instagram";
const firmar = (texto: string, secreto = process.env.INSTAGRAM_APP_SECRET!) => "sha256=" + createHmac("sha256", secreto).update(texto).digest("hex");
async function mandar(aviso: object, firma: string | null = "bien") {
  const texto = JSON.stringify(aviso);
  const headers: Record<string, string> = {};
  if (firma === "bien") headers["x-hub-signature-256"] = firmar(texto);
  else if (firma) headers["x-hub-signature-256"] = firma;
  return (await POST(new Request(URL_BASE, { method: "POST", body: texto, headers }))).status;
}
let nMid = 0;
const dm = (texto: string, extra: { de?: string; hace?: number; eco?: boolean; mid?: string; adjunto?: string } = {}) => ({
  object: "instagram",
  entry: [{
    id: CUENTA,
    time: Date.now(),
    messaging: [{
      sender: { id: extra.eco ? CUENTA : extra.de ?? CLIENTE },
      recipient: { id: extra.eco ? (extra.de ?? CLIENTE) : CUENTA },
      timestamp: Date.now() - (extra.hace ?? 0),
      message: { mid: extra.mid ?? `mid_${++nMid}`, ...(extra.adjunto ? { attachments: [{ type: extra.adjunto }] } : { text: texto }), ...(extra.eco ? { is_echo: true } : {}) },
    }],
  }],
});
const comentario = (id: string, texto: string, de = "9000000000000003") => ({
  object: "instagram",
  entry: [{ id: CUENTA, time: Math.floor(Date.now() / 1000), changes: [{ field: "comments", value: { id, text: texto, from: { id: de, username: "cliente" }, media: { id: "media_1" } } }] }],
});
const mensajesA = (destinatario: string) => llamadas.filter((l) => l.ruta === `${CUENTA}/messages` && l.cuerpo?.recipient?.id === destinatario);
const privadas = (comentarioId: string) => llamadas.filter((l) => l.ruta === `${CUENTA}/messages` && l.cuerpo?.recipient?.comment_id === comentarioId);
const conv = async (quien: string) => almacen.buscarConversacion("gozza", quien);

console.log(`Instagram local · ${CON_IA ? "con Claude de verdad" : "todo simulado"}\n`);

// 1. Verificación del webhook
const v = await GET(new Request(`${URL_BASE}?hub.mode=subscribe&hub.verify_token=verifica-prueba&hub.challenge=4242`));
ver(v.status === 200 && (await v.text()) === "4242", "Meta verifica la dirección con el token correcto");
ver((await GET(new Request(`${URL_BASE}?hub.mode=subscribe&hub.verify_token=otro&hub.challenge=1`))).status === 403, "Con otro token, no");

// 2. Firma
ver((await mandar(dm("hola"), null)) === 401, "Aviso sin firma: rechazado");
ver((await mandar(dm("hola"), firmar("otra cosa"))) === 401, "Aviso con firma falsa: rechazado");
ver((await mandar(dm("hola"), firmar(JSON.stringify(dm("hola")), "secreto-de-otra-app"))) === 401, "Firmado con el secreto de otra app: rechazado");

// Meta firma con las tildes escritas como \u00f3: el mismo aviso con "cómo" tiene que pasar firmado de las dos formas.
{
  const conTilde = JSON.stringify(dm("hola, cómo funcionan las viandas?", { de: "9000000000000020", mid: "mid_tilde" }));
  const escapadoTilde = conTilde.replace(/[\u0080-\uffff]/g, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));
  ver(escapadoTilde.includes("c\\u00f3mo"), "La prueba arma el aviso escapado como Meta");
  const st = async (firma: string) => (await POST(new Request(URL_BASE, { method: "POST", body: conTilde, headers: { "x-hub-signature-256": firma } }))).status;
  ver((await st(firmar(escapadoTilde))) === 200, "Mensaje con tilde firmado como Meta (escapado): aceptado");
  ver((await st(firmar(conTilde))) === 200, "Mensaje con tilde firmado tal cual: aceptado");
  ver(await esperar(() => mensajesA("9000000000000020").length === 1), "Y el agente lo contesta");
}

// 3. Mensaje directo normal
ver((await mandar(dm("hola, qué horario tienen?", { mid: "mid_hola" }))) === 200, "Mensaje firmado: Meta recibe 200 enseguida");
ver(await esperar(() => mensajesA(CLIENTE).length === 1), "El agente responde por mensaje directo a quien escribió");
const respuesta = mensajesA(CLIENTE)[0]?.cuerpo?.message?.text ?? "";
ver(!respuesta.includes("*"), "La respuesta sale sin asteriscos (Instagram no muestra negritas)", respuesta);
if (!CON_IA) ver(/autom[aá]tica/i.test(respuesta) && /gracias/i.test(respuesta), "Dice que es automática y agradece", respuesta);
ver(llamadas.every((l) => l.params.access_token === "token-simulado" || l.ruta === "refresh_access_token"), "Usa el token de la ficha");
const c1 = await conv(`ig:${CLIENTE}`);
ver(c1 && (await almacen.mensajes(c1.id)).length === 2, "La charla queda guardada (mensaje + respuesta)");

// 4. Repetidos, ecos y cosas que no se contestan
await mandar(dm("hola, qué horario tienen?", { mid: "mid_hola" }));
await mandar(dm(respuesta, { eco: true }));
await mandar(dm("", { adjunto: "like_heart" }));
await new Promise((r) => setTimeout(r, 600));
ver(mensajesA(CLIENTE).length === 1, "Aviso repetido, eco de la respuesta del agente y un corazón: no responde");
ver((await conv(`ig:${CLIENTE}`))?.estado === "agente", "El eco de lo que mandó el agente no le saca la charla");

// 4b. Una persona del equipo contesta a mano desde la app de Instagram
const EQUIPO = "9000000000000010";
await mandar(dm("hola! tienen viandas keto?", { de: EQUIPO }));
ver(await esperar(() => mensajesA(EQUIPO).length === 1), "El agente contesta el primer mensaje");
await mandar(dm(mensajesA(EQUIPO)[0]?.cuerpo?.message?.text ?? "", { eco: true, de: EQUIPO }));
await new Promise((r) => setTimeout(r, 400));
ver((await conv(`ig:${EQUIPO}`))?.estado === "agente", "Su propio eco no cuenta como una persona");
await mandar(dm("Hola! Soy Gonza de GOZZA, te cuento yo: sí, hay keto todos los días", { eco: true, de: EQUIPO, mid: "mid_gonza" }));
ver(await esperar(async () => (await conv(`ig:${EQUIPO}`))?.estado === "humano"), "Una persona contesta desde la app: la charla pasa a esa persona");
await mandar(dm("Hola! Soy Gonza de GOZZA, te cuento yo: sí, hay keto todos los días", { eco: true, de: EQUIPO, mid: "mid_gonza" }));
await mandar(dm("genial, gracias!", { de: EQUIPO }));
await new Promise((r) => setTimeout(r, 600));
ver(mensajesA(EQUIPO).length === 1, "Después, el agente no contesta en esa charla");
const cEquipo = await conv(`ig:${EQUIPO}`);
const hist = cEquipo ? await almacen.mensajes(cEquipo.id) : [];
ver(hist.filter((m) => m.rol === "humano").length === 1 && hist.some((m) => m.rol === "humano" && m.texto.startsWith("Hola! Soy Gonza")), "Lo que escribió la persona queda en la charla, una sola vez", JSON.stringify(hist.map((m) => m.rol)));
await mandar(dm("", { eco: true, de: "9000000000000011", adjunto: "image" }));
ver(await esperar(async () => (await conv("ig:9000000000000011"))?.estado === "humano"), "Una foto mandada desde la app también es de una persona");
await mandar(dm(ficha.instagram!.comentarios!.reglas[0].respuesta, { eco: true, de: "9000000000000012" }));
await new Promise((r) => setTimeout(r, 400));
ver((await conv("ig:9000000000000012"))?.estado !== "humano", "El eco de la respuesta fija a un comentario no cuenta como una persona");
const { esNuestro } = await import("../src/atenderInstagram.js");
const recien = new Date().toISOString();
ver(esNuestro({ cuenta: CUENTA, para: "x", mid: "m_foto", texto: "", adjunto: "image" }, [], Date.now(), ["m_foto"]), "La foto del menú de ejemplo que mandó el motor no cuenta como una persona");
ver(!esNuestro({ cuenta: CUENTA, para: "x", mid: "m_otra", texto: "", adjunto: "image" }, [], Date.now(), ["m_foto"]), "Otra foto sí es de una persona");
ver(esNuestro({ cuenta: CUENTA, para: "x", mid: "m", texto: "[Charla reiniciada: el agente vuelve a responder, sin memoria de lo anterior]" }, []), "El aviso de /reiniciar no cuenta como una persona");
ver(esNuestro({ cuenta: CUENTA, para: "x", mid: "m", texto: "Segunda parte, con el link para pedir" }, [{ rol: "agente", texto: "**Primera** parte\nSegunda parte, con el link para pedir", creado: recien }]), "Una parte de un mensaje largo del agente tampoco");
ver(!esNuestro({ cuenta: CUENTA, para: "x", mid: "m", texto: "Gracias!" }, [{ rol: "agente", texto: "¡Gracias por escribirnos!", creado: recien }]), "Un \"Gracias!\" escrito a mano no se confunde con el agente");
ver(!esNuestro({ cuenta: CUENTA, para: "x", mid: "m", texto: "ok" }, [{ rol: "agente", texto: "ok, gracias", creado: new Date(Date.now() - 3600_000).toISOString() }]), "Un texto igual a uno del agente de hace una hora sí es de una persona");

// 5. Ventana de 24 horas
await mandar(dm("hola, sigue en pie?", { de: "9000000000000009", hace: 25 * 3600_000 }));
await new Promise((r) => setTimeout(r, 600));
const vieja = await conv("ig:9000000000000009");
ver(mensajesA("9000000000000009").length === 0 && vieja && (await almacen.mensajes(vieja.id)).length === 1, "Mensaje de hace más de 24 h: se guarda, pero no se responde");

// 6. Reclamo: pasa a una persona y avisa
await mandar(dm("me llegó frío el pedido", { de: "9000000000000004" }));
ver(await esperar(async () => (await conv("ig:9000000000000004"))?.estado === "humano"), "Un reclamo pasa la charla a una persona");
const avisos = async () => (await almacen.eventos(new Date(0), ["instagram"])).map((e) => e.detalle ?? "");
ver((await avisos()).some((d) => d.startsWith("Charla de Instagram para una persona: reclamo")), "Y queda el aviso al equipo en el panel");
const antes = mensajesA("9000000000000004").length;
await mandar(dm("hola? alguien?", { de: "9000000000000004" }));
await new Promise((r) => setTimeout(r, 600));
ver(mensajesA("9000000000000004").length === antes, "Con la charla en manos de una persona, el agente no se mete");

// 7. Comentarios con palabra clave (aviso de Meta)
await mandar(comentario("c_1", "Quiero info de las VIANDAS 😍"));
ver(await esperar(() => privadas("c_1").length === 1), "Comentario con VIANDAS: respuesta privada con el link");
ver(/gozza\.com\.ar\/viandas\?utm_source=instagram/.test(privadas("c_1")[0]?.cuerpo?.message?.text ?? ""), "El link de viandas va con UTM");
await mandar(comentario("c_1", "Quiero info de las VIANDAS 😍"));
await new Promise((r) => setTimeout(r, 400));
ver(privadas("c_1").length === 1, "El mismo comentario no se responde dos veces");
await mandar(comentario("c_2", "Somos una empresa, nos interesa", "9000000000000005"));
ver(await esperar(async () => (await conv("ig:9000000000000005"))?.estado === "humano"), "Comentario con EMPRESA: respuesta privada y pasa a una persona");
ver(privadas("c_2").length === 1 && (await avisos()).some((d) => d.startsWith("Comentario de Instagram para una persona")), "Con aviso al equipo");
await mandar(comentario("c_3", "Qué rico se ve"));
await new Promise((r) => setTimeout(r, 400));
ver(privadas("c_3").length === 0 && (await almacen.eventos(new Date(0), ["comentario"])).some((e) => e.detalle?.includes("Qué rico")), "Comentario sin palabra clave: no se responde, queda para que lo mire una persona");
await mandar(comentario("c_4", "viandasss"));
await new Promise((r) => setTimeout(r, 400));
ver(privadas("c_4").length === 0, "\"viandasss\" no cuenta como VIANDAS (palabra suelta)");

// 8. Comentarios leídos sin el aviso de Meta (plan A, sin revisión de la app)
const r1 = await revisarComentarios(ficha);
ver(r1.respondido === 2 && privadas("c_poll_1").length === 1, "Revisando las publicaciones encuentra y responde los comentarios nuevos", JSON.stringify(r1));
const r2 = await revisarComentarios(ficha);
ver(r2.respondido === 0 && privadas("c_poll_1").length === 1, "La segunda revisión no repite nada", JSON.stringify(r2));

// 9. Cola de publicaciones
const ahora = Date.now();
const nueva = (cambios: Partial<Parameters<typeof almacen.crearPublicacion>[0]> & { estado?: string }) =>
  almacen.crearPublicacion({ ficha_id: "gozza", tipo: "imagen", medios: [{ url: "https://ejemplo.com/foto.jpg", tipo: "imagen" }], texto: "Tu wrap 🌯", hora: new Date(ahora - 60_000).toISOString(), hecha_con_ia: false, ...cambios });
const aprobar = (id: string) => almacen.cambiarPublicacion(id, ["borrador"], { estado: "aprobado", aprobada_por: "prueba", aprobada_en: new Date().toISOString() });

const borrador = await nueva({});
const imagen = await nueva({});
await aprobar(imagen.id);
const futura = await nueva({ hora: new Date(ahora + 3600_000).toISOString() });
await aprobar(futura.id);
const conIa = await nueva({ tipo: "reel", medios: [{ url: "https://ejemplo.com/flor.mp4", tipo: "video" }], hecha_con_ia: true });
await aprobar(conIa.id);
const tarde = await nueva({ hora: new Date(ahora - 3 * 3600_000).toISOString() });
await aprobar(tarde.id);
const carrusel = await nueva({ tipo: "carrusel", medios: [1, 2, 3].map((n) => ({ url: `https://ejemplo.com/${n}.jpg`, tipo: "imagen" as const })) });
await aprobar(carrusel.id);
const reel = await nueva({ tipo: "reel", medios: [{ url: "https://ejemplo.com/wrap.mp4", tipo: "video" }] });
await aprobar(reel.id);

// Dos tareas a la vez (pasa si UptimeRobot y el cron coinciden): nada sale dos veces.
estadoContenedor = "FINISHED";
const publicarAntes = llamadas.filter((l) => l.ruta === `${CUENTA}/media_publish`).length;
await Promise.all([correrCola(), correrCola()]);
const estadoDe = async (id: string) => (await almacen.publicaciones({ fichaId: "gozza" })).find((p) => p.id === id)!;
ver((await estadoDe(borrador.id)).estado === "borrador", "Un borrador no se publica nunca");
const pubImagen = await estadoDe(imagen.id);
ver(pubImagen.estado === "publicado" && pubImagen.permalink?.startsWith("https://www.instagram.com/p/"), "Imagen aprobada y en hora: publicada, con su link anotado", JSON.stringify(pubImagen));
ver((await estadoDe(futura.id)).estado === "aprobado", "Aprobada pero para más tarde: espera su hora");
const pubIa = await estadoDe(conIa.id);
ver(pubIa.estado === "manual" && (await avisos()).some((d) => d.startsWith("Publicación para subir a mano")), "Pieza hecha con IA: no se publica sola y avisa para subirla con la etiqueta", JSON.stringify(pubIa));
ver((await estadoDe(tarde.id)).estado === "vencida", "Se pasó más de 2 h de la hora: no se publica fuera de horario");
const pubCarrusel = await estadoDe(carrusel.id);
const padre = llamadas.find((l) => l.cuerpo?.media_type === "CAROUSEL");
ver(pubCarrusel.estado === "publicado" && padre?.cuerpo?.children?.split(",").length === 3, "Carrusel de 3: tres fotos y el carrusel, publicado");
ver(!llamadas.some((l) => "is_ai_generated" in (l.cuerpo ?? {})), "Ninguna pieza lleva la marca de IA por API mientras no esté comprobada");
const publicadas = llamadas.filter((l) => l.ruta === `${CUENTA}/media_publish`).length - publicarAntes;
ver(publicadas === 3, "Con dos tareas a la vez, cada pieza se publicó una sola vez", `media_publish: ${publicadas}`);

// Un reel que Meta tarda en preparar
const reel2 = await nueva({ tipo: "reel", medios: [{ url: "https://ejemplo.com/wrap2.mp4", tipo: "video" }] });
await aprobar(reel2.id);
estadoContenedor = "IN_PROGRESS";
await correrCola();
ver((await estadoDe(reel2.id)).estado === "procesando", "Reel: mientras Meta lo prepara, queda esperando");
estadoContenedor = "FINISHED";
await correrCola();
ver((await estadoDe(reel2.id)).estado === "publicado", "En la vuelta siguiente, ya listo: publicado");

// Una foto que Meta rechaza
fallaPermanente = true;
const mala = await nueva({});
await aprobar(mala.id);
await correrCola();
fallaPermanente = false;
const pubMala = await estadoDe(mala.id);
ver(pubMala.estado === "error" && /no es válida/.test(pubMala.error ?? "") && (await avisos()).some((d) => d.startsWith("Una publicación no salió")), "Si Meta la rechaza: queda en error con el motivo y avisa", JSON.stringify(pubMala));

// 9b. Mensajes que no son texto: cada tipo con su criterio (src/sinTexto.ts)
{
  const { SIN_TEXTO } = await import("../src/sinTexto.js");
  for (const [tipo, t] of Object.entries(SIN_TEXTO)) {
    ver(/gracias/i.test(t) && !/\b(leo|bot|ia|robot|autom[aá]tic|program)/i.test(t), `Respuesta fija "${tipo}": agradece y no habla de bots ni IA`, t);
  }
  let n = 0;
  // Un directo tal cual lo manda Meta, con el "message" que se le pase.
  const crudo = (message: object, de: string) => ({
    object: "instagram",
    entry: [{ id: CUENTA, time: Date.now(), messaging: [{ sender: { id: de }, recipient: { id: CUENTA }, timestamp: Date.now(), message: { mid: `mid_nt_${++n}`, ...message } }] }],
  });
  const textoA = (de: string) => mensajesA(de).map((l) => l.cuerpo?.message?.text ?? "");
  const guardado = async (de: string) => {
    const c = await conv(`ig:${de}`);
    return c ? (await almacen.mensajes(c.id)).filter((x) => x.rol === "cliente").map((x) => x.texto) : [];
  };
  const quieto = () => new Promise((r) => setTimeout(r, 500));

  // El caso real: comparte un reel que nombra a la cuenta, sin escribir nada.
  const A = "9000000000000101";
  await mandar(crudo({ attachments: [{ type: "ig_reel", payload: { url: "https://cdn/reel.mp4", title: "Fan de @gozzasabores y fan tuyo @tommlawson", reel_video_id: "1" } }] }, A));
  ver(await esperar(() => mensajesA(A).length === 1), "Comparte un reel que nos nombra: agradece");
  ver(textoA(A)[0] === SIN_TEXTO.agradecer, "Con el agradecimiento corto (sin IA)", textoA(A)[0]);
  ver((await guardado(A))[0] === '[Compartió un reel que dice: "Fan de @gozzasabores y fan tuyo @tommlawson"]', "En el panel queda qué compartió", (await guardado(A))[0]);

  const B = "9000000000000102";
  await mandar(crudo({ attachments: [{ type: "ig_reel", payload: { url: "https://cdn/meme.mp4", title: "cuando es lunes jaja" } }] }, B));
  await mandar(crudo({ attachments: [{ type: "share", payload: { url: "https://cdn/post.jpg" } }] }, B));
  await quieto();
  ver(mensajesA(B).length === 0 && (await guardado(B)).length === 2, "Comparte publicaciones que no nos nombran, sin texto: no contesta (queda guardado)");

  const C = "9000000000000103";
  const antesC = aClaude.length;
  await mandar(crudo({ text: "tienen algo así??", attachments: [{ type: "ig_post", payload: { url: "https://cdn/bowl.jpg", title: "Bowl de pollo y palta" } }] }, C));
  ver(await esperar(() => mensajesA(C).length === 1), "Comparte una publicación con texto: contesta el agente");
  ver(aClaude.slice(antesC).some((t) => t === '[Compartió una publicación que dice: "Bowl de pollo y palta"] tienen algo así??'), "Y el agente recibe el texto con lo que compartió", aClaude.at(-1));

  const D = "9000000000000104";
  const antesD = aClaude.length;
  await mandar(crudo({ text: "qué rico!! 😍", reply_to: { story: { id: "st_1", url: "https://cdn/story.jpg" } } }, D));
  ver(await esperar(() => mensajesA(D).length === 1), "Responde a una historia: contesta el agente");
  ver(aClaude.slice(antesD).includes("[Respondió a una historia de la cuenta] qué rico!! 😍"), "Sabiendo que respondió a una historia", aClaude.at(-1));

  const E = "9000000000000105";
  const mencion = crudo({ attachments: [{ type: "story_mention", payload: { url: "https://cdn/historia.jpg" } }] }, E);
  await mandar(mencion);
  ver(await esperar(() => mensajesA(E).length === 1), "Nos mencionan en una historia: agradece");
  await mandar(mencion); // Meta reenvía el mismo aviso
  await quieto();
  const avisosMencion = (await avisos()).filter((d) => d.startsWith("Te mencionaron en una historia")).length;
  ver(textoA(E)[0] === SIN_TEXTO.agradecer && mensajesA(E).length === 1 && avisosMencion === 1, "Una sola vez, y avisa al equipo una sola vez", `avisos: ${avisosMencion}`);

  const F = "9000000000000106";
  await mandar(crudo({ attachments: [{ type: "like_heart" }] }, F));
  await mandar(crudo({ attachments: [{ type: "image", payload: { url: "https://cdn/sticker.webp", sticker_id: 369239263222822 } }] }, F));
  await mandar(crudo({ is_unsupported: true }, F));
  await mandar(crudo({ attachments: [{ type: "un_tipo_nuevo_de_meta", payload: { url: "https://cdn/x" } }] }, F));
  await quieto();
  ver(mensajesA(F).length === 0 && (await guardado(F)).length === 4, "Corazón, sticker, algo no soportado o un tipo nuevo: no contesta (queda guardado)", JSON.stringify(await guardado(F)));

  const G = "9000000000000107";
  await mandar(crudo({ attachments: [{ type: "audio", payload: { url: "https://cdn/audio.mp4" } }] }, G));
  ver(await esperar(() => mensajesA(G).length === 1) && textoA(G)[0] === SIN_TEXTO.audio, "Un audio: le pide con amabilidad que lo escriba", textoA(G)[0]);
  await mandar(crudo({ attachments: [{ type: "audio", payload: { url: "https://cdn/audio2.mp4" } }] }, G));
  await quieto();
  ver(mensajesA(G).length === 1, "Un segundo audio seguido: no repite el pedido");
  await mandar(crudo({ text: "perdón, quería saber el precio de las viandas" }, G));
  ver(await esperar(() => mensajesA(G).length === 2), "Cuando lo escribe, contesta el agente");

  const H = "9000000000000108";
  await mandar(crudo({ attachments: [{ type: "image", payload: { url: "https://cdn/foto.jpg" } }] }, H));
  ver(await esperar(() => mensajesA(H).length === 1) && textoA(H)[0] === SIN_TEXTO.adjunto, "Una foto: le pide que escriba la consulta", textoA(H)[0]);
  await mandar(crudo({ attachments: [{ type: "video", payload: { url: "https://cdn/video.mp4" } }] }, H));
  await quieto();
  ver(mensajesA(H).length === 1, "Y un video enseguida no repite el pedido");

  const { esParaAgradecer } = await import("../src/atenderInstagram.js");
  ver(esParaAgradecer({ noSoportado: "ig_reel", descripcion: "Los mejores bowls de Gozzá" }, "GOZZA"), "Nombrar al local sin @ y con tilde también cuenta");
  ver(!esParaAgradecer({ noSoportado: "ig_reel", descripcion: "go zza" }, "GOZZA"), "Letras sueltas en palabras distintas no cuentan");
}

// 10. Token
ver((await renovarToken(ficha)) === "renovado" && (await tokenDe(ficha)) === "token-renovado", "El token se renueva y se usa el nuevo");
ver((await renovarToken(ficha)) === "al_dia", "Recién renovado: no lo vuelve a renovar");

console.log(`\n${fallas ? `${fallas} prueba(s) fallaron` : "Todo bien"} · llamadas simuladas a Instagram: ${llamadas.length}`);
process.exit(fallas ? 1 : 0);
