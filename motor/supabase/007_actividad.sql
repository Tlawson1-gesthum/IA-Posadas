-- Motor de agentes · gráfico de actividad del tablero.
-- Se corre una vez en Supabase → SQL Editor → New query → pegar → Run.
-- Mensajes de clientes, charlas y costo por día (hora de Argentina) de los últimos p_dias días, de todos los agentes.
create or replace function actividad_dias(p_dias int) returns table (dia date, mensajes bigint, charlas bigint, usd numeric)
language sql stable as $$
  select (m.creado at time zone 'America/Argentina/Buenos_Aires')::date as dia,
         count(*) filter (where m.rol = 'cliente'),
         count(distinct m.conversacion_id),
         coalesce(sum(m.usd), 0)
  from mensajes m
  where m.creado >= ((now() at time zone 'America/Argentina/Buenos_Aires')::date - (p_dias - 1)) at time zone 'America/Argentina/Buenos_Aires'
  group by 1 order by 1
$$;
