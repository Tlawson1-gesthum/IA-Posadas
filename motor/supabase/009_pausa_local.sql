-- Motor de agentes · pausa del dueño (paso 19 del plan de Pensa Distribuidoras).
-- Solo agrega: no cambia ni borra nada de lo que ya existe. Se corre una vez en Supabase → SQL Editor → New query → pegar → Run.

-- La pausa que pone el dueño desde el panel de su local (api/local.ts). Es distinta de fichas.estado = 'pausado', que la pone
-- Pensa (por ejemplo, por falta de pago) y deja al agente mudo: con pausa_local el agente avisa "ahora te responde una persona"
-- y deja la charla para el equipo. { "desde": "2026-10-18T12:00:00Z", "por": "Tomás" } o null.
alter table fichas add column if not exists pausa_local jsonb;
