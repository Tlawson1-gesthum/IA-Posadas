// Todo lo que habla con la API de WhatsApp Cloud (Meta): leer los avisos que llegan y mandar mensajes.
import { createHmac, timingSafeEqual } from "node:crypto";

export interface MensajeEntrante {
  /** Id del número del negocio en Meta: dice a qué cliente (ficha) le escribieron. */
  phoneNumberId: string;
  /** Teléfono de quien escribe, como lo manda Meta (ej. 5493764123456). */
  de: string;
  nombre?: string;
  waId: string;
  /** Texto para el agente. Las ubicaciones llegan como "[Ubicación compartida: lat, lng]". */
  texto: string;
  /** El mensaje es de un tipo que el agente no lee (audio, foto, sticker...). */
  noSoportado?: string;
  /**
   * Audio o foto: con qué bajarlo (descargarMedia). Para que los agentes que no los leen sigan igual (Morfi),
   * esos mensajes TAMBIÉN traen noSoportado: el agente que sí los lee mira primero `media`.
   */
  media?: Media;
}

export interface Media {
  tipo: "audio" | "image";
  /** Id del archivo en Meta (dura unos días). */
  id: string;
  mime: string;
  /** Nota de voz grabada en WhatsApp (no un archivo de audio reenviado). */
  voz?: boolean;
  /** Texto que el cliente escribió junto con la foto. */
  epigrafe?: string;
}

const graph = () => `https://graph.facebook.com/${process.env.META_GRAPH_VERSION ?? "v23.0"}`;
function token(): string {
  const t = process.env.WHATSAPP_TOKEN;
  if (!t) throw new Error("Falta WHATSAPP_TOKEN");
  return t;
}

/** Verifica que el aviso venga de Meta: firma HMAC-SHA256 del cuerpo con el secreto de la app. */
export function firmaValida(cuerpo: string, firma: string | null, secreto: string): boolean {
  if (!firma?.startsWith("sha256=")) return false;
  const esperada = Buffer.from(createHmac("sha256", secreto).update(cuerpo, "utf8").digest("hex"));
  const recibida = Buffer.from(firma.slice(7));
  return esperada.length === recibida.length && timingSafeEqual(esperada, recibida);
}

/** Saca los mensajes de un aviso de Meta. Ignora los avisos de estado (entregado, leído). */
export function leerAviso(aviso: any): MensajeEntrante[] {
  const salida: MensajeEntrante[] = [];
  for (const entry of aviso?.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const v = change.value;
      if (!v?.messages) continue;
      const nombres = new Map<string, string>((v.contacts ?? []).map((c: any) => [c.wa_id, c.profile?.name]));
      for (const m of v.messages) {
        const base = { phoneNumberId: v.metadata?.phone_number_id, de: m.from, nombre: nombres.get(m.from), waId: m.id };
        if (m.type === "text") salida.push({ ...base, texto: m.text?.body ?? "" });
        else if (m.type === "location") {
          const l = m.location ?? {};
          const extra = [l.name, l.address].filter(Boolean).join(", ");
          salida.push({ ...base, texto: `[Ubicación compartida: ${l.latitude}, ${l.longitude}]${extra ? ` ${extra}` : ""}` });
        } else if (m.type === "button") salida.push({ ...base, texto: m.button?.text ?? "" });
        else if (m.type === "interactive") {
          const r = m.interactive?.button_reply ?? m.interactive?.list_reply;
          salida.push({ ...base, texto: r?.title ?? "" });
        } else if ((m.type === "audio" || m.type === "image") && m[m.type]?.id) {
          const x = m[m.type];
          const media: Media = { tipo: m.type, id: String(x.id), mime: String(x.mime_type ?? (m.type === "audio" ? "audio/ogg" : "image/jpeg")) };
          if (m.type === "audio" && x.voice) media.voz = true;
          if (m.type === "image" && x.caption) media.epigrafe = String(x.caption);
          salida.push({ ...base, texto: media.epigrafe ?? "", noSoportado: m.type, media });
        } else salida.push({ ...base, texto: "", noSoportado: m.type });
      }
    }
  }
  return salida;
}

/** Manda un texto. Si Meta no reconoce el número argentino con 9 (pasa con números de prueba), reintenta sin el 9. */
export async function enviarTexto(phoneNumberId: string, para: string, texto: string): Promise<void> {
  if (process.env.WHATSAPP_SIMULAR === "1") {
    console.log(`[WhatsApp simulado → ${para}] ${texto}`);
    return;
  }
  await mandarMensaje(phoneNumberId, para, { type: "text", text: { body: texto, preview_url: true } });
}

