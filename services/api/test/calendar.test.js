import test from "node:test";
import assert from "node:assert/strict";
import { normalizeCalendar, normalizeWorkout, loadCalendar } from "../src/calendar.js";
import { GarminMcp, READ_TOOLS, WRITE_TOOLS } from "../src/garmin.js";
import { makeTrainingTools } from "../src/training-tools.js";
import { makeServer } from "../src/server.js";

async function request(path, options = {}) {
  const server = makeServer({ configStatus: async () => options.state || "ready",
    garminClient: { call: async () => ({ calendarItems: [], workoutId: 30, workoutName: "Easy" }) } });
  return new Promise((resolve) => {
    const res = { writeHead(status) { this.status = status; }, end(body) { resolve({ status: this.status, body }); } };
    server.emit("request", { method: options.method || "GET", url: path,
      headers: { host: "127.0.0.1:8060", ...options.headers } }, res);
  });
}

test("calendar HTTP routes validate future months, methods, IDs and origin without a write route", async () => {
  for (const month of ["2026-00", "2026-13", "2026-1", "2100-01", "bad"])
    assert.equal((await request(`/api/health/calendar?month=${month}`)).status, 400);
  assert.equal((await request("/api/health/calendar?month=2027-01")).status, 200);
  assert.equal((await request("/api/health/calendar?month=2027-01", { method: "POST" })).status, 405);
  assert.equal((await request("/api/health/calendar?month=2027-01", { headers: { origin: "https://evil.example" } })).status, 403);
  assert.equal((await request("/api/health/calendar?month=2027-01", { state: "not_configured" })).status, 503);
  assert.equal((await request("/api/health/workouts/30")).status, 200);
  assert.equal((await request("/api/health/workouts/-1")).status, 400);
  assert.equal((await request("/api/health/workouts/30", { method: "POST" })).status, 405);
});

test("calendar separates dated schedules from templates, filters month and strips private data", () => {
  const calendar = { calendarItems: [
    { id: 12, workoutId: 30, itemType: "workout", date: "2026-10-18", title: "Easy run", sportTypeKey: "running", ownerId: "secret" },
    { id: 12, workoutId: 30, itemType: "workout", date: "2026-10-18", title: "Duplicate" },
    { id: 13, itemType: "workout", date: "2026-11-01", title: "Outside" },
    { id: 14, itemType: "activity", date: "2026-10-17", title: "Calendar activity duplicate" },
    { id: 15, itemType: "weight", date: "2026-10-17", weight: 70000 },
  ] };
  const activity = { activityId: 20, activityName: "Ride", startTimeLocal: "2026-10-17T08:30:00", duration: 3600,
    distance: 25000, activityType: { typeKey: "cycling" }, startLatitude: 30, ownerId: "secret" };
  const result = normalizeCalendar("2026-10", calendar, [activity, activity, { ...activity, activityId: 21, startTimeLocal: "2026-09-30T08:30:00" }]);
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].durationMinutes, 60);
  assert.equal(result.items[0].distanceKm, 25);
  assert.equal(result.items[1].workoutId, "30");
  assert.equal(result.items[1].scheduleId, "12");
  assert.equal(result.items[1].durationMinutes, null);
  assert.equal(JSON.stringify(result).includes("secret"), false);
  assert.equal(JSON.stringify(result).includes("Latitude"), false);
});

test("workout details preserve repeat groups, units and heart rate zones without owner data", () => {
  const result = normalizeWorkout({ workoutId: 30, ownerId: "private", workoutName: "Intervals", description: "Easy\n[zhixu:abcd1234]",
    estimatedDurationInSecs: 1800, sportType: { sportTypeKey: "running" },
    workoutSegments: [{ workoutSteps: [{ stepType: { stepTypeKey: "repeat" }, numberOfIterations: 4,
      workoutSteps: [{ stepType: { stepTypeKey: "interval" }, endCondition: { conditionTypeKey: "time" },
        endConditionValue: 120, targetType: { workoutTargetTypeKey: "heart.rate.zone" }, zoneNumber: 2 }] }] }] });
  assert.equal(result.description, "Easy");
  assert.equal(result.steps[0].iterations, 4);
  assert.equal(result.steps[0].steps[0].zone, 2);
  assert.equal(result.steps[0].steps[0].endCondition, "time");
  assert.equal(result.durationMinutes, 30);
  assert.equal(JSON.stringify(result).includes("private"), false);
});

test("calendar reports partial failures, uses full month range, and fails when both sources fail", async () => {
  const calls = [];
  const fake = { call: async (name, args) => {
    calls.push([name, args]);
    if (name === "get_calendar") throw Error("offline");
    return [];
  } };
  const result = await loadCalendar(fake, "2028-02");
  assert.deepEqual(result.unavailable, ["get_calendar"]);
  assert.deepEqual(calls[0], ["get_calendar", { year: 2028, month: 2 }]);
  assert.deepEqual(calls[1], ["get_activities_by_date", { start_date: "2028-02-01", end_date: "2028-02-29" }]);
  await assert.rejects(() => loadCalendar({ call: async () => { throw Error(); } }, "2026-10"), /garmin_unavailable/);
});

test("健康助手 exposes only the approved write allowlist and preserves uncertain schedule readbacks", async () => {
  assert.deepEqual(WRITE_TOOLS, [
    "create_workout",
    "schedule_workout",
    "set_activity_type",
    "fix_badminton_activity_types",
    "sync_latest_data",
    "add_weigh_in",
  ]);
  assert.ok(READ_TOOLS.includes("get_calendar"));
  await assert.rejects(() => new GarminMcp().call("delete_workout", { workout_id: 30 }), /Tool not allowed/);
  await assert.rejects(() => new GarminMcp().call("unknown_tool", {}), /Tool not allowed/);
  const calls = [];
  const tools = makeTrainingTools({ call: async (name, args) => { calls.push([name, args]); return { verified: false, schedule_id: 5 }; } });
  assert.equal(tools[0].annotations.readOnlyHint, false);
  const result = await tools[1].execute("call1", { workout_id: 30, date: "2026-10-18" });
  assert.equal(JSON.parse(result.content[0].text).verified, false);
  assert.deepEqual(calls, [["schedule_workout", { workout_id: 30, date: "2026-10-18" }]]);
});
