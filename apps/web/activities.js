/* Activity analytics use the same filtered records as the journal. */
class ActivityJournal {
  constructor({ onChange, helpers }) {
    Object.assign(this, helpers); this.onChange = onChange;
    this.status = 'idle'; this.data = null; this.sport = 'all'; this.query = ''; this.sort = 'date'; this.page = 1;
    this.end = this.today(); this.start = this.shiftDate(this.end, -29); this.range = '30'; this.active = null;
    this.detail = null; this.detailStatus = 'idle'; this.detailCache = new Map();
    const params = new URLSearchParams(location.search), start = params.get('activities_start'), end = params.get('activities_end');
    if (this.validDate(start) && this.validDate(end) && start >= '2000-01-01' && start <= end && end <= this.today() && (Date.parse(end)-Date.parse(start))/86400000 < 366) {
      this.start = start; this.end = end; this.range = 'custom';
      if (end === this.today()) this.range = ['7','30','90'].find(n => start === this.shiftDate(end,1-Number(n))) || (start === end.slice(0,7)+'-01' ? 'month' : 'custom');
    }
    this.sport = params.get('activities_sport') || 'all'; this.query = (params.get('activities_search') || '').slice(0,120);
    this.sort = ['date','duration','distance'].includes(params.get('activities_sort')) ? params.get('activities_sort') : 'date';
    this.initialDetail = /^[1-9]\d{0,15}$/.test(params.get('activities_detail') || '') ? params.get('activities_detail') : null;
    document.addEventListener('click', e => this.click(e));
    document.addEventListener('change', e => this.change(e));
    document.addEventListener('submit', e => {
      if (!e.target.matches('[data-aj-search]')) return;
      e.preventDefault(); this.query = e.target.elements.search.value.trim(); this.page = 1; this.onChange();
    });
  }
  async open() {
    const params = new URLSearchParams(location.search);
    const start = params.get('activities_start'), end = params.get('activities_end');
    if (!start && !end && this.end !== this.today()) {
      this.end = this.today();
      this.start = this.shiftDate(this.end, -29);
      this.range = '30';
      this.data = null;
      this.status = 'idle';
    }
    if (this.status === 'idle') {
      await this.load();
      if (this.initialDetail && this.data?.items.some(a => a.id === this.initialDetail)) {
        const id = this.initialDetail; this.initialDetail = null;
        const index = this.sortedRows().findIndex(a => a.id === id);
        if (index >= 0) { this.page = Math.floor(index/20)+1; await this.select(id); }
      }
    }
  }
  persist() {
    if (location.hash !== '#activity_stats') return;
    const url = new URL(location.href);
    for (const [key,value] of Object.entries({start:this.start,end:this.end,sport:this.sport,search:this.query,sort:this.sort,detail:this.active || this.initialDetail})) {
      if (value) url.searchParams.set(`activities_${key}`,value); else url.searchParams.delete(`activities_${key}`);
    }
    if (url.href !== location.href) history.replaceState({},'',url);
  }
  async load() {
    this.controller?.abort(); const controller = this.controller = new AbortController();
    this.status = 'loading'; this.data = null; this.page = 1; this.active = null; this.onChange();
    try {
      const r = await fetch(`/api/health/activities?start=${this.start}&end=${this.end}`, { signal: controller.signal, cache: 'no-store' });
      if (!r.ok) throw Error();
      const data = await r.json(); if (controller !== this.controller) return;
      this.data = data; this.status = 'ready';
      if (this.sport !== 'all' && !data.items.some(a => a.sport === this.sport)) this.sport = 'all';
    } catch(e) { if (controller !== this.controller || e.name === 'AbortError') return; this.status = 'error'; }
    this.onChange();
  }
  async select(id, force = false) {
    this.detailToken = {};
    this.active = this.active === id && !force ? null : id;
    if (!this.active) { this.onChange(); return; }
    if (!force && this.detailCache.has(id)) { this.detail = this.detailCache.get(id); this.detailStatus = 'ready'; this.onChange(); return; }
    this.detail = null; this.detailStatus = 'loading'; this.onChange();
    const token = this.detailToken = {};
    try {
      const r = await fetch(`/api/health/activities/${id}`, { cache: 'no-store' }); if (!r.ok) throw Error();
      const data = await r.json(); if (token !== this.detailToken || this.active !== id) return;
      this.detail = data; this.detailStatus = 'ready'; this.detailCache.set(id, data);
    } catch { if (token !== this.detailToken || this.active !== id) return; this.detailStatus = 'error'; }
    this.onChange();
  }
  click(e) {
    const b = e.target.closest('[data-aj-range], [data-aj-sport], [data-aj-id], [data-aj-page], [data-aj-retry], [data-aj-detail-retry], [data-aj-clear]');
    if (!b) return;
    if (b.dataset.ajRange) { this.range = b.dataset.ajRange; this.end = this.today(); this.start = this.range === 'month' ? this.end.slice(0,7) + '-01' : this.shiftDate(this.end, 1 - Number(this.range)); void this.load(); }
    else if (b.dataset.ajSport) { this.sport = b.dataset.ajSport; this.page = 1; this.active = null; this.onChange(); }
    else if (b.dataset.ajId) { const id = b.dataset.ajId; void this.select(id).then(() => document.querySelector(`[data-aj-id="${id}"]`)?.focus({preventScroll:true})); }
    else if (b.dataset.ajPage) { this.page = Number(b.dataset.ajPage); this.active = null; this.onChange(); document.querySelector('.aj-journal')?.scrollIntoView({block:'start'}); }
    else if (b.hasAttribute('data-aj-detail-retry')) void this.select(this.active, true);
    else if (b.hasAttribute('data-aj-clear')) { this.query = ''; this.sport = 'all'; this.page = 1; this.onChange(); }
    else { this.detailCache.clear(); void this.load(); }
  }
  change(e) {
    if (e.target.id === 'aj-sort') { this.sort = e.target.value; this.page = 1; this.onChange(); }
    if (e.target.id === 'aj-start' || e.target.id === 'aj-end') {
      const start = document.getElementById('aj-start').value, end = document.getElementById('aj-end').value;
      const valid = this.validDate(start) && this.validDate(end) && start >= '2000-01-01' && start <= end && end <= this.today() && (Date.parse(end)-Date.parse(start))/86400000 < 366;
      e.target.setCustomValidity(valid ? '' : '请选择一年以内、截至今天的有效日期范围');
      if (!valid) { e.target.reportValidity(); return; }
      this.start = start; this.end = end; this.range = 'custom'; void this.load();
    }
  }
  rows() {
    return (this.data?.items || []).filter(a => (this.sport === 'all' || a.sport === this.sport) && (!this.query || `${a.name} ${this.sportName(a.sport)}`.toLowerCase().includes(this.query.toLowerCase())));
  }
  sortedRows() {
    return [...this.rows()].sort((a,b) => this.sort === 'duration' ? (b.durationSeconds??-1)-(a.durationSeconds??-1) : this.sort === 'distance' ? (b.distanceMeters??-1)-(a.distanceMeters??-1) : 0);
  }
  n(v, digits = 0) { return typeof v === 'number' && Number.isFinite(v) ? v.toLocaleString('zh-CN', {maximumFractionDigits:digits}) : '未记录'; }
  seconds(v) { if (v == null) return '未记录'; const s = Math.round(v); return s >= 3600 ? `${Math.floor(s/3600)}:${String(Math.floor(s%3600/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}` : `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`; }
  sum(rows, key, divisor = 1) { const known = rows.filter(a => a[key] != null); return { value: known.length ? known.reduce((s,a)=>s+a[key],0)/divisor : rows.length ? null : 0, partial: known.length < rows.length }; }
  metric(label, value, unit = '', note = '') { return `<div class="aj-metric"><span>${label}</span><strong>${value}<small>${unit}</small></strong>${note ? `<small>${note}</small>` : ''}</div>`; }
  chart(rows) {
    const count = Math.round((Date.parse(this.end)-Date.parse(this.start))/86400000)+1, bucket = count > 60 ? 7 : 1;
    const bins = Array.from({length:Math.ceil(count/bucket)}, (_,i) => { const start = this.shiftDate(this.start,i*bucket), end = this.shiftDate(this.start,Math.min(count-1,(i+1)*bucket-1)); const items = rows.filter(a => a.date >= start && a.date <= end); return {start,end,items,...this.sum(items,'durationSeconds',60)}; });
    const max = Math.max(1,...bins.map(b=>b.value || 0));
    return `<section class="aj-panel aj-trend"><div class="aj-section-head"><h2>运动节奏</h2><span>${bucket === 7 ? '每 7 天' : '每日'}运动时长 · 分钟</span></div><div class="aj-chart" role="img" aria-label="${this.escapeHtml(bins.map(b=>`${b.start} ${b.items.length}次 ${b.value == null ? '时长未记录' : Math.round(b.value)+'分钟'}`).join('；'))}">${bins.map((b,i)=>`<div class="aj-chart-col"><div class="aj-chart-track" tabindex="0" aria-label="${b.start}，${b.items.length} 次活动，${this.n(b.value)} 分钟"><span class="aj-chart-bar" style="height:${b.value > 0 ? Math.max(3,b.value/max*100) : 0}%"></span><span class="aj-chart-tip">${b.start.slice(5)}${b.end!==b.start?' 至 '+b.end.slice(5):''}<br>${b.items.length} 次 · ${this.n(b.value)} 分钟${b.partial?'（部分）':''}</span></div><small>${i===0 || i===bins.length-1 || i%Math.max(1,Math.floor(bins.length/5))===0 ? b.start.slice(5) : ''}</small></div>`).join('')}</div><p class="aj-footnote">${rows.length ? '未记录时长的活动不计入柱高；无活动日期显示为零。' : '当前范围内暂无符合条件的活动。'}</p></section>`;
  }
  breakdown(rows) {
    const sports = [...new Set(rows.map(a=>a.sport))].map(sport=>{ const items=rows.filter(a=>a.sport===sport); return {sport,count:items.length,...this.sum(items,'durationSeconds',60)}; }).sort((a,b)=>b.count-a.count);
    return `<section class="aj-panel aj-breakdown"><div class="aj-section-head"><h2>运动构成</h2><span>按活动次数</span></div>${sports.length ? sports.map(s=>`<div class="aj-sport-row"><span>${this.escapeHtml(this.sportName(s.sport))}</span><strong>${s.count}<small> 次</small></strong><div class="aj-sport-track"><i style="width:${s.count/rows.length*100}%"></i></div><small>${this.n(s.value)} 分钟${s.partial?' · 部分合计':''}</small></div>`).join('') : '<p class="aj-empty">有活动后，在这里查看运动分布。</p>'}</section>`;
  }
  detailView(row) {
    if (this.detailStatus === 'loading') return `<div class="aj-detail" id="aj-detail-${row.id}" role="status">正在读取这次活动的详细数据…</div>`;
    if (this.detailStatus === 'error') return `<div class="aj-detail" id="aj-detail-${row.id}" role="alert">详细数据暂时无法读取。<button class="text-link" data-aj-detail-retry>重新读取</button></div>`;
    const a = this.detail.activity;
    const pace = a.averageSpeed > 0 ? this.seconds(1000/a.averageSpeed) : '未记录';
    const metrics = [ ['活动时长',this.seconds(a.durationSeconds)],['移动时间',this.seconds(a.movingSeconds)],['经过时间',this.seconds(a.elapsedSeconds)],['距离',this.n(a.distanceMeters == null ? null : a.distanceMeters/1000,2),'km'],['活动热量',this.n(a.calories),'kcal'],['平均心率',this.n(a.averageHeartRate),'bpm'],['最高心率',this.n(a.maxHeartRate),'bpm'], [/cycl|bik/.test(a.sport)?'平均速度':'平均配速',/cycl|bik/.test(a.sport)?this.n(a.averageSpeed == null?null:a.averageSpeed*3.6,1):pace,/cycl|bik/.test(a.sport)?'km/h':'/km'],['最高速度',this.n(a.maxSpeed == null?null:a.maxSpeed*3.6,1),'km/h'],['累计爬升',this.n(a.elevationGain),'m'],['累计下降',this.n(a.elevationLoss),'m'],['有氧训练效果',this.n(a.aerobicEffect,1)],['无氧训练效果',this.n(a.anaerobicEffect,1)],['平均步频 / 踏频',this.n(a.averageCadence),'/min'] ];
    return `<div class="aj-detail" id="aj-detail-${row.id}" data-share-scope="activity-detail"><div class="aj-detail-head"><div><h3>${this.escapeHtml(a.name || row.name || '活动详情')}</h3><p>${this.escapeHtml(a.date || row.date)} ${this.escapeHtml(a.time || '')} · ${this.escapeHtml(this.sportName(a.sport || row.sport))}</p></div>${typeof HealthShare !== 'undefined' ? HealthShare.button({title:a.name || '活动详情',context:`${row.date} · Garmin Connect`}) : ''}</div><div class="aj-detail-metrics">${metrics.map(m=>this.metric(...m)).join('')}</div><h3>分圈明细</h3>${this.detail.unavailable.includes('splits') ? '<p class="aj-footnote">分圈数据暂时读取失败。<button class="text-link" data-aj-detail-retry>重试详情</button></p>' : a.splits.length ? `<div class="aj-table-wrap"><table><thead><tr><th>圈数</th><th>时长</th><th>距离 · km</th><th>平均心率 · bpm</th><th>最高心率 · bpm</th></tr></thead><tbody>${a.splits.map(l=>`<tr><td>${l.number}</td><td>${this.seconds(l.durationSeconds)}</td><td>${this.n(l.distanceMeters == null?null:l.distanceMeters/1000,2)}</td><td>${this.n(l.averageHeartRate)}</td><td>${this.n(l.maxHeartRate)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="aj-footnote">Garmin 未提供这次活动的分圈记录。</p>'}<p class="aj-footnote">数据来自 Garmin Connect · ${this.escapeHtml(this.detail.syncedAt.slice(0,16).replace('T',' '))} UTC 读取。未记录的指标不补零。活动热量不等于全天总消耗。</p><button class="text-link" data-ask="${this.escapeHtml(`请读取并回顾 ${row.date} 的活动「${row.name || '运动'}」（活动 ID：${row.id}），结合活动时长和心率说明运动表现。`)}">${this.icon('chat')} 与健康助手回顾这次活动</button></div>`;
  }
  render() {
    this.persist();
    const e = this.escapeHtml, rows = this.rows(), all = this.data?.items || [];
    const duration = this.sum(rows,'durationSeconds',60), distance = this.sum(rows,'distanceMeters',1000), calories = this.sum(rows,'calories');
    const sorted = this.sortedRows();
    const pages = Math.max(1,Math.ceil(sorted.length/20)); this.page = Math.min(this.page,pages);
    const shown = sorted.slice((this.page-1)*20,this.page*20);
    return `<div class="page-heading"><div><div class="eyebrow">ACTIVITY JOURNAL</div><h1>活动统计</h1><p>看见运动的积累，也回看每一次投入。</p></div><a class="text-link" href="#activity" data-goto="activity">查看训练计划 ${this.icon('arrow')}</a></div><div class="aj-controls"><div class="aj-ranges" role="group" aria-label="统计时间范围">${[['7','近 7 天'],['30','近 30 天'],['90','近 90 天'],['month','本月']].map(([v,l])=>`<button data-aj-range="${v}" aria-pressed="${this.range===v}">${l}</button>`).join('')}</div><div class="aj-dates"><label>开始 <input type="date" id="aj-start" aria-label="统计开始日期" value="${this.start}" min="2000-01-01" max="${this.end}"></label><span>至</span><label>结束 <input type="date" id="aj-end" aria-label="统计结束日期" value="${this.end}" min="${this.start}" max="${this.today()}"></label><button class="icon-button" data-aj-retry aria-label="刷新活动">${this.icon('refresh')}</button></div></div><div class="aj-filters" role="group" aria-label="运动类型"><button data-aj-sport="all" aria-pressed="${this.sport==='all'}">全部运动</button>${[...new Set(all.map(a=>a.sport))].map(s=>`<button data-aj-sport="${e(s || 'unknown')}" aria-pressed="${this.sport===s}">${e(this.sportName(s))}</button>`).join('')}</div>${this.status==='loading' || this.status==='idle' ? '<div class="aj-panel aj-empty" role="status">正在读取 Garmin 活动记录…</div>' : this.status==='error' ? '<div class="aj-panel aj-empty" role="alert"><h2>暂时无法读取活动</h2><p>请稍后重试，或检查 Garmin 连接。</p><button class="text-link" data-aj-retry>重新读取</button></div>' : `<section class="aj-summary" aria-label="筛选范围内的活动汇总">${this.metric('活动次数',this.n(rows.length),'次',`${new Set(rows.map(a=>a.date)).size} 天有运动`)}${this.metric('累计时长',this.n(duration.value,0),'分钟',duration.partial?'部分合计':'活动计时累计')}${this.metric('累计距离',this.n(distance.value,2),'km',distance.partial?'部分合计':'按 Garmin 记录累计')}${this.metric('活动热量',this.n(calories.value),'kcal',calories.partial?'部分合计':'仅运动期间消耗')}</section><div class="aj-analytics">${this.chart(rows)}${this.breakdown(rows)}</div><section class="aj-panel aj-journal"><div class="aj-section-head"><h2>活动详单 <small>${rows.length} 次</small></h2><div class="aj-list-tools"><form data-aj-search role="search"><input name="search" type="search" maxlength="120" value="${e(this.query)}" placeholder="搜索活动名称" aria-label="搜索活动名称"><button class="text-link" type="submit">搜索</button></form><label class="visually-hidden" for="aj-sort">活动排序</label><select id="aj-sort">${[['date','最近优先'],['duration','时长最多'],['distance','距离最远']].map(([v,l])=>`<option value="${v}" ${v===this.sort?'selected':''}>${l}</option>`).join('')}</select></div></div><div class="aj-list-labels"><span>活动 / 时间</span><span>时长</span><span>距离</span><span>热量</span><span>平均心率</span><span></span></div>${shown.length ? shown.map(a=>`<article class="aj-entry"><button class="aj-row" data-aj-id="${a.id}" aria-expanded="${this.active===a.id}" aria-controls="aj-detail-${a.id}"><span class="aj-row-name"><span class="aj-row-icon">${this.icon('run')}</span><span><strong>${e(a.name || '未命名活动')}</strong><small>${a.date} ${a.time || ''} · ${e(this.sportName(a.sport))}</small></span></span><span><small class="aj-mobile-label">时长</small>${this.seconds(a.durationSeconds)}</span><span><small class="aj-mobile-label">距离</small>${a.distanceMeters == null ? '未记录' : this.n(a.distanceMeters/1000,2)+' km'}</span><span><small class="aj-mobile-label">热量</small>${a.calories == null?'未记录':this.n(a.calories)+' kcal'}</span><span><small class="aj-mobile-label">平均心率</small>${a.averageHeartRate == null?'未记录':this.n(a.averageHeartRate)+' bpm'}</span><span class="aj-expand">${this.active===a.id?'收起':'详情'} ${this.icon('chevron')}</span></button>${this.active===a.id?this.detailView(a):''}</article>`).join('') : '<div class="aj-empty"><h3>没有符合条件的活动</h3><p>试试其他时间范围或运动类型。</p><button class="text-link" data-aj-clear>清除类型和搜索条件</button></div>'}<div class="aj-pagination"><span>${rows.length ? `${(this.page-1)*20+1}–${Math.min(this.page*20,rows.length)} / ${rows.length} 次` : '0 次活动'}</span><div><button data-aj-page="${this.page-1}" ${this.page===1?'disabled':''}>上一页</button><span>${this.page} / ${pages}</span><button data-aj-page="${this.page+1}" ${this.page===pages?'disabled':''}>下一页</button></div></div></section><p class="aj-source">Garmin Connect · ${this.start} 至 ${this.end} · ${this.timeLabel(this.data.syncedAt)} 读取。统计随类型与搜索筛选更新。</p>`}`;
  }
}
