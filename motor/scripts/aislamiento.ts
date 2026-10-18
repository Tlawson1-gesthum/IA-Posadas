// Prueba de aislamiento entre dos distribuidoras (paso 18): una no ve nada de la otra. Sin Claude: llama a las herramientas
// directo, como lo haría el agente. Necesita los dos servidores locales del sistema (repo pensa-distribuidoras):
//   npm run dev:distri                                  → distri-demo en http://127.0.0.1:8795
//   node scripts/distri/segundo-local.mjs --preparar    → una vez; después: node scripts/distri/segundo-local.mjs → distri-otra en :8796
// y en motor/.env las dos claves (DISTRI_DEMO_AGENTE_CLAVE y DISTRI_OTRA_AGENTE_CLAVE).
// Uso: npm run aislamiento
import "./entorno.js";

// almacén en memoria con las fichas de fichas/ y sin ficha por defecto (como en producción con varios clientes)
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
process.env.FICHA_POR_DEFECTO = "";
const { cargarFicha, fichaPorNumero } = await import("../src/fichas.js");
const { obtenerAlmacen } = await import("../src/almacen.js");
const { REGISTRO } = await import("../src/herramientas/index.js");
const { atender } = await import("../src/atender.js");
import type { ContextoHerramienta, Ficha } from "../src/tipos.js";

// El mismo teléfono es cliente de las dos: "Kiosco Prueba 1" en distri-demo y "Almacén Otra Prueba" en distri-otra
const TELEFONO = "5493760001001";
const A = await cargarFicha("distri-demo");
const B = await cargarFicha("distri-otra");

let hechas = 0;
const fallas: string[] = [];
function comprobar(cond: unknown, que: string, detalle = "") {
  hechas++;
  console.log(`${cond ? "✓" : "✗"} ${que}${!cond && detalle ? `\n    ${detalle}` : ""}`);
  if (!cond) fallas.push(que);
}

const marca = Date.now();
const ctx = (ficha: Ficha, sufijo = ""): ContextoHerramienta => ({ ficha, telefono: TELEFONO, mensaje: { id: `aislamiento-${marca}-${ficha.id}${sufijo}` } });
const usar = async (h: string, entrada: Record<string, unknown>, c: ContextoHerramienta) => REGISTRO[h].ejecutar(entrada, c);
/** Lo que de una respuesta delataría al otro local: algún texto de la lista, sin distinguir mayúsculas. */
const delata = (respuesta: string, huellas: string[]) => huellas.filter((h) => h && respuesta.toLowerCase().includes(h.toLowerCase()));

// 1-2. Catálogo: cada una ve su cliente y sus productos (mismos producto_id en las dos, con otros nombres)
const catA = JSON.parse(await usar("ver_catalogo", {}, ctx(A)));
const catB = JSON.parse(await usar("ver_catalogo", {}, ctx(B)));
const nombresA: string[] = (catA.productos ?? []).map((p: any) => p.nombre);
const nombresB: string[] = (catB.productos ?? []).map((p: any) => p.nombre);
const huellasA = [catA.cliente?.nombre, ...nombresA];
const huellasB = [catB.cliente?.nombre, ...nombresB, "Otra"];
if (!catA.cliente?.conocido || !catB.cliente?.conocido || !nombresA.length || !nombresB.length) {
  console.error("No arrancó: el teléfono de prueba tiene que ser cliente en las dos. ¿Están los dos servidores y las dos claves?", { A: catA, B: catB });
  process.exit(1);
}
comprobar(!delata(JSON.stringify(catA), huellasB).length, `Catálogo en A: ${catA.cliente.nombre}, ${nombresA.length} productos, nada de B`, delata(JSON.stringify(catA), huellasB).join(", "));
comprobar(!delata(JSON.stringify(catB), huellasA).length, `Catálogo en B: ${catB.cliente.nombre}, ${nombresB.length} productos, nada de A`, delata(JSON.stringify(catB), huellasA).join(", "));

// 3. Buscar en B con el alias de un producto de A no trae productos de A
const busca = await usar("ver_catalogo", { buscar: "coca grande" }, ctx(B));
comprobar(!delata(busca, huellasA).length, 'Buscar "coca grande" en B no trae productos de A', delata(busca, huellasA).join(", "));

// 4-5. Cotizar el producto 1 (existe en las dos): cada una con su nombre y su precio
const cotA = await usar("cotizar_pedido_b2b", { items: [{ producto_id: 1, cantidad: 2 }] }, ctx(A));
const cotB = await usar("cotizar_pedido_b2b", { items: [{ producto_id: 1, cantidad: 2 }] }, ctx(B));
const montos = (s: string) => [...s.matchAll(/\$ [\d.,]+/g)].map((m) => m[0]);
const soloA = montos(cotA).filter((m) => !montos(cotB).includes(m));
const soloB = montos(cotB).filter((m) => !montos(cotA).includes(m));
comprobar(cotA.includes(nombresA.find((n) => cotA.includes(n)) ?? "\0") && !delata(cotA, huellasB).length && !soloB.some((m) => cotA.includes(m)),
  "Cotización en A: producto y montos de A, ninguno de B", cotA.slice(0, 300));
comprobar(cotB.includes(nombresB.find((n) => cotB.includes(n)) ?? "\0") && !delata(cotB, huellasA).length && !soloA.some((m) => cotB.includes(m)),
  "Cotización en B: producto y montos de B, ninguno de A", cotB.slice(0, 300));

