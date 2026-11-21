# CRM Pensa

> Vive temporalmente en `crm-pensa/` dentro de IA-Posadas hasta que se cree el repo propio `CRM-Pensa`.

CRM agentizado con IA para pymes. Multi-canal (WhatsApp, Instagram, TikTok, email) en una bandeja unificada.

## Features

- 🤖 **Pasti integrado**: Clasificación y respuestas automáticas con Claude AI
- 📱 **Multi-canal**: WhatsApp, Instagram, TikTok, Email en una bandeja
- 🏢 **Multi-tenant**: Cada cliente en su propio espacio seguro (Supabase RLS)
- 📊 **Pipeline**: Lead → Propuesta → Cliente con etapas configurables
- 🔄 **Workflows**: Reglas automáticas (Blueprint, CommandCenter)
- 💰 **Pricing**: $39/mes por cliente

## Tech Stack

- **Backend**: TypeScript, Node.js, Express
- **Database**: Supabase (PostgreSQL con Row-Level Security)
- **AI**: Claude API (Haiku para rutinas, Sonnet para análisis)
- **Messaging**: WhatsApp Cloud API, Instagram Graph API, TikTok DM, SMTP

## Setup

1. Clone el repo y instala dependencias:
   ```bash
   npm install
   ```

2. Configura variables de entorno (copia .env.example):
   ```bash
   cp .env.example .env
   ```

3. Configura Supabase:
   - Crea un proyecto nuevo en supabase.com
   - Copia la URL y anon key a .env
   - Ejecuta migraciones: `npm run db:migrate`

4. Configura Claude API:
   - Ve a console.anthropic.com
   - Copia tu API key a ANTHROPIC_API_KEY en .env

5. Ejecuta en desarrollo:
   ```bash
   npm run dev
   ```

## MVP Roadmap (3 semanas)

**Semana 1-2:**
- ✅ Fichas de contactos (CRUD)
- ✅ Etapas (Lead → Propuesta → Cliente)
- ✅ Central de mensajes básica (recibir WhatsApp + email)
- ✅ Pasti clasificando intención y scoring

**Semana 3:**
- ✅ Instagram + TikTok integrados
- ✅ Workflows básicos (Blueprint)
- ✅ Dashboard simple
- ✅ Exportar contactos (CSV)
- Listo para vender a primeros clientes

**Fase 3 (después):**
- Kiosk Studio (guion de diagnóstico)
- Canvas (vistas personalizables)
- Reportería avanzada
- Marketplace de templates

## API Endpoints

```
GET    /health                    - Health check
GET    /api/contacts              - List contacts
POST   /api/contacts              - Create contact
PATCH  /api/contacts/:id          - Update contact
GET    /api/messages/:contactId   - Get chat history
POST   /api/messages              - New message (triggers Pasti)
POST   /webhooks/whatsapp         - WhatsApp events
POST   /webhooks/instagram        - Instagram events
POST   /webhooks/tiktok           - TikTok events
POST   /webhooks/email            - Email events
```

## Authors

Created with Claude Code - https://claude.ai/code
