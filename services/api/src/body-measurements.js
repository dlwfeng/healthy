// Zepp Life 体重的持久化、同步与读取视图。
// 体重权威来源是 Zepp 体脂秤；Garmin 的体重仍走原有 Garmin 数据路径，不写入本表。
import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { fetchAllWeighIns, ZeppAuthError } from './zepp-weigh-ins.js';

const SOURCE = 'zepp_life';
const MIGRATION = '010-body-measurements.sql';
const TIME_ZONE = 'Asia/Shanghai';

let pool;
let initialized;

function db() {
  if (!process.env.DATABASE_URL) throw new Error('Database not configured');
  pool ??= new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  return pool;
}

async function ready() {
  const client = db();
  initialized ??= readFile(new URL(`../migrations/${MIGRATION}`, import.meta.url), 'utf8')
    .then((sql) => client.query(sql))
    .catch((err) => {
      initialized = null;
      throw err;
    });
  await initialized;
}

export function zeppConfig(env = process.env) {
  const token = (env.ZEPP_APP_TOKEN || '').trim();
  const userId = (env.ZEPP_USER_ID || '').trim();
  return {
    token,
    userId,
    baseUrl: (env.ZEPP_BASE_URL || 'https://api-mifit-cn.huami.com').trim(),
    configured: Boolean(token && userId),
  };
}

const COLUMNS = [
  ['measured_at', 'measuredAt'],
  ['weight_kg', 'weightKg'],
  ['height_cm', 'heightCm'],
  ['bmi', 'bmi'],
  ['body_fat_pct', 'bodyFatPct'],
  ['body_water_pct', 'bodyWaterPct'],
  ['muscle_rate_pct', 'muscleRatePct'],
  ['protein_pct', 'proteinPct'],
  ['bone_mass_kg', 'boneMassKg'],
  ['basal_metabolism_kcal', 'basalMetabolismKcal'],
  ['visceral_fat', 'visceralFat'],
  ['muscle_age', 'muscleAge'],
  ['body_score', 'bodyScore'],
  ['body_style', 'bodyStyle'],
  ['impedance', 'impedance'],
  ['device_source', 'deviceSource'],
];

function toRecord(row) {
  const out = {};
  for (const [column, key] of COLUMNS) {
    const value = row[column];
    out[key] = value === null || value === undefined
      ? null
      : column === 'measured_at'
        ? new Date(value).toISOString()
        : Number(value);
  }
  return out;
}