/**
 * Texto con hasta 3 botones de respuesta rápida (ej. "Sí" / "No" / "Es otra cosa"). Lo que toca el cliente vuelve como
 * un mensaje "interactive" y leerAviso lo convierte en texto con el título del botón.
 */
export async function enviarBotones(phoneNumberId: string, para: string, texto: string, botones: { id: string; titulo: string }[]): Promise<void> {
  if (!botones.length || botones.length > 3) throw new Error("WhatsApp acepta de 1 a 3 botones");
  const largo = botones.find(b => !b.titulo.trim() || [...b.titulo].length > 20);
  if (largo) throw new Error(`El botón "${largo.titulo}" tiene que tener entre 1 y 20 letras`);
  if (process.env.WHATSAPP_SIMULAR === "1") {
    console.log(`[WhatsApp simulado → ${para}] ${texto} [${botones.map(b => b.titulo).join("] [")}]`);
    return;
  }
  await mandarMensaje(phoneNumberId, para, {
    type: "interactive",
    interactive: { type: "button", body: { text: texto.slice(0, 1024) }, action: { buttons: botones.map(b => ({ type: "reply", reply: { id: b.id.slice(0, 256), title: b.titulo } })) } },
  });
}

/**
 * Plantilla aprobada por Meta (para escribir fuera de las 24 h desde el último mensaje del cliente: avisos de cobranza, pedido confirmado).
 * `variables` reemplazan {{1}}, {{2}}… del cuerpo, en orden.
 */
export async function enviarPlantilla(phoneNumberId: string, para: string, nombre: string, idioma: string, variables: string[]): Promise<void> {
  if (!/^[a-z0-9_]{1,512}$/.test(nombre)) throw new Error(`Nombre de plantilla inválido: ${nombre}`);
  if (process.env.WHATSAPP_SIMULAR === "1") {
    console.log(`[WhatsApp simulado → ${para}] plantilla ${nombre} (${idioma}): ${variables.join(" | ")}`);
    return;
  }
  await mandarMensaje(phoneNumberId, para, {
    type: "template",
    template: { name: nombre, language: { code: idioma }, components: variables.length ? [{ type: "body", parameters: variables.map(v => ({ type: "text", text: String(v) })) }] : [] },
  });
}

/**
 * Baja un audio o una foto que mandó el cliente. Queda en memoria: nunca se escribe a disco.
 * Meta da primero una dirección temporal (vence en minutos) y después el archivo, los dos con el token.
 */
export async function descargarMedia(id: string): Promise<{ datos: ArrayBuffer; mime: string; bytes: number }> {
  const t = token();
  const r = await fetch(`${graph()}/${encodeURIComponent(id)}`, { headers: { authorization: `Bearer ${t}` }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`WhatsApp no dio el archivo ${id}: ${r.status}`);
  const info: any = await r.json();
  if (!info?.url) throw new Error("WhatsApp no devolvió la dirección del archivo");
  const a = await fetch(info.url, { headers: { authorization: `Bearer ${t}` }, signal: AbortSignal.timeout(30000) });
  if (!a.ok) throw new Error(`No se pudo bajar el archivo: ${a.status}`);
  const datos = await a.arrayBuffer();
  return { datos, mime: String(info.mime_type ?? a.headers.get("content-type") ?? ""), bytes: datos.byteLength };
}

/** Un mensaje por la Graph API. Si Meta no reconoce el número argentino con 9 (pasa con números de prueba), reintenta sin el 9. */
async function mandarMensaje(phoneNumberId: string, para: string, cuerpo: Record<string, unknown>): Promise<void> {
  const t = token();
  const mandar = (numero: string) =>
    fetch(`${graph()}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { authorization: `Bearer ${t}`, "content-type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to: numero, ...cuerpo }),
      signal: AbortSignal.timeout(15000),
    });

  let r = await mandar(para);
  if (!r.ok && para.startsWith("549")) {
    const err: any = await r.clone().json().catch(() => ({}));
    if (err?.error?.code === 131030) r = await mandar(`54${para.slice(3)}`);
  }
  if (!r.ok) throw new Error(`WhatsApp respondió ${r.status}: ${await r.text()}`);
}
