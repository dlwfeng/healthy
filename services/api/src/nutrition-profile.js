import pg from 'pg';
import { readFile } from 'node:fs/promises';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
let initialized;
let syncing;
const HOUR = 3_600_000;

export function normalizeGarminProfile(raw) {
  const data = raw?.userData;
  const birthDate = data?.birthDate;
  const sex = typeof data?.gender === 'string' ? data.gender.toLowerCase() : null;
  if (typeof birthDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate) ||
      !['male', 'female'].includes(sex)) return null;
  const date = new Date(`${birthDate}T12:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== birthDate ||
      birthDate < '1900-01-01' || birthDate > new Date().toISOString().slice(0, 10)) return null;
  return { birthDate, sex };
}

export function ageBand(birthDate, today) {
  const birth = birthDate.split('-').map(Number);
  const current = today.split('-').map(Number);
  const years = current[0] - birth[0] - (current[1] < birth[1] ||
    (current[1] === birth[1] && current[2] < birth[2]) ? 1 : 0);
  if (years < 18 || years > 120) return null;
  if (years < 50) return '18-49';
  if (years < 65) return '50-64';
  if (years < 80) return '65-79';
  return '80+';
}

async function ready() {
  if (!process.env.DATABASE_URL) throw new Error('Database not configured');
  initialized ??= readFile(new URL('../migrations/004-garmin-profile.sql', import.meta.url), 'utf8')
    .then(sql => pool.query(sql)).catch(error => { initialized = undefined; throw error; });
  await initialized;
}

async function row() {
  await ready();
  const { rows } = await pool.query('SELECT birth_date::text, sex, synced_at FROM garmin_profile_cache WHERE id = 1');
  return rows[0] || null;
}

export const nutritionProfileStore = {
  async syncIfDue(garmin) {
    if (syncing) return syncing;
    syncing = (async () => {
      const cached = await row();
      if (cached && Date.now() - new Date(cached.synced_at).getTime() < 24 * HOUR) return cached;
      const normalized = normalizeGarminProfile(await garmin.call('get_user_profile', {}));
      if (!normalized) throw new Error('Garmin profile missing required fields');
      await pool.query(`INSERT INTO garmin_profile_cache (id, birth_date, sex, synced_at)
        VALUES (1, $1, $2, now()) ON CONFLICT (id) DO UPDATE
        SET birth_date = EXCLUDED.birth_date, sex = EXCLUDED.sex, synced_at = now()`,
      [normalized.birthDate, normalized.sex]);
      return row();
    })().finally(() => { syncing = undefined; });
    return syncing;
  },
  async publicProfile() {
    const cached = await row();
    if (!cached) return { status: 'missing', profile: null };
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const band = ageBand(cached.birth_date, today);
    const stale = Date.now() - new Date(cached.synced_at).getTime() > 7 * 24 * HOUR;
    return { status: stale ? 'stale' : band ? 'ready' : 'unsupported',
      profile: stale || !band ? null : { age_band: band, sex: cached.sex, synced_at: cached.synced_at } };
  },
};
