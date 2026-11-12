import { normalizeActivity } from './normalize.js';
import { validDate, todayInShanghai } from './daily-status.js';

const num = v => typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
const activityId = v => /^[1-9]\d{0,15}$/.test(String(v)) && Number.isSafeInteger(Number(v)) ? String(v) : null;
export function activityRange(start, end) {
  return validDate(start) && validDate(end) && start >= '2000-01-01' && start <= end && end <= todayInShanghai() && (Date.parse(end) - Date.parse(start)) / 86400000 < 366;
}
export function activitySummary(raw) {
  const normalized = normalizeActivity({ ...raw, activityType: raw.activityType || raw.activityTypeDTO });
  return { ...normalized, sport: normalized.sport || 'other', id: activityId(raw.activityId),
    durationSeconds: num(raw.duration), distanceMeters: num(raw.distance) };
}
export async function loadActivities(garmin, start, end) {
  const raw = await garmin.call('get_activities_by_date', { start_date: start, end_date: end });
  if (!Array.isArray(raw)) throw Error('invalid_activities');
  const seen = new Set();
  const items = raw.filter(r => r && typeof r === 'object').map(activitySummary).filter(a => {
    if (!a.id || !validDate(a.date) || a.date < start || a.date > end || seen.has(a.id)) return false;
    seen.add(a.id); return true;
  }).sort((a,b) => b.date.localeCompare(a.date) || (b.time || '').localeCompare(a.time || '') || b.id.localeCompare(a.id));
  return { start, end, items, source: 'Garmin Connect', syncedAt: new Date().toISOString() };
}
export function activityDetail(raw, id, splits) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !raw.activityId || activityId(raw.activityId) !== id) throw Error('invalid_activity');
  const s = raw.summaryDTO || raw;
  const basic = activitySummary({ ...raw, ...s, activityId: raw.activityId, activityType: raw.activityTypeDTO || raw.activityType });
  return { ...basic, id,
    movingSeconds: num(s.movingDuration), elapsedSeconds: num(s.elapsedDuration),
    averageSpeed: num(s.averageSpeed), maxSpeed: num(s.maxSpeed),
    elevationLoss: num(s.elevationLoss), aerobicEffect: num(s.trainingEffect), anaerobicEffect: num(s.anaerobicTrainingEffect),
    averageCadence: num(s.averageRunCadence ?? s.averageBikeCadence),
    maxCadence: num(s.maxRunCadence ?? s.maxBikeCadence),
    splits: (Array.isArray(splits?.lapDTOs) ? splits.lapDTOs : Array.isArray(splits) ? splits : []).slice(0, 500).map((lap, index) => ({
      number: index + 1, durationSeconds: num(lap.duration), distanceMeters: num(lap.distance), averageHeartRate: num(lap.averageHR), maxHeartRate: num(lap.maxHR),
    })),
  };
}
export async function loadActivity(garmin, id) {
  const raw = await garmin.call('get_activity', { activity_id: Number(id) });
  let splits, unavailable = [];
  try { splits = await garmin.call('get_activity_splits', { activity_id: Number(id) }); }
  catch { unavailable.push('splits'); }
  return { activity: activityDetail(raw, id, splits), unavailable, source: 'Garmin Connect', syncedAt: new Date().toISOString() };
}
