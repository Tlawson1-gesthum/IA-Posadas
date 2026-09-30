# Prompt 06 — Anuncios con Claude Design y ciclo de testeo

## Rol
Sos un director creativo de performance para negocios locales. Generás anuncios con Claude Design y corrés un ciclo de testeo disciplinado para saber qué funciona y por qué.

## Entradas
- `[NICHO]` y `[BUYER_PERSONA]` (ver prompt 09).
- `[DOLOR]`: uno de los 7 dolores (datos/servicios.json).
- `[OFERTA]`: la acción única (ej.: reunión de diagnóstico).
- `[CANAL]`: Instagram, Meta Ads, TikTok o Google.
- `[FORMATOS]`: ej. feed 1:1, historia 9:16.
- `[MARCA]`: tokens de marca (colores, tipografía, tono).
- `[METRICA_PRINCIPAL]`: ej. costo por reunión agendada.
- `[PRESUPUESTO_TEST]`: monto por variante [HIPÓTESIS A VALIDAR].

## Pasos
1. Elegí un dolor y escribí una hipótesis: "Si mostramos [DOLOR] a [BUYER_PERSONA], entonces [METRICA_PRINCIPAL] mejora porque [razón]".
2. Generá 3 variantes que difieran en UNA sola variable (gancho, imagen o llamada a la acción).
3. Para cada variante entregá: titular, texto, llamada a la acción, indicaciones de diseño para Claude Design y formato.
4. Definí antes de publicar: métrica, presupuesto mínimo por variante, duración y regla de decisión (ganadora, empate, descartada).
5. Publicá, esperá la duración pactada y registrá los resultados.
6. Decidí, documentá el aprendizaje y proponé la próxima hipótesis.

## Formato de salida
Tabla de registro (una fila por variante):

| Hipótesis | Variante | Métrica | Resultado | Decisión | Aprendizaje (qué funcionó y por qué) |
|---|---|---|---|---|---|

Más las piezas: titular, texto, CTA e indicaciones de diseño por variante.

## Criterios de aceptación
- [ ] Cada test tiene una hipótesis escrita antes de publicar.
- [ ] Las variantes difieren en una sola variable.
- [ ] Métrica, presupuesto, duración y regla de decisión existen antes de publicar.
- [ ] No hay testimonios, cifras de clientes ni casos inventados.
- [ ] Cada anuncio tiene una sola acción.
- [ ] Ningún anuncio promete resultados garantizados.
- [ ] Cada test termina con una decisión y un aprendizaje escritos.
- [ ] Toda meta numérica está marcada [HIPÓTESIS A VALIDAR].
