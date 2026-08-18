function byId(list,id){return (list||[]).find(item=>String(item?.id)===String(id))||null;}
function idNumber(value){const n=Number(String(value||'').replace(/\D/g,''));return Number.isFinite(n)?n:0;}
function prefer(list,rank){return [...(list||[])].sort((a,b)=>(rank[a?.status]??99)-(rank[b?.status]??99)||idNumber(b?.id)-idNumber(a?.id))[0]||null;}

export function contextUrl(page,params={}){
  const query=new URLSearchParams();
  Object.entries(params).forEach(([key,value])=>{if(value!==undefined&&value!==null&&String(value)!==''&&String(value)!=='—')query.set(key,String(value));});
  const qs=query.toString();
  return `./${page}${qs?`?${qs}`:''}`;
}

export function vehicleContext(state,vehicleId){
  const vehicle=byId(state?.vehicles,vehicleId);
  if(!vehicle)return {vehicle:null,driver:null,schedule:null,reservation:null,session:null,charger:null};
  const driver=(state.drivers||[]).find(item=>item.vehicle===vehicle.id)||null;
  const schedule=prefer((state.schedules||[]).filter(item=>item.vehicle===vehicle.id),{confirmed:0,risk:1,planned:2});
  const reservation=prefer((state.reservations||[]).filter(item=>item.vehicle===vehicle.id),{active:0,confirmed:1,draft:2,waitlist:3,completed:8,'no-show':9,expired:10,cancelled:11});
  const session=prefer((state.sessions||[]).filter(item=>item.vehicle===vehicle.id),{active:0,completed:5,failed:6});
  const reservationCharger=reservation?.charger&&reservation.charger!=='Auto assign'&&reservation.charger!=='—'?byId(state.chargers,reservation.charger):null;
  const charger=vehicle.charger&&vehicle.charger!=='—'?byId(state.chargers,vehicle.charger):(session?.charger?byId(state.chargers,session.charger):reservationCharger);
  return {vehicle,driver,schedule,reservation,session,charger};
}

export function driverContext(state,driverId){
  const driver=byId(state?.drivers,driverId);
  if(!driver)return {driver:null,vehicle:null,schedule:null,reservation:null,session:null,claim:null};
  const vehicle=driver.vehicle&&driver.vehicle!=='—'?byId(state.vehicles,driver.vehicle):null;
  const base=vehicle?vehicleContext(state,vehicle.id):{schedule:null,reservation:null,session:null};
  const claim=prefer((state.reimbursements||[]).filter(item=>item.driver===driver.id),{pending:0,review:1,approved:2,rejected:5});
  return {driver,vehicle,schedule:base.schedule,reservation:base.reservation,session:base.session,claim};
}

export function scheduleContext(state,scheduleId){
  const schedule=byId(state?.schedules,scheduleId);
  if(!schedule)return {schedule:null,vehicle:null,driver:null,reservation:null,session:null,charger:null};
  const base=vehicleContext(state,schedule.vehicle);
  return {schedule,vehicle:base.vehicle,driver:byId(state.drivers,schedule.driver)||base.driver,reservation:base.reservation,session:base.session,charger:base.charger};
}

export function reservationContext(state,reservationId){
  const reservation=byId(state?.reservations,reservationId);
  if(!reservation)return {reservation:null,vehicle:null,driver:null,schedule:null,session:null,charger:null};
  const base=vehicleContext(state,reservation.vehicle);
  const session=prefer((state.sessions||[]).filter(item=>item.vehicle===reservation.vehicle&&(reservation.charger==='Auto assign'||reservation.charger==='—'||!reservation.charger||item.charger===reservation.charger)),{active:0,completed:5,failed:6});
  const charger=reservation.charger&&reservation.charger!=='Auto assign'&&reservation.charger!=='—'?byId(state.chargers,reservation.charger):base.charger;
  return {reservation,vehicle:base.vehicle,driver:base.driver,schedule:base.schedule,session,charger};
}

export function sessionContext(state,sessionId){
  const session=byId(state?.sessions,sessionId);
  if(!session)return {session:null,vehicle:null,driver:null,schedule:null,reservation:null,charger:null};
  const base=vehicleContext(state,session.vehicle);
  const explicit=session.reservation&&session.reservation!=='—'?byId(state.reservations,session.reservation):null;
  const reservation=explicit||prefer((state.reservations||[]).filter(item=>item.vehicle===session.vehicle&&(!item.charger||item.charger==='Auto assign'||item.charger==='—'||item.charger===session.charger)),{active:0,completed:2,confirmed:3});
  return {session,vehicle:base.vehicle,driver:byId(state.drivers,session.driver)||base.driver,schedule:base.schedule,reservation,charger:byId(state.chargers,session.charger)};
}

export function chargerContext(state,chargerId){
  const charger=byId(state?.chargers,chargerId);
  if(!charger)return {charger:null,vehicle:null,driver:null,schedule:null,reservation:null,session:null};
  const session=prefer((state.sessions||[]).filter(item=>item.charger===charger.id),{active:0,completed:5,failed:6});
  const vehicleId=charger.vehicle||session?.vehicle||null;
  const base=vehicleId?vehicleContext(state,vehicleId):{vehicle:null,driver:null,schedule:null,reservation:null};
  const reservation=prefer((state.reservations||[]).filter(item=>item.charger===charger.id),{active:0,confirmed:1,draft:2,completed:5,'no-show':6,expired:7,cancelled:8})||base.reservation;
  return {charger,vehicle:base.vehicle,driver:base.driver,schedule:base.schedule,reservation,session};
}
