import { meetingSlots, slotLabel } from "./slots.js";
import { claim, addToSet, members, hset } from "./store.js";
import { clip } from "./http.js";

// Agenda la reunión de diagnóstico y crea la ficha en el CRM. Lanza un Error con un mensaje legible si no se puede.
export async function bookMeeting(input) {
  const busy = new Set(await members("agenda"));
  const slot = clip(input.slot_id, 20);
  if (!meetingSlots(busy).some(s => s.id === slot)) throw new Error("Ese horario no está libre. Consultá ver_horarios y ofrecé otro.");
  if (!clip(input.nombre, 80) || !clip(input.whatsapp, 30)) throw new Error("Faltan el nombre y el WhatsApp. Pedíselos antes de agendar.");
  if (!(await claim("reunion:" + slot))) throw new Error("Ese horario se acaba de ocupar. Ofrecé otro.");
  await addToSet("agenda", slot);
  const now = new Date().toISOString();
  const lead = {
    nombre: clip(input.nombre, 80), negocio: clip(input.negocio, 80), rubro: clip(input.rubro, 40),
    whatsapp: clip(input.whatsapp, 30), problema: clip(input.problema, 300),
    etapa: "Reunión agendada", origen: clip(input.origen, 40) || "Landing · agente Nico", reunion: slot, reunionTexto: slotLabel(slot), creado: now, actualizado: now,
  };
  await hset("leads", "l-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), lead);
  return lead;
}
