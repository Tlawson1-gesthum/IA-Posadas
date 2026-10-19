-- Motor de agentes · Ayuda Pensa para Gozza (gastronomía) y Tutti (kiosco): un asistente de soporte por local, como morfa-soporte.
-- Se corre una vez en Supabase → SQL Editor → New query → pegar → Run.
-- Cada uno lee en vivo la guía de su local (/api/ayuda) y lo que no sabe se lo pasa al equipo de Pensa (aparece en la central).
-- Gozza: ver_turno y consultar_pedido funcionan cuando estén cargadas las claves (AGENTE_CLAVE en Cloudflare → gozza-cak y
-- GOZZA_AGENTE_CLAVE en Vercel, el mismo valor); sin ellas responde con la guía. Tutti: solo guía y derivar (su producción
-- todavía no está publicada: el conocimiento sale de la prueba; cuando se publique, cambiar la url por https://kioscotutti.com.ar/api/ayuda).
insert into fichas (id, estado, abono_usd_mes, config, version)
values ('gozza-soporte', 'activo', 0, $ficha${
  "nombre": "Gozza",
  "rubro": "soporte",
  "plantilla": "soporte",
  "modelo": "claude-sonnet-5-5",
  "esfuerzo": "low",
  "tope_usd_mes": 15,
  "limites": {
    "mensajes_por_hora": 40,
    "mensajes_por_dia": 150,
    "usd_por_persona_dia": 0.5,
    "caracteres_por_mensaje": 1500
  },
  "herramientas": [
    "ver_turno",
    "consultar_pedido",
    "derivar_a_persona"
  ],
  "conocimiento": {
    "url": "https://gozza.com.ar/api/ayuda"
  },
  "chat_web": {
    "activo": true,
    "color": "#6B1A26",
    "saludo": "Hola, soy el asistente de Pensa. ¿En qué parte del sistema te ayudo?",
    "mensajes_por_ip_hora": 30,
    "mensajes_por_dia": 300
  },
  "datos": {
    "nombre_agente": "Ayuda Pensa",
    "descripcion": "Es el panel web con el que el equipo de Gozza (comidas y viandas de Posadas) maneja pedidos, viandas, cocina, caja, compras, menú y números. Se usa en gozza.com.ar/#/panel.",
    "quienes_escriben": "Personas del equipo de Gozza que usan el panel: cocina, encargados y el dueño. No son clientes: si alguien quiere hacer un pedido o comprar viandas, decile que lo haga en gozza.com.ar.",
    "casos_derivacion": "- Algo no funciona, da error o se ve raro, y ya probó lo básico del manual.\n- Pide algo que el sistema no hace (una función nueva o un cambio).\n- Plata que el manual no explica: cobros de Mercado Pago, comisiones, diferencias de caja.\n- Problemas con su PIN, su usuario o sus permisos que no puede resolver el dueño.",
    "voz": "- Clara, paciente y amable. Voseo. Sin tecnicismos.\n- Breve: la persona está trabajando, muchas veces en plena cocina."
  },
  "integracion": {
    "tipo": "semorfa",
    "base_url": "https://gozza.com.ar",
    "crear_pedidos": false,
    "clave_env": "GOZZA_AGENTE_CLAVE"
  }
}$ficha$::jsonb, 1)
on conflict (id) do nothing;

insert into fichas (id, estado, abono_usd_mes, config, version)
values ('tutti-soporte', 'activo', 0, $ficha${
  "nombre": "Tutti",
  "rubro": "soporte",
  "plantilla": "soporte",
  "modelo": "claude-sonnet-5-5",
  "esfuerzo": "low",
  "tope_usd_mes": 15,
  "limites": {
    "mensajes_por_hora": 40,
    "mensajes_por_dia": 150,
    "usd_por_persona_dia": 0.5,
    "caracteres_por_mensaje": 1500
  },
  "herramientas": [
    "derivar_a_persona"
  ],
  "conocimiento": {
    "url": "https://prueba.tutti-dox.pages.dev/api/ayuda"
  },
  "chat_web": {
    "activo": true,
    "color": "#6B1A26",
    "saludo": "Hola, soy el asistente de Pensa. ¿En qué parte del sistema te ayudo?",
    "mensajes_por_ip_hora": 30,
    "mensajes_por_dia": 300
  },
  "datos": {
    "nombre_agente": "Ayuda Pensa",
    "descripcion": "Es el sistema con el que el equipo de Tutti (un kiosco de barrio de Posadas) vende en el mostrador y maneja la caja, la mercadería, el stock, los proveedores, la tienda online y los números del kiosco.",
    "quienes_escriben": "Personas del equipo de Tutti que usan el sistema: cajeros, repartidores, encargados y el dueño. No son clientes: si alguien quiere comprar, decile que lo haga en la tienda online del kiosco o en el local.",
    "casos_derivacion": "- Algo no funciona, da error o se ve raro, y ya probó lo básico del manual.\n- Pide algo que el sistema no hace (una función nueva o un cambio).\n- Plata que el manual no explica: cobros de Mercado Pago, comisiones, diferencias de caja.\n- Problemas con su PIN, su usuario o sus permisos que no puede resolver el dueño.",
    "voz": "- Clara, paciente y amable. Voseo. Sin tecnicismos.\n- Breve: la persona está atendiendo el mostrador."
  }
}$ficha$::jsonb, 1)
on conflict (id) do nothing;

insert into fichas_historial (ficha_id, version, config, autor, nota)
select id, 1, config, 'instalacion', 'Versión inicial del soporte' from fichas where id in ('gozza-soporte', 'tutti-soporte')
on conflict do nothing;
