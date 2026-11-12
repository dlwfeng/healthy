const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const NutritionReference = require('../nutrition-reference.js');

function harness({ date = '2026-10-17', query = '', fetch } = {}) {
  const context = {
    module: { exports: {} }, NutritionReference, URL, URLSearchParams,
    HealthShare: { button: () => '' },
    location: { href: `http://127.0.0.1:3060/${query}#food`, search: query },
    document: { addEventListener() {} },
    fetch: fetch || (async () => ({ ok: true, json: async () => ({ entries: [] }) })),
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../meals.js'), 'utf8'), context);
  const exports = context.module.exports;
  const journal = new exports.MealJournal({ onChange() {}, today: () => date });
  journal.profileStatus = 'ready';
  journal.profile = { age: '18-49', sex: 'male' };
  return { ...exports, journal, context };
}

const fixture = (overrides = {}) => ({
  id: 'test-meal', date: '2026-10-16', time: '12:00', kind: '午餐',
  name: '测试午餐', nutrition_source: 'manual',
  items: [{ name: '测试食物', portion: '1 份', calories: 567, protein_g: 17, carbs_g: 74, fat_g: 25 }],
  ...overrides,
});

test('recent seven dates cross month and year boundaries without losing empty days', () => {
  const { getMealWeek, getMealMonth } = harness();
  assert.equal(getMealWeek('2026-01-02').join(','), '2025-12-27,2025-12-28,2025-12-29,2025-12-30,2025-12-31,2026-01-01,2026-01-02');
  assert.equal(getMealMonth('2024-02-10').days.length, 29);
});

test('zero intake stays zero, unknown intake stays null and partial totals are explicit', () => {
  const { summarizeDayMeals, mealMetricState } = harness();
  const summary = summarizeDayMeals([fixture({ items: [{ calories: 0, protein_g: null, carbs_g: 0, fat_g: null }] })]);
  assert.equal(summary.totals.calories.value, 0);
  assert.equal(summary.totals.protein_g.value, null);
  assert.equal(summary.totals.carbs_g.complete_meals, 1);
  assert.equal(mealMetricState({ value: 10, complete: false, range: { min: 1, max: 2 }, status: 'high' }).text, '部分合计');
  assert.equal(mealMetricState({ value: 0, complete: true, range: { min: 1, max: 2 }, status: 'low' }).kind, 'low');
});

test('uncertain estimates never display an in-range checkmark', () => {
  const { mealMetricState, journal } = harness();
  assert.equal(mealMetricState({ value: 100, complete: true, range: { min: 50, max: 200 }, status: 'unknown' }).text, '待核对');
  const bad = fixture({ items: [{ calories: 500, protein_g: 2, carbs_g: 2, fat_g: 2 }] });
  const metrics = journal.dayMetrics([bad]);
  assert.ok(Object.values(metrics).every(metric => metric.status === 'unknown'));
  assert.match(journal.renderMealDetail(bad), /暂不判断高低/);
});

test('day and meal displays retain units, complete ranges, and accessible comparisons', () => {
  const { mealComparisonMarkup, mealMetricModels } = harness();
  const markup = mealComparisonMarkup(mealMetricModels(NutritionReference.assess(fixture(), { age: '18-49', sex: 'male' })));
  assert.match(markup, /参考 675-900 kcal/);
  assert.match(markup, /低于参考/);
  assert.match(markup, /参考 84-146 g/);
  assert.match(markup, /热量 567 kcal，低于参考/);
  const snack = mealComparisonMarkup(mealMetricModels(NutritionReference.assess(fixture({ kind: '加餐' }), { age: '18-49', sex: 'male' })));
  assert.match(snack, /暂无参考/);
  assert.doesNotMatch(snack, /低于参考|高于参考/);
});

test('food comparisons name the meal upper bound and never invent a per-food target', () => {
  const { journal } = harness();
  const markup = journal.renderMealDetail(fixture());
  assert.match(markup, /占本餐参考上限 63%/);
  assert.match(markup, /非单种食物推荐量/);
  assert.match(markup, /<table class="meal-food-table">/);
  assert.match(markup, /1 份/);
});

test('comparison positions preserve zero, share a proportional scale, and flag capped outliers', () => {
  const { mealComparisonMarkup } = harness();
  const keys = ['calories', 'protein_g', 'carbs_g', 'fat_g'];
  const metrics = Object.fromEntries(keys.map((key, index) => [key, {
    value: [0, 100, 250, 50][index], complete: true,
    range: { min: 60, max: 100 }, status: ['low', 'within', 'high', 'unknown'][index],
  }]));
  const markup = mealComparisonMarkup(metrics);
  const positions = [...markup.matchAll(/class="meal-range-point(?:\s+([^"]*))?" style="left:([\d.]+)%"/g)];
  assert.equal(positions.length, 3, 'uncertain estimates have no comparison marker');
  assert.equal(Number(positions[0][2]), 0, 'zero is anchored to the start');
  assert.ok(Math.abs(Number(positions[1][2]) - 200 / 3) < 0.001, 'upper bound is two thirds along the scale');
  assert.equal(Number(positions[2][2]), 100, 'outliers never escape the plot and remain a round dot');
  assert.match(markup, /碳水 250 g，高于参考/);
});

