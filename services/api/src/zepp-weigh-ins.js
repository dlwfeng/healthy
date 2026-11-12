// Zepp Life(华米)体重与体成分接口客户端。
// 该接口为非公开接口，按 2026-11 国内账号实测：
//   GET https://api-mifit-cn.huami.com/users/{userId}/members/-1/weightRecords
//   headers: apptoken / appname: com.xiaomi.hm.health / appPlatform: web
// weight 单位是千克（实测 71.5），不需要从克换算。
// 认证只能靠 apptoken，微信扫码登录的账号无法自动续期，因此 401 必须显式上抛。

export class ZeppAuthError extends Error {
  constructor(message = 'zepp_auth_expired') {
    super(message);
    this.name = 'ZeppAuthError';
  }
}

const int = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
};
const dec = (v, digits) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 10 ** digits) / 10 ** digits : null;
};

// summary 里未列出的字段保持 null，界面不得用 0 冒充缺失。
export function normalizeWeighIn(raw) {
  const summary = raw && typeof raw === 'object' ? raw.summary || {} : {};
  const seconds = Number(raw?.generatedTime ?? raw?.createTime);
  const weightKg = dec(summary.weight, 2);
  if (!Number.isFinite(seconds) || seconds <= 0 || weightKg === null || weightKg <= 0) return null;
  if (weightKg > 500) return null;
  return {
    measuredAt: new Date(seconds * 1000).toISOString(),
    weightKg,
    heightCm: int(summary.height),
    bmi: dec(summary.bmi, 1),
    bodyFatPct: dec(summary.fatRate, 1),
    bodyWaterPct: dec(summary.bodyWaterRate, 1),
    muscleRatePct: dec(summary.muscleRate, 1),
    proteinPct: dec(summary.proteinRatio, 1),
    boneMassKg: dec(summary.boneMass, 2),
    basalMetabolismKcal: int(summary.metabolism),
    visceralFat: int(summary.visceralFat),
    muscleAge: int(summary.muscleAge),
    bodyScore: int(summary.bodyScore),
    bodyStyle: int(summary.bodyStyle),
    impedance: int(summary.impedance),
    deviceSource: int(raw?.deviceSource),
    raw,
  };
}

async function requestPage({ token, userId, baseUrl, toTime, limit, fetchImpl }) {
  const url = new URL(`${baseUrl.replace(/\/+$/, '')}/users/${encodeURIComponent(userId)}/members/-1/weightRecords`);
  url.searchParams.set('fromTime', '0');
  url.searchParams.set('toTime', String(toTime));
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('isForward', '0');

  const res = await fetchImpl(url, {
    headers: {
      apptoken: token,
      appname: 'com.xiaomi.hm.health',
      appPlatform: 'web',
      accept: 'application/json',
    },
    signal: AbortSignal.timeout(20000),
  });

  if (res.status === 401 || res.status === 403) throw new ZeppAuthError();
  if (!res.ok) throw new Error(`zepp_http_${res.status}`);

  const body = await res.json().catch(() => null);
  const items = Array.isArray(body?.items) ? body.items : null;
  if (!items) throw new Error('zepp_invalid_response');
  return items;
}

// 接口每次最多返回 limit 条且无 offset；超出时按时间向前翻页。
export async function fetchAllWeighIns({
  token,
  userId,
  baseUrl = 'https://api-mifit-cn.huami.com',
  limit = 300,
  now = Date.now(),
  fetchImpl = fetch,
  maxPages = 20,
}) {
  if (!token || !userId) throw new Error('zepp_not_configured');

  const byTime = new Map();
  let toTime = Math.floor(Number(now) / 1000);

  for (let page = 0; page < maxPages; page++) {
    const items = await requestPage({ token, userId, baseUrl, toTime, limit, fetchImpl });
    if (!items.length) break;

    let oldest = toTime;
    for (const item of items) {
      const row = normalizeWeighIn(item);
      if (row) byTime.set(row.measuredAt, row);
      const seconds = Number(item?.generatedTime ?? item?.createTime);
      if (Number.isFinite(seconds) && seconds > 0 && seconds < oldest) oldest = seconds;
    }

    // 未填满说明已经到达最早一条；填满则从最早时间继续向前翻。
    if (items.length < limit || oldest >= toTime) break;
    toTime = oldest;
  }

  return [...byTime.values()].sort((a, b) => a.measuredAt.localeCompare(b.measuredAt));
}
