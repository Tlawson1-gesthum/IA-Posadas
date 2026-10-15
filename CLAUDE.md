# IA-Posadas: reglas de trabajo para sesiones de Claude

Leé esto antes de tocar nada. Su objetivo es que varias sesiones no se pisen entre sí.

## Qué hay en este repo

| Carpeta | Qué es |
|---|---|
| `motor/` | El motor de agentes (PENSA/Morfi): API, fichas, plantillas, scripts de Supabase, pruebas, panel. Ver `motor/README.md` y las `GUIA-PASO-*.md`. |
| `agencia-ia/` | Material de la agencia: datos, prompts y página. |

## Mapa de repos

Cada proyecto vive en su propio repo. No mezclar cambios de uno en otro.

| Repo | Para qué |
|---|---|
| `IA-Posadas` (este) | Motor de agentes y agencia |
| `semorfa` | Ver nota abajo |
| `morfa-gestion` | Ver nota abajo |
| `crm-pensa` | CRM de PENSA |
| `Matchy` | Proyecto aparte; no tocar desde sesiones de IA-Posadas |
| `Tutti` | Repo propio (pendiente de crear y conectar) |

> Pendiente de completar por Tomás: qué es Gozza y qué es Morga, y a qué repo corresponde cada uno.

## Reglas

1. **Una sesión = un repo = una tarea.** Si la tarea es de este repo, no se tocan otros repos. Si hace falta otro, se pide explícitamente.
2. **Nombre claro desde el primer mensaje.** La sesión se identifica por su tarea (ej. "Morfi: pruebas de bebidas"), no por la rama random.
3. **Nunca pushear directo a `main`.** Cada sesión trabaja en su rama `claude/...` y se mergea de a una. Antes de empezar, traer `main` actualizado: `git fetch origin main`.
4. **No borrar nada** (ramas, archivos, sesiones) sin pedido explícito de Tomás.
5. **Cambios chicos y enfocados.** Un commit = una cosa, con mensaje descriptivo en español.
6. **Si dos sesiones tocan los mismos archivos**, la segunda se rebasa o mergea desde `main` antes de seguir. Ante duda, preguntar.
7. **Secretos:** claves (`ANTHROPIC_API_KEY`, tokens de Meta/Supabase) nunca se commitean ni se copian en chat. Se leen de variables de entorno.
8. **Investigación sin código** (estrategia, nombres, tendencias) va en sesiones sin repo, para no generar ramas.

## Tablero de sesiones abiertas

Actualizar al abrir o cerrar una sesión. Una línea por sesión.

| Sesión | Repo | Rama | Estado / qué espera |
|---|---|---|---|
| Morfi WhatsApp testing | IA-Posadas | `claude/jolly-dirac-wjpvuc` | Espera saldo de Anthropic para correr pruebas |
| Agentizar WhatsApp Morfa | IA-Posadas | `claude/admiring-archimedes-5rsso2` | Espera `ANTHROPIC_API_KEY` en sesión nueva |
| Agentes funcionando | Tutti (a conectar) | `claude/pensive-gates-rc4r0l` | Espera repo de Tutti y alcance del agente |
| IA: tendencias, nicho y oportunidades | sin repo (investigación) | `claude/admiring-hopper-2c4lxt` | Espera decidir pasar artifacts a la marca nueva |
| Organizar sesiones de Claude | IA-Posadas | `claude/sharp-dijkstra-vrh23r` | Esta documentación |

Sesiones terminadas (candidatas a archivar, **sin borrar**): Nombre para agencia IA Posadas, Proyecto MORFA en Claudfare, Producto B2B viable, Estrategia de posicionamiento profesional, IA Posadas.

## Pendientes de Tomás (destraban sesiones)

- Cargar saldo de Anthropic.
- Disponer `ANTHROPIC_API_KEY` en el entorno de las sesiones.
- Crear el repo de Tutti y definir quién usa el agente y con qué alcance.
- Decidir la migración de artifacts a la marca nueva.
- Completar el mapa de Gozza y Morga arriba.
