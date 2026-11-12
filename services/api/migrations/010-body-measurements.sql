-- Zepp Life 体脂秤测量记录。
-- Garmin 仍是运动与生理指标的来源；体重和体成分由本表承接，Zepp 优先。
-- 同一时刻唯一，允许同一天多次称重；展示时按上海自然日取当天最新一条。
CREATE TABLE IF NOT EXISTS body_measurements (
  id BIGSERIAL PRIMARY KEY,
  source TEXT NOT NULL CHECK (source IN ('zepp_life')),
  measured_at TIMESTAMPTZ NOT NULL,
  weight_kg NUMERIC(5,2) NOT NULL CHECK (weight_kg > 0 AND weight_kg < 500),
  height_cm SMALLINT,
  bmi NUMERIC(4,1),
  body_fat_pct NUMERIC(4,1),
  body_water_pct NUMERIC(4,1),
  muscle_rate_pct NUMERIC(4,1),
  protein_pct NUMERIC(4,1),
  bone_mass_kg NUMERIC(4,2),
  basal_metabolism_kcal INTEGER,
  visceral_fat SMALLINT,
  muscle_age SMALLINT,
  body_score SMALLINT,
  body_style SMALLINT,
  impedance INTEGER,
  device_source INTEGER,
  raw JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source, measured_at)
);

CREATE INDEX IF NOT EXISTS body_measurements_measured_at_idx
  ON body_measurements (measured_at DESC);

-- 同步状态单独保存，避免 token 过期后被静默忽略。
CREATE TABLE IF NOT EXISTS body_sync_state (
  source TEXT PRIMARY KEY,
  last_attempt_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  auth_required BOOLEAN NOT NULL DEFAULT false,
  last_error TEXT,
  -- 回写 Garmin 的起点：功能首次启用时记为当时时间，历史记录不回灌。
  garmin_push_since TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 每条测量是否已回写 Garmin；为空表示尚未处理。
ALTER TABLE body_measurements ADD COLUMN IF NOT EXISTS garmin_synced_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS body_measurements_pending_garmin_idx
  ON body_measurements (measured_at) WHERE garmin_synced_at IS NULL;

