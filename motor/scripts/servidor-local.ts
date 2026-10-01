// Corre el motor en la compu, como en Vercel: chat de prueba en http://localhost:3000 y panel en /panel.html.
// Sin SUPABASE_URL usa memoria y las fichas de la carpeta fichas/. Uso: npm run local
import "./entorno.js";
import { readFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { RAIZ } from "../src/raiz.js";

process.env.PANEL_CLAVE ??= "clave-local-123";
const rutas: Record<string, { GET?: (r: Request) => Response | Promise<Response>; POST?: (r: Request) => Promise<Response> }> = {
  "/api/chat": await import("../api/chat.js"),
  "/api/panel": await import("../api/panel.js"),
  "/api/whatsapp": await import("../api/whatsapp.js"),
};
const TIPOS: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css" };
const puerto = Number(process.env.PUERTO ?? 3000);

http
  .createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${puerto}`);
    const ruta = rutas[url.pathname];
    if (ruta) {
      const cuerpo: Buffer[] = [];
      for await (const c of req) cuerpo.push(c as Buffer);
      const pedido = new Request(url, {
        method: req.method,
        headers: req.headers as Record<string, string>,
        body: req.method === "GET" ? undefined : Buffer.concat(cuerpo),
      });
      const handler = ruta[req.method as "GET" | "POST"];
      const r = handler ? await handler(pedido) : new Response("Método no permitido", { status: 405 });
      // En la compu (http) el navegador no guarda cookies "Secure" salvo en localhost; se deja igual.
      res.writeHead(r.status, Object.fromEntries(r.headers));
      res.end(Buffer.from(await r.arrayBuffer()));
      return;
    }
    const archivo = path.join(RAIZ, "public", url.pathname === "/" ? "index.html" : path.normalize(url.pathname).replace(/^(\.\.[/\\])+/, ""));
    try {
      const datos = await readFile(archivo);
      res.writeHead(200, { "content-type": TIPOS[path.extname(archivo)] ?? "application/octet-stream" });
      res.end(datos);
    } catch {
      res.writeHead(404).end("No existe");
    }
  })
  .listen(puerto, () => {
    console.log(`Chat de prueba: http://localhost:${puerto}`);
    console.log(`Panel:          http://localhost:${puerto}/panel.html  (clave: ${process.env.PANEL_CLAVE})`);
  });
