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

const compat=await import('../js/core/charging-compatibility.js?compat='+Date.now());
const planning=await import('../js/core/planning.js?compat='+Date.now());
const stateApi=await import('../js/core/fleet-state.js?compat='+Date.now());
stateApi.setCurrentAccessUserId('USR-01');
const state=stateApi.loadState();

assert.equal(stateApi.validateFleetDataModel(state).length,0,'seed must have no compatibility/data-model issues');
const ccsVehicle=state.vehicles.find(v=>v.id==='AM-101');
const dualVehicle=state.vehicles.find(v=>v.id==='AM-105');
const dc=state.chargers.find(c=>c.id==='DC-02');
const ac=state.chargers.find(c=>c.id==='AC-05');

assert.deepEqual(compat.vehicleConnectorTypes(ccsVehicle),['CCS2']);
assert.equal(compat.chargerSupportsVehicle(ccsVehicle,dc),true,'CCS2 vehicle must support CCS2 charger');
assert.equal(compat.chargerSupportsVehicle(ccsVehicle,ac),false,'CCS2-only vehicle must not support Type 2 charger');
assert.equal(compat.chargerSupportsVehicle(dualVehicle,ac),true,'dual connector vehicle must support Type 2 charger');
assert.equal(compat.deliverablePowerKw(dualVehicle,ac),11,'vehicle AC acceptance must cap 22 kW charger at 11 kW');
assert.equal(compat.deliverablePowerKw(ccsVehicle,dc),120,'vehicle DC acceptance must cap 150 kW charger at 120 kW');

const liveForCcs=compat.compatibleChargersForVehicle(ccsVehicle,state.chargers,{live:true});
assert.ok(liveForCcs.some(c=>c.id==='DC-02'),'available compatible DC charger must be offered');
assert.ok(!liveForCcs.some(c=>c.id==='AC-05'),'incompatible AC charger must not be offered to CCS2-only vehicle');

const reservationDraft={vehicle:'AM-101',depotId:'DEPOT-YER-CENTRAL',assignmentMode:'auto',charger:'Auto assign',parkingBayId:null,arrivalDate:'2026-08-14',arrival:'15:00',duration:'00:30',status:'confirmed'};
const reservationChargers=planning.availableChargersForReservation(state,reservationDraft,null);
assert.ok(reservationChargers.every(c=>compat.chargerSupportsVehicle(ccsVehicle,c)),'reservation picker must return only compatible chargers');
assert.ok(!reservationChargers.some(c=>c.id==='AC-05'),'reservation picker must exclude incompatible AC charger');

const tampered=planning.reservationResourceConflicts(state,{...reservationDraft,assignmentMode:'charger',charger:'AC-05',parkingBayId:'BAY-CENTRAL-05'},null);
assert.equal(tampered.incompatibleCharger,true,'tampered incompatible specific charger must be rejected');
assert.equal(planning.reservationHasConflict(tampered),true);
assert.match(planning.reservationConflictMessage(tampered),/not compatible/i);

const badState=structuredClone(state);
const badVehicle=badState.vehicles.find(v=>v.id==='AM-101');
badVehicle.charger='AC-05';
assert.ok(stateApi.validateFleetDataModel(badState).some(issue=>issue.code==='VEHICLE_CHARGER_INCOMPATIBLE'),'integrity validator must catch incompatible live assignment');

// Legacy/custom vehicle profiles must become canonical on load.
const legacy=structuredClone(state);
legacy.vehicles.push({id:'AM-LEGACY',name:'Legacy AC Van',plate:'LEG-01',connector:'Type 2',battery:50,target:80,departure:'16:00',requiredKwh:20,status:'queued',charger:'—',power:0,priority:'normal',depotId:'DEPOT-YER-CENTRAL',departmentId:'DEPT-GENERAL',routeId:'ROUTE-EXEC'});
localStorage.setItem('voltdrive_fleet_manager_v1',JSON.stringify(legacy));
const migrated=stateApi.loadState();
const legacyVehicle=migrated.vehicles.find(v=>v.id==='AM-LEGACY');
assert.deepEqual(legacyVehicle.connectorTypes,['Type 2']);
assert.ok(Number(legacyVehicle.maxAcKw)>0,'legacy Type 2 vehicle must receive a prototype AC acceptance limit');
assert.equal(compat.chargerSupportsVehicle(legacyVehicle,dc),false);
assert.equal(compat.chargerSupportsVehicle(legacyVehicle,ac),true);

const operationsSource=fs.readFileSync(new URL('../js/pages/operations.js',import.meta.url),'utf8');
const depotSource=fs.readFileSync(new URL('../js/pages/depot.js',import.meta.url),'utf8');
const reservationsSource=fs.readFileSync(new URL('../js/pages/reservations.js',import.meta.url),'utf8');
assert.match(operationsSource,/compatibleChargersForVehicle/,'Operations assignment must use compatibility engine');
assert.match(operationsSource,/bestCompatibleConnector/,'Operations must select a concrete compatible connector');
assert.match(depotSource,/availableChargersForVehicle/,'Depot queue assignment must be vehicle-specific');
assert.match(depotSource,/deliverablePowerKw/,'Depot assignment/power rebalance must respect vehicle charging acceptance');
assert.match(reservationsSource,/compatibilitySummary/,'Reservation wizard must surface connector/power fit');
assert.match(reservationsSource,/incompatibleCharger/,'Reservation save must reject tampered incompatible charger');

console.log('OK: Fleet charger compatibility & assignment smoke test passed.');
console.log('Connector match · AC/DC power caps · live assignment · reservation filtering · tamper rejection · legacy migration');
