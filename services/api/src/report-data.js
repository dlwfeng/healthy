import { randomUUID } from "node:crypto";
import { normalizeOverview, normalizeActivity } from "./normalize.js";
import { normalizeCalendar, normalizeWorkout } from "./calendar.js";
import { shiftDay, localDay } from "./report-time.js";
import { validDate } from "./daily-status.js";

export const reportMetrics = {
  sleepMinutes: [
    "睡眠时长",
    "min",
    "Garmin 归属日睡眠时长",
    (d) => d.metrics.sleepMinutes,
  ],
  sleepScore: [
    "睡眠评分",
    "/100",
    "Garmin 睡眠评分",
    (d) => d.analysis.sleepScore,
  ],
  hrv: ["夜间 HRV", "ms", "Garmin 夜间平均 HRV", (d) => d.metrics.hrv],
  restingHeartRate: [
    "静息心率",
    "bpm",
    "Garmin 静息心率",
    (d) => d.metrics.restingHeartRate,
  ],
  bodyBattery: [
    "身体电量日末值",
    "/100",
    "当日末次记录，非全天均值",
    (d) => d.metrics.bodyBattery,
  ],
  trainingReadiness: [
    "训练准备度",
    "/100",
    "Garmin 训练准备度",
    (d) => d.metrics.trainingReadiness,
  ],
  steps: ["步数", "步", "Garmin 当日步数", (d) => d.metrics.steps],
  averageStress: [
    "平均压力",
    "/100",
    "Garmin 当日平均压力",
    (d) => d.daily.averageStress,
  ],
  activeCalories: [
    "活动消耗",
    "kcal",
    "Garmin 活动消耗，非总消耗或饮食摄入",
    (d) => d.daily.activeCalories,
  ],
  calories: [
    "总消耗",
    "kcal",
    "Garmin 当日总消耗，非饮食摄入",
    (d) => d.daily.calories,
  ],
  moderateMinutes: [
    "中等强度分钟",
    "min",
    "Garmin 中等强度分钟",
    (d) => d.daily.moderateMinutes,
  ],
  vigorousMinutes: [
    "高强度分钟",
    "min",
    "Garmin 高强度分钟",
    (d) => d.daily.vigorousMinutes,
  ],
  weight: [
    "体重",
    "kg",
    "实际称量日期；同日多次取最后一次有效记录",
    (d) => d.weightHistory.at(-1)?.value ?? null,
  ],
};
export function daysBetween(start, end) {
  const out = [];
  for (let d = start; d <= end; d = shiftDay(d, 1)) out.push(d);
  return out;
}
export function aggregate(rows, metric, operation, start, end) {
  if (
    !Object.hasOwn(reportMetrics, metric) ||
    !["count", "sum", "mean", "median", "min", "max"].includes(operation) ||
    !validDate(start) ||
    !validDate(end) ||
    start > end
  )
    throw Error("invalid_statistic");
  const values = rows
    .filter((r) => r.date >= start && r.date <= end)
    .map((r) => r[metric])
    .filter((v) => typeof v === "number" && Number.isFinite(v));
  const sorted = [...values].sort((a, b) => a - b),
    count = values.length;
  let value = null;
  if (operation === "count") value = count;
  else if (count) {
    const total = values.reduce((a, b) => a + b, 0);
    value =
      operation === "sum"
        ? total
        : operation === "mean"
          ? total / count
          : operation === "min"
            ? sorted[0]
            : operation === "max"
              ? sorted.at(-1)
              : (sorted[Math.floor((count - 1) / 2)] +
                  sorted[Math.floor(count / 2)]) /
                2;
    value = Math.round(value * 100) / 100;
  }
  return {
    metric,
    operation,
    value,
    unit: operation === "count" ? "天" : reportMetrics[metric][1],
    sample_size: count,
    expected_days: daysBetween(start, end).length,
    start_date: start,
    end_date: end,
    definition: reportMetrics[metric][2],
  };
}

