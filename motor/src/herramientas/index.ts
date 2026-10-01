// Registro de herramientas. Cada ficha elige cuáles habilita por nombre.
import type { Herramienta } from "../tipos.js";
import { consultarPedido, verCartaYEstado } from "./semorfa.js";

/** Pasa la charla a una persona. El motor la marca y el agente queda en silencio. */
const derivarAPersona: Herramienta = {
  definicion: {
    name: "derivar_a_persona",
    description:
      "Pasa la conversación a una persona del equipo y deja al asistente en silencio hasta que la persona lo libere. Usala en los casos de derivación de tus instrucciones.",
    input_schema: {
      type: "object",
      properties: {
        motivo: {
          type: "string",
          enum: ["reclamo", "plata", "alergia", "pedido_especial", "cancelacion", "enojo", "pidio_persona", "no_entiendo", "otro"],
        },
        resumen: { type: "string", description: "Resumen de la charla en 1 o 2 líneas para que la persona no tenga que leer todo." },
      },
      required: ["motivo", "resumen"],
      additionalProperties: false,
    },
    strict: true,
  },
  // El efecto real (marcar la charla y avisar al equipo) lo hace el motor al ver esta herramienta.
  async ejecutar() {
    return JSON.stringify({ ok: true, nota: "Charla marcada para atención humana. Avisale a la persona y no sigas con el tema." });
  },
};

export const REGISTRO: Record<string, Herramienta> = {
  [verCartaYEstado.definicion.name]: verCartaYEstado,
  [consultarPedido.definicion.name]: consultarPedido,
  [derivarAPersona.definicion.name]: derivarAPersona,
};
