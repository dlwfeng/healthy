CREATE TABLE IF NOT EXISTS garmin_profile_cache (
  id SMALLINT PRIMARY KEY CHECK (id = 1),
  birth_date DATE NOT NULL,
  sex TEXT NOT NULL CHECK (sex IN ('male', 'female')),
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
