import { normalizeOverview, HISTORY_METRICS } from "./normalize.js";

const cache = new Map();
const CACHE_MS = 2 * 60 * 1000;
const MAX_CACHE = 10;

export async function loadOverview(garmin, date, days, refresh = false) {
  const key = `${date}:${days}`;
  if (!refresh && cache.has(key) && Date.now() - cache.get(key).at < CACHE_MS)
    return cache.get(key).value;
  const fromDate = new Date(`${date}T12:00:00Z`);
  fromDate.setUTCDate(fromDate.getUTCDate() - days + 1);
  const start = fromDate.toISOString().slice(0, 10);
  const args = {
    get_user_summary: { date },
    get_sleep_data: { date },
    get_hrv_data: { date },
    get_body_battery: { start_date: start, end_date: date },
    get_weigh_ins: { start_date: start, end_date: date },
    get_training_readiness: { date },
    get_activities_by_date: { start_date: date, end_date: date },
    get_activities: { start_date: start, end_date: date },
    get_workouts: {},
  };
  // The Python Garmin client is synchronous; sequential calls avoid overlapping requests and make partial failures legible.
  const responses = {},
    errors = {};
  for (const name of Object.keys(args)) {
    try {
      responses[name] = await garmin.call(
        name === "get_activities" ? "get_activities_by_date" : name,
        args[name],
      );
    } catch {
      errors[name] = true;
    }
  }
  const value = normalizeOverview(date, responses, errors);
  if (Object.keys(errors).length === Object.keys(args).length)
    throw new Error("garmin_unavailable");
  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value);
  cache.set(key, { at: Date.now(), value });
  return value;
}

// Historical reads are lazy and share the underlying daily response across metrics.
const historyCache = new Map();
const historyPending = new Map();
let historyQueue = Promise.resolve();
function dailyRead(garmin, tool, date, refresh) {
  const key = `${tool}:${date}`;
  if (refresh) historyCache.delete(key);
  const cached = historyCache.get(key);
  if (cached && Date.now() - cached.at < 5 * 60_000)
    return Promise.resolve(cached.value);
  if (historyPending.has(key)) return historyPending.get(key);
  const work = historyQueue
    .catch(() => {})
    .then(async () => {
      const value = await garmin.call(tool, { date });
      if (historyCache.size >= 400)
        historyCache.delete(historyCache.keys().next().value);
      historyCache.set(key, { at: Date.now(), value });
      return value;
    });
  historyQueue = work.catch(() => {});
  historyPending.set(key, work);
  work.finally(() => historyPending.delete(key)).catch(() => {});
  return work;
}
export async function loadHistory(
  garmin,
  date,
  days,
  metric,
  { refresh = false, signal } = {},
) {
  const spec = Object.hasOwn(HISTORY_METRICS, metric)
    ? HISTORY_METRICS[metric]
    : null;
  if (!spec) throw new Error("invalid_metric");
  const points = [],
    unavailable = [];
  for (let i = days - 1; i >= 0; i--) {
    signal?.throwIfAborted();
    const d = new Date(`${date}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - i);
    const day = d.toISOString().slice(0, 10);
    try {
      points.push({
        date: day,
        value: spec.value(await dailyRead(garmin, spec.tool, day, refresh)),
      });
    } catch {
      points.push({ date: day, value: null });
      unavailable.push(day);
    }
  }
  if (unavailable.length === days) throw new Error("garmin_unavailable");
  return {
    source: "Garmin Connect",
    metric,
    unit: spec.unit,
    date,
    days,
    points,
    unavailable,
    syncedAt: new Date().toISOString(),
  };
}
