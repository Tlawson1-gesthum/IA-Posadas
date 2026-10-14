// Agente de obra: el capataz o el jefe de obra manda el parte del día (audio o texto) y el motor lo convierte
// en un informe y controla las partidas que mueven la aguja (piedra, arena, asfalto, cemento, gasoil, fletes).
// Este archivo solo define las formas de los datos; las cuentas están en control.ts.

/** Un material que se compra y se controla. Los precios son para valorizar desvíos (cuánta plata está en juego). */
export interface Material {
  id: string;
  nombre: string;
  /** Unidad en la que se compra y se mide: tn, m3, l, bolsas… */
  unidad: string;
  /** Precio de referencia por unidad, en la moneda de la ficha. */
  precio: number;
  /** Otras formas en que la gente lo nombra en obra ("piedra 6-20", "binder"). */
  alias?: string[];
  /** Ayuda para convertir lo que dicen en obra a la unidad del material (ej. "1 bolsa = 25 kg"). */
  nota?: string;
}

/** Una tarea del contrato (ítem del cómputo). `consumos` sale del análisis de precios: cuánto de cada material lleva una unidad de tarea. */
export interface Tarea {
  id: string;
  nombre: string;
  unidad: string;
  cantidad_contrato: number;
  precio_unitario: number;
  /** id de material → cantidad por unidad de tarea (ej. carpeta 5 cm: asfalto 0,0065 tn por m²). */
  consumos: Record<string, number>;
  alias?: string[];
}

/** Un equipo propio que carga gasoil de la obra. */
export interface Equipo {
  id: string;
  nombre: string;
  /** Consumo esperado por hora de trabajo (dato del fabricante o del histórico de la empresa). */
  litros_hora: number;
  alias?: string[];
}

/** Un camión de flete que trae material. */
export interface Camion {
  patente: string;
  transportista: string;
  /** Lo que carga un viaje lleno, en la unidad del material que trae. */
  capacidad: number;
  /** Lo que se paga por viaje (para valorizar la partida de transporte). */
  precio_viaje: number;
}

export interface Obra {
  id: string;
  nombre: string;
  comitente: string;
  alias?: string[];
  tareas: Tarea[];
  /** Material que había en obra al empezar a controlar (id de material → cantidad). */
  stock_inicial?: Record<string, number>;
}

export interface Tolerancias {
  /** Consumo informado por encima de lo que pide el avance. */
  consumo_pct: number;
  /** Gasoil cargado por encima de horas × litros/hora. */
  combustible_pct: number;
  /** Material recibido por debajo de lo que dice el remito. */
  carga_pct: number;
  /** Stock medido por debajo del stock que debería haber. */
  stock_pct: number;
}

/** Lo que la ficha de una constructora agrega para el agente de obra. */
export interface ConfigObra {
  obras: Obra[];
  materiales: Material[];
  equipos: Equipo[];
  camiones: Camion[];
  /** id del material que es el combustible de los equipos (su consumo se controla por horas, no por avance). */
  combustible: string;
  tolerancias: Tolerancias;
  /** Símbolo para mostrar montos. Por defecto "$". */
  moneda?: string;
}

export type NivelAlerta = "roja" | "amarilla";

export type TipoAlerta =
  | "combustible"
  | "remito_duplicado"
  | "carga_incompleta"
  | "sin_remito"
  | "consumo"
  | "stock"
  | "dato_faltante";

export interface Alerta {
  nivel: NivelAlerta;
  tipo: TipoAlerta;
  detalle: string;
  /** Plata en juego estimada (0 si no aplica). */
  monto: number;
}

export interface Avance {
  tarea_id: string;
  cantidad: number;
}

export interface Recepcion {
  material_id: string;
  /** Lo que dice el remito. */
  cantidad_remito: number;
  /** Lo que realmente llegó (balanza o estimación en obra). null = no se informó, se toma el remito. */
  cantidad_recibida: number | null;
  remito: string;
  proveedor: string;
  patente: string;
}

export interface CargaCombustible {
  equipo_id: string;
  litros: number;
  /** Horas trabajadas informadas. */
  horas: number | null;
  /** Lectura del horómetro al cargar. */
  horometro: number | null;
}

/** El parte de un día, ya con los nombres resueltos al catálogo y los controles hechos. */
export interface Parte {
  id: string;
  ficha_id: string;
  obra_id: string;
  /** AAAA-MM-DD */
  fecha: string;
  /** pendiente: lo cargó el agente y espera el OK de quien lo mandó. reemplazado: hubo una corrección. */
  estado: "pendiente" | "confirmado" | "reemplazado";
  telefono: string;
  responsable: string;
  clima: string;
  personal: number | null;
  avances: Avance[];
  recepciones: Recepcion[];
  /** Consumo que informa la obra (además del que se calcula por avance). */
  consumos: { material_id: string; cantidad: number }[];
  combustible: CargaCombustible[];
  stock_medido: { material_id: string; cantidad: number }[];
  incidentes: string[];
  pedidos: string[];
  observaciones: string;
  alertas: Alerta[];
  /** Parte que esta versión corrige. */
  reemplaza: string | null;
  creado: string;
}
