-- Recipe library: one recipe owns ordered ingredient rows. All photographs live
-- in PostgreSQL as JPEG payloads and metadata, so a database backup is complete.
CREATE TABLE IF NOT EXISTS recipes (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title TEXT NOT NULL CHECK (length(title) > 0),
  category TEXT NOT NULL,
  servings TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  steps JSONB NOT NULL CHECK (jsonb_typeof(steps) = 'array' AND jsonb_array_length(steps) > 0),
  notes TEXT NOT NULL DEFAULT '',
  original_text TEXT NOT NULL,
  source_title TEXT NOT NULL,
  source_author TEXT NOT NULL,
  source_filename TEXT NOT NULL,
  source_sha256 TEXT NOT NULL CHECK (source_sha256 ~ '^[a-f0-9]{64}$'),
  source_page INTEGER NOT NULL CHECK (source_page > 0),
  source_page_end INTEGER NOT NULL CHECK (source_page_end >= source_page),
  images JSONB NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(images) = 'array'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_sha256, source_page)
);
CREATE TABLE IF NOT EXISTS recipe_ingredients (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  recipe_id BIGINT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position > 0),
  group_name TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL CHECK (length(name) > 0),
  quantity TEXT NOT NULL DEFAULT '',
  unit TEXT NOT NULL DEFAULT '',
  original_text TEXT NOT NULL CHECK (length(original_text) > 0),
  UNIQUE (recipe_id, position)
);
CREATE INDEX IF NOT EXISTS recipes_category_idx ON recipes(category);
