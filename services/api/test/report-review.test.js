import test from "node:test";
import assert from "node:assert/strict";
import { auditCandidate, validateFactReview } from "../src/report-review.js";
import { amendCandidate } from "../src/report-amend.js";

test("targeted amendments preserve unrelated facts/layout and reject ambiguous or partial edits atomically", () => {
  const original = {
    title: "旧标题",
    summary: "原摘要",
    html: "<article><p>日期有误</p><p>其他数值 10</p></article>",
    evidence_ids: ["day"],
  };
  const updated = amendCandidate(original, {
    replacements: [{ before: "日期有误", after: "日期已核对" }],
    title: "新标题",
  });
  assert.equal(
    updated.html,
    "<article><p>日期已核对</p><p>其他数值 10</p></article>",
  );
  assert.equal(updated.summary, original.summary);
  assert.equal(updated.title, "新标题");
  assert.throws(
    () =>
      amendCandidate(original, {
        replacements: [
          { before: "日期有误", after: "改动" },
          { before: "missing", after: "补写" },
        ],
      }),
    /replacements\[1\].before 在当前 HTML 中精确匹配 0 次/,
  );
  assert.throws(
    () =>
      amendCandidate(original, {
        replacements: [{ before: "<p>", after: "<div>" }],
      }),
    /replacements\[0\].before 在当前 HTML 中精确匹配 2 次/,
  );
  assert.equal(original.title, "旧标题");
  assert.match(original.html, /日期有误/);
});

const checked = ["dates", "numbers", "sources", "interpretation", "charts"];
const snapshot = {
  report: { timezone: "Asia/Shanghai" },
  windows: {
    baseline: { start: "2026-10-01" },
    period: { start: "2026-10-15", end: "2026-10-15" },
    outlook: { end: "2026-10-22" },
  },
  rows: {
    garmin: {
      daily: [],
      details: [
        {
          date: "2026-10-15",
          evidence_id: "day",
          analysis: { readinessFeedback: "GOOD" },
          sleep: {
            start: "2026-10-14T16:30:00Z",
            end: "2026-10-14T23:30:00Z",
            stages: { deep: 60 },
          },
        },
      ],
    },
  },
  evidence: { day: { source: "garmin" } },
};
test("independent fact review requires an explicit, complete verdict with real evidence and fails closed", () => {
  assert.equal(
    validateFactReview({ verdict: "pass", checked, issues: [] }, snapshot)
      .verdict,
    "pass",
  );
  assert.equal(
    validateFactReview(
      {
        verdict: "revise",
        checked,
        issues: [{ description: "日期需要修正", evidence_ids: ["day"] }],
      },
      snapshot,
    ).verdict,
    "revise",
  );
  for (const value of [
    { verdict: "pass", checked: [], issues: [] },
    {
      verdict: "pass",
      checked,
      issues: [{ description: "有错", evidence_ids: [] }],
    },
    { verdict: "revise", checked, issues: [] },
    {
      verdict: "revise",
      checked,
      issues: [{ description: "有错", evidence_ids: ["invented"] }],
    },
  ])
    assert.throws(
      () => validateFactReview(value, snapshot),
      /invalid_fact_review/,
    );
});
test("auditor has a fresh session with read tools and cannot submit HTML; silence cannot authorize publishing", async () => {
  let disposed = 0,
    calls = 0,
    submitVerdict = true;
  const makeSession = async (systemPrompt, tools) => {
    assert.match(systemPrompt, /独立事实审查员/);
    assert.deepEqual(
      tools.map((t) => t.name),
      ["get_user_summary", "review_health_report"],
    );
    return {
      subscribe() {
        return () => {};
      },
      async prompt(text) {
        const input = JSON.parse(text);
        assert.equal(input.candidate.html, "candidate");
        assert.equal(input.cited_evidence.day.source, "garmin");
        assert.equal(
          input.period_details[0].analysis.readinessFeedback,
          "GOOD",
        );
        assert.equal(
          input.period_details[0].sleep.start,
          "2026-10-15T00:30:00+08:00",
        );
        if (submitVerdict)
          await tools
            .at(-1)
            .execute("id", { verdict: "pass", checked, issues: [] });
      },
      dispose() {
        disposed++;
      },
      async abort() {},
    };
  };
  const args = {
    candidate: { html: "candidate", evidence_ids: ["day"] },
    snapshot,
    makeSession,
    readTools: [
      { name: "get_user_summary", annotations: { readOnlyHint: true } },
      { name: "submit_health_report" },
      { name: "search_report_recipes" },
    ],
    signal: new AbortController().signal,
    countCall() {
      calls++;
    },
    onUsage() {},
    async onStage() {},
  };
  assert.equal((await auditCandidate(args)).verdict, "pass");
  submitVerdict = false;
  await assert.rejects(auditCandidate(args), /invalid_report/);
  assert.equal(calls, 1);
  assert.equal(disposed, 2);
});
