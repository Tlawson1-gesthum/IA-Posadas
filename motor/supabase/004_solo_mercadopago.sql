-- Motor de agentes · los pedidos que toma Morfi se pagan solo con Mercado Pago.
-- Se corre una vez en Supabase → SQL Editor → New query → pegar → Run (después de 003_paso4.sql).
-- Deja los cambios como BORRADOR de MORFA: se prueban con "Probar borrador" y se publican desde el panel.
--   · traba en el código: integracion.pagos_agente = ["mercadopago"]
--   · "Cómo se pide" nuevo: efectivo → la web o una persona; transferencia → una persona
--   · datos fijos (pagos) y casos de derivación actualizados
update fichas set borrador = (
  with base as (select coalesce(borrador, config) as c from fichas where id = 'morfa')
  select jsonb_set(jsonb_set(jsonb_set(jsonb_set(c,
    '{integracion,pagos_agente}', '["mercadopago"]'::jsonb),
    '{datos,como_se_pide}', to_jsonb($t$Hay dos formas. Ofrecé las dos y respetá lo que elija la persona:
A) En la web https://semorfa.com.ar: arma el carrito, marca la dirección en el mapa y paga con Mercado Pago o en efectivo al recibir. Sigue el pedido en vivo con el código que le da la web. No hace falta cuenta.
B) Por acá, con vos. Por acá se paga solo con Mercado Pago (tarjeta, dinero en cuenta, etc.), con un link. Pasos, de a uno por mensaje:
1. Qué quiere: anotá productos, cantidades y adicionales con los ids de `ver_carta_y_estado`. Si pide sánguche o mila, ofrecé una vez sumarle papas.
2. Dónde: pedí que comparta la ubicación (en WhatsApp: el clip o el + → Ubicación → Enviar mi ubicación actual; en el chat de la web, el botón 📍) y, aparte, calle y número y una referencia (piso, depto, color de la casa). Si no puede mandar la ubicación, derivá con motivo pedido_sin_ubicacion y el pedido armado en el resumen.
3. Nombre de quien recibe. Si te escriben desde el chat de la web, pedí también un teléfono de contacto con característica (crear_pedido lo necesita).
4. Pago: avisá que por acá es con Mercado Pago y que le pasás el link. Si quiere pagar en efectivo, ofrecé dos caminos: pedirlo en la web (ahí puede elegir efectivo al recibir) o pasarlo con alguien del equipo (derivá con motivo efectivo y el pedido armado en el resumen). Si quiere transferencia, derivá con motivo transferencia y el pedido armado en el resumen.
5. Con todo eso, usá `cotizar_pedido` y mostrale el resumen: cada producto, envío, *total*, dirección y que se paga con Mercado Pago. Preguntá: "¿Lo confirmo?".
6. Si confirma, usá `crear_pedido` con pago mercadopago. Pasale el código y el link para pagar, y aclarale que el pedido entra a la cocina cuando se aprueba el pago.
Si el local está cerrado, se puede charlar y armar el pedido, pero no crearlo: decí cuándo abre con `estado.motivo`.
Si `cotizar_pedido` da fuera de zona o algún producto no hay, decíselo y ofrecé alternativas de la carta.$t$::text)),
    '{datos,datos_fijos}', to_jsonb(regexp_replace(c->'datos'->>'datos_fijos', '- Pagos:[^\n]*', $t$- Pagos: en la web, Mercado Pago (tarjeta, dinero en cuenta, etc.) o efectivo al recibir (si `efectivo` es true). Los pedidos que tomás vos se pagan solo con Mercado Pago. Transferencia: solo con el encargado.$t$))),
    '{datos,casos_derivacion}', to_jsonb(regexp_replace(c->'datos'->>'casos_derivacion', '- Pago por transferencia \(con el pedido armado\)\.', $t$- Quiere pagar en efectivo o con transferencia un pedido que arma con vos (con el pedido armado).$t$)))
  from base
)
where id = 'morfa';
