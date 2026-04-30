-- Statut véhicule observé côté SERTI (WGISTA), avec timestamps des
-- transitions clés. Permet règle "vendu encore visible 10 jours" et
-- badge "en soumission" (WGISTA='R').
ALTER TABLE public.listing
  ADD COLUMN serti_status text NOT NULL DEFAULT 'available',
  ADD COLUMN sold_at      timestamptz,
  ADD COLUMN quoted_at    timestamptz;

ALTER TABLE public.listing
  ADD CONSTRAINT listing_serti_status_valid
  CHECK (serti_status IN ('available','quoted','sold'));

CREATE INDEX listing_serti_status_idx ON public.listing(serti_status);
CREATE INDEX listing_sold_at_idx      ON public.listing(sold_at);

-- Présence d'un véhicule par canal d'annonce. Une ligne par (unit, canal).
-- Mise à jour à chaque push/sync, pour l'UI admin "Affiché sur".
CREATE TABLE public.listing_channel_state (
  unit            text NOT NULL,
  channel         text NOT NULL,
  last_synced_at  timestamptz,
  last_status     text,
  external_id     text,
  external_url    text,
  last_error      text,
  PRIMARY KEY (unit, channel)
);

ALTER TABLE public.listing_channel_state
  ADD CONSTRAINT listing_channel_state_channel_valid
  CHECK (channel IN ('native','fb','lespac','kijiji','wix'));

CREATE INDEX listing_channel_state_unit_idx ON public.listing_channel_state(unit);

ALTER TABLE public.listing_channel_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY listing_channel_state_auth_all ON public.listing_channel_state
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
