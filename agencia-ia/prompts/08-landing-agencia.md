# Prompt 08 — Landing de la agencia

## Rol

Sos un diseñador-desarrollador front-end senior con criterio de conversión. Vas a construir la landing de una agencia que implementa agentes y automatizaciones con IA (atención por WhatsApp 24/7, captación de consultas, seguimientos, recordatorios, reducción de ausentismo y pedido de reseñas) para negocios locales de Posadas, Misiones. Nichos en orden de prioridad: odontología y estética; gastronomía a validar.

La página tiene UNA sola acción: **"Agendá una reunión de diagnóstico (virtual, 30 min)"**. Todo lo que no empuje hacia esa acción sobra. Escribí en español rioplatense (voseo), tono profesional, directo, sin humo ni jerga técnica innecesaria.

Reglas de honestidad que no se negocian:
- No inventes testimonios, clientes, casos de éxito, logos, métricas ni resultados.
- Todo número o promesa que no sea verificable lleva la marca [HIPÓTESIS A VALIDAR] visible en el texto de trabajo (y se reemplaza antes de publicar).
- Se aclara de forma visible que el asistente de atención es una IA.
- Sin claves, tokens ni secretos en el código. Todo dato sensible entra por variables de entorno o por los placeholders de "Entradas".

## Entradas

Reemplazá o pedí estos valores antes de publicar. Mientras no estén, dejá el placeholder visible y funcional como marcador.

- [NOMBRE_AGENCIA]: nombre comercial.
- [LOGO_URL]: logo (si no hay, usar el nombre en texto).
- [WHATSAPP]: número en formato internacional, sin signos (ej. 54376XXXXXXX), para el botón secundario de contacto.
- [EMAIL_CONTACTO]: casilla de contacto.
- [URL_CALENDARIO]: enlace de agenda (Calendly, Cal.com, Google Calendar Appointment Schedule u otro) para la reunión de 30 min.
- [CRM_WEBHOOK]: URL del webhook/endpoint del CRM que recibe los leads. Se configura como variable de entorno, no se escribe en el código del cliente. [verificar] que el CRM acepte POST JSON.
- [URL_POLITICA_PRIVACIDAD]: página de política de privacidad.
- [RESPONSABLE_BASE_DATOS]: titular/responsable de la base de datos y datos de contacto para ejercer derechos (acceso, rectificación, supresión), según Ley 25.326 [verificar con abogado]. Incluye inscripción ante la AAIP si corresponde [verificar con abogado].
- [DOMINIO]: dominio final.
- [ID_ANALITICA]: identificador de analítica (opcional; si se usa, requiere aviso de cookies/consentimiento [verificar con abogado]).
- [TIEMPO_RESPUESTA]: compromiso de respuesta a consultas (ej. "el mismo día hábil") [HIPÓTESIS A VALIDAR].
- [HORARIOS_REUNION]: días y franjas disponibles, zona horaria America/Argentina/Buenos_Aires (UTC-3).
- [PRECIO_O_RANGO]: solo si se decide mostrar precios; por defecto NO se muestran.
- [FUENTE_DATOS_PROBLEMA]: fuente verificable para cualquier cifra sobre ausentismo o consultas perdidas; sin fuente, no se muestra cifra.

## Pasos

1. Leé este brief completo, incluida la "Especificación visual", antes de generar nada.
2. Definí el árbol de secciones exactamente en el orden indicado en la especificación de estructura, mobile-first (390 px como base, 1440 px como ampliación).
3. Escribí el copy usando los ejemplos como punto de partida; conservá el voseo y marcá con [HIPÓTESIS A VALIDAR] todo lo no verificable.
4. Construí el formulario con los campos, validaciones, estados y consentimiento descritos; conectalo a [CRM_WEBHOOK] por variable de entorno, con reintento y fallback a [EMAIL_CONTACTO]/[WHATSAPP].
5. Integrá [URL_CALENDARIO] como acción principal (embed o redirección; ver especificación) y verificá que el CTA sea el mismo en todas las apariciones.
6. Aplicá la especificación visual (tema oscuro violeta/magenta, tipografía del sistema).
7. Implementá accesibilidad y rendimiento (ver criterios).
8. Probá en 390 px y 1440 px, con teclado solo y con lector de pantalla básico; corregí.
9. Recorré los criterios de aceptación uno por uno y respondé sí/no; corregí hasta que todos den sí.
10. Entregá en el formato de salida indicado, con la lista de placeholders y [HIPÓTESIS A VALIDAR] pendientes.

## Especificación de estructura y contenido

