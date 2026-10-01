# Paso 3 · Activar la central y el panel

Son dos cosas, en este orden. **Si se hace al revés, Morfi deja de responder** hasta completar el punto 1.

## 1. Crear las tablas nuevas en Supabase (5 min)

1. Supabase → tu proyecto → **SQL Editor** → **New query**.
2. Pegá todo el contenido de `motor/supabase/002_central.sql` y tocá **Run**.
3. Tiene que decir **Success**. Esto crea las fichas (con MORFA ya cargada), el historial de versiones y los eventos. No toca las charlas que ya existen.

## 2. Clave del panel en Vercel (2 min)

1. Vercel → tu proyecto → **Settings → Environment Variables**.
2. Agregá `PANEL_CLAVE` con una clave larga (mínimo 10 caracteres; ej. tres palabras y un número). No la compartas: abre todo.
3. Avisale a Claude que ya está: sube el código a `main` y Vercel publica solo.

## Usar el panel

Entrá a `https://TU-DOMINIO.vercel.app/panel.html` con la `PANEL_CLAVE`.

- **Tablero:** cada cliente con su semáforo (verde funciona, amarillo tiene charlas esperando a una persona, rojo tiene errores o se quedó sin saldo, gris pausado), costo de IA del mes contra el abono y el margen. Arriba, las alertas.
- **Pausar / Activar:** el agente deja de responder al instante (por ejemplo, por falta de pago).
- **Charlas:** todas las conversaciones. En una derivada podés **responder como persona** (le llega por WhatsApp) y **devolverla al agente**.
- **Ficha:** cambiás lo que sabe y cómo habla. Los cambios quedan en **borrador**: los probás con **Probar borrador** y recién con **Publicar** les llegan a los clientes. Cada publicación queda en el **Historial**, con la opción de volver atrás.
- **Cliente nuevo:** se crea desde la plantilla del rubro, pausado. Completás la ficha, la probás, la publicás y lo activás.
