import { mealStore, MealError, validMealId, validateMeal, dateRange, sanitizePhoto, summarizeMeals } from './meals.js';
import { analyzeMeal, chatMeal } from './meal-analysis.js';

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 32_000_000) { req.resume(); throw new MealError('request_too_large', 413); }
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new MealError('invalid_json'); }
}

async function parsePhotosInput(body) {
  if (body.photos !== undefined) {
    if (body.photos === null) return [];
    if (!Array.isArray(body.photos)) throw new MealError('invalid_parameters');
    if (body.photos.length > 9) throw new MealError('invalid_parameters');
    const list = [];
    for (const item of body.photos) {
      if (!item || typeof item !== 'object') throw new MealError('invalid_parameters');
      if (typeof item.data_base64 === 'string') {
        list.push(await sanitizePhoto(item));
      } else if (item.existing_index !== undefined || typeof item.url === 'string') {
        list.push(item);
      } else {
        throw new MealError('invalid_parameters');
      }
    }
    return list;
  }
  if (body.photo !== undefined) {
    if (body.photo === null) return null;
    return await sanitizePhoto(body.photo);
  }
  return undefined;
}
export async function mealRoutes(req, res, url, respond, store = mealStore, analyze = analyzeMeal, chat = chatMeal) {
  try {
    if (req.method !== 'GET' && req.headers['x-meal-client'] !== 'healthy') throw new MealError('forbidden', 403);
    if (url.pathname === '/api/meals/analyze') {
      if (req.method !== 'POST') throw new MealError('method_not_allowed', 405);
      const body = await readJson(req);
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new MealError('invalid_parameters');
      return respond(res, 200, { analysis: await analyze(body) });
    }
    if (url.pathname === '/api/meals/chat') {
      if (req.method !== 'POST') throw new MealError('method_not_allowed', 405);
      const body = await readJson(req);
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new MealError('invalid_parameters');
      return respond(res, 200, await chat(body));
    }
    if (url.pathname === '/api/meals') {
      if (req.method === 'GET') {
        const [start, end] = dateRange(url.searchParams);
        const entries = await store.list(start, end);
        return respond(res, 200, { entries, summary: summarizeMeals(entries) });
      }
      if (req.method !== 'POST') throw new MealError('method_not_allowed', 405);
      const body = await readJson(req);
      const meal = validateMeal(body, body?.id);
      const photos = (await parsePhotosInput(body)) ?? null;
      return respond(res, 201, { entry: await store.save(meal, photos, false) });
    }
    const match = /^\/api\/meals\/([^/]+)(?:\/(photos?)(?:\/(\d+))?)?$/.exec(url.pathname);
    if (!match || !validMealId(match[1])) throw new MealError('not_found', 404);
    const id = match[1];
    if (match[2]) {
      if (req.method !== 'GET') throw new MealError('method_not_allowed', 405);
      const index = match[3] !== undefined ? Number(match[3]) : Number(url.searchParams.get('index') ?? 0);
      const row = await store.photo(id, index);
      if (!row) throw new MealError('not_found', 404);
      res.writeHead(200, { 'Content-Type': row.photo_mime, 'Content-Length': row.photo.length, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
      return res.end(row.photo);
    }
    if (req.method === 'GET') {
      const entry = await store.get(id);
      if (!entry) throw new MealError('not_found', 404);
      return respond(res, 200, { entry });
    }
    if (req.method === 'PUT') {
      const body = await readJson(req);
      const meal = validateMeal(body, id, true);
      const photos = await parsePhotosInput(body);
      return respond(res, 200, { entry: await store.save(meal, photos, true) });
    }
    if (req.method === 'DELETE') {
      const version = Number(url.searchParams.get('version'));
      if (!Number.isSafeInteger(version) || version < 1) throw new MealError('invalid_parameters');
      await store.remove(id, version);
      return respond(res, 200, { deleted: true });
    }
    throw new MealError('method_not_allowed', 405);
  } catch (error) {
    return respond(res, error instanceof MealError ? error.status : 503, { error: error instanceof MealError ? error.message : 'database_unavailable' });
  }
}