### Principios
- Una sola acción primaria: "Agendá una reunión de diagnóstico (virtual, 30 min)". Un solo texto de botón en toda la página. Acción secundaria discreta: escribir por WhatsApp [WHATSAPP] (no compite visualmente con la primaria).
- Mobile-first: se diseña primero a 390 px de ancho; una columna, tap targets de al menos 44x44 px, CTA primario visible sin scroll en el primer pantallazo y barra de CTA fija inferior en mobile una vez que se pasa el hero.
- Jerarquía: un único H1; H2 por sección; H3 por ítem. Texto corto: párrafos de 2-3 líneas máximo.
- Sin precios, sin cifras, sin logos de clientes, sin testimonios. Si una cifra es imprescindible para el mensaje, lleva [HIPÓTESIS A VALIDAR] y [FUENTE_DATOS_PROBLEMA].

### Secciones en orden

**0. Encabezado (sticky)**
- [LOGO_URL] o [NOMBRE_AGENCIA] a la izquierda; a la derecha el botón "Agendá tu diagnóstico" (mismo destino que el CTA principal; texto corto permitido solo aquí por espacio, en mobile). Sin menú de navegación largo: máximo 3 anclas en desktop (Cómo funciona, Preguntas, Agendar), ocultas en mobile.

**1. Hero**
- H1 (ejemplo): "Que tu clínica responda por WhatsApp a cualquier hora, sin sumar personal."
- Subtítulo (ejemplo): "Diseñamos e implementamos agentes de IA que atienden consultas, agendan turnos y hacen seguimiento por vos. Para consultorios y centros de estética de Posadas."
- CTA primario: "Agendá una reunión de diagnóstico (virtual, 30 min)". Microcopy debajo: "Sin costo ni compromiso. Salís con un mapa de qué conviene automatizar en tu negocio." [HIPÓTESIS A VALIDAR: confirmar que el diagnóstico es gratuito y qué entregable se da].
- Enlace secundario: "Prefiero escribir por WhatsApp".
- Aviso de IA (línea pequeña pero legible): "El asistente de WhatsApp es una inteligencia artificial y se identifica como tal en cada conversación."
- Elemento visual: mockup ilustrativo de una conversación de WhatsApp claramente rotulado "Ejemplo ilustrativo" (no es un caso real; sin nombres ni datos reales).

**2. El problema (H2)**
- H2 (ejemplo): "Cada consulta sin respuesta a tiempo es un turno que se va a otro lado."
- 3 ítems breves (H3 + una línea), sin cifras salvo que haya fuente:
  - "Mensajes fuera de horario" — "Escriben de noche o el fin de semana y nadie contesta hasta el lunes."
  - "Ausentes sin aviso" — "Turnos que se pierden porque nadie recordó ni confirmó."
  - "Seguimiento que queda para después" — "Presupuestos y consultas que nadie retoma."
- Si se quiere una cifra (ej. porcentaje de ausentismo), va con [HIPÓTESIS A VALIDAR] y fuente; por defecto no se incluye.

**3. Qué hacemos (H2)**
- H2 (ejemplo): "Un equipo digital que trabaja con tu agenda y tus reglas."
- Tarjetas (H3 + una línea), 6 como máximo:
  1. Atención por WhatsApp 24/7 — responde preguntas frecuentes y deriva a una persona cuando hace falta.
  2. Captación de consultas — ordena quién escribe y qué necesita.
  3. Agenda de turnos — propone horarios y confirma. [verificar integración con la agenda/sistema del cliente]
  4. Recordatorios y confirmaciones — para bajar el ausentismo. Resultado esperado: [HIPÓTESIS A VALIDAR], sin cifra hasta tener datos propios.
  5. Seguimientos — retoma consultas y presupuestos sin respuesta.
  6. Reseñas — pide opinión al paciente/cliente después de la atención, respetando las políticas de la plataforma [verificar].
- Nota: los mensajes proactivos por WhatsApp Business dependen de plantillas aprobadas y opt-in del contacto [verificar con la documentación vigente de WhatsApp Business].

**4. Cómo funciona (H2)**
- 3 pasos numerados:
  1. "Diagnóstico (30 min, virtual)": entendemos cómo atendés hoy y dónde se pierden consultas.
  2. "Propuesta a medida": te decimos qué automatizar primero y qué no conviene automatizar.
  3. "Implementación y ajuste": lo dejamos andando, lo medimos y lo ajustamos con vos. Plazos: [HIPÓTESIS A VALIDAR].
- CTA primario repetido al final de la sección.

**5. Para quién es (H2)**
- Dos bloques: "Odontología" y "Estética" (gastronomía solo como nota: "Estamos evaluando sumar gastronomía." [HIPÓTESIS A VALIDAR: eliminar si no se valida el nicho]). Una línea de problema típico por nicho, sin casos reales ni números.

