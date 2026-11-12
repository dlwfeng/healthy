const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function harness() {
  const context = {
    module: { exports: {} }, URL, URLSearchParams, window: {},
    document: { addEventListener() {} },
  };
  vm.runInNewContext(
    fs.readFileSync(require.resolve('../feedback.js'), 'utf8') +
      '\nthis.HealthFeedback = HealthFeedback;',
    context,
  );
  const board = new context.HealthFeedback({
    onChange() {},
    escapeHtml: (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
  });
  return board;
}

test('the board shows the remaining quota reported by the worker', () => {
  const board = harness();
  board.worker = { online: true, quota: { remaining_percent: 0, resets_at: 1792953031, stale: false } };
  const label = board.quotaLabel();
  assert.match(label, /5 小时剩余 0%/);
});

test('a stale quota reading is never presented as the current percentage', () => {
  const board = harness();
  board.worker = { online: true, quota: { remaining_percent: 14, resets_at: 1792953031, stale: true } };
  const label = board.quotaLabel();
  assert.match(label, /额度待更新/);
  assert.doesNotMatch(label, /14%/);
});

test('an unknown quota reports that it is pending instead of guessing a percentage', () => {
  const board = harness();
  board.worker = { online: true, quota: { remaining_percent: null, error: '额度读取失败', stale: true } };
  assert.match(board.quotaLabel(), /额度待更新/);
  board.worker = { online: true, quota: null };
  assert.equal(board.quotaLabel(), '');
});

test('execution details render fixed fields safely and require a reply when blocked',()=>{
 const board=harness();
 const html=board.executionInfo({status:'blocked',runs:[{worktree_name:'issue-2',error_type:'validation',error_reason:'<script>unsafe</script>'}]});
 assert.match(html,/issue-2/);assert.match(html,/验证失败/);assert.match(html,/&lt;script&gt;/);
 assert.doesNotMatch(html,/<script>/);assert.match(html,/补充回复/);
});

test('replies and system logs share ascending time order with distinct safe styles',()=>{
 const board=harness();
 const entries=board.timeline({comments:[{id:'1',author:'developer',body:'模型结果',created_at:'2026-10-26T01:00:00Z'}],logs:[{id:'2',level:'error',body:'<script>测试失败</script>',created_at:'2026-10-26T02:00:00Z'}]});
 assert.equal(entries[0].kind,'reply');assert.equal(entries[1].kind,'log');
 const log=board.renderEntry(entries[1]),reply=board.renderEntry(entries[0]);
 assert.match(log,/fb-log error/);assert.match(log,/系统日志 · 错误/);assert.doesNotMatch(log,/<script>/);
 assert.match(reply,/fb-comment developer/);assert.match(reply,/开发助手/);assert.doesNotMatch(reply,/健康助手/);
});

test('consecutive system checks collapse without moving replies out of order',()=>{
 const board=harness();
 const html=board.renderTimeline({timeline:[
  {kind:'log',level:'warning',body:'最新检查',created_at:'2026-10-26T10:00:00Z'},
  {kind:'log',level:'info',body:'之前检查',created_at:'2026-10-26T09:00:00Z'},
  {kind:'reply',author:'developer',body:'开发回复',created_at:'2026-10-26T08:00:00Z'},
  {kind:'log',level:'info',body:'更早检查',created_at:'2026-10-26T07:00:00Z'},
 ]});
 assert.equal((html.match(/class="fb-log-group"/g)||[]).length,2);
 assert.match(html,/2 条/);
 assert.ok(html.indexOf('更早检查')<html.indexOf('开发回复'));
 assert.ok(html.indexOf('开发回复')<html.indexOf('之前检查'));
 assert.ok(html.indexOf('之前检查')<html.indexOf('最新检查'));
 assert.doesNotMatch(html,/<details class="fb-log-group" open/);
});


test('process choices stay inside chronological nodes and disappear after selection',()=>{
 const board=harness();board.mode='detail';
 const node={id:9,kind:'node',node_title:'部署完成，等待验收',body:'请选择操作',created_at:'2026-10-26T01:00:00Z',node_actions:['accept','rollback'],available_actions:['accept','rollback']};
 board.topic={id:3,title:'test',body:'test',status:'review',priority:'high',target:'web',comments:[],logs:[],runs:[],timeline:[node]};
 let html=board.render();assert.match(html,/data-entry-kind="node"/);assert.match(html,/data-node="9"/);assert.match(html,/完成关闭/);assert.match(html,/退回上一版本/);
 assert.ok(html.indexOf('处理过程')<html.indexOf('data-fb="accept"'));assert.doesNotMatch(html,/data-fb="now"/);
 const selected=board.renderNode({...node,selected_action:'rollback',selected_at:'2026-10-26T02:00:00Z'});
 assert.match(selected,/已选择：/);assert.match(selected,/退回上一版本/);assert.doesNotMatch(selected,/<button/);
 const history=board.renderNode({...node,available_actions:[]});assert.doesNotMatch(history,/<button/);assert.match(history,/此节点已结束/);
});

test('priority tags combine selections and preserve status and search when toggled',async()=>{
 const board=harness(),queries=[];board.status='review';board.search='滚动条';
 board.api=async path=>{if(path.startsWith('topics?')){queries.push(new URLSearchParams(path.split('?')[1]));return {topics:[]};}return {};};
 board.page=4;await board.action('filter-priority',undefined,'high');
 await board.action('filter-priority',undefined,'low');
 assert.equal(queries.at(-1).get('priority'),'high,low');assert.equal(queries.at(-1).get('status'),'review');assert.equal(queries.at(-1).get('q'),'滚动条');assert.equal(board.page,1);
 await board.action('filter-priority',undefined,'high');assert.equal(queries.at(-1).get('priority'),'low');
 await board.action('filter-priority',undefined,'low');assert.equal(queries.at(-1).get('priority'),'');
 await board.action('filter-priority',undefined,'medium');await board.action('filter-priority',undefined,'');assert.equal(board.priority,'');
 await board.action('filter-status',undefined,'done');assert.equal(board.status,'done');assert.equal(board.priority,'');
});


test('pause is a filterable topic status with only resume and close actions',()=>{
 const board=harness();assert.equal(board.states.paused,'已暂停');
 assert.match(board.statusBadge({status:'paused'}),/已暂停/);
 assert.equal(board.scheduleLabel({status:'paused'}),'自动处理已暂停');
 board.mode='detail';board.topic={id:1,title:'test',body:'test',status:'paused',priority:'high',comments:[],timeline:[]};
 const html=board.render();assert.match(html,/data-fb="resume"/);assert.doesNotMatch(html,/data-fb="pause"|data-fb="now"/);
 for(const status of ['done','closed'])assert.equal(board.scheduleLabel({status}),'已停止');
});

test('feedback list removes leading hook icon and renders colored status badge',()=>{
 const board=harness();board.mode='list';
 board.items=[
  {id:1,title:'已完成主题',status:'done',priority:'medium',target:'both',comment_count:3,updated_at:'2026-10-26T10:00:00Z'},
  {id:2,title:'处理中主题',status:'running',priority:'high',target:'web',comment_count:1,updated_at:'2026-10-26T11:00:00Z'},
 ];
 const html=board.render();
 assert.doesNotMatch(html,/fb-topic-icon/);
 assert.match(html,/<span class="fb-status done">/);
 assert.match(html,/<span class="fb-status running">/);
 for(const st of ['queued','running','paused','blocked','needs_info','ready','review','done','closed']){
  const badge=board.statusBadge({status:st});
  assert.match(badge,new RegExp(`class="fb-status ${st}"`));
  assert.match(badge,new RegExp(board.states[st]));
 }
});

