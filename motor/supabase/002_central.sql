-- Motor de agentes · paso 3: la central. Fichas en la base, historial de versiones y eventos.
-- Se corre una vez en Supabase → SQL Editor → New query → pegar → Run (después de 001_esquema.sql).

-- Por qué número de WhatsApp entró cada charla: el panel responde por ese mismo número.
alter table conversaciones add column if not exists numero_negocio text;

-- Una fila por cliente. `config` es la ficha completa (nombre, plantilla, modelo, datos...).
-- `borrador` guarda los cambios hechos en el panel hasta que se prueban y se publican.
create table if not exists fichas (
  id text primary key check (id ~ '^[a-z0-9-]+$'),
  estado text not null default 'pausado' check (estado in ('activo', 'pausado')),
  whatsapp_phone_number_id text unique,
  abono_usd_mes numeric(10, 2) not null default 0,
  config jsonb not null,
  borrador jsonb,
  version int not null default 1,
  creada timestamptz not null default now(),
  actualizada timestamptz not null default now()
);

-- Cada versión publicada de cada ficha: quién la cambió, cuándo y por qué. Permite volver atrás.
create table if not exists fichas_historial (
  id bigint generated always as identity primary key,
  ficha_id text not null references fichas (id) on delete cascade,
  version int not null,
  config jsonb not null,
  autor text not null default 'panel',
  nota text,
  creado timestamptz not null default now(),
  unique (ficha_id, version)
);

-- Lo que pasa y conviene mirar: errores, derivaciones, límites, cambios de estado.
create table if not exists eventos (
  id bigint generated always as identity primary key,
  ficha_id text,
  conversacion_id uuid references conversaciones (id) on delete set null,
  tipo text not null,
  detalle text,
  creado timestamptz not null default now()
);
create index if not exists eventos_ficha on eventos (ficha_id, creado desc);
create index if not exists eventos_tipo on eventos (tipo, creado desc);
create index if not exists conversaciones_ficha on conversaciones (ficha_id, actualizada desc);

-- Resúmenes calculados en la base (una consulta normal devuelve como máximo 1.000 filas).
create or replace function gasto_mes(p_ficha text) returns numeric language sql stable as $$
  select coalesce(sum(usd), 0) from mensajes
  where ficha_id = p_ficha and creado >= date_trunc('month', now() at time zone 'utc') at time zone 'utc'
$$;

create or replace function resumen_mes() returns table (ficha_id text, usd numeric, mensajes bigint, conversaciones bigint, ultimo timestamptz)
language sql stable as $$
  select m.ficha_id, sum(m.usd), count(*) filter (where m.rol = 'cliente'), count(distinct m.conversacion_id), max(m.creado)
  from mensajes m
  where m.creado >= date_trunc('month', now() at time zone 'utc') at time zone 'utc'
  group by m.ficha_id
$$;

create or replace function conversaciones_lista(p_ficha text, p_solo_derivadas boolean, p_limite int)
returns table (id uuid, ficha_id text, telefono text, numero_negocio text, estado text, derivada_motivo text, derivada_resumen text, derivada_en timestamptz,
               actualizada timestamptz, mensajes bigint, usd numeric, ultimo_texto text, ultimo_rol text, ultimo_creado timestamptz)
language sql stable as $$
  select c.id, c.ficha_id, c.telefono, c.numero_negocio, c.estado, c.derivada_motivo, c.derivada_resumen, c.derivada_en, c.actualizada,
         (select count(*) from mensajes m where m.conversacion_id = c.id),
         (select coalesce(sum(m.usd), 0) from mensajes m where m.conversacion_id = c.id),
         u.texto, u.rol, u.creado
  from conversaciones c
  left join lateral (select texto, rol, creado from mensajes m where m.conversacion_id = c.id order by creado desc limit 1) u on true
  where (p_ficha is null or c.ficha_id = p_ficha) and (not p_solo_derivadas or c.estado = 'humano')
  order by coalesce(u.creado, c.actualizada) desc
  limit p_limite
$$;

alter table fichas enable row level security;
alter table fichas_historial enable row level security;
alter table eventos enable row level security;