**6. Tu IA, con control humano (H2) — confianza y datos**
- Puntos: el asistente se presenta siempre como IA; deriva a una persona ante temas sensibles o cuando el paciente lo pide; no da diagnósticos ni indicaciones clínicas; tratamiento de datos personales conforme a la Ley 25.326 [verificar con abogado]; enlace a [URL_POLITICA_PRIVACIDAD].
- No afirmar certificaciones ni cumplimientos que no estén verificados.

**7. Preguntas frecuentes (H2)** — acordeón accesible, 5 a 7 ítems, ejemplos:
- "¿Los pacientes van a saber que hablan con una IA?" — "Sí. El asistente se identifica como inteligencia artificial y ofrece pasar con una persona."
- "¿Reemplaza a mi recepcionista?" — "No. Se ocupa de lo repetitivo para que tu equipo se enfoque en atender."
- "¿Qué pasa con los datos de mis pacientes?" — respuesta alineada a la política de privacidad [verificar con abogado].
- "¿Cuánto cuesta?" — "Depende de lo que necesites. Lo vemos en el diagnóstico." (sin precios).
- "¿Cuánto tarda en estar funcionando?" — [HIPÓTESIS A VALIDAR].
- "¿Necesito cambiar mi sistema de turnos?" — [HIPÓTESIS A VALIDAR / verificar según integraciones].

**8. Agendá (H2) — formulario + calendario (cierre de la página, id="agendar")**
- H2 (ejemplo): "Agendá tu reunión de diagnóstico."
- Subtítulo: "30 minutos, por videollamada. Contanos un poco de tu negocio y elegí el horario."
- Flujo recomendado: (a) el usuario completa el formulario corto; (b) al enviar correctamente, se muestra el calendario [URL_CALENDARIO] (embed o redirección) para elegir horario; (c) el lead ya quedó en el CRM aunque no complete la agenda. Alternativa si el embed falla: botón "Elegir horario" que abre [URL_CALENDARIO] en pestaña nueva.

Campos del formulario (una columna, etiquetas visibles siempre, no solo placeholders):

| Campo | Tipo | Obligatorio | Validación | Clave en el payload |
|---|---|---|---|---|
| Nombre y apellido | texto | sí | 2-80 caracteres | nombre |
| Nombre del negocio | texto | sí | 2-100 caracteres | negocio |
| Rubro | select (Odontología, Estética, Gastronomía, Otro) | sí | opción válida | rubro |
| WhatsApp | tel | sí | formato AR, se normaliza a E.164 (+54...) | whatsapp |
| Email | email | no (recomendado) | formato válido | email |
| ¿Cuál es tu mayor dolor hoy? | select o texto corto (Responder fuera de horario, Ausentismo, Seguimiento, Reseñas, Otro) | no | máx. 300 caracteres | dolor |
| Consentimiento | checkbox, sin marcar por defecto | sí | debe estar marcado | consentimiento (true/false) |
| Campo trampa anti-spam | oculto (honeypot) | no | debe llegar vacío | (no se envía o se descarta) |

Texto del consentimiento (ejemplo, [verificar con abogado]): "Acepto que [NOMBRE_AGENCIA] use estos datos para contactarme por la reunión de diagnóstico y por información relacionada. Puedo pedir acceso, rectificación o supresión de mis datos en [EMAIL_CONTACTO]. Leé la [política de privacidad](URL_POLITICA_PRIVACIDAD). Responsable de la base de datos: [RESPONSABLE_BASE_DATOS]." El texto debe indicar finalidad, responsable y derechos (Ley 25.326) [verificar con abogado]. El enlace a la política es visible junto al checkbox y abre en pestaña nueva con rel="noopener".

Cómo llegan los datos al CRM:
- El formulario hace POST JSON a [CRM_WEBHOOK] (idealmente a través de una función/endpoint propio del servidor o de la plataforma, para no exponer el webhook ni credenciales en el navegador). [verificar] según la herramienta de construcción.
- Payload de ejemplo (sin datos reales): `{"nombre":"...","negocio":"...","rubro":"Odontología","whatsapp":"+54376...","email":"...","dolor":"...","consentimiento":true,"consentimiento_texto_version":"v1","consentimiento_fecha_iso":"2026-01-01T12:00:00-03:00","fuente":"landing-diagnostico","utm_source":"","utm_medium":"","utm_campaign":"","pagina":"[DOMINIO]"}`
- Se guarda el texto/versión del consentimiento y la fecha-hora, como respaldo. Se capturan UTM de la URL si existen.
- Reintento: hasta 2 reintentos con espera creciente; si falla del todo, se muestra el estado de error y se ofrece [WHATSAPP] y [EMAIL_CONTACTO] como alternativa. No se pierde lo que el usuario escribió.
- Confirmación de recepción: mensaje en pantalla; el envío de un email/WhatsApp de confirmación al lead lo resuelve el CRM/automatización, no la landing [verificar].

