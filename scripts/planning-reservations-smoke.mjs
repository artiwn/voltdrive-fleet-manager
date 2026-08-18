import assert from 'node:assert/strict';
import fs from 'node:fs';

class MemoryStorage {
  constructor(){this.map=new Map();}
  getItem(k){return this.map.has(k)?this.map.get(k):null;}
  setItem(k,v){this.map.set(k,String(v));}
  removeItem(k){this.map.delete(k);}
  clear(){this.map.clear();}
}
globalThis.localStorage=new MemoryStorage();

const planning=await import('../js/core/planning.js?planning='+Date.now());
const stateApi=await import('../js/core/fleet-state.js?planning='+Date.now());
stateApi.setCurrentAccessUserId('USR-01');
const state=stateApi.loadState();

// Schedule collision engine: same vehicle/driver overlap must block, exact boundary must not.
const sameVehicle={id:'TEST-SCH-A',serviceDate:'2026-08-13',vehicle:'AM-101',driver:'DR-06',departure:'09:00',return:'10:00',recurrence:'once'};
let conflicts=planning.scheduleConflicts(state.schedules,sameVehicle,null);
assert.ok(conflicts.some(c=>c.vehicle&&c.schedule.id==='SCH-01'),'same vehicle overlap must be detected');

const sameDriver={id:'TEST-SCH-B',serviceDate:'2026-08-13',vehicle:'AM-108',driver:'DR-01',departure:'09:00',return:'10:00',recurrence:'once'};
conflicts=planning.scheduleConflicts(state.schedules,sameDriver,null);
assert.ok(conflicts.some(c=>c.driver&&c.schedule.id==='SCH-01'),'same driver overlap must be detected');

const boundary={id:'TEST-SCH-C',serviceDate:'2026-08-13',vehicle:'AM-101',driver:'DR-01',departure:'11:30',return:'12:00',recurrence:'once'};
assert.equal(planning.scheduleConflicts(state.schedules,boundary,null).length,0,'schedule starting at exact return boundary must be allowed');

const differentDay={id:'TEST-SCH-D',serviceDate:'2026-08-14',vehicle:'AM-101',driver:'DR-01',departure:'09:00',return:'10:00',recurrence:'once'};
assert.equal(planning.scheduleConflicts(state.schedules,differentDay,null).length,0,'one-time schedule on another date must not conflict');

const recurring={id:'TEST-SCH-E',serviceDate:'2026-08-13',vehicle:'AM-108',driver:'DR-06',departure:'12:30',return:'13:00',recurrence:'daily'};
assert.ok(planning.scheduleConflicts(state.schedules,recurring,null).some(c=>c.driver&&c.schedule.id==='SCH-06'),'recurring schedule must conflict on matching service day');

// Reservation interval/resource collision engine.
const overlapCharger={id:'TEST-R1',vehicle:'AM-106',depotId:'DEPOT-YER-CENTRAL',assignmentMode:'charger',charger:'AC-08',parkingBayId:'BAY-CENTRAL-08',arrivalDate:'2026-08-13',arrival:'13:30',duration:'00:30',status:'confirmed'};
let result=planning.reservationResourceConflicts(state,overlapCharger,null);
assert.ok(result.charger.some(r=>r.id==='RS-84021'),'overlapping charger reservation must be detected');
assert.ok(result.bay.some(r=>r.id==='RS-84021'),'charger bay overlap must also be detected');

const overlapVehicle={id:'TEST-R2',vehicle:'AM-105',depotId:'DEPOT-YER-CENTRAL',assignmentMode:'auto',charger:'Auto assign',parkingBayId:null,arrivalDate:'2026-08-13',arrival:'13:20',duration:'00:20',status:'confirmed'};
result=planning.reservationResourceConflicts(state,overlapVehicle,null);
assert.ok(result.vehicle.some(r=>r.id==='RS-84021'),'vehicle cannot hold overlapping reservations');

const nonOverlap={id:'TEST-R3',vehicle:'AM-106',depotId:'DEPOT-YER-CENTRAL',assignmentMode:'charger',charger:'AC-08',parkingBayId:'BAY-CENTRAL-08',arrivalDate:'2026-08-13',arrival:'14:30',duration:'00:30',status:'confirmed'};
result=planning.reservationResourceConflicts(state,nonOverlap,null);
assert.equal(result.charger.length,0,'resource can be rebooked at exact end boundary');
assert.equal(result.bay.length,0,'parking bay can be rebooked at exact end boundary');

const availableAt1330=planning.availableChargersForReservation(state,{...overlapCharger,charger:'Auto assign',parkingBayId:null,assignmentMode:'auto'},null);
assert.ok(!availableAt1330.some(c=>c.id==='AC-08'),'charger booked in the interval must not be offered');

