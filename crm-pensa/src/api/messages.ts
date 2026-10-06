import { Router } from "express";
import { AuthRequest } from "../middleware/auth.js";
import { classifyAndRespond } from "../agents/pasti.js";

const router = Router();

// GET /api/messages/:contactId - Get conversation history
router.get("/:contactId", async (req: AuthRequest, res) => {
  try {
    const supabase = req.db!;
    const { contactId } = req.params;

    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("contact_id", contactId)
      .eq("org_id", req.org_id)
      .order("created_at", { ascending: true });

    if (error) throw error;
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/messages - Create message and trigger Pasti
router.post("/", async (req: AuthRequest, res) => {
  try {
    const supabase = req.db!;
    const { contact_id, channel, content } = req.body;

    // Save message
    const { data: message, error } = await supabase
      .from("messages")
      .insert([
        {
          org_id: req.org_id,
          contact_id,
          channel,
          direction: "inbound",
          content,
        },
      ])
      .select();

    if (error) throw error;

    // Classify and respond with Pasti
    const classification = await classifyAndRespond(content, {
      org_id: req.org_id!,
      contact_id,
    });

    res.status(201).json({ message: message[0], classification });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