Estados del formulario:
- Reposo: botón "Agendá tu reunión de diagnóstico".
- Enviando: botón deshabilitado con texto "Enviando…" y aria-busy; evita doble envío.
- Éxito: mensaje "Listo, recibimos tus datos. Elegí el horario que mejor te quede." + calendario. Foco se mueve al mensaje (role="status").
- Errores de campo (en línea, debajo de cada campo, texto + icono, no solo color), ejemplos:
  - Nombre vacío: "Contanos tu nombre."
  - WhatsApp inválido: "Revisá el número. Ejemplo: 376 4XX-XXXX."
  - Email inválido: "Revisá el email, parece que falta algo."
  - Consentimiento sin marcar: "Necesitamos tu consentimiento para poder contactarte."
- Resumen de errores al enviar: bloque con role="alert" que lista los errores con enlaces a cada campo; el foco va al primer campo con error.
- Error de red/servidor: "No pudimos enviar tus datos. Probá de nuevo o escribinos por WhatsApp." con botones "Reintentar" y "Escribir por WhatsApp".
- Error de calendario: "No pudimos cargar la agenda. Abrila acá" con enlace a [URL_CALENDARIO].
- Sin JavaScript: el formulario usa validación HTML nativa (required, type, pattern) y el enlace directo a [URL_CALENDARIO] queda disponible.

**9. Pie de página**
- [NOMBRE_AGENCIA], ciudad (Posadas, Misiones), [EMAIL_CONTACTO], [WHATSAPP], enlace a política de privacidad, aviso: "Los asistentes de [NOMBRE_AGENCIA] son inteligencias artificiales." Sin redes sociales si no existen aún. Año actual en el copyright.

### Accesibilidad (WCAG 2.2 AA como objetivo)
- HTML semántico: header, main, section con encabezados, footer; un solo H1; orden de encabezados sin saltos.
- Enlace "Saltar al contenido" al inicio.
- Contraste mínimo 4.5:1 para texto normal y 3:1 para texto grande y componentes de interfaz; verificar sobre fondo oscuro también los estados de foco.
- Foco visible en todos los elementos interactivos (anillo de al menos 2 px, contraste 3:1); orden de tabulación lógico; acordeón operable con teclado (Enter/Espacio) con aria-expanded.
- Formularios: label asociado a cada campo, autocomplete adecuado (name, tel, email, organization), mensajes de error vinculados con aria-describedby, inputmode="tel" para WhatsApp.
- Respetar prefers-reduced-motion (sin animaciones esenciales) y prefers-color-scheme (la página es oscura por diseño; no romper si el sistema es claro).
- Imágenes con alt descriptivo; decorativas con alt="". El mockup de chat tiene texto alternativo que explica que es un ejemplo ilustrativo.
- Idioma: `<html lang="es-AR">`.

### Mobile-first
- Base 390 px: una columna, márgenes laterales de 16 px, sin scroll horizontal, tipografía fluida legible (cuerpo >= 16 px).
- Barra de CTA fija inferior en mobile con el mismo texto de acción (versión corta permitida) que no tape contenido ni el formulario enfocado.
- Desktop 1440 px: contenedor centrado (máx. ~1200 px), hero en dos columnas (texto + mockup), tarjetas en grilla de 3, formulario y calendario en dos columnas.
- Rendimiento: sin dependencias pesadas; imágenes optimizadas y con dimensiones definidas para evitar saltos de layout; LCP objetivo < 2,5 s [verificar en la herramienta de medición elegida].

### SEO y metadatos básicos
- title y meta description en español, con Posadas, Misiones y el servicio; Open Graph con imagen; datos de contacto coherentes. Sin datos estructurados de reseñas ni valoraciones (no hay reseñas propias verificables).

## Especificación visual

### Principios
Tema oscuro único, look de producto SaaS: superficies en violeta muy oscuro, un solo degradé violeta a magenta reservado para la acción principal, cian como acento de apoyo. Una única CTA en toda la página: "Agendá una reunión de diagnóstico". Sin fuentes ni imágenes externas; íconos en SVG inline.

### Tokens de color
Contrastes calculados con la fórmula WCAG 2.x (luminancia relativa). Texto normal exige 4,5:1; UI y bordes de campos, 3:1.

