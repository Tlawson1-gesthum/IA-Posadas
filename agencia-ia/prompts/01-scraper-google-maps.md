## Objetivo
Construir una herramienta de línea de comandos en Python que cada día entregue hasta 50 prospectos NUEVOS de un rubro y una ciudad, listos para contactar en un solo click por WhatsApp. Usa la API oficial Google Places (New) y no scrapea el HTML de Maps, porque eso viola sus términos y termina en bloqueos.

## Contexto
- Vendo agentes de IA (atención, agenda, seguimiento) a negocios locales. Empiezo en Posadas (Misiones, Argentina, código de área 376) y voy a expandir a Corrientes (379) y Resistencia/Chaco (362).
- Yo hago el primer contacto manualmente. La herramienta NUNCA envía mensajes.
- La API key se lee de la variable de entorno GOOGLE_PLACES_API_KEY. Nunca se escribe en archivos ni en logs.

## Target State
Carpeta ./agencia-ia/prospector con:
- config.yaml: rubro, ciudad, subrubros y zonas/barrios para variar las búsquedas, radio, límite_diario=50, máximo de requests por corrida.
- Módulo de búsqueda: Text Search (Places API New) con FieldMask mínimo (nombre, dirección, teléfonos nacional e internacional, sitio web, rating, cantidad de reseñas, estado del negocio, link de Maps, reseñas). Paginación, y combinación de varias consultas (subrubro × zona) hasta juntar 50 nuevos.
- Estado en SQLite: place_id, fecha, estado (nuevo/contactado/respondió/reunión/descartado). Nunca repetir un prospecto ya entregado.
- Enriquecimiento liviano: si hay sitio web, una sola petición a la home (respeta robots.txt, timeout corto) para detectar Instagram, link de WhatsApp y email públicos del negocio.
- Normalización de teléfonos a E.164 argentino. Detectar si es móvil (+549…) o fijo. Los fijos se marcan como "llamar" y no generan link de WhatsApp.
- Score 0-100 con lógica explícita y documentada: móvil válido, sin web o web pobre, buen rating con volumen de reseñas (negocio real), tiene Instagram, señales de dolor en las reseñas (ej. "no responden", "no atienden", "tardan en contestar", "turno").
- Salida diaria en XLSX y CSV, ordenada por score. Columnas: fecha, rubro, nombre, barrio, dirección, teléfono_e164, tipo_teléfono, link_whatsapp (wa.me con texto precargado), instagram, web, email, rating, reseñas, señal_de_dolor (cita breve), score, mensaje_sugerido, estado, link_maps.
- mensaje_sugerido: máximo 3 líneas, en español rioplatense, que mencione algo específico del negocio, propone una conversación de 10 minutos y cierra con una salida clara ("si no te interesa avisame y no te escribo más"). Sin mentiras ni urgencia falsa.
- README breve con instalación y uso; modo --dry-run que usa datos de ejemplo sin API key.

## Scope
- Trabajá solo en ./agencia-ia/prospector. No toques nada fuera.
- Dependencias permitidas: requests, pyyaml, openpyxl. Cualquier otra, preguntá antes.

## Constraints
- Solo datos públicos de negocios, nunca de personas físicas sin actividad comercial visible.
- Controlá el costo: contá requests, registrá el costo estimado de cada corrida y cortá si superás el máximo de config. Verificá los precios y el cupo gratuito vigentes en la documentación oficial y no los asumas.
- No programes el envío automático ni la ejecución periódica. Solo explicá en el README cómo agendarlo en el Programador de tareas de Windows.
- Hacé solo lo pedido: sin interfaz web ni funciones extra.

## Acceptance Criteria
- [ ] --dry-run genera el XLSX y el CSV con todas las columnas y sin errores.
- [ ] Con la key, una corrida real para "clínica odontológica" en Posadas devuelve hasta 50 filas con teléfono normalizado, o explica por qué hay menos.
- [ ] Una segunda corrida inmediata no repite ningún place_id.
- [ ] Los links wa.me abren el chat con el texto precargado.
- [ ] Hay tests para normalización de teléfonos, deduplicación y score, y pasan.
- [ ] Ningún archivo ni log contiene la API key.

## Action Boundaries
Podés leer, crear, editar y correr tests dentro del alcance. Frená y preguntame antes de instalar paquetes, de hacer más de 1 consulta real a la API en las pruebas, de borrar archivos o de tocar cualquier cosa fuera de la carpeta.

## Progress Evidence
Reportá al terminar cada módulo: ✅ qué se completó, con el resultado de la prueba que lo respalda.