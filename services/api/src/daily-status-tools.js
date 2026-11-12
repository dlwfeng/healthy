import { Type } from "@sinclair/typebox";
import { dailyStatusToken } from "./daily-status-auth.js";
import { validDate } from "./daily-status.js";

const apiBase = "http://127.0.0.1:" + (process.env.PORT || "8060");

async function callApi(path, options = {}) {
  const response = await fetch(apiBase + path, {
    ...options,
    headers: { "Content-Type": "application/json", "X-Daily-Status-Token": dailyStatusToken, ...options.headers },
  });
  const result = await response.json();
  if (!response.ok) throw new Error(`Daily status API failed: ${result.error || response.status}`);
  return { content: [{ type: "text", text: JSON.stringify(result) }] };
}

export function makeDailyStatusTools({ store } = {}) {
  return [
    {
      name: "record_daily_status",
      label: "记录每日状态",
      description: "将用户明确要求记录的当天或指定日期状态原文保存到私有数据库。每次调用新增一条，不覆盖已有记录；不能编造内容。",
      promptSnippet: "通过后台 API 保存用户的每日状态文字",
      namespace: "daily_status",
      parameters: Type.Object({
        date: Type.String({ description: "记录所属日期，YYYY-MM-DD" }),
        content: Type.String({ minLength: 1, maxLength: 2000, description: "用户要保存的状态文字，尽量保留原意，不添加推测" }),
      }, { additionalProperties: false }),
      execute: async (_id, args) => callApi("/api/daily-status", {
        method: "POST",
        body: JSON.stringify(args),
      }),
    },
    {
      name: "get_daily_status",
      label: "查看每日状态",
      description: "从私有数据库读取指定日期范围的每日状态文字记录。",
      promptSnippet: "通过后台 API 查询每日状态记录",
      namespace: "daily_status",
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      parameters: Type.Object({
        start_date: Type.String({ description: "开始日期，YYYY-MM-DD" }),
        end_date: Type.String({ description: "结束日期，YYYY-MM-DD" }),
      }, { additionalProperties: false }),
      execute: async (_id, args) => {
        if (!validDate(args.start_date) || !validDate(args.end_date) || args.start_date > args.end_date) throw Error("invalid_parameters");
        return store
          ? { content: [{ type: "text", text: JSON.stringify({ entries: await store.list(args.start_date, args.end_date) }) }] }
          : callApi(`/api/daily-status?start_date=${encodeURIComponent(args.start_date)}&end_date=${encodeURIComponent(args.end_date)}`);
      },
    },
  ];
}
