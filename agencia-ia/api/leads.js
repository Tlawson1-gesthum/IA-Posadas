// CRM de la agencia: solo con la clave ADMIN_TOKEN.
import { hgetall, hget, hset } from "./_lib/store.js";
import { send, isAdmin, clip } from "./_lib/http.js";

const STAGES = ["Nuevo", "Reunión agendada", "Demo enviada", "Cliente"];

export default async function handler(req, res) {
  if (!isAdmin(req)) return send(res, 401, { error: "Clave de administrador incorrecta" });
  if (req.method === "GET") return send(res, 200, { leads: await hgetall("leads") });
  if (req.method === "PATCH") {
    const id = clip(req.body?.id, 40), etapa = clip(req.body?.etapa, 40);
    if (!STAGES.includes(etapa)) return send(res, 400, { error: "Etapa inválida" });
    const lead = await hget("leads", id);
    if (!lead) return send(res, 404, { error: "No existe ese contacto" });
    await hset("leads", id, Object.assign(lead, { etapa, actualizado: new Date().toISOString() }));
    return send(res, 200, { ok: true });
  }
  send(res, 405, { error: "Método no permitido" });
}
