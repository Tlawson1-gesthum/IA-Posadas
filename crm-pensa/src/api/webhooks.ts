import { Router } from "express";

const router = Router();

// Webhook for WhatsApp
router.get("/whatsapp", (req, res) => {
  const verifyToken = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (verifyToken === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    res.send(challenge);
  } else {
    res.status(403).send("Forbidden");
  }
});

router.post("/whatsapp", async (req, res) => {
  // TODO: Process WhatsApp webhook events
  // Update contact, create message, trigger Pasti
  res.status(200).json({ success: true });
});

// Webhook for Instagram
router.post("/instagram", async (req, res) => {
  // TODO: Process Instagram webhook events
  res.status(200).json({ success: true });
});

// Webhook for TikTok
router.post("/tiktok", async (req, res) => {
  // TODO: Process TikTok webhook events
  res.status(200).json({ success: true });
});

// Webhook for Email (via email service)
router.post("/email", async (req, res) => {
  // TODO: Process email events
  res.status(200).json({ success: true });
});

export default router;
