#!/usr/bin/env node
// Zepp Life 体重/体成分接口探测脚本（一次性诊断用，不属于服务运行时）。
//
// 目的：用一条真实账号请求确认 4 件事
//   1. 国内 host 与请求头组合是否可用
//   2. weight 的量级是克还是千克
//   3. summary 里实际存在哪些体成分字段
//   4. 历史记录一次能取多少条（接口固定 limit=300，超过会被静默截断）
//
// 用法：
//   ZEPP_APP_TOKEN=xxx ZEPP_USER_ID=yyy node services/api/scripts/zepp-probe.mjs
//   ZEPP_APP_TOKEN=xxx ZEPP_USER_ID=yyy ZEPP_BASE_URL=https://api-mifit-cn.huami.com \
//     node services/api/scripts/zepp-probe.mjs --days 30
//   ... --from 2025-01-01 --to 2026-11-08
//
// 可选环境变量：
//   ZEPP_BASE_URL   默认 https://api-mifit-cn.huami.com（国内账号）
//   ZEPP_APP_NAME   默认自动尝试 com.xiaomi.hm.health / com.huami.midong
//   ZEPP_LIMIT      默认 300
//
// 注意：脚本只打印 token 掩码，不会把凭据写入磁盘或日志。

const BASE = (process.env.ZEPP_BASE_URL || "https://api-mifit-cn.huami.com").replace(/\/+$/, "");
const TOKEN = process.env.ZEPP_APP_TOKEN;
const USER_ID = process.env.ZEPP_USER_ID;
const LIMIT = Number(process.env.ZEPP_LIMIT || 300);

function parseArgs(argv) {
  const out = { days: 365 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--days") out.days = Number(argv[++i]);
    else if (argv[i] === "--from") out.from = argv[++i];
    else if (argv[i] === "--to") out.to = argv[++i];
  }
  return out;
}

function dayStart(iso) {
  const d = new Date(`${iso}T00:00:00+08:00`);
  if (Number.isNaN(d.getTime())) throw new Error(`日期格式应为 YYYY-MM-DD：${iso}`);
  return Math.floor(d.getTime() / 1000);
}

function mask(v) {
  if (!v) return "(未设置)";
  const s = String(v);
  return s.length <= 8 ? "***" : `${s.slice(0, 4)}…${s.slice(-3)}（长度 ${s.length}）`;
}

function fmtTs(sec) {
  if (!sec) return "?";
  const n = Number(sec);
  if (!Number.isFinite(n)) return String(sec);
  const d = new Date(n * 1000);
  // 同时给 UTC 和上海时间，避免时区错位看不出来
  const sh = new Date(d.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 19).replace("T", " ");
  return `${sh} +08`;
}

// 两套已知可用的请求头组合；先试文档里的 web 组合，再退回 app 组合。
const HEADER_SETS = [
  { label: "web/com.xiaomi.hm.health", appname: "com.xiaomi.hm.health", appPlatform: "web" },
  { label: "android/com.xiaomi.hm.health", appname: "com.xiaomi.hm.health", appPlatform: "android_phone", vn: "6.14.0" },
  { label: "android/com.huami.midong", appname: "com.huami.midong", appPlatform: "android_phone", vn: "9.12.5" },
];

async function request(headers, fromTime, toTime) {
  const url = new URL(`${BASE}/users/${encodeURIComponent(USER_ID)}/members/-1/weightRecords`);
  url.searchParams.set("fromTime", String(fromTime));
  url.searchParams.set("toTime", String(toTime));
  url.searchParams.set("limit", String(LIMIT));
  url.searchParams.set("isForward", "0");
  const res = await fetch(url, {
    headers: { apptoken: TOKEN, ...headers, accept: "application/json" },
    signal: AbortSignal.timeout(20000),
  });
  const text = await res.text();
  let body = null;
  try { body = JSON.parse(text); } catch { /* 非 JSON 说明被风控或 host 不对 */ }
  return { status: res.status, body, text };
}

