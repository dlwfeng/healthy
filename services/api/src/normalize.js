// Explicit presentation schema: never forward complete Garmin payloads to the browser.
const object = (v) =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? v : {};
const number = (v) =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;
const firstNumber = (...vs) => vs.map(number).find((v) => v !== null) ?? null;
const text = (v) =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, 360) : null;
const list = (v) => (Array.isArray(v) ? v : []);
const minutes = (v) => (number(v) === null ? null : Math.round(v / 60));
const round = (v, places = 1) =>
  number(v) === null ? null : Math.round(v * 10 ** places) / 10 ** places;
const score = (v) => (number(v) !== null && v <= 100 ? v : null);
const isoTime = (v) => {
  if (typeof v !== "number" && typeof v !== "string") return null;
  const d = new Date(
    typeof v === "string" && !/(Z|[+-]\d\d:\d\d)$/.test(v) ? v + "Z" : v,
  );
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
};
function series(rows, timeKey, valueKey, max = 250) {
  const points = list(rows)
    .map((row) => ({
      at: isoTime(row?.[timeKey]),
      value: number(row?.[valueKey]),
    }))
    .filter((p) => p.at && p.value !== null)
    .sort((a, b) => a.at.localeCompare(b.at));
  // Keep endpoints while bounding response size. All retained values are observations.
  if (points.length <= max) return points;
  return Array.from(
    { length: max },
    (_, i) => points[Math.round((i * (points.length - 1)) / (max - 1))],
  );
}
function batteryPoints(day) {
  return series(day.bodyBatteryValuesArray, 0, 1).filter((p) => p.value <= 100);
}
export function normalizeActivity(row) {
  const a = object(row),
    type = object(a.activityType);
  const at = text(a.startTimeLocal) || text(a.startTimeGMT);
  return {
    name: text(a.activityName) || text(a.name),
    date: at?.slice(0, 10) || null,
    time: at?.slice(11, 16) || null,
    durationMinutes: minutes(a.duration),
    distanceKm: round(number(a.distance) === null ? null : a.distance / 1000),
    sport: text(type.typeKey),
    calories: number(a.calories),
    averageHeartRate: number(a.averageHR),
    maxHeartRate: number(a.maxHR),
    elevationGain: round(a.elevationGain),
  };
}
export function normalizeOverview(date, responses, errors = {}) {
  const summary = object(responses.get_user_summary);
  const sleep = object(responses.get_sleep_data),
    sleepDay = object(sleep.dailySleepDTO);
  const hrv = object(responses.get_hrv_data),
    hs = object(hrv.hrvSummary);
  const readiness = object(
    Array.isArray(responses.get_training_readiness)
      ? responses.get_training_readiness[0]
      : responses.get_training_readiness,
  );
  const batteries = list(responses.get_body_battery);
  const today = object(
    batteries.find((d) => d.date === date || d.calendarDate === date),
  );
  const batteryHistory = batteries
    .map((d) => {
      const value = firstNumber(
        d.bodyBatteryMostRecentValue,
        d.bodyBatteryValue,
        d.lastValue,
        batteryPoints(d).at(-1)?.value,
      );
      return {
        date: text(d.date) || text(d.calendarDate),
        value: score(value),
      };
    })
    .filter((d) => d.date && d.value !== null && d.date <= date)
    .sort((a, b) => a.date.localeCompare(b.date));
  const battery = firstNumber(
    summary.bodyBatteryMostRecentValue,
    summary.bbMostRecentValue,
    today.bodyBatteryMostRecentValue,
    today.bodyBatteryValue,
    today.lastValue,
    batteryPoints(today).at(-1)?.value,
  );
  const weightData = responses.get_weigh_ins;
  const weightRows = Array.isArray(weightData)
    ? weightData
    : list(object(weightData).dailyWeightSummaries).flatMap((day) =>
        list(day.allWeightMetrics).length
          ? day.allWeightMetrics.map((row) => ({
              ...row,
              calendarDate: row.calendarDate || day.summaryDate,
            }))
          : [day],
      );
  const weightHistory = weightRows
    .map((row) => {
      const d = object(row);
      const dayDate =
        text(d.calendarDate) ||
        text(d.summaryDate) ||
        text(d.date) ||
        text(d.startDate);
      // Garmin's weight and weightInGrams are grams; explicit weightInKg is already kg.
      const raw = firstNumber(d.weightInKg, d.weightInGrams, d.weight);
      const kg =
        raw === null ? null : number(d.weightInKg) !== null ? raw : raw / 1000;
      return dayDate && kg > 0 && kg < 700
        ? { date: dayDate.slice(0, 10), value: round(kg) }
        : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date));
  const activities = Array.isArray(responses.get_activities_by_date)
    ? responses.get_activities_by_date
    : null;
  const recent = list(responses.get_activities)
    .map(normalizeActivity)
    .filter((a) => a.name && a.date && a.date <= date)
    .slice(0, 30);
  const sleepScores = object(sleepDay.sleepScores || sleep.sleepScores);
  const sleepScore = firstNumber(
    object(sleepScores.overall).value,
    sleepScores.overall,
    object(sleepDay.sleepScore).value,
    sleepDay.sleepScore,
  );
  const result = {
    date,
    source: "Garmin Connect",
    syncedAt: new Date().toISOString(),
    deviceSyncedAt: isoTime(summary.lastSyncTimestampGMT),
    metrics: {
      sleepMinutes: minutes(
        firstNumber(sleepDay.sleepTimeSeconds, sleep.sleepTimeSeconds),
      ),
      bodyBattery: score(battery),
      restingHeartRate: firstNumber(
        summary.restingHeartRate,
        sleep.restingHeartRate,
      ),
      hrv: firstNumber(
        hs.lastNightAvg,
        hrv.lastNightAvg,
        sleep.avgOvernightHrv,
      ),
      trainingReadiness: score(
        firstNumber(readiness.score, readiness.trainingReadinessScore),
      ),
      steps: firstNumber(summary.totalSteps, summary.steps),
      activityCount: activities?.length ?? null,
    },
    analysis: {
      sleepScore: score(sleepScore),
      sleepQualifier: text(object(sleepScores.overall).qualifierKey),
      hrvStatus: text(hs.status || sleep.hrvStatus),
      readinessLevel: text(readiness.level),
      sleepFeedback:
        text(sleepDay.sleepScoreFeedback) || text(sleepDay.sleepScoreInsight),
      hrvFeedback: text(hs.feedbackPhrase),
      readinessFeedback:
        text(readiness.feedbackShort) || text(readiness.feedbackLong),
    },
    daily: {
      stepGoal: number(summary.dailyStepGoal),
      calories: number(summary.totalKilocalories),
      activeCalories: number(summary.activeKilocalories),
      restingCalories: number(summary.bmrKilocalories),
      distanceKm: round(
        number(summary.totalDistanceMeters) === null
          ? null
          : summary.totalDistanceMeters / 1000,
      ),
      moderateMinutes: number(summary.moderateIntensityMinutes),
      vigorousMinutes: number(summary.vigorousIntensityMinutes),
      minHeartRate: number(summary.minHeartRate),
      maxHeartRate: number(summary.maxHeartRate),
      averageStress: score(summary.averageStressLevel),
      respiration: number(summary.avgWakingRespirationValue),
      spo2: firstNumber(summary.averageSpo2, summary.latestSpo2),
      batteryCharged: firstNumber(
        summary.bodyBatteryChargedValue,
        today.charged,
      ),
      batteryDrained: firstNumber(
        summary.bodyBatteryDrainedValue,
        today.drained,
      ),
      batteryHigh: score(summary.bodyBatteryHighestValue),
      batteryLow: score(summary.bodyBatteryLowestValue),
      stressMinutes: {
        rest: minutes(summary.restStressDuration),
        low: minutes(summary.lowStressDuration),
        medium: minutes(summary.mediumStressDuration),
        high: minutes(summary.highStressDuration),
      },
    },
    sleep: {
      start: isoTime(sleepDay.sleepStartTimestampGMT),
      end: isoTime(sleepDay.sleepEndTimestampGMT),
      stages: {
        deep: minutes(sleepDay.deepSleepSeconds),
        light: minutes(sleepDay.lightSleepSeconds),
        rem: minutes(sleepDay.remSleepSeconds),
        awake: minutes(sleepDay.awakeSleepSeconds),
      },
      segments: list(sleep.sleepLevels)
        .map((row) => ({
          start: isoTime(row.startGMT),
          end: isoTime(row.endGMT),
          stage: number(row.activityLevel),
        }))
        .filter(
          (p) =>
            p.start &&
            p.end &&
            p.start < p.end &&
            [0, 1, 2, 3].includes(p.stage),
        )
        .slice(0, 160),
      averageRespiration: number(sleepDay.averageRespirationValue),
      averageStress: number(sleepDay.avgSleepStress),
      heartRate: series(sleep.sleepHeartRate, "startGMT", "value"),
    },
    hrv: {
      weeklyAverage: number(hs.weeklyAvg),
      baselineLow: number(object(hs.baseline).balancedLow),
      baselineHigh: number(object(hs.baseline).balancedUpper),
      readings: series(hrv.hrvReadings, "readingTimeGMT", "hrvValue"),
    },
    readiness: {
      recoveryMinutes: number(readiness.recoveryTime),
      acuteLoad: number(readiness.acuteLoad),
      factors: [
        ["睡眠评分", "sleepScore"],
        ["恢复时间", "recoveryTime"],
        ["急性负荷", "acwr"],
        ["HRV 状态", "hrv"],
        ["睡眠历史", "sleepHistory"],
        ["压力历史", "stressHistory"],
      ].map(([label, key]) => ({
        label,
        percent: score(readiness[key + "FactorPercent"]),
        feedback: text(readiness[key + "FactorFeedback"]),
      })),
    },
    batterySeries: batteryPoints(today),
    batteryHistory,
    weightHistory,
    recentActivities: recent,
    // Selected-day activities are separate from the history used by the training page.
    activities: list(activities)
      .map(normalizeActivity)
      .filter((a) => a.name),
    workouts: list(responses.get_workouts)
      .slice(0, 30)
      .map((w) => ({
        name: text(w.workoutName)?.slice(0, 80),
        sport:
          text(object(w.sportType).sportTypeKey) ||
          text(object(w.sportType).typeKey),
        durationMinutes:
          number(w.estimatedDurationInSecs) > 0
            ? minutes(w.estimatedDurationInSecs)
            : null,
      }))
      .filter((w) => w.name),
    unavailable: Object.keys(errors),
  };
  result.hasData = Object.values(result.metrics).some((v) => v !== null);
  return result;
}

export const HISTORY_METRICS = Object.freeze({
  bodyBattery: {
    tool: "get_user_summary",
    value: (r) => score(object(r).bodyBatteryMostRecentValue),
    unit: "/100",
  },
  calories: {
    tool: "get_user_summary",
    value: (r) => number(object(r).totalKilocalories),
    unit: "kcal",
  },
  sleep: {
    tool: "get_sleep_data",
    value: (r) =>
      normalizeOverview("", { get_sleep_data: r }).metrics.sleepMinutes,
    unit: "min",
  },
  restingHeartRate: {
    tool: "get_user_summary",
    value: (r) => number(object(r).restingHeartRate),
    unit: "bpm",
  },
  hrv: {
    tool: "get_hrv_data",
    value: (r) => number(object(object(r).hrvSummary).lastNightAvg),
    unit: "ms",
  },
  stress: {
    tool: "get_user_summary",
    value: (r) => score(object(r).averageStressLevel),
    unit: "/100",
  },
  steps: {
    tool: "get_user_summary",
    value: (r) => firstNumber(object(r).totalSteps, object(r).steps),
    unit: "steps",
  },
});
