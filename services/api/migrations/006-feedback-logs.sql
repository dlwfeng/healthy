BEGIN;
SELECT pg_advisory_xact_lock(306006);
CREATE TABLE IF NOT EXISTS feedback_logs (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 topic_id bigint NOT NULL REFERENCES feedback_topics(id) ON DELETE CASCADE,
 level text NOT NULL CHECK(level IN ('info','warning','error')),
 event text NOT NULL,
 body text NOT NULL,
 request_key text UNIQUE,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS feedback_logs_topic_time ON feedback_logs(topic_id,created_at DESC,id DESC);
INSERT INTO feedback_logs(topic_id,level,event,body,request_key,created_at)
 SELECT topic_id,CASE WHEN body ~ '失败|失联|中断|超时|异常' THEN 'error'
 WHEN body ~ '跳过|受阻|不足|未连接|不可用' THEN 'warning' ELSE 'info' END,
 'legacy_system',body,'legacy-comment:'||id,created_at
 FROM feedback_comments WHERE author='system'
 ON CONFLICT(request_key) DO NOTHING;
DELETE FROM feedback_comments WHERE author='system';
COMMIT;
