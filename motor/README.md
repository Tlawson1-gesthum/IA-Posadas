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
| `src/herramientas/` | `ver_carta_y_estado` y `consultar_pedido` (leen en vivo la API de MORFA), `derivar_a_persona`. |
| `plantillas/gastronomia.md` | Instrucciones base para cualquier local gastronómico. |
| `fichas/morfa.json` | La ficha de MORFA: voz, preguntas frecuentes, cuándo derivar, modelo, tope de gasto. |
| `pruebas/morfa.json` | 16 conversaciones de ejemplo con lo que se espera de cada respuesta. |

## Cómo probarlo (en tu compu)

Necesitás Node 20 o más nuevo y una clave de la API de Claude.

```bash
cd motor
npm install
cp .env.example .env        # y pegá tu ANTHROPIC_API_KEY en .env

npm run herramientas         # sin Claude: verifica que lee bien la web de MORFA
npm run chat                 # chatear con el agente en la terminal
npm run probar               # correr la batería de pruebas (cuesta centavos de dólar)
npm run probar -- morfa celí # correr solo los casos que contienen "celí"
```

En el chat: `liberar` devuelve la charla al agente después de una derivación; `salir` termina.

## Decisiones de la versión 1

- **Datos en vivo.** Carta, precios, agotados, horario, demora, envío y efectivo se leen de `semorfa.com.ar/api/menu` (con 60 s de caché). El prompt no tiene ningún precio.
- **No toma pedidos.** Manda a la web.
- **Pedidos solo con código.** Al modelo no le llega la dirección del pedido.
- **Derivación.** Cuando deriva, el motor marca la charla y el agente se calla hasta que una persona la libere.
- **Modelo.** `claude-opus-5-5` con esfuerzo `low` (rápido y barato para chat). Se cambia por ficha (`modelo`, `esfuerzo`). Tiene activado el respaldo automático del servidor (`fallbacks: "default"`): si el modelo rechaza un mensaje, otro modelo responde en la misma llamada.
- **Costo.** Cada respuesta devuelve tokens y US$; en el paso 3 se guarda por cliente y se corta al llegar a `tope_usd_mes`.

## Paso a paso

1. **Cerebro + ficha de MORFA + simulador + pruebas.** ✅ (este paso)
2. **Conexión con WhatsApp Cloud API:** endpoint en Vercel que recibe el webhook de Meta, verifica la firma y contesta. Se prueba con el número de prueba de Meta.
3. **Base de datos (Supabase):** fichas, conversaciones, mensajes, derivaciones, consumo y tope de gasto por cliente.
4. **Del lado de semorfa (Cloudflare):** clave servidor a servidor, buscar pedidos por teléfono y confirmar pedidos en efectivo cuando el cliente responde "SÍ".
5. **Panel de gobierno y portal del cliente:** semáforo, pausar, ver charlas, tomar el control, editar la ficha con historial.
6. **Salida a producción:** primero fuera de horario, después todo el día.
