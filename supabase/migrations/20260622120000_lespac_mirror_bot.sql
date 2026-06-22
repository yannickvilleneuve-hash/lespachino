-- LesPAC mirror bot — persistence layer.
-- Anchored on the LesPAC listing id (text), NOT SERTI unit#.
-- All tables admin-only: authenticated full access, anon = no policy.
-- touch_updated_at() already exists globally (20260422120100).

-- ── lespac_listing ──────────────────────────────────────────────
-- Lightweight snapshot of the dealer's active LesPAC listings,
-- refreshed each sync cycle. Absent from a pull → status='gone' (sold).
CREATE TABLE IF NOT EXISTS public.lespac_listing (
  lespac_id     text PRIMARY KEY,
  title         text NOT NULL DEFAULT '',
  price_cad     numeric,
  description   text NOT NULL DEFAULT '',
  photo_urls    text[] NOT NULL DEFAULT ARRAY[]::text[],
  content_hash  text NOT NULL,
  status        text NOT NULL DEFAULT 'active',
  first_seen    timestamptz NOT NULL DEFAULT now(),
  last_seen     timestamptz NOT NULL DEFAULT now(),
  raw           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lespac_listing_status_valid
    CHECK (status IN ('active','gone'))
);

CREATE INDEX IF NOT EXISTS lespac_listing_status_idx
  ON public.lespac_listing(status, last_seen DESC);

ALTER TABLE public.lespac_listing ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lespac_listing_auth_all ON public.lespac_listing;
CREATE POLICY lespac_listing_auth_all ON public.lespac_listing
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS lespac_listing_touch ON public.lespac_listing;
CREATE TRIGGER lespac_listing_touch
  BEFORE UPDATE ON public.lespac_listing
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ── platform_publication ────────────────────────────────────────
-- The mirror state: per (lespac_id, platform) memory that makes the
-- reconciler idempotent. published_hash ≠ lespac_listing.content_hash
-- ⇒ UPDATE due.
CREATE TABLE IF NOT EXISTS public.platform_publication (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lespac_id        text NOT NULL
                     REFERENCES public.lespac_listing(lespac_id)
                     ON DELETE CASCADE,
  platform         text NOT NULL,
  status           text NOT NULL DEFAULT 'pending',
  external_url     text,
  external_id      text,
  published_hash   text,
  last_action      text,
  attempt_count    int NOT NULL DEFAULT 0,
  last_attempt_at  timestamptz,
  last_success_at  timestamptz,
  error_message    text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_publication_platform_valid
    CHECK (platform IN ('facebook','kijiji','autotrader')),
  CONSTRAINT platform_publication_status_valid
    CHECK (status IN ('pending','live','failed','removed')),
  CONSTRAINT platform_publication_last_action_valid
    CHECK (last_action IS NULL OR last_action IN ('create','update','remove')),
  CONSTRAINT platform_publication_unique_per_platform
    UNIQUE (lespac_id, platform)
);

CREATE INDEX IF NOT EXISTS platform_publication_platform_status_idx
  ON public.platform_publication(platform, status);

CREATE INDEX IF NOT EXISTS platform_publication_lespac_id_idx
  ON public.platform_publication(lespac_id);

ALTER TABLE public.platform_publication ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS platform_publication_auth_all ON public.platform_publication;
CREATE POLICY platform_publication_auth_all ON public.platform_publication
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS platform_publication_touch ON public.platform_publication;
CREATE TRIGGER platform_publication_touch
  BEFORE UPDATE ON public.platform_publication
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ── bot_event ───────────────────────────────────────────────────
-- Append-only history. Powers the dashboard timeline and alert dedup.
-- No updated_at / no touch trigger: rows are never updated.
CREATE TABLE IF NOT EXISTS public.bot_event (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lespac_id        text,
  platform         text,
  action           text NOT NULL,
  outcome          text NOT NULL,
  detail           jsonb NOT NULL DEFAULT '{}'::jsonb,
  screenshot_path  text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bot_event_platform_valid
    CHECK (platform IS NULL OR platform IN ('facebook','kijiji','autotrader')),
  CONSTRAINT bot_event_outcome_valid
    CHECK (outcome IN ('success','failure','skipped','sent'))
);

CREATE INDEX IF NOT EXISTS bot_event_created_at_idx
  ON public.bot_event(created_at DESC);

CREATE INDEX IF NOT EXISTS bot_event_lespac_platform_idx
  ON public.bot_event(lespac_id, platform, created_at DESC);

ALTER TABLE public.bot_event ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bot_event_auth_all ON public.bot_event;
CREATE POLICY bot_event_auth_all ON public.bot_event
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── platform_session ────────────────────────────────────────────
-- Session health for the dashboard banner. One row per platform.
CREATE TABLE IF NOT EXISTS public.platform_session (
  platform           text PRIMARY KEY,
  health             text NOT NULL DEFAULT 'unknown',
  last_validated_at  timestamptz,
  last_error         text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_session_platform_valid
    CHECK (platform IN ('facebook','kijiji','autotrader')),
  CONSTRAINT platform_session_health_valid
    CHECK (health IN ('healthy','needs_reauth','unknown'))
);

ALTER TABLE public.platform_session ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS platform_session_auth_all ON public.platform_session;
CREATE POLICY platform_session_auth_all ON public.platform_session
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS platform_session_touch ON public.platform_session;
CREATE TRIGGER platform_session_touch
  BEFORE UPDATE ON public.platform_session
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
