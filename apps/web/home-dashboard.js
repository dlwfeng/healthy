/* Read-only cockpit. Module failures remain independent of Garmin availability. */
class HomeDashboardData {
  constructor(onChange) { this.onChange = onChange; this.sequence = 0; this.date = ''; this.modules = {}; }
  async open(date, refresh = false) {
    if (this.date === date && !refresh) return;
    this.date = date;
    const token = ++this.sequence;
    this.modules = Object.fromEntries(['meals', 'daily', 'weekly', 'journal'].map(key => [key, { status: 'loading' }]));
    this.onChange();
    const paths = {
      meals: `/api/meals?start_date=${date}&end_date=${date}`,
      daily: `/api/health-reports?kind=daily&to=${date}`,
      weekly: `/api/health-reports?kind=weekly&to=${date}`,
      journal: `/api/daily-status?start_date=${date}&end_date=${date}`,
    };
    await Promise.all(Object.entries(paths).map(async ([key, path]) => {
      try {
        const response = await fetch(path, { cache: 'no-store' });
        if (!response.ok) throw Error();
        const data = await response.json();
        if (token !== this.sequence) return;
        this.modules[key] = { status: 'ready', data };
      } catch {
        if (token !== this.sequence) return;
        this.modules[key] = { status: 'error' };
      }
      this.onChange();
    }));
  }
}

