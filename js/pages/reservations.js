import {loadState,saveState} from '../core/fleet-state.js';
import {initCommon} from '../layout/common.js';

initCommon();

let state=loadState();
const $=id=>document.getElementById(id);
const money=value=>`${Math.round(Number(value)||0).toLocaleString('en-US')} AMD`;
const today='2026-08-13';
let activeFilter='upcoming';
let activeReservationId=null;
let wizardStep=0;
let editingReservationId=null;
let draft=null;
let toastTimer=null;

const els={
  table:$('reservation-table'),
  search:$('reservation-search'),
  assignment:$('reservation-assignment-filter'),
  sort:$('reservation-sort'),
  visible:$('reservation-visible-count'),
  drawer:$('reservation-drawer'),
  backdrop:$('reservation-drawer-backdrop'),
  drawerBody:$('reservation-drawer-body'),
  drawerTitle:$('reservation-drawer-title'),
  drawerSubtitle:$('reservation-drawer-subtitle'),
  openVehicle:$('reservation-open-vehicle'),
  openCharger:$('reservation-open-charger'),
  secondaryAction:$('reservation-secondary-action'),
  primaryAction:$('reservation-primary-action'),
  dialog:$('reservation-dialog'),
  dialogTitle:$('reservation-dialog-title'),
  dialogCopy:$('reservation-dialog-copy'),
  dialogBody:$('reservation-dialog-body'),
  stepper:$('reservation-stepper'),
  back:$('reservation-back'),
  next:$('reservation-next'),
  cancelDialog:$('reservation-cancel-dialog'),
  cancelCopy:$('reservation-cancel-copy'),
  toast:$('reservation-toast')
};

const metaSeed={
  'RS-84021':{arrivalDate:today,assignmentMode:'charger',requiredKwh:18,reservationFee:500,estimatedCost:1904,grace:15,idleFee:50,accessCode:'VD-84021',createdBy:'Narek Petrosyan'},
  'RS-84022':{arrivalDate:today,assignmentMode:'auto',requiredKwh:35,reservationFee:500,estimatedCost:3230,grace:15,idleFee:50,accessCode:'VD-84022',createdBy:'Narek Petrosyan'},
  'RS-84017':{arrivalDate:today,assignmentMode:'charger',requiredKwh:31,reservationFee:500,estimatedCost:2918,grace:15,idleFee:50,accessCode:'VD-84017',createdBy:'Narek Petrosyan'},
  'RS-84018':{arrivalDate:today,assignmentMode:'charger',requiredKwh:22,reservationFee:500,estimatedCost:2216,grace:15,idleFee:50,accessCode:'VD-84018',createdBy:'Narek Petrosyan'},
  'RS-84004':{arrivalDate:today,assignmentMode:'charger',requiredKwh:2,reservationFee:500,estimatedCost:656,grace:15,idleFee:50,accessCode:'VD-84004',createdBy:'Narek Petrosyan'}
};

function normalizeReservations(){
  state.reservations=(state.reservations||[]).map((r,index)=>{
    const vehicle=vehicleFor(r.vehicle);
    const seed=metaSeed[r.id]||{};
    const mode=r.assignmentMode||seed.assignmentMode||(r.charger==='Auto assign'?(r.bay&&r.bay!=='Any'?'bay':'auto'):'charger');
    const required=Number(r.requiredKwh ?? seed.requiredKwh ?? vehicle?.requiredKwh ?? 20);
    const fee=Number(r.reservationFee ?? seed.reservationFee ?? 500);
    return {
      ...r,
      arrivalDate:r.arrivalDate||seed.arrivalDate||today,
      assignmentMode:mode,
      requiredKwh:required,
      reservationFee:fee,
      estimatedCost:Number(r.estimatedCost ?? seed.estimatedCost ?? (required*state.energy.priceAmd+fee)),
      grace:Number(r.grace ?? seed.grace ?? 15),
      idleFee:Number(r.idleFee ?? seed.idleFee ?? 50),
      accessCode:r.accessCode||seed.accessCode||`VD-${String(r.id||index).replace(/\D/g,'').slice(-5)}`,
      createdBy:r.createdBy||seed.createdBy||state.company.manager,
      cancellationReason:r.cancellationReason||'',
      createdOrder:Number(r.createdOrder ?? String(r.id||'').replace(/\D/g,'') ?? index)
    };
  });
}

