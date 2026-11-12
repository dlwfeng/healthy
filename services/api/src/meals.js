import pg from 'pg';
import { photoMealTiming } from './meal-timing.js';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { validDate } from './daily-status.js';
import { allowedAnalysisModels } from './minimax-models.js';

export const nutrientKeys = ['calories', 'protein_g', 'carbs_g', 'fat_g'];
export const mealKinds = ['早餐', '午餐', '晚餐', '加餐'];
export const validMealId = id => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id || '');
export class MealError extends Error {
  constructor(code, status = 400) { super(code); this.status = status; }
}
const fail = () => { throw new MealError('invalid_parameters'); };
const string = (v, max, required = false) => {
  if (typeof v !== 'string' || v.length > max || (required && !v.trim())) fail();
  return v.trim();
};
export function dateRange(params) {
  const start = params.get('start_date'), end = params.get('end_date');
  if (!validDate(start) || !validDate(end) || start > end || Date.parse(end) - Date.parse(start) > 30 * 86400000) fail();
  return [start, end];
}
export function validateItems(items) {
  if (!Array.isArray(items) || items.length > 30) fail();
  return items.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) fail();
    const result = { name: string(item.name, 100, true), portion: string(item.portion ?? '', 100) };
    for (const key of nutrientKeys) {
      const value = item[key] ?? null;
      if (value !== null && (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > (key === 'calories' ? 20000 : 3000))) fail();
      result[key] = value === null ? null : Math.round(value * 10) / 10;
    }
    return result;
  });
}
export function validateMeal(body, id, updating = false) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || !validMealId(id) || !validDate(body.date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(body.time || '') || !mealKinds.includes(body.kind)) fail();
  if (updating && (!Number.isSafeInteger(body.version) || body.version < 1)) fail();
  if (!['manual', 'model_estimate'].includes(body.nutrition_source)) fail();
  if (body.nutrition_source === 'model_estimate' && body.nutrition_confirmed !== true) throw new MealError('confirmation_required');
  let analysis = null;
  if (body.analysis != null) {
    const analysisModel = allowedAnalysisModels.includes(body.analysis.model) ? body.analysis.model : null;
    if (!analysisModel || typeof body.analysis !== 'object' || !Array.isArray(body.analysis.items)) fail();
    const sources = body.analysis.sources ?? [];
    if (!Array.isArray(sources) || sources.length > 3) fail();
    const validSources = sources.map(source => {
      if (!source || typeof source !== 'object') fail();
      const title = string(source.title, 100, true), urlText = string(source.url, 500, true);
      let url;
      try { url = new URL(urlText); } catch { fail(); }
      if (url.protocol !== 'https:' || url.username || url.password) fail();
      return { title, url: url.href };
    });
    const searchStatus = body.analysis.search_status ?? 'unavailable';
    if (!['used', 'unavailable'].includes(searchStatus) || (searchStatus === 'used' && !validSources.length)) fail();
    analysis = { model: analysisModel, items: validateItems(body.analysis.items), uncertainty: string(body.analysis.uncertainty ?? '', 1000), sources: validSources, search_status: searchStatus };
  }
  if (body.nutrition_source === 'model_estimate' && !analysis) fail();
  return { id: id.toLowerCase(), date: body.date, time: body.time, kind: body.kind,
    name: string(body.name, 100, true), note: string(body.note ?? '', 2000),
    items: validateItems(body.items), nutrition_source: body.nutrition_source, analysis, version: body.version };
}

// Decode before storing or sending: rejects disguised files, limits pixel count,
// rotates correctly, and removes EXIF/GPS by re-encoding without metadata.
export async function sanitizePhoto(photo) {
  if (!photo || typeof photo.data_base64 !== 'string') throw new MealError('invalid_photo');
  const data = photo.data_base64;
  if (data.length > 7_000_000) throw new MealError('photo_too_large', 413);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(data) || data.length % 4 !== 0) throw new MealError('invalid_photo');
  const bytes = Buffer.from(data, 'base64');
  if (bytes.length > 5 * 1024 * 1024) throw new MealError('photo_too_large', 413);
  try {
    const image = sharp(bytes, { limitInputPixels: 24_000_000, animated: false, failOn: 'warning' });
    const info = await image.metadata();
    if (!['jpeg', 'png', 'webp', 'heif'].includes(info.format) || (info.pages || 1) > 1) throw new Error();
    return { meal_timing: photoMealTiming(info.exif), bytes: await image.rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer(), mime: 'image/jpeg' };
  } catch { throw new MealError('invalid_photo'); }
}

