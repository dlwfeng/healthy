/* Garmin calendar training is written through the health assistant tool allowlist. */
const iconPaths = {
  drop: '<path d="M12 3c-2 3-7 7-7 12a7 7 0 0 0 14 0c0-5-5-9-7-12Z"/>',
  stairs: '<path d="M3 20h5v-5h5v-5h5V5h3"/>',
  scale: '<rect x="4" y="4" width="16" height="17" rx="3"/><path d="M8 8a6 6 0 0 1 8 0l-4 5Z"/>',
  home: '<path d="m3 10 9-7 9 7v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 21v-7h6v7"/>',
  report: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 17v-3m4 3v-5m4 5v-2"/>',
  library: '<path d="M4 4h4v16H4zM10 4h4v16h-4zM16 5l4-1 3 15-4 1z"/>',
  chart: '<path d="M3 3v18h18M6 15l4-5 4 3 6-8"/>',
  food: '<path d="M4 3v8a3 3 0 0 0 3 3h1v7M7 3v8M10 3v8m7-8v18m0-18c4 3 5 7 0 10"/>',
  run: '<circle cx="15" cy="4" r="2"/><path d="m7 21 3-5 3-3 3 2 4 1M5 12l5-3 4 1 3 3M10 9l1-4"/>',
  heart:
    '<path d="M20.8 8.5c0 4.3-8.8 10-8.8 10s-8.8-5.7-8.8-10a4.7 4.7 0 0 1 8.8-2.2 4.7 4.7 0 0 1 8.8 2.2Z"/>',
  moon: '<path d="M20.5 14.4A8.6 8.6 0 0 1 9.6 3.5 8.7 8.7 0 1 0 20.5 14.4Z"/>',
  bolt: '<path d="m13 2-9 11h7l-1 9 10-12h-7z"/>',
  calendar:
    '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18"/>',
  journal:
    '<path d="M5 3h12a2 2 0 0 1 2 2v16H7a2 2 0 0 1-2-2V3Z"/><path d="M5 7h14M9 12h6m-6 4h6"/>',
  book: '<path d="M12 5c-2-1.3-5-1.7-9-1v15c4-.7 7-.3 9 1 2-1.3 5-1.7 9-1V4c-4-.7-7-.3-9 1Z"/><path d="M12 5v15"/>',
  send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  chat: '<path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5 8.2 8.2 0 0 1-3-.6L4 20l1.6-4.5A7.5 7.5 0 1 1 20 11.5Z"/><path d="M9 11.5h.01M12.5 11.5h.01M16 11.5h.01" stroke-width="2.5"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  refresh:
    '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 7a7 7 0 0 1 12-1l2 3M4 15l2 3a7 7 0 0 0 12-1"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  steps:
    '<path d="M8 3c-2 0-3 3-3 5s1 3 3 3 3-1 3-3-1-5-3-5Zm8 7c-2 0-3 3-3 5s1 3 3 3 3-1 3-3-1-5-3-5Z"/><path d="M5 14h6v3a3 3 0 0 1-6 0Zm8 7h6"/>',
};
const icon = (name) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[name] || iconPaths.chart}</svg>`;
const escapeHtml = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const markdown = window.markdownit?.({
  html: false,
  linkify: true,
  breaks: true,
});
const renderMarkdown = (v) =>
  markdown ? markdown.render(v) : escapeHtml(v).replace(/\n/g, "<br>");
const piMeal = { draft: null, id: null, saving: false, error: "", date: "", time: "", kind: "午餐" };
const toolLabels = {
  record_meal: "记餐 · 识别与联网核对",
  copy_meal: "复制餐食到草稿",
  get_user_summary: "每日概览",
  get_sleep_data: "睡眠",
  get_hrv_data: "HRV",
  get_body_battery: "身体电量",
  get_weigh_ins: "体重",
  get_training_readiness: "训练准备度",
  get_activities_by_date: "日期活动",
  get_activities: "近期活动",
  get_workouts: "训练课程",
  get_calendar: "佳明日历",
  get_workout_by_id: "训练详情",
  create_workout: "创建佳明训练",
  schedule_workout: "安排佳明日历",
  record_daily_status: "保存每日状态",
  get_daily_status: "每日状态记录",
  get_meals: "饮食记录",
  get_nutrition_trend: "营养趋势",
  get_energy_balance: "热量平衡",
};
const toolTiming = (t) =>
  Number.isFinite(t.durationMs)
    ? ` · ${(t.durationMs / 1000).toFixed(1)} 秒`
    : "";
const pages = [
  ["home", "健康首页", "home"],
  ["trends", "生理指标", "heart"],
  ["journal", "个人记录", "journal"],
  ["activity_stats", "活动统计", "chart"],
  ["activity", "训练计划", "calendar"],
  ["food", "饮食记录", "food"],
  ["recipes", "食谱推荐", "book"],
  ["dietary_guidelines", "膳食指南", "library"],
  ["reports", "健康报告", "report"],
  ["memory", "记忆", "journal"],
  ["feedback", "意见反馈", "chat"],
];
const navigation = [
  { label: "健康首页", icon: "home", page: "home", children: [] },
  { label: "健康报告", icon: "report", page: "reports", children: [] },
  { label: "身体状态", icon: "heart", page: "trends", children: [["trends", "生理指标", "heart"], ["journal", "个人记录", "journal"]] },
  { label: "运动训练", icon: "run", page: "activity_stats", children: [["activity_stats", "活动统计", "chart"], ["activity", "训练计划", "calendar"]] },
  { label: "饮食营养", icon: "food", page: "food", children: [["food", "饮食记录", "food"], ["recipes", "食谱推荐", "book"], ["dietary_guidelines", "膳食指南", "library"]] },
  { label: "健康助手", icon: "chat", page: "memory", children: [["memory", "记忆", "journal"], ["feedback", "意见反馈", "chat"]], divider: true },
];
const dietaryDocuments = {
  guide: { label: "膳食指南核心推荐", path: "./references/chinese-dietary-guidelines-2022-core-recommendations.md" },
  macro: { label: "宏量营养素参考标准", path: "./references/WS-T-578.1-2017-macronutrients.md" },
};
const dietaryGuide = { selected: new URLSearchParams(location.search).get("dietary_document") === "macro" ? "macro" : "guide", contents: new Map(), loading: new Set(), errors: new Set() };
const present = (v) => typeof v === "number" && Number.isFinite(v);
const format = (v) =>
  present(v)
    ? new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 1 }).format(v)
    : "—";
const localDate = () =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai" }).format(
    new Date(),
  );
const validDate = (v) =>
  /^\d{4}-\d{2}-\d{2}$/.test(v || "") &&
  !Number.isNaN(Date.parse(v)) &&
  new Date(v + "T12:00:00Z").toISOString().slice(0, 10) === v;
const shiftDate = (date, n) => {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const timeLabel = (v) =>
  v
    ? new Date(v).toLocaleTimeString("zh-CN", {
        timeZone: "Asia/Shanghai",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
    : "—";
const shortDate = (v) =>
  v ? `${Number(v.slice(5, 7))}/${Number(v.slice(8, 10))}` : "—";
const duration = (value) => {
  if (!present(value)) return "—";
  const total = Math.round(value),
    hours = Math.floor(total / 60);
  return `${hours ? hours + " 小时 " : ""}${total % 60} 分`;
};
const weekday = (v) =>
  new Date(v + "T12:00:00Z").toLocaleDateString("zh-CN", {
    timeZone: "Asia/Shanghai",
    weekday: "long",
  });
const params = new URLSearchParams(location.search);
const aliases = { stats: "trends", plan: "activity" };
const initialPage = aliases[location.hash.slice(1)] || location.hash.slice(1);
let savedTheme;
try {
  savedTheme =
    localStorage.getItem("healthy-theme") ??
    localStorage.getItem("zhixu-theme");
} catch {}
const state = {
  page: pages.some((p) => p[0] === initialPage) ? initialPage : "home",
  date:
    validDate(params.get("date")) && params.get("date") <= localDate()
      ? params.get("date")
      : localDate(),
  days: params.get("days") === "30" ? 30 : 7,
  status: "loading",
  data: null,
  error: null,
  request: 0,
  workoutsExpanded: false,
  theme:
    savedTheme ||
    (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"),
  detail: null,
  activityFilter: "all",
  trendMetric: "bodyBattery",
  history: null,
  historyStatus: "idle",
  historyRequest: 0,
  journalMonth: localDate().slice(0, 7),
  journalEntries: [],
  journalStatus: "idle",
  journalRequest: 0,
  chatOpen: false,
  chatPending: false,
  chatProgress: null,
  chatAbort: null,
  chatDraft: "",
  reportContext: null,
  chats: [
    {
      who: "bot",
      text: "你好，可以一起看看睡眠与恢复、记下身体感受，或安排训练。",
    },
  ],
};
const main = document.getElementById("app-main"),
  companion = document.getElementById("companion"),
  drawer = document.getElementById("metric-drawer");
const cookbook = new RecipeLibrary({
  onChange: () => {
    if (state.page === "recipes") render();
  },
});
const diet = new MealJournal({ onChange: () => { if (state.page === "food") render(); }, today: localDate });
const trainingCalendar = new TrainingCalendar({
  date: localDate(),
  onChange: () => {
    if (state.page === "activity") render();
  },
  helpers: {
    icon,
    escapeHtml,
    duration,
    format,
    sportName: (v) => sportName(v),
    today: localDate,
    shiftDate,
    weekday,
    timeLabel,
  },
});
const activityJournal = new ActivityJournal({
  onChange: () => { if (state.page === "activity_stats") render(); },
  helpers: { icon, escapeHtml, sportName: v => sportName(v), today: localDate, shiftDate, validDate, timeLabel },
});
const healthReports = new HealthReports({
  onChange: () => { if (state.page === "reports" || state.page === "home") render(); },
  onNavigate: () => navigate("reports"),
  onDiscuss: (context, draft) => { state.reportContext = context; openChat(draft); },
  helpers: { icon, escapeHtml, today: localDate, shiftDate },
});
const homeDashboard = new HomeDashboardData(() => { if (state.page === "home") render(); });
const bodyStatus = new BodyStatus({
  onChange: () => { if (state.page === "trends") render(); },
  helpers: { icon, escapeHtml, format, duration, ring, lineChart, phaseBar, timeLabel, batteryCard, sleepCard, readinessCard, rawStatus: (v) => rawStatus(v), today: localDate },
});
const healthMemory = new HealthMemory({ onChange: () => { if (state.page === "memory") render(); }, escapeHtml });
const feedback = new HealthFeedback({onChange:()=>{if(state.page === "feedback")render();},escapeHtml});
let returnFocus = null,
  garminController,
  historyController;
const historyCache = new Map();
const m = () => state.data?.metrics || {},
  daily = () => state.data?.daily || {},
  analysis = () => state.data?.analysis || {};
const isLoading = () => state.status === "loading";
const rawStatus = (v) =>
  ({
    BALANCED: "平衡",
    UNBALANCED: "不平衡",
    LOW: "低",
    POOR: "较差",
    FAIR: "一般",
    GOOD: "良好",
    EXCELLENT: "优秀",
    HIGH: "高",
    MODERATE: "中等",
    VERY_HIGH: "很高",
    VERY_LOW: "很低",
    VERY_GOOD: "很好",
    WELL_RECOVERED: "恢复良好",
    NOT_AVAILABLE: "暂无评估",
  })[v] || null;
const sportName = (v) =>
  ({
    running: "跑步",
    trail_running: "越野跑",
    walking: "步行",
    cycling: "骑行",
    road_biking: "公路骑行",
    mountain_biking: "山地骑行",
    badminton: "羽毛球",
    indoor_cardio: "室内有氧",
    strength_training: "力量训练",
    cardio_training: "有氧训练",
    swimming: "游泳",
    lap_swimming: "泳池游泳",
    yoga: "瑜伽",
    hiking: "徒步",
    pilates: "普拉提",
    hiit: "HIIT",
    mobility: "灵活性训练",
    other: "其他运动",
  })[v] || "其他运动";
const metricDefs = {
  bodyBattery: {
    name: "身体电量",
    unit: "/ 100",
    color: "teal",
    icon: "bolt",
    description:
      "Garmin 身体电量反映能量储备的变化。曲线展示实际返回的日内观测点；跨日趋势使用每天末次记录。",
  },
  sleep: {
    name: "睡眠",
    unit: "分钟",
    color: "indigo",
    icon: "moon",
    description:
      "睡眠日期对应醒来的那一天。阶段时长和评分来自佳明，睡眠阶段不等同于医学检查。",
  },
  restingHeartRate: {
    name: "静息心率",
    unit: "bpm",
    color: "coral",
    icon: "heart",
    description:
      "静息心率与全天最低、最高心率是不同指标。下方曲线为夜间心率观测，不代表全天连续心率。",
  },
  hrv: {
    name: "夜间 HRV",
    unit: "ms",
    color: "cyan",
    icon: "chart",
    description:
      "这里展示昨夜平均 HRV。佳明的 HRV 状态参考个人基线和长期变化；单次数字不用于判断身体异常。",
  },
  stress: {
    name: "压力",
    unit: "/ 100",
    color: "orange",
    icon: "chart",
    description:
      "佳明的全天平均压力与各压力阶段时长。未测量、活动期间或未佩戴时段不算作休息。",
  },
  readiness: {
    name: "训练准备度",
    unit: "/ 100",
    color: "teal",
    icon: "run",
    description: "评分和影响因素均来自 Garmin。已安排训练可在运动日历中查看。",
  },
  steps: {
    name: "步数",
    unit: "步",
    color: "orange",
    icon: "steps",
    description:
      "完成率使用所选日期佳明返回的步数目标。活动热量是消耗，不是饮食摄入；强度分钟按佳明返回的中高强度分钟展示。",
  },
};
const metricValue = (k) =>
  k === "sleep"
    ? m().sleepMinutes
    : k === "stress"
      ? daily().averageStress
      : k === "readiness"
        ? m().trainingReadiness
        : m()[k];
const numberBlock = (v, unit = "", cls = "") =>
  `<div class="metric-value ${cls}">${format(v)}${unit ? `<small>${unit}</small>` : ""}</div>`;
const detailButton = (k) =>
  `<button class="detail-button" type="button" data-detail="${k}" aria-label="查看${metricDefs[k].name}详情">${icon("chevron")}</button>`;
const cardHead = (k, extra = "") =>
  `<div class="card-head"><h2><span class="metric-symbol ${metricDefs[k].color}">${icon(metricDefs[k].icon)}</span>${metricDefs[k].name}</h2>${extra}${detailButton(k)}</div>`;
const empty = (title, desc = "", ico = "chart") =>
  `<div class="empty-state"><span class="empty-icon">${icon(ico)}</span><strong>${title}</strong>${desc ? `<p>${desc}</p>` : ""}</div>`;
const noData = () => (isLoading() ? "正在读取数据…" : "这一天暂无数据");
function ring(value, max, color = "teal", label = "", size = 108) {
  const ratio =
    present(value) && present(max) && max > 0
      ? Math.min(1, Math.max(0, value / max))
      : 0;
  return `<div class="score-ring ${color}" style="--ring-size:${size}px"><svg viewBox="0 0 120 120" aria-hidden="true"><circle class="ring-track" cx="60" cy="60" r="51"/><circle class="ring-progress" ${present(value) && present(max) && max > 0 ? "" : "hidden"} cx="60" cy="60" r="51" pathLength="100" stroke-dasharray="${ratio * 100} 100"/></svg><div><strong>${format(value)}</strong>${label ? `<small>${label}</small>` : ""}</div></div>`;
}
function lineChart(
  rows,
  {
    color = "teal",
    min,
    max,
    height = 160,
    label = "数据变化",
    dailyAxis = false,
    compact = false,
  } = {},
) {
  const good = rows.filter((p) => present(p.value));
  if (!good.length)
    return compact
      ? '<div class="spark-empty">暂无曲线</div>'
      : empty(
          isLoading() ? "正在读取曲线…" : "暂无可展示的观测",
          "缺失数据不会以零值补齐",
        );
  const vals = good.map((p) => p.value);
  const lo = present(min)
    ? min
    : Math.max(
        0,
        Math.min(...vals) -
          Math.max(2, (Math.max(...vals) - Math.min(...vals)) * 0.18),
      );
  const hi = present(max)
    ? max
    : Math.max(...vals) +
      Math.max(2, (Math.max(...vals) - Math.min(...vals)) * 0.18);
  const aria = `${label}，${good.length} 个有效观测，最低 ${format(Math.min(...vals))}，最高 ${format(Math.max(...vals))}`;
  const chart = {
    compact,
    dailyAxis,
    lo,
    hi,
    rows: rows.map((p) => ({
      at: p.at || null,
      date: p.date || null,
      value: present(p.value) ? p.value : null,
    })),
  };
  return `<div class="line-chart ${color}${compact ? " compact" : ""}" style="height:${compact ? 48 : height}px"><canvas data-line-chart="${escapeHtml(JSON.stringify(chart))}" role="img" aria-label="${escapeHtml(aria)}">${escapeHtml(aria)}</canvas></div>`;
}
function destroyLineCharts(root) {
  if (typeof Chart === "undefined") return;
  root.querySelectorAll("canvas[data-line-chart]").forEach((canvas) => {
    Chart.getChart(canvas)?.destroy();
  });
}
function mountLineCharts(root) {
  if (typeof Chart === "undefined") return;
  Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
  root.querySelectorAll("canvas[data-line-chart]").forEach((canvas) => {
    const chart = JSON.parse(canvas.dataset.lineChart);
    const css = getComputedStyle(canvas);
    const read = (name, fallback) =>
      css.getPropertyValue(name).trim() || fallback;
    const tone = read("--color", read("--teal", "#178477"));
    const surface = read("--surface", "#fff");
    const line = read("--line", "#e9edf0");
    const faint = read("--faint", "#87939c");
    const ink = read("--text", "#23323b");
    const times = chart.rows.map((row) =>
      Date.parse(chart.dailyAxis ? row.date : row.at),
    );
    const timed =
      !chart.dailyAxis &&
      times.every(Number.isFinite) &&
      times.at(-1) > times[0];
    const labels = chart.rows.map((row, i) =>
      chart.dailyAxis
        ? shortDate(row.date)
        : row.at
          ? timeLabel(row.at)
          : String(i + 1),
    );
    const fontSize = innerWidth < 768 ? 10 : 9;
    const axis = {
      grid: { display: false },
      border: { display: false },
      ticks: {
        color: faint,
        font: { size: fontSize },
        maxRotation: 0,
        maxTicksLimit: 3,
      },
    };
    new Chart(canvas, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            data: chart.rows.map((row, i) =>
              timed ? { x: times[i], y: row.value } : row.value,
            ),
            borderColor: tone,
            backgroundColor: tone + (chart.compact ? "0a" : "0e"),
            borderWidth: chart.compact ? 1.5 : 2,
            fill: "start",
            tension: 0,
            spanGaps: false,
            pointRadius: chart.compact ? 0 : chart.rows.length > 60 ? 2 : 3.4,
            pointHoverRadius: chart.compact ? 0 : 5,
            pointHitRadius: 10,
            pointBackgroundColor: tone,
            pointBorderColor: surface,
            pointBorderWidth: 1.5,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        resizeDelay: 0,
        interaction: { mode: "index", intersect: false },
        layout: { padding: { top: 8, right: 18 } },
        plugins: {
          legend: { display: false },
          tooltip: chart.compact
            ? { enabled: false }
            : {
                enabled: true,
                displayColors: false,
                backgroundColor: ink,
                titleColor: surface,
                bodyColor: surface,
                padding: 8,
                cornerRadius: 6,
                callbacks: {
                  title: (items) =>
                    chart.dailyAxis
                      ? labels[items[0].dataIndex]
                      : timeLabel(new Date(items[0].parsed.x).toISOString()),
                  label: (item) => format(item.parsed.y),
                },
              },
        },
        scales: chart.compact
          ? {
              x: { ...axis, display: false },
              y: { ...axis, display: false, min: chart.lo, max: chart.hi },
            }
          : {
              x: timed
                ? {
                    ...axis,
                    type: "linear",
                    min: times[0],
                    max: times.at(-1),
                    ticks: {
                      ...axis.ticks,
                      callback: (value) =>
                        timeLabel(new Date(value).toISOString()),
                    },
                  }
                : {
                    ...axis,
                    type: "category",
                    ticks: {
                      ...axis.ticks,
                      autoSkip: false,
                      callback: (value, index) =>
                        index === 0 ||
                        index === Math.floor((labels.length - 1) / 2) ||
                        index === labels.length - 1
                          ? labels[index]
                          : "",
                    },
                  },
              y: {
                ...axis,
                min: chart.lo,
                max: chart.hi,
                grid: {
                  color: line,
                  borderDash: [3, 5],
                  drawTicks: false,
                  tickLength: 0,
                },
                ticks: {
                  ...axis.ticks,
                  padding: 4,
                  callback: (value) => Math.round(value),
                },
              },
            },
      },
    });
  });
}
function phaseBar(stages, kind = "sleep") {
  const names =
    kind === "sleep"
      ? { deep: "深睡", light: "浅睡", rem: "REM", awake: "清醒" }
      : { rest: "休息", low: "低", medium: "中", high: "高" };
  const entries = Object.entries(stages || {}).filter(([, v]) => present(v));
  const total = entries.reduce((a, [, v]) => a + v, 0);
  return total
    ? `<div class="phase-bar ${kind}" role="img" aria-label="${entries.map(([k, v]) => `${names[k]} ${v} 分钟`).join("，")}">${entries.map(([k, v]) => (v > 0 ? `<span class="phase-${k}" style="flex:${v}" title="${names[k]} ${v} 分钟"></span>` : "")).join("")}</div>`
    : "";
}
function dateControls() {
  return `<div class="date-selector"><button class="icon-button previous" type="button" data-date-shift="-1" aria-label="前一天">${icon("chevron")}</button><label class="date-input-wrap">${icon("calendar")}<input id="garmin-date" type="date" aria-label="查看日期" value="${state.date}" max="${localDate()}"></label><button class="icon-button" type="button" data-date-shift="1" aria-label="后一天" ${state.date >= localDate() ? "disabled" : ""}>${icon("chevron")}</button>${state.date !== localDate() ? '<button class="today-button" type="button" data-today>今天</button>' : ""}</div>`;
}
function heading(title, desc, controls = dateControls()) {
  return `<div class="page-heading"><div><div class="eyebrow">${state.date === localDate() ? "TODAY" : state.date.replaceAll("-", " / ")} <span>· ${weekday(state.date)}</span></div><h1>${title}</h1><p>${desc}</p></div>${controls}</div>`;
}
function connectionNote() {
  if (isLoading())
    return '<div class="loading-note" role="status"><span class="loading-dot"></span>正在读取佳明记录，数据就绪后会显示在下方。</div>';
  if (state.status !== "connected")
    return `<div class="connection-note" role="alert"><div><strong>暂时无法读取 Garmin 数据</strong><p>${state.status === "not_configured" ? "请先完成服务端 Garmin 账号配置。" : "请稍后重试；生活记录仍可单独查看。"}</p></div><button class="secondary-btn" type="button" data-refresh>重新读取</button></div>`;
  if (state.data?.unavailable?.length)
    return `<details class="partial-note"><summary>部分数据暂时不可用 · 其余记录已正常显示</summary><p>${state.data.unavailable.map((k) => escapeHtml(toolLabels[k] || "佳明数据")).join("、")}读取失败。可使用右上角刷新重试。</p></details>`;
  if (
    state.page === "home" &&
    !Object.entries(m()).some(
      ([key, value]) => key !== "activityCount" && present(value),
    )
  )
    return `<div class="daily-empty-note" role="status"><div><strong>这一天还没有身体指标</strong><p>可以回看之前的记录，或在设备同步后刷新。</p></div><button class="secondary-btn" type="button" data-date-shift="-1">查看前一天 ${icon("arrow")}</button></div>`;
  return "";
}
function batteryCard() {
  const d = daily();
  return `<section class="health-card battery-card">${cardHead("bodyBattery")}<div class="battery-summary">${numberBlock(m().bodyBattery, "/ 100")}<span class="value-caption">${present(m().bodyBattery) ? "当日末次记录" : noData()}</span></div><div class="battery-changes"><span><i class="charge-dot"></i>充电 <strong>${present(d.batteryCharged) ? "+" : ""}${format(d.batteryCharged)}</strong></span><span><i class="drain-dot"></i>消耗 <strong>${present(d.batteryDrained) ? "−" : ""}${format(d.batteryDrained)}</strong></span></div>${lineChart(state.data?.batterySeries || [], { min: 0, max: 100, height: 140, label: "所选日期身体电量日内变化" })}</section>`;
}
function sleepCard() {
  const s = state.data?.sleep || {},
    a = analysis();
  const total = m().sleepMinutes;
  return `<section class="health-card sleep-card">${cardHead("sleep")}<div class="sleep-summary"><div class="sleep-time">${present(total) ? `<strong>${Math.floor(total / 60)}</strong><span>小时</span><strong>${total % 60}</strong><span>分</span>` : "<strong>—</strong>"}<small>${s.start && s.end ? `${timeLabel(s.start)} 入睡 · ${timeLabel(s.end)} 醒来` : noData()}</small></div>${ring(a.sleepScore, 100, "indigo", rawStatus(a.sleepQualifier) || "睡眠评分", 78)}</div>${phaseBar(s.stages)}<div class="sleep-legend">${[
    ["deep", "深睡"],
    ["light", "浅睡"],
    ["rem", "REM"],
    ["awake", "清醒"],
  ]
    .map(
      ([k, n]) =>
        `<div><span><i class="phase-${k}"></i>${n}</span><strong>${duration(s.stages?.[k])}</strong></div>`,
    )
    .join("")}</div></section>`;
}
function readinessCard() {
  const r = state.data?.readiness || {},
    a = analysis();
  return `<section class="health-card readiness-card">${cardHead("readiness", `<button class="icon-button context-chat-action" type="button" data-ask="结合 ${state.date} 的睡眠、HRV 和训练准备度，帮我理解这一天的恢复情况。" aria-label="对话解读恢复情况" title="对话解读恢复情况">${icon("chat")}</button>`)}<div class="readiness-center">${ring(m().trainingReadiness, 100, "teal", rawStatus(a.readinessLevel) || "暂无评分", 116)}</div><div class="readiness-factors">${
    (r.factors || [])
      .filter((f) => present(f.percent))
      .slice(0, 2)
      .map(
        (f) =>
          `<div><span>${f.label}</span><strong>${rawStatus(f.feedback) || format(f.percent) + "%"}</strong></div>`,
      )
      .join("") || '<p class="muted">暂无影响因素</p>'
  }</div><button class="card-text-action" type="button" data-detail="readiness">查看恢复因素 ${icon("arrow")}</button></section>`;
}
function signalsCard() {
  const d = daily();
  return `<section class="health-card signals-card"><div class="card-head"><h2>身体信号</h2><span class="caption">了解这一天的身体变化</span></div><div class="signals-grid"><div class="signal coral"><div class="signal-title"><span>${icon("heart")}静息心率</span>${detailButton("restingHeartRate")}</div>${numberBlock(m().restingHeartRate, "bpm")}${lineChart(state.data?.sleep?.heartRate || [], { color: "coral", height: 62, compact: true, label: "夜间心率" })}<span class="signal-note">全天 ${format(d.minHeartRate)}–${format(d.maxHeartRate)} bpm</span></div><div class="signal cyan"><div class="signal-title"><span>${icon("chart")}夜间 HRV</span>${detailButton("hrv")}</div>${numberBlock(m().hrv, "ms")}${lineChart(state.data?.hrv?.readings || [], { color: "cyan", height: 62, compact: true, label: "夜间 HRV" })}<span class="signal-note">佳明状态 · ${rawStatus(analysis().hrvStatus) || "暂无评估"}</span></div><div class="signal orange"><div class="signal-title"><span>${icon("chart")}平均压力</span>${detailButton("stress")}</div>${numberBlock(d.averageStress, "/ 100")}<div class="stress-mini">${phaseBar(d.stressMinutes, "stress")}</div><span class="signal-note">休息 ${duration(d.stressMinutes?.rest)}</span></div></div></section>`;
}
function movementCard() {
  const d = daily();
  const goal = d.stepGoal;
  return `<section class="health-card movement-card">${cardHead("steps", `<span class="caption">${present(goal) && goal > 0 ? Math.round(((m().steps || 0) / goal) * 100) + "%" : "暂无目标"}</span>`)}<div class="movement-body">${ring(m().steps, goal, "orange", "步", 108)}<div class="movement-stats"><div><span>每日目标</span><strong>${format(goal)} <small>步</small></strong></div><div><span>活动消耗</span><strong>${format(d.activeCalories)} <small>kcal</small></strong></div><div><span>全天距离</span><strong>${format(d.distanceKm)} <small>km</small></strong></div></div></div></section>`;
}
function activityRows(rows, limit = 30) {
  return rows
    .slice(0, limit)
    .map(
      (a, i) =>
        `<button class="activity-row" type="button" data-activity="${i}"><span class="activity-icon ${/bik|cycl/.test(a.sport) ? "cyan" : "orange"}">${icon("run")}</span><span class="activity-info"><strong>${escapeHtml(a.name)}</strong><small>${shortDate(a.date)}${a.time ? " · " + escapeHtml(a.time) : ""} · ${sportName(a.sport)}</small></span><span class="activity-measure"><strong>${duration(a.durationMinutes)}</strong><small>${a.distanceKm > 0 ? format(a.distanceKm) + " km" : present(a.calories) ? format(a.calories) + " kcal" : ""}</small></span>${icon("chevron")}</button>`,
    )
    .join("");
}
function home() { return cockpitHome(); }

function activityStats() {
  return activityJournal.render();
}
const metricOptions = [
  ["bodyBattery", "身体电量", "/ 100"],
  ["sleep", "睡眠时长", "分钟"],
  ["restingHeartRate", "静息心率", "bpm"],
  ["hrv", "夜间 HRV", "ms"],
  ["stress", "平均压力", "/ 100"],
  ["steps", "步数", "步"],
];
function historyRows() {
  if (state.trendMetric !== "bodyBattery") return state.history?.points || [];
  const history = new Map(
    (state.data?.batteryHistory || []).map((p) => [p.date, p.value]),
  );
  return Array.from({ length: state.days }, (_, i) => {
    const date = shiftDate(state.date, i - state.days + 1);
    return { date, value: history.get(date) ?? null };
  });
}
function trends() {
  const rows = historyRows(),
    values = rows.filter((p) => present(p.value)).map((p) => p.value);
  const def = metricDefs[state.trendMetric],
    name = metricOptions.find((p) => p[0] === state.trendMetric)[1];
  const unit = metricOptions.find((p) => p[0] === state.trendMetric)[2];
  const loading =
    state.trendMetric === "bodyBattery"
      ? isLoading()
      : state.historyStatus === "loading";
  const formatTrend = (v) =>
    state.trendMetric === "sleep" ? duration(v) : format(v);
  return `${heading("生理指标", "了解当日的恢复、睡眠与身体信号，回看长期变化。", `${dateControls()}<a class="text-link" href="#journal" data-goto="journal">个人记录 ${icon("arrow")}</a>`)}${connectionNote()}${bodyStatus.render(state.date, state.data)}<section class="body-history-section" aria-labelledby="body-history-title"><div class="body-section-heading"><h2 id="body-history-title">指标趋势</h2><span>选择指标，回看近 7 天或 30 天</span></div><div class="trend-layout body-history" id="body-history"><div class="metric-picker" role="group" aria-label="趋势指标">${metricOptions.map(([k, n, u]) => `<button type="button" data-trend="${k}" class="${state.trendMetric === k ? "active" : ""}" aria-pressed="${state.trendMetric === k}"><span class="metric-symbol ${metricDefs[k].color}">${icon(metricDefs[k].icon)}</span><span>${n}<small>${u}</small></span>${icon("chevron")}</button>`).join("")}</div><section data-share-scope="body-trend" class="health-card trend-card"><div class="card-head"><div><h2>${name}</h2><p class="caption">${shortDate(shiftDate(state.date, 1 - state.days))} — ${shortDate(state.date)}${state.trendMetric === "bodyBattery" ? " · 每日末次记录" : ""}</p></div><div class="segmented" role="group" aria-label="趋势范围">${[7, 30].map((n) => `<button type="button" data-period="${n}" aria-pressed="${state.days === n}">${n === 7 ? "近 7 天" : "近 30 天"}</button>`).join("")}</div>${HealthShare.button({ title: `${name}趋势`, context: `${shiftDate(state.date, 1 - state.days)} — ${state.date} · Garmin Connect`, disabled: loading })}<button class="icon-button context-chat-action" type="button" data-ask="请查询截至 ${state.date} 的近期${name}记录，结合我的生活记录解释变化。缺少的日期请明确说明。" aria-label="对话解读${name}趋势" title="对话解读${name}趋势">${icon("chat")}</button></div><div class="trend-summary">${[
    [
      "期间平均",
      values.length
        ? Math.round((values.reduce((a, v) => a + v, 0) / values.length) * 10) /
          10
        : null,
    ],
    ["最低", values.length ? Math.min(...values) : null],
    ["最高", values.length ? Math.max(...values) : null],
  ]
    .map(
      ([n, v]) =>
        `<div><span>${n}</span><strong>${formatTrend(v)}${state.trendMetric === "sleep" ? "" : `<small>${unit}</small>`}</strong></div>`,
    )
    .join(
      "",
    )}</div>${loading ? '<div class="chart-loading" role="status"><div class="skeleton-line"></div><p>正在读取历史记录…</p><small>首次查看需要从 Garmin 获取，之后会使用短时缓存。</small></div>' : state.historyStatus === "error" && state.trendMetric !== "bodyBattery" ? `<div class="empty-state" role="alert"><strong>历史数据暂时不可用</strong><p>其他指标和生活记录仍可查看。</p><button class="secondary-btn" type="button" data-history-retry>重新读取</button></div>` : lineChart(rows, { color: def.color, min: state.trendMetric === "bodyBattery" || state.trendMetric === "stress" ? 0 : undefined, max: state.trendMetric === "bodyBattery" || state.trendMetric === "stress" ? 100 : undefined, height: 250, dailyAxis: true, label: name + "近" + state.days + "天趋势" })}<div class="chart-footnote"><span>${loading ? "等待历史数据" : `${values.length} / ${state.days} 天有记录 · 缺失日期不连线`}</span><span>单位：${unit}</span></div>${!loading && values.length ? `<details class="data-table-details"><summary>查看每日数值</summary><div class="data-table-scroll"><table><thead><tr><th>日期</th><th>${name}</th></tr></thead><tbody>${rows.map((p) => `<tr><td>${p.date}</td><td>${formatTrend(p.value)}${present(p.value) && state.trendMetric !== "sleep" ? " " + unit : ""}</td></tr>`).join("")}</tbody></table></div></details>` : ""}</section></div></section>`;
}
function filteredActivities() {
  const rows = state.data?.recentActivities || [];
  return state.activityFilter === "all"
    ? rows
    : rows.filter((a) => a.sport === state.activityFilter);
}
function activity() {
  return trainingCalendar.render();
}
function journal() {
  const groups = new Map();
  for (const entry of state.journalEntries) {
    if (!groups.has(entry.date)) groups.set(entry.date, []);
    groups.get(entry.date).push(entry);
  }
  const body =
    state.journalStatus === "loading"
      ? '<div class="journal-empty" role="status">正在读取生活记录…</div>'
      : state.journalStatus === "error"
        ? '<div class="journal-empty" role="alert"><strong>暂时无法读取记录</strong><p>请稍后重试。</p><button class="secondary-btn" type="button" data-journal-refresh>重新读取</button></div>'
        : groups.size === 0
          ? empty(
              "这个月，还没有留下记录",
              "通过健康对话记下状态、感受或运动后的体验。",
              "journal",
            )
          : [...groups]
              .map(
                ([date, entries]) =>
                  `<section class="journal-day"><div class="journal-day-heading"><strong>${date.slice(8)}</strong><span>${Number(date.slice(5, 7))} 月<small>${weekday(date)}</small></span></div><div class="journal-day-entries">${entries.map((entry) => `<article class="journal-entry"><time datetime="${escapeHtml(entry.created_at)}">${timeLabel(entry.created_at)}</time><p>${escapeHtml(entry.content)}</p><span>本人记录</span></article>`).join("")}</div></section>`,
              )
              .join("");
  return `${heading("个人记录", "按日期回看本人通过应用保存的状态与感受。", `<a class="text-link" href="#trends" data-goto="trends">生理指标 ${icon("arrow")}</a><button class="icon-button context-chat-action" type="button" data-ask="记录 ${state.date} 的状态：" aria-label="对话记录状态" title="对话记录状态">${icon("chat")}</button>`)}<div class="journal-layout"><section class="journal-main"><div class="journal-toolbar"><div class="journal-month-switch"><button class="icon-button previous" type="button" data-journal-month="-1" aria-label="上个月">${icon("chevron")}</button><h2>${state.journalMonth.replace("-", " 年 ")} 月</h2><button class="icon-button" type="button" data-journal-month="1" aria-label="下个月" ${state.journalMonth >= localDate().slice(0, 7) ? "disabled" : ""}>${icon("chevron")}</button></div><span class="caption">${state.journalStatus === "ready" ? state.journalEntries.length + " 条记录" : ""}</span><button class="icon-button" type="button" data-journal-refresh aria-label="刷新生活记录">${icon("refresh")}</button></div><div class="journal-list">${body}</div></section></div>`;
}
function food() { return diet.render(); }
function dietaryGuidelines() {
  const selected = dietaryGuide.selected;
  const content = dietaryGuide.contents.get(selected);
  const body = content
    ? `<article class="dietary-source-markdown">${renderMarkdown(content)}</article>`
    : dietaryGuide.errors.has(selected)
      ? '<div class="dietary-source-state" role="alert">原文暂时无法读取。<button class="secondary-btn" type="button" data-dietary-retry>重试</button></div>'
      : '<div class="dietary-source-state" role="status">正在读取原文…</div>';
  return `<section class="dietary-guide-page"><header class="page-heading"><div><div class="eyebrow">饮食营养 · 参考资料</div><h1>膳食指南</h1><p>阅读公开核心推荐及宏量营养素参考标准原文。</p></div></header><nav class="dietary-source-nav" aria-label="选择参考原文">${Object.entries(dietaryDocuments).map(([key, doc]) => `<button type="button" data-dietary-document="${key}" aria-current="${key === selected ? 'page' : 'false'}">${doc.label}</button>`).join("")}</nav>${selected === "guide" ? '<p class="dietary-source-note">本页收录的是中国营养学会公开的八项核心推荐，并非《中国居民膳食指南（2022）》全书。</p>' : ''}${body}</section>`;
}
async function loadDietaryDocument(key, force = false) {
  const doc = dietaryDocuments[key];
  if (!doc || dietaryGuide.loading.has(key) || (!force && dietaryGuide.contents.has(key))) return;
  dietaryGuide.loading.add(key);
  dietaryGuide.errors.delete(key);
  if (state.page === "dietary_guidelines" && dietaryGuide.selected === key) render();
  try {
    const response = await fetch(doc.path, { cache: "no-store" });
    if (!response.ok) throw Error(`HTTP ${response.status}`);
    dietaryGuide.contents.set(key, await response.text());
  } catch {
    dietaryGuide.errors.add(key);
  } finally {
    dietaryGuide.loading.delete(key);
    if (state.page === "dietary_guidelines" && dietaryGuide.selected === key) render();
  }
}
function renderBotContent(message) {
  return renderChatBlocks(
    message.blocks?.length
      ? message.blocks
      : [{ type: "text", text: message.text }],
  );
}
function renderChatBlocks(blocks, streaming = false) {
  return blocks
    .map((b) =>
      b.type === "tool"
        ? `<div class="chat-tool-row"><span class="chat-tool ${b.state}">${escapeHtml(toolLabels[b.name] || b.name)} · ${b.state === "running" ? "处理中" : b.state === "done" ? "已完成" : b.state === "pending" ? "待核对" : b.state === "stopped" ? "已停止" : "调用失败"}${toolTiming(b)}</span></div>`
        : `<div class="chat-markdown${streaming ? " chat-draft" : ""}">${renderMarkdown(b.text)}</div>`,
    )
    .join("");
}
function renderProgress(progress) {
  return `<div class="chat-progress" role="status"><div class="chat-progress-head"><span class="loading-dot"></span><strong>${escapeHtml(progress.label)}</strong><span class="chat-elapsed">${progress.seconds} 秒</span><button type="button" class="chat-stop" data-stop-chat>停止生成</button></div>${renderChatBlocks(progress.blocks, true)}${progress.blocks.length ? "" : '<div class="chat-waiting">正在整理回答…</div>'}</div>`;
}
const messages = () =>
  state.chats
    .map(
      (message, index) => message.who === "bot"
        ? `<section class="chat-exchange" data-share-scope="pi-answer">${state.chats[index - 1]?.who === "user" ? `<div class="chat-message user" data-share-only>${escapeHtml(state.chats[index - 1].text)}</div>` : ""}<div class="chat-message bot">${renderBotContent(message)}</div><div class="chat-source"><span>健康助手 · 应用解释与建议</span>${HealthShare.button({ title: "健康对话", context: "健康助手" })}</div></section>`
        : `<div class="chat-message user">${escapeHtml(message.text)}</div>`,
    )
    .join("") + (state.chatProgress ? renderProgress(state.chatProgress) : "") + renderPiMeal();
document.addEventListener('change', event => {
  const field = event.target.dataset?.piMealField;
  if (['date', 'time', 'kind'].includes(field)) piMeal[field] = event.target.value;
});
function renderPiMeal() {
  const d = piMeal.draft;
  if (!d) return "";
  return `<section class="pi-meal-draft"><strong>${escapeHtml(d.name || "餐食草稿")}</strong><p>营养为估算，请核对后保存</p>
    ${(d.items || []).map(i => `<p>${escapeHtml(i.name)} · ${escapeHtml(i.portion || "份量待补充")} · ${i.calories == null ? "热量未知" : `${escapeHtml(i.calories)} kcal`}</p>`).join("")}
    <p>${escapeHtml(d.uncertainty || "")}</p>
    <label>日期 <input data-pi-meal-field="date" type="date" value="${escapeHtml(piMeal.date)}"></label>
    <label>时间 <input data-pi-meal-field="time" type="time" value="${escapeHtml(piMeal.time)}"></label>
    <label>餐别 <select data-pi-meal-field="kind">${["早餐", "午餐", "晚餐", "加餐"].map(k => `<option ${piMeal.kind === k ? "selected" : ""}>${k}</option>`).join("")}</select></label>
    <p>可以继续对话修改食物和份量。</p>${piMeal.error ? `<p role="alert">${escapeHtml(piMeal.error)}</p>` : ""}
    <button type="button" class="send-btn" data-pi-meal-save ${piMeal.saving || state.chatPending ? "disabled" : ""}>${piMeal.saving ? "保存中…" : "已核对，保存这餐"}</button></section>`;
}
async function savePiMeal() {
  if (!piMeal.draft || piMeal.saving || state.chatPending) return;
  const d = piMeal.draft;
  piMeal.saving = true; piMeal.error = "";
  updateChatLogs();
  try {
    const response = await fetch('/api/meals', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Meal-Client': 'healthy' }, body: JSON.stringify({
      id: piMeal.id, date: piMeal.date, time: piMeal.time, kind: piMeal.kind,
      name: d.name || '餐食记录', note: d.note || '', items: d.items, nutrition_source: d.nutrition_source || 'model_estimate', nutrition_confirmed: true,
      analysis: d.nutrition_source === 'manual' ? null : { ...d, model: d.model || 'MiniMax-M3', is_food: true },
    }) });
    if (!response.ok) throw Error('保存未完成。请重试；若提示重复，请先到饮食记录核对。');
    piMeal.draft = null; piMeal.id = null;
    state.chats.push({who: 'bot', text: '这餐已保存，可在饮食记录中查看。', include: false});
    if (state.page === 'food') void diet.open();
  } catch (error) { piMeal.error = error.message; }
  finally { piMeal.saving = false; updateChatLogs(); }
}
function renderCompanion() {
  const current = companion.querySelector("textarea");
  if (current && !state.chatPending) state.chatDraft = current.value;

  companion.innerHTML = `<div class="drawer-head"><span class="agent-symbol">${icon("chat")}</span><div><h2>健康对话</h2><small>结合数据，一起理解身体</small></div><button class="icon-button" type="button" data-chat-close aria-label="关闭健康对话">${icon("close")}</button></div><div class="chat-context">${icon("calendar")} 查看日期 <strong>${state.page === "activity" ? trainingCalendar.selected : state.date}</strong>${state.reportContext ? `<span>报告讨论 <button type="button" class="text-link" data-report-context-clear aria-label="结束报告讨论">结束讨论</button></span>` : ""}</div><div class="chat-messages" id="side-chat-messages" role="log" aria-live="polite">${messages()}</div><div class="companion-compose"><form class="chat-compose" data-chat-form><label class="visually-hidden" for="side-chat-input">输入问题</label><textarea id="side-chat-input" name="message" placeholder="问问身体数据，或记录这一天的感受…" maxlength="500" required ${state.chatPending ? "disabled" : ""}>${escapeHtml(state.chatDraft)}</textarea><div class="chat-compose-bottom"><span>${state.chatPending ? "正在接收回答" : "Enter 发送 · Shift + Enter 换行"}</span><button class="send-btn" type="submit" aria-label="发送消息" ${state.chatPending ? "disabled" : ""}>${icon("send")}</button></div></form><p class="chat-disclaimer">AI 回答仅供健康管理参考</p></div>`;
  const log = companion.querySelector("#side-chat-messages");
  log.scrollTop = log.scrollHeight;
  syncOverlays();
}
const factList = (rows) =>
  `<dl class="fact-list">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${escapeHtml(v)}</dd></div>`).join("")}</dl>`;
