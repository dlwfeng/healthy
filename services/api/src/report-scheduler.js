import { createReportInput } from "./report-input.js";
import { generateReport } from "./report-agent.js";

export function startReportWorker({
  store,
  garmin,
  statusStore,
  recipeStore,
  collect = createReportInput,
  generate = generateReport,
  interval = 30000,
  log = console,
}) {
  let busy = false,
    stopped = false,
    controller,
    timer;
  async function tick() {
    if (busy || stopped) return;
    busy = true;
    let run, heartbeat;
    try {
      try {
        await store.schedule();
      } catch {
        log.error(
          JSON.stringify({ event: "health_report_schedule_unavailable" }),
        );
      }
      run = await store.claim();
      if (!run) return;
      controller = new AbortController();
      const signal = AbortSignal.any([
        controller.signal,
        AbortSignal.timeout(25 * 60_000),
      ]);
      heartbeat = setInterval(() => {
        store
          .heartbeat(run)
          .then((owned) => {
            if (!owned) controller.abort();
          })
          .catch(() => controller.abort());
      }, 20000);
      let snapshot = run.snapshot;
      if (!snapshot) {
        snapshot = await collect({
          run,
          garmin,
          statusStore,
          store,
          signal,
          onProgress: (stage) => store.stage(run, stage),
        });
        await store.stage(run, "analyzing", snapshot);
      }
      if (!snapshot.has_data) {
        await store.fail(run, "insufficient_data", true);
        return;
      }
      const modelSignal = AbortSignal.any([
        signal,
        AbortSignal.timeout(15 * 60_000),
      ]);
      const result = await generate({
        snapshot,
        garmin,
        statusStore,
        recipeStore,
        signal: modelSignal,
        onStage: (stage, persist) =>
          store.stage(run, stage, persist ? snapshot : undefined),
      });
      signal.throwIfAborted();
      await store.stage(run, "publishing");
      await store.publish(run, result, snapshot);
      log.info(
        JSON.stringify({
          event: "health_report_completed",
          run_id: run.id,
          revision: run.revision,
        }),
      );
    } catch (e) {
      // Deliberately omit provider errors/health data from logs.
      const known = [
        "report_not_configured",
        "invalid_report",
        "lease_lost",
        "tool_budget_exceeded",
        "report_timeout",
        "worker_interrupted",
      ];
      const code = controller?.signal.aborted
        ? "worker_interrupted"
        : known.includes(e.message)
          ? e.message
          : e.name === "TimeoutError" || e.name === "AbortError"
            ? "report_timeout"
            : "report_unavailable";
      log.error(
        JSON.stringify({
          event: "health_report_failed",
          run_id: run?.id,
          code,
          error_type: e?.constructor?.name,
          provider_status: Number.isInteger(e?.status) ? e.status : undefined,
          database_code: /^[A-Z0-9_]{1,30}$/.test(e?.code || "")
            ? e.code
            : undefined,
          markers: [
            "fetch failed",
            "json",
            "rate limit",
            "schema",
            "token",
            "timeout",
            "abort",
            "constraint",
            "not-null",
            "invalid input",
          ].filter((term) =>
            String(e?.message || "")
              .toLowerCase()
              .includes(term),
          ),
        }),
      );
      if (run)
        await store
          .fail(
            run,
            code,
            [
              "report_not_configured",
              "invalid_report",
              "tool_budget_exceeded",
            ].includes(code),
          )
          .catch(() => {});
    } finally {
      clearInterval(heartbeat);
      controller = null;
      busy = false;
    }
  }
  timer = setInterval(() => void tick(), interval);
  timer.unref();
  void tick();
  return {
    tick,
    stop() {
      stopped = true;
      clearInterval(timer);
      controller?.abort();
    },
  };
}
