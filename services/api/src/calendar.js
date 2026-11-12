import { normalizeActivity } from "./normalize.js";
import { validDate } from "./daily-status.js";

const text = (v) => typeof v === "string" ? v.trim().slice(0, 360) : null;
const numeric = (v) => typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;
const id = (v) => (typeof v === "number" && Number.isSafeInteger(v) && v > 0) ||
  (typeof v === "string" && /^[1-9]\d{0,17}$/.test(v)) ? String(v) : null;

export function normalizeWorkout(raw = {}) {
  const steps = (rows, depth = 0) => depth > 4 ? [] : (Array.isArray(rows) ? rows : []).slice(0, 50).map((s) => ({
    type: text(s.stepType?.stepTypeKey), description: text(s.description),
    endCondition: text(s.endCondition?.conditionTypeKey), value: numeric(s.endConditionValue),
    target: text(s.targetType?.workoutTargetTypeKey), zone: numeric(s.zoneNumber),
    targetLow: numeric(s.targetValueOne), targetHigh: numeric(s.targetValueTwo),
    iterations: numeric(s.numberOfIterations), steps: steps(s.workoutSteps, depth + 1),
  }));
  return {
    id: id(raw.workoutId), name: text(raw.workoutName), sport: text(raw.sportType?.sportTypeKey),
    description: text(typeof raw.description === "string" ? raw.description.replace(/\s*\[zhixu:[a-f0-9]+\]/g, "") : null),
    durationMinutes: numeric(raw.estimatedDurationInSecs) > 0 ? Math.round(raw.estimatedDurationInSecs / 60) : null,
    steps: (Array.isArray(raw.workoutSegments) ? raw.workoutSegments : []).slice(0, 10).flatMap((s) => steps(s.workoutSteps)),
  };
}

export function normalizeCalendar(month, calendar, activities, unavailable = []) {
  const items = [], seen = new Set();
  for (const row of Array.isArray(activities) ? activities : []) {
    const activity = normalizeActivity(row), activityId = id(row.activityId);
    if (!activityId || !validDate(activity.date) || !activity.date.startsWith(month)) continue;
    const key = `activity:${activityId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ ...activity, id: key, activityId, kind: "activity", name: activity.name || "运动记录" });
  }
  for (const row of Array.isArray(calendar?.calendarItems) ? calendar.calendarItems : []) {
    const scheduleId = id(row.id), workoutId = id(row.workoutId);
    if (row.itemType !== "workout" || !scheduleId || !validDate(row.date) || !row.date.startsWith(month)) continue;
    const key = `workout:${scheduleId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ id: key, scheduleId, workoutId, kind: "workout", date: row.date,
      name: text(row.title) || "计划训练", sport: text(row.sportTypeKey),
      // Calendar-service uses milliseconds and centimetres; activity-list uses seconds and metres.
      durationMinutes: numeric(row.duration) > 0 ? Math.round(row.duration / 60_000) : null,
      distanceKm: numeric(row.distance) > 0 ? Math.round(row.distance / 1000) / 100 : null,
    });
  }
  items.sort((a, b) => a.date.localeCompare(b.date) || (a.time || "").localeCompare(b.time || "") || a.id.localeCompare(b.id));
  return { month, items, unavailable, source: "Garmin Connect", syncedAt: new Date().toISOString() };
}

export async function loadCalendar(garmin, month) {
  const [year, number] = month.split("-").map(Number);
  const start = `${month}-01`, end = new Date(Date.UTC(year, number, 0)).toISOString().slice(0, 10);
  let calendar, activities;
  const unavailable = [];
  try { calendar = await garmin.call("get_calendar", { year, month: number }); }
  catch { unavailable.push("get_calendar"); }
  try { activities = await garmin.call("get_activities_by_date", { start_date: start, end_date: end }); }
  catch { unavailable.push("get_activities_by_date"); }
  if (unavailable.length === 2) throw new Error("garmin_unavailable");
  return normalizeCalendar(month, calendar, activities, unavailable);
}
