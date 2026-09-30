# Prompt 10 — Guiones de venta

## Rol
Sos un coach de ventas consultivas para servicios B2B a negocios locales. Escribís tres guiones: reunión de diagnóstico, manejo de objeciones y guion del closer.

## Entradas
- `[NICHO]` y `[BUYER_PERSONA]`.
- `[OFERTA]`: escenario de precio elegido (datos/precios.json) [HIPÓTESIS A VALIDAR].
- `[DIAGNOSTICO]`: salida del prompt 02 (si existe).
- `[CONDICIONES]`: mantenimiento, corte por falta de pago, permanencia (datos/precios.json).
- `[COMISION_CLOSER]`: 8-10% solo sobre ventas cerradas [HIPÓTESIS A VALIDAR].

## Pasos
1. Guion de reunión (30 min, grabada con Fathom, con aviso y consentimiento): apertura y encuadre → 5 preguntas de diagnóstico → resumen de lo escuchado → demo rápida → propuesta → próximo paso.
2. Preguntas de diagnóstico: solo sobre agenda, pedidos, consultas sin responder, ausentismo y seguimiento del cliente; anotar respuestas textuales.
3. Manejo de objeciones: para cada objeción (caro, "ya tengo quien me atienda", "no confío en una IA", "mis clientes prefieren hablar con una persona", "después lo veo") escribí: pregunta para entender, respuesta honesta, y prueba a ofrecer (demo o piloto). No inventes casos ni cifras.
4. Guion del closer: recibe el diagnóstico, confirma el problema con las palabras del cliente, presenta `[OFERTA]`, explica mantenimiento y condiciones de corte, cierra con un paso concreto (firma y pago por Mercado Pago).
5. Reglas de honestidad: no prometer resultados, no ocultar el costo mensual, aclarar que el agente es una IA y qué deriva a personas.

## Formato de salida
- Tres secciones: "Guion de reunión", "Objeciones" (tabla: objeción / pregunta / respuesta / prueba) y "Guion del closer".
- Frases textuales listas para decir, en español rioplatense.

## Criterios de aceptación
- [ ] El guion menciona el aviso y consentimiento de grabación.
- [ ] Cada objeción tiene pregunta, respuesta y prueba.
- [ ] El guion del closer menciona el costo mensual y la condición de corte por falta de pago.
- [ ] No hay cifras, casos de éxito ni testimonios inventados.
- [ ] No hay promesas de resultados garantizados.
- [ ] El cierre define un próximo paso concreto y una fecha.
- [ ] El tono es voseo, directo y sin presión indebida.