function vehicleFor(id){return (state.vehicles||[]).find(v=>v.id===id)}
function chargerFor(id){return (state.chargers||[]).find(c=>c.id===id)}
function driverForVehicle(id){return (state.drivers||[]).find(d=>d.vehicle===id)}
function fmtDate(value){if(!value)return '—';const d=new Date(`${value}T12:00:00`);return Number.isNaN(d.getTime())?value:d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}
function assignmentLabel(r){
  if(r.assignmentMode==='auto')return 'Auto assign';
  if(r.assignmentMode==='bay')return `Bay ${r.bay||'Any'}`;
  return r.charger&&r.charger!=='Auto assign'?`${r.charger} · ${r.bay&&r.bay!=='Any'?r.bay:'Bay auto'}`:'Specific charger';
}
function assignmentDetail(r){
  if(r.assignmentMode==='auto')return 'Best compatible charger on arrival';
  if(r.assignmentMode==='bay')return `Parking bay reserved · charger assigned later`;
  const c=chargerFor(r.charger);
  return c?`${c.type} · ${c.power} kW · Bay ${c.bay}`:'Dedicated charger reservation';
}
function statusText(status){return ({confirmed:'Confirmed',active:'Active',completed:'Completed',cancelled:'Cancelled',waitlist:'Waiting list'})[status]||status}
function statusClass(status){return ({confirmed:'reserved',active:'charging',completed:'ready',cancelled:'offline',waitlist:'queued'})[status]||'reserved'}
function filterMatch(r){
  if(activeFilter==='upcoming')return r.status==='confirmed'||r.status==='waitlist';
  if(activeFilter==='all')return true;
  return r.status===activeFilter;
}
function estimatedEnergy(vehicle,target){
  if(!vehicle)return 20;
  const capacity=Number(vehicle.capacity)||75;
  return Math.max(0,Math.round(((Number(target)-Number(vehicle.battery||0))/100)*capacity*10)/10);
}
function durationMinutes(value){const [h,m]=String(value||'01:00').split(':').map(Number);return (h||0)*60+(m||0)}
function durationLabel(value){const mins=durationMinutes(value);const h=Math.floor(mins/60);const m=mins%60;return h?`${h}h${m?` ${m}m`:''}`:`${m}m`}

function updateSummary(){
  const upcoming=state.reservations.filter(r=>r.status==='confirmed'||r.status==='waitlist');
  $('reservation-upcoming').textContent=upcoming.length;
  $('reservation-active').textContent=state.reservations.filter(r=>r.status==='active').length;
  $('reservation-auto').textContent=upcoming.filter(r=>r.assignmentMode==='auto').length;
  $('reservation-bays').textContent=upcoming.filter(r=>r.bay&&r.bay!=='Any').length;
  const energy=upcoming.reduce((sum,r)=>sum+Number(r.requiredKwh||0),0);
  $('reservation-energy').textContent=`${energy.toFixed(1)} kWh`;
}

