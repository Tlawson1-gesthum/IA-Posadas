// GET: horarios de reunión ocupados (sin datos personales). POST: agenda desde el modo guionado de la landing.
import { members, persistente } from "./_lib/store.js";
import { bookMeeting } from "./_lib/book.js";
import { send } from "./_lib/http.js";

export default async function handler(req, res) {
  if (req.method === "POST") {
    try { return send(res, 200, { ok: true, lead: await bookMeeting(Object.assign({}, req.body, { origen: "Landing · formulario guiado" })) }); }
    catch (e) { return send(res, 409, { error: e.message }); }
  }
  send(res, 200, { ocupados: await members("agenda"), persistente, chat: Boolean(process.env.ANTHROPIC_API_KEY) });
}
