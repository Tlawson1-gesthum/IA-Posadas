import { Router } from "express";
import { AuthRequest } from "../middleware/auth.js";

const router = Router();

const EDITABLE = ["name", "email", "phone", "whatsapp", "instagram", "tiktok", "stage", "score"];

function pick(body: Record<string, unknown>, keys: string[]) {
  return Object.fromEntries(Object.entries(body ?? {}).filter(([k]) => keys.includes(k)));
}

// GET /api/contacts - List all contacts
router.get("/", async (req: AuthRequest, res) => {
  try {
    const supabase = req.db!;
    const { data, error } = await supabase
      .from("contacts")
      .select("*")
      .eq("org_id", req.org_id)
      .order("created_at", { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/contacts - Create contact
router.post("/", async (req: AuthRequest, res) => {
  try {
    const supabase = req.db!;
    const { name, email, phone, whatsapp, source } = req.body;

    const { data, error } = await supabase
      .from("contacts")
      .insert([
        {
          org_id: req.org_id,
          name,
          email,
          phone,
          whatsapp,
          source,
          stage: "lead",
          score: 0,
          last_interaction: new Date().toISOString(),
        },
      ])
      .select();

    if (error) throw error;
    res.status(201).json(data[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/contacts/:id - Update contact
router.patch("/:id", async (req: AuthRequest, res) => {
  try {
    const supabase = req.db!;
    const { id } = req.params;

    const { data, error } = await supabase
      .from("contacts")
      .update({ ...pick(req.body, EDITABLE), updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("org_id", req.org_id)
      .select();

    if (error) throw error;
    res.json(data[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