| Token | Hex | Uso | Contraste medido |
|---|---|---|---|
| `--bg-0` | `#0B0715` | fondo de página | base |
| `--bg-1` | `#130C22` | secciones alternas, cards | base |
| `--bg-2` | `#1C1233` | card elevada, inputs | base |
| `--text` | `#F4F0FF` | texto principal | 17,77 sobre bg-0; 15,84 sobre bg-2 |
| `--text-muted` | `#B8AED6` | texto secundario | 9,53 sobre bg-0; 8,50 sobre bg-2 |
| `--violet` | `#A78BFA` | links, íconos, eyebrow | 7,31 sobre bg-0; 6,52 sobre bg-2 |
| `--magenta` | `#E879F9` | énfasis en títulos, acentos | 8,09 sobre bg-0; 7,21 sobre bg-2 |
| `--cyan` | `#22D3EE` | acento de apoyo (chips, foco) | 11,01 sobre bg-0; 9,82 sobre bg-2 |
| `--cta-a` / `--cta-b` | `#6D28D9` / `#A21CAF` | degradé del botón, 135° | texto blanco: 7,10 y 6,32 |
| `--cta-hover-a` / `-b` | `#5B21B6` / `#86198F` | botón en hover | texto blanco: 8,98 y 8,24 |
| `--border` | `#3A2A5E` | separadores decorativos | no comunica estado |
| `--border-input` | `#8467D0` | borde de campos | 4,58 sobre bg-0; 4,38 sobre bg-1 (mín. 3:1) |
| `--error` | `#FF8FA3` | error (siempre con ícono y texto) | 9,20 sobre bg-0; 8,20 sobre bg-2 |
| `--success` | `#4ADE80` | confirmación | 11,42 sobre bg-0 |

Regla: el magenta puro `#C026D3` no se usa con texto blanco (4,71, límite); usar `#A21CAF` o más oscuro.

### Tipografía (sistema, sin descargas)
Stack: `system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`. Mono para detalles: `ui-monospace, "SF Mono", Consolas, monospace`.

| Rol | Mobile 390 | Desktop 1440 | Peso / interlineado |
|---|---|---|---|
| H1 | 34px | 60px | 700 / 1,1 (letter-spacing -0,02em) |
| H2 | 26px | 40px | 700 / 1,2 |
| H3 | 20px | 24px | 600 / 1,3 |
| Body | 16px | 18px | 400 / 1,6 |
| Small / label | 14px | 14px | 500 / 1,4 |

Máximo 65 caracteres por línea; nada de cuerpo bajo 14px.
### Espaciado, radios y sombras
- Espaciado (base 4px): 4, 8, 12, 16, 24, 32, 48, 64, 96. Padding lateral de página: 20px mobile, 48px desktop. Separación entre secciones: 64px mobile, 96px desktop.
- Radios: 8px (inputs, chips), 12px (botones), 16px (cards), 999px (badges).
- Sombras: `--shadow-card: 0 8px 24px rgba(0,0,0,.45)`. Glow del CTA: `0 0 32px rgba(192,38,211,.35)`, en hover `0 0 44px rgba(192,38,211,.5)`. Halo decorativo de fondo: radial-gradient violeta al 18% de opacidad detrás del hero, sin texto encima que dependa de él.

### Componentes
- **Botón primario**: alto 52px (mín. 48px), padding 0 28px, degradé `--cta-a` a `--cta-b`, texto blanco 16px/600, radio 12px, glow. Hover: degradé hover + `translateY(-1px)`. Active: `translateY(0)`, sin glow extra. Disabled: opacidad .5, sin glow, `cursor:not-allowed`. Mobile: ancho completo.
- **Botón secundario**: mismo tamaño, fondo transparente, borde 1px `--violet`, texto `--text`. Hover: fondo `rgba(167,139,250,.12)`. Solo para acciones que no compiten con la CTA (p. ej. "Ver cómo trabajamos" que hace scroll, sin abrir otra acción).
- **Inputs**: alto 48px, fondo `--bg-2`, borde 1px `--border-input`, texto 16px (evita zoom en iOS), radio 8px, label visible arriba (nunca solo placeholder). Placeholder en `--text-muted`.
- **Cards**: fondo `--bg-1`, borde 1px `--border`, radio 16px, padding 24px, `--shadow-card`. Hover (solo desktop): borde `--violet`, `translateY(-2px)`. La card no es clickeable salvo que lo sea entera.
- **Foco (todos los interactivos)**: `outline: 3px solid #22D3EE; outline-offset: 3px`. Nunca `outline:none` sin reemplazo. Visible sobre bg-0 (11,01:1).
- **Error**: borde 2px `--error`, mensaje debajo en 14px `--error` con ícono, `aria-invalid="true"` y `aria-describedby`. El color nunca es la única señal.

