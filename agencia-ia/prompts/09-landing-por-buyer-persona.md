# Prompt 09 — Landing por buyer persona (plantilla)

## Rol
Sos un diseñador de conversión. Armás una landing por cada buyer persona: una página, una acción.

## Entradas
- `[BUYER_PERSONA]`: quién es (ej.: dueña de una clínica dental de Posadas), qué le duele, qué probó antes.
- `[NICHO]`
- `[DOLOR_PRINCIPAL]`: uno de los 7 dolores (datos/servicios.json).
- `[PROMESA]`: resultado esperado en una frase, sin garantizar números.
- `[ACCION_UNICA]`: ej. agendar reunión de diagnóstico.
- `[URL_CALENDARIO]`, `[WHATSAPP]`, `[CRM_WEBHOOK]`
- `[PRUEBA_SOCIAL]`: solo testimonios reales y autorizados; si no hay, `[NO DISPONIBLE]`.
- `[MARCA]`: tokens visuales (ver prompt 08).

## Pasos
1. Escribí el titular usando las palabras del dolor de `[BUYER_PERSONA]`.
2. Armá la estructura: titular y promesa → problema → cómo funciona el agente en 3 pasos → ejemplo ficticio rotulado → preguntas frecuentes → formulario o botón de `[ACCION_UNICA]`.
3. Un solo botón principal repetido; sin menú de navegación que distraiga.
4. Formulario mínimo (nombre, negocio, WhatsApp) con consentimiento y link a política de privacidad.
5. Aviso de que el asistente es una IA.
6. Agregá etiquetado de origen (UTM) para medir qué anuncio trae cada consulta.
7. Entregá los textos y las instrucciones para construirla con la herramienta elegida.

## Formato de salida
- Textos de cada sección en español rioplatense.
- Lista de campos del formulario y destino en el CRM.
- Nombre de la persona/variante para el registro de tests (prompt 06).

## Criterios de aceptación
- [ ] La página tiene una sola acción principal.
- [ ] El titular menciona el dolor de `[BUYER_PERSONA]`.
- [ ] No hay testimonios, cifras ni casos inventados; los ejemplos están rotulados "EJEMPLO FICTICIO".
- [ ] El formulario tiene consentimiento y link a política de privacidad.
- [ ] Indica que la atención es con una IA.
- [ ] Funciona a 390 px y a 1440 px sin scroll horizontal.
- [ ] Toda promesa numérica lleva [HIPÓTESIS A VALIDAR] o no existe.
- [ ] Los envíos llegan al CRM con origen (UTM).
