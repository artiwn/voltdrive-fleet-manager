const KEY='voltdrive_fleet_manager_v1';
const seed={
  company:{name:'Ararat Mobility',depot:'Yerevan Central Depot',manager:'Narek Petrosyan',email:'fleet@araratmobility.am'},
  energy:{capacityKw:600,currentKw:428,priceAmd:78,solarKw:64,siteBatteryPct:72},
  vehicles:[
    {id:'AM-101',name:'Mercedes eSprinter 01',plate:'36 AA 101',battery:42,target:90,departure:'08:00',requiredKwh:31,status:'charging',charger:'DC-01',power:118,priority:'critical',route:'North Route'},
    {id:'AM-102',name:'Mercedes eSprinter 02',plate:'36 AA 102',battery:88,target:90,departure:'08:20',requiredKwh:2,status:'ready',charger:'—',power:0,priority:'high',route:'Center Route'},
    {id:'AM-103',name:'Ford E-Transit 03',plate:'36 AA 103',battery:57,target:85,departure:'09:15',requiredKwh:22,status:'charging',charger:'DC-03',power:92,priority:'high',route:'Airport Route'},
    {id:'AM-104',name:'Ford E-Transit 04',plate:'36 AA 104',battery:28,target:90,departure:'09:30',requiredKwh:48,status:'risk',charger:'DC-04',power:78,priority:'critical',route:'West Route'},
    {id:'AM-105',name:'VW ID. Buzz 05',plate:'36 AA 105',battery:76,target:80,departure:'10:30',requiredKwh:4,status:'queued',charger:'—',power:0,priority:'normal',route:'Hotel Shuttle'},
    {id:'AM-106',name:'VW ID. Buzz 06',plate:'36 AA 106',battery:94,target:90,departure:'11:00',requiredKwh:0,status:'ready',charger:'—',power:0,priority:'normal',route:'Hotel Shuttle'},
    {id:'AM-107',name:'Hyundai IONIQ 5 07',plate:'36 AA 107',battery:64,target:80,departure:'12:00',requiredKwh:12,status:'charging',charger:'AC-07',power:22,priority:'normal',route:'Executive'},
    {id:'AM-108',name:'Tesla Model Y 08',plate:'36 AA 108',battery:33,target:80,departure:'13:30',requiredKwh:35,status:'queued',charger:'—',power:0,priority:'low',route:'Executive'}
  ],
  chargers:[
    {id:'DC-01',type:'DC',power:150,status:'busy',vehicle:'AM-101',bay:'B01',health:98},{id:'DC-02',type:'DC',power:150,status:'available',vehicle:null,bay:'B02',health:99},
    {id:'DC-03',type:'DC',power:120,status:'busy',vehicle:'AM-103',bay:'B03',health:96},{id:'DC-04',type:'DC',power:120,status:'busy',vehicle:'AM-104',bay:'B04',health:83},
    {id:'AC-05',type:'AC',power:22,status:'available',vehicle:null,bay:'B05',health:100},{id:'AC-06',type:'AC',power:22,status:'faulty',vehicle:null,bay:'B06',health:41},
    {id:'AC-07',type:'AC',power:22,status:'busy',vehicle:'AM-107',bay:'B07',health:97},{id:'AC-08',type:'AC',power:22,status:'reserved',vehicle:'AM-105',bay:'B08',health:100}
  ],
  alerts:[
    {id:'AL-1001',severity:'critical',title:'Vehicle may miss departure',body:'AM-104 is projected to reach only 72% by 09:30.',time:'6 min ago',status:'open'},
    {id:'AL-1002',severity:'warning',title:'Charger AC-06 fault',body:'Connector communication error. Technician review recommended.',time:'18 min ago',status:'open'},
    {id:'AL-1003',severity:'warning',title:'Depot load above 70%',body:'Current load is 428 kW of 600 kW available capacity.',time:'24 min ago',status:'open'},
    {id:'AL-1004',severity:'info',title:'Vehicle AM-105 queued',body:'Vehicle is waiting for charger assignment before 10:30 departure.',time:'41 min ago',status:'open'}
  ],
  drivers:[
    {id:'DR-01',name:'Arman Hakobyan',department:'Delivery',vehicle:'AM-101',phone:'+374 91 220 101',shift:'07:00–15:00',status:'active',access:'Driver + RFID'},
    {id:'DR-02',name:'Mariam Sargsyan',department:'Delivery',vehicle:'AM-102',phone:'+374 91 220 102',shift:'07:00–15:00',status:'active',access:'Driver app'},
    {id:'DR-03',name:'Gor Vardanyan',department:'Airport',vehicle:'AM-103',phone:'+374 91 220 103',shift:'08:00–16:00',status:'active',access:'Driver + RFID'},
    {id:'DR-04',name:'Levon Grigoryan',department:'West Hub',vehicle:'AM-104',phone:'+374 91 220 104',shift:'08:30–17:00',status:'attention',access:'Driver app'},
    {id:'DR-05',name:'Anna Melikyan',department:'Shuttle',vehicle:'AM-105',phone:'+374 91 220 105',shift:'09:30–18:00',status:'active',access:'Driver + RFID'},
    {id:'DR-06',name:'David Avetisyan',department:'Executive',vehicle:'AM-107',phone:'+374 91 220 107',shift:'11:00–19:00',status:'active',access:'Driver app'}
  ],
  schedules:[
    {id:'SCH-01',vehicle:'AM-101',route:'North Route',departure:'08:00',return:'11:30',target:90,status:'confirmed'},
    {id:'SCH-02',vehicle:'AM-102',route:'Center Route',departure:'08:20',return:'12:10',target:90,status:'confirmed'},
    {id:'SCH-03',vehicle:'AM-103',route:'Airport Route',departure:'09:15',return:'13:00',target:85,status:'confirmed'},
    {id:'SCH-04',vehicle:'AM-104',route:'West Route',departure:'09:30',return:'14:10',target:90,status:'risk'},
    {id:'SCH-05',vehicle:'AM-105',route:'Hotel Shuttle',departure:'10:30',return:'15:30',target:80,status:'planned'},
    {id:'SCH-06',vehicle:'AM-107',route:'Executive',departure:'12:00',return:'17:45',target:80,status:'planned'}
  ],
  reimbursements:[
    {id:'HR-24081',driver:'DR-02',vehicle:'AM-102',date:'2026-08-11',energy:18.6,rate:72,amount:1339,status:'approved',paymentStatus:'paid',batchId:'RB-0811',submittedAt:'Aug 11 · 18:12',reviewedAt:'Aug 12 · 09:15',reviewer:'Mane Grigoryan',homeCharger:'Wallbox Pulsar Plus',meterId:'HM-102-07',meterStart:1842.6,meterEnd:1861.2,tariffSource:'VoltDrive fleet home tariff',location:'Yerevan · Home charging',evidence:['Meter reading','Home charger session'],note:'Approved under standard home charging policy.'},
    {id:'HR-24082',driver:'DR-05',vehicle:'AM-105',date:'2026-08-12',energy:22.4,rate:72,amount:1613,status:'pending',paymentStatus:'unpaid',batchId:null,submittedAt:'Aug 12 · 20:34',reviewedAt:null,reviewer:null,homeCharger:'Tesla Wall Connector',meterId:'HM-105-03',meterStart:943.1,meterEnd:965.5,tariffSource:'VoltDrive fleet home tariff',location:'Yerevan · Home charging',evidence:['Meter reading','Utility receipt'],note:'Driver submitted utility evidence.'},
    {id:'HR-24083',driver:'DR-06',vehicle:'AM-107',date:'2026-08-12',energy:14.8,rate:72,amount:1066,status:'pending',paymentStatus:'unpaid',batchId:null,submittedAt:'Aug 12 · 22:08',reviewedAt:null,reviewer:null,homeCharger:'ABB Terra AC',meterId:'HM-107-02',meterStart:518.4,meterEnd:533.2,tariffSource:'VoltDrive fleet home tariff',location:'Yerevan · Home charging',evidence:['Home charger session'],note:'Automatic charger session import.'},
    {id:'HR-24084',driver:'DR-01',vehicle:'AM-101',date:'2026-08-13',energy:27.3,rate:72,amount:1966,status:'review',paymentStatus:'unpaid',batchId:null,submittedAt:'Aug 13 · 08:42',reviewedAt:null,reviewer:null,homeCharger:'Wallbox Commander 2',meterId:'HM-101-01',meterStart:2261.8,meterEnd:2289.1,tariffSource:'VoltDrive fleet home tariff',location:'Yerevan · Home charging',evidence:['Meter reading','Home charger session','Utility receipt'],note:'Energy amount matches charger telemetry; manager review requested.'}
  ],

  sessions:[
    {id:'CS-261842',vehicle:'AM-101',driver:'DR-01',charger:'DC-01',connector:'CCS2',start:'12:08',duration:'00:46',energy:42.8,power:118,cost:5480,status:'active',socStart:18,socNow:42,target:90},
    {id:'CS-261841',vehicle:'AM-103',driver:'DR-03',charger:'DC-03',connector:'CCS2',start:'12:21',duration:'00:33',energy:31.2,power:92,cost:3994,status:'active',socStart:29,socNow:57,target:85},
    {id:'CS-261840',vehicle:'AM-104',driver:'DR-04',charger:'DC-04',connector:'CCS2',start:'12:34',duration:'00:20',energy:18.6,power:78,cost:2381,status:'active',socStart:12,socNow:28,target:90},
    {id:'CS-261839',vehicle:'AM-107',driver:'DR-06',charger:'AC-07',connector:'Type 2',start:'11:18',duration:'01:36',energy:24.4,power:22,cost:3123,status:'active',socStart:41,socNow:64,target:80},
    {id:'CS-261832',vehicle:'AM-102',driver:'DR-02',charger:'DC-02',connector:'CCS2',start:'08:01',duration:'00:41',energy:38.6,power:0,cost:4941,status:'completed',socStart:44,socNow:88,target:90},
    {id:'CS-261821',vehicle:'AM-106',driver:'DR-05',charger:'DC-03',connector:'CCS2',start:'07:14',duration:'00:36',energy:33.1,power:0,cost:4237,status:'completed',socStart:55,socNow:94,target:90},
    {id:'CS-261811',vehicle:'AM-108',driver:'DR-06',charger:'AC-06',connector:'Type 2',start:'06:43',duration:'00:07',energy:1.8,power:0,cost:230,status:'failed',socStart:31,socNow:33,target:80}
  ],
  reservations:[
    {id:'RS-84021',vehicle:'AM-105',location:'Yerevan Central Depot',charger:'AC-08',bay:'B08',arrival:'13:10',duration:'01:20',target:80,status:'confirmed'},
    {id:'RS-84022',vehicle:'AM-108',location:'Yerevan Central Depot',charger:'Auto assign',bay:'Any',arrival:'13:25',duration:'01:10',target:80,status:'confirmed'},
    {id:'RS-84017',vehicle:'AM-101',location:'Yerevan Central Depot',charger:'DC-01',bay:'B01',arrival:'12:00',duration:'01:15',target:90,status:'active'},
    {id:'RS-84018',vehicle:'AM-103',location:'Yerevan Central Depot',charger:'DC-03',bay:'B03',arrival:'12:15',duration:'01:00',target:85,status:'active'},
    {id:'RS-84004',vehicle:'AM-102',location:'Yerevan Central Depot',charger:'DC-02',bay:'B02',arrival:'08:00',duration:'00:55',target:90,status:'completed'}
  ],
  billing:{
    balance:428500,currentPeriod:'Aug 1 – Aug 31, 2026',energyKwh:2845,energyCost:341400,idleFees:8250,reservationFees:6000,homeReimbursement:67000,discounts:27500,total:395150,paymentMethod:'Visa •••• 4821',autoPay:true,nextPayment:'Sep 1, 2026',
    currency:'AMD',creditLimit:1000000,paymentTerms:'Net 15',billingEmail:'billing@araratmobility.am',legalName:'Ararat Mobility LLC',taxId:'02678451',billingAddress:'Yerevan, Armenia',
    paymentMethods:[
      {id:'PM-01',type:'Visa',label:'Visa •••• 4821',expiry:'09/28',default:true,status:'active'},
      {id:'PM-02',type:'Mastercard',label:'Mastercard •••• 1944',expiry:'04/29',default:false,status:'active'}
    ],
    costCenters:[
      {id:'CC-DEL',name:'Delivery Operations',department:'Delivery',monthCost:151620,vehicles:18},
      {id:'CC-AIR',name:'Airport Services',department:'Airport',monthCost:83640,vehicles:10},
      {id:'CC-SHU',name:'Shuttle Services',department:'Shuttle',monthCost:72890,vehicles:9},
      {id:'CC-EXE',name:'Executive Fleet',department:'Executive',monthCost:87000,vehicles:11}
    ],
    transactions:[
      {id:'TX-86101',date:'Aug 13, 2026 · 12:54',type:'Charging session',reference:'CS-261842',vehicle:'AM-101',costCenter:'Delivery Operations',amount:5480,status:'pending'},
      {id:'TX-86100',date:'Aug 13, 2026 · 12:54',type:'Charging session',reference:'CS-261841',vehicle:'AM-103',costCenter:'Airport Services',amount:3994,status:'pending'},
      {id:'TX-86092',date:'Aug 13, 2026 · 11:42',type:'Home reimbursement',reference:'HR-24084',vehicle:'AM-101',costCenter:'Delivery Operations',amount:1966,status:'pending'},
      {id:'TX-86081',date:'Aug 12, 2026 · 18:10',type:'Charging session',reference:'CS-261832',vehicle:'AM-102',costCenter:'Delivery Operations',amount:4941,status:'posted'},
      {id:'TX-86073',date:'Aug 12, 2026 · 17:20',type:'Fleet discount',reference:'DISC-AUG',vehicle:'—',costCenter:'Shared Fleet',amount:-6250,status:'posted'},
      {id:'TX-86061',date:'Aug 12, 2026 · 10:05',type:'Idle fee',reference:'CS-261799',vehicle:'AM-105',costCenter:'Shuttle Services',amount:900,status:'posted'}
    ]
  },
  invoices:[
    {id:'INV-0826',period:'Aug 2026',amount:395150,status:'open',issued:'Aug 31, 2026',due:'Sep 1, 2026',energy:341400,fees:14250,reimbursements:67000,discounts:27500,tax:0},
    {id:'INV-0726',period:'Jul 2026',amount:372900,status:'paid',issued:'Jul 31, 2026',due:'Aug 1, 2026',paid:'Aug 1, 2026',energy:326400,fees:12100,reimbursements:58700,discounts:24300,tax:0},
    {id:'INV-0626',period:'Jun 2026',amount:348120,status:'paid',issued:'Jun 30, 2026',due:'Jul 1, 2026',paid:'Jul 1, 2026',energy:303020,fees:10800,reimbursements:55200,discounts:20900,tax:0}
  ],
  fleetPlan:{
    id:'business',name:'VoltDrive Fleet Business',vehiclesIncluded:75,activeVehicles:48,usersIncluded:12,activeUsers:7,depotsIncluded:3,activeDepots:1,monthlyFee:145000,billingCycle:'Monthly',renewal:'Sep 1, 2026',status:'active',autoRenew:true,overageVehicleFee:2500,support:'Priority fleet support',contractRef:'VD-FLT-2026-041',nextReview:'Dec 1, 2026',
    features:['Smart depot optimization','Advanced reporting','Home charging reimbursement','Priority support','Multi-user fleet access'],
    history:[
      {date:'May 1, 2026',title:'Business plan activated',detail:'75 vehicle capacity · monthly billing'},
      {date:'Jul 10, 2026',title:'Capacity increased',detail:'50 → 75 included vehicles'},
      {date:'Aug 1, 2026',title:'Plan renewed',detail:'Next renewal Sep 1, 2026'}
    ]
  },
  users:[
    {id:'USR-01',name:'Narek Petrosyan',email:'narek@araratmobility.am',role:'ROLE-ADMIN',scope:'All depots',status:'active',twoFactor:true,lastActive:'Just now',avatar:'NP'},
    {id:'USR-02',name:'Ani Hovsepyan',email:'ani@araratmobility.am',role:'ROLE-MANAGER',scope:'Yerevan Central Depot',status:'active',twoFactor:true,lastActive:'8 min ago',avatar:'AH'},
    {id:'USR-03',name:'Tigran Manukyan',email:'tigran@araratmobility.am',role:'ROLE-DISPATCH',scope:'Yerevan Central Depot',status:'active',twoFactor:true,lastActive:'21 min ago',avatar:'TM'},
    {id:'USR-04',name:'Mane Grigoryan',email:'mane@araratmobility.am',role:'ROLE-FINANCE',scope:'All depots',status:'active',twoFactor:true,lastActive:'Today · 10:42',avatar:'MG'},
    {id:'USR-05',name:'Hayk Sargsyan',email:'hayk@araratmobility.am',role:'ROLE-ANALYST',scope:'All depots',status:'active',twoFactor:false,lastActive:'Yesterday · 17:26',avatar:'HS'},
    {id:'USR-06',name:'Lilit Avetisyan',email:'lilit@araratmobility.am',role:'ROLE-VIEWER',scope:'Yerevan Central Depot',status:'active',twoFactor:false,lastActive:'Aug 12 · 14:05',avatar:'LA'},
    {id:'USR-07',name:'Suren Petrosyan',email:'suren@araratmobility.am',role:'ROLE-DISPATCH',scope:'West Hub',status:'invited',twoFactor:false,lastActive:'Invitation pending',avatar:'SP'}
  ],
  roles:[
    {id:'ROLE-ADMIN',name:'Fleet Administrator',description:'Full fleet, finance and administration access.',system:true,permissions:['dashboard.view','operations.manage','vehicles.manage','drivers.manage','schedules.manage','chargers.manage','sessions.stop','reservations.manage','energy.manage','billing.manage','reports.view','alerts.manage','home.manage','users.manage','settings.manage','audit.view']},
    {id:'ROLE-MANAGER',name:'Fleet Manager',description:'Operational fleet management without account administration.',system:true,permissions:['dashboard.view','operations.manage','vehicles.manage','drivers.manage','schedules.manage','chargers.manage','sessions.stop','reservations.manage','energy.manage','billing.view','reports.view','alerts.manage','home.manage','audit.view']},
    {id:'ROLE-DISPATCH',name:'Dispatcher',description:'Day-to-day readiness, schedules and charging operations.',system:true,permissions:['dashboard.view','operations.manage','vehicles.view','drivers.view','schedules.manage','chargers.view','sessions.view','reservations.manage','energy.view','reports.view','alerts.manage']},
    {id:'ROLE-FINANCE',name:'Finance Manager',description:'Billing, reimbursements and financial reporting.',system:true,permissions:['dashboard.view','vehicles.view','sessions.view','billing.manage','reports.view','alerts.view','home.manage','audit.view']},
    {id:'ROLE-ANALYST',name:'Analyst',description:'Read-only analytics across fleet operations.',system:true,permissions:['dashboard.view','vehicles.view','drivers.view','schedules.view','chargers.view','sessions.view','reservations.view','energy.view','billing.view','reports.view','alerts.view']},
    {id:'ROLE-VIEWER',name:'Read-only',description:'Basic monitoring without operational actions.',system:true,permissions:['dashboard.view','vehicles.view','drivers.view','chargers.view','sessions.view','reservations.view','energy.view','reports.view','alerts.view']}
  ],
  auditLog:[
    {id:'AUD-1201',time:'Aug 13 · 15:42',user:'Narek Petrosyan',action:'Updated charging policy',resource:'Fleet Settings',result:'success'},
    {id:'AUD-1202',time:'Aug 13 · 14:18',user:'Ani Hovsepyan',action:'Changed vehicle priority',resource:'AM-104',result:'success'},
    {id:'AUD-1203',time:'Aug 13 · 13:57',user:'Tigran Manukyan',action:'Reassigned charger',resource:'AM-105 → AC-08',result:'success'},
    {id:'AUD-1204',time:'Aug 13 · 12:36',user:'Mane Grigoryan',action:'Downloaded invoice',resource:'INV-0726',result:'success'},
    {id:'AUD-1205',time:'Aug 13 · 11:22',user:'Narek Petrosyan',action:'Changed user role',resource:'Hayk Sargsyan',result:'success'},
    {id:'AUD-1206',time:'Aug 12 · 18:06',user:'System',action:'Blocked sign-in attempt',resource:'Unknown device',result:'blocked'}
  ],
  settings:{
    smartPriority:true,peakProtection:true,departureBuffer:20,alertThreshold:80,defaultTarget:85,homeRate:72,autoApproveHome:false,notifyDrivers:true,
    timezone:'Asia/Yerevan',currency:'AMD',distanceUnit:'km',defaultDepot:'Yerevan Central Depot',language:'English',
    peakLimitKw:520,safetyReserveKw:40,solarPreference:true,batteryAssist:true,energyMode:'automatic',
    notifyManagers:true,emailCritical:true,smsCritical:false,quietHours:'22:00–06:00',dailyDigest:true,
    billingDigest:'monthly',costCenterRequired:true,requirePo:false,
    apiAccess:true,erpProvider:'1C ERP',webhooks:false,roaming:false,
    requireTwoFactor:true,sessionTimeout:60,auditRetention:365,restrictAdminIp:false
  }
};
function mergeById(base=[],saved=[]){
  const map=new Map((saved||[]).map(item=>[item.id,item]));
  const merged=(base||[]).map(item=>({...item,...(map.get(item.id)||{})}));
  const baseIds=new Set((base||[]).map(item=>item.id));
  return merged.concat((saved||[]).filter(item=>!baseIds.has(item.id)));
}

