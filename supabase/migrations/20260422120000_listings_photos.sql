-- Catalogue prix + métadonnées vente, une ligne par véhicule SERTI
CREATE TABLE public.listing (
  vin            text PRIMARY KEY,
  price_cad      numeric(10,2) NOT NULL DEFAULT 0,
  description_fr text NOT NULL DEFAULT '',
  is_published   boolean NOT NULL DEFAULT false,
  channels       text[] NOT NULL DEFAULT ARRAY['native','fb','lespac','kijiji'],
  updated_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX listing_published_idx ON public.listing(is_published) WHERE is_published = true;

ALTER TABLE public.listing ADD CONSTRAINT listing_channels_valid
  CHECK (channels <@ ARRAY['native','fb','lespac','kijiji']::text[]);

CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

CREATE TRIGGER listing_touch BEFORE UPDATE ON public.listing
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.vehicle_photo (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vin           text NOT NULL,
  storage_path  text NOT NULL UNIQUE,
  position      integer NOT NULL DEFAULT 0,
  is_hero       boolean NOT NULL DEFAULT false,
  uploaded_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  uploaded_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX vehicle_photo_vin_idx ON public.vehicle_photo(vin);
CREATE UNIQUE INDEX vehicle_photo_one_hero_per_vin
  ON public.vehicle_photo(vin) WHERE is_hero = true;

ALTER TABLE public.listing       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_photo ENABLE ROW LEVEL SECURITY;

CREATE POLICY listing_auth_all ON public.listing
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY vehicle_photo_auth_all ON public.vehicle_photo
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO storage.buckets (id, name, public) VALUES ('vehicle-photos', 'vehicle-photos', false)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY vehicle_photos_read ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'vehicle-photos');
CREATE POLICY vehicle_photos_write ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'vehicle-photos');
CREATE POLICY vehicle_photos_update ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'vehicle-photos');
CREATE POLICY vehicle_photos_delete ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'vehicle-photos');
