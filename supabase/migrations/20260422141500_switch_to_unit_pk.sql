-- SERTI WGI a des VINs dupliqués en pratique (2 cas constatés sur 262
-- véhicules). La clé canonique dealer est WGIUNM (unit#), 100% unique.
-- On migre listing.vin → listing.unit et vehicle_photo.vin → vehicle_photo.unit.
-- Tables vides à cette étape, donc DROP + CREATE sans perte.

DROP TABLE public.vehicle_photo;
DROP TABLE public.listing;

CREATE TABLE public.listing (
  unit           text PRIMARY KEY,
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

CREATE TRIGGER listing_touch BEFORE UPDATE ON public.listing
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.vehicle_photo (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit          text NOT NULL,
  storage_path  text NOT NULL UNIQUE,
  position      integer NOT NULL DEFAULT 0,
  is_hero       boolean NOT NULL DEFAULT false,
  uploaded_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  uploaded_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX vehicle_photo_unit_idx ON public.vehicle_photo(unit);
CREATE UNIQUE INDEX vehicle_photo_one_hero_per_unit
  ON public.vehicle_photo(unit) WHERE is_hero = true;

ALTER TABLE public.listing       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_photo ENABLE ROW LEVEL SECURITY;

CREATE POLICY listing_auth_all ON public.listing
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY vehicle_photo_auth_all ON public.vehicle_photo
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
