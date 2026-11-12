const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(require.resolve('../home-dashboard.js'), 'utf8');

test('changing dates discards late module responses and keeps failures independent', async () => {
  const pending = [];
  const context = vm.createContext({ fetch: url => new Promise(resolve => pending.push({url, resolve})) });
  vm.runInContext(source + '\nglobalThis.Dashboard = HomeDashboardData;', context);
  const model = new context.Dashboard(() => {});
  const first = model.open('2026-10-20');
  const second = model.open('2026-10-21');
  for (const item of pending.filter(i => i.url.includes('2026-10-21'))) item.resolve({ok: !item.url.includes('weekly'), json: async () => ({date:'2026-10-21'})});
  await second;
  for (const item of pending.filter(i => i.url.includes('2026-10-20'))) item.resolve({ok:true,json:async()=>({date:'2026-10-20'})});
  await first;
  assert.equal(model.modules.meals.data.date, '2026-10-21');
  assert.equal(model.modules.daily.status, 'ready');
  assert.equal(model.modules.weekly.status, 'error');
  const requests = pending.length;
  await model.open('2026-10-21');
  assert.equal(pending.length, requests);
});

test('cockpit preserves zero and unknown totals, labels partial sums, escapes records and contains no navigation', () => {
  const e = value => String(value ?? '').replaceAll('<','&lt;').replaceAll('>','&gt;');
  const context = vm.createContext({
    state:{date:'2026-10-21',days:7,data:{}},
    homeDashboard:{modules:{meals:{status:'ready',data:{summary:{meals:2,totals:{calories:{value:0,complete_meals:1},protein_g:{value:null,complete_meals:0}}},entries:[{time:'12:00',kind:'午餐',name:'<script>record</script>',items:[{calories:0}]}]}},daily:{status:'ready',data:{reports:[{state:'failed',period_start:'2026-10-21',summary:'invalid failed report'},{state:'completed',period_start:'2026-10-20',summary:'saved report',title:'日报'}]}},weekly:{status:'error'}}},
    mealEnergyDeficit: require('../meals.js').mealEnergyDeficit,m:()=>({}),daily:()=>({}),analysis:()=>({}),present:v=>typeof v==='number'&&Number.isFinite(v),format:v=>typeof v==='number'?String(v):'—',escapeHtml:e,
    isLoading:()=>false,icon:()=>'<svg></svg>',shiftDate:()=> '2026-10-22',rawStatus:()=>null,duration:()=> '—',sportName:()=> '运动',heading:()=>'',dateControls:()=>'',connectionNote:()=>'',lineChart:()=>'',phaseBar:()=>'',
  });
  vm.runInContext(source, context);
  const html = vm.runInContext('cockpitHome()',context);
  assert.match(html, /<strong>0<small>kcal/);
  assert.match(html, /部分合计/);
  assert.match(html, /蛋白质<\/span><strong>—/);
  assert.match(html, /&lt;script&gt;record/);
  assert.match(html, /saved report/);
  assert.doesNotMatch(html, /invalid failed report|data-goto|<a\b|<script>/);
});
