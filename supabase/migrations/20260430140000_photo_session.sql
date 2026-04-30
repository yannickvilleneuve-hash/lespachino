-- Sessions de capture mobile éphémères. L'admin crée un token sur la fiche
-- véhicule, génère un QR code, le vendeur scanne avec son tél et upload
-- les photos sans login. Token expire après 30 min, max 30 photos par
-- session pour éviter abuse.
CREATE TABLE public.photo_session (
  token         text PRIMARY KEY,
  unit          text NOT NULL,
  expires_at    timestamptz NOT NULL,
  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  max_uploads   int NOT NULL DEFAULT 30,
  used_count    int NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX photo_session_unit_idx ON public.photo_session(unit);
CREATE INDEX photo_session_expires_idx ON public.photo_session(expires_at);

ALTER TABLE public.photo_session ENABLE ROW LEVEL SECURITY;

-- Authenticated users gèrent les sessions; le upload anon passe par
-- service_role côté serveur (bypass RLS).
CREATE POLICY photo_session_auth_all ON public.photo_session
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
