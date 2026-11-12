import { validDate } from "./daily-status.js";

export function shiftDay(date, days) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function localDay(now = new Date(), timezone = "Asia/Shanghai") {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export function monday(date) {
  return shiftDay(date, -((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7));
}
export function reportPeriod(
  kind,
  start,
  timezone = "Asia/Shanghai",
  now = new Date(),
) {
  if (
    !["daily", "weekly"].includes(kind) ||
    !validDate(start) ||
    start < "2020-01-01"
  )
    throw Error("invalid_parameters");
  if (kind === "weekly") start = monday(start);
  const end = shiftDay(start, kind === "weekly" ? 7 : 1);
  if (end > localDay(now, timezone)) throw Error("period_not_closed");
  return { kind, period_start: start, period_end_exclusive: end, timezone };
}
export function validTimezone(value) {
  try {
    return (
      typeof value === "string" &&
      value.length <= 80 &&
      !!new Intl.DateTimeFormat("en", { timeZone: value })
    );
  } catch {
    return false;
  }
}
// Resolve wall time without relying on the host timezone. Nonexistent DST times
// are skipped; repeated times resolve to one deterministic instant.
function wallTime(date, time, timezone) {
  const target = Date.parse(`${date}T${time}:00Z`);
  let guess = target;
  const format = new Intl.DateTimeFormat("sv-SE", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  for (let i = 0; i < 4; i++) {
    const observed = format.format(new Date(guess));
    const diff = target - Date.parse(observed.replace(" ", "T") + "Z");
    if (!diff) return new Date(guess);
    guess += diff;
  }
  return null;
}
export function nextRun(schedule, after = new Date()) {
  const date = localDay(after, schedule.timezone);
  for (let i = 0; i < 9; i++) {
    const day = shiftDay(date, i);
    if (
      schedule.kind === "weekly" &&
      new Date(`${day}T12:00:00Z`).getUTCDay() !== schedule.weekday
    )
      continue;
    const at = wallTime(day, schedule.local_time, schedule.timezone);
    if (at && at > after) return at;
  }
  throw Error("invalid_schedule");
}
export function duePeriods(schedule, now = new Date()) {
  const today = localDay(now, schedule.timezone);
  const periods = [];
  let at = new Date(schedule.next_run_at);
  if (!Number.isFinite(+at)) return periods;
  // Bound catch-up independently of downtime; older periods remain manual.
  const floor = shiftDay(today, schedule.kind === "daily" ? -7 : -14);
  if (localDay(at, schedule.timezone) < floor)
    at = nextRun(schedule, new Date(`${floor}T00:00:00Z`));
  while (at <= now && periods.length < 16) {
    const runDay = localDay(at, schedule.timezone);
    const start =
      schedule.kind === "daily"
        ? shiftDay(runDay, -1)
        : shiftDay(monday(runDay), -7);
    if (at >= new Date(schedule.enabled_at))
      periods.push(reportPeriod(schedule.kind, start, schedule.timezone, now));
    at = nextRun(schedule, at);
  }
  return periods.slice(schedule.kind === "daily" ? -7 : -1);
}
