-- Ayuda Pensa con el color nuevo de Pensa: verde Salvia #4A5D52 (antes bordó #6B1A26), en MORFA, Gozza y Tutti.
-- Se corre una vez en Supabase → SQL Editor → New query → pegar → Run.
-- Publica una versión nueva de cada ficha de soporte; la anterior queda en el historial para volver atrás.
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

    c := jsonb_set(f.config, '{chat_web,color}', '"#4A5D52"');

    insert into fichas_historial (ficha_id, version, config, autor, nota)
    values (slug, f.version + 1, c, 'claude', 'Color de Pensa: verde Salvia (script 015)');
    update fichas set config = c, version = f.version + 1, actualizada = now() where id = slug;

    if f.borrador is not null then
      update fichas set borrador = jsonb_set(f.borrador, '{chat_web,color}', '"#4A5D52"') where id = slug;
    end if;

    insert into eventos (ficha_id, tipo, detalle) values (slug, 'publicacion', 'v' || (f.version + 1) || ': color de Pensa, verde Salvia (script 015)');
  end loop;
end
$do$;

-- Para comprobar: las tres tienen que mostrar #4A5D52.
select id, version, config->'chat_web'->>'color' as color
from fichas where id in ('morfa-soporte', 'gozza-soporte', 'tutti-soporte') order by id;
