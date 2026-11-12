import test from 'node:test';
import assert from 'node:assert/strict';
import {generateReport} from '../src/report-agent.js';
import {createReportInput} from '../src/report-input.js';
import {READ_TOOLS} from '../src/garmin.js';

for (const review of [false,true]) test(`report queries original tools and preserves raw evidence (review=${review})`,async()=>{
 const oldKey=process.env.MINIMAX_CN_API_KEY,oldReview=process.env.HEALTH_REPORT_INDEPENDENT_REVIEW;
 process.env.MINIMAX_CN_API_KEY='unused-test-key';
 if(review)process.env.HEALTH_REPORT_INDEPENDENT_REVIEW='on';else delete process.env.HEALTH_REPORT_INDEPENDENT_REVIEW;
 const snapshot=await createReportInput({run:{kind:'daily',period_start:'2026-10-20',period_end_exclusive:'2026-10-21',timezone:'Asia/Shanghai'}});
 if(!review) Object.assign(snapshot,{data_mode:'legacy_snapshot',evidence:{stale:{source:'old'}},rows:{garmin:{daily:[{steps:99999}]}},stats:[{value:99999}]});
 const raw={totalSteps:1234,restingHeartRate:53,providerField:{untouched:true}};
 let reads=0,sessions=0,disposed=0;
 const garmin={async listTools(){return READ_TOOLS.map(name=>({name,description:name,inputSchema:{type:'object',properties:{}}}));},async call(name,args){reads++;assert.equal(name,'get_user_summary');assert.deepEqual(args,{date:'2026-10-20'});return raw;}};
 try{
  const result=await generateReport({snapshot,garmin,recipeStore:{},skillText:'Independent fixture skill',
   sessionFactory:async(options)=>{
    const author=sessions++===0;
    assert.equal(options.thinkingLevel,'medium');assert.equal(options.noTools,'all');
    assert.equal(options.model.id,'MiniMax-M3.1-Flash');
    for(const forbidden of ['get_report_context','query_report_data','compute_report_stat','record_daily_status','create_workout','schedule_workout'])assert.ok(!options.tools.includes(forbidden),forbidden);
    for(const original of ['get_user_summary','get_sleep_data','get_meals','get_nutrition_trend','get_energy_balance','get_daily_status'])assert.ok(options.tools.includes(original),original);
    const call=async(name,args)=>JSON.parse((await options.customTools.find(t=>t.name===name).execute('fixture',args)).content[0].text);
    return {session:{subscribe:()=>()=>{},abort:async()=>{},dispose(){disposed++;},async prompt(prompt){
     if(author){
      assert.match(prompt,/2026-10-20/);assert.ok(!prompt.includes('providerField'));
      const value=await call('get_user_summary',{date:'2026-10-20'});
      assert.deepEqual(value,{...raw,evidence_id:'tool-1'});
      const accepted=await call('submit_health_report',{title:'原始工具报告',summary:'根据实际读取的数据。',html:'<article class="health-report"><p data-evidence="tool-1">步数1234</p></article>',evidence_ids:['tool-1'],suggestions:[]});
      assert.equal(accepted.accepted,true);
     }else{
      assert.match(prompt,/providerField/);
      assert.ok(!options.tools.includes('submit_health_report'));
      await call('review_health_report',{verdict:'pass',checked:['dates','numbers','sources','interpretation','charts'],issues:[]});
     }
    }}};
   }});
  assert.equal(reads,1);assert.equal(sessions,review?2:1);assert.equal(disposed,sessions);
  assert.equal(result.model,'minimax-cn/MiniMax-M3.1-Flash');
  assert.equal(snapshot.data_mode,'raw_tools_v1');assert.deepEqual(snapshot.evidence['tool-1'].value,raw);
  assert.deepEqual(snapshot.tool_results[0].arguments,{date:'2026-10-20'});
  assert.deepEqual(snapshot.coverage,[{source:'garmin',status:'available'}]);
  assert.equal(snapshot.rows,undefined);assert.equal(snapshot.stats,undefined);assert.equal(snapshot.evidence.stale,undefined);
  assert.match(result.html,/1234/);assert.equal(snapshot.review_method,review?'independent_fact_check_v1':'source_validation_v1');
 }finally{
  if(oldKey===undefined)delete process.env.MINIMAX_CN_API_KEY;else process.env.MINIMAX_CN_API_KEY=oldKey;
  if(oldReview===undefined)delete process.env.HEALTH_REPORT_INDEPENDENT_REVIEW;else process.env.HEALTH_REPORT_INDEPENDENT_REVIEW=oldReview;
 }
});