// Drafts never consume capacity.
const draftState=structuredClone(state);
draftState.reservations.push({id:'DRAFT-X',vehicle:'AM-106',depotId:'DEPOT-YER-CENTRAL',assignmentMode:'charger',charger:'DC-02',parkingBayId:'BAY-CENTRAL-02',arrivalDate:'2026-08-13',arrival:'15:00',duration:'01:00',status:'draft'});
result=planning.reservationResourceConflicts(draftState,{id:'TEST-R4',vehicle:'AM-108',depotId:'DEPOT-YER-CENTRAL',assignmentMode:'charger',charger:'DC-02',parkingBayId:'BAY-CENTRAL-02',arrivalDate:'2026-08-13',arrival:'15:10',duration:'00:20',status:'confirmed'},null);
assert.equal(result.charger.length,0,'draft reservation must not block charger capacity');

// Capacity limit counts charger, auto and bay reservations equally as future charging demand.
const capacityState=structuredClone(state);
capacityState.chargers=capacityState.chargers.filter(c=>c.depotId!=='DEPOT-YER-CENTRAL').concat([
  {id:'T-C1',depotId:'DEPOT-YER-CENTRAL',parkingBayId:'T-B1',status:'available'},
  {id:'T-C2',depotId:'DEPOT-YER-CENTRAL',parkingBayId:'T-B2',status:'available'}
]);
capacityState.reservations=[
  {id:'CAP-1',vehicle:'V1',depotId:'DEPOT-YER-CENTRAL',assignmentMode:'charger',charger:'T-C1',parkingBayId:'T-B1',arrivalDate:'2026-08-14',arrival:'10:00',duration:'01:00',status:'confirmed'},
  {id:'CAP-2',vehicle:'V2',depotId:'DEPOT-YER-CENTRAL',assignmentMode:'auto',charger:'Auto assign',parkingBayId:null,arrivalDate:'2026-08-14',arrival:'10:10',duration:'00:30',status:'confirmed'}
];
result=planning.reservationResourceConflicts(capacityState,{id:'CAP-3',vehicle:'V3',depotId:'DEPOT-YER-CENTRAL',assignmentMode:'bay',charger:'Auto assign',parkingBayId:'T-B3',arrivalDate:'2026-08-14',arrival:'10:20',duration:'00:20',status:'confirmed'},null);
assert.equal(result.capacity,true,'third overlapping reservation must be blocked when two charger slots are already reserved');
assert.equal(result.capacityUsed,2);
assert.equal(result.capacityTotal,2);

// Lifecycle policy: confirmed past grace => no-show; waitlist/draft after end => expired.
assert.equal(planning.reservationEffectiveStatus({arrivalDate:'2026-08-13',arrival:'10:00',duration:'00:30',grace:15,status:'confirmed'},{date:'2026-08-13',time:'12:54'}),'no-show');
assert.equal(planning.reservationEffectiveStatus({arrivalDate:'2026-08-13',arrival:'09:00',duration:'00:45',status:'waitlist'},{date:'2026-08-13',time:'12:54'}),'expired');
assert.equal(planning.reservationEffectiveStatus({arrivalDate:'2026-08-13',arrival:'15:00',duration:'00:45',status:'draft'},{date:'2026-08-13',time:'12:54'}),'draft');
assert.equal(state.reservations.find(r=>r.id==='RS-83998')?.status,'no-show','seed lifecycle must expose a no-show example');
assert.equal(state.reservations.find(r=>r.id==='RS-83999')?.status,'expired','seed lifecycle must expose an expired example');

// Page implementation regression: the original conflict bug must not return true when conflicts exist.
const scheduleSource=fs.readFileSync(new URL('../js/pages/schedules.js',import.meta.url),'utf8');
assert.match(scheduleSource,/return !invalidTime&&!conflicts\.length/,'schedule form must block conflict save');
assert.match(scheduleSource,/conflict\$\{conflicted===1\?'':'s'\} skipped/,'CSV import must report skipped conflicts');
const reservationSource=fs.readFileSync(new URL('../js/pages/reservations.js',import.meta.url),'utf8');
assert.match(reservationSource,/reservationResourceConflicts/,'reservation page must use centralized interval engine');
assert.match(reservationSource,/saveReservation\('draft'\)/,'reservation wizard must support Draft lifecycle');

console.log('OK: Fleet scheduling & reservation overlap smoke test passed.');
console.log('Schedule date/recurrence conflicts · resource intervals · depot capacity · Draft/No-show/Expired lifecycle');