### Layout por breakpoint
| | 390px (base) | 768px | 1440px |
|---|---|---|---|
| Contenedor | 100%, gutter 20px | 100%, gutter 32px | máx. 1200px centrado |
| Hero | 1 columna: eyebrow, H1, texto, CTA ancho completo | 1 columna, texto máx. 560px | 2 columnas 7/5: texto + visual de producto (mock de chat/automatización en CSS) |
| Beneficios / servicios | 1 columna, gap 16px | 2 columnas | 3 columnas, gap 24px |
| Formulario de agenda | 1 columna, campos apilados | 1 columna, máx. 520px | card de 480px junto al texto de contexto |
| Header | logo de texto + CTA compacto fijo abajo (barra sticky de 72px) | logo + CTA | logo + CTA a la derecha |

Sin scroll horizontal a 390px. Targets táctiles mínimos 48x48px, separados 8px.
### Motion
Duraciones: 150ms (hover, foco), 300ms (aparición), easing `cubic-bezier(.2,.8,.2,1)`. Solo se animan `opacity` y `transform`. Aparición de secciones: fade + 12px hacia arriba, una sola vez. Halo del hero: pulso lento opcional de 8s.
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition-duration: 0.01ms !important; scroll-behavior: auto !important; }
}
```

### Checklist de consistencia visual (sí/no, todo debe ser sí)
- [ ] Todos los colores salen de los tokens; no hay hex sueltos en el CSS.
- [ ] Todo texto normal cumple 4,5:1 y el texto grande y la UI cumplen 3:1.
- [ ] Hay una sola CTA primaria con el degradé, con el mismo texto en toda la página.
- [ ] La fuente es el stack del sistema; no se carga ningún recurso tipográfico externo.
- [ ] Solo se usan valores de las escalas de espaciado y radios.
- [ ] Todo interactivo tiene estados hover, foco visible y disabled/error cuando aplica.
- [ ] El error se comunica con texto e ícono, no solo con color.
- [ ] Los targets táctiles miden 48px o más en 390px.
- [ ] No hay scroll horizontal en 390px ni en 1440px.
- [ ] Con `prefers-reduced-motion` no hay animaciones ni parallax.
- [ ] No se usan logos, marcas ni capturas de terceros.

## Formato de salida

- Una landing de una sola página, responsive, lista para publicar, en el formato nativo de la herramienta ([verificar] si es Claude Design, que entrega prototipo/HTML exportable, o Lovable, que genera un proyecto web desplegable).
- Código legible: tokens de diseño (colores, espaciado, tipografía) definidos como variables reutilizables; sin valores mágicos repetidos.
- Todo el texto de la página en español rioplatense, con el copy del brief adaptado.
- Variables de entorno o de configuración para [CRM_WEBHOOK], [URL_CALENDARIO], [WHATSAPP], [EMAIL_CONTACTO], [URL_POLITICA_PRIVACIDAD], [ID_ANALITICA]. Ninguna clave, token ni URL secreta escrita en el código del cliente.
- Al final de la respuesta, tres listas breves: (1) placeholders que faltan completar, (2) textos marcados [HIPÓTESIS A VALIDAR], (3) puntos marcados [verificar con abogado] o [verificar].
- Sin explicaciones largas: entregá el resultado y las tres listas.

## Criterios de aceptación

Cada punto se responde sí o no. Todos deben dar sí.

1. ¿El archivo/página tiene exactamente una acción primaria, con el texto "Agendá una reunión de diagnóstico (virtual, 30 min)", y aparece igual en hero, fin de "Cómo funciona" y sección de agenda?
2. ¿La única otra vía de contacto es el enlace secundario a WhatsApp, visualmente menos prominente que el CTA primario?
3. ¿Las secciones están en el orden especificado (encabezado, hero, problema, qué hacemos, cómo funciona, para quién, control humano y datos, FAQ, agenda, pie)?
4. ¿Hay un solo H1 y los encabezados no saltan niveles?
5. ¿Toda la página está en español rioplatense con voseo (sin "tú", "usted" ni "vosotros")?
6. ¿No hay testimonios, logos de clientes, casos de éxito ni métricas inventadas?
7. ¿Cada número, plazo o promesa no verificable lleva [HIPÓTESIS A VALIDAR]?
8. ¿Se indica de forma visible, en hero y pie, que el asistente es una IA?
9. ¿El mockup de chat está rotulado "Ejemplo ilustrativo" y no usa datos reales?
10. ¿El formulario tiene los campos definidos (nombre, negocio, rubro, WhatsApp, email, dolor, consentimiento) con etiqueta visible en cada uno?
11. ¿El checkbox de consentimiento está sin marcar por defecto, es obligatorio y bloquea el envío si no está marcado?
12. ¿El consentimiento menciona finalidad, responsable y derechos, y enlaza a [URL_POLITICA_PRIVACIDAD] (marcado [verificar con abogado], Ley 25.326)?
13. ¿El envío hace POST JSON a [CRM_WEBHOOK] tomado de una variable de entorno o configuración del servidor, sin URL ni claves visibles en el código del navegador?
14. ¿El payload incluye consentimiento, versión del texto, fecha-hora y UTM?
15. ¿Existen y se ven los estados: reposo, enviando (botón deshabilitado), éxito, error de campo, resumen de errores, error de red y error de calendario?
16. ¿Ante error de red se ofrece reintentar y contacto alternativo por WhatsApp/email sin perder lo escrito?
17. ¿Cada mensaje de error de campo es texto (no solo color) y está asociado al campo con aria-describedby?
18. ¿Todo el sitio es operable solo con teclado y el foco es siempre visible?
19. ¿El contraste cumple 4,5:1 en texto normal y 3:1 en texto grande y componentes, verificado sobre el fondo oscuro?
20. ¿Se respeta prefers-reduced-motion y el html declara lang="es-AR"?
21. ¿A 390 px no hay scroll horizontal, los tap targets miden al menos 44x44 px y el texto de cuerpo es de al menos 16 px?
22. ¿A 1440 px el contenido está centrado con ancho máximo y el hero, las tarjetas y el formulario usan el layout de escritorio especificado?
23. ¿El CTA primario es visible sin scroll en el primer pantallazo a 390 px?
24. ¿El repositorio/entrega no contiene claves, tokens ni secretos?
25. ¿La línea ### Principios
Tema oscuro único, look de producto SaaS: superficies en violeta muy oscuro, un solo degradé violeta a magenta reservado para la acción principal, cian como acento de apoyo. Una única CTA en toda la página: "Agendá una reunión de diagnóstico". Sin fuentes ni imágenes externas; íconos en SVG inline.

### Tokens de color
Contrastes calculados con la fórmula WCAG 2.x (luminancia relativa). Texto normal exige 4,5:1; UI y bordes de campos, 3:1.

| Token | Hex | Uso | Contraste medido |
|---|---|---|---|
| `--bg-0` | `#0B0715` | fondo de página | base |
| `--bg-1` | `#130C22` | secciones alternas, cards | base |
| `--bg-2` | `#1C1233` | card elevada, inputs | base |
| `--text` | `#F4F0FF` | texto principal | 17,77 sobre bg-0; 15,84 sobre bg-2 |
| `--text-muted` | `#B8AED6` | texto secundario | 9,53 sobre bg-0; 8,50 sobre bg-2 |
| `--violet` | `#A78BFA` | links, íconos, eyebrow | 7,31 sobre bg-0; 6,52 sobre bg-2 |
| `--magenta` | `#E879F9` | énfasis en títulos, acentos | 8,09 sobre bg-0; 7,21 sobre bg-2 |
| `--cyan` | `#22D3EE` | acento de apoyo (chips, foco) | 11,01 sobre bg-0; 9,82 sobre bg-2 |
| `--cta-a` / `--cta-b` | `#6D28D9` / `#A21CAF` | degradé del botón, 135° | texto blanco: 7,10 y 6,32 |
| `--cta-hover-a` / `-b` | `#5B21B6` / `#86198F` | botón en hover | texto blanco: 8,98 y 8,24 |
| `--border` | `#3A2A5E` | separadores decorativos | no comunica estado |
| `--border-input` | `#8467D0` | borde de campos | 4,58 sobre bg-0; 4,38 sobre bg-1 (mín. 3:1) |
| `--error` | `#FF8FA3` | error (siempre con ícono y texto) | 9,20 sobre bg-0; 8,20 sobre bg-2 |
| `--success` | `#4ADE80` | confirmación | 11,42 sobre bg-0 |