function render(){
  updateSummary();
  const needle=(els.search.value||'').trim().toLowerCase();
  let rows=state.reservations.filter(filterMatch).filter(r=>{
    const vehicle=vehicleFor(r.vehicle);
    const hay=`${r.id} ${r.vehicle} ${vehicle?.name||''} ${r.charger} ${r.bay} ${r.location} ${statusText(r.status)}`.toLowerCase();
    const assignmentOk=els.assignment.value==='all'||r.assignmentMode===els.assignment.value;
    return (!needle||hay.includes(needle))&&assignmentOk;
  });
  if(els.sort.value==='target')rows.sort((a,b)=>Number(b.target)-Number(a.target));
  else if(els.sort.value==='energy')rows.sort((a,b)=>Number(b.requiredKwh)-Number(a.requiredKwh));
  else if(els.sort.value==='recent')rows.sort((a,b)=>Number(b.createdOrder)-Number(a.createdOrder));
  else rows.sort((a,b)=>`${a.arrivalDate} ${a.arrival}`.localeCompare(`${b.arrivalDate} ${b.arrival}`));
  els.visible.textContent=rows.length;
  els.table.innerHTML=rows.map(r=>{
    const vehicle=vehicleFor(r.vehicle);
    const driver=driverForVehicle(r.vehicle);
    const assignmentIcon=r.assignmentMode==='auto'?'◉':r.assignmentMode==='bay'?'▣':'ϟ';
    return `<tr class="reservation-row reservation-row--${r.status}" data-reservation-row="${r.id}">
      <td><div class="entity-main reservation-id"><strong>${r.id}</strong><span>${fmtDate(r.arrivalDate)}</span></div></td>
      <td><div class="entity-main"><strong>${vehicle?.name||r.vehicle}</strong><span>${r.vehicle}${driver?` · ${driver.name}`:''}</span></div></td>
      <td><div class="reservation-assignment"><span class="reservation-assignment__icon">${assignmentIcon}</span><div><strong>${assignmentLabel(r)}</strong><span>${r.location}</span></div></div></td>
      <td><div class="entity-main"><strong>${r.arrival}</strong><span>${fmtDate(r.arrivalDate)}</span></div></td>
      <td>${durationLabel(r.duration)}</td>
      <td><strong>${r.target}%</strong></td>
      <td>${Number(r.requiredKwh).toFixed(1)} kWh</td>
      <td>${money(r.estimatedCost)}</td>
      <td><span class="ui-pill status-pill status-${statusClass(r.status)}">${statusText(r.status)}</span></td>
      <td><button class="ui-row-menu" type="button" data-open-reservation="${r.id}" aria-label="Open ${r.id}">•••</button></td>
    </tr>`;
  }).join('')||'<tr><td colspan="10"><div class="reservation-empty">No reservations match these filters.</div></td></tr>';
  document.querySelectorAll('[data-open-reservation]').forEach(btn=>btn.addEventListener('click',event=>{event.stopPropagation();openDrawer(btn.dataset.openReservation)}));
  document.querySelectorAll('[data-reservation-row]').forEach(row=>row.addEventListener('dblclick',()=>openDrawer(row.dataset.reservationRow)));
}

function openDrawer(id){
  const r=state.reservations.find(item=>item.id===id);
  if(!r)return;
  activeReservationId=id;
  const vehicle=vehicleFor(r.vehicle);
  const driver=driverForVehicle(r.vehicle);
  const modifiable=r.status==='confirmed'||r.status==='waitlist';
  els.drawerTitle.textContent=r.id;
  els.drawerSubtitle.textContent=`${vehicle?.name||r.vehicle} · ${statusText(r.status)}`;
  els.openCharger.disabled=!(r.charger&&r.charger!=='Auto assign'&&r.charger!=='—');
  els.openCharger.textContent=els.openCharger.disabled?'No assigned charger':'Open charger';
  els.secondaryAction.hidden=!modifiable;
  els.primaryAction.hidden=!modifiable;
  els.secondaryAction.textContent='Modify';
  els.primaryAction.textContent='Cancel reservation';
  const departure=vehicle?.departure||'—';
  const policyStatus=r.status==='cancelled'?`Cancelled · ${r.cancellationReason||'No reason recorded'}`:`${r.grace} min grace period · ${money(r.idleFee)}/min idle fee`;
  els.drawerBody.innerHTML=`
    <section class="reservation-detail-hero"><div><span>Vehicle reservation</span><strong>${vehicle?.name||r.vehicle}</strong><small>${r.vehicle}${driver?` · ${driver.name}`:''}</small></div><span class="ui-pill status-pill status-${statusClass(r.status)}">${statusText(r.status)}</span></section>
    <section class="ui-detail-section"><h3>Arrival & capacity</h3><div class="ui-detail-grid"><div><span>Arrival</span><strong>${fmtDate(r.arrivalDate)} · ${r.arrival}</strong></div><div><span>Expected duration</span><strong>${durationLabel(r.duration)}</strong></div><div><span>Next vehicle departure</span><strong>${departure}</strong></div><div><span>Grace period</span><strong>${r.grace} minutes</strong></div></div></section>
    <section class="ui-detail-section"><h3>Infrastructure assignment</h3><div class="reservation-assignment-card"><div><span class="reservation-assignment__icon">${r.assignmentMode==='auto'?'◉':r.assignmentMode==='bay'?'▣':'ϟ'}</span><div><strong>${assignmentLabel(r)}</strong><span>${assignmentDetail(r)}</span></div></div><small>${r.location}</small></div></section>
    <section class="ui-detail-section"><h3>Charging plan</h3><div class="ui-detail-grid"><div><span>Current SOC</span><strong>${vehicle?.battery??'—'}%</strong></div><div><span>Target SOC</span><strong>${r.target}%</strong></div><div><span>Required energy</span><strong>${Number(r.requiredKwh).toFixed(1)} kWh</strong></div><div><span>Estimated charging cost</span><strong>${money(r.estimatedCost)}</strong></div></div></section>
    <section class="ui-detail-section"><h3>Reservation policy</h3><div class="ui-detail-list"><div><span>Reservation fee</span><strong>${money(r.reservationFee)}</strong></div><div><span>Idle fee</span><strong>${money(r.idleFee)} / min</strong></div><div><span>Cancellation</span><strong>Free until 30 min before arrival</strong></div><div><span>Policy state</span><strong>${policyStatus}</strong></div><div><span>Reservation status</span><span class="ui-pill status-pill status-${statusClass(r.status)}">${statusText(r.status)}</span></div></div>${r.status==='confirmed'?'<div class="reservation-inline-action"><button class="action-button" type="button" data-reservation-waitlist>Move to waiting list</button><span>Release dedicated capacity and let VoltDrive assign the next suitable charger automatically.</span></div>':''}</section>
    <section class="ui-detail-section"><h3>Access code</h3><div class="reservation-access-card"><div class="reservation-qr" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div><div><span>Fleet access code</span><strong>${r.accessCode}</strong><small>Use at depot entry or charger when mobile identification is unavailable.</small></div></div></section>
    <section class="ui-detail-section"><h3>Audit</h3><div class="ui-detail-list"><div><span>Created by</span><strong>${r.createdBy}</strong></div><div><span>Reservation ID</span><strong>${r.id}</strong></div></div></section>`;
  els.backdrop.hidden=false;
  requestAnimationFrame(()=>els.backdrop.classList.add('is-visible'));
  els.drawer.classList.add('is-open');
  els.drawer.setAttribute('aria-hidden','false');
}

