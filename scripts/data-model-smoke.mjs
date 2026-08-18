import assert from 'node:assert/strict';

class MemoryStorage {
  constructor(){this.map=new Map();}
  getItem(k){return this.map.has(k)?this.map.get(k):null;}
  setItem(k,v){this.map.set(k,String(v));}
  removeItem(k){this.map.delete(k);}
  clear(){this.map.clear();}
}
globalThis.localStorage=new MemoryStorage();

const api=await import('../js/core/fleet-state.js?smoke='+Date.now());
const KEY='voltdrive_fleet_manager_v1';

function canonicalSeedTest(){
  localStorage.clear();
  const state=api.loadState();
  assert.equal(state.depots.length,3,'expected 3 canonical depots');
  assert.equal(state.departments.length,6,'expected 6 canonical departments');
  assert.equal(state.routes.length,6,'expected 6 canonical routes');
  assert.equal(state.parkingBays.length,10,'parking bays must be independent from charger count');
  assert.equal(state.chargers.length,8,'expected 8 chargers');
  assert.ok(state.parkingBays.some(b=>!b.chargerId),'expected standalone parking-only bays');
  assert.deepEqual(api.validateFleetDataModel(state),[],'clean seed must have no integrity issues');
}

function legacyMigrationTest(){
  localStorage.clear();
  localStorage.setItem(KEY,JSON.stringify({
    company:{name:'Legacy Fleet',depot:'Yerevan Central Depot'},
    settings:{defaultDepot:'Yerevan Central Depot'},
    vehicles:[{id:'AM-101',name:'Legacy Vehicle',route:'Mountain Night Run',group:'Special Operations',requiredKwh:44}],
    drivers:[{id:'DR-01',name:'Legacy Driver',department:'Special Operations',vehicle:'AM-101'}],
    schedules:[{id:'SCH-01',vehicle:'AM-101',driver:'DR-01',route:'Mountain Night Run',departure:'07:00',return:'12:00',target:90,status:'confirmed'}],
    chargers:[{id:'DC-01',type:'DC',power:150,status:'available',vehicle:null,bay:'B11',health:99}],
    reservations:[{id:'RS-84021',vehicle:'AM-101',location:'Yerevan Central Depot',charger:'Auto assign',bay:'P12',arrival:'14:00',duration:'01:00',target:90,status:'confirmed'}],
    users:[{id:'USR-02',name:'Legacy Scoped User',email:'legacy@example.com',role:'ROLE-MANAGER',scope:'Airport Hub',status:'active'}],
    billing:{costCenters:[{id:'CC-DEL',name:'Special Ops',department:'Special Operations',monthCost:1,vehicles:1}]}
  }));
  const state=api.loadState();
  const vehicle=state.vehicles.find(v=>v.id==='AM-101');
  const driver=state.drivers.find(d=>d.id==='DR-01');
  const schedule=state.schedules.find(x=>x.id==='SCH-01');
  const charger=state.chargers.find(c=>c.id==='DC-01');
  const reservation=state.reservations.find(r=>r.id==='RS-84021');
  const user=state.users.find(u=>u.id==='USR-02');
  const customRoute=state.routes.find(r=>r.name==='Mountain Night Run');
  const customDepartment=state.departments.find(d=>d.name==='Special Operations');
  const chargerBay=state.parkingBays.find(b=>b.id===charger.parkingBayId);
  const reservationBay=state.parkingBays.find(b=>b.id===reservation.parkingBayId);

  assert.ok(customRoute?.id?.startsWith('ROUTE-LEGACY-'),'custom legacy route must become canonical');
  assert.ok(customDepartment?.id?.startsWith('DEPT-LEGACY-'),'custom legacy department must become canonical');
  assert.equal(vehicle.routeId,customRoute.id,'vehicle must reference migrated route');
  assert.equal(vehicle.departmentId,customDepartment.id,'vehicle must reference migrated department');
  assert.equal(driver.departmentId,customDepartment.id,'driver must reference migrated department');
  assert.equal(schedule.routeId,customRoute.id,'schedule must reference migrated route');
  assert.equal(chargerBay.code,'B11','custom charger bay must be migrated');
  assert.equal(chargerBay.chargerId,'DC-01','migrated charging bay must link back to charger');
  assert.equal(reservationBay.code,'P12','custom reservation-only bay must be migrated');
  assert.equal(reservationBay.chargerId,null,'reservation-only bay must stay independent of charger');
  assert.deepEqual(user.scopeDepotIds,['DEPOT-AIRPORT'],'legacy user depot scope must migrate structurally');
  assert.deepEqual(api.validateFleetDataModel(state),[],'migrated legacy state must remain structurally valid');
}