test('record text and photo attributes are escaped, including visible notes', () => {
  const { journal } = harness();
  const markup = journal.renderMealRow(fixture({ name: '<img src=x onerror=alert(1)>', note: '<script>secret</script>', photo_url: 'x" onerror="alert(1)' }));
  assert.doesNotMatch(markup, /<script>|src="x" onerror/);
  assert.match(markup, /&lt;script&gt;/);
  assert.match(markup, /x&quot; onerror=&quot;/);
});

test('meal photos open the shared viewer and multiple photos stay reachable', () => {
  const { journal } = harness();
  const urls = ['/api/meals/a/photos/0?v=1', '/api/meals/a/photos/1?v=1'];
  const meal = fixture({ photo_url: urls[0], photo_urls: urls });
  const row = journal.renderMealRow(meal);
  assert.match(row, /data-photo-urls=/);
  assert.match(row, /class="meal-photo-open" data-meal-photo="0"/);
  assert.match(row, /共 2 张/);
  const detail = journal.renderMealDetail(meal);
  assert.match(detail, /class="meal-photo-button" data-meal-photo="0"/);
  assert.match(detail, /class="meal-photo-button" data-meal-photo="1"/);
  assert.match(detail, /查看第 2 张照片，共 2 张/);
});

test('a single photo remains viewable without a redundant gallery', () => {
  const { journal } = harness();
  const meal = fixture({ photo_url: '/one.jpg' });
  const row = journal.renderMealRow(meal);
  assert.match(row, /class="meal-photo-open" data-meal-photo="0"/);
  assert.match(row, /data-photo-urls=/);
  assert.doesNotMatch(journal.renderMealDetail(meal), /meal-gallery/);
});

test('meal row displays SVG time icons, large photos, and meal content subtitles', () => {
  const { journal } = harness();
  const breakfast = journal.renderMealRow(fixture({ time: '08:15', photo_url: '/test.jpg' }));
  assert.match(breakfast, /<svg class="meal-kind-svg"/);
  assert.match(breakfast, /width="96" height="96"/);
  assert.match(breakfast, /class="meal-summary-meta"/);
  assert.match(breakfast, /class="meal-summary-heading"/);
  assert.match(breakfast, /class="meal-summary-sub"/);
  assert.match(breakfast, /测试食物/);

  const lunch = journal.renderMealRow(fixture({ time: '12:30' }));
  assert.match(lunch, /<svg class="meal-kind-svg"/);

  const dinner = journal.renderMealRow(fixture({ time: '18:45' }));
  assert.match(dinner, /<svg class="meal-kind-svg"/);

  const lateSnack = journal.renderMealRow(fixture({ time: '22:10' }));
  assert.match(lateSnack, /<svg class="meal-kind-svg"/);
});

test('expanding a meal exposes notes and estimate context without another disclosure', () => {
  const { journal } = harness();
  const markup = journal.renderMealDetail(fixture({ note: '午餐记录', analysis: { uncertainty: '照片份量为估算' } }));
  assert.match(markup, /<h4>备注<\/h4><p>午餐记录<\/p>/);
  assert.match(markup, /<h4>估算依据<\/h4><p>照片份量为估算<\/p>/);
  assert.doesNotMatch(markup, /<details|<summary/);
});

