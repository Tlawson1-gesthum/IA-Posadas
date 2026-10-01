// Horarios de la reunión de diagnóstico, en hora de Argentina (UTC-3, sin horario de verano).
const DAYN = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const TIMES = ["10:00", "11:30", "15:00", "17:30"];

export function argentinaToday() {
  const d = new Date(Date.now() - 3 * 3600e3);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function meetingSlots(busy) {
  const out = [], base = argentinaToday();
  for (let k = 1; out.length < 8 && k < 20; k++) {
    const x = new Date(base.getTime() + k * 864e5), wd = x.getUTCDay();
    if (wd === 0 || wd === 6) continue;
    const ymd = x.toISOString().slice(0, 10);
    for (const t of TIMES) {
      const id = ymd + "_" + t.replace(":", "");
      if (!busy.has(id)) out.push({ id, label: DAYN[wd].replace(/^./, c => c.toUpperCase()) + " " + x.getUTCDate() + " · " + t + " h" });
    }
  }
  return out.slice(0, 8);
}

export function slotLabel(id) {
  const [ymd, hm] = id.split("_");
  const x = new Date(ymd + "T00:00:00Z");
  return DAYN[x.getUTCDay()].replace(/^./, c => c.toUpperCase()) + " " + x.getUTCDate() + " · " + hm.slice(0, 2) + ":" + hm.slice(2) + " h";
}
