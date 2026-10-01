// Turnero: GET devuelve los horarios ocupados; POST reserva uno. GET con ?admin trae las reservas con nombres (requiere ADMIN_TOKEN).
import { claim, addToSet, members, hset, hgetall, persistente } from "./_lib/store.js";
import { send, isAdmin, clip } from "./_lib/http.js";

const SLOT = /^[a-z]{2,12}_\d{4}-\d{2}-\d{2}_\d{4}$/;

export default async function handler(req, res) {
  if (req.method === "GET") {
    if ("admin" in (req.query || {})) {
      if (!isAdmin(req)) return send(res, 401, { error: "Clave de administrador incorrecta" });
      return send(res, 200, { reservas: await hgetall("reservas") });
    }
    return send(res, 200, { ocupados: await members("turnos"), persistente });
  }
  if (req.method === "POST") {
    const b = req.body || {};
    const slot = clip(b.slot, 40);
    if (!SLOT.test(slot)) return send(res, 400, { error: "Horario inválido" });
    const r = { rubro: clip(b.rubro, 12), slot, fecha: clip(b.fecha, 10), hora: clip(b.hora, 5), diaTexto: clip(b.diaTexto, 30), servicio: clip(b.servicio, 60), nombre: clip(b.nombre, 80), whatsapp: clip(b.whatsapp, 30), creado: new Date().toISOString() };
    if (!r.nombre || !r.whatsapp) return send(res, 400, { error: "Faltan el nombre y el WhatsApp" });
    if (!(await claim("turno:" + slot))) return send(res, 409, { error: "Ese horario se acaba de ocupar" });
    await addToSet("turnos", slot);
    await hset("reservas", "t-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), r);
    return send(res, 200, { ok: true });
  }
  send(res, 405, { error: "Método no permitido" });
}
