import {loadState,saveState} from '../core/fleet-state.js';
import {initCommon} from '../layout/common.js';
import {sessionContext,contextUrl} from '../core/context-navigation.js';

const access=initCommon();
if(!access.denied){

let state=loadState();
let currentFilter='all';
let activeSessionId=null;
let toastTimer=null;

const $=id=>document.getElementById(id);
const els={
  table:$('session-table'), search:$('session-search'), sort:$('session-sort'), count:$('session-visible-count'),
  drawer:$('session-drawer'), backdrop:$('session-drawer-backdrop'), drawerBody:$('session-drawer-body'),
  drawerTitle:$('session-drawer-title'), drawerSubtitle:$('session-drawer-subtitle'), primary:$('session-primary-action'),
  stopDialog:$('session-stop-dialog'), stopForm:$('session-stop-form'), stopReason:$('session-stop-reason'), toast:$('session-toast')
};

const metaDefaults={
  'CS-261842':{maxPower:150,payment:'preauthorized',tariff:128,reservation:'RS-84017',stopReason:'Charging in progress',error:null,curve:[42,71,96,118,124,121,118],events:[['12:08','Authorized','Fleet account and vehicle verified.'],['12:09','Charging started','DC-01 began delivering energy.'],['12:21','Power ramped','Session reached 118 kW.']]},
  'CS-261841':{maxPower:120,payment:'preauthorized',tariff:128,reservation:'RS-84018',stopReason:'Charging in progress',error:null,curve:[38,58,77,89,96,94,92],events:[['12:21','Authorized','Driver DR-03 authenticated.'],['12:22','Charging started','Connector locked successfully.'],['12:37','Load adjusted','Depot optimizer set power to 92 kW.']]},
  'CS-261840':{maxPower:120,payment:'preauthorized',tariff:128,reservation:'—',stopReason:'Charging in progress',error:null,curve:[31,46,60,71,78,80,78],events:[['12:34','Authorized','Vehicle AM-104 accepted for priority charging.'],['12:35','Charging started','DC-04 session started.'],['12:48','Readiness warning','Projected SOC remains below departure target.']]},
  'CS-261839':{maxPower:22,payment:'preauthorized',tariff:128,reservation:'—',stopReason:'Charging in progress',error:null,curve:[18,20,22,22,22,22,22],events:[['11:18','Authorized','Fleet driver authenticated.'],['11:19','Charging started','AC-07 started at 18 kW.'],['11:26','Stable charging','Session reached 22 kW.']]},
  'CS-261832':{maxPower:150,payment:'paid',tariff:128,reservation:'—',end:'08:42',stopReason:'Vehicle charging target reached',error:null,curve:[49,82,112,132,118,76,38],events:[['08:01','Authorized','Fleet account verified.'],['08:02','Charging started','DC-02 began charging.'],['08:38','Power tapered','Battery management reduced charging power.'],['08:42','Session completed','Final meter value received and payment posted.']]},
  'CS-261821':{maxPower:120,payment:'paid',tariff:128,reservation:'—',end:'07:50',stopReason:'Driver stopped after target SOC',error:null,curve:[44,69,91,109,103,71,31],events:[['07:14','Authorized','Driver DR-05 authenticated.'],['07:15','Charging started','DC-03 started delivering energy.'],['07:49','Stop requested','Driver requested session completion.'],['07:50','Session completed','Final charge posted to fleet billing.']]},
  'CS-261811':{maxPower:22,payment:'failed',tariff:128,reservation:'—',end:'06:50',stopReason:'Connector communication failure',error:'EVSE-CC-07 · Connector communication timeout',curve:[6,11,16,18,12,4,0],events:[['06:43','Authorized','Fleet credentials accepted.'],['06:44','Charging started','AC-06 started session.'],['06:49','Connector fault','Communication with vehicle was interrupted.'],['06:50','Session failed','Charging stopped automatically and charger was flagged.']]}
};

function normalizeSession(x){
  const m=metaDefaults[x.id]||{};
  return {
    maxPower:x.maxPower??m.maxPower??Math.max(x.power||0,22),
    payment:x.payment??m.payment??(x.status==='completed'?'paid':x.status==='failed'?'failed':'preauthorized'),
    tariff:x.tariff??m.tariff??128,
    reservation:x.reservation??m.reservation??'—',
    end:x.end??m.end??'—',
    stopReason:x.stopReason??m.stopReason??(x.status==='active'?'Charging in progress':'Session completed'),
    error:x.error??m.error??null,
    curve:Array.isArray(x.curve)&&x.curve.length?x.curve:(m.curve||[0,x.power||0]),
    events:Array.isArray(x.events)&&x.events.length?x.events:(m.events||[]),
    ...x
  };
}

function vehicleFor(session){return state.vehicles.find(v=>v.id===session.vehicle)||null;}
function driverFor(session){return state.drivers.find(d=>d.id===session.driver)||null;}
function statusLabel(status){return status==='active'?'Active':status==='completed'?'Completed':'Failed';}
function statusClass(status){return status==='active'?'charging':status==='completed'?'ready':'risk';}
function paymentLabel(payment){return payment==='preauthorized'?'Preauthorized':payment==='paid'?'Paid':'Failed';}
function paymentClass(payment){return payment==='preauthorized'?'reserved':payment==='paid'?'ready':'risk';}
function money(value){return `${Number(value||0).toLocaleString('en-US')} AMD`;}
function pct(value,target){return Math.min(100,Math.round((Number(value||0)/Math.max(1,Number(target||100)))*100));}
function escapeHtml(value){return String(value??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));}

