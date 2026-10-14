# Agente de obra: guía del demo

El capataz o el jefe de obra manda el parte del día por audio de WhatsApp. El agente lo transcribe, lo pasa a datos, lo controla contra el presupuesto y los remitos, y le devuelve un informe para confirmar. El dueño ve todo en un tablero.

```
audio del capataz ─► transcripción ─► Claude arma el parte ─► registrar_parte (el código controla)
                                                                   │
                     informe por WhatsApp ◄────────────────────────┤
                     tablero del dueño (obra.html) ◄───────────────┘
```

## Qué controla

Las partidas que mueven la aguja: **piedra, arena, asfalto, cemento, gasoil y fletes**. Todas se configuran en la ficha (`obra`).

| Control | Cómo se calcula | Qué detecta |
|---|---|---|
| Gasoil por equipo | Litros cargados contra horas × litros/hora del equipo (o el horómetro) | Gasoil que sobra, horas que no coinciden con el horómetro |
| Remito repetido | Mismo número de remito y material ya cargado antes | El mismo viaje pagado dos veces |
| Carga incompleta | Lo que dice el remito contra lo que llegó (balanza o estimación en obra) | Camiones que descargan menos |
| Sin remito | Material que entra sin número de remito | Viajes sin papel |
| Consumo | Lo que la obra dice que usó contra lo que pide el avance (análisis de precios) | Desperdicio o material que se va |
| Stock | Lo que debería haber (inicial + recibido − consumo por avance) contra lo que se cuenta | Faltantes de cemento, gasoil del tanque, etc. |

Cada alerta trae la **plata en juego** con los precios de referencia de la ficha. El agente habla de *diferencias a revisar*, nunca de robo.

Además, el avance acumulado por tarea por el precio unitario da lo **certificable del período**. Es la base del módulo de certificaciones y redeterminaciones.

Los números los calcula el código (`src/obra/control.ts`), no el modelo. El modelo solo pasa a datos lo que dijo el capataz.

## Probarlo en la compu

```bash
cd motor
npm install
npm run obra          # sin Claude: carga la semana de ejemplo, simula un parte y verifica los controles
npm run local         # chat y tablero en http://localhost:3000
```

- Tablero: http://localhost:3000/obra.html?ficha=obra-demo. Tocá **"Cargar semana de ejemplo"** abajo de todo.
- Chat (con 🎤 para grabar): http://localhost:3000/?ficha=obra-demo. Necesita `ANTHROPIC_API_KEY` en `.env`, y para el micrófono también `TRANSCRIPCION_CLAVE`.
- Conversaciones de prueba con Claude: `npm run probar -- obra-demo` (cuesta centavos).

## Ponerlo en línea (Vercel + Supabase)

1. En Supabase → SQL Editor, correr `supabase/008_obra.sql` (tabla de partes) y `supabase/009_ficha_obra_demo.sql` (ficha de demo).
2. En Vercel, sumar las variables de la transcripción de audios:
   - **OpenAI:** `TRANSCRIPCION_CLAVE` = clave de OpenAI. Modelo por defecto `whisper-1`.
   - **Groq (más barato y rápido):** `TRANSCRIPCION_CLAVE` = clave de Groq, `TRANSCRIPCION_URL` = `https://api.groq.com/openai/v1/audio/transcriptions`, `TRANSCRIPCION_MODELO` = `whisper-large-v3-turbo`.
   - Claude no recibe audio: por eso la transcripción va con otro servicio. Cuesta centavos por audio.
3. Deploy. El tablero queda en `https://<tu-dominio>/obra.html?ficha=obra-demo`. Pide la clave del chat de prueba (`CHAT_CLAVE`) o entra con la sesión del panel.
4. Para WhatsApp: en el panel, ficha `obra-demo` → "Phone number ID de Meta" con un número de prueba (ver [GUIA-PASO-2-WHATSAPP.md](GUIA-PASO-2-WHATSAPP.md)). Las notas de voz se transcriben solas porque la ficha tiene `"audios": true`.

## Guion para la reunión (5 minutos)

1. **Tablero con la semana de ejemplo.** Arriba, la plata en juego. Abajo, las 5 alertas:
   - gasoil de más en la motoniveladora;
   - un remito repetido;
   - un camión que llegó con 4 tn menos;
   - cemento que falta en el conteo;
   - un viaje de arena sin remito.

   Pregunta para el dueño: *"¿Hoy te enterás de esto? ¿Cuándo?"*
2. **Audio en vivo.** Desde tu celular, grabá un audio como si fueras el capataz:

   > "Buen día, parte de hoy de Los Lapachos, habla Ramón. Somos catorce. Hicimos ochocientos cincuenta metros de carpeta. Llegaron tres camiones de piedra de Cantera Santa Ana, remitos 4588, 4589 y 4590, treinta toneladas cada uno, pero el último vino flojo, calculo que trajo veinticinco. Gasoil: la motoniveladora cargó ciento cincuenta litros, ocho horas; el rodillo ochenta litros, ocho horas. Hacen falta dos toneladas de cemento para el jueves."

   En segundos llega el informe con *Urgente: faltan 5 tn de piedra* y *Revisar: el rodillo cargó 11% de más*. Respondé "ok".
3. **Volvé al tablero.** El parte de hoy ya está (se actualiza solo cada 30 segundos).
4. **Cerrá con certificación.** Mostrá la tabla "Avance y certificación": *"Esto mismo, con tus precios y tu cómputo, es el borrador del certificado del mes. Lo próximo es la redeterminación."*

## Para una constructora real

Se crea otra ficha con su información (copiar el campo `obra` de `fichas/obra-demo.json`):

- **Tareas:** las del cómputo del contrato, con cantidad y precio unitario.
- **Consumos por tarea:** los del análisis de precios (cuánto de cada material lleva cada m², m³ o ml).
- **Equipos:** los litros/hora reales de cada uno (fabricante o histórico).
- **Camiones:** patentes y precio por viaje de los fletes.
- **Precios de referencia:** los de la última compra.
- **Stock inicial:** el de cada obra el día que se empieza a controlar.
- **Tolerancias:** cuánto desvío se acepta antes de avisar.

## Lo que falta (próximos pasos)

- **Foto del remito:** que el agente lea número, cantidad y patente de la foto y la guarde como respaldo.
- **Aviso al dueño:** mandarle las alertas rojas por WhatsApp en el momento (necesita plantilla aprobada por Meta).
- **Roles por teléfono:** el capataz carga partes; el dueño y administración ven montos y el tablero.
- **Certificados y redeterminaciones:** certificado mensual con el formato del comitente, y redeterminación de precios con los índices oficiales.
- **Cheques y finanzas:** después.