export const ACCESS_USER_KEY='voltdrive_fleet_access_user_v1';
const SCOPED_COLLECTIONS=['vehicles','chargers','drivers','schedules','sessions','reservations','alerts','reimbursements'];

function mergeRoles(base=[],saved=[]){
  const roles=mergeById(base,saved);
  // Migrate newly introduced permission categories without undoing custom edits
  // to categories that already existed in an older saved prototype state.
  roles.forEach(role=>{
    const fresh=(base||[]).find(item=>item.id===role.id);
    if(!fresh)return;
    const hasAlertCategory=(role.permissions||[]).some(permission=>permission.startsWith('alerts.'));
    if(!hasAlertCategory){
      (fresh.permissions||[]).filter(permission=>permission.startsWith('alerts.')).forEach(permission=>{
        if(!role.permissions.includes(permission)) role.permissions.push(permission);
      });
    }
  });
  return roles;
}

function buildFullState(){
  try{
    const raw=localStorage.getItem(KEY);
    const v=raw?JSON.parse(raw):null;
    if(!v)return structuredClone(seed);
    const fresh=structuredClone(seed);
    const billing={...fresh.billing,...(v.billing||{})};
    billing.paymentMethods=mergeById(fresh.billing.paymentMethods,v.billing?.paymentMethods);
    billing.costCenters=mergeById(fresh.billing.costCenters,v.billing?.costCenters);
    billing.transactions=mergeById(fresh.billing.transactions,v.billing?.transactions);
    const fleetPlan={...fresh.fleetPlan,...(v.fleetPlan||{})};
    fleetPlan.history=Array.isArray(v.fleetPlan?.history)?v.fleetPlan.history:fresh.fleetPlan.history;
    const auditLog=Array.isArray(v.auditLog)?v.auditLog:fresh.auditLog;
    return {...fresh,...v,company:{...fresh.company,...(v.company||{})},energy:{...fresh.energy,...(v.energy||{})},billing,fleetPlan,invoices:mergeById(fresh.invoices,v.invoices),users:mergeById(fresh.users,v.users),roles:mergeRoles(fresh.roles,v.roles),reimbursements:mergeById(fresh.reimbursements,v.reimbursements),auditLog,settings:{...fresh.settings,...(v.settings||{})}};
  }catch(error){
    console.error('[VoltDrive State] Failed to load saved prototype state',error);
    return structuredClone(seed);
  }
}

