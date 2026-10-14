// Herramientas del agente de obra. El modelo pasa a datos lo que dijo el capataz; el código resuelve los nombres
// contra el catálogo de la ficha, controla contra el presupuesto y los remitos, y devuelve el informe ya armado.
import { randomUUID } from "node:crypto";
import { almacenObra } from "../obra/almacen.js";
import {
  buscar,
  buscarObra,
  controlarParte,
  hoyAR,
  informeParte,
  informeResumen,
  patente,
  resumenObra,
  sumarDias,
  vigentes,
} from "../obra/control.js";
import type { ConfigObra, Parte } from "../obra/modelo.js";
import type { ContextoHerramienta, Herramienta } from "../tipos.js";

const numeroONulo = { anyOf: [{ type: "number" }, { type: "null" }] };

function configObra(ctx: ContextoHerramienta): ConfigObra {
  if (!ctx.ficha.obra?.obras?.length) throw new Error("Esta ficha no tiene obras cargadas");
  return ctx.ficha.obra;
}

const opciones = (lista: { nombre: string }[]) => lista.map((x) => x.nombre);

export const registrarParte: Herramienta = {
  propia: true,
  definicion: {
    name: "registrar_parte",
    description:
      "Carga el parte diario de una obra con lo que contó la persona (audio transcripto o texto) y devuelve el informe con los controles hechos. " +
      "Pasá los nombres como los dijo la persona (el sistema los busca en el catálogo). Listas vacías para lo que no se mencionó. " +
      "Nunca inventes cantidades: si un dato no está, dejalo vacío o null. El parte queda pendiente hasta que la persona lo confirme.",
    input_schema: {
      type: "object",
      properties: {
        obra: { type: "string", description: "Nombre de la obra como lo dijo la persona. Vacío si no lo dijo y hay una sola obra." },
        fecha: { type: "string", description: "Fecha del parte AAAA-MM-DD. Vacío si es hoy." },
        responsable: { type: "string", description: "Quién manda el parte (nombre), si lo dice." },
        clima: { type: "string", description: "Clima y horas perdidas por lluvia, si lo dice." },
        personal: { ...numeroONulo, description: "Cantidad de personas trabajando." },
        avances: {
          type: "array",
          items: {
            type: "object",
            properties: {
              tarea: { type: "string" },
              cantidad: { type: "number", description: "En la unidad de la tarea del catálogo." },
            },
            required: ["tarea", "cantidad"],
            additionalProperties: false,
          },
        },
        recepciones: {
          type: "array",
          description: "Un elemento por remito o viaje de camión que llegó a obra.",
          items: {
            type: "object",
            properties: {
              material: { type: "string" },
              cantidad_remito: { type: "number", description: "Lo que dice el remito, en la unidad del material." },
              cantidad_recibida: { ...numeroONulo, description: "Lo que realmente llegó, si dicen que vino menos (balanza o estimación). null si no dicen nada." },
              remito: { type: "string", description: "Número de remito tal como lo dicen. Vacío si no hay." },
              proveedor: { type: "string" },
              patente: { type: "string", description: "Patente del camión, si la dicen." },
            },
            required: ["material", "cantidad_remito", "cantidad_recibida", "remito", "proveedor", "patente"],
            additionalProperties: false,
          },
        },
        consumos: {
          type: "array",
          description: "Material que dicen que se usó (solo si lo dicen explícitamente). No incluyas gasoil acá.",
          items: {
            type: "object",
            properties: { material: { type: "string" }, cantidad: { type: "number" } },
            required: ["material", "cantidad"],
            additionalProperties: false,
          },
        },
        combustible: {
          type: "array",
          description: "Cargas de gasoil a equipos.",
          items: {
            type: "object",
            properties: {
              equipo: { type: "string" },
              litros: { type: "number" },
              horas: { ...numeroONulo, description: "Horas trabajadas desde la carga anterior, si las dicen." },
              horometro: { ...numeroONulo, description: "Lectura del horómetro, si la dicen." },
            },
            required: ["equipo", "litros", "horas", "horometro"],
            additionalProperties: false,
          },
        },
        stock_medido: {
          type: "array",
          description: "Material contado o medido en obra (ej. 'quedan 40 bolsas de cemento', 'el tanque tiene 1.200 litros').",
          items: {
            type: "object",
            properties: { material: { type: "string" }, cantidad: { type: "number", description: "En la unidad del material del catálogo." } },
            required: ["material", "cantidad"],
            additionalProperties: false,
          },
        },
        incidentes: { type: "array", items: { type: "string" }, description: "Accidentes, roturas, robos, faltas, demoras." },
        pedidos: { type: "array", items: { type: "string" }, description: "Material o equipos que piden para los próximos días." },
        observaciones: { type: "string" },
        corrige_parte: { type: "string", description: "Id del parte pendiente que este corrige o completa (con todos los datos juntos). Vacío si es un parte nuevo." },
      },
      required: [
        "obra", "fecha", "responsable", "clima", "personal", "avances", "recepciones", "consumos",
        "combustible", "stock_medido", "incidentes", "pedidos", "observaciones", "corrige_parte",
      ],
      additionalProperties: false,
    },
    strict: true,
  },

  async ejecutar(e, ctx) {
    const c = configObra(ctx);
    const almacen = almacenObra();
    const texto = (v: unknown) => String(v ?? "").trim();
    const numero = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
    const lista = (v: unknown) => (Array.isArray(v) ? (v as Record<string, unknown>[]) : []);

    const obra = buscarObra(c, texto(e.obra));
    if (!obra) return JSON.stringify({ ok: false, falta: "obra", nota: "Preguntale de qué obra es el parte.", obras: opciones(c.obras) });

    const hoy = hoyAR();
    const fecha = texto(e.fecha) || hoy;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || fecha > sumarDias(hoy, 1) || fecha < sumarDias(hoy, -60))
      return JSON.stringify({ ok: false, falta: "fecha", nota: `La fecha ${fecha} no es válida (hoy es ${hoy}). Preguntá de qué día es el parte.` });

    // Nombres → catálogo. Lo que no se encuentra no se carga: se pregunta.
    const noReconocidos: { que: string; dicho: string; opciones: string[] }[] = [];
    const resolver = <T extends { id: string; nombre: string }>(que: string, catalogo: T[], dicho: string): T | null => {
      const x = buscar(catalogo, dicho);
      if (!x) noReconocidos.push({ que, dicho, opciones: opciones(catalogo) });
      return x;
    };

    const avances = lista(e.avances).flatMap((a) => {
      const t = resolver("tarea", obra.tareas, texto(a.tarea));
      return t && numero(a.cantidad) !== null ? [{ tarea_id: t.id, cantidad: numero(a.cantidad)! }] : [];
    });
    const recepciones = lista(e.recepciones).flatMap((r) => {
      const m = resolver("material", c.materiales, texto(r.material));
      const cant = numero(r.cantidad_remito);
      return m && cant !== null
        ? [{
            material_id: m.id,
            cantidad_remito: cant,
            cantidad_recibida: numero(r.cantidad_recibida),
            remito: texto(r.remito),
            proveedor: texto(r.proveedor),
            patente: patente(texto(r.patente)),
          }]
        : [];
    });
    const consumos = lista(e.consumos).flatMap((x) => {
      const m = resolver("material", c.materiales, texto(x.material));
      return m && numero(x.cantidad) !== null ? [{ material_id: m.id, cantidad: numero(x.cantidad)! }] : [];
    });
    const combustible = lista(e.combustible).flatMap((x) => {
      const eq = resolver("equipo", c.equipos, texto(x.equipo));
      return eq && numero(x.litros) !== null ? [{ equipo_id: eq.id, litros: numero(x.litros)!, horas: numero(x.horas), horometro: numero(x.horometro) }] : [];
    });
    const stock_medido = lista(e.stock_medido).flatMap((x) => {
      const m = resolver("material", c.materiales, texto(x.material));
      return m && numero(x.cantidad) !== null ? [{ material_id: m.id, cantidad: numero(x.cantidad)! }] : [];
    });

    if (noReconocidos.length)
      return JSON.stringify({
        ok: false,
        no_reconocidos: noReconocidos,
        nota: "No se cargó nada. Preguntale a qué se refiere con cada uno (mostrale las opciones más parecidas) y volvé a llamar con todo el parte.",
      });

    // Correcciones: el parte nuevo reemplaza al pendiente. Uno pendiente por persona a la vez.
    const corrige = texto(e.corrige_parte);
    let anterior: Parte | null = null;
    if (corrige) {
      anterior = await almacen.parte(corrige);
      if (!anterior || anterior.ficha_id !== ctx.ficha.id) return JSON.stringify({ ok: false, nota: `No existe el parte ${corrige}.` });
    } else {
      const pendiente = await almacen.ultimoPendiente(ctx.ficha.id, ctx.telefono);
      if (pendiente)
        return JSON.stringify({
          ok: false,
          parte_pendiente: pendiente.id,
          nota: "Esta persona tiene un parte sin confirmar. Si lo nuevo corrige o completa ese parte, volvé a llamar con TODOS los datos juntos y corrige_parte con ese id. Si es otro parte, pedile primero que confirme o descarte el anterior.",
        });
    }

    const partes = await almacen.partes(ctx.ficha.id, obra.id);
    const anteriores = vigentes(partes).filter((p) => p.id !== anterior?.id);
    const parte: Parte = {
      id: randomUUID(),
      ficha_id: ctx.ficha.id,
      obra_id: obra.id,
      fecha,
      estado: "pendiente",
      telefono: ctx.telefono,
      responsable: texto(e.responsable),
      clima: texto(e.clima),
      personal: numero(e.personal),
      avances,
      recepciones,
      consumos,
      combustible,
      stock_medido,
      incidentes: lista(e.incidentes).map(texto).filter(Boolean),
      pedidos: lista(e.pedidos).map(texto).filter(Boolean),
      observaciones: texto(e.observaciones),
      alertas: [],
      reemplaza: anterior?.id ?? null,
      creado: new Date().toISOString(),
    };
    parte.alertas = controlarParte(c, obra, parte, anteriores);
    await almacen.guardar(parte);
    if (anterior) await almacen.guardar({ ...anterior, estado: "reemplazado" });

    return JSON.stringify({
      ok: true,
      parte_id: parte.id,
      estado: "pendiente",
      informe: informeParte(c, obra, parte, anteriores),
      alertas_rojas: parte.alertas.filter((a) => a.nivel === "roja").length,
      nota: "Mandale el informe tal cual (no cambies los números) y preguntale si está bien para confirmarlo o qué hay que corregir.",
    });
  },
};

