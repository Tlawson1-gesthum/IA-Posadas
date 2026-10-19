import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | undefined;
function anthropic(): Anthropic {
  client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

interface ClassificationContext {
  org_id: string;
  contact_id: string;
}

export async function classifyAndRespond(message: string, _context: ClassificationContext): Promise<Classification> {
  const systemPrompt = `Eres Pasti, el asistente de IA del CRM Pensa. Tu rol es:
1. Clasificar el mensaje entrante por intención (consulta, pedido, queja, seguimiento)
2. Asignar un score de lead (0-100) basado en qué tan calificado es
3. Sugerir la siguiente acción (respuesta automática, asignar a agente, crear tarea)
4. Si es apropiado, generar una respuesta sugerida

Responde SIEMPRE en JSON con esta estructura:
{
  "intent": "consulta" | "pedido" | "queja" | "seguimiento",
  "lead_score": 0-100,
  "action": "auto_respond" | "assign_agent" | "create_task" | "schedule_followup",
  "suggested_response": "...",
  "reason": "..."
}`;

  const response = await anthropic().messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 500,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: message,
      },
    ],
  });

  const content = response.content[0];
  if (content.type !== "text") throw new Error("Unexpected response type");
  return parseClassification(content.text);
}

export interface Classification {
  intent: "consulta" | "pedido" | "queja" | "seguimiento";
  lead_score: number;
  action: "auto_respond" | "assign_agent" | "create_task" | "schedule_followup";
  suggested_response: string | null;
  reason: string;
}

const INTENTS = ["consulta", "pedido", "queja", "seguimiento"];
const ACTIONS = ["auto_respond", "assign_agent", "create_task", "schedule_followup"];

const FALLBACK: Classification = {
  intent: "consulta",
  lead_score: 50,
  action: "assign_agent",
  suggested_response: null,
  reason: "No se pudo clasificar automáticamente; pasa a una persona",
};

// Acepta el JSON solo o envuelto en texto/```json; ante cualquier duda, deriva a una persona.
export function parseClassification(text: string): Classification {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return FALLBACK;
  try {
    const raw = JSON.parse(text.slice(start, end + 1));
    if (!INTENTS.includes(raw.intent) || !ACTIONS.includes(raw.action)) return FALLBACK;
    const score = Math.max(0, Math.min(100, Math.round(Number(raw.lead_score) || 0)));
    return {
      intent: raw.intent,
      lead_score: score,
      action: raw.action,
      suggested_response: typeof raw.suggested_response === "string" ? raw.suggested_response : null,
      reason: typeof raw.reason === "string" ? raw.reason : "",
    };
  } catch {
    return FALLBACK;
  }
}
