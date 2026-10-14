-- Motor de agentes · agente de obra: partes diarios de las constructoras.
-- Se corre una vez en Supabase → SQL Editor → New query → pegar → Run.
-- Cada parte guarda todo en `datos` (avance, remitos, gasoil, stock, alertas); las columnas sueltas son para filtrar.
create table if not exists partes_obra (
  id uuid primary key,
  ficha_id text not null references fichas (id) on delete cascade,
  obra_id text not null,
  fecha date not null,
  estado text not null check (estado in ('pendiente', 'confirmado', 'reemplazado')),
  telefono text not null,
  datos jsonb not null,
  creado timestamptz not null default now()
);

create index if not exists partes_obra_obra on partes_obra (ficha_id, obra_id, fecha);
create index if not exists partes_obra_pendientes on partes_obra (ficha_id, telefono, creado desc) where estado = 'pendiente';

-- Solo el motor (con la clave de servicio) lee y escribe: nadie entra directo desde el navegador.
alter table partes_obra enable row level security;
