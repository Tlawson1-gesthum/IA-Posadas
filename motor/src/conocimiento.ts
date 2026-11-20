// Conocimiento en vivo: un texto que el cliente publica (por ejemplo, el manual de su sistema) y que el agente lee
// antes de responder. Se guarda 10 minutos para no pedirlo en cada mensaje (y para aprovechar la caché del prompt).
const MINUTOS = 10;
// Caracteres: un manual muy largo se corta. Con 150.000 al de Gozza (178.000) le faltaban 26 temas y respondía "no lo encuentro".
const MAXIMO = 400_000;
const cache = new Map<string, { hasta: number; texto: string }>();

export async function leerConocimiento(url: string): Promise<string> {
  const c = cache.get(url);
  if (c && c.hasta > Date.now()) return c.texto;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { accept: "text/plain, text/markdown, */*" } });
    if (!r.ok) throw new Error(`respondió ${r.status}`);
    // Una página web en vez de texto suele ser una dirección equivocada (o el sistema todavía sin publicar).
    if ((r.headers.get("content-type") ?? "").includes("text/html")) throw new Error("devolvió una página web, no texto");
    const entero = await r.text();
    if (entero.length > MAXIMO) console.warn(`Conocimiento ${url}: ${entero.length} caracteres, se cortó en ${MAXIMO}`);
    const texto = entero.slice(0, MAXIMO).trim();
    cache.set(url, { hasta: Date.now() + MINUTOS * 60_000, texto });
    return texto;
  } catch (e) {
    // Si la fuente no responde, se usa la última copia buena aunque esté vencida.
    if (c) return c.texto;
    throw new Error(`No se pudo leer el conocimiento (${url}): ${(e as Error).message}`);
  }
}
