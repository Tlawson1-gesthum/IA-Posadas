// Prueba del agente de obra sin Claude: carga la semana de ejemplo, simula el parte de hoy como lo pasaría el modelo
// y verifica que salten los controles esperados. Uso: npm run obra
import "./entorno.js";
import { cargarFicha } from "../src/fichas.js";
import { confirmarParte, registrarParte, verObra } from "../src/herramientas/obra.js";
import { almacenObra } from "../src/obra/almacen.js";
import { hoyAR, resumenObra, sumarDias } from "../src/obra/control.js";
import { cargarSemilla } from "../src/obra/semilla.js";

const ficha = await cargarFicha("obra-demo");
const ctx = { ficha, telefono: "5493764000000" };
let fallas = 0;
const verificar = (ok: boolean, que: string) => {
  console.log(`${ok ? "✓" : "✗"} ${que}`);
  if (!ok) fallas++;
};

// 1. Semana de ejemplo: las alertas las calcula el motor.
console.log(`Semana de ejemplo: ${await cargarSemilla(ficha)} partes\n`);
const obra = ficha.obra!.obras[0];
const r = resumenObra(ficha.obra!, obra, await almacenObra().partes(ficha.id, obra.id), sumarDias(hoyAR(), -6), hoyAR());
for (const a of r.alertas) console.log(`  ${a.nivel === "roja" ? "URGENTE" : "REVISAR"} ${a.fecha} · ${a.tipo} · ${a.detalle}`);
console.log();
const hay = (tipo: string, texto: string) => r.alertas.some((a) => a.tipo === tipo && a.detalle.includes(texto));
verificar(hay("combustible", "Motoniveladora MN-01: cargó 260 l"), "gasoil de más en la motoniveladora");
verificar(hay("remito_duplicado", "0001-00004521"), "remito de piedra repetido");
verificar(hay("carga_incompleta", "llegaron 26"), "camión que llegó con menos piedra");
verificar(hay("stock", "Cemento"), "cemento que falta en el conteo");
verificar(hay("sin_remito", "Arena"), "viaje de arena sin remito");
verificar(!hay("stock", "Gasoil"), "el tanque de gasoil cierra (sin alerta)");
verificar(r.alertas.filter((a) => a.nivel === "roja").length === 4, "4 alertas rojas");
verificar(r.certificable > 0, `certificable de la semana: ${Math.round(r.certificable).toLocaleString("es-AR")}`);

// 2. El parte de hoy, como lo pasaría el modelo después de transcribir el audio del capataz.
const parteHoy = {
  obra: "los lapachos",
  fecha: "",
  responsable: "Ramón",
  clima: "Lluvia a la tarde, se paró una hora",
  personal: 14,
  avances: [{ tarea: "carpeta", cantidad: 850 }],
  recepciones: [
    { material: "piedra 6-20", cantidad_remito: 30, cantidad_recibida: null, remito: "4588", proveedor: "Cantera Santa Ana", patente: "AB 123 CD" },
    { material: "piedra 6-20", cantidad_remito: 30, cantidad_recibida: null, remito: "4589", proveedor: "Cantera Santa Ana", patente: "AC456FG" },
    { material: "piedra 6-20", cantidad_remito: 30, cantidad_recibida: 25, remito: "4590", proveedor: "Cantera Santa Ana", patente: "AC456FG" },
  ],
  consumos: [],
  combustible: [
    { equipo: "motoniveladora", litros: 150, horas: 8, horometro: null },
    { equipo: "rodillo", litros: 80, horas: 8, horometro: null },
    { equipo: "terminadora", litros: 110, horas: null, horometro: null },
  ],
  stock_medido: [],
  incidentes: [],
  pedidos: ["2 tn de cemento para el jueves"],
  observaciones: "",
  corrige_parte: "",
};
const registro = JSON.parse(await registrarParte.ejecutar(parteHoy, ctx));
console.log(`\n${registro.informe}\n`);
verificar(registro.ok === true, "el parte de hoy se carga");
verificar(/Faltan 5 tn/.test(registro.informe), "detecta los 5 tn que faltan del remito 4590");
verificar(/Rodillo compactador RC-02: cargó 80 l/.test(registro.informe), "rodillo con 11% de gasoil de más");
verificar(/Terminadora.*sin horas/.test(registro.informe), "pide las horas de la terminadora");

// 3. Un segundo parte sin confirmar el primero: el sistema pide corregir o confirmar.
const otro = JSON.parse(await registrarParte.ejecutar(parteHoy, ctx));
verificar(otro.ok === false && otro.parte_pendiente === registro.parte_id, "no deja dos partes pendientes de la misma persona");

// 4. Corrección: la terminadora trabajó 8 h. Reemplaza al pendiente.
const corregido = JSON.parse(
  await registrarParte.ejecutar(
    { ...parteHoy, combustible: [parteHoy.combustible[0], parteHoy.combustible[1], { equipo: "terminadora", litros: 110, horas: 8, horometro: null }], corrige_parte: registro.parte_id },
    ctx,
  ),
);
verificar(corregido.ok === true && !/Terminadora.*sin horas/.test(corregido.informe), "la corrección completa las horas");
verificar((await almacenObra().parte(registro.parte_id))?.estado === "reemplazado", "el parte anterior queda reemplazado");

// 5. Nombre que no existe: no se carga y se pregunta.
const raro = JSON.parse(await registrarParte.ejecutar({ ...parteHoy, combustible: [{ equipo: "grúa", litros: 50, horas: 4, horometro: null }], corrige_parte: corregido.parte_id }, ctx));
verificar(raro.ok === false && raro.no_reconocidos?.[0]?.dicho === "grúa", "un equipo que no está en el catálogo se pregunta");

// 6. Confirmar y ver el resumen como lo pediría el dueño.
const conf = JSON.parse(await confirmarParte.ejecutar({ parte_id: "" }, ctx));
verificar(conf.ok === true && conf.parte_id === corregido.parte_id, "confirma el último pendiente");
const resumen = JSON.parse(await verObra.ejecutar({ obra: "", periodo: "semana" }, ctx));
console.log(`\n${resumen.resumen}\n`);
verificar(/Certificable/.test(resumen.resumen), "el resumen trae lo certificable");

console.log(fallas ? `\n${fallas} control(es) fallaron` : "\nTodo bien");
process.exit(fallas ? 1 : 0);
