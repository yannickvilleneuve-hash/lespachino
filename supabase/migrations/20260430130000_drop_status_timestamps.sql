-- Retire le tracking auto de sold_at/quoted_at/serti_status sur listing.
-- Alan gère manuellement la visibilité (toggle Hidden/is_published) — pas
-- besoin de stamper ces dates côté Supabase. SERTI reste source de vérité
-- pour le statut live (lu en temps réel via WGI).
DROP INDEX IF EXISTS public.listing_sold_at_idx;
DROP INDEX IF EXISTS public.listing_serti_status_idx;

ALTER TABLE public.listing DROP CONSTRAINT IF EXISTS listing_serti_status_valid;

ALTER TABLE public.listing
  DROP COLUMN IF EXISTS sold_at,
  DROP COLUMN IF EXISTS quoted_at,
  DROP COLUMN IF EXISTS serti_status;
