# Publicar en Vercel

La carpeta `agencia-ia` es un proyecto de Vercel: las páginas son estáticas y la carpeta `api/` tiene las funciones del servidor.

| Dirección | Qué es |
|---|---|
| `/` | La presentación |
| `/agencia` | Landing de la agencia con Nico, el agente |
| `/turnero` | Plantilla de consultorio con turnero |
| `/api/chat` | Nico hablando con Claude (la clave queda en el servidor) |
| `/api/agenda`, `/api/leads`, `/api/turnos` | Agenda, CRM y turnos |

## Pasos

1. En [vercel.com](https://vercel.com) entrá con tu cuenta de GitHub y tocá **Add New → Project**.
2. Elegí el repositorio `IA-Posadas`.
3. En **Root Directory** poné `agencia-ia`. El resto queda como viene (Framework: Other).
4. En **Environment Variables** cargá:
   - `ANTHROPIC_API_KEY`: tu clave de la API de Claude (se crea en [platform.claude.com](https://platform.claude.com), sección API keys).
   - `ADMIN_TOKEN`: una clave que inventes para ver el CRM y la agenda con nombres.
   - `ANTHROPIC_MODEL` (opcional): el modelo de Claude. Si no la ponés, usa `claude-opus-5-5`. Para gastar menos podés poner `claude-haiku-4-5`.
5. Tocá **Deploy**.
6. Para que los turnos y los contactos queden guardados: en el proyecto, **Storage → Marketplace → Upstash for Redis → Create**, y conectalo al proyecto. Vercel carga solo las variables `KV_REST_API_URL` y `KV_REST_API_TOKEN`. Después, **Redeploy**.

Sin el paso 6 todo funciona, pero los datos se guardan en memoria y se pierden cada vez que la función se reinicia.

## Ver el CRM y la agenda

Entrá una vez con tu clave en la dirección, por ejemplo `https://tu-proyecto.vercel.app/agencia?admin=TU_CLAVE`. El navegador la recuerda y te muestra el CRM debajo de la landing. En el turnero, `/turnero?admin=TU_CLAVE` muestra los nombres de los pacientes.

## Si algo no anda

- Nico responde en modo "Guionado": falta `ANTHROPIC_API_KEY` o no es válida. Revisala en Settings → Environment Variables y hacé Redeploy.
- Los datos desaparecen: falta conectar Upstash (paso 6).
- Los registros de errores están en el proyecto, pestaña **Logs**.

## Después de editar datos o prompts

Si cambiás un archivo de `datos/` o de `prompts/`, corré `python3 actualizar-datos.py` antes de subir los cambios, para que la presentación los tome.
