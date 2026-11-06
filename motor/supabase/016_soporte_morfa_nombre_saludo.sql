-- Ayuda Pensa en MORFA con el mismo nombre y saludo que Gozza y Tutti. Reemplaza al script 010: no toca el color (el 010 volvería al bordó).
-- Se corre una vez en Supabase → SQL Editor → New query → pegar → Run.
-- Publica una versión nueva de la ficha "morfa-soporte"; la anterior queda en el historial para volver atrás.
do $do$
declare
  f fichas%rowtype;
  c jsonb;
begin
  select * into f from fichas where id = 'morfa-soporte' for update;
  if not found then raise exception 'No existe la ficha morfa-soporte'; end if;

  c := jsonb_set(f.config, '{datos,nombre_agente}', '"Ayuda Pensa"');
  c := jsonb_set(c, '{chat_web,saludo}', '"Hola, soy el asistente de Pensa. ¿En qué parte del sistema te ayudo?"');

  insert into fichas_historial (ficha_id, version, config, autor, nota)
  values ('morfa-soporte', f.version + 1, c, 'claude', 'Nombre y saludo de Pensa (script 016)');
  update fichas set config = c, version = f.version + 1, actualizada = now() where id = 'morfa-soporte';

  if f.borrador is not null then
    update fichas set borrador = jsonb_set(jsonb_set(f.borrador,
      '{datos,nombre_agente}', '"Ayuda Pensa"'),
      '{chat_web,saludo}', '"Hola, soy el asistente de Pensa. ¿En qué parte del sistema te ayudo?"')
    where id = 'morfa-soporte';
  end if;

  insert into eventos (ficha_id, tipo, detalle) values ('morfa-soporte', 'publicacion', 'v' || (f.version + 1) || ': nombre y saludo de Pensa (script 016)');
end
$do$;

-- Para comprobar: tiene que mostrar Ayuda Pensa, el color #4A5D52 y el saludo nuevo.
select version, config->'datos'->>'nombre_agente' as nombre, config->'chat_web'->>'color' as color, config->'chat_web'->>'saludo' as saludo
from fichas where id = 'morfa-soporte';
