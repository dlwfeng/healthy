const iconPaths = {
  drop: '<path d="M12 3c-2 3-7 7-7 12a7 7 0 0 0 14 0c0-5-5-9-7-12Z"/>',
  stairs: '<path d="M3 20h5v-5h5v-5h5V5h3"/>',
  scale: '<rect x="4" y="4" width="16" height="17" rx="3"/><path d="M8 8a6 6 0 0 1 8 0l-4 5Z"/>',
  home: '<path d="m3 10 9-7 9 7v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 21v-7h6v7"/>',
  report: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 17v-3m4 3v-5m4 5v-2"/>',
  library: '<path d="M4 4h4v16H4zM10 4h4v16h-4zM16 5l4-1 3 15-4 1z"/>',
  chart: '<path d="M3 3v18h18M6 15l4-5 4 3 6-8"/>',
  food: '<path d="M4 3v8a3 3 0 0 0 3 3h1v7M7 3v8M10 3v8m7-8v18m0-18c4 3 5 7 0 10"/>',
  run: '<circle cx="15" cy="4" r="2"/><path d="m7 21 3-5 3-3 3 2 4 1M5 12l5-3 4 1 3 3M10 9l1-4"/>',
  heart:
    '<path d="M20.8 8.5c0 4.3-8.8 10-8.8 10s-8.8-5.7-8.8-10a4.7 4.7 0 0 1 8.8-2.2 4.7 4.7 0 0 1 8.8 2.2Z"/>',
  moon: '<path d="M20.5 14.4A8.6 8.6 0 0 1 9.6 3.5 8.7 8.7 0 1 0 20.5 14.4Z"/>',
  bolt: '<path d="m13 2-9 11h7l-1 9 10-12h-7z"/>',
  calendar:
    '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18"/>',
  journal:
    '<path d="M5 3h12a2 2 0 0 1 2 2v16H7a2 2 0 0 1-2-2V3Z"/><path d="M5 7h14M9 12h6m-6 4h6"/>',
  book: '<path d="M12 5c-2-1.3-5-1.7-9-1v15c4-.7 7-.3 9 1 2-1.3 5-1.7 9-1V4c-4-.7-7-.3-9 1Z"/><path d="M12 5v15"/>',
  send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  chat: '<path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5 8.2 8.2 0 0 1-3-.6L4 20l1.6-4.5A7.5 7.5 0 1 1 20 11.5Z"/><path d="M9 11.5h.01M12.5 11.5h.01M16 11.5h.01" stroke-width="2.5"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  refresh:
    '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 7a7 7 0 0 1 12-1l2 3M4 15l2 3a7 7 0 0 0 12-1"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  steps:
    '<path d="M8 3c-2 0-3 3-3 5s1 3 3 3 3-1 3-3-1-5-3-5Zm8 7c-2 0-3 3-3 5s1 3 3 3 3-1 3-3-1-5-3-5Z"/><path d="M5 14h6v3a3 3 0 0 1-6 0Zm8 7h6"/>',
};
const icon = (name) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[name] || iconPaths.chart}</svg>`;

iconPaths.badminton='<ellipse cx="14" cy="8" rx="5" ry="7" transform="rotate(35 14 8)"/><path d="m10 14-6 8m7-18 8 7m-9-3 7 6m-6-9-1 8m5-7-2 10"/>';
const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num = value => typeof value === 'number' && Number.isFinite(value);
const f = (value, digits = 1) => num(value) ? new Intl.NumberFormat('zh-CN', {maximumFractionDigits:digits}).format(value) : '—';
const localToday = () => new Intl.DateTimeFormat('sv-SE', {timeZone:'Asia/Shanghai'}).format(new Date());
const localDay = at => new Intl.DateTimeFormat('sv-SE', {timeZone:'Asia/Shanghai'}).format(new Date(at));
const clock = at => new Date(at).toLocaleTimeString('zh-CN', {hour:'2-digit', minute:'2-digit', timeZone:'Asia/Shanghai'});
const shortDate = at => at ? esc(at.slice(5).replace('-', '/')) : '—';
const duration = value => num(value) ? `${Math.floor(value/60)}<small>时</small>${value%60}<small>分</small>` : '—';
const figure = (value, unit = '', digits = 1) => `<div class="value">${f(value,digits)}<small>${esc(unit)}</small></div>`;
const tag = (text, warning = false) => `<span class="tag ${warning?'warn':''}"><span aria-hidden="true">${warning?'!':'✓'}</span>${esc(text)}</span>`;
const note = text => `<div class="sub">${esc(text)}</div>`;
const footer = (left, right = '') => `<div class="foot"><span>${left}</span><span>${right}</span></div>`;
const card = (title, glyph, content, className = '', tone = 'blue') => `<article class="card ${className}" style="--tone:var(--${tone})"><div class="card-head"><span class="glyph">${icon(glyph)}</span><h3>${esc(title)}</h3></div>${content}</article>`;
const get = async url => {const response = await fetch(url, {cache:'no-store'}); if (!response.ok) throw Error('read_failed'); return response.json();};
const colors = ['#2a78d6','#eb6834','#1baf7a','#eda100'];
const charts = new Map(), specs = new Map();
let plotId = 0, sequence = 0;

function ring(value, goal, main, unit, label, tone = 'blue') {
  const valid = num(value) && num(goal) && goal > 0, ratio = valid ? Math.max(0, Math.min(1, value/goal)) : 0;
  return `<div class="ring" style="--ring-color:var(--${tone})"><svg viewBox="0 0 160 160" role="img" aria-label="${esc(label)}"><circle class="ring-track" cx="80" cy="80" r="65"/><circle class="ring-fill" cx="80" cy="80" r="65" pathLength="100" stroke-dasharray="${ratio*100} 100" transform="rotate(-90 80 80)"/></svg><div class="ring-center"><strong>${main}</strong><small>${esc(unit)}</small></div></div>`;
}
function gauge(value, label) {
  const polar = angle => [100+72*Math.cos(angle*Math.PI/180), 89+72*Math.sin(angle*Math.PI/180)];
  const path = (from,to) => {const a=polar(from),b=polar(to);return `M${a.join(',')} A72,72 0 0 1 ${b.join(',')}`;};
  const bands = [[0,25,'#d94c4c'],[25,50,'#ed9134'],[50,75,'#36a769'],[75,95,'#2a78d6'],[95,100,'#8066cf']];
  const marker = polar(135+Math.max(0,Math.min(100,value||0))*2.7);
  return `<div class="gauge"><svg viewBox="0 0 200 172" role="img" aria-label="训练准备程度 ${f(value)}，${esc(label)}">${bands.map(([a,b,c])=>`<path d="${path(135+a*2.7+1.3,135+b*2.7-1.3)}" fill="none" stroke="${c}" stroke-width="9"/>`).join('')}${num(value)?`<circle cx="${marker[0]}" cy="${marker[1]}" r="6" fill="#202831" stroke="white" stroke-width="3"/>`:''}</svg><div class="gauge-center">${figure(value,'')}<span>${esc(label)}</span></div></div>`;
}
function stack(items, unit = '') {
  const valid = items.filter(item => num(item.value) && item.value >= 0);
  const total = valid.reduce((sum,item)=>sum+item.value,0);
  return `<div class="stack" aria-label="${esc(valid.map(item=>`${item.label} ${f(item.value)} ${unit}`).join('，'))}">${valid.map(item=>`<span style="flex:${item.value};background:${item.color};${item.value===0?'display:none':''}" title="${esc(item.label)} ${f(item.value)} ${esc(unit)}"></span>`).join('')}</div><div class="legend">${valid.map(item=>`<span><i style="background:${item.color}"></i>${esc(item.label)}<b>${f(item.value)}<small>${esc(unit)}</small></b></span>`).join('')}</div>${!total?note('暂无分布数据'):''}`;
}
function targetBar(value, low, high, label, maxValue) {
  if (!num(value)) return note('暂无负荷数据');
  const max = maxValue ? Math.max(maxValue,value,high||0,1) : Math.max(value*1.12,(high||0)*1.15,1);
  return `<div class="target-track" role="img" aria-label="${esc(label)} ${f(value)}，目标范围 ${f(low)} 至 ${f(high)}"><span class="target-fill" style="width:${value/max*100}%"></span>${num(low)&&num(high)?`<span class="target-zone" style="left:${low/max*100}%;width:${(high-low)/max*100}%" title="目标范围 ${f(low)}–${f(high)}"></span>`:''}</div>`;
}
function table(rows, unit) {
  return `<details class="data-table"><summary>数据</summary><div class="table-scroll"><table><thead><tr><th>时间</th><th>读数${unit?` (${esc(unit)})`:''}</th></tr></thead><tbody>${rows.map(row=>`<tr><td>${esc(row.label)}</td><td>${f(row.value)}</td></tr>`).join('')}</tbody></table></div></details>`;
}
function plot(rows, label, {color=colors[0], unit='',height=78, min, max, band=false, bars=false} = {}) {
  if (!rows.some(row => num(row.value))) return `<div class="chart-empty">暂无趋势数据</div>`;
  const id = 'chart-'+(++plotId);
  specs.set(id, {rows,label,color,unit,height,min,max,band,bars});
  return `<div class="plot" style="height:${height}px"><canvas id="${id}" tabindex="0" aria-label="${esc(label)}，左右方向键查看读数" role="img"></canvas></div>${table(rows,unit)}`;
}
const crosshair = {id:'crosshair',afterDatasetsDraw(chart) {const active=chart.getActiveElements();if(!active.length)return;const {ctx,chartArea:{top,bottom}}=chart,x=active[0].element.x;ctx.save();ctx.strokeStyle='#a5afb9';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x,top);ctx.lineTo(x,bottom);ctx.stroke();ctx.restore();}};
function mount(scope) {
  for (const canvas of scope.querySelectorAll('canvas')) {
    const spec=specs.get(canvas.id); if (!spec || charts.has(canvas.id) || !window.Chart) continue;
    const bandPlugin={id:'baseline',beforeDatasetsDraw(chart){if(!spec.band)return;const {ctx,scales:{x,y},chartArea:{top,bottom}}=chart;ctx.save();ctx.fillStyle='#e6ece8';spec.rows.forEach((row,index)=>{if(!num(row.low)||!num(row.high))return;const a=index? (x.getPixelForValue(spec.rows[index-1].x??index-1)+x.getPixelForValue(row.x??index))/2:chart.chartArea.left;const b=index<spec.rows.length-1?(x.getPixelForValue(row.x??index)+x.getPixelForValue(spec.rows[index+1].x??index+1))/2:chart.chartArea.right;const py=Math.max(top,y.getPixelForValue(row.high)),qy=Math.min(bottom,y.getPixelForValue(row.low));ctx.fillRect(a,py,b-a,Math.max(0,qy-py));});ctx.restore();}};
    const chart=new Chart(canvas,{type:spec.bars?'bar':'line',plugins:[crosshair,bandPlugin],data:{labels:spec.rows.map(row=>row.label),datasets:[{label:spec.label,data:spec.rows.map((row,index)=>({x:row.x??index,y:num(row.value)?row.value:null})),borderColor:spec.color,backgroundColor:spec.bars?spec.color:spec.color+'12',fill:!spec.bars&&!spec.band,borderWidth:spec.bars?0:2,pointRadius:context=>context.dataIndex===spec.rows.length-1?4:0,pointHoverRadius:4,pointHoverBorderWidth:2,pointHoverBorderColor:'#fff',pointHitRadius:12,tension:.15,spanGaps:false,borderRadius:3,maxBarThickness:18}]},options:{responsive:true,maintainAspectRatio:false,animation:false,interaction:{mode:'index',intersect:false},plugins:{legend:{display:false},tooltip:{displayColors:false,callbacks:{title:items=>spec.rows[items[0]?.dataIndex]?.label||'',label:item=>`${f(item.raw.y)} ${spec.unit}`},backgroundColor:'#202831',padding:10}},scales:{x:{type:'linear',min:num(spec.rows[0]?.x)?spec.rows[0].x-(spec.bars?43200000:0):undefined,max:num(spec.rows.at(-1)?.x)?spec.rows.at(-1).x+(spec.bars?43200000:0):undefined,afterBuildTicks:axis=>{const left=spec.rows[0]?.x,right=spec.rows.at(-1)?.x;if(num(left)&&num(right)&&right>left)axis.ticks=[{value:left},{value:(left+right)/2},{value:right}];},grid:{display:false},border:{display:false},ticks:{callback:value=>num(spec.rows[0]?.x)?(spec.rows[0].label.includes(':')?clock(value):localDay(value).slice(5)):f(value),maxTicksLimit:3,maxRotation:0,autoSkip:true,color:'#7b8690',font:{size:9}}},y:{min:spec.min,max:spec.max,beginAtZero:spec.bars,grid:{color:'#eff2f5'},border:{display:false},ticks:{maxTicksLimit:3,color:'#7b8690',font:{size:9},precision:0}}}}});
    canvas.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();const previous=chart.getActiveElements()[0]?.index??-1,index=Math.max(0,Math.min(spec.rows.length-1,previous+(event.key==='ArrowRight'?1:-1)));const active=[{datasetIndex:0,index}];chart.setActiveElements(active);chart.tooltip.setActiveElements(active,{x:chart.scales.x.getPixelForValue(spec.rows[index].x??index),y:chart.chartArea.top});chart.update('none');});
    canvas.addEventListener('blur',()=>{chart.setActiveElements([]);chart.tooltip.setActiveElements([],{x:0,y:0});chart.update('none');});
    charts.set(canvas.id,chart);
  }
}
function replace(id, html) {
  for (const canvas of $(id).querySelectorAll('canvas')) {charts.get(canvas.id)?.destroy();charts.delete(canvas.id);specs.delete(canvas.id);}
  $(id).innerHTML=html; mount($(id));
}
const pointRows = points => (points || []).map(point=>({label:clock(point.at),x:Date.parse(point.at),value:point.value}));
const empty = (title,glyph,message,detail) => card(title,glyph,`<div class="empty-state"><div class="empty-icon">${icon(glyph)}</div><strong>${esc(message)}</strong><p>${esc(detail)}</p></div>`,'empty-card');
const readinessLabels = {POOR:'较差',LOW:'低',MODERATE:'中等',HIGH:'高',PRIME:'极佳'};
const hrvLabels = {BALANCED:'平衡',UNBALANCED:'不平衡',LOW:'偏低',POOR:'较差'};
const statusLabels = {1:'恢复',2:'效率下降',3:'恢复',4:'维持效果',5:'有效训练',6:'训练过度',7:'负荷不足',8:'巅峰状态'};

function renderGarmin(o,b,date) {
  const m=o.metrics||{},d=o.daily||{},h=b.hrv||{},training=b.training||{},load=training.load||{},focus=training.focus||{},intensity=b.intensity||{},age=b.fitnessAge||{},ftp=b.cyclingFtp||{},lt=b.lactateThreshold||{},resp=b.respiration||{},hr=b.heartRate||{},hydr=b.hydration||{},last=b.lastActivity;
  const sleepStages=o.sleep?.stages||{};
  const energyItems=[{label:'活动',value:d.activeCalories,color:colors[0]},{label:'静息',value:d.restingCalories,color:colors[1]}];
  replace('summary-content',
    card('当日步数','steps',`<div class="summary-ring-layout">${ring(m.steps,d.stepGoal,f(m.steps),'步','当日步数 '+f(m.steps)+'，目标 '+f(d.stepGoal))}</div>${footer(`目标 ${f(d.stepGoal)} 步`,num(m.steps)&&d.stepGoal>0?Math.round(m.steps/d.stepGoal*100)+'%':'')}`,'steps-card')+
    card('昨夜睡眠','moon',`<div class="value">${duration(m.sleepMinutes)}</div>${note('睡眠评分 '+f(o.analysis?.sleepScore))}${stack([['深睡','deep'],['浅睡','light'],['REM','rem'],['清醒','awake']].map(([label,key],index)=>({label,value:sleepStages[key],color:colors[index]})),'分')}`,'sleep-card','purple')+
    card('身体电量','bolt',`${figure(m.bodyBattery,'/ 100')}${plot(pointRows(o.batterySeries),'身体电量',{color:colors[2],min:0,max:100,height:70})}${footer(`充电 +${f(d.batteryCharged)}`,`消耗 −${f(d.batteryDrained)}`)}`,'battery-card','green')+
    card('热量消耗','bolt',`${figure(d.calories,'kcal')}${stack(energyItems,'kcal')}${footer(date===localToday()?'今天截至当前':'全天累计')}`,'energy-card','orange')
  );
  let html=card('训练准备程度','run',`${gauge(m.trainingReadiness,readinessLabels[o.analysis?.readinessLevel]||'暂无状态')}${footer('恢复时间',`${num(o.readiness?.recoveryMinutes)?Math.round(o.readiness.recoveryMinutes/60):'—'} 小时`)}`,'readiness-card');
  html+=card('训练负荷','refresh',`${load.level==='OPTIMAL'?tag('最佳范围'):note('暂无负荷状态')}<div class="paired-values"><div>${figure(load.acute)}<label>短期负荷</label></div><span>/</span><div>${figure(load.chronic)}<label>长期负荷</label></div></div>${targetBar(load.acute,load.min,load.max,'短期训练负荷')}<div class="range-labels"><span>0</span><span>目标 ${f(load.min)}–${f(load.max)}</span></div>${footer('负荷比',f(load.ratio))}`,'load-card');
  const scale=Math.max(...(focus.categories||[]).flatMap(row=>[row.value||0,row.max||0]))*1.1;
  html+=card('训练负荷重点','chart',`<div class="focus-title">${focus.feedback==='AEROBIC_LOW_SHORTAGE'?'缺乏低强度有氧':esc(focus.feedback||'暂无数据')}</div><div class="focus-rows">${(focus.categories||[]).map((row,index)=>`<div class="focus-item" style="--focus-color:${colors[index]}"><div><span>${esc(row.label)}</span><strong>${f(row.value)}</strong></div>${targetBar(row.value,row.min,row.max,row.label,scale)}</div>`).join('')}</div>${footer('虚线框为目标范围',`${shortDate(focus.start)}–${shortDate(focus.date)}`)}`,'focus-card');
  html+=card('HRV 状态','heart',`<div class="status-head">${figure(h.weeklyAverage,'ms')}${h.status?tag(hrvLabels[h.status]||'暂无状态',h.status!=='BALANCED'):''}</div>${note('7 天平均')}<div class="baseline-readout"><span>个人基线</span><strong>${f(h.baselineLow)}–${f(h.baselineHigh)} ms</strong></div><div id="hrv-history"><div class="baseline-meter">${targetBar(h.weeklyAverage,h.baselineLow,h.baselineHigh,'HRV 7 天平均',Math.max(h.baselineHigh||0,h.weeklyAverage||0)*1.2)}</div></div>${footer(`昨夜 ${f(h.lastNight)} ms`,'近 4 周')}`,'hrv-card','red');
  html+=card('强度活动时间','sun',`${ring(intensity.total,intensity.goal,f(intensity.total),'分钟',`本周 ${f(intensity.total)} 分钟，目标 ${f(intensity.goal)} 分钟`,'orange')}<div class="intensity-split"><span>中强度 <b>${f(intensity.moderate)}</b></span><span>高强度 <b>${f(intensity.vigorous)} × 2</b></span></div>${footer(`每周目标 ${f(intensity.goal)} 分钟`)}`,'intensity-card','orange');
  html+=card('训练状态','run',`<div class="training-emblem">${icon('run')}</div><div class="status-value">${esc(statusLabels[training.status]||'暂无状态')}</div>${note('Garmin 训练状态')}<div class="training-caption"><span>短期负荷</span><b>${f(load.acute)}</b><span>负荷比</span><b>${f(load.ratio)}</b></div>${footer('更新于 '+esc(training.date||'—'))}`,'training-card','purple');
  html+=card('身体年龄','run',`<div class="age-hero">${figure(age.value,'岁')}<span>身体年龄</span></div><div class="age-comparison"><div><span>实际年龄</span><strong>${f(age.chronological)}<small>岁</small></strong></div><div><span>可达目标</span><strong>${f(age.achievable)}<small>岁</small></strong></div></div>${footer('Garmin 估算',shortDate(age.date))}`,'age-card');
  html+=card('楼层','stairs',`<div class="floor-layout">${figure(b.floors?.ascended,'层')}<div class="stairs-mark" aria-hidden="true">${Array.from({length:5},(_,index)=>`<span style="height:${14+index*13}px"></span>`).join('')}</div></div>${note(`目标 ${f(b.floors?.goal)} 层`)}<div id="floors-history" class="floor-bottom">${footer('下楼',`${f(b.floors?.descended)} 层`)}</div>`,'floors-card');
  const stress=d.stressMinutes||{};
  html+=card('压力','sun',`<div class="status-head">${figure(d.averageStress,'/ 100')}<span class="small-muted">全天平均</span></div>${stack([['休息','rest'],['低','low'],['中','medium'],['高','high']].map(([label,key],index)=>({label,value:stress[key],color:['#2a78d6','#e8ba43','#ed9134','#d94c4c'][index]})),'分')}${footer('最高压力',f(b.stress?.max))}`,'stress-card','orange');
  html+=card('心率','heart',`${figure(hr.resting,'bpm')}${note('静息心率')}${plot(pointRows(hr.points),'心率',{color:'#d15b67',unit:'bpm',height:86})}${footer('全天最低 / 最高',`${f(hr.min)} / ${f(hr.max)} bpm`)}`,'heart-card','red');
  html+=card('呼吸','drop',`<div class="breath-values"><div>${figure(resp.waking)}<label>清醒平均</label></div><div>${figure(resp.sleep)}<label>睡眠平均</label></div></div><span class="small-muted">次 / 分</span>${plot(pointRows(resp.points),'呼吸频率',{color:colors[0],unit:'次/分',height:77})}${footer('最低 / 最高',`${f(resp.min)} / ${f(resp.max)}`)}`,'respiration-card');
  html+=card('骑行 FTP','chart',`<div class="ftp-value">${figure(ftp.wattsPerKg,'W/kg',2)}</div><div class="power-panel"><span>功能阈值功率</span><strong>${f(ftp.value)}<small>W</small></strong></div>${footer(ftp.source==='MANUAL'?'手动记录':'Garmin 记录',esc(ftp.date||'暂无记录'))}`,'ftp-card');
  html+=card('跑步乳酸阈值','run',`<div class="pace-value">${num(lt.paceSeconds)?`${Math.floor(lt.paceSeconds/60)}<span>′</span>${String(lt.paceSeconds%60).padStart(2,'0')}<span>″</span>`:'—'}<small>/ km</small></div><div class="threshold-details"><div><span>${icon('heart')}心率</span><b>${f(lt.heartRate)} <small>bpm</small></b></div><div><span>${icon('bolt')}功率</span><b>${f(lt.power)} <small>W</small></b></div><div><span>功体比</span><b>${f(lt.powerToWeight,2)} <small>W/kg</small></b></div></div>${footer('更新于 '+esc(lt.date||'—'))}`,'threshold-card');
  html+=card('跑步最大摄氧量','run',`<div class="vo2-layout"><div class="vo2-icon">${icon('run')}</div>${figure(b.vo2Max?.generic?.value)}</div><span class="small-muted">ml/kg/min</span><div class="vo2-caption">有氧运动能力</div>${footer('最近测量',esc(b.vo2Max?.generic?.date||'—'))}`,'vo2-card','green');
  html+=card('上一次活动','run',`<div class="activity-heading"><span class="activity-sport">${icon(last?.sport==='badminton'?'badminton':'run')}</span><div><strong>${esc(last?.name||'暂无活动')}</strong><span>${esc(last?.date||'')} ${esc(last?.time||'')}</span></div></div><div class="activity-time">${duration(last?.durationMinutes)}</div><div class="activity-metrics"><div><strong>${f(last?.calories)}</strong><span>kcal</span></div><div><strong>${f(last?.averageHeartRate)}</strong><span>平均 bpm</span></div></div><a class="activity-link" href="/#activity_stats">查看活动详情 ${icon('chevron')}</a>`,'activity-card','green');
  html+=num(hydr.value)?card('喝水','drop',`${ring(hydr.value,hydr.goal,f(hydr.value),'ml','饮水量')} ${footer('目标',`${f(hydr.goal)} ml`)}`):empty('喝水','drop','还没有饮水记录',`每日目标 ${f(hydr.goal)} ml`);
  html+=num(b.vo2Max?.cycling?.value)?card('骑车最大摄氧量','chart',figure(b.vo2Max.cycling.value,'ml/kg/min')):empty('骑车最大摄氧量','chart','等待一次有效骑行','记录包含心率与功率的骑行后查看');
  html+=num(b.spo2?.average)?card('脉搏血氧','heart',figure(b.spo2.average,'%')):empty('脉搏血氧','heart','当天暂无读数','开启设备测量并同步后查看');
  replace('exercise-content',html);
}

async function loadTimelines(date,token) {
  // Existing endpoints share a Garmin queue; enrich one metric at a time.
  for (const metric of ['hrv','floors']) {
    if(token!==sequence)return;
    try {
      const data=await get(`/api/health/body-status/timeline?date=${date}&metric=${metric}`);
      if(token!==sequence)return;
      const rows=(data.points||[]).map(row=>({label:row.date.slice(5),x:Date.parse(row.date+'T00:00:00+08:00'),value:row.value,low:row.low,high:row.high}));
      if(metric==='hrv')replace('hrv-history',plot(rows,'HRV 7 天平均',{color:'#268268',unit:'ms',height:72,band:true,min:Math.floor(Math.min(...rows.flatMap(row=>[row.value,row.low]).filter(num))/5)*5,max:Math.ceil(Math.max(...rows.flatMap(row=>[row.value,row.high]).filter(num))/5)*5}));
      else replace('floors-history',plot(rows,'楼层',{color:colors[0],unit:'层',height:65,bars:true,min:0}));
    } catch { /* Retain the current baseline or floor total when history is unavailable. */ }
  }
}

function renderMeals(data) {
  const totals=data.summary?.totals||{},entries=data.entries||[],count=data.summary?.meals??entries.length;
  const nutrientNames=[['protein_g','蛋白质',4],['carbs_g','碳水化合物',4],['fat_g','脂肪',9]];
  const macroTotal=nutrientNames.reduce((sum,[key,,factor])=>sum+(totals[key]?.value||0)*factor,0);
  const complete=nutrientNames.every(([key])=>num(totals[key]?.value)&&totals[key].complete_meals===count)&&count>0;
  const partial=key=>num(totals[key]?.value)&&totals[key].complete_meals!==count?'部分合计':'已记录合计';
  let html=card('能量摄入','food',`${figure(totals.calories?.value,'kcal')}<div class="meal-count"><span>${count}</span> 餐已记录</div>${footer(partial('calories'),'仅含已保存餐食')}`,'intake-card','orange');
  html+=nutrientNames.map(([key,label,factor],index)=>{const value=totals[key]?.value,share=complete&&macroTotal>0?value*factor/macroTotal*100:null;return card(label,'food',`${figure(value,'g')}<div class="nutrient-meter"><span style="width:${num(share)?share:0}%;background:${colors[index]}"></span></div>${note(num(share)?`占宏量营养供能 ${Math.round(share)}%`:'营养信息未记全')}${footer(partial(key))}`,'nutrient-card');}).join('');
  const mealRows=entries.slice().sort((a,b)=>a.time.localeCompare(b.time)).map(entry=>{
    const known=(entry.items||[]).filter(item=>num(item.calories)),energy=known.length?known.reduce((sum,item)=>sum+item.calories,0):null;
    return `<div class="meal-row"><time>${esc(entry.time)}</time><span class="meal-kind">${esc(entry.kind)}</span><span>${esc(entry.name||(entry.items||[]).map(item=>item.name).join('、'))}</span><strong>${f(energy)} <small>kcal${known.length<(entry.items||[]).length?' *':''}</small></strong></div>`;
  }).join('');
  html+=card('今日餐食','food',`<div class="meal-list">${mealRows||note('当天还没有饮食记录。')}</div><a class="text-link" href="/#food">查看饮食记录 ${icon('chevron')}</a>`,'wide meals-card');
  html+=card('营养供能分布','chart',complete&&macroTotal>0?`<div class="macro-layout"><div class="macro-donut" style="background:conic-gradient(${colors[0]} 0 ${totals.protein_g.value*4/macroTotal*100}%,${colors[1]} 0 ${(totals.protein_g.value*4+totals.carbs_g.value*4)/macroTotal*100}%,${colors[2]} 0 100%)" role="img" aria-label="宏量营养素供能分布"><div><strong>${f(macroTotal)}</strong><small>kcal</small></div></div><div class="macro-labels">${nutrientNames.map(([key,label,factor],index)=>`<div><span><i style="background:${colors[index]}"></i>${label}</span><strong>${Math.round(totals[key].value*factor/macroTotal*100)}<small>%</small></strong></div>`).join('')}</div></div>${footer('按蛋白质 / 碳水 4、脂肪 9 kcal/g 估算')}`:`<div class="chart-empty">餐食营养信息记全后展示供能分布</div>`,'wide macro-card');
  replace('food-content',html);
}
function renderBody(data,date) {
  const unique=new Map();
  for(const row of [data.latest,...(data.daily||[])])if(row?.measuredAt&&localDay(row.measuredAt)<=date)unique.set(row.measuredAt,row);
  const rows=[...unique.values()].sort((a,b)=>a.measuredAt.localeCompare(b.measuredAt)),v=rows.at(-1)||{},prev=rows.at(-2);
  const delta=(key,unit)=>prev&&num(prev[key])&&num(v[key])?`较上次 ${v[key]-prev[key]>0?'+':''}${new Intl.NumberFormat('zh-CN',{maximumFractionDigits:2}).format(Math.round((v[key]-prev[key])*100)/100)} ${unit}`:'暂无上次测量';
  const history=key=>rows.slice(-14).map(row=>({label:localDay(row.measuredAt).slice(5),x:Date.parse(row.measuredAt),value:row[key]}));
  $('body-date').textContent=v.measuredAt?'最近测量 '+localDay(v.measuredAt):'暂无测量';
  let html=card('体重','scale',`<div class="weight-head">${figure(v.weightKg,'kg')}<span class="delta">${esc(delta('weightKg','kg'))}</span></div>${plot(history('weightKg'),'体重',{unit:'kg',height:90})}${footer('最近 14 次测量')}`,'wide weight-card');
  html+=card('BMI','scale',`${figure(v.bmi)}<div class="bmi-equation"><div><span>体重</span><strong>${f(v.weightKg)} <small>kg</small></strong></div><span>÷</span><div><span>身高²</span><strong>${num(v.heightCm)?(v.heightCm/100).toFixed(2):'—'} <small>m</small></strong></div></div>${footer(esc(delta('bmi','')))}`,'bmi-card');
  html+=card('体脂率','drop',`${ring(v.bodyFatPct,100,f(v.bodyFatPct),'%','体脂率 '+f(v.bodyFatPct)+'%','orange')}${footer(esc(delta('bodyFatPct','个百分点')))}`,'body-fat-card','orange');
  html+=card('肌肉率','run',`${figure(v.muscleRatePct,'%')}${plot(history('muscleRatePct'),'肌肉率',{color:colors[2],unit:'%',height:73})}${footer(esc(delta('muscleRatePct','个百分点')))}`,'muscle-card','green');
  html+=card('体水分','drop',`<div class="water-layout"><div class="water-vessel" role="img" aria-label="体水分 ${f(v.bodyWaterPct)}%"><div style="height:${num(v.bodyWaterPct)?Math.max(0,Math.min(100,v.bodyWaterPct)):0}%"></div></div><div>${figure(v.bodyWaterPct,'%')}${note('体重中的水分占比')}</div></div>${footer(esc(delta('bodyWaterPct','个百分点')))}`,'water-card');
  html+=card('内脏脂肪','scale',`<div class="visceral-number">${figure(v.visceralFat,'级')}</div><div class="previous-measure"><span>上次测量</span><strong>${f(prev?.visceralFat)} <small>级</small></strong></div>${footer(esc(delta('visceralFat','级')))}`,'visceral-card');
  html+=card('骨量','scale',`<div class="value">${num(v.boneMassKg)?v.boneMassKg.toFixed(2):'—'}<small>kg</small></div><div class="bone-readout">${icon('scale')}<span>体脂秤估算骨量</span></div>${footer(esc(delta('boneMassKg','kg')))}`,'bone-card');
  html+=card('基础代谢','bolt',`<div class="metabolic-layout"><div>${figure(v.basalMetabolismKcal,'kcal / 天')}${note('静息状态下的基础能量消耗估算')}</div><div class="metabolic-symbol">${icon('bolt')}</div></div>${footer(esc(delta('basalMetabolismKcal','kcal / 天')))}`,'wide metabolism-card','orange');
  html+=card('蛋白质率','food',`${figure(v.proteinPct,'%')}<div class="protein-segments" aria-label="蛋白质率 ${f(v.proteinPct)}%">${Array.from({length:20},(_,i)=>`<span><i style="width:${num(v.proteinPct)?Math.max(0,Math.min(100,(v.proteinPct-i*5)*20)):0}%"></i></span>`).join('')}</div>${footer(esc(delta('proteinPct','个百分点')))}`,'protein-card');
  html+=card('身体评分','scale',`${ring(v.bodyScore,100,f(v.bodyScore),'/ 100','Zepp Life 身体评分 '+f(v.bodyScore),'green')}${footer('Zepp Life 评分')}`,'body-score-card','green');
  replace('body-content',html);
}
function reportCard(kind,data,date) {
  const end=new Date(Date.parse(date+'T12:00:00Z')+86400000).toISOString().slice(0,10);
  const latest=(data.reports||[]).filter(row=>row.state==='completed'&&row.summary&&row.period_start<=date&&(!row.period_end_exclusive||row.period_end_exclusive<=end)).sort((a,b)=>b.period_start.localeCompare(a.period_start))[0];
  return `<article class="card wide report-card ${kind==='daily'?'daily-report':'weekly-report'}"><div class="report-label">${icon(kind==='daily'?'sun':'calendar')}<span>${kind==='daily'?'健康日报':'健康周报'}</span><time>${esc(latest?.period_start||'')}</time></div><h3>${esc(latest?.title||'暂无报告')}</h3><p>${esc(latest?.summary||'完成的健康报告会显示在这里。')}</p><div class="report-bottom"><span>${latest?'已生成':'等待生成'}</span><a href="/#reports">阅读报告 ${icon('chevron')}</a></div></article>`;
}
async function load() {
  const token=++sequence,date=$('date').value,current=()=>token===sequence;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return;
  $('sync').textContent='正在读取数据';document.querySelector('main').classList.add('refreshing');
  const jobs=[];
  jobs.push(Promise.allSettled([get(`/api/health/overview?date=${date}&days=7`),get(`/api/health/body-status?date=${date}`)]).then(results=>{
    if(!current())return;
    if(results.every(result=>result.status==='rejected')){replace('summary-content','<p class="error">Garmin 数据读取失败，请刷新重试。</p>');replace('exercise-content','<p class="error">Garmin 数据读取失败，请刷新重试。</p>');return;}
    renderGarmin(results[0].value||{},results[1].value||{},date);
    void loadTimelines(date,token);
  }));
  jobs.push(get(`/api/meals?start_date=${date}&end_date=${date}`).then(data=>{if(current())renderMeals(data)}).catch(()=>{if(current())replace('food-content','<p class="error">饮食读取失败，请刷新重试。</p>')}));
  jobs.push(get('/api/body/measurements?days=365').then(data=>{if(current())renderBody(data,date)}).catch(()=>{if(current())replace('body-content','<p class="error">身体成分读取失败，请刷新重试。</p>')}));
  jobs.push(Promise.all(['daily','weekly'].map(async kind=>{try{return reportCard(kind,await get(`/api/health-reports?kind=${kind}&to=${date}`),date)}catch{return '<article class="card wide"><p class="error">报告读取失败，请刷新重试。</p></article>'}})).then(html=>{if(current())replace('reports-content',html.join(''))}));
  jobs.push(get(`/api/daily-status?start_date=${date}&end_date=${date}`).then(data=>{
    if(!current())return;const entries=data.entries||[];
    replace('journal-content',`<div class="journal-icon">${icon('journal')}</div><div class="journal-copy"><strong>${entries.length?'今天的记录':'今天感觉怎么样？'}</strong>${entries.length?entries.map(row=>`<p class="journal-entry">${esc(row.content||row.text||row.note||'')}</p>`).join(''):'<p>记下疲劳、心情或身体感受，给数据补充一点生活的线索。</p>'}</div><a href="/#journal">${entries.length?'查看记录':'写一条记录'} ${icon('chevron')}</a>`);
  }).catch(()=>{if(current())replace('journal-content','<p class="error">个人记录读取失败，请刷新重试。</p>')}));
  await Promise.allSettled(jobs);
  if(current()){$('sync').textContent='读取于 '+clock(new Date())+' · 只读预览';document.querySelector('main').classList.remove('refreshing');}
}
$('date').value=localToday();$('date').max=localToday();$('date').onchange=load;$('refresh').onclick=load;$('today').onclick=()=>{$('date').value=localToday();load()};
load();

const sectionLinks=[...document.querySelectorAll('.rail nav a')];
const sectionObserver=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting)for(const link of sectionLinks){const active=link.hash==='#'+entry.target.id;link.classList.toggle('active',active);if(active)link.setAttribute('aria-current','location');else link.removeAttribute('aria-current');}},{rootMargin:'-115px 0px -65% 0px'});
for(const section of document.querySelectorAll('main>.section'))sectionObserver.observe(section);