function closeDrawer(){
  els.drawer.classList.remove('is-open');
  els.drawer.setAttribute('aria-hidden','true');
  els.backdrop.classList.remove('is-visible');
  setTimeout(()=>{els.backdrop.hidden=true},180);
}

function freshDraft(existing=null){
  const vehicle=existing?vehicleFor(existing.vehicle):state.vehicles.find(v=>v.active!==false);
  const mode=existing?.assignmentMode||'auto';
  const target=Number(existing?.target ?? vehicle?.target ?? state.settings.defaultTarget ?? 85);
  const required=Number(existing?.requiredKwh ?? estimatedEnergy(vehicle,target));
  return {
    vehicle:existing?.vehicle||vehicle?.id||'',
    location:existing?.location||state.company.depot,
    assignmentMode:mode,
    charger:existing?.charger||'Auto assign',
    bay:existing?.bay||'Any',
    arrivalDate:existing?.arrivalDate||today,
    arrival:existing?.arrival||'14:00',
    duration:existing?.duration||'01:00',
    target,
    requiredKwh:required,
    reservationFee:Number(existing?.reservationFee??500),
    grace:Number(existing?.grace??15),
    idleFee:Number(existing?.idleFee??50),
    estimatedCost:Number(existing?.estimatedCost??(required*state.energy.priceAmd+500))
  };
}

function openWizard(existingId=null){
  const existing=existingId?state.reservations.find(r=>r.id===existingId):null;
  editingReservationId=existing?.id||null;
  draft=freshDraft(existing);
  wizardStep=0;
  els.dialogTitle.textContent=existing?'Modify fleet reservation':'New fleet reservation';
  els.dialogCopy.textContent=existing?`Update ${existing.id} without losing its fleet audit trail.`:'Reserve charging capacity for a vehicle before it arrives at the depot.';
  renderWizard();
  els.dialog.showModal();
}

function renderStepper(){
  const labels=['Vehicle','Schedule','Charging','Review'];
  els.stepper.innerHTML=labels.map((label,index)=>`<div class="reservation-step ${index===wizardStep?'is-active':''} ${index<wizardStep?'is-complete':''}"><span>${index<wizardStep?'✓':index+1}</span><strong>${label}</strong></div>`).join('');
}

