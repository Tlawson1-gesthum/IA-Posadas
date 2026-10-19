import express, { NextFunction, Request, Response } from "express";
import dotenv from "dotenv";
import { authMiddleware } from "./middleware/auth.js";
import contactRoutes from "./api/contacts.js";
import messageRoutes from "./api/messages.js";
import webhookRoutes from "./api/webhooks.js";

dotenv.config();

export const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Webhooks: sin login, los valida cada canal
app.use("/webhooks", webhookRoutes);

app.use("/api", authMiddleware);
app.use("/api/contacts", contactRoutes);
app.use("/api/messages", messageRoutes);

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: err.message });
});

if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => {
    console.log(`CRM Pensa running on http://localhost:${PORT}`);
  });
}
