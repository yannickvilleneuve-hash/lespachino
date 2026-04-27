-- Whitelist des courriels autorisés à se connecter via magic link.
-- Avant cette migration, n'importe qui pouvait demander un magic link
-- (Supabase auto-créait un user). Maintenant le server action vérifie
-- que l'email est listé ici.
CREATE TABLE public.app_user (
  email       text PRIMARY KEY,
  full_name   text,
  invited_by  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_user ENABLE ROW LEVEL SECURITY;

-- Tous les users authentifiés ont accès complet (read + invite + retire).
CREATE POLICY app_user_auth_all ON public.app_user
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Bootstrap initial.
INSERT INTO public.app_user (email, full_name, invited_by) VALUES
  ('service@camion-hino.ca', 'Centre du camion Hino — service', 'bootstrap'),
  ('alan@camion-hino.ca',    'Alan Dumais',                    'bootstrap');
