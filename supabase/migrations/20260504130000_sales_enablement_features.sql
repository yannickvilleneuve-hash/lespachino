-- Fonctions ventes: vidéo walkaround + analytics VDP plus précis.

ALTER TABLE public.listing
  ADD COLUMN IF NOT EXISTS walkaround_video_url text;

ALTER TABLE public.view_event
  ADD COLUMN IF NOT EXISTS event_type text NOT NULL DEFAULT 'page_view',
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS view_event_event_created_idx
  ON public.view_event(event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS view_event_unit_event_created_idx
  ON public.view_event(unit, event_type, created_at DESC);
