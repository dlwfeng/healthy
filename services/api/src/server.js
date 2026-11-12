import { handleFeedback, startFeedbackScheduler } from './feedback.js';
import { reportStore } from "./reports.js";
import { handleReportRoute } from "./report-routes.js";
import { startReportWorker } from "./report-scheduler.js";
import { pageCsp, reportPlainText } from "./report-renderer.js";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { GarminMcp, configurationStatus } from "./garmin.js";
import { loadOverview, loadHistory } from "./overview.js";
import { loadBodyStatus, loadBodyTimeline } from "./body-status.js";
import { loadBodyMeasurements, syncBodyMeasurements, startBodySyncScheduler, zeppConfig } from "./body-measurements.js";
import { ZeppAuthError } from "./zepp-weigh-ins.js";
import { HISTORY_METRICS } from "./normalize.js";
import { answerChat } from "./chat.js";
import { readHealthMemories } from "./memory-reader.js";
import { dailyStatusStore, validDate } from "./daily-status.js";
import { authorizedDailyStatus } from "./daily-status-auth.js";
import { recipeStore, recipeParameters } from "./recipes.js";
import { loadActivities, loadActivity, activityRange } from './activities.js';
import { loadCalendar, normalizeWorkout } from "./calendar.js";
import { mealRoutes } from './meal-routes.js';
import { mealStore, MealError } from './meals.js';
import { analyzeMeal, chatMeal } from './meal-analysis.js';
import { nutritionProfileStore } from './nutrition-profile.js';
import { handleMobileRelease, mobileReleaseDirectory } from './mobile-releases.js';

const web = resolve(
  fileURLToPath(new URL("../../../apps/web/", import.meta.url)),
);
const assets = new Map([
  ["/memory.js", ["memory.js", "text/javascript; charset=utf-8"]],
  ["/memory.css", ["memory.css", "text/css; charset=utf-8"]],
  ["/feedback.js", ["feedback.js", "text/javascript; charset=utf-8"]],
  ["/feedback.css", ["feedback.css", "text/css; charset=utf-8"]],
  ["/body-status.js", ["body-status.js", "text/javascript; charset=utf-8"]],
  ["/body-status.css", ["body-status.css", "text/css; charset=utf-8"]],
  ["/activities.js", ["activities.js", "text/javascript; charset=utf-8"]],
  ["/activities.css", ["activities.css", "text/css; charset=utf-8"]],
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
  ["/reports.js", ["reports.js", "text/javascript; charset=utf-8"]],
  ["/reports.css", ["reports.css", "text/css; charset=utf-8"]],
  ["/recipes.js", ["recipes.js", "text/javascript; charset=utf-8"]],
  ["/recipes.css", ["recipes.css", "text/css; charset=utf-8"]],
  ["/meals.js", ["meals.js", "text/javascript; charset=utf-8"]],
  ["/meals.css", ["meals.css", "text/css; charset=utf-8"]],
  [
    "/nutrition-reference.js",
    ["nutrition-reference.js", "text/javascript; charset=utf-8"],
  ],
  [
    "/references/chinese-dietary-guidelines-2022-core-recommendations.pdf",
    [
      "references/chinese-dietary-guidelines-2022-core-recommendations.pdf",
      "application/pdf",
    ],
  ],
  [
    "/references/WS-T-578.1-2017-macronutrients.pdf",
    ["references/WS-T-578.1-2017-macronutrients.pdf", "application/pdf"],
  ],
  [
    "/training-calendar.js",
    ["training-calendar.js", "text/javascript; charset=utf-8"],
  ],
  [
    "/training-calendar.css",
    ["training-calendar.css", "text/css; charset=utf-8"],
  ],
  [
    "/vendor/markdown-it.min.js",
    ["vendor/markdown-it.min.js", "text/javascript; charset=utf-8"],
  ],
]);
const port = Number(process.env.PORT || 4173);
// In Compose the container listens on all interfaces, while the published host port
// can be restricted or opened by the Compose port mapping.
const host = process.env.BIND_HOST || "127.0.0.1";
const allowRemoteHosts = process.env.ALLOW_REMOTE_ACCESS === "true";
const garmin = new GarminMcp();

