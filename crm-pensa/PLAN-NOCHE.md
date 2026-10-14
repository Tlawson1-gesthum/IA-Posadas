# Trabajo nocturno — CRM Pensa

Cada bloque: código + tests, `npm run typecheck && npm test` en verde, commit y push a `claude/confident-cray-i1nms6`.

- [ ] 1. Webhook de WhatsApp: verificar firma (X-Hub-Signature-256), buscar o crear el contacto por número, guardar el mensaje, clasificar con Pasti, guardar intención y puntaje. Mapear número de WhatsApp → organización con una tabla `channels`.
- [ ] 2. Email entrante (formato genérico de webhook, p. ej. Postmark/Resend inbound) con la misma ruta común que WhatsApp.
- [ ] 3. Bandeja unificada: `GET /api/inbox` — últimas conversaciones de todos los canales, ordenadas por último mensaje.
- [ ] 4. Reglas de etapa (Blueprint): no pasar a Propuesta sin diagnóstico ni a Cliente sin primer pago.
- [ ] 5. Exportar contactos a CSV.
- [ ] 6. Instagram y TikTok: dejar el adaptador listo; requieren apps aprobadas por Meta/TikTok (lo hace Tomás).

Bloqueado hasta que Tomás lo cargue: proyecto Supabase, ANTHROPIC_API_KEY, cuenta de WhatsApp Cloud API. Todo se prueba con dobles (mocks) mientras tanto.
