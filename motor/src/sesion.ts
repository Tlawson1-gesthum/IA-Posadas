// Acceso al panel: una clave (PANEL_CLAVE) y una cookie firmada que dura 12 horas.
// Cambiar PANEL_CLAVE en Vercel cierra todas las sesiones abiertas.
import { createHmac, timingSafeEqual } from "node:crypto";
import { obtenerAlmacen } from "./almacen.js";

const COOKIE = "panel_sesion";
const HORAS = 12;
const INTENTOS = 8;

function firmar(texto: string, clave: string): string {
  return createHmac("sha256", clave).update(texto).digest("hex");
}

function iguales(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** True si el pedido trae una sesión válida del panel. */
export function sesionValida(request: Request): boolean {
  const clave = process.env.PANEL_CLAVE;
  if (!clave) return false;
  const cookie = (request.headers.get("cookie") ?? "").split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`));
  const [vence, firma] = (cookie?.slice(COOKIE.length + 1) ?? "").split(".");
  if (!vence || !firma || Number(vence) < Date.now()) return false;
  return iguales(firma, firmar(vence, clave));
}

function ipDe(request: Request): string {
  return (request.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();
}

/** Intenta entrar. Devuelve la cookie para el encabezado Set-Cookie, o un error. */
export async function entrar(request: Request, intento: string): Promise<{ cookie: string } | { error: string; status: number }> {
  const clave = process.env.PANEL_CLAVE;
  if (!clave || clave.length < 10) return { error: "Falta configurar PANEL_CLAVE (mínimo 10 caracteres) en Vercel.", status: 500 };
  const almacen = obtenerAlmacen();
  const ip = ipDe(request);
  const fallidos = (await almacen.eventos(new Date(Date.now() - 15 * 60_000), ["login_fallido"])).filter((e) => e.detalle === ip);
  if (fallidos.length >= INTENTOS) return { error: "Demasiados intentos. Esperá 15 minutos.", status: 429 };
  if (!iguales(firmar(intento, "comparar"), firmar(clave, "comparar"))) {
    await almacen.evento(null, null, "login_fallido", ip);
    return { error: "Clave incorrecta.", status: 401 };
  }
  const vence = String(Date.now() + HORAS * 3600_000);
  return { cookie: `${COOKIE}=${vence}.${firmar(vence, clave)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${HORAS * 3600}` };
}

export const COOKIE_SALIR = `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