export function getCurrentAccessUserId(){
  return localStorage.getItem(ACCESS_USER_KEY)||'USR-01';
}
export function setCurrentAccessUserId(id){
  if(id)localStorage.setItem(ACCESS_USER_KEY,id); else localStorage.removeItem(ACCESS_USER_KEY);
}
export function getAccessContext(state){
  const users=state?.users||[];
  let user=users.find(item=>item.id===getCurrentAccessUserId()&&item.status==='active');
  if(!user)user=users.find(item=>item.id==='USR-01'&&item.status==='active')||users.find(item=>item.status==='active')||null;
  const role=(state?.roles||[]).find(item=>item.id===user?.role)||null;
  const permissions=new Set(role?.permissions||[]);
  const can=permission=>{
    if(!permission)return true;
    if(permissions.has(permission))return true;
    if(permission.endsWith('.view')&&permissions.has(permission.replace(/\.view$/,'.manage')))return true;
    if(permission==='sessions.view'&&permissions.has('sessions.stop'))return true;
    if(permission==='alerts.view'&&permissions.has('alerts.manage'))return true;
    return false;
  };
  return {user,role,permissions,scope:user?.scope||'All depots',can,canAny:(...items)=>items.flat().some(can)};
}

function inferVehicleDepot(vehicle){
  if(vehicle?.depot)return vehicle.depot;
  const text=`${vehicle?.group||''} ${vehicle?.route||''}`.toLowerCase();
  if(text.includes('west'))return 'West Hub';
  if(text.includes('airport'))return 'Airport Hub';
  return 'Yerevan Central Depot';
}
function inferEntityDepot(state,item,kind){
  if(!item)return 'Yerevan Central Depot';
  if(item.depot)return item.depot;
  const vehicleById=id=>(state.vehicles||[]).find(vehicle=>vehicle.id===id);
  const chargerById=id=>(state.chargers||[]).find(charger=>charger.id===id);
  if(kind==='vehicles')return inferVehicleDepot(item);
  if(kind==='drivers')return inferVehicleDepot(vehicleById(item.vehicle))||(/west/i.test(item.department||'')?'West Hub':/airport/i.test(item.department||'')?'Airport Hub':'Yerevan Central Depot');
  if(kind==='schedules')return inferVehicleDepot(vehicleById(item.vehicle));
  if(kind==='chargers'){
    if(item.vehicle)return inferVehicleDepot(vehicleById(item.vehicle));
    if(item.id==='DC-03')return 'Airport Hub';
    if(item.id==='DC-04'||item.id==='AC-06')return 'West Hub';
    return 'Yerevan Central Depot';
  }
  if(kind==='sessions')return inferEntityDepot(state,chargerById(item.charger),'chargers')||inferVehicleDepot(vehicleById(item.vehicle));
  if(kind==='reservations')return inferVehicleDepot(vehicleById(item.vehicle));
  if(kind==='reimbursements')return inferVehicleDepot(vehicleById(item.vehicle));
  if(kind==='alerts'){
    const text=`${item.title||''} ${item.body||''}`;
    const vehicleId=item.vehicleId||text.match(/AM-\d+/)?.[0];
    const chargerId=item.chargerId||text.match(/(?:DC|AC)-\d+/)?.[0];
    if(chargerId)return inferEntityDepot(state,chargerById(chargerId),'chargers');
    if(vehicleId)return inferVehicleDepot(vehicleById(vehicleId));
    return 'Yerevan Central Depot';
  }
  return 'Yerevan Central Depot';
}
function isInScope(state,item,kind,scope){
  return !scope||scope==='All depots'||inferEntityDepot(state,item,kind)===scope;
}
function applyAccessScope(full){
  const ctx=getAccessContext(full);
  if(!ctx.user||ctx.scope==='All depots')return full;
  const scoped={...full,company:{...full.company,depot:ctx.scope},energy:{...full.energy}};
  SCOPED_COLLECTIONS.forEach(kind=>{
    scoped[kind]=(full[kind]||[]).filter(item=>isInScope(full,item,kind,ctx.scope));
  });
  const activePower=(scoped.vehicles||[]).reduce((sum,vehicle)=>sum+Number(vehicle.power||0),0);
  const capacityMap={'Yerevan Central Depot':600,'West Hub':240,'Airport Hub':300};
  scoped.energy.capacityKw=capacityMap[ctx.scope]||full.energy.capacityKw;
  scoped.energy.currentKw=Math.min(scoped.energy.capacityKw,Math.round(activePower+(ctx.scope==='Yerevan Central Depot'?118:52)));
  if(ctx.scope==='West Hub'){scoped.energy.solarKw=24;scoped.energy.siteBatteryPct=61;}
  if(ctx.scope==='Airport Hub'){scoped.energy.solarKw=38;scoped.energy.siteBatteryPct=78;}
  return scoped;
}

export function loadState(){
  return applyAccessScope(buildFullState());
}
export function saveState(s){
  const full=buildFullState();
  const ctx=getAccessContext(full);
  if(!ctx.user||ctx.scope==='All depots'){
    localStorage.setItem(KEY,JSON.stringify(s));
    return;
  }
  const merged={...full,...s,company:{...full.company},energy:{...full.energy},billing:{...full.billing,...(s.billing||{})},fleetPlan:{...full.fleetPlan,...(s.fleetPlan||{})},settings:{...full.settings,...(s.settings||{})}};
  // Preserve data outside the signed-in user's fleet scope while applying all
  // edits, additions and deletions performed inside that scope.
  SCOPED_COLLECTIONS.forEach(kind=>{
    const outside=(full[kind]||[]).filter(item=>!isInScope(full,item,kind,ctx.scope));
    merged[kind]=outside.concat(s[kind]||[]);
  });
  localStorage.setItem(KEY,JSON.stringify(merged));
}
export function resetState(){localStorage.removeItem(KEY);return loadState();}
export function statusLabel(s){return ({charging:'Charging',ready:'Ready',risk:'At risk',queued:'Queued',busy:'Busy',available:'Available',faulty:'Faulty',reserved:'Reserved'})[s]||s;}