function describeUnit(items) {
  const vals = items.map((i) => Number(i?.summary?.weight)).filter((n) => n > 0);
  if (!vals.length) return "样本里没有正数 weight，无法判断";
  const med = vals.slice().sort((a, b) => a - b)[Math.floor(vals.length / 2)];
  if (med > 500) return `中位数 ${med} → 几乎确定是「克」，入库需除以 1000`;
  if (med > 20 && med < 300) return `中位数 ${med} → 看起来是「千克」`;
  return `中位数 ${med} → 量级异常，需人工确认`;
}

async function main() {
  if (!TOKEN || !USER_ID) {
    console.error("缺少 ZEPP_APP_TOKEN 或 ZEPP_USER_ID。");
    console.error("示例：ZEPP_APP_TOKEN=xxx ZEPP_USER_ID=yyy node services/api/scripts/zepp-probe.mjs");
    process.exit(2);
  }

  const args = parseArgs(process.argv.slice(2));
  const to = args.to || new Date().toISOString().slice(0, 10);
  const from = args.from || new Date(Date.now() - args.days * 86400000).toISOString().slice(0, 10);
  const fromTime = dayStart(from);
  const toTime = dayStart(to) + 86399;

  console.log("host      ", BASE);
  console.log("user_id   ", mask(USER_ID));
  console.log("apptoken  ", mask(TOKEN));
  console.log("range     ", `${from} → ${to}`, `（${Math.round((toTime - fromTime) / 86400)} 天）`);
  console.log("");

  let ok = null;
  for (const set of HEADER_SETS) {
    const { label, appname, ...rest } = set;
    const res = await request({ appname, ...rest }, fromTime, toTime);
    const n = Array.isArray(res.body?.items) ? res.body.items.length : null;
    console.log(`[${label}] HTTP ${res.status}${n === null ? "" : `，${n} 条记录`}`);
    if (res.status === 200 && n !== null) { ok = { label, body: res.body }; break; }
    if (res.status === 401 || res.status === 403) {
      console.log(`  → 认证失败。token 过期、user_id 不对，或 host 区域不匹配。`);
      console.log(`  响应片段：${res.text.slice(0, 200)}`);
    } else if (res.status !== 200) {
      console.log(`  响应片段：${res.text.slice(0, 200)}`);
    }
  }

  if (!ok) {
    console.error("\n所有请求头组合都失败，先解决认证再继续。");
    process.exit(1);
  }

  const items = ok.body.items;
  console.log(`\n可用组合：${ok.label}`);
  console.log(`顶层字段：${Object.keys(ok.body).join(", ")}`);

  if (!items.length) {
    console.log("\n该区间没有称重记录。换 --days 400 或 --from 更早的日期再试。");
    return;
  }

  const sample = items[0];
  console.log(`\n单条原始结构：\n${JSON.stringify(sample, null, 2)}`);
  console.log(`\nsummary 字段：${Object.keys(sample?.summary || {}).join(", ") || "(无 summary)"}`);
  console.log(`单位判断：${describeUnit(items)}`);

  const times = items.map((i) => Number(i?.generatedTime || i?.createTime || 0)).filter(Boolean);
  console.log(`\n时间范围：${fmtTs(Math.min(...times))}  →  ${fmtTs(Math.max(...times))}`);
  console.log(`记录条数：${items.length}${items.length >= LIMIT ? `（已达 limit=${LIMIT}，说明区间被截断，历史需分段拉取）` : ""}`);

  const dupDays = new Map();
  for (const t of times) {
    const d = new Date((t + 8 * 3600) * 1000).toISOString().slice(0, 10);
    dupDays.set(d, (dupDays.get(d) || 0) + 1);
  }
  const multi = [...dupDays.entries()].filter(([, c]) => c > 1).length;
  console.log(`按上海自然日去重：${dupDays.size} 天，其中 ${multi} 天有多次称重（入库需定"取最新"还是"全留"）`);
}

main().catch((err) => {
  console.error("探测失败：", err?.message || err);
  process.exit(1);
});