function masterPersistenceTest(){
  localStorage.clear();
  const state=api.loadState();
  state.depots.push({id:'DEPOT-TEST',name:'Test Depot',code:'TEST',city:'Yerevan',address:'—',capacityKw:180,baseLoadKw:0,solarKw:0,siteBatteryPct:0,status:'active'});
  state.departments.push({id:'DEPT-TEST',name:'Test Department',code:'TEST',depotId:'DEPOT-TEST',costCenterId:null,status:'active'});
  state.routes.push({id:'ROUTE-TEST',name:'Test Route',code:'TEST',departmentId:'DEPT-TEST',depotId:'DEPOT-TEST',distanceKm:20,plannedEnergyKwh:12,status:'active'});
  state.parkingBays.push({id:'BAY-TEST-01',code:'T01',name:'Bay T01',depotId:'DEPOT-TEST',chargerId:null,type:'parking',accessible:false,status:'available',vehicleId:null});
  api.saveState(state);
  const restored=api.loadState();
  assert.ok(restored.depots.some(x=>x.id==='DEPOT-TEST'),'new depot master must persist');
  assert.ok(restored.departments.some(x=>x.id==='DEPT-TEST'),'new department master must persist');
  assert.ok(restored.routes.some(x=>x.id==='ROUTE-TEST'),'new route master must persist');
  assert.ok(restored.parkingBays.some(x=>x.id==='BAY-TEST-01'),'standalone parking bay master must persist');
  assert.deepEqual(api.validateFleetDataModel(restored),[],'new canonical master records must remain valid');
}


function scopedSaveTest(){
  localStorage.clear();
  api.setCurrentAccessUserId('USR-02');
  const scoped=api.loadState();
  assert.ok(scoped.vehicles.every(v=>v.depotId==='DEPOT-YER-CENTRAL'),'scoped user must receive only central vehicles');
  scoped.vehicles[0].target=91;
  api.saveState(scoped);
  const raw=JSON.parse(localStorage.getItem(KEY));
  const routeIds=raw.routes.map(x=>x.id),bayIds=raw.parkingBays.map(x=>x.id);
  assert.equal(new Set(routeIds).size,routeIds.length,'scoped save must not duplicate route masters');
  assert.equal(new Set(bayIds).size,bayIds.length,'scoped save must not duplicate parking bay masters');
  assert.ok(raw.vehicles.some(v=>v.depotId==='DEPOT-WEST'),'scoped save must preserve vehicles outside user scope');
  assert.ok(raw.parkingBays.some(b=>b.depotId==='DEPOT-AIRPORT'),'scoped save must preserve bays outside user scope');
  api.setCurrentAccessUserId('USR-01');
}

function validatorNegativeTest(){
  localStorage.clear();
  const state=api.loadState();
  const broken=structuredClone(state);
  broken.chargers[0].parkingBayId='BAY-MISSING';
  const issues=api.validateFleetDataModel(broken);
  assert.ok(issues.some(i=>i.code==='CHARGER_BAY_MISSING'),'validator must detect orphan charger→bay reference');
}

canonicalSeedTest();
legacyMigrationTest();
masterPersistenceTest();
scopedSaveTest();
validatorNegativeTest();
console.log('OK: Fleet canonical data model smoke test passed.');
console.log('Depots: 3 · Departments: 6+ · Routes: 6+ · Parking bays: 10 · Chargers: 8');
