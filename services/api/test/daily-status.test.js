import test from "node:test";
import assert from "node:assert/strict";
import { validDate, todayInShanghai } from "../src/daily-status.js";
import { dailyStatusToken, authorizedDailyStatus } from "../src/daily-status-auth.js";
import { makeDailyStatusTools } from "../src/daily-status-tools.js";

test("daily status date validation rejects impossible dates", () => {
  assert.equal(validDate("2026-02-28"), true);
  assert.equal(validDate("2026-02-30"), false);
  assert.equal(validDate("2026-2-8"), false);
  assert.match(todayInShanghai(), /^\d{4}-\d{2}-\d{2}$/);
});

test("daily status endpoint accepts only the internal tool token", () => {
  assert.equal(authorizedDailyStatus({ headers: {} }), false);
  assert.equal(authorizedDailyStatus({ headers: { "x-daily-status-token": "bad" } }), false);
  assert.equal(authorizedDailyStatus({ headers: { "x-daily-status-token": dailyStatusToken } }), true);
});

test("健康助手 tools call the backend API with explicit text and date", async () => {
  const previousFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, json: async () => ({ entry: { date: "2026-10-14", content: "今天很累" } }) };
  };
  try {
    const [record, get] = makeDailyStatusTools();
    await record.execute("call-1", { date: "2026-10-14", content: "今天很累" });
    await get.execute("call-2", { start_date: "2026-10-14", end_date: "2026-10-14" });
    assert.equal(calls[0].options.method, "POST");
    assert.deepEqual(JSON.parse(calls[0].options.body), { date: "2026-10-14", content: "今天很累" });
    assert.equal(calls[0].options.headers["X-Daily-Status-Token"], dailyStatusToken);
    assert.match(calls[1].url, /\/api\/daily-status\?start_date=2026-10-14&end_date=2026-10-14$/);
  } finally {
    globalThis.fetch = previousFetch;
  }
});
