# CRM Pensa — traspaso a sesión local

Estado al 6 de octubre de 2026. Todo el código está en `crm-pensa/` dentro del repo
`Tlawson1-gesthum/IA-Posadas`, rama `claude/confident-cray-i1nms6`.

## Decisiones tomadas
- Nombre: **CRM Pensa**. Producto separado, con marca propia.
- Precio: **US$39 por mes por negocio**, fijo. Argumento: Zoho cobra US$14 por usuario y sin agente de WhatsApp; 3 usuarios ya son US$42.
- Arrancar ya, en un **repo nuevo `CRM-Pensa`** (todavía no existe; la sesión en la nube no tenía permiso para crearlo).
- **Supabase**: proyecto nuevo, aparte de los que ya existen.
- Pasti vive **dentro** del CRM. n8n solo para trabajo interno de la agencia (su licencia no permite ofrecerlo a clientes).
- Plan completo, con la comparación de HubSpot y Zoho: https://claude.ai/code/artifact/2eb97774-35bb-4e7d-9d31-761f640f911c (pestaña "Plan del CRM agentizado").

## Qué hay hecho
- API en TypeScript + Express: `/health`, `/api/contacts` (listar, crear, editar), `/api/messages` (historial y alta; el alta llama a Pasti).
- Login: verifica el token de Supabase Auth y cada consulta corre con el token del usuario, así la seguridad por organización (RLS) se aplica sola.
- Pasti (`src/agents/pasti.ts`): clasifica intención (consulta, pedido, queja, seguimiento), puntaje 0–100 y acción sugerida. Si la respuesta no se entiende, deriva a una persona.
- Base de datos (`supabase/migrations/001_initial_schema.sql`): organizations, users, contacts, messages, stages, workflows, todas con RLS por organización.
- Webhooks de WhatsApp, Instagram, TikTok y email: **solo esqueleto**, todavía no procesan nada.
- Verificado: `npm run typecheck` y `npm test` (3 tests de Pasti) en verde. **No se probó contra un Supabase ni con la API de Claude reales.**

## Qué sigue (en orden)
Ver `PLAN-NOCHE.md`. Resumen:
1. Webhook de WhatsApp completo: verificar firma, buscar o crear contacto por número, guardar mensaje, clasificar con Pasti. Tabla `channels` para saber a qué organización pertenece cada número.
2. Email entrante por la misma ruta común.
3. Bandeja unificada `GET /api/inbox`.
4. Reglas de etapa: no pasar a Propuesta sin diagnóstico ni a Cliente sin primer pago.
5. Exportar contactos a CSV.
6. Instagram y TikTok: adaptadores listos; necesitan apps aprobadas por Meta y TikTok (lleva días).
Después: panel web, onboarding de clientes, cobro de los US$39.

## Para arrancar en tu compu
1. Crear el repo vacío `CRM-Pensa` en GitHub (privado).
2. Traer el código y pasarlo al repo nuevo:
   ```bash
   git clone -b claude/confident-cray-i1nms6 https://github.com/Tlawson1-gesthum/IA-Posadas.git
   mkdir CRM-Pensa && cp -r IA-Posadas/crm-pensa/. CRM-Pensa/
   cd CRM-Pensa && git init -b main && git add . && git commit -m "Initial import"
   git remote add origin https://github.com/Tlawson1-gesthum/CRM-Pensa.git && git push -u origin main
   npm install && npm test
   ```
3. Supabase: crear proyecto "crm-pensa" en supabase.com → Settings → API → copiar URL, anon key y service_role key.
   Correr la migración: pegar `supabase/migrations/001_initial_schema.sql` en el SQL Editor, o usar la CLI de Supabase.
4. Clave de Claude: console.anthropic.com → API Keys.
5. `cp .env.example .env` y completar los valores. **El `.env` no se sube a GitHub** (ya está en `.gitignore`).
6. `npm run dev` → http://localhost:3000/health

## Mensaje para pegar en la sesión nueva
> Estoy armando CRM Pensa, un CRM con un agente de IA (Pasti) que atiende WhatsApp, Instagram, TikTok y email desde una sola bandeja. Leé TRASPASO.md y PLAN-NOCHE.md en este repo y seguí con el primer ítem pendiente del plan. Cada ítem con tests, `npm run typecheck && npm test` en verde y un commit.