export function summarizeMeals(entries) {
  const totals = Object.fromEntries(nutrientKeys.map(k => [k, { value: null, complete_meals: 0 }]));
  for (const meal of entries) {
    for (const key of nutrientKeys) {
      const values = meal.items.map(i => i[key]).filter(v => v !== null);
      if (values.length) totals[key].value = (totals[key].value ?? 0) + values.reduce((a, b) => a + b, 0);
      if (meal.items.length && values.length === meal.items.length) totals[key].complete_meals++;
    }
  }
  for (const item of Object.values(totals)) if (item.value !== null) item.value = Math.round(item.value * 10) / 10;
  return { meals: entries.length, model_estimated_meals: entries.filter(e => e.nutrition_source === 'model_estimate').length, totals };
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
let initialized;
async function ready() {
  if (!process.env.DATABASE_URL) throw new Error('Database not configured');
  initialized ??= readFile(new URL('../migrations/003-meals.sql', import.meta.url), 'utf8')
    .then(sql => pool.query(sql)).catch(error => { initialized = undefined; throw error; });
  await initialized;
}
const columns = `id::text, entry_date::text AS date, to_char(meal_time, 'HH24:MI') AS time,
  kind, name, note, items, nutrition_source, analysis, photo IS NOT NULL AS has_photo, photo_count, version, created_at, updated_at`;
function publicMeal(row) {
  if (!row) return null;
  const count = row.photo_count ?? (row.has_photo ? 1 : 0);
  const photo_urls = Array.from({ length: count }, (_, i) => `/api/meals/${row.id}/photos/${i}?v=${row.version}`);
  return {
    ...row,
    photo_urls,
    photo_url: photo_urls[0] || null,
  };
}
export const mealStore = {
  async list(start, end) {
    await ready();
    const { rows } = await pool.query(`SELECT ${columns} FROM meals WHERE entry_date BETWEEN $1 AND $2 ORDER BY entry_date DESC, meal_time DESC, created_at DESC`, [start, end]);
    return rows.map(publicMeal);
  },
  async get(id) {
    await ready();
    return publicMeal((await pool.query(`SELECT ${columns} FROM meals WHERE id=$1`, [id])).rows[0]);
  },
  async photo(id, index = 0) {
    await ready();
    const row = (await pool.query('SELECT photo, photo_mime FROM meal_photos WHERE meal_id=$1 AND position=$2', [id, index])).rows[0];
    if (row) return row;
    if (index === 0) {
      return (await pool.query('SELECT photo, photo_mime FROM meals WHERE id=$1 AND photo IS NOT NULL', [id])).rows[0];
    }
    return null;
  },
  async save(meal, photoOrPhotos, updating) {
    await ready();
    let photos = undefined;
    if (Array.isArray(photoOrPhotos)) {
      photos = photoOrPhotos;
    } else if (photoOrPhotos !== undefined) {
      photos = photoOrPhotos ? [photoOrPhotos] : [];
    }

    if (updating && photos !== undefined) {
      const existingRows = (await pool.query('SELECT position, photo, photo_mime FROM meal_photos WHERE meal_id=$1 ORDER BY position ASC', [meal.id])).rows;
      if (!existingRows.length) {
        const currentMeal = (await pool.query('SELECT photo, photo_mime FROM meals WHERE id=$1 AND photo IS NOT NULL', [meal.id])).rows[0];
        if (currentMeal) existingRows.push({ position: 0, photo: currentMeal.photo, photo_mime: currentMeal.photo_mime });
      }
      const resolved = [];
      for (const p of photos) {
        if (p && p.bytes) {
          resolved.push(p);
        } else if (p && (p.existing_index !== undefined || typeof p.url === 'string')) {
          let idx = p.existing_index;
          if (idx === undefined && typeof p.url === 'string') {
            const match = /\/photos?\/(\d+)/.exec(p.url);
            idx = match ? Number(match[1]) : 0;
          }
          const found = existingRows.find(r => r.position === idx) || existingRows[idx];
          if (found) {
            resolved.push({ bytes: found.photo, mime: found.photo_mime });
          }
        }
      }
      photos = resolved;
    }

    const photoKey = photos === undefined
      ? 'keep'
      : (photos.length ? photos.map(p => p.bytes ? p.bytes.toString('base64') : (p.url || p.existing_index || '')).join(':') : 'remove');
    const hash = createHash('sha256').update(JSON.stringify({ ...meal, version: undefined })).update(photoKey).digest('hex');

    const firstPhoto = photos?.[0];
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      let result;
      if (updating) {
        const values = [meal.id, meal.date, meal.time, meal.kind, meal.name, meal.note, JSON.stringify(meal.items),
          meal.nutrition_source, meal.analysis ? JSON.stringify(meal.analysis) : null,
          firstPhoto?.bytes ?? null, firstPhoto?.mime ?? null, photos?.length ?? 0, hash];
        result = await client.query(`UPDATE meals SET entry_date=$2, meal_time=$3, kind=$4, name=$5, note=$6, items=$7::jsonb,
          nutrition_source=$8, analysis=$9::jsonb,
          photo=CASE WHEN $14 THEN $10 ELSE photo END,
          photo_mime=CASE WHEN $14 THEN $11 ELSE photo_mime END,
          photo_count=CASE WHEN $14 THEN $12 ELSE photo_count END,
          request_hash=$13, version=version+1, updated_at=now()
          WHERE id=$1 AND version=$15 RETURNING ${columns}`, [...values, photos !== undefined, meal.version]);
        if (!result.rowCount) {
          if (!await this.get(meal.id)) throw new MealError('not_found', 404);
          throw new MealError('version_conflict', 409);
        }
        if (photos !== undefined) {
          await client.query('DELETE FROM meal_photos WHERE meal_id=$1', [meal.id]);
          for (let i = 0; i < photos.length; i++) {
            await client.query('INSERT INTO meal_photos (meal_id, position, photo, photo_mime) VALUES ($1, $2, $3, $4)', [meal.id, i, photos[i].bytes, photos[i].mime]);
          }
        }
      } else {
        const values = [meal.id, meal.date, meal.time, meal.kind, meal.name, meal.note, JSON.stringify(meal.items),
          meal.nutrition_source, meal.analysis ? JSON.stringify(meal.analysis) : null,
          firstPhoto?.bytes ?? null, firstPhoto?.mime ?? null, photos?.length ?? 0, hash];
        result = await client.query(`INSERT INTO meals (id,entry_date,meal_time,kind,name,note,items,nutrition_source,analysis,photo,photo_mime,photo_count,request_hash)
          VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9::jsonb,$10,$11,$12,$13) ON CONFLICT (id) DO NOTHING RETURNING ${columns}`, values);
        if (!result.rowCount) {
          const current = (await client.query(`SELECT ${columns}, request_hash FROM meals WHERE id=$1`, [meal.id])).rows[0];
          if (!current || current.request_hash !== hash) throw new MealError('id_conflict', 409);
          delete current.request_hash;
          await client.query('COMMIT');
          return publicMeal(current);
        }
        if (photos?.length) {
          for (let i = 0; i < photos.length; i++) {
            await client.query('INSERT INTO meal_photos (meal_id, position, photo, photo_mime) VALUES ($1, $2, $3, $4)', [meal.id, i, photos[i].bytes, photos[i].mime]);
          }
        }
      }
      await client.query('COMMIT');
      return publicMeal(result.rows[0]);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },
  async remove(id, version) {
    await ready();
    const result = await pool.query('DELETE FROM meals WHERE id=$1 AND version=$2 RETURNING id', [id, version]);
    if (!result.rowCount) {
      if (!await this.get(id)) throw new MealError('not_found', 404);
      throw new MealError('version_conflict', 409);
    }
  },
};