-- Ficha inicial: MORFA (activa).
insert into fichas (id, estado, whatsapp_phone_number_id, abono_usd_mes, config)
values ('morfa', 'activo', null, 200, $ficha${
  "nombre": "MORFA",
  "rubro": "gastronomia",
  "plantilla": "gastronomia",
  "modelo": "claude-opus-5-5",
  "esfuerzo": "low",
  "tope_usd_mes": 30,
  "limites": {
    "mensajes_por_hora": 30,
    "mensajes_por_dia": 80,
    "usd_por_persona_dia": 0.5,
    "caracteres_por_mensaje": 1000
  },
  "herramientas": [
    "ver_carta_y_estado",
    "consultar_pedido",
    "cotizar_pedido",
    "crear_pedido",
    "derivar_a_persona"
  ],
  "integracion": {
    "tipo": "semorfa",
    "base_url": "https://semorfa.com.ar",
    "crear_pedidos": false
  },
  "datos": {
    "nombre_agente": "Morfi",
    "descripcion": "una dark kitchen (cocina sin salón) de Posadas, Misiones, que hace pizzas, empanadas, sánguches, milas y extras, solo con delivery",
    "objetivo": "Responder dudas sobre la carta, el horario, el envío y los pagos; tomar pedidos por acá para quien lo prefiera; decir en qué estado está un pedido cuando te pasan el código. Siempre ofrecé las dos formas de pedir: por acá con vos, o en la web https://semorfa.com.ar.",
    "datos_fijos": "- Web y tienda: https://semorfa.com.ar\n- Instagram: @semorfa\n- Solo delivery. No hay retiro en el local ni salón. Nunca des la dirección de la cocina como lugar para retirar.\n- Zona de entrega: nunca digas distancias ni kilómetros. Si preguntan si llegan a un lugar, pedí la ubicación o que marquen la dirección en la web. Si queda fuera de zona: \"Uh, a esa zona por ahora no llegamos\".\n- Pagos: efectivo al recibir (si `efectivo` es true), Mercado Pago (tarjeta, dinero en cuenta, etc.) o transferencia. La transferencia solo se gestiona por acá con el encargado, no en la web.\n- Cuotas con Mercado Pago: si el cliente elige cuotas con interés, el interés lo paga el cliente.\n- Los sánguches y las milas no traen papas: se suman como adicional.\n- Los precios que informás son los de la web. En PedidosYa son distintos: no los informes.\n- Hoy no hay promos cargadas.",
    "como_se_pide": "Hay dos formas. Ofrecé las dos y respetá lo que elija la persona:\nA) En la web https://semorfa.com.ar: arma el carrito, marca la dirección en el mapa, paga, y sigue el pedido en vivo con el código que le da la web. No hace falta cuenta.\nB) Por acá, con vos. Pensado para quien no quiere o no puede usar la web. Pasos, de a uno por mensaje:\n1. Qué quiere: anotá productos, cantidades y adicionales con los ids de `ver_carta_y_estado`. Si pide sánguche o mila, ofrecé una vez sumarle papas.\n2. Dónde: pedí que comparta la ubicación (en WhatsApp: el clip o el + → Ubicación → Enviar mi ubicación actual) y, aparte, calle y número y una referencia (piso, depto, color de la casa). Si no puede mandar la ubicación, derivá con motivo pedido_sin_ubicacion y el pedido armado en el resumen.\n3. Nombre de quien recibe.\n4. Cómo paga: efectivo al recibir, Mercado Pago (le mandás un link para pagar) o transferencia.\n5. Con todo eso, usá `cotizar_pedido` y mostrale el resumen: cada producto, envío, *total*, dirección y forma de pago. Preguntá: \"¿Lo confirmo?\".\n6. Si confirma:\n   - Efectivo o Mercado Pago: usá `crear_pedido`. Pasale el código y el link. Con Mercado Pago, el pedido entra a la cocina cuando se aprueba el pago. Con efectivo, que tenga el monto o diga con cuánto paga para llevar cambio (anotalo en notas).\n   - Transferencia: no uses `crear_pedido`. Derivá con motivo transferencia y todo el pedido en el resumen; decile que el encargado le pasa los datos para transferir y le confirma el pedido.\nSi el local está cerrado, se puede charlar y armar el pedido, pero no crearlo: decí cuándo abre con `estado.motivo`.\nSi `cotizar_pedido` da fuera de zona o algún producto no hay, decíselo y ofrecé alternativas de la carta.",
    "preguntas_frecuentes": "- ¿Llegan a tal lugar? Pedí la ubicación y usá `cotizar_pedido` (con lo que tenga en el pedido, o un producto cualquiera si todavía no eligió) para ver si llega y cuánto sale el envío. O que marque la dirección en la web.\n- ¿Cuánto sale el envío? Depende de la distancia. Podés decir los costos posibles de `envio.costos_posibles` (si alguno es 0, es gratis). Con la ubicación, `cotizar_pedido` da el exacto.\n- ¿Cuánto tarda? La `demora` del momento, contada desde que se confirma el pedido.\n- ¿Celíacos o sin TACC? \"No tenemos productos aptos para celíacos, mil disculpas.\" No derives por esto.\n- ¿Dónde está mi pedido? Pedí el código y usá `consultar_pedido`. Si no lo tiene, está en el mensaje o en la pantalla que vio al pedir. Si lo pidió por PedidosYa, se consulta en la app de PedidosYa: esos pedidos no se ven acá.\n- Pedido en efectivo hecho en la web esperando confirmación: el local le escribe por WhatsApp para confirmarlo antes de cocinar.\n- Pago rechazado: puede reintentar desde el link del pedido.",
    "casos_derivacion": "- Pago por transferencia (con el pedido armado).\n- No puede compartir la ubicación (con el pedido armado).\n- Reclamos: pedido frío, faltante, equivocado, tarde o en mal estado.\n- Plata: reembolsos, devoluciones, cobros dobles o problemas con un pago.\n- Alergias (salvo celiaquía, que está en preguntas frecuentes).\n- Pedidos especiales: eventos, pedidos grandes, factura A o B.\n- Cancelaciones (solo las hace el local).\n- Cliente enojado.",
    "voz": "- Joven, directa, con lunfardo argentino y onda de trasnoche, sin exagerar. Voseo siempre (pedí, tenés, morfá).\n- Frases de la marca, para usar de vez en cuando: \"Acá se morfa\", \"¿Hambre de noche? Morfá.\", \"De noche, en Posadas\".\n- Si firmás, solo \"MORFA\".\n- Emojis: pocos o ninguno.",
    "cierre": "Cuando la charla termina (pedido creado, o la persona agradece o se despide), cerrá con algo como: \"Gracias por elegirnos. Ojalá te guste la comida: cuando llegue, dejanos tu opinión en el link de seguimiento del pedido. Acá se morfa. MORFA\". Si hubo pedido, usá su link de seguimiento. No lo repitas si ya lo dijiste."
  }
}$ficha$::jsonb)
on conflict (id) do nothing;

insert into fichas_historial (ficha_id, version, config, autor, nota)
select id, 1, config, 'instalacion', 'Versión inicial' from fichas where id = 'morfa'
on conflict do nothing;
