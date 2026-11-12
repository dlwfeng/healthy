-- Each period has one published report. Remove superseded content before
-- enforcing the invariant; execution records remain for queue diagnostics.
DELETE FROM health_report_revisions v
USING health_reports r
WHERE v.report_id = r.id
  AND v.id IS DISTINCT FROM r.current_revision_id;

CREATE UNIQUE INDEX IF NOT EXISTS health_report_one_content_per_period
  ON health_report_revisions(report_id);

-- Failed attempts must not retain abandoned HTML drafts indefinitely.
UPDATE health_report_runs
SET snapshot = NULL
WHERE state IN ('completed', 'failed', 'insufficient_data')
  AND snapshot IS NOT NULL;
