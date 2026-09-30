# Prompt 05 — Plan de marketing a 90 días

## Rol
Sos un equipo de dos especialistas: un Growth Hacker (prospección, anuncios pagos, Google, embudo, ventas, testeo) y un Social Media Strategist (Instagram, TikTok, videos con clones, anuncios con Claude Design). Cada uno resuelve su parte sin duplicar la del otro. Los subagentes "Growth Hacker" y "Social Media Strategist" pueden resolver este prompt si existen en el entorno.

## Entradas
- `[FECHA_INICIO]`: lunes de la semana 1 (ej.: 2026-10-05).
- `[NICHOS]`: hasta 2 nichos (ver datos/nichos.json).
- `[ZONAS]`: Posadas → resto de Misiones → Corrientes y Chaco.
- `[PRESUPUESTO_PAUTA_USD_MES]`: pauta mensual [HIPÓTESIS A VALIDAR].
- `[RESPONSABLES]`: Fundador, Ingeniero, Closer, Agente IA.
- `[HERRAMIENTAS]`: Claude Design, MITO (a probar) [verificar], Fathom, CRM.

## Pasos
1. Dividí 13 semanas en tres etapas geográficas: semanas 1-4 Posadas, 5-9 resto de Misiones, 10-13 Corrientes y Chaco.
2. Growth Hacker: definí acciones de prospección activa (Google Places API oficial, hasta 50/día, con opt-out), Meta Ads, Google, landing/CRM, ventas y testeo.
3. Social Media Strategist: definí acciones de Instagram, TikTok, videos con clones y anuncios con Claude Design.
4. Para cada acción indicá canal, métrica y responsable. Toda meta numérica lleva `[HIPÓTESIS A VALIDAR]`; toda capacidad de herramienta no confirmada lleva `[verificar]`.
5. Incluí una revisión "qué funciona y por qué" cada 2 semanas y un hito de cierre por etapa.
6. Unificá ambas listas, ordená por semana y asigná una fecha a cada fila.
7. Generá el calendario .ics: un evento por fila, hora fija de la mañana, recordatorio previo. No escribas en Google Calendar: el usuario importa el archivo.

## Formato de salida
- `datos/plan-90-dias.json`: `{ "inicio": "...", "filas": [ { "semana", "canal", "accion", "metrica", "responsable", "fecha" } ] }`.
- `datos/calendario-90-dias.ics`: iCalendar (RFC 5545) con `VALARM` en cada evento.

## Criterios de aceptación
- [ ] El JSON valida y todas las filas tienen `semana`, `canal`, `accion`, `metrica`, `responsable` y `fecha`.
- [ ] Las 13 semanas tienen al menos una acción.
- [ ] Hay un hito de cierre en las semanas 4, 9 y 13.
- [ ] Toda meta numérica contiene `[HIPÓTESIS A VALIDAR]`.
- [ ] Ningún dato de mercado o benchmark está presentado como hecho.
- [ ] El .ics tiene `BEGIN:VCALENDAR` y `END:VCALENDAR`, un `VEVENT` por fila y un `VALARM` por evento.
- [ ] El .ics importa en Google Calendar sin errores.
- [ ] Ninguna acción de prospección contempla envíos sin opción de baja.
