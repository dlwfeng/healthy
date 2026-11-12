#!/usr/bin/env node
// Zepp Life(国内账号)登录 → 换取 app_token + user_id,并立刻用一条真实请求验证。
//
// 为什么需要它：Zepp Life 没有开放 API,体重数据只能靠 apptoken 访问。
// 拿 apptoken 有两条路：(a) 浏览器/抓包手工截取；(b) 用账号密码走官方客户端登录链路。
// 本脚本走 (b)，避免安装 mitmproxy 和证书。
//
// 用法（推荐：交互输入密码，不回显、不进 shell 历史）：
//   node services/api/scripts/zepp-login.mjs
//
// 也支持非交互方式（注意：写成命令行字面量会被 shell 记进历史）：
//   ZEPP_ACCOUNT='手机号或邮箱' ZEPP_PASSWORD='密码' node services/api/scripts/zepp-login.mjs
//
// 可选：
//   --account <值>        直接指定账号，省去一次输入（账号不是敏感信息）
//   --third email|phone   登录标识类型，默认按账号里是否含 @ 自动判断
//   --probe-days N        登录成功后立刻拉最近 N 天体重（默认 30，0 表示跳过）
//
// 已知限制：
//   - 华米可能对陌生设备/异地登录弹验证码；失败时脚本会打印原始响应片段。
//   - 拿到的 apptoken 有效期约数周，过期后重新跑本脚本即可。
//   - 只支持「邮箱/手机号 + 密码」账号；用小米账号或微信/Apple 登录的需走抓包。

import { createCipheriv, randomUUID } from "node:crypto";
import { createInterface } from "node:readline";

const AES_KEY = Buffer.from("xeNtBVqzDc6tuNTh", "utf8");
const AES_IV = Buffer.from("MAAAYAAAAAAAAABg", "utf8");
const APP = "com.xiaomi.hm.health";
const APP_VERSION = "6.14.0";
const APP_BUILD = "50818";

const TOKENS_URL = "https://api-user.zepp.com/v2/registrations/tokens";
const LOGIN_URL = "https://account.huami.com/v2/client/login";
const APP_TOKENS_URL = "https://account-cn.huami.com/v1/client/app_tokens";
const DN = "account.zepp.com,api-user.zepp.com,api-mifit.zepp.com,api-watch.zepp.com,app-analytics.zepp.com,api-analytics.huami.com,auth.zepp.com";

function parseArgs(argv) {
  const out = { probeDays: 30, third: null, account: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--third") out.third = argv[++i];
    else if (argv[i] === "--probe-days") out.probeDays = Number(argv[++i]);
    else if (argv[i] === "--account") out.account = argv[++i];
  }
  return out;
}

function ask(question) {
  return new Promise((resolve, reject) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    let answered = false;
    rl.question(question, (answer) => {
      answered = true;
      rl.close();
      resolve(answer.trim());
    });
    rl.on("close", () => {
      if (!answered) reject(new Error("没有读到输入（stdin 已关闭）。请改用环境变量方式。"));
    });
  });
}

// 关闭回显读取密码：密码只存在于本次进程内存，不写文件、不进 shell 历史。
function askHidden(question) {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== "function") {
      reject(new Error(
        "当前终端不支持隐藏输入（可能是管道或非交互环境）。\n" +
        "请改用环境变量：ZEPP_ACCOUNT=... ZEPP_PASSWORD=... node services/api/scripts/zepp-login.mjs"
      ));
      return;
    }

    process.stdout.write(question);
    process.stdin.setRawMode(true);
    process.stdin.resume();

    let value = "";
    let skip = 0;

    const finish = () => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.off("data", onData);
      process.stdout.write("\n");
    };

    const onData = (chunk) => {
      for (const ch of chunk.toString("utf8")) {
        if (skip > 0) { skip--; continue; }
        if (ch === "\u001b") { skip = 2; continue; }        // 忽略方向键等转义序列
        if (ch === "\r" || ch === "\n") { finish(); resolve(value); return; }
        if (ch === "\u0003") { finish(); process.exit(130); } // Ctrl-C
        if (ch === "\u007f" || ch === "\b") { value = value.slice(0, -1); continue; }
        value += ch;
      }
    };

    process.stdin.on("data", onData);
  });
}

function encrypt(payload) {
  const cipher = createCipheriv("aes-128-cbc", AES_KEY, AES_IV);
  return Buffer.concat([cipher.update(Buffer.from(payload, "utf8")), cipher.final()]);
}

function snippet(text) {
  return String(text || "").replace(/\s+/g, " ").slice(0, 300);
}

// 第一步：提交加密凭据，换取 302 重定向里的 access token
async function fetchAccessToken(account, password, third) {
  const params = new URLSearchParams({
    emailOrPhone: account,
    password: password,
    state: "REDIRECTION",
    client_id: "HuaMi",
    country_code: "CN",
    token: "access",
    redirect_uri: "https://s3-us-west-2.amazonaws.com/hm-registration/successsignin.html",
  });

  const res = await fetch(TOKENS_URL, {
    method: "POST",
    redirect: "manual",
    headers: {
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      "user-agent": `MiFit${APP_VERSION} (M2007J1SC; Android 12; Density/2.75)`,
      app_name: APP,
      appname: APP,
      appplatform: "android_phone",
      "x-hm-ekv": "1",
      "hm-privacy-ceip": "false",
      "accept-language": "zh-CN",
      third_name: third,
    },
    body: encrypt(params.toString()),
    signal: AbortSignal.timeout(20000),
  });

  const location = res.headers.get("location");
  if (location) {
    const redirect = new URL(location);
    const access = redirect.searchParams.get("access");
    if (access) return access;

    const code = redirect.searchParams.get("error");
    if (code === "401") {
      throw new Error("账号或密码不正确（服务端返回 error=401）。");
    }
    throw new Error(`登录未通过（error=${code ?? "未知"}）：${snippet(location)}`);
  }

  const text = await res.text();
  throw new Error(`登录被拒绝（HTTP ${res.status}）：${snippet(text)}\n` +
    "常见原因：密码错误、账号需要验证码、或用的是小米账号/第三方登录。");
}

