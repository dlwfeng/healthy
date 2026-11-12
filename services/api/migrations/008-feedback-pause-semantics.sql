-- Compatibility with installations before the unified-state migration.
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='feedback_topics' AND column_name='paused') THEN
  UPDATE feedback_topics SET paused=false WHERE status IN ('done','closed') AND paused=true;
 END IF;
END $$;
