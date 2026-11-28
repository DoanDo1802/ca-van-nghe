-- ============================================================================
-- Ca Van Nghe - Lean Event Tracking & Admin Analytics Schema (Supabase Free)
-- Target budget: ~50-100 MB/month steady state (auto-rollup + auto-purge)
-- Run this in Supabase SQL Editor. Safe to re-run (idempotent).
-- ============================================================================

-- 1. Extend app_settings with analytics controls
ALTER TABLE IF EXISTS public.app_settings
  ADD COLUMN IF NOT EXISTS analytics_level smallint NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS analytics_retention_days smallint NOT NULL DEFAULT 30;

-- 2. Server-side tables (Tier A)
CREATE TABLE IF NOT EXISTS public.room_sessions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  player_id text,
  device_id text,
  player_name text,
  room_id text,
  scene_id text,
  is_host boolean DEFAULT false,
  is_admin boolean DEFAULT false,
  joined_at timestamptz,
  left_at timestamptz NOT NULL DEFAULT now(),
  duration_s integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_room_sessions_left_at ON public.room_sessions (left_at DESC);
CREATE INDEX IF NOT EXISTS idx_room_sessions_device ON public.room_sessions (device_id, left_at DESC);

CREATE TABLE IF NOT EXISTS public.ccu_minutely (
  ts timestamptz PRIMARY KEY,
  total smallint NOT NULL DEFAULT 0,
  rooms smallint NOT NULL DEFAULT 0,
  lobby smallint NOT NULL DEFAULT 0,
  cinema smallint NOT NULL DEFAULT 0,
  tearoom smallint NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ts timestamptz NOT NULL DEFAULT now(),
  actor text,
  action text NOT NULL,
  target text,
  old_val jsonb,
  new_val jsonb
);
CREATE INDEX IF NOT EXISTS idx_admin_audit_ts ON public.admin_audit_log (ts DESC);

