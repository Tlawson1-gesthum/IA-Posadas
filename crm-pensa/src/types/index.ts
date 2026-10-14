// Organization & Auth
export interface Organization {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  updated_at: string;
}

export interface User {
  id: string;
  org_id: string;
  email: string;
  name: string;
  role: "admin" | "agent" | "viewer";
  created_at: string;
}

// Leads & Contacts
export interface Contact {
  id: string;
  org_id: string;
  name: string;
  email?: string;
  phone?: string;
  whatsapp?: string;
  instagram?: string;
  tiktok?: string;
  source: "whatsapp" | "email" | "instagram" | "tiktok";
  stage: "lead" | "propuesta" | "cliente" | "inactivo";
  score: number; // Pasti's AI scoring
  last_interaction: string;
  created_at: string;
  updated_at: string;
}

// Messages & Conversations
export interface Message {
  id: string;
  contact_id: string;
  org_id: string;
  channel: "whatsapp" | "email" | "instagram" | "tiktok";
  direction: "inbound" | "outbound";
  content: string;
  intent?: "consulta" | "pedido" | "queja" | "seguimiento";
  pasti_response?: string;
  pasti_action?: string;
  created_at: string;
}

// Stages & Blueprints
export interface Stage {
  id: string;
  org_id: string;
  name: string;
  order: number;
  required_fields: string[];
  auto_actions?: string[];
}

export interface Workflow {
  id: string;
  org_id: string;
  name: string;
  trigger: string;
  actions: WorkflowAction[];
  enabled: boolean;
}

export interface WorkflowAction {
  type: "send_message" | "update_stage" | "assign_user" | "create_task";
  config: Record<string, unknown>;
}
