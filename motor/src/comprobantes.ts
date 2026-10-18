// Comprobante de transferencia que manda un cliente de una distribuidora (paso 24): el motor lo lee (src/vision.ts) y se lo pasa al
// sistema de la distribuidora (/api/agente/distri/comprobante), que lo guarda y busca con qué deuda coincide. El agente recibe el
// resultado como texto entre corchetes; si coincide, le pregunta al cliente si es eso y con su sí usa confirmar_comprobante.
// El monto que vale es el de la lectura guardada en el sistema, nunca uno que escriba el cliente.
import { autorizacion, baseUrl } from "./herramientas/semorfa.js";
import type { Ficha } from "./tipos.js";
import { leerComprobante } from "./vision.js";

const pesos = (c: number) => "$ " + (c / 100).toLocaleString("es-AR", { minimumFractionDigits: c % 100 ? 2 : 0, maximumFractionDigits: 2 });

export async function procesarComprobante(ficha: Ficha, telefono: string, imagen: ArrayBuffer, mime: string): Promise<string> {
  const l = await leerComprobante(imagen, mime, { modelo: ficha.modelo });
  if (!l.es_comprobante) return `[Foto: no parece un comprobante de pago. ${l.problema ?? ""}]`.trim();
  if (!l.legible) return `[Foto de un comprobante que no se pudo leer: ${l.problema ?? "no se ve el importe"}. Pedile que lo mande de nuevo más claro.]`;
  if (!ficha.integracion?.crear_pedidos) return `[Foto de un comprobante de ${pesos(l.monto_centavos!)} (ficha de prueba: no se guardó). Decile que lo revisa una persona.]`;
  try {
    const ctx = { ficha, telefono };
    const r = await fetch(`${baseUrl(ctx)}/api/agente/distri/comprobante`, {
      method: "POST",
      headers: { "content-type": "application/json", ...autorizacion(ctx) },
      body: JSON.stringify({ telefono, lectura: l, imagen: Buffer.from(imagen).toString("base64") }),
      signal: AbortSignal.timeout(20000),
    });
    const d: any = await r.json().catch(() => null);
    if (!r.ok || !d?.ok) return `[Foto de un comprobante de ${pesos(l.monto_centavos!)}: no se pudo guardar. Derivá a una persona (motivo plata).]`;
    const fecha = d.fecha_texto ? ` del ${d.fecha_texto}` : "";
    if (d.coincide) return `[Foto de un comprobante de transferencia de ${pesos(d.monto_centavos)}${fecha} (comprobante ${d.id}). Coincide con ${d.coincide.con} por ${pesos(d.coincide.monto_centavos)}. Preguntale si es eso; con su sí, usá confirmar_comprobante.]`;
    return `[Foto de un comprobante de transferencia de ${pesos(d.monto_centavos)}${fecha} (comprobante ${d.id}). No coincide con lo que debe (${d.motivo ?? "lo revisa una persona"}). Decile que lo revisa una persona del equipo y le confirma por acá. No lo des por pagado.]`;
  } catch {
    return `[Foto de un comprobante de ${pesos(l.monto_centavos!)}: no se pudo guardar. Derivá a una persona (motivo plata).]`;
  }
}
