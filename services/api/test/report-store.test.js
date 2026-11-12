import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { makeReportStore } from "../src/reports.js";

const databaseUrl = process.env.REPORT_TEST_DATABASE_URL;
test(
  "PostgreSQL queue survives retries and regeneration atomically replaces the only published report",
  { skip: !databaseUrl },
  async () => {
    const admin = new pg.Pool({ connectionString: databaseUrl }),
      schema = "report_test_" + randomUUID().replaceAll("-", "");
    await admin.query(`CREATE SCHEMA ${schema}`);
    const pool = new pg.Pool({
        connectionString: databaseUrl,
        options: `-c search_path=${schema}`,
        max: 4,
      }),
      store = makeReportStore(pool);
    try {
      await store.ready();
      const s = await store.settings();
      assert.equal(s.length, 2);
      assert.equal(s[0].local_time, "08:00");
      const period = {
          kind: "daily",
          period_start: "2026-10-15",
          period_end_exclusive: "2026-10-16",
          timezone: "Asia/Shanghai",
        },
        key = randomUUID();
      const [first, duplicate] = await Promise.all([
        store.enqueue(period, { request_key: key }),
        store.enqueue(period, { request_key: key }),
      ]);
      assert.equal(first.run.id, duplicate.run.id);
      const other = await store.enqueue(period, { request_key: randomUUID() });
      assert.equal(other.run.id, first.run.id);
      const run = await store.claim();
      assert.equal(run.period_start, "2026-10-15");
      assert.equal(run.report_id, first.report_id);
      assert.equal(await store.claim(), null);
      await store.stage(run, "analyzing", {
        has_data: true,
        daily_cache: {
          "2026-10-15": { date: "2026-10-15", metrics: { steps: 42 } },
        },
      });
      assert.equal((await store.run(run.id)).stage, "analyzing");
      assert.equal((await store.cachedDay("2026-10-15")).metrics.steps, 42);
      const result = {
        title: "测试报告",
        summary: "用于隔离数据库验证",
        html: '<article class="health-report"><p>测试</p></article>',
        evidence_ids: [],
        suggestions: [],
        model: "fixture",
        skill_hash: "fixture",
        renderer_version: "1",
      };
      await assert.rejects(
        store.publish({ ...run, lease_token: randomUUID() }, result, {
          coverage: [],
        }),
        /lease_lost/,
      );
      await store.publish(run, result, {
        coverage: [],
        evidence: {},
        report: {},
      });
      assert.equal((await store.get(first.report_id)).title, "测试报告");
      assert.equal((await store.get(first.report_id)).revision, undefined);
      const originalContentId = (
        await pool.query("SELECT id FROM health_report_revisions WHERE report_id=$1", [first.report_id])
      ).rows[0].id;
      assert.deepEqual(await store.previous("2026-10-16"), []);
      assert.equal((await store.list()).reports.length, 1);
      const noRegenerate = await store.enqueue(period, {
        request_key: randomUUID(),
      });
      assert.equal(noRegenerate.run.revision, 1);
      const newer = await store.enqueue(period, {
        regenerate: true,
        request_key: randomUUID(),
      });
      assert.equal(newer.run.revision, 2);
      const second = await store.claim();
      await store.fail(second, "invalid_report", true);
      assert.equal((await store.get(first.report_id)).title, "测试报告");
      assert.equal((await store.run(second.id)).state, "failed");
      await store.enqueue(period, {
        regenerate: true,
        request_key: randomUUID(),
      });
      const third = await store.claim();
      await store.fail(third, "report_unavailable");
      assert.equal((await store.run(third.id)).state, "retrying");
      await pool.query(
        "UPDATE health_report_runs SET next_attempt_at=now()-interval '1 minute' WHERE id=$1",
        [third.id],
      );
      const retry = await store.claim();
      assert.equal(retry.id, third.id);
      assert.equal(retry.attempts, 2);
      await pool.query(
        "UPDATE health_report_runs SET lease_until=now()-interval '1 second' WHERE id=$1",
        [retry.id],
      );
      assert.equal(await store.heartbeat(retry), false);
      const recovered = await store.claim();
      assert.equal(recovered.attempts, 3);
      assert.notEqual(recovered.lease_token, retry.lease_token);
      await assert.rejects(
        store.publish(retry, result, { coverage: [] }),
        /lease_lost/,
      );
      await store.publish(recovered, { ...result, title: "覆盖后的报告" }, {
        coverage: [],
        evidence: {},
        report: {},
        review_method: "independent_fact_check_v1",
      });
      assert.equal((await store.get(first.report_id)).title, "覆盖后的报告");
      const publishedRows = (
        await pool.query("SELECT id,revision FROM health_report_revisions WHERE report_id=$1", [first.report_id])
      ).rows;
      assert.equal(publishedRows.length, 1);
      assert.equal(publishedRows[0].id, originalContentId);
      assert.equal(publishedRows[0].revision, 3);
      // An upgrade of a database with old published versions keeps only the
      // current content and restores the one-row invariant.
      await pool.query("DROP INDEX health_report_one_content_per_period");
      await pool.query(
        `INSERT INTO health_report_revisions(report_id,revision,title,summary,html,evidence_ids,suggestions,snapshot,snapshot_hash,model,skill_hash,renderer_version,usage)
         SELECT report_id,2,'旧内容',summary,html,evidence_ids,suggestions,snapshot,snapshot_hash,model,skill_hash,renderer_version,usage
         FROM health_report_revisions WHERE report_id=$1`,
        [first.report_id],
      );
      assert.equal(
        (await pool.query("SELECT count(*)::int AS n FROM health_report_revisions WHERE report_id=$1", [first.report_id])).rows[0].n,
        2,
      );
      await pool.query(
        await readFile(new URL("../migrations/004-single-health-report.sql", import.meta.url), "utf8"),
      );
      assert.equal(
        (await pool.query("SELECT count(*)::int AS n FROM health_report_revisions WHERE report_id=$1", [first.report_id])).rows[0].n,
        1,
      );
      assert.equal((await store.get(first.report_id)).title, "覆盖后的报告");
      assert.equal(
        (await store.previous("2026-10-16"))[0].review_method,
        "independent_fact_check_v1",
      );
      // An overdue schedule creates the same logical period once, and advances atomically.
      const now = new Date("2026-10-19T01:00:00Z");
      await pool.query(
        "UPDATE health_report_schedules SET enabled_at='2026-10-18T00:00:00Z', next_run_at=CASE kind WHEN 'daily' THEN '2026-10-19T00:00:00Z'::timestamptz ELSE '2026-10-19T00:15:00Z'::timestamptz END",
      );
      await store.schedule(now);
      const count = (
        await pool.query("SELECT count(*)::int AS n FROM health_report_runs")
      ).rows[0].n;
      await store.schedule(now);
      assert.equal(
        (await pool.query("SELECT count(*)::int AS n FROM health_report_runs"))
          .rows[0].n,
        count,
      );
      assert.equal(
        (await store.list({ kind: "weekly" })).reports[0].period_start,
        "2026-10-12",
      );
      assert.ok(
        (await store.settings()).every((s) => new Date(s.next_run_at) > now),
      );
    } finally {
      await store.close();
      await admin.query(`DROP SCHEMA ${schema} CASCADE`);
      await admin.end();
    }
  },
);
