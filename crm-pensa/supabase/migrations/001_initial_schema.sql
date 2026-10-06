-- Organizations (multi-tenant support)
CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- Users
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT DEFAULT 'agent' CHECK (role IN ('admin', 'agent', 'viewer')),
  created_at TIMESTAMP DEFAULT now(),
  UNIQUE(org_id, email)
);

-- Contacts (Leads)
CREATE TABLE IF NOT EXISTS public.contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  whatsapp TEXT,
  instagram TEXT,
  tiktok TEXT,
  source TEXT NOT NULL CHECK (source IN ('whatsapp', 'email', 'instagram', 'tiktok')),
  stage TEXT DEFAULT 'lead' CHECK (stage IN ('lead', 'propuesta', 'cliente', 'inactivo')),
  score INTEGER DEFAULT 0,
  last_interaction TIMESTAMP DEFAULT now(),
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- Messages (Chat History)
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp', 'email', 'instagram', 'tiktok')),
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  content TEXT NOT NULL,
  intent TEXT CHECK (intent IN ('consulta', 'pedido', 'queja', 'seguimiento')),
  pasti_response TEXT,
  pasti_action TEXT,
  created_at TIMESTAMP DEFAULT now()
);

-- Stages (Pipeline)
CREATE TABLE IF NOT EXISTS public.stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  "order" INTEGER NOT NULL,
  required_fields TEXT[],
  auto_actions TEXT[],
  UNIQUE(org_id, "order")
);

-- Workflows/Rules
CREATE TABLE IF NOT EXISTS public.workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  trigger TEXT NOT NULL,
  actions JSONB NOT NULL,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT now()
);

-- Row-level security: cada usuario solo ve los datos de su organización.
-- users.id coincide con auth.users.id (Supabase Auth).
CREATE OR REPLACE FUNCTION public.current_org_id() RETURNS UUID
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT org_id FROM public.users WHERE id = auth.uid()
$$;

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflows ENABLE ROW LEVEL SECURITY;

CREATE POLICY org_read ON public.organizations FOR SELECT USING (id = public.current_org_id());
CREATE POLICY org_users ON public.users FOR SELECT USING (org_id = public.current_org_id());
CREATE POLICY org_contacts ON public.contacts FOR ALL
  USING (org_id = public.current_org_id()) WITH CHECK (org_id = public.current_org_id());
CREATE POLICY org_messages ON public.messages FOR ALL
  USING (org_id = public.current_org_id()) WITH CHECK (org_id = public.current_org_id());
CREATE POLICY org_stages ON public.stages FOR ALL
  USING (org_id = public.current_org_id()) WITH CHECK (org_id = public.current_org_id());
CREATE POLICY org_workflows ON public.workflows FOR ALL
  USING (org_id = public.current_org_id()) WITH CHECK (org_id = public.current_org_id());

CREATE INDEX IF NOT EXISTS contacts_org_idx ON public.contacts(org_id);
CREATE INDEX IF NOT EXISTS messages_contact_idx ON public.messages(contact_id, created_at);
