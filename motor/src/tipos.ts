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
  /** Pausa del dueño desde el panel de su local: el agente no contesta y avisa que responde una persona (la charla queda derivada). */
  pausa_local?: { desde: string; por: string } | null;
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
    /** "semorfa" (gastronomía) | "distribuidora" (API /api/agente/distri del sistema de la distribuidora). */
    tipo: string;
    base_url: string;
    /** false = los pedidos se simulan (pruebas); true = se cargan de verdad en el sistema del cliente. */
    crear_pedidos?: boolean;
    /** Nombre de la variable de entorno (en Vercel) con la clave para hablar con el sistema del cliente. Ej. SEMORFA_AGENTE_CLAVE. */
    clave_env?: string;
    /** Formas de pago con las que el agente puede cargar un pedido. Si falta, todas. Ej. ["mercadopago"]. */
    pagos_agente?: ("efectivo" | "mercadopago")[];
  };
  /** Texto que el agente lee en vivo y se inserta en {{conocimiento}} de la plantilla (por ejemplo, el manual del sistema del cliente). */
  conocimiento?: { url: string };
  /** Burbuja de chat en la web del cliente. Apagada si falta o activo = false. */
  chat_web?: ChatWeb;
  /** Valores que reemplazan los {{campos}} de la plantilla. */
  datos: Record<string, string>;
  /**
   * Distribuidora: qué puede leer el agente además del texto. Las reglas de plata (mínimo, límite, días, zonas, corte)
   * NO van acá: viven en el sistema de la distribuidora (d_reglas) y las aplica su API.
   */
  reglas?: {
    /** Transcribir audios (paso 13: src/transcribir.ts). */
    audio?: boolean;
    /** Leer fotos de listas de pedido (src/vision.ts). */
    fotos?: boolean;
    /**
     * Avisos de cobranza (api/cron-avisos.ts): nombres de las plantillas aprobadas en Meta. Si faltan, las de la guía de cuentas (A.7):
     * aviso_vencimiento (antes y el día del vencimiento) y aviso_vencida (después).
     */
    plantillas?: { vencimiento?: string; vencida?: string; idioma?: string };
  };
}

/** Contexto que recibe cada herramienta al ejecutarse. */
export interface ContextoHerramienta {
  ficha: Ficha;
  /** Teléfono de quien escribe (formato 549...). */
  telefono: string;
  /** Ticket que manda la web del cliente para leer datos con los permisos de quien escribe (ej. el panel de semorfa). Nunca se guarda. */
  credencial?: string;
  /**
   * El mensaje de WhatsApp que se está atendiendo, si se sabe (lo completa atender.ts). El id hace que el mismo mensaje
   * no cree dos pedidos; la confianza es la de la transcripción de un audio (0 a 1).
   */
  mensaje?: { id?: string; texto?: string; confianza?: number };
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
  /** Turnos anteriores que se le pasan al modelo (por defecto 20). */
  turnos?: number;
  /** Vueltas de herramientas por mensaje (por defecto 5). */
  vueltas?: number;
}

export const LIMITES_POR_DEFECTO: Limites = {
  mensajes_por_hora: 30,
  mensajes_por_dia: 80,
  usd_por_persona_dia: 0.5,
  caracteres_por_mensaje: 1000,
};

export interface ChatWeb {
  activo: boolean;
  /** Primer mensaje que se ve al abrir la burbuja (no gasta: no lo escribe la IA). */
  saludo?: string;
  /** Color de la burbuja, ej. #E3261C. */
  color?: string;
  /** Mensajes por hora desde una misma conexión (IP). */
  mensajes_por_ip_hora?: number;
  /** Tope de mensajes por día de todo el chat de la web, para que un ataque no se coma el saldo del mes. */
  mensajes_por_dia?: number;
}

export const CHAT_WEB_POR_DEFECTO = { mensajes_por_ip_hora: 20, mensajes_por_dia: 400 };
