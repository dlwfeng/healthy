import test from "node:test";
import assert from "node:assert/strict";
import { normalizeOverview } from "../src/normalize.js";
import { loadOverview } from "../src/overview.js";
import { makeServer } from "../src/server.js";

const date = "2026-10-12";
const responses = {
  get_user_summary: {
    totalSteps: 8934,
    restingHeartRate: 53,
    bodyBatteryMostRecentValue: 73,
    email: "hidden@example.com",
  },
  get_sleep_data: { dailySleepDTO: { sleepTimeSeconds: 28200 } },
  get_hrv_data: { hrvSummary: { lastNightAvg: 47, status: "BALANCED" } },
  get_training_readiness: [{ score: 82, level: "HIGH" }],
  get_body_battery: [
    {
      date,
      bodyBatteryValuesArray: [
        [1000000000000, 53],
        [1000000010000, 74],
      ],
    },
  ],
  get_activities_by_date: [{ activityId: 1 }],
  get_workouts: [
    {
      workoutName: "Light run",
      sportType: { sportTypeKey: "running" },
      estimatedDurationInSecs: 1800,
      email: "secret@example.com",
    },
  ],
};

test("normalizes only permitted health metrics and follows Garmin battery row structure", () => {
  const data = normalizeOverview(date, responses);
  assert.deepEqual(data.metrics, {
    sleepMinutes: 470,
    bodyBattery: 73,
    restingHeartRate: 53,
    hrv: 47,
    trainingReadiness: 82,
    steps: 8934,
    activityCount: 1,
  });
  assert.deepEqual(data.batteryHistory, [{ date, value: 74 }]);
  assert.deepEqual(data.workouts, [
    { name: "Light run", sport: "running", durationMinutes: 30 },
  ]);
  assert.equal(JSON.stringify(data).includes("hidden@example.com"), false);
});

test("partial failures leave missing metrics blank and never trigger write tools", async () => {
  const called = [];
  const fake = {
    call: async (name) => {
      called.push(name);
      if (name === "get_sleep_data") throw Error("failed");
      return responses[name];
    },
  };
  const data = await loadOverview(fake, date, 7, true);
  assert.equal(data.metrics.sleepMinutes, null);
  assert.ok(data.unavailable.includes("get_sleep_data"));
  assert.ok(
    called.length > 0 && called.every((name) => name.startsWith("get_")),
  );
});

