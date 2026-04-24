-- Event log des vues sur les fiches publiques /vehicule/[unit].
-- Fire-and-forget insert depuis le Server Component. Permet d'afficher
-- "vues 7j" / "leads 7j" par véhicule dans l'admin.
CREATE TABLE public.view_event (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit       text NOT NULL,
  ip_hash    text,
  user_agent text,
  referrer   text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX view_event_unit_created_idx ON public.view_event(unit, created_at DESC);
CREATE INDEX view_event_created_idx      ON public.view_event(created_at DESC);

ALTER TABLE public.view_event ENABLE ROW LEVEL SECURITY;

CREATE POLICY view_event_anon_insert ON public.view_event
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY view_event_auth_all ON public.view_event
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
