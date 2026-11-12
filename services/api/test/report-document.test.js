import test from 'node:test';
import assert from 'node:assert/strict';
import {validateDocumentReport} from '../src/report-document.js';
import {validateReport,buildReportDocument,reportPlainText} from '../src/report-renderer.js';
import {loadReportInstructions} from '../src/report-agent.js';

const snapshot={evidence:{raw:{source:'garmin'}}};
const html='<!doctype html><html><head><style>:root{--ink:#18483e}body{font-family:Georgia,serif;background:#faf6ef}.custom{display:grid;grid-template-columns:1fr 2fr}@media(max-width:600px){.custom{display:block}}</style></head><body><main class="custom"><h1 data-evidence="raw">身体状态</h1><details><summary>依据</summary>实际记录</details></main></body></html>';
const payload={title:'日报',summary:'根据记录。'.repeat(90),html,evidence_ids:['raw'],suggestions:[]};
test('standalone report retains model CSS, custom classes and long summaries through the real reading renderer',async()=>{
 const accepted=validateDocumentReport(payload,snapshot,validateReport);
 assert.equal(accepted.summary,payload.summary);
 const result=await buildReportDocument(accepted.html);
 assert.equal(result.renderer_version,'2');
 assert.match(result.document,/font-family:Georgia/);assert.match(result.document,/#faf6ef/);
 assert.match(result.document,/grid-template-columns:1fr 2fr/);assert.match(result.document,/@media/);
 assert.ok(!result.document.includes('max-width:1200px'));
 assert.match(result.document,/Content-Security-Policy/);assert.match(result.document,/data-channel=/);
 assert.ok(!reportPlainText(accepted.html).includes('font-family'));assert.match(reportPlainText(accepted.html),/身体状态/);
});
test('active content is removed while source references in the body must belong to actual reads',async()=>{
 const dangerous=html.replace('</head>','<meta http-equiv="refresh" content="0;url=https://invalid.test"><link rel="stylesheet" href="https://invalid.test"></head>')
  .replace('</main>','<script>fetch("https://invalid.test")</script><iframe src="https://invalid.test"></iframe><p onclick="alert(1)">记录</p></main>');
 const accepted=validateDocumentReport({...payload,html:dangerous},snapshot,validateReport);
 assert.ok(!accepted.html.includes('<script'));assert.ok(!accepted.html.includes('<iframe'));assert.ok(!accepted.html.includes('onclick'));assert.ok(!accepted.html.includes('http-equiv'));
 assert.throws(()=>validateDocumentReport({...payload,html:html.replace('data-evidence="raw"','data-evidence="invented"')},snapshot,validateReport),/引用不存在/);
 const first=await buildReportDocument(accepted.html),second=await buildReportDocument(accepted.html);
 assert.notEqual(first.channel,second.channel);
});
test('daily and weekly load distinct selected skills without injecting a shared visual template',async()=>{
 const daily=await loadReportInstructions('daily'),weekly=await loadReportInstructions('weekly');
 assert.match(daily,/渐进阅读/);assert.match(weekly,/证据手记/);
 assert.ok(!daily.includes('证据手记'));assert.ok(!weekly.includes('渐进阅读'));
 assert.ok(!daily.includes('单列'));assert.ok(!weekly.includes('单列'));
 await assert.rejects(loadReportInstructions('../other'),/invalid_report_kind/);
});
