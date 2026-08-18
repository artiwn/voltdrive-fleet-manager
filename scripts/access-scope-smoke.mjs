import assert from 'node:assert/strict';

class MemoryStorage {
  constructor(){this.map=new Map();}
  getItem(k){return this.map.has(k)?this.map.get(k):null;}
  setItem(k,v){this.map.set(k,String(v));}
  removeItem(k){this.map.delete(k);}
  clear(){this.map.clear();}
}
globalThis.localStorage=new MemoryStorage();
const api=await import('../js/core/fleet-state.js?access='+Date.now());
const KEY='voltdrive_fleet_manager_v1';

function as(id){api.setCurrentAccessUserId(id);return api.loadState();}

function adminPermissionMigration(){
  localStorage.clear();
  let state=as('USR-01');
  let ctx=api.getAccessContext(state);
  assert.equal(ctx.allDepots,true);
  for(const permission of ['users.view','users.manage','roles.view','roles.manage','audit.view','audit.export'])assert.equal(ctx.can(permission),true,`admin missing ${permission}`);
  api.saveState(state);
  const raw=JSON.parse(localStorage.getItem(KEY));
  const admin=raw.roles.find(r=>r.id==='ROLE-ADMIN');
  admin.permissions=admin.permissions.filter(p=>!['users.view','roles.view','roles.manage','audit.export'].includes(p));
  localStorage.setItem(KEY,JSON.stringify(raw));
  state=as('USR-01');ctx=api.getAccessContext(state);
  for(const permission of ['users.view','roles.view','roles.manage','audit.export'])assert.equal(ctx.can(permission),true,`legacy admin role must migrate ${permission}`);
}


function allDepotNonAdminCannotEscalate(){
  localStorage.clear();
  let full=as('USR-01');api.saveState(full);
  const before=JSON.parse(localStorage.getItem(KEY));
  let finance=as('USR-04');
  assert.equal(api.getAccessContext(finance).allDepots,true);
  finance.users.find(u=>u.id==='USR-01').status='suspended';
  finance.roles.find(r=>r.id==='ROLE-FINANCE').permissions.push('roles.manage');
  finance.settings.sessionTimeout=1;
  finance.company.name='Tampered Fleet';
  api.saveState(finance);
  const raw=JSON.parse(localStorage.getItem(KEY));
  assert.equal(raw.users.find(u=>u.id==='USR-01').status,before.users.find(u=>u.id==='USR-01').status,'all-depot finance must not mutate users');
  assert.ok(!raw.roles.find(r=>r.id==='ROLE-FINANCE').permissions.includes('roles.manage'),'all-depot finance must not mutate roles');
  assert.equal(raw.settings.sessionTimeout,before.settings.sessionTimeout,'all-depot finance must not mutate Fleet Settings');
  assert.equal(raw.company.name,before.company.name,'all-depot finance must not mutate company configuration');
}


function prototypeAccessDirectoryStaysGlobal(){
  localStorage.clear();
  let full=as('USR-01');api.saveState(full);
  const adminDirectory=api.getPrototypeAccessDirectory();
  assert.ok(adminDirectory.users.length>1,'prototype directory should expose multiple active preview users');
  assert.ok(adminDirectory.users.some(user=>user.id==='USR-01'),'prototype directory must include Fleet Administrator');

  const scoped=as('USR-02');
  assert.ok(scoped.users.length<adminDirectory.users.length,'scoped runtime directory should remain narrowed');
  const scopedDirectory=api.getPrototypeAccessDirectory();
  assert.equal(scopedDirectory.users.length,adminDirectory.users.length,'prototype switcher directory must not shrink after identity switch');
  assert.ok(scopedDirectory.users.some(user=>user.id==='USR-01'),'scoped preview user must be able to switch back to Fleet Administrator');
  assert.ok(scopedDirectory.users.some(user=>user.id==='USR-04'),'scoped preview user must be able to switch to Finance preview user');
}