export async function collectReportData({
  run,
  garmin,
  statusStore,
  store,
  signal,
  onProgress = async () => {},
}) {
  const start = run.period_start,
    end = shiftDay(run.period_end_exclusive, -1),
    baseStart = shiftDay(start, -28);
  const today = localDay(new Date(), run.timezone),
    futureEnd = shiftDay(today, 6);
  const snapshot = {
    report: {
      kind: run.kind,
      period_start: start,
      period_end_exclusive: run.period_end_exclusive,
      timezone: run.timezone,
      as_of: new Date().toISOString(),
      snapshot_id: randomUUID(),
    },
    windows: {
      period: { start, end },
      comparison: { start: shiftDay(start, -7), end: shiftDay(start, -1) },
      baseline: { start: baseStart, end: shiftDay(start, -1) },
      outlook: { start: today, end: futureEnd },
    },
    sources: {},
    rows: {},
    evidence: {},
    stats: [],
    daily_cache: {},
    profile: null,
    previous_reports: [],
  };
  const evidence = (id, source, value) => {
    snapshot.evidence[id] = { source, ...value };
    return id;
  };
  let calls = 0,
    failures = 0;
  async function read(name, args) {
    signal?.throwIfAborted();
    if (++calls > 200 || failures >= 8) throw Error("source_budget_exceeded");
    try {
      const value = await garmin.call(name, args);
      failures = 0;
      return value;
    } catch (e) {
      failures++;
      throw e;
    }
  }
  const range = { start_date: baseStart, end_date: end };
  const shared = {},
    sharedErrors = {};
  for (const name of [
    "get_body_battery",
    "get_weigh_ins",
    "get_activities_by_date",
  ]) {
    try {
      shared[name] = await read(name, range);
    } catch {
      sharedErrors[name] = true;
    }
  }
  const daily = [],
    details = [];
  // Collect the report period first, then history. Baseline gaps don't prevent a useful report.
  const dates = [
    ...daysBetween(start, end),
    ...daysBetween(baseStart, shiftDay(start, -1)).reverse(),
  ];
  for (const date of dates) {
    signal?.throwIfAborted();
    await onProgress(`collecting:${date}`);
    let data = date < shiftDay(start, -2) ? await store.cachedDay(date) : null;
    if (data && Date.now() - Date.parse(data.syncedAt) > 7 * 86400000)
      data = null;
    if (!data) {
      const responses = { ...shared },
        errors = { ...sharedErrors };
      for (const name of [
        "get_user_summary",
        "get_sleep_data",
        "get_hrv_data",
        "get_training_readiness",
      ]) {
        try {
          responses[name] = await read(name, { date });
        } catch {
          errors[name] = true;
        }
      }
      responses.get_activities_by_date = (
        shared.get_activities_by_date || []
      ).filter(
        (a) => (a.startTimeLocal || a.startTimeGMT || "").slice(0, 10) === date,
      );
      data = normalizeOverview(date, responses, errors);
      data.weightHistory = data.weightHistory.filter((w) => w.date === date);
      data.batteryHistory = [];
      data.recentActivities = [];
      data.workouts = [];
    }
    // Persist only filtered, normalized health data, never raw Garmin identity/location.
    snapshot.daily_cache[date] = data;
    const row = {
      date,
      evidence_id: evidence(`day-${date}`, "garmin", {
        date,
        view: "daily",
        fetched_at: data.syncedAt,
        device_synced_at: data.deviceSyncedAt,
      }),
    };
    for (const [metric, spec] of Object.entries(reportMetrics))
      row[metric] = spec[3](data);
    snapshot.evidence[row.evidence_id].value = {
      ...row,
      evidence_id: undefined,
    };
    daily.push(row);
    details.push({ ...data, evidence_id: row.evidence_id });
  }
  daily.sort((a, b) => a.date.localeCompare(b.date));
  details.sort((a, b) => a.date.localeCompare(b.date));
  snapshot.rows.garmin = { daily, details };
  const failedDates = details
    .filter((d) => d.unavailable.length)
    .map((d) => ({ date: d.date, tools: d.unavailable }));
  const hasGarmin = daily.some((r) =>
    Object.keys(reportMetrics).some((k) => r[k] !== null),
  );
  snapshot.sources.garmin = {
    status: hasGarmin
      ? failedDates.length
        ? "partial"
        : "available"
      : "unavailable",
    views: ["daily", "details"],
    fields: Object.entries(reportMetrics).map(
      ([key, [name, unit, definition]]) => ({ key, name, unit, definition }),
    ),
    range: { start: baseStart, end },
    record_count: daily.length,
    missing: failedDates,
    read_at: new Date().toISOString(),
  };
  const seen = new Set();
  const activities = (
    Array.isArray(shared.get_activities_by_date)
      ? shared.get_activities_by_date
      : []
  ).flatMap((a) => {
    const id = String(a.activityId || "");
    if (!/^\d+$/.test(id) || seen.has(id)) return [];
    seen.add(id);
    const value = normalizeActivity(a);
    return [
      {
        ...value,
        activity_id: id,
        evidence_id: evidence(`activity-${id}`, "activities", {
          date: value.date,
          view: "activities",
          value,
        }),
      },
    ];
  });
  snapshot.rows.activities = { activities };
  snapshot.sources.activities = {
    status: sharedErrors.get_activities_by_date
      ? "unavailable"
      : activities.length
        ? "available"
        : "no_records",
    views: ["activities"],
    record_count: activities.length,
    range: { start: baseStart, end },
  };
  const plans = [],
    unavailable = [];
  const months = [
    ...new Set(
      [...daysBetween(start, end), ...daysBetween(today, futureEnd)].map((d) =>
        d.slice(0, 7),
      ),
    ),
  ];
  for (const month of months) {
    try {
      const [year, number] = month.split("-").map(Number);
      const raw = await read("get_calendar", { year, month: number });
      const data = normalizeCalendar(month, raw, []);
      for (const p of data.items.filter(
        (p) =>
          p.kind === "workout" &&
          ((p.date >= start && p.date <= end) ||
            (p.date >= today && p.date <= futureEnd)),
      ))
        plans.push({
          ...p,
          evidence_id: evidence(`plan-${p.scheduleId}`, "plans", {
            date: p.date,
            view: "plans",
            observed_at: data.syncedAt,
            value: p,
          }),
        });
    } catch {
      unavailable.push(month);
    }
  }
  const workouts = [],
    workoutErrors = [];
  const workoutIds = [
    ...new Set(plans.map((p) => p.workoutId).filter(Boolean)),
  ];
  for (const id of workoutIds.slice(0, 12)) {
    try {
      const detail = normalizeWorkout(
        await read("get_workout_by_id", { workout_id: Number(id) }),
      );
      for (const plan of plans.filter((p) => p.workoutId === id))
        workouts.push({
          ...detail,
          date: plan.date,
          evidence_id: evidence(`workout-${plan.scheduleId}`, "plans", {
            date: plan.date,
            view: "workouts",
            value: detail,
          }),
        });
    } catch {
      workoutErrors.push(id);
    }
  }
  snapshot.rows.plans = { plans, workouts };
  snapshot.sources.plans = {
    status: unavailable.length
      ? unavailable.length === months.length
        ? "unavailable"
        : "partial"
      : plans.length
        ? "available"
        : "no_records",
    views: ["plans", "workouts"],
    workout_details: {
      total: workoutIds.length,
      fetched: workoutIds.slice(0, 12).length - workoutErrors.length,
      missing: workoutErrors,
      truncated: workoutIds.length > 12,
    },
    record_count: plans.length,
    missing: unavailable,
    observed_at: new Date().toISOString(),
    historical_plan_snapshot: false,
  };
  try {
    const records = await statusStore.listForReport(baseStart, end);
    snapshot.rows.status = {
      entries: records.map((r) => ({
        ...r,
        evidence_id: evidence(`status-${r.id}`, "status", {
          date: r.date,
          view: "entries",
          value: r,
        }),
      })),
    };
    snapshot.sources.status = {
      status: records.length ? "available" : "no_records",
      views: ["entries"],
      record_count: records.length,
      range: { start: baseStart, end },
      truncated: false,
    };
  } catch {
    snapshot.rows.status = { entries: [] };
    snapshot.sources.status = {
      status: "unavailable",
      views: ["entries"],
      record_count: 0,
    };
  }
  let meals = { status: "not_integrated", entries: [] };
  if (store.mealsForReport) {
    try {
      meals = await store.mealsForReport(baseStart, end);
    } catch {
      meals = { status: "unavailable", entries: [] };
    }
  }
  snapshot.rows.meals = {
    entries: meals.entries.map((r) => ({
      ...r,
      evidence_id: evidence(`meal-${r.id}`, "meals", {
        date: r.date,
        view: "entries",
        value: r,
      }),
    })),
  };
  snapshot.sources.meals = {
    status: meals.status,
    views: ["entries"],
    record_count: meals.entries.length,
    range: { start: baseStart, end },
    reason:
      meals.status === "not_integrated"
        ? "正式饮食记录尚未接入；演示餐食不参与分析"
        : "仅包含正式保存的餐食；manual 为手工填写，model_estimate 为用户确认的模型估算，不代表精确测量或全天完整摄入",
  };
  snapshot.sources.profile = {
    status: "not_integrated",
    views: [],
    reason: "尚无统一持久化健康目标、偏好与限制资料",
  };
  snapshot.sources.conversations = {
    status: "not_integrated",
    views: [],
    reason: "既往对话没有统一持久化，不采集浏览器会话",
  };
  snapshot.sources.recipes = {
    status: "available",
    views: ["search"],
    reason: "食谱仅作可选建议参考，不代表实际摄入；按需查询",
  };
  for (const [window, { start: from, end: to }] of Object.entries(
    snapshot.windows,
  ).filter(([k]) => k !== "outlook")) {
    for (const metric of Object.keys(reportMetrics)) {
      const stat = aggregate(daily, metric, "mean", from, to),
        id = `stat-${window}-${metric}`;
      stat.evidence_id = evidence(id, "computed", { ...stat, window });
      snapshot.stats.push({ ...stat, window });
    }
    const mealRows = meals.entries.filter(
      (r) => r.date >= from && r.date <= to,
    );
    for (const [metric, unit] of Object.entries({
      calories: "kcal",
      protein_g: "g",
      carbs_g: "g",
      fat_g: "g",
    })) {
      const items = mealRows.flatMap((r) => r.items || []),
        values = items
          .map((i) => i[metric])
          .filter((v) => typeof v === "number" && Number.isFinite(v));
      const stat = {
        metric: `recorded_${metric}`,
        operation: "sum",
        value: values.length
          ? Math.round(values.reduce((a, b) => a + b, 0) * 10) / 10
          : null,
        unit,
        sample_size: values.length,
        recorded_meals: mealRows.length,
        logged_days: new Set(mealRows.map((r) => r.date)).size,
        complete_meals: mealRows.filter(
          (r) =>
            r.items?.length &&
            r.items.every((i) => typeof i[metric] === "number"),
        ).length,
        estimated_meals: mealRows.filter(
          (r) => r.nutrition_source === "model_estimate",
        ).length,
        start_date: from,
        end_date: to,
        definition:
          "仅已记录食物的营养合计，保留估算状态；不等于完整日摄入，不据此计算热量缺口",
      };
      stat.evidence_id = evidence(
        `stat-${window}-recorded-${metric}`,
        "computed",
        { ...stat, window },
      );
      snapshot.stats.push({ ...stat, window });
    }
    const rows = activities.filter((a) => a.date >= from && a.date <= to);
    const stat = {
      metric: "activityMinutes",
      operation: "sum",
      value: sharedErrors.get_activities_by_date
        ? null
        : Math.round(
            rows.reduce((s, a) => s + (a.durationMinutes || 0), 0) * 100,
          ) / 100,
      unit: "min",
      sample_size: rows.length,
      start_date: from,
      end_date: to,
      definition: "按活动 ID 去重后的实际运动时长；不等于计划训练完成率",
    };
    stat.evidence_id = evidence(`stat-${window}-activityMinutes`, "computed", {
      ...stat,
      window,
    });
    snapshot.stats.push({ ...stat, window });
  }
  try {
    snapshot.previous_reports = await store.previous(start);
  } catch {}
  for (const [source, meta] of Object.entries(snapshot.sources))
    meta.evidence_id = evidence(`coverage-${source}`, source, {
      view: "coverage",
      status: meta.status,
      record_count: meta.record_count,
      reason: meta.reason,
    });
  snapshot.report.as_of = new Date().toISOString();
  snapshot.coverage = Object.entries(snapshot.sources).map(([source, s]) => ({
    source,
    ...s,
    fields: undefined,
  }));
  snapshot.has_data =
    meals.entries.some((r) => r.date >= start && r.date <= end) ||
    daily.some(
      (r) =>
        r.date >= start &&
        r.date <= end &&
        Object.keys(reportMetrics).some((k) => r[k] !== null),
    ) ||
    activities.some((a) => a.date >= start && a.date <= end) ||
    plans.some((p) => p.date >= start && p.date <= end) ||
    snapshot.rows.status.entries.some((r) => r.date >= start && r.date <= end);
  return snapshot;
}

