-- Motor de agentes · saldo de Claude en el tablero.
-- Se corre una vez en Supabase → SQL Editor → New query → pegar → Run.
-- Anthropic no tiene una API que diga el crédito disponible: el panel guarda el saldo que muestra la consola de Claude
-- (como evento "saldo_claude") y le resta lo que gastó el motor desde ese momento, con esta función.
create or replace function gasto_desde(p_desde timestamptz) returns numeric language sql stable as $$
  select coalesce(sum(usd), 0) from mensajes where creado >= p_desde
$$;
