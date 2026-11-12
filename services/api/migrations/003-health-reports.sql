CREATE TABLE IF NOT EXISTS health_report_schedules (
  kind TEXT PRIMARY KEY CHECK (kind IN ('daily','weekly')),
  enabled BOOLEAN NOT NULL DEFAULT true,
  timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai',
  local_time TEXT NOT NULL,
  weekday INTEGER NOT NULL DEFAULT 1 CHECK (weekday BETWEEN 0 AND 6),
  enabled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  next_run_at TIMESTAMPTZ
);
INSERT INTO health_report_schedules (kind, local_time) VALUES ('daily','08:00'),('weekly','08:15') ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS health_reports (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('daily','weekly')),
  period_start DATE NOT NULL,
  period_end_exclusive DATE NOT NULL CHECK (period_end_exclusive > period_start),
  timezone TEXT NOT NULL,
  current_revision_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (kind, period_start, period_end_exclusive, timezone)
);
CREATE TABLE IF NOT EXISTS health_report_runs (
  id UUID PRIMARY KEY,
  report_id BIGINT NOT NULL REFERENCES health_reports(id),
  revision INTEGER NOT NULL,
  request_key UUID UNIQUE,
  trigger_source TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'queued' CHECK (state IN ('queued','running','retrying','completed','failed','insufficient_data')),
  stage TEXT NOT NULL DEFAULT 'queued',
  attempts INTEGER NOT NULL DEFAULT 0,
  lease_token UUID,
  lease_until TIMESTAMPTZ,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  error_code TEXT,
  snapshot JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (report_id, revision)
);
CREATE UNIQUE INDEX IF NOT EXISTS health_report_active ON health_report_runs(report_id)
  WHERE state IN ('queued','running','retrying');
CREATE INDEX IF NOT EXISTS health_report_queue ON health_report_runs(next_attempt_at) WHERE state IN ('queued','retrying','running');
CREATE TABLE IF NOT EXISTS health_report_revisions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  report_id BIGINT NOT NULL REFERENCES health_reports(id),
  revision INTEGER NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  html TEXT NOT NULL,
  evidence_ids JSONB NOT NULL,
  suggestions JSONB NOT NULL,
  snapshot JSONB NOT NULL,
  snapshot_hash TEXT NOT NULL,
  model TEXT NOT NULL,
  skill_hash TEXT NOT NULL,
  renderer_version TEXT NOT NULL,
  usage JSONB,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (report_id, revision)
);