function cockpitHome() {
  const modules = homeDashboard.modules;
  const sectionHead = (title, note = '') => `<header class="cockpit-section-head"><h2>${title}</h2>${note ? `<span>${note}</span>` : ''}</header>`;
  const metric = (label, value, unit, note, color = 'teal') => `<div class="cockpit-metric ${color}"><span>${label}</span><div><strong>${format(value)}</strong><small>${unit}</small></div>${note ? `<p>${escapeHtml(note)}</p>` : ''}</div>`;
  const message = (module, emptyText) => module?.status === 'error' ? '读取失败，请刷新' : module?.status === 'loading' || !module ? '<span class="cockpit-spinner" role="status" aria-label="读取中"></span>' : emptyText;
  const data = state.data || {}, metrics = m(), d = daily();
  const meals = modules.meals?.data, entries = meals?.entries || [], totals = meals?.summary?.totals || {};
  const count = meals?.summary?.meals ?? entries.length;
  const deficit = mealEnergyDeficit(totals.calories?.value, count > 0 && totals.calories?.complete_meals === count, d.calories);
  const nutrient = (key, label, color) => {
    const total = totals[key];
    return `<div class="cockpit-nutrient ${color}"><span>${label}</span><strong>${format(total?.value)} <small>g</small></strong>${present(total?.value) && total.complete_meals !== count ? '<small title="部分合计" aria-label="部分合计">*</small>' : ''}</div>`;
  };
  const mealRows = entries.slice().sort((a, b) => a.time.localeCompare(b.time)).map(meal => {
    const items = meal.items || [], known = items.filter(i => present(i.calories));
    const calories = known.length ? known.reduce((sum, i) => sum + i.calories, 0) : null;
    return `<div class="cockpit-meal-row"><time>${escapeHtml(meal.time)}</time><span class="cockpit-meal-kind">${escapeHtml(meal.kind)}</span><div><strong>${escapeHtml(meal.name || items.map(i => i.name).join('、') || '未命名餐食')}</strong></div><span><b>${format(calories)}</b><small>kcal${known.length && known.length !== items.length ? '<abbr title="部分合计" aria-label="部分合计">*</abbr>' : ''}</small></span></div>`;
  }).join('');
  const report = (kind, label) => {
    const module = modules[kind], all = module?.data?.reports || [];
    const latest = all.filter(r => r.state === 'completed' && r.summary && r.period_start <= state.date && (!r.period_end_exclusive || r.period_end_exclusive <= shiftDate(state.date, 1))).sort((a,b) => b.period_start.localeCompare(a.period_start))[0];
    return `<article class="cockpit-report"><div class="cockpit-report-meta"><span>${label}</span><time>${latest ? escapeHtml(latest.period_start) + (kind === 'weekly' ? ' 起' : '') : ''}</time></div>${latest ? `<h3>${escapeHtml(latest.title || label)}</h3><p class="cockpit-report-preview">${escapeHtml(latest.summary.length > 160 ? latest.summary.slice(0,160) + '…' : latest.summary)}</p>${latest.summary.length > 160 ? `<details><summary aria-label="展开或收起摘要" title="展开或收起摘要">${icon("chevron")}</summary><p>${escapeHtml(latest.summary)}</p></details>` : ''}` : `<p class="muted">${message(module, '暂无报告')}</p>`}</article>`;
  };
  const goal = d.stepGoal, steps = metrics.steps;
  const journal = modules.journal?.data?.entries || [];
  return `<div class="health-cockpit">${heading('健康首页', '', dateControls())}${isLoading() ? '' : connectionNote()}
    <section class="cockpit-vitals" aria-label="身体状态概览">
      ${metric('身体电量', metrics.bodyBattery, '/ 100', '')}
      <div class="cockpit-metric indigo"><span>昨夜睡眠</span><div><strong>${present(metrics.sleepMinutes) ? Math.floor(metrics.sleepMinutes / 60) + '<small>时</small>' + metrics.sleepMinutes % 60 : '—'}</strong><small>分</small></div><p>评分 ${format(analysis().sleepScore)} · ${escapeHtml(rawStatus(analysis().sleepQualifier) || '')}</p></div>
      ${metric('训练准备度', metrics.trainingReadiness, '/ 100', rawStatus(analysis().readinessLevel) || '')}
      ${metric('当日步数', steps, '步', present(goal) && goal > 0 && present(steps) ? `目标 ${format(goal)} · ${Math.round(steps / goal * 100)}%` : '', 'orange')}
    </section>
    <div class="cockpit-grid">
      <section class="cockpit-panel cockpit-food">${sectionHead('饮食记录', modules.meals?.status === 'ready' ? `${count} 餐` : '')}
        <div class="cockpit-energy"><div><span title="仅含已保存餐食，全天可能未记全">摄入</span><strong>${format(totals.calories?.value)}<small>kcal</small></strong>${present(totals.calories?.value) && totals.calories.complete_meals !== count ? '<small title="部分合计" aria-label="部分合计">*</small>' : ''}</div><div><span title="Garmin 总消耗">总消耗</span><strong>${format(d.calories)}<small>kcal</small></strong></div><div title="总消耗 − 已记录摄入；漏记可能使缺口偏大，热量未填全不计算。今天截至当前。"><span>${deficit !== null && deficit < 0 ? '热量盈余' : '热量缺口'}</span><strong>${format(deficit === null ? null : Math.abs(deficit))}<small>kcal</small></strong></div></div>
        <div class="cockpit-nutrients">${nutrient('protein_g', '蛋白质', 'coral')}${nutrient('carbs_g', '碳水', 'cyan')}${nutrient('fat_g', '脂肪', 'orange')}</div>
        <div class="cockpit-meals">${mealRows || `<p class="cockpit-empty">${message(modules.meals, '暂无餐食')}</p>`}</div>
      </section>
      <section class="cockpit-panel cockpit-signals">${sectionHead('身体信号')}
        <div class="cockpit-signal-values">${metric('静息心率', metrics.restingHeartRate, 'bpm', `全天 ${format(d.minHeartRate)}–${format(d.maxHeartRate)}`, 'coral')}${metric('夜间 HRV', metrics.hrv, 'ms', rawStatus(analysis().hrvStatus) || '', 'cyan')}${metric('平均压力', d.averageStress, '/ 100', '', 'orange')}</div>
        <div class="cockpit-chart-title"><span>身体电量</span><span>+${format(d.batteryCharged)} / −${format(d.batteryDrained)}</span></div>${data.batterySeries?.length ? lineChart(data.batterySeries, { min: 0, max: 100, height: 112, label: '身体电量日内变化' }) : '<div class="cockpit-chart-placeholder">—</div>'}
        <div class="cockpit-chart-title"><span>睡眠阶段</span><span>${duration(metrics.sleepMinutes)}</span></div>${phaseBar(data.sleep?.stages)}<div class="cockpit-sleep-stages">${[['deep','深睡'],['light','浅睡'],['rem','REM'],['awake','清醒']].map(([k,n]) => `<span>${n} <b>${format(data.sleep?.stages?.[k])}</b> 分</span>`).join('')}</div>
      </section>
      <section class="cockpit-panel cockpit-reports">${sectionHead('健康报告')}${report('daily', '日报')}${report('weekly', '周报')}</section>
      <section class="cockpit-panel cockpit-activity">${sectionHead('运动与活动', `近 ${state.days} 天`)}<div class="cockpit-activity-totals">${metric('活动消耗', d.activeCalories, 'kcal', '', 'orange')}${metric('全天距离', d.distanceKm, 'km', '', 'cyan')}</div>${(data.recentActivities || []).slice(0, 3).map(a => `<div class="cockpit-activity-row"><div><strong>${escapeHtml(a.name || sportName(a.sport))}</strong><small>${escapeHtml(a.date)} · ${escapeHtml(a.time || '')}</small></div><div><b>${duration(a.durationMinutes)}</b><small>${format(a.distanceKm)} km · ${format(a.calories)} kcal</small></div></div>`).join('') || '<p class="cockpit-empty">暂无运动</p>'}</section>
      <section class="cockpit-panel cockpit-journal">${sectionHead('个人记录', modules.journal?.status === 'ready' ? `${journal.length} 条` : '')}${journal.length ? journal.map(e => `<p class="cockpit-journal-text">${escapeHtml(e.text || e.content || e.note || '')}</p>`).join('') : `<p class="cockpit-empty">${message(modules.journal, '暂无记录')}</p>`}</section>
    </div></div>`;
}
