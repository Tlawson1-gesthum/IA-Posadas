// Cupón para pedir en la web (integracion.cupon_web): el agente lo ofrece solo si la web dice que está vigente hoy.
// Usa POST /api/cupon, la misma vista previa del carrito (sin teléfono): revisa que exista, que esté activo y las fechas.
import type { Herramienta } from "../tipos.js";
import { baseUrl } from "./semorfa.js";

const CACHE_MS = 10 * 60_000;
const cache = new Map<string, { hasta: number; valor: string }>();

export const verCuponWeb: Herramienta = {
  definicion: {
    name: "ver_cupon_web",
    description:
      "Dice si hoy hay un cupón vigente para pedir de la carta en la web del local, con su código y sus condiciones. Usala antes de nombrar cualquier cupón o descuento para la web.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  async ejecutar(_entrada, ctx) {
    const cupon = ctx.ficha.integracion?.cupon_web;
    if (!cupon) return JSON.stringify({ vigente: false, nota: "No hay cupones para informar." });
    const clave = `${ctx.ficha.id}:${cupon.codigo}`;
    const guardado = cache.get(clave);
    if (guardado && guardado.hasta > Date.now()) return guardado.valor;
    let valor: string;
    try {
      const r = await fetch(`${baseUrl(ctx)}/api/cupon`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ codigo: cupon.codigo, productos: 20000 }),
        signal: AbortSignal.timeout(8000),
      });
      const cuerpo: any = await r.json().catch(() => null);
      valor = r.ok && cuerpo?.codigo
        ? JSON.stringify({
            vigente: true,
            codigo: cuerpo.codigo,
            condiciones: cupon.condiciones,
            nota: "Ofrecelo una sola vez en la charla, a quien quiera pedir de la carta por la web. No sirve para las viandas. Se escribe en la web al pagar.",
          })
        : JSON.stringify({ vigente: false, nota: "Hoy no hay cupones para informar. No nombres ningún cupón ni descuento." });
    } catch {
      return JSON.stringify({ vigente: false, nota: "No se pudo consultar. No nombres ningún cupón." });
    }
    cache.set(clave, { hasta: Date.now() + CACHE_MS, valor });
    return valor;
  },
};
