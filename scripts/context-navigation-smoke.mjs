import assert from 'node:assert/strict';
import fs from 'node:fs';

class MemoryStorage {constructor(){this.map=new Map();}getItem(k){return this.map.has(k)?this.map.get(k):null;}setItem(k,v){this.map.set(k,String(v));}removeItem(k){this.map.delete(k);}clear(){this.map.clear();}}
globalThis.localStorage=new MemoryStorage();
const stateApi=await import('../js/core/fleet-state.js?ctx='+Date.now());
const nav=await import('../js/core/context-navigation.js?ctx='+Date.now());
stateApi.setCurrentAccessUserId('USR-01');
const state=stateApi.loadState();

const v=nav.vehicleContext(state,'AM-101');
assert.equal(v.vehicle?.id,'AM-101');
assert.equal(v.driver?.id,'DR-01');
assert.equal(v.schedule?.id,'SCH-01');
assert.equal(v.reservation?.id,'RS-84017');
assert.equal(v.session?.id,'CS-261842');
assert.equal(v.charger?.id,'DC-01');

const d=nav.driverContext(state,'DR-05');
assert.equal(d.vehicle?.id,'AM-105');
assert.equal(d.schedule?.id,'SCH-05');
assert.ok(d.claim?.id,'driver should resolve a home charging claim');

const c=nav.chargerContext(state,'DC-01');
assert.equal(c.vehicle?.id,'AM-101');
assert.equal(c.session?.id,'CS-261842');
assert.equal(c.reservation?.id,'RS-84017');

const r=nav.reservationContext(state,'RS-84017');
assert.equal(r.vehicle?.id,'AM-101');
assert.equal(r.driver?.id,'DR-01');
assert.equal(r.session?.id,'CS-261842');

const sess=nav.sessionContext({...state,sessions:state.sessions.map(x=>x.id==='CS-261842'?{...x,reservation:'RS-84017'}:x)},'CS-261842');
assert.equal(sess.reservation?.id,'RS-84017');
assert.equal(sess.charger?.id,'DC-01');

assert.equal(nav.contextUrl('operations.html',{vehicle:'AM-101'}),'./operations.html?vehicle=AM-101');
assert.equal(nav.contextUrl('sessions.html',{session:'CS-261842',empty:null}),'./sessions.html?session=CS-261842');

const sources={
  operations:fs.readFileSync(new URL('../js/pages/operations.js',import.meta.url),'utf8'),
  vehicles:fs.readFileSync(new URL('../js/pages/vehicles.js',import.meta.url),'utf8'),
  drivers:fs.readFileSync(new URL('../js/pages/drivers.js',import.meta.url),'utf8'),
  schedules:fs.readFileSync(new URL('../js/pages/schedules.js',import.meta.url),'utf8'),
  reservations:fs.readFileSync(new URL('../js/pages/reservations.js',import.meta.url),'utf8'),
  sessions:fs.readFileSync(new URL('../js/pages/sessions.js',import.meta.url),'utf8'),
  depot:fs.readFileSync(new URL('../js/pages/depot.js',import.meta.url),'utf8'),
  home:fs.readFileSync(new URL('../js/pages/home-charging.js',import.meta.url),'utf8')
};
assert.match(sources.operations,/requestedVehicle/,'Operations must consume ?vehicle context');
assert.match(sources.vehicles,/Related records/,'Vehicle drawer must expose related records');
assert.match(sources.drivers,/home-charging\.html/,'Driver drawer must link to home charging');
assert.match(sources.schedules,/requestedSchedule/,'Schedules must consume ?schedule context');
assert.match(sources.reservations,/reservationContext/,'Reservation drawer must resolve related entities');
assert.match(sources.sessions,/sessionContext/,'Session drawer must resolve related entities');
assert.match(sources.depot,/chargerContext/,'Charger drawer must resolve related entities');
assert.match(sources.home,/requestedDriver/,'Home Charging must consume ?driver context');

console.log('OK: Fleet contextual navigation smoke test passed.');
console.log('Vehicle ↔ Driver ↔ Schedule ↔ Reservation ↔ Session ↔ Charger deep links are resolvable.');