-- 3. Client session summaries (Tier B - 1 row per session)
CREATE TABLE IF NOT EXISTS public.session_summaries (
  session_id uuid PRIMARY KEY,
  device_id text NOT NULL,
  account_id text,
  is_guest boolean NOT NULL DEFAULT true,
  platform text NOT NULL DEFAULT 'desktop',
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz NOT NULL DEFAULT now(),
  active_s integer NOT NULL DEFAULT 0,
  s jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_session_summaries_started ON public.session_summaries (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_session_summaries_device ON public.session_summaries (device_id, started_at DESC);

-- 4. Key discrete events (Tier C - ~17 event types, short numeric codes)
-- Event codes (n):
--  1=session_start, 2=auth_result, 3=avatar_pick, 4=room_create, 5=room_join,
--  6=room_denied, 7=scene_switch, 8=karaoke_song, 9=karaoke_search, 10=karaoke_blocked,
-- 11=karaoke_record, 12=stage_media, 13=mic_perm, 14=voice_policy, 15=kicked,
-- 16=error, 17=perf_bad
-- Scene codes (scene_id):
--  1=lobby, 2=cinema, 3=tearoom, 0=other
CREATE TABLE IF NOT EXISTS public.analytics_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ts timestamptz NOT NULL DEFAULT now(),
  n smallint NOT NULL,
  session_id uuid,
  device_id text NOT NULL,
  room_id text,
  scene_id smallint DEFAULT 0,
  p jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_analytics_events_n_ts ON public.analytics_events (n, ts DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_ts ON public.analytics_events (ts DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_device ON public.analytics_events (device_id, ts DESC);

-- Rate limit buckets for track_batch
CREATE TABLE IF NOT EXISTS public.rate_buckets (
  device_id text NOT NULL,
  hour_bucket timestamptz NOT NULL,
  cnt integer NOT NULL DEFAULT 0,
  PRIMARY KEY (device_id, hour_bucket)
);

-- 5. Long-term aggregated tables (tiny footprint)
CREATE TABLE IF NOT EXISTS public.players_daily (
  day date NOT NULL,
  device_id text NOT NULL,
  account_id text,
  is_guest boolean NOT NULL DEFAULT true,
  sessions integer NOT NULL DEFAULT 0,
  active_s integer NOT NULL DEFAULT 0,
  first_seen date NOT NULL,
  PRIMARY KEY (day, device_id)
);
CREATE INDEX IF NOT EXISTS idx_players_daily_first ON public.players_daily (first_seen, day);

CREATE TABLE IF NOT EXISTS public.daily_metrics (
  day date NOT NULL,
  m text NOT NULL,
  dim text NOT NULL DEFAULT '',
  v double precision NOT NULL DEFAULT 0,
  PRIMARY KEY (day, m, dim)
);

CREATE TABLE IF NOT EXISTS public.heatmap_daily (
  day date NOT NULL,
  scene smallint NOT NULL,
  cell smallint NOT NULL,
  n integer NOT NULL DEFAULT 0,
  PRIMARY KEY (day, scene, cell)
);

CREATE TABLE IF NOT EXISTS public.top_daily (
  day date NOT NULL,
  kind text NOT NULL,
  key text NOT NULL,
  n integer NOT NULL DEFAULT 0,
  PRIMARY KEY (day, kind, key)
);

CREATE TABLE IF NOT EXISTS public.error_groups (
  hash text PRIMARY KEY,
  src text,
  sample_msg text,
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now(),
  total integer NOT NULL DEFAULT 0,
  sessions integer NOT NULL DEFAULT 0
);

-- Overall monthly summary (kept forever, ~200 bytes/month)
CREATE TABLE IF NOT EXISTS public.monthly_metrics (
  month date PRIMARY KEY,
  mau integer NOT NULL DEFAULT 0,
  new_users integer NOT NULL DEFAULT 0,
  sessions integer NOT NULL DEFAULT 0,
  total_active_s bigint NOT NULL DEFAULT 0,
  avg_session_s integer NOT NULL DEFAULT 0,
  peak_ccu smallint NOT NULL DEFAULT 0,
  avg_ccu real NOT NULL DEFAULT 0,
  songs integer NOT NULL DEFAULT 0,
  errors integer NOT NULL DEFAULT 0,
  chat integer NOT NULL DEFAULT 0,
  clap integer NOT NULL DEFAULT 0
);

-- 6. Row Level Security (block direct client access; all writes via SECURITY DEFINER RPC)
ALTER TABLE public.room_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ccu_minutely ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_buckets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.players_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.heatmap_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.top_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.error_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_metrics ENABLE ROW LEVEL SECURITY;

-- Helper: verify caller is an active Admin
CREATE OR REPLACE FUNCTION public.is_admin_caller()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.accounts a
    WHERE a.user_id = auth.uid()
      AND a.role = 'admin'
      AND a.is_active = true
  );
$$;

-- 7. Server-side Triggers (Tier A)
CREATE OR REPLACE FUNCTION public.fn_log_room_session_on_leave()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dur integer;
BEGIN
  v_dur := GREATEST(0, COALESCE(EXTRACT(EPOCH FROM (now() - OLD.joined_at))::integer, 0));
  INSERT INTO public.room_sessions (
    player_id, device_id, player_name, room_id, scene_id, is_host, is_admin, joined_at, left_at, duration_s
  ) VALUES (
    OLD.player_id, OLD.device_id, OLD.player_name, OLD.room_id, OLD.scene_id,
    COALESCE(OLD.is_host, false), COALESCE(OLD.is_admin, false), OLD.joined_at, now(), v_dur
  );
  RETURN OLD;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.room_players') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_room_players_session ON public.room_players;
    CREATE TRIGGER trg_room_players_session
      AFTER DELETE ON public.room_players
      FOR EACH ROW EXECUTE FUNCTION public.fn_log_room_session_on_leave();
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.fn_audit_banned_players()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.admin_audit_log (actor, action, target, new_val)
    VALUES (
      COALESCE(NEW.banned_by::text, 'admin'),
      'ban_player',
      COALESCE(NEW.player_name, NEW.player_id, NEW.device_id),
      jsonb_build_object('room_id', NEW.room_id, 'reason', NEW.reason, 'device_id', NEW.device_id)
    );
  ELSIF TG_OP = 'UPDATE' AND OLD.is_active = true AND NEW.is_active = false THEN
    INSERT INTO public.admin_audit_log (actor, action, target, old_val)
    VALUES (
      'admin',
      'unban_player',
      COALESCE(NEW.player_name, NEW.player_id, NEW.device_id),
      jsonb_build_object('room_id', NEW.room_id, 'reason', NEW.reason)
    );
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.banned_players') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_banned_players_audit ON public.banned_players;
    CREATE TRIGGER trg_banned_players_audit
      AFTER INSERT OR UPDATE ON public.banned_players
      FOR EACH ROW EXECUTE FUNCTION public.fn_audit_banned_players();
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.fn_audit_app_settings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.max_total_players IS DISTINCT FROM NEW.max_total_players
     OR OLD.max_players_per_room IS DISTINCT FROM NEW.max_players_per_room
     OR OLD.analytics_level IS DISTINCT FROM NEW.analytics_level
     OR OLD.analytics_retention_days IS DISTINCT FROM NEW.analytics_retention_days THEN
    INSERT INTO public.admin_audit_log (actor, action, target, old_val, new_val)
    VALUES (
      COALESCE(NEW.updated_by::text, 'admin'),
      'update_settings',
      'app_settings',
      jsonb_build_object(
        'max_total', OLD.max_total_players,
        'max_per_room', OLD.max_players_per_room,
        'analytics_level', OLD.analytics_level,
        'retention_days', OLD.analytics_retention_days
      ),
      jsonb_build_object(
        'max_total', NEW.max_total_players,
        'max_per_room', NEW.max_players_per_room,
        'analytics_level', NEW.analytics_level,
        'retention_days', NEW.analytics_retention_days
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.app_settings') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_app_settings_audit ON public.app_settings;
    CREATE TRIGGER trg_app_settings_audit
      AFTER UPDATE ON public.app_settings
      FOR EACH ROW EXECUTE FUNCTION public.fn_audit_app_settings();
  END IF;
END $$;

-- 8. Public RPC: get analytics level
CREATE OR REPLACE FUNCTION public.get_analytics_config()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'level', COALESCE((SELECT analytics_level FROM public.app_settings WHERE id = 1), 2)
  );
$$;

-- 9. Public RPC: track_batch (rate-limited, size-capped ingestion)
CREATE OR REPLACE FUNCTION public.track_batch(
  p_device_id text,
  p_summary jsonb DEFAULT NULL,
  p_events jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_level smallint := 2;
  v_bucket timestamptz := date_trunc('hour', now());
  v_cnt integer := 0;
  v_ev jsonb;
  v_n smallint;
  v_props jsonb;
  v_inserted integer := 0;
  v_sid uuid;
  v_err_hash text;
  v_err_src text;
  v_err_msg text;
  v_err_cnt integer;
BEGIN
  IF p_device_id IS NULL OR length(p_device_id) < 3 OR length(p_device_id) > 80 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_device');
  END IF;

  SELECT COALESCE(analytics_level, 2) INTO v_level FROM public.app_settings WHERE id = 1;
  IF v_level = 0 THEN
    RETURN jsonb_build_object('ok', true, 'skipped', true);
  END IF;

  -- Upsert session summary (allowed for level >= 1)
  IF p_summary IS NOT NULL AND jsonb_typeof(p_summary) = 'object' THEN
    BEGIN
      v_sid := (p_summary->>'session_id')::uuid;
      IF v_sid IS NOT NULL AND pg_column_size(p_summary->'s') <= 4096 THEN
        INSERT INTO public.session_summaries (
          session_id, device_id, account_id, is_guest, platform, started_at, ended_at, active_s, s
        ) VALUES (
          v_sid,
          p_device_id,
          NULLIF(left(p_summary->>'account_id', 64), ''),
          COALESCE((p_summary->>'is_guest')::boolean, true),
          COALESCE(NULLIF(left(p_summary->>'platform', 16), ''), 'desktop'),
          COALESCE((p_summary->>'started_at')::timestamptz, now()),
          COALESCE((p_summary->>'ended_at')::timestamptz, now()),
          GREATEST(0, LEAST(86400, COALESCE((p_summary->>'active_s')::integer, 0))),
          COALESCE(p_summary->'s', '{}'::jsonb)
        )
        ON CONFLICT (session_id) DO UPDATE SET
          account_id = COALESCE(EXCLUDED.account_id, public.session_summaries.account_id),
          is_guest = EXCLUDED.is_guest,
          ended_at = GREATEST(public.session_summaries.ended_at, EXCLUDED.ended_at),
          active_s = GREATEST(public.session_summaries.active_s, EXCLUDED.active_s),
          s = EXCLUDED.s;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- ignore malformed summary
      NULL;
    END;
  END IF;

  IF v_level < 2 OR p_events IS NULL OR jsonb_typeof(p_events) <> 'array' THEN
    RETURN jsonb_build_object('ok', true, 'inserted', 0);
  END IF;

  -- Rate limit: max 100 events / hour / device_id
  INSERT INTO public.rate_buckets (device_id, hour_bucket, cnt)
  VALUES (p_device_id, v_bucket, 0)
  ON CONFLICT (device_id, hour_bucket) DO NOTHING;

  SELECT cnt INTO v_cnt FROM public.rate_buckets
  WHERE device_id = p_device_id AND hour_bucket = v_bucket;

  IF v_cnt >= 100 THEN
    RETURN jsonb_build_object('ok', true, 'rate_limited', true, 'inserted', 0);
  END IF;

  FOR v_ev IN SELECT * FROM jsonb_array_elements(p_events) LIMIT 30 LOOP
    EXIT WHEN v_cnt + v_inserted >= 100;
    v_n := COALESCE((v_ev->>'n')::smallint, 0);
    IF v_n < 1 OR v_n > 17 THEN
      CONTINUE;
    END IF;
    v_props := COALESCE(v_ev->'p', '{}'::jsonb);
    IF pg_column_size(v_props) > 1200 THEN
      CONTINUE;
    END IF;

    BEGIN
      v_sid := NULLIF(v_ev->>'sid', '')::uuid;
    EXCEPTION WHEN OTHERS THEN
      v_sid := NULL;
    END;

    INSERT INTO public.analytics_events (ts, n, session_id, device_id, room_id, scene_id, p)
    VALUES (
      COALESCE((v_ev->>'ts')::timestamptz, now()),
      v_n,
      v_sid,
      p_device_id,
      NULLIF(left(v_ev->>'r', 64), ''),
      COALESCE((v_ev->>'sc')::smallint, 0),
      v_props
    );
    v_inserted := v_inserted + 1;

    -- Aggregate error_groups inline for n=16
    IF v_n = 16 THEN
      v_err_hash := NULLIF(left(v_props->>'h', 32), '');
      IF v_err_hash IS NOT NULL THEN
        v_err_src := left(COALESCE(v_props->>'src', 'Client'), 40);
        v_err_msg := left(COALESCE(v_props->>'msg', ''), 200);
        v_err_cnt := GREATEST(1, LEAST(500, COALESCE((v_props->>'cnt')::integer, 1)));
        INSERT INTO public.error_groups (hash, src, sample_msg, first_seen, last_seen, total, sessions)
        VALUES (v_err_hash, v_err_src, v_err_msg, now(), now(), v_err_cnt, 1)
        ON CONFLICT (hash) DO UPDATE SET
          last_seen = now(),
          total = public.error_groups.total + v_err_cnt,
          sessions = public.error_groups.sessions + 1;
      END IF;
    END IF;
  END LOOP;

  IF v_inserted > 0 THEN
    UPDATE public.rate_buckets
    SET cnt = cnt + v_inserted
    WHERE device_id = p_device_id AND hour_bucket = v_bucket;
  END IF;

  RETURN jsonb_build_object('ok', true, 'inserted', v_inserted);
END;
$$;

-- 10. CCU Snapshot job (run every 1 minute via pg_cron)
CREATE OR REPLACE FUNCTION public.snapshot_ccu_minutely()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cutoff timestamptz := now() - interval '45 seconds';
  v_total smallint := 0;
  v_rooms smallint := 0;
  v_lobby smallint := 0;
  v_cinema smallint := 0;
  v_tearoom smallint := 0;
BEGIN
  IF to_regclass('public.room_players') IS NULL THEN
    RETURN;
  END IF;

  SELECT
    COUNT(*)::smallint,
    COUNT(DISTINCT room_id)::smallint,
    COUNT(*) FILTER (WHERE scene_id = 'ca-van-nghe-lobby')::smallint,
    COUNT(*) FILTER (WHERE scene_id = 'ca-van-nghe-cinema')::smallint,
    COUNT(*) FILTER (WHERE scene_id = 'ca-van-nghe-tearoom')::smallint
  INTO v_total, v_rooms, v_lobby, v_cinema, v_tearoom
  FROM public.room_players
  WHERE last_seen_at >= v_cutoff;

  INSERT INTO public.ccu_minutely (ts, total, rooms, lobby, cinema, tearoom)
  VALUES (date_trunc('minute', now()), v_total, v_rooms, v_lobby, v_cinema, v_tearoom)
  ON CONFLICT (ts) DO UPDATE SET
    total = EXCLUDED.total,
    rooms = EXCLUDED.rooms,
    lobby = EXCLUDED.lobby,
    cinema = EXCLUDED.cinema,
    tearoom = EXCLUDED.tearoom;
END;
$$;

-- 11. Nightly Rollup + Purge + 100MB Budget Guard
CREATE OR REPLACE FUNCTION public.run_analytics_maintenance()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_day date := (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - 1;
  v_retention integer := 30;
  v_bytes bigint := 0;
  v_deleted integer := 0;
BEGIN
  SELECT COALESCE(analytics_retention_days, 30) INTO v_retention FROM public.app_settings WHERE id = 1;

  -- Roll up players_daily from session_summaries
  INSERT INTO public.players_daily (day, device_id, account_id, is_guest, sessions, active_s, first_seen)
  SELECT
    v_day,
    s.device_id,
    MAX(s.account_id),
    BOOL_AND(s.is_guest),
    COUNT(*)::integer,
    COALESCE(SUM(s.active_s), 0)::integer,
    COALESCE(
      (SELECT MIN(p.first_seen) FROM public.players_daily p WHERE p.device_id = s.device_id),
      v_day
    )
  FROM public.session_summaries s
  WHERE (s.started_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = v_day
  GROUP BY s.device_id
  ON CONFLICT (day, device_id) DO UPDATE SET
    account_id = COALESCE(EXCLUDED.account_id, public.players_daily.account_id),
    is_guest = EXCLUDED.is_guest,
    sessions = EXCLUDED.sessions,
    active_s = EXCLUDED.active_s;

  -- Roll up daily_metrics (sessions, active_s, chat, clap, karaoke, errors, room_denied)
  INSERT INTO public.daily_metrics (day, m, dim, v)
  SELECT v_day, 'sessions', '', COUNT(*) FROM public.session_summaries
  WHERE (started_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = v_day
  ON CONFLICT (day, m, dim) DO UPDATE SET v = EXCLUDED.v;

  INSERT INTO public.daily_metrics (day, m, dim, v)
  SELECT v_day, 'chat', '', COALESCE(SUM((s->>'chat')::double precision), 0)
  FROM public.session_summaries
  WHERE (started_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = v_day
  ON CONFLICT (day, m, dim) DO UPDATE SET v = EXCLUDED.v;

  INSERT INTO public.daily_metrics (day, m, dim, v)
  SELECT v_day, 'clap', '', COALESCE(SUM((s->>'clap')::double precision), 0)
  FROM public.session_summaries
  WHERE (started_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = v_day
  ON CONFLICT (day, m, dim) DO UPDATE SET v = EXCLUDED.v;

  INSERT INTO public.daily_metrics (day, m, dim, v)
  SELECT v_day, 'songs', COALESCE(p->>'src', 'youtube'), COUNT(*)
  FROM public.analytics_events
  WHERE n = 8 AND (ts AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = v_day
  GROUP BY COALESCE(p->>'src', 'youtube')
  ON CONFLICT (day, m, dim) DO UPDATE SET v = EXCLUDED.v;

  INSERT INTO public.daily_metrics (day, m, dim, v)
  SELECT v_day, 'errors', '', COALESCE(SUM(GREATEST(1, COALESCE((p->>'cnt')::integer, 1))), 0)
  FROM public.analytics_events
  WHERE n = 16 AND (ts AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = v_day
  ON CONFLICT (day, m, dim) DO UPDATE SET v = EXCLUDED.v;

  INSERT INTO public.daily_metrics (day, m, dim, v)
  SELECT v_day, 'room_denied', COALESCE(p->>'reason', 'other'), COUNT(*)
  FROM public.analytics_events
  WHERE n = 6 AND (ts AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = v_day
  GROUP BY COALESCE(p->>'reason', 'other')
  ON CONFLICT (day, m, dim) DO UPDATE SET v = EXCLUDED.v;

  -- Top 50 songs per day
  INSERT INTO public.top_daily (day, kind, key, n)
  SELECT v_day, 'song', COALESCE(NULLIF(p->>'vid', ''), p->>'title', 'unknown'), COUNT(*)::integer
  FROM public.analytics_events
  WHERE n = 8 AND (ts AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = v_day
  GROUP BY 3
  ORDER BY 4 DESC
  LIMIT 50
  ON CONFLICT (day, kind, key) DO UPDATE SET n = EXCLUDED.n;

  -- Top 50 karaoke search queries per day
  INSERT INTO public.top_daily (day, kind, key, n)
  SELECT v_day, 'query', lower(trim(p->>'q')), COUNT(*)::integer
  FROM public.analytics_events
  WHERE n = 9 AND (ts AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = v_day AND NULLIF(trim(p->>'q'), '') IS NOT NULL
  GROUP BY 3
  ORDER BY 4 DESC
  LIMIT 50
  ON CONFLICT (day, kind, key) DO UPDATE SET n = EXCLUDED.n;

  -- Roll up monthly_metrics for v_day's month (overall kept forever)
  INSERT INTO public.monthly_metrics (
    month, mau, new_users, sessions, total_active_s, avg_session_s, peak_ccu, avg_ccu, songs, errors, chat, clap
  )
  SELECT
    date_trunc('month', v_day)::date,
    COALESCE((SELECT COUNT(DISTINCT device_id) FROM public.players_daily WHERE date_trunc('month', day)::date = date_trunc('month', v_day)::date), 0),
    COALESCE((SELECT COUNT(DISTINCT device_id) FROM public.players_daily WHERE date_trunc('month', first_seen)::date = date_trunc('month', v_day)::date), 0),
    COALESCE((SELECT SUM(sessions) FROM public.players_daily WHERE date_trunc('month', day)::date = date_trunc('month', v_day)::date), 0),
    COALESCE((SELECT SUM(active_s) FROM public.players_daily WHERE date_trunc('month', day)::date = date_trunc('month', v_day)::date), 0),
    COALESCE((
      SELECT ROUND(SUM(active_s)::numeric / GREATEST(1, SUM(sessions)))::integer
      FROM public.players_daily WHERE date_trunc('month', day)::date = date_trunc('month', v_day)::date
    ), 0),
    COALESCE((SELECT MAX(total) FROM public.ccu_minutely WHERE date_trunc('month', ts AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = date_trunc('month', v_day)::date), 0),
    COALESCE((SELECT ROUND(AVG(total)::numeric, 1) FROM public.ccu_minutely WHERE date_trunc('month', ts AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = date_trunc('month', v_day)::date), 0),
    COALESCE((SELECT SUM(v)::integer FROM public.daily_metrics WHERE m = 'songs' AND date_trunc('month', day)::date = date_trunc('month', v_day)::date), 0),
    COALESCE((SELECT SUM(v)::integer FROM public.daily_metrics WHERE m = 'errors' AND date_trunc('month', day)::date = date_trunc('month', v_day)::date), 0),
    COALESCE((SELECT SUM(v)::integer FROM public.daily_metrics WHERE m = 'chat' AND date_trunc('month', day)::date = date_trunc('month', v_day)::date), 0),
    COALESCE((SELECT SUM(v)::integer FROM public.daily_metrics WHERE m = 'clap' AND date_trunc('month', day)::date = date_trunc('month', v_day)::date), 0)
  ON CONFLICT (month) DO UPDATE SET
    mau = EXCLUDED.mau,
    new_users = EXCLUDED.new_users,
    sessions = EXCLUDED.sessions,
    total_active_s = EXCLUDED.total_active_s,
    avg_session_s = EXCLUDED.avg_session_s,
    peak_ccu = GREATEST(public.monthly_metrics.peak_ccu, EXCLUDED.peak_ccu),
    avg_ccu = EXCLUDED.avg_ccu,
    songs = EXCLUDED.songs,
    errors = EXCLUDED.errors,
    chat = EXCLUDED.chat,
    clap = EXCLUDED.clap;

  -- Purge expired raw & daily details (monthly_metrics is kept forever)
  DELETE FROM public.analytics_events WHERE ts < now() - make_interval(days => v_retention);
  DELETE FROM public.session_summaries WHERE started_at < now() - interval '60 days';
  DELETE FROM public.room_sessions WHERE left_at < now() - interval '90 days';
  DELETE FROM public.ccu_minutely WHERE ts < now() - interval '90 days';
  DELETE FROM public.players_daily WHERE day < now()::date - 90;
  DELETE FROM public.daily_metrics WHERE day < now()::date - 90;
  DELETE FROM public.top_daily WHERE day < now()::date - 90;
  DELETE FROM public.heatmap_daily WHERE day < now()::date - 90;
  DELETE FROM public.rate_buckets WHERE hour_bucket < now() - interval '2 days';

  -- Budget guard: keep analytics tables <= 100 MB
  SELECT COALESCE(SUM(pg_total_relation_size(c.oid)), 0)
  INTO v_bytes
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname IN (
      'analytics_events','session_summaries','room_sessions','ccu_minutely',
      'players_daily','daily_metrics','heatmap_daily','top_daily','error_groups','admin_audit_log','rate_buckets'
    );

  IF v_bytes > 100 * 1024 * 1024 THEN
    DELETE FROM public.analytics_events
    WHERE id IN (
      SELECT id FROM public.analytics_events ORDER BY ts ASC LIMIT 20000
    );
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    INSERT INTO public.admin_audit_log (actor, action, target, new_val)
    VALUES ('system', 'budget_purge', 'analytics_events', jsonb_build_object('bytes_before', v_bytes, 'deleted', v_deleted));
  END IF;

  RETURN jsonb_build_object('ok', true, 'day', v_day, 'analytics_bytes', v_bytes);
END;
$$;

-- Schedule cron jobs if pg_cron extension is available
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('cavannghe_ccu_minutely') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cavannghe_ccu_minutely');
    PERFORM cron.schedule('cavannghe_ccu_minutely', '* * * * *', 'SELECT public.snapshot_ccu_minutely();');

    PERFORM cron.unschedule('cavannghe_nightly_rollup') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cavannghe_nightly_rollup');
    PERFORM cron.schedule('cavannghe_nightly_rollup', '0 20 * * *', 'SELECT public.run_analytics_maintenance();');
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- 12. Admin RPC: Storage stats
CREATE OR REPLACE FUNCTION public.get_storage_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_db_bytes bigint;
  v_tables jsonb;
  v_analytics_bytes bigint;
BEGIN
  IF NOT public.is_admin_caller() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  v_db_bytes := pg_database_size(current_database());

  SELECT jsonb_agg(t ORDER BY bytes DESC), COALESCE(SUM(bytes), 0)
  INTO v_tables, v_analytics_bytes
  FROM (
    SELECT
      c.relname AS table_name,
      pg_total_relation_size(c.oid) AS bytes,
      COALESCE(s.n_live_tup, 0) AS rows
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
    WHERE n.nspname = 'public'
      AND c.relname IN (
        'analytics_events','session_summaries','room_sessions','ccu_minutely',
        'players_daily','daily_metrics','heatmap_daily','top_daily','error_groups','admin_audit_log'
      )
  ) t;

  RETURN jsonb_build_object(
    'db_bytes', v_db_bytes,
    'db_limit_bytes', 500 * 1024 * 1024,
    'analytics_bytes', v_analytics_bytes,
    'analytics_budget_bytes', 100 * 1024 * 1024,
    'tables', COALESCE(v_tables, '[]'::jsonb)
  );
END;
$$;

-- 13. Admin RPC: Unified Analytics Dashboard Data
CREATE OR REPLACE FUNCTION public.analytics_dashboard_data(
  p_from timestamptz,
  p_to timestamptz,
  p_scene text DEFAULT NULL,
  p_platform text DEFAULT NULL,
  p_guest text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_res jsonb;
  v_kpis jsonb;
  v_ccu jsonb;
  v_daily jsonb;
  v_peak_matrix jsonb;
  v_funnel jsonb;
  v_auth_mix jsonb;
  v_dur_hist jsonb;
  v_platforms jsonb;
  v_avatars jsonb;
  v_top_players jsonb;
  v_scenes jsonb;
  v_room_denied jsonb;
  v_karaoke_songs jsonb;
  v_karaoke_queries jsonb;
  v_karaoke_ends jsonb;
  v_karaoke_presets jsonb;
  v_stage_media jsonb;
  v_social jsonb;
  v_tech jsonb;
  v_errors jsonb;
  v_audit jsonb;
  v_ban_reasons jsonb;
  v_cohort jsonb;
  v_settings jsonb;
BEGIN
  IF NOT public.is_admin_caller() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  -- KPIs
  WITH sess AS (
    SELECT * FROM public.session_summaries
    WHERE started_at >= p_from AND started_at <= p_to
      AND (p_platform IS NULL OR platform = p_platform)
      AND (p_guest IS NULL OR (p_guest = 'guest' AND is_guest) OR (p_guest = 'account' AND NOT is_guest))
  )
  SELECT jsonb_build_object(
    'sessions', COUNT(*),
    'unique_devices', COUNT(DISTINCT device_id),
    'avg_active_s', COALESCE(ROUND(AVG(active_s)), 0),
    'songs', COALESCE((SELECT COUNT(*) FROM public.analytics_events WHERE n = 8 AND ts BETWEEN p_from AND p_to), 0),
    'errors', COALESCE((SELECT SUM(GREATEST(1, COALESCE((p->>'cnt')::int, 1))) FROM public.analytics_events WHERE n = 16 AND ts BETWEEN p_from AND p_to), 0),
    'peak_ccu', COALESCE((SELECT MAX(total) FROM public.ccu_minutely WHERE ts BETWEEN p_from AND p_to), 0),
    'avg_ccu', COALESCE((SELECT ROUND(AVG(total), 1) FROM public.ccu_minutely WHERE ts BETWEEN p_from AND p_to), 0)
  ) INTO v_kpis FROM sess;

  -- CCU series (downsampled to hourly if range > 2 days)
  IF (p_to - p_from) > interval '2 days' THEN
    SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.ts), '[]'::jsonb) INTO v_ccu
    FROM (
      SELECT date_trunc('hour', ts) AS ts,
             MAX(total) AS total,
             ROUND(AVG(lobby))::int AS lobby,
             ROUND(AVG(cinema))::int AS cinema,
             ROUND(AVG(tearoom))::int AS tearoom
      FROM public.ccu_minutely
      WHERE ts BETWEEN p_from AND p_to
      GROUP BY 1
    ) t;
  ELSE
    SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.ts), '[]'::jsonb) INTO v_ccu
    FROM (
      SELECT ts, total, lobby, cinema, tearoom
      FROM public.ccu_minutely
      WHERE ts BETWEEN p_from AND p_to
    ) t;
  END IF;

  -- Daily series (sessions, dau, new_users, returning_users, songs, errors)
  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.day), '[]'::jsonb) INTO v_daily
  FROM (
    SELECT
      d.day::date AS day,
      COUNT(DISTINCT s.session_id) AS sessions,
      COUNT(DISTINCT s.device_id) AS dau,
      COUNT(DISTINCT s.device_id) FILTER (
        WHERE NOT EXISTS (
          SELECT 1 FROM public.session_summaries prev
          WHERE prev.device_id = s.device_id AND prev.started_at < d.day
        )
      ) AS new_users,
      COALESCE((SELECT COUNT(*) FROM public.analytics_events e WHERE e.n = 8 AND date_trunc('day', e.ts AT TIME ZONE 'Asia/Ho_Chi_Minh') = d.day), 0) AS songs,
      COALESCE((SELECT SUM(GREATEST(1, COALESCE((e.p->>'cnt')::int, 1))) FROM public.analytics_events e WHERE e.n = 16 AND date_trunc('day', e.ts AT TIME ZONE 'Asia/Ho_Chi_Minh') = d.day), 0) AS errors
    FROM generate_series(
      date_trunc('day', p_from AT TIME ZONE 'Asia/Ho_Chi_Minh'),
      date_trunc('day', p_to AT TIME ZONE 'Asia/Ho_Chi_Minh'),
      interval '1 day'
    ) d(day)
    LEFT JOIN public.session_summaries s
      ON date_trunc('day', s.started_at AT TIME ZONE 'Asia/Ho_Chi_Minh') = d.day
      AND (p_platform IS NULL OR s.platform = p_platform)
      AND (p_guest IS NULL OR (p_guest = 'guest' AND s.is_guest) OR (p_guest = 'account' AND NOT s.is_guest))
    GROUP BY d.day
  ) t;

  -- Peak hour x weekday matrix
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_peak_matrix
  FROM (
    SELECT
      EXTRACT(DOW FROM (ts AT TIME ZONE 'Asia/Ho_Chi_Minh'))::int AS dow,
      EXTRACT(HOUR FROM (ts AT TIME ZONE 'Asia/Ho_Chi_Minh'))::int AS hr,
      ROUND(AVG(total), 1) AS avg_ccu
    FROM public.ccu_minutely
    WHERE ts BETWEEN p_from AND p_to
    GROUP BY 1, 2
  ) t;

  -- Funnel
  SELECT jsonb_build_array(
    jsonb_build_object('step', 'Mở game', 'count', (SELECT COUNT(DISTINCT session_id) FROM public.analytics_events WHERE n = 1 AND ts BETWEEN p_from AND p_to)),
    jsonb_build_object('step', 'Chọn danh tính', 'count', (SELECT COUNT(DISTINCT session_id) FROM public.analytics_events WHERE n = 2 AND (p->>'ok')::boolean = true AND ts BETWEEN p_from AND p_to)),
    jsonb_build_object('step', 'Vào phòng', 'count', (SELECT COUNT(DISTINCT session_id) FROM public.analytics_events WHERE n = 5 AND (p->>'ok')::boolean = true AND ts BETWEEN p_from AND p_to)),
    jsonb_build_object('step', 'Tương tác', 'count', (SELECT COUNT(*) FROM public.session_summaries WHERE started_at BETWEEN p_from AND p_to AND (COALESCE((s->>'chat')::int,0) + COALESCE((s->>'sit')::int,0) + COALESCE((s->>'clap')::int,0)) > 0)),
    jsonb_build_object('step', 'Hát Karaoke', 'count', (SELECT COUNT(DISTINCT session_id) FROM public.analytics_events WHERE n = 8 AND ts BETWEEN p_from AND p_to))
  ) INTO v_funnel;

  -- Auth mix
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_auth_mix
  FROM (
    SELECT COALESCE(p->>'type', 'guest') AS type,
           COUNT(*) FILTER (WHERE COALESCE((p->>'ok')::boolean, true)) AS ok,
           COUNT(*) FILTER (WHERE NOT COALESCE((p->>'ok')::boolean, true)) AS fail
    FROM public.analytics_events
    WHERE n = 2 AND ts BETWEEN p_from AND p_to
    GROUP BY 1
  ) t;

  -- Session duration histogram
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_dur_hist
  FROM (
    SELECT bucket, COUNT(*) AS cnt FROM (
      SELECT CASE
        WHEN active_s < 300 THEN '0-5p'
        WHEN active_s < 900 THEN '5-15p'
        WHEN active_s < 1800 THEN '15-30p'
        WHEN active_s < 3600 THEN '30-60p'
        ELSE '60p+'
      END AS bucket
      FROM public.session_summaries
      WHERE started_at BETWEEN p_from AND p_to
    ) b GROUP BY bucket
  ) t;

  -- Platforms
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_platforms
  FROM (
    SELECT platform, COUNT(*) AS cnt
    FROM public.session_summaries
    WHERE started_at BETWEEN p_from AND p_to
    GROUP BY platform
  ) t;

  -- Avatars
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_avatars
  FROM (
    SELECT COALESCE(p->>'model', 'unknown') AS model, COUNT(*) AS cnt
    FROM public.analytics_events
    WHERE n = 3 AND ts BETWEEN p_from AND p_to
    GROUP BY 1 ORDER BY 2 DESC LIMIT 10
  ) t;

  -- Top players (from room_sessions)
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_top_players
  FROM (
    SELECT COALESCE(MAX(player_name), device_id) AS name,
           device_id,
           COUNT(*) AS room_joins,
           COALESCE(SUM(duration_s), 0) AS total_s
    FROM public.room_sessions
    WHERE left_at BETWEEN p_from AND p_to
    GROUP BY device_id
    ORDER BY total_s DESC
    LIMIT 15
  ) t;

  -- Scene breakdown (from session_summaries.s.sc)
  SELECT jsonb_build_object(
    'lobby_s', COALESCE((SELECT SUM((s->'sc'->>'lobby')::int) FROM public.session_summaries WHERE started_at BETWEEN p_from AND p_to), 0),
    'cinema_s', COALESCE((SELECT SUM((s->'sc'->>'cinema')::int) FROM public.session_summaries WHERE started_at BETWEEN p_from AND p_to), 0),
    'tearoom_s', COALESCE((SELECT SUM((s->'sc'->>'tearoom')::int) FROM public.session_summaries WHERE started_at BETWEEN p_from AND p_to), 0),
    'switches', COALESCE((
      SELECT jsonb_agg(row_to_json(sw)) FROM (
        SELECT p->>'from' AS from_scene, p->>'to' AS to_scene, COUNT(*) AS cnt
        FROM public.analytics_events WHERE n = 7 AND ts BETWEEN p_from AND p_to
        GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 12
      ) sw
    ), '[]'::jsonb)
  ) INTO v_scenes;

  -- Room denied reasons
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_room_denied
  FROM (
    SELECT COALESCE(p->>'reason', 'other') AS reason, COUNT(*) AS cnt
    FROM public.analytics_events
    WHERE n = 6 AND ts BETWEEN p_from AND p_to
    GROUP BY 1 ORDER BY 2 DESC
  ) t;

  -- Karaoke top songs, queries, end reasons, presets
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_karaoke_songs
  FROM (
    SELECT COALESCE(NULLIF(p->>'vid', ''), p->>'title', 'File nhạc') AS vid,
           MAX(p->>'title') AS title,
           MAX(p->>'src') AS src,
           COUNT(*) AS plays,
           ROUND(AVG(CASE WHEN COALESCE((p->>'dur')::float, 0) > 0 THEN LEAST(100, (p->>'played')::float * 100 / (p->>'dur')::float) ELSE 0 END)) AS avg_pct,
           COUNT(*) FILTER (WHERE COALESCE((p->>'mic')::boolean, false)) AS mic_plays
    FROM public.analytics_events
    WHERE n = 8 AND ts BETWEEN p_from AND p_to
    GROUP BY 1 ORDER BY plays DESC LIMIT 20
  ) t;

  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_karaoke_queries
  FROM (
    SELECT lower(trim(p->>'q')) AS query,
           COUNT(*) AS cnt,
           COUNT(*) FILTER (WHERE COALESCE((p->>'fb')::boolean, false)) AS fallback_cnt
    FROM public.analytics_events
    WHERE n = 9 AND ts BETWEEN p_from AND p_to AND NULLIF(trim(p->>'q'), '') IS NOT NULL
    GROUP BY 1 ORDER BY cnt DESC LIMIT 20
  ) t;

  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_karaoke_ends
  FROM (
    SELECT COALESCE(p->>'end', 'done') AS reason, COUNT(*) AS cnt
    FROM public.analytics_events WHERE n = 8 AND ts BETWEEN p_from AND p_to
    GROUP BY 1
  ) t;

  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_karaoke_presets
  FROM (
    SELECT COALESCE(p->>'preset', 'lounge') AS preset, COUNT(*) AS cnt
    FROM public.analytics_events WHERE n = 8 AND ts BETWEEN p_from AND p_to
    GROUP BY 1
  ) t;

  -- Stage media
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_stage_media
  FROM (
    SELECT COALESCE(NULLIF(p->>'vid', ''), p->>'title', 'media') AS vid,
           MAX(p->>'src') AS src,
           COUNT(*) AS plays
    FROM public.analytics_events
    WHERE n = 12 AND ts BETWEEN p_from AND p_to
    GROUP BY 1 ORDER BY plays DESC LIMIT 15
  ) t;

  -- Social & Voice summary
  SELECT jsonb_build_object(
    'chat', COALESCE(SUM((s->>'chat')::int), 0),
    'clap', COALESCE(SUM((s->>'clap')::int), 0),
    'sit', COALESCE(SUM((s->>'sit')::int), 0),
    'mic_s', COALESCE(SUM((s->>'mic_s')::int), 0),
    'spk_s', COALESCE(SUM((s->>'spk_s')::int), 0),
    'v_ok', COALESCE(SUM((s->>'v_ok')::int), 0),
    'v_fail', COALESCE(SUM((s->>'v_fail')::int), 0),
    'ice_relay', COALESCE(SUM((s->>'ice_relay')::int), 0),
    'mic_perms', COALESCE((
      SELECT jsonb_agg(row_to_json(mp)) FROM (
        SELECT COALESCE(p->>'result', 'unknown') AS result, COUNT(*) AS cnt
        FROM public.analytics_events WHERE n = 13 AND ts BETWEEN p_from AND p_to GROUP BY 1
      ) mp
    ), '[]'::jsonb)
  ) INTO v_social
  FROM public.session_summaries WHERE started_at BETWEEN p_from AND p_to;

  -- Tech & Performance
  SELECT jsonb_build_object(
    'avg_fps', COALESCE(ROUND(AVG((s->'fps'->>0)::numeric), 1), 0),
    'p5_fps', COALESCE(ROUND(AVG((s->'fps'->>1)::numeric), 1), 0),
    'avg_ping', COALESCE(ROUND(AVG((s->'png'->>0)::numeric), 0), 0),
    'p95_ping', COALESCE(ROUND(AVG((s->'png'->>1)::numeric), 0), 0),
    'avg_load_ms', COALESCE(ROUND(AVG((s->'ld'->>0)::numeric), 0), 0),
    'reconnects', COALESCE(SUM((s->>'rc')::int), 0),
    'gpus', COALESCE((
      SELECT jsonb_agg(row_to_json(g)) FROM (
        SELECT COALESCE(s->>'gpu', 'Unknown') AS gpu,
               COUNT(*) AS sessions,
               ROUND(AVG((s->'fps'->>0)::numeric), 1) AS avg_fps
        FROM public.session_summaries
        WHERE started_at BETWEEN p_from AND p_to AND s->>'gpu' IS NOT NULL
        GROUP BY 1 ORDER BY sessions DESC LIMIT 10
      ) g
    ), '[]'::jsonb)
  ) INTO v_tech
  FROM public.session_summaries WHERE started_at BETWEEN p_from AND p_to;

  -- Top error groups
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_errors
  FROM (
    SELECT hash, src, sample_msg, first_seen, last_seen, total, sessions
    FROM public.error_groups
    WHERE last_seen >= p_from
    ORDER BY total DESC LIMIT 30
  ) t;

  -- Audit log & Ban reasons
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_audit
  FROM (
    SELECT id, ts, actor, action, target, old_val, new_val
    FROM public.admin_audit_log
    WHERE ts BETWEEN p_from AND p_to
    ORDER BY ts DESC LIMIT 50
  ) t;

  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_ban_reasons
  FROM (
    SELECT COALESCE(NULLIF(trim(reason), ''), 'Không ghi lý do') AS reason, COUNT(*) AS cnt
    FROM public.banned_players
    WHERE created_at BETWEEN p_from AND p_to
    GROUP BY 1 ORDER BY 2 DESC LIMIT 10
  ) t;

  -- Cohort retention (last 7 cohorts from players_daily)
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_cohort
  FROM (
    SELECT
      p.first_seen AS cohort_day,
      COUNT(DISTINCT p.device_id) FILTER (WHERE p.day = p.first_seen) AS d0,
      COUNT(DISTINCT p.device_id) FILTER (WHERE p.day = p.first_seen + 1) AS d1,
      COUNT(DISTINCT p.device_id) FILTER (WHERE p.day = p.first_seen + 3) AS d3,
      COUNT(DISTINCT p.device_id) FILTER (WHERE p.day = p.first_seen + 7) AS d7
    FROM public.players_daily p
    WHERE p.first_seen >= (now()::date - 14)
    GROUP BY p.first_seen
    ORDER BY p.first_seen DESC
    LIMIT 10
  ) t;

  SELECT jsonb_build_object(
    'analytics_level', COALESCE(analytics_level, 2),
    'analytics_retention_days', COALESCE(analytics_retention_days, 30),
    'max_total_players', max_total_players
  ) INTO v_settings FROM public.app_settings WHERE id = 1;

  v_res := jsonb_build_object(
    'kpis', v_kpis,
    'ccu', v_ccu,
    'daily', v_daily,
    'peak_matrix', v_peak_matrix,
    'funnel', v_funnel,
    'auth_mix', v_auth_mix,
    'dur_hist', v_dur_hist,
    'platforms', v_platforms,
    'avatars', v_avatars,
    'top_players', v_top_players,
    'scenes', v_scenes,
    'room_denied', v_room_denied,
    'karaoke_songs', v_karaoke_songs,
    'karaoke_queries', v_karaoke_queries,
    'karaoke_ends', v_karaoke_ends,
    'karaoke_presets', v_karaoke_presets,
    'stage_media', v_stage_media,
    'social', v_social,
    'tech', v_tech,
    'errors', v_errors,
    'audit', v_audit,
    'ban_reasons', v_ban_reasons,
    'cohort', v_cohort,
    'monthly', COALESCE((
      SELECT jsonb_agg(row_to_json(m) ORDER BY m.month DESC)
      FROM (SELECT * FROM public.monthly_metrics ORDER BY month DESC LIMIT 24) m
    ), '[]'::jsonb),
    'settings', v_settings
  );

  RETURN v_res;
END;
$$;
