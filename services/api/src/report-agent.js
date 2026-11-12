import {
  createAgentSession,
  DefaultResourceLoader,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { modelReady, serviceDir, agentDir } from "./pi-runtime.js";
import { defaultMiniMaxModel } from "./minimax-models.js";
import { makeGarminTools } from "./garmin-tools.js";
import { GarminMcp } from "./garmin.js";
import { makeMealTools } from "./meal-tools.js";
import { makeHealthTrendTools } from "./health-trend-tools.js";
import { makeDailyStatusTools } from "./daily-status-tools.js";
import { dailyStatusStore } from "./daily-status.js";
import { shiftDay } from "./report-time.js";
import { createReportInput } from "./report-input.js";
import { validateReport } from "./report-renderer.js";
import { validateDocumentReport } from "./report-document.js";
import { auditCandidate } from "./report-review.js";
import { amendCandidate } from "./report-amend.js";

const str = Type.String(),
  fields = { additionalProperties: false };
const object = (props) => Type.Object(props, fields);
const instructions = new Map();
export async function loadReportInstructions(kind) {
  if (!["daily", "weekly"].includes(kind)) throw Error("invalid_report_kind");
  if (!instructions.has(kind)) instructions.set(kind, readFile(
    new URL(`../skills/health-report-${kind}/SKILL.md`, import.meta.url), "utf8",
  ));
  return instructions.get(kind);
}
export async function generateReport({
  snapshot,
  recipeStore,
  garmin = new GarminMcp(),
  statusStore = dailyStatusStore,
  skillText,
  signal,
  onStage = async () => {},
  sessionFactory = createAgentSession,
}) {
  if (!process.env.MINIMAX_CN_API_KEY) throw Error("report_not_configured");
  // A queued legacy snapshot must not reintroduce preselected data or evidence.
  if (snapshot.data_mode !== "raw_tools_v1") {
    const fresh = await createReportInput({ run: snapshot.report });
    for (const key of Object.keys(snapshot)) delete snapshot[key];
    Object.assign(snapshot, fresh);
  }
  // Old unaudited AI advice must not become the next report's factual baseline.
  snapshot.previous_reports = (snapshot.previous_reports || []).filter(
    (r) => r.review_method === "independent_fact_check_v1",
  );
  const models = await modelReady,
    model = models.getModel("minimax-cn", defaultMiniMaxModel);
  const skill = skillText ?? await loadReportInstructions(snapshot.report.kind),
    settingsManager = SettingsManager.create(serviceDir, agentDir);
  const controller = new AbortController(),
    combined = AbortSignal.any([
      controller.signal,
      ...(signal ? [signal] : []),
    ]);
  let failureCode,
    reviewing = false,
    reviewFailed = false,
    submissionLimit = 2;
  let calls = 0,
    submissions = 0,
    amendments = 0,
    accepted,
    session;
  const countCall = () => {
    combined.throwIfAborted();
    if (++calls > 40) {
      failureCode = "tool_budget_exceeded";
      controller.abort();
      throw Error(failureCode);
    }
  };
  const tools = [];
  const tool = (name, description, parameters, execute) =>
    tools.push({
      name,
      label: description,
      description,
      parameters,
      promptSnippet: description,
      annotations: {
        readOnlyHint: !["submit_health_report", "amend_health_report"].includes(
          name,
        ),
        destructiveHint: false,
      },
      execute: async (_id, args) => {
        countCall();
        const result = await execute(args);
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      },
    });
  // Reuse the original tool definitions and raw responses. The host records
  // provenance after each read; it does not prefetch or select data for 健康助手.
  const originalTools = [
    ...await makeGarminTools(garmin, { limit: 40 }),
    ...makeMealTools(),
    ...makeHealthTrendTools(garmin),
    ...makeDailyStatusTools({ store: statusStore }).filter((t) => t.name === "get_daily_status"),
  ];
  snapshot.evidence ??= {};
  snapshot.tool_results ??= [];
  snapshot.coverage ??= [];
  snapshot.data_mode = "raw_tools_v1";
  for (const original of originalTools) {
    tools.push({ ...original, execute: async (id, args, ...rest) => {
      countCall();
      const source = original.namespace === "garmin"
        ? original.name.includes("activit") ? "activities" : /calendar|workout/.test(original.name) ? "plans" : "garmin"
        : original.name === "get_daily_status" ? "status" : "meals";
      try {
        const response = await original.execute(id, args, ...rest);
        const text = response.content.find((p) => p.type === "text")?.text;
        const value = JSON.parse(text);
        const evidence_id = `tool-${snapshot.tool_results.length + 1}`;
        const record = { source, tool: original.name, arguments: args, value, read_at: new Date().toISOString() };
        snapshot.evidence[evidence_id] = record;
        snapshot.tool_results.push({ evidence_id, ...record });
        const existing = snapshot.coverage.find((c) => c.source === source);
        const status = (Array.isArray(value) && !value.length) || (Array.isArray(value.entries) && !value.entries.length) ? "no_records" : "available";
        if (existing) existing.status = status === "available" || existing.status === "available" ? "available" : status;
        else snapshot.coverage.push({ source, status });
        return { ...response, content: [{ type: "text", text: JSON.stringify(
          value && typeof value === "object" && !Array.isArray(value)
            ? { ...value, evidence_id } : { data: value, evidence_id },
        ) }] };
      } catch (e) {
        if (!snapshot.coverage.some((c) => c.source === source)) snapshot.coverage.push({ source, status: "unavailable" });
        throw e;
      }
    } });
  }
  tool(
    "amend_health_report",
    "仅修订审查指出的原文片段和元数据，保持其他事实与排版。修订后由独立会话重新审查。",
    object({
      replacements: Type.Array(object({ before: str, after: str })),
      title: Type.Optional(str),
      summary: Type.Optional(str),
      suggestions: Type.Optional(
        Type.Array(
          object({
            id: str,
            text: str,
            rationale: str,
            evidence_ids: Type.Array(str),
          }),
        ),
      ),
    }),
    async (args) => {
      if (!reviewing || !accepted)
        return { accepted: false, error: "候选首次提交后才可修订" };
      if (++submissions > submissionLimit) throw Error("invalid_report");
      try {
        const amended = amendCandidate(accepted, args);
        accepted = validateDocumentReport(amended, snapshot, validateReport);
        reviewFailed = false;
        amendments++;
        return {
          accepted: true,
          instruction: "修订已接收，本轮结束；宿主将重新独立审查。",
        };
      } catch (e) {
        reviewFailed = true;
        (snapshot.validation_errors ??= []).push(
          String(e.message).slice(0, 300),
        );
        await onStage("reviewing", true);
        return {
          accepted: false,
          error: String(e.message).slice(0, 500),
          remaining_repairs: submissionLimit - submissions,
        };
      }
    },
  );
  tool(
    "search_report_recipes",
    "在食谱库检索可选餐食，食谱不代表实际摄入。",
    object({
      query: str,
      limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 5 })),
    }),
    async ({ query, limit = 3 }) => {
      if (query.length > 100) throw Error("invalid_query");
      const key = query.trim();
      snapshot.recipe_queries ??= {};
      if (Object.hasOwn(snapshot.recipe_queries, key))
        return snapshot.recipe_queries[key];
      try {
        const found = await recipeStore.list({
          q: key,
          category: "",
          page: 1,
          pageSize: limit,
        });
        const rows = [];
        for (const brief of found.recipes) {
          const r = await recipeStore.get(brief.id);
          if (!r) continue;
          const value = {
            id: r.id,
            title: r.title,
            servings: r.servings,
            ingredients: r.ingredients,
            steps: r.steps,
            source_title: r.source_title,
            source_author: r.source_author,
            source_page: r.source_page,
            evidence_id: `recipe-${r.id}`,
          };
          snapshot.evidence[value.evidence_id] = { source: "recipes", value };
          rows.push(value);
        }
        const result = {
          status: rows.length ? "available" : "no_records",
          recipes: rows,
        };
        snapshot.recipe_queries[key] = result;
        return result;
      } catch {
        snapshot.sources.recipes.status = "unavailable";
        snapshot.coverage = snapshot.coverage.map((s) =>
          s.source === "recipes" ? { ...s, status: "unavailable" } : s,
        );
        return { status: "unavailable", recipes: [] };
      }
    },
  );
  tool(
    "submit_health_report",
    "提交 HTML、摘要、证据和建议。本轮提交成功后结束，由宿主校验后保存；可选独立事实审查，每阶段格式校验失败最多修复一次。",
    object({
      title: str,
      summary: str,
      html: str,
      evidence_ids: Type.Array(str),
      suggestions: Type.Array(
        object({
          id: str,
          text: str,
          rationale: str,
          evidence_ids: Type.Array(str),
        }),
      ),
    }),
    async (args) => {
      if (reviewing)
        return {
          accepted: false,
          error:
            "审查修订请调用 amend_health_report，仅修改指出的问题。当前候选已随审查消息提供。",
        };
      if (accepted && !reviewing) return { accepted: true };
      if (++submissions > submissionLimit) {
        failureCode = "invalid_report";
        controller.abort();
        throw Error(failureCode);
      }
      try {
        await onStage("validating");
        accepted = validateDocumentReport(args, snapshot, validateReport);
        reviewFailed = false;
        return {
          accepted: true,
          instruction:
            "候选已接收，本轮结束。宿主可能要求一次事实核对；最终由宿主发布。",
        };
      } catch (e) {
        if (reviewing) reviewFailed = true;
        snapshot.draft = args;
        (snapshot.validation_errors ??= []).push(
          String(e.message).slice(0, 300),
        );
        await onStage("analyzing", true);
        return {
          accepted: false,
          error: String(e.message).slice(0, 700),
          remaining_repairs: submissionLimit - submissions,
          valid_evidence_ids: Object.keys(snapshot.evidence).slice(0, 200),
        };
      }
    },
  );
  async function makeSession(systemPrompt, selectedTools) {
    const loader = new DefaultResourceLoader({
      cwd: serviceDir,
      agentDir,
      settingsManager,
      systemPrompt,
      noExtensions: true,
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
    });
    await loader.reload();
    const created = await sessionFactory({
      cwd: serviceDir,
      agentDir,
      settingsManager,
      resourceLoader: loader,
      sessionManager: SessionManager.inMemory(serviceDir),
      model,
      modelRuntime: models,
      thinkingLevel: "medium",
      noTools: "all",
      tools: selectedTools.map((t) => t.name),
      customTools: selectedTools,
    });
    return created.session;
  }
  session = await makeSession(
    skill,
    tools,
  );
  const abort = () => {
    void session.abort().catch(() => {});
  };
  combined.addEventListener("abort", abort, { once: true });
  const usage = { input: 0, output: 0, totalTokens: 0 };
  const unsubscribe = session.subscribe((event) => {
    if (event.type === "tool_execution_start")
      void onStage(
        (reviewing ? "reviewing:" : "analyzing:") + event.toolName,
      ).catch(() => {});
    if (
      event.type === "message_end" &&
      event.message?.role === "assistant" &&
      event.message.usage
    ) {
      for (const k of Object.keys(usage))
        usage[k] += Number(event.message.usage[k] || 0);
    }
  });
  try {
    combined.throwIfAborted();
    await onStage("analyzing");
    await session.prompt(
      `请为 ${snapshot.report.period_start} 至 ${shiftDay(snapshot.report.period_end_exclusive, -1)}（${snapshot.report.timezone}）生成健康${snapshot.report.kind === "daily" ? "日报" : "周报"}。根据你的 Skill 自行设计完整静态 HTML，调用原始工具获取所需资料，最后用 submit_health_report 提交。`,
    );
    if (!accepted && !combined.aborted && submissions < 2)
      await session.prompt(
        "尚未收到合格产物。请使用已有数据调用 submit_health_report 完成提交；不要仅返回 Markdown 或自然语言。",
      );
    if (!accepted)
      throw Error(combined.aborted ? "report_timeout" : "invalid_report");
    // A useful report should be available after its source and HTML checks.
    // The slower independent review remains opt-in while the first release is in use.
    if (process.env.HEALTH_REPORT_INDEPENDENT_REVIEW !== "on") {
      snapshot.review_method = "source_validation_v1";
      delete snapshot.draft;
      return {
        ...accepted,
        model: `minimax-cn/${model.id}`,
        skill_hash: createHash("sha256").update(skill).digest("hex"),
        usage: { ...usage, tool_calls: calls },
      };
    }
    for (let round = 0; round < 3; round++) {
      reviewing = true;
      snapshot.draft = accepted;
      await onStage("reviewing", true);
      const verdict = await auditCandidate({
        candidate: accepted,
        snapshot,
        makeSession,
        readTools: tools.filter((t) => t.name !== "submit_health_report"),
        signal: combined,
        countCall,
        onUsage: (value) => {
          for (const k of Object.keys(usage)) usage[k] += Number(value[k] || 0);
        },
        onStage,
      });
      (snapshot.fact_reviews ??= []).push(verdict);
      await onStage("reviewing", true);
      if (verdict.verdict === "pass") break;
      if (round === 2) throw Error("invalid_report");
      const previousAmendments = amendments;
      submissionLimit = submissions + 4;
      reviewFailed = false;
      await session.prompt(
        "独立事实审查未通过。逐条解决以下问题，删除无法证实的结论或阈值。请参考本消息附带的当前 candidate，用 amend_health_report 仅替换被指出的原文片段、标题、摘要或建议，其他句子与数字保持不动。可以删除问题图表，不要重新创作整篇报告、引入新事实或新主题。每个 before 必须是当前 HTML 中唯一的原文片段。审查结果：" +
          JSON.stringify({ verdict, candidate: accepted }),
      );
      if (amendments === previousAmendments && submissions < submissionLimit)
        await session.prompt(
          "局部修订尚未成功。上一条校验错误：" +
            String(snapshot.validation_errors?.at(-1) || "尚未调用 amend_health_report") +
            "。请读取前一条消息附带的 candidate.html，按原样复制唯一 HTML 片段作为 before，只修正审查指出的问题，再调用 amend_health_report。",
        );
      if (reviewFailed || amendments === previousAmendments)
        throw Error("invalid_report");
    }
    combined.throwIfAborted();
    snapshot.reviewed_at = new Date().toISOString();
    snapshot.review_method = "independent_fact_check_v1";
    delete snapshot.draft;
    return {
      ...accepted,
      model: `minimax-cn/${model.id}`,
      skill_hash: createHash("sha256").update(skill).digest("hex"),
      usage: { ...usage, tool_calls: calls },
    };
  } catch (error) {
    if (failureCode) throw Error(failureCode);
    throw error;
  } finally {
    combined.removeEventListener("abort", abort);
    unsubscribe();
    session.dispose();
  }
}
