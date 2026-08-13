import {loadState,saveState,statusLabel} from '../core/fleet-state.js';
import {initCommon} from '../layout/common.js';

initCommon();
let state=loadState();
let selectedVehicleId=null;
let pendingAction=null;

const $=id=>document.getElementById(id);
const search=$('ops-search');
const statusFilter=$('ops-status');
const groupFilter=$('ops-group');
const sortFilter=$('ops-sort');
const drawer=$('vehicle-drawer');
const drawerBackdrop=$('drawer-backdrop');
const dialog=$('action-dialog');
const priorityRank={critical:0,high:1,normal:2,low:3};

function esc(value){return String(value??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function driverFor(vehicleId){return state.drivers.find(d=>d.vehicle===vehicleId);}
function scheduleFor(vehicleId){return state.schedules.find(s=>s.vehicle===vehicleId);}
function sessionFor(vehicleId){return state.sessions.find(s=>s.vehicle===vehicleId&&s.status==='active');}
function chargerFor(id){return state.chargers.find(c=>c.id===id);}
function minutes(hhmm){const [h,m]=hhmm.split(':').map(Number);return h*60+m;}
function formatMinutes(total){total=((total%1440)+1440)%1440;return `${String(Math.floor(total/60)).padStart(2,'0')}:${String(total%60).padStart(2,'0')}`;}
function energyNeeded(v){return Math.max(0,Number(v.requiredKwh)||0);}
function estimate(v){
  if(v.status==='ready'||v.battery>=v.target) return {label:'Ready now',minutes:0,late:false,delta:0};
  const power=Math.max(1,Number(v.power)||0);
  if(!v.power) return {label:'Awaiting charger',minutes:null,late:true,delta:null};
  const chargeMinutes=Math.ceil(energyNeeded(v)/power*60*1.08);
  const start=minutes(v.departure)-Math.max(chargeMinutes,0)-Math.max(0,Number(state.settings.departureBuffer)||0);
  const readyAt=minutes(v.departure)-Math.max(0,Number(state.settings.departureBuffer)||0);
  const projected=v.status==='risk'?minutes(v.departure)+Math.max(8,Math.ceil(chargeMinutes*.28)):readyAt;
  const late=projected>minutes(v.departure);
  return {label:formatMinutes(projected),minutes:chargeMinutes,late,delta:projected-minutes(v.departure),start};
}
function riskReason(v){
  if(v.status==='risk') return `Projected ready time misses ${v.departure} departure`;
  if(v.status==='queued') return 'No active charger assignment';
  const c=chargerFor(v.charger);
  if(c&&c.health<90) return `${c.id} health is ${c.health}%`;
  return '';
}
function statusClass(v){return `status-${v.status}`;}
function renderStats(){
 const active=state.sessions.filter(x=>x.status==='active').length;
 const ready=state.vehicles.filter(x=>x.status==='ready').length;
 const queued=state.vehicles.filter(x=>x.status==='queued').length;
 const risk=state.vehicles.filter(x=>x.status==='risk').length;
 const loadPct=Math.round(state.energy.currentKw/state.energy.capacityKw*100);
 $('ops-stats').innerHTML=[
  ['Charging now',active,'Live charging sessions','success'],['Ready',ready,'Ready for departure','success'],['Queued',queued,'Waiting assignment',''],['At risk',risk,'Requires intervention','danger'],['Depot load',`${loadPct}%`,`${state.energy.currentKw} / ${state.energy.capacityKw} kW`,loadPct>=80?'danger':'']
 ].map(([a,b,c,d])=>`<div class="stat-tile ${d?`stat-tile--${d}`:''}"><span>${a}</span><strong>${b}</strong><small>${c}</small></div>`).join('');
}
function populateGroups(){
 const current=groupFilter.value||'all';
 const groups=[...new Set(state.drivers.map(d=>d.department).filter(Boolean))].sort();
 groupFilter.innerHTML='<option value="all">All groups</option>'+groups.map(g=>`<option value="${esc(g)}">${esc(g)}</option>`).join('');
 if(groups.includes(current)) groupFilter.value=current;
}
function filteredVehicles(){
 const q=search.value.trim().toLowerCase();
 let rows=state.vehicles.filter(v=>{
  const d=driverFor(v); const hay=[v.id,v.name,v.plate,v.route,v.charger,d?.name,d?.department].join(' ').toLowerCase();
  return (!q||hay.includes(q))&&(statusFilter.value==='all'||v.status===statusFilter.value)&&(groupFilter.value==='all'||d?.department===groupFilter.value);
 });
 switch(sortFilter.value){
  case 'risk': rows.sort((a,b)=>(a.status==='risk'?-1:0)-(b.status==='risk'?-1:0)||minutes(a.departure)-minutes(b.departure)); break;
  case 'soc': rows.sort((a,b)=>a.battery-b.battery); break;
  case 'priority': rows.sort((a,b)=>priorityRank[a.priority]-priorityRank[b.priority]||minutes(a.departure)-minutes(b.departure)); break;
  default: rows.sort((a,b)=>minutes(a.departure)-minutes(b.departure));
 }
 return rows;
}
function renderTable(){
 const rows=filteredVehicles();
 $('visible-count').textContent=rows.length;
 $('ops-empty').hidden=rows.length>0;
 $('operations-table').innerHTML=rows.map(v=>{
  const d=driverFor(v), eta=estimate(v), reason=riskReason(v), socPct=Math.min(100,Math.round(v.battery/v.target*100));
  return `<tr class="ops-vehicle-row ${v.status==='risk'?'ops-vehicle-row--risk':''}" data-open-vehicle="${v.id}">
   <td><div class="ops-vehicle-cell"><div class="ops-vehicle-id"><strong>${esc(v.id)}</strong><span>${esc(v.name)}</span></div><small>${esc(d?.name||'Unassigned driver')} · ${esc(v.plate)}</small></div></td>
   <td><div class="ops-route-cell"><strong>${esc(v.route)}</strong><span>${esc(v.departure)} departure</span></div></td>
   <td><div class="ops-soc"><div><strong>${v.battery}%</strong><span>→ ${v.target}%</span></div><div class="ops-soc__track"><span style="width:${socPct}%"></span></div></div></td>
   <td><div class="ops-eta ${eta.late?'ops-eta--danger':''}"><strong>${esc(eta.label)}</strong>${reason?`<span>${esc(reason)}</span>`:`<span>${eta.minutes===0?'Target reached':`${eta.minutes} min estimated`}</span>`}</div></td>
   <td><strong>${esc(v.charger||'—')}</strong>${v.charger!=='—'&&chargerFor(v.charger)?`<span>${chargerFor(v.charger).power} kW unit</span>`:'<span>Not assigned</span>'}</td>
   <td><strong>${v.power?`${v.power} kW`:'—'}</strong>${v.power?`<span>${Math.round(v.power/(chargerFor(v.charger)?.power||v.power)*100)}% unit power</span>`:'<span>Waiting</span>'}</td>
   <td><span class="ui-pill priority-pill priority-${v.priority}">${esc(v.priority)}</span></td>
   <td><span class="ui-pill status-pill ${statusClass(v)}">${statusLabel(v.status)}</span></td>
   <td><button class="ui-row-menu" data-menu="${v.id}" type="button" aria-label="Actions for ${v.id}">•••</button></td>
  </tr>`;
 }).join('');
 bindTableEvents();
}
function renderPower(){
 const e=state.energy,pct=Math.round(e.currentKw/e.capacityKw*100),available=Math.max(0,e.capacityKw-e.currentKw);
 $('ops-power').innerHTML=`<div class="ops-power-head"><div><strong>${e.currentKw} kW</strong><span>of ${e.capacityKw} kW</span></div><span class="ops-power-percent ${pct>=80?'is-high':''}">${pct}%</span></div><div class="progress ops-power-progress"><span style="width:${pct}%"></span></div><div class="ops-power-metrics"><div><span>Available</span><strong>${available} kW</strong></div><div><span>Solar input</span><strong>${e.solarKw} kW</strong></div><div><span>Site battery</span><strong>${e.siteBatteryPct}%</strong></div><div><span>Energy price</span><strong>${e.priceAmd} AMD/kWh</strong></div></div>`;
}
function renderQueue(){
 const queued=state.vehicles.filter(v=>v.status==='queued').sort((a,b)=>priorityRank[a.priority]-priorityRank[b.priority]||minutes(a.departure)-minutes(b.departure));
 $('queue-preview').innerHTML=queued.length?queued.slice(0,4).map((v,i)=>`<button class="queue-row" data-open-vehicle="${v.id}" type="button"><span class="queue-position">${i+1}</span><span><strong>${v.id}</strong><small>${v.battery}% → ${v.target}% · dep. ${v.departure}</small></span><span class="ui-pill priority-pill priority-${v.priority}">${v.priority}</span></button>`).join(''):'<div class="ops-empty-inline">No vehicles waiting.</div>';
 $('queue-preview').querySelectorAll('[data-open-vehicle]').forEach(el=>el.addEventListener('click',()=>openDrawer(el.dataset.openVehicle)));
}
function renderAlerts(){
 const operational=state.alerts.filter(a=>a.status==='open').slice(0,4);
 $('ops-alerts').innerHTML=operational.length?operational.map(a=>`<div class="alert-item"><div class="alert-item__top"><strong><span class="severity-dot sev-${a.severity}"></span>${esc(a.title)}</strong><span>${esc(a.time)}</span></div><p>${esc(a.body)}</p></div>`).join(''):'<div class="ops-empty-inline">No open operational alerts.</div>';
}
function renderAll(){renderStats();populateGroups();renderTable();renderPower();renderQueue();renderAlerts();if(selectedVehicleId&&drawer.classList.contains('is-open')) renderDrawer(selectedVehicleId);}
function saveAndRender(message){saveState(state);renderAll();showToast(message);}
function showToast(message){const t=$('ops-toast');t.textContent=message;t.classList.add('is-visible');clearTimeout(showToast.timer);showToast.timer=setTimeout(()=>t.classList.remove('is-visible'),2600);}

function renderDrawer(id){
 const v=state.vehicles.find(x=>x.id===id); if(!v)return;
 selectedVehicleId=id; const d=driverFor(id),sch=scheduleFor(id),ses=sessionFor(id),eta=estimate(v),c=chargerFor(v.charger),reason=riskReason(v);
 $('drawer-title').textContent=`${v.id} · ${v.name}`;
 $('drawer-subtitle').textContent=`${v.plate} · ${d?.department||'No group'}`;
 $('drawer-body').innerHTML=`
  ${reason?`<div class="ui-risk-banner"><strong>${v.status==='risk'?'Departure risk':'Action required'}</strong><span>${esc(reason)}</span></div>`:''}
  <section class="ui-detail-section"><h3>Readiness</h3><div class="ui-detail-grid"><div><span>Current SOC</span><strong>${v.battery}%</strong></div><div><span>Target SOC</span><strong>${v.target}%</strong></div><div><span>Ready ETA</span><strong class="${eta.late?'text-danger':''}">${esc(eta.label)}</strong></div><div><span>Departure</span><strong>${v.departure}</strong></div></div></section>
  <section class="ui-detail-section"><h3>Assignment</h3><div class="ui-detail-list"><div><span>Driver</span><strong>${esc(d?.name||'Unassigned')}</strong></div><div><span>Route</span><strong>${esc(v.route)}</strong></div><div><span>Charger</span><strong>${esc(v.charger||'—')}</strong></div><div><span>Allocated power</span><strong>${v.power?`${v.power} kW`:'—'}</strong></div><div><span>Priority</span><strong class="text-capitalize">${esc(v.priority)}</strong></div></div></section>
  <section class="ui-detail-section"><h3>Charging context</h3><div class="ui-detail-list"><div><span>Required energy</span><strong>${energyNeeded(v)} kWh</strong></div><div><span>Charger health</span><strong>${c?`${c.health}%`:'—'}</strong></div><div><span>Active session</span><strong>${ses?ses.id:'None'}</strong></div><div><span>Schedule</span><strong>${sch?`${sch.departure} – ${sch.return}`:'No schedule'}</strong></div></div></section>`;
 $('drawer-actions').innerHTML=`<button class="button button--secondary" data-action="assign" type="button">${v.charger==='—'?'Assign charger':'Reassign charger'}</button><button class="button button--secondary" data-action="target" type="button">Change target</button><button class="button button--primary" data-action="priority" type="button">Set priority</button>`;
 $('drawer-actions').querySelectorAll('[data-action]').forEach(b=>b.addEventListener('click',()=>openAction(b.dataset.action,id)));
}
function openDrawer(id){renderDrawer(id);drawerBackdrop.hidden=false;requestAnimationFrame(()=>{drawer.classList.add('is-open');drawerBackdrop.classList.add('is-visible');drawer.setAttribute('aria-hidden','false');});}
function closeDrawer(){drawer.classList.remove('is-open');drawerBackdrop.classList.remove('is-visible');drawer.setAttribute('aria-hidden','true');setTimeout(()=>drawerBackdrop.hidden=true,180);}

function actionMenu(id,anchor){
 document.querySelector('.ops-popover')?.remove();
 const v=state.vehicles.find(x=>x.id===id); const pop=document.createElement('div');pop.className='ops-popover';
 pop.innerHTML=`<button data-pop="details">View details</button><button data-pop="priority">Set priority</button><button data-pop="assign">${v.charger==='—'?'Assign charger':'Reassign charger'}</button><button data-pop="target">Change target SOC</button>${v.status==='queued'?'<button data-pop="remove-queue">Remove from queue</button>':'<button data-pop="queue">Add to queue</button>'}`;
 document.body.appendChild(pop);const r=anchor.getBoundingClientRect();pop.style.top=`${Math.min(window.innerHeight-pop.offsetHeight-12,r.bottom+6)}px`;pop.style.left=`${Math.max(12,r.right-pop.offsetWidth)}px`;
 pop.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{const a=b.dataset.pop;pop.remove();if(a==='details')openDrawer(id);else if(a==='queue')addToQueue(id);else if(a==='remove-queue')removeFromQueue(id);else openAction(a,id);}));
 setTimeout(()=>document.addEventListener('click',function close(e){if(!pop.contains(e.target)&&e.target!==anchor){pop.remove();document.removeEventListener('click',close)}},{capture:true}),0);
}
function bindTableEvents(){
 $('operations-table').querySelectorAll('tr[data-open-vehicle]').forEach(row=>row.addEventListener('click',e=>{if(e.target.closest('button'))return;openDrawer(row.dataset.openVehicle);}));
 $('operations-table').querySelectorAll('[data-menu]').forEach(btn=>btn.addEventListener('click',e=>{e.stopPropagation();actionMenu(btn.dataset.menu,btn);}));
}
function availableChargersFor(v){return state.chargers.filter(c=>['available','reserved'].includes(c.status)||c.vehicle===v.id);}
function openAction(action,id){
 const v=state.vehicles.find(x=>x.id===id); if(!v)return;pendingAction={action,id};
 const title=$('dialog-title'),desc=$('dialog-description'),body=$('dialog-body'),confirm=$('dialog-confirm');
 if(action==='priority'){
  $('dialog-kicker').textContent='CHARGING PRIORITY';title.textContent=`Set priority · ${v.id}`;desc.textContent='Priority affects automatic power allocation and queue order.';
  body.innerHTML=`<div class="ops-choice-grid">${['critical','high','normal','low'].map(p=>`<label class="ops-choice ${v.priority===p?'is-selected':''}"><input type="radio" name="priority" value="${p}" ${v.priority===p?'checked':''}><strong>${p[0].toUpperCase()+p.slice(1)}</strong><span>${({critical:'Departure-critical; allocate power first',high:'Prioritize ahead of normal fleet',normal:'Standard fleet charging order',low:'Charge when capacity is available'})[p]}</span></label>`).join('')}</div>`;confirm.textContent='Save priority';
 } else if(action==='assign'){
  const chargers=availableChargersFor(v);$('dialog-kicker').textContent='CHARGER ASSIGNMENT';title.textContent=`Assign charger · ${v.id}`;desc.textContent='Choose an available charger. Existing assignment will be released automatically.';
  body.innerHTML=chargers.length?`<div class="ops-charger-options">${chargers.map(c=>`<label class="ops-charger-option ${v.charger===c.id?'is-selected':''}"><input type="radio" name="charger" value="${c.id}" ${v.charger===c.id?'checked':''}><span><strong>${c.id}</strong><small>${c.type} · ${c.power} kW · Bay ${c.bay}</small></span><span class="ui-pill status-pill status-${c.status==='available'?'available':'reserved'}">${c.status}</span></label>`).join('')}</div>`:'<div class="ops-dialog-empty">No compatible available chargers in this prototype.</div>';confirm.textContent='Confirm assignment';confirm.disabled=!chargers.length;
 } else if(action==='target'){
  $('dialog-kicker').textContent='TARGET SOC';title.textContent=`Change target · ${v.id}`;desc.textContent='Set the battery level required before departure.';
  body.innerHTML=`<div class="ops-target-control"><div><span>Current SOC</span><strong>${v.battery}%</strong></div><label><span>Target SOC</span><output id="target-output">${v.target}%</output><input id="target-range" type="range" min="${Math.max(v.battery,50)}" max="100" step="5" value="${v.target}"></label><p>Required energy estimate will be recalculated for the prototype after saving.</p></div>`;confirm.textContent='Save target';$('target-range').addEventListener('input',e=>$('target-output').textContent=`${e.target.value}%`);
 }
 dialog.showModal();
}
function releaseCurrentCharger(v){if(!v.charger||v.charger==='—')return;const old=chargerFor(v.charger);if(old){old.status='available';old.vehicle=null;}v.charger='—';v.power=0;}
function applyAction() {
  if (!pendingAction) return;

  const { action, id } = pendingAction;
  const v = state.vehicles.find((x) => x.id === id);
  if (!v) return;

  if (action === 'priority') {
    const checkedPriority = document.querySelector('input[name="priority"]:checked');
    const value = checkedPriority ? checkedPriority.value : '';
    if (!value) return;

    v.priority = value;
    saveAndRender(`${v.id} priority changed to ${value}.`);
  } else if (action === 'assign') {
    const checkedCharger = document.querySelector('input[name="charger"]:checked');
    const cid = checkedCharger ? checkedCharger.value : '';
    if (!cid) return;

    releaseCurrentCharger(v);
    const c = chargerFor(cid);
    if (!c) return;

    c.status = 'busy';
    c.vehicle = v.id;
    v.charger = cid;
    v.power = Math.min(
      c.power,
      v.priority === 'critical' ? Math.round(c.power * 0.86) : Math.round(c.power * 0.72)
    );
    v.status = 'charging';

    const sess = sessionFor(v.id);
    if (sess) {
      sess.charger = cid;
      sess.power = v.power;
    } else {
      const driver = driverFor(v.id);
      state.sessions.unshift({
        id: `CS-${Date.now().toString().slice(-6)}`,
        vehicle: v.id,
        driver: driver ? driver.id : '—',
        charger: cid,
        connector: c.type === 'DC' ? 'CCS2' : 'Type 2',
        start: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
        duration: '00:00',
        energy: 0,
        power: v.power,
        cost: 0,
        status: 'active',
        socStart: v.battery,
        socNow: v.battery,
        target: v.target
      });
    }

    state.energy.currentKw = Math.min(
      state.energy.capacityKw,
      state.vehicles.reduce((sum, x) => sum + (Number(x.power) || 0), 0) + 118
    );
    saveAndRender(`${v.id} assigned to ${cid}.`);
  } else if (action === 'target') {
    const targetRange = $('target-range');
    const target = Number(targetRange ? targetRange.value : 0);
    if (!target) return;

    const previous = v.target;
    v.target = target;
    v.requiredKwh = Math.max(0, Math.round((target - v.battery) * 0.72));

    const sch = scheduleFor(v.id);
    if (sch) sch.target = target;

    const ses = sessionFor(v.id);
    if (ses) ses.target = target;

    saveAndRender(`${v.id} target changed from ${previous}% to ${target}%.`);
  }

  dialog.close();
  pendingAction = null;
}

