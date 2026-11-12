/* 生理指标页：一屏看结论，细节收进“其他指标”。
   数据来源分两层：Zepp 体脂秤提供体重与体成分，Garmin 提供恢复、负荷与运动能力。 */
class BodyStatus {
  constructor({ onChange, helpers }) {
    this.onChange = onChange;
    this.h = helpers;
    this.date = null;
    this.data = null;
    this.status = 'idle';
    this.timelines = {};
    this.timelineStatus = {};
    this.expanded = new Set();
    this.request = 0;
    this.zepp = { status: 'idle', data: null, syncing: false, error: null };
  }

  async open(date, refresh = false) {
    if (this.date === date && !refresh && this.status !== 'error') return;
    const token = ++this.request;
    this.date = date;
    this.data = null;
    this.timelines = {};
    this.timelineStatus = {};
    this.status = 'loading';
    this.onChange();
    void this.loadZepp();
    try {
      const response = await fetch(`/api/health/body-status?date=${date}${refresh ? '&refresh=1' : ''}`);
      if (!response.ok) throw Error();
      const result = await response.json();
      if (token !== this.request) return;
      this.data = result;
      this.status = 'ready';
      this.onChange();
      for (const metric of ['floors', 'intensity', 'hrv']) {
        if (token !== this.request) return;
        await this.loadTimeline(metric, refresh, token);
      }
    } catch {
      if (token === this.request) {
        this.status = 'error';
        this.onChange();
      }
    }
  }

  async loadZepp(days = 365) {
    this.zepp = { ...this.zepp, status: this.zepp.data ? 'ready' : 'loading', error: null };
    this.onChange();
    try {
      const response = await fetch(`/api/body/measurements?days=${days}`);
      if (!response.ok) throw Error();
      this.zepp = { ...this.zepp, status: 'ready', data: await response.json(), error: null };
    } catch {
      this.zepp = { ...this.zepp, status: 'error', error: 'read_failed' };
    }
    this.onChange();
  }

  async syncZepp() {
    if (this.zepp.syncing) return;
    this.zepp = { ...this.zepp, syncing: true, error: null };
    this.onChange();
    try {
      const response = await fetch('/api/body/measurements/sync', { method: 'POST' });
      const body = await response.json().catch(() => ({}));
      this.zepp = { ...this.zepp, syncing: false, error: response.ok ? null : body.error || 'sync_failed' };
      await this.loadZepp();
    } catch {
      this.zepp = { ...this.zepp, syncing: false, error: 'sync_failed' };
      this.onChange();
    }
  }

  async loadTimeline(metric, refresh = false, token = this.request) {
    if (!['floors', 'intensity', 'hrv'].includes(metric)) return;
    this.timelineStatus[metric] = 'loading';
    this.onChange();
    try {
      const response = await fetch(`/api/health/body-status/timeline?date=${this.date}&metric=${metric}${refresh ? '&refresh=1' : ''}`);
      if (!response.ok) throw Error();
      const result = await response.json();
      if (token !== this.request) return;
      this.timelines[metric] = result;
      this.timelineStatus[metric] = result.unavailable?.length === result.points.length ? 'error' : 'ready';
    } catch {
      if (token !== this.request) return;
      this.timelineStatus[metric] = 'error';
    }
    this.onChange();
  }

