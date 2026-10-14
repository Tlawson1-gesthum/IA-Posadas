// Las cuentas del agente de obra. Todo número que ve el dueño sale de acá, nunca del modelo:
// el modelo solo pasa a datos lo que dijo el capataz; el código resuelve nombres, controla y arma el informe.
import type { Alerta, ConfigObra, Equipo, Material, Obra, Parte, Tarea } from "./modelo.js";

// ---------- Nombres: lo que dice la gente en obra → el catálogo de la ficha ----------

export function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

interface ConNombre {
  id: string;
  nombre: string;
  alias?: string[];
}

/** El elemento del catálogo que mejor coincide con lo que se dijo, o null si ninguno se parece. */
export function buscar<T extends ConNombre>(lista: T[], dicho: string): T | null {
  const d = normalizar(dicho);
  if (!d) return null;
  const palabras = new Set(d.split(" "));
  const puntajes = lista
    .map((x) => {
      let p = 0;
      for (const n of [x.id, x.nombre, ...(x.alias ?? [])].map(normalizar)) {
        if (n === d) p = Math.max(p, 3);
        else if (n.includes(d) || d.includes(n)) p = Math.max(p, 2 + Math.min(n.length, d.length) / 100);
        else {
          const comunes = n.split(" ").filter((w) => w.length > 2 && palabras.has(w)).length;
          const ratio = comunes / Math.max(1, n.split(" ").length);
          if (ratio >= 0.5) p = Math.max(p, 1 + ratio / 2);
        }
      }
      return { x, p };
    })
    .filter((r) => r.p > 0)
    .sort((a, b) => b.p - a.p);
  // Empate entre dos distintos (ej. "rodillo" con dos rodillos): mejor preguntar que adivinar.
  if (!puntajes.length || (puntajes[1] && puntajes[1].p === puntajes[0].p && puntajes[0].p < 3)) return null;
  return puntajes[0].x;
}

export const buscarObra = (c: ConfigObra, dicho: string): Obra | null =>
  // Con una sola obra, el capataz no tiene por qué nombrarla.
  c.obras.length === 1 && !dicho.trim() ? c.obras[0] : buscar(c.obras, dicho);

/** Patente sin espacios ni guiones, en mayúsculas: "ab 123 cd" → "AB123CD". */
export const patente = (p: string) => p.toUpperCase().replace(/[^A-Z0-9]/g, "");

/** Número de remito comparable: el último grupo de dígitos sin ceros adelante ("0001-00004521" y "4521" son el mismo). */
export function numeroRemito(r: string): string {
  const grupos = r.match(/\d+/g);
  return grupos ? grupos[grupos.length - 1].replace(/^0+(?=\d)/, "") : "";
}

// ---------- Formatos para WhatsApp y el tablero ----------

const NUM = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 });
const NUM2 = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });
const PLATA = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });

export const num = (n: number) => (Math.abs(n) < 10 && n % 1 !== 0 ? NUM2 : NUM).format(n);
export const plata = (n: number, moneda = "$") => `${moneda} ${PLATA.format(Math.round(n))}`;
export const pct = (n: number) => `${n >= 0 ? "+" : ""}${Math.round(n * 100)}%`;
/** "m2" → "m²", "m3" → "m³" (en el catálogo se escriben simples para que sea fácil cargarlos). */
export const u = (unidad: string) => unidad.replace(/^m2$/, "m²").replace(/^m3$/, "m³");

