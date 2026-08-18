const HARD_CHARGER_STATUSES=new Set(['faulty','maintenance','offline','disabled']);
const HARD_CONNECTOR_STATUSES=new Set(['faulty','maintenance','offline','disabled']);

export function normalizeConnectorType(value){
  const raw=String(value||'').trim().toLowerCase().replace(/[_-]+/g,' ').replace(/\s+/g,' ');
  if(!raw)return'';
  if(raw==='ccs2'||raw==='ccs 2'||raw==='combo 2'||raw==='ccs combo 2')return'CCS2';
  if(raw==='type 2'||raw==='type2'||raw==='mennekes')return'Type 2';
  if(raw==='chademo'||raw==='cha demo')return'CHAdeMO';
  return String(value||'').trim();
}
export function connectorFamily(type){
  const normalized=normalizeConnectorType(type);
  if(normalized==='Type 2')return'AC';
  if(normalized==='CCS2'||normalized==='CHAdeMO')return'DC';
  return'';
}
export function vehicleConnectorTypes(vehicle){
  if(Array.isArray(vehicle?.connectorTypes)&&vehicle.connectorTypes.length){
    return [...new Set(vehicle.connectorTypes.map(normalizeConnectorType).filter(Boolean))];
  }
  return [...new Set(String(vehicle?.connector||'').split(/\s*\+\s*|\s*,\s*|\s*\/\s*/).map(normalizeConnectorType).filter(Boolean))];
}
export function chargerConnectorOptions(charger,{includeUnavailable=true}={}){
  const fallbackType=charger?.type==='AC'?'Type 2':charger?.type==='DC'?'CCS2':'';
  const raw=Array.isArray(charger?.connectors)&&charger.connectors.length?charger.connectors:[{id:'1',type:fallbackType,power:Number(charger?.power||0),status:charger?.status||'available'}];
  return raw.map((connector,index)=>({
    id:String(connector.id??index+1),
    type:normalizeConnectorType(connector.type||fallbackType),
    power:Number(connector.power||charger?.power||0),
    status:String(connector.status||charger?.status||'available').toLowerCase()
  })).filter(connector=>connector.type&&(includeUnavailable||!HARD_CONNECTOR_STATUSES.has(connector.status)));
}
export function vehicleMaxPowerForConnector(vehicle,connectorType){
  const family=connectorFamily(connectorType);
  if(family==='AC')return Math.max(0,Number(vehicle?.maxAcKw??vehicle?.maxChargePowerKw??0));
  if(family==='DC')return Math.max(0,Number(vehicle?.maxDcKw??vehicle?.maxChargePowerKw??0));
  return Math.max(0,Number(vehicle?.maxChargePowerKw||0));
}
export function compatibleConnectorOptions(vehicle,charger,{includeUnavailable=true}={}){
  const supported=new Set(vehicleConnectorTypes(vehicle));
  if(!supported.size)return[];
  return chargerConnectorOptions(charger,{includeUnavailable}).filter(connector=>supported.has(connector.type)).map(connector=>{
    const vehicleLimit=vehicleMaxPowerForConnector(vehicle,connector.type);
    const deliverableKw=Math.max(0,Math.min(Number(connector.power||0),vehicleLimit>0?vehicleLimit:Number(connector.power||0)));
    return {...connector,vehicleLimitKw:vehicleLimit||null,deliverableKw};
  }).filter(connector=>connector.deliverableKw>0);
}
export function chargerSupportsVehicle(vehicle,charger,{includeUnavailable=true,ignoreDepot=false,ignoreChargerStatus=false}={}){
  if(!vehicle||!charger)return false;
  if(!ignoreDepot&&vehicle.depotId&&charger.depotId&&vehicle.depotId!==charger.depotId)return false;
  if(!ignoreChargerStatus&&HARD_CHARGER_STATUSES.has(String(charger.status||'').toLowerCase()))return false;
  return compatibleConnectorOptions(vehicle,charger,{includeUnavailable}).length>0;
}
export function bestCompatibleConnector(vehicle,charger,{includeUnavailable=true}={}){
  return compatibleConnectorOptions(vehicle,charger,{includeUnavailable}).sort((a,b)=>b.deliverableKw-a.deliverableKw||Number(b.power)-Number(a.power))[0]||null;
}
export function deliverablePowerKw(vehicle,charger){
  return Number(bestCompatibleConnector(vehicle,charger)?.deliverableKw||0);
}
export function chargerAvailableForLiveAssignment(vehicle,charger){
  if(!chargerSupportsVehicle(vehicle,charger,{includeUnavailable:false}))return false;
  const status=String(charger.status||'').toLowerCase();
  if(status==='available')return true;
  return Boolean(charger.vehicle&&charger.vehicle===vehicle?.id&&['busy','reserved'].includes(status));
}
export function compatibleChargersForVehicle(vehicle,chargers,{live=false}={}){
  return (chargers||[]).filter(charger=>live?chargerAvailableForLiveAssignment(vehicle,charger):chargerSupportsVehicle(vehicle,charger)).sort((a,b)=>{
    const powerDelta=deliverablePowerKw(vehicle,b)-deliverablePowerKw(vehicle,a);
    if(powerDelta)return powerDelta;
    return Number(b.health||0)-Number(a.health||0);
  });
}
export function compatibilitySummary(vehicle,charger){
  if(!vehicle||!charger)return{compatible:false,reason:'Vehicle or charger is missing',connector:null,deliverableKw:0};
  if(vehicle.depotId&&charger.depotId&&vehicle.depotId!==charger.depotId)return{compatible:false,reason:'Charger belongs to another depot',connector:null,deliverableKw:0};
  if(HARD_CHARGER_STATUSES.has(String(charger.status||'').toLowerCase()))return{compatible:false,reason:`Charger is ${charger.status}`,connector:null,deliverableKw:0};
  const connector=bestCompatibleConnector(vehicle,charger);
  if(!connector){
    const vehicleTypes=vehicleConnectorTypes(vehicle).join(', ')||'No connector profile';
    const chargerTypes=[...new Set(chargerConnectorOptions(charger).map(item=>item.type))].join(', ')||'No connector';
    return{compatible:false,reason:`Vehicle supports ${vehicleTypes}; charger provides ${chargerTypes}`,connector:null,deliverableKw:0};
  }
  return{compatible:true,reason:`${connector.type} · up to ${connector.deliverableKw} kW for this vehicle`,connector,deliverableKw:connector.deliverableKw};
}
export function connectorLabelList(vehicle){return vehicleConnectorTypes(vehicle).join(' + ')||'Not configured';}
