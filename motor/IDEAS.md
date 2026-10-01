# Ideas para más adelante

## Pedir la moto a un servicio externo cuando el pedido está listo (MORFA)

**El problema.** MORFA usa servicios de motos externos que trabajan por WhatsApp, casi siempre en un grupo. Cuando la cocina tiene el pedido listo, alguien tiene que pedir la moto, **esperar la confirmación** y, si contestan "demora de 30 min" o no contestan, **pedirle a otro servicio**.

**El momento.** Cuando la cocina marca el pedido como **"Listo"** en el panel de semorfa (no antes).

**Limitación técnica.** Con la API oficial de WhatsApp un agente no puede entrar a un grupo creado por otra persona ni leerlo. Las herramientas no oficiales que lo hacen violan las reglas de WhatsApp y pueden bloquear el número de MORFA: descartadas. (La API oficial de grupos de Meta es nueva y limitada: verificar cuando esté Meta.)

### Fase 1 · semiautomático, sin Meta (rápido)
En el panel de cocina de semorfa, cuando un pedido pasa a "Listo":
- Botón **"🛵 Pedir moto"** que abre WhatsApp con el mensaje ya escrito (dirección de retiro, barrio de destino, código del pedido, si ya está pagado). El encargado elige el grupo del servicio y envía.
- Botones para anotar la respuesta: **"Confirmó · llega en X min"** o **"Pedir a otro"** (abre el siguiente servicio de la lista).
- El pedido muestra el estado de la moto y queda registrado (qué servicio, cuánto tardó en confirmar, cuánto tardó en llegar).

### Fase 2 · automático, con Meta
Un agente "despachante" en el motor:
1. Semorfa avisa al motor cuando un pedido pasa a "Listo".
2. El agente le escribe **en privado al número del despachante** del servicio 1 (plantilla aprobada por Meta si pasaron más de 24 h desde su último mensaje).
3. Lee la respuesta con IA: "voy", "en 10", "demora 30", "no hay motos"…
4. Si confirma dentro del máximo aceptado, avisa en el panel de cocina "Moto pedida a X, llega en N min". Si la demora supera el máximo o no responde en el tiempo de espera, pasa al servicio 2, y así.
5. Si ningún servicio puede, alerta al encargado (panel + aviso).

### Datos que faltan (preguntar a MORFA)
- Lista de servicios en orden de preferencia, con **número de despachante** de cada uno (además del grupo).
- Demora máxima aceptada (¿15 min?).
- Tiempo de espera de respuesta antes de pasar al siguiente (¿5 min?).
- Si el servicio cobra el viaje a MORFA o al cliente, y cuánto (para registrar costos).

---

## Otras ideas pendientes
- **Portal del cliente y roles:** que el dueño de cada negocio vea solo lo suyo y usuarios del equipo con permisos (fundador, ingeniero, closer).
- **Segunda plantilla de rubro** (odontología o estética), con ficha de demo.
- **Audios:** transcribir notas de voz de WhatsApp para que el agente las entienda (hoy pide que escriban).
- **Avisos al cliente** cuando cambia el estado del pedido ("salió tu pedido"), con plantillas de Meta.