export const confirmarParte: Herramienta = {
  propia: true,
  definicion: {
    name: "confirmar_parte",
    description: "Confirma un parte pendiente cuando la persona dice que está bien (\"ok\", \"dale\", \"confirmo\"). Desde ahí cuenta para el tablero del dueño.",
    input_schema: {
      type: "object",
      properties: { parte_id: { type: "string", description: "Id del parte. Vacío = el último pendiente de esta persona." } },
      required: ["parte_id"],
      additionalProperties: false,
    },
    strict: true,
  },
  async ejecutar(e, ctx) {
    const almacen = almacenObra();
    const id = String(e.parte_id ?? "").trim();
    const p = id ? await almacen.parte(id) : await almacen.ultimoPendiente(ctx.ficha.id, ctx.telefono);
    if (!p || p.ficha_id !== ctx.ficha.id) return JSON.stringify({ ok: false, nota: "No hay ningún parte pendiente para confirmar." });
    if (p.estado !== "pendiente") return JSON.stringify({ ok: false, nota: `Ese parte ya está ${p.estado}.` });
    await almacen.guardar({ ...p, estado: "confirmado" });
    return JSON.stringify({
      ok: true,
      parte_id: p.id,
      alertas_rojas: p.alertas.filter((a) => a.nivel === "roja").length,
      nota: "Confirmado. Ya figura en el tablero de la obra.",
    });
  },
};

