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

## Para pasarlo a producción (lo hace el dueño, con esta guía)

1. **Supabase → SQL Editor → New query** → pegar `supabase/011_instagram_gozza.sql` → **Run**. Crea tres tablas nuevas (`instagram_cuentas`, `instagram_comentarios`, `publicaciones`), el depósito público `publicaciones` y la ficha `gozza`. No toca nada de lo que ya existe.
2. **Vercel → ia-posadas → Settings → Environment Variables** (Production). Ya están `INSTAGRAM_APP_SECRET`, `INSTAGRAM_TOKEN_GOZZA` e `INSTAGRAM_VERIFY_TOKEN`. Agregar:
   - `TAREA_TOKEN`: una palabra larga inventada (la usa el monitor que llama a la tarea).
   - `CRON_SECRET`: otra palabra larga (la usa el cron diario de Vercel).
   - `ADMIN_INSTAGRAM` (opcional): el id de Instagram de quien prueba, para poder escribir `/reiniciar`.
3. Unir la rama `instagram-gozza` a `main` y publicar el motor (con OK del dueño).
4. **Meta → Pensa redes → Instagram → API setup with Instagram business login → 2. Configure webhooks → Configure**:
   - Callback URL: `https://ia-posadas.vercel.app/api/instagram`
   - Verify token: el mismo valor que `INSTAGRAM_VERIFY_TOKEN`.
   - **Verify and save**. Después, en la fila de gozzasabores, el interruptor **Suscripción a webhook** → **Sí**.
5. **Monitor cada 5 minutos** (UptimeRobot, como el de la Central): nuevo monitor HTTP(s) a `https://ia-posadas.vercel.app/api/tarea?token=<TAREA_TOKEN>`, cada 5 minutos.
6. Primera prueba real: con la app todavía en **Development**, escribirle a @gozzasabores desde una cuenta que sea tester de la app y aprobar una publicación de prueba. Recién con todo bien, pasar la app a **Live**.
