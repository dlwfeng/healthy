import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { sanitizePhoto } from './meals.js';

export const priorityNames = {high:'高',medium:'中',low:'低'};
export const stateNames = {queued:'待处理',running:'处理中',paused:'已暂停',blocked:'处理受阻',needs_info:'待补充',ready:'待发布',review:'待验收',done:'已完成',closed:'已关闭'};
export function nextPoll(priority, now=new Date()) {
 if(priority==='high') return new Date(+now+300000);
 if(priority==='medium') return new Date(+now+3600000);
 const local=new Date(+now+8*3600000);
 const next=new Date(Date.UTC(local.getUTCFullYear(),local.getUTCMonth(),local.getUTCDate(),2)-8*3600000);
 if(+next<=+now) next.setUTCDate(next.getUTCDate()+1);
 return next;
}
export function nightWindow(now=new Date()) {const h=new Date(+now+8*3600000).getUTCHours();return h>=2&&h<6;}
export const runErrorTypes=['none','environment','validation','code','requirement','merge','quota','connection','timeout','cancelled','unknown'];
export function runFields(body){
 const type=body.error_type??(body.status==='blocked'?'unknown':'none');
 const name=body.worktree_name??null, reason=body.error_reason??(body.status==='blocked'?body.reply:'');
 if(!runErrorTypes.includes(type)||name!==null&&(typeof name!=='string'||!/^[a-zA-Z0-9._-]{1,100}$/.test(name))||typeof reason!=='string'||reason.length>18000)throw fail('invalid_parameters');
 return {worktree_name:name,error_type:body.status==='ready'?'none':type,error_reason:body.status==='ready'?'':reason};
}
const fail=(code,status=400)=>Object.assign(new Error(code),{status});
export const quotaStaleSeconds=900;
export function quotaState(quota, now=Date.now(), online=true){
 if(!quota||typeof quota!=='object')return null;
 const checked=Number(quota.checked_at);
 const age=Number.isFinite(checked)?Math.max(0,Math.round((now-checked*1000)/1000)):null;
 return {...quota,age_seconds:age,stale:!!quota.error||!online||age===null||age>quotaStaleSeconds};
}
export function validateTopic(b) {
 if(typeof b.title!=='string'||!b.title.trim()||b.title.length>160||typeof b.body!=='string'||!b.body.trim()||b.body.length>12000||!priorityNames[b.priority]||!['both','web','mobile'].includes(b.target??'both'))throw fail('invalid_parameters');
 return {...b,title:b.title.trim(),body:b.body.trim(),target:b.target??'both'};
}
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:4});
let initialized;
async function ready(){if(!process.env.DATABASE_URL)throw fail('database_unavailable',503);initialized??=Promise.resolve().then(async()=>{for(const name of ['005-feedback.sql','006-feedback-logs.sql','007-feedback-process-nodes.sql','008-feedback-pause-semantics.sql','009-feedback-unified-state.sql'])await pool.query(await readFile(new URL('../migrations/'+name,import.meta.url),'utf8'));}).catch(e=>{initialized=null;throw e;});await initialized;}
async function transaction(fn){await ready();const c=await pool.connect();try{await c.query('BEGIN');const r=await fn(c);await c.query('COMMIT');return r;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
async function comment(c,id,author,body,key){return (await c.query('INSERT INTO feedback_comments(topic_id,author,body,request_key) VALUES($1,$2,$3,$4) ON CONFLICT(request_key) DO UPDATE SET request_key=excluded.request_key RETURNING *',[id,author,body,key??randomUUID()])).rows[0];}
const nodeTitles={created:'意见已提交',queued:'任务已排队',action:'操作记录',run_started:'开始处理',worker_lost:'处理已中断',offline:'开发助手未连接'};
export const actionLabels={accept:'完成关闭',rollback:'退回上一版本',deploy:'部署',reply:'补充意见',auto_deploy:'自动部署'};
export function nodeActions(status,result={}){
 if(status==='review')return ['accept','rollback'];
 if(status==='ready')return ['deploy'];
 if(status==='needs_info')return ['reply'];
 if(status==='blocked')return result.operation==='accept'?['accept','reply']:result.operation==='rollback'?['rollback','reply']:result.merged?['deploy','reply']:['reply'];
 return [];
}
async function log(c,id,level,event,body,key,node={}){
 const title=node.title??nodeTitles[event]??null;
 const actions=node.actions??(['worker_lost','offline'].includes(event)?['reply']:[]);
 return (await c.query('INSERT INTO feedback_logs(topic_id,level,event,body,request_key,node_title,node_actions) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(request_key) DO NOTHING RETURNING *',[id,level,event,body,key??randomUUID(),title,JSON.stringify(actions)])).rows[0];
}
export function feedbackTimeline(comments,logs){return [...comments.map(c=>({...c,kind:'reply'})),...logs.map(l=>({...l,kind:l.node_title?'node':'log'}))].sort((a,b)=>+new Date(b.created_at)-+new Date(a.created_at)||Number(b.id)-Number(a.id)||a.kind.localeCompare(b.kind));}
export function processNodes(topic,logs,runs){
 const latest=logs.find(l=>l.node_title&&l.node_actions?.length&&!l.selected_action);
 const allowed=nodeActions(topic.status,runs[0]?.result||{});
 return logs.map(l=>({...l,available_actions:l===latest?(l.node_actions||[]).filter(a=>allowed.includes(a)):[]}));
}
async function chooseNode(c,topic,action,nodeId){
 const rows=(await c.query("SELECT * FROM feedback_logs WHERE topic_id=$1 AND node_title IS NOT NULL AND jsonb_array_length(node_actions)>0 ORDER BY created_at DESC,id DESC",[topic.id])).rows;
 const node=rows.find(n=>!n.selected_action);
 if(nodeId!==undefined&&(!node||String(node.id)!==String(nodeId)))throw fail('choice_already_made',409);
 if(node&&!(node.node_actions||[]).includes(action))throw fail('invalid_state',409);
 if(node)await c.query('UPDATE feedback_logs SET selected_action=$2,selected_at=now() WHERE id=$1 AND selected_action IS NULL',[node.id,action]);
}
const configPath=process.env.FEEDBACK_CONFIG_PATH||'/app/data/feedback/config.json';
async function authenticated(req){try{const conf=JSON.parse(await readFile(configPath,'utf8'));const expected=conf.workerToken;const value=(req.headers.authorization||'').replace(/^Bearer /,'');return typeof expected==='string'&&value.length===expected.length&&timingSafeEqual(Buffer.from(value),Buffer.from(expected));}catch{return false;}}
const when=d=>new Date(d).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false});
export const feedbackStore={
 async status(){await ready();const w=(await pool.query('SELECT heartbeat_at,quota FROM feedback_worker WHERE id=true')).rows[0];const online=!!w&&Date.now()-new Date(w.heartbeat_at)<90000;return {online,last_seen:w?.heartbeat_at??null,quota:quotaState(w?.quota,Date.now(),online),model:'gemini-3.8-flash',effort:'medium',executor:'pi'};},
 async list(q){await ready();const priority=[...new Set(q.getAll('priority').flatMap(v=>v.split(',')).filter(Boolean))],status=q.get('status')||'',search=(q.get('q')||'').slice(0,160);const page=Math.max(1,Math.min(10000,Number(q.get('page'))||1));return (await pool.query(`SELECT t.*, (SELECT count(*)::int FROM feedback_comments c WHERE c.topic_id=t.id) comment_count,(SELECT count(*)::int FROM feedback_comments c WHERE c.topic_id=t.id AND c.id>t.read_comment AND c.author<>'user') unread_count FROM feedback_topics t WHERE (cardinality($1::text[])=0 OR priority=ANY($1::text[])) AND ($2='' OR status=$2) AND ($3='' OR title ILIKE '%'||$3||'%' OR body ILIKE '%'||$3||'%') ORDER BY updated_at DESC,id DESC LIMIT 30 OFFSET $4`,[priority,status,search,(page-1)*30])).rows;},
 async detail(id){await ready();const t=(await pool.query('SELECT * FROM feedback_topics WHERE id=$1',[id])).rows[0];if(!t)throw fail('not_found',404);const comments=(await pool.query('SELECT * FROM feedback_comments WHERE topic_id=$1 ORDER BY id',[id])).rows;const runs=(await pool.query('SELECT id,state,stage,worktree_name,error_type,error_reason,result,created_at,finished_at FROM feedback_runs WHERE topic_id=$1 ORDER BY created_at DESC LIMIT 5',[id])).rows;const attachments=(await pool.query('SELECT id FROM feedback_attachments WHERE topic_id=$1 ORDER BY id',[id])).rows;const logs=processNodes(t,(await pool.query('SELECT * FROM feedback_logs WHERE topic_id=$1 ORDER BY created_at DESC,id DESC',[id])).rows,runs);return {...t,comments,logs,timeline:feedbackTimeline(comments,logs),runs,attachments};},
 async create(body,key){const b=validateTopic(body);const photos=[];if(b.photos!==undefined&&(!Array.isArray(b.photos)||b.photos.length>3))throw fail('invalid_parameters');for(const photo of b.photos||[])photos.push(await sanitizePhoto(photo));return transaction(async c=>{const t=(await c.query(`INSERT INTO feedback_topics(title,body,priority,target,next_poll_at,request_key) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(request_key) DO UPDATE SET request_key=excluded.request_key RETURNING *`,[b.title,b.body,b.priority,b.target,nextPoll(b.priority),key])).rows[0];if(!(await c.query("SELECT 1 FROM feedback_logs WHERE topic_id=$1 AND event='created' LIMIT 1",[t.id])).rowCount){await log(c,t.id,'info','created',`意见已提交，紧急程度：${priorityNames[t.priority]}。下次检查：${when(t.next_poll_at)}。`,`${key}:created`);for(const p of photos)await c.query('INSERT INTO feedback_attachments(topic_id,mime,bytes) VALUES($1,$2,$3)',[t.id,p.mime,p.bytes]);}return t;});},
 async reply(id,body,key){if(typeof body!=='string'||!body.trim()||body.length>12000)throw fail('invalid_parameters');return transaction(async c=>{const t=(await c.query('SELECT * FROM feedback_topics WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!t)throw fail('not_found',404);if((await c.query('SELECT 1 FROM feedback_comments WHERE request_key=$1',[key])).rowCount)return t;await comment(c,id,'user',body.trim(),key);if(['blocked','needs_info'].includes(t.status==='paused'?t.resume_status:t.status))await chooseNode(c,t,'reply');await c.query(`UPDATE feedback_topics SET revision=revision+1,resume_status=CASE WHEN status='paused' AND resume_status IN ('needs_info','blocked','ready','review') THEN 'queued' ELSE resume_status END,status=CASE WHEN status IN ('needs_info','blocked','ready','review') THEN 'queued' ELSE status END,updated_at=now() WHERE id=$1`,[id]);return t;});},
 async action(id,b){return transaction(async c=>{const t=(await c.query('SELECT * FROM feedback_topics WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!t)throw fail('not_found',404);let status=t.status,resumeStatus=t.resume_status,priority=t.priority,next=t.next_poll_at;const a=b.action;
 if(status==='paused'&&!['priority','resume','close'].includes(a))throw fail('invalid_state',409);
 if(t.status==='blocked'&&['retry','reopen'].includes(a))throw fail('reply_required',409);
 if(a==='priority'){if(!priorityNames[b.priority])throw fail('invalid_parameters');priority=b.priority;next=nextPoll(priority);}
 else if(a==='pause'){if(['done','closed','paused'].includes(status))throw fail('invalid_state',409);resumeStatus=status==='running'?'queued':status;status='paused';}
 else if(a==='resume'){if(status!=='paused')throw fail('invalid_state',409);if((await c.query("SELECT 1 FROM feedback_runs WHERE topic_id=$1 AND state='running'",[id])).rowCount)throw fail('pause_pending',409);status=resumeStatus;resumeStatus=null;next=nextPoll(priority);}
 else if(a==='close'){status='closed';resumeStatus=null;}
 else if(['accept','deploy','rollback'].includes(a)){
  if(['accept','rollback'].includes(a)&&!['review','blocked'].includes(status)||a==='deploy'&&!['ready','blocked'].includes(status))throw fail('invalid_state',409);
  if((await c.query("SELECT 1 FROM feedback_runs WHERE topic_id=$1 AND state IN ('queued','running')",[id])).rowCount)throw fail('invalid_state',409);
  const last=(await c.query('SELECT result FROM feedback_runs WHERE topic_id=$1 ORDER BY created_at DESC LIMIT 1',[id])).rows[0];
  if(a==='accept'&&status==='blocked'&&last?.result?.operation!=='accept')throw fail('invalid_state',409);
  if(a==='rollback'&&status==='blocked'&&last?.result?.operation!=='rollback')throw fail('invalid_state',409);
  const source=(await c.query("SELECT id,result FROM feedback_runs WHERE topic_id=$1 AND CASE WHEN $2 IN ('rollback','accept') THEN result->>'deployed'='true' AND COALESCE(result->>'operation','') NOT IN ('rollback','accept') ELSE result->>'merged'='true' END ORDER BY created_at DESC LIMIT 1",[id,a])).rows[0];
  if(!source||a==='rollback'&&!source.result?.deployed)throw fail('invalid_state',409);
  await chooseNode(c,t,a,b.node_id);
  const runId=randomUUID();await c.query('INSERT INTO feedback_runs(id,topic_id,revision,result) VALUES($1,$2,$3,$4)',[runId,id,t.revision,{operation:a,source_run_id:source.id,source_result:source.result}]);
  await c.query('UPDATE feedback_topics SET active_run=$2 WHERE id=$1',[id,runId]);status='queued';resumeStatus=null;next=new Date();
 }
 else if(a==='reopen'||a==='retry'){status='queued';resumeStatus=null;next=nextPoll(priority);}
 else if(a==='now'){if(['paused','closed','done','blocked','needs_info','review','running'].includes(status))throw fail('invalid_state',409);next=new Date();}
 else throw fail('invalid_parameters');
 await c.query('UPDATE feedback_topics SET status=$2,resume_status=$3,priority=$4,next_poll_at=$5,updated_at=now() WHERE id=$1',[id,status,resumeStatus,priority,next]);
 await log(c,id,'info','action',({pause:'已暂停自动处理。',resume:'已恢复自动处理。',close:'主题已关闭。',accept:'验收已确认，已安排推送；推送成功后完成关闭。',deploy:'已安排直接部署。',rollback:'已安排退回上一版本。',reopen:'已重新打开主题。',retry:'已安排重新处理。',now:'已安排立即检查。',priority:`紧急程度已调整为${priorityNames[priority]}。`})[a]);
 return {ok:true};});},
 async read(id,cursor){await ready();await pool.query('UPDATE feedback_topics SET read_comment=GREATEST(read_comment,$2) WHERE id=$1 AND $2<=(SELECT COALESCE(max(id),0) FROM feedback_comments WHERE topic_id=$1)',[id,cursor]);},
 async poll(now=new Date()){return transaction(async c=>{
  // Transaction advisory lock also serializes separate API instances.
  if(!(await c.query('SELECT pg_try_advisory_xact_lock(306005) locked')).rows[0].locked)return;
  const stale=(await c.query(`SELECT * FROM feedback_runs WHERE state='running' AND heartbeat_at < $1 FOR UPDATE`,[new Date(+now-120000)])).rows;
  for(const r of stale){await c.query("UPDATE feedback_runs SET state='failed',finished_at=$2,stage='执行器失联',error_type='connection',error_reason='开发助手心跳中断' WHERE id=$1",[r.id,now]);await c.query("UPDATE feedback_topics SET status=CASE WHEN status IN ('paused','done','closed') THEN status ELSE 'blocked' END,resume_status=CASE WHEN status='paused' THEN 'blocked' ELSE NULL END,active_run=null WHERE id=$1 AND active_run=$2",[r.topic_id,r.id]);await log(c,r.topic_id,'error','worker_lost',r.result?.operation==='accept'?'推送执行器心跳中断，请核对远端状态后重试完成。':'开发助手心跳中断，本次任务已标记失败。保留已知成果；等待新增回复后继续。',`${r.id}:lost`,{actions:r.result?.operation==='accept'?['accept','reply']:['reply']});}
  const worker=(await c.query('SELECT * FROM feedback_worker WHERE id=true')).rows[0];const online=worker&&+now-new Date(worker.heartbeat_at)<90000;
  const topics=(await c.query(`SELECT * FROM feedback_topics WHERE status IN ('queued','ready') AND NOT EXISTS (SELECT 1 FROM feedback_runs r WHERE r.topic_id=feedback_topics.id AND r.state IN ('queued','running')) AND next_poll_at<=$1 ORDER BY CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,next_poll_at LIMIT 100 FOR UPDATE`,[now])).rows;
  for(const t of topics){const pollId=randomUUID(),next=nextPoll(t.priority,now);let note,outcome;
   const r=(await c.query("SELECT * FROM feedback_runs WHERE topic_id=$1 AND state IN ('queued','running') ORDER BY created_at DESC LIMIT 1",[t.id])).rows[0];
   if(t.status==='blocked'){outcome='blocked_wait';note='本主题处理受阻，已跳过自动执行，等待你新增回复后继续。';}
   else if(r){outcome=r.state;note=r.state==='running'?`任务仍在执行，当前阶段：${r.stage}。`:'已在开发队列中，等待执行器领取。';}
   else if(t.status==='ready'){const source=(await c.query("SELECT id,result FROM feedback_runs WHERE topic_id=$1 AND result->>'merged'='true' ORDER BY created_at DESC LIMIT 1",[t.id])).rows[0];if(source){await c.query("UPDATE feedback_logs SET selected_action='auto_deploy',selected_at=now() WHERE id=(SELECT id FROM feedback_logs WHERE topic_id=$1 AND node_title IS NOT NULL AND node_actions ? 'deploy' AND selected_action IS NULL ORDER BY created_at DESC,id DESC LIMIT 1)",[t.id]);const id=randomUUID();await c.query('INSERT INTO feedback_runs(id,topic_id,revision,result) VALUES($1,$2,$3,$4)',[id,t.id,t.revision,{operation:'deploy',source_run_id:source.id,source_result:source.result}]);await c.query("UPDATE feedback_topics SET active_run=$2,status='queued' WHERE id=$1",[t.id,id]);outcome='queued';note='已安排直接部署，部署后等待你验收。';}else{outcome='blocked_wait';note='没有可部署的代码记录，等待用户补充。';await c.query("UPDATE feedback_topics SET status='blocked' WHERE id=$1",[t.id]);}}
   else if(['needs_info','review'].includes(t.status)){outcome='waiting';note=({needs_info:'等待你补充信息。',ready:'代码已合并回项目目录，等待发布。',review:'等待你测试验收。'})[t.status];}
   else if(!online){outcome='offline';note='开发助手未连接，本次未启动开发；主题已受阻，等待你新增回复后继续。';await c.query("UPDATE feedback_topics SET status='blocked' WHERE id=$1",[t.id]);}
   else if(t.priority==='low'&&!nightWindow(now)){outcome='night_wait';note='当前不在夜间执行窗口，留待下次夜间检查。';}
   else {const id=randomUUID();await c.query('INSERT INTO feedback_runs(id,topic_id,revision) VALUES($1,$2,$3)',[id,t.id,t.revision]);await c.query('UPDATE feedback_topics SET active_run=$2 WHERE id=$1',[t.id,id]);outcome='queued';note='已加入开发队列，将在启动前检查 5 小时剩余额度。';}
   await c.query('INSERT INTO feedback_polls(id,topic_id,scheduled_at,checked_at,outcome) VALUES($1,$2,$3,$4,$5)',[pollId,t.id,t.next_poll_at,now,outcome]);
   await log(c,t.id,['offline','blocked_wait'].includes(outcome)?'warning':'info',outcome,`检查时间：${when(now)}。${note} 下次检查：${when(next)}。`,`${pollId}:reply`);
   await c.query('UPDATE feedback_topics SET last_poll_at=$2,next_poll_at=$3 WHERE id=$1',[t.id,now,next]);
  }
 });},
 async heartbeat(b){await ready();if(typeof b.worker_id!=='string'||b.worker_id.length>120)throw fail('invalid_parameters');await pool.query('INSERT INTO feedback_worker(id,worker_id,heartbeat_at,quota) VALUES(true,$1,now(),$2) ON CONFLICT(id) DO UPDATE SET worker_id=$1,heartbeat_at=now(),quota=COALESCE($2,feedback_worker.quota)',[b.worker_id,b.quota??null]);return {ok:true};},
 async claim(b){return transaction(async c=>{await c.query('SELECT pg_advisory_xact_lock(306005)');if((await c.query("SELECT 1 FROM feedback_runs WHERE state='running'")).rowCount)return {run:null};const r=(await c.query(`SELECT r.* FROM feedback_runs r JOIN feedback_topics t ON t.id=r.topic_id WHERE r.state='queued' AND t.status='queued' AND (r.result->>'operation' IN ('accept','deploy','rollback') OR t.priority<>'low' OR (now() AT TIME ZONE 'Asia/Shanghai')::time BETWEEN '02:00' AND '05:59:59') ORDER BY CASE t.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,r.created_at LIMIT 1 FOR UPDATE OF r,t SKIP LOCKED`)).rows[0];if(!r)return {run:null};await c.query("UPDATE feedback_runs SET state='running',worker_id=$2,started_at=now(),heartbeat_at=now(),stage=CASE WHEN result->>'operation'='accept' THEN '推送已验收改动' WHEN result->>'operation' IN ('deploy','rollback') THEN '准备部署操作' ELSE '检查开发额度' END WHERE id=$1",[r.id,b.worker_id]);await c.query("UPDATE feedback_topics SET status='running' WHERE id=$1",[r.topic_id]);const topic=(await c.query('SELECT * FROM feedback_topics WHERE id=$1',[r.topic_id])).rows[0];await log(c,r.topic_id,'info','run_started',r.result?.operation==='accept'?'开始推送已验收改动。':r.result?.operation==='rollback'?'开始退回上一版本。':r.result?.operation==='deploy'?'开始部署。':'开发助手开始处理本轮需求。',`${r.id}:started`);const comments=(await c.query("SELECT author,body,created_at FROM feedback_comments WHERE topic_id=$1 AND author<>'system' ORDER BY id DESC LIMIT 50",[r.topic_id])).rows.reverse();const previousChange=(await c.query("SELECT result FROM feedback_runs WHERE topic_id=$1 AND result->>'merged'='true' AND result->>'commit' IS NOT NULL ORDER BY created_at DESC LIMIT 1",[r.topic_id])).rows[0]?.result;return {run:{...r,revision:topic.revision,topic,comments,previous_change:previousChange}};});},
 async progress(id,b){await ready();const r=(await pool.query("UPDATE feedback_runs SET heartbeat_at=now(),stage=$3,worktree_name=COALESCE($4,worktree_name) WHERE id=$1 AND worker_id=$2 AND state='running' RETURNING topic_id",[id,b.worker_id,String(b.stage||'开发中').slice(0,120),b.worktree_name??null])).rows[0];if(!r)throw fail('lease_lost',409);const t=(await pool.query('SELECT revision,status FROM feedback_topics WHERE id=$1',[r.topic_id])).rows[0];return {cancel:['paused','done','closed'].includes(t.status),revision:t.revision};},
 async finish(id,b){return transaction(async c=>{const r=(await c.query('SELECT * FROM feedback_runs WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!r||r.worker_id!==b.worker_id)throw fail('lease_lost',409);if(r.state!=='running')return {ok:true};if(!['ready','review','closed','done','needs_info','blocked','queued'].includes(b.status)||typeof b.reply!=='string'||!b.reply.trim()||b.reply.length>18000)throw fail('invalid_parameters');if(b.status==='done'&&(r.result?.operation!=='accept'||b.result?.pushed!==true))throw fail('invalid_parameters');const fields=runFields(b);const t=(await c.query('SELECT * FROM feedback_topics WHERE id=$1 FOR UPDATE',[r.topic_id])).rows[0];let status=b.status;if(t.revision!==b.revision)status='queued';if(['closed','done'].includes(t.status))status=t.status;await c.query("UPDATE feedback_runs SET state=$2,stage=$3,finished_at=now(),result=$4,worktree_name=COALESCE($5,worktree_name),error_type=$6,error_reason=$7 WHERE id=$1",[id,b.status==='blocked'?'failed':'finished',stateNames[b.status],b.result??{},fields.worktree_name,fields.error_type,fields.error_reason]);await c.query("UPDATE feedback_topics SET status=$2,resume_status=$3,active_run=null,updated_at=now() WHERE id=$1",[t.id,t.status==='paused'&&!['done','closed'].includes(status)?'paused':status,t.status==='paused'&&!['done','closed'].includes(status)?(fields.error_type==='cancelled'?'queued':status):null]);const modelReply=Object.hasOwn(b,'development_reply')?b.development_reply:(!b.system?b.reply:null);if(modelReply!==null&&modelReply!==undefined&&(typeof modelReply!=='string'||!modelReply.trim()||modelReply.length>18000))throw fail('invalid_parameters');if(modelReply)await comment(c,t.id,'developer',modelReply,`${id}:final`);await log(c,t.id,b.status==='blocked'?(fields.error_type==='quota'?'warning':'error'):'info','run_finished',b.system?b.reply:`处理结果：${stateNames[b.status]}。${fields.error_reason||''}${b.result?.deployed?(b.result?.operation==='rollback'?' 已退回上一版本并部署。':' 已部署，请测试后选择退回上一版本或完成关闭。'):b.result?.merged?' 修改已合并回主目录，部署未完成。':''}${b.result?.checks?.length?'\n检查：\n'+b.result.checks.join('\n'):''}`,`${id}:system-final`,{title:b.status==='review'?'部署完成，等待验收':stateNames[b.status],actions:nodeActions(b.status,b.result||{})});return {ok:true};});},
};

async function jsonBody(req){let n=0,s='';for await(const chunk of req){n+=chunk.length;if(n>7500000)throw fail('body_too_large',413);s+=chunk;}try{return JSON.parse(s||'{}');}catch{throw fail('invalid_json');}}
export async function handleFeedback(req,res,url,respond,store=feedbackStore){
 const internal=url.pathname.startsWith('/api/internal/feedback/');if(!internal&&!url.pathname.startsWith('/api/feedback'))return false;
 try{
  if(url.pathname==='/api/feedback/status'&&req.method==='GET'){respond(res,200,{...(await store.status()),private_access:true});return true;}
  if(internal&&!await authenticated(req))throw fail('worker_auth_required',401);
  if(!internal&&req.method!=='GET'&&req.headers['x-feedback-client']!=='health')throw fail('forbidden',403);
  const path=url.pathname.replace(internal?'/api/internal/feedback':'/api/feedback','');
  const b=req.method==='GET'?{}:await jsonBody(req);let out;
  if(internal){
   if(req.method!=='POST')throw fail('method_not_allowed',405);
   if(path==='/heartbeat')out=await store.heartbeat(b);
   else if(path==='/claim')out=await store.claim(b);
   else {const m=path.match(/^\/runs\/([a-f0-9-]{36})\/(progress|finish)$/);if(!m)throw fail('not_found',404);out=await store[m[2]](m[1],b);}
  }else if(path==='/topics'){
   if(req.method==='GET')out={topics:await store.list(url.searchParams)};
   else if(req.method==='POST'){const key=req.headers['idempotency-key'];if(typeof key!=='string'||!/^[a-zA-Z0-9-]{8,100}$/.test(key))throw fail('invalid_request_key');out={topic:await store.create(b,key)};}
   else throw fail('method_not_allowed',405);
  }else{
   const image=path.match(/^\/attachments\/(\d+)$/);
   if(image&&req.method==='GET'){await ready();const a=(await pool.query('SELECT mime,bytes FROM feedback_attachments WHERE id=$1',[image[1]])).rows[0];if(!a)throw fail('not_found',404);res.writeHead(200,{'Content-Type':a.mime,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(a.bytes);return true;}
   const m=path.match(/^\/topics\/([1-9]\d{0,17})(?:\/(comments|actions|read))?$/);if(!m)throw fail('not_found',404);
   if(!m[2]&&req.method==='GET')out={topic:await store.detail(m[1])};
   else if(m[2]==='comments'&&req.method==='POST'){const key=req.headers['idempotency-key'];if(typeof key!=='string'||!/^[a-zA-Z0-9-]{8,100}$/.test(key))throw fail('invalid_request_key');out=await store.reply(m[1],b.body,key);}
   else if(m[2]==='actions'&&req.method==='POST')out=await store.action(m[1],b);
   else if(m[2]==='read'&&req.method==='POST'){if(!/^\d{1,18}$/.test(String(b.cursor)))throw fail('invalid_parameters');await store.read(m[1],b.cursor);out={ok:true};}
   else throw fail('method_not_allowed',405);
  }
  respond(res,200,out??{ok:true});
 }catch(e){respond(res,e.status??503,{error:e.status?e.message:'feedback_unavailable'});}return true;
}
export function startFeedbackScheduler({store=feedbackStore,interval=15000}={}){let busy=false;async function tick(){if(busy)return;busy=true;try{await store.poll();}catch{console.error('feedback_poll_unavailable');}finally{busy=false;}}const timer=setInterval(tick,interval);timer.unref();void tick();return {stop(){clearInterval(timer);},tick};}
