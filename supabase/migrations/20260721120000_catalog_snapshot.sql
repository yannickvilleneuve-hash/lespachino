-- Snapshot en lecture seule du catalogue LesPAC.
-- LesPAC reste la source de vérité: la synchro écrase, personne n'édite ici.

CREATE TABLE IF NOT EXISTS public.catalog_vehicle (
  id            text PRIMARY KEY,              -- listingId LesPAC
  payload       jsonb NOT NULL,                -- CatalogVehicle normalisé
  status        text NOT NULL DEFAULT 'online',
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  sold_at       timestamptz,
  CONSTRAINT catalog_vehicle_status_valid CHECK (status IN ('online', 'sold'))
);

CREATE INDEX IF NOT EXISTS catalog_vehicle_status_idx
  ON public.catalog_vehicle (status);

CREATE TABLE IF NOT EXISTS public.catalog_photo (
  vehicle_id   text NOT NULL REFERENCES public.catalog_vehicle(id) ON DELETE CASCADE,
  position     int NOT NULL,
  source_url   text NOT NULL,                  -- CDN LesPAC, tel qu'émis dans les feeds
  storage_path text,                           -- miroir bucket vehicle-photos, null si pas encore copié
  PRIMARY KEY (vehicle_id, position)
);

-- Singleton: porte la fraîcheur de la dernière synchro.
CREATE TABLE IF NOT EXISTS public.catalog_sync (
  id     int PRIMARY KEY DEFAULT 1,
  ran_at timestamptz NOT NULL DEFAULT now(),
  ok     boolean NOT NULL DEFAULT false,
  count  int NOT NULL DEFAULT 0,
  error  text,
  CONSTRAINT catalog_sync_singleton CHECK (id = 1)
);

INSERT INTO public.catalog_sync (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.catalog_vehicle ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_photo   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_sync    ENABLE ROW LEVEL SECURITY;

-- Même posture que listing/vehicle_photo: authenticated full access, anon rien.
-- Les pages publiques passent par createAdminClient() (service_role, bypass RLS).
DROP POLICY IF EXISTS catalog_vehicle_auth_all ON public.catalog_vehicle;
CREATE POLICY catalog_vehicle_auth_all ON public.catalog_vehicle
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS catalog_photo_auth_all ON public.catalog_photo;
CREATE POLICY catalog_photo_auth_all ON public.catalog_photo
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS catalog_sync_auth_all ON public.catalog_sync;
CREATE POLICY catalog_sync_auth_all ON public.catalog_sync
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
