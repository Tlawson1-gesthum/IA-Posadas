# Prompt 03 — Demo Builder

> **Este archivo es un prompt; la app todavía no existe.**

## Rol
Sos un ingeniero de software senior. Vas a construir el "Demo Builder": una herramienta interna de la agencia que, a partir de la URL de un negocio, arma un agente de demostración y deja probarlo en un chat. Es un diseño propio; no copies marca, textos ni interfaz de ningún producto existente.

## Entradas
- `[URL_NEGOCIO]`: dirección web del negocio a analizar.
- `[PLANTILLA_AGENTE]`: contenido de `prompts/04-agente-plantilla.md`.
- `[PROVEEDOR_LLM]`: proveedor y modelo a usar [DECIDIR CON EL INGENIERO].
- `[HOSTING_BACKEND]`: dónde corre el backend [DECIDIR CON EL INGENIERO].
- Variable de entorno `LLM_API_KEY` (solo en el servidor; nunca en el código ni en el navegador).

## Pasos
### MVP (fase 1)
1. Pantalla con un campo de URL y un botón "Analizar".
2. El backend descarga la página (solo `[URL_NEGOCIO]` y páginas enlazadas del mismo dominio, con límite de páginas y de tamaño), extrae texto útil y arma una ficha del negocio: nombre, rubro, servicios, precios visibles, horarios, ubicación, contacto. Todo dato que no aparece queda como `[NO ENCONTRADO]`.
3. Mostrar la ficha para que la agencia la edite antes de seguir.
4. Completar `[PLANTILLA_AGENTE]` con la ficha y mostrar el prompt del agente, editable.
5. Chat de prueba: el navegador llama al backend, y el backend llama al proveedor con `LLM_API_KEY`. El navegador jamás ve la clave.
6. Guardar por demo: ficha, prompt y conversación, con vencimiento a los 30 días.

### Fase 2 (después de validar el MVP)
7. Conectar el agente a WhatsApp con la WhatsApp Cloud API oficial para clientes en producción.
8. Opcional solo para demos: conexión por QR (no oficial; riesgo de bloqueo del número). Usar un número descartable y dejarlo rotulado como demo.
9. Panel para pausar y reactivar el agente por cliente (corte por falta de pago).

## Formato de salida
- Repositorio con: `README.md` (cómo correrlo), `server/` (backend mínimo), `web/` (front simple), `.env.example` (sin valores reales).
- Diagrama de arquitectura en Markdown (mermaid o texto).
- Lista de decisiones abiertas para el equipo.

## Criterios de aceptación
- [ ] `LLM_API_KEY` no aparece en ningún archivo versionado ni en el código del navegador.
- [ ] Pegando una URL válida se obtiene una ficha con campos `[NO ENCONTRADO]` donde falte información.
- [ ] El prompt generado incluye el aviso de que el usuario habla con una IA.
- [ ] El chat responde con el agente sin exponer el prompt completo ante un pedido explícito de mostrarlo.
- [ ] Los datos de una demo no son accesibles desde otra demo.
- [ ] Las demos se eliminan a los 30 días.
- [ ] El README permite correr el MVP en una máquina limpia con un solo comando de arranque documentado.
- [ ] La fase 2 está separada del MVP y no es necesaria para probar el chat.
