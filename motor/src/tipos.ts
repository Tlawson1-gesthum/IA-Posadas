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
    /** Nombre de la variable de entorno (en Vercel) con la clave para hablar con el sistema del cliente. Ej. SEMORFA_AGENTE_CLAVE. */
    clave_env?: string;
    /** Formas de pago con las que el agente puede cargar un pedido. Si falta, todas. Ej. ["mercadopago"]. */
    pagos_agente?: ("efectivo" | "mercadopago")[];
    /** true = el agente puede decir los precios de los packs de viandas que muestra la web. Si falta, manda el link. */
    viandas_precios?: boolean;
  };
  /** Texto que el agente lee en vivo y se inserta en {{conocimiento}} de la plantilla (por ejemplo, el manual del sistema del cliente). */
  conocimiento?: { url: string };
  /** Burbuja de chat en la web del cliente. Apagada si falta o activo = false. */
  chat_web?: ChatWeb;
  /** Cuenta de Instagram del cliente (mensajes, comentarios y cola de publicaciones). Apagado si falta. */
  instagram?: InstagramFicha;
  /** Valores que reemplazan los {{campos}} de la plantilla. */
  datos: Record<string, string>;
}

/** Contexto que recibe cada herramienta al ejecutarse. */
export interface ContextoHerramienta {
  ficha: Ficha;
  /** Teléfono de quien escribe (formato 549...). */
  telefono: string;
  /** Ticket que manda la web del cliente para leer datos con los permisos de quien escribe (ej. el panel de semorfa). Nunca se guarda. */
  credencial?: string;
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

export interface InstagramFicha {
  /** Id de la cuenta profesional (el que muestra Meta al agregarla; llega como entry.id en los avisos). */
  ig_user_id: string;
  /** Variable de entorno (en Vercel) con el primer token. Después el motor lo renueva solo y lo guarda en la base. */
  token_env: string;
  /** Mensajes directos: el agente responde. false = solo se guardan para que responda una persona. */
  responder_mensajes: boolean;
  /**
   * La API acepta is_ai_generated al publicar. Hasta comprobar en una publicación de prueba que pone la misma etiqueta
   * "Información de IA" que la app, queda en false: las piezas hechas con IA no se publican solas, se avisa para subirlas a mano.
   */
  etiqueta_ia_api: boolean;
  /** Respuestas automáticas a comentarios (textos fijos aprobados por el dueño, sin IA). */
  comentarios?: {
    /** Revisar los comentarios de las publicaciones recientes cada vez que corre la tarea periódica (sin esperar el aviso de Meta). */
    leer: boolean;
    reglas: ReglaComentario[];
  };
}

/** Token de Instagram vigente de una ficha (el motor lo renueva solo; nunca se muestra). */
export interface CuentaInstagram {
  ficha_id: string;
  ig_user_id: string;
  token: string;
  renovado: string;
  vence: string;
}

/**
 * Cola de publicaciones. Solo se publica lo que está "aprobado", a su hora.
 * borrador → aprobado → procesando (Meta prepara la foto o el video) → publicando → publicado · o error / vencida / manual / cancelado.
 */
export type EstadoPublicacion =
  | "borrador"
  | "aprobado"
  | "procesando"
  | "publicando"
  | "publicado"
  | "manual"
  | "vencida"
  | "error"
  | "cancelado";
export type TipoPublicacion = "imagen" | "reel" | "carrusel" | "historia";

export interface Publicacion {
  id: string;
  ficha_id: string;
  estado: EstadoPublicacion;
  tipo: TipoPublicacion;
  /** Direcciones públicas de las fotos (JPEG) y videos, en orden. */
  medios: { url: string; tipo: "imagen" | "video" }[];
  texto: string;
  /** Cuándo se publica (ISO). */
  hora: string;
  /** Pieza hecha con IA (el avatar): lleva la etiqueta "Información de IA". */
  hecha_con_ia: boolean;
  /** Algo que la API no permite (música de Instagram, colaboradores…): a la hora se avisa y se sube a mano. */
  manual_motivo: string | null;
  aprobada_por: string | null;
  aprobada_en: string | null;
  contenedor: string | null;
  media_id: string | null;
  permalink: string | null;
  intentos: number;
  error: string | null;
  creado: string;
  actualizado: string;
}

export type NuevaPublicacion = Pick<Publicacion, "ficha_id" | "tipo" | "medios" | "texto" | "hora" | "hecha_con_ia"> &
  Partial<Pick<Publicacion, "manual_motivo">>;

export interface ReglaComentario {
  /** Palabras que disparan la regla, como palabra suelta y sin importar mayúsculas ni tildes (ej. ["VIANDAS"]). */
  palabras: string[];
  /** Mensaje privado que se le manda a quien comentó (uno solo: Meta no deja más hasta que conteste). */
  respuesta: string;
  /** Además, la charla pasa a una persona y se avisa al equipo (ej. empresas). */
  derivar?: { motivo: string; resumen: string };
}
