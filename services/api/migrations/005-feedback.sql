CREATE TABLE IF NOT EXISTS feedback_topics (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 title text NOT NULL, body text NOT NULL, priority text NOT NULL CHECK(priority IN ('high','medium','low')),
 target text NOT NULL DEFAULT 'both', status text NOT NULL DEFAULT 'queued', revision integer NOT NULL DEFAULT 1,
 paused boolean NOT NULL DEFAULT false, next_poll_at timestamptz NOT NULL, last_poll_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 request_key text UNIQUE, active_run uuid, read_comment bigint NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS feedback_comments (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, topic_id bigint NOT NULL REFERENCES feedback_topics(id) ON DELETE CASCADE,
 author text NOT NULL, body text NOT NULL, request_key text UNIQUE,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS feedback_attachments (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, topic_id bigint NOT NULL REFERENCES feedback_topics(id) ON DELETE CASCADE,
 mime text NOT NULL, bytes bytea NOT NULL
);
CREATE TABLE IF NOT EXISTS feedback_polls (
 id uuid PRIMARY KEY, topic_id bigint NOT NULL REFERENCES feedback_topics(id) ON DELETE CASCADE,
 scheduled_at timestamptz NOT NULL, checked_at timestamptz NOT NULL DEFAULT now(), outcome text NOT NULL,
 UNIQUE(topic_id,scheduled_at)
);
CREATE TABLE IF NOT EXISTS feedback_runs (
 id uuid PRIMARY KEY, topic_id bigint NOT NULL REFERENCES feedback_topics(id) ON DELETE CASCADE,
 revision integer NOT NULL, state text NOT NULL DEFAULT 'queued', stage text NOT NULL DEFAULT '等待开发执行器',
 created_at timestamptz NOT NULL DEFAULT now(), started_at timestamptz, heartbeat_at timestamptz,
 finished_at timestamptz, result jsonb, worker_id text
);
CREATE UNIQUE INDEX IF NOT EXISTS feedback_one_run ON feedback_runs((true)) WHERE state='running';
CREATE INDEX IF NOT EXISTS feedback_due ON feedback_topics(next_poll_at) WHERE status IN ('queued','ready');
CREATE TABLE IF NOT EXISTS feedback_worker (
 id boolean PRIMARY KEY DEFAULT true CHECK(id), worker_id text, heartbeat_at timestamptz, quota jsonb
);

ALTER TABLE feedback_runs ADD COLUMN IF NOT EXISTS worktree_name text;
ALTER TABLE feedback_runs ADD COLUMN IF NOT EXISTS error_type text;
ALTER TABLE feedback_runs ADD COLUMN IF NOT EXISTS error_reason text;
UPDATE feedback_runs SET worktree_name=regexp_replace(result->>'worktree','^.*/','')
 WHERE worktree_name IS NULL AND result->>'worktree' IS NOT NULL;
UPDATE feedback_runs r SET error_type=CASE WHEN state='failed' THEN 'unknown' ELSE 'none' END
 WHERE error_type IS NULL;
UPDATE feedback_runs r SET error_reason=CASE WHEN state='failed' THEN COALESCE(
 (SELECT c.body FROM feedback_comments c WHERE c.request_key=r.id::text||':final' LIMIT 1),'历史执行失败，未记录结构化原因') ELSE '' END
 WHERE error_reason IS NULL;
ALTER TABLE feedback_runs ALTER COLUMN error_type SET DEFAULT 'none';
ALTER TABLE feedback_runs ALTER COLUMN error_reason SET DEFAULT '';
