-- Only status determines current state. resume_status records where a paused topic resumes.
ALTER TABLE feedback_topics ADD COLUMN IF NOT EXISTS resume_status text;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='feedback_topics' AND column_name='paused') THEN
  UPDATE feedback_topics SET resume_status=CASE WHEN status='running' THEN 'queued' ELSE status END,status='paused'
   WHERE paused=true AND status NOT IN ('done','closed','paused');
  ALTER TABLE feedback_topics DROP COLUMN paused;
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='feedback_topics'::regclass AND conname='feedback_topic_state') THEN
  ALTER TABLE feedback_topics ADD CONSTRAINT feedback_topic_state CHECK (
   status IN ('queued','running','paused','blocked','needs_info','ready','review','done','closed') AND
   ((status='paused' AND resume_status IS NOT NULL AND resume_status IN ('queued','blocked','needs_info','ready','review')) OR (status<>'paused' AND resume_status IS NULL)));
 END IF;
END $$;
CREATE INDEX IF NOT EXISTS feedback_due ON feedback_topics(next_poll_at) WHERE status IN ('queued','ready');
