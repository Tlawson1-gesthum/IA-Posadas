// Viandas de un local Pensa (módulo Viandas): menús, packs y cómo funciona, en vivo desde /api/menu (campo `viandas`).
// Los precios solo salen si la ficha lo permite (integracion.viandas_precios); si no, el agente manda el link.
// comprar_pack usa POST /api/viandas, el mismo de la tienda: devuelve el link de Mercado Pago. Con crear_pedidos false, simula.
import type { ContextoHerramienta, Herramienta } from "../tipos.js";
import { BARRIOS_POSADAS, type Barrio } from "../zonas/posadas.js";
import { nominatim } from "./zona.js";
import { enviarImagen, tokenDe } from "../instagram.js";
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
      // Una sola vianda no es un "pack": así se le dice a la persona, aunque en la web tenga otro nombre.
      como_decirlo: p.cantidad === 1 ? "1 vianda" : `pack de ${p.cantidad} viandas`,
      viandas: p.cantidad,
      ...(precios ? { precio: p.precio, precio_por_vianda: p.por_vianda, ahorro_frente_a_sueltas: p.ahorro || undefined } : {}),
    }));
    const recomendado = [...v.packs].sort((a: any, b: any) => b.cantidad - a.cantidad)[0];
    const porVianda = v.packs.map((p: any) => p.por_vianda);
    return JSON.stringify({
      a_la_venta: true,
      como_funciona: v.texto,
      menus: v.menus,
      elegir_hasta: v.limite,
      packs,
      pack_recomendado: `pack de ${recomendado.cantidad} viandas`,
      ...(precios && recomendado.ahorro ? { ahorro_con_el_recomendado: recomendado.ahorro } : {}),
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
        pack: { type: "string", description: "El pack elegido: el nombre o como_decirlo de ver_viandas (ej. \"pack de 20 viandas\" o \"1 vianda\")." },
        nombre: { type: "string", description: "Nombre y apellido de quien compra." },
        whatsapp: { type: "string", description: "WhatsApp con característica, como lo escribió la persona (ej. 3764 123456)." },
        retira: { type: "boolean", description: "true si las retira en el local; false si van con envío." },
        direccion: { type: "string", description: "Calle y número para el envío (vacío si retira)." },
        referencia: { type: "string", description: "Piso, depto, entre calles (opcional)." },
        barrio: { type: "string", description: "Barrio del envío, el que devolvió envio_viandas (vacío si retira)." },
      },
      required: ["pack", "nombre", "whatsapp", "retira", "direccion", "referencia", "barrio"],
      additionalProperties: false,
    },
    strict: true,
  },
  async ejecutar(entrada, ctx) {
    const v = (await traerCarta(ctx)).viandas;
    if (!v?.packs?.length) return JSON.stringify({ creado: false, motivo: "Hoy las viandas no están a la venta por la web." });
    const buscado = String(entrada.pack ?? "").trim().toLowerCase();
    // Por el nombre de la web, o por la cantidad ("pack de 20 viandas", "1 vianda", "una vianda suelta").
    const numero = buscado.match(/\d+/)?.[0];
    const cantidad = numero ? Number(numero) : /\b(una|suelta)\b/.test(buscado) ? 1 : NaN;
    const pack = v.packs.find((p: any) => p.nombre.toLowerCase() === buscado) ?? v.packs.find((p: any) => p.cantidad === cantidad);
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

    // Con zona de envío en la ficha, el código revisa la dirección: aunque el modelo se confunda, no carga un envío fuera de zona.
    let referencia = retira ? "" : String(entrada.referencia ?? "").trim();
    const barrios = retira ? null : barriosConEnvio(ctx);
    if (barrios) {
      const lista = barrios.map((b) => b.nombre).join(", ");
      let barrio = barrioPorNombre(String(entrada.barrio ?? ""), barrios);
      if (!barrio) return JSON.stringify({ creado: false, motivo: `El envío de viandas es solo para ${lista}. Usá envio_viandas con la dirección, u ofrecé retirarlas en el local.` });
      const mapa = await revisarEnvio(direccion, barrios, ctx);
      if (mapa.llega === "no") {
        return JSON.stringify({ creado: false, motivo: `En el mapa, ${mapa.direccion ?? direccion} queda${mapa.barrio_del_mapa ? ` en ${mapa.barrio_del_mapa}` : ""}, fuera de ${lista}. Ofrecé retirarlas en el local o derivá si la persona insiste.` });
      }
      if (mapa.llega === "si") barrio = barrios.find((b) => b.nombre === mapa.barrio) ?? barrio;
      referencia = [referencia, `Barrio: ${barrio.nombre}`].filter(Boolean).join(" · ");
    }

    const cuerpo = { pack: pack.i, nombre, telefono: whatsapp, retira, direccion, referencia };
    const precios = ctx.ficha.integracion?.viandas_precios === true;
    const precioEnvio = ctx.ficha.integracion?.viandas_envio?.precio;
    const despues = retira
      ? "Cuando pague, el local le escribe por WhatsApp para coordinar cuándo las retira."
      : `Cuando pague, el local le escribe por WhatsApp para coordinar la entrega${precioEnvio ? ` (cada envío sale $${precioEnvio.toLocaleString("es-AR")})` : ""}.`;

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

// ---- envío de viandas: solo a algunos barrios, a precio fijo (integracion.viandas_envio) ----

const normalizar = (t: string) =>
  t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

/** ¿El punto [lng, lat] cae dentro del polígono? (rayo hacia el este) */
export function dentroDe(punto: [number, number], poligono: [number, number][]): boolean {
  const [x, y] = punto;
  let dentro = false;
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
    const [xi, yi] = poligono[i];
    const [xj, yj] = poligono[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

/** Los barrios con envío de viandas de la ficha, o null si la ficha no limita el envío. */
function barriosConEnvio(ctx: ContextoHerramienta): Barrio[] | null {
  const nombres = ctx.ficha.integracion?.viandas_envio?.barrios;
  if (!nombres?.length) return null;
  const pedidos = new Set(nombres.map(normalizar));
  return BARRIOS_POSADAS.filter((b) => pedidos.has(normalizar(b.nombre)));
}

/** El barrio de la lista que nombra el texto ("palomar", "Villa Sarita"), si lo nombra tal cual. */
export function barrioPorNombre(texto: string, barrios: Barrio[]): Barrio | undefined {
  const t = normalizar(texto);
  return barrios.find((b) => b.alias.some((a) => t === a || t === `barrio ${a}`));
}

export function barrioDelPunto(lng: number, lat: number, barrios: Barrio[]): Barrio | undefined {
  return barrios.find((b) => dentroDe([lng, lat], b.poligono));
}

type ResultadoEnvio =
  | { llega: "si"; barrio: string; precision: "barrio" | "direccion"; direccion?: string }
  | { llega: "no"; direccion?: string; barrio_del_mapa?: string }
  | { llega: "no_se"; motivo: string };

/** Busca el lugar en el mapa (cerca de la cocina) y dice si cae en un barrio con envío de viandas. */
export async function revisarEnvio(texto: string, barrios: Barrio[], ctx: ContextoHerramienta): Promise<ResultadoEnvio> {
  const porNombre = barrioPorNombre(texto, barrios);
  if (porNombre) return { llega: "si", barrio: porNombre.nombre, precision: "barrio" };
  const cocina = (await traerCarta(ctx)).cocina;
  const margen = 10 / 111;
  const viewbox = [cocina.lng - margen, cocina.lat + margen, cocina.lng + margen, cocina.lat - margen].map((x: number) => x.toFixed(4)).join(",");
  let lugares: any[];
  try {
    lugares = await nominatim("search", { q: `${texto}, Posadas, Misiones`, viewbox, bounded: "1", limit: "5", addressdetails: "1" });
  } catch {
    return { llega: "no_se", motivo: "No se pudo consultar el mapa ahora." };
  }
  if (!lugares?.length) return { llega: "no_se", motivo: "No encontré ese lugar en el mapa." };
  const conAltura = /\d/.test(texto);
  const exacto = conAltura ? lugares.find((l) => l.address?.house_number) : lugares[0];
  if (!exacto) return { llega: "no_se", motivo: "No encontré esa altura exacta en el mapa." };
  const a = exacto.address ?? {};
  const direccion = a.house_number ? `${a.road ?? ""} ${a.house_number}`.trim() : String(exacto.name || "").trim() || undefined;
  const barrio = barrioDelPunto(Number(exacto.lon), Number(exacto.lat), barrios);
  if (barrio) return { llega: "si", barrio: barrio.nombre, precision: conAltura ? "direccion" : "barrio", direccion };
  return { llega: "no", direccion, barrio_del_mapa: a.neighbourhood || a.suburb || undefined };
}

export const envioViandas: Herramienta = {
  definicion: {
    name: "envio_viandas",
    description:
      "Dice si hay envío de viandas a una dirección o barrio de Posadas y cuánto sale cada envío. Pasale la calle con altura (ej. \"Bolívar 1850\") o el barrio, como lo escribió la persona. Usala siempre antes de ofrecer o cargar viandas con envío.",
    input_schema: {
      type: "object",
      properties: { lugar: { type: "string", description: "Calle y altura, o barrio, tal como lo escribió la persona." } },
      required: ["lugar"],
      additionalProperties: false,
    },
    strict: true,
  },
  async ejecutar(entrada, ctx) {
    const barrios = barriosConEnvio(ctx);
    const config = ctx.ficha.integracion?.viandas_envio;
    if (!barrios || !config) return JSON.stringify({ nota: "Este local no tiene cargada la zona de envío de viandas: derivá a una persona." });
    const texto = String(entrada.lugar ?? "").trim().slice(0, 120);
    const lista = barrios.map((b) => b.nombre);
    const precio = config.precio;
    const r = await revisarEnvio(texto, barrios, ctx);
    if (r.llega === "si") {
      return JSON.stringify({
        ...r,
        precio_por_envio: precio,
        nota:
          r.precision === "direccion"
            ? `Confirmale que la dirección es ${r.direccion}, en ${r.barrio}. Usá barrio "${r.barrio}" en comprar_pack.`
            : `Para cargarlo hace falta la calle y la altura. Usá barrio "${r.barrio}" en comprar_pack.`,
      });
    }
    if (r.llega === "no") {
      return JSON.stringify({
        ...r,
        barrios_con_envio: lista,
        nota: "Esa dirección no está en los barrios con envío de viandas. Ofrecé retirarlas en el local (Av. Centenario 2595). Si la persona insiste en que está en uno de esos barrios, derivá con motivo otro.",
      });
    }
    return JSON.stringify({
      ...r,
      barrios_con_envio: lista,
      nota: "Preguntale en qué barrio queda (o entre qué calles). Si dice uno de los barrios con envío, volvé a usar esta herramienta con el nombre del barrio.",
    });
  },
};

/** Tipo de evento con el que se anota cada foto que manda el motor (así su eco no se confunde con una persona del equipo). */
export const FOTO_ENVIADA = "foto_enviada";

export const mostrarMenuEjemplo: Herramienta = {
  definicion: {
    name: "mostrar_menu_ejemplo",
    description:
      "Le manda a la persona, por mensaje directo, la foto real de un menú del día (un ejemplo de lo que trae cada uno de los 5 menús) y te devuelve su texto. Usala una sola vez por charla, cuando pregunten qué platos hay o qué trae cada menú.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  async ejecutar(_entrada, ctx) {
    const ejemplo = ctx.ficha.instagram?.menu_ejemplo;
    if (!ejemplo) return JSON.stringify({ enviada: false, nota: "No hay un menú de ejemplo cargado: contá los 5 menús con sus descripciones." });
    const nota = "Es un ejemplo de un día: los platos cambian todos los días. No copies el texto entero si ya le llegó la foto.";
    // Solo en charlas de Instagram (ig:<id>). En WhatsApp, la web o las pruebas, devuelve el texto y no manda nada.
    if (!ctx.telefono.startsWith("ig:") || !ctx.ficha.instagram) return JSON.stringify({ enviada: false, simulada: true, texto_del_ejemplo: ejemplo.texto, nota });
    const ig = ctx.ficha.instagram;
    try {
      const mid = await enviarImagen(ig.ig_user_id, await tokenDe(ctx.ficha), ctx.telefono.slice(3), ejemplo.imagen);
      await obtenerAlmacen().evento(ctx.ficha.id, null, FOTO_ENVIADA, mid).catch(() => {});
      return JSON.stringify({ enviada: true, texto_del_ejemplo: ejemplo.texto, nota: `Ya le llegó la foto. ${nota}` });
    } catch (e) {
      console.error("No salió la foto del menú de ejemplo", (e as Error).message);
      return JSON.stringify({ enviada: false, texto_del_ejemplo: ejemplo.texto, nota: "La foto no salió: contale el ejemplo con el texto, corto." });
    }
  },
};