export const bodyMeasurementStore = {
  async ready() {
    await ready();
  },

  // 同一时刻重复同步只更新时间戳和数值，不产生重复记录。
  async upsert(source, rows) {
    if (!rows.length) return { inserted: 0, updated: 0 };
    await ready();
    const names = COLUMNS.map(([column]) => column);
    const placeholders = names.map((_, i) => `$${i + 2}`);
    const updates = names.filter((n) => n !== 'measured_at').map((n) => `${n}=EXCLUDED.${n}`);
    const sql = `
      INSERT INTO body_measurements (source, ${names.join(', ')}, raw)
      VALUES ($1, ${placeholders.join(', ')}, $${names.length + 2})
      ON CONFLICT (source, measured_at) DO UPDATE SET ${updates.join(', ')}, raw=EXCLUDED.raw, updated_at=now()
      RETURNING (xmax = 0) AS inserted`;
    let inserted = 0;
    for (const row of rows) {
      const values = COLUMNS.map(([column, key]) => row[key] ?? null);
      const { rows: result } = await db().query(sql, [source, ...values, JSON.stringify(row.raw ?? {})]);
      if (result[0]?.inserted) inserted++;
    }
    return { inserted, updated: rows.length - inserted };
  },

  async saveState(patch) {
    await ready();
    await db().query(
      `INSERT INTO body_sync_state (source, last_attempt_at, last_success_at, auth_required, last_error, updated_at)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (source) DO UPDATE SET
         last_attempt_at=COALESCE(EXCLUDED.last_attempt_at, body_sync_state.last_attempt_at),
         last_success_at=COALESCE(EXCLUDED.last_success_at, body_sync_state.last_success_at),
         auth_required=EXCLUDED.auth_required,
         last_error=EXCLUDED.last_error,
         updated_at=now()`,
      [SOURCE, patch.attemptAt ?? null, patch.successAt ?? null, patch.authRequired === true, patch.error ?? null],
    );
  },

  async state() {
    await ready();
    const { rows } = await db().query('SELECT * FROM body_sync_state WHERE source=$1', [SOURCE]);
    const row = rows[0];
    if (!row) return { lastAttemptAt: null, lastSuccessAt: null, authRequired: false, lastError: null, garminPushSince: null };
    return {
      lastAttemptAt: row.last_attempt_at ? new Date(row.last_attempt_at).toISOString() : null,
      lastSuccessAt: row.last_success_at ? new Date(row.last_success_at).toISOString() : null,
      authRequired: row.auth_required === true,
      lastError: row.last_error ?? null,
      garminPushSince: row.garmin_push_since ? new Date(row.garmin_push_since).toISOString() : null,
    };
  },

  async setGarminPushSince(when) {
    await ready();
    await db().query(
      `INSERT INTO body_sync_state (source, garmin_push_since, updated_at) VALUES ($1, $2, now())
       ON CONFLICT (source) DO UPDATE SET garmin_push_since=COALESCE(body_sync_state.garmin_push_since, EXCLUDED.garmin_push_since), updated_at=now()`,
      [SOURCE, when],
    );
  },

  // 只取启用回写之后、尚未推送到 Garmin 的记录。
  async pendingGarmin(pushSince, limit = 20) {
    await ready();
    const { rows } = await db().query(
      `SELECT * FROM body_measurements
       WHERE source=$1 AND garmin_synced_at IS NULL AND measured_at > $2
       ORDER BY measured_at ASC LIMIT $3`,
      [SOURCE, pushSince, limit],
    );
    return rows.map(toRecord);
  },

  async markGarminSynced(measuredAts) {
    if (!measuredAts.length) return;
    await ready();
    await db().query(
      'UPDATE body_measurements SET garmin_synced_at=now() WHERE source=$1 AND measured_at = ANY($2::timestamptz[])',
      [SOURCE, measuredAts],
    );
  },

  async latest() {
    await ready();
    const { rows } = await db().query(
      'SELECT * FROM body_measurements WHERE source=$1 ORDER BY measured_at DESC LIMIT 1',
      [SOURCE],
    );
    return rows[0] ? toRecord(rows[0]) : null;
  },

  // 按上海自然日取当天最新一条，同一时刻的多条仍全部保留在表里。
  async daily(days) {
    await ready();
    const { rows } = await db().query(
      `WITH scoped AS (
         SELECT *, (measured_at AT TIME ZONE $2)::date AS local_date
         FROM body_measurements
         WHERE source=$1 AND measured_at >= now() - ($3 || ' days')::interval
       )
       SELECT DISTINCT ON (local_date) * FROM scoped
       ORDER BY local_date DESC, measured_at DESC`,
      [SOURCE, TIME_ZONE, String(days)],
    );
    return rows.map((row) => ({ ...toRecord(row), date: new Date(row.local_date).toISOString().slice(0, 10) }));
  },

  async totals() {
    await ready();
    const { rows } = await db().query(
      'SELECT count(*)::int AS total, min(measured_at) AS first_at FROM body_measurements WHERE source=$1',
      [SOURCE],
    );
    const row = rows[0] || {};
    return {
      total: row.total ?? 0,
      firstAt: row.first_at ? new Date(row.first_at).toISOString() : null,
    };
  },

  // 体成分参考区间需要性别与年龄；缺失时前端只显示自身历史范围。
  async profile() {
    await ready();
    try {
      const { rows } = await db().query('SELECT sex, birth_date FROM garmin_profile_cache WHERE id=1');
      const row = rows[0];
      if (!row) return null;
      const age = Math.floor((Date.now() - Date.parse(row.birth_date)) / (365.2425 * 86400000));
      return Number.isFinite(age) && age > 0 && age < 120 ? { sex: row.sex, ageYears: age } : null;
    } catch {
      return null;
    }
  },
};