Regla: el magenta puro `#C026D3` no se usa con texto blanco (4,71, límite); usar `#A21CAF` o más oscuro.

### Tipografía (sistema, sin descargas)
Stack: `system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`. Mono para detalles: `ui-monospace, "SF Mono", Consolas, monospace`.

| Rol | Mobile 390 | Desktop 1440 | Peso / interlineado |
|---|---|---|---|
| H1 | 34px | 60px | 700 / 1,1 (letter-spacing -0,02em) |
| H2 | 26px | 40px | 700 / 1,2 |
| H3 | 20px | 24px | 600 / 1,3 |
| Body | 16px | 18px | 400 / 1,6 |
| Small / label | 14px | 14px | 500 / 1,4 |

Máximo 65 caracteres por línea; nada de cuerpo bajo 14px.
### Espaciado, radios y sombras
- Espaciado (base 4px): 4, 8, 12, 16, 24, 32, 48, 64, 96. Padding lateral de página: 20px mobile, 48px desktop. Separación entre secciones: 64px mobile, 96px desktop.
- Radios: 8px (inputs, chips), 12px (botones), 16px (cards), 999px (badges).
- Sombras: `--shadow-card: 0 8px 24px rgba(0,0,0,.45)`. Glow del CTA: `0 0 32px rgba(192,38,211,.35)`, en hover `0 0 44px rgba(192,38,211,.5)`. Halo decorativo de fondo: radial-gradient violeta al 18% de opacidad detrás del hero, sin texto encima que dependa de él.