function respond(res, code, value) {
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(value));
}
export function makeServer({
  garminClient = garmin,
  configStatus = configurationStatus,
  chatService = answerChat,
  memoryReader = readHealthMemories,
  statusStore = dailyStatusStore,
  cookbookStore = recipeStore,
  dietStore = mealStore,
  mealAnalyzer = analyzeMeal,
  mealChatter = chatMeal,
  profileStore = nutritionProfileStore,
  reports = reportStore,
  mobileReleases = mobileReleaseDirectory,
  bodyMeasurements = { load: loadBodyMeasurements, sync: syncBodyMeasurements, config: zeppConfig },
} = {}) {
  return createServer(async (req, res) => {
    const origin = req.headers.origin;
    // In local mode, Host and Origin checks guard against cross-origin reads and
    // DNS rebinding. Remote mode is an explicit opt-in for a trusted private network.
    const requestHost = req.headers.host || "";
    let validRemoteHost = false;
    if (allowRemoteHosts) {
      try {
        const parsed = new URL(`http://${requestHost}`);
        validRemoteHost = parsed.host === requestHost && !parsed.username;
      } catch {
        validRemoteHost = false;
      }
    }
    const allowedOrigins = allowRemoteHosts
      ? [`http://${requestHost}`]
      : ["http://127.0.0.1:" + port, "http://localhost:" + port];
    if (
      !(allowRemoteHosts
        ? validRemoteHost
        : /^(127\.0\.0\.1|localhost)(:\d+)?$/.test(requestHost)) ||
      (origin && !allowedOrigins.includes(origin))
    ) {
      return respond(res, 403, { error: "forbidden" });
    }
    let url;
    try {
      url = new URL(req.url, `http://${host}:${port}`);
    } catch {
      return respond(res, 400, { error: "bad_request" });
    }
    if (await handleFeedback(req, res, url, respond)) return;
    if (await handleMobileRelease(req, res, url, respond, mobileReleases)) return;
    if (
      url.pathname === "/api/meals" ||
      url.pathname.startsWith("/api/meals/")
    )
      return mealRoutes(req, res, url, respond, dietStore, mealAnalyzer, mealChatter);
    if (url.pathname === "/api/memory") {
      if (req.method !== "GET") return respond(res, 405, { error: "method_not_allowed" });
      try { return respond(res, 200, await memoryReader()); }
      catch { return respond(res, 503, { error: "memory_unavailable" }); }
    }
    if (url.pathname === "/api/nutrition-profile") {
      if (req.method !== "GET")
        return respond(res, 405, { error: "method_not_allowed" });
      try {
        let result = await profileStore.publicProfile();
        if (result.status === "missing" || result.status === "stale") {
          try {
            await profileStore.syncIfDue(garminClient);
          } catch {
            // Keep profile unavailable until a successful sync.
          }
          result = await profileStore.publicProfile();
        }
        return respond(res, 200, result);
      } catch {
        return respond(res, 503, { error: "database_unavailable" });
      }
    }
    if (await handleReportRoute(req, res, url, respond, reports)) return;
    if (
      url.pathname === "/api/recipes" ||
      url.pathname.startsWith("/api/recipes/")
    ) {
      if (req.method !== "GET")
        return respond(res, 405, { error: "method_not_allowed" });
      try {
        if (url.pathname === "/api/recipes") {
          const params = recipeParameters(url.searchParams);
          if (!params)
            return respond(res, 400, { error: "invalid_parameters" });
          return respond(res, 200, await cookbookStore.list(params));
        }
        const match =
          /^\/api\/recipes\/([1-9]\d{0,17})(?:\/images\/(\d{1,3}))?$/.exec(
            url.pathname,
          );
        if (!match) return respond(res, 404, { error: "not_found" });
        if (match[2] !== undefined) {
          const image = await cookbookStore.image(match[1], Number(match[2]));
          if (!image) return respond(res, 404, { error: "not_found" });
          const etag = `"${image.sha256}"`;
          if (req.headers["if-none-match"] === etag) {
            res.writeHead(304, { ETag: etag });
            return res.end();
          }
          res.writeHead(200, {
            "Content-Type": image.mime_type,
            ETag: etag,
            "Cache-Control": "private, max-age=3600",
            "X-Content-Type-Options": "nosniff",
          });
          return res.end(Buffer.from(image.data_base64, "base64"));
        }
        const recipe = await cookbookStore.get(match[1]);
        return recipe
          ? respond(res, 200, { recipe })
          : respond(res, 404, { error: "not_found" });
      } catch {
        return respond(res, 503, { error: "database_unavailable" });
      }
    }
    if (
      url.pathname === "/api/health/calendar" ||
      url.pathname.startsWith("/api/health/workouts/")
    ) {
      if (req.method !== "GET")
        return respond(res, 405, { error: "method_not_allowed" });
      const month = url.searchParams.get("month");
      const workoutId = /^\/api\/health\/workouts\/([1-9]\d{0,17})$/.exec(
        url.pathname,
      )?.[1];
      if (
        url.pathname === "/api/health/calendar"
          ? !/^20\d{2}-(0[1-9]|1[0-2])$/.test(month || "")
          : !workoutId
      )
        return respond(res, 400, { error: "invalid_parameters" });
      try {
        const status = await configStatus();
        if (status !== "ready") return respond(res, 503, { error: status });
        return respond(
          res,
          200,
          workoutId
            ? {
                workout: normalizeWorkout(
                  await garminClient.call("get_workout_by_id", {
                    workout_id: Number(workoutId),
                  }),
                ),
              }
            : await loadCalendar(garminClient, month),
        );
      } catch {
        return respond(res, 502, { error: "garmin_unavailable" });
      }
    }
    if (url.pathname === "/api/health/activities" || url.pathname.startsWith("/api/health/activities/")) {
      if (req.method !== "GET") return respond(res, 405, { error: "method_not_allowed" });
      const list = url.pathname === "/api/health/activities";
      const id = /^\/api\/health\/activities\/([1-9]\d{0,15})$/.exec(url.pathname)?.[1];
      const start = url.searchParams.get("start"), end = url.searchParams.get("end");
      if (list ? !activityRange(start, end) : !id || !Number.isSafeInteger(Number(id)))
        return respond(res, 400, { error: "invalid_parameters" });
      try {
        const status = await configStatus();
        if (status !== "ready") return respond(res, 503, { error: status });
        return respond(res, 200, list ? await loadActivities(garminClient, start, end) : await loadActivity(garminClient, id));
      } catch { return respond(res, 502, { error: "garmin_unavailable" }); }
    }
    if (url.pathname === "/api/health/body-status" || url.pathname === "/api/health/body-status/timeline") {
      if (req.method !== "GET") return respond(res, 405, { error: "method_not_allowed" });
      const date = url.searchParams.get("date"), metric = url.searchParams.get("metric");
      const timeline = url.pathname.endsWith("/timeline");
      const today = new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Shanghai' }).format(new Date());
      if (!validDate(date) || date > today || date < '2000-01-01' || (timeline && !['hrv','intensity','floors'].includes(metric))) return respond(res,400,{error:"invalid_parameters"});
      try {
        const status = await configStatus();
        if (status !== "ready") return respond(res,503,{error:status});
        const data = timeline ? await loadBodyTimeline(garminClient,date,metric,url.searchParams.get("refresh")==="1") : await loadBodyStatus(garminClient,date,url.searchParams.get("refresh")==="1");
        return respond(res,200,data);
      } catch { return respond(res,502,{error:"garmin_unavailable"}); }
    }
    if (url.pathname === "/api/body/measurements") {
      if (req.method !== "GET") return respond(res, 405, { error: "method_not_allowed" });
      const days = Number(url.searchParams.get("days") || 365);
      if (!Number.isInteger(days) || days < 1 || days > 3650) return respond(res, 400, { error: "invalid_parameters" });
      try {
        return respond(res, 200, await bodyMeasurements.load({ days }));
      } catch {
        return respond(res, 502, { error: "database_unavailable" });
      }
    }
    if (url.pathname === "/api/body/measurements/sync") {
      if (req.method !== "POST") return respond(res, 405, { error: "method_not_allowed" });
      const config = bodyMeasurements.config();
      if (!config.configured) return respond(res, 503, { error: "zepp_not_configured" });
      try {
        return respond(res, 200, await bodyMeasurements.sync({ config, garmin: garminClient }));
      } catch (err) {
        // 微信扫码账号无法自动续期，必须让页面明确提示重新授权，而不是静默失败。
        if (err instanceof ZeppAuthError) return respond(res, 401, { error: "zepp_auth_required" });
        if (err?.message === "zepp_not_configured") return respond(res, 503, { error: "zepp_not_configured" });
        return respond(res, 502, { error: "zepp_unavailable" });
      }
    }
    if (url.pathname === "/api/health/history") {
      if (req.method !== "GET")
        return respond(res, 405, { error: "method_not_allowed" });
      const date = url.searchParams.get("date"),
        days = Number(url.searchParams.get("days") || 7);
      const metric = url.searchParams.get("metric");
      if (
        !validDate(date) ||
        ![7, 30].includes(days) ||
        !Object.hasOwn(HISTORY_METRICS, metric || "")
      )
        return respond(res, 400, { error: "invalid_parameters" });
      try {
        const status = await configStatus();
        if (status !== "ready") return respond(res, 503, { error: status });
        const controller = new AbortController();
        res.on("close", () => controller.abort());
        const data = await loadHistory(garminClient, date, days, metric, {
          refresh: url.searchParams.get("refresh") === "1",
          signal: controller.signal,
        });
        if (!res.destroyed) return respond(res, 200, data);
      } catch {
        return respond(res, 502, { error: "garmin_unavailable" });
      }
    }
    if (url.pathname === "/api/daily-status") {
      if (req.method === "GET") {
        const start = url.searchParams.get("start_date");
        const end = url.searchParams.get("end_date");
        if (
          !validDate(start) ||
          !validDate(end) ||
          start > end ||
          (Date.parse(end) - Date.parse(start)) / 86_400_000 > 366
        )
          return respond(res, 400, { error: "invalid_parameters" });
        try {
          return respond(res, 200, {
            entries: await statusStore.list(start, end),
          });
        } catch {
          return respond(res, 503, { error: "database_unavailable" });
        }
      }
      if (req.method !== "POST")
        return respond(res, 405, { error: "method_not_allowed" });
      if (!authorizedDailyStatus(req))
        return respond(res, 403, { error: "forbidden" });
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 8192)
          return respond(res, 413, { error: "request_too_large" });
        chunks.push(chunk);
      }
      let body;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        return respond(res, 400, { error: "invalid_json" });
      }
      if (
        !body ||
        typeof body !== "object" ||
        Array.isArray(body) ||
        !validDate(body.date) ||
        typeof body.content !== "string" ||
        !body.content.trim() ||
        body.content.length > 2000
      )
        return respond(res, 400, { error: "invalid_parameters" });
      try {
        return respond(res, 201, {
          entry: await statusStore.add(body.date, body.content.trim()),
        });
      } catch {
        return respond(res, 503, { error: "database_unavailable" });
      }
    }
    if (url.pathname === "/api/chat") {
      if (req.method !== "POST")
        return respond(res, 405, { error: "method_not_allowed" });
      if (!process.env.MINIMAX_CN_API_KEY)
        return respond(res, 503, { error: "chat_not_configured" });
      try {
        const chunks = [];
        let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 32_000_000) {
            req.resume();
            return respond(res, 413, { error: "request_too_large" });
          }
          chunks.push(chunk);
        }
        let body;
        try {
          body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        } catch {
          return respond(res, 400, { error: "invalid_json" });
        }
        if (
          !body ||
          typeof body !== "object" ||
          Array.isArray(body) ||
          !Array.isArray(body.messages) ||
          body.messages.length < 1 ||
          body.messages.length > 20 ||
          body.messages.some(
            (message) =>
              !message ||
              !["user", "assistant"].includes(message.role) ||
              typeof message.content !== "string" ||
              !message.content.trim() ||
              message.content.length > 2000,
          ) ||
          !validDate(body.date) ||
          (body.skill !== undefined && body.skill !== "meal-recording") ||
          body.messages.some(m => {
            if (m.photos !== undefined) {
              if (m.role !== "user" || !Array.isArray(m.photos) || m.photos.length > 9 || m.photos.some(p => !p || typeof p.data_base64 !== "string")) return true;
            }
            if (m.photo !== undefined && (m.role !== "user" || !m.photo || typeof m.photo.data_base64 !== "string")) return true;
            return false;
          }) ||

          (body.report_context !== undefined &&
            (!body.report_context ||
              typeof body.report_context !== "object" ||
              Array.isArray(body.report_context) ||
              Object.keys(body.report_context).some((key) => key !== "report_id") ||
              !/^[1-9]\d{0,17}$/.test(body.report_context.report_id || "")))
        )
          return respond(res, 400, { error: "invalid_parameters" });
        const executeChat = async (options) => {
          let draft;
          const onEvent = event => {
            if (event.type === 'meal_draft') draft = event.draft;
            options.onEvent?.(event);
          };
          const answer = await chatService({ ...options, onEvent, selectedSkill: body.skill, mealChatter });
          return { answer: answer.trim(), ...(draft ? { meal_draft: draft } : {}) };
        };
        let reportContext;
        if (body.report_context) {
          const report = await reports.get(body.report_context.report_id);
          if (!report?.html)
            return respond(res, 404, { error: "report_not_found" });
          reportContext = {
            id: report.id,
            period_start: report.period_start,
            period_end_exclusive: report.period_end_exclusive,
            title: report.title,
            summary: report.summary,
            body: reportPlainText(report.html),
            suggestions: report.suggestions,
            coverage: report.coverage,
            evidence: Object.fromEntries(
              report.evidence_ids.map((id) => [id, report.evidence[id]]),
            ),
          };
        }
        if (req.headers.accept?.includes("application/x-ndjson")) {
          const requestAbort = new AbortController();
          res.on("close", () => requestAbort.abort());
          res.writeHead(200, {
            "Content-Type": "application/x-ndjson; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
            "X-Content-Type-Options": "nosniff",
          });
          const emit = (event) => {
            if (!res.destroyed) res.write(JSON.stringify(event) + "\n");
          };
          emit({ type: "status", label: "正在连接健康助手" });
          try {
            const result = await executeChat({
              garmin: garminClient,
              messages: body.messages,
              date: body.date,
              onEvent: emit,
              signal: requestAbort.signal,
              reportContext,
            });
            emit({ type: "done", ...result });
          } catch (error) {
            emit({ type: "error", error: error instanceof MealError ? error.message : "chat_unavailable" });
          }
          return res.end();
        }
        const result = await executeChat({
          garmin: garminClient,
          messages: body.messages,
          date: body.date,
          reportContext,
        });
        return respond(res, 200, result);
      } catch (error) {
        return respond(res, error instanceof MealError ? error.status : 502, { error: error instanceof MealError ? error.message : "chat_unavailable" });
      }
    }
    if (req.method !== "GET")
      return respond(res, 405, { error: "method_not_allowed" });
    if (url.pathname === "/api/health/status") {
      return respond(res, 200, { state: await configStatus() });
    }
    if (url.pathname === "/api/health/overview") {
      const date = url.searchParams.get("date");
      const days = Number(url.searchParams.get("days") || "7");
      if (!validDate(date) || ![7, 30].includes(days))
        return respond(res, 400, { error: "invalid_parameters" });
      const status = await configStatus();
      if (status !== "ready") return respond(res, 503, { error: status });
      try {
        const data = await loadOverview(
          garminClient,
          date,
          days,
          url.searchParams.get("refresh") === "1",
        );
        return respond(res, 200, data);
      } catch {
        return respond(res, 502, { error: "garmin_unavailable" });
      }
    }
    const asset = assets.get(url.pathname);
    if (!asset) return respond(res, 404, { error: "not_found" });
    try {
      const bytes = await readFile(join(web, asset[0]));
      res.writeHead(200, {
        "Content-Type": asset[1],
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
        "Content-Security-Policy": pageCsp,
      });
      res.end(bytes);
    } catch {
      respond(res, 500, { error: "asset_unavailable" });
    }
  });
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const worker =
    process.env.HEALTH_REPORT_WORKER === "off"
      ? null
      : startReportWorker({
          store: reportStore,
          garmin,
          statusStore: dailyStatusStore,
          recipeStore,
        });
  const feedbackScheduler = startFeedbackScheduler();
  const bodySyncScheduler = startBodySyncScheduler({ garmin });
  const server = makeServer();
  server.listen(port, host, () => {
    console.log(`Health dashboard listening on ${host}:${port}`);
    void nutritionProfileStore.syncIfDue(garmin).catch(() => {});
  });
  const profileTimer = setInterval(() => { void nutritionProfileStore.syncIfDue(garmin).catch(() => {}); }, 6 * 3_600_000);
  profileTimer.unref();
  async function shutdown() {
    clearInterval(profileTimer);
    worker?.stop();
    feedbackScheduler.stop();
    bodySyncScheduler?.stop();
    server.close();
    await garmin.close();
  }
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
