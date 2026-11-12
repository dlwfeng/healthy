import test from 'node:test';
import assert from 'node:assert/strict';
import { activityRange, loadActivities, activityDetail, loadActivity } from '../src/activities.js';
import { makeServer } from '../src/server.js';
const row = { activityId: 42, activityName: 'Run', startTimeLocal: '2026-10-12T08:30:00', activityType: {typeKey:'running'}, duration: 59, distance: 1234, calories: 0, averageHR: 120, ownerId: 'private', startLatitude: 30 };
test('activity ranges reject invalid dates, future dates, reversed and oversized ranges',()=>{
  assert.ok(activityRange('2026-10-01','2026-10-12'));
  for (const pair of [['2026-02-30','2026-03-01'],['2026-10-12','2026-10-01'],['2025-01-01','2026-10-12'],['2026-10-01','2999-01-01']]) assert.equal(activityRange(...pair),false);
});
test('activity listing deduplicates, filters dates, preserves precise units and strips private fields',async()=>{
  const data=await loadActivities({call:async(name,args)=>{assert.equal(name,'get_activities_by_date');assert.deepEqual(args,{start_date:'2026-10-01',end_date:'2026-10-12'});return [row,row,{...row,activityId:43,startTimeLocal:'2026-09-30T12:00:00'},null];}},'2026-10-01','2026-10-12');
  assert.equal(data.items.length,1);assert.equal(data.items[0].durationSeconds,59);assert.equal(data.items[0].distanceMeters,1234);assert.equal(data.items[0].calories,0);assert.ok(!JSON.stringify(data).includes('private'));assert.ok(!JSON.stringify(data).includes('Latitude'));
  await assert.rejects(()=>loadActivities({call:async()=>({})},'2026-10-01','2026-10-12'));
});
test('detail normalizes summaryDTO and lap units and preserves missing values',()=>{
  const detail=activityDetail({activityId:42,activityName:'Run',activityTypeDTO:{typeKey:'running'},summaryDTO:{...row,averageSpeed:2.5,trainingEffect:2.1}},'42',{lapDTOs:[{duration:30,distance:100,averageHR:120,ownerId:'private'}]});
  assert.equal(detail.sport,'running');assert.equal(detail.durationSeconds,59);assert.equal(detail.averageSpeed,2.5);assert.equal(detail.movingSeconds,null);assert.equal(detail.aerobicEffect,2.1);assert.equal(detail.splits[0].distanceMeters,100);assert.ok(!JSON.stringify(detail).includes('private'));
  assert.throws(()=>activityDetail({activityId:99},'42',{}));
});
test('detail retains summary when splits fail and does not hide summary failure',async()=>{
  const result=await loadActivity({call:async name=>{if(name==='get_activity_splits')throw Error();return row;}},'42');
  assert.deepEqual(result.unavailable,['splits']);assert.equal(result.activity.id,'42');
  await assert.rejects(()=>loadActivity({call:async()=>{throw Error()}},'42'));
});
async function request(url, method='GET') {
  const calls=[];const server=makeServer({configStatus:async()=> 'ready',garminClient:{call:async(name,args)=>{calls.push([name,args]);return name==='get_activities_by_date'?[row]:name==='get_activity'?row:{lapDTOs:[]};}}});
  const response=await new Promise(resolve=>server.emit('request',{method,url,headers:{host:'127.0.0.1:8060'}},{writeHead(status){this.status=status},end(body){resolve({status:this.status,body:JSON.parse(body)})}}));
  return {...response,calls};
}
test('activity HTTP routes validate ranges, IDs and methods, and only call named reads',async()=>{
  assert.equal((await request('/api/health/activities?start=2026-10-01&end=2026-10-12')).status,200);
  assert.equal((await request('/api/health/activities')).status,400);
  for(const id of ['-1','0','abc','9007199254740992'])assert.equal((await request('/api/health/activities/'+id)).status,400);
  assert.equal((await request('/api/health/activities/42','POST')).status,405);
  const result=await request('/api/health/activities/42');assert.equal(result.status,200);assert.deepEqual(result.calls.map(c=>c[0]),['get_activity','get_activity_splits']);
});