export function reportContext(snapshot) {
  return {
    report: {
      ...snapshot.report,
      current_local_date: localDay(new Date(), snapshot.report.timezone),
      period_is_yesterday:
        snapshot.report.kind === "daily" &&
        snapshot.report.period_end_exclusive ===
          localDay(new Date(), snapshot.report.timezone),
    },
    windows: snapshot.windows,
    sources: snapshot.sources,
    stats: snapshot.stats,
    profile: snapshot.profile,
    previous_reports: snapshot.previous_reports,
  };
}
export function reportLocalTime(value, timezone) {
  if (!value || !Number.isFinite(Date.parse(value))) return value;
  const instant = new Date(value);
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  })
    .format(instant)
    .replace(" ", "T");
  const offset = Math.round(
    (Date.parse(parts + "Z") - Math.floor(+instant / 1000) * 1000) / 60000,
  );
  const sign = offset >= 0 ? "+" : "-",
    abs = Math.abs(offset);
  return (
    parts +
    sign +
    String(Math.floor(abs / 60)).padStart(2, "0") +
    ":" +
    String(abs % 60).padStart(2, "0")
  );
}
export function querySnapshot(
  snapshot,
  { source, view, start_date, end_date, cursor },
) {
  if (
    !Object.hasOwn(snapshot.rows, source) ||
    !Object.hasOwn(snapshot.rows[source], view)
  )
    throw Error("invalid_view");
  const allowed = snapshot.windows,
    from = start_date || allowed.baseline.start,
    to =
      end_date ||
      (source === "plans" ? allowed.outlook.end : allowed.period.end);
  if (
    !validDate(from) ||
    !validDate(to) ||
    from > to ||
    from < allowed.baseline.start ||
    to >
      (source === "plans"
        ? allowed.outlook.end > allowed.period.end
          ? allowed.outlook.end
          : allowed.period.end
        : allowed.period.end)
  )
    throw Error("invalid_range");
  const offset = cursor === undefined ? 0 : Number(cursor);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1000000)
    throw Error("invalid_cursor");
  let rows = snapshot.rows[source][view].filter(
    (r) => r.date >= from && r.date <= to,
  );
  if (source === "garmin" && view === "daily")
    rows = rows.map((r) => ({
      ...r,
      weekday: new Intl.DateTimeFormat("zh-CN", {
        timeZone: "UTC",
        weekday: "long",
      }).format(new Date(r.date + "T12:00:00Z")),
      sleep_start:
        reportLocalTime(
          snapshot.daily_cache?.[r.date]?.sleep?.start,
          snapshot.report.timezone,
        ) ?? null,
      sleep_end:
        reportLocalTime(
          snapshot.daily_cache?.[r.date]?.sleep?.end,
          snapshot.report.timezone,
        ) ?? null,
      sleep_date_note:
        "睡眠按 Garmin 归属日列出；不等于该日晚上，讨论运动前后必须核对实际起止时间。",
    }));
  const local = (value) => reportLocalTime(value, snapshot.report.timezone);
  const points = (values) =>
    (values || []).map((p) => ({ ...p, at: local(p.at) }));
  if (source === "garmin" && view === "details")
    rows = rows.map((r) => ({
      ...r,
      sleep: {
        ...r.sleep,
        start: local(r.sleep?.start),
        end: local(r.sleep?.end),
        segments: (r.sleep?.segments || []).map((s) => ({
          ...s,
          start: local(s.start),
          end: local(s.end),
        })),
        heartRate: points(r.sleep?.heartRate),
      },
      batterySeries: points(r.batterySeries).filter(
        (p) => p.at?.slice(0, 10) === r.date,
      ),
      hrv: { ...r.hrv, readings: points(r.hrv?.readings) },
      readiness: {
        ...r.readiness,
        factor_definition:
          "各因素的 percent 是 Garmin 返回的反馈指标，不是权重、贡献率或扣分占比，不用它反推生理原因。",
      },
      time_note:
        "所有时间已由程序转换成报告时区并带 UTC 偏移，无需自行加减时差。",
    }));
  if (source === "status")
    rows = rows.map((r) => ({
      ...r,
      created_at: local(r.created_at),
      source_note:
        "个人保存的原文；其中的数值或旧建议不是已经核验的 Garmin 观测，也不是新写入授权。",
    }));
  const pageSize = ["details", "workouts"].includes(view) ? 1 : 40;
  return {
    source,
    view,
    rows: rows.slice(offset, offset + pageSize),
    total: rows.length,
    next_cursor:
      offset + pageSize < rows.length ? String(offset + pageSize) : null,
    truncated: offset + pageSize < rows.length,
  };
}
