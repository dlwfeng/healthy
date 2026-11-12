/* Meal journal: saved intake and application reference ranges, never Garmin analysis. */
const MEAL_METRICS = [
  { key: 'calories', label: '热量', unit: 'kcal' },
  { key: 'protein_g', label: '蛋白质', unit: 'g' },
  { key: 'carbs_g', label: '碳水', unit: 'g' },
  { key: 'fat_g', label: '脂肪', unit: 'g' },
];
const MEAL_NUTRIENT_KEYS = MEAL_METRICS.map(metric => metric.key);
const MEAL_MACROS = MEAL_METRICS.filter(metric => metric.key !== 'calories');
const MEAL_ENERGY_SERIES = [
  { key: 'intake', label: '摄入' },
  { key: 'expenditure', label: '消耗' },
  { key: 'deficit', label: '缺口' },
];

function mealEnergyDeficit(intake, complete, expenditure) {
  return Number.isFinite(intake) && complete && Number.isFinite(expenditure) && expenditure >= 0 ? expenditure - intake : null;
}

function mealEnergyRows(days, entries, points) {
  const expenditure = new Map(points.map(point => [point.date, point.value]));
  return days.map(day => {
    const summary = summarizeDayMeals(entries.filter(meal => meal.date === day));
    const intake = summary.totals.calories.value;
    const raw = expenditure.get(day);
    const consumed = Number.isFinite(raw) && raw >= 0 ? raw : null;
    const partial = intake !== null && summary.totals.calories.complete_meals !== summary.meals;
    return { day, intake, expenditure: consumed, partial,
      deficit: mealEnergyDeficit(intake, !partial, consumed) };
  });
}

// Each missing day starts a new segment; never imply data across an unsynced date.
function mealLineSegments(rows, key, x, y) {
  let drawing = false;
  return rows.map((row, i) => {
    if (!Number.isFinite(row[key])) { drawing = false; return ''; }
    const point = `${drawing ? 'L' : 'M'}${x(i)},${y(row[key])}`;
    drawing = true;
    return point;
  }).filter(Boolean).join(' ');
}
const MEAL_ICONS = {
  sunrise: '<path d="M12 2v6m-7.1 2.9 4.2 4.2m10-4.2-4.2 4.2M2 18h20M4 22h16M8 18a4 4 0 0 1 8 0"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  sunset: '<path d="M12 10v6m-7.1-2.9 4.2-4.2m10 4.2-4.2-4.2M2 18h20M4 22h16M8 18a4 4 0 0 1 8 0"/>',
  moon: '<path d="M20.5 14.4A8.6 8.6 0 0 1 9.6 3.5 8.7 8.7 0 1 0 20.5 14.4Z"/>',
  food: '<path d="M4 3v8a3 3 0 0 0 3 3h1v7M7 3v8M10 3v8m7-8v18m0-18c4 3 5 7 0 10"/>'
};
const MEAL_ACTION_ICONS = {
  refresh: '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 7a7 7 0 0 1 12-1l2 3M4 15l2 3a7 7 0 0 0 12-1"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
};
const mealActionIcon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${MEAL_ACTION_ICONS[name]}</svg>`;

function renderMealIcon(name) {
  return `<svg class="meal-kind-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${MEAL_ICONS[name] || MEAL_ICONS.food}</svg>`;
}

function mealTimeIcon(time) {
  if (!time || typeof time !== 'string') return renderMealIcon('food');
  const hour = parseInt(time.split(':')[0], 10);
  if (Number.isNaN(hour)) return renderMealIcon('food');
  if (hour >= 5 && hour < 11) return renderMealIcon('sunrise');
  if (hour >= 11 && hour < 17) return renderMealIcon('sun');
  if (hour >= 17 && hour < 21) return renderMealIcon('sunset');
  return renderMealIcon('moon');
}
const mealEscape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const mealNumber = value => Number.isFinite(value) ? Math.round(value * 10) / 10 : null;
const mealRange = range => range ? `${mealNumber(range.min)}-${mealNumber(range.max)}` : null;

function getMealMonth(date) {
  const month = date.slice(0, 7);
  const count = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
  const days = Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
  return { month, start: days[0], end: days.at(-1), days };
}