function canonicalDepotScope(){
  localStorage.clear();
  const state=as('USR-02');
  const ctx=api.getAccessContext(state);
  assert.deepEqual(ctx.scopeDepotIds,['DEPOT-YER-CENTRAL']);
  for(const kind of ['vehicles','chargers','parkingBays','drivers','routes','schedules','sessions','reservations','alerts','reimbursements']){
    assert.ok((state[kind]||[]).every(item=>item.depotId==='DEPOT-YER-CENTRAL'),`${kind} leaked outside central depot`);
  }
  assert.ok(state.auditLog.every(item=>item.depotId==='DEPOT-YER-CENTRAL'),'audit leaked global/cross-depot records');
  assert.ok(state.depots.every(item=>item.id==='DEPOT-YER-CENTRAL'),'depot master leaked outside scope');
  assert.ok(state.departments.every(item=>item.depotId==='DEPOT-YER-CENTRAL'),'department master leaked outside scope');
  assert.ok(state.users.every(user=>user.scopeDepotIds?.every(id=>id==='DEPOT-YER-CENTRAL')),'broader users leaked into scoped directory');
  assert.ok((state.billing.costCenters||[]).every(item=>item.depotId==='DEPOT-YER-CENTRAL'),'billing cost centers leaked outside scope');
  assert.ok((state.billing.transactions||[]).every(item=>item.depotId==='DEPOT-YER-CENTRAL'),'billing transactions leaked outside scope');
  assert.equal(state.invoices.length,0,'company invoices must not be exposed in narrowed depot state');
}

function textCannotEscalateCanonicalScope(){
  localStorage.clear();
  const base=as('USR-01');
  api.saveState(base);
  const raw=JSON.parse(localStorage.getItem(KEY));
  const user=raw.users.find(x=>x.id==='USR-02');
  user.scope='All depots';
  user.scopeDepotIds=['DEPOT-YER-CENTRAL'];
  localStorage.setItem(KEY,JSON.stringify(raw));
  const state=as('USR-02');
  const ctx=api.getAccessContext(state);
  assert.deepEqual(ctx.scopeDepotIds,['DEPOT-YER-CENTRAL'],'display text must not widen canonical ID scope');
  assert.equal(ctx.allDepots,false);
}

function invalidIdFailsClosed(){
  localStorage.clear();
  const base=as('USR-01');api.saveState(base);
  const raw=JSON.parse(localStorage.getItem(KEY));
  const user=raw.users.find(x=>x.id==='USR-02');
  user.scope='All depots';user.scopeDepotIds=['DEPOT-NOT-REAL'];
  localStorage.setItem(KEY,JSON.stringify(raw));
  const state=as('USR-02');
  const ctx=api.getAccessContext(state);
  assert.deepEqual(ctx.scopeDepotIds,[]);
  assert.equal(ctx.allDepots,false);
  assert.equal(state.vehicles.length,0,'invalid scope must not fall back to default depot data');
}

function crossDepotEntityMutationRejected(){
  localStorage.clear();
  const scoped=as('USR-02');
  const vehicle=scoped.vehicles.find(v=>v.id==='AM-101');
  assert.equal(vehicle.depotId,'DEPOT-YER-CENTRAL');
  vehicle.target=13;
  vehicle.depotId='DEPOT-WEST';
  api.saveState(scoped);
  const raw=JSON.parse(localStorage.getItem(KEY));
  const saved=raw.vehicles.find(v=>v.id==='AM-101');
  assert.equal(saved.depotId,'DEPOT-YER-CENTRAL','cross-depot move must be rejected');
  assert.ok(raw.vehicles.some(v=>v.depotId==='DEPOT-WEST'),'outside-scope records must be preserved');
}


function scopedBillingMutation(){
  localStorage.clear();
  const initial=as('USR-01');api.saveState(initial);
  const companyBalance=JSON.parse(localStorage.getItem(KEY)).billing.balance;
  const scoped=as('USR-02');
  scoped.billing.balance=1;
  scoped.billing.transactions.push({id:'TX-INJECT-WEST',date:'Now',type:'Injected',reference:'X',vehicle:'—',depotId:'DEPOT-WEST',costCenter:'West',amount:999,status:'posted'});
  api.saveState(scoped);
  const raw=JSON.parse(localStorage.getItem(KEY));
  assert.equal(raw.billing.balance,companyBalance,'scoped save must not rewrite company-wide billing profile');
  assert.ok(!raw.billing.transactions.some(tx=>tx.id==='TX-INJECT-WEST'),'scoped save must reject cross-depot billing transaction');
  assert.ok(raw.billing.transactions.some(tx=>tx.depotId==='DEPOT-AIRPORT'),'outside-depot billing transactions must be preserved');
}


