# Motor de agentes de WhatsApp

Un solo motor para todos los clientes. Cada cliente es una **ficha** (`fichas/<id>.json`) que dice quién es, qué sabe y qué herramientas puede usar. El prompt sale de la **plantilla del rubro** (`plantillas/<rubro>.md`) más los datos de la ficha. Si mejorás la plantilla de gastronomía, mejoran todos los locales gastronómicos.

```
mensaje ─► cerebro (src/cerebro.ts) ─► Claude ─► herramientas ─► sistema del cliente (ej. semorfa.com.ar)
               ▲
     ficha + plantilla = instrucciones
```

## Qué hay

| Archivo | Qué es |
|---|---|
| `src/cerebro.ts` | Recibe ficha, historial y mensaje; usa Claude y las herramientas; devuelve el texto, si derivó a una persona y cuánto costó. No sabe nada de WhatsApp. |
| `src/fichas.ts` | Carga la ficha y arma el prompt. Falla si falta completar un campo de la plantilla. |
| `src/herramientas/` | `ver_carta_y_estado` y `consultar_pedido` (leen en vivo la API de MORFA); `cotizar_pedido` y `crear_pedido` (toman pedidos por WhatsApp y los cargan en el sistema); `derivar_a_persona`. |
| `plantillas/gastronomia.md` | Instrucciones base para cualquier local gastronómico. |
| `fichas/morfa.json` | Semilla de la ficha de MORFA para probar en la compu. **La ficha real vive en Supabase y se edita desde el panel.** |
| `api/panel.ts` + `public/panel.html` | Panel de gobierno: clientes con semáforo, pausar, costo contra abono, alertas, charlas, responder como persona, editar fichas con borrador, historial y vuelta atrás, alta de clientes. |
| `api/chat.ts` + `public/index.html` | Chat web de prueba: `/?ficha=<id>` prueba lo publicado; `/?ficha=<id>&borrador=1` prueba los cambios sin publicar. |
| `public/widget.js` + `public/widget.html` | Burbuja de chat para la web del cliente: `<script src="https://ia-posadas.vercel.app/widget.js" data-ficha="<id>" defer></script>`. Se prende desde la ficha (`chat_web.activo`). |
| `pruebas/morfa.json` | 20 conversaciones de ejemplo con lo que se espera de cada respuesta. |

## Cómo probarlo (en tu compu)

Necesitás Node 20 o más nuevo y una clave de la API de Claude.

```bash
cd motor
npm install
cp .env.example .env        # y pegá tu ANTHROPIC_API_KEY en .env

npm run herramientas         # sin Claude: verifica que lee bien la web de MORFA
npm run chat                 # chatear con el agente en la terminal
npm run chat-abierto         # igual, pero haciendo de cuenta que el local está abierto (para probar pedidos de día)
npm run probar               # correr la batería de pruebas (cuesta centavos de dólar)
npm run probar -- morfa celí # correr solo los casos que contienen "celí"
npm run local                # chat y panel en http://localhost:3000 (sin Supabase usa memoria y las fichas de fichas/)
```

En el chat: `ubicacion -27.37 -55.90` simula mandar el pin de ubicación; `liberar` devuelve la charla al agente después de una derivación; `salir` termina.

## Decisiones de la versión 1

- **Datos en vivo.** Carta, precios, agotados, horario, demora, envío y efectivo se leen de `semorfa.com.ar/api/menu` (con 60 s de caché). El prompt no tiene ningún precio.
- **Toma pedidos por WhatsApp** (o manda a la web, según prefiera el cliente). Productos, total y envío los calcula el código con la carta en vivo, nunca el modelo. El envío usa la ubicación que comparte el cliente y la misma cuenta que la web (distancia en línea recta). Efectivo y Mercado Pago se cargan con `POST /api/pedidos`, el mismo de la web, con la nota `[Pedido por WhatsApp]`. Transferencia: arma el pedido y lo deriva al encargado.
- **Pedidos simulados hasta que se habilite.** Con `integracion.crear_pedidos: false` (como está hoy), `crear_pedido` no toca el sistema y devuelve el código `PRUEBA1`. Se pasa a `true` recién al salir a producción.
- **Pedidos solo con código.** Al modelo no le llega la dirección del pedido.
- **Derivación.** Cuando deriva, el motor marca la charla y el agente se calla hasta que una persona la libere.
- **Modelo.** `claude-opus-5-5` con esfuerzo `low` (rápido y barato para chat). Se cambia por ficha (`modelo`, `esfuerzo`). Tiene activado el respaldo automático del servidor (`fallbacks: "default"`): si el modelo rechaza un mensaje, otro modelo responde en la misma llamada.
- **Costo y abuso.** Cada respuesta guarda tokens y US$. Topes: `tope_usd_mes` por cliente (negocio) y `limites` por persona que escribe (mensajes por hora y por día, US$ por día, largo máximo del mensaje). Al pasarse, avisa una sola vez y después no responde ni gasta. Además, cada mensaje tiene como máximo 5 vueltas de herramientas y los últimos 20 turnos de historial.

## Paso a paso

1. **Cerebro + ficha de MORFA + simulador + pruebas.** ✅
2. ✅ **Conexión con WhatsApp Cloud API:** `api/whatsapp.ts` (webhook en Vercel: verifica la firma de Meta, responde 200 al toque y atiende en segundo plano), `src/atender.ts` (pausa, derivación, tope de gasto, `/reiniciar` para administradores) y memoria mínima en Supabase (`supabase/001_esquema.sql`). Cómo configurarlo: [GUIA-PASO-2-WHATSAPP.md](GUIA-PASO-2-WHATSAPP.md). Prueba local sin Meta: `npm run webhook-local`.
3. **La central (Supabase):** fichas en la base con borrador, versiones e historial (`supabase/002_central.sql`); eventos (errores, derivaciones, límites, publicaciones); resúmenes calculados en la base. ✅
5. **Panel de gobierno:** ✅ (`/panel.html`, clave `PANEL_CLAVE`). Falta: roles (fundador, ingeniero, closer) y el portal de cada cliente.
4. ✅ **Morfi conectado a semorfa y burbuja en la web:** `AGENTE_CLAVE` servidor a servidor; pedidos de Morfi con canal `whatsapp` o `chat` (los de WhatsApp en efectivo entran confirmados); `mis_pedidos` y `confirmar_pedido_efectivo`; burbuja (`public/widget.js` + `widget.html`) con límites por conexión y por día. Guía: [GUIA-PASO-4-SEMORFA-Y-BURBUJA.md](GUIA-PASO-4-SEMORFA-Y-BURBUJA.md).
5b. **Portal del cliente y roles:** que cada dueño vea solo lo suyo (sus charlas, pedidos y reporte) y usuarios con permisos distintos.
6. **Salida a producción:** primero fuera de horario, después todo el día.
