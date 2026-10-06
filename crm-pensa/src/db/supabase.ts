import { createClient, SupabaseClient } from "@supabase/supabase-js";

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

// Cliente con el token del usuario: respeta RLS.
export function clientForToken(token: string): SupabaseClient {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
}

// Cliente de servicio: solo para webhooks, que no tienen usuario. Saltea RLS,
// así que cada consulta debe filtrar por org_id a mano.
export function serviceClient(): SupabaseClient {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_KEY"), {
    auth: { persistSession: false },
  });
}
