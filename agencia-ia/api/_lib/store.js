// Almacenamiento de turnos y contactos.
// En Vercel se conecta Upstash Redis desde el Marketplace, que carga KV_REST_API_URL y KV_REST_API_TOKEN
// (o UPSTASH_REDIS_REST_URL y UPSTASH_REDIS_REST_TOKEN). Sin esas variables usa memoria: sirve para
// probar, pero se borra cada vez que la función se reinicia.
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
export const persistente = Boolean(URL_ && TOKEN);

const mem = { sets: new Map(), hashes: new Map(), keys: new Map() };

async function redis(...cmd) {
  const r = await fetch(URL_, {
    method: "POST",
    headers: { Authorization: "Bearer " + TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify(cmd),
  });
  const j = await r.json();
  if (j.error) throw new Error("Redis: " + j.error);
  return j.result;
}

// Reserva un horario solo si nadie lo tomó antes. Devuelve true si lo consiguió.
export async function claim(key) {
  if (persistente) return (await redis("SET", key, "1", "NX")) === "OK";
  if (mem.keys.has(key)) return false;
  mem.keys.set(key, "1");
  return true;
}

export async function addToSet(set, member) {
  if (persistente) return redis("SADD", set, member);
  if (!mem.sets.has(set)) mem.sets.set(set, new Set());
  mem.sets.get(set).add(member);
}

export async function members(set) {
  if (persistente) return (await redis("SMEMBERS", set)) || [];
  return [...(mem.sets.get(set) || [])];
}

export async function hset(hash, field, obj) {
  if (persistente) return redis("HSET", hash, field, JSON.stringify(obj));
  if (!mem.hashes.has(hash)) mem.hashes.set(hash, new Map());
  mem.hashes.get(hash).set(field, JSON.stringify(obj));
}

export async function hget(hash, field) {
  const v = persistente ? await redis("HGET", hash, field) : mem.hashes.get(hash)?.get(field);
  return v ? JSON.parse(v) : null;
}

export async function hgetall(hash) {
  if (persistente) {
    const flat = (await redis("HGETALL", hash)) || [];
    const out = [];
    for (let i = 0; i < flat.length; i += 2) out.push(Object.assign({ id: flat[i] }, JSON.parse(flat[i + 1])));
    return out;
  }
  return [...(mem.hashes.get(hash) || new Map())].map(([id, v]) => Object.assign({ id }, JSON.parse(v)));
}