function renderDetail() {
  destroyLineCharts(drawer);
  if (!state.detail) {
    drawer.innerHTML = "";
    syncOverlays();
    return;
  }
  let name,
    content,
    color = "teal",
    question;
  if (state.detail.startsWith("activity:")) {
    const index = Number(state.detail.split(":")[1]),
      a = (
        state.page === "activity"
          ? filteredActivities()
          : state.data?.recentActivities || []
      )[index];
    if (!a) {
      state.detail = null;
      syncOverlays();
      return;
    }
    name = a.name;
    question = `请查询 ${a.date} 的${a.name}运动记录，结合当时的恢复数据帮我回顾这次运动。`;
    content = `<span class="subtle-tag">${sportName(a.sport)}</span><div class="detail-big-value">${duration(a.durationMinutes)}</div>${factList(
      [
        ["运动日期", a.date + (a.time ? " " + a.time : "")],
        [
          "距离",
          a.distanceKm > 0 ? format(a.distanceKm) + " km" : "未记录有效距离",
        ],
        ["活动消耗", format(a.calories) + " kcal"],
        ["平均心率", format(a.averageHeartRate) + " bpm"],
        ["最高心率", format(a.maxHeartRate) + " bpm"],
        ["累计爬升", format(a.elevationGain) + " m"],
      ],
    )}<p class="detail-note">以上来自实际 Garmin 活动记录；不推断未提供的训练效果。</p>`;
  } else {
    const k = state.detail,
      def = metricDefs[k];
    if (!def) return;
    name = def.name;
    color = def.color;
    question = `请查询 ${state.date} 的${name}数据，解释这项指标及相关背景。请区分佳明反馈和你的建议。`;
    content = `<div class="detail-big-value ${color}">${k === "sleep" ? duration(metricValue(k)) : format(metricValue(k))}<small>${k === "sleep" ? "" : def.unit}</small></div><p class="detail-note">${def.description}</p>`;
    if (k === "bodyBattery")
      content +=
        lineChart(state.data?.batterySeries || [], {
          min: 0,
          max: 100,
          height: 210,
          label: "身体电量日内变化",
        }) +
        factList([
          ["当日最高", format(daily().batteryHigh)],
          ["当日最低", format(daily().batteryLow)],
          ["充电", "+" + format(daily().batteryCharged)],
          ["消耗", format(daily().batteryDrained)],
        ]);
    if (k === "sleep") {
      const s = state.data?.sleep || {};
      content += `<h3>睡眠阶段</h3>${phaseBar(s.stages)}${factList([
        ["佳明睡眠评分", format(analysis().sleepScore) + " / 100"],
        ["入睡", timeLabel(s.start)],
        ["醒来", timeLabel(s.end)],
        ["深睡", duration(s.stages?.deep)],
        ["浅睡", duration(s.stages?.light)],
        ["REM", duration(s.stages?.rem)],
        ["清醒", duration(s.stages?.awake)],
        ["睡眠平均呼吸", format(s.averageRespiration) + " 次/分"],
        ["睡眠平均压力", format(s.averageStress)],
      ])}`;
    }
    if (k === "restingHeartRate")
      content += `<h3>夜间心率</h3>${lineChart(state.data?.sleep?.heartRate || [], { color, height: 210, label: "夜间心率 bpm" })}${factList(
        [
          ["全天最低", format(daily().minHeartRate) + " bpm"],
          ["全天最高", format(daily().maxHeartRate) + " bpm"],
        ],
      )}`;
    if (k === "hrv")
      content +=
        lineChart(state.data?.hrv?.readings || [], {
          color,
          height: 210,
          label: "夜间 HRV ms",
        }) +
        factList([
          ["佳明状态", rawStatus(analysis().hrvStatus) || "暂无"],
          ["7 天平均", format(state.data?.hrv?.weeklyAverage) + " ms"],
          [
            "个人基线",
            present(state.data?.hrv?.baselineLow) &&
            present(state.data?.hrv?.baselineHigh)
              ? `${format(state.data.hrv.baselineLow)}–${format(state.data.hrv.baselineHigh)} ms`
              : "暂无",
          ],
        ]);
    if (k === "stress")
      content += `${phaseBar(daily().stressMinutes, "stress")}${factList([
        ["休息", duration(daily().stressMinutes?.rest)],
        ["低压力", duration(daily().stressMinutes?.low)],
        ["中压力", duration(daily().stressMinutes?.medium)],
        ["高压力", duration(daily().stressMinutes?.high)],
        ["日间平均呼吸", format(daily().respiration) + " 次/分"],
        [
          "血氧",
          present(daily().spo2) ? format(daily().spo2) + "%" : "暂无记录",
        ],
      ])}`;
    if (k === "readiness")
      content += `<h3>佳明恢复因素</h3><div class="detail-factors">${(state.data?.readiness?.factors || []).map((f) => `<div><span>${f.label}</span><strong>${rawStatus(f.feedback) || "暂无评估"}${present(f.percent) ? " · " + format(f.percent) + "%" : ""}</strong>${present(f.percent) ? `<div class="factor-track"><span style="width:${f.percent}%"></span></div>` : ""}</div>`).join("")}</div>${factList(
        [
          ["佳明准备度等级", rawStatus(analysis().readinessLevel) || "暂无"],
          ["剩余恢复时间", duration(state.data?.readiness?.recoveryMinutes)],
          ["急性负荷", format(state.data?.readiness?.acuteLoad)],
        ],
      )}`;
    if (k === "steps")
      content += factList([
        ["佳明步数目标", format(daily().stepGoal) + " 步"],
        ["全天距离", format(daily().distanceKm) + " km"],
        ["活动消耗", format(daily().activeCalories) + " kcal"],
        ["静息消耗", format(daily().restingCalories) + " kcal"],
        ["总消耗", format(daily().calories) + " kcal"],
        ["中等强度分钟", format(daily().moderateMinutes) + " 分钟"],
        ["高强度分钟", format(daily().vigorousMinutes) + " 分钟"],
      ]);
    const feedback =
      k === "sleep"
        ? analysis().sleepFeedback
        : k === "hrv"
          ? analysis().hrvFeedback
          : k === "readiness"
            ? analysis().readinessFeedback
            : null;
    if (feedback)
      content += `<details class="raw-feedback"><summary>佳明原始反馈标识</summary><code>${escapeHtml(feedback)}</code><p>这是接口返回的反馈标识，页面不将其扩写为佳明的健康建议。</p></details>`;
  }
  drawer.innerHTML = `<div class="drawer-head"><span class="metric-symbol ${color}">${icon(metricDefs[state.detail]?.icon || "run")}</span><div><h2>${escapeHtml(name)}</h2><small>Garmin Connect · ${state.date}</small></div><button class="icon-button context-chat-action" type="button" data-ask="${escapeHtml(question)}" aria-label="对话解读这项记录" title="对话解读这项记录">${icon("chat")}</button><button class="icon-button" type="button" data-detail-close aria-label="关闭指标详情">${icon("close")}</button></div><div class="detail-body">${content}<div class="detail-source">读取于 ${state.data?.syncedAt ? new Date(state.data.syncedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false }) : "—"}${state.data?.deviceSyncedAt ? `<br>设备同步于 ${new Date(state.data.deviceSyncedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })}` : ""}</div></div>`;
  mountLineCharts(drawer);
  syncOverlays();
}
function syncOverlays() {
  const open = state.chatOpen || !!state.detail;
  document.getElementById("page-shell").inert = open;
  document.getElementById("overlay-backdrop").hidden = !open;
  document.documentElement.classList.toggle("overlay-open", open);
  document.body.classList.toggle("overlay-open", open);
  for (const [el, active] of [
    [companion, state.chatOpen],
    [drawer, !!state.detail],
  ]) {
    el.inert = !active;
    el.classList.toggle("is-open", active);
    el.setAttribute("aria-hidden", String(!active));
  }
  document
    .getElementById("chat-launcher")
    .setAttribute("aria-expanded", String(state.chatOpen));
}
function render() {
  document.documentElement.dataset.theme = state.theme;
  document.querySelector('meta[name="theme-color"]').content =
    state.theme === "dark" ? "#121b21" : "#f4f6f8";
  document.title = `${pages.find((p) => p[0] === state.page)[1]} · healthy`;
  const currentGroup = navigation.find((group) => group.page === state.page || group.children.some(([id]) => id === state.page)) || navigation[0];
  renderBreadcrumbs(currentGroup);
  const nav = navigation.map((group) => {
    const divider = group.divider ? '<div class="nav-divider" role="separator"></div>' : "";
    return divider + (group.children.length
      ? `<div class="nav-group-label">${group.label}</div>${group.children.map(([id, name, ico]) => `<a href="#${id}" class="nav-btn ${id === state.page ? "active" : ""}" data-goto="${id}" aria-label="${name}" ${id === state.page ? 'aria-current="page"' : ""}>${icon(ico)}<span>${name}</span></a>`).join("")}`
      : `<a href="#${group.page}" class="nav-btn ${group.page === state.page ? "active" : ""}" data-goto="${group.page}" aria-label="${group.label}" ${group.page === state.page ? 'aria-current="page"' : ""}>${icon(group.icon)}<span>${group.label}</span></a>`);
  }).join("");
  document.getElementById("side-nav").innerHTML = nav;
  document.getElementById("mobile-nav").style.gridTemplateColumns =
    `repeat(${navigation.length},minmax(0,1fr))`;
  document.getElementById("mobile-nav").innerHTML = navigation.map((group) => `<a href="#${group.page}" class="nav-btn ${group === currentGroup ? "active" : ""}" data-goto="${group.page}" aria-label="${group.label}" ${group.page === state.page ? 'aria-current="page"' : ""}>${icon(group.icon)}<span>${group.label}</span></a>`).join("");
  const mobileSubnav = currentGroup.children.length ? `<nav class="module-subnav" aria-label="${currentGroup.label}菜单">${currentGroup.children.map(([id, name]) => `<a href="#${id}" data-goto="${id}" ${id === state.page ? 'aria-current="page"' : ""}>${name}</a>`).join("")}</nav>` : "";
  destroyLineCharts(main);
  main.innerHTML = mobileSubnav + ({
    home,
    trends,
    activity_stats: activityStats,
    activity,
    journal,
    food,
    recipes: () => cookbook.render(),
    dietary_guidelines: dietaryGuidelines,
    reports: () => healthReports.render(),
    feedback: () => feedback.render(),
    memory: () => healthMemory.render(),
  }[state.page]());
  mountLineCharts(main);
  if (state.page === "reports") healthReports.mount();
  const synced = state.data?.syncedAt ? timeLabel(state.data.syncedAt) : "";
  document.getElementById("sync-state").innerHTML =
    state.page === "home" && isLoading()
      ? '<span class="cockpit-spinner" role="status" aria-label="读取 Garmin 数据"></span>'
      : `<span class="connection-dot ${state.status === "connected" ? "connected" : isLoading() ? "pending" : "offline"}"></span><span>${isLoading() ? "正在读取 Garmin" : state.status === "connected" ? `Garmin 已连接 <small>· ${synced} 读取</small>` : "Garmin 暂不可用"}</span>`;
  const refresh = document.getElementById("refresh-button");
  refresh.innerHTML = icon("refresh");
  refresh.disabled = state.page === "memory" ? healthMemory.loading : state.page === "feedback" ? feedback.loading : isLoading();
  const refreshLabel = state.page === "memory" ? "刷新记忆" : state.page === "feedback" ? "刷新意见反馈" : "刷新 Garmin 数据";
  refresh.setAttribute("aria-label", refreshLabel);
  refresh.title = refreshLabel;
  const theme = document.getElementById("theme-toggle");
  theme.innerHTML = icon(state.theme === "dark" ? "sun" : "moon");
  theme.setAttribute(
    "aria-label",
    state.theme === "dark" ? "切换浅色主题" : "切换深色主题",
  );
  renderCompanion();
  renderDetail();
}
function renderBreadcrumbs(group) {
  const crumbs = [];
  if (state.page === "reports") {
    crumbs.push({ label: "健康首页", page: "home" });
    crumbs.push({ label: "健康报告", page: "reports" });
    if (healthReports.detail) {
      crumbs[1].action = "report-back";
      crumbs.push({ label: healthReports.detail.title || "报告详情" });
    }
  } else if (state.page === "feedback") {
    crumbs.push({ label: "意见反馈", page: "feedback" });
  } else if (state.page === "home") {
    crumbs.push({ label: "健康首页", page: "home" });
  } else {
    crumbs.push({ label: group.label, children: group.children });
    crumbs.push({ label: pages.find(([id]) => id === state.page)[1], page: state.page });
    if (state.page === "recipes" && cookbook.readRoute().id) {
      crumbs[1].action = "recipe-back";
      crumbs.push({ label: cookbook.recipe?.title || "食谱详情" });
    }
  }
  document.getElementById("breadcrumbs").innerHTML = crumbs.map((crumb, index) => {
    const last = index === crumbs.length - 1;
    const label = escapeHtml(crumb.label);
    const separator = index ? '<span class="crumb-divider" aria-hidden="true">/</span>' : "";
    if (last) return `${separator}<span class="crumb-current" aria-current="page" title="${label}">${label}</span>`;
    if (crumb.children) return `${separator}<details class="crumb-group"><summary>${label}</summary><div class="crumb-menu">${crumb.children.map(([page, name]) => `<a href="#${page}" data-goto="${page}" ${page === state.page ? 'aria-current="page"' : ""}>${escapeHtml(name)}</a>`).join("")}</div></details>`;
    if (crumb.action === "recipe-back") return `${separator}<a href="#recipes" data-recipe-back>${label}</a>`;
    if (crumb.action === "report-back") return `${separator}<a href="#reports" data-rp="back">${label}</a>`;
    return `${separator}<a href="#${crumb.page}" data-goto="${crumb.page}">${label}</a>`;
  }).join("");
}
function writeUrl(push = false) {
  const url = new URL(location.href);
  url.hash = state.page;
  url.searchParams.set("date", state.date);
  url.searchParams.set("days", state.days);
  history[push ? "pushState" : "replaceState"]({}, "", url);
}
function navigate(next, push = true) {
  next = aliases[next] || next;
  if (!pages.some((p) => p[0] === next)) return;
  if (state.page === "feedback" && next !== "feedback") feedback.leave();
  if (state.page === "reports" && next !== "reports") healthReports.leave();
  state.page = next;
  if (push) {
    const url = new URL(location.href);
    for (const key of [
      "recipe",
      "recipe_q",
      "recipe_category",
      "recipe_page",
      "report",
      "revision",
      "dietary_document",
      "training_date",
      "activities_start",
      "activities_end",
      "activities_sport",
      "activities_search",
      "activities_sort",
      "activities_detail",
      "meal_date",
    ])
      url.searchParams.delete(key);
    url.hash = next;
    state.date = localDate();
    state.journalMonth = localDate().slice(0, 7);
    url.searchParams.set("date", state.date);
    url.searchParams.set("days", state.days);
    if (url.href !== location.href) history.pushState({}, "", url);
  }
  if (next === "home") {
    void homeDashboard.open(state.date);
    if (state.data?.date !== state.date) void loadGarmin();
  }
  if (next === "recipes") void cookbook.open();
  if (next === "food") void diet.open();
  render();
  if (next === "dietary_guidelines") void loadDietaryDocument(dietaryGuide.selected);
  if (next === "reports") void healthReports.open();
  if (next === "feedback") void feedback.open();
  if (next === "memory") void healthMemory.load();
  if (next === "activity") void trainingCalendar.open();
  if (next === "activity_stats") void activityJournal.open();
  if (next === "journal" && state.journalStatus === "idle") void loadJournal();
  if (next === "trends") void bodyStatus.open(state.date);
  if (next === "trends" && state.trendMetric !== "bodyBattery")
    void loadTrend();
  window.scrollTo({ top: 0, behavior: "instant" });
  main.focus({ preventScroll: true });
}
function openChat(draft) {
  if (!state.chatOpen) returnFocus = document.activeElement;
  state.detail = null;
  state.chatOpen = true;
  if (draft !== undefined) {
    state.chatDraft = draft;
    const input = companion.querySelector("textarea");
    if (input) input.value = draft;
  }
  renderCompanion();
  renderDetail();
  document.getElementById("side-chat-input")?.focus({ preventScroll: true });
}
function closeOverlay() {
  const wasChat = state.chatOpen;
  state.chatOpen = false;
  state.detail = null;
  if (wasChat) {
    const input = companion.querySelector("textarea");
    if (input) state.chatDraft = input.value;
  }
  syncOverlays();
  if (returnFocus?.isConnected && returnFocus.getClientRects().length)
    returnFocus.focus({ preventScroll: true });
  else
    document.getElementById("chat-launcher")?.focus({ preventScroll: true });
}
function closeChat() {
  closeOverlay();
}
async function loadJournal() {
  const req = ++state.journalRequest,
    month = state.journalMonth,
    [y, n] = month.split("-").map(Number),
    end = new Date(Date.UTC(y, n, 0)).toISOString().slice(0, 10);
  state.journalStatus = "loading";
  if (state.page === "journal") render();
  try {
    const response = await fetch(
      `/api/daily-status?start_date=${month}-01&end_date=${end}`,
      { cache: "no-store" },
    );
    if (!response.ok) throw Error();
    const result = await response.json();
    if (req !== state.journalRequest) return;
    state.journalEntries = Array.isArray(result.entries) ? result.entries : [];
    state.journalStatus = "ready";
  } catch {
    if (req !== state.journalRequest) return;
    state.journalEntries = [];
    state.journalStatus = "error";
  }
  if (state.page === "journal") render();
}
async function loadGarmin(refresh = false) {
  if (state.page === "home") void homeDashboard.open(state.date, refresh);
  const req = ++state.request;
  garminController?.abort();
  garminController = new AbortController();
  historyController?.abort();
  state.historyRequest++;
  state.history = null;
  state.historyStatus = "idle";
  state.status = "loading";
  state.data = null;
  render();
  try {
    const response = await fetch(
      `/api/health/overview?date=${state.date}&days=${state.days}${refresh ? "&refresh=1" : ""}`,
      { cache: "no-store", signal: garminController.signal },
    );
    const result = await response.json();
    if (req !== state.request) return;
    if (!response.ok) {
      state.status = result.error || "error";
      state.data = null;
    } else {
      state.status = "connected";
      state.data = result;
    }
    state.error = response.ok ? null : result.error;
  } catch (error) {
    if (req !== state.request || error.name === "AbortError") return;
    state.status = "error";
    state.error = "network_unavailable";
    state.data = null;
  }
  if (
    state.activityFilter !== "all" &&
    !(state.data?.recentActivities || []).some(
      (a) => a.sport === state.activityFilter,
    )
  )
    state.activityFilter = "all";
  render();
  if (state.page === "trends") void bodyStatus.open(state.date, refresh);
  if (state.page === "trends" && state.trendMetric !== "bodyBattery")
    void loadTrend(refresh);
}
async function loadTrend(refresh = false) {
  const req = ++state.historyRequest;
  historyController?.abort();
  if (state.trendMetric === "bodyBattery") {
    state.history = null;
    state.historyStatus = "idle";
    render();
    return;
  }
  const key = `${state.date}:${state.days}:${state.trendMetric}`;
  const cached = historyCache.get(key);
  if (!refresh && cached && Date.now() - cached.at < 120000) {
    state.history = cached.value;
    state.historyStatus = "ready";
    render();
    return;
  }
  state.history = null;
  state.historyStatus = "loading";
  historyController = new AbortController();
  render();
  try {
    const response = await fetch(
      `/api/health/history?date=${state.date}&days=${state.days}&metric=${state.trendMetric}${refresh ? "&refresh=1" : ""}`,
      { cache: "no-store", signal: historyController.signal },
    );
    if (!response.ok) throw Error();
    const result = await response.json();
    if (req !== state.historyRequest) return;
    state.history = result;
    state.historyStatus = "ready";
    if (historyCache.size >= 30)
      historyCache.delete(historyCache.keys().next().value);
    historyCache.set(key, { at: Date.now(), value: result });
  } catch (e) {
    if (req !== state.historyRequest || e.name === "AbortError") return;
    state.historyStatus = "error";
  }
  if (state.page === "trends") render();
}
function setDate(date) {
  if (!validDate(date) || date > localDate()) return;
  state.date = date;
  writeUrl();
  void loadGarmin();
}
document.addEventListener("click", (e) => {
  if (!e.target.closest(".crumb-group")) document.querySelector(".crumb-group[open]")?.removeAttribute("open");
  const target = e.target.closest("button, a, #overlay-backdrop");
  if (!target) return;
  if (target.closest('[data-pi-meal-save]')) { void savePiMeal(); return; }
  const go = target.closest("[data-goto]");
  if (go) {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(go.dataset.goto);
    return;
  }
  const dietaryDocument = target.closest("[data-dietary-document]");
  if (dietaryDocument) {
    dietaryGuide.selected = dietaryDocument.dataset.dietaryDocument;
    const url = new URL(location.href);
    if (dietaryGuide.selected === "macro") url.searchParams.set("dietary_document", "macro");
    else url.searchParams.delete("dietary_document");
    if (url.href !== location.href) history.pushState({}, "", url);
    render();
    void loadDietaryDocument(dietaryGuide.selected);
    return;
  }
  if (target.closest("[data-dietary-retry]")) {
    void loadDietaryDocument(dietaryGuide.selected, true);
    return;
  }
  if (target.hasAttribute("data-report-context-clear")) { state.reportContext = null; renderCompanion(); return; }
  if (target.id === "theme-toggle") {
    state.theme = state.theme === "dark" ? "light" : "dark";
    try {
      localStorage.setItem("healthy-theme", state.theme);
    } catch {}
    render();
    return;
  }
  if (
    target.id === "overlay-backdrop" ||
    target.hasAttribute("data-chat-close") ||
    target.hasAttribute("data-detail-close")
  ) {
    closeOverlay();
    return;
  }
  if (target.id === "chat-launcher" || target.hasAttribute("data-chat-open")) {
    openChat();
    return;
  }
  if (target.hasAttribute("data-ask")) {
    state.reportContext = null;
    openChat(target.dataset.ask);
    return;
  }
  if (
    target.hasAttribute("data-detail") ||
    target.hasAttribute("data-activity")
  ) {
    returnFocus = target;
    state.detail = target.hasAttribute("data-detail")
      ? target.dataset.detail
      : "activity:" + target.dataset.activity;
    state.chatOpen = false;
    renderDetail();
    drawer.querySelector("button")?.focus({ preventScroll: true });
    return;
  }
  if (target.hasAttribute("data-date-shift")) {
    setDate(shiftDate(state.date, Number(target.dataset.dateShift)));
    return;
  }
  if (target.hasAttribute("data-today")) {
    setDate(localDate());
    return;
  }
  if (target.hasAttribute("data-period")) {
    const days = Number(target.dataset.period);
    if (days === state.days) return;
    state.days = days;
    writeUrl();
    void loadGarmin();
    return;
  }
  if (target.hasAttribute("data-body-group")) { document.getElementById(`bs-group-${target.dataset.bodyGroup}`)?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" }); return; }
  if (target.hasAttribute("data-zepp-sync")) { void bodyStatus.syncZepp(); return; }
  if (target.hasAttribute("data-body-timeline-retry")) { void bodyStatus.loadTimeline(target.dataset.bodyTimelineRetry, true); return; }
  if (target.hasAttribute("data-body-retry")) { void bodyStatus.open(state.date, true); return; }
  if (target.hasAttribute("data-body-trend")) {
    state.trendMetric = target.dataset.bodyTrend;
    void loadTrend();
    document.getElementById("body-history")?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
    main.querySelector(`[data-trend="${state.trendMetric}"]`)?.focus({ preventScroll: true });
    return;
  }
  if (target.hasAttribute("data-trend")) {
    state.trendMetric = target.dataset.trend;
    void loadTrend();
    return;
  }
  if (target.hasAttribute("data-history-retry")) {
    void loadTrend(true);
    return;
  }
  if (target.hasAttribute("data-workouts-toggle")) {
    state.workoutsExpanded = !state.workoutsExpanded;
    render();
    return;
  }
  if (target.hasAttribute("data-sport")) {
    state.activityFilter = target.dataset.sport;
    render();
    return;
  }
  if (target.hasAttribute("data-journal-refresh")) {
    void loadJournal();
    return;
  }
  if (target.hasAttribute("data-journal-month")) {
    const [year, month] = state.journalMonth.split("-").map(Number);
    state.journalMonth = new Date(
      Date.UTC(year, month - 1 + Number(target.dataset.journalMonth), 1),
    )
      .toISOString()
      .slice(0, 7);
    void loadJournal();
    return;
  }
  if (target.hasAttribute("data-stop-chat")) {
    state.chatAbort?.abort();
    return;
  }
  if (target.hasAttribute("data-refresh")) {
    if (state.page === "feedback") { void feedback.load(); return; }
    if (state.page === "memory") { void healthMemory.load(); return; }
    historyCache.clear();
    if (state.page === "activity") void trainingCalendar.load();
    if (state.page === "activity_stats") { activityJournal.detailCache.clear(); void activityJournal.load(); }
    void loadGarmin(true);
  }
});
document.addEventListener("change", (e) => {
  if (e.target.id === "garmin-date") setDate(e.target.value);
});
document.addEventListener("input", (e) => {
  if (e.target.id === "side-chat-input") state.chatDraft = e.target.value;
});
document.addEventListener("submit", (e) => {
  const form = e.target.closest("[data-chat-form]");
  if (!form) return;
  e.preventDefault();
  const question = form.elements.message.value.trim();
  if (question) {
    state.chatDraft = "";
    form.elements.message.value = "";
    void sendMessage(question);
  }
});
document.addEventListener("toggle", (e) => {
  if (!e.target.matches?.("[data-bs-details]")) return;
  if (e.target.open) bodyStatus.expanded.add(e.target.dataset.bsDetails);
  else bodyStatus.expanded.delete(e.target.dataset.bsDetails);
}, true);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && (state.chatOpen || state.detail)) {
    closeOverlay();
    return;
  }
  if (e.key === "Tab" && (state.chatOpen || state.detail)) {
    const el = state.chatOpen ? companion : drawer,
      focusable = [
        ...el.querySelectorAll(
          'button:not(:disabled),textarea:not(:disabled),a[href],summary,[tabindex="0"]',
        ),
      ];
    const first = focusable[0],
      last = focusable.at(-1);
    if (
      e.shiftKey &&
      (document.activeElement === first || !el.contains(document.activeElement))
    ) {
      e.preventDefault();
      last?.focus();
    } else if (
      !e.shiftKey &&
      (document.activeElement === last || !el.contains(document.activeElement))
    ) {
      e.preventDefault();
      first?.focus();
    }
  }
  if (
    e.target.matches("[data-chat-form] textarea") &&
    e.key === "Enter" &&
    !e.shiftKey &&
    !e.isComposing
  ) {
    e.preventDefault();
    e.target.closest("form").requestSubmit();
  }
});
function restoreUrl() {
  const page = aliases[location.hash.slice(1)] || location.hash.slice(1),
    q = new URLSearchParams(location.search),
    date = q.get("date");
  const changed = validDate(date) && date <= localDate() && date !== state.date;
  dietaryGuide.selected = q.get("dietary_document") === "macro" ? "macro" : "guide";
  const days = q.get("days") === "30" ? 30 : 7,
    changedDays = days !== state.days;
  if (changed) state.date = date;
  state.days = days;
  const trainingDate = q.get("training_date");
  if (trainingCalendar.validDate(trainingDate) && trainingDate !== trainingCalendar.selected) trainingCalendar.select(trainingDate);
  navigate(page, false);
  if (changed || changedDays) void loadGarmin();
}
window.addEventListener("popstate", restoreUrl);
// Native hash links (brand and skip link) also remain usable without JavaScript navigation.
window.addEventListener("hashchange", () => {
  const next = location.hash.slice(1);
  if (next === "app-main") return;
  if (next !== state.page) restoreUrl();
});
function updateChatLogs() {
  for (const id of ["side-chat-messages"]) {
    const log = document.getElementById(id);
    if (!log) continue;
    const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 80;
    log.innerHTML = messages();
    if (atBottom) log.scrollTop = log.scrollHeight;
  }
}
function createMealId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // LAN HTTP pages have getRandomValues, but randomUUID requires a secure context.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
function chatErrorMessage(code) {
  const errors = {
    chat_not_configured:
      "MiniMax 尚未配置。请在项目根目录的本地 .env 中设置 MINIMAX_CN_API_KEY，并更新 API 服务。",
    garmin_unavailable:
      "Garmin MCP 尚未配置或当前不可用，请先确认 Garmin 服务状态。",
    chat_unavailable:
      "对话请求失败。请查看 API 服务日志以确认模型或 Garmin MCP 的具体错误。",
  };
  return (
    errors[code] ||
    "无法连接本机 API 服务。请确认服务已启动并打开正确的本地网页地址。"
  );
}
async function sendMessage(question) {
  if (state.chatPending) return;
  state.chats.push({ who: "user", text: question });
  let trainingChanged = false;
  state.chatPending = true;
  state.chatProgress = { label: "正在连接", seconds: 0, blocks: [] };
  state.chatAbort = new AbortController();
  render();
  const started = Date.now();
  const timer = setInterval(() => {
    if (!state.chatProgress) return;
    state.chatProgress.seconds = Math.floor((Date.now() - started) / 1000);
    document.querySelectorAll(".chat-elapsed").forEach((element) => {
      element.textContent = `${state.chatProgress.seconds} 秒`;
    });
  }, 1000);
  const messagesForApi = state.chats
    .filter(
      (message) =>
        (message.who === "user" || message.who === "bot") &&
        message.include !== false,
    )
    .map((message) => ({
      role: message.who === "bot" ? "assistant" : "user",
      ...(message.meal_draft ? { meal_draft: message.meal_draft } : {}),
      content:
        message.who === "bot" ? message.text.slice(0, 500) : message.text,
    }))
    .slice(-12);
  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/x-ndjson",
      },
      body: JSON.stringify({
        messages: messagesForApi,
        ...(state.reportContext ? { report_context: state.reportContext } : {}),
        date:
          state.page === "activity" ? trainingCalendar.selected : state.date,
      }),
      signal: state.chatAbort.signal,
    });
    if (!response.ok) {
      const result = await response.json();
      throw new Error(result.error || "chat_unavailable");
    }
    if (!response.body) throw new Error("chat_unavailable");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let complete = false;
    let statusSaved = false;
    const handleLine = (line) => {
      if (!line.trim()) return;
      const event = JSON.parse(line);
      const progress = state.chatProgress;
      if (!progress) return;
      if (event.type === "status") progress.label = event.label;
      if (event.type === "text") {
        const last = progress.blocks.at(-1);
        if (last?.type === "text") last.text += event.delta;
        else progress.blocks.push({ type: "text", text: event.delta });
        progress.label = "正在生成回答";
      }
      if (event.type === "tool_start") {
        if (event.tool === "schedule_workout") trainingChanged = true;
        progress.blocks.push({
          type: "tool",
          name: event.tool,
          state: "running",
        });
        progress.label = event.tool === "record_meal" ? "正在识别餐食与联网核对" :
          event.tool === "create_workout"
            ? "正在创建佳明训练"
            : event.tool === "schedule_workout"
              ? "正在写入佳明日历"
              : event.tool === "record_daily_status"
                ? "正在保存每日状态"
                : event.tool === "get_daily_status"
                  ? "正在读取每日状态"
                  : `正在读取 Garmin ${toolLabels[event.tool] || "数据"}`;
      }
      if (event.type === "tool_end") {
        const tool = [...progress.blocks]
          .reverse()
          .find(
            (item) =>
              item.type === "tool" &&
              item.name === event.tool &&
              item.state === "running",
          );
        if (tool) {
          tool.state = event.success ? event.verified === false ? "pending" : "done" : "failed";
          tool.durationMs = event.durationMs;
        }
        if (event.tool === "schedule_workout" && event.success)
          trainingChanged = true;
        if (event.tool === "record_daily_status" && event.success)
          statusSaved = true;
        progress.label = "正在整理查询结果";
      }
      if (event.type === "meal_draft") {
        if (!piMeal.id) {
          piMeal.id = createMealId(); piMeal.date = state.date;
          piMeal.time = new Intl.DateTimeFormat('en-GB', {timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hour12: false}).format(new Date());
        }
        if (event.draft?.copied_from && !piMeal.draft?.copied_from) piMeal.id = createMealId();
        if (event.draft?.date) piMeal.date = event.draft.date;
        if (event.draft?.time) piMeal.time = event.draft.time;
        piMeal.draft = event.draft;
        if (['早餐', '午餐', '晚餐', '加餐'].includes(event.draft?.kind)) piMeal.kind = event.draft.kind;
      }
      if (event.type === "error") throw new Error(event.error);
      if (event.type === "done") {
        const blocks = progress.blocks.map((block) => ({ ...block }));
        if (!blocks.some((block) => block.type === "text"))
          blocks.push({ type: "text", text: event.answer });
        state.chats.push({ who: "bot", text: event.answer, blocks, ...(piMeal.draft ? {meal_draft: piMeal.draft} : {}) });
        state.chatProgress = null;
        complete = true;
      }
      updateChatLogs();
    };
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline;
      while ((newline = buffer.indexOf("\n")) !== -1) {
        handleLine(buffer.slice(0, newline));
        buffer = buffer.slice(newline + 1);
      }
    }
    if (!complete) throw new Error("chat_unavailable");
    if (statusSaved && state.page === "journal") void loadJournal();
  } catch (error) {
    if (error.name === "AbortError") {
      const blocks =
        state.chatProgress?.blocks.map((block) => ({ ...block })) || [];
      for (const block of blocks)
        if (block.type === "tool" && block.state === "running")
          block.state = "stopped";
      blocks.push({ type: "text", text: "*已停止生成，以上为未完成的回答。*" });
      state.chats.push({
        who: "bot",
        text: "已停止生成。",
        blocks,
        include: false,
      });
    } else {
      state.chats.push({
        who: "bot",
        text: chatErrorMessage(error.message),
        include: false,
      });
    }
  } finally {
    clearInterval(timer);
    state.chatProgress = null;
    state.chatAbort = null;
    state.chatPending = false;
    if (trainingChanged) {
      trainingCalendar.active = null;
      void trainingCalendar.load();
    }
    render();
    if (state.chatOpen) document.querySelector("#side-chat-input")?.focus({ preventScroll: true });
  }
}
state.journalMonth = state.date.slice(0, 7);
writeUrl();
if (state.page === "reports") void healthReports.open();
else void healthReports.load(false, true);
if (state.page === "recipes") void cookbook.open();
if (state.page === "food") void diet.open();
if (state.page === "activity") void trainingCalendar.open();
if (state.page === "activity_stats") void activityJournal.open();
if (state.page === "dietary_guidelines") void loadDietaryDocument(dietaryGuide.selected);
void loadGarmin();
if (state.page === "journal") void loadJournal();

if(state.page === "feedback")void feedback.open();
if(state.page === "memory")void healthMemory.load();
document.addEventListener("click", event => { if (event.target.closest("[data-memory-refresh]")) void healthMemory.load(); });