function selectOptions(items,value,labelFn){return items.map(item=>`<option value="${item.id}" ${item.id===value?'selected':''}>${labelFn(item)}</option>`).join('')}

function renderWizard(){
  renderStepper();
  els.back.hidden=wizardStep===0;
  els.next.textContent=wizardStep===3?(editingReservationId?'Save changes':'Confirm reservation'):'Continue';
  if(wizardStep===0)renderVehicleStep();
  else if(wizardStep===1)renderScheduleStep();
  else if(wizardStep===2)renderChargingStep();
  else renderReviewStep();
}

function renderVehicleStep(){
  const vehicles=state.vehicles.filter(v=>v.active!==false);
  const selected=vehicleFor(draft.vehicle);
  const driver=driverForVehicle(draft.vehicle);
  els.dialogBody.innerHTML=`<div class="reservation-form-grid"><label class="reservation-field reservation-field--full"><span>Vehicle</span><select class="ui-select" id="wizard-vehicle">${selectOptions(vehicles,draft.vehicle,v=>`${v.id} · ${v.name} · ${v.battery}% SOC`)}</select></label></div>
  <div class="reservation-vehicle-preview"><div><span>Selected vehicle</span><strong>${selected?.name||'Choose a vehicle'}</strong><small>${driver?driver.name:'No assigned driver'} · Departure ${selected?.departure||'—'}</small></div><div><span>Current SOC</span><strong>${selected?.battery??'—'}%</strong><small>Vehicle target ${selected?.target??'—'}%</small></div></div>
  <div class="reservation-form-section"><h3>Reservation type</h3><div class="reservation-choice-grid">
    ${choice('auto','◉','Auto assign','Reserve depot capacity now. The best compatible charger is assigned on arrival.')}
    ${choice('charger','ϟ','Specific charger','Reserve one charger and its charging bay for this vehicle.')}
    ${choice('bay','▣','Specific parking bay','Reserve a parking bay and allow the system to select the charger later.')}
  </div></div>`;
  $('wizard-vehicle').addEventListener('change',event=>{draft.vehicle=event.target.value;const v=vehicleFor(draft.vehicle);draft.target=Number(v?.target||state.settings.defaultTarget||85);draft.requiredKwh=estimatedEnergy(v,draft.target);draft.estimatedCost=draft.requiredKwh*state.energy.priceAmd+draft.reservationFee;renderVehicleStep()});
  document.querySelectorAll('input[name="reservation-mode"]').forEach(input=>input.addEventListener('change',event=>{
    draft.assignmentMode=event.target.value;
    if(draft.assignmentMode==='auto'){draft.charger='Auto assign';draft.bay='Any'}
    if(draft.assignmentMode==='charger'){const charger=state.chargers.find(c=>c.status!=='faulty');draft.charger=charger?.id||'';draft.bay=charger?.bay||'Any'}
    if(draft.assignmentMode==='bay'){const bay=state.chargers.map(c=>c.bay).find(Boolean);draft.charger='Auto assign';draft.bay=bay||'Any'}
    renderVehicleStep();
  }));
}

function choice(value,icon,title,copy){return `<label class="reservation-choice"><input type="radio" name="reservation-mode" value="${value}" ${draft.assignmentMode===value?'checked':''}><span class="reservation-choice__icon">${icon}</span><strong>${title}</strong><small>${copy}</small></label>`}

