import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

async function client(){
 const window={addEventListener(){}};
 vm.runInNewContext(await readFile(new URL('../../../apps/web/reports.js',import.meta.url),'utf8'),{window,document:{addEventListener(){}},setTimeout,clearTimeout,URLSearchParams,Date});
 return new window.HealthReports({onChange(){},helpers:{today:()=> '2026-10-16',shiftDate:(date,n)=>{const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}}});
}
test('weekly generation initially selects the last complete week instead of an incomplete current week',async()=>{
 const c=await client();c.clearDetail=()=>{};c.load=async()=>{};
 await c.action('kind',{dataset:{kind:'weekly'}});assert.equal(c.date,'2026-10-05');
});
test('clearing the date produces a recoverable message without querying an invalid date',async()=>{
 const c=await client();let calls=0;c.api=async()=>{calls++;};c.date='';await c.action('filter',{});assert.equal(calls,0);assert.match(c.message,/日期/);
});
test('an older report being regenerated is tracked even when it is outside the current archive page',async()=>{
 const c=await client();c.detail={id:'30',generated_at:'2026-10-16T00:00:00Z'};c.trackedRun={id:'task',report_id:'30',state:'running'};
 c.api=async path=>path.startsWith('health-reports?')?{reports:[],next_cursor:null}:path==='health-report-settings'?{schedules:[]}:{run:{id:'task',report_id:'30',state:'completed'}};
 let read;c.read=async(id,push)=>{read={id,push};};await c.load(false,true);assert.deepEqual(read,{id:'30',push:false});
});
test('detail exposes only the current report, with no version selector',async()=>{
 const c=await client();c.icon=()=>'';c.escapeHtml=v=>String(v);
 c.detail={id:'1',kind:'daily',period_start:'2026-10-15',title:'健康回顾',summary:'摘要',generated_at:'2026-10-16T00:00:00Z',timezone:'Asia/Shanghai',coverage:[],data_context:{},review_method:'source_validation_v1'};
 const html=c.render();
 assert.match(html,/健康回顾/);
 assert.doesNotMatch(html,/历史版本|报告版本|第 \d+ 版|data-report-version/);
});
test('archive renders without a selected report and keeps unverified claims out of the preview',async()=>{
 const c=await client();c.icon=()=>'';c.escapeHtml=v=>String(v);
 c.items=[{id:'1',kind:'daily',period_start:'2026-10-15',generated_at:'2026-10-16T00:00:00Z',state:'completed',title:'未核对的结论',summary:'未核对的摘要'}];
 c.status='ready';
 const html=c.render();
 assert.match(html,/健康日报/);
 assert.doesNotMatch(html,/未核对的结论|未核对的摘要/);
 assert.doesNotMatch(html,/试生成|事实审查|HTML 已检查/);
 assert.match(c.homeSummary(),/定时生成/);
 c.items[0].review_method='source_validation_v1';
 assert.match(c.render(),/未核对的结论/);
 assert.equal(c.homeSummary(),'未核对的摘要');
});