// 只把「启用回写之后新增」的测量写进 Garmin；历史记录不回溯。
// 推送前先读 Garmin 同区间已有记录，同一天且体重相差 0.1 kg 内视为已存在。
function shanghaiDate(iso) {
  return new Date(Date.parse(iso) + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

function shanghaiTimestamp(iso) {
  return `${new Date(Date.parse(iso) + 8 * 3600 * 1000).toISOString().slice(0, 19)}+08:00`;
}

export async function pushWeighInsToGarmin({
  store = bodyMeasurementStore,
  garmin,
  log = console,
} = {}) {
  if (!garmin?.call) return { skipped: 'garmin_unavailable' };

  const state = await store.state();
  // 首次启用：记下起点，历史记录只留在本地库。
  if (!state.garminPushSince) {
    await store.setGarminPushSince(new Date());
    return { baselineSet: true, pushed: 0, existing: 0 };
  }

  const rows = await store.pendingGarmin(state.garminPushSince);
  if (!rows.length) return { pushed: 0, existing: 0, failed: 0 };

  const dates = rows.map((row) => shanghaiDate(row.measuredAt)).sort();
  let present = new Set();
  try {
    const data = await garmin.call('get_body_composition', { start_date: dates[0], end_date: dates.at(-1) });
    present = new Set((data?.dateWeightList || []).flatMap((item) => {
      const date = String(item?.calendarDate || '').slice(0, 10);
      const grams = Number(item?.weight);
      return date && Number.isFinite(grams) && grams > 0 ? [`${date}|${(grams / 1000).toFixed(1)}`] : [];
    }));
  } catch (err) {
    // 读不到 Garmin 现有记录时不盲写，留到下次重试，避免重复。
    log.error(JSON.stringify({ event: 'garmin_weigh_in_read_failed', error: String(err?.message || err).slice(0, 160) }));
    return { skipped: 'garmin_unavailable' };
  }

  const done = [];
  let pushed = 0;
  let existing = 0;
  for (const row of rows) {
    const key = `${shanghaiDate(row.measuredAt)}|${Number(row.weightKg).toFixed(1)}`;
    if (present.has(key)) {
      existing++;
      done.push(row.measuredAt);
      continue;
    }
    try {
      await garmin.call('add_weigh_in', {
        weight_kg: Number(row.weightKg),
        timestamp: shanghaiTimestamp(row.measuredAt),
      });
      pushed++;
      done.push(row.measuredAt);
    } catch (err) {
      log.error(JSON.stringify({ event: 'garmin_weigh_in_push_failed', measuredAt: row.measuredAt, error: String(err?.message || err).slice(0, 160) }));
      break;
    }
  }
  await store.markGarminSynced(done);
  return { pushed, existing, failed: rows.length - done.length };
}

// 同步一次：拉取全部历史（当前 200 条量级），按 measured_at 幂等写入。
export async function syncBodyMeasurements({
  store = bodyMeasurementStore,
  config = zeppConfig(),
  now = new Date(),
  fetchImpl = fetch,
  garmin = null,
  log = console,
} = {}) {
  if (!config.configured) throw new Error('zepp_not_configured');
  const attemptAt = new Date();
  try {
    const rows = await fetchAllWeighIns({ ...config, now: now.getTime(), fetchImpl });
    const { inserted, updated } = await store.upsert(SOURCE, rows);
    await store.saveState({ attemptAt, successAt: new Date(), authRequired: false, error: null });
    const garmin_push = garmin ? await pushWeighInsToGarmin({ store, garmin, log }) : undefined;
    return { fetched: rows.length, inserted, updated, syncedAt: new Date().toISOString(), garmin_push };
  } catch (err) {
    await store.saveState({
      attemptAt,
      authRequired: err instanceof ZeppAuthError,
      error: String(err?.message || err).slice(0, 200),
    });
    throw err;
  }
}

// 每日兜底同步：进程启动 1 分钟后先判断一次，之后每 30 分钟检查是否已超过 20 小时。
export function startBodySyncScheduler({
  store = bodyMeasurementStore,
  config = zeppConfig(),
  sync = syncBodyMeasurements,
  garmin = null,
  intervalMs = 30 * 60 * 1000,
  maxAgeMs = 20 * 60 * 60 * 1000,
  log = console,
} = {}) {
  if (!config.configured) return null;
  let busy = false;
  let stopped = false;

  async function tick() {
    if (busy || stopped) return;
    busy = true;
    try {
      const state = await store.state();
      const last = state.lastAttemptAt ? Date.parse(state.lastAttemptAt) : 0;
      if (Date.now() - last < maxAgeMs) return;
      const result = await sync({ store, config, garmin });
      log.log(JSON.stringify({ event: 'zepp_body_sync', ...result }));
    } catch (err) {
      log.error(JSON.stringify({
        event: 'zepp_body_sync_failed',
        authRequired: err instanceof ZeppAuthError,
        error: String(err?.message || err).slice(0, 200),
      }));
    } finally {
      busy = false;
    }
  }

  const timer = setInterval(tick, intervalMs);
  timer.unref?.();
  setTimeout(tick, 60_000).unref?.();
  return {
    stop() {
      stopped = true;
      clearInterval(timer);
    },
    tick,
  };
}

// 页面与健康助手共用的只读视图：最近一次测量 + 按日曲线 + 同步状态。
export async function loadBodyMeasurements({ days = 365, store = bodyMeasurementStore, config = zeppConfig() } = {}) {
  const [latest, daily, totals, state, profile] = await Promise.all([
    store.latest(),
    store.daily(days),
    store.totals(),
    store.state(),
    store.profile(),
  ]);
  return {
    source: SOURCE,
    configured: config.configured,
    profile,
    authRequired: state.authRequired,
    lastAttemptAt: state.lastAttemptAt,
    lastSuccessAt: state.lastSuccessAt,
    lastError: state.lastError,
    total: totals.total,
    firstAt: totals.firstAt,
    latest,
    daily,
  };
}