// 第二步：用 access token 换 login_token 和 user_id
async function fetchLoginToken(accessToken, third) {
  const body = new URLSearchParams({
    code: accessToken,
    device_id: randomUUID(),
    device_model: "android_phone",
    dn: DN,
    grant_type: "access_token",
    lang: "zh_CN",
    os_version: "1.5.0",
    source: `${APP}:${APP_VERSION}:${APP_BUILD}`,
    third_name: third,
    app_name: APP,
    appname: APP,
    country_code: "CN",
    allow_registration: "false",
  });

  const res = await fetch(LOGIN_URL, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      app_name: APP,
      appname: APP,
      "x-request-id": randomUUID(),
      "accept-language": "zh-CN",
      cv: `${APP_BUILD}_${APP_VERSION}`,
      v: "2.0",
    },
    body,
    signal: AbortSignal.timeout(20000),
  });

  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { /* 下面统一报错 */ }
  const info = data?.token_info;
  if (!info?.login_token || !info?.user_id) {
    throw new Error(`换取 login_token 失败（HTTP ${res.status}）：${snippet(text)}`);
  }
  return { loginToken: info.login_token, userId: String(info.user_id) };
}

// 第三步：用 login_token 换 app_token
async function fetchAppToken(loginToken) {
  const url = new URL(APP_TOKENS_URL);
  url.searchParams.set("app_name", APP);
  url.searchParams.set("dn", "api-user.huami.com,api-mifit.huami.com,app-analytics.huami.com");
  url.searchParams.set("login_token", loginToken);

  const res = await fetch(url, {
    headers: { "user-agent": "MiFit/5.3.0 (iPhone; iOS 14.7.1; Scale/3.00)" },
    signal: AbortSignal.timeout(20000),
  });

  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { /* 下面统一报错 */ }
  const token = data?.token_info?.app_token;
  if (!token) throw new Error(`换取 app_token 失败（HTTP ${res.status}）：${snippet(text)}`);
  return token;
}

// 第四步：用 apptoken 拉一条真实体重记录，确认整条链路真的可用
async function probe(appToken, userId, days) {
  const to = Math.floor(Date.now() / 1000);
  const from = to - days * 86400;
  const url = new URL(`https://api-mifit-cn.huami.com/users/${userId}/members/-1/weightRecords`);
  url.searchParams.set("fromTime", String(from));
  url.searchParams.set("toTime", String(to));
  url.searchParams.set("limit", "300");
  url.searchParams.set("isForward", "0");

  const res = await fetch(url, {
    headers: { apptoken: appToken, appname: APP, appPlatform: "web", accept: "application/json" },
    signal: AbortSignal.timeout(20000),
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { /* 下面统一报错 */ }

  if (res.status !== 200 || !Array.isArray(data?.items)) {
    console.log(`\n⚠️  token 拿到了，但体重接口返回 HTTP ${res.status}：${snippet(text)}`);
    return;
  }

  const items = data.items;
  console.log(`\n✅ 体重接口可用：最近 ${days} 天共 ${items.length} 条记录`);
  if (items.length) {
    const s = items[0]?.summary || {};
    console.log(`   最新一条：${JSON.stringify(s)}`);
    console.log(`   字段：${Object.keys(s).join(", ")}`);
  } else {
    console.log("   区间内没有称重记录，换更长的 --probe-days 再试。");
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const account = args.account || process.env.ZEPP_ACCOUNT || (await ask("Zepp Life 账号（手机号或邮箱）："));
  if (!account) throw new Error("账号不能为空。");

  const password = process.env.ZEPP_PASSWORD || (await askHidden("密码（输入不回显）："));
  if (!password) throw new Error("密码不能为空。");

  const third = args.third || (account.includes("@") ? "email" : "phone");
  console.log(`\n账号：${account.slice(0, 3)}***（按 ${third} 登录）\n`);

  const access = await fetchAccessToken(account, password, third);
  console.log("① 拿到 access token");

  const { loginToken, userId } = await fetchLoginToken(access, third);
  console.log(`② 拿到 login_token 和 user_id=${userId}`);

  const appToken = await fetchAppToken(loginToken);
  console.log("③ 拿到 app_token");

  console.log("\n把下面两行存到安全的位置（等同于账号读写权限）：\n");
  console.log(`ZEPP_APP_TOKEN=${appToken}`);
  console.log(`ZEPP_USER_ID=${userId}`);

  if (args.probeDays > 0) {
    await probe(appToken, userId, args.probeDays);
  }
}

main().catch((err) => {
  console.error(`\n失败：${err?.message || err}`);
  process.exit(1);
});
