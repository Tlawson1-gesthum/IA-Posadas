-- Motor de agentes · paso 4: burbuja de chat en la web y herramientas nuevas de MORFA.
-- Se corre una vez en Supabase → SQL Editor → New query → pegar → Run (después de 002_central.sql).

-- Mensajes de la burbuja pública por conexión. La IP no se guarda: solo un resumen irreversible.
create table if not exists accesos_web (
  id bigint generated always as identity primary key,
  ficha_id text not null,
  ip_hash text not null,
  creado timestamptz not null default now()
);
create index if not exists accesos_web_ficha on accesos_web (ficha_id, creado desc);
create index if not exists accesos_web_ip on accesos_web (ficha_id, ip_hash, creado desc);
alter table accesos_web enable row level security;

-- Cambios para MORFA, como BORRADOR (no afectan a nadie hasta que se publiquen desde el panel):
--   · herramientas nuevas: mis_pedidos y confirmar_pedido_efectivo
--   · clave para hablar con semorfa (variable SEMORFA_AGENTE_CLAVE en Vercel)
--   · burbuja de la web, apagada
--   · instrucciones para pedidos sin código, confirmar efectivo y el chat de la web
update fichas set borrador = (
  with base as (select coalesce(borrador, config) as c from fichas where id = 'morfa')
  select jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(c,
    '{herramientas}', '["ver_carta_y_estado","consultar_pedido","mis_pedidos","confirmar_pedido_efectivo","cotizar_pedido","crear_pedido","derivar_a_persona"]'::jsonb),
    '{integracion,clave_env}', '"SEMORFA_AGENTE_CLAVE"'::jsonb),
    '{chat_web}', coalesce(c->'chat_web', '{"activo": false, "color": "#E3261C", "saludo": "¡Hola! Soy Morfi, de MORFA. ¿Qué se te antoja hoy?", "mensajes_por_ip_hora": 20, "mensajes_por_dia": 400}'::jsonb)),
    '{datos,preguntas_frecuentes}', to_jsonb(
      regexp_replace(regexp_replace(c->'datos'->>'preguntas_frecuentes',
        '- ¿Dónde está mi pedido\?[^\n]*',
        '- ¿Dónde está mi pedido? Por WhatsApp usá `mis_pedidos`: busca por el número que te escribe, no hace falta el código. En el chat de la web pedí el código y usá `consultar_pedido`. Si lo pidió por PedidosYa, se consulta en la app de PedidosYa: esos pedidos no se ven acá.'),
        '- Pedido en efectivo hecho en la web esperando confirmación[^\n]*',
        '- Pedido en efectivo esperando confirmación (`esperando_confirmacion_del_local`): si te escribe por WhatsApp y te dice que sí lo quiere, usá `confirmar_pedido_efectivo` y avisale que ya entra a la cocina. Si no, el local le escribe por WhatsApp para confirmarlo antes de cocinar.'))),
    '{datos,como_se_pide}', to_jsonb(
      regexp_replace(c->'datos'->>'como_se_pide',
        '3\. Nombre de quien recibe\.',
        '3. Nombre de quien recibe. Si te escriben desde el chat de la web, pedí también un teléfono de contacto con característica (crear_pedido lo necesita). En el chat de la web, los pedidos en efectivo los confirma el local por WhatsApp antes de cocinar: avisale.')))
  from base
)
where id = 'morfa';