// 6. Un pedido en cada una (el teléfono confirma)
const codigo = (s: string) => JSON.parse(s).codigo as string | undefined;
const pedA = await usar("crear_pedido_borrador", { items: [{ producto_id: 1, cantidad: 2 }], cliente_confirmo: true, seguro_de_lo_que_entendiste: true }, ctx(A));
const pedB = await usar("crear_pedido_borrador", { items: [{ producto_id: 1, cantidad: 2 }], cliente_confirmo: true, seguro_de_lo_que_entendiste: true }, ctx(B));
const codA = codigo(pedA), codB = codigo(pedB);
comprobar(codA && codB && codA !== codB, `Pedido cargado en cada una (A ${codA}, B ${codB})`, `${pedA.slice(0, 200)} · ${pedB.slice(0, 200)}`);

// 7-8. Consultar pedidos: cada una solo los suyos, y el código de la otra no existe
const misA = await usar("consultar_pedido_b2b", {}, ctx(A));
const misB = await usar("consultar_pedido_b2b", {}, ctx(B));
const ajenoEnA = await usar("consultar_pedido_b2b", { codigo: codB }, ctx(A));
const ajenoEnB = await usar("consultar_pedido_b2b", { codigo: codA }, ctx(B));
comprobar(misA.includes(codA!) && !misA.includes(codB!) && !delata(misA, huellasB).length && JSON.parse(ajenoEnA).pedidos.length === 0,
  "Pedidos en A: está el de A; el de B no aparece ni buscándolo por código", `${misA.slice(0, 200)} · ${ajenoEnA.slice(0, 200)}`);
comprobar(misB.includes(codB!) && !misB.includes(codA!) && !delata(misB, huellasA).length && JSON.parse(ajenoEnB).pedidos.length === 0,
  "Pedidos en B: está el de B; el de A no aparece ni buscándolo por código", `${misB.slice(0, 200)} · ${ajenoEnB.slice(0, 200)}`);

// 9-10. La clave de una no abre la otra: el sistema responde 401 y el agente no recibe datos
const conClaveDe = (ficha: Ficha, de: Ficha): Ficha => ({ ...ficha, integracion: { ...ficha.integracion!, clave_env: de.integracion!.clave_env } });
const status = async (ficha: Ficha, clave: string | undefined) =>
  (await fetch(`${ficha.integracion!.base_url}/api/agente/distri/catalogo?telefono=${TELEFONO}`, { headers: clave ? { authorization: `Bearer ${clave}` } : {} })).status;
const claveA = process.env[A.integracion!.clave_env!], claveB = process.env[B.integracion!.clave_env!];
const conAenB = await usar("ver_catalogo", {}, { ...ctx(B), ficha: conClaveDe(B, A) });
comprobar((await status(B, claveA)) === 401 && /no reconoce/.test(conAenB) && !delata(conAenB, huellasB).length, "Clave de A en B: 401 y sin datos", conAenB.slice(0, 200));
const conBenA = await usar("ver_catalogo", {}, { ...ctx(A), ficha: conClaveDe(A, B) });
comprobar((await status(A, claveB)) === 401 && /no reconoce/.test(conBenA) && !delata(conBenA, huellasA).length, "Clave de B en A: 401 y sin datos", conBenA.slice(0, 200));

// 11-12. Un número de WhatsApp sin ficha no cae en ninguna (ni con FICHA_POR_DEFECTO puesta, porque hay dos fichas con número)
const almacen = obtenerAlmacen();
await almacen.actualizarFicha(A.id, { whatsapp_phone_number_id: "PNID-AISLAMIENTO-A" });
await almacen.actualizarFicha(B.id, { whatsapp_phone_number_id: "PNID-AISLAMIENTO-B" });
const porNumero = [(await fichaPorNumero("PNID-AISLAMIENTO-A"))?.id, (await fichaPorNumero("PNID-AISLAMIENTO-B"))?.id];
process.env.FICHA_POR_DEFECTO = A.id;
const sinFicha = await fichaPorNumero("PNID-SIN-FICHA");
process.env.FICHA_POR_DEFECTO = "";
comprobar(porNumero[0] === A.id && porNumero[1] === B.id && sinFicha === null,
  "Cada número va a su ficha y uno sin ficha a ninguna (aunque haya ficha por defecto)", `A→${porNumero[0]} B→${porNumero[1]} sin ficha→${sinFicha?.id}`);
const enviados: string[] = [];
let llamadas = 0;
await atender({ phoneNumberId: "PNID-SIN-FICHA", de: TELEFONO, waId: `wamid.aislamiento.${marca}`, texto: "mandame 2 cajas de coca grande" } as any, {
  enviar: async (t: string) => { enviados.push(t); },
  cerebro: (async () => { llamadas++; throw new Error("no debía llamarse"); }) as any,
  esperaMs: 0,
});
comprobar(enviados.length === 0 && llamadas === 0, "Un mensaje a un número sin ficha no recibe respuesta", `respuestas: ${enviados.length}, cerebro: ${llamadas}`);

console.log(fallas.length ? `\nAislamiento FALLÓ (${fallas.length} de ${hechas}): ${fallas.join(" · ")}` : `\nAislamiento OK (${hechas} comprobaciones)`);
process.exit(fallas.length ? 1 : 0);
