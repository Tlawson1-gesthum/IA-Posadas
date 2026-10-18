-- Motor de agentes · distribuidoras (paso 16 del plan de Pensa Distribuidoras).
-- Solo agrega: no cambia ni borra nada de lo que ya existe. Se corre una vez en Supabase → SQL Editor → New query → pegar → Run.

-- Pedido en armado: los mensajes de un cliente que forman un mismo pedido (texto, foto y audio seguidos).
-- Mientras abierto_hasta no pasó, los mensajes nuevos se suman al mismo pedido y comparten su id (así no se cargan dos pedidos
-- por la misma intención). Al cargarse el pedido se cierra (abierto_hasta = ahora).
create table if not exists pedidos_en_armado (
  ficha_id text not null,
  telefono text not null,
  -- [{ "wa_id": "...", "texto": "...", "ts": "2026-10-18T12:00:00Z" }]
  mensajes jsonb not null default '[]'::jsonb,
  abierto_hasta timestamptz not null,
  actualizado timestamptz not null default now(),
  primary key (ficha_id, telefono)
);
alter table pedidos_en_armado enable row level security;

-- Retención: hasta cuándo se guarda el texto de la charla. Vencida, podarConversaciones() borra el texto y el teléfono.
alter table conversaciones add column if not exists retencion_hasta timestamptz;
create index if not exists conversaciones_retencion on conversaciones (retencion_hasta) where retencion_hasta is not null;
