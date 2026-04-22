CREATE TABLE public.lead (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit         text NOT NULL,
  name         text NOT NULL,
  phone        text,
  email        text,
  message      text NOT NULL DEFAULT '',
  user_agent   text,
  ip_hash      text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX lead_unit_idx       ON public.lead(unit);
CREATE INDEX lead_created_at_idx ON public.lead(created_at DESC);

ALTER TABLE public.lead ENABLE ROW LEVEL SECURITY;

CREATE POLICY lead_auth_all ON public.lead
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- INSERT public (anon) via server action qui valide Zod + rate limit côté app.
CREATE POLICY lead_anon_insert ON public.lead
  FOR INSERT TO anon WITH CHECK (true);
