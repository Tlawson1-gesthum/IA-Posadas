// Avisos de cobranza de las distribuidoras (paso 22). Vercel Cron lo llama cada hora de 9 a 18 de Argentina (vercel.json → crons).
// Para cada ficha de distribuidora activa (y sin pausa del dueño) le pide a su sistema los avisos de esa hora
// (/api/agente/distri/avisos: el sistema recalcula la cuenta justo antes y reserva cada aviso una sola vez) y manda las plantillas.
// Sin WHATSAPP_TOKEN o con WHATSAPP_SIMULAR=1 no manda nada: imprime. A mano: npm run cron-avisos -- distri-demo [--hora 12]
// Vercel manda "Authorization: Bearer CRON_SECRET": sin ese secreto configurado, no corre (nadie de afuera lo puede disparar).
import { timingSafeEqual } from "node:crypto";
import { obtenerAlmacen, podarConversaciones } from "../src/almacen.js";
import { fichaDesdeFila } from "../src/fichas.js";
import { autorizacion, baseUrl } from "../src/herramientas/semorfa.js";
import type { Ficha } from "../src/tipos.js";
import { enviarPlantilla } from "../src/whatsapp.js";
import { enmascarar } from "../src/enmascarar.js";

interface Aviso {
  id: number;
  telefono: string;
  regla: string;
  vencida: boolean;
  variables: Record<string, string | null>;
}

// Las de la guía de cuentas (A.7): el orden de las variables es el de la plantilla aprobada en Meta
const PLANTILLAS = {
  vencimiento: { nombre: "aviso_vencimiento", variables: ["nombre", "factura", "monto", "fecha", "link"] },
  vencida: { nombre: "aviso_vencida", variables: ["nombre", "factura", "monto", "fecha"] },
};

const horaAR = () => new Date(Date.now() - 3 * 3600_000).getUTCHours();

async function pedir(ficha: Ficha, ruta: string, cuerpo?: unknown): Promise<any> {
  const ctx = { ficha, telefono: "" };
  const r = await fetch(`${baseUrl(ctx)}/api/agente/distri/${ruta}`, {
    method: cuerpo ? "POST" : "GET",
    headers: { "content-type": "application/json", ...autorizacion(ctx) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  const d = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`${ruta}: ${r.status} ${d?.error ?? ""}`);
  return d;
}

export interface ResultadoAvisos {
  ficha: string;
  enviados: number;
  simulados: number;
  fallidos: number;
  error?: string;
}

/** Corre los avisos de una hora. `soloFicha` y `hora` sirven para correrlo a mano. */
export async function correrAvisos({ soloFicha, hora = horaAR(), log = console.log }: { soloFicha?: string; hora?: number; log?: (s: string) => void } = {}): Promise<ResultadoAvisos[]> {
  const almacen = obtenerAlmacen();
  const simular = process.env.WHATSAPP_SIMULAR === "1" || !process.env.WHATSAPP_TOKEN;
  const fichas = (await almacen.listarFichas()).map((f) => fichaDesdeFila(f))
    .filter((f) => f.integracion?.tipo === "distribuidora" && f.estado === "activo" && !f.pausa_local && (!soloFicha || f.id === soloFicha));
  const salida: ResultadoAvisos[] = [];
  for (const ficha of fichas) {
    const res: ResultadoAvisos = { ficha: ficha.id, enviados: 0, simulados: 0, fallidos: 0 };
    salida.push(res);
    let avisos: Aviso[] = [];
    try {
      avisos = (await pedir(ficha, `avisos?hora=${hora}`)).avisos ?? [];
    } catch (e) {
      res.error = (e as Error).message;
      log(`${ficha.id}: no se pudieron pedir los avisos (${res.error})`);
      continue;
    }
    const nombres = ficha.reglas?.plantillas ?? {};
    const idioma = nombres.idioma ?? "es_AR";
    for (const a of avisos) {
      const p = a.vencida ? { ...PLANTILLAS.vencida, nombre: nombres.vencida ?? PLANTILLAS.vencida.nombre } : { ...PLANTILLAS.vencimiento, nombre: nombres.vencimiento ?? PLANTILLAS.vencimiento.nombre };
      const faltan = p.variables.filter((k) => !a.variables[k]);
      const valores = p.variables.map((k) => a.variables[k] ?? `[falta ${k}]`);
      let enviado = false, resultado = "";
      if (faltan.length && !simular) {
        resultado = `No se mandó: falta ${faltan.join(", ")}`;
      } else if (simular) {
        log(`[simulado] ${ficha.id} → ${enmascarar(a.telefono)} · ${p.nombre} (aviso ${a.regla}): ${valores.join(" | ")}`);
        enviado = true;
        resultado = faltan.length ? `simulado (falta ${faltan.join(", ")})` : "simulado";
        res.simulados++;
      } else if (!ficha.whatsapp_phone_number_id) {
        resultado = "No se mandó: la ficha no tiene número de WhatsApp";
      } else {
        try {
          await enviarPlantilla(ficha.whatsapp_phone_number_id, a.telefono, p.nombre, idioma, valores);
          enviado = true;
          resultado = "enviado";
          res.enviados++;
        } catch (e) {
          resultado = `Meta: ${(e as Error).message}`.slice(0, 300);
        }
      }
      if (!enviado) res.fallidos++;
      // la charla guarda el aviso: si el cliente responde "¿qué factura?", el agente lo ve
      if (enviado) {
        const conv = await almacen.conversacion(ficha.id, a.telefono, ficha.whatsapp_phone_number_id ?? "simulado");
        await almacen.guardar({ conversacionId: conv.id, fichaId: ficha.id, rol: "agente", texto: `[Aviso de cobranza ${a.regla} días: ${p.nombre} · ${valores.join(" · ")}]` });
      }
      try {
        await pedir(ficha, "avisos", { accion: "resultado", id: a.id, enviado, resultado });
      } catch (e) {
        log(`${ficha.id}: no se pudo anotar el resultado del aviso ${a.id} (${(e as Error).message})`);
      }
    }
    log(`${ficha.id}: ${avisos.length} aviso(s) · ${res.enviados} enviados · ${res.simulados} simulados · ${res.fallidos} sin mandar`);
  }
  return salida;
}

function claveOk(request: Request): boolean {
  const secreto = process.env.CRON_SECRET;
  if (!secreto || secreto.length < 16) return false;
  const dada = Buffer.from(request.headers.get("authorization") ?? "");
  const esperada = Buffer.from(`Bearer ${secreto}`);
  return dada.length === esperada.length && timingSafeEqual(dada, esperada);
}

export async function GET(request: Request): Promise<Response> {
  if (!claveOk(request)) return Response.json({ error: "No autorizado" }, { status: 401 });
  const resultado = await correrAvisos();
  // y de paso, las charlas con el plazo de guardado vencido (90 días; 02 · retención): se borra el texto y el teléfono
  const podadas = await podarConversaciones().catch((e) => { console.error("No se pudieron podar las charlas", (e as Error).message); return null; });
  return Response.json({ ok: true, hora: horaAR(), resultado, podadas }, { headers: { "cache-control": "no-store" } });
}
