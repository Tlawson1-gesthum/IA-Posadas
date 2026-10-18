// Corre los avisos de cobranza a mano (lo mismo que hace Vercel Cron cada hora, api/cron-avisos.ts).
// Uso: npm run cron-avisos -- distri-demo [--hora 12]      (con WHATSAPP_SIMULAR=1 o sin WHATSAPP_TOKEN solo imprime)
import "./entorno.js";

delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
const { correrAvisos } = await import("../api/cron-avisos.js");
const ficha = process.argv[2];
const i = process.argv.indexOf("--hora");
const hora = i > 0 ? Number(process.argv[i + 1]) : undefined;
if (!ficha) {
  console.error("Uso: npm run cron-avisos -- <ficha> [--hora 12]");
  process.exit(1);
}
const r = await correrAvisos({ soloFicha: ficha, hora });
if (!r.length) console.log(`No hay una ficha de distribuidora activa con id ${ficha}.`);
const total = r.reduce((t, x) => t + x.enviados + x.simulados, 0);
console.log(`Avisos: ${total}`);
process.exit(r.some((x) => x.error) ? 1 : 0);