function renderScheduleStep(){
  const chargers=state.chargers.filter(c=>c.status!=='faulty');
  const bays=[...new Set(state.chargers.map(c=>c.bay).filter(Boolean))];
  if(draft.assignmentMode==='charger'&&!chargers.some(c=>c.id===draft.charger)){draft.charger=chargers[0]?.id||'';draft.bay=chargers[0]?.bay||'Any'}
  if(draft.assignmentMode==='bay'&&!bays.includes(draft.bay)){draft.bay=bays[0]||'Any';draft.charger='Auto assign'}
  els.dialogBody.innerHTML=`<div class="reservation-form-grid">
    <label class="reservation-field reservation-field--full"><span>Location</span><input value="${draft.location}" disabled></label>
    <label class="reservation-field"><span>Arrival date</span><input id="wizard-date" type="date" value="${draft.arrivalDate}"></label>
    <label class="reservation-field"><span>Arrival time</span><input id="wizard-time" type="time" value="${draft.arrival}"></label>
    <label class="reservation-field"><span>Expected duration</span><select class="ui-select" id="wizard-duration"><option value="00:30" ${draft.duration==='00:30'?'selected':''}>30 minutes</option><option value="00:45" ${draft.duration==='00:45'?'selected':''}>45 minutes</option><option value="01:00" ${draft.duration==='01:00'?'selected':''}>1 hour</option><option value="01:15" ${draft.duration==='01:15'?'selected':''}>1 h 15 min</option><option value="01:30" ${draft.duration==='01:30'?'selected':''}>1 h 30 min</option><option value="02:00" ${draft.duration==='02:00'?'selected':''}>2 hours</option></select></label>
    <label class="reservation-field"><span>Grace period</span><select class="ui-select" id="wizard-grace"><option value="10" ${draft.grace===10?'selected':''}>10 minutes</option><option value="15" ${draft.grace===15?'selected':''}>15 minutes</option><option value="20" ${draft.grace===20?'selected':''}>20 minutes</option><option value="30" ${draft.grace===30?'selected':''}>30 minutes</option></select></label>
    ${draft.assignmentMode==='charger'?`<label class="reservation-field reservation-field--full"><span>Charger</span><select class="ui-select" id="wizard-charger">${selectOptions(chargers,draft.charger,charger=>`${charger.id} · ${charger.type} ${charger.power} kW · Bay ${charger.bay} · ${charger.status}`)}</select></label>`:''}
    ${draft.assignmentMode==='bay'?`<label class="reservation-field reservation-field--full"><span>Parking bay</span><select class="ui-select" id="wizard-bay">${bays.map(bay=>`<option value="${bay}" ${draft.bay===bay?'selected':''}>${bay}</option>`).join('')}</select></label>`:''}
  </div>
  <div class="ui-callout ui-callout--info"><strong>${draft.assignmentMode==='auto'?'Dynamic charger assignment':draft.assignmentMode==='bay'?'Parking capacity protected':'Dedicated charger capacity'}</strong><span>${draft.assignmentMode==='auto'?'VoltDrive will select the best compatible charger when the vehicle arrives.':draft.assignmentMode==='bay'?'The selected parking bay is protected while charger allocation remains flexible.':'This charger and its bay are dedicated to the reservation window.'}</span></div>`;
  bindInput('wizard-date',value=>draft.arrivalDate=value);
  bindInput('wizard-time',value=>draft.arrival=value);
  bindInput('wizard-duration',value=>draft.duration=value);
  bindInput('wizard-grace',value=>draft.grace=Number(value));
  bindInput('wizard-charger',value=>{draft.charger=value;draft.bay=chargerFor(value)?.bay||'Any'});
  bindInput('wizard-bay',value=>{draft.bay=value;draft.charger='Auto assign'});
}

function bindInput(id,handler){const node=$(id);if(node)node.addEventListener('input',event=>handler(event.target.value))}

function renderChargingStep(){
  const vehicle=vehicleFor(draft.vehicle);
  const computed=estimatedEnergy(vehicle,draft.target);
  if(!Number.isFinite(Number(draft.requiredKwh)))draft.requiredKwh=computed;
  draft.estimatedCost=Number(draft.requiredKwh)*state.energy.priceAmd+Number(draft.reservationFee);
  els.dialogBody.innerHTML=`<div class="reservation-charge-hero"><div><span>Current battery</span><strong>${vehicle?.battery??'—'}%</strong><small>${vehicle?.name||draft.vehicle}</small></div><div><span>Target battery</span><strong id="wizard-target-output">${draft.target}%</strong><small>${Number(draft.requiredKwh).toFixed(1)} kWh planned</small></div></div>
  <div class="reservation-form-grid">
    <label class="reservation-field reservation-field--full"><span>Target SOC</span><input id="wizard-target" type="range" min="${Math.max(Number(vehicle?.battery||10)+5,20)}" max="100" step="5" value="${draft.target}"></label>
    <label class="reservation-field"><span>Required energy</span><input id="wizard-energy" type="number" min="0" step="0.1" value="${Number(draft.requiredKwh).toFixed(1)}"></label>
    <label class="reservation-field"><span>Reservation fee</span><input value="${money(draft.reservationFee)}" disabled></label>
  </div>
  <div class="reservation-cost-card"><div><span>Energy estimate</span><strong>${Number(draft.requiredKwh).toFixed(1)} kWh × ${money(state.energy.priceAmd)}/kWh</strong></div><div><span>Estimated total</span><strong id="wizard-estimated-cost">${money(draft.estimatedCost)}</strong></div></div>`;
  $('wizard-target').addEventListener('input',event=>{draft.target=Number(event.target.value);draft.requiredKwh=estimatedEnergy(vehicle,draft.target);draft.estimatedCost=draft.requiredKwh*state.energy.priceAmd+draft.reservationFee;renderChargingStep()});
  $('wizard-energy').addEventListener('input',event=>{draft.requiredKwh=Math.max(0,Number(event.target.value)||0);draft.estimatedCost=draft.requiredKwh*state.energy.priceAmd+draft.reservationFee;$('wizard-estimated-cost').textContent=money(draft.estimatedCost)});
}

