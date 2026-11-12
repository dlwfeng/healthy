import test from "node:test";
import assert from "node:assert/strict";
import { reportPeriod, nextRun, duePeriods } from "../src/report-time.js";
import {
  aggregate,
  collectReportData,
  querySnapshot,
  reportLocalTime,
} from "../src/report-data.js";
import {
  validateReport,
  buildReportDocument,
  bridgeHash,
  pageCsp,
} from "../src/report-renderer.js";
import { handleReportRoute } from "../src/report-routes.js";
import { startReportWorker } from "../src/report-scheduler.js";
import { Readable } from "node:stream";
import { readFile } from "node:fs/promises";

const snapshot = {
  evidence: { "day-2026-10-15": { source: "garmin", date: "2026-10-15" } },
};
const payload = {
  title: "回顾已有记录",
  summary: "依据当日记录生成。",
  html: '<article class="health-report"><section class="report-card" data-evidence="day-2026-10-15"><h2>回顾记录</h2><svg viewBox="0 0 100 50" width="100%"><title>记录</title><rect x="0" y="0" width="40" height="20" fill="var(--teal)"/></svg><details><summary>数据依据</summary><p>实际记录</p></details></section></article>',
  evidence_ids: ["day-2026-10-15"],
  suggestions: [
    {
      id: "s1",
      text: "保留记录习惯",
      rationale: "便于后续回顾",
      evidence_ids: ["day-2026-10-15"],
    },
  ],
};
test("periods use complete local days and weeks across years", () => {
  assert.deepEqual(
    reportPeriod(
      "daily",
      "2026-10-15",
      "Asia/Shanghai",
      new Date("2026-10-16T00:00:00Z"),
    ),
    {
      kind: "daily",
      period_start: "2026-10-15",
      period_end_exclusive: "2026-10-16",
      timezone: "Asia/Shanghai",
    },
  );
  assert.equal(
    reportPeriod(
      "weekly",
      "2026-01-01",
      "Asia/Shanghai",
      new Date("2026-01-05T00:15:00Z"),
    ).period_start,
    "2025-12-29",
  );
  assert.throws(
    () =>
      reportPeriod(
        "daily",
        "2026-10-16",
        "Asia/Shanghai",
        new Date("2026-10-16T00:00:00Z"),
      ),
    /not_closed/,
  );
  assert.throws(() => reportPeriod("daily", "2026-02-30"), /invalid/);
});
test("schedule runs at confirmed wall times; catch-up is bounded and enabling does not backfill", () => {
  const s = {
    kind: "daily",
    local_time: "08:00",
    weekday: 1,
    timezone: "Asia/Shanghai",
    enabled_at: "2026-10-01T00:00:00Z",
    next_run_at: "2026-10-02T00:00:00Z",
  };
  assert.equal(
    nextRun(s, new Date("2026-10-15T23:59:00Z")).toISOString(),
    "2026-10-16T00:00:00.000Z",
  );
  assert.equal(
    nextRun(
      { ...s, kind: "weekly", local_time: "08:15" },
      new Date("2026-10-16T00:00:00Z"),
    ).toISOString(),
    "2026-10-19T00:15:00.000Z",
  );
  const periods = duePeriods(s, new Date("2026-10-16T01:00:00Z"));
  assert.equal(periods.length, 7);
  assert.equal(periods.at(-1).period_start, "2026-10-15");
  assert.equal(
    duePeriods(
      { ...s, enabled_at: "2026-10-16T02:00:00Z" },
      new Date("2026-10-16T01:00:00Z"),
    ).length,
    0,
  );
  assert.equal(
    nextRun(
      { ...s, timezone: "America/New_York", local_time: "02:30" },
      new Date("2026-03-08T05:00:00Z"),
    ).toISOString(),
    "2026-03-09T06:30:00.000Z",
  );
});
test("statistics retain zero values, sample counts and missing days", () => {
  const s = aggregate(
    [
      { date: "2026-10-01", steps: 0 },
      { date: "2026-10-02", steps: null },
      { date: "2026-10-03", steps: 20 },
    ],
    "steps",
    "mean",
    "2026-10-01",
    "2026-10-03",
  );
  assert.equal(s.value, 10);
  assert.equal(s.sample_size, 2);
  assert.equal(s.expected_days, 3);
  assert.equal(
    aggregate([], "steps", "sum", "2026-10-01", "2026-10-01").value,
    null,
  );
});
test("model data uses report-local timestamps and actual sleep intervals without mutating evidence", () => {
  assert.equal(
    reportLocalTime("2026-10-10T22:30:00Z", "Asia/Shanghai"),
    "2026-10-11T06:30:00+08:00",
  );
  assert.equal(
    reportLocalTime("2026-03-08T07:30:00Z", "America/New_York"),
    "2026-03-08T03:30:00-04:00",
  );
  const input = {
    report: { timezone: "Asia/Shanghai" },
    windows: {
      baseline: { start: "2026-10-01" },
      period: { end: "2026-10-11" },
      outlook: { end: "2026-10-18" },
    },
    daily_cache: {
      "2026-10-11": {
        sleep: { start: "2026-10-10T15:00:00Z", end: "2026-10-10T22:30:00Z" },
      },
    },
    rows: {
      garmin: {
        daily: [{ date: "2026-10-11", sleepMinutes: 450 }],
        details: [
          {
            date: "2026-10-11",
            batterySeries: [
              { at: "2026-10-10T15:30:00Z", value: 10 },
              { at: "2026-10-10T16:30:00Z", value: 20 },
            ],
          },
        ],
      },
      status: {
        entries: [
          {
            date: "2026-10-11",
            created_at: "2026-10-10T23:00:00Z",
            content: "原文",
          },
        ],
      },
    },
  };
  const daily = querySnapshot(input, { source: "garmin", view: "daily" })
    .rows[0];
  assert.equal(daily.weekday, "星期日");
  assert.equal(daily.sleep_start, "2026-10-10T23:00:00+08:00");
  assert.equal(daily.sleep_end, "2026-10-11T06:30:00+08:00");
  const details = querySnapshot(input, { source: "garmin", view: "details" })
    .rows[0];
  assert.deepEqual(details.batterySeries, [
    { at: "2026-10-11T00:30:00+08:00", value: 20 },
  ]);
  assert.equal(
    querySnapshot(input, { source: "status", view: "entries" }).rows[0]
      .created_at,
    "2026-10-11T07:00:00+08:00",
  );
  assert.equal(
    input.daily_cache["2026-10-11"].sleep.start,
    "2026-10-10T15:00:00Z",
  );
});
test("HTML validator permits themed SVG/details and rejects active content, unknown evidence and CSS escape tricks", async () => {
  const valid = validateReport(payload, snapshot);
  assert.match(valid.html, /viewBox/);
  const comments = validateReport(
    {
      ...payload,
      html:
        "<!-- layout note -->" +
        payload.html.replace(
          "<h2>回顾记录</h2>",
          "<!-- section --><h2>回顾记录</h2><code>GOOD</code>",
        ),
    },
    snapshot,
  );
  assert.doesNotMatch(comments.html, /<!--/);
  assert.match(comments.html, /<code>GOOD<\/code>/);
  const normalized = validateReport(
    {
      ...payload,
      html: payload.html
        .replace(' data-evidence="day-2026-10-15"', "")
        .replace(
          "<svg ",
          '<svg xmlns="http://www.w3.org/2000/svg" font-family="sans-serif" ',
        ),
    },
    snapshot,
  );
  assert.match(normalized.html, /font-family="inherit"/);
  assert.match(normalized.html, /<article[^>]*data-evidence="day-2026-10-15"/);
  for (const attack of [
    "<script>alert(1)</script>",
    '<img src="https://example.org/a">',
    '<svg onload="alert(1)"></svg>',
    "<svg><foreignObject><div>attack</div></foreignObject></svg>",
    '<iframe srcdoc="bad"></iframe>',
    '<div style="background: url(https://example.org)">x</div>',
    '<div style="position:fixed">x</div>',
    '<div style="background: u\\72l(https://example.org)">x</div>',
    '<a href="javascript:alert(1)">x</a>',
    '<svg><path fill="url(https://example.org)" d="M0 0"/></svg>',
    '<div data-channel="spoof">x</div>',
  ])
    assert.throws(
      () =>
        validateReport(
          {
            ...payload,
            html: payload.html.replace("</article>", attack + "</article>"),
          },
          snapshot,
        ),
      /invalid_report/,
    );
  assert.throws(
    () => validateReport({ ...payload, evidence_ids: ["invented"] }, snapshot),
    /引用不存在/,
  );
  assert.throws(
    () =>
      validateReport(
        {
          ...payload,
          html: payload.html.replace(
            'data-evidence="day-2026-10-15"',
            'data-evidence="invented"',
          ),
        },
        snapshot,
      ),
    /正文证据/,
  );
  const doc = await buildReportDocument(valid.html);
  assert.match(doc.document, /default-src 'none'/);
  assert.match(doc.document, /ResizeObserver/);
  assert.match(
    doc.document,
    /--teal: #11796d;/,
    "report inherits the host's later light-theme color override",
  );
  assert.match(
    doc.document,
    /--teal: #54bdad;/,
    "report inherits the host's later dark-theme color override",
  );
  assert.ok(pageCsp.includes(bridgeHash));
  const nginx = await readFile(
    new URL("../../frontend/nginx.conf", import.meta.url),
    "utf8",
  );
  assert.ok(
    nginx.includes(bridgeHash),
    "parent CSP must permit precisely the trusted bridge",
  );
});
test("collector filters privacy, exposes all domains, avoids sample meals and paginates status evidence", async () => {
  const called = [];
  const garmin = {
    async call(name, args) {
      called.push(name);
      if (name === "get_user_summary")
        return {
          totalSteps: 0,
          restingHeartRate: 52,
          email: "private@example.com",
        };
      if (name === "get_sleep_data")
        return { dailySleepDTO: { sleepTimeSeconds: 25200 } };
      if (name === "get_hrv_data") throw Error("missing");
      if (name === "get_calendar") return { calendarItems: [] };
      return [];
    },
  };
  const records = Array.from({ length: 245 }, (_, i) => ({
    id: String(i + 1),
    date: "2026-10-15",
    content: "真实状态",
  }));
  const data = await collectReportData({
    run: {
      kind: "daily",
      period_start: "2026-10-15",
      period_end_exclusive: "2026-10-16",
      timezone: "Asia/Shanghai",
    },
    garmin,
    statusStore: { listForReport: async () => records },
    store: { cachedDay: async () => null, previous: async () => [] },
  });
  assert.equal(data.sources.meals.status, "not_integrated");
  assert.equal(data.sources.garmin.status, "partial");
  assert.equal(data.sources.status.record_count, 245);
  assert.equal(data.has_data, true);
  assert.equal(
    data.stats.find((s) => s.metric === "steps" && s.window === "period").value,
    0,
  );
  assert.equal(JSON.stringify(data).includes("private@example.com"), false);
  assert.ok(called.every((n) => n.startsWith("get_")));
  let cursor,
    rows = [];
  do {
    const page = querySnapshot(data, {
      source: "status",
      view: "entries",
      cursor,
    });
    rows.push(...page.rows);
    cursor = page.next_cursor;
  } while (cursor);
  assert.equal(rows.length, 245);
  assert.throws(
    () =>
      querySnapshot(data, {
        source: "status",
        view: "entries",
        start_date: "2020-01-01",
      }),
    /range/,
  );
});
test("report routes validate requests without opening a listener", async () => {
  const run = "4e417f2a-5d32-4801-807c-585a301d3e67";
  let calls = 0;
  const store = {
    settings: async () => [{ kind: "daily", timezone: "Asia/Shanghai" }],
    enqueue: async () => {
      calls++;
      return { run: { id: run } };
    },
  };
  async function request(method, path, value, headers = {}) {
    const req = Readable.from(
      value === undefined ? [] : [Buffer.from(JSON.stringify(value))],
    );
    req.method = method;
    req.headers = { "content-type": "application/json", ...headers };
    const res = {};
    await handleReportRoute(
      req,
      res,
      new URL(path, "http://localhost"),
      (r, status, body) => Object.assign(r, { status, body }),
      store,
    );
    return res;
  }
  assert.equal(
    (
      await request("POST", "/api/health-reports/generate", {
        kind: "daily",
        period_start: "2026-01-01",
        request_key: run,
      })
    ).status,
    202,
  );
  assert.equal(
    (
      await request("POST", "/api/health-reports/generate", {
        kind: "daily",
        period_start: "2026-02-30",
        request_key: run,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request(
        "POST",
        "/api/health-reports/generate",
        {},
        { "sec-fetch-site": "cross-site" },
      )
    ).status,
    403,
  );
  assert.equal((await request("DELETE", "/api/health-reports")).status, 405);
  assert.equal(calls, 1);
});
test("worker preserves reports on failure and stops without needing browser or clock sleep", async () => {
  let failed,
    published = false,
    claims = 0,
    resolveDone;
  const done = new Promise((r) => (resolveDone = r));
  const store = {
    schedule: async () => {
      throw Error("queue_full");
    },
    claim: async () =>
      claims++
        ? null
        : {
            id: "r",
            lease_token: "t",
            attempts: 1,
            snapshot: { has_data: true },
          },
    stage: async () => {},
    heartbeat: async () => true,
    publish: async () => {
      published = true;
    },
    fail: async (run, code, terminal) => {
      failed = { code, terminal };
      resolveDone();
    },
  };
  const worker = startReportWorker({
    store,
    generate: async () => {
      throw Error("invalid_report");
    },
    interval: 100000,
    log: { info() {}, error() {} },
  });
  await done;
  worker.stop();
  assert.equal(published, false);
  assert.deepEqual(failed, { code: "invalid_report", terminal: true });
});

test("formally stored meals can support a report when Garmin is unavailable; estimates and unknown nutrients stay distinct", async () => {
  const meal = {
    id: "4e417f2a-5d32-4801-807c-585a301d3e67",
    date: "2026-10-15",
    time: "12:30",
    kind: "午餐",
    name: "测试餐食",
    items: [
      {
        name: "测试食物",
        calories: 500,
        protein_g: null,
        carbs_g: 40,
        fat_g: 20,
      },
    ],
    nutrition_source: "model_estimate",
  };
  const data = await collectReportData({
    run: {
      kind: "daily",
      period_start: "2026-10-15",
      period_end_exclusive: "2026-10-16",
      timezone: "Asia/Shanghai",
    },
    garmin: {
      call: async () => {
        throw Error("offline");
      },
    },
    statusStore: { listForReport: async () => [] },
    store: {
      cachedDay: async () => null,
      previous: async () => [],
      mealsForReport: async () => ({ status: "available", entries: [meal] }),
    },
  });
  assert.equal(data.has_data, true);
  assert.equal(data.sources.garmin.status, "unavailable");
  assert.equal(data.sources.meals.status, "available");
  const calories = data.stats.find(
    (s) => s.window === "period" && s.metric === "recorded_calories",
  );
  assert.equal(calories.value, 500);
  assert.equal(calories.estimated_meals, 1);
  assert.equal(calories.logged_days, 1);
  assert.equal(
    data.stats.find(
      (s) => s.window === "period" && s.metric === "recorded_protein_g",
    ).value,
    null,
  );
  assert.equal(
    querySnapshot(data, { source: "meals", view: "entries" }).rows[0]
      .nutrition_source,
    "model_estimate",
  );
});

test("saved report discussions work without Garmin and load the server-owned report, without binding a port", async () => {
  const { makeServer } = await import("../src/server.js");
  const previous = process.env.MINIMAX_CN_API_KEY;
  process.env.MINIMAX_CN_API_KEY = "fixture";
  let received, requested;
  const server = makeServer({
    configStatus: async () => "garmin_unavailable",
    reports: {
      get: async (...args) => {
        requested = args;
        return {
        id: "1",
        html: "<article><p>已保存报告正文</p></article>",
        evidence_ids: ["e1"],
        evidence: { e1: { source: "fixture", value: 42 } },
        summary: "保存的摘要",
        suggestions: [],
        coverage: [],
        };
      },
    },
    chatService: async (args) => {
      received = args.reportContext;
      return "依据已保存报告回答";
    },
  });
  const req = Readable.from([
    Buffer.from(
      JSON.stringify({
        messages: [{ role: "user", content: "解释这份报告" }],
        date: "2026-10-15",
        report_context: { report_id: "1" },
      }),
    ),
  ]);
  req.method = "POST";
  req.url = "/api/chat";
  req.headers = { host: "127.0.0.1:8060", "content-type": "application/json" };
  const res = {
    writeHead(status) {
      this.status = status;
    },
    end(value) {
      this.value = JSON.parse(value);
    },
  };
  try {
    await server.listeners("request")[0](req, res);
    assert.equal(server.listening, false);
    assert.equal(res.status, 200);
    assert.equal(received.summary, "保存的摘要");
    assert.equal(received.body, "已保存报告正文");
    assert.deepEqual(requested, ["1"]);
    assert.equal(received.revision, undefined);
  } finally {
    if (previous === undefined) delete process.env.MINIMAX_CN_API_KEY;
    else process.env.MINIMAX_CN_API_KEY = previous;
  }
});

test("verified citations in suggestions are collected without requiring duplicated metadata", () => {
  const extended = {
    evidence: {
      ...snapshot.evidence,
      "extra-stat": { source: "computed", value: 2 },
    },
  };
  const result = validateReport(
    {
      ...payload,
      suggestions: [
        {
          id: "s1",
          text: "保持记录",
          rationale: "参考已有统计",
          evidence_ids: ["extra-stat"],
        },
      ],
    },
    extended,
  );
  assert.ok(result.evidence_ids.includes("extra-stat"));
  assert.throws(
    () =>
      validateReport(
        {
          ...payload,
          suggestions: [
            {
              id: "s1",
              text: "保持记录",
              rationale: "参考统计",
              evidence_ids: ["invented"],
            },
          ],
        },
        snapshot,
      ),
    /真实 evidence_id/,
  );
});
