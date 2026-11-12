import { normalizeActivity } from './normalize.js';

const obj = v => v && typeof v === 'object' && !Array.isArray(v) ? v : {};
const arr = v => Array.isArray(v) ? v : [];
const num = v => typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
const text = v => typeof v === 'string' && v.trim() ? v.slice(0, 180) : null;
const day = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null;
const round = v => num(v) === null ? null : Math.round(v * 10) / 10;
const shift = (date, n) => new Date(Date.parse(date + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10);
// Multi-device responses must prefer the primary device, never combine their loads.
function primary(map, date) {
  const rows = Object.values(obj(map)).filter(v => v && day(v.calendarDate) && day(v.calendarDate) <= date);
  return rows.find(v => v.primaryTrainingDevice === true) || rows.sort((a,b) => b.calendarDate.localeCompare(a.calendarDate))[0] || {};
}
function points(rows, max = Infinity) {
  return arr(rows).filter(r => num(r?.[1]) !== null && r[1] <= max && r[0] != null).map(r => {
    const at = new Date(typeof r[0] === 'string' && !/(Z|[+-]\d\d:\d\d)$/.test(r[0]) ? r[0]+'Z' : r[0]);
    return Number.isFinite(at.getTime()) ? {at:at.toISOString(),value:r[1]} : null;
  }).filter(Boolean).sort((a,b)=>a.at.localeCompare(b.at));
}
// Garmin legacy LT speed uses 10 m/s units below 1; newer payloads use m/s.
// https://endurancetools.github.io/garmin-mcp/analytics/#thresholds-with-history
export function thresholdPace(speed) {
  if (num(speed) === null || speed <= 0) return null;
  const mps = speed < 1 ? speed * 10 : speed;
  const seconds = Math.round(1000 / mps);
  return seconds >= 120 && seconds <= 900 ? seconds : null;
}
export function goalCompletion(value, goal) {
  return num(value) !== null && num(goal) !== null && goal > 0 ? value >= goal : null;
}
export function normalizeBodyStatus(date, raw, errors = {}) {
  const training = obj(raw.get_training_status);
  const status = primary(obj(training.mostRecentTrainingStatus).latestTrainingStatusData, date);
  const load = obj(status.acuteTrainingLoadDTO);
  const balance = primary(obj(training.mostRecentTrainingLoadBalance).metricsTrainingLoadBalanceDTOMap, date);
  const max = obj(training.mostRecentVO2Max);
  const fitness = obj(raw.get_fitness_age), bmi = obj(obj(fitness.components).bmi);
  const hydration = obj(raw.get_hydration_data), respiration = obj(raw.get_respiration_data), spo2 = obj(raw.get_spo2_data);
  const summary = obj(raw.get_user_summary), hrv = obj(obj(raw.get_hrv_data).hrvSummary);
  const intensity = obj(raw.get_intensity_minutes);
  const weights = arr(obj(raw.get_body_composition).dateWeightList).filter(r => day(r.calendarDate) && day(r.calendarDate) <= date && num(r.weight) > 0).sort((a,b) => b.calendarDate.localeCompare(a.calendarDate));
  const weight = weights[0];
  const weightGoal = arr(obj(raw.get_weight_goal).userGoals).filter(g => g.userGoalType === 'WEIGHT_GRAMS' && num(g.goalValue) > 0 && day(g.startDate) && day(g.startDate) <= date && (!g.endDate || day(g.endDate) >= date)).sort((a,b) => (b.updateDate || '').localeCompare(a.updateDate || ''))[0];
  const ftpRaw = raw.get_cycling_ftp, ftp = obj(Array.isArray(ftpRaw) ? ftpRaw[0] : ftpRaw);
  const lt = obj(raw.get_lactate_threshold), ltHr = obj(lt.speed_and_heart_rate), ltPower = obj(lt.power);
  const asOf = value => day(value?.calendarDate) && day(value.calendarDate) <= date;
  const pressureRows = arr(obj(raw.get_blood_pressure).measurementSummaries).flatMap(s => arr(s.measurements)).filter(r => num(r.systolic) !== null && num(r.diastolic) !== null);
  const pressureAt = r => text(r.measurementTimestampLocal) || text(r.measurementTimestampGMT) || text(r.calendarDate) || date;
  pressureRows.sort((a,b)=>pressureAt(a).localeCompare(pressureAt(b)));
  const bp = pressureRows.at(-1);
  const last = obj(raw.get_last_activity), lastDate = day(last.startTimeLocal || last.startTimeGMT);
  return {
    date, source: 'Garmin Connect', syncedAt: new Date().toISOString(), unavailable: Object.keys(errors),
    training: { date: day(status.calendarDate), status: num(status.trainingStatus), feedback: text(status.trainingStatusFeedbackPhrase), paused: status.trainingPaused === true,
      load: { acute: num(load.dailyTrainingLoadAcute), chronic: num(load.dailyTrainingLoadChronic), ratio: num(load.dailyAcuteChronicWorkloadRatio), level: text(load.acwrStatus), min: num(load.minTrainingLoadChronic), max: num(load.maxTrainingLoadChronic) },
      focus: { date: day(balance.calendarDate), start: day(balance.calendarDate) ? shift(day(balance.calendarDate), -28) : null, feedback: text(balance.trainingBalanceFeedbackPhrase), categories: [
        ['anaerobic','无氧','monthlyLoadAnaerobic'], ['highAerobic','高强度有氧','monthlyLoadAerobicHigh'], ['lowAerobic','低强度有氧','monthlyLoadAerobicLow']
      ].map(([key,label,field]) => ({key,label,value:round(balance[field]),min:num(balance[field+'TargetMin']),max:num(balance[field+'TargetMax'])})) }
    },
    hrv: { lastNightHigh: num(hrv.lastNight5MinHigh), weeklyAverage: num(hrv.weeklyAvg), lastNight: num(hrv.lastNightAvg), status: text(hrv.status), baselineLow:num(obj(hrv.baseline).balancedLow), baselineHigh:num(obj(hrv.baseline).balancedUpper) },
    intensity: { total:num(intensity.weeklyTotal), goal:num(intensity.weekGoal), moderate:num(intensity.weeklyModerate), vigorous:num(intensity.weeklyVigorous), completed:goalCompletion(intensity.weeklyTotal,intensity.weekGoal), goalMetDay:text(intensity.dayOfGoalMet), start:shift(date,-((new Date(date+'T12:00:00Z').getUTCDay()+6)%7)), end:date },
    weight: { value: weight ? round(weight.weight/1000) : null, date:day(weight?.calendarDate), bmi: num(weight?.bmi) ?? num(bmi.value), bmiDate: day(bmi.lastMeasurementDate), goal: weightGoal ? round(weightGoal.goalValue/1000) : null, history: weights.slice(0,100).reverse().map(w => ({date:day(w.calendarDate),value:round(w.weight/1000)})) },
    fitnessAge: { value:round(fitness.fitnessAge), chronological:num(fitness.chronologicalAge), achievable:round(fitness.achievableFitnessAge), date:day(fitness.lastUpdated), previous:round(fitness.previousFitnessAge), components: Object.entries(obj(fitness.components)).filter(([key]) => ['vigorousDaysAvg','vigorousMinutesAvg','rhr','bmi'].includes(key)).map(([key,c]) => ({key,value:num(c.value),target:num(c.targetValue),date:day(c.lastMeasurementDate),stale:c.stale===true,priority:num(c.priority),weeks:num(c.numOfWeeksForIm)})) },
    hydration: { value:num(hydration.valueInML), goal:num(hydration.goalInML), sweatLoss:num(hydration.sweatLossInML), dailyAverage:num(hydration.dailyAverageinML), activityIntake:num(hydration.activityIntakeInML), lastEntry:text(hydration.lastEntryTimestampLocal), completed:goalCompletion(hydration.valueInML,hydration.goalInML) },
    floors: { ascended:num(summary.floorsAscended), descended:num(summary.floorsDescended), goal:num(summary.userFloorsAscendedGoal), completed:goalCompletion(summary.floorsAscended,summary.userFloorsAscendedGoal) },
    stress: { max:num(summary.maxStressLevel), activityMinutes:num(summary.activityStressDuration)===null?null:Math.round(summary.activityStressDuration/60), unmeasuredMinutes:num(summary.uncategorizedStressDuration)===null?null:Math.round(summary.uncategorizedStressDuration/60), totalMinutes:num(summary.totalStressDuration)===null?null:Math.round(summary.totalStressDuration/60) },
    battery: { atWake:num(summary.bodyBatteryAtWakeTime), duringSleep:num(summary.bodyBatteryDuringSleep), high:num(summary.bodyBatteryHighestValue), low:num(summary.bodyBatteryLowestValue) },
    respiration: { waking:num(respiration.avgWakingRespirationValue), sleep:num(respiration.avgSleepRespirationValue), min:num(respiration.lowestRespirationValue), max:num(respiration.highestRespirationValue), points:points(respiration.respirationValuesArray) },
    heartRate: { resting:num(summary.restingHeartRate), min:num(summary.minHeartRate), max:num(summary.maxHeartRate), points:points(obj(raw.get_heart_rates).heartRateValues) },
    spo2: { average:num(spo2.averageSpO2), latest:num(spo2.latestSpO2), min:num(spo2.lowestSpO2), sleep:num(spo2.avgSleepSpO2), weeklyAverage:num(spo2.lastSevenDaysAvgSpO2), latestAt:text(spo2.latestSpO2TimestampLocal) },
    bloodPressure: { systolic:num(bp?.systolic), diastolic:num(bp?.diastolic), pulse:num(bp?.pulse), date:bp ? day(bp.measurementTimestampLocal || bp.measurementTimestampGMT) || date : null, measurements: pressureRows.map(r=>({at:pressureAt(r),systolic:num(r.systolic),diastolic:num(r.diastolic),pulse:num(r.pulse)})) },
    cyclingFtp: { value:asOf(ftp) ? num(ftp.functionalThresholdPower) : null, date:asOf(ftp) ? day(ftp.calendarDate) : null, stale:ftp.isStale===true, source:text(ftp.biometricSourceType), wattsPerKg:asOf(ftp) && num(ftp.functionalThresholdPower)!==null && weight ? Math.round(ftp.functionalThresholdPower/(weight.weight/1000)*100)/100 : null, weightDate:day(weight?.calendarDate) },
    lactateThreshold: { paceSeconds:asOf(ltHr) ? thresholdPace(ltHr.speed) : null, powerToWeight:asOf(ltPower)?num(ltPower.powerToWeight):null, heartRate:asOf(ltHr) ? num(ltHr.heartRate) : null, date:asOf(ltHr) ? day(ltHr.calendarDate) : null,
      power:asOf(ltPower) ? num(ltPower.functionalThresholdPower) : null, powerDate:asOf(ltPower) ? day(ltPower.ftpCreateTime) || day(ltPower.calendarDate) : null, stale:ltPower.isStale===true },
    vo2Max: Object.fromEntries(['generic','cycling'].map(key => {const v=obj(max[key]); return [key,{value:asOf(v) ? num(v.vo2MaxPreciseValue) ?? num(v.vo2MaxValue) : null,date:asOf(v) ? day(v.calendarDate) : null}]})),
    lastActivity: lastDate && lastDate <= date ? normalizeActivity(last) : null,
  };
}
const cache = new Map(), pending = new Map();
let queue = Promise.resolve();
function read(garmin,name,args,refresh) {
  const key=JSON.stringify([name,args]);
  if(!refresh && cache.has(key) && Date.now()-cache.get(key).at<300000) return Promise.resolve(cache.get(key).value);
  if(pending.has(key)) return pending.get(key);
  const work=queue.catch(()=>{}).then(async()=>{const value=await garmin.call(name,args);if(cache.size>400)cache.delete(cache.keys().next().value);cache.set(key,{at:Date.now(),value});return value});
  queue=work.catch(()=>{});pending.set(key,work);work.finally(()=>pending.delete(key)).catch(()=>{});return work;
}
export async function loadBodyStatus(garmin,date,refresh=false) {
  const args={get_training_status:{date},get_fitness_age:{date},get_weight_goal:{date},get_intensity_minutes:{date},get_body_composition:{start_date:shift(date,-365),end_date:date},get_hydration_data:{date},get_respiration_data:{date},get_spo2_data:{date},get_blood_pressure:{date},get_cycling_ftp:{},get_lactate_threshold:{},get_last_activity:{},get_user_summary:{date},get_hrv_data:{date},get_heart_rates:{date}};
  const raw={},errors={};
  for(const [name,a] of Object.entries(args)){try{raw[name]=await read(garmin,name,a,refresh)}catch{errors[name]=true}}
  const latestDay = day(raw.get_last_activity?.startTimeLocal || raw.get_last_activity?.startTimeGMT);
  if(latestDay && latestDay > date) {
    try {
      const activities = await read(garmin,'get_activities_by_date',{start_date:shift(date,-365),end_date:date},refresh);
      raw.get_last_activity = arr(activities).filter(a => { const d=day(a.startTimeLocal || a.startTimeGMT); return d && d<=date; }).sort((a,b) => (b.startTimeLocal || b.startTimeGMT).localeCompare(a.startTimeLocal || a.startTimeGMT))[0] || null;
    } catch { errors.get_last_activity=true; }
  }
  if(Object.keys(errors).length===Object.keys(args).length)throw Error('garmin_unavailable');
  return normalizeBodyStatus(date,raw,errors);
}
export async function loadBodyTimeline(garmin,date,metric,refresh=false) {
  if (!['hrv','intensity','floors'].includes(metric)) throw Error('invalid_metric');
  const hrv=metric==='hrv', floors=metric==='floors';
  const start=hrv ? shift(date,-27) : shift(date,-((new Date(date+'T12:00:00Z').getUTCDay()+6)%7));
  const rows=[],unavailable=[];
  for(let d=start;d<=date;d=shift(d,1)) {
    try {
      const raw=await read(garmin,hrv?'get_hrv_data':floors?'get_user_summary':'get_intensity_minutes',{date:d},refresh);
      const v=hrv?obj(obj(raw).hrvSummary):obj(raw);
      if(floors) rows.push({date:d,value:num(v.floorsAscended),descended:num(v.floorsDescended),goal:num(v.userFloorsAscendedGoal),completed:goalCompletion(v.floorsAscended,v.userFloorsAscendedGoal)});
      else rows.push({date:d,value:hrv?num(v.weeklyAvg):num(v.moderateMinutes)===null||num(v.vigorousMinutes)===null?null:v.moderateMinutes+2*v.vigorousMinutes,low:hrv?num(obj(v.baseline).balancedLow):null,high:hrv?num(obj(v.baseline).balancedUpper):null});
    } catch { rows.push(floors?{date:d,value:null,descended:null,goal:null,completed:null}:{date:d,value:null,low:null,high:null});unavailable.push(d); }
  }
  return {metric,date,start,points:rows,unavailable};
}