### Componentes
- **Botón primario**: alto 52px (mín. 48px), padding 0 28px, degradé `--cta-a` a `--cta-b`, texto blanco 16px/600, radio 12px, glow. Hover: degradé hover + `translateY(-1px)`. Active: `translateY(0)`, sin glow extra. Disabled: opacidad .5, sin glow, `cursor:not-allowed`. Mobile: ancho completo.
- **Botón secundario**: mismo tamaño, fondo transparente, borde 1px `--violet`, texto `--text`. Hover: fondo `rgba(167,139,250,.12)`. Solo para acciones que no compiten con la CTA (p. ej. "Ver cómo trabajamos" que hace scroll, sin abrir otra acción).
- **Inputs**: alto 48px, fondo `--bg-2`, borde 1px `--border-input`, texto 16px (evita zoom en iOS), radio 8px, label visible arriba (nunca solo placeholder). Placeholder en `--text-muted`.
- **Cards**: fondo `--bg-1`, borde 1px `--border`, radio 16px, padding 24px, `--shadow-card`. Hover (solo desktop): borde `--violet`, `translateY(-2px)`. La card no es clickeable salvo que lo sea entera.
- **Foco (todos los interactivos)**: `outline: 3px solid #22D3EE; outline-offset: 3px`. Nunca `outline:none` sin reemplazo. Visible sobre bg-0 (11,01:1).
- **Error**: borde 2px `--error`, mensaje debajo en 14px `--error` con ícono, `aria-invalid="true"` y `aria-describedby`. El color nunca es la única señal.

### Layout por breakpoint
| | 390px (base) | 768px | 1440px |
|---|---|---|---|
| Contenedor | 100%, gutter 20px | 100%, gutter 32px | máx. 1200px centrado |
| Hero | 1 columna: eyebrow, H1, texto, CTA ancho completo | 1 columna, texto máx. 560px | 2 columnas 7/5: texto + visual de producto (mock de chat/automatización en CSS) |
| Beneficios / servicios | 1 columna, gap 16px | 2 columnas | 3 columnas, gap 24px |
| Formulario de agenda | 1 columna, campos apilados | 1 columna, máx. 520px | card de 480px junto al texto de contexto |
| Header | logo de texto + CTA compacto fijo abajo (barra sticky de 72px) | logo + CTA | logo + CTA a la derecha |

Sin scroll horizontal a 390px. Targets táctiles mínimos 48x48px, separados 8px.
### Motion
Duraciones: 150ms (hover, foco), 300ms (aparición), easing `cubic-bezier(.2,.8,.2,1)`. Solo se animan `opacity` y `transform`. Aparición de secciones: fade + 12px hacia arriba, una sola vez. Halo del hero: pulso lento opcional de 8s.
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition-duration: 0.01ms !important; scroll-behavior: auto !important; }
}
```

### Checklist de consistencia visual (sí/no, todo debe ser sí)
- [ ] Todos los colores salen de los tokens; no hay hex sueltos en el CSS.
- [ ] Todo texto normal cumple 4,5:1 y el texto grande y la UI cumplen 3:1.
- [ ] Hay una sola CTA primaria con el degradé, con el mismo texto en toda la página.
- [ ] La fuente es el stack del sistema; no se carga ningún recurso tipográfico externo.
- [ ] Solo se usan valores de las escalas de espaciado y radios.
- [ ] Todo interactivo tiene estados hover, foco visible y disabled/error cuando aplica.
- [ ] El error se comunica con texto e ícono, no solo con color.
- [ ] Los targets táctiles miden 48px o más en 390px.
- [ ] No hay scroll horizontal en 390px ni en 1440px.
- [ ] Con `prefers-reduced-motion` no hay animaciones ni parallax.
- [ ] No se usan logos, marcas ni capturas de terceros. de este brief quedó completada por el agente visual antes de construir, y la página aplica esa especificación (tema oscuro violeta/magenta, tipografía del sistema)?
26. ¿No se muestran precios ni cifras sin fuente, y la gastronomía figura solo como nicho a validar?
27. ¿La salida incluye las tres listas finales (placeholders pendientes, [HIPÓTESIS A VALIDAR], [verificar])?
