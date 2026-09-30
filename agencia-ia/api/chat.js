// Chat de Nico, el agente de la landing. La clave de la API vive solo acá, en ANTHROPIC_API_KEY.
import Anthropic from "@anthropic-ai/sdk";
import { RULES } from "./_lib/prompt.js";
import { meetingSlots } from "./_lib/slots.js";
import { members } from "./_lib/store.js";
import { bookMeeting } from "./_lib/book.js";
import { send, clip } from "./_lib/http.js";

const client = new Anthropic();
const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";

const tools = [
  {
    name: "ver_horarios",
    description: "Devuelve los próximos horarios libres para la reunión de diagnóstico, como lista de {id, label}. Usalo antes de ofrecer horarios.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "agendar_reunion",
    description: "Agenda la reunión de diagnóstico en un horario libre y guarda el contacto en el CRM. Devuelve la confirmación o un error si el horario se ocupó.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        slot_id: { type: "string", description: "id devuelto por ver_horarios" },
        nombre: { type: "string" },
        negocio: { type: "string", description: "Nombre del negocio, o vacío si no lo dijo" },
        rubro: { type: "string", description: "Rubro, o vacío si no lo dijo" },
        whatsapp: { type: "string" },
        problema: { type: "string", description: "Problema principal con sus palabras, o vacío" },
      },
      required: ["slot_id", "nombre", "negocio", "rubro", "whatsapp", "problema"],
      additionalProperties: false,
    },
  },
];

async function runTool(name, input, booked) {
  if (name === "ver_horarios") return meetingSlots(new Set(await members("agenda")));
  if (name === "agendar_reunion") {
    const lead = await bookMeeting(input);
    booked.push(lead);
    return { ok: true, confirmacion: lead.reunionTexto };
  }
  throw new Error("Herramienta desconocida");
}

export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "Usá POST" });
  if (!process.env.ANTHROPIC_API_KEY) return send(res, 503, { error: "Falta configurar ANTHROPIC_API_KEY en Vercel" });
  const raw = Array.isArray(req.body?.turns) ? req.body.turns : [];
  // Solo texto plano de la charla, alternando usuario y asistente, empezando y terminando en usuario.
  const turns = raw.slice(-16).map(t => ({ role: t.role === "assistant" ? "assistant" : "user", content: clip(t.content, 2000) })).filter(t => t.content);
  while (turns.length && turns[0].role !== "user") turns.shift();
  if (!turns.length || turns[turns.length - 1].role !== "user") return send(res, 400, { error: "Falta el mensaje" });

  const today = new Date(Date.now() - 3 * 3600e3).toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  const messages = turns.slice();
  const booked = [];
  try {
    for (let round = 0; round < 6; round++) {
      const response = await client.beta.messages.create({
        model: MODEL,
        max_tokens: 4000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "low" },
        cache_control: { type: "ephemeral" },
        system: RULES + "\n\nHoy es " + today + " (hora de Argentina).",
        tools,
        messages,
      });
      if (response.stop_reason === "refusal") return send(res, 200, { text: "Eso no lo puedo responder por acá. ¿Te agendo una reunión con el equipo?", booked });
      if (response.stop_reason !== "tool_use") {
        const text = response.content.filter(b => b.type === "text").map(b => b.text).join("\n").trim();
        return send(res, 200, { text: text || "¿Me lo repetís?", booked });
      }
      messages.push({ role: "assistant", content: response.content });
      const results = [];
      for (const b of response.content) {
        if (b.type !== "tool_use") continue;
        try { results.push({ type: "tool_result", tool_use_id: b.id, content: JSON.stringify(await runTool(b.name, b.input || {}, booked)) }); }
        catch (e) { results.push({ type: "tool_result", tool_use_id: b.id, content: "Error: " + e.message, is_error: true }); }
      }
      messages.push({ role: "user", content: results });
    }
    return send(res, 200, { text: "Se me complicó la agenda. ¿Probamos de nuevo?", booked });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) return send(res, 503, { error: "La clave ANTHROPIC_API_KEY no es válida" });
    if (error instanceof Anthropic.RateLimitError) return send(res, 429, { error: "Muchas consultas juntas. Probá en un minuto." });
    if (error instanceof Anthropic.APIError) return send(res, 502, { error: "Claude no respondió (" + error.status + ")" });
    console.error(error);
    return send(res, 500, { error: "Error del servidor" });
  }
}