function renderReviewStep(){
  const vehicle=vehicleFor(draft.vehicle);
  const driver=driverForVehicle(draft.vehicle);
  els.dialogBody.innerHTML=`<div class="reservation-review-head"><span class="reservation-review-icon">▣</span><div><span>${editingReservationId?'Reservation update':'Ready to reserve'}</span><strong>${vehicle?.name||draft.vehicle}</strong><small>${driver?driver.name:'No assigned driver'} · ${fmtDate(draft.arrivalDate)} at ${draft.arrival}</small></div></div>
  <div class="ui-detail-grid reservation-review-grid"><div><span>Assignment</span><strong>${assignmentLabel(draft)}</strong></div><div><span>Duration</span><strong>${durationLabel(draft.duration)}</strong></div><div><span>Target SOC</span><strong>${draft.target}%</strong></div><div><span>Required energy</span><strong>${Number(draft.requiredKwh).toFixed(1)} kWh</strong></div><div><span>Grace period</span><strong>${draft.grace} minutes</strong></div><div><span>Estimated cost</span><strong>${money(draft.estimatedCost)}</strong></div></div>
  <div class="ui-callout ui-callout--info"><strong>Reservation terms</strong><span>${money(draft.reservationFee)} reservation fee · ${money(draft.idleFee)}/min idle fee after charging · free cancellation until 30 minutes before arrival.</span></div>`;
}

function readStep(){
  if(wizardStep===0){const vehicle=$('wizard-vehicle');if(vehicle)draft.vehicle=vehicle.value;return Boolean(draft.vehicle)}
  if(wizardStep===1){return Boolean(draft.arrivalDate&&draft.arrival&&draft.duration&&(draft.assignmentMode!=='charger'||draft.charger)&&(draft.assignmentMode!=='bay'||draft.bay))}
  if(wizardStep===2){return Number(draft.target)>0&&Number(draft.requiredKwh)>=0}
  return true;
}

function nextWizard(){
  if(!readStep()){toast('Complete the required reservation fields');return}
  if(wizardStep<3){wizardStep+=1;renderWizard();return}
  saveReservation();
}

function syncChargerReservation(previous,next){
  if(previous?.charger&&previous.charger!=='Auto assign'&&(previous.charger!==next.charger||previous.vehicle!==next.vehicle)){
    const old=chargerFor(previous.charger);
    if(old&&old.status==='reserved'&&old.vehicle===previous.vehicle){old.status='available';old.vehicle=null}
  }
  if(next.status==='confirmed'&&next.assignmentMode==='charger'&&next.charger&&next.charger!=='Auto assign'){
    const charger=chargerFor(next.charger);
    if(charger&&charger.status==='available'){charger.status='reserved';charger.vehicle=next.vehicle}
  }
}

