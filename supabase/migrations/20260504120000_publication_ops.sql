-- Aligne les canaux de publication avec les connecteurs réels, ajoute le
-- suivi CRM minimal des leads, et rend les claims photo atomiques.

ALTER TABLE public.listing
  DROP CONSTRAINT IF EXISTS listing_channels_valid;

WITH normalized AS (
  SELECT
    unit,
    array_remove(ARRAY[
      CASE WHEN 'native' = ANY(channels) THEN 'native' END,
      CASE WHEN 'wix' = ANY(channels) THEN 'wix' END,
      CASE WHEN 'fb' = ANY(channels) OR 'fb_marketplace' = ANY(channels) THEN 'fb_marketplace' END,
      CASE WHEN 'fb_page' = ANY(channels) THEN 'fb_page' END,
      CASE WHEN 'google_vla' = ANY(channels) THEN 'google_vla' END,
      CASE WHEN 'lespac' = ANY(channels) THEN 'lespac' END,
      CASE WHEN 'kijiji' = ANY(channels) THEN 'kijiji' END
    ]::text[], NULL) AS channels
  FROM public.listing
)
UPDATE public.listing AS l
SET channels =
  CASE
    WHEN array_length(n.channels, 1) > 0 THEN n.channels
    ELSE ARRAY['native','wix','fb_marketplace','fb_page','google_vla','lespac']::text[]
  END
FROM normalized AS n
WHERE n.unit = l.unit;

ALTER TABLE public.listing
  ALTER COLUMN channels SET DEFAULT ARRAY['native','wix','fb_marketplace','fb_page','google_vla','lespac']::text[];

ALTER TABLE public.listing
  ADD CONSTRAINT listing_channels_valid
  CHECK (channels <@ ARRAY['native','wix','fb_marketplace','fb_page','google_vla','lespac','kijiji']::text[]);

ALTER TABLE public.lead
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS assigned_to_email text,
  ADD COLUMN IF NOT EXISTS notes text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS next_follow_up_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_contacted_at timestamptz,
  ADD COLUMN IF NOT EXISTS closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'lead_status_valid'
  ) THEN
    ALTER TABLE public.lead
      ADD CONSTRAINT lead_status_valid
      CHECK (status IN ('new','contacted','follow_up','won','lost'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS lead_status_created_at_idx
  ON public.lead(status, created_at DESC);

CREATE INDEX IF NOT EXISTS lead_ip_created_at_idx
  ON public.lead(ip_hash, created_at DESC);

CREATE OR REPLACE FUNCTION public.touch_lead_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS lead_touch ON public.lead;
CREATE TRIGGER lead_touch
  BEFORE UPDATE ON public.lead
  FOR EACH ROW EXECUTE FUNCTION public.touch_lead_updated_at();

CREATE TABLE IF NOT EXISTS public.publication_job (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit             text NOT NULL,
  channel          text NOT NULL,
  action           text NOT NULL,
  status           text NOT NULL DEFAULT 'pending',
  attempts         int NOT NULL DEFAULT 0,
  max_attempts     int NOT NULL DEFAULT 3,
  next_retry_at    timestamptz,
  last_error       text,
  payload          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_email text,
  started_at       timestamptz,
  completed_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT publication_job_channel_valid
    CHECK (channel IN ('native','wix','fb_marketplace','fb_page','google_vla','lespac','kijiji')),
  CONSTRAINT publication_job_action_valid
    CHECK (action IN ('publish','unpublish','refresh','post')),
  CONSTRAINT publication_job_status_valid
    CHECK (status IN ('pending','running','succeeded','failed','skipped'))
);

CREATE INDEX IF NOT EXISTS publication_job_status_idx
  ON public.publication_job(status, next_retry_at, created_at DESC);

CREATE INDEX IF NOT EXISTS publication_job_unit_channel_idx
  ON public.publication_job(unit, channel, created_at DESC);

ALTER TABLE public.publication_job ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS publication_job_auth_all ON public.publication_job;
CREATE POLICY publication_job_auth_all ON public.publication_job
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS publication_job_touch ON public.publication_job;
CREATE TRIGGER publication_job_touch
  BEFORE UPDATE ON public.publication_job
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.claim_photo_session_upload(p_token text)
RETURNS TABLE (
  unit text,
  expires_at timestamptz,
  max_uploads int,
  used_count int,
  created_by uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.photo_session AS ps
  SET used_count = ps.used_count + 1
  WHERE ps.token = p_token
    AND ps.expires_at >= now()
    AND ps.used_count < ps.max_uploads
  RETURNING ps.unit, ps.expires_at, ps.max_uploads, ps.used_count, ps.created_by;
END $$;

GRANT EXECUTE ON FUNCTION public.claim_photo_session_upload(text) TO anon, authenticated, service_role;
