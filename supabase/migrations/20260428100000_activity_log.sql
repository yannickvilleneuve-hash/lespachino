-- Audit log: qui a fait quoi sur le système.
-- Capture publish/unpublish, edits, photos, users, sync, etc.
CREATE TABLE public.activity_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email   text,
  action       text NOT NULL,
  target_type  text,
  target_id    text,
  details      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX activity_log_created_idx ON public.activity_log(created_at DESC);
CREATE INDEX activity_log_user_idx    ON public.activity_log(user_email);
CREATE INDEX activity_log_target_idx  ON public.activity_log(target_type, target_id);
CREATE INDEX activity_log_action_idx  ON public.activity_log(action);

ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY activity_log_auth_all ON public.activity_log
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
