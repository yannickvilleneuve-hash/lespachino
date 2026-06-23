CREATE TABLE IF NOT EXISTS public.bot_setting (
  id                 int PRIMARY KEY DEFAULT 1,
  enabled_platforms  text[] NOT NULL DEFAULT ARRAY['facebook']::text[],
  sync_interval_sec  int NOT NULL DEFAULT 3600,
  operator_email     text NOT NULL DEFAULT '',
  max_jobs_per_cycle int NOT NULL DEFAULT 8,
  pace_min_ms        int NOT NULL DEFAULT 4000,
  pace_max_ms        int NOT NULL DEFAULT 12000,
  updated_by         text,
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bot_setting_singleton CHECK (id = 1),
  CONSTRAINT bot_setting_interval_valid CHECK (sync_interval_sec >= 300),
  CONSTRAINT bot_setting_cap_valid CHECK (max_jobs_per_cycle BETWEEN 1 AND 100),
  CONSTRAINT bot_setting_pace_valid CHECK (pace_min_ms >= 0 AND pace_max_ms >= pace_min_ms)
);

DROP TRIGGER IF EXISTS bot_setting_touch ON public.bot_setting;
CREATE TRIGGER bot_setting_touch
  BEFORE UPDATE ON public.bot_setting
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.bot_setting ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bot_setting_auth_all ON public.bot_setting;
CREATE POLICY bot_setting_auth_all ON public.bot_setting
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO public.bot_setting (id) VALUES (1)
  ON CONFLICT (id) DO NOTHING;