export const verObra: Herramienta = {
  propia: true,
  definicion: {
    name: "ver_obra",
    description:
      "Resumen de una obra para el dueño o el jefe de obra: alertas, partidas (remitos contra consumo esperado y stock), gasoil, fletes, avance y lo certificable del período.",
    input_schema: {
      type: "object",
      properties: {
        obra: { type: "string", description: "Nombre de la obra. Vacío si hay una sola." },
        periodo: { type: "string", enum: ["hoy", "semana", "mes"] },
      },
      required: ["obra", "periodo"],
      additionalProperties: false,
    },
    strict: true,
  },
  async ejecutar(e, ctx) {
    const c = configObra(ctx);
    const obra = buscarObra(c, String(e.obra ?? ""));
    if (!obra) return JSON.stringify({ ok: false, nota: "Preguntale de qué obra.", obras: opciones(c.obras) });
    const hasta = hoyAR();
    const desde = e.periodo === "hoy" ? hasta : e.periodo === "mes" ? `${hasta.slice(0, 8)}01` : sumarDias(hasta, -6);
    const r = resumenObra(c, obra, await almacenObra().partes(ctx.ficha.id, obra.id), desde, hasta);
    return JSON.stringify({ ok: true, resumen: informeResumen(r), nota: "Mandalo tal cual; si pregunta algo puntual, respondé con estos datos." });
  },
};
