import type Anthropic from "@anthropic-ai/sdk";

/**
 * La ficha de un cliente: quién es, qué sabe y qué puede hacer su agente.
 * Hoy vive en fichas/<id>.json; en el paso 3 pasa a la tabla `fichas` de Supabase
 * con el mismo formato.
 */
export interface Ficha {
  id: string;
  nombre: string;
  rubro: string;
  /** Nombre del archivo en plantillas/ (sin .md). */
  plantilla: string;
  /** "activo" | "pausado" (falta de pago o pedido del cliente). Pausado = no responde. */
  estado: "activo" | "pausado";
  modelo: string;
  esfuerzo: "low" | "medium" | "high";
  /** Tope de gasto mensual en API de Claude, en USD. */
  tope_usd_mes: number;
  /** Límites por persona, para que nadie haga gastar de más. Si falta alguno se usa el valor por defecto. */
  limites?: Partial<Limites>;
  /** Id del número de WhatsApp del cliente en Meta (Phone number ID). */
  whatsapp_phone_number_id?: string;
  /** Herramientas habilitadas para este cliente (nombres del registro de herramientas). */
  herramientas: string[];
  /** Configuración de la integración con el sistema del cliente, si tiene. */
  integracion?: {
    tipo: string;
    base_url: string;
    /** false = los pedidos se simulan (pruebas); true = se cargan de verdad en el sistema del cliente. */
    crear_pedidos?: boolean;
  };
  /** Valores que reemplazan los {{campos}} de la plantilla. */
  datos: Record<string, string>;
}

/** Contexto que recibe cada herramienta al ejecutarse. */
export interface ContextoHerramienta {
  ficha: Ficha;
  /** Teléfono de quien escribe (formato 549...). */
  telefono: string;
}

export interface Herramienta {
  definicion: Anthropic.Tool;
  ejecutar(entrada: Record<string, unknown>, ctx: ContextoHerramienta): Promise<string>;
}

/** Un turno guardado de la conversación (solo texto: lo que se vio en WhatsApp). */
export interface Turno {
  rol: "cliente" | "agente";
  texto: string;
}

export interface Respuesta {
  /** Texto a mandar por WhatsApp. Vacío si el agente no debe responder. */
  texto: string;
  /** El agente pidió pasar la charla a una persona. */
  derivada?: { motivo: string; resumen: string };
  herramientasUsadas: string[];
  uso: { entrada: number; salida: number; cacheLeida: number; cacheEscrita: number; usd: number };
}

export interface Limites {
  /** Mensajes que una persona puede mandar en una hora. */
  mensajes_por_hora: number;
  /** Mensajes que una persona puede mandar en un día. */
  mensajes_por_dia: number;
  /** Gasto máximo de API por persona por día, en USD. */
  usd_por_persona_dia: number;
  /** Largo máximo de un mensaje; lo que sobra se corta. */
  caracteres_por_mensaje: number;
}

export const LIMITES_POR_DEFECTO: Limites = {
  mensajes_por_hora: 30,
  mensajes_por_dia: 80,
  usd_por_persona_dia: 0.5,
  caracteres_por_mensaje: 1000,
};