function depotEnergyPolicyIsolation(){
  localStorage.clear();
  let full=as('USR-01');api.saveState(full);
  const before=JSON.parse(localStorage.getItem(KEY));
  const westBefore=before.depotPolicies.find(p=>p.depotId==='DEPOT-WEST').smartPriority;
  const globalBefore=before.settings.smartPriority;
  let scoped=as('USR-02');
  scoped.settings.smartPriority=false;
  scoped.settings.peakProtection=false;
  scoped.settings.peakLimitKw=500;
  scoped.energy.peakLimitKw=500;
  api.saveState(scoped);
  const raw=JSON.parse(localStorage.getItem(KEY));
  assert.equal(raw.settings.smartPriority,globalBefore,'scoped energy edit must not rewrite global Fleet Settings');
  assert.equal(raw.depotPolicies.find(p=>p.depotId==='DEPOT-YER-CENTRAL').smartPriority,false,'central depot policy must persist');
  assert.equal(raw.depotPolicies.find(p=>p.depotId==='DEPOT-YER-CENTRAL').peakLimitKw,500,'central peak limit must persist');
  assert.equal(raw.depotPolicies.find(p=>p.depotId==='DEPOT-WEST').smartPriority,westBefore,'other depot policy must stay unchanged');
  scoped=as('USR-02');
  assert.equal(scoped.settings.smartPriority,false,'scoped reload must overlay depot policy');
  assert.equal(scoped.energy.peakLimitKw,500,'scoped energy view must use depot policy');
}

function scopedUserAdministration(){
  localStorage.clear();
  let state=as('USR-01');
  state.roles.push({id:'ROLE-LOCAL-ADMIN',name:'Depot User Admin',description:'Scoped user administration test',system:false,permissions:['dashboard.view','users.view','users.manage','roles.view','audit.view']});
  state.roles.push({id:'ROLE-LOCAL-VIEW',name:'Depot Basic',description:'Delegatable local role',system:false,permissions:['dashboard.view']});
  state.users.push({id:'USR-20',name:'Central User Admin',email:'central-admin@example.com',role:'ROLE-LOCAL-ADMIN',scope:'Yerevan Central Depot',scopeDepotIds:['DEPOT-YER-CENTRAL'],status:'active',twoFactor:true,lastActive:'Now',avatar:'CU'});
  api.saveState(state);

  state=as('USR-20');
  let ctx=api.getAccessContext(state);
  assert.equal(ctx.can('users.manage'),true);assert.equal(ctx.can('roles.manage'),false);assert.equal(ctx.allDepots,false);
  assert.ok(!state.users.some(u=>u.id==='USR-01'),'scoped user admin must not receive all-depot administrator record');
  assert.equal(api.canAssignDepotScope(state,['*'],ctx),false);
  assert.equal(api.canDelegateRole(state,'ROLE-ADMIN',ctx),false);
  assert.equal(api.canDelegateRole(state,'ROLE-LOCAL-VIEW',ctx),true);

  // DOM/JS-style tamper: inject an all-depot Platform-equivalent user and alter roles. saveState must reject both.
  state.users.push({id:'USR-99',name:'Injected Admin',email:'inject@example.com',role:'ROLE-ADMIN',scope:'All depots',scopeDepotIds:['*'],status:'active',twoFactor:true,lastActive:'Now',avatar:'IA'});
  state.roles.find(r=>r.id==='ROLE-LOCAL-ADMIN').permissions.push('roles.manage');
  api.saveState(state);

  const raw=JSON.parse(localStorage.getItem(KEY));
  assert.ok(!raw.users.some(u=>u.id==='USR-99'),'scoped user admin must not create all-depot user');
  assert.ok(!raw.roles.find(r=>r.id==='ROLE-LOCAL-ADMIN').permissions.includes('roles.manage'),'roles must be immutable without roles.manage + all-depot scope');
}

adminPermissionMigration();
allDepotNonAdminCannotEscalate();
prototypeAccessDirectoryStaysGlobal();
canonicalDepotScope();
textCannotEscalateCanonicalScope();
invalidIdFailsClosed();
crossDepotEntityMutationRejected();
scopedBillingMutation();
depotEnergyPolicyIsolation();
scopedUserAdministration();
api.setCurrentAccessUserId('USR-01');
console.log('OK: Fleet access & depot scope smoke test passed.');
console.log('Canonical depot IDs · fail-closed invalid scope · persistent prototype identity directory · cross-depot tamper rejection · user/role delegation controls');