function curveSvg(values){
  const data=values.map(Number).filter(Number.isFinite);
  if(data.length<2)return '<div class="session-chart-empty">No charging curve data.</div>';
  const width=600,height=170,padX=18,padY=18,max=Math.max(1,...data);
  const points=data.map((v,i)=>{
    const x=padX+(i/(data.length-1))*(width-padX*2);
    const y=height-padY-(v/max)*(height-padY*2);
    return [x,y];
  });
  const path=points.map(([x,y],i)=>`${i?'L':'M'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const area=`${path} L ${points.at(-1)[0].toFixed(1)} ${height-padY} L ${points[0][0].toFixed(1)} ${height-padY} Z`;
  return `<svg class="session-chart__svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Charging power curve"><defs><linearGradient id="sessionArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3B82F6" stop-opacity=".28"/><stop offset="1" stop-color="#3B82F6" stop-opacity=".02"/></linearGradient></defs><line x1="${padX}" x2="${width-padX}" y1="${height-padY}" y2="${height-padY}" class="session-chart__axis"/><path d="${area}" fill="url(#sessionArea)"/><path d="${path}" class="session-chart__line"/>${points.map(([x,y],i)=>`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5" class="session-chart__point"><title>${data[i]} kW</title></circle>`).join('')}</svg><div class="session-chart__labels"><span>Start</span><strong>Peak ${max} kW</strong><span>${data.at(-1)} kW latest</span></div>`;
}

function filteredSessions(){
  const needle=(els.search?.value||'').trim().toLowerCase();
  let list=(state.sessions||[]).map(normalizeSession).filter(x=>{
    const driver=driverFor(x),vehicle=vehicleFor(x);
    const hay=[x.id,x.vehicle,vehicle?.name,x.driver,driver?.name,x.charger,x.connector,x.status].join(' ').toLowerCase();
    return (currentFilter==='all'||x.status===currentFilter)&&(!needle||hay.includes(needle));
  });
  const sort=els.sort?.value||'recent';
  if(sort==='energy')list.sort((a,b)=>b.energy-a.energy);
  else if(sort==='cost')list.sort((a,b)=>b.cost-a.cost);
  else if(sort==='power')list.sort((a,b)=>(b.power||0)-(a.power||0));
  else list.sort((a,b)=>Number(b.id.replace(/\D/g,''))-Number(a.id.replace(/\D/g,'')));
  return list;
}

function updateSummary(){
  const sessions=(state.sessions||[]).map(normalizeSession);
  $('session-active').textContent=sessions.filter(x=>x.status==='active').length;
  $('session-completed').textContent=sessions.filter(x=>x.status==='completed').length;
  $('session-failed').textContent=sessions.filter(x=>x.status==='failed').length;
  $('session-energy').textContent=`${sessions.reduce((a,x)=>a+Number(x.energy||0),0).toFixed(1)} kWh`;
  $('session-cost').textContent=money(sessions.reduce((a,x)=>a+Number(x.cost||0),0));
  const live=sessions.filter(x=>x.status==='active').length;
  $('session-live-chip').textContent=live?`${live} live session${live===1?'':'s'}`:'No live sessions';
}

function render(){
  updateSummary();
  const data=filteredSessions();
  els.count.textContent=data.length;
  els.table.innerHTML=data.map(x=>{
    const driver=driverFor(x),vehicle=vehicleFor(x);
    return `<tr class="session-row session-row--${x.status} ${x.status==='failed'?'session-row--failed':''}" data-session-row="${x.id}">
      <td><div class="entity-main session-id-cell"><strong>${escapeHtml(x.id)}</strong><span>${escapeHtml(x.start)} · ${escapeHtml(x.duration)}</span></div></td>
      <td><div class="entity-main"><strong>${escapeHtml(x.vehicle)}${vehicle?` · ${escapeHtml(vehicle.name)}`:''}</strong><span>${driver?escapeHtml(driver.name):escapeHtml(x.driver||'Unassigned driver')}</span></div></td>
      <td><div class="entity-main"><strong>${escapeHtml(x.charger)}</strong><span>${escapeHtml(x.connector)}</span></div></td>
      <td><div class="session-progress"><div class="session-progress__meta"><span>${x.socStart}%</span><strong>${x.socNow}% / ${x.target}%</strong></div><div class="session-progress__track"><span style="width:${pct(x.socNow,x.target)}%"></span></div></div></td>
      <td><div class="entity-main"><strong>${Number(x.energy).toFixed(1)} kWh</strong><span>${x.status==='active'?'Delivered so far':'Final meter value'}</span></div></td>
      <td><div class="entity-main"><strong>${x.power?`${x.power} kW`:'—'}</strong><span>Max ${x.maxPower} kW</span></div></td>
      <td><div class="entity-main"><strong>${money(x.cost)}</strong><span>${paymentLabel(x.payment)}</span></div></td>
      <td><span class="ui-pill status-pill status-${statusClass(x.status)}">${statusLabel(x.status)}</span></td>
      <td><button class="ui-row-menu" type="button" data-open-session="${x.id}" aria-label="Open ${x.id}">•••</button></td>
    </tr>`;
  }).join('')||'<tr><td colspan="9"><div class="ops-empty">No charging sessions match these filters.</div></td></tr>';

  document.querySelectorAll('[data-open-session]').forEach(btn=>btn.addEventListener('click',e=>{e.stopPropagation();openDrawer(btn.dataset.openSession);}));
  document.querySelectorAll('[data-session-row]').forEach(row=>row.addEventListener('dblclick',()=>openDrawer(row.dataset.sessionRow)));
}

function eventTimeline(session){
  const events=session.events||[];
  if(!events.length)return '<div class="ops-empty-inline">No session events recorded.</div>';
  return `<div class="session-timeline">${events.map((ev,i)=>`<div class="session-timeline__item"><div class="session-timeline__rail"><span class="session-timeline__dot ${i===events.length-1?'is-current':''}"></span></div><time>${escapeHtml(ev[0])}</time><div><strong>${escapeHtml(ev[1])}</strong><span>${escapeHtml(ev[2])}</span></div></div>`).join('')}</div>`;
}

function openDrawer(id){
  const raw=(state.sessions||[]).find(x=>x.id===id);
  if(!raw)return;
  const session=normalizeSession(raw),vehicle=vehicleFor(session),driver=driverFor(session);
  const ctx=sessionContext({...state,sessions:(state.sessions||[]).map(normalizeSession)},id);
  activeSessionId=id;
  els.drawerTitle.textContent=session.id;
  els.drawerSubtitle.textContent=`${session.vehicle} · ${session.charger} · ${session.connector}`;
  els.drawerBody.innerHTML=`
    ${session.error?`<div class="ui-risk-banner"><strong>Session interruption detected</strong><span>${escapeHtml(session.error)}</span></div>`:''}
    <section class="session-detail-hero">
      <div class="session-detail-soc"><span>Battery</span><strong>${session.socNow}%</strong><div class="session-progress__track"><span style="width:${pct(session.socNow,session.target)}%"></span></div><small>${session.socStart}% start · target ${session.target}%</small></div>
      <div class="session-detail-live"><span class="ui-pill status-pill status-${statusClass(session.status)}">${statusLabel(session.status)}</span><strong>${session.status==='active'?`${session.power} kW`:Number(session.energy).toFixed(1)+' kWh'}</strong><small>${session.status==='active'?'current charging power':'energy delivered'}</small></div>
    </section>
    <section class="ui-detail-section"><h3>Session overview</h3><div class="ui-detail-grid"><div><span>Vehicle</span><strong>${escapeHtml(session.vehicle)}${vehicle?` · ${escapeHtml(vehicle.name)}`:''}</strong></div><div><span>Driver</span><strong>${driver?escapeHtml(driver.name):escapeHtml(session.driver||'—')}</strong></div><div><span>Charger</span><strong>${escapeHtml(session.charger)}</strong></div><div><span>Connector</span><strong>${escapeHtml(session.connector)}</strong></div><div><span>Started</span><strong>${escapeHtml(session.start)}</strong></div><div><span>Ended</span><strong>${escapeHtml(session.end)}</strong></div><div><span>Duration</span><strong>${escapeHtml(session.duration)}</strong></div><div><span>Reservation</span><strong>${escapeHtml(session.reservation)}</strong></div></div></section>
    <section class="ui-detail-section"><h3>Energy & battery</h3><div class="ui-detail-grid"><div><span>Start SOC</span><strong>${session.socStart}%</strong></div><div><span>Current / final SOC</span><strong>${session.socNow}%</strong></div><div><span>Target SOC</span><strong>${session.target}%</strong></div><div><span>Delivered energy</span><strong>${Number(session.energy).toFixed(1)} kWh</strong></div><div><span>Current power</span><strong>${session.power?`${session.power} kW`:'—'}</strong></div><div><span>Maximum power</span><strong>${session.maxPower} kW</strong></div></div></section>
    <section class="ui-detail-section"><div class="session-section-head"><div><h3>Charging curve</h3><span>Power delivered during the session</span></div><strong>${session.curve.length} samples</strong></div><div class="session-chart">${curveSvg(session.curve)}</div></section>
    <section class="ui-detail-section"><h3>Billing</h3><div class="ui-detail-grid"><div><span>Session cost</span><strong>${money(session.cost)}</strong></div><div><span>Payment status</span><strong><span class="ui-pill status-pill status-${paymentClass(session.payment)}">${paymentLabel(session.payment)}</span></strong></div><div><span>Applied tariff</span><strong>${session.tariff} AMD / kWh</strong></div><div><span>Billing source</span><strong>Corporate fleet account</strong></div></div></section>
    <section class="ui-detail-section"><h3>Completion & diagnostics</h3><div class="ui-detail-list"><div><span>Stop reason</span><strong>${escapeHtml(session.stopReason)}</strong></div><div><span>Error</span><strong class="${session.error?'text-danger':''}">${session.error?escapeHtml(session.error):'No errors recorded'}</strong></div></div></section>
    <section class="ui-detail-section"><div class="session-section-head"><div><h3>Event log</h3><span>Operational history for this session</span></div></div>${eventTimeline(session)}</section>
    <section class="ui-detail-section"><h3>Related records</h3><div class="ui-inline-actions">${ctx.driver?`<a class="button button--secondary" href="${contextUrl('drivers.html',{driver:ctx.driver.id})}">Driver</a>`:''}${ctx.schedule?`<a class="button button--secondary" href="${contextUrl('schedules.html',{schedule:ctx.schedule.id})}">Schedule</a>`:''}${ctx.reservation?`<a class="button button--secondary" href="${contextUrl('reservations.html',{reservation:ctx.reservation.id})}">Reservation</a>`:''}<a class="button button--secondary" href="${contextUrl('operations.html',{vehicle:session.vehicle})}">Operations</a></div></section>`;

  els.primary.hidden=false;
  if(session.status==='active'){els.primary.textContent='Stop session';els.primary.dataset.action='stop';}
  else if(session.status==='completed'){els.primary.textContent='Download receipt';els.primary.dataset.action='receipt';}
  else{els.primary.textContent='Open alerts';els.primary.dataset.action='alerts';}
  els.backdrop.hidden=false;
  requestAnimationFrame(()=>els.backdrop.classList.add('is-visible'));
  els.drawer.classList.add('is-open');
  els.drawer.setAttribute('aria-hidden','false');
}

function closeDrawer(){
  els.drawer.classList.remove('is-open');
  els.drawer.setAttribute('aria-hidden','true');
  els.backdrop.classList.remove('is-visible');
  setTimeout(()=>{els.backdrop.hidden=true;},180);
}

function openStopDialog(){
  const raw=(state.sessions||[]).find(x=>x.id===activeSessionId);
  if(!raw||raw.status!=='active')return;
  $('session-stop-copy').textContent=`${raw.id} on ${raw.charger} is currently charging ${raw.vehicle} at ${raw.power} kW.`;
  els.stopDialog.showModal();
}

function stopSession(){
  const raw=(state.sessions||[]).find(x=>x.id===activeSessionId);
  if(!raw||raw.status!=='active')return;
  const reason=els.stopReason?.value||'Stopped by Fleet Manager';
  raw.status='completed';raw.payment='paid';raw.stopReason=reason;raw.end='Now';raw.power=0;
  raw.events=[...(raw.events||metaDefaults[raw.id]?.events||[]),['Now','Stop requested',reason],['Now','Session completed','Final meter value stored and fleet billing updated.']];
  const vehicle=state.vehicles.find(v=>v.id===raw.vehicle);
  if(vehicle){vehicle.power=0;vehicle.charger='—';vehicle.status=vehicle.battery>=vehicle.target?'ready':'queued';}
  const charger=state.chargers.find(c=>c.id===raw.charger);
  if(charger){charger.status='available';charger.vehicle=null;}
  state.energy.currentKw=Math.max(0,state.vehicles.filter(v=>v.status==='charging').reduce((sum,v)=>sum+Number(v.power||0),0)+86);
  saveState(state);
  render();openDrawer(raw.id);notify('Charging session stopped and finalized.');
}

function downloadReceipt(){
  const raw=(state.sessions||[]).find(x=>x.id===activeSessionId);
  if(!raw)return;
  const s=normalizeSession(raw),vehicle=vehicleFor(s),driver=driverFor(s);
  const content=[
    'VoltDrive Fleet — Charging Receipt',
    `Session: ${s.id}`,
    `Vehicle: ${s.vehicle}${vehicle?` · ${vehicle.name}`:''}`,
    `Driver: ${driver?driver.name:s.driver}`,
    `Charger: ${s.charger} · ${s.connector}`,
    `Start: ${s.start}`,
    `End: ${s.end}`,
    `Energy: ${Number(s.energy).toFixed(1)} kWh`,
    `Cost: ${money(s.cost)}`,
    `Payment: ${paymentLabel(s.payment)}`,
    `Stop reason: ${s.stopReason}`
  ].join('\n');
  const blob=new Blob([content],{type:'text/plain;charset=utf-8'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=`${s.id}-receipt.txt`;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);notify('Receipt downloaded.');
}

function notify(message){
  if(!els.toast)return;
  clearTimeout(toastTimer);els.toast.textContent=message;els.toast.classList.add('is-visible');
  toastTimer=setTimeout(()=>els.toast.classList.remove('is-visible'),2300);
}

els.search?.addEventListener('input',render);
els.sort?.addEventListener('change',render);
document.querySelectorAll('[data-session-filter]').forEach(btn=>btn.addEventListener('click',()=>{
  document.querySelectorAll('[data-session-filter]').forEach(x=>x.classList.remove('is-active'));
  btn.classList.add('is-active');currentFilter=btn.dataset.sessionFilter;render();
}));
$('session-drawer-close')?.addEventListener('click',closeDrawer);
els.backdrop?.addEventListener('click',closeDrawer);
$('session-open-vehicle')?.addEventListener('click',()=>{const raw=(state.sessions||[]).find(x=>x.id===activeSessionId);if(raw)location.href=contextUrl('vehicles.html',{vehicle:raw.vehicle});});
$('session-open-charger')?.addEventListener('click',()=>{const raw=(state.sessions||[]).find(x=>x.id===activeSessionId);if(raw)location.href=contextUrl('depot.html',{charger:raw.charger});});
els.primary?.addEventListener('click',()=>{
  const action=els.primary.dataset.action;
  if(action==='stop')openStopDialog();else if(action==='receipt')downloadReceipt();else if(action==='alerts'){
    const raw=(state.sessions||[]).find(x=>x.id===activeSessionId);
    const related=raw?(state.alerts||[]).find(a=>a.sessionId===raw.id||a.chargerId===raw.charger||`${a.title||''} ${a.body||''}`.includes(raw.charger)||`${a.title||''} ${a.body||''}`.includes(raw.vehicle)):null;
    location.href=related?`./alerts.html?alert=${encodeURIComponent(related.id)}`:'./alerts.html';
  }
});
els.stopForm?.addEventListener('submit',e=>{if(e.submitter?.id==='confirm-session-stop')stopSession();});

const params=new URLSearchParams(location.search);
const vehicleParam=params.get('vehicle');
const chargerParam=params.get('charger');
const sessionParam=params.get('session');
if(vehicleParam&&els.search)els.search.value=vehicleParam;
else if(chargerParam&&els.search)els.search.value=chargerParam;
render();
if(sessionParam)openDrawer(sessionParam);
}
