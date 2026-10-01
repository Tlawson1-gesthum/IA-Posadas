# Paso 2 · Morfi en WhatsApp (número de prueba de Meta)

Al terminar esta guía le escribís a Morfi desde tu WhatsApp y te contesta. Se usa el **número de prueba gratis de Meta**: el chip nuevo queda guardado para producción.

Son tres cuentas: **Supabase** (memoria de las charlas), **Meta** (WhatsApp) y **Vercel** (donde corre el motor). Todo se hace desde la computadora. Lleva alrededor de 40 minutos.

Vas a ir juntando datos. Anotalos en un Bloc de notas **que no compartas con nadie**:

| Dato | De dónde sale |
|---|---|
| `SUPABASE_URL` | Supabase, parte A |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase, parte A |
| `WHATSAPP_TOKEN` | Meta, parte B |
| `META_APP_SECRET` | Meta, parte B |
| `WHATSAPP_VERIFY_TOKEN` | Lo inventás vos (parte C) |
| `ANTHROPIC_API_KEY` | La misma de tu `.env` |

---

## A. Supabase (10 min)

1. Entrá a **https://supabase.com** → **Start your project** → registrate (podés usar GitHub).
2. **New project**:
   - Name: `agencia-motor`
   - Database password: tocá **Generate** y guardala en tu Bloc de notas.
   - Region: **South America (São Paulo)**.
   - **Create new project** y esperá 1 o 2 minutos.
3. Menú de la izquierda → **SQL Editor** → **New query**.
4. Abrí el archivo `motor/supabase/001_esquema.sql` con el Bloc de notas, copiá todo, pegalo en Supabase y tocá **Run**. Tiene que decir `Success. No rows returned`.
5. Menú → **Project Settings** (engranaje) → **Data API** (o **API**):
   - Copiá **Project URL** → es tu `SUPABASE_URL`.
6. Ahí mismo, o en **API Keys**: copiá la clave **service_role** (o **secret**; tocá **Reveal**) → es tu `SUPABASE_SERVICE_ROLE_KEY`.
   - Esta clave abre toda la base: nunca la pegues en un chat ni en el código.

## B. Meta: app de WhatsApp con número de prueba (15 min)

1. Entrá a **https://developers.facebook.com** con tu cuenta de Facebook → **Empezar / Get Started** si es la primera vez (te registra como desarrollador).
2. **Mis apps** → **Crear app**.
   - Caso de uso: **Conectarte con clientes por WhatsApp** (o tipo **Empresa / Business**).
   - Nombre: `Morfi`. Si te pide un portfolio comercial (Business Manager), elegí el de MORFA o creá uno.
3. En la app, entrá a **WhatsApp → Configuración de la API** (API Setup). Ahí vas a ver:
   - Un número **De (From)**: es el número de prueba de Meta.
   - **Token de acceso temporal** → **Generar** y copialo → es tu `WHATSAPP_TOKEN`. **Dura 24 horas** (después te explico cómo hacer uno permanente).
4. En **Para (To)** → **Administrar lista de números** → agregá **tu** número de WhatsApp. Te llega un código por WhatsApp para confirmarlo.
5. Probá el botón **Enviar mensaje**: te tiene que llegar un "Hello World" de Meta. Respondele cualquier cosa ("hola"): eso abre la charla.
6. Menú de la app → **Configuración de la app → Básica** → **Clave secreta de la app** → **Mostrar** → copiala → es tu `META_APP_SECRET`.

## C. Vercel: publicar el motor (10 min)

1. Entrá a **https://vercel.com** → **Sign Up** con GitHub.
2. **Add New… → Project** → buscá **IA-Posadas** → **Import**. Si no aparece, tocá **Adjust GitHub App Permissions** y dale acceso a ese repositorio.
3. En la pantalla de configuración:
   - **Root Directory** → **Edit** → elegí `motor`.
   - Framework Preset: **Other**.
   - Abrí **Environment Variables** y cargá una por una:

     | Name | Value |
     |---|---|
     | `ANTHROPIC_API_KEY` | tu clave de Claude |
     | `SUPABASE_URL` | de la parte A |
     | `SUPABASE_SERVICE_ROLE_KEY` | de la parte A |
     | `WHATSAPP_TOKEN` | de la parte B |
     | `META_APP_SECRET` | de la parte B |
     | `WHATSAPP_VERIFY_TOKEN` | inventá una palabra larga, ej. `morfi-verifica-8472` |
     | `FICHA_POR_DEFECTO` | `morfa` |
     | `ADMIN_TELEFONOS` | tu número como lo manda WhatsApp: `549` + característica sin 0 + número sin 15. Ej: `5493764123456` |

   - **Deploy**.
4. El código del motor está en la rama `claude/pensive-gates-rc4r0l`, no en `main`. Si el deploy dice que no encuentra la carpeta `motor`: **Settings → Environments → Production → Branch Tracking** (o **Settings → Git → Production Branch**) → poné `claude/pensive-gates-rc4r0l` → guardá → **Deployments → Redeploy**.
5. Cuando termine, copiá el dominio del proyecto (algo como `ia-posadas-xxxx.vercel.app`). La dirección del webhook es:
   ```
   https://TU-DOMINIO.vercel.app/api/whatsapp
   ```
6. Probá abrir en el navegador `https://TU-DOMINIO.vercel.app/api/whatsapp`. Tiene que decir **No autorizado**: eso está bien, significa que el motor está vivo.

## D. Conectar Meta con Vercel (5 min)

1. En Meta: **WhatsApp → Configuración** (Configuration) → **Webhook** → **Editar**:
   - **URL de devolución de llamada**: `https://TU-DOMINIO.vercel.app/api/whatsapp`
   - **Token de verificación**: la palabra que inventaste en `WHATSAPP_VERIFY_TOKEN`.
   - **Verificar y guardar**. Si da error, revisá que la palabra sea exactamente la misma.
2. Abajo, en **Campos del webhook** → **messages** → **Suscribirse**.

## E. Probar

Desde tu WhatsApp, escribile **"hola"** al número de prueba de Meta (el mismo que te mandó el Hello World).

- Probá: precios, "llegan a…?", mandar tu ubicación (clip → Ubicación), armar un pedido. El pedido es **simulado** (código `PRUEBA1`): a la cocina no le llega nada.
- Si Morfi deriva a una persona, se queda callado (así funciona). Para seguir probando, escribí **`/reiniciar`**: vuelve a responder, de cero. Solo funciona desde los números de `ADMIN_TELEFONOS`.
- Las charlas quedan guardadas en Supabase → **Table Editor** → `mensajes`. Ahí también ves cuánto costó cada respuesta (`usd`).

## Si no contesta

1. Vercel → tu proyecto → **Logs**: escribile a Morfi y mirá qué aparece. Mandame una captura (tapá cualquier clave).
2. Errores comunes:
   - **401 en los logs** → `META_APP_SECRET` mal copiado.
   - **WhatsApp respondió 401** → el `WHATSAPP_TOKEN` venció (dura 24 h): generá otro en Meta, actualizalo en Vercel (**Settings → Environment Variables**) y hacé **Redeploy**.
   - **Faltan SUPABASE_URL…** → faltan variables en Vercel.
   - **131030 / not in allowed list** → tu número no está en la lista **Para** de Meta (parte B, punto 4).
