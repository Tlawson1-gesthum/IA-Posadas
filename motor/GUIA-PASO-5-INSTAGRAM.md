# Paso 5 · Instagram de Gozza (mensajes, comentarios y cola de publicaciones)

El motor ya sabe atender Instagram. Esta guía es lo que falta para que ande con @gozzasabores de verdad. **Nada de esto se hace sin el OK del dueño**: cambia el motor en producción (el mismo que atiende a Morfi y a la Ayuda Pensa).

## Qué hace

| Parte | Archivo | Qué hace |
|---|---|---|
| Mensajes directos | `api/instagram.ts`, `src/atenderInstagram.ts` | Verifica la firma de Meta (`INSTAGRAM_APP_SECRET`), responde con la ficha `gozza` (plantilla `instagram-gastronomia`), dice que es automático, manda el link de la tienda con UTM y pasa a una persona reclamos, alérgenos, empresas, plata o cualquier duda (con aviso al equipo). Respeta la ventana de 24 h: después solo guarda. |
| Comentarios | `src/comentarios.ts` | Solo responde los que tienen una palabra de las reglas de la ficha (VIANDAS, EMPRESA), con **un** mensaje privado de texto fijo (sin IA), hasta 7 días después. Nunca responde en público. Los demás quedan para que los mire una persona. Funciona con el aviso de Meta (si la app tiene acceso avanzado) o leyendo los comentarios en cada tarea (sin revisión de la app). |
| Cola | `src/cola.ts`, `scripts/cola.ts` | Solo publica lo **aprobado**, a su hora (hasta 2 h tarde; después queda "vencida"). Las piezas hechas con IA no salen solas mientras `etiqueta_ia_api` sea false: a la hora avisa para subirlas a mano con la etiqueta. Anota el link de cada publicación o el error. Nunca publica dos veces. |
| Tarea periódica | `api/tarea.ts` | Corre la cola, revisa comentarios y renueva el token (cada 7 días; vence a los 60). |
| Avisos | `src/avisos.ts` | Siempre en las alertas del panel del motor. Además por mail si están `RESEND_API_KEY`, `AVISOS_DESDE` y `AVISOS_MAIL_GOZZA`. |

## Probar en la compu

```bash
npm run instagram-local
```
Todo simulado (Meta, Supabase y Claude): 38 controles. Con `-- --con-ia` el cerebro usa Claude de verdad.

```bash
npm run probar -- gozza
```
Las 12 conversaciones de ejemplo de `pruebas/gozza.json` con Claude de verdad (unos US$ 0,15) y la carta en vivo de gozza.com.ar.

## Ventas de viandas por mensaje directo (desde el 19/10/2026)

- `ver_viandas`: menús, packs y precios **en vivo** desde `/api/menu` de gozza.com.ar (si cambian los precios en el panel, el agente dice los nuevos en menos de un minuto). `integracion.viandas_precios: true`.
- `envio_viandas`: envío solo a Centro, Villa Blosset, Villa Sarita y El Palomar, a $2.800 por envío (`integracion.viandas_envio`; ese precio está en la ficha, no en la web: si cambia, cambiarlo ahí). Los límites de los barrios son los de OpenStreetMap (`src/zonas/posadas.ts`).
- `comprar_pack`: arma la compra con `POST /api/viandas` (igual que la tienda) y manda el link de Mercado Pago. No carga un envío fuera de zona. Con `crear_pedidos: true` la compra es real; `npm run probar` siempre la simula.
- La web frena más de 6 compras de packs en media hora desde la misma conexión: si un día se vende mucho por Instagram, puede trabarse.

## Pasarlo a producción

El motor ya está publicado (main = 94c2947, 19/10/2026). Falta lo del dueño:

1. **Supabase** → proyecto de IA-Posadas → **SQL Editor** → **New query** → pegar todo `supabase/011_instagram_gozza.sql` → **Run** ("Success. No rows returned"). Crea tres tablas nuevas, el depósito `publicaciones` y la ficha `gozza`. No toca nada de lo que ya existe.
2. **Vercel** → **ia-posadas** → **Settings** → **Environment Variables** (Production). Ya están `INSTAGRAM_APP_SECRET`, `INSTAGRAM_TOKEN_GOZZA` e `INSTAGRAM_VERIFY_TOKEN`. Agregar `TAREA_TOKEN` y `CRON_SECRET` (dos palabras largas distintas, inventadas). Si no se recuerda `INSTAGRAM_VERIFY_TOKEN` (Vercel no lo muestra), ponerle uno nuevo. Después **Deployments** → **⋯** del primero → **Redeploy**.
3. **Meta** → **Pensa redes** → **Panel** → **Personalizar caso de uso: Administrar mensajes y contenido en Instagram** → pantalla "Te damos la bienvenida a la API de Instagram" → paso de **webhooks** [sin verificar el nombre exacto en castellano; en inglés "Configure webhooks"]: URL `https://ia-posadas.vercel.app/api/instagram`, token = `INSTAGRAM_VERIFY_TOKEN`, **Verificar y guardar**. En la fila de gozzasabores, **Suscripción a webhook** → **Sí**.
4. **UptimeRobot** → **New monitor** → HTTP(s) → `https://ia-posadas.vercel.app/api/tarea?token=<TAREA_TOKEN>` → cada 5 minutos.
5. Primera prueba real con la app en **Development**: desde una cuenta de Instagram con rol en la app (no @gozzasabores), mandar un mensaje directo y comentar VIANDAS en una publicación. Después: publicación de prueba con la cola y pasar la app a **Live**.

Los avisos (reclamos, empresas, comentarios para revisar) quedan en las alertas del panel del motor; por mail, cuando estén `RESEND_API_KEY`, `AVISOS_DESDE` y `AVISOS_MAIL_GOZZA`. Una charla derivada se contesta desde la app de Instagram: el agente queda callado en esa charla hasta que se la libere desde el panel.