/** "2026-10-14" → "14/10" */
export const fechaCorta = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`;

/** Fecha de hoy en Argentina, AAAA-MM-DD. */
export function hoyAR(ahora = Date.now()): string {
  return new Date(ahora - 3 * 3600_000).toISOString().slice(0, 10);
}

export function sumarDias(fecha: string, dias: number): string {
  return new Date(Date.parse(`${fecha}T12:00:00Z`) + dias * 86400_000).toISOString().slice(0, 10);
}

// ---------- Controles ----------

const material = (c: ConfigObra, id: string): Material | undefined => c.materiales.find((m) => m.id === id);
const tarea = (o: Obra, id: string): Tarea | undefined => o.tareas.find((t) => t.id === id);
const equipo = (c: ConfigObra, id: string): Equipo | undefined => c.equipos.find((e) => e.id === id);

/** Orden en que pasaron las cosas: por fecha y, el mismo día, por hora de carga. */
export const cronologico = (a: Parte, b: Parte) => a.fecha.localeCompare(b.fecha) || a.creado.localeCompare(b.creado);

/** Partes que cuentan: los que no fueron reemplazados por una corrección. */
export const vigentes = (partes: Parte[]) => partes.filter((p) => p.estado !== "reemplazado");

/** Lo que el avance del parte debió consumir de cada material, según el análisis de precios. */
export function consumoEsperado(obra: Obra, p: Parte): Map<string, number> {
  const r = new Map<string, number>();
  for (const a of p.avances) {
    const t = tarea(obra, a.tarea_id);
    if (!t) continue;
    for (const [m, porUnidad] of Object.entries(t.consumos)) r.set(m, (r.get(m) ?? 0) + a.cantidad * porUnidad);
  }
  return r;
}

const recibido = (r: Parte["recepciones"][number]) => r.cantidad_recibida ?? r.cantidad_remito;

/** Lo que sale del stock de un material en un parte: el combustible por lo cargado a equipos; el resto, por avance. */
function salidaDeStock(c: ConfigObra, obra: Obra, p: Parte, materialId: string): number {
  if (materialId === c.combustible) return p.combustible.reduce((s, x) => s + x.litros, 0);
  return consumoEsperado(obra, p).get(materialId) ?? 0;
}

/** Stock que debería haber de un material al cierre de `hasta` (incluido). */
export function stockTeorico(c: ConfigObra, obra: Obra, partes: Parte[], materialId: string, hasta: Parte): number {
  let stock = obra.stock_inicial?.[materialId] ?? 0;
  for (const p of vigentes(partes).sort(cronologico)) {
    if (cronologico(p, hasta) > 0) break;
    stock += p.recepciones.filter((r) => r.material_id === materialId).reduce((s, r) => s + recibido(r), 0);
    stock -= salidaDeStock(c, obra, p, materialId);
  }
  return stock;
}

/** Horas de un equipo según el horómetro: diferencia con la última lectura anterior. */
function horasPorHorometro(anteriores: Parte[], equipoId: string, lectura: number): number | null {
  let previa: number | null = null;
  for (const p of [...anteriores].sort(cronologico))
    for (const x of p.combustible) if (x.equipo_id === equipoId && x.horometro !== null) previa = x.horometro;
  return previa !== null && lectura >= previa ? lectura - previa : null;
}

const nivel = (desvio: number, tolerancia: number) => (desvio > tolerancia * 2 ? "roja" : "amarilla");

/**
 * Los controles de un parte contra el catálogo y los partes anteriores de la misma obra.
 * `anteriores` son los partes vigentes de la obra sin el que se controla (ni el que corrige).
 */
export function controlarParte(c: ConfigObra, obra: Obra, p: Parte, anteriores: Parte[]): Alerta[] {
  const alertas: Alerta[] = [];
  const tol = c.tolerancias;
  const precio = (id: string) => material(c, id)?.precio ?? 0;
  const unidad = (id: string) => u(material(c, id)?.unidad ?? "");
  const nombre = (id: string) => material(c, id)?.nombre ?? id;

  // Gasoil: lo cargado contra horas × litros/hora del equipo.
  for (const x of p.combustible) {
    const e = equipo(c, x.equipo_id);
    if (!e) continue;
    const porHorometro = x.horometro !== null ? horasPorHorometro(anteriores, e.id, x.horometro) : null;
    if (porHorometro !== null && x.horas !== null && Math.abs(porHorometro - x.horas) > 1)
      alertas.push({
        nivel: "amarilla",
        tipo: "combustible",
        detalle: `${e.nombre}: dicen ${num(x.horas)} h trabajadas, pero el horómetro marca ${num(porHorometro)} h desde la carga anterior.`,
        monto: 0,
      });
    const horas = porHorometro ?? x.horas;
    if (horas === null) {
      alertas.push({
        nivel: "amarilla",
        tipo: "dato_faltante",
        detalle: `${e.nombre}: cargó ${num(x.litros)} l sin horas ni horómetro. Sin ese dato no se puede controlar el gasoil.`,
        monto: 0,
      });
      continue;
    }
    const esperado = horas * e.litros_hora;
    const desvio = esperado > 0 ? x.litros / esperado - 1 : 1;
    if (desvio > tol.combustible_pct) {
      const sobra = x.litros - esperado;
      alertas.push({
        nivel: nivel(desvio, tol.combustible_pct),
        tipo: "combustible",
        detalle: `${e.nombre}: cargó ${num(x.litros)} l para ${num(horas)} h; lo esperable es ${num(esperado)} l (${num(e.litros_hora)} l/h). Sobran ${num(sobra)} l (${pct(desvio)}).`,
        monto: sobra * precio(c.combustible),
      });
    }
  }

  // Remitos: repetidos, faltantes y material que entra sin papel.
  const vistos = new Map<string, Parte>();
  for (const a of [...anteriores].sort(cronologico))
    for (const r of a.recepciones) if (numeroRemito(r.remito)) vistos.set(`${r.material_id}|${numeroRemito(r.remito)}`, a);
  const enEste = new Set<string>();
  for (const r of p.recepciones) {
    const n = numeroRemito(r.remito);
    const valor = r.cantidad_remito * precio(r.material_id);
    if (!n) {
      alertas.push({
        nivel: "amarilla",
        tipo: "sin_remito",
        detalle: `Entraron ${num(r.cantidad_remito)} ${unidad(r.material_id)} de ${nombre(r.material_id)} sin número de remito${r.patente ? ` (camión ${r.patente})` : ""}.`,
        monto: valor,
      });
    } else {
      const clave = `${r.material_id}|${n}`;
      const previo = vistos.get(clave);
      if (previo || enEste.has(clave))
        alertas.push({
          nivel: "roja",
          tipo: "remito_duplicado",
          detalle: `Remito ${r.remito} de ${nombre(r.material_id)} ya ${previo ? `se cargó el ${fechaCorta(previo.fecha)}` : "figura dos veces en este parte"}. Se podría estar pagando dos veces el mismo viaje.`,
          monto: valor,
        });
      enEste.add(clave);
    }
    if (r.cantidad_recibida !== null && r.cantidad_remito > 0) {
      const falta = r.cantidad_remito - r.cantidad_recibida;
      const desvio = falta / r.cantidad_remito;
      if (desvio > tol.carga_pct)
        alertas.push({
          nivel: nivel(desvio, tol.carga_pct),
          tipo: "carga_incompleta",
          detalle: `Remito ${r.remito || "s/n"}${r.patente ? ` (camión ${r.patente})` : ""}: dice ${num(r.cantidad_remito)} ${unidad(r.material_id)} de ${nombre(r.material_id)} y llegaron ${num(r.cantidad_recibida)}. Faltan ${num(falta)} ${unidad(r.material_id)}.`,
          monto: falta * precio(r.material_id),
        });
    }
  }

  // Consumo informado contra lo que pide el avance.
  const esperado = consumoEsperado(obra, p);
  for (const x of p.consumos) {
    if (x.material_id === c.combustible) continue; // el gasoil se controla por equipo
    const e = esperado.get(x.material_id) ?? 0;
    if (e === 0) {
      alertas.push({
        nivel: "amarilla",
        tipo: "consumo",
        detalle: `Se usaron ${num(x.cantidad)} ${unidad(x.material_id)} de ${nombre(x.material_id)}, pero el avance de hoy no lleva ese material.`,
        monto: x.cantidad * precio(x.material_id),
      });
      continue;
    }
    const desvio = x.cantidad / e - 1;
    if (desvio > tol.consumo_pct)
      alertas.push({
        nivel: nivel(desvio, tol.consumo_pct),
        tipo: "consumo",
        detalle: `${nombre(x.material_id)}: se usaron ${num(x.cantidad)} ${unidad(x.material_id)} y el avance pide ${num(e)} (${pct(desvio)}).`,
        monto: (x.cantidad - e) * precio(x.material_id),
      });
  }

  // Stock medido contra el que debería haber.
  for (const s of p.stock_medido) {
    const teorico = stockTeorico(c, obra, [...anteriores, p], s.material_id, p);
    const falta = teorico - s.cantidad;
    const base = Math.max(Math.abs(teorico), 1e-9);
    if (falta / base > tol.stock_pct)
      alertas.push({
        nivel: nivel(falta / base, tol.stock_pct),
        tipo: "stock",
        detalle: `${nombre(s.material_id)}: debería haber ${num(teorico)} ${unidad(s.material_id)} en obra y se midieron ${num(s.cantidad)}. Faltan ${num(falta)} ${unidad(s.material_id)}.`,
        monto: falta * precio(s.material_id),
      });
    else if (-falta / base > tol.stock_pct * 2)
      alertas.push({
        nivel: "amarilla",
        tipo: "stock",
        detalle: `${nombre(s.material_id)}: se midieron ${num(s.cantidad)} ${unidad(s.material_id)} y deberían quedar ${num(teorico)}. Sobra material: revisar remitos sin cargar o el consumo por avance.`,
        monto: 0,
      });
  }

  return alertas.sort((a, b) => (a.nivel === b.nivel ? b.monto - a.monto : a.nivel === "roja" ? -1 : 1));
}

// ---------- Informe del parte (lo que recibe el capataz para confirmar) ----------

export function informeParte(c: ConfigObra, obra: Obra, p: Parte, partesObra: Parte[]): string {
  const $ = (n: number) => plata(n, c.moneda);
  const m = (id: string) => material(c, id);
  const lineas: string[] = [];
  lineas.push(`*Parte del ${fechaCorta(p.fecha)} · ${obra.nombre}*`);
  const cab = [p.responsable && `Responsable: ${p.responsable}`, p.personal !== null && `Personal: ${p.personal}`, p.clima && `Clima: ${p.clima}`].filter(Boolean);
  if (cab.length) lineas.push(cab.join(" · "));

  if (p.avances.length) {
    lineas.push("", "*Avance*");
    const todos = vigentes(partesObra.filter((x) => x.id !== p.id).concat(p));
    for (const a of p.avances) {
      const t = tarea(obra, a.tarea_id);
      if (!t) continue;
      const acumulado = todos.flatMap((x) => x.avances).filter((x) => x.tarea_id === t.id).reduce((s, x) => s + x.cantidad, 0);
      const avanceObra = t.cantidad_contrato ? ` (acumulado ${Math.round((acumulado / t.cantidad_contrato) * 100)}% del contrato)` : "";
      lineas.push(`• ${t.nombre}: ${num(a.cantidad)} ${u(t.unidad)}${avanceObra}`);
    }
  }

  if (p.recepciones.length) {
    lineas.push("", "*Material recibido*");
    for (const r of p.recepciones) {
      const mat = m(r.material_id);
      const llego = r.cantidad_recibida !== null && r.cantidad_recibida !== r.cantidad_remito ? `, llegaron ${num(r.cantidad_recibida)}` : "";
      const de = [r.proveedor, r.patente && `camión ${r.patente}`, r.remito ? `remito ${r.remito}` : "sin remito"].filter(Boolean).join(" · ");
      lineas.push(`• ${mat?.nombre ?? r.material_id}: ${num(r.cantidad_remito)} ${u(mat?.unidad ?? "")}${llego} (${de})`);
    }
  }

  const esperado = consumoEsperado(obra, p);
  if (esperado.size) {
    lineas.push("", "*Consumo según avance*");
    for (const [id, cant] of esperado) {
      const informado = p.consumos.find((x) => x.material_id === id);
      lineas.push(`• ${m(id)?.nombre ?? id}: ${num(cant)} ${u(m(id)?.unidad ?? "")}${informado ? ` (informaron ${num(informado.cantidad)})` : ""}`);
    }
  }

  if (p.combustible.length) {
    lineas.push("", "*Gasoil*");
    for (const x of p.combustible) {
      const e = equipo(c, x.equipo_id);
      const horas = x.horas !== null ? ` en ${num(x.horas)} h` : "";
      const esp = e && x.horas !== null ? ` (esperado ${num(x.horas * e.litros_hora)} l)` : "";
      lineas.push(`• ${e?.nombre ?? x.equipo_id}: ${num(x.litros)} l${horas}${esp}`);
    }
  }

  if (p.stock_medido.length) {
    lineas.push("", "*Stock medido*");
    for (const s of p.stock_medido) lineas.push(`• ${m(s.material_id)?.nombre ?? s.material_id}: ${num(s.cantidad)} ${u(m(s.material_id)?.unidad ?? "")}`);
  }

  if (p.incidentes.length) lineas.push("", "*Incidentes*", ...p.incidentes.map((i) => `• ${i}`));
  if (p.pedidos.length) lineas.push("", "*Pedidos*", ...p.pedidos.map((i) => `• ${i}`));
  if (p.observaciones) lineas.push("", `*Observaciones:* ${p.observaciones}`);

  lineas.push("", "*Para revisar*");
  if (!p.alertas.length) lineas.push("✅ Sin diferencias contra el presupuesto ni los remitos.");
  for (const a of p.alertas) lineas.push(`${a.nivel === "roja" ? "🔴" : "🟡"} ${a.detalle}${a.monto > 0 ? ` (≈ ${$(a.monto)})` : ""}`);
  return lineas.join("\n");
}

// ---------- Resumen de la obra (tablero del dueño y preguntas por WhatsApp) ----------

export interface ResumenObra {
  obra: { id: string; nombre: string; comitente: string };
  desde: string;
  hasta: string;
  moneda: string;
  partes: { id: string; fecha: string; responsable: string; estado: Parte["estado"]; rojas: number; amarillas: number; pedidos: string[]; incidentes: string[] }[];
  alertas: (Alerta & { fecha: string; parte_id: string })[];
  /** Plata en juego de todas las alertas del período. */
  en_juego: number;
  partidas: {
    material_id: string;
    nombre: string;
    unidad: string;
    es_combustible: boolean;
    /** Según remitos. */
    remitos: number;
    /** Lo que llegó de verdad (balanza o estimación). */
    recibido: number;
    /** Lo que debió usarse según el avance (o, para el gasoil, según las horas de los equipos). */
    esperado: number;
    /** Lo que informó la obra (para el gasoil: lo cargado a los equipos). */
    informado: number;
    /** Plata comprada en el período, según remitos. */
    compra: number;
    /** Stock que debería haber al cierre del período. */
    stock_teorico: number;
    /** Último conteo en obra, con lo que debía haber ese día. */
    stock_medido: { cantidad: number; fecha: string; teorico: number } | null;
  }[];
  transporte: { viajes: number; costo: number; con_problemas: number; por_transportista: { nombre: string; viajes: number; costo: number }[] };
  combustible: { equipo_id: string; nombre: string; horas: number; litros: number; esperado: number }[];
  avance: { tarea_id: string; nombre: string; unidad: string; periodo: number; acumulado: number; contrato: number; precio_unitario: number }[];
  /** Avance del período × precio unitario: lo que se podría certificar. */
  certificable: number;
}

export function resumenObra(c: ConfigObra, obra: Obra, partesObra: Parte[], desde: string, hasta: string): ResumenObra {
  const todos = vigentes(partesObra).sort(cronologico);
  const periodo = todos.filter((p) => p.fecha >= desde && p.fecha <= hasta);
  const hastaHoy = todos.filter((p) => p.fecha <= hasta);
  const ultimo = hastaHoy.at(-1);

  const alertas = periodo
    .flatMap((p) => p.alertas.map((a) => ({ ...a, fecha: p.fecha, parte_id: p.id })))
    .sort((a, b) => (a.nivel === b.nivel ? b.monto - a.monto : a.nivel === "roja" ? -1 : 1));

  const partidas = c.materiales.map((m) => {
    const rec = periodo.flatMap((p) => p.recepciones).filter((r) => r.material_id === m.id);
    const esCombustible = m.id === c.combustible;
    const esperado = esCombustible
      ? periodo.flatMap((p) => p.combustible).reduce((s, x) => s + (x.horas ?? 0) * (equipo(c, x.equipo_id)?.litros_hora ?? 0), 0)
      : periodo.reduce((s, p) => s + (consumoEsperado(obra, p).get(m.id) ?? 0), 0);
    const informado = esCombustible
      ? periodo.flatMap((p) => p.combustible).reduce((s, x) => s + x.litros, 0)
      : periodo.flatMap((p) => p.consumos).filter((x) => x.material_id === m.id).reduce((s, x) => s + x.cantidad, 0);
    let medido: { cantidad: number; fecha: string; teorico: number } | null = null;
    for (const p of hastaHoy)
      for (const s of p.stock_medido)
        if (s.material_id === m.id) medido = { cantidad: s.cantidad, fecha: p.fecha, teorico: stockTeorico(c, obra, todos, m.id, p) };
    const remitos = rec.reduce((s, r) => s + r.cantidad_remito, 0);
    return {
      material_id: m.id,
      nombre: m.nombre,
      unidad: m.unidad,
      es_combustible: esCombustible,
      remitos,
      recibido: rec.reduce((s, r) => s + recibido(r), 0),
      esperado,
      informado,
      compra: remitos * m.precio,
      stock_teorico: ultimo ? stockTeorico(c, obra, todos, m.id, ultimo) : obra.stock_inicial?.[m.id] ?? 0,
      stock_medido: medido,
    };
  });

  // Viajes de flete: recepciones con camión identificado (lo que trae el proveedor con su envío no es un flete aparte).
  const recepciones = periodo.flatMap((p) => p.recepciones).filter((r) => r.patente);
  const porTransportista = new Map<string, { nombre: string; viajes: number; costo: number }>();
  for (const r of recepciones) {
    const cam = c.camiones.find((x) => patente(x.patente) === patente(r.patente));
    const nombre = cam?.transportista ?? `Camión ${r.patente}`;
    const t = porTransportista.get(nombre) ?? { nombre, viajes: 0, costo: 0 };
    t.viajes++;
    t.costo += cam?.precio_viaje ?? 0;
    porTransportista.set(nombre, t);
  }
  const tiposViaje = new Set(["remito_duplicado", "carga_incompleta", "sin_remito"]);

  const combustible = c.equipos
    .map((e) => {
      const cargas = periodo.flatMap((p) => p.combustible).filter((x) => x.equipo_id === e.id);
      const horas = cargas.reduce((s, x) => s + (x.horas ?? 0), 0);
      return { equipo_id: e.id, nombre: e.nombre, horas, litros: cargas.reduce((s, x) => s + x.litros, 0), esperado: horas * e.litros_hora };
    })
    .filter((x) => x.litros > 0 || x.horas > 0);

  const avance = obra.tareas.map((t) => {
    const suma = (lista: Parte[]) => lista.flatMap((p) => p.avances).filter((a) => a.tarea_id === t.id).reduce((s, a) => s + a.cantidad, 0);
    return { tarea_id: t.id, nombre: t.nombre, unidad: t.unidad, periodo: suma(periodo), acumulado: suma(hastaHoy), contrato: t.cantidad_contrato, precio_unitario: t.precio_unitario };
  });

  return {
    obra: { id: obra.id, nombre: obra.nombre, comitente: obra.comitente },
    desde,
    hasta,
    moneda: c.moneda ?? "$",
    partes: periodo
      .map((p) => ({
        id: p.id,
        fecha: p.fecha,
        responsable: p.responsable,
        estado: p.estado,
        rojas: p.alertas.filter((a) => a.nivel === "roja").length,
        amarillas: p.alertas.filter((a) => a.nivel === "amarilla").length,
        pedidos: p.pedidos,
        incidentes: p.incidentes,
      }))
      .reverse(),
    alertas,
    en_juego: alertas.reduce((s, a) => s + a.monto, 0),
    partidas,
    transporte: {
      viajes: recepciones.length,
      costo: [...porTransportista.values()].reduce((s, t) => s + t.costo, 0),
      con_problemas: periodo.reduce((s, p) => s + p.alertas.filter((a) => tiposViaje.has(a.tipo)).length, 0),
      por_transportista: [...porTransportista.values()].sort((a, b) => b.costo - a.costo),
    },
    combustible,
    avance,
    certificable: avance.reduce((s, a) => s + a.periodo * a.precio_unitario, 0),
  };
}

/** El resumen en texto, para cuando el dueño pregunta por WhatsApp "¿cómo viene la obra?". */
export function informeResumen(r: ResumenObra): string {
  const $ = (n: number) => plata(n, r.moneda);
  const l: string[] = [`*${r.obra.nombre}* · del ${fechaCorta(r.desde)} al ${fechaCorta(r.hasta)}`];
  l.push(`Partes: ${r.partes.length} · Alertas: ${r.alertas.filter((a) => a.nivel === "roja").length} rojas, ${r.alertas.filter((a) => a.nivel === "amarilla").length} amarillas · En juego: ${$(r.en_juego)}`);
  if (r.alertas.length) {
    l.push("", "*Para revisar*");
    for (const a of r.alertas.slice(0, 8)) l.push(`${a.nivel === "roja" ? "🔴" : "🟡"} ${fechaCorta(a.fecha)} · ${a.detalle}${a.monto > 0 ? ` (≈ ${$(a.monto)})` : ""}`);
    if (r.alertas.length > 8) l.push(`… y ${r.alertas.length - 8} más en el tablero.`);
  }
  l.push("", "*Partidas* (remitos · esperado por avance · stock)");
  for (const p of r.partidas) {
    if (!p.remitos && !p.esperado && !p.informado) continue;
    const medido = p.stock_medido ? ` · medido ${num(p.stock_medido.cantidad)} el ${fechaCorta(p.stock_medido.fecha)} (debía haber ${num(p.stock_medido.teorico)})` : "";
    const uso = p.es_combustible ? ` · cargado ${num(p.informado)}` : p.informado ? ` · informado ${num(p.informado)}` : "";
    l.push(`• ${p.nombre}: entraron ${num(p.remitos)} ${u(p.unidad)} (${$(p.compra)}) · esperado ${num(p.esperado)}${uso} · hoy debería haber ${num(p.stock_teorico)}${medido}`);
  }
  l.push(`• Fletes: ${r.transporte.viajes} viajes · ${$(r.transporte.costo)}${r.transporte.con_problemas ? ` · ${r.transporte.con_problemas} con problemas` : ""}`);
  const conAvance = r.avance.filter((a) => a.periodo > 0);
  if (conAvance.length) {
    l.push("", "*Avance del período*");
    for (const a of conAvance)
      l.push(`• ${a.nombre}: ${num(a.periodo)} ${u(a.unidad)} · acumulado ${a.contrato ? Math.round((a.acumulado / a.contrato) * 100) : 0}% del contrato`);
    l.push(`Certificable del período (avance × precio): *${$(r.certificable)}*`);
  }
  return l.join("\n");
}

// ---------- Catálogo para el prompt y vocabulario para transcribir audios ----------

export function catalogoTexto(c: ConfigObra): string {
  const l: string[] = [];
  for (const o of c.obras) {
    l.push(`Obra "${o.nombre}" (comitente: ${o.comitente}). Tareas:`);
    for (const t of o.tareas) l.push(`- ${t.nombre} [${t.unidad}]${t.alias?.length ? ` (también: ${t.alias.join(", ")})` : ""}`);
  }
  l.push("", "Materiales que se controlan:");
  for (const m of c.materiales)
    l.push(`- ${m.nombre} [${m.unidad}]${m.alias?.length ? ` (también: ${m.alias.join(", ")})` : ""}${m.nota ? `. ${m.nota}` : ""}`);
  l.push("", "Equipos que cargan gasoil:");
  for (const e of c.equipos) l.push(`- ${e.nombre}${e.alias?.length ? ` (también: ${e.alias.join(", ")})` : ""}`);
  l.push("", "Camiones de flete conocidos:");
  for (const k of c.camiones) l.push(`- ${k.patente} · ${k.transportista}`);
  return l.join("\n");
}

/** Palabras de la obra para que la transcripción de audios las escriba bien. */
export function vocabularioObra(c: ConfigObra): string {
  const palabras = [
    ...c.obras.flatMap((o) => [o.nombre, ...o.tareas.map((t) => t.nombre)]),
    ...c.materiales.flatMap((m) => [m.nombre, ...(m.alias ?? [])]),
    ...c.equipos.map((e) => e.nombre),
    ...c.camiones.map((k) => k.transportista),
    "remito", "horómetro", "gasoil", "parte diario",
  ];
  return [...new Set(palabras)].join(", ").slice(0, 800);
}
