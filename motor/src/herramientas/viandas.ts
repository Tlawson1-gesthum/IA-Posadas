// Viandas de un local Pensa (módulo Viandas): menús, packs y cómo funciona, en vivo desde /api/menu (campo `viandas`).
// Los precios solo salen si la ficha lo permite (integracion.viandas_precios); si no, el agente manda el link.
// comprar_pack usa POST /api/viandas, el mismo de la tienda: devuelve el link de Mercado Pago. Con crear_pedidos false, simula.
import type { Herramienta } from "../tipos.js";
import { obtenerAlmacen } from "../almacen.js";
import { baseUrl, traerCarta } from "./semorfa.js";

const UTM = "utm_source=instagram&utm_medium=dm&utm_campaign=30dias";

export const verViandas: Herramienta = {
  definicion: {
    name: "ver_viandas",
    description:
      "Trae en vivo desde la web del local las viandas: los menús con su descripción, los packs (cuántas viandas trae cada uno), hasta qué hora se elige el menú del día, el link para comprar y la página para empresas. Usala siempre que hables de viandas.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  async ejecutar(_entrada, ctx) {
    const v = (await traerCarta(ctx)).viandas;
    const base = baseUrl(ctx);
    if (!v?.packs?.length) {
      return JSON.stringify({ a_la_venta: false, nota: "Hoy las viandas no están a la venta por la web. Derivá a una persona si la persona quiere viandas." });
    }
    const precios = ctx.ficha.integracion?.viandas_precios === true;
    const packs = v.packs.map((p: any) => ({
      nombre: p.nombre,
      viandas: p.cantidad,
      ...(precios ? { precio: p.precio, precio_por_vianda: p.por_vianda, ahorro: p.ahorro || undefined } : {}),
    }));
    const porVianda = v.packs.map((p: any) => p.por_vianda);
    return JSON.stringify({
      a_la_venta: true,
      como_funciona: v.texto,
      menus: v.menus,
      elegir_hasta: v.limite,
      packs,
      cuantas_mas_menos_sale_cada_una: porVianda.every((x: number, i: number) => i === 0 || x <= porVianda[i - 1]) && porVianda.at(-1) < porVianda[0],
      precios: precios
        ? "Podés decir estos precios tal cual (son los de la web en este momento)."
        : "No digas precios ni montos de ahorro: están en el link para comprar.",
      link_comprar: `${base}/viandas?${UTM}`,
      link_empresas: `${base}/empresas?${UTM}`,
    });
  },
};

const soloNumeros = (t: unknown) => String(t ?? "").replace(/\D/g, "");

export const comprarPack: Herramienta = {
  definicion: {
    name: "comprar_pack",
    description:
      "Arma la compra de un pack de viandas en la web del local y devuelve el link de Mercado Pago para pagarlo. Usala una sola vez, solo después de que la persona eligió el pack, te dio su nombre, su WhatsApp y si retira o la dirección, y te dijo que sí al resumen. El pack queda cargado recién cuando paga.",
    input_schema: {
      type: "object",
      properties: {
        pack: { type: "string", description: "Nombre del pack tal como lo devuelve ver_viandas (ej. \"Pack de 10 viandas\")." },
        nombre: { type: "string", description: "Nombre y apellido de quien compra." },
        whatsapp: { type: "string", description: "WhatsApp con característica, como lo escribió la persona (ej. 3764 123456)." },
        retira: { type: "boolean", description: "true si las retira en el local; false si van con envío." },
        direccion: { type: "string", description: "Calle y número para el envío (vacío si retira)." },
        referencia: { type: "string", description: "Piso, depto, barrio, entre calles (opcional)." },
      },
      required: ["pack", "nombre", "whatsapp", "retira", "direccion", "referencia"],
      additionalProperties: false,
    },
    strict: true,
  },
  async ejecutar(entrada, ctx) {
    const v = (await traerCarta(ctx)).viandas;
    if (!v?.packs?.length) return JSON.stringify({ creado: false, motivo: "Hoy las viandas no están a la venta por la web." });
    const buscado = String(entrada.pack ?? "").trim().toLowerCase();
    const pack = v.packs.find((p: any) => p.nombre.toLowerCase() === buscado);
    if (!pack) return JSON.stringify({ creado: false, motivo: `No existe el pack "${entrada.pack}". Los packs son: ${v.packs.map((p: any) => p.nombre).join(", ")}.` });
    const nombre = String(entrada.nombre ?? "").trim();
    const whatsapp = soloNumeros(entrada.whatsapp);
    const retira = entrada.retira === true;
    const direccion = retira ? "" : String(entrada.direccion ?? "").trim();
    const errores = [
      nombre.length < 2 && "Falta el nombre.",
      (whatsapp.length < 10 || whatsapp.length > 13) && "El WhatsApp tiene que ir con la característica (ej. 3764 123456).",
      !retira && direccion.length < 4 && "Falta la dirección del envío (o que diga que las retira).",
    ].filter(Boolean);
    if (errores.length) return JSON.stringify({ creado: false, motivo: errores.join(" ") });

    const cuerpo = { pack: pack.i, nombre, telefono: whatsapp, retira, direccion, referencia: retira ? "" : String(entrada.referencia ?? "").trim() };
    const precios = ctx.ficha.integracion?.viandas_precios === true;
    const despues = retira
      ? "Cuando pague, el local le escribe por WhatsApp para coordinar cuándo las retira."
      : "Cuando pague, el local le escribe por WhatsApp para coordinar la entrega.";

    // Mientras la ficha no lo habilite, no se toca el sistema real: se simula para probar.
    if (!ctx.ficha.integracion?.crear_pedidos) {
      return JSON.stringify({
        creado: true, simulado: true, codigo: "PRUEBA1", pack: pack.nombre, viandas: pack.cantidad,
        ...(precios ? { total: pack.precio } : {}), link_pago: "https://www.mercadopago.com.ar/checkout/PRUEBA", despues, enviado: cuerpo,
      });
    }

    const r = await fetch(`${baseUrl(ctx)}/api/viandas`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(15000),
    });
    const resp: any = await r.json().catch(() => ({}));
    if (!r.ok || !resp.pagar) return JSON.stringify({ creado: false, motivo: resp.error ?? `La web respondió ${r.status}` });
    await obtenerAlmacen().evento(ctx.ficha.id, null, "venta", `Pack armado por el agente: ${pack.nombre} (${resp.codigo}), esperando el pago`).catch(() => {});
    return JSON.stringify({
      creado: true, codigo: resp.codigo, pack: pack.nombre, viandas: pack.cantidad,
      ...(precios ? { total: resp.total } : {}), link_pago: resp.pagar, despues,
    });
  },
};