  render(date, base) {
    const { icon, escapeHtml: e, format: f, duration, lineChart } = this.h;
    const data = this.date === date ? this.data || {} : {};
    const s = base || {};
    const d = s.daily || {};
    const m = s.metrics || {};
    const a = s.analysis || {};
    const present = (v) => typeof v === 'number' && Number.isFinite(v);
    const zepp = this.zepp.data || null;
    const daily = Array.isArray(zepp?.daily) ? zepp.daily : [];
    // 页面可选历史日期：体重与体成分取该日期当天或之前最近的一次记录。
    const today = this.h.today?.() || date;
    const picked = daily.findIndex((row) => row.date <= date);
    const latest = picked >= 0 ? daily[picked] : date >= today ? zepp?.latest || null : null;
    const previousRow = picked >= 0 ? daily[picked + 1] || null : null;
    const garminWeight = data.weight || {};

    // ---- 体重与体成分 ----
    const weight = present(latest?.weightKg) ? Number(latest.weightKg) : present(garminWeight.value) ? Number(garminWeight.value) : null;
    const weightSource = present(latest?.weightKg) ? 'Zepp 体脂秤' : present(garminWeight.value) ? 'Garmin Connect' : null;
    const weightAt = present(latest?.weightKg) ? latest.measuredAt : null;
    const numbers = (rows, key) => rows.map((row) => row[key]).filter((v) => typeof v === 'number' && Number.isFinite(v));
    const fixed = (v, digits) => new Intl.NumberFormat('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v);
    // 量程端点按整数显示，避免出现 5.0–40.0 这种噪声；坐标轴不加千分位，窄屏也能放下
    const axisText = (v) => new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1, useGrouping: false }).format(v);
    const earlier = previousRow ? previousRow.weightKg : null;
    const delta = typeof earlier === 'number' && present(weight) ? Math.round((weight - earlier) * 10) / 10 : null;
    const goal = present(garminWeight.goal) ? Number(garminWeight.goal) : null;
    const localDate = (iso) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date(iso));
    const localTime = (iso) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
    const shortDate = (iso) => `${Number(String(localDate(iso)).slice(5, 7))} 月 ${Number(String(localDate(iso)).slice(8, 10))} 日`;

    const trendRows = daily.filter((row) => row.date <= date).slice().reverse().map((row) => ({ date: row.date, value: Number(row.weightKg) }));
    const spark = trendRows.length > 1
      ? lineChart(trendRows, { color: 'cyan', height: 84, compact: true, dailyAxis: true, label: '体重变化' })
      : '';

    const deltaChip = present(delta)
      ? Math.abs(delta) < 0.05
        ? '<span class="bsv-delta flat">与上次持平</span>'
        : `<span class="bsv-delta ${delta > 0 ? 'up' : 'down'}">${delta > 0 ? '↑' : '↓'} ${Math.abs(delta).toFixed(1)} kg<span>较上次</span></span>`
      : '';

    const goalChip = present(goal) && present(weight)
      ? `<span class="bsv-goal">目标 ${f(goal)} kg · 还差 ${Math.abs(weight - goal).toFixed(1)} kg</span>`
      : '';

    const score = present(latest?.bodyScore) ? Number(latest.bodyScore) : null;
    const scoreRing = present(score)
      ? `<div class="bsv-score" style="--score:${Math.max(0, Math.min(100, score))}"><svg viewBox="0 0 120 120" aria-hidden="true"><circle class="track" cx="60" cy="60" r="52"/><circle class="value" cx="60" cy="60" r="52" pathLength="100" stroke-dasharray="${Math.max(0, Math.min(100, score))} 100"/></svg><strong>${f(score)}</strong><small>身体评分</small></div>`
      : '';

    const fitnessAge = present(data.fitnessAge?.value) ? data.fitnessAge : null;
    const seconds = [
      present(latest?.bodyFatPct) ? ['体脂', `${f(latest.bodyFatPct)}%`] : null,
      present(latest?.muscleRatePct) ? ['肌肉', `${f(latest.muscleRatePct)}%`] : null,
      fitnessAge ? ['身体年龄', `${f(fitnessAge.value)} 岁`] : null,
    ].filter(Boolean);

    // 体成分：固定量程 + 合理区间带，像体脂秤应用那样一眼看出落在哪。
    // 体脂、体水分、内脏脂肪用公开的健康区间；肌肉率、骨量、基础代谢按性别、年龄、身高体重估算。
    const profile = zepp?.profile || null;
    const sexMale = profile?.sex === 'male';
    const ageYears = profile ? Number(profile.ageYears) : null;
    const hasProfile = profile && Number.isFinite(ageYears);
    const heightCm = present(latest?.heightCm) ? Number(latest.heightCm) : null;
    const round = (v, digits = 0) => Math.round(v * 10 ** digits) / 10 ** digits;

    const bodyFatBand = (() => {
      if (!hasProfile) return null;
      if (sexMale) return ageYears < 40 ? [8, 19] : ageYears < 60 ? [11, 21] : [13, 24];
      return ageYears < 40 ? [21, 32] : ageYears < 60 ? [23, 33] : [24, 35];
    })();
    // 肌肉率取体脂秤常见的性别区间；偏高于区间不算异常，偏低才提示。
    const muscleBand = hasProfile ? (sexMale ? [40, 60] : [35, 50]) : null;
    // 骨量随体重分档（男 60/75 kg、女 45/60 kg 为界），在参考均值上下浮动 0.3 kg。
    const boneBand = (() => {
      if (!hasProfile || !present(weight)) return null;
      const average = sexMale
        ? (weight < 60 ? 2.5 : weight <= 75 ? 2.9 : 3.2)
        : (weight < 45 ? 1.8 : weight <= 60 ? 2.2 : 2.5);
      return [round(average - 0.3, 2), round(average + 0.3, 2)];
    })();
    // 基础代谢用 Mifflin-St Jeor 按本人的身高体重年龄估算，浮动 ±10%。
    const bmrBand = (() => {
      if (!hasProfile || !present(weight) || !heightCm) return null;
      const expected = 10 * weight + 6.25 * heightCm - 5 * ageYears + (sexMale ? 5 : -161);
      return [Math.round(expected * 0.9), Math.round(expected * 1.1)];
    })();

    const compositionSpecs = [
      { key: 'bodyFatPct', label: '体脂率', unit: '%', digits: 1, domain: [5, 40], band: bodyFatBand },
      { key: 'muscleRatePct', label: '肌肉率', unit: '%', digits: 1, domain: [30, 70], band: muscleBand, higherBetter: true },
      { key: 'bodyWaterPct', label: '体水分', unit: '%', digits: 1, domain: [35, 70], band: [50, 65] },
      { key: 'boneMassKg', label: '骨量', unit: 'kg', digits: 2, domain: [1.5, 5], band: boneBand, higherBetter: true },
      { key: 'visceralFat', label: '内脏脂肪', unit: '级', digits: 0, domain: [1, 20], band: [1, 9], visceral: true },
      { key: 'basalMetabolismKcal', label: '基础代谢', unit: 'kcal', digits: 0, domain: [800, 2500], band: bmrBand, higherBetter: true },
    ];

    const composition = compositionSpecs.map(({ key, label, unit, digits, domain, band, visceral, higherBetter }) => {
      const value = typeof latest?.[key] === 'number' ? latest[key] : null;
      if (value === null) return null;
      const values = numbers(daily, key);
      const low = values.length ? Math.min(...values) : value;
      const high = values.length ? Math.max(...values) : value;
      const previous = previousRow && typeof previousRow[key] === 'number' ? previousRow[key] : null;
      const change = previous === null ? null : Math.round((value - previous) * 10 ** digits) / 10 ** digits;

      const [lo, hi] = domain;
      const clamp = (n) => Math.max(0, Math.min(100, n));
      const percent = (n) => clamp(((n - lo) / (hi - lo)) * 100);
      const pos = percent(value);
      const bandStart = band ? percent(band[0]) : 0;
      const bandEnd = band ? percent(band[1]) : 100;
      const bandWidth = Math.max(1.5, bandEnd - bandStart);

      const zones = band
        ? `${bandStart > 0.5 ? `<span class="bsv-axis-zone" style="width:${bandStart}%"></span>` : ''}
           ${bandEnd < 99.5 ? `<span class="bsv-axis-zone high" style="left:${bandEnd}%"></span>` : ''}
           <span class="bsv-axis-band" style="left:${bandStart}%;width:${bandWidth}%"></span>`
        : '';

      // 有区间就与区间比，没有再退回自身历史；偏低/偏高是否算风险按指标方向判断。
      let verdict;
      if (band) {
        if (visceral) verdict = value > band[1] ? '偏高' : '标准';
        else if (higherBetter) verdict = value < band[0] ? '偏低' : '标准';
        else verdict = value < band[0] ? '偏低' : value > band[1] ? '偏高' : '标准';
      } else if (high > low) {
        const ratio = (value - low) / (high - low);
        verdict = ratio < 0.34 ? '偏下' : ratio > 0.66 ? '偏上' : '居中';
      } else {
        verdict = null;
      }
      const tone = verdict === '标准' || verdict === '居中' ? 'ok' : verdict === null ? '' : 'warn';
      const centerLabel = band
        ? `合理 ${axisText(band[0])}–${axisText(band[1])}`
        : '自身';
      const rangeText = band ? `参考区间 ${axisText(band[0])}–${axisText(band[1])}` : `自身近一年 ${fixed(low, digits)}–${fixed(high, digits)}`;

      return `<div class="bsv-tile" data-bsv-metric="${key}">
        <div class="bsv-tile-head"><span>${label}</span>${verdict ? `<em class="${tone}">${verdict}</em>` : ''}</div>
        <div class="bsv-tile-value">${fixed(value, digits)}<small>${unit}</small>${present(change) && change !== 0 ? `<i class="${change > 0 ? 'up' : 'down'}">${change > 0 ? '+' : ''}${fixed(change, digits)}</i>` : ''}</div>
        <div class="bsv-axis" role="img" aria-label="${label} ${fixed(value, digits)} ${unit}，${rangeText}">
          <span class="bsv-axis-track">${zones}<i class="bsv-axis-mark" style="left:${pos}%"></i></span>
          <span class="bsv-axis-labels"><small>${axisText(lo)}</small><small>${centerLabel}</small><small>${axisText(hi)}</small></span>
        </div>
        <p class="bsv-tile-note">近一年 ${fixed(low, digits)}–${fixed(high, digits)}</p>
      </div>`;
    }).filter(Boolean);

    // ---- 今日恢复 ----
    const statusWord = (v) => ({ HIGH: '较高', OPTIMAL: '最佳', BALANCED: '平衡', UNBALANCED: '不平衡', LOW: '偏低', GOOD: '良好', FAIR: '一般', POOR: '较差', VERY_GOOD: '很好', EXCELLENT: '优秀' }[v] || null);
    const recovery = [
      {
        key: 'sleep', label: '睡眠', value: present(a.sleepScore) ? f(a.sleepScore) : '—', unit: '分',
        note: present(m.sleepMinutes) ? duration(m.sleepMinutes) : '暂无评分', status: statusWord(a.sleepQualifier),
      },
      {
        key: 'readiness', label: '训练准备', value: present(m.trainingReadiness) ? f(m.trainingReadiness) : '—', unit: '',
        note: present(s.readiness?.recoveryMinutes) ? `恢复 ${duration(s.readiness.recoveryMinutes)}` : '佳明恢复评估', status: statusWord(a.readinessLevel),
      },
      {
        key: 'hrv', label: 'HRV', value: present(m.hrv) ? f(m.hrv) : '—', unit: 'ms',
        note: present(s.hrv?.weeklyAverage) ? `7 天平均 ${f(s.hrv.weeklyAverage)}` : '夜间平均', status: statusWord(a.hrvStatus),
      },
      {
        key: 'rhr', label: '静息心率', value: present(m.restingHeartRate) ? f(m.restingHeartRate) : '—', unit: 'bpm',
        note: present(d.minHeartRate) ? `当日最低 ${f(d.minHeartRate)}` : '全天最低', status: null,
      },
    ].filter((item) => item.value !== '—' || item.status);
    const recoveryHtml = recovery.length
      ? `<div class="bsv-units">${recovery.map((item) => `<div class="bsv-unit" data-bsv-unit="${item.key}"><div class="bsv-unit-head"><span>${item.label}</span>${item.status ? `<em>${item.status}</em>` : ''}</div><div class="bsv-unit-value">${item.value}${item.unit ? `<small>${item.unit}</small>` : ''}</div><p>${e(item.note)}</p></div>`).join('')}</div>`
      : `<p class="bsv-empty">${date === (this.h.today?.() || date) ? '今日数据尚未从 Garmin 同步。' : '该日期没有恢复数据。'}${this.status === 'error' ? '' : ' <button type="button" class="text-link" data-body-retry>重新读取</button>'}</p>`;

    // ---- 训练负荷 ----
    const training = data.training || {};
    const load = training.load || {};
    const focus = training.focus || {};
    const focusMax = Math.max(1, ...(focus.categories || []).flatMap((c) => [c.value, c.max]).filter(present)) * 1.1;
    const loadRatio = present(load.ratio) ? Number(load.ratio) : null;
    const loadLabel = loadRatio === null ? '暂无评估' : loadRatio < 0.8 ? '负荷偏低' : loadRatio <= 1.3 ? '负荷合适' : loadRatio <= 1.5 ? '负荷偏高' : '负荷过高';
    const loadPos = loadRatio === null ? 0 : Math.max(0, Math.min(100, ((loadRatio - 0.5) / 1.5) * 100));
    const focusRows = (focus.categories || [])
      .filter((c) => typeof c.value === 'number' && Number.isFinite(c.value))
      .map((c) => {
        const max = focusMax;
        return `<div class="bsv-focus-row"><span>${e(c.label)}</span><div class="bsv-focus-track"><span class="target" style="left:${((c.min || 0) / max) * 100}%;width:${(((c.max || 0) - (c.min || 0)) / max) * 100}%"></span><span class="fill" style="width:${((c.value || 0) / max) * 100}%"></span></div><strong>${f(c.value)}</strong></div>`;
      }).join('');

    // ---- 其他指标 ----
    const more = [];
    const push = (label, value, note) => { if (value !== null && value !== undefined && value !== '—') more.push({ label, value, note }); };
    push('步数', present(m.steps) ? `${f(m.steps)} 步` : null, present(d.stepGoal) ? `目标 ${f(d.stepGoal)}` : null);
    push('强度活动', present(data.intensity?.total) ? `${f(data.intensity.total)} 分钟` : null, present(data.intensity?.goal) ? `目标 ${f(data.intensity.goal)}` : null);
    push('楼层', present(data.floors?.ascended) ? `${f(data.floors.ascended)} 层` : null, present(data.floors?.goal) ? `目标 ${f(data.floors.goal)}` : null);
    push('喝水', present(data.hydration?.value) ? `${f(data.hydration.value)} ml` : null, present(data.hydration?.goal) ? `目标 ${f(data.hydration.goal)}` : null);
    push('压力', present(d.averageStress) ? `${f(d.averageStress)} /100` : null, present(data.stress?.max) ? `最高 ${f(data.stress.max)}` : null);
    push('呼吸', present(data.respiration?.waking) ? `${f(data.respiration.waking)} 次/分` : null, present(data.respiration?.sleep) ? `睡眠 ${f(data.respiration.sleep)}` : null);
    push('血氧', present(data.spo2?.average) ? `${f(data.spo2.average)}%` : null, present(data.spo2?.min) ? `最低 ${f(data.spo2.min)}%` : null);
    push('血压', present(data.bloodPressure?.systolic) ? `${f(data.bloodPressure.systolic)}/${f(data.bloodPressure.diastolic)}` : null, 'mmHg');
    push('总消耗', present(d.calories) ? `${f(d.calories)} kcal` : null, present(d.activeCalories) ? `活动 ${f(d.activeCalories)}` : null);
    push('最大摄氧量', present(data.vo2Max?.generic?.value) ? `${f(data.vo2Max.generic.value)}` : null, 'ml/kg/min');
    push('骑行 FTP', present(data.cyclingFtp?.value) ? `${f(data.cyclingFtp.value)} W` : null, present(data.cyclingFtp?.wattsPerKg) ? `${f(data.cyclingFtp.wattsPerKg)} W/kg` : null);
    push('乳酸阈值', present(data.lactateThreshold?.heartRate) ? `${f(data.lactateThreshold.heartRate)} bpm` : null, present(data.lactateThreshold?.paceSeconds) ? `${Math.floor(data.lactateThreshold.paceSeconds / 60)}:${String(data.lactateThreshold.paceSeconds % 60).padStart(2, '0')} /km` : null);
    push('上次活动', data.lastActivity?.name || null, data.lastActivity ? `${data.lastActivity.date} · ${duration(data.lastActivity.durationMinutes)}` : null);

    const moreHtml = more.length
      ? `<details class="bsv-more" data-bs-details="more" ${this.expanded.has('more') ? 'open' : ''}><summary>其他指标<span>${more.length} 项</span></summary><div class="bsv-more-grid">${more.map((item) => `<div><dt>${e(item.label)}</dt><dd>${e(item.value)}</dd>${item.note ? `<small>${e(item.note)}</small>` : ''}</div>`).join('')}</div></details>`
      : '';

    // ---- 状态提示 ----
    const zeppAuth = zepp?.authRequired === true;
    const zeppConfigured = zepp?.configured !== false;
    let zeppNote = '';
    if (this.zepp.status === 'loading') zeppNote = '<p class="bsv-source">正在读取体脂秤数据…</p>';
    else if (zeppAuth) zeppNote = `<p class="bsv-source warn">Zepp 授权已过期，体重停止更新。<a href="https://user.zepp.com/privacy/index.html" target="_blank" rel="noreferrer noopener">重新扫码授权</a></p>`;
    else if (!zeppConfigured) zeppNote = '<p class="bsv-source">尚未连接 Zepp 体脂秤，当前显示 Garmin 体重。</p>';
    else if (this.zepp.error) zeppNote = '<p class="bsv-source warn">体脂秤数据读取失败，稍后重试。</p>';

    const notices = this.status === 'loading'
      ? '<div class="bsv-notice" role="status">正在读取今日数据…</div>'
      : this.status === 'error'
        ? '<div class="bsv-notice warn" role="alert">今日数据读取失败。<button type="button" class="text-link" data-body-retry>重新读取</button></div>'
        : data.unavailable?.length
          ? `<div class="bsv-notice muted">${data.unavailable.length} 项数据读取失败，其余已显示。<button type="button" class="text-link" data-body-retry>重试</button></div>`
          : '';

    const heroMeta = weightSource
      ? `${weightSource}${weightAt ? ` · ${shortDate(weightAt)} ${localTime(weightAt)}` : garminWeight.date ? ` · ${garminWeight.date}` : ''}`
      : '暂无体重记录';

    return `<div class="body-status-page bsv">
      ${notices}
      <section class="bsv-hero" data-share-scope="body-summary">
        <div class="bsv-hero-main">
          <p class="bsv-eyebrow">体重 <span>${e(heroMeta)}</span></p>
          ${present(weight)
            ? `<div class="bsv-weight"><strong>${f(weight)}</strong><small>kg</small>${deltaChip}</div>`
            : '<div class="bsv-weight empty">暂无记录</div>'}
          <div class="bsv-hero-foot">${goalChip}<button type="button" class="bsv-sync" data-zepp-sync ${this.zepp.syncing ? 'disabled' : ''}>${this.zepp.syncing ? '同步中…' : '立即同步'}</button></div>
          ${spark}
          ${zeppNote}
        </div>
        <div class="bsv-hero-side">
          ${scoreRing}
          ${seconds.length ? `<dl class="bsv-seconds">${seconds.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>` : ''}
        </div>
      </section>

      ${composition.length ? `<section class="bsv-block" aria-labelledby="bsv-composition"><div class="bsv-block-head"><h2 id="bsv-composition">体成分</h2><span class="bsv-block-hint"><i class="bsv-hint-band"></i>色带为合理区间${hasProfile ? ` · ${sexMale ? '男' : '女'}性 ${ageYears} 岁` : ' · 需要性别与年龄'}</span></div><div class="bsv-tiles">${composition.join('')}</div><p class="bsv-composition-note">体脂、体水分、内脏脂肪为通用健康区间；肌肉率、骨量、基础代谢按性别、年龄、身高体重估算。体脂秤数据用于趋势参考，不替代医学判断。</p></section>` : ''}

      <section class="bsv-block" aria-labelledby="bsv-today"><div class="bsv-block-head"><h2 id="bsv-today">今日恢复</h2><span>佳明</span></div>${recoveryHtml}</section>

      <section class="bsv-block bsv-load" aria-labelledby="bsv-load"><div class="bsv-block-head"><h2 id="bsv-load">训练负荷</h2><span>${loadRatio === null && !focusRows ? '暂无评估' : loadLabel}</span></div>
        ${loadRatio === null
          ? (focusRows ? '' : '<p class="bsv-empty">佳明还没有给出今日的负荷评估。</p>')
          : `<div class="bsv-ratio"><div class="bsv-ratio-count"><strong>${loadRatio.toFixed(2)}</strong><small>负荷比</small></div><div class="bsv-ratio-scale"><span class="bsv-ratio-track"><i style="left:${loadPos}%"></i></span><span class="bsv-ratio-labels"><small>0.5</small><small>合适 0.8–1.3</small><small>2.0</small></span></div></div>
             <dl class="bsv-load-facts"><div><dt>短期负荷</dt><dd>${f(load.acute)}</dd></div><div><dt>长期负荷</dt><dd>${f(load.chronic)}</dd></div></dl>`}
        ${focusRows ? `<div class="bsv-focus">${focusRows}</div>` : ''}
      </section>

      ${moreHtml}
    </div>`;
  }
}