function addToQueue(id){const v=state.vehicles.find(x=>x.id===id);if(!v)return;releaseCurrentCharger(v);v.status='queued';state.sessions.filter(s=>s.vehicle===id&&s.status==='active').forEach(s=>{s.status='completed';s.power=0;});saveAndRender(`${v.id} added to charging queue.`);}
function removeFromQueue(id){const v=state.vehicles.find(x=>x.id===id);if(!v)return;v.status=v.battery>=v.target?'ready':'queued';saveAndRender(v.battery>=v.target?`${v.id} is already ready.`:`${v.id} remains unassigned; assign a charger to start charging.`);}
function openQueueManager(){
 const queued=state.vehicles.filter(v=>v.status==='queued').sort((a,b)=>priorityRank[a.priority]-priorityRank[b.priority]||minutes(a.departure)-minutes(b.departure));
 pendingAction={action:'queue-manager'};$('dialog-kicker').textContent='CHARGING QUEUE';$('dialog-title').textContent='Manage queue';$('dialog-description').textContent='Vehicles are ordered by priority and departure time.';
 $('dialog-body').innerHTML=queued.length?`<div class="ops-queue-manager">${queued.map((v,i)=>`<div><span class="queue-position">${i+1}</span><span><strong>${v.id} · ${esc(v.name)}</strong><small>${v.battery}% → ${v.target}% · ${v.route} · dep. ${v.departure}</small></span><span class="ui-pill priority-pill priority-${v.priority}">${v.priority}</span><button class="action-button" data-queue-assign="${v.id}" type="button">Assign</button></div>`).join('')}</div>`:'<div class="ops-dialog-empty">Charging queue is empty.</div>';
 $('dialog-confirm').style.display='none';dialog.showModal();$('dialog-body').querySelectorAll('[data-queue-assign]').forEach(b=>b.addEventListener('click',()=>{dialog.close();$('dialog-confirm').style.display='';openAction('assign',b.dataset.queueAssign);}));
}

[search,statusFilter,groupFilter,sortFilter].forEach(el=>el.addEventListener(el===search?'input':'change',renderTable));
$('drawer-close').addEventListener('click',closeDrawer);drawerBackdrop.addEventListener('click',closeDrawer);
$('dialog-confirm').addEventListener('click',applyAction);dialog.addEventListener('close',()=>{$('dialog-confirm').disabled=false;$('dialog-confirm').style.display='';pendingAction=null;});
$('open-queue').addEventListener('click',openQueueManager);$('open-queue-secondary').addEventListener('click',openQueueManager);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&drawer.classList.contains('is-open'))closeDrawer();});

renderAll();
