const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../reports.js'),'utf8');

test('a report detail route starts reading its own ID without waiting for the archive', async () => {
  const context=vm.createContext({window:{},URLSearchParams,location:{search:'?report=23'}});
  vm.runInContext(source+'\nglobalThis.Reports = HealthReports;',context);
  const events=[],model=Object.create(context.Reports.prototype);
  Object.assign(model,{filter:false,today:()=> '2026-11-12',load:(append,quiet)=>{events.push(['archive',append,quiet]);return new Promise(()=>{});},read:async(id,push)=>events.push(['detail',id,push])});
  const opening=model.open();
  assert.deepEqual(events,[['archive',false,true],['detail','23',false]]);
  await opening;
  assert.equal(model.active,true);
});
