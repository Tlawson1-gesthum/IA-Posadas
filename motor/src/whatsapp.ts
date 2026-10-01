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
  const token = process.env.WHATSAPP_TOKEN;
  if (!token) throw new Error("Falta WHATSAPP_TOKEN");
  const version = process.env.META_GRAPH_VERSION ?? "v23.0";
  const mandar = (numero: string) =>
    fetch(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to: numero, type: "text", text: { body: texto, preview_url: true } }),
      signal: AbortSignal.timeout(15000),
    });

  let r = await mandar(para);
  if (!r.ok && para.startsWith("549")) {
    const err: any = await r.clone().json().catch(() => ({}));
    if (err?.error?.code === 131030) r = await mandar(`54${para.slice(3)}`);
  }
  if (!r.ok) throw new Error(`WhatsApp respondió ${r.status}: ${await r.text()}`);
}
