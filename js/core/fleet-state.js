import {reconcileReservationLifecycle} from './planning.js';
import {chargerSupportsVehicle,vehicleConnectorTypes,chargerConnectorOptions,bestCompatibleConnector} from './charging-compatibility.js';

const REPORT_HISTORY_DATES=['2026-05-20','2026-05-31','2026-06-15','2026-06-30','2026-07-10','2026-07-20','2026-07-31','2026-08-07','2026-08-08','2026-08-09','2026-08-10','2026-08-11','2026-08-12'];
const REPORT_SESSION_PROFILES=[
  {vehicle:'AM-101',driver:'DR-01',charger:'DC-01',depotId:'DEPOT-YER-CENTRAL',connector:'CCS2',connectorId:'1',energy:36.4,cost:4660,duration:'00:42',start:'07:18'},
  {vehicle:'AM-102',driver:'DR-02',charger:'DC-02',depotId:'DEPOT-YER-CENTRAL',connector:'CCS2',connectorId:'1',energy:31.7,cost:4058,duration:'00:36',start:'08:12'},
  {vehicle:'AM-103',driver:'DR-03',charger:'DC-03',depotId:'DEPOT-AIRPORT',connector:'CCS2',connectorId:'1',energy:28.9,cost:3699,duration:'00:34',start:'09:24'},
  {vehicle:'AM-104',driver:'DR-04',charger:'DC-04',depotId:'DEPOT-WEST',connector:'CCS2',connectorId:'1',energy:34.2,cost:4378,duration:'00:44',start:'10:16'},
  {vehicle:'AM-105',driver:'DR-05',charger:'AC-05',depotId:'DEPOT-YER-CENTRAL',connector:'Type 2',connectorId:'1',energy:17.6,cost:2253,duration:'01:08',start:'18:05'},
  {vehicle:'AM-107',driver:'DR-06',charger:'AC-07',depotId:'DEPOT-YER-CENTRAL',connector:'Type 2',connectorId:'1',energy:20.1,cost:2573,duration:'01:16',start:'19:12'}
];
function buildHistoricalSessions(){
  const out=[];
  REPORT_HISTORY_DATES.forEach((date,di)=>{
    REPORT_SESSION_PROFILES.forEach((profile,pi)=>{
      if((di+pi)%3===2)return;
      const energy=Math.max(2,Number((profile.energy*(.82+((di+pi)%5)*.055)).toFixed(1)));
      const failed=(di+pi)%17===0;
      out.push({...profile,id:`CS-H-${date.replaceAll('-','')}-${pi+1}`,date,energy,cost:failed?Math.round(profile.cost*.18):Math.round(energy*128),status:failed?'failed':'completed',power:0,socStart:24+((di+pi)*5)%31,socNow:failed?29:72+((di+pi)%18),target:pi<4?90:80});
    });
  });
  return out;
}
const RESERVATION_PROFILES=[
  {vehicle:'AM-101',depotId:'DEPOT-YER-CENTRAL',location:'Yerevan Central Depot',charger:'DC-01',parkingBayId:'BAY-CENTRAL-01',bay:'B01',arrival:'07:00',duration:'01:00',target:90,assignmentMode:'charger'},
  {vehicle:'AM-102',depotId:'DEPOT-YER-CENTRAL',location:'Yerevan Central Depot',charger:'DC-02',parkingBayId:'BAY-CENTRAL-02',bay:'B02',arrival:'08:00',duration:'00:50',target:90,assignmentMode:'charger'},
  {vehicle:'AM-103',depotId:'DEPOT-AIRPORT',location:'Airport Hub',charger:'DC-03',parkingBayId:'BAY-AIRPORT-03',bay:'B03',arrival:'09:00',duration:'01:00',target:85,assignmentMode:'charger'},
  {vehicle:'AM-104',depotId:'DEPOT-WEST',location:'West Hub',charger:'DC-04',parkingBayId:'BAY-WEST-04',bay:'B04',arrival:'09:20',duration:'01:10',target:90,assignmentMode:'charger'},
  {vehicle:'AM-105',depotId:'DEPOT-YER-CENTRAL',location:'Yerevan Central Depot',charger:'AC-05',parkingBayId:'BAY-CENTRAL-05',bay:'B05',arrival:'18:00',duration:'01:30',target:80,assignmentMode:'bay'}
];
function buildHistoricalReservations(){
  const statuses=['completed','completed','cancelled','no-show'];
  const out=[];
  REPORT_HISTORY_DATES.forEach((date,di)=>{
    [0,1,2].forEach(offset=>{
      const profile=RESERVATION_PROFILES[(di+offset)%RESERVATION_PROFILES.length];
      out.push({...profile,id:`RS-H-${date.replaceAll('-','')}-${offset+1}`,arrivalDate:date,status:statuses[(di+offset)%statuses.length],grace:15});
    });
  });
  return out;
}
function buildChargerUsageHistory(){
  const profiles=[['DC-01','DEPOT-YER-CENTRAL',38,150],['DC-02','DEPOT-YER-CENTRAL',31,150],['DC-03','DEPOT-AIRPORT',43,120],['DC-04','DEPOT-WEST',46,120],['AC-05','DEPOT-YER-CENTRAL',22,22],['AC-06','DEPOT-WEST',12,22],['AC-07','DEPOT-YER-CENTRAL',29,22],['AC-08','DEPOT-YER-CENTRAL',25,22]];
  return REPORT_HISTORY_DATES.flatMap((date,di)=>profiles.map(([chargerId,depotId,base,power],pi)=>{
    const offline=chargerId==='AC-06'&&di%4===1?180:((di+pi)%19===0?45:0);
    const util=Math.max(4,Math.min(82,base+(((di*7+pi*3)%15)-7)));
    const busy=Math.round((1440-offline)*util/100);const available=Math.max(0,1440-offline-busy);
    return {id:`CU-${date.replaceAll('-','')}-${chargerId}`,date,depotId,chargerId,busyMinutes:busy,availableMinutes:available,offlineMinutes:offline,sessions:Math.max(0,Math.round(busy/48)),energyKwh:Number((busy/60*Number(power)*(.28+(pi%3)*.07)).toFixed(1))};
  }));
}
function buildParkingUsageHistory(){
  const profiles=[['BAY-CENTRAL-01','DEPOT-YER-CENTRAL',44],['BAY-CENTRAL-02','DEPOT-YER-CENTRAL',34],['BAY-AIRPORT-03','DEPOT-AIRPORT',48],['BAY-WEST-04','DEPOT-WEST',52],['BAY-CENTRAL-05','DEPOT-YER-CENTRAL',27],['BAY-WEST-06','DEPOT-WEST',10],['BAY-CENTRAL-07','DEPOT-YER-CENTRAL',33],['BAY-CENTRAL-08','DEPOT-YER-CENTRAL',29],['BAY-CENTRAL-09','DEPOT-YER-CENTRAL',18],['BAY-AIRPORT-10','DEPOT-AIRPORT',16]];
  return REPORT_HISTORY_DATES.flatMap((date,di)=>profiles.map(([parkingBayId,depotId,base],pi)=>{
    const blocked=parkingBayId==='BAY-WEST-06'&&di%3===1?360:0;
    const occupied=Math.round((1440-blocked)*Math.max(3,Math.min(76,base+(((di+pi*2)%13)-6)))/100);
    const reserved=Math.min(180,Math.round(occupied*.18));
    const available=Math.max(0,1440-blocked-occupied-reserved);
    return {id:`PU-${date.replaceAll('-','')}-${parkingBayId}`,date,depotId,parkingBayId,occupiedMinutes:occupied,reservedMinutes:reserved,availableMinutes:available,blockedMinutes:blocked};
  }));
}
function buildEnergyHistory(){
  const profiles=[['DEPOT-YER-CENTRAL',610,78,92],['DEPOT-WEST',245,78,31],['DEPOT-AIRPORT',305,78,46]];
  return REPORT_HISTORY_DATES.flatMap((date,di)=>profiles.map(([depotId,base,price,solarBase],pi)=>{
    const ev=Number((base*(.78+((di+pi)%6)*.055)).toFixed(1));
    const solar=Number((solarBase*(3.8+((di+pi)%4)*.42)).toFixed(1));
    const battery=Number((ev*(.06+((di+pi)%3)*.02)).toFixed(1));
    const renewable=Math.min(ev,Number((solar+battery).toFixed(1)));
    const grid=Math.max(0,Number((ev-renewable).toFixed(1)));
    return {id:`EN-${date.replaceAll('-','')}-${depotId}`,date,depotId,evEnergyKwh:ev,gridKwh:grid,solarKwh:solar,batteryKwh:battery,renewableKwh:renewable,carbonAvoidedKg:Number((renewable*.31).toFixed(1)),peakKw:Math.round(base*.54+((di+pi)%5)*18),costAmd:Math.round(ev*Number(price))};
  }));
}
function buildDepartureHistory(){
  const profiles=[['AM-101','DR-01','DEPOT-YER-CENTRAL',90],['AM-102','DR-02','DEPOT-YER-CENTRAL',90],['AM-103','DR-03','DEPOT-AIRPORT',85],['AM-104','DR-04','DEPOT-WEST',90],['AM-105','DR-05','DEPOT-YER-CENTRAL',80],['AM-107','DR-06','DEPOT-YER-CENTRAL',80]];
  return REPORT_HISTORY_DATES.flatMap((date,di)=>profiles.map(([vehicle,driver,depotId,targetSoc],pi)=>{
    const problem=(di+pi)%11===0;const late=(di+pi)%17===0;const actual=problem?Number(targetSoc)-12:Number(targetSoc)+((di+pi)%6)-2;
    return {id:`DH-${date.replaceAll('-','')}-${vehicle}`,date,depotId,vehicle,driver,targetSoc:Number(targetSoc),actualSoc:actual,result:problem?'missed-target':late?'late':'ready',delayMinutes:late?12:0};
  }));
}
const MAINTENANCE_HISTORY=[
  {id:'MT-260501',depotId:'DEPOT-WEST',chargerId:'AC-06',openedDate:'2026-05-22',closedDate:'2026-05-22',status:'resolved',category:'Connector communication',repairMinutes:74,repeatedFailure:false,sourceAlertId:null},
  {id:'MT-260602',depotId:'DEPOT-YER-CENTRAL',chargerId:'DC-02',openedDate:'2026-06-18',closedDate:'2026-06-18',status:'resolved',category:'Cooling warning',repairMinutes:46,repeatedFailure:false,sourceAlertId:null},
  {id:'MT-260703',depotId:'DEPOT-AIRPORT',chargerId:'DC-03',openedDate:'2026-07-12',closedDate:'2026-07-12',status:'resolved',category:'Cable latch inspection',repairMinutes:38,repeatedFailure:false,sourceAlertId:null},
  {id:'MT-260704',depotId:'DEPOT-WEST',chargerId:'DC-04',openedDate:'2026-07-29',closedDate:'2026-07-30',status:'resolved',category:'Thermal derating',repairMinutes:132,repeatedFailure:false,sourceAlertId:null},
  {id:'MT-260805',depotId:'DEPOT-YER-CENTRAL',chargerId:'AC-07',openedDate:'2026-08-08',closedDate:'2026-08-08',status:'resolved',category:'RFID reader',repairMinutes:29,repeatedFailure:false,sourceAlertId:null},
  {id:'MT-260806',depotId:'DEPOT-WEST',chargerId:'AC-06',openedDate:'2026-08-12',closedDate:null,status:'open',category:'Connector communication',repairMinutes:null,repeatedFailure:true,sourceAlertId:'AL-1002'}
];

