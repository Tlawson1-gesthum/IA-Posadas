// Registro de herramientas. Cada ficha elige cuáles habilita por nombre.
import type { Herramienta } from "../tipos.js";
import { cotizarPedido, crearPedido } from "./pedidos-semorfa.js";
import { confirmarPedidoEfectivo, consultarPedido, misPedidos, verCartaYEstado, verTurno } from "./semorfa.js";

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
          enum: ["transferencia", "efectivo", "pedido_sin_ubicacion", "reclamo", "plata", "alergia", "pedido_especial", "cancelacion", "enojo", "turno", "urgencia", "pidio_persona", "no_entiendo", "otro"],
        },
        resumen: { type: "string", description: "Resumen para que la persona no tenga que leer todo. Si hay un pedido armado, incluí productos, total, nombre, dirección y forma de pago." },
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
  [misPedidos.definicion.name]: misPedidos,
  [confirmarPedidoEfectivo.definicion.name]: confirmarPedidoEfectivo,
  [cotizarPedido.definicion.name]: cotizarPedido,
  [crearPedido.definicion.name]: crearPedido,
  [verTurno.definicion.name]: verTurno,
  [derivarAPersona.definicion.name]: derivarAPersona,
};
