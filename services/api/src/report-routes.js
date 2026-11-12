import { reportStore } from "./reports.js";
import { buildReportDocument } from "./report-renderer.js";
import { reportPeriod } from "./report-time.js";
import { validDate } from "./daily-status.js";

const uuid =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const integer = /^[1-9]\d{0,17}$/;
const rates = new Map();
async function body(req) {
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers["content-type"] || ""))
    throw Error("invalid_content_type");
  if (
    req.headers["sec-fetch-site"] &&
    !["same-origin", "none"].includes(req.headers["sec-fetch-site"])
  )
    throw Error("forbidden");
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 8192) throw Error("request_too_large");
    chunks.push(chunk);
  }
  let value;
  try {
    value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw Error("invalid_json");
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("invalid_parameters");
  return value;
}
function rate(req) {
  const key = req.socket?.remoteAddress || "local",
    now = Date.now();
  const entries = (rates.get(key) || []).filter((v) => v > now - 60000);
  if (entries.length >= 8) throw Error("rate_limited");
  entries.push(now);
  rates.set(key, entries);
  if (rates.size > 1000)
    for (const [k, vs] of rates) if (vs.at(-1) < now - 60000) rates.delete(k);
}
export async function handleReportRoute(
  req,
  res,
  url,
  respond,
  store = reportStore,
) {
  if (!url.pathname.startsWith("/api/health-report")) return false;
  try {
    if (url.pathname === "/api/health-report-settings") {
      if (req.method === "GET")
        respond(res, 200, { schedules: await store.settings() });
      else if (req.method === "PATCH") {
        rate(req);
        const b = await body(req);
        if (Object.keys(b).some((k) => k !== "schedules"))
          throw Error("invalid_parameters");
        respond(res, 200, {
          schedules: await store.updateSettings(b.schedules),
        });
      } else respond(res, 405, { error: "method_not_allowed" });
    } else if (url.pathname === "/api/health-reports/generate") {
      if (req.method !== "POST") {
        respond(res, 405, { error: "method_not_allowed" });
        return true;
      }
      rate(req);
      const b = await body(req);
      if (
        Object.keys(b).some(
          (k) =>
            !["kind", "period_start", "regenerate", "request_key"].includes(k),
        ) ||
        !["daily", "weekly"].includes(b.kind) ||
        !uuid.test(b.request_key || "") ||
        (b.regenerate !== undefined && typeof b.regenerate !== "boolean")
      )
        throw Error("invalid_parameters");
      const settings = await store.settings(),
        s = settings.find((s) => s.kind === b.kind);
      const period = reportPeriod(b.kind, b.period_start, s.timezone);
      respond(
        res,
        202,
        await store.enqueue(period, {
          regenerate: b.regenerate === true,
          request_key: b.request_key,
        }),
      );
    } else if (url.pathname === "/api/health-reports") {
      if (req.method !== "GET") {
        respond(res, 405, { error: "method_not_allowed" });
        return true;
      }
      const kind = url.searchParams.get("kind") || "daily",
        from = url.searchParams.get("from") || "2020-01-01",
        to = url.searchParams.get("to") || "2099-12-31",
        cursor = url.searchParams.get("cursor");
      if (
        !["daily", "weekly"].includes(kind) ||
        !validDate(from) ||
        !validDate(to) ||
        from > to ||
        (cursor && !integer.test(cursor))
      )
        throw Error("invalid_parameters");
      respond(res, 200, await store.list({ kind, from, to, cursor }));
    } else if (/^\/api\/health-report-runs\/[^/]+$/.test(url.pathname)) {
      if (req.method !== "GET") {
        respond(res, 405, { error: "method_not_allowed" });
        return true;
      }
      const id = url.pathname.split("/").at(-1);
      if (!uuid.test(id)) throw Error("invalid_parameters");
      const run = await store.run(id);
      respond(res, run ? 200 : 404, run ? { run } : { error: "not_found" });
    } else if (/^\/api\/health-reports\/[^/]+$/.test(url.pathname)) {
      if (req.method !== "GET") {
        respond(res, 405, { error: "method_not_allowed" });
        return true;
      }
      const id = url.pathname.split("/").at(-1),
        hasRevision = url.searchParams.has("revision");
      if (!integer.test(id) || hasRevision)
        throw Error("invalid_parameters");
      const report = await store.get(id);
      if (!report || !report.html) respond(res, 404, { error: "not_found" });
      else {
        report.evidence = Object.fromEntries(
          report.evidence_ids.map((id) => [id, report.evidence[id]]),
        );
        respond(res, 200, {
          report,
          render: await buildReportDocument(report.html),
        });
      }
    } else respond(res, 404, { error: "not_found" });
  } catch (e) {
    const codes = {
      invalid_parameters: 400,
      period_not_closed: 400,
      invalid_content_type: 415,
      invalid_json: 400,
      request_too_large: 413,
      forbidden: 403,
      rate_limited: 429,
      queue_full: 429,
    };
    respond(res, codes[e.message] || 503, {
      error: codes[e.message] ? e.message : "reports_unavailable",
    });
  }
  return true;
}
