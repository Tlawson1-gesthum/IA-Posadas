-- Motor de agentes · esquema mínimo (paso 2): conversaciones, mensajes y consumo.
-- Se corre una vez en Supabase → SQL Editor → New query → pegar → Run.

create table if not exists conversaciones (
  id uuid primary key default gen_random_uuid(),
  ficha_id text not null,
  telefono text not null,
  -- 'agente' = responde Morfi · 'humano' = derivada, el agente no responde hasta que alguien la libere
  estado text not null default 'agente' check (estado in ('agente', 'humano')),
  derivada_motivo text,
  derivada_resumen text,
  derivada_en timestamptz,
  -- /reiniciar (solo administradores): el historial anterior a esta fecha no se le pasa al agente
  reiniciada timestamptz,
  creada timestamptz not null default now(),
  actualizada timestamptz not null default now(),
  unique (ficha_id, telefono)
);

create table if not exists mensajes (
  id bigint generated always as identity primary key,
  conversacion_id uuid not null references conversaciones (id) on delete cascade,
  ficha_id text not null,
  rol text not null check (rol in ('cliente', 'agente', 'humano')),
  texto text not null,
  -- id del mensaje en WhatsApp: evita responder dos veces si Meta reenvía el aviso
  wa_id text unique,
  herramientas text[] not null default '{}',
  tokens_entrada int not null default 0,
  tokens_salida int not null default 0,
  usd numeric(10, 6) not null default 0,
  creado timestamptz not null default now()
);

create index if not exists mensajes_conversacion on mensajes (conversacion_id, creado desc);
create index if not exists mensajes_consumo on mensajes (ficha_id, creado);

-- Nadie entra desde afuera: el motor usa la clave de servicio, que saltea estas reglas.
-- Cuando existan el panel y el portal del cliente, se agregan políticas por rol y por cliente.
alter table conversaciones enable row level security;
alter table mensajes enable row level security;
