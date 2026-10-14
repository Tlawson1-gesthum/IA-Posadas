import { Request, Response, NextFunction } from "express";
import { SupabaseClient } from "@supabase/supabase-js";
import { clientForToken } from "../db/supabase.js";

export interface AuthRequest extends Request {
  org_id?: string;
  user_id?: string;
  db?: SupabaseClient;
}

// Verifica el token de Supabase Auth y resuelve la organización del usuario.
// Las consultas usan req.db, que corre con el token del usuario: RLS limita todo a su organización.
export async function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const db = clientForToken(header.slice(7));
  const { data: auth, error } = await db.auth.getUser();
  if (error || !auth.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { data: user } = await db.from("users").select("org_id").eq("id", auth.user.id).single();
  if (!user) {
    return res.status(403).json({ error: "User has no organization" });
  }

  req.user_id = auth.user.id;
  req.org_id = user.org_id;
  req.db = db;
  next();
}
