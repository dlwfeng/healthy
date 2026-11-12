const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function harness(fetch) {
  const context = { URL, URLSearchParams, AbortController, location:{search:'',hash:'#activity_stats',href:'http://127.0.0.1:3060/#activity_stats'},history:{replaceState(){}},document:{addEventListener(){}},fetch };
  vm.runInNewContext(fs.readFileSync(require.resolve('../activities.js'),'utf8')+'\nthis.ActivityJournal=ActivityJournal;',context);
  const shiftDate=(date,offset)=>{const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+offset);return d.toISOString().slice(0,10)};
  return new context.ActivityJournal({onChange(){},helpers:{today:()=> '2026-10-25',shiftDate,validDate:v=>/^\d{4}-\d{2}-\d{2}$/.test(v||''),escapeHtml:v=>String(v||'').replaceAll('<','&lt;'),sportName:v=>v,icon:()=>'',timeLabel:()=>''}});
}
test('a late range response cannot replace the current filtered range',async()=>{
  const pending=[];const j=harness(()=>new Promise(resolve=>pending.push(resolve)));
  const old=j.load();j.start='2026-10-19';const recent=j.load();
  pending[1]({ok:true,json:async()=>({items:[{id:'2',date:'2026-10-20'}]})});await recent;
  pending[0]({ok:true,json:async()=>({items:[{id:'1',date:'2026-10-01'}]})});await old;
  assert.equal(j.data.items[0].id,'2');assert.equal(j.status,'ready');
});
test('a late detail response cannot replace a newly selected activity, including cached selection',async()=>{
  const pending=[];const j=harness(()=>new Promise(resolve=>pending.push(resolve)));
  const first=j.select('1');const second=j.select('2');
  pending[1]({ok:true,json:async()=>({activity:{id:'2'}})});await second;
  pending[0]({ok:true,json:async()=>({activity:{id:'1'}})});await first;
  assert.equal(j.active,'2');assert.equal(j.detail.activity.id,'2');
  const third=j.select('3');await j.select('2');
  pending[2]({ok:true,json:async()=>({activity:{id:'3'}})});await third;
  assert.equal(j.detail.activity.id,'2');assert.equal(j.detailStatus,'ready');
});
test('a date-range read failure leaves no stale data that could appear as valid zero statistics',async()=>{
  const j=harness(async()=>({ok:false}));j.data={items:[{id:'1'}]};await j.load();
  assert.equal(j.status,'error');assert.equal(j.data,null);assert.match(j.render(),/暂时无法读取活动/);assert.doesNotMatch(j.render(),/累计时长/);
});