test("HTTP server validates origin, date and method; returns only normalized data", async (t) => {
  const server = makeServer({
    garminClient: { call: async (name) => responses[name] },
    configStatus: async () => "ready",
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.equal(
    (await fetch(base + "/api/health/overview?date=2026-02-30")).status,
    400,
  );
  assert.equal(
    (
      await fetch(base + "/api/health/overview?date=" + date, {
        headers: { Origin: "https://example.org" },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await fetch(base + "/api/health/overview?date=" + date, {
        method: "POST",
      })
    ).status,
    405,
  );
  assert.equal(
    (await fetch(base + "/garmin-mcp/config/garmin.json")).status,
    404,
  );
  const result = await fetch(
    base + `/api/health/overview?date=${date}&refresh=1`,
  );
  assert.equal(result.status, 200);
  assert.equal(result.headers.get("access-control-allow-origin"), null);
  const raw = await result.text();
  assert.ok(raw.includes('"sleepMinutes":470'));
  assert.equal(raw.includes("hidden@example.com"), false);
});

test("chat streams public 健康助手 progress and keeps the final answer", async (t) => {
  const previousKey = process.env.MINIMAX_CN_API_KEY;
  process.env.MINIMAX_CN_API_KEY = "test-key";
  t.after(() => {
    if (previousKey === undefined) delete process.env.MINIMAX_CN_API_KEY;
    else process.env.MINIMAX_CN_API_KEY = previousKey;
  });
  const server = makeServer({
    configStatus: async () => "ready",
    chatService: async ({ onEvent }) => {
      onEvent({ type: "tool_start", tool: "get_sleep_data" });
      onEvent({ type: "tool_end", tool: "get_sleep_data", success: true });
      onEvent({ type: "text", delta: "**睡眠**" });
      return "**睡眠** 7 小时";
    },
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const response = await fetch(
    `http://127.0.0.1:${server.address().port}/api/chat`,
    {
      method: "POST",
      headers: {
        Accept: "application/x-ndjson",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        date,
        messages: [{ role: "user", content: "昨晚睡了多久？" }],
      }),
    },
  );
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /application\/x-ndjson/);
  const events = (await response.text()).trim().split("\n").map(JSON.parse);
  assert.deepEqual(
    events.map((event) => event.type),
    ["status", "tool_start", "tool_end", "text", "done"],
  );
  assert.equal(events.at(-1).answer, "**睡眠** 7 小时");
  assert.equal(Object.hasOwn(events.at(-1), "html"), false);
});

test("presentation schema reads nested sleep scores, Garmin weight summaries and missing values", () => {
  const data = normalizeOverview(date, {
    get_user_summary: {
      averageStressLevel: -1,
      dailyStepGoal: 7500,
      activeKilocalories: 0,
      averageSpo2: null,
      lastSyncTimestampGMT: "2026-10-12T08:00:00.0",
    },
    get_sleep_data: {
      dailySleepDTO: {
        sleepTimeSeconds: 25200,
        deepSleepSeconds: 5400,
        sleepScores: { overall: { value: 85, qualifierKey: "GOOD" } },
      },
      sleepHeartRate: [
        { startGMT: 1791763200000, value: 52 },
        { startGMT: 1791763260000, value: -1 },
      ],
    },
    get_weigh_ins: {
      dailyWeightSummaries: [
        {
          summaryDate: date,
          allWeightMetrics: [{ weight: 72300, userProfilePk: "secret" }],
        },
      ],
    },
    get_hrv_data: { hrvSummary: { weeklyAvg: 61 } },
  });
  assert.equal(data.analysis.sleepScore, 85);
  assert.equal(data.analysis.sleepQualifier, "GOOD");
  assert.deepEqual(data.weightHistory, [{ date, value: 72.3 }]);
  assert.equal(data.daily.averageStress, null);
  assert.equal(data.daily.activeCalories, 0);
  assert.equal(data.metrics.hrv, null); // A weekly average must never be labeled as last night's value.
  assert.equal(data.hrv.weeklyAverage, 61);
  assert.equal(data.sleep.heartRate.length, 1);
  assert.equal(data.deviceSyncedAt, "2026-10-12T08:00:00.000Z");
  assert.ok(!JSON.stringify(data).includes("secret"));
});

test("activity presentation filters records after the selected date and strips identifiers and location", () => {
  const data = normalizeOverview(date, {
    get_activities: [
      {
        activityName: "Old run",
        startTimeLocal: "2026-10-11 07:30:00",
        activityId: "hidden",
        startLatitude: 10,
        startLongitude: 20,
        duration: 3600,
        distance: 10000,
        calories: 600,
        averageHR: 140,
        activityType: { typeKey: "running" },
      },
      { activityName: "Future run", startTimeLocal: "2026-10-13 07:00:00" },
    ],
  });
  assert.equal(data.recentActivities.length, 1);
  assert.equal(data.recentActivities[0].distanceKm, 10);
  assert.equal(data.recentActivities[0].averageHeartRate, 140);
  assert.ok(!JSON.stringify(data).includes("hidden"));
  assert.ok(!JSON.stringify(data).includes("Latitude"));
});

test("history keeps absent days as null, shares cached daily reads, and rejects unknown metrics", async () => {
  const { loadHistory } = await import("../src/overview.js");
  let calls = 0;
  const fake = {
    call: async (_name, args) => {
      calls++;
      if (args.date === "2025-01-03") throw Error("offline");
      return {
        totalSteps: args.date === "2025-01-04" ? 0 : 4000,
        restingHeartRate: 50,
      };
    },
  };
  const data = await loadHistory(fake, "2025-01-07", 7, "steps", {
    refresh: true,
  });
  assert.equal(data.points.length, 7);
  assert.deepEqual(data.points[0], { date: "2025-01-01", value: 4000 });
  assert.equal(data.points[2].value, null);
  assert.equal(data.points[3].value, 0);
  assert.deepEqual(data.unavailable, ["2025-01-03"]);
  await loadHistory(fake, "2025-01-07", 7, "restingHeartRate");
  assert.equal(calls, 8); // Six successful day responses reused; failed day retried.
  await assert.rejects(
    loadHistory(fake, date, 7, "constructor"),
    /invalid_metric/,
  );
});

test("calorie history reads Garmin total expenditure, preserves zero and leaves absent days unknown", async () => {
  const { loadHistory } = await import("../src/overview.js");
  const history = await loadHistory({ call: async (name, { date }) => {
    assert.equal(name, 'get_user_summary');
    return { totalKilocalories: date.endsWith('01') ? 0 : date.endsWith('02') ? null : 2300, activeKilocalories: 500 };
  } }, '2024-12-07', 7, 'calories', { refresh: true });
  assert.equal(history.unit, 'kcal');
  assert.equal(history.points[0].value, 0);
  assert.equal(history.points[1].value, null);
  assert.equal(history.points[2].value, 2300, 'total expenditure must not add active calories again');
});
