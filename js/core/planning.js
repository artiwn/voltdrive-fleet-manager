import {chargerSupportsVehicle,compatibleChargersForVehicle} from './charging-compatibility.js';
const BLOCKING_RESERVATION_STATUSES=new Set(['confirmed','active']);
const NON_CAPACITY_STATUSES=new Set(['draft','cancelled','completed','expired','no-show','waitlist']);
const HARD_CHARGER_STATUSES=new Set(['faulty','maintenance','offline','disabled']);

export function minutesFromClock(value){
  const [h,m]=String(value||'00:00').split(':').map(Number);
  return Math.max(0,(Number(h)||0)*60+(Number(m)||0));
}
export function durationMinutes(value){return minutesFromClock(value||'00:00');}
export function dateTimeMs(date,time='00:00'){
  if(!date)return NaN;
  const stamp=new Date(`${date}T${time||'00:00'}:00`);
  return stamp.getTime();
}
export function addMinutesMs(ms,minutes){return ms+Number(minutes||0)*60000;}
export function intervalsOverlap(startA,endA,startB,endB){
  return Number.isFinite(startA)&&Number.isFinite(endA)&&Number.isFinite(startB)&&Number.isFinite(endB)&&startA<endB&&startB<endA;
}

function dateOnly(value){return String(value||'').slice(0,10);}
function dayOfWeek(date){const d=new Date(`${date}T12:00:00`);return Number.isNaN(d.getTime())?-1:d.getDay();}
function recurrenceApplies(schedule,date){
  const start=dateOnly(schedule.serviceDate||schedule.date);
  if(!start||!date||date<start)return false;
  const recurrence=schedule.recurrence||'once';
  if(recurrence==='once')return date===start;
  if(recurrence==='daily')return true;
  if(recurrence==='weekdays'){const day=dayOfWeek(date);return day>=1&&day<=5;}
  return date===start;
}
function candidateScheduleDates(a,b){
  const aDate=dateOnly(a.serviceDate||a.date),bDate=dateOnly(b.serviceDate||b.date);
  const starts=[aDate,bDate].filter(Boolean).sort();
  if(!starts.length)return [];
  const start=starts[starts.length-1];
  const result=[];
  const base=new Date(`${start}T12:00:00`);
  if(Number.isNaN(base.getTime()))return [];
  for(let i=0;i<8;i++){
    const d=new Date(base);d.setDate(base.getDate()+i);
    result.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`);
  }
  return result;
}
export function schedulesOverlap(a,b){
  if(!a||!b||a.id===b.id)return false;
  if(!candidateScheduleDates(a,b).some(date=>recurrenceApplies(a,date)&&recurrenceApplies(b,date)))return false;
  const startA=minutesFromClock(a.departure),endA=minutesFromClock(a.return),startB=minutesFromClock(b.departure),endB=minutesFromClock(b.return);
  if(endA<=startA||endB<=startB)return false;
  return startA<endB&&startB<endA;
}
export function scheduleConflicts(schedules,draft,ignoreId=null){
  return (schedules||[]).filter(other=>other.id!==ignoreId&&schedulesOverlap(draft,other)&&(other.vehicle===draft.vehicle||(draft.driver&&other.driver===draft.driver))).map(other=>({
    schedule:other,
    vehicle:other.vehicle===draft.vehicle,
    driver:Boolean(draft.driver&&other.driver===draft.driver)
  }));
}

export function reservationInterval(reservation){
  const start=dateTimeMs(reservation?.arrivalDate,reservation?.arrival);
  const end=addMinutesMs(start,durationMinutes(reservation?.duration||'01:00'));
  return {start,end};
}
export function reservationsOverlap(a,b){
  const ia=reservationInterval(a),ib=reservationInterval(b);
  return intervalsOverlap(ia.start,ia.end,ib.start,ib.end);
}
export function reservationBlocksCapacity(reservation){return BLOCKING_RESERVATION_STATUSES.has(reservation?.status||'confirmed');}
export function chargerReservable(charger){return Boolean(charger&&!HARD_CHARGER_STATUSES.has(charger.status));}
export function reservationResourceConflicts(state,draft,ignoreId=null){
  const candidate={...draft,status:draft.status||'confirmed'};
  const conflicts={vehicle:[],charger:[],bay:[],incompatibleCharger:false,incompatibleBay:false,capacity:false,capacityUsed:0,capacityTotal:0};
  const overlapping=(state?.reservations||[]).filter(r=>r.id!==ignoreId&&reservationBlocksCapacity(r)&&reservationsOverlap(candidate,r));
  conflicts.vehicle=overlapping.filter(r=>r.vehicle&&r.vehicle===candidate.vehicle);
  const vehicle=(state?.vehicles||[]).find(v=>v.id===candidate.vehicle);
  if(candidate.assignmentMode==='charger'&&candidate.charger&&candidate.charger!=='Auto assign'){
    conflicts.charger=overlapping.filter(r=>r.charger===candidate.charger);
    const charger=(state?.chargers||[]).find(c=>c.id===candidate.charger);
    if(vehicle&&(!charger||!chargerSupportsVehicle(vehicle,charger)))conflicts.incompatibleCharger=true;
    const bayId=candidate.parkingBayId||charger?.parkingBayId||null;
    if(bayId)conflicts.bay=overlapping.filter(r=>r.parkingBayId===bayId);
  }else if(candidate.assignmentMode==='bay'&&candidate.parkingBayId){
    conflicts.bay=overlapping.filter(r=>r.parkingBayId===candidate.parkingBayId);
    const bay=(state?.parkingBays||[]).find(item=>item.id===candidate.parkingBayId);
    const bayCharger=bay?.chargerId?(state?.chargers||[]).find(c=>c.id===bay.chargerId):null;
    if(vehicle&&bayCharger&&!chargerSupportsVehicle(vehicle,bayCharger))conflicts.incompatibleBay=true;
  }
  const depotChargers=(state?.chargers||[]).filter(c=>c.depotId===candidate.depotId&&chargerReservable(c));
  const chargers=vehicle?compatibleChargersForVehicle(vehicle,depotChargers):depotChargers;
  const compatibleIds=new Set(chargers.map(c=>c.id));
  const depotOverlaps=overlapping.filter(r=>r.depotId===candidate.depotId);
  let genericCapacity=0;
  const occupiedCompatible=new Set();
  depotOverlaps.forEach(reservation=>{
    if(reservation.assignmentMode==='charger'&&reservation.charger&&reservation.charger!=='Auto assign'){
      if(compatibleIds.has(reservation.charger))occupiedCompatible.add(reservation.charger);
      return;
    }
    if(reservation.assignmentMode==='bay'&&reservation.parkingBayId){
      const bay=(state?.parkingBays||[]).find(item=>item.id===reservation.parkingBayId);
      if(bay?.chargerId){if(compatibleIds.has(bay.chargerId))occupiedCompatible.add(bay.chargerId);return;}
    }
    genericCapacity+=1;
  });
  conflicts.capacityUsed=Math.min(chargers.length,occupiedCompatible.size+genericCapacity);
  conflicts.capacityTotal=chargers.length;
  conflicts.capacity=chargers.length===0||conflicts.capacityUsed>=chargers.length;
  return conflicts;
}
export function reservationHasConflict(result){return Boolean(result&&(result.vehicle.length||result.charger.length||result.bay.length||result.incompatibleCharger||result.incompatibleBay||result.capacity));}
export function availableChargersForReservation(state,draft,ignoreId=null){
  const vehicle=(state?.vehicles||[]).find(v=>v.id===draft.vehicle);
  const eligible=(state?.chargers||[]).filter(charger=>charger.depotId===draft.depotId&&chargerReservable(charger)&&(!vehicle||chargerSupportsVehicle(vehicle,charger)));
  const ordered=vehicle?compatibleChargersForVehicle(vehicle,eligible):eligible.sort((a,b)=>Number(b.power||0)-Number(a.power||0));
  return ordered.filter(charger=>{
    const candidate={...draft,assignmentMode:'charger',charger:charger.id,parkingBayId:charger.parkingBayId||null,status:'confirmed'};
    const result=reservationResourceConflicts(state,candidate,ignoreId);
    return !result.charger.length&&!result.bay.length&&!result.capacity;
  });
}
export function availableBaysForReservation(state,draft,ignoreId=null){
  const vehicle=(state?.vehicles||[]).find(v=>v.id===draft.vehicle);
  return (state?.parkingBays||[]).filter(bay=>{
    if(bay.depotId!==draft.depotId||['blocked'].includes(bay.status))return false;
    if(bay.chargerId&&vehicle){const charger=(state?.chargers||[]).find(c=>c.id===bay.chargerId);if(!charger||!chargerSupportsVehicle(vehicle,charger))return false;}
    const candidate={...draft,assignmentMode:'bay',parkingBayId:bay.id,status:'confirmed'};
    const result=reservationResourceConflicts(state,candidate,ignoreId);
    return !result.bay.length&&!result.capacity;
  });
}
export function reservationConflictMessage(result){
  if(!result)return '';
  const parts=[];
  if(result.vehicle.length)parts.push(`vehicle already reserved in ${result.vehicle.map(r=>r.id).join(', ')}`);
  if(result.incompatibleCharger)parts.push('selected charger is not compatible with this vehicle connector/power profile');
  if(result.incompatibleBay)parts.push('selected parking bay uses a charger that is not compatible with this vehicle');
  if(result.charger.length)parts.push(`charger already booked in ${result.charger.map(r=>r.id).join(', ')}`);
  if(result.bay.length)parts.push(`parking bay already booked in ${result.bay.map(r=>r.id).join(', ')}`);
  if(result.capacity)parts.push(`compatible charging capacity is fully reserved (${result.capacityUsed}/${result.capacityTotal} compatible chargers)`);
  return parts.join(' · ');
}
export function reservationProtectedNow(reservation,{date,time}={},leadMinutes=20){
  if(!reservation||!['confirmed','active'].includes(reservation.status))return false;
  if(reservation.status==='active')return true;
  const now=dateTimeMs(date,time||'00:00');const {start,end}=reservationInterval(reservation);
  if(!Number.isFinite(now)||!Number.isFinite(start)||!Number.isFinite(end))return false;
  return now>=addMinutesMs(start,-Math.max(0,Number(leadMinutes)||0))&&now<end;
}
export function reservationEffectiveStatus(reservation,{date,time}={}){
  const status=reservation?.status||'confirmed';
  if(['cancelled','completed','active','no-show','expired'].includes(status))return status;
  const now=dateTimeMs(date,time||'00:00');
  if(!Number.isFinite(now))return status;
  const {start,end}=reservationInterval(reservation);
  if(!Number.isFinite(start)||!Number.isFinite(end))return status;
  if(status==='draft'&&now>end)return'expired';
  if(status==='waitlist'&&now>end)return'expired';
  if(status==='confirmed'){
    const graceEnd=addMinutesMs(start,Number(reservation.grace||0));
    if(now>graceEnd)return'no-show';
  }
  return status;
}
export function reconcileReservationLifecycle(reservations,clock){
  return (reservations||[]).map(r=>({...r,status:reservationEffectiveStatus(r,clock)}));
}
export const RESERVATION_STATUSES=['draft','confirmed','active','completed','cancelled','expired','no-show','waitlist'];
export const NON_CAPACITY_RESERVATION_STATUSES=NON_CAPACITY_STATUSES;