const KEY='voltdrive_fleet_manager_v1';
const seed={
  company:{name:'Ararat Mobility',depot:'Yerevan Central Depot',defaultDepotId:'DEPOT-YER-CENTRAL',manager:'Narek Petrosyan',email:'fleet@araratmobility.am'},
  depots:[
    {id:'DEPOT-YER-CENTRAL',name:'Yerevan Central Depot',code:'YER-CENTRAL',city:'Yerevan',address:'Yerevan, Armenia',capacityKw:600,baseLoadKw:118,solarKw:64,siteBatteryPct:72,status:'active'},
    {id:'DEPOT-WEST',name:'West Hub',code:'YER-WEST',city:'Yerevan',address:'West Yerevan, Armenia',capacityKw:240,baseLoadKw:52,solarKw:24,siteBatteryPct:61,status:'active'},
    {id:'DEPOT-AIRPORT',name:'Airport Hub',code:'EVN-AIRPORT',city:'Yerevan',address:'Zvartnots area, Armenia',capacityKw:300,baseLoadKw:52,solarKw:38,siteBatteryPct:78,status:'active'}
  ],
  depotPolicies:[
    {id:'POLICY-YER-CENTRAL',depotId:'DEPOT-YER-CENTRAL',smartPriority:true,peakProtection:true,energyMode:'automatic',peakLimitKw:520,safetyReserveKw:40,solarPreference:true,batteryAssist:true,priceAmd:78,batteryReservePct:25},
    {id:'POLICY-WEST',depotId:'DEPOT-WEST',smartPriority:true,peakProtection:true,energyMode:'automatic',peakLimitKw:220,safetyReserveKw:20,solarPreference:true,batteryAssist:true,priceAmd:78,batteryReservePct:25},
    {id:'POLICY-AIRPORT',depotId:'DEPOT-AIRPORT',smartPriority:true,peakProtection:true,energyMode:'automatic',peakLimitKw:280,safetyReserveKw:20,solarPreference:true,batteryAssist:true,priceAmd:78,batteryReservePct:25}
  ],
  departments:[
    {id:'DEPT-DELIVERY',name:'Delivery',code:'DEL',depotId:'DEPOT-YER-CENTRAL',costCenterId:'CC-DEL',status:'active'},
    {id:'DEPT-AIRPORT',name:'Airport',code:'AIR',depotId:'DEPOT-AIRPORT',costCenterId:'CC-AIR',status:'active'},
    {id:'DEPT-WEST',name:'West Hub',code:'WEST',depotId:'DEPOT-WEST',costCenterId:null,status:'active'},
    {id:'DEPT-SHUTTLE',name:'Shuttle',code:'SHU',depotId:'DEPOT-YER-CENTRAL',costCenterId:'CC-SHU',status:'active'},
    {id:'DEPT-EXEC',name:'Executive',code:'EXE',depotId:'DEPOT-YER-CENTRAL',costCenterId:'CC-EXE',status:'active'},
    {id:'DEPT-GENERAL',name:'General',code:'GEN',depotId:'DEPOT-YER-CENTRAL',costCenterId:null,status:'active'}
  ],
  routes:[
    {id:'ROUTE-NORTH',name:'North Route',code:'NORTH',departmentId:'DEPT-DELIVERY',depotId:'DEPOT-YER-CENTRAL',distanceKm:74,plannedEnergyKwh:31,status:'active'},
    {id:'ROUTE-CENTER',name:'Center Route',code:'CENTER',departmentId:'DEPT-DELIVERY',depotId:'DEPOT-YER-CENTRAL',distanceKm:46,plannedEnergyKwh:22,status:'active'},
    {id:'ROUTE-AIRPORT',name:'Airport Route',code:'AIRPORT',departmentId:'DEPT-AIRPORT',depotId:'DEPOT-AIRPORT',distanceKm:62,plannedEnergyKwh:22,status:'active'},
    {id:'ROUTE-WEST',name:'West Route',code:'WEST',departmentId:'DEPT-WEST',depotId:'DEPOT-WEST',distanceKm:88,plannedEnergyKwh:48,status:'active'},
    {id:'ROUTE-HOTEL',name:'Hotel Shuttle',code:'HOTEL',departmentId:'DEPT-SHUTTLE',depotId:'DEPOT-YER-CENTRAL',distanceKm:38,plannedEnergyKwh:18,status:'active'},
    {id:'ROUTE-EXEC',name:'Executive',code:'EXEC',departmentId:'DEPT-EXEC',depotId:'DEPOT-YER-CENTRAL',distanceKm:51,plannedEnergyKwh:24,status:'active'}
  ],
  parkingBays:[
    {id:'BAY-CENTRAL-01',code:'B01',name:'Bay B01',depotId:'DEPOT-YER-CENTRAL',chargerId:'DC-01',type:'charging',accessible:false,status:'occupied',vehicleId:'AM-101'},
    {id:'BAY-CENTRAL-02',code:'B02',name:'Bay B02',depotId:'DEPOT-YER-CENTRAL',chargerId:'DC-02',type:'charging',accessible:false,status:'available',vehicleId:null},
    {id:'BAY-AIRPORT-03',code:'B03',name:'Bay B03',depotId:'DEPOT-AIRPORT',chargerId:'DC-03',type:'charging',accessible:false,status:'occupied',vehicleId:'AM-103'},
    {id:'BAY-WEST-04',code:'B04',name:'Bay B04',depotId:'DEPOT-WEST',chargerId:'DC-04',type:'charging',accessible:false,status:'occupied',vehicleId:'AM-104'},
    {id:'BAY-CENTRAL-05',code:'B05',name:'Bay B05',depotId:'DEPOT-YER-CENTRAL',chargerId:'AC-05',type:'charging',accessible:true,status:'available',vehicleId:null},
    {id:'BAY-WEST-06',code:'B06',name:'Bay B06',depotId:'DEPOT-WEST',chargerId:'AC-06',type:'charging',accessible:false,status:'blocked',vehicleId:null},
    {id:'BAY-CENTRAL-07',code:'B07',name:'Bay B07',depotId:'DEPOT-YER-CENTRAL',chargerId:'AC-07',type:'charging',accessible:false,status:'occupied',vehicleId:'AM-107'},
    {id:'BAY-CENTRAL-08',code:'B08',name:'Bay B08',depotId:'DEPOT-YER-CENTRAL',chargerId:'AC-08',type:'charging',accessible:false,status:'reserved',vehicleId:'AM-105'},
    {id:'BAY-CENTRAL-09',code:'B09',name:'Bay B09',depotId:'DEPOT-YER-CENTRAL',chargerId:null,type:'parking',accessible:false,status:'available',vehicleId:null},
    {id:'BAY-AIRPORT-10',code:'B10',name:'Bay B10',depotId:'DEPOT-AIRPORT',chargerId:null,type:'parking',accessible:true,status:'available',vehicleId:null}
  ],
  energy:{depotId:'DEPOT-YER-CENTRAL',capacityKw:600,currentKw:428,priceAmd:78,solarKw:64,siteBatteryPct:72},
  vehicles:[
    {id:'AM-101',name:'Mercedes eSprinter 01',plate:'36 AA 101',manufacturer:'Mercedes-Benz',model:'eSprinter',vin:'W1V3EBHY8RT101001',capacity:81,connector:'CCS2',connectorTypes:['CCS2'],maxAcKw:11,maxDcKw:120,battery:42,target:90,departure:'08:00',requiredKwh:31,status:'charging',charger:'DC-01',chargerConnectorId:'1',power:118,priority:'critical',depotId:'DEPOT-YER-CENTRAL',departmentId:'DEPT-DELIVERY',routeId:'ROUTE-NORTH',route:'North Route',range:198,odometer:28410,ownership:'Fleet',plugCharge:'Enabled',energyMonth:612,costMonth:48420,active:true},
    {id:'AM-102',name:'Mercedes eSprinter 02',plate:'36 AA 102',manufacturer:'Mercedes-Benz',model:'eSprinter',vin:'W1V3EBHY8RT102002',capacity:81,connector:'CCS2',connectorTypes:['CCS2'],maxAcKw:11,maxDcKw:120,battery:88,target:90,departure:'08:20',requiredKwh:2,status:'ready',charger:'—',chargerConnectorId:null,power:0,priority:'high',depotId:'DEPOT-YER-CENTRAL',departmentId:'DEPT-DELIVERY',routeId:'ROUTE-CENTER',route:'Center Route',range:312,odometer:26105,ownership:'Fleet',plugCharge:'Enabled',energyMonth:574,costMonth:44760,active:true},
    {id:'AM-103',name:'Ford E-Transit 03',plate:'36 AA 103',manufacturer:'Ford',model:'E-Transit',vin:'WF0EXXTTGE103003',capacity:68,connector:'CCS2',connectorTypes:['CCS2'],maxAcKw:11,maxDcKw:100,battery:57,target:85,departure:'09:15',requiredKwh:22,status:'charging',charger:'DC-03',chargerConnectorId:'1',power:92,priority:'high',depotId:'DEPOT-AIRPORT',departmentId:'DEPT-AIRPORT',routeId:'ROUTE-AIRPORT',route:'Airport Route',range:226,odometer:31844,ownership:'Fleet',plugCharge:'Enabled',energyMonth:701,costMonth:55210,active:true},
    {id:'AM-104',name:'Ford E-Transit 04',plate:'36 AA 104',manufacturer:'Ford',model:'E-Transit',vin:'WF0EXXTTGE104004',capacity:68,connector:'CCS2',connectorTypes:['CCS2'],maxAcKw:11,maxDcKw:100,battery:28,target:90,departure:'09:30',requiredKwh:48,status:'risk',charger:'DC-04',chargerConnectorId:'1',power:78,priority:'critical',depotId:'DEPOT-WEST',departmentId:'DEPT-WEST',routeId:'ROUTE-WEST',route:'West Route',range:111,odometer:35670,ownership:'Fleet',plugCharge:'Enabled',energyMonth:746,costMonth:59180,active:true},
    {id:'AM-105',name:'VW ID. Buzz 05',plate:'36 AA 105',manufacturer:'Volkswagen',model:'ID. Buzz',vin:'WVWZZZEB5PH105005',capacity:77,connector:'CCS2 + Type 2',connectorTypes:['CCS2','Type 2'],maxAcKw:11,maxDcKw:100,battery:76,target:80,departure:'10:30',requiredKwh:4,status:'queued',charger:'—',chargerConnectorId:null,power:0,priority:'normal',depotId:'DEPOT-YER-CENTRAL',departmentId:'DEPT-SHUTTLE',routeId:'ROUTE-HOTEL',route:'Hotel Shuttle',range:284,odometer:19422,ownership:'Fleet',plugCharge:'Pending',energyMonth:438,costMonth:34700,active:true},
    {id:'AM-106',name:'VW ID. Buzz 06',plate:'36 AA 106',manufacturer:'Volkswagen',model:'ID. Buzz',vin:'WVWZZZEB5PH106006',capacity:77,connector:'CCS2 + Type 2',connectorTypes:['CCS2','Type 2'],maxAcKw:11,maxDcKw:100,battery:94,target:90,departure:'11:00',requiredKwh:0,status:'ready',charger:'—',chargerConnectorId:null,power:0,priority:'normal',depotId:'DEPOT-YER-CENTRAL',departmentId:'DEPT-SHUTTLE',routeId:'ROUTE-HOTEL',route:'Hotel Shuttle',range:351,odometer:18304,ownership:'Fleet',plugCharge:'Enabled',energyMonth:401,costMonth:31960,active:true},
    {id:'AM-107',name:'Hyundai IONIQ 5 07',plate:'36 AA 107',manufacturer:'Hyundai',model:'IONIQ 5',vin:'KMHKR81CPPU107007',capacity:77,connector:'CCS2 + Type 2',connectorTypes:['CCS2','Type 2'],maxAcKw:22,maxDcKw:150,battery:64,target:80,departure:'12:00',requiredKwh:12,status:'charging',charger:'AC-07',chargerConnectorId:'1',power:22,priority:'normal',depotId:'DEPOT-YER-CENTRAL',departmentId:'DEPT-EXEC',routeId:'ROUTE-EXEC',route:'Executive',range:296,odometer:14728,ownership:'Fleet',plugCharge:'Enabled',energyMonth:329,costMonth:26610,active:true},
    {id:'AM-108',name:'Tesla Model Y 08',plate:'36 AA 108',manufacturer:'Tesla',model:'Model Y',vin:'LRWYGCEK1PC108008',capacity:75,connector:'CCS2 + Type 2',connectorTypes:['CCS2','Type 2'],maxAcKw:11,maxDcKw:150,battery:33,target:80,departure:'13:30',requiredKwh:35,status:'queued',charger:'—',chargerConnectorId:null,power:0,priority:'low',depotId:'DEPOT-YER-CENTRAL',departmentId:'DEPT-EXEC',routeId:'ROUTE-EXEC',route:'Executive',range:171,odometer:22018,ownership:'Fleet',plugCharge:'Enabled',energyMonth:365,costMonth:29140,active:true}
  ],
  chargers:[
    {id:'DC-01',type:'DC',power:150,status:'busy',vehicle:'AM-101',depotId:'DEPOT-YER-CENTRAL',parkingBayId:'BAY-CENTRAL-01',bay:'B01',health:98,connectors:[{id:'1',type:'CCS2',power:150,status:'busy'},{id:'2',type:'CCS2',power:150,status:'available'}]},{id:'DC-02',type:'DC',power:150,status:'available',vehicle:null,depotId:'DEPOT-YER-CENTRAL',parkingBayId:'BAY-CENTRAL-02',bay:'B02',health:99,connectors:[{id:'1',type:'CCS2',power:150,status:'available'},{id:'2',type:'CCS2',power:150,status:'available'}]},
    {id:'DC-03',type:'DC',power:120,status:'busy',vehicle:'AM-103',depotId:'DEPOT-AIRPORT',parkingBayId:'BAY-AIRPORT-03',bay:'B03',health:96,connectors:[{id:'1',type:'CCS2',power:120,status:'busy'}]},{id:'DC-04',type:'DC',power:120,status:'busy',vehicle:'AM-104',depotId:'DEPOT-WEST',parkingBayId:'BAY-WEST-04',bay:'B04',health:83,connectors:[{id:'1',type:'CCS2',power:120,status:'busy'}]},
    {id:'AC-05',type:'AC',power:22,status:'available',vehicle:null,depotId:'DEPOT-YER-CENTRAL',parkingBayId:'BAY-CENTRAL-05',bay:'B05',health:100,connectors:[{id:'1',type:'Type 2',power:22,status:'available'}]},{id:'AC-06',type:'AC',power:22,status:'faulty',vehicle:null,depotId:'DEPOT-WEST',parkingBayId:'BAY-WEST-06',bay:'B06',health:41,connectors:[{id:'1',type:'Type 2',power:22,status:'faulty'}]},
    {id:'AC-07',type:'AC',power:22,status:'busy',vehicle:'AM-107',depotId:'DEPOT-YER-CENTRAL',parkingBayId:'BAY-CENTRAL-07',bay:'B07',health:97,connectors:[{id:'1',type:'Type 2',power:22,status:'busy'}]},{id:'AC-08',type:'AC',power:22,status:'reserved',vehicle:'AM-105',depotId:'DEPOT-YER-CENTRAL',parkingBayId:'BAY-CENTRAL-08',bay:'B08',health:100,connectors:[{id:'1',type:'Type 2',power:22,status:'reserved'}]}
  ],
  alerts:[
    {id:'AL-1001',severity:'critical',title:'Vehicle may miss departure',body:'AM-104 is projected to reach only 72% by 09:30.',time:'6 min ago',status:'open',vehicleId:'AM-104',depotId:'DEPOT-WEST'},
    {id:'AL-1002',severity:'warning',title:'Charger AC-06 fault',body:'Connector communication error. Technician review recommended.',time:'18 min ago',status:'open',chargerId:'AC-06',depotId:'DEPOT-WEST'},
    {id:'AL-1003',severity:'warning',title:'Depot load above 70%',body:'Current load is 428 kW of 600 kW available capacity.',time:'24 min ago',status:'open',depotId:'DEPOT-YER-CENTRAL'},
    {id:'AL-1004',severity:'info',title:'Vehicle AM-105 queued',body:'Vehicle is waiting for charger assignment before 10:30 departure.',time:'41 min ago',status:'open',vehicleId:'AM-105',depotId:'DEPOT-YER-CENTRAL'}
  ],
  drivers:[
    {id:'DR-01',name:'Arman Hakobyan',departmentId:'DEPT-DELIVERY',department:'Delivery',depotId:'DEPOT-YER-CENTRAL',vehicle:'AM-101',phone:'+374 91 220 101',shift:'07:00–15:00',status:'active',access:'Driver + RFID'},
    {id:'DR-02',name:'Mariam Sargsyan',departmentId:'DEPT-DELIVERY',department:'Delivery',depotId:'DEPOT-YER-CENTRAL',vehicle:'AM-102',phone:'+374 91 220 102',shift:'07:00–15:00',status:'active',access:'Driver app'},
    {id:'DR-03',name:'Gor Vardanyan',departmentId:'DEPT-AIRPORT',department:'Airport',depotId:'DEPOT-AIRPORT',vehicle:'AM-103',phone:'+374 91 220 103',shift:'08:00–16:00',status:'active',access:'Driver + RFID'},
    {id:'DR-04',name:'Levon Grigoryan',departmentId:'DEPT-WEST',department:'West Hub',depotId:'DEPOT-WEST',vehicle:'AM-104',phone:'+374 91 220 104',shift:'08:30–17:00',status:'attention',access:'Driver app'},
    {id:'DR-05',name:'Anna Melikyan',departmentId:'DEPT-SHUTTLE',department:'Shuttle',depotId:'DEPOT-YER-CENTRAL',vehicle:'AM-105',phone:'+374 91 220 105',shift:'09:30–18:00',status:'active',access:'Driver + RFID'},
    {id:'DR-06',name:'David Avetisyan',departmentId:'DEPT-EXEC',department:'Executive',depotId:'DEPOT-YER-CENTRAL',vehicle:'AM-107',phone:'+374 91 220 107',shift:'11:00–19:00',status:'active',access:'Driver app'}
  ],
  schedules:[
    {id:'SCH-01',serviceDate:'2026-08-13',vehicle:'AM-101',driver:'DR-01',depotId:'DEPOT-YER-CENTRAL',routeId:'ROUTE-NORTH',route:'North Route',departure:'08:00',return:'11:30',target:90,status:'confirmed'},
    {id:'SCH-02',serviceDate:'2026-08-13',vehicle:'AM-102',driver:'DR-02',depotId:'DEPOT-YER-CENTRAL',routeId:'ROUTE-CENTER',route:'Center Route',departure:'08:20',return:'12:10',target:90,status:'confirmed'},
    {id:'SCH-03',serviceDate:'2026-08-13',vehicle:'AM-103',driver:'DR-03',depotId:'DEPOT-AIRPORT',routeId:'ROUTE-AIRPORT',route:'Airport Route',departure:'09:15',return:'13:00',target:85,status:'confirmed'},
    {id:'SCH-04',serviceDate:'2026-08-13',vehicle:'AM-104',driver:'DR-04',depotId:'DEPOT-WEST',routeId:'ROUTE-WEST',route:'West Route',departure:'09:30',return:'14:10',target:90,status:'risk'},
    {id:'SCH-05',serviceDate:'2026-08-13',vehicle:'AM-105',driver:'DR-05',depotId:'DEPOT-YER-CENTRAL',routeId:'ROUTE-HOTEL',route:'Hotel Shuttle',departure:'10:30',return:'15:30',target:80,status:'planned'},
    {id:'SCH-06',serviceDate:'2026-08-13',vehicle:'AM-107',driver:'DR-06',depotId:'DEPOT-YER-CENTRAL',routeId:'ROUTE-EXEC',route:'Executive',departure:'12:00',return:'17:45',target:80,status:'planned'}
  ],
  reimbursements:[
    {id:'HR-24081',driver:'DR-02',vehicle:'AM-102',depotId:'DEPOT-YER-CENTRAL',date:'2026-08-11',energy:18.6,rate:72,amount:1339,status:'approved',paymentStatus:'paid',batchId:'RB-0811',submittedAt:'Aug 11 · 18:12',reviewedAt:'Aug 12 · 09:15',reviewer:'Mane Grigoryan',homeCharger:'Wallbox Pulsar Plus',meterId:'HM-102-07',meterStart:1842.6,meterEnd:1861.2,tariffSource:'VoltDrive fleet home tariff',location:'Yerevan · Home charging',evidence:['Meter reading','Home charger session'],note:'Approved under standard home charging policy.'},
    {id:'HR-24082',driver:'DR-05',vehicle:'AM-105',depotId:'DEPOT-YER-CENTRAL',date:'2026-08-12',energy:22.4,rate:72,amount:1613,status:'pending',paymentStatus:'unpaid',batchId:null,submittedAt:'Aug 12 · 20:34',reviewedAt:null,reviewer:null,homeCharger:'Tesla Wall Connector',meterId:'HM-105-03',meterStart:943.1,meterEnd:965.5,tariffSource:'VoltDrive fleet home tariff',location:'Yerevan · Home charging',evidence:['Meter reading','Utility receipt'],note:'Driver submitted utility evidence.'},
    {id:'HR-24083',driver:'DR-06',vehicle:'AM-107',depotId:'DEPOT-YER-CENTRAL',date:'2026-08-12',energy:14.8,rate:72,amount:1066,status:'pending',paymentStatus:'unpaid',batchId:null,submittedAt:'Aug 12 · 22:08',reviewedAt:null,reviewer:null,homeCharger:'ABB Terra AC',meterId:'HM-107-02',meterStart:518.4,meterEnd:533.2,tariffSource:'VoltDrive fleet home tariff',location:'Yerevan · Home charging',evidence:['Home charger session'],note:'Automatic charger session import.'},
    {id:'HR-24084',driver:'DR-01',vehicle:'AM-101',depotId:'DEPOT-YER-CENTRAL',date:'2026-08-13',energy:27.3,rate:72,amount:1966,status:'review',paymentStatus:'unpaid',batchId:null,submittedAt:'Aug 13 · 08:42',reviewedAt:null,reviewer:null,homeCharger:'Wallbox Commander 2',meterId:'HM-101-01',meterStart:2261.8,meterEnd:2289.1,tariffSource:'VoltDrive fleet home tariff',location:'Yerevan · Home charging',evidence:['Meter reading','Home charger session','Utility receipt'],note:'Energy amount matches charger telemetry; manager review requested.'}
  ],
  sessions:[
    {id:'CS-261842',date:'2026-08-13',vehicle:'AM-101',driver:'DR-01',charger:'DC-01',depotId:'DEPOT-YER-CENTRAL',connector:'CCS2',connectorId:'1',start:'12:08',duration:'00:46',energy:42.8,power:118,cost:5480,status:'active',socStart:18,socNow:42,target:90},
    {id:'CS-261841',date:'2026-08-13',vehicle:'AM-103',driver:'DR-03',charger:'DC-03',depotId:'DEPOT-AIRPORT',connector:'CCS2',connectorId:'1',start:'12:21',duration:'00:33',energy:31.2,power:92,cost:3994,status:'active',socStart:29,socNow:57,target:85},
    {id:'CS-261840',date:'2026-08-13',vehicle:'AM-104',driver:'DR-04',charger:'DC-04',depotId:'DEPOT-WEST',connector:'CCS2',connectorId:'1',start:'12:34',duration:'00:20',energy:18.6,power:78,cost:2381,status:'active',socStart:12,socNow:28,target:90},
    {id:'CS-261839',date:'2026-08-13',vehicle:'AM-107',driver:'DR-06',charger:'AC-07',depotId:'DEPOT-YER-CENTRAL',connector:'Type 2',connectorId:'1',start:'11:18',duration:'01:36',energy:24.4,power:22,cost:3123,status:'active',socStart:41,socNow:64,target:80},
    {id:'CS-261832',date:'2026-08-13',vehicle:'AM-102',driver:'DR-02',charger:'DC-02',depotId:'DEPOT-YER-CENTRAL',connector:'CCS2',connectorId:'1',start:'08:01',duration:'00:41',energy:38.6,power:0,cost:4941,status:'completed',socStart:44,socNow:88,target:90},
    {id:'CS-261821',date:'2026-08-13',vehicle:'AM-106',driver:'DR-05',charger:'DC-03',depotId:'DEPOT-AIRPORT',connector:'CCS2',connectorId:'1',start:'07:14',duration:'00:36',energy:33.1,power:0,cost:4237,status:'completed',socStart:55,socNow:94,target:90},
    {id:'CS-261811',date:'2026-08-13',vehicle:'AM-108',driver:'DR-06',charger:'AC-06',depotId:'DEPOT-WEST',connector:'Type 2',connectorId:'1',start:'06:43',duration:'00:07',energy:1.8,power:0,cost:230,status:'failed',socStart:31,socNow:33,target:80},
    ...buildHistoricalSessions()
  ],
  reservations:[
    {id:'RS-84021',vehicle:'AM-105',depotId:'DEPOT-YER-CENTRAL',location:'Yerevan Central Depot',charger:'AC-08',parkingBayId:'BAY-CENTRAL-08',bay:'B08',arrival:'13:10',duration:'01:20',target:80,status:'confirmed'},
    {id:'RS-84022',vehicle:'AM-108',depotId:'DEPOT-YER-CENTRAL',location:'Yerevan Central Depot',charger:'Auto assign',parkingBayId:null,bay:'Any',arrival:'13:25',duration:'01:10',target:80,status:'confirmed'},
    {id:'RS-84017',vehicle:'AM-101',depotId:'DEPOT-YER-CENTRAL',location:'Yerevan Central Depot',charger:'DC-01',parkingBayId:'BAY-CENTRAL-01',bay:'B01',arrival:'12:00',duration:'01:15',target:90,status:'active'},
    {id:'RS-84018',vehicle:'AM-103',depotId:'DEPOT-AIRPORT',location:'Airport Hub',charger:'DC-03',parkingBayId:'BAY-AIRPORT-03',bay:'B03',arrival:'12:15',duration:'01:00',target:85,status:'active'},
    {id:'RS-84004',vehicle:'AM-102',depotId:'DEPOT-YER-CENTRAL',location:'Yerevan Central Depot',charger:'DC-02',parkingBayId:'BAY-CENTRAL-02',bay:'B02',arrival:'08:00',duration:'00:55',target:90,status:'completed'},
    {id:'RS-83999',vehicle:'AM-106',depotId:'DEPOT-YER-CENTRAL',location:'Yerevan Central Depot',charger:'Auto assign',parkingBayId:'BAY-CENTRAL-09',bay:'B09',arrivalDate:'2026-08-13',arrival:'09:00',duration:'00:45',target:90,status:'waitlist',grace:15},
    {id:'RS-83998',vehicle:'AM-106',depotId:'DEPOT-YER-CENTRAL',location:'Yerevan Central Depot',charger:'Auto assign',parkingBayId:null,bay:'Any',arrivalDate:'2026-08-13',arrival:'10:00',duration:'00:30',target:90,status:'confirmed',grace:15},
    ...buildHistoricalReservations()
  ],
  chargerUsageHistory:buildChargerUsageHistory(),
  parkingUsageHistory:buildParkingUsageHistory(),
  energyHistory:buildEnergyHistory(),
  departureHistory:buildDepartureHistory(),
  maintenanceTickets:structuredClone(MAINTENANCE_HISTORY),
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
      {id:'TX-86101',date:'Aug 13, 2026 · 12:54',type:'Charging session',reference:'CS-261842',vehicle:'AM-101',depotId:'DEPOT-YER-CENTRAL',costCenter:'Delivery Operations',amount:5480,status:'pending'},
      {id:'TX-86100',date:'Aug 13, 2026 · 12:54',type:'Charging session',reference:'CS-261841',vehicle:'AM-103',depotId:'DEPOT-AIRPORT',costCenter:'Airport Services',amount:3994,status:'pending'},
      {id:'TX-86092',date:'Aug 13, 2026 · 11:42',type:'Home reimbursement',reference:'HR-24084',vehicle:'AM-101',depotId:'DEPOT-YER-CENTRAL',costCenter:'Delivery Operations',amount:1966,status:'pending'},
      {id:'TX-86081',date:'Aug 12, 2026 · 18:10',type:'Charging session',reference:'CS-261832',vehicle:'AM-102',depotId:'DEPOT-YER-CENTRAL',costCenter:'Delivery Operations',amount:4941,status:'posted'},
      {id:'TX-86073',date:'Aug 12, 2026 · 17:20',type:'Fleet discount',reference:'DISC-AUG',vehicle:'—',depotId:'*',costCenter:'Shared Fleet',amount:-6250,status:'posted'},
      {id:'TX-86061',date:'Aug 12, 2026 · 10:05',type:'Idle fee',reference:'CS-261799',vehicle:'AM-105',depotId:'DEPOT-YER-CENTRAL',costCenter:'Shuttle Services',amount:900,status:'posted'}
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
    {id:'USR-01',name:'Narek Petrosyan',email:'narek@araratmobility.am',role:'ROLE-ADMIN',scope:'All depots',scopeDepotIds:['*'],status:'active',twoFactor:true,lastActive:'Just now',avatar:'NP'},
    {id:'USR-02',name:'Ani Hovsepyan',email:'ani@araratmobility.am',role:'ROLE-MANAGER',scope:'Yerevan Central Depot',scopeDepotIds:['DEPOT-YER-CENTRAL'],status:'active',twoFactor:true,lastActive:'8 min ago',avatar:'AH'},
    {id:'USR-03',name:'Tigran Manukyan',email:'tigran@araratmobility.am',role:'ROLE-DISPATCH',scope:'Yerevan Central Depot',scopeDepotIds:['DEPOT-YER-CENTRAL'],status:'active',twoFactor:true,lastActive:'21 min ago',avatar:'TM'},
    {id:'USR-04',name:'Mane Grigoryan',email:'mane@araratmobility.am',role:'ROLE-FINANCE',scope:'All depots',scopeDepotIds:['*'],status:'active',twoFactor:true,lastActive:'Today · 10:42',avatar:'MG'},
    {id:'USR-05',name:'Hayk Sargsyan',email:'hayk@araratmobility.am',role:'ROLE-ANALYST',scope:'All depots',scopeDepotIds:['*'],status:'active',twoFactor:false,lastActive:'Yesterday · 17:26',avatar:'HS'},
    {id:'USR-06',name:'Lilit Avetisyan',email:'lilit@araratmobility.am',role:'ROLE-VIEWER',scope:'Yerevan Central Depot',scopeDepotIds:['DEPOT-YER-CENTRAL'],status:'active',twoFactor:false,lastActive:'Aug 12 · 14:05',avatar:'LA'},
    {id:'USR-07',name:'Suren Petrosyan',email:'suren@araratmobility.am',role:'ROLE-DISPATCH',scope:'West Hub',scopeDepotIds:['DEPOT-WEST'],status:'invited',twoFactor:false,lastActive:'Invitation pending',avatar:'SP'}
  ],
  roles:[
    {id:'ROLE-ADMIN',name:'Fleet Administrator',description:'Full fleet, finance and administration access.',system:true,permissions:['dashboard.view','operations.manage','vehicles.manage','drivers.manage','schedules.manage','chargers.manage','sessions.stop','reservations.manage','energy.manage','billing.manage','reports.view','alerts.manage','home.manage','users.view','users.manage','roles.view','roles.manage','settings.manage','audit.view','audit.export']},
    {id:'ROLE-MANAGER',name:'Fleet Manager',description:'Operational fleet management without account administration.',system:true,permissions:['dashboard.view','operations.manage','vehicles.manage','drivers.manage','schedules.manage','chargers.manage','sessions.stop','reservations.manage','energy.manage','billing.view','reports.view','alerts.manage','home.manage','audit.view']},
    {id:'ROLE-DISPATCH',name:'Dispatcher',description:'Day-to-day readiness, schedules and charging operations.',system:true,permissions:['dashboard.view','operations.manage','vehicles.view','drivers.view','schedules.manage','chargers.view','sessions.view','reservations.manage','energy.view','reports.view','alerts.manage']},
    {id:'ROLE-FINANCE',name:'Finance Manager',description:'Billing, reimbursements and financial reporting.',system:true,permissions:['dashboard.view','vehicles.view','sessions.view','billing.manage','reports.view','alerts.view','home.manage','audit.view']},
    {id:'ROLE-ANALYST',name:'Analyst',description:'Read-only analytics across fleet operations.',system:true,permissions:['dashboard.view','vehicles.view','drivers.view','schedules.view','chargers.view','sessions.view','reservations.view','energy.view','billing.view','reports.view','alerts.view']},
    {id:'ROLE-VIEWER',name:'Read-only',description:'Basic monitoring without operational actions.',system:true,permissions:['dashboard.view','vehicles.view','drivers.view','chargers.view','sessions.view','reservations.view','energy.view','reports.view','alerts.view']}
  ],
  auditLog:[
    {id:'AUD-1201',time:'Aug 13 · 15:42',user:'Narek Petrosyan',action:'Updated charging policy',resource:'Fleet Settings',result:'success',depotId:'*'},
    {id:'AUD-1202',time:'Aug 13 · 14:18',user:'Ani Hovsepyan',action:'Changed vehicle priority',resource:'AM-104',result:'success',depotId:'DEPOT-WEST'},
    {id:'AUD-1203',time:'Aug 13 · 13:57',user:'Tigran Manukyan',action:'Reassigned charger',resource:'AM-105 → AC-08',result:'success',depotId:'DEPOT-YER-CENTRAL'},
    {id:'AUD-1204',time:'Aug 13 · 12:36',user:'Mane Grigoryan',action:'Downloaded invoice',resource:'INV-0726',result:'success',depotId:'*'},
    {id:'AUD-1205',time:'Aug 13 · 11:22',user:'Narek Petrosyan',action:'Changed user role',resource:'Hayk Sargsyan',result:'success',depotId:'*'},
    {id:'AUD-1206',time:'Aug 12 · 18:06',user:'System',action:'Blocked sign-in attempt',resource:'Unknown device',result:'blocked',depotId:'*'}
  ],
  settings:{
    operationDate:'2026-08-13',operationTime:'12:54',
    smartPriority:true,peakProtection:true,departureBuffer:20,alertThreshold:80,defaultTarget:85,homeRate:72,autoApproveHome:false,notifyDrivers:true,
    timezone:'Asia/Yerevan',currency:'AMD',distanceUnit:'km',defaultDepot:'Yerevan Central Depot',defaultDepotId:'DEPOT-YER-CENTRAL',language:'English',
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
const SCOPED_COLLECTIONS=['vehicles','chargers','parkingBays','drivers','routes','schedules','sessions','reservations','alerts','reimbursements','auditLog','chargerUsageHistory','parkingUsageHistory','energyHistory','departureHistory','maintenanceTickets'];

const LEGACY_DEPOT_IDS={
  'Yerevan Central Depot':'DEPOT-YER-CENTRAL',
  'West Hub':'DEPOT-WEST',
  'Airport Hub':'DEPOT-AIRPORT'
};
const LEGACY_DEPARTMENT_IDS={
  'Delivery':'DEPT-DELIVERY','Airport':'DEPT-AIRPORT','West Hub':'DEPT-WEST','Shuttle':'DEPT-SHUTTLE','Executive':'DEPT-EXEC','General':'DEPT-GENERAL'
};
const LEGACY_ROUTE_IDS={
  'North Route':'ROUTE-NORTH','Center Route':'ROUTE-CENTER','Airport Route':'ROUTE-AIRPORT','West Route':'ROUTE-WEST','Hotel Shuttle':'ROUTE-HOTEL','Executive':'ROUTE-EXEC'
};

export function getDepot(state,idOrName){return (state?.depots||[]).find(d=>d.id===idOrName||d.name===idOrName)||null;}
export function getDepartment(state,idOrName){return (state?.departments||[]).find(d=>d.id===idOrName||d.name===idOrName)||null;}
export function getRoute(state,idOrName){return (state?.routes||[]).find(r=>r.id===idOrName||r.name===idOrName)||null;}
export function getParkingBay(state,idOrCode){return (state?.parkingBays||[]).find(b=>b.id===idOrCode||b.code===idOrCode)||null;}
export function depotName(state,idOrName){return getDepot(state,idOrName)?.name||idOrName||'—';}
export function departmentName(state,idOrName){return getDepartment(state,idOrName)?.name||idOrName||'—';}
export function routeName(state,idOrName){return getRoute(state,idOrName)?.name||idOrName||'—';}
export function parkingBayCode(state,idOrCode){return getParkingBay(state,idOrCode)?.code||idOrCode||'—';}

function mergeRoles(base=[],saved=[]){
  const roles=mergeById(base,saved);
  roles.forEach(role=>{
    const fresh=(base||[]).find(item=>item.id===role.id);
    if(!fresh)return;
    role.permissions=Array.isArray(role.permissions)?role.permissions:[];
    const hasAlertCategory=role.permissions.some(permission=>permission.startsWith('alerts.'));
    if(!hasAlertCategory){
      (fresh.permissions||[]).filter(permission=>permission.startsWith('alerts.')).forEach(permission=>{
        if(!role.permissions.includes(permission)) role.permissions.push(permission);
      });
    }
    // v2 access migration: the old users.manage permission implicitly controlled roles.
    // Only the built-in Fleet Administrator receives the new company-wide role controls.
    if(role.id==='ROLE-ADMIN'){
      ['users.view','roles.view','roles.manage','audit.export'].forEach(permission=>{if(!role.permissions.includes(permission))role.permissions.push(permission);});
    }
  });
  return roles;
}

function depotIdFromLegacy(state,value,fallback='DEPOT-YER-CENTRAL'){
  const direct=getDepot(state,value)?.id;if(direct)return direct;
  if(typeof value==='string'&&value.startsWith('DEPOT-'))return value;
  return LEGACY_DEPOT_IDS[value]||fallback;
}
function departmentIdFromLegacy(state,value,fallback='DEPT-GENERAL'){
  return getDepartment(state,value)?.id||LEGACY_DEPARTMENT_IDS[value]||fallback;
}
function routeIdFromLegacy(state,value){
  return getRoute(state,value)?.id||LEGACY_ROUTE_IDS[value]||null;
}
function bayIdFromLegacy(state,value,depotId){
  if(!value||value==='Any')return null;
  const direct=getParkingBay(state,value);
  if(direct&&(!depotId||direct.depotId===depotId))return direct.id;
  return (state.parkingBays||[]).find(b=>b.code===value&&(!depotId||b.depotId===depotId))?.id||null;
}
function legacySlug(value,prefix){
  const slug=String(value||'legacy').normalize('NFKD').replace(/[^a-zA-Z0-9]+/g,'-').replace(/^-+|-+$/g,'').toUpperCase().slice(0,32)||'LEGACY';
  return `${prefix}-${slug}`;
}
function inferLegacyDepotId(state,...values){
  const text=values.filter(Boolean).join(' ').toLowerCase();
  if(text.includes('west'))return 'DEPOT-WEST';
  if(text.includes('airport'))return 'DEPOT-AIRPORT';
  return state.company?.defaultDepotId||state.settings?.defaultDepotId||'DEPOT-YER-CENTRAL';
}
function uniqueLegacyId(items,baseId){
  if(!(items||[]).some(item=>item.id===baseId))return baseId;
  let i=2;
  while((items||[]).some(item=>item.id===`${baseId}-${i}`))i+=1;
  return `${baseId}-${i}`;
}
function ensureLegacyMasterData(state){
  // Old prototype versions allowed custom free-text depots/scopes, departments, routes and bay codes.
  // Convert those values into stable canonical master records before assigning foreign keys.
  const depotNames=new Set([
    state.company?.depot,state.settings?.defaultDepot,
    ...(state.users||[]).flatMap(u=>u.scope&&u.scope!=='All depots'?[u.scope]:[]),
    ...(state.vehicles||[]).flatMap(v=>v.depot?[v.depot]:[]),
    ...(state.reservations||[]).flatMap(r=>r.location?[r.location]:[])
  ].filter(Boolean));
  depotNames.forEach(name=>{
    if(getDepot(state,name))return;
    const id=uniqueLegacyId(state.depots,legacySlug(name,'DEPOT-LEGACY'));
    state.depots.push({id,name:String(name),code:id.replace('DEPOT-LEGACY-','').slice(0,18),city:'—',address:'—',capacityKw:300,baseLoadKw:52,solarKw:0,siteBatteryPct:0,status:'active',migratedFromLegacy:true});
  });

  const departmentNames=new Set([
    ...(state.drivers||[]).map(d=>d.department),
    ...(state.vehicles||[]).map(v=>v.group),
    ...(state.billing?.costCenters||[]).map(cc=>cc.department)
  ].filter(Boolean));
  departmentNames.forEach(name=>{
    if(getDepartment(state,name))return;
    const linkedDriver=(state.drivers||[]).find(d=>d.department===name);
    const linkedVehicle=(state.vehicles||[]).find(v=>v.group===name||v.id===linkedDriver?.vehicle);
    const depotId=depotIdFromLegacy(state,linkedDriver?.depotId||linkedVehicle?.depotId||linkedVehicle?.depot||inferLegacyDepotId(state,name,linkedVehicle?.route));
    const id=uniqueLegacyId(state.departments,legacySlug(name,'DEPT-LEGACY'));
    state.departments.push({id,name:String(name),code:id.replace('DEPT-LEGACY-','').slice(0,12),depotId,costCenterId:null,status:'active',migratedFromLegacy:true});
  });

  const routeNames=new Set([
    ...(state.vehicles||[]).map(v=>v.route),
    ...(state.schedules||[]).map(x=>x.route)
  ].filter(Boolean));
  routeNames.forEach(name=>{
    if(getRoute(state,name))return;
    const vehicle=(state.vehicles||[]).find(v=>v.route===name);
    const schedule=(state.schedules||[]).find(x=>x.route===name);
    const driver=(state.drivers||[]).find(d=>d.id===schedule?.driver||d.vehicle===schedule?.vehicle||d.vehicle===vehicle?.id);
    const departmentId=departmentIdFromLegacy(state,vehicle?.group||driver?.department);
    const department=getDepartment(state,departmentId);
    const depotId=depotIdFromLegacy(state,vehicle?.depotId||schedule?.depotId||department?.depotId||inferLegacyDepotId(state,name,vehicle?.group));
    const id=uniqueLegacyId(state.routes,legacySlug(name,'ROUTE-LEGACY'));
    state.routes.push({id,name:String(name),code:id.replace('ROUTE-LEGACY-','').slice(0,14),departmentId,depotId,distanceKm:0,plannedEnergyKwh:Number(vehicle?.requiredKwh||schedule?.requiredKwh||0),status:'active',migratedFromLegacy:true});
  });

  (state.chargers||[]).forEach(charger=>{
    if(!charger.bay||charger.bay==='Any'||bayIdFromLegacy(state,charger.bay,charger.depotId))return;
    const depotId=depotIdFromLegacy(state,charger.depotId||inferLegacyDepotId(state,charger.id,charger.bay));
    const base=legacySlug(`${depotId}-${charger.bay}`,'BAY-LEGACY');
    const id=uniqueLegacyId(state.parkingBays,base);
    state.parkingBays.push({id,code:String(charger.bay),name:`Bay ${charger.bay}`,depotId,chargerId:charger.id,type:'charging',accessible:false,status:charger.status==='busy'?'occupied':charger.status==='reserved'?'reserved':['faulty','maintenance','offline','disabled'].includes(charger.status)?'blocked':'available',vehicleId:charger.vehicle||null,migratedFromLegacy:true});
  });
  (state.reservations||[]).forEach(reservation=>{
    if(!reservation.bay||reservation.bay==='Any'||bayIdFromLegacy(state,reservation.bay,reservation.depotId))return;
    const vehicle=(state.vehicles||[]).find(v=>v.id===reservation.vehicle);
    const depotId=depotIdFromLegacy(state,reservation.depotId||reservation.location||vehicle?.depotId||inferLegacyDepotId(state,reservation.location,reservation.bay));
    const base=legacySlug(`${depotId}-${reservation.bay}`,'BAY-LEGACY');
    const id=uniqueLegacyId(state.parkingBays,base);
    state.parkingBays.push({id,code:String(reservation.bay),name:`Bay ${reservation.bay}`,depotId,chargerId:null,type:'parking',accessible:false,status:reservation.status==='confirmed'?'reserved':'available',vehicleId:reservation.status==='confirmed'?reservation.vehicle:null,migratedFromLegacy:true});
  });
  return state;
}

function migrateCanonicalModel(state,{mergeMasters=true}={}){
  if(mergeMasters){
    state.depots=mergeById(seed.depots,state.depots);
    state.depotPolicies=mergeById(seed.depotPolicies,state.depotPolicies);
    state.departments=mergeById(seed.departments,state.departments);
    state.routes=mergeById(seed.routes,state.routes);
    state.parkingBays=mergeById(seed.parkingBays,state.parkingBays);
  }else{
    state.depots=Array.isArray(state.depots)?state.depots:[];state.depotPolicies=Array.isArray(state.depotPolicies)?state.depotPolicies:[];state.departments=Array.isArray(state.departments)?state.departments:[];state.routes=Array.isArray(state.routes)?state.routes:[];state.parkingBays=Array.isArray(state.parkingBays)?state.parkingBays:[];
  }
  ensureLegacyMasterData(state);
  state.company={...state.company,defaultDepotId:depotIdFromLegacy(state,state.company?.depot||state.company?.defaultDepotId)};
  state.company.depot=depotName(state,state.company.defaultDepotId);
  state.settings={...state.settings,defaultDepotId:depotIdFromLegacy(state,state.settings?.defaultDepot||state.settings?.defaultDepotId)};
  state.settings.defaultDepot=depotName(state,state.settings.defaultDepotId);
  state.energy={...state.energy,depotId:depotIdFromLegacy(state,state.energy?.depotId||state.company.defaultDepotId)};
  (state.depots||[]).forEach(depot=>{
    let policy=(state.depotPolicies||[]).find(item=>item.depotId===depot.id);
    if(!policy){policy={id:`POLICY-${depot.id.replace(/^DEPOT-/,'')}`,depotId:depot.id,smartPriority:state.settings?.smartPriority!==false,peakProtection:state.settings?.peakProtection!==false,energyMode:state.settings?.energyMode||'automatic',peakLimitKw:Math.max(0,Math.min(Number(state.settings?.peakLimitKw||depot.capacityKw),Number(depot.capacityKw))),safetyReserveKw:Number(state.settings?.safetyReserveKw||0),solarPreference:state.settings?.solarPreference!==false,batteryAssist:state.settings?.batteryAssist!==false,priceAmd:Number(state.energy?.priceAmd||78),batteryReservePct:Number(state.energy?.batteryReservePct||25)};state.depotPolicies.push(policy);}
    policy.depotId=depot.id;
  });

  (state.vehicles||[]).forEach(v=>{
    const existingRoute=getRoute(state,v.routeId);
    if(v.route&&existingRoute?.name!==v.route)v.routeId=routeIdFromLegacy(state,v.route);
    else v.routeId=v.routeId||routeIdFromLegacy(state,v.route);
    const route=getRoute(state,v.routeId);
    const existingDepartment=getDepartment(state,v.departmentId);
    if(v.group&&existingDepartment?.name!==v.group)v.departmentId=departmentIdFromLegacy(state,v.group);
    else v.departmentId=v.departmentId||route?.departmentId||departmentIdFromLegacy(state,v.group);
    if(route?.departmentId)v.departmentId=route.departmentId;
    v.depotId=depotIdFromLegacy(state,route?.depotId||v.depot||v.depotId||state.company.defaultDepotId);
    v.route=route?.name||v.route||'Unassigned route';
    const department=getDepartment(state,v.departmentId);
    if(department)v.group=department.name;
    v.connectorTypes=vehicleConnectorTypes(v);
    if(!v.connectorTypes.length)v.connectorTypes=['CCS2'];
    v.connector=v.connectorTypes.join(' + ');
    if(v.connectorTypes.includes('Type 2')&&!Number(v.maxAcKw))v.maxAcKw=22;
    if(v.connectorTypes.includes('CCS2')&&!Number(v.maxDcKw))v.maxDcKw=120;
    v.maxAcKw=Math.max(0,Number(v.maxAcKw||0));
    v.maxDcKw=Math.max(0,Number(v.maxDcKw||0));
    v.capacity=Math.max(1,Number(v.capacity||75));
  });

  (state.chargers||[]).forEach(c=>{
    const seeded=(seed.chargers||[]).find(x=>x.id===c.id);
    const currentBay=getParkingBay(state,c.parkingBayId);
    if(c.bay&&currentBay?.code!==c.bay)c.parkingBayId=bayIdFromLegacy(state,c.bay,c.depotId||seeded?.depotId);
    else c.parkingBayId=c.parkingBayId||bayIdFromLegacy(state,c.bay,c.depotId||seeded?.depotId)||seeded?.parkingBayId||null;
    const bay=getParkingBay(state,c.parkingBayId);
    c.depotId=depotIdFromLegacy(state,bay?.depotId||c.depotId||seeded?.depotId);
    if(c.parkingBayId)c.bay=parkingBayCode(state,c.parkingBayId);
    c.connectors=chargerConnectorOptions(c).map(connector=>({...connector}));
  });

  (state.drivers||[]).forEach(d=>{
    const existingDepartment=getDepartment(state,d.departmentId);
    if(d.department&&existingDepartment?.name!==d.department)d.departmentId=departmentIdFromLegacy(state,d.department);
    else d.departmentId=d.departmentId||departmentIdFromLegacy(state,d.department);
    const department=getDepartment(state,d.departmentId);
    const vehicle=(state.vehicles||[]).find(v=>v.id===d.vehicle);
    d.depotId=depotIdFromLegacy(state,vehicle?.depotId||department?.depotId||d.depotId);
    d.department=department?.name||d.department||'General';
  });

  (state.routes||[]).forEach(r=>{
    r.departmentId=r.departmentId||departmentIdFromLegacy(state,r.department);
    const department=getDepartment(state,r.departmentId);
    r.depotId=depotIdFromLegacy(state,r.depotId||department?.depotId);
  });

  (state.schedules||[]).forEach(x=>{
    const vehicle=(state.vehicles||[]).find(v=>v.id===x.vehicle);
    const existingRoute=getRoute(state,x.routeId);
    if(x.route&&existingRoute?.name!==x.route)x.routeId=routeIdFromLegacy(state,x.route);
    else x.routeId=x.routeId||routeIdFromLegacy(state,x.route)||vehicle?.routeId||null;
    const route=getRoute(state,x.routeId);
    x.depotId=depotIdFromLegacy(state,route?.depotId||vehicle?.depotId||x.depotId);
    x.route=route?.name||x.route||'Unassigned route';
    if(!x.driver)x.driver=(state.drivers||[]).find(d=>d.vehicle===x.vehicle)?.id||'';
    x.serviceDate=x.serviceDate||state.settings?.operationDate||'2026-08-13';
    x.recurrence=x.recurrence||'once';
  });

  (state.sessions||[]).forEach(x=>{
    const charger=(state.chargers||[]).find(c=>c.id===x.charger);
    const vehicle=(state.vehicles||[]).find(v=>v.id===x.vehicle);
    x.depotId=depotIdFromLegacy(state,x.depotId||charger?.depotId||vehicle?.depotId);
    if(charger&&vehicle){
      const selected=(charger.connectors||[]).find(connector=>String(connector.id)===String(x.connectorId))||
        (charger.connectors||[]).find(connector=>connector.type===x.connector)||bestCompatibleConnector(vehicle,charger);
      if(selected){x.connectorId=String(selected.id);x.connector=selected.type;}
    }
  });

  (state.reservations||[]).forEach(r=>{
    const charger=(state.chargers||[]).find(c=>c.id===r.charger);
    const vehicle=(state.vehicles||[]).find(v=>v.id===r.vehicle);
    const locationDepot=getDepot(state,r.location);
    r.depotId=depotIdFromLegacy(state,charger?.depotId||locationDepot?.id||vehicle?.depotId||r.depotId);
    r.location=depotName(state,r.depotId);
    const currentBay=getParkingBay(state,r.parkingBayId);
    if(r.bay&&r.bay!=='Any'&&currentBay?.code!==r.bay)r.parkingBayId=bayIdFromLegacy(state,r.bay,r.depotId);
    else r.parkingBayId=r.parkingBayId||bayIdFromLegacy(state,r.bay,r.depotId)||charger?.parkingBayId||null;
    r.bay=r.parkingBayId?parkingBayCode(state,r.parkingBayId):'Any';
    r.arrivalDate=r.arrivalDate||state.settings?.operationDate||'2026-08-13';
    r.grace=Number(r.grace??15);
    r.assignmentMode=r.assignmentMode||(r.charger==='Auto assign'?(r.parkingBayId?'bay':'auto'):'charger');
  });
  state.reservations=reconcileReservationLifecycle(state.reservations,{date:state.settings?.operationDate||'2026-08-13',time:state.settings?.operationTime||'12:54'});

  (state.reimbursements||[]).forEach(r=>{
    const vehicle=(state.vehicles||[]).find(v=>v.id===r.vehicle);
    r.depotId=depotIdFromLegacy(state,r.depotId||vehicle?.depotId);
  });

  (state.alerts||[]).forEach(a=>{
    if(a.depotId){a.depotId=depotIdFromLegacy(state,a.depotId);return;}
    const text=`${a.title||''} ${a.body||''}`;
    const vehicleId=a.vehicleId||text.match(/AM-\d+/)?.[0];
    const chargerId=a.chargerId||text.match(/(?:DC|AC)-\d+/)?.[0];
    const charger=(state.chargers||[]).find(c=>c.id===chargerId);
    const vehicle=(state.vehicles||[]).find(v=>v.id===vehicleId);
    a.depotId=depotIdFromLegacy(state,charger?.depotId||vehicle?.depotId||state.company.defaultDepotId);
  });

  (state.auditLog||[]).forEach(entry=>{
    if(entry.depotId){entry.depotId=entry.depotId==='*'?'*':depotIdFromLegacy(state,entry.depotId);return;}
    const resource=String(entry.resource||'');
    const vehicleId=resource.match(/AM-\d+/)?.[0];
    const chargerId=resource.match(/(?:DC|AC)-\d+/)?.[0];
    const alertId=resource.match(/AL-\d+/)?.[0];
    const reimbursementId=resource.match(/HR-\d+/)?.[0];
    const vehicle=(state.vehicles||[]).find(v=>v.id===vehicleId);
    const charger=(state.chargers||[]).find(c=>c.id===chargerId);
    const alert=(state.alerts||[]).find(a=>a.id===alertId||a.maintenanceTicket===resource);
    const reimbursement=(state.reimbursements||[]).find(r=>r.id===reimbursementId);
    const targetUser=(state.users||[]).find(u=>u.name===resource||u.email===resource);
    const actor=(state.users||[]).find(u=>u.name===entry.user);
    const targetScope=targetUser?.scopeDepotIds;
    const actorScope=actor?.scopeDepotIds;
    entry.depotId=charger?.depotId||vehicle?.depotId||alert?.depotId||reimbursement?.depotId||
      (Array.isArray(targetScope)&&targetScope.length===1&&targetScope[0]!=='*'?targetScope[0]:null)||
      (Array.isArray(actorScope)&&actorScope.length===1&&actorScope[0]!=='*'?actorScope[0]:'*');
  });

  (state.users||[]).forEach(u=>{
    const validIds=new Set((state.depots||[]).map(depot=>depot.id));
    if(u.__legacyScopeText===true||!Array.isArray(u.scopeDepotIds)||!u.scopeDepotIds.length){
      u.scopeDepotIds=u.scope==='All depots'?['*']:[depotIdFromLegacy(state,u.scope)];
    }else if(!u.scopeDepotIds.includes('*')){
      u.scopeDepotIds=[...new Set(u.scopeDepotIds.filter(id=>validIds.has(id)))];
    }else u.scopeDepotIds=['*'];
    u.scope=u.scopeDepotIds.includes('*')?'All depots':u.scopeDepotIds.map(id=>depotName(state,id)).filter(Boolean).join(', ')||'No depot scope';
    delete u.__legacyScopeText;
  });

  (state.billing?.costCenters||[]).forEach(cc=>{
    const existingDepartment=getDepartment(state,cc.departmentId);
    if(cc.department&&existingDepartment?.name!==cc.department)cc.departmentId=departmentIdFromLegacy(state,cc.department);
    else cc.departmentId=cc.departmentId||departmentIdFromLegacy(state,cc.department);
    cc.department=departmentName(state,cc.departmentId);
  });
  (state.billing?.costCenters||[]).forEach(cc=>{cc.depotId=getDepartment(state,cc.departmentId)?.depotId||cc.depotId||'*';});
  (state.billing?.transactions||[]).forEach(tx=>{
    if(tx.depotId){tx.depotId=tx.depotId==='*'?'*':depotIdFromLegacy(state,tx.depotId);return;}
    const vehicle=(state.vehicles||[]).find(v=>v.id===tx.vehicle);
    const session=(state.sessions||[]).find(x=>x.id===tx.reference);
    const reimbursement=(state.reimbursements||[]).find(x=>x.id===tx.reference);
    const costCenter=(state.billing?.costCenters||[]).find(x=>x.name===tx.costCenter||x.id===tx.costCenterId);
    tx.depotId=vehicle?.depotId||session?.depotId||reimbursement?.depotId||costCenter?.depotId||'*';
  });

  // Keep Charger ↔ Parking Bay references canonical while still allowing parking-only bays.
  (state.chargers||[]).forEach(charger=>{
    if(!charger.parkingBayId)return;
    (state.parkingBays||[]).forEach(bay=>{
      if(bay.chargerId===charger.id&&bay.id!==charger.parkingBayId){
        bay.chargerId=null;
        if(bay.type==='charging')bay.type='parking';
        if(bay.vehicleId===charger.vehicle)bay.vehicleId=null;
        if(['occupied','blocked'].includes(bay.status))bay.status='available';
      }
    });
    const bay=getParkingBay(state,charger.parkingBayId);
    if(bay){bay.chargerId=charger.id;bay.type='charging';bay.depotId=charger.depotId;}
  });

  // Synchronize parking occupancy from charger assignment without forcing a 1:1 model.
  (state.sessions||[]).forEach(x=>{x.date=x.date||state.settings?.operationDate||'2026-08-13';});
  (state.chargerUsageHistory||[]).forEach(x=>{x.depotId=depotIdFromLegacy(state,x.depotId);});
  (state.parkingUsageHistory||[]).forEach(x=>{x.depotId=depotIdFromLegacy(state,x.depotId);});
  (state.energyHistory||[]).forEach(x=>{x.depotId=depotIdFromLegacy(state,x.depotId);});
  (state.departureHistory||[]).forEach(x=>{x.depotId=depotIdFromLegacy(state,x.depotId);});
  (state.maintenanceTickets||[]).forEach(x=>{x.depotId=depotIdFromLegacy(state,x.depotId);});

  (state.parkingBays||[]).forEach(b=>{
    const charger=b.chargerId?(state.chargers||[]).find(c=>c.id===b.chargerId):null;
    if(charger){
      b.vehicleId=charger.vehicle||null;
      if(charger.status==='busy')b.status='occupied';
      else if(charger.status==='reserved')b.status='reserved';
      else if(['faulty','maintenance','offline','disabled'].includes(charger.status))b.status='blocked';
      else if(!b.vehicleId)b.status='available';
    }
  });
  return state;
}

function buildFullState(){
  try{
    const raw=localStorage.getItem(KEY);
    const v=raw?JSON.parse(raw):null;
    const fresh=structuredClone(seed);
    if(!v)return migrateCanonicalModel(fresh);
    const billing={...fresh.billing,...(v.billing||{})};
    billing.paymentMethods=mergeById(fresh.billing.paymentMethods,v.billing?.paymentMethods);
    billing.costCenters=mergeById(fresh.billing.costCenters,v.billing?.costCenters);
    billing.transactions=mergeById(fresh.billing.transactions,v.billing?.transactions);
    const fleetPlan={...fresh.fleetPlan,...(v.fleetPlan||{})};
    fleetPlan.history=Array.isArray(v.fleetPlan?.history)?v.fleetPlan.history:fresh.fleetPlan.history;
    const auditLog=Array.isArray(v.auditLog)?v.auditLog:fresh.auditLog;
    const users=mergeById(fresh.users,v.users);
    users.forEach(user=>{const saved=(v.users||[]).find(item=>item.id===user.id);if(saved&&!Array.isArray(saved.scopeDepotIds))user.__legacyScopeText=true;});
    const merged={
      ...fresh,...v,
      company:{...fresh.company,...(v.company||{})},
      energy:{...fresh.energy,...(v.energy||{})},
      depots:mergeById(fresh.depots,v.depots),depotPolicies:mergeById(fresh.depotPolicies,v.depotPolicies),departments:mergeById(fresh.departments,v.departments),routes:mergeById(fresh.routes,v.routes),parkingBays:mergeById(fresh.parkingBays,v.parkingBays),
      vehicles:mergeById(fresh.vehicles,v.vehicles),chargers:mergeById(fresh.chargers,v.chargers),drivers:mergeById(fresh.drivers,v.drivers),schedules:mergeById(fresh.schedules,v.schedules),sessions:mergeById(fresh.sessions,v.sessions),reservations:mergeById(fresh.reservations,v.reservations),alerts:mergeById(fresh.alerts,v.alerts),
      chargerUsageHistory:mergeById(fresh.chargerUsageHistory,v.chargerUsageHistory),parkingUsageHistory:mergeById(fresh.parkingUsageHistory,v.parkingUsageHistory),energyHistory:mergeById(fresh.energyHistory,v.energyHistory),departureHistory:mergeById(fresh.departureHistory,v.departureHistory),maintenanceTickets:mergeById(fresh.maintenanceTickets,v.maintenanceTickets),
      billing,fleetPlan,invoices:mergeById(fresh.invoices,v.invoices),users,roles:mergeRoles(fresh.roles,v.roles),reimbursements:mergeById(fresh.reimbursements,v.reimbursements),auditLog,settings:{...fresh.settings,...(v.settings||{})}
    };
    return migrateCanonicalModel(merged);
  }catch(error){
    console.error('[VoltDrive State] Failed to load saved prototype state',error);
    return migrateCanonicalModel(structuredClone(seed));
  }
}

export function validateFleetDataModel(state=buildFullState()){
  const issues=[];
  const depots=new Set((state.depots||[]).map(x=>x.id));
  (state.depotPolicies||[]).forEach(x=>{if(!depots.has(x.depotId))issues.push({code:'DEPOT_POLICY_DEPOT_MISSING',entityId:x.id,message:`Depot policy ${x.id} references missing depot ${x.depotId}`});});
  const departments=new Set((state.departments||[]).map(x=>x.id));
  const routes=new Map((state.routes||[]).map(x=>[x.id,x]));
  const bays=new Map((state.parkingBays||[]).map(x=>[x.id,x]));
  const vehicles=new Map((state.vehicles||[]).map(x=>[x.id,x]));
  const chargers=new Map((state.chargers||[]).map(x=>[x.id,x]));
  const drivers=new Set((state.drivers||[]).map(x=>x.id));
  const push=(code,entityId,message)=>issues.push({code,entityId,message});
  (state.departments||[]).forEach(x=>{if(!depots.has(x.depotId))push('DEPARTMENT_DEPOT_MISSING',x.id,`Department ${x.id} references missing depot ${x.depotId}`);});
  (state.routes||[]).forEach(x=>{
    if(!depots.has(x.depotId))push('ROUTE_DEPOT_MISSING',x.id,`Route ${x.id} references missing depot ${x.depotId}`);
    if(!departments.has(x.departmentId))push('ROUTE_DEPARTMENT_MISSING',x.id,`Route ${x.id} references missing department ${x.departmentId}`);
    const department=getDepartment(state,x.departmentId);if(department&&department.depotId!==x.depotId)push('ROUTE_DEPARTMENT_DEPOT_MISMATCH',x.id,`Route ${x.id} and department ${department.id} belong to different depots`);
  });
  (state.parkingBays||[]).forEach(x=>{
    if(!depots.has(x.depotId))push('BAY_DEPOT_MISSING',x.id,`Parking bay ${x.id} references missing depot ${x.depotId}`);
    if(x.chargerId&&!chargers.has(x.chargerId))push('BAY_CHARGER_MISSING',x.id,`Parking bay ${x.id} references missing charger ${x.chargerId}`);
    const charger=chargers.get(x.chargerId);if(charger&&charger.depotId!==x.depotId)push('BAY_CHARGER_DEPOT_MISMATCH',x.id,`Parking bay ${x.id} and charger ${charger.id} belong to different depots`);
    if(charger&&charger.parkingBayId&&charger.parkingBayId!==x.id)push('BAY_CHARGER_BACKREF_MISMATCH',x.id,`Parking bay ${x.id} links to ${charger.id}, but charger links to ${charger.parkingBayId}`);
  });
  (state.vehicles||[]).forEach(x=>{
    if(!depots.has(x.depotId))push('VEHICLE_DEPOT_MISSING',x.id,`Vehicle ${x.id} references missing depot ${x.depotId}`);
    if(x.departmentId&&!departments.has(x.departmentId))push('VEHICLE_DEPARTMENT_MISSING',x.id,`Vehicle ${x.id} references missing department ${x.departmentId}`);
    if(x.routeId&&!routes.has(x.routeId))push('VEHICLE_ROUTE_MISSING',x.id,`Vehicle ${x.id} references missing route ${x.routeId}`);
    const route=routes.get(x.routeId);if(route&&route.depotId!==x.depotId)push('VEHICLE_ROUTE_DEPOT_MISMATCH',x.id,`Vehicle ${x.id} and route ${route.id} belong to different depots`);if(route&&x.departmentId&&route.departmentId!==x.departmentId)push('VEHICLE_ROUTE_DEPARTMENT_MISMATCH',x.id,`Vehicle ${x.id} department does not match route ${route.id}`);
    if(!vehicleConnectorTypes(x).length)push('VEHICLE_CONNECTOR_PROFILE_MISSING',x.id,`Vehicle ${x.id} has no compatible connector types`);
    if(x.charger&&x.charger!=='—'){const assigned=chargers.get(x.charger);if(assigned&&!chargerSupportsVehicle(x,assigned))push('VEHICLE_CHARGER_INCOMPATIBLE',x.id,`Vehicle ${x.id} is assigned to incompatible charger ${assigned.id}`);}
  });
  (state.chargers||[]).forEach(x=>{
    if(!depots.has(x.depotId))push('CHARGER_DEPOT_MISSING',x.id,`Charger ${x.id} references missing depot ${x.depotId}`);
    if(x.parkingBayId&&!bays.has(x.parkingBayId))push('CHARGER_BAY_MISSING',x.id,`Charger ${x.id} references missing parking bay ${x.parkingBayId}`);
    const bay=bays.get(x.parkingBayId);if(bay&&bay.depotId!==x.depotId)push('CHARGER_BAY_DEPOT_MISMATCH',x.id,`Charger ${x.id} and bay ${bay.id} belong to different depots`);if(bay&&bay.chargerId&&bay.chargerId!==x.id)push('CHARGER_BAY_BACKREF_MISMATCH',x.id,`Charger ${x.id} links to ${bay.id}, but bay links to ${bay.chargerId}`);
    if(!chargerConnectorOptions(x).length)push('CHARGER_CONNECTOR_PROFILE_MISSING',x.id,`Charger ${x.id} has no connector profile`);
    const assignedVehicle=vehicles.get(x.vehicle);if(assignedVehicle&&!chargerSupportsVehicle(assignedVehicle,x))push('CHARGER_VEHICLE_INCOMPATIBLE',x.id,`Charger ${x.id} is assigned to incompatible vehicle ${assignedVehicle.id}`);
  });
  (state.drivers||[]).forEach(x=>{
    if(!depots.has(x.depotId))push('DRIVER_DEPOT_MISSING',x.id,`Driver ${x.id} references missing depot ${x.depotId}`);
    if(!departments.has(x.departmentId))push('DRIVER_DEPARTMENT_MISSING',x.id,`Driver ${x.id} references missing department ${x.departmentId}`);
    if(x.vehicle&&!vehicles.has(x.vehicle))push('DRIVER_VEHICLE_MISSING',x.id,`Driver ${x.id} references missing vehicle ${x.vehicle}`);
    const department=getDepartment(state,x.departmentId);if(department&&department.depotId!==x.depotId)push('DRIVER_DEPARTMENT_DEPOT_MISMATCH',x.id,`Driver ${x.id} and department ${department.id} belong to different depots`);const vehicle=vehicles.get(x.vehicle);if(vehicle&&vehicle.depotId!==x.depotId)push('DRIVER_VEHICLE_DEPOT_MISMATCH',x.id,`Driver ${x.id} and vehicle ${vehicle.id} belong to different depots`);
  });
  (state.schedules||[]).forEach(x=>{
    if(!depots.has(x.depotId))push('SCHEDULE_DEPOT_MISSING',x.id,`Schedule ${x.id} references missing depot ${x.depotId}`);
    if(x.routeId&&!routes.has(x.routeId))push('SCHEDULE_ROUTE_MISSING',x.id,`Schedule ${x.id} references missing route ${x.routeId}`);
    if(!vehicles.has(x.vehicle))push('SCHEDULE_VEHICLE_MISSING',x.id,`Schedule ${x.id} references missing vehicle ${x.vehicle}`);
    if(x.driver&&!drivers.has(x.driver))push('SCHEDULE_DRIVER_MISSING',x.id,`Schedule ${x.id} references missing driver ${x.driver}`);
    const route=routes.get(x.routeId);if(route&&route.depotId!==x.depotId)push('SCHEDULE_ROUTE_DEPOT_MISMATCH',x.id,`Schedule ${x.id} and route ${route.id} belong to different depots`);const vehicle=vehicles.get(x.vehicle);if(vehicle&&vehicle.depotId!==x.depotId)push('SCHEDULE_VEHICLE_DEPOT_MISMATCH',x.id,`Schedule ${x.id} and vehicle ${vehicle.id} belong to different depots`);
  });
  (state.sessions||[]).forEach(x=>{
    const vehicle=vehicles.get(x.vehicle),charger=chargers.get(x.charger);
    if(x.vehicle&&!vehicle)push('SESSION_VEHICLE_MISSING',x.id,`Session ${x.id} references missing vehicle ${x.vehicle}`);
    if(x.charger&&!charger)push('SESSION_CHARGER_MISSING',x.id,`Session ${x.id} references missing charger ${x.charger}`);
    if(vehicle&&charger&&!chargerSupportsVehicle(vehicle,charger,{ignoreDepot:true,ignoreChargerStatus:true}))push('SESSION_CHARGER_INCOMPATIBLE',x.id,`Session ${x.id} links ${vehicle.id} to incompatible charger ${charger.id}`);
    if(charger&&x.connectorId&&!chargerConnectorOptions(charger).some(connector=>String(connector.id)===String(x.connectorId)))push('SESSION_CONNECTOR_MISSING',x.id,`Session ${x.id} references missing connector ${x.connectorId} on ${charger.id}`);
  });
  (state.reservations||[]).forEach(x=>{
    if(!depots.has(x.depotId))push('RESERVATION_DEPOT_MISSING',x.id,`Reservation ${x.id} references missing depot ${x.depotId}`);
    if(x.parkingBayId&&!bays.has(x.parkingBayId))push('RESERVATION_BAY_MISSING',x.id,`Reservation ${x.id} references missing parking bay ${x.parkingBayId}`);
    if(x.charger&&x.charger!=='Auto assign'&&!chargers.has(x.charger))push('RESERVATION_CHARGER_MISSING',x.id,`Reservation ${x.id} references missing charger ${x.charger}`);
    const bay=bays.get(x.parkingBayId);if(bay&&bay.depotId!==x.depotId)push('RESERVATION_BAY_DEPOT_MISMATCH',x.id,`Reservation ${x.id} and parking bay ${bay.id} belong to different depots`);const charger=chargers.get(x.charger);if(charger&&charger.depotId!==x.depotId)push('RESERVATION_CHARGER_DEPOT_MISMATCH',x.id,`Reservation ${x.id} and charger ${charger.id} belong to different depots`);const vehicle=vehicles.get(x.vehicle);if(vehicle&&vehicle.depotId!==x.depotId)push('RESERVATION_VEHICLE_DEPOT_MISMATCH',x.id,`Reservation ${x.id} and vehicle ${vehicle.id} belong to different depots`);
    if(charger&&vehicle&&!chargerSupportsVehicle(vehicle,charger))push('RESERVATION_CHARGER_INCOMPATIBLE',x.id,`Reservation ${x.id} assigns ${vehicle.id} to incompatible charger ${charger.id}`);
    if(x.assignmentMode==='bay'&&bay?.chargerId&&vehicle){const bayCharger=chargers.get(bay.chargerId);if(bayCharger&&!chargerSupportsVehicle(vehicle,bayCharger))push('RESERVATION_BAY_CHARGER_INCOMPATIBLE',x.id,`Reservation ${x.id} uses bay ${bay.id} with incompatible charger ${bayCharger.id}`);}
  });
  (state.chargerUsageHistory||[]).forEach(x=>{if(!depots.has(x.depotId))push('CHARGER_USAGE_DEPOT_MISSING',x.id,`Charger usage ${x.id} references missing depot ${x.depotId}`);if(!chargers.has(x.chargerId))push('CHARGER_USAGE_CHARGER_MISSING',x.id,`Charger usage ${x.id} references missing charger ${x.chargerId}`);});
  (state.parkingUsageHistory||[]).forEach(x=>{if(!depots.has(x.depotId))push('PARKING_USAGE_DEPOT_MISSING',x.id,`Parking usage ${x.id} references missing depot ${x.depotId}`);if(!bays.has(x.parkingBayId))push('PARKING_USAGE_BAY_MISSING',x.id,`Parking usage ${x.id} references missing bay ${x.parkingBayId}`);});
  (state.energyHistory||[]).forEach(x=>{if(!depots.has(x.depotId))push('ENERGY_HISTORY_DEPOT_MISSING',x.id,`Energy history ${x.id} references missing depot ${x.depotId}`);});
  (state.departureHistory||[]).forEach(x=>{if(!depots.has(x.depotId))push('DEPARTURE_HISTORY_DEPOT_MISSING',x.id,`Departure history ${x.id} references missing depot ${x.depotId}`);if(!vehicles.has(x.vehicle))push('DEPARTURE_HISTORY_VEHICLE_MISSING',x.id,`Departure history ${x.id} references missing vehicle ${x.vehicle}`);if(x.driver&&!drivers.has(x.driver))push('DEPARTURE_HISTORY_DRIVER_MISSING',x.id,`Departure history ${x.id} references missing driver ${x.driver}`);});
  (state.maintenanceTickets||[]).forEach(x=>{if(!depots.has(x.depotId))push('MAINTENANCE_DEPOT_MISSING',x.id,`Maintenance ticket ${x.id} references missing depot ${x.depotId}`);if(x.chargerId&&!chargers.has(x.chargerId))push('MAINTENANCE_CHARGER_MISSING',x.id,`Maintenance ticket ${x.id} references missing charger ${x.chargerId}`);});
  return issues;
}

export function getCurrentAccessUserId(){return localStorage.getItem(ACCESS_USER_KEY)||'USR-01';}
export function setCurrentAccessUserId(id){if(id)localStorage.setItem(ACCESS_USER_KEY,id);else localStorage.removeItem(ACCESS_USER_KEY);}
export function getPrototypeAccessDirectory(){
  const full=buildFullState();
  return {
    users:structuredClone((full.users||[]).filter(user=>user.status==='active')),
    roles:structuredClone(full.roles||[])
  };
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
  // Canonical scope is ID-only. Legacy text is migrated before this function is called.
  const rawScope=Array.isArray(user?.scopeDepotIds)?user.scopeDepotIds:[];
  const validDepotIds=new Set((state?.depots||[]).map(depot=>depot.id));
  const scopeDepotIds=rawScope.includes('*')?['*']:[...new Set(rawScope.filter(id=>validDepotIds.has(id)))];
  const scope=scopeDepotIds.includes('*')?'All depots':scopeDepotIds.map(id=>depotName(state,id)).filter(Boolean).join(', ')||'No depot scope';
  const allDepots=scopeDepotIds.includes('*');
  const canAccessDepot=depotId=>allDepots||Boolean(depotId&&scopeDepotIds.includes(depotId));
  return {user,role,permissions,scope,scopeDepotIds,allDepots,canAccessDepot,can,canAny:(...items)=>items.flat().some(can)};
}

function entityDepotId(item,kind){
  if(!item)return null;
  if(kind==='auditLog')return item.depotId||null;
  return item.depotId||null;
}
function isInScope(state,item,kind,scopeDepotIds){
  if(scopeDepotIds?.includes('*'))return true;
  const depotId=entityDepotId(item,kind);
  return Boolean(depotId&&scopeDepotIds?.includes(depotId));
}
function userIsInScope(user,scopeDepotIds){
  if(scopeDepotIds?.includes('*'))return true;
  const target=Array.isArray(user?.scopeDepotIds)?user.scopeDepotIds:[];
  if(!target.length||target.includes('*'))return false;
  return target.every(id=>scopeDepotIds?.includes(id));
}
export function isUserInAccessScope(state,user,access=getAccessContext(state)){return userIsInScope(user,access.scopeDepotIds);}
export function canAssignDepotScope(state,targetScopeDepotIds,access=getAccessContext(state)){
  const target=Array.isArray(targetScopeDepotIds)?targetScopeDepotIds:[];
  if(!target.length)return false;
  if(access.allDepots)return true;
  return !target.includes('*')&&target.every(id=>access.scopeDepotIds.includes(id));
}
export function canDelegateRole(state,roleId,access=getAccessContext(state)){
  const role=(state?.roles||[]).find(item=>item.id===roleId);if(!role||!access.role)return false;
  if(role.id==='ROLE-ADMIN'&&access.role.id!=='ROLE-ADMIN')return false;
  if((role.permissions||[]).some(permission=>permission==='users.manage'||permission==='roles.manage')&&!access.can('roles.manage'))return false;
  return (role.permissions||[]).every(permission=>access.can(permission));
}
function applyAccessScope(full){
  const ctx=getAccessContext(full);
  if(!ctx.user||ctx.allDepots)return full;
  const primaryDepotId=ctx.scopeDepotIds[0]||null;
  const primaryDepot=getDepot(full,primaryDepotId);
  const policy=(full.depotPolicies||[]).find(item=>item.depotId===primaryDepotId)||{};
  const scoped={...full,company:{...full.company,depot:primaryDepot?.name||ctx.scope,defaultDepotId:primaryDepotId},
    settings:{...full.settings,smartPriority:policy.smartPriority??full.settings.smartPriority,peakProtection:policy.peakProtection??full.settings.peakProtection,energyMode:policy.energyMode||full.settings.energyMode,peakLimitKw:policy.peakLimitKw??full.settings.peakLimitKw,safetyReserveKw:policy.safetyReserveKw??full.settings.safetyReserveKw,solarPreference:policy.solarPreference??full.settings.solarPreference,batteryAssist:policy.batteryAssist??full.settings.batteryAssist},
    energy:{...full.energy,depotId:primaryDepotId,strategyMode:(policy.energyMode||full.settings.energyMode)==='manual'?'manual':'auto',peakLimitKw:policy.peakLimitKw??full.energy.peakLimitKw,reserveKw:policy.safetyReserveKw??full.energy.reserveKw,solarEnabled:policy.solarPreference??full.energy.solarEnabled,batteryAssist:policy.batteryAssist??full.energy.batteryAssist,priceAmd:policy.priceAmd??full.energy.priceAmd,batteryReservePct:policy.batteryReservePct??full.energy.batteryReservePct}};
  SCOPED_COLLECTIONS.forEach(kind=>{scoped[kind]=(full[kind]||[]).filter(item=>isInScope(full,item,kind,ctx.scopeDepotIds));});
  scoped.users=(full.users||[]).filter(user=>userIsInScope(user,ctx.scopeDepotIds));
  scoped.depots=(full.depots||[]).filter(depot=>ctx.scopeDepotIds.includes(depot.id));
  scoped.depotPolicies=(full.depotPolicies||[]).filter(policy=>ctx.scopeDepotIds.includes(policy.depotId));
  scoped.departments=(full.departments||[]).filter(department=>ctx.scopeDepotIds.includes(department.depotId));
  scoped.billing={...full.billing,
    costCenters:(full.billing?.costCenters||[]).filter(item=>ctx.scopeDepotIds.includes(item.depotId)),
    transactions:(full.billing?.transactions||[]).filter(item=>ctx.scopeDepotIds.includes(item.depotId))
  };
  scoped.invoices=[];
  const activePower=(scoped.vehicles||[]).reduce((sum,vehicle)=>sum+Number(vehicle.power||0),0);
  scoped.energy.capacityKw=primaryDepot?.capacityKw||0;
  scoped.energy.currentKw=Math.min(scoped.energy.capacityKw,Math.round(activePower+Number(primaryDepot?.baseLoadKw||0)));
  scoped.energy.solarKw=primaryDepot?.solarKw??0;
  scoped.energy.siteBatteryPct=primaryDepot?.siteBatteryPct??0;
  return scoped;
}

function mergeScopedCollection(full,submitted,kind,scopeDepotIds){
  const original=full[kind]||[];
  const submittedList=Array.isArray(submitted)?submitted:[];
  const allowedIds=new Set(original.filter(item=>isInScope(full,item,kind,scopeDepotIds)).map(item=>item.id));
  const outside=original.filter(item=>!allowedIds.has(item.id));
  const originalById=new Map(original.map(item=>[item.id,item]));
  const accepted=[];
  submittedList.forEach(item=>{
    const existed=originalById.get(item.id);
    if(existed&&!allowedIds.has(item.id))return; // never mutate an entity that was outside scope before the edit
    if(!isInScope(full,item,kind,scopeDepotIds)){if(existed&&allowedIds.has(item.id))accepted.push(existed);return;}
    accepted.push(item);
  });
  return outside.concat(accepted);
}

export function loadState(){return applyAccessScope(buildFullState());}
export function saveState(s){
  const full=buildFullState();
  const ctx=getAccessContext(full);
  const fullScope=!ctx.user||ctx.allDepots;
  const normalized=migrateCanonicalModel(structuredClone(s),{mergeMasters:fullScope});
  if(fullScope){
    if(ctx.can('users.manage')){
      const originalById=new Map((full.users||[]).map(user=>[user.id,user]));
      normalized.users=(normalized.users||[]).map(user=>canDelegateRole(full,user.role,ctx)?user:(originalById.get(user.id)||user));
    }else normalized.users=full.users;
    if(!(ctx.can('roles.manage')&&ctx.allDepots))normalized.roles=full.roles;
    if(!ctx.can('settings.manage')){normalized.settings=full.settings;normalized.company=full.company;normalized.depots=full.depots;normalized.departments=full.departments;}
    localStorage.setItem(KEY,JSON.stringify(normalized));return;
  }
  const merged={...full,...normalized,company:{...full.company},energy:{...full.energy},billing:{...full.billing},fleetPlan:{...full.fleetPlan},invoices:full.invoices,settings:{...full.settings},depotPolicies:full.depotPolicies};
  SCOPED_COLLECTIONS.forEach(kind=>{merged[kind]=mergeScopedCollection(full,normalized[kind],kind,ctx.scopeDepotIds);});
  const originalTransactions=full.billing?.transactions||[];
  const allowedTxIds=new Set(originalTransactions.filter(tx=>ctx.scopeDepotIds.includes(tx.depotId)).map(tx=>tx.id));
  const outsideTransactions=originalTransactions.filter(tx=>!allowedTxIds.has(tx.id));
  const acceptedTransactions=[];const originalTxById=new Map(originalTransactions.map(tx=>[tx.id,tx]));
  (normalized.billing?.transactions||[]).forEach(tx=>{
    const existed=originalTxById.get(tx.id);if(existed&&!allowedTxIds.has(tx.id))return;
    if(!ctx.scopeDepotIds.includes(tx.depotId)){if(existed&&allowedTxIds.has(tx.id))acceptedTransactions.push(existed);return;}
    acceptedTransactions.push(tx);
  });
  merged.billing={...full.billing,transactions:outsideTransactions.concat(acceptedTransactions),costCenters:full.billing?.costCenters||[]};
  if(ctx.can('energy.manage')&&ctx.scopeDepotIds.length===1){
    const depotId=ctx.scopeDepotIds[0];const policies=structuredClone(full.depotPolicies||[]);let policy=policies.find(item=>item.depotId===depotId);
    if(policy){Object.assign(policy,{smartPriority:normalized.settings?.smartPriority!==false,peakProtection:normalized.settings?.peakProtection!==false,energyMode:normalized.settings?.energyMode||((normalized.energy?.strategyMode==='manual')?'manual':'automatic'),peakLimitKw:Number(normalized.settings?.peakLimitKw??normalized.energy?.peakLimitKw??policy.peakLimitKw),safetyReserveKw:Number(normalized.settings?.safetyReserveKw??normalized.energy?.reserveKw??policy.safetyReserveKw),solarPreference:normalized.settings?.solarPreference!==false,batteryAssist:normalized.settings?.batteryAssist!==false,priceAmd:Number(normalized.energy?.priceAmd??policy.priceAmd),batteryReservePct:Number(normalized.energy?.batteryReservePct??policy.batteryReservePct)});}
    merged.depotPolicies=policies;
  }
  // User administration is depot-scoped; broader users can never be mutated by a narrower administrator.
  if(ctx.can('users.manage')){
    const allowedIds=new Set((full.users||[]).filter(user=>userIsInScope(user,ctx.scopeDepotIds)).map(user=>user.id));
    const outside=(full.users||[]).filter(user=>!allowedIds.has(user.id));
    const originalById=new Map((full.users||[]).map(user=>[user.id,user]));
    const accepted=[];
    (normalized.users||[]).forEach(user=>{
      const existed=originalById.get(user.id);
      if(existed&&!allowedIds.has(user.id))return;
      if(!userIsInScope(user,ctx.scopeDepotIds)){if(existed&&allowedIds.has(user.id))accepted.push(existed);return;}
      if(!canDelegateRole(full,user.role,ctx)){if(existed)accepted.push(existed);return;}
      accepted.push(user);
    });
    merged.users=outside.concat(accepted);
  }else merged.users=full.users;
  // Roles are company-wide master data. Only an all-depot role administrator can mutate them.
  merged.roles=ctx.can('roles.manage')&&ctx.allDepots?normalized.roles:full.roles;
  // Depot/company structure and global settings cannot be rewritten from a narrowed scope.
  merged.depots=full.depots;merged.departments=full.departments;
  localStorage.setItem(KEY,JSON.stringify(migrateCanonicalModel(merged)));
}
export function resetState(){localStorage.removeItem(KEY);return loadState();}
export function statusLabel(s){return ({charging:'Charging',ready:'Ready',risk:'At risk',queued:'Queued',busy:'Busy',available:'Available',faulty:'Faulty',reserved:'Reserved',occupied:'Occupied',blocked:'Blocked'})[s]||s;}
