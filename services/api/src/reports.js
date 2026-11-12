import pg from "pg";
import { readFile } from "node:fs/promises";
import { randomUUID, createHash } from "node:crypto";
import { nextRun, duePeriods, validTimezone } from "./report-time.js";

export const activeStates = ["queued", "running", "retrying"];
const publicRun = `j.id, j.report_id::text, j.revision, j.state, j.stage, j.attempts, j.error_code, j.created_at, j.finished_at`;
export function makeReportStore(
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 5 }),
) {
  let initialized;
  async function ready() {
    initialized ??= (async () => {
      for (const migration of [
        "003-health-reports.sql",
        "004-single-health-report.sql",
      ])
        await pool.query(
          await readFile(new URL("../migrations/" + migration, import.meta.url), "utf8"),
        );
      for (const s of (
        await pool.query(
          "SELECT * FROM health_report_schedules WHERE next_run_at IS NULL",
        )
      ).rows)
        await pool.query(
          "UPDATE health_report_schedules SET next_run_at=$2 WHERE kind=$1 AND next_run_at IS NULL",
          [s.kind, nextRun(s)],
        );
    })().catch((e) => {
      initialized = undefined;
      throw e;
    });
    return initialized;
  }
  async function transaction(fn) {
    await ready();
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      const value = await fn(c);
      await c.query("COMMIT");
      return value;
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
  async function enqueue(
    c,
    period,
    { regenerate = false, request_key = null, trigger = "manual" } = {},
  ) {
    await c.query("SELECT pg_advisory_xact_lock(30600815)");
    if (request_key) {
      const old = (
        await c.query(
          `SELECT ${publicRun} FROM health_report_runs j WHERE request_key=$1`,
          [request_key],
        )
      ).rows[0];
      if (old) return { run: old, report_id: old.report_id };
    }
    const report = (
      await c.query(
        `INSERT INTO health_reports(kind,period_start,period_end_exclusive,timezone) VALUES($1,$2,$3,$4)
      ON CONFLICT(kind,period_start,period_end_exclusive,timezone) DO UPDATE SET timezone=EXCLUDED.timezone RETURNING *`,
        [
          period.kind,
          period.period_start,
          period.period_end_exclusive,
          period.timezone,
        ],
      )
    ).rows[0];
    const latest = (
      await c.query(
        `SELECT ${publicRun} FROM health_report_runs j WHERE report_id=$1 ORDER BY revision DESC LIMIT 1`,
        [report.id],
      )
    ).rows[0];
    if (
      latest &&
      (activeStates.includes(latest.state) ||
        trigger === "scheduled" ||
        (report.current_revision_id && !regenerate))
    )
      return { run: latest, report_id: String(report.id) };
    const count = Number(
      (
        await c.query(
          "SELECT count(*) FROM health_report_runs WHERE state IN ('queued','running','retrying')",
        )
      ).rows[0].count,
    );
    if (count >= 20) throw Error("queue_full");
    const row = (
      await c.query(
        `INSERT INTO health_report_runs(id,report_id,revision,request_key,trigger_source) VALUES($1,$2,$3,$4,$5) RETURNING *`,
        [
          randomUUID(),
          report.id,
          (latest?.revision || 0) + 1,
          request_key,
          trigger,
        ],
      )
    ).rows[0];
    delete row.snapshot;
    delete row.lease_token;
    return {
      run: { ...row, report_id: String(row.report_id) },
      report_id: String(report.id),
    };
  }
  return {
    ready,
    close: () => pool.end(),
    enqueue: (period, options) =>
      transaction((c) => enqueue(c, period, options)),
    async settings() {
      await ready();
      return (
        await pool.query("SELECT * FROM health_report_schedules ORDER BY kind")
      ).rows;
    },
    async updateSettings(rows) {
      if (
        !Array.isArray(rows) ||
        rows.length < 1 ||
        rows.length > 2 ||
        new Set(rows.map((s) => s?.kind)).size !== rows.length ||
        rows.some(
          (s) =>
            !s ||
            !["daily", "weekly"].includes(s.kind) ||
            typeof s.enabled !== "boolean" ||
            !validTimezone(s.timezone) ||
            !/^([01]\d|2[0-3]):[0-5]\d$/.test(s.local_time) ||
            !Number.isInteger(s.weekday) ||
            s.weekday < 0 ||
            s.weekday > 6,
        )
      )
        throw Error("invalid_parameters");
      return transaction(async (c) => {
        const now = new Date();
        for (const s of rows)
          await c.query(
            `UPDATE health_report_schedules SET enabled=$2,timezone=$3,local_time=$4,weekday=$5,
          enabled_at=$6,next_run_at=$7 WHERE kind=$1`,
            [
              s.kind,
              s.enabled,
              s.timezone,
              s.local_time,
              s.weekday,
              now,
              nextRun(s, now),
            ],
          );
        return (
          await c.query("SELECT * FROM health_report_schedules ORDER BY kind")
        ).rows;
      });
    },
    async schedule(now = new Date()) {
      return transaction(async (c) => {
        await c.query("SELECT pg_advisory_xact_lock(30600815)");
        const schedules = (
          await c.query(
            "SELECT * FROM health_report_schedules WHERE enabled AND next_run_at <= $1 FOR UPDATE",
            [now],
          )
        ).rows;
        for (const s of schedules) {
          for (const period of duePeriods(s, now))
            await enqueue(c, period, { trigger: "scheduled" });
          await c.query(
            "UPDATE health_report_schedules SET next_run_at=$2 WHERE kind=$1",
            [s.kind, nextRun(s, now)],
          );
        }
      });
    },
    async claim() {
      return transaction(async (c) => {
        // One worker across processes, not just one active run per report.
        await c.query("SELECT pg_advisory_xact_lock(30600816)");
        await c.query(`UPDATE health_report_runs SET state='failed',stage='failed',error_code='worker_interrupted',finished_at=now(),lease_token=NULL
          WHERE state='running' AND lease_until < now() AND attempts >= 3`);
        if (
          (
            await c.query(
              "SELECT 1 FROM health_report_runs WHERE state='running' AND lease_until >= now() LIMIT 1",
            )
          ).rowCount
        )
          return null;
        const j = (
          await c.query(`SELECT id FROM health_report_runs WHERE
          (state IN ('queued','retrying') AND next_attempt_at <= now()) OR (state='running' AND lease_until < now() AND attempts < 3)
          ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED`)
        ).rows[0];
        if (!j) return null;
        const run = (
          await c.query(
            `UPDATE health_report_runs SET state='running',stage='collecting',attempts=attempts+1,
          lease_token=$2,lease_until=now()+interval '2 minutes',started_at=coalesce(started_at,now()),error_code=NULL WHERE id=$1 RETURNING *`,
            [j.id, randomUUID()],
          )
        ).rows[0];
        const p = (
          await c.query(
            "SELECT id::text,kind,period_start::text,period_end_exclusive::text,timezone FROM health_reports WHERE id=$1",
            [run.report_id],
          )
        ).rows[0];
        return { ...run, ...p, id: run.id, report_id: p.id };
      });
    },
    async heartbeat(run) {
      await ready();
      return !!(
        await pool.query(
          "UPDATE health_report_runs SET lease_until=now()+interval '2 minutes' WHERE id=$1 AND lease_token=$2 AND state='running' AND lease_until>now()",
          [run.id, run.lease_token],
        )
      ).rowCount;
    },
    async stage(run, stage, snapshot) {
      await ready();
      if (
        !(
          await pool.query(
            `UPDATE health_report_runs SET stage=$3,snapshot=coalesce($4::jsonb,snapshot) WHERE id=$1 AND lease_token=$2 AND state='running' AND lease_until>now()`,
            [
              run.id,
              run.lease_token,
              stage,
              snapshot ? JSON.stringify(snapshot) : null,
            ],
          )
        ).rowCount
      )
        throw Error("lease_lost");
    },
    async publish(run, result, snapshot) {
      return transaction(async (c) => {
        const owned = await c.query(
          "SELECT id FROM health_report_runs WHERE id=$1 AND lease_token=$2 AND state='running' AND lease_until>now() FOR UPDATE",
          [run.id, run.lease_token],
        );
        if (!owned.rowCount) throw Error("lease_lost");
        const hash = createHash("sha256")
          .update(JSON.stringify(snapshot))
          .digest("hex");
        const published = (
          await c.query(
            `INSERT INTO health_report_revisions(report_id,revision,title,summary,html,evidence_ids,suggestions,snapshot,snapshot_hash,model,skill_hash,renderer_version,usage)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
          ON CONFLICT (report_id) DO UPDATE SET
            revision=EXCLUDED.revision,title=EXCLUDED.title,summary=EXCLUDED.summary,
            html=EXCLUDED.html,evidence_ids=EXCLUDED.evidence_ids,
            suggestions=EXCLUDED.suggestions,snapshot=EXCLUDED.snapshot,
            snapshot_hash=EXCLUDED.snapshot_hash,model=EXCLUDED.model,
            skill_hash=EXCLUDED.skill_hash,renderer_version=EXCLUDED.renderer_version,
            usage=EXCLUDED.usage,generated_at=now()
          RETURNING id`,
            [
              run.report_id,
              run.revision,
              result.title,
              result.summary,
              result.html,
              JSON.stringify(result.evidence_ids),
              JSON.stringify(result.suggestions),
              JSON.stringify(snapshot),
              hash,
              result.model,
              result.skill_hash,
              result.renderer_version,
              JSON.stringify(result.usage || null),
            ],
          )
        ).rows[0];
        await c.query(
          "UPDATE health_reports SET current_revision_id=$2 WHERE id=$1",
          [run.report_id, published.id],
        );
        await c.query(
          "UPDATE health_report_runs SET state='completed',stage='completed',finished_at=now(),lease_token=NULL,lease_until=NULL,snapshot=NULL WHERE id=$1",
          [run.id],
        );
      });
    },
    async fail(run, code, terminal = false) {
      await ready();
      const state =
        code === "insufficient_data"
          ? code
          : terminal || run.attempts >= 3
            ? "failed"
            : "retrying";
      await pool.query(
        `UPDATE health_report_runs SET state=$3,stage=$3,error_code=$4,lease_token=NULL,lease_until=NULL,
        next_attempt_at=now()+($5 * interval '1 minute'),finished_at=CASE WHEN $3 IN ('failed','insufficient_data') THEN now() ELSE NULL END,
        snapshot=CASE WHEN $3 IN ('failed','insufficient_data') THEN NULL ELSE snapshot END
        WHERE id=$1 AND lease_token=$2 AND state='running' AND lease_until>now()`,
        [run.id, run.lease_token, state, code, run.attempts === 1 ? 2 : 10],
      );
    },
    async list({
      kind = "daily",
      from = "2020-01-01",
      to = "2099-12-31",
      cursor = null,
    } = {}) {
      await ready();
      const rows = (
        await pool.query(
          `SELECT r.id::text,r.kind,r.period_start::text,r.period_end_exclusive::text,r.timezone,
        v.title,v.summary,v.generated_at,v.snapshot->'coverage' AS coverage,
        v.snapshot->>'review_method' AS review_method,
        j.id AS run_id,j.state,j.stage,j.error_code FROM health_reports r
        LEFT JOIN health_report_revisions v ON v.id=r.current_revision_id
        LEFT JOIN LATERAL (SELECT * FROM health_report_runs WHERE report_id=r.id ORDER BY revision DESC LIMIT 1) j ON true
        WHERE r.kind=$1 AND r.period_start BETWEEN $2::date AND $3::date AND ($4::bigint IS NULL OR (r.period_start,r.id)<(SELECT period_start,id FROM health_reports WHERE id=$4))
        ORDER BY r.period_start DESC,r.id DESC LIMIT 21`,
          [kind, from, to, cursor],
        )
      ).rows;
      return {
        reports: rows.slice(0, 20),
        next_cursor: rows.length > 20 ? rows[19].id : null,
      };
    },
    async run(id) {
      await ready();
      return (
        await pool.query(
          `SELECT ${publicRun} FROM health_report_runs j WHERE j.id=$1`,
          [id],
        )
      ).rows[0];
    },
    async get(id) {
      await ready();
      const report = (
        await pool.query(
          "SELECT id::text,kind,period_start::text,period_end_exclusive::text,timezone FROM health_reports WHERE id=$1",
          [id],
        )
      ).rows[0];
      if (!report) return null;
      const item = (
        await pool.query(
          `SELECT v.title,v.summary,v.html,v.evidence_ids,v.suggestions,v.snapshot->'coverage' AS coverage,
        v.snapshot->'report' AS data_context,v.snapshot->'evidence' AS evidence,v.snapshot->>'review_method' AS review_method,v.snapshot_hash,v.model,v.skill_hash,v.renderer_version,v.generated_at
        FROM health_report_revisions v JOIN health_reports r ON r.id=v.report_id
        WHERE r.id=$1 AND v.id=r.current_revision_id`,
          [id],
        )
      ).rows[0];
      return item ? { ...report, ...item } : null;
    },
    async mealsForReport(start, end) {
      await ready();
      const table = (await pool.query("SELECT to_regclass('meals') AS name"))
        .rows[0].name;
      if (!table) return { status: "not_integrated", entries: [] };
      const entries = (
        await pool.query(
          `SELECT id::text,entry_date::text AS date,to_char(meal_time,'HH24:MI') AS time,
        kind,name,note,items,nutrition_source,version,created_at,updated_at FROM meals
        WHERE entry_date BETWEEN $1 AND $2 ORDER BY entry_date,meal_time,id`,
          [start, end],
        )
      ).rows;
      return { status: entries.length ? "available" : "no_records", entries };
    },
    async previous(start) {
      await ready();
      return (
        await pool.query(
          `SELECT r.id::text,r.kind,r.period_start::text,v.summary,v.suggestions,v.snapshot->>'review_method' AS review_method FROM health_reports r JOIN health_report_revisions v ON v.id=r.current_revision_id WHERE r.period_end_exclusive<=$1 AND v.snapshot->>'review_method'='independent_fact_check_v1' ORDER BY r.period_start DESC LIMIT 3`,
          [start],
        )
      ).rows;
    },
    async cachedDay(date) {
      await ready();
      const row = (
        await pool.query(
          `SELECT data FROM (
          SELECT snapshot->'daily_cache'->$1 AS data,generated_at AS collected_at FROM health_report_revisions WHERE snapshot->'daily_cache' ? $1
          UNION ALL
          SELECT snapshot->'daily_cache'->$1 AS data,started_at AS collected_at FROM health_report_runs WHERE snapshot->'daily_cache' ? $1
        ) cache ORDER BY collected_at DESC LIMIT 1`,
          [date],
        )
      ).rows[0];
      return row?.data || null;
    },
  };
}
export const reportStore = makeReportStore();
