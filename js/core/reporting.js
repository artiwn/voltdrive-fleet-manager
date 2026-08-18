function isoDate(value){
  const text=String(value||'').slice(0,10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text)?text:null;
}
function utcDate(value){
  const key=isoDate(value);if(!key)return null;
  const [y,m,d]=key.split('-').map(Number);return new Date(Date.UTC(y,m-1,d));
}
function dateKey(date){return date.toISOString().slice(0,10)}
function addDays(key,days){const d=utcDate(key);if(!d)return key;d.setUTCDate(d.getUTCDate()+days);return dateKey(d)}
function dayDiff(a,b){const da=utcDate(a),db=utcDate(b);return da&&db?Math.round((db-da)/86400000):0}
export function durationMinutes(value){
  const match=String(value||'').match(/^(\d{1,2}):(\d{2})$/);return match?Number(match[1])*60+Number(match[2]):0;
}
export function reportRange(anchor='2026-08-13',period='week'){
  const end=isoDate(anchor)||'2026-08-13';
  const days={day:1,week:7,month:30,quarter:90}[period]||7;
  return {period,label:{day:'Today',week:'Last 7 days',month:'Last 30 days',quarter:'Last 90 days'}[period]||'Last 7 days',start:addDays(end,-(days-1)),end,days};
}
export function inReportRange(value,range){const key=isoDate(value);return Boolean(key&&key>=range.start&&key<=range.end)}
function formatMonthDay(key){const d=utcDate(key);return d?d.toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'}):key}
function formatWeekday(key){const d=utcDate(key);return d?d.toLocaleDateString('en-US',{weekday:'short',timeZone:'UTC'}):key}
export function buildTimeBuckets(anchor,period){
  const range=reportRange(anchor,period);
  if(period==='day')return [0,4,8,12,16,20].map(start=>({type:'time',startMinute:start*60,endMinute:(start+4)*60,label:`${String(start).padStart(2,'0')}–${String((start+4)%24).padStart(2,'0')}`}));
  if(period==='week')return Array.from({length:7},(_,i)=>{const key=addDays(range.start,i);return {type:'date',start:key,end:key,label:formatWeekday(key)};});
  const size=period==='month'?5:15;
  const buckets=[];
  for(let offset=0;offset<range.days;offset+=size){const start=addDays(range.start,offset);const end=addDays(range.start,Math.min(range.days-1,offset+size-1));buckets.push({type:'date',start,end,label:period==='month'?formatMonthDay(end):`${formatMonthDay(start)}–${formatMonthDay(end)}`});}
  return buckets;
}
function recordBucketIndex(recordDate,recordTime,buckets){
  if(!buckets.length)return -1;
  if(buckets[0].type==='time'){
    const m=String(recordTime||'12:00').match(/^(\d{1,2}):(\d{2})$/);const minute=m?Number(m[1])*60+Number(m[2]):720;
    return buckets.findIndex(b=>minute>=b.startMinute&&minute<b.endMinute);
  }
  const key=isoDate(recordDate);return buckets.findIndex(b=>key&&key>=b.start&&key<=b.end);
}
function driverForVehicle(state,vehicleId){return (state.drivers||[]).find(d=>d.vehicle===vehicleId)||null}
function vehicleDepartmentId(state,vehicleId){return (state.vehicles||[]).find(v=>v.id===vehicleId)?.departmentId||driverForVehicle(state,vehicleId)?.departmentId||null}
function currentDepartureRecords(state,range,vehicleIds,driverFilter){
  return (state.schedules||[]).filter(x=>inReportRange(x.serviceDate||state.settings?.operationDate,range)&&vehicleIds.has(x.vehicle)&&(driverFilter==='all'||x.driver===driverFilter)).map(x=>{
    const v=(state.vehicles||[]).find(item=>item.id===x.vehicle);let result='ready';
    if(x.status==='risk'||x.status==='conflict'||v?.status==='risk'||Number(v?.battery||0)<Number(x.target||v?.target||0))result='missed-target';
    else if(x.status==='planned'&&v?.status==='queued')result='at-risk';
    return {id:`LIVE-${x.id}`,date:x.serviceDate||state.settings?.operationDate,depotId:x.depotId,vehicle:x.vehicle,driver:x.driver,targetSoc:Number(x.target||0),actualSoc:Number(v?.battery||0),result,delayMinutes:0,scheduleId:x.id,route:x.route,departure:x.departure};
  });
}
function sum(list,key){return list.reduce((total,item)=>total+(Number(item?.[key])||0),0)}
export function buildFleetReport(state,filters={}){
  const period=filters.period||'week';const anchor=state.settings?.operationDate||'2026-08-13';const range=reportRange(anchor,period);
  const departmentId=filters.departmentId||'all',vehicleFilter=filters.vehicleId||'all',driverFilter=filters.driverId||'all',chargerFilter=filters.chargerId||'all';
  let vehicles=(state.vehicles||[]).filter(v=>v.active!==false);
  if(departmentId!=='all')vehicles=vehicles.filter(v=>v.departmentId===departmentId||vehicleDepartmentId(state,v.id)===departmentId);
  if(vehicleFilter!=='all')vehicles=vehicles.filter(v=>v.id===vehicleFilter);
  if(driverFilter!=='all'){const driver=(state.drivers||[]).find(d=>d.id===driverFilter);vehicles=driver?.vehicle?vehicles.filter(v=>v.id===driver.vehicle):[];}
  const vehicleIds=new Set(vehicles.map(v=>v.id));
  const sessions=(state.sessions||[]).filter(x=>vehicleIds.has(x.vehicle)&&inReportRange(x.date||anchor,range)&&(driverFilter==='all'||x.driver===driverFilter)&&(chargerFilter==='all'||x.charger===chargerFilter));
  const reimbursements=(state.reimbursements||[]).filter(x=>vehicleIds.has(x.vehicle)&&inReportRange(x.date,range)&&(driverFilter==='all'||x.driver===driverFilter));
  const schedules=(state.schedules||[]).filter(x=>vehicleIds.has(x.vehicle)&&inReportRange(x.serviceDate||anchor,range)&&(driverFilter==='all'||x.driver===driverFilter));
  const reservations=(state.reservations||[]).filter(x=>vehicleIds.has(x.vehicle)&&inReportRange(x.arrivalDate||anchor,range)&&(chargerFilter==='all'||x.charger===chargerFilter));
  const historicalDepartures=(state.departureHistory||[]).filter(x=>vehicleIds.has(x.vehicle)&&inReportRange(x.date,range)&&(driverFilter==='all'||x.driver===driverFilter));
  const departures=historicalDepartures.concat(currentDepartureRecords(state,range,vehicleIds,driverFilter));
  let chargers=(state.chargers||[]);
  if(chargerFilter!=='all')chargers=chargers.filter(c=>c.id===chargerFilter);
  else if(vehicleFilter!=='all'||driverFilter!=='all'||departmentId!=='all'){
    const used=new Set(sessions.map(x=>x.charger).filter(Boolean));reservations.forEach(x=>{if(x.charger&&x.charger!=='Auto assign')used.add(x.charger)});vehicles.forEach(v=>{if(v.charger&&v.charger!=='—')used.add(v.charger)});chargers=chargers.filter(c=>used.has(c.id));
  }
  const chargerIds=new Set(chargers.map(c=>c.id));
  const chargerUsage=(state.chargerUsageHistory||[]).filter(x=>chargerIds.has(x.chargerId)&&inReportRange(x.date,range));
  const bayIdsFromChargers=new Set(chargers.map(c=>c.parkingBayId).filter(Boolean));
  reservations.forEach(r=>{if(r.parkingBayId)bayIdsFromChargers.add(r.parkingBayId)});
  let parkingUsage=(state.parkingUsageHistory||[]).filter(x=>inReportRange(x.date,range));
  if(vehicleFilter!=='all'||driverFilter!=='all'||departmentId!=='all'||chargerFilter!=='all')parkingUsage=parkingUsage.filter(x=>bayIdsFromChargers.has(x.parkingBayId));
  const maintenance=(state.maintenanceTickets||[]).filter(x=>inReportRange(x.openedDate,range)&&(chargerFilter==='all'||x.chargerId===chargerFilter));
  const energyHistory=(state.energyHistory||[]).filter(x=>inReportRange(x.date,range));
  const sessionEnergy=sum(sessions,'energy'),homeEnergy=sum(reimbursements,'energy'),sessionCost=sum(sessions,'cost'),homeCost=sum(reimbursements,'amount');
  const energy=sessionEnergy+homeEnergy,cost=sessionCost+homeCost,failed=sessions.filter(x=>x.status==='failed').length;
  const departureAssessed=departures.filter(x=>!['planned'].includes(x.result));const readyDepartures=departureAssessed.filter(x=>x.result==='ready').length;const readiness=departureAssessed.length?readyDepartures/departureAssessed.length*100:0;
  const busyMinutes=sum(chargerUsage,'busyMinutes'),chargerMinutes=busyMinutes+sum(chargerUsage,'availableMinutes')+sum(chargerUsage,'offlineMinutes');const utilization=chargerMinutes?busyMinutes/chargerMinutes*100:0;
  const occupiedMinutes=sum(parkingUsage,'occupiedMinutes')+sum(parkingUsage,'reservedMinutes'),bayMinutes=occupiedMinutes+sum(parkingUsage,'availableMinutes');const bayUtilization=bayMinutes?occupiedMinutes/bayMinutes*100:0;
  const reservationCounts={total:reservations.length,completed:0,cancelled:0,noShow:0,expired:0,active:0,confirmed:0,draft:0,waitlist:0};reservations.forEach(r=>{const st=String(r.status||'').toLowerCase();if(st==='no-show')reservationCounts.noShow++;else if(st==='cancelled')reservationCounts.cancelled++;else if(st==='completed')reservationCounts.completed++;else if(st==='expired')reservationCounts.expired++;else if(st==='active')reservationCounts.active++;else if(st==='confirmed')reservationCounts.confirmed++;else if(st==='draft')reservationCounts.draft++;else if(st==='waitlist'||st==='waiting list')reservationCounts.waitlist++;});
  const resolvedMaintenance=maintenance.filter(x=>x.status==='resolved'),repeatMaintenance=maintenance.filter(x=>x.repeatedFailure);const avgRepair=resolvedMaintenance.length?sum(resolvedMaintenance,'repairMinutes')/resolvedMaintenance.length:0;
  const renewableKwh=sum(energyHistory,'renewableKwh'),gridKwh=sum(energyHistory,'gridKwh'),carbonAvoidedKg=sum(energyHistory,'carbonAvoidedKg'),siteEnergy=renewableKwh+gridKwh,renewableShare=siteEnergy?renewableKwh/siteEnergy*100:0;
  const hourSlots=Array.from({length:12},(_,i)=>({start:i*2,count:0,energy:0}));sessions.forEach(x=>{const h=Number(String(x.start||'0').split(':')[0])||0;const slot=hourSlots[Math.min(11,Math.floor(h/2))];slot.count++;slot.energy+=Number(x.energy)||0;});const relevant=hourSlots.filter(x=>x.start>=6&&x.start<=20);const busySlot=relevant.reduce((best,x)=>!best||x.count>best.count?x:best,null);const inactiveSlot=relevant.reduce((best,x)=>!best||x.count<best.count?x:best,null);
  const buckets=buildTimeBuckets(anchor,period),trend=buckets.map(b=>({label:b.label,energy:0,cost:0,sessions:0}));sessions.forEach(x=>{const idx=recordBucketIndex(x.date||anchor,x.start,buckets);if(idx>=0){trend[idx].energy+=Number(x.energy)||0;trend[idx].cost+=Number(x.cost)||0;trend[idx].sessions++;}});reimbursements.forEach(x=>{const idx=recordBucketIndex(x.date,'12:00',buckets);if(idx>=0){trend[idx].energy+=Number(x.energy)||0;trend[idx].cost+=Number(x.amount)||0;}});
  return {range,period,vehicles,sessions,reimbursements,schedules,reservations,departures,chargers,chargerUsage,parkingUsage,maintenance,energyHistory,sessionEnergy,homeEnergy,energy,sessionCost,homeCost,cost,failed,readiness,utilization,bayUtilization,reservationCounts,resolvedMaintenance,repeatMaintenance,avgRepair,renewableKwh,gridKwh,carbonAvoidedKg,renewableShare,costKwh:energy?cost/energy:0,busySlot,inactiveSlot,trend};
}
export function chargerReportStats(report,chargerId){
  const sessions=report.sessions.filter(x=>x.charger===chargerId),usage=report.chargerUsage.filter(x=>x.chargerId===chargerId);const busy=sum(usage,'busyMinutes'),total=busy+sum(usage,'availableMinutes')+sum(usage,'offlineMinutes');return {sessions,energy:sum(sessions,'energy'),failed:sessions.filter(x=>x.status==='failed').length,utilization:total?busy/total*100:0,offlineMinutes:sum(usage,'offlineMinutes')};
}
export function parkingBayReportStats(report,parkingBayId){
  const rows=report.parkingUsage.filter(x=>x.parkingBayId===parkingBayId);const used=sum(rows,'occupiedMinutes')+sum(rows,'reservedMinutes'),available=sum(rows,'availableMinutes');return {usedMinutes:used,availableMinutes:available,blockedMinutes:sum(rows,'blockedMinutes'),utilization:used+available?used/(used+available)*100:0};
}
