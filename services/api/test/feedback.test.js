import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { mkdtemp,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { nextPoll,nightWindow,validateTopic,startFeedbackScheduler,runFields,quotaState,feedbackTimeline,processNodes,nodeActions } from '../src/feedback.js';

test('priority clocks use Shanghai midnight and exact interval boundaries',()=>{
 const before=new Date('2026-10-25T17:59:59Z');
 assert.equal(nextPoll('low',before).toISOString(),'2026-10-25T18:00:00.000Z');
 assert.equal(nextPoll('low',new Date('2026-10-25T18:00:00Z')).toISOString(),'2026-10-26T18:00:00.000Z');
 assert.equal(+nextPoll('high',before)-before,300000);
 assert.equal(+nextPoll('medium',before)-before,3600000);
 assert.equal(nightWindow(new Date('2026-10-25T18:00:00Z')),true);
 assert.equal(nightWindow(new Date('2026-10-25T22:00:00Z')),false);
});
test('new issues require a valid explicit urgency and bounded original text',()=>{
 assert.equal(validateTopic({title:' x ',body:' y ',priority:'high'}).title,'x');
 for(const body of [{title:'',body:'x',priority:'high'},{title:'x',body:'y',priority:'urgent'},{title:'x',body:'y',priority:'high',target:'shell'}])assert.throws(()=>validateTopic(body));
});
test('private users need no pairing; only worker APIs require a service credential',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'feedback-auth-'));const previous=process.env.FEEDBACK_CONFIG_PATH;
 process.env.FEEDBACK_CONFIG_PATH=join(directory,'config.json');await writeFile(process.env.FEEDBACK_CONFIG_PATH,JSON.stringify({workerToken:'worker-fixture'}));
 const {handleFeedback:handler}=await import('../src/feedback.js?fixture='+Date.now());
 async function request(path,token,method='GET',body={},marker=true){const req=Readable.from(method==='GET'?[]:[JSON.stringify(body)]);req.headers={authorization:token?'Bearer '+token:'','idempotency-key':'fixture-12345',...(marker?{'x-feedback-client':'health'}:{})};req.method=method;const res={};await handler(req,res,new URL('http://localhost'+path),(r,status,data)=>Object.assign(r,{status,data}),{list:async()=>[],heartbeat:async()=>({ok:true}),create:async()=>({id:'1'})});return res;}
 try{
  assert.equal((await request('/api/feedback/topics')).status,200);
  assert.equal((await request('/api/feedback/topics',null,'POST')).status,200);
  assert.equal((await request('/api/feedback/topics',null,'POST',{},false)).status,403);
  assert.equal((await request('/api/internal/feedback/heartbeat',null,'POST')).status,401);
  assert.equal((await request('/api/internal/feedback/heartbeat','worker-fixture','POST')).status,200);
 }finally{if(previous===undefined)delete process.env.FEEDBACK_CONFIG_PATH;else process.env.FEEDBACK_CONFIG_PATH=previous;await rm(directory,{recursive:true,force:true});}
});
test('a stale quota reading is never presented as the current remaining percentage',()=>{
  const now=1_700_000_000_000;
  const fresh=quotaState({remaining_percent:14,checked_at:(now-60_000)/1000},now);
  assert.equal(fresh.stale,false);assert.equal(fresh.remaining_percent,14);assert.equal(fresh.age_seconds,60);
  const old=quotaState({remaining_percent:14,checked_at:(now-7_200_000)/1000},now);
  assert.equal(old.stale,true);assert.equal(old.remaining_percent,14);
  assert.equal(quotaState({remaining_percent:null,error:'额度读取失败',checked_at:now/1000},now).stale,true);
  assert.equal(quotaState(null,now),null);
  // A worker that stopped reporting cannot vouch for the percentage it left behind.
  assert.equal(quotaState({remaining_percent:14,checked_at:(now-60_000)/1000},now,false).stale,true);
});
test('scheduler exceptions release the busy guard and allow the next poll',async()=>{
 let count=0;const original=console.error;console.error=()=>{};
 const worker=startFeedbackScheduler({store:{async poll(){count++;if(count===1)throw Error('offline');}},interval:999999});
 try{await new Promise(resolve=>setImmediate(resolve));await worker.tick();assert.equal(count,2);}finally{worker.stop();console.error=original;}
});

test('execution fields validate types and never retain an error on a successful result',()=>{
 assert.deepEqual(runFields({status:'blocked',worktree_name:'issue-1',error_type:'environment',error_reason:'cache unavailable'}),{worktree_name:'issue-1',error_type:'environment',error_reason:'cache unavailable'});
 assert.equal(runFields({status:'ready',error_type:'validation',error_reason:'old failure'}).error_reason,'');
 assert.throws(()=>runFields({status:'blocked',worktree_name:'../../outside',error_type:'environment',error_reason:'x'}));
 assert.throws(()=>runFields({status:'blocked',error_type:'made-up',error_reason:'x'}));
});

test('timeline combines separate stores newest first with explicit entry types',()=>{
 const items=feedbackTimeline([{id:'9',created_at:'2026-10-26T01:00:00Z',author:'developer'}],[{id:'1',created_at:'2026-10-26T02:00:00Z',level:'error'}]);
 assert.deepEqual(items.map(x=>x.kind),['log','reply']);
});


test('only the latest unresolved process node offers valid choices',()=>{
 const nodes=[{id:3,node_title:'new',node_actions:['accept','rollback']},{id:2,node_title:'old',node_actions:['accept','rollback']},{id:1,node_title:'selected',node_actions:['accept','rollback'],selected_action:'rollback'}];
 let out=processNodes({status:'review'},nodes,[]);assert.deepEqual(out.map(n=>n.available_actions),[['accept','rollback'],[],[]]);
 out=processNodes({status:'running'},nodes,[]);assert.ok(out.every(n=>n.available_actions.length===0));
 const timeline=feedbackTimeline([{id:7,created_at:'2026-10-26T01:00:00Z'}],[{id:8,created_at:'2026-10-26T02:00:00Z',node_title:'过程'},{id:9,created_at:'2026-10-26T03:00:00Z'}]);assert.deepEqual(timeline.map(n=>n.kind),['log','node','reply']);
});

test('failed completion offers a push retry without redeployment',()=>{
 assert.deepEqual(nodeActions('blocked',{operation:'accept',merged:true}),['accept','reply']);
 assert.deepEqual(nodeActions('done',{operation:'accept',pushed:true}),[]);
});
