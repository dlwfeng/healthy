import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeBodyStatus, loadBodyStatus, loadBodyTimeline} from '../src/body-status.js';
const date='2026-10-25';
test('selects primary device, keeps historical measurement dates and strips account fields',()=>{
 const result=normalizeBodyStatus(date,{
  get_training_status:{userId:123,mostRecentTrainingStatus:{latestTrainingStatusData:{other:{calendarDate:date,acuteTrainingLoadDTO:{dailyTrainingLoadAcute:999}},primary:{calendarDate:date,primaryTrainingDevice:true,acuteTrainingLoadDTO:{dailyTrainingLoadAcute:300,dailyTrainingLoadChronic:400,dailyAcuteChronicWorkloadRatio:0.75}}}},mostRecentTrainingLoadBalance:{metricsTrainingLoadBalanceDTOMap:{one:{calendarDate:date,primaryTrainingDevice:true,monthlyLoadAerobicHigh:500,monthlyLoadAerobicHighTargetMin:600,monthlyLoadAerobicHighTargetMax:900}}},mostRecentVO2Max:{generic:{calendarDate:'2026-10-20',vo2MaxPreciseValue:48},cycling:{calendarDate:'2026-10-26',vo2MaxValue:50}}},
  get_body_composition:{dateWeightList:[{calendarDate:'2026-10-26',weight:80000},{calendarDate:'2026-08-30',weight:69400,samplePk:'secret'}]},
  get_fitness_age:{fitnessAge:29.36,chronologicalAge:34,components:{bmi:{value:23.2,lastMeasurementDate:'2026-08-30'}}},
  get_hydration_data:{valueInML:null,goalInML:2800},get_hrv_data:{hrvSummary:{weeklyAvg:62,lastNightAvg:52}},
  get_intensity_minutes:{weeklyTotal:146,weeklyModerate:54,weeklyVigorous:46,weekGoal:300},
  get_cycling_ftp:{calendarDate:'2026-10-02',functionalThresholdPower:197},
 });
 assert.equal(result.training.load.acute,300);assert.equal(result.training.focus.categories[1].min,600);
 assert.deepEqual(result.weight,{value:69.4,date:'2026-08-30',bmi:23.2,bmiDate:'2026-08-30',goal:null,history:[{date:'2026-08-30',value:69.4}]});
 assert.equal(result.fitnessAge.value,29.4);assert.equal(result.hrv.weeklyAverage,62);assert.equal(result.hrv.lastNight,52);
 assert.equal(result.vo2Max.cycling.value,null);assert.equal(result.vo2Max.generic.value,48);
 assert.equal(result.hydration.value,null);assert.equal(result.hydration.goal,2800);assert.equal(result.cyclingFtp.value,197);
 assert(!JSON.stringify(result).includes('secret'));assert(!JSON.stringify(result).includes('userId'));
});
test('missing values stay null; valid zeroes remain zero; partial errors are explicit',()=>{
 const result=normalizeBodyStatus(date,{get_user_summary:{floorsAscended:0},get_hydration_data:{valueInML:0}},{get_spo2_data:true});
 assert.equal(result.floors.ascended,0);assert.equal(result.hydration.value,0);assert.equal(result.spo2.average,null);assert.equal(result.fitnessAge.value,null);assert.deepEqual(result.unavailable,['get_spo2_data']);
});
test('historical views never present future latest FTP, threshold or activities',()=>{
 const result=normalizeBodyStatus('2026-09-01',{get_cycling_ftp:{calendarDate:date,functionalThresholdPower:197},get_lactate_threshold:{speed_and_heart_rate:{calendarDate:date,heartRate:168}},get_last_activity:{startTimeLocal:date+' 09:00:00',activityName:'Run'}});
 assert.equal(result.cyclingFtp.value,null);assert.equal(result.lactateThreshold.heartRate,null);assert.equal(result.lastActivity,null);
});
test('timeline uses weekly HRV average with each days baseline; intensity weights vigorous minutes once',async()=>{
 const fake={call:async(name,args)=>name==='get_hrv_data'?{hrvSummary:{weeklyAvg:60,lastNightAvg:45,baseline:{balancedLow:50,balancedUpper:70}}}:{moderateMinutes:10,vigorousMinutes:5}};
 const hrv=await loadBodyTimeline(fake,'2026-09-20','hrv',true);assert.equal(hrv.points.length,28);assert.deepEqual(hrv.points[0],{date:'2026-08-24',value:60,low:50,high:70});
 const intensity=await loadBodyTimeline(fake,'2026-09-20','intensity',true);assert.equal(intensity.points.length,7);assert.equal(intensity.points[0].value,20);
});
test('body reads remain read only and retain partial failures',async()=>{
 const calls=[];const result=await loadBodyStatus({call:async(name)=>{calls.push(name);if(name==='get_fitness_age')throw Error();return {}}},'2026-08-01',true);
 assert(calls.every(n=>n.startsWith('get_')));assert(result.unavailable.includes('get_fitness_age'));assert.equal(result.fitnessAge.value,null);
});
test('effective weight goals are converted from grams and future goals are ignored',()=>{
 const goals={userGoals:[{userGoalType:'WEIGHT_GRAMS',startDate:'2026-01-01',goalValue:65000,updateDate:'2026-01-02'},{userGoalType:'WEIGHT_GRAMS',startDate:'2026-11-01',goalValue:60000,updateDate:'2026-11-01'}]};
 assert.equal(normalizeBodyStatus(date,{get_weight_goal:goals}).weight.goal,65);
});
test('floor completion uses each actual daily goal, with unknown distinct from zero and failure',async()=>{
 const out=await loadBodyTimeline({call:async(_,args)=>{
  if(args.date==='2026-09-15')throw Error();
  return args.date==='2026-09-14'?{floorsAscended:10,floorsDescended:8,userFloorsAscendedGoal:10}:args.date==='2026-09-16'?{floorsAscended:11,userFloorsAscendedGoal:12}:args.date==='2026-09-17'?{floorsAscended:0,userFloorsAscendedGoal:0}:{floorsAscended:null,userFloorsAscendedGoal:10};
 }},'2026-09-20','floors',true);
 assert.equal(out.points[0].completed,true);assert.equal(out.points[1].completed,null);assert.equal(out.points[2].completed,false);assert.equal(out.points[3].completed,null);assert.equal(out.points[3].value,0);assert(out.unavailable.includes('2026-09-15'));
});
test('keeps LT pace, original power measurement date and fitness/hydration/SpO2 details',()=>{
 const result=normalizeBodyStatus(date,{get_lactate_threshold:{speed_and_heart_rate:{calendarDate:'2025-12-10',speed:0.31111024,heartRate:168},power:{calendarDate:'2026-08-30',ftpCreateTime:'2025-04-09T23:02:49',functionalThresholdPower:309,powerToWeight:4.45}},get_fitness_age:{fitnessAge:29.4,components:{vigorousDaysAvg:{value:1.6,targetValue:3,numOfWeeksForIm:6}}},get_hydration_data:{activityIntakeInML:200,dailyAverageinML:1800},get_spo2_data:{lastSevenDaysAvgSpO2:96,avgSleepSpO2:97}});
 assert.equal(result.lactateThreshold.paceSeconds,321);assert.equal(result.lactateThreshold.powerDate,'2025-04-09');assert.equal(result.fitnessAge.components[0].target,3);assert.equal(result.hydration.activityIntake,200);assert.equal(result.spo2.weeklyAverage,96);
});
test('retains all blood pressure measurements while selecting the latest without account metadata',()=>{
 const result=normalizeBodyStatus(date,{get_blood_pressure:{measurementSummaries:[{measurements:[{measurementTimestampLocal:date+'T20:00:00',systolic:120,diastolic:80,pulse:65,userProfilePk:'secret'},{measurementTimestampLocal:date+'T08:00:00',systolic:118,diastolic:78,pulse:62}]}]}});
 assert.equal(result.bloodPressure.systolic,120);assert.equal(result.bloodPressure.measurements.length,2);assert.equal(result.bloodPressure.measurements[0].pulse,62);assert(!JSON.stringify(result).includes('secret'));
});
