BEGIN;
SELECT pg_advisory_xact_lock(306007);
ALTER TABLE feedback_logs ADD COLUMN IF NOT EXISTS node_title text;
ALTER TABLE feedback_logs ADD COLUMN IF NOT EXISTS node_actions jsonb NOT NULL DEFAULT '[]';
ALTER TABLE feedback_logs ADD COLUMN IF NOT EXISTS selected_action text;
ALTER TABLE feedback_logs ADD COLUMN IF NOT EXISTS selected_at timestamptz;
UPDATE feedback_logs l SET node_title=CASE
 WHEN r.stage='待验收' THEN '部署完成，等待验收'
 WHEN r.stage='待发布' THEN '代码已合并，等待部署'
 WHEN r.state='failed' THEN '本轮处理受阻'
 ELSE COALESCE(r.stage,'本轮处理结束') END,
 node_actions=CASE WHEN r.stage='待验收' THEN '["accept","rollback"]'::jsonb
 WHEN r.stage='待发布' THEN '["deploy"]'::jsonb
 WHEN r.state='failed' AND r.result->>'operation'='rollback' THEN '["rollback","reply"]'::jsonb
 WHEN r.state='failed' AND r.result->>'merged'='true' THEN '["deploy","reply"]'::jsonb
 WHEN r.state='failed' OR r.stage='待补充' THEN '["reply"]'::jsonb ELSE '[]'::jsonb END
 FROM feedback_runs r WHERE l.request_key=r.id::text||':system-final' AND l.node_title IS NULL;
UPDATE feedback_logs SET node_title=CASE event WHEN 'created' THEN '意见已提交' WHEN 'queued' THEN '任务已排队' WHEN 'action' THEN '操作记录' WHEN 'worker_lost' THEN '处理已中断' WHEN 'offline' THEN '开发助手未连接' END,
 node_actions=CASE WHEN event IN ('worker_lost','offline') THEN '["reply"]'::jsonb ELSE '[]'::jsonb END
 WHERE node_title IS NULL AND event IN ('created','queued','action','worker_lost','offline');
COMMIT;