function saveReservation(){
  const vehicle=vehicleFor(draft.vehicle);
  if(draft.assignmentMode==='charger'){const charger=chargerFor(draft.charger);draft.bay=charger?.bay||draft.bay||'Any'}
  if(draft.assignmentMode==='auto'){draft.charger='Auto assign';draft.bay='Any'}
  if(draft.assignmentMode==='bay')draft.charger='Auto assign';
  if(editingReservationId){
    const existing=state.reservations.find(r=>r.id===editingReservationId);
    if(existing){const previous={...existing};Object.assign(existing,draft,{status:existing.status==='waitlist'?'confirmed':existing.status});syncChargerReservation(previous,existing)}
  }else{
    const max=Math.max(84000,...state.reservations.map(r=>Number(String(r.id).replace(/\D/g,''))||0));
    const id=`RS-${max+1}`;
    const created={...draft,id,status:'confirmed',accessCode:`VD-${String(max+1).slice(-5)}`,createdBy:state.company.manager,createdOrder:max+1,cancellationReason:''};
    state.reservations.unshift(created);
    syncChargerReservation(null,created);
    activeReservationId=id;
  }
  saveState(state);
  els.dialog.close();
  render();
  toast(editingReservationId?'Reservation updated':'Fleet reservation confirmed');
  const id=editingReservationId||activeReservationId;
  editingReservationId=null;
  if(id)openDrawer(id);
}

function cancelReservation(){
  const r=state.reservations.find(item=>item.id===activeReservationId);
  if(!r)return;
  els.cancelCopy.textContent=`Cancel ${r.id} for ${r.vehicle}? Reserved depot capacity will be released.`;
  els.cancelDialog.showModal();
}

function confirmCancellation(){
  const r=state.reservations.find(item=>item.id===activeReservationId);
  if(!r)return;
  r.status='cancelled';
  r.cancellationReason=$('reservation-cancel-reason').value;
  if(r.charger&&r.charger!=='Auto assign'){
    const charger=chargerFor(r.charger);
    if(charger&&charger.status==='reserved'&&charger.vehicle===r.vehicle){charger.status='available';charger.vehicle=null}
  }
  saveState(state);
  render();
  openDrawer(r.id);
  toast('Reservation cancelled and capacity released');
}

function moveToWaitlist(){
  const r=state.reservations.find(item=>item.id===activeReservationId);
  if(!r||r.status!=='confirmed')return;
  if(r.charger&&r.charger!=='Auto assign'){const charger=chargerFor(r.charger);if(charger&&charger.status==='reserved'&&charger.vehicle===r.vehicle){charger.status='available';charger.vehicle=null}}
  r.status='waitlist';
  r.assignmentMode='auto';
  r.charger='Auto assign';
  r.bay='Any';
  saveState(state);render();openDrawer(r.id);toast('Reservation moved to waiting list');
}

function toast(message){clearTimeout(toastTimer);els.toast.textContent=message;els.toast.classList.add('is-visible');toastTimer=setTimeout(()=>els.toast.classList.remove('is-visible'),2300)}

normalizeReservations();
render();

document.querySelectorAll('[data-reservation-filter]').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('[data-reservation-filter]').forEach(item=>item.classList.remove('is-active'));button.classList.add('is-active');activeFilter=button.dataset.reservationFilter;render()}));
[els.search,els.assignment,els.sort].forEach(node=>node&&node.addEventListener('input',render));
$('new-reservation').addEventListener('click',()=>openWizard());
$('reservation-drawer-close').addEventListener('click',closeDrawer);
els.backdrop.addEventListener('click',closeDrawer);
els.back.addEventListener('click',()=>{if(wizardStep>0){wizardStep-=1;renderWizard()}});
els.next.addEventListener('click',nextWizard);
els.secondaryAction.addEventListener('click',()=>openWizard(activeReservationId));
els.primaryAction.addEventListener('click',cancelReservation);
els.openVehicle.addEventListener('click',()=>{const r=state.reservations.find(item=>item.id===activeReservationId);if(r)location.href=`./vehicles.html?vehicle=${encodeURIComponent(r.vehicle)}`});
els.openCharger.addEventListener('click',()=>{const r=state.reservations.find(item=>item.id===activeReservationId);if(r&&r.charger&&r.charger!=='Auto assign')location.href=`./depot.html?charger=${encodeURIComponent(r.charger)}`});
$('reservation-cancel-form').addEventListener('submit',event=>{if(event.submitter?.id==='confirm-reservation-cancel')confirmCancellation()});
els.drawerBody.addEventListener('click',event=>{const wait=event.target.closest('[data-reservation-waitlist]');if(wait)moveToWaitlist()});

const requested=new URLSearchParams(location.search).get('reservation');
if(requested&&state.reservations.some(r=>r.id===requested))openDrawer(requested);
