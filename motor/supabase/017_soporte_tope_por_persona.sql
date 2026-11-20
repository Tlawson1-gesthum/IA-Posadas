-- Ayuda Pensa: tope de gasto por persona y por día de US$ 0,50 a US$ 2 en morfa-soporte, gozza-soporte y tutti-soporte.
-- Con el manual completo cada respuesta cuesta entre US$ 0,05 y 0,20: con 0,50 una persona quedaba sin ayuda a la tercera
-- o cuarta pregunta del día ("Recibimos muchos mensajes"). El tope del mes (US$ 15 por local) no cambia.
-- Se corre una vez en Supabase → SQL Editor → New query → pegar → Run. La versión anterior queda en el historial.
do $do$
declare
  f fichas%rowtype;
  c jsonb;
  slug text;
begin
  foreach slug in array array['morfa-soporte', 'gozza-soporte', 'tutti-soporte'] loop
    select * into f from fichas where id = slug for update;
    if not found then
      raise notice 'No existe la ficha %: se saltea', slug;
      continue;
    end if;

    c := jsonb_set(f.config, '{limites,usd_por_persona_dia}', '2');

    insert into fichas_historial (ficha_id, version, config, autor, nota)
    values (slug, f.version + 1, c, 'claude', 'Tope por persona y día: US$ 2 (script 017)');
    update fichas set config = c, version = f.version + 1, actualizada = now() where id = slug;

    if f.borrador is not null then
      update fichas set borrador = jsonb_set(f.borrador, '{limites,usd_por_persona_dia}', '2') where id = slug;
    end if;

    insert into eventos (ficha_id, tipo, detalle) values (slug, 'publicacion', 'v' || (f.version + 1) || ': tope por persona y día US$ 2 (script 017)');
  end loop;
end
$do$;

-- Para comprobar: las tres tienen que mostrar 2.
select id, version, config->'limites'->>'usd_por_persona_dia' as usd_por_persona_dia
from fichas where id in ('morfa-soporte', 'gozza-soporte', 'tutti-soporte') order by id;
