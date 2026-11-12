// Run explicitly in the API container against the disposable verification database.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import pg from 'pg';
const url=new URL(process.env.DATABASE_URL);url.pathname='/'+(process.env.FEEDBACK_VERIFICATION_DATABASE||'feedback_verification');process.env.DATABASE_URL=url.toString();
const {feedbackStore:store}=await import(process.cwd()+'/src/feedback.js');
const db=new pg.Pool({connectionString:url.toString()});
let checks=0;
try{
 const t=await store.create({title:'fixture high',body:'verification only',priority:'high'},'database-fixture-high');
 const duplicate=await store.create({title:'fixture high',body:'verification only',priority:'high'},'database-fixture-high');assert.equal(t.id,duplicate.id);let d=await store.detail(t.id);assert.equal(d.comments.length,0);assert.equal(d.logs.length,1);checks++;
 await store.reply(t.id,'补充说明','fixture-comment-key');await store.reply(t.id,'补充说明','fixture-comment-key');assert.equal((await store.detail(t.id)).comments.length,1);checks++;
 const now=new Date();await db.query('UPDATE feedback_topics SET next_poll_at=$2 WHERE id=$1',[t.id,now]);await store.poll(now);d=await store.detail(t.id);assert.equal(d.logs.at(-1)?.kind,undefined);assert.equal(d.logs.find(l=>l.event==='offline').level,'warning');assert.equal(d.comments.length,1);assert.equal(d.runs.length,0);checks++;
 await db.query('UPDATE feedback_topics SET next_poll_at=$2 WHERE id=$1',[t.id,new Date(+now+1)]);await store.poll(new Date(+now+1));d=await store.detail(t.id);assert.equal(d.logs.some(l=>l.event==='blocked_wait'),false);assert.equal(d.comments.length,1);assert.equal(d.runs.length,0);checks++;
 await store.reply(t.id,'环境已恢复，请继续','fixture-resume-reply');assert.equal((await store.detail(t.id)).status,'queued');checks++;
 await store.heartbeat({worker_id:'fixture-worker'});await db.query('UPDATE feedback_topics SET next_poll_at=$2 WHERE id=$1',[t.id,new Date(+now+10)]);await store.poll(new Date(+now+10));const r=(await store.claim({worker_id:'fixture-worker'})).run;assert.equal(r.topic_id,t.id);assert.equal((await store.claim({worker_id:'second-worker'})).run,null);checks++;
 await db.query('UPDATE feedback_topics SET next_poll_at=$2 WHERE id=$1',[t.id,new Date(+now+11)]);await store.poll(new Date(+now+11));d=await store.detail(t.id);assert.equal(d.comments.length,2);assert.equal(d.logs.some(l=>l.event==='running'),false);checks++;
 const result={worker_id:'fixture-worker',revision:r.revision,status:'blocked',reply:'专项测试未通过',development_reply:'已修改显示逻辑，需要补充验证',system:true,worktree_name:'issue-fixture',error_type:'validation',error_reason:'fixture test failure'};
 await store.finish(r.id,result);await store.finish(r.id,result);d=await store.detail(t.id);assert.equal(d.comments.filter(c=>c.author==='developer').length,1);assert.equal(d.comments.at(-1).body,result.development_reply);assert.equal(d.logs.filter(l=>l.event==='run_finished').length,1);assert.equal(d.logs.find(l=>l.event==='run_finished').level,'error');assert.equal(d.runs[0].worktree_name,'issue-fixture');checks++;
 await store.reply(t.id,'继续','fixture-quota-reply');await db.query('UPDATE feedback_topics SET next_poll_at=$2 WHERE id=$1',[t.id,new Date(+now+12)]);await store.poll(new Date(+now+12));const quotaRun=(await store.claim({worker_id:'fixture-worker'})).run;const beforeQuota=(await store.detail(t.id)).comments.length;
 await store.finish(quotaRun.id,{worker_id:'fixture-worker',revision:quotaRun.revision,status:'blocked',reply:'额度不足，跳过开发',development_reply:null,system:true,error_type:'quota',error_reason:'剩余额度低于20%'});d=await store.detail(t.id);assert.equal(d.comments.length,beforeQuota);assert.equal(d.status,'blocked');assert.equal(d.logs.find(l=>l.request_key===`${quotaRun.id}:system-final`).level,'warning');checks++;
 const beforeActions=d.comments.length;await store.action(t.id,{action:'pause'});await store.action(t.id,{action:'resume'});await store.action(t.id,{action:'close'});d=await store.detail(t.id);assert.equal(d.comments.length,beforeActions);assert.equal(d.logs.filter(l=>l.event==='action').length,3);checks++;
 const t2=await store.create({title:'stale fixture',body:'verification',priority:'high'},'fixture-stale-topic');await db.query('UPDATE feedback_topics SET next_poll_at=$2 WHERE id=$1',[t2.id,new Date(+now+14)]);await store.poll(new Date(+now+14));const r2=(await store.claim({worker_id:'fixture-worker'})).run;await db.query("UPDATE feedback_runs SET heartbeat_at=now()-interval '5 minutes' WHERE id=$1",[r2.id]);await store.poll(new Date(+now+15));d=await store.detail(t2.id);assert.equal(d.comments.length,0);assert.ok(d.logs.some(l=>l.event==='worker_lost'&&l.level==='error'));checks++;
 // Historical system entries move once, without changing user/model replies or timestamps.
 const old=(await db.query("INSERT INTO feedback_comments(topic_id,author,body,created_at) VALUES($1,'system','历史测试超时','2026-10-25T01:00:00Z') RETURNING id",[t.id])).rows[0];
 const migration=await readFile(new URL('../migrations/006-feedback-logs.sql',import.meta.url),'utf8');await db.query(migration);await db.query(migration);d=await store.detail(t.id);assert.equal(d.logs.filter(l=>l.request_key===`legacy-comment:${old.id}`).length,1);assert.equal(d.comments.some(c=>c.author==='system'),false);assert.equal(d.logs.find(l=>l.request_key===`legacy-comment:${old.id}`).created_at.toISOString(),'2026-10-25T01:00:00.000Z');assert.equal(d.comments.length,beforeActions);checks++;
 const unread=(await store.list(new URLSearchParams())).find(x=>x.id===t.id);assert.equal(unread.unread_count,1);await store.read(t.id,d.comments.at(-1).id);assert.equal((await store.list(new URLSearchParams())).find(x=>x.id===t.id).unread_count,0);for(let i=1;i<d.timeline.length;i++)assert.ok(+new Date(d.timeline[i-1].created_at)>=+new Date(d.timeline[i].created_at));checks++;
 // Deploy/rollback are explicit single queued operations. Waiting states do not poll.
 const t3=await store.create({title:'delivery fixture',body:'verification',priority:'high',target:'web'},'fixture-delivery');
 await db.query('UPDATE feedback_topics SET next_poll_at=$2 WHERE id=$1',[t3.id,new Date(+now+20)]);await store.poll(new Date(+now+20));
 const dr=(await store.claim({worker_id:'fixture-worker'})).run;
 await store.finish(dr.id,{worker_id:'fixture-worker',revision:dr.revision,status:'review',reply:'deployed',development_reply:'done',result:{merged:true,deployed:true,changed_files:['apps/web/app.js'],rollback_base:'fixture',rollback_target:'fixture'}});
 const review=await store.detail(t3.id);const logsBefore=review.logs.length,runsBefore=review.runs.length;
 for(let n=1;n<=3;n++){await db.query('UPDATE feedback_topics SET next_poll_at=$2 WHERE id=$1',[t3.id,new Date(+now+20+n)]);await store.poll(new Date(+now+20+n));}
 let delivery=await store.detail(t3.id);assert.equal(delivery.runs.length,runsBefore);assert.equal(delivery.logs.length,logsBefore);assert.equal(delivery.status,'review');checks++;
 await assert.rejects(store.action(t3.id,{action:'now'}));
 const choice=review.timeline.find(n=>n.kind==='node'&&n.available_actions?.includes('rollback'));assert.ok(choice);
 await store.action(t3.id,{action:'rollback',node_id:choice.id});await assert.rejects(store.action(t3.id,{action:'rollback',node_id:choice.id}));
 const selected=(await store.detail(t3.id)).timeline.find(n=>String(n.id)===String(choice.id)&&n.kind==='node');assert.equal(selected.selected_action,'rollback');assert.ok(selected.selected_at);assert.deepEqual(selected.available_actions,[]);
 const rollback=(await store.claim({worker_id:'fixture-worker'})).run;assert.equal(rollback.result.operation,'rollback');assert.equal(rollback.result.source_run_id,dr.id);checks++;
 await store.finish(rollback.id,{worker_id:'fixture-worker',revision:rollback.revision,status:'closed',reply:'rolled back',development_reply:null,system:true,result:{deployed:true,operation:'rollback'}});
 delivery=await store.detail(t3.id);assert.equal(delivery.status,'closed');assert.equal('paused' in delivery,false);checks++;
 // Legacy ready is deployed exactly once without another model task.
 const t4=await store.create({title:'legacy ready',body:'verification',priority:'high',target:'web'},'fixture-ready');
 await db.query('UPDATE feedback_topics SET next_poll_at=$2 WHERE id=$1',[t4.id,new Date(+now+30)]);await store.poll(new Date(+now+30));const legacy=(await store.claim({worker_id:'fixture-worker'})).run;
 await store.finish(legacy.id,{worker_id:'fixture-worker',revision:legacy.revision,status:'ready',reply:'merged',development_reply:null,system:true,result:{merged:true,changed_files:[]}});
 await db.query('UPDATE feedback_topics SET next_poll_at=$2 WHERE id=$1',[t4.id,new Date(+now+31)]);await store.poll(new Date(+now+31));await store.poll(new Date(+now+32));
 const deploy=(await store.claim({worker_id:'fixture-worker'})).run;assert.equal(deploy.result.operation,'deploy');assert.equal((await store.detail(t4.id)).runs.length,2);checks++;
 await store.finish(deploy.id,{worker_id:'fixture-worker',revision:deploy.revision,status:'review',reply:'deployed',development_reply:null,system:true,result:{merged:true,deployed:true}});
 const acceptNode=(await store.detail(t4.id)).timeline.find(n=>n.kind==='node'&&n.available_actions?.includes('accept'));
 await assert.rejects(store.action(t4.id,{action:'accept',node_id:choice.id}),/choice_already_made/);
 await store.action(t4.id,{action:'accept',node_id:acceptNode.id});let accepted=await store.detail(t4.id);
 assert.equal(accepted.status,'queued');assert.equal('paused' in accepted,false);
 assert.equal(accepted.timeline.find(n=>n.kind==='node'&&String(n.id)===String(acceptNode.id)).selected_action,'accept');
 await assert.rejects(store.action(t4.id,{action:'accept',node_id:acceptNode.id}));
 // Completion is a single host operation, even for low priority, with retry after push failure.
 await db.query("UPDATE feedback_topics SET priority='low' WHERE id=$1",[t4.id]);
 let completion=(await store.claim({worker_id:'fixture-worker'})).run;
 assert.equal(completion.result.operation,'accept');assert.equal(completion.result.source_run_id,deploy.id);
 await assert.rejects(store.finish(completion.id,{worker_id:'fixture-worker',revision:completion.revision,status:'done',reply:'not pushed',system:true,result:{pushed:false}}),/invalid_parameters/);
 await store.finish(completion.id,{worker_id:'fixture-worker',revision:completion.revision,status:'blocked',reply:'push failed',system:true,error_type:'connection',result:{operation:'accept',deployed:true,pushed:false}});
 accepted=await store.detail(t4.id);assert.equal(accepted.status,'blocked');
 const retry=accepted.timeline.find(n=>n.kind==='node'&&n.available_actions?.includes('accept'));assert.ok(retry);
 const runCount=accepted.runs.length;await store.poll(new Date(Date.now()+86400000));assert.equal((await store.detail(t4.id)).runs.length,runCount);
 await store.action(t4.id,{action:'accept',node_id:retry.id});await assert.rejects(store.action(t4.id,{action:'accept',node_id:retry.id}));
 completion=(await store.claim({worker_id:'fixture-worker'})).run;
 await store.finish(completion.id,{worker_id:'fixture-worker',revision:completion.revision,status:'done',reply:'pushed',development_reply:null,system:true,result:{operation:'accept',deployed:true,pushed:true}});
 accepted=await store.detail(t4.id);assert.equal(accepted.status,'done');await assert.rejects(store.action(t4.id,{action:'pause'}));
 await db.query(await readFile(new URL('../migrations/007-feedback-process-nodes.sql',import.meta.url),'utf8'));
 assert.equal((await store.detail(t4.id)).timeline.find(n=>n.kind==='node'&&String(n.id)===String(acceptNode.id)).selected_action,'accept');checks++;


 // All current state comes from status, including migration and concurrent worker completion.
 await db.query("UPDATE feedback_topics SET status='closed',resume_status=null");
 const p=await store.create({title:'pause fixture',body:'verification',priority:'high'},'fixture-unified-pause');
 for(const original of ['queued','blocked','needs_info','ready','review']){
  await db.query('UPDATE feedback_topics SET status=$2,resume_status=null WHERE id=$1',[p.id,original]);
  await store.action(p.id,{action:'pause'});let paused=await store.detail(p.id);
  assert.equal(paused.status,'paused');assert.equal(paused.resume_status,original);assert.equal('paused' in paused,false);
  assert.ok((await store.list(new URLSearchParams({status:'paused'}))).some(t=>t.id===p.id));
  await assert.rejects(store.action(p.id,{action:'now'}));await assert.rejects(store.action(p.id,{action:'reopen'}));
  await store.poll(new Date(Date.now()+86400000));assert.equal((await store.claim({worker_id:'fixture-worker'})).run,null);
  await store.action(p.id,{action:'resume'});assert.equal((await store.detail(p.id)).status,original);checks++;
 }
 await store.action(p.id,{action:'pause'});await store.reply(p.id,'暂停中补充','fixture-paused-reply');
 assert.equal((await store.detail(p.id)).status,'paused');await store.action(p.id,{action:'resume'});assert.equal((await store.detail(p.id)).status,'queued');checks++;
 await store.heartbeat({worker_id:'fixture-worker'});await db.query('UPDATE feedback_topics SET next_poll_at=now() WHERE id=$1',[p.id]);await store.poll();
 await store.action(p.id,{action:'pause'});assert.equal((await store.claim({worker_id:'fixture-worker'})).run,null);
 await store.action(p.id,{action:'resume'});let running=(await store.claim({worker_id:'fixture-worker'})).run;assert.ok(running);
 await store.action(p.id,{action:'pause'});assert.equal((await store.progress(running.id,{worker_id:'fixture-worker'})).cancel,true);
 await assert.rejects(store.action(p.id,{action:'resume'}),/pause_pending/);
 await store.finish(running.id,{worker_id:'fixture-worker',revision:running.revision,status:'blocked',reply:'暂停',system:true,error_type:'cancelled'});
 assert.equal((await store.detail(p.id)).status,'paused');await store.action(p.id,{action:'resume'});assert.equal((await store.detail(p.id)).status,'queued');checks++;
 await db.query('UPDATE feedback_topics SET next_poll_at=now() WHERE id=$1',[p.id]);await store.poll();running=(await store.claim({worker_id:'fixture-worker'})).run;
 await store.action(p.id,{action:'pause'});await store.finish(running.id,{worker_id:'fixture-worker',revision:running.revision,status:'review',reply:'部署完成',system:true,result:{deployed:true}});
 assert.equal((await store.detail(p.id)).status,'paused');await store.action(p.id,{action:'resume'});assert.equal((await store.detail(p.id)).status,'review');checks++;
 await store.action(p.id,{action:'pause'});await store.action(p.id,{action:'close'});assert.equal((await store.detail(p.id)).resume_status,null);checks++;
 // Simulate the legacy column, migrate twice, then rerun startup migrations.
 await db.query('ALTER TABLE feedback_topics ADD COLUMN paused boolean NOT NULL DEFAULT false');
 await db.query("UPDATE feedback_topics SET status='review',paused=true WHERE id=$1",[p.id]);
 const unified=await readFile(new URL('../migrations/009-feedback-unified-state.sql',import.meta.url),'utf8');await db.query(unified);await db.query(unified);
 assert.equal((await store.detail(p.id)).status,'paused');assert.equal((await store.detail(p.id)).resume_status,'review');
 for(const name of ['005-feedback.sql','008-feedback-pause-semantics.sql','009-feedback-unified-state.sql'])await db.query(await readFile(new URL('../migrations/'+name,import.meta.url),'utf8'));
 assert.equal((await store.detail(p.id)).status,'paused');await assert.rejects(db.query("UPDATE feedback_topics SET status='queued' WHERE id=$1",[p.id]));checks++;
 console.log(JSON.stringify({database_checks:checks,passed:true}));
}catch(e){console.error(e);process.exitCode=1;}finally{await db.end();process.exit(process.exitCode||0);}
