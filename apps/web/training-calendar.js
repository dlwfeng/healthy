/* Garmin is the source of truth for both activity history and scheduled training. */
class TrainingCalendar {
  constructor({ date, onChange, helpers }) {
    Object.assign(this, helpers);
    this.onChange = onChange;
    const selected = new URLSearchParams(location.search).get('training_date');
    this.selected = this.validDate(selected) ? selected : (this.today ? this.today() : (date || new Date().toISOString().slice(0, 10)));
    this.month = this.selected.slice(0, 7);
    this.status = 'idle';
    this.data = null;
    this.filter = 'all';
    this.active = null;
    this.workout = null;
    this.workoutStatus = 'idle';
    this.request = 0;
    this.detailRequest = 0;
    document.addEventListener('click', event => this.click(event));
    document.addEventListener('change', event => {
      if (event.target.id === 'training-month' && /^20\d{2}-(0[1-9]|1[0-2])$/.test(event.target.value))
        this.select(`${event.target.value}-01`);
    });
    document.addEventListener('keydown', event => {
      const date = event.target.dataset?.trainingDay;
      const movement = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key];
      if (date && movement) {
        event.preventDefault();
        const next = this.shiftDate(date, movement);
        this.select(next);
        document.querySelector(`[data-training-day="${next}"]`)?.focus();
      }
    });
  }

  validDate(value) {
    return /^20\d{2}-\d{2}-\d{2}$/.test(value || '') &&
      !Number.isNaN(Date.parse(value)) && new Date(value + 'T12:00:00Z').toISOString().slice(0, 10) === value;
  }

  async open() {
    const selected = new URLSearchParams(location.search).get('training_date');
    if (this.validDate(selected)) {
      this.select(selected);
    } else {
      const today = this.today ? this.today() : this.selected;
      if (this.selected !== today) this.select(today);
    }
    if (this.status === 'idle') await this.load();
  }

  async load() {
    const request = ++this.request;
    this.active = null;
    this.workout = null;
    this.detailRequest++;
    this.controller?.abort();
    this.controller = new AbortController();
    this.status = 'loading';
    this.data = null;
    this.onChange();
    try {
      const response = await fetch(`/api/health/calendar?month=${this.month}`, { cache: 'no-store', signal: this.controller.signal });
      if (!response.ok) throw Error();
      const data = await response.json();
      if (request !== this.request) return;
      this.data = data;
      this.status = 'ready';
    } catch (error) {
      if (request !== this.request || error.name === 'AbortError') return;
      this.status = 'error';
    }
    this.onChange();
  }

  select(date) {
    if (!this.validDate(date)) return;
    const changed = this.month !== date.slice(0, 7);
    this.selected = date;
    this.month = date.slice(0, 7);
    this.active = null;
    this.workout = null;
    this.detailRequest++;
    const url = new URL(location.href);
    url.searchParams.set('training_date', date);
    history.replaceState({}, '', url);
    if (changed) void this.load();
    else this.onChange();
  }

  async showItem(id) {
    const item = this.data?.items.find(item => item.id === id);
    if (!item) return;
    this.active = this.active === id ? null : id;
    this.workout = null;
    const request = ++this.detailRequest;
    if (!this.active || item.kind !== 'workout' || !item.workoutId) { this.onChange(); return; }
    this.workoutStatus = 'loading';
    this.onChange();
    try {
      const response = await fetch(`/api/health/workouts/${item.workoutId}`, { cache: 'no-store' });
      if (!response.ok) throw Error();
      const result = await response.json();
      if (request !== this.detailRequest) return;
      this.workout = result.workout;
      this.workoutStatus = 'ready';
    } catch {
      if (request !== this.detailRequest) return;
      this.workoutStatus = 'error';
    }
    this.onChange();
  }

  click(event) {
    const target = event.target.closest('button');
    if (!target) return;
    if (target.hasAttribute('data-training-day')) this.select(target.dataset.trainingDay);
    if (target.hasAttribute('data-training-month')) {
      const [year, month] = this.month.split('-').map(Number);
      this.select(new Date(Date.UTC(year, month - 1 + Number(target.dataset.trainingMonth), 1)).toISOString().slice(0, 10));
    }
    if (target.hasAttribute('data-training-today')) this.select(this.today());
    if (target.hasAttribute('data-training-refresh')) { this.active = null; this.detailRequest++; void this.load(); }
    if (target.hasAttribute('data-training-filter')) { this.filter = target.dataset.trainingFilter; this.onChange(); }
    if (target.hasAttribute('data-training-item')) void this.showItem(target.dataset.trainingItem);
  }

  visibleItems() { return (this.data?.items || []).filter(item => this.filter === 'all' || item.kind === this.filter); }

  renderSteps(steps, depth = 0) {
    const names = { warmup: '热身', cooldown: '放松', interval: '训练', recovery: '恢复', rest: '休息', repeat: '循环' };
    return `<ol class="training-steps">${steps.map(step => `<li><div><strong>${names[step.type] || '训练步骤'}</strong><span>${step.iterations ? `${step.iterations} 组` : step.endCondition === 'time' && step.value !== null ? `${Math.round(step.value / 60 * 10) / 10} 分钟` : step.endCondition === 'distance' && step.value !== null ? `${this.format(step.value / 1000)} km` : step.endCondition === 'reps' ? `${this.format(step.value)} 次` : step.endCondition === 'lap.button' ? '按圈键结束' : '按课程要求'}</span></div>${this.renderTarget(step)}${step.description ? `<p>${this.escapeHtml(step.description)}</p>` : ''}${depth < 4 && step.steps?.length ? this.renderSteps(step.steps, depth + 1) : ''}</li>`).join('')}</ol>`;
  }

  renderTarget(step) {
    const names = { 'heart.rate.zone': '心率', 'power.zone': '功率', cadence: '踏频/步频', 'pace.zone': '配速', 'speed.zone': '速度' };
    const name = names[step.target];
    if (!name) return '';
    if (step.zone) return `<small>${name}区间 ${this.format(step.zone)}</small>`;
    if (step.targetLow !== null && step.targetLow !== undefined && step.targetHigh !== null && step.targetHigh !== undefined) {
      if (step.target === 'heart.rate.zone') return `<small>心率 ${this.format(step.targetLow)}–${this.format(step.targetHigh)} bpm</small>`;
      if (step.target === 'power.zone') return `<small>功率 ${this.format(step.targetLow)}–${this.format(step.targetHigh)} W</small>`;
    }
    return `<small>${name}目标按佳明课程执行</small>`;
  }

  renderItem(item) {
    const expanded = this.active === item.id;
    let detail = '';
    if (expanded && item.kind === 'activity') {
      detail = `<dl class="training-facts">${[['时长', this.duration(item.durationMinutes)], ['距离', item.distanceKm > 0 ? this.format(item.distanceKm) + ' km' : '—'], ['活动消耗', item.calories !== null ? this.format(item.calories) + ' kcal' : '—'], ['平均心率', item.averageHeartRate !== null ? this.format(item.averageHeartRate) + ' bpm' : '—']].map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join('')}</dl>`;
    }
    if (expanded && item.kind === 'workout') {
      detail = !item.workoutId ? '<p class="training-detail-note">佳明未提供这项安排的课程详情。</p>' : this.workoutStatus === 'loading' ? '<p class="training-detail-note" role="status">正在读取训练步骤…</p>' : this.workoutStatus === 'error' ? '<p class="training-detail-note" role="alert">课程详情暂不可用，请收起后重试。</p>' : `${this.workout?.description ? `<p class="training-detail-note">${this.escapeHtml(this.workout.description)}</p>` : ''}${this.workout?.durationMinutes ? `<p class="training-detail-note">预计 ${this.duration(this.workout.durationMinutes)}</p>` : ''}${this.workout?.steps?.length ? this.renderSteps(this.workout.steps) : '<p class="training-detail-note">暂无训练步骤</p>'}`;
    }
    return `<article data-share-scope="training-item" class="training-day-item ${item.kind}"><button class="training-item-toggle" type="button" data-training-item="${this.escapeHtml(item.id)}" aria-expanded="${expanded}"><span class="training-item-icon">${this.icon(item.kind === 'activity' ? 'run' : 'calendar')}</span><span><strong>${this.escapeHtml(item.name)}</strong><small>${item.kind === 'activity' ? '活动记录' : '日历训练'} · ${this.sportName(item.sport)}${item.time ? ' · ' + this.escapeHtml(item.time) : ''}</small></span><span class="training-item-chevron ${expanded ? 'expanded' : ''}">${this.icon('chevron')}</span></button>${expanded ? HealthShare.button({ title: item.name, context: `${this.selected} · Garmin Connect · ${item.kind === 'activity' ? '活动记录' : '训练计划'}`, disabled: item.kind === 'workout' && this.workoutStatus === 'loading' }) : ''}${detail}</article>`;
  }

  render() {
    const [year, month] = this.month.split('-').map(Number), first = `${this.month}-01`;
    const offset = (new Date(first + 'T12:00:00Z').getUTCDay() + 6) % 7;
    const count = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const cells = Math.ceil((offset + count) / 7) * 7, start = this.shiftDate(first, -offset);
    const items = this.visibleItems(), selectedItems = items.filter(item => item.date === this.selected);
    const grouped = new Map();
    for (const item of items) { if (!grouped.has(item.date)) grouped.set(item.date, []); grouped.get(item.date).push(item); }
    const actual = (this.data?.items || []).filter(item => item.kind === 'activity');
    const planned = (this.data?.items || []).filter(item => item.kind === 'workout');
    const past = this.selected < this.today(), unavailable = this.data?.unavailable || [];
    const ask = past ? `请查询 ${this.selected} 的实际运动和佳明日历，帮我回顾当天的训练。` : `请帮我在 ${this.selected} 的佳明日历安排训练。先查询当天已有安排和近期恢复、运动数据，与我确定运动类型、时长和训练内容，确认后创建并排入佳明日历。`;
    const status = this.status === 'loading' ? '<div class="training-notice" role="status"><span class="loading-dot"></span>正在读取佳明日历与活动…</div>' : this.status === 'error' ? '<div class="training-notice training-error" role="alert">暂时无法读取佳明日历。<button type="button" class="text-link" data-training-refresh>重新读取</button></div>' : unavailable.length ? `<div class="training-notice training-error" role="alert">${unavailable.includes('get_calendar') ? '训练安排暂时读取失败，以下仅显示可用的活动记录。' : '活动记录暂时读取失败，以下仅显示可用的训练安排。'}<button type="button" class="text-link" data-training-refresh>重试</button></div>` : '';
    return `<div class="page-heading training-heading"><div><div class="eyebrow">GARMIN ACTIVITY</div><h1>训练计划</h1><p>查看 Garmin 日历中的活动与已排训练，并通过对话安排课程。</p></div><a class="text-link" href="#activity_stats" data-goto="activity_stats">活动统计 ${this.icon('arrow')}</a><span class="training-source">Garmin Connect</span></div>
      <div class="training-layout"><section class="training-calendar" aria-label="运动与训练日历">
        <div class="training-toolbar"><div class="training-month-controls"><button class="icon-button previous" type="button" data-training-month="-1" aria-label="上个月" ${this.month === '2000-01' ? 'disabled' : ''}>${this.icon('chevron')}</button><label class="training-month-label"><span>${year} 年 ${month} 月</span><input id="training-month" type="month" min="2000-01" max="2099-12" value="${this.month}" aria-label="选择日历月份"></label><button class="icon-button" type="button" data-training-month="1" aria-label="下个月" ${this.month === '2099-12' ? 'disabled' : ''}>${this.icon('chevron')}</button><button class="training-today" type="button" data-training-today>今天</button></div><button class="icon-button" type="button" data-training-refresh aria-label="刷新运动日历" ${this.status === 'loading' ? 'disabled' : ''}>${this.icon('refresh')}</button></div>
        <div class="training-filter-bar"><div class="sport-filters" role="group" aria-label="日历内容">${[['all', '全部'], ['activity', '活动记录'], ['workout', '计划训练']].map(([value, label]) => `<button type="button" data-training-filter="${value}" aria-pressed="${this.filter === value}">${label}</button>`).join('')}</div><div class="training-legend"><span><i class="activity"></i>活动</span><span><i class="workout"></i>计划</span></div></div>
        ${status}<div class="training-weekdays" aria-hidden="true">${['一', '二', '三', '四', '五', '六', '日'].map(day => `<span>${day}</span>`).join('')}</div>
        <div class="training-grid" aria-label="${year} 年 ${month} 月日期" aria-busy="${this.status === 'loading'}">${Array.from({ length: cells }, (_, index) => {
          const date = this.shiftDate(start, index), rows = grouped.get(date) || [], outside = date.slice(0, 7) !== this.month;
          return `<button type="button" class="training-cell ${outside ? 'outside' : ''} ${date === this.today() ? 'today' : ''} ${date === this.selected ? 'selected' : ''}" data-training-day="${date}" aria-pressed="${date === this.selected}" ${this.validDate(date) ? '' : 'disabled'} aria-label="${date}${date === this.today() ? '，今天' : ''}，${rows.length} 条记录"><span class="training-day-number">${Number(date.slice(8))}${date === this.today() ? '<small>今天</small>' : ''}</span><span class="training-cell-items">${rows.slice(0, 2).map(item => `<span class="training-event ${item.kind}" title="${this.escapeHtml(item.name)}"><i></i><span>${this.escapeHtml(item.name)}</span></span>`).join('')}${rows.length > 2 ? `<span class="training-more">+${rows.length - 2} 条</span>` : ''}</span></button>`;
        }).join('')}</div>
        <div class="training-calendar-footer"><span>${this.status === 'ready' ? `${unavailable.includes('get_activities_by_date') ? '活动未读取' : actual.length + ' 次活动'} · ${unavailable.includes('get_calendar') ? '计划未读取' : planned.length + ' 项日历训练'}` : '记录随佳明日历读取'}</span><span>${this.data?.syncedAt ? this.timeLabel(this.data.syncedAt) + ' 读取' : ''}</span></div>
      </section><aside class="training-agenda" aria-label="所选日期详情"><div class="training-agenda-date"><span>${this.weekday(this.selected)}</span><h2>${Number(this.selected.slice(5, 7))} 月 ${Number(this.selected.slice(8))} 日${this.selected === this.today() ? '<small>今天</small>' : ''}</h2><button type="button" class="icon-button context-chat-action" data-ask="${this.escapeHtml(ask)}" aria-label="对话${past ? '回顾运动' : '安排训练'}" title="对话${past ? '回顾运动' : '安排训练'}">${this.icon('chat')}</button><p>${past ? '回看这一天的运动与训练' : '给下一次运动留个位置'}</p></div><div class="training-day-list">${selectedItems.length ? selectedItems.map(item => this.renderItem(item)).join('') : `<div class="training-day-empty">${this.icon('calendar')}<strong>${this.status === 'loading' ? '正在读取这一天' : this.status === 'error' || unavailable.length ? '记录尚未完整读取' : this.filter === 'all' ? '这一天暂无活动或训练' : '没有符合筛选的记录'}</strong><p>${'选择其他日期，或刷新佳明记录。'}</p></div>`}</div><div class="training-agenda-source">${this.icon('refresh')}活动与训练安排来自佳明日历</div></aside></div>`;
  }
}