test('trend uses actual records, marks no-record dates, and distinguishes zero from missing', async () => {
  const entries = [fixture({ items: [{ name: '零值', calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }] })];
  const { journal } = harness({ fetch: async () => ({ ok: true, json: async () => ({ entries }) }) });
  journal.trendView = 'nutrition';
  await journal.open();
  const trend = journal.renderTrend();
  assert.equal((trend.match(/class="meal-chart-no-data"/g) || []).length, 6);
  assert.equal((trend.match(/class="meal-chart-bar /g) || []).length, 3);
  assert.equal(journal.selectedMealId, null);

  const twoDays = [
    fixture({ date: '2026-10-15', items: [{ calories: 500, protein_g: 20, carbs_g: 50, fat_g: 10 }] }),
    fixture({ date: '2026-10-16', items: [{ calories: 600, protein_g: 25, carbs_g: 60, fat_g: 15 }] })
  ];
  const { journal: j2 } = harness({ fetch: async () => ({ ok: true, json: async () => ({ entries: twoDays }) }) });
  j2.trendView = 'nutrition';
  await j2.open();
  const trendDefault = j2.renderTrend();
  assert.equal(j2.trendActiveMetric, null, 'starts with no metric selected');
  assert.doesNotMatch(trendDefault, /class="meal-chart-polyline"/, 'no polyline before clicking');

  j2.trendActiveMetric = 'protein_g';
  const trend2 = j2.renderTrend();
  assert.doesNotMatch(trend2, /<polyline|<path/, 'nutrition remains a bar chart after selecting a metric');
  assert.match(trend2, /meal-chart-band/, 'selected nutrient shows its reference band');
  assert.match(trend2, /class="meal-chart-bar-tooltip"/);
});

test('first days of a month fetch the preceding month for the seven-day comparison', async () => {
  const requests = [];
  const { journal } = harness({ date: '2026-11-02', fetch: async url => {
    requests.push(url);
    return { ok: true, json: async () => ({ entries: [fixture({ date: '2026-10-31' })] }) };
  } });
  journal.trendView = 'nutrition';
  await journal.open();
  assert.equal(requests.filter(url => url.includes('/api/meals?')).length, 2);
  assert.ok(requests.some(url => url.includes('start_date=2026-10-27&end_date=2026-11-02')));
  assert.match(journal.renderTrend(), /2026-10-31，1 餐/);
});

test('recent-day failure leaves monthly records available', async () => {
  const { journal } = harness({ date: '2026-11-02', fetch: async url => {
    if (url.includes('start_date=2026-10-27')) throw Error('network');
    return { ok: true, json: async () => ({ entries: [fixture({ date: '2026-11-01' })] }) };
  } });
  await journal.open();
  assert.equal(journal.status, 'ready');
  assert.equal(journal.trendStatus, 'error');
  assert.match(journal.render(), /暂时无法读取近 7 天数据/);
  assert.match(journal.render(), /测试午餐/);
});

test('a slower previous month request cannot overwrite the selected month', async () => {
  let release;
  const previous = new Promise(resolve => { release = resolve; });
  const { journal, context } = harness({ fetch: async url => {
    if (url.includes('start_date=2026-10-01')) await previous;
    return { ok: true, json: async () => ({ entries: [] }) };
  } });
  const first = journal.open();
  context.location.search = '?meal_date=2026-09-01';
  await journal.open();
  release();
  await first;
  assert.equal(journal.monthInfo.month, '2026-09');
  assert.equal(journal.trendDays.at(-1), '2026-09-30');
  assert.equal(journal.status, 'ready');
});

test('energy compares matching dates, preserves zero and surplus, and excludes incomplete calorie totals', () => {
  const { mealEnergyRows } = harness();
  const days = ['2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17'];
  const entries = [
    fixture({ date: days[0], items: [{ calories: 0 }] }),
    fixture({ date: days[1], items: [{ calories: 2600 }] }),
    fixture({ date: days[2], items: [{ calories: 500 }, { calories: null }] }),
  ];
  const rows = mealEnergyRows(days, entries, days.map((date, i) => ({ date, value: [0, 2200, 2000, 2100][i] })));
  assert.equal(rows[0].deficit, 0);
  assert.equal(rows[1].deficit, -400);
  assert.equal(rows[2].intake, 500);
  assert.equal(rows[2].partial, true);
  assert.equal(rows[2].deficit, null);
  assert.equal(rows[3].intake, null, 'no meals is unknown, not zero');
  assert.equal(rows[3].deficit, null);
  assert.equal(mealEnergyRows([days[0]], entries, [])[0].expenditure, null);
});

test('energy lines break across missing days and retain zero/negative coordinates', () => {
  const { mealLineSegments } = harness();
  const path = mealLineSegments([{ v: 100 }, { v: null }, { v: 0 }, { v: -50 }], 'v', i => i * 10, value => value);
  assert.equal(path, 'M0,100 M20,0 L30,-50');
});

test('energy defaults to three shared-scale lines, exposes surplus and a recoverable Garmin failure', async () => {
  const { journal } = harness({ fetch: async url => ({ ok: true, json: async () => url.includes('history')
    ? { points: [{ date: '2026-10-16', value: 300 }] }
    : { entries: [fixture()] } }) });
  assert.equal(journal.trendView, 'energy');
  await journal.open();
  await journal.loadEnergy();
  const chart = journal.renderTrend();
  assert.match(chart, /盈余 267/);
  assert.match(chart, /消耗 − 摄入/);
  assert.match(chart, /popover/);
  assert.doesNotMatch(chart, /preserveAspectRatio="none"|meal-energy-detail/);
  assert.match(chart, /漏记会使缺口偏大/);
  assert.equal((chart.match(/<path d=/g) || []).length, 3);
  journal.energyStatus = 'error';
  journal.energyPoints = [];
  assert.match(journal.renderTrend(), /消耗暂不可用/);
  assert.match(journal.renderTrend(), /data-meal-energy-retry/);
  assert.match(journal.renderTrend(), /567/);
});

test('late Garmin responses cannot overwrite a newer date range', async () => {
  let release;
  const stale = new Promise(resolve => { release = resolve; });
  const { journal } = harness({ fetch: async url => {
    if (url.includes('date=2026-10-17')) return stale;
    return { ok: true, json: async () => ({ points: [{ date: '2026-09-30', value: 2300 }] }) };
  } });
  journal.trendDays = ['2026-10-17'];
  const previous = journal.loadEnergy();
  journal.trendDays = ['2026-09-30'];
  await journal.loadEnergy();
  release({ ok: true, json: async () => ({ points: [{ date: '2026-10-17', value: 9999 }] }) });
  await previous;
  assert.equal(journal.energyPoints[0].value, 2300);
});


test('daily energy summaries show deficits, surpluses and unknown incomplete intake', () => {
  const { journal } = harness();
  journal.energyPoints = [{date:'2026-10-17',value:2200}];
  assert.match(journal.renderDayEnergy('2026-10-17', [fixture({date:'2026-10-17',items:[{calories:700}]})]), /热量缺口<\/span><strong>1,500/);
  assert.match(journal.renderDayEnergy('2026-10-17', [fixture({date:'2026-10-17',items:[{calories:2500}]})]), /热量盈余<\/span><strong>300/);
  assert.match(journal.renderDayEnergy('2026-10-17', [fixture({date:'2026-10-17',items:[{calories:700}, {calories:null}]})]), /热量缺口<\/span><strong>—/);
  assert.match(journal.renderDayEnergy('2026-10-17', []), /热量缺口<\/span><strong>—/);
});

test('a 31-day month requests the earliest record when the 30-day range cannot cover it', async () => {
  const calls = [];
  const { journal } = harness({fetch:async url => { calls.push(url); const date = new URL(url, 'http://localhost').searchParams.get('date'); return {ok:true,json:async()=>({points:[{date,value:2200}]})}; }});
  journal.trendDays = ['2026-10-31'];
  journal.rawEntries = [fixture({date:'2026-10-01'})];
  await journal.loadEnergy();
  assert.ok(calls.some(url => url.includes('date=2026-10-31&days=30')));
  assert.ok(calls.some(url => url.includes('date=2026-10-01&days=7')));
  assert.equal(journal.energyPoints.length, 2);
});