function getMealWeek(end) {
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(`${end}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() - 6 + i);
    return date.toISOString().slice(0, 10);
  });
}

function weekdayLabel(date) {
  return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][new Date(`${date}T12:00:00Z`).getUTCDay()];
}

function timeDiffMinutes(start, end) {
  const minutes = time => { const [h, m] = time.split(':').map(Number); return h * 60 + m; };
  return minutes(end) - minutes(start);
}

function formatMinutes(minutes) {
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return `${h ? `${h} 小时` : ''}${h && m ? ' ' : ''}${m ? `${m} 分钟` : ''}` || '0 分钟';
}

function summarizeDayMeals(entries) {
  const totals = Object.fromEntries(MEAL_NUTRIENT_KEYS.map(key => [key, { value: null, complete_meals: 0 }]));
  for (const meal of entries) {
    for (const key of MEAL_NUTRIENT_KEYS) {
      const items = meal.items || [];
      const known = items.map(item => item[key]).filter(Number.isFinite);
      if (known.length) totals[key].value = (totals[key].value ?? 0) + known.reduce((a, b) => a + b, 0);
      if (items.length && known.length === items.length) totals[key].complete_meals++;
    }
  }
  for (const total of Object.values(totals)) total.value = mealNumber(total.value);
  return { meals: entries.length, totals };
}

// Never turn a missing value or an unclassified estimate into a positive judgment.
function mealMetricState({ value, complete, range, status }) {
  if (!Number.isFinite(value)) return { kind: 'unknown', symbol: '', text: '未记录' };
  if (!complete) return { kind: 'unknown', symbol: '*', text: '部分合计' };
  if (!range) return { kind: 'unknown', symbol: '', text: '暂无参考' };
  return {
    low: { kind: 'low', symbol: '↓', text: '低于参考' },
    high: { kind: 'high', symbol: '↑', text: '高于参考' },
    within: { kind: 'within', symbol: '✓', text: '参考内' },
  }[status] || { kind: 'unknown', symbol: '?', text: '待核对' };
}

function mealMetricModels(assessment) {
  return Object.fromEntries(MEAL_METRICS.map(({ key }) => [key, {
    ...assessment.totals[key],
    range: key === 'calories' ? assessment.mealEnergy : assessment.macroAmounts[key].range,
    status: key === 'calories' ? assessment.energyStatus : assessment.macroAmounts[key].status,
  }]));
}

function mealComparisonMarkup(metrics, { compact = false } = {}) {
  return `<span class="meal-metrics ${compact ? 'is-compact' : ''}">${MEAL_METRICS.map(({ key, label, unit }) => {
    const metric = metrics[key], state = mealMetricState(metric);
    const value = key === 'calories' && Number.isFinite(metric.value) ? Math.round(metric.value) : mealNumber(metric.value);
    const range = metric.range;
    const description = `${label} ${value ?? '未记录'} ${value === null ? '' : unit}，${state.text}${range ? `，参考 ${mealRange(range)} ${unit}` : ''}`;
    // A shared 0–150% scale keeps the upper reference bound in the same place.
    // Outliers stop at the end of the track; their exact value remains visible.
    const scale = range?.max > 0 ? range.max * 1.5 : null;
    const comparison = scale && state.kind !== 'unknown' ? `<span class="meal-range-plot" aria-hidden="true"><span class="meal-range-band" style="left:${range.min / scale * 100}%;width:${(range.max - range.min) / scale * 100}%"></span><i class="meal-range-point" style="left:${Math.min(100, value / scale * 100)}%"></i></span>` : '<span class="meal-range-unavailable" aria-hidden="true"></span>';
    return `<span class="meal-metric is-${state.kind}" data-meal-metric="${key}" title="${mealEscape(description)}" aria-label="${mealEscape(description)}">
      <span class="meal-metric-label">${label}<small>${unit}</small></span>
      <span class="meal-metric-reading"><strong>${value ?? '<span class="meal-missing">未记录</span>'}</strong><span class="meal-metric-state" aria-hidden="true">${state.symbol}</span></span>
      ${comparison}
      <span class="meal-metric-reference">${range ? `${mealRange(range)} <small>${unit}</small>` : '暂无参考'}</span>
    </span>`;
  }).join('')}</span>`;
}

class MealJournal {
  constructor({ onChange, today }) {
    Object.assign(this, { onChange, today, status: 'idle', request: 0, profile: {}, profileStatus: 'loading', rawEntries: [], dailyMap: {}, trendEntries: [], trendDays: [], trendStatus: 'idle', selectedMealId: null, trendActiveMetric: null,
      trendView: 'energy', energyPoints: [], energyStatus: 'idle', energyRequest: 0, energyDay: null, hiddenEnergy: new Set(),
      photoUrls: [], photoIndex: 0, photoTrigger: null, photoTrack: null, photoDialogBound: false });
    document.addEventListener('click', event => this.handleClick(event));
    document.addEventListener('keydown', event => this.handleKeydown(event));
  }

  handleClick(event) {
    const target = event.target;
    const photo = target.closest('[data-meal-photo]');
    if (photo) {
      event.preventDefault();
      event.stopPropagation();
      this.openPhoto(photo);
      return;
    }
    if (target.closest('[data-photo-close]')) { this.closePhoto(); return; }
    if (target.closest('[data-photo-prev]')) { this.movePhoto(-1); return; }
    if (target.closest('[data-photo-next]')) { this.movePhoto(1); return; }
    if (target.closest('[data-photo-zoom]')) { this.togglePhotoZoom(); return; }
    const view = target.closest('[data-meal-trend-view]');
    const energyDay = target.closest('[data-meal-energy-day]');
    const series = target.closest('[data-meal-energy-series]');
    if (view || energyDay || series) {
      if (view) {
        this.trendView = view.dataset.mealTrendView;
        if (this.trendView === 'energy' && this.energyStatus === 'idle') void this.loadEnergy();
      }
      if (energyDay) {
        const day = energyDay.dataset.mealEnergyDay;
        this.energyDetailVisible = this.energyDay !== day || !this.energyDetailVisible;
        this.energyDay = day;
      }
      if (series) {
        const key = series.dataset.mealEnergySeries;
        this.hiddenEnergy.has(key) ? this.hiddenEnergy.delete(key) : this.hiddenEnergy.add(key);
      }
      this.updateTrend(view || energyDay || series);
      return;
    }
    if (target.closest('[data-meal-energy-retry]')) { void this.loadEnergy(true); return; }
    const trendSelect = target.closest('[data-meal-trend-select]');
    if (trendSelect) {
      const clicked = trendSelect.dataset.mealTrendSelect;
      this.trendActiveMetric = this.trendActiveMetric === clicked ? null : clicked;
      this.updateTrend(trendSelect);
      return;
    }
    const meal = target.closest('[data-meal-select]');
    if (meal) { event.preventDefault(); this.selectMeal(meal.dataset.mealSelect); return; }
    const shift = target.closest('[data-meal-month-shift]');
    if (shift || target.closest('[data-meal-month-today]')) {
      const date = new Date(`${this.baseDate.slice(0, 7)}-01T12:00:00Z`);
      if (shift) date.setUTCMonth(date.getUTCMonth() + Number(shift.dataset.mealMonthShift));
      const url = new URL(location.href);
      url.searchParams.set('meal_date', shift ? date.toISOString().slice(0, 10) : this.today());
      history.pushState({}, '', url);
      void this.open();
      return;
    }
    if (target.closest('[data-meal-refresh]')) void this.open(true);
  }

  updateTrend(target) {
    const panel = document.getElementById?.('meal-trend');
    if (!panel) return;
    const attr = ['data-meal-trend-view', 'data-meal-energy-day', 'data-meal-energy-series', 'data-meal-trend-select'].find(name => target?.hasAttribute(name));
    const value = attr ? target.getAttribute(attr) : null;
    const scope = target?.closest('.meal-trend-legend') ? '.meal-trend-legend ' : target?.closest('.meal-energy-dates') ? '.meal-energy-dates ' : '';
    panel.innerHTML = this.renderTrend();
    if (attr) panel.querySelector(`${scope}[${attr}="${value}"]`)?.focus({ preventScroll: true });
  }

  syncEnergyLayout() {
    const plot = document.querySelector('.meal-energy-plot');
    if (this.observedEnergyPlot !== plot) {
      this.energyResizeObserver?.disconnect();
      this.observedEnergyPlot = plot;
      if (plot && typeof ResizeObserver !== 'undefined') {
        this.energyResizeObserver ||= new ResizeObserver(() => this.syncEnergyLayout());
        this.energyResizeObserver.observe(plot);
      }
    }
    if (!plot) return;
    const { width, height } = plot.getBoundingClientRect();
    if (!width || !height) return;
    if (Math.abs((this.energyPlotSize?.width || 0) - width) < .5 && Math.abs((this.energyPlotSize?.height || 0) - height) < .5) return;
    this.energyPlotSize = { width, height };
    const focused = document.activeElement?.closest('#meal-trend') ? document.activeElement : null;
    this.updateTrend(focused);
  }

  async loadEnergy(force = false) {
    const end = this.trendDays.at(-1);
    if (!end) return;
    const request = ++this.energyRequest;
    this.energyStatus = 'loading';
    this.energyPoints = [];
    this.updateTrend();
    try {
      const earliest = this.rawEntries.map(meal => meal.date).sort()[0];
      const ends = [end];
      if (earliest && (Date.parse(end) - Date.parse(earliest)) / 86400000 >= 30) ends.push(earliest);
      const results = await Promise.allSettled(ends.map(async (date, index) => {
        const response = await fetch(`/api/health/history?metric=calories&date=${date}&days=${index ? 7 : 30}${force ? '&refresh=1' : ''}`, { cache: 'no-store' });
        if (!response.ok) throw Error();
        const data = await response.json();
        if (!Array.isArray(data.points)) throw Error();
        return data.points;
      }));
      if (request !== this.energyRequest) return;
      this.energyPoints = [...new Map(results.filter(r => r.status === 'fulfilled').flatMap(r => r.value).map(point => [point.date, point])).values()];
      this.energyStatus = results.some(r => r.status === 'rejected') ? 'error' : 'ready';
    } catch {
      if (request !== this.energyRequest) return;
      this.energyStatus = 'error';
    }
    this.onChange();
    this.updateTrend();
  }

  selectMeal(id) {
    if (!this.rawEntries.some(entry => entry.id === id)) return;
    this.selectedMealId = this.selectedMealId === id ? null : id;
    document.querySelectorAll('[data-meal-entry]').forEach(entry => {
      entry.open = entry.dataset.mealEntry === this.selectedMealId;
    });
  }

  photoDialog() {
    const dialog = document.getElementById?.('meal-photo-viewer');
    if (!dialog) return null;
    if (!this.photoDialogBound) {
      this.photoDialogBound = true;
      this.photoTrack = dialog.querySelector('[data-photo-track]');
      this.photoTrack?.addEventListener('scroll', () => this.syncPhotoIndex());
      dialog.addEventListener('close', () => {
        dialog.classList.remove('is-zoomed');
        this.photoUrls = [];
        this.photoIndex = 0;
        this.photoTrack?.replaceChildren();
        this.photoTrigger?.focus?.({ preventScroll: true });
        this.photoTrigger = null;
        this.updatePhotoChrome();
      });
    }
    return dialog;
  }

  openPhoto(trigger) {
    const holder = trigger.closest('[data-photo-urls]');
    if (!holder) return;
    let urls;
    try {
      urls = JSON.parse(holder.dataset.photoUrls || '[]');
    } catch {
      return;
    }
    if (!Array.isArray(urls) || !urls.length) return;
    const dialog = this.photoDialog();
    if (!dialog) return;
    this.photoTrigger = trigger;
    this.photoUrls = urls;
    this.photoIndex = Math.max(0, Math.min(urls.length - 1, Number(trigger.dataset.mealPhoto) || 0));
    this.photoTrack.innerHTML = urls.map((url, index) =>
      `<figure class="meal-photo-viewer-slide" data-photo-slide="${index}"><img src="${mealEscape(url)}" alt="餐食照片 ${index + 1}" draggable="false"></figure>`
    ).join('');
    dialog.classList.remove('is-zoomed');
    this.updatePhotoChrome();
    if (!dialog.open) dialog.showModal();
    requestAnimationFrame(() => this.scrollToPhoto(this.photoIndex, false));
    this.photoTrack.focus({ preventScroll: true });
  }

  closePhoto() {
    document.getElementById?.('meal-photo-viewer')?.close();
  }

  movePhoto(delta) {
    const dialog = document.getElementById?.('meal-photo-viewer');
    if (dialog?.classList.contains('is-zoomed')) {
      dialog.classList.remove('is-zoomed');
      dialog.querySelectorAll('[data-photo-slide]').forEach(slide => { slide.scrollTop = 0; slide.scrollLeft = 0; });
      this.updatePhotoChrome();
    }
    if (!this.photoUrls.length) return;
    const next = Math.max(0, Math.min(this.photoUrls.length - 1, this.photoIndex + delta));
    if (next === this.photoIndex) return;
    this.photoIndex = next;
    this.updatePhotoChrome();
    this.scrollToPhoto(next);
  }

  scrollToPhoto(index, smooth = true) {
    const track = this.photoTrack;
    if (!track) return;
    const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    track.scrollTo({ left: index * track.clientWidth, behavior: smooth && !reduceMotion ? 'smooth' : 'auto' });
  }

  syncPhotoIndex() {
    const track = this.photoTrack;
    if (!track || !this.photoUrls.length) return;
    const index = Math.max(0, Math.min(this.photoUrls.length - 1, Math.round(track.scrollLeft / (track.clientWidth || 1))));
    if (index === this.photoIndex) return;
    this.photoIndex = index;
    this.updatePhotoChrome();
  }

  updatePhotoChrome() {
    const dialog = document.getElementById?.('meal-photo-viewer');
    if (!dialog) return;
    const total = this.photoUrls.length;
    const zoomed = dialog.classList.contains('is-zoomed');
    const count = dialog.querySelector('[data-photo-count]');
    const prev = dialog.querySelector('[data-photo-prev]');
    const next = dialog.querySelector('[data-photo-next]');
    const zoom = dialog.querySelector('[data-photo-zoom]');
    if (count) count.textContent = total > 1 ? `${this.photoIndex + 1} / ${total}` : '餐食照片';
    if (prev) prev.hidden = total < 2 || this.photoIndex <= 0;
    if (next) next.hidden = total < 2 || this.photoIndex >= total - 1;
    if (zoom) {
      zoom.setAttribute('aria-pressed', String(zoomed));
      zoom.setAttribute('aria-label', zoomed ? '缩小照片' : '放大照片');
      zoom.title = zoomed ? '缩小照片' : '放大照片';
    }
  }

  togglePhotoZoom() {
    const dialog = document.getElementById?.('meal-photo-viewer');
    if (!dialog?.open) return;
    dialog.classList.toggle('is-zoomed');
    if (!dialog.classList.contains('is-zoomed')) {
      dialog.querySelectorAll('[data-photo-slide]').forEach(slide => { slide.scrollTop = 0; slide.scrollLeft = 0; });
    }
    this.updatePhotoChrome();
  }

  handleKeydown(event) {
    const dialog = document.getElementById?.('meal-photo-viewer');
    if (!dialog?.open) return;
    if (event.key === 'Escape') { event.stopImmediatePropagation(); return; }
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.movePhoto(event.key === 'ArrowLeft' ? -1 : 1);
  }

  async loadProfile(force = false) {
    if (this.profileRequest || (!force && this.profileStatus === 'ready')) return;
    this.profileRequest = (async () => {
      try {
        const response = await fetch('/api/nutrition-profile', { cache: 'no-store' });
        if (!response.ok) throw Error();
        const data = await response.json();
        this.profile = data.status === 'ready' && data.profile ? { age: data.profile.age_band, sex: data.profile.sex } : {};
        this.profileStatus = data.status;
      } catch { this.profile = {}; this.profileStatus = 'error'; }
      this.onChange();
    })().finally(() => { this.profileRequest = null; });
    return this.profileRequest;
  }

  async open(force = false) {
    void this.loadProfile(force);
    const value = new URLSearchParams(location.search).get('meal_date') || this.today();
    const valid = /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
    const date = valid && value <= this.today() ? value : this.today();
    const previousSelection = this.baseDate?.slice(0, 7) === date.slice(0, 7) ? this.selectedMealId : null;
    this.baseDate = date;
    this.monthInfo = getMealMonth(date);
    this.trendDays = getMealWeek(this.monthInfo.end < this.today() ? this.monthInfo.end : this.today());
    this.status = this.trendStatus = 'loading';
    ++this.energyRequest;
    this.energyStatus = 'idle';
    this.energyPoints = [];
    this.energyDay = null;
    this.energyDetailVisible = false;
    this.trendActiveMetric = null;
    const request = ++this.request;
    this.onChange();
    const read = async (start, end) => {
      const response = await fetch(`/api/meals?start_date=${start}&end_date=${end}`, { cache: 'no-store' });
      if (!response.ok) throw Error();
      return (await response.json()).entries || [];
    };
    const monthRequest = read(this.monthInfo.start, this.monthInfo.end);
    const weekRequest = this.trendDays[0] >= this.monthInfo.start ? monthRequest : read(this.trendDays[0], this.trendDays.at(-1));
    const [month, week] = await Promise.allSettled([monthRequest, weekRequest]);
    if (request !== this.request) return;
    this.trendEntries = week.status === 'fulfilled' ? week.value : [];
    this.trendStatus = week.status === 'fulfilled' ? 'ready' : 'error';
    if (month.status === 'fulfilled') {
      this.rawEntries = month.value;
      this.dailyMap = Object.fromEntries(this.monthInfo.days.map(day => [day, summarizeDayMeals(this.rawEntries.filter(meal => meal.date === day))]));
      this.selectedMealId = this.rawEntries.some(meal => meal.id === previousSelection) ? previousSelection : null;
      this.status = 'ready';
    } else { this.rawEntries = []; this.selectedMealId = null; this.status = 'error'; }
    this.onChange();
    void this.loadEnergy(force);
  }

  dayMetrics(entries) {
    const metrics = NutritionReference.assessDay(summarizeDayMeals(entries), this.profile).metrics;
    // A daily sum must not hide an inconsistent estimate in an individual meal.
    if (entries.some(meal => NutritionReference.assess(meal, this.profile).energyMismatch)) {
      for (const metric of Object.values(metrics)) metric.status = 'unknown';
    }
    return metrics;
  }

  render() {
    const today = this.today();
    const header = `<header class="page-heading meal-page-heading"><div><div class="eyebrow">TODAY <span>· ${weekdayLabel(today)}</span></div><h1>饮食记录</h1><p>回顾每一天的饮食与营养记录。</p></div><a class="text-link" href="#recipes" data-goto="recipes">食谱推荐 →</a></header>`;
    let body;
    if (this.status === 'idle' || this.status === 'loading') {
      body = `<div class="meal-loading" role="status"><span class="sr-only">正在读取饮食记录</span><div class="meal-skeleton meal-skeleton-chart"></div><div class="meal-skeleton"></div></div>`;
    } else {
      const timeline = this.status === 'error' ? '<div class="meal-state" role="alert"><h2>读取失败</h2><button class="secondary-btn" type="button" data-meal-refresh>重试</button></div>' : this.renderTimeline();
      body = `<section id="meal-trend" data-share-scope="nutrition-trend" class="meal-trend-panel" aria-label="近七天饮食对比">${this.renderTrend()}</section><div class="meal-journal-toolbar">${this.renderMonthToolbar()}<button class="icon-button" type="button" data-meal-refresh aria-label="刷新饮食记录" title="刷新饮食记录">${mealActionIcon('refresh')}</button></div>${timeline}`;
    }
    return `<section class="meal-journal">${header}<div class="meal-journal-body">${body}</div></section>`;
  }

  renderMonthToolbar() {
    const month = this.monthInfo.month;
    return `<div class="meal-month-toolbar"><div class="meal-month-switch"><button class="icon-button previous" type="button" data-meal-month-shift="-1" aria-label="上个月">${mealActionIcon('chevron')}</button><h2>${Number(month.slice(0, 4))} 年 ${Number(month.slice(5))} 月</h2><button class="icon-button" type="button" data-meal-month-shift="1" aria-label="下个月" ${month >= this.today().slice(0, 7) ? 'disabled' : ''}>${mealActionIcon('chevron')}</button></div>${month !== this.today().slice(0, 7) ? '<button class="secondary-btn" type="button" data-meal-month-today>本月</button>' : ''}</div>`;
  }

  renderTrend() {
    if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(() => this.syncEnergyLayout());
    const short = day => `${Number(day.slice(5, 7))}/${Number(day.slice(8))}`;
    const head = `<div class="meal-trend-heading"><div class="meal-trend-title"><h2>近 7 天</h2><span>${this.trendDays.length ? `${short(this.trendDays[0])}–${short(this.trendDays.at(-1))}` : ''}</span></div><div class="share-inline-actions">${HealthShare.button({ title: this.trendView === 'energy' ? '近七天热量趋势' : '近七天营养趋势', context: `${this.trendDays[0] || ''} — ${this.trendDays.at(-1) || ''}`, disabled: this.trendStatus !== 'ready' || (this.trendView === 'energy' && this.energyStatus === 'loading') })}<div class="meal-trend-switch" role="group" aria-label="趋势视图">${[['nutrition', '营养'], ['energy', '热量']].map(([key, label]) => `<button type="button" data-meal-trend-view="${key}" aria-pressed="${this.trendView === key}">${label}</button>`).join('')}</div></div></div>`;
    if (this.trendStatus === 'error') return `${head}<div class="meal-trend-empty" role="alert">暂时无法读取近 7 天数据<button class="secondary-btn" type="button" data-meal-refresh>重试</button></div>`;
    return head + (this.trendView === 'energy' ? this.renderEnergyTrend() : this.renderNutritionTrend());
  }

  renderNutritionTrend() {
    const models = this.trendDays.map(day => ({ day, metrics: this.dayMetrics(this.trendEntries.filter(meal => meal.date === day)) }));
    const activeKey = this.trendActiveMetric;
    const range = activeKey ? models[0]?.metrics[activeKey]?.range : null;
    const values = models.flatMap(model => MEAL_MACROS.map(({ key }) => model.metrics[key].value)).filter(Number.isFinite);
    const peak = Math.max(0, ...values, range?.max || 0) * 1.15;
    const tickStep = Math.max(25, Math.ceil(peak / 4 / 25) * 25);
    const yMax = Math.max(tickStep * 2, Math.ceil(peak / tickStep) * tickStep);
    const ticks = [];
    for (let value = 0; value <= yMax; value += tickStep) ticks.push(value);
    const axis = `<span class="meal-energy-unit">g</span><div class="meal-chart-y-axis" aria-hidden="true">${ticks.map(value => `<span style="bottom:${value / yMax * 100}%">${value}</span>`).join('')}</div>`;
    const grid = ticks.map(value => `<span class="meal-chart-tick" style="bottom:${value / yMax * 100}%"></span>`).join('');
    const band = range ? `<span class="meal-chart-band" data-meal-metric="${activeKey}" style="bottom:${range.min / yMax * 100}%;height:${(range.max - range.min) / yMax * 100}%"></span>` : '';
    const columns = models.map(({ day, metrics }) => {
      const bars = MEAL_MACROS.map(({ key, label }) => {
        const m = metrics[key];
        if (!Number.isFinite(m.value)) return '';
        const title = `${label} ${mealNumber(m.value)} g${!m.complete ? '，部分合计' : ''}`;
        return `<button type="button" class="meal-chart-bar ${!m.complete ? 'is-partial' : ''} ${key === activeKey ? 'is-active' : ''}" data-meal-metric="${key}" data-meal-trend-select="${key}" style="height:${m.value / yMax * 100}%" aria-label="${day}，${title}" title="${title}"><span class="meal-chart-bar-tooltip"><strong>${mealNumber(m.value)}</strong><small>g</small></span></button>`;
      }).join('');
      const label = day === this.today() ? '今天' : `${Number(day.slice(5, 7))}/${Number(day.slice(8))}`;
      return `<div class="meal-chart-column" role="group" aria-label="${day}，${this.trendEntries.filter(meal => meal.date === day).length} 餐"><div class="meal-chart-plot">${bars ? `<div class="meal-chart-bar-group">${bars}</div>` : '<span class="meal-chart-no-data" aria-hidden="true">·</span>'}</div><span class="meal-chart-date ${day === this.today() ? 'is-today' : ''}">${label}</span></div>`;
    }).join('');
    const legend = `<div class="meal-trend-legend" role="group" aria-label="营养指标参考">${MEAL_MACROS.map(({ key, label }) => `<button type="button" data-meal-metric="${key}" data-meal-trend-select="${key}" aria-pressed="${key === activeKey}" class="${key === activeKey ? 'is-active' : ''}"><i></i>${label}</button>`).join('')}</div>`;
    return `<div class="meal-trend-toolbar">${legend}</div><div class="meal-trend-chart"${activeKey ? ` data-active-metric="${activeKey}"` : ''} role="group" aria-label="近七天营养摄入柱状图，单位克">${axis}<div class="meal-chart-grid">${grid}${band}</div>${columns}</div><div class="meal-trend-status">${range ? `参考 ${mealRange(range)} g` : ''}</div>`;
  }

  renderEnergyTrend() {
    const rows = mealEnergyRows(this.trendDays, this.trendEntries, this.energyPoints);
    const selected = rows.find(row => row.day === this.energyDay) || [...rows].reverse().find(row => row.intake !== null || row.expenditure !== null) || rows.at(-1);
    if (!selected) return '';
    const keys = MEAL_ENERGY_SERIES.filter(({ key }) => !this.hiddenEnergy.has(key));
    const values = rows.flatMap(row => keys.map(({ key }) => row[key])).filter(Number.isFinite);
    const step = Math.max(250, Math.ceil((Math.max(0, ...values) - Math.min(0, ...values)) / 4 / 250) * 250);
    const min = Math.floor(Math.min(0, ...values) / step) * step;
    const max = Math.max(min + step * 2, Math.ceil(Math.max(0, ...values) / step) * step);
    // Draw in real CSS pixels. Never scale a fixed SVG canvas to a differently shaped container.
    const { width = 700, height = 300 } = this.energyPlotSize || {};
    const x = i => Number(((i + .5) * width / 7).toFixed(2));
    const y = value => Number((height * (max - value) / (max - min)).toFixed(2));
    const ticks = [];
    for (let value = min; value <= max; value += step) ticks.push(value);
    const grid = ticks.map(value => `<line class="${value === 0 ? 'is-zero' : ''}" x1="0" x2="${width}" y1="${y(value)}" y2="${y(value)}"/>`).join('');
    const paths = keys.map(({ key }) => `<g data-energy-series="${key}"><path d="${mealLineSegments(rows, key, x, y)}"/></g>`).join('');
    // HTML dots retain a consistent size across viewport changes.
    const dots = keys.map(({ key }) => rows.map((row, i) => Number.isFinite(row[key]) ? `<i aria-hidden="true" data-energy-series="${key}" class="meal-energy-dot ${this.energyDetailVisible && row.day === selected.day ? 'is-selected' : ''} ${row.day === this.today() || (key === 'intake' && row.partial) ? 'is-provisional' : ''}" style="left:${x(i) / width * 100}%;top:${y(row[key]) / height * 100}%"></i>` : '').join('')).join('');
    const plotMessage = values.length ? '' : `<span class="meal-energy-plot-message">${this.hiddenEnergy.size === 3 ? '选择图例显示曲线' : this.energyStatus === 'loading' ? '正在读取热量数据…' : '这 7 天暂无可用热量数据'}</span>`;
    const balance = value => value < 0 ? `盈余 ${Math.round(Math.abs(value))}` : `缺口 ${Math.round(value)}`;
    const reading = (row, key) => !Number.isFinite(row[key]) ? '—' : key === 'deficit' ? balance(row[key]) : Math.round(row[key]).toLocaleString('zh-CN');
    const dayDescription = row => `${row.day}，摄入 ${reading(row, 'intake')}，消耗 ${reading(row, 'expenditure')}，${reading(row, 'deficit')}，单位 kcal`;
    const info = '消耗来自 Garmin；摄入来自饮食记录。估算缺口 = 总消耗 − 摄入，负值为盈余。漏记会使缺口偏大；热量未填全不计算缺口；今天截至当前。缺失日期不连线。';
    const legend = `<div class="meal-energy-toolbar meal-trend-toolbar"><div class="meal-trend-legend meal-energy-legend" role="group" aria-label="显示或隐藏热量曲线">${MEAL_ENERGY_SERIES.map(({ key, label }) => `<button type="button" data-meal-energy-series="${key}" data-energy-series="${key}" aria-pressed="${!this.hiddenEnergy.has(key)}"><i></i>${label}</button>`).join('')}</div><button class="meal-energy-info" type="button" aria-label="热量数据说明" popovertarget="meal-energy-help">i</button><div id="meal-energy-help" class="meal-energy-help" data-share-note popover>${info}</div></div>`;
    const tooltip = row => `<span class="meal-energy-tooltip"><strong>${row.day.slice(5).replace('-', '/')}<small>kcal${row.day === this.today() ? ' · 今日暂估' : row.partial ? ' · 部分记录' : ''}</small></strong>${MEAL_ENERGY_SERIES.map(({ key, label }) => `<span data-energy-series="${key}">${key === 'deficit' && row.deficit < 0 ? '盈余' : label}<b>${key === 'deficit' && Number.isFinite(row[key]) ? Math.round(Math.abs(row[key])).toLocaleString('zh-CN') : reading(row, key)}</b></span>`).join('')}</span>`;
    const dateButtons = rows.map(row => `<button type="button" data-meal-energy-day="${row.day}" aria-pressed="${!!this.energyDetailVisible && row.day === selected.day}" aria-label="${dayDescription(row)}">${row.day === this.today() ? '今天' : `${Number(row.day.slice(5, 7))}/${Number(row.day.slice(8))}`}</button>`).join('');
    const state = this.energyStatus === 'loading' ? '<span role="status">同步中…</span>' : this.energyStatus === 'error' ? '<span role="alert">消耗暂不可用 <button type="button" data-meal-energy-retry>重试</button></span>' : '';
    return `${legend}<div class="meal-energy-chart" role="group" aria-label="近七天摄入、消耗与热量缺口折线图，单位千卡"><span class="meal-energy-unit">kcal</span><div class="meal-energy-axis" aria-hidden="true">${ticks.map(value => `<span style="top:${y(value) / height * 100}%">${value.toLocaleString('zh-CN')}</span>`).join('')}</div><div class="meal-energy-plot"><svg viewBox="0 0 ${width} ${height}" aria-hidden="true"><g class="meal-energy-grid">${grid}</g>${paths}</svg>${dots}${plotMessage}<div class="meal-energy-hit-targets">${rows.map(row => `<button type="button" tabindex="-1" class="${this.energyDetailVisible && row.day === selected.day ? 'is-selected' : ''}" data-meal-energy-day="${row.day}" aria-label="${dayDescription(row)}">${tooltip(row)}</button>`).join('')}</div></div><div class="meal-energy-dates">${dateButtons}</div></div><div class="meal-energy-source meal-trend-status">${state}</div>`;
  }

  renderDayEnergy(day, meals) {
    const row = mealEnergyRows([day], meals, this.energyPoints)[0];
    const info = '总消耗 − 已记录摄入；漏记会使缺口偏大，热量未填全不计算。今天截至当前。';
    return `<div class="meal-day-energy"><div><span>总消耗</span><strong>${row.expenditure === null ? '—' : Math.round(row.expenditure).toLocaleString('zh-CN')} <small>kcal</small></strong></div><div title="${info}"><span>${row.deficit !== null && row.deficit < 0 ? '热量盈余' : '热量缺口'}</span><strong>${row.deficit === null ? '—' : Math.round(Math.abs(row.deficit)).toLocaleString('zh-CN')} <small>kcal</small></strong></div></div>`;
  }

  renderTimeline() {
    const days = this.monthInfo.days.slice().reverse().filter(day => this.dailyMap[day]?.meals);
    if (!days.length) return '<div class="meal-state" role="status"><h2>本月暂无饮食记录</h2></div>';
    return `<div class="meal-continuous-timeline">${days.map(day => {
      const meals = this.rawEntries.filter(meal => meal.date === day).sort((a, b) => b.time.localeCompare(a.time));
      return `<section data-share-scope="meal-day" class="meal-day-section" id="meal-day-${day}" aria-label="${day} 饮食记录"><header class="meal-day-summary"><div class="meal-day-date"><h2><strong>${Number(day.slice(8))}</strong><span>${Number(day.slice(5, 7))} 月</span></h2><span>${day === this.today() ? '今天' : weekdayLabel(day)}<small>${meals.length} 餐</small></span></div>${mealComparisonMarkup(this.dayMetrics(meals))}${HealthShare.button({ title: `${day} 饮食记录`, context: day })}</header>${this.renderDayEnergy(day, meals)}<div class="meal-day-meals">${meals.map((meal, i) => this.renderMealRow(meal, i + 1 < meals.length ? timeDiffMinutes(meals[i + 1].time, meal.time) : 0)).join('')}</div></section>`;
    }).join('')}</div>`;
  }

  renderMealRow(meal, gap = 0) {
    const e = mealEscape, assessment = NutritionReference.assess(meal, this.profile);
    const photoUrls = Array.isArray(meal.photo_urls) && meal.photo_urls.length ? meal.photo_urls : (meal.photo_url ? [meal.photo_url] : []);
    const photo = photoUrls.length
      ? `<button type="button" class="meal-photo-open" data-meal-photo="0" aria-label="查看餐食照片${photoUrls.length > 1 ? `，共 ${photoUrls.length} 张` : ''}"><img src="${e(photoUrls[0])}" alt="" loading="lazy" width="96" height="96"></button>`
      : `<span class="meal-photo-placeholder" aria-hidden="true">${e(meal.kind.slice(0, 1))}</span>`;
    const photoAttr = photoUrls.length ? ` data-photo-urls="${e(JSON.stringify(photoUrls))}"` : '';
    const gapLabel = gap > 0 ? ` title="距上一餐 ${formatMinutes(gap)}"` : '';
    const timeIcon = mealTimeIcon(meal.time);
    const itemsText = meal.items?.length ? meal.items.map(i => e(i.name)).join('、') : '';
    const mainTitle = meal.name && meal.name !== meal.kind ? e(meal.name) : e(meal.kind);
    const subTitle = itemsText || (meal.note ? e(meal.note) : '未记录食物明细');
    const metaRow = `<span class="meal-summary-meta"><span class="meal-kind-icon" aria-hidden="true">${timeIcon}</span><time${gapLabel}>${e(meal.time)}</time></span>`;
    return `<details data-share-scope="meal" class="meal-entry" data-meal-entry="${e(meal.id)}"${photoAttr} ${this.selectedMealId === meal.id ? 'open' : ''}><summary class="meal-summary-row" data-meal-select="${e(meal.id)}"><span class="meal-summary-overview"><span class="meal-summary-photo">${photo}</span><span class="meal-summary-title">${metaRow}<span class="meal-summary-heading"><strong>${mainTitle}</strong></span><span class="meal-summary-sub">${subTitle}</span></span></span>${mealComparisonMarkup(mealMetricModels(assessment), { compact: true })}<span class="meal-entry-toggle" aria-hidden="true"></span></summary><div class="meal-entry-detail"><div class="meal-single-share">${HealthShare.button({ title: meal.name || meal.kind, context: `${meal.date} · ${meal.time}` })}</div>${this.renderMealDetail(meal)}</div></details>`;
  }

  renderMealDetail(meal) {
    if (!meal) return '<div class="meal-detail-empty"><span class="meal-empty-mark" aria-hidden="true">餐</span><h2>每一餐，都看得清</h2><p>选择一餐，查看每种食物的营养贡献。</p></div>';
    const e = mealEscape, assessment = NutritionReference.assess(meal, this.profile), metrics = mealMetricModels(assessment);
    const photoUrls = Array.isArray(meal.photo_urls) && meal.photo_urls.length ? meal.photo_urls : (meal.photo_url ? [meal.photo_url] : []);
    const foodTable = meal.items.length ? `<div class="meal-table-scroll" role="region" aria-label="食物营养明细，可横向滚动" tabindex="0"><table class="meal-food-table"><caption class="sr-only">每种食物的营养记录与本餐参考上限对比；非单种食物推荐量</caption><thead><tr><th scope="col">食物 / 份量</th>${MEAL_METRICS.map(({ key, label, unit }) => `<th scope="col" data-meal-metric="${key}"><span>${label}</span><small>${unit}</small></th>`).join('')}</tr></thead><tbody>${meal.items.map(item => `<tr><th scope="row"><strong>${e(item.name)}</strong><small>${e(item.portion || '份量未填')}</small></th>${MEAL_METRICS.map(({ key, label, unit }) => {
      const value = mealNumber(item[key]), upper = metrics[key].range?.max;
      if (value === null) return `<td data-meal-metric="${key}"><span class="meal-table-missing">未填</span></td>`;
      const percent = upper ? Math.round(value / upper * 100) : null;
      const high = upper && value > upper;
      const title = `${item.name}，${label} ${value} ${unit}${upper ? `，占本餐参考上限 ${percent}%` : '，暂无参考'}${high ? '，单项已高于本餐上限' : ''}`;
      return `<td data-meal-metric="${key}" title="${e(title)}"><span class="meal-food-amount ${high ? 'is-high' : ''}" aria-label="${e(title)}">${value}<small>${high ? '↑' : ''}</small></span>${upper ? `<span class="meal-food-track ${high ? 'is-high' : ''}" aria-hidden="true"><span style="width:${Math.min(100, percent)}%"></span><i></i></span>` : ''}</td>`;
    }).join('')}</tr>`).join('')}</tbody><tfoot><tr><th scope="row">合计</th>${MEAL_METRICS.map(({ key }) => `<td data-meal-metric="${key}">${mealNumber(metrics[key].value) ?? '未填'}${!metrics[key].complete && metrics[key].value !== null ? '*' : ''}</td>`).join('')}</tr></tfoot></table></div>` : '<p class="meal-note">这餐还没有食物明细。</p>';
    const note = meal.note || meal.analysis?.uncertainty ? `<section class="meal-extra" aria-label="备注与估算依据">${meal.note ? `<div class="meal-extra-row"><h4>备注</h4><p>${e(meal.note)}</p></div>` : ''}${meal.analysis?.uncertainty ? `<div class="meal-extra-row"><h4>估算依据</h4><p>${e(meal.analysis.uncertainty)}</p></div>` : ''}</section>` : '';
    const gallery = photoUrls.length > 1
      ? `<div class="meal-gallery" role="group" aria-label="餐食全部照片，点击查看大图">${photoUrls.map((u, i) => `<button type="button" class="meal-photo-button" data-meal-photo="${i}" aria-label="查看第 ${i + 1} 张照片，共 ${photoUrls.length} 张"><img src="${e(u)}" alt="第 ${i + 1} 张照片" loading="lazy" width="96" height="96"></button>`).join('')}</div>`
      : '';
    return `<div class="meal-detail">${gallery}${foodTable}${assessment.energyMismatch ? '<p class="meal-assessment-warning">热量与营养素估算不一致，暂不判断高低。</p>' : ''}${note}</div>`;
  }

}

if (typeof module !== 'undefined') module.exports = { getMealMonth, getMealWeek, summarizeDayMeals, mealMetricState, mealMetricModels, mealComparisonMarkup, MealJournal, mealEnergyDeficit, mealEnergyRows, mealLineSegments };
