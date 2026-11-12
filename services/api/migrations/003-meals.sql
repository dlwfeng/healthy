CREATE TABLE IF NOT EXISTS meals (
  id UUID PRIMARY KEY,
  entry_date DATE NOT NULL,
  meal_time TIME NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('早餐', '午餐', '晚餐', '加餐')),
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  note TEXT NOT NULL DEFAULT '',
  items JSONB NOT NULL,
  nutrition_source TEXT NOT NULL CHECK (nutrition_source IN ('manual', 'model_estimate')),
  analysis JSONB,
  photo BYTEA,
  photo_mime TEXT,
  photo_count INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  request_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS meals_date_idx ON meals (entry_date DESC, meal_time DESC);

ALTER TABLE meals ADD COLUMN IF NOT EXISTS photo_count INTEGER NOT NULL DEFAULT 0;
UPDATE meals SET photo_count = 1 WHERE photo IS NOT NULL AND photo_count = 0;

CREATE TABLE IF NOT EXISTS meal_photos (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  meal_id UUID NOT NULL REFERENCES meals(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  photo BYTEA NOT NULL,
  photo_mime TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (meal_id, position)
);
CREATE INDEX IF NOT EXISTS meal_photos_meal_idx ON meal_photos (meal_id, position);

INSERT INTO meal_photos (meal_id, position, photo, photo_mime)
  SELECT id, 0, photo, photo_mime FROM meals WHERE photo IS NOT NULL
  ON CONFLICT (meal_id, position) DO NOTHING;

