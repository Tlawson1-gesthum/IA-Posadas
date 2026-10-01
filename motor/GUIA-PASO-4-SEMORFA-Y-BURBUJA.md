# Paso 4 · Morfi conectado a la web de MORFA y burbuja de chat

Qué suma:
- Los pedidos que toma Morfi entran a la cocina con la etiqueta **"Lo tomó Morfi"**. Los de WhatsApp en efectivo entran **ya confirmados**.
- Por WhatsApp, "¿dónde está mi pedido?" funciona **sin código** (busca por el número que escribe) y Morfi puede **confirmar** un pedido en efectivo hecho en la web.
- **Burbuja de chat** en semorfa.com.ar, que se prende y apaga desde el panel.

Hacelo en este orden.

## 1. Base de datos (2 min)
Supabase → **SQL Editor** → **New query** → pegá `motor/supabase/003_paso4.sql` → **Run**.
Crea la tabla para los límites de la burbuja y deja los cambios de MORFA como **borrador** (todavía no afectan a nadie).

## 2. Una clave para que Morfi hable con la web (5 min)
1. Inventá una clave larga (40 letras y números). En PowerShell podés generarla con:
   ```
   -join ((48..57)+(65..90)+(97..122) | Get-Random -Count 40 | % {[char]$_})
   ```
2. **Cloudflare** → Workers & Pages → **semorfa** → Settings → **Variables and Secrets** → **Add** → tipo **Secret**, nombre `AGENTE_CLAVE`, valor: la clave. Hacelo en **Production** y también en **Preview**.
3. **Vercel** → ia-posadas → Settings → **Environment Variables** → `SEMORFA_AGENTE_CLAVE` = la misma clave.

## 3. Publicar la web de MORFA, primero en prueba (10 min)
En PowerShell:
```
cd C:\Users\HP\Proyectos\semorfa
git pull origin claude/pensive-gates-rc4r0l
npm install
npm run build
npx wrangler pages deploy dist --project-name semorfa --branch prueba
```
Eso publica en `https://prueba.semorfa.pages.dev` (base de prueba, siempre abierta, Mercado Pago de prueba).

## 4. Probar Morfi contra la web de prueba
En el panel → MORFA → **Ficha**:
1. Integración → Dirección: `https://prueba.semorfa.pages.dev` y tildá **Crear pedidos de verdad**.
2. **Guardar borrador** → **Probar borrador**: hacé un pedido completo (en efectivo) y preguntá "¿dónde está mi pedido?".
3. Entrá a `https://prueba.semorfa.pages.dev/#/cocina`: el pedido tiene que aparecer con la etiqueta **"Lo tomó Morfi"**.

## 5. Publicar la web de MORFA de verdad
```
npx wrangler pages deploy dist --project-name semorfa --branch main --commit-dirty=true
```

## 6. Encender
En el panel → MORFA → **Ficha**:
1. Integración → Dirección: `https://semorfa.com.ar` (de nuevo la real) y **Crear pedidos de verdad** tildado.
2. **Chat en la web**: tildá **Mostrar la burbuja**.
3. **Guardar borrador** → **Probar borrador** una última vez → **Publicar**.

La burbuja aparece en semorfa.com.ar en menos de un minuto. Para apagarla: destildar y publicar.
