const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(require.resolve('../home-dashboard.js'), 'utf8');
function setup(fetch = async () => ({ok:true,json:async()=>({})})) {
  const context = vm.createContext({fetch, console, Intl, Date, setTimeout, clearTimeout, NutritionReference:require('../nutrition-reference.js')});
  vm.runInContext(source + '\nglobalThis.Dashboard = HomeDashboardData;',context);
  return new context.Dashboard(()=>{});
}
function ready(model, date = '2026-11-12') {
  model.date = date;
  for (const key of ['meals','daily','weekly','journal','body','zepp','profile']) model.modules[key] = {status:'ready',data:{}};
  return model;
}

test('date changes discard late responses for Garmin and Zepp while module errors remain independent', async () => {
  const pending=[];
  const model=setup(url=>new Promise(resolve=>pending.push({url,resolve})));
  const first=model.open('2026-11-10'),firstRequests=pending.slice();
  const offset=pending.length;
  const second=model.open('2026-11-11'),secondRequests=pending.slice(offset);
  assert.equal(secondRequests.length,7);
  for(const item of secondRequests)item.resolve({ok:!item.url.includes('kind=weekly'),json:async()=>({date:'2026-11-11'})});
  await second;
  for(const item of firstRequests)item.resolve({ok:true,json:async()=>({date:'2026-11-10'})});
  await first;
  assert.equal(model.modules.meals.data.date,'2026-11-11');
  assert.equal(model.modules.body.data.date,'2026-11-11');
  assert.equal(model.modules.zepp.data.date,'2026-11-11');
  assert.equal(model.modules.weekly.status,'error');
  assert.equal(model.modules.daily.status,'ready');
  const requests=pending.length;
  await model.open('2026-11-11');
  assert.equal(pending.length,requests);
});

test('six-region home preserves zero, unknowns, partial sums, escaping and the energy deficit', () => {
  const model=ready(setup());
  model.modules.meals.data={summary:{meals:2,totals:{calories:{value:0,complete_meals:1},protein_g:{value:null,complete_meals:0}}},entries:[{time:'12:00',kind:'午餐',name:'<script>record</script>',items:[{calories:0}]}]};
  const html=model.render({date:model.date,metrics:{steps:0},daily:{calories:100}});
  for(const title of ['摘要','运动','饮食','身体成分','报告','个人记录']) assert.match(html,new RegExp(`<h2[^>]*>${title}</h2>`));
  assert.match(html,/部分合计/);
  assert.match(html,/&lt;script&gt;record&lt;\/script&gt;/);
  assert.doesNotMatch(html,/<script>|NaN|Infinity/);
  assert.match(html,/热量缺口/);
  assert.match(html,/0<small>kcal/);
  model.modules.meals.data.summary.totals.calories.complete_meals=2;
  const complete=model.render({date:model.date,metrics:{steps:0},daily:{calories:100}});
  assert.match(complete,/100<small>kcal/);
});

test('historical body measurements never use the latest future reading', () => {
  const model=ready(setup(),'2026-11-10');
  model.modules.zepp.data={latest:{measuredAt:'2026-11-11T01:00:00Z',weightKg:99},daily:[{measuredAt:'2026-11-09T01:00:00Z',weightKg:71.5}]};
  const html=model.render({date:model.date});
  assert.match(html,/71\.5/);
  assert.match(html,/2026-11-09/);
  assert.doesNotMatch(html,/99<small>kg/);
});

test('reports exclude failed periods and link each preview directly to its own detail', () => {
  const model=ready(setup());
  const summary='真实摘要'.repeat(80)+'<img src=x onerror=alert(1)>';
  model.modules.daily.data={reports:[
    {state:'failed',period_start:'2026-11-11',summary:'failed marker'},
    {state:'completed',period_start:'2026-11-12',period_end_exclusive:'2026-11-14',summary:'future marker'},
    {id:'1',state:'completed',period_start:'2026-11-11',period_end_exclusive:'2026-11-12',summary,title:'已完成报告'}
  ]};
  const html=model.render({date:model.date});
  assert.doesNotMatch(html,/failed marker|future marker|<img src=x/);
  assert.match(html,/已完成报告/);
  assert.match(html,/data-home-report="1"/);
  assert.match(html,/href="\?report=1#reports"/);
  assert.doesNotMatch(html,/report-disclosure|阅读报告/);
  assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt;/);
});

test('home card classes cannot inherit the legacy sleep/battery grid spans', () => {
  const model=ready(setup());
  const html=model.render({date:model.date});
  assert.doesNotMatch(html,/class="(?:card|grid|sleep-card|battery-card)\b/);
  assert.match(html,/class="hh-card/);
});

test('a date change does not reopen old chart tables during cleanup', () => {
  const model=ready(setup());
  model.mountedDate='2026-11-11';
  model.root={querySelectorAll:()=>[{open:true,dataset:{homeDisclosure:'体重'}}]};
  model.destroy();
  assert.equal(model.expanded.size,0);
});


test('homepage header does not expose date selection', () => {
  const context=vm.createContext({
    state:{data:{},theme:'light'},homeDashboard:{render:()=>''},
    heading:(title,description,controls)=>`<h1>${title}</h1>${controls}`,
    dateControls:()=>'<input type="date">',isLoading:()=>false,connectionNote:()=>''
  });
  vm.runInContext(source+'\nglobalThis.html = cockpitHome();',context);
  assert.doesNotMatch(context.html,/type="date"/);
});


test('three nutrient cards compare with daily reference amounts, independently of macro energy shares', () => {
  const model=ready(setup());
  model.modules.profile.data={status:'ready',profile:{age_band:'18-49',sex:'male'}};
  model.modules.meals.data={summary:{meals:1,totals:{protein_g:{value:42,complete_meals:1},carbs_g:{value:183,complete_meals:1},fat_g:{value:37.5,complete_meals:1}}},entries:[]};
  const html=model.render({date:model.date});
  assert.equal((html.match(/>占每日参考上限 50%<\/div>/g)||[]).length,3);
  assert.match(html,/每日参考 56–84 g/);
  assert.match(html,/每日参考 281–366 g/);
  assert.match(html,/每日参考 50–75 g/);
  assert.doesNotMatch(html,/占宏量营养供能/);
  model.modules.meals.data.summary.totals.fat_g.value=90;
  assert.match(model.render({date:model.date}),/占每日参考上限 120%/);
  model.modules.profile.data={status:'missing',profile:null};
  const unavailable=model.render({date:model.date});
  assert.match(unavailable,/每日参考暂不可用/);
  assert.doesNotMatch(unavailable,/占每日参考上限/);
});
