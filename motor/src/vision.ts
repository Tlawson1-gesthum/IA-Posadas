// Foto de una lista de pedido (papel escrito a mano, captura, pizarrón) → renglones con producto y cantidad.
// Claude con salida JSON con esquema (mismo patrón que lib/lectorFacturas.js del sistema de los locales). El modelo es el de la ficha.
// Solo LEE: no pone precios ni decide nada. Lo que no reconoce queda con producto_id null y su duda; el agente pregunta.
// VISION_SIMULAR=1 devuelve una lectura de ejemplo con los primeros productos del catálogo (pruebas sin gastar).
import Anthropic from "@anthropic-ai/sdk";

export interface ProductoResumido {
  id: number;
  nombre: string;
  presentacion?: string;
  /** Cómo lo piden los clientes ("coca grande", "la de 2 y cuarto"). */
  alias?: string[];
}

export interface RenglonLeido {
  /** Lo que dice el papel, tal cual. */
  texto: string;
  /** Producto del catálogo que corresponde, o null si no está claro. */
  producto_id: number | null;
  cantidad: number | null;
  /** Por qué no está seguro (letra que no se entiende, dos productos posibles…). */
  duda: string | null;
}

export interface ListaLeida {
  legible: boolean;
  /** Si no es legible o no es una lista de pedido: qué pasa, para decírselo al cliente. */
  problema: string | null;
  renglones: RenglonLeido[];
}

const MAX_CATALOGO = 500;
const MAX_RENGLONES = 100;

const ESQUEMA = {
  type: "object",
  additionalProperties: false,
  required: ["legible", "problema", "renglones"],
  properties: {
    legible: { type: "boolean" },
    problema: { type: ["string", "null"] },
    renglones: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["texto", "producto_id", "cantidad", "duda"],
        properties: {
          texto: { type: "string" },
          producto_id: { type: ["integer", "null"] },
          cantidad: { type: ["number", "null"] },
          duda: { type: ["string", "null"] },
        },
      },
    },
  },
};

const SISTEMA = `Leés fotos de listas de pedido que los comercios le mandan a una distribuidora mayorista (papel escrito a mano, captura de pantalla, pizarrón).
Para cada renglón del pedido devolvé:
- texto: lo que dice, tal cual (sin corregir).
- producto_id: el id del producto del catálogo que corresponde. Usá también "cómo lo piden". Si hay dos posibles o no estás seguro, null.
- cantidad: el número de unidades o bultos que pide. Si no se lee o no figura, null.
- duda: si producto_id o cantidad son null, o algo no se lee bien, explicalo en pocas palabras en castellano rioplatense. Si no hay duda, null.
Nunca inventes productos ni cantidades. No pongas precios. Ignorá tachaduras, firmas y lo que no sea parte del pedido.
Si la foto no es una lista de pedido o no se puede leer, legible = false, problema = qué pasa (en una oración) y renglones vacío.`;

const catalogoTexto = (catalogo: ProductoResumido[]) =>
  "Catálogo (id · nombre · presentación · cómo lo piden):\n" +
  catalogo.slice(0, MAX_CATALOGO).map(p => [p.id, p.nombre, p.presentacion || "", (p.alias || []).join(", ")].join(" · ")).join("\n");

/** Deja solo lo que tiene sentido: ids que existen en el catálogo, cantidades positivas, textos acotados. */
export function normalizarLista(crudo: any, catalogo: ProductoResumido[]): ListaLeida {
  const ids = new Set(catalogo.map(p => p.id));
  const txt = (v: unknown, n: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null);
  if (!crudo || crudo.legible !== true) return { legible: false, problema: txt(crudo?.problema, 200) ?? "No se pudo leer la foto.", renglones: [] };
  const renglones: RenglonLeido[] = (Array.isArray(crudo.renglones) ? crudo.renglones : []).slice(0, MAX_RENGLONES).map((r: any) => {
    const id = Number.isInteger(r?.producto_id) && ids.has(r.producto_id) ? r.producto_id : null;
    const q = Number(r?.cantidad);
    const cantidad = Number.isFinite(q) && q > 0 && q <= 100000 ? q : null;
    let duda = txt(r?.duda, 200);
    if (r?.producto_id != null && id === null) duda = duda ?? "El producto no está en el catálogo.";
    if (!duda && (id === null || cantidad === null)) duda = id === null ? "No está claro qué producto es." : "No se lee la cantidad.";
    return { texto: txt(r?.texto, 200) ?? "", producto_id: id, cantidad, duda };
  }).filter((r: RenglonLeido) => r.texto || r.producto_id !== null);
  return { legible: true, problema: null, renglones };
}

export async function leerListaEnFoto(imagen: ArrayBuffer, mime: string, catalogo: ProductoResumido[], opciones: { modelo: string }): Promise<ListaLeida> {
  if (process.env.VISION_SIMULAR === "1") {
    return normalizarLista({ legible: true, problema: null, renglones: catalogo.slice(0, 2).map((p, i) => ({ texto: `${i + 2} ${p.nombre}`, producto_id: p.id, cantidad: i + 2, duda: null })) }, catalogo);
  }
  const tipo = (mime || "image/jpeg").split(";")[0].trim().toLowerCase();
  if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(tipo)) return { legible: false, problema: "Ese tipo de archivo no se puede leer: mandá una foto (JPG o PNG).", renglones: [] };
  const client = new Anthropic({ maxRetries: 2, timeout: 120e3 });
  const r = await client.beta.messages.create({
    model: opciones.modelo,
    max_tokens: 8000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", format: { type: "json_schema", schema: ESQUEMA } },
    system: [{ type: "text", text: SISTEMA }, { type: "text", text: catalogoTexto(catalogo), cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: [
      { type: "image", source: { type: "base64", media_type: tipo as "image/jpeg", data: Buffer.from(imagen).toString("base64") } },
      { type: "text", text: "Leé esta lista de pedido." },
    ] }],
  } as any) as any;
  if (r.stop_reason === "refusal") return { legible: false, problema: "No se pudo leer esta foto.", renglones: [] };
  if (r.stop_reason === "max_tokens") return { legible: false, problema: "La lista es muy larga para leerla de una vez: mandala en dos fotos.", renglones: [] };
  const texto = (r.content ?? []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
  let crudo: unknown = null;
  try { crudo = JSON.parse(texto); } catch { return { legible: false, problema: "No se entendió la lectura de la foto.", renglones: [] }; }
  return normalizarLista(crudo, catalogo);
}
