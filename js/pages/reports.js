import {loadState,statusLabel} from '../core/fleet-state.js';
import {initCommon} from '../layout/common.js';

initCommon();
const s=loadState();
const $=id=>document.getElementById(id);
const numberFormatter=new Intl.NumberFormat('en-US');
const decimalFormatter=new Intl.NumberFormat('en-US',{maximumFractionDigits:1});
const money=n=>`${numberFormatter.format(Math.round(Number(n)||0))} AMD`;
const num=(n,d=0)=>d===1?decimalFormatter.format(Number(n)||0):numberFormatter.format(Math.round(Number(n)||0));
const esc=value=>String(value??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const MAX_RENDER_ROWS=250;

const els={
  period:$('report-period'),department:$('report-department'),vehicle:$('report-vehicle'),driver:$('report-driver'),charger:$('report-charger'),
  energy:$('report-energy'),cost:$('report-cost'),costKwh:$('report-cost-kwh'),readiness:$('report-readiness'),utilization:$('report-utilization'),failureRate:$('report-failure-rate'),
  vehicleRows:$('report-vehicle-rows'),chargerRows:$('report-charger-rows'),scheduleRows:$('report-schedule-rows'),drawer:$('report-drawer'),backdrop:$('report-drawer-backdrop'),toast:$('report-toast')
};

const periodConfig={
  day:{label:'Today',factor:1,points:8,pointLabels:['06','08','10','12','14','16','18','20']},
  week:{label:'Last 7 days',factor:4.9,points:7,pointLabels:['Fri','Sat','Sun','Mon','Tue','Wed','Thu']},
  month:{label:'Last 30 days',factor:19.8,points:10,pointLabels:['15','18','21','24','27','30','02','05','08','13']},
  quarter:{label:'Last 90 days',factor:57.6,points:12,pointLabels:['May','May','Jun','Jun','Jun','Jul','Jul','Jul','Aug','Aug','Aug','Aug']}
};
const trendPattern=[.72,.91,.84,1.08,.96,1.16,.88,1.03,.78,1.12,.94,1.06];
let trendMode='energy';
let drawerEntity=null;
let renderQueued=false;
let renderBusy=false;

const vehicles=Array.isArray(s.vehicles)?s.vehicles:[];
const drivers=Array.isArray(s.drivers)?s.drivers:[];
const sessions=Array.isArray(s.sessions)?s.sessions:[];
const schedules=Array.isArray(s.schedules)?s.schedules:[];
const reimbursements=Array.isArray(s.reimbursements)?s.reimbursements:[];
const chargers=Array.isArray(s.chargers)?s.chargers:[];
const vehicleById=new Map(vehicles.map(v=>[v.id,v]));
const driverById=new Map(drivers.map(d=>[d.id,d]));
const driverByVehicle=new Map();
drivers.forEach(d=>{if(d.vehicle&&!driverByVehicle.has(d.vehicle))driverByVehicle.set(d.vehicle,d)});
function driverForVehicle(vehicleId){return driverByVehicle.get(vehicleId)||null}
function departmentForVehicle(vehicleId){return driverForVehicle(vehicleId)?.department||'Unassigned'}
function selectedPeriod(){return periodConfig[els.period?.value]||periodConfig.week}

function buildMetrics(){
  const cfg=selectedPeriod();
  const department=els.department?.value||'all';
  const vehicleFilter=els.vehicle?.value||'all';
  const driverFilter=els.driver?.value||'all';
  const chargerFilter=els.charger?.value||'all';

  let scopedVehicles=vehicles.filter(v=>v.active!==false);
  if(department!=='all') scopedVehicles=scopedVehicles.filter(v=>departmentForVehicle(v.id)===department);
  if(vehicleFilter!=='all') scopedVehicles=scopedVehicles.filter(v=>v.id===vehicleFilter);
  if(driverFilter!=='all'){
    const driver=driverById.get(driverFilter);
    scopedVehicles=driver?.vehicle?scopedVehicles.filter(v=>v.id===driver.vehicle):[];
  }
  const vehicleIds=new Set(scopedVehicles.map(v=>v.id));

  const scopedSessions=sessions.filter(x=>vehicleIds.has(x.vehicle)&&(driverFilter==='all'||x.driver===driverFilter)&&(chargerFilter==='all'||x.charger===chargerFilter));
  const scopedReimbursements=reimbursements.filter(x=>vehicleIds.has(x.vehicle)&&(driverFilter==='all'||x.driver===driverFilter));
  const scopedSchedules=schedules.filter(x=>vehicleIds.has(x.vehicle));

  let scopedChargers;
  if(chargerFilter!=='all') scopedChargers=chargers.filter(c=>c.id===chargerFilter);
  else if(vehicleFilter!=='all'||driverFilter!=='all'||department!=='all'){
    const used=new Set(scopedSessions.map(x=>x.charger));
    scopedVehicles.forEach(v=>{if(v.charger&&v.charger!=='—')used.add(v.charger)});
    scopedChargers=chargers.filter(c=>used.has(c.id));
  }else scopedChargers=chargers;

  const factor=cfg.factor;
  const sessionEnergy=scopedSessions.reduce((a,x)=>a+(Number(x.energy)||0),0)*factor;
  const homeFactor=Math.max(1,factor*.55);
  const homeEnergy=scopedReimbursements.reduce((a,x)=>a+(Number(x.energy)||0),0)*homeFactor;
  const energy=sessionEnergy+homeEnergy;
  const sessionCost=scopedSessions.reduce((a,x)=>a+(Number(x.cost)||0),0)*factor;
  const homeCost=scopedReimbursements.reduce((a,x)=>a+(Number(x.amount)||0),0)*homeFactor;
  const cost=sessionCost+homeCost;
  const failed=scopedSessions.filter(x=>x.status==='failed').length;
  const readinessPool=scopedSchedules.length?scopedSchedules:scopedVehicles;
  const readyCount=readinessPool.filter(item=>{
    const v=vehicleById.get(item.vehicle||item.id);
    return item.status!=='risk'&&item.status!=='conflict'&&v&&(v.status==='ready'||Number(v.battery)>=Number(item.target??v.target));
  }).length;
  const readinessScore=readinessPool.length?readyCount/readinessPool.length*100:0;
  const util=scopedChargers.length?scopedChargers.reduce((a,c)=>a+(c.status==='busy'?1:(c.status==='reserved'?0.65:0)),0)/scopedChargers.length*100:0;

  const result={cfg,factor,homeFactor,sessions:scopedSessions,reimbursements:scopedReimbursements,vehicles:scopedVehicles,schedules:scopedSchedules,chargers:scopedChargers,sessionEnergy,homeEnergy,energy,sessionCost,homeCost,cost,failed,readiness:readinessScore,util,costKwh:energy?cost/energy:0};
  return result;
}

function populateFilters(){
  const departments=[...new Set(drivers.map(d=>d.department).filter(Boolean))].sort();
  if(els.department) els.department.innerHTML='<option value="all">All departments</option>'+departments.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('');
  if(els.vehicle) els.vehicle.innerHTML='<option value="all">All vehicles</option>'+vehicles.filter(v=>v.active!==false).map(v=>`<option value="${esc(v.id)}">${esc(v.id)} · ${esc(v.name)}</option>`).join('');
  if(els.driver) els.driver.innerHTML='<option value="all">All drivers</option>'+drivers.map(d=>`<option value="${esc(d.id)}">${esc(d.name)}</option>`).join('');
  if(els.charger) els.charger.innerHTML='<option value="all">All chargers</option>'+chargers.map(c=>`<option value="${esc(c.id)}">${esc(c.id)} · ${esc(c.type)} ${esc(c.power)} kW</option>`).join('');
}

function renderKpis(m){
  els.energy.textContent=`${num(m.energy,1)} kWh`;
  els.cost.textContent=money(m.cost);
  els.costKwh.textContent=m.energy?`${num(m.costKwh,1)} AMD`:'—';
  els.readiness.textContent=`${Math.round(m.readiness)}%`;
  els.utilization.textContent=`${Math.round(m.util)}%`;
  const failureRate=m.sessions.length?m.failed/m.sessions.length*100:0;
  els.failureRate.textContent=`${num(failureRate,1)}%`;
  $('report-energy-note').textContent=`${num(m.sessionEnergy,1)} kWh depot · ${num(m.homeEnergy,1)} kWh home`;
  $('report-cost-note').textContent=`${money(m.sessionCost)} depot · ${money(m.homeCost)} home`;
  $('report-readiness-note').textContent=`${m.schedules.length||m.vehicles.length} departures / vehicles assessed`;
  $('report-failure-note').textContent=`${m.failed} failed of ${m.sessions.length} recorded session types`;
}

function trendValues(m){
  const total=trendMode==='energy'?m.energy:m.cost;
  const weights=trendPattern.slice(0,m.cfg.points);
  const sum=weights.reduce((a,b)=>a+b,0)||1;
  return weights.map(w=>total*w/sum);
}
function renderTrend(m){
  const vals=trendValues(m);
  const max=Math.max(1,...vals);
  const total=vals.reduce((a,b)=>a+b,0);
  $('trend-total-label').textContent=trendMode==='energy'?'Total energy':'Total charging cost';
  $('trend-total').textContent=trendMode==='energy'?`${num(total,1)} kWh`:money(total);
  $('trend-peak').textContent=trendMode==='energy'?`${num(max,1)} kWh`:money(max);
  $('trend-average').textContent=trendMode==='energy'?`${num(total/Math.max(1,vals.length),1)} kWh`:money(total/Math.max(1,vals.length));
  $('report-trend-chart').innerHTML=vals.map((v,i)=>{
    const height=Math.max(8,Math.round(v/max*100));
    const tip=trendMode==='energy'?`${num(v,1)} kWh`:money(v);
    return `<div class="report-trend-point" title="${esc(tip)}"><div class="report-trend-bar-wrap"><span class="report-trend-bar ${trendMode==='cost'?'is-cost':''}" style="height:${height}%"></span></div><strong>${esc(m.cfg.pointLabels[i]||String(i+1))}</strong><small>${trendMode==='energy'?num(v,0):num(v/1000,1)+'k'}</small></div>`;
  }).join('');
}

function renderReadiness(m){
  const ready=m.vehicles.filter(v=>v.status==='ready'||Number(v.battery)>=Number(v.target)).length;
  const charging=m.vehicles.filter(v=>v.status==='charging').length;
  const queued=m.vehicles.filter(v=>v.status==='queued').length;
  const risk=m.vehicles.filter(v=>v.status==='risk').length;
  const score=Math.max(0,Math.min(100,Math.round(m.readiness)||0));
  $('report-readiness-ring-value').textContent=`${score}%`;
  $('report-readiness-breakdown').innerHTML=[['Ready',ready,'ready'],['Charging',charging,'charging'],['Waiting',queued,'queued'],['At risk',risk,'risk']].map(([label,count,cls])=>`<div><span><i class="mini-dot dot-${cls}"></i>${label}</span><strong>${count}</strong></div>`).join('');
  const riskItems=m.schedules.filter(x=>x.status==='risk'||x.status==='conflict').map(x=>`${x.vehicle} · ${x.route}`);
  $('report-risk-text').textContent=riskItems.length?`${riskItems.length} departure${riskItems.length===1?'':'s'} require attention: ${riskItems.slice(0,3).join(', ')}.`:'No departure risks in the selected fleet scope.';
  $('report-risk-callout').classList.toggle('ui-callout--warning',riskItems.length>0);
  $('report-risk-callout').classList.toggle('ui-callout--info',riskItems.length===0);
}

function renderDepartmentCost(m){
  const buckets={};
  m.sessions.forEach(x=>{const dep=departmentForVehicle(x.vehicle);buckets[dep]=(buckets[dep]||0)+(Number(x.cost)||0)*m.factor});
  m.reimbursements.forEach(x=>{const dep=departmentForVehicle(x.vehicle);buckets[dep]=(buckets[dep]||0)+(Number(x.amount)||0)*m.homeFactor});
  const entries=Object.entries(buckets).sort((a,b)=>b[1]-a[1]);
  const max=entries.length?Math.max(...entries.map(x=>x[1]),1):1;
  $('department-cost-bars').innerHTML=entries.length?entries.map(([name,value])=>`<div class="metric-bar-row"><div><span>${esc(name)}</span><strong>${money(value)}</strong></div><div class="ui-progress"><span class="ui-progress__bar" style="width:${Math.round(value/max*100)}%"></span></div></div>`).join(''):'<div class="reports-empty">No department cost data for this filter.</div>';
}

function renderStatusMix(m){
  const config=[['ready','Ready'],['charging','Charging'],['queued','Waiting'],['risk','At risk']];
  $('report-status-grid').innerHTML=config.map(([st,label])=>{const count=m.vehicles.filter(v=>v.status===st).length;const pct=m.vehicles.length?Math.round(count/m.vehicles.length*100):0;return `<div class="report-status-card report-status-card--${st}"><span>${label}</span><strong>${count}</strong><small>${pct}% of selected fleet</small></div>`}).join('');
}

function vehicleStats(vehicle,m){
  const related=m.sessions.filter(x=>x.vehicle===vehicle.id);
  const energy=related.reduce((a,x)=>a+(Number(x.energy)||0),0)*m.factor;
  const cost=related.reduce((a,x)=>a+(Number(x.cost)||0),0)*m.factor;
  const schedule=m.schedules.find(x=>x.vehicle===vehicle.id);
  const readiness=(vehicle.status==='risk'||schedule?.status==='risk'||schedule?.status==='conflict')?'At risk':(vehicle.status==='ready'||Number(vehicle.battery)>=Number(vehicle.target))?'Ready':vehicle.status==='charging'?'Charging':'Waiting';
  return {sessions:related,energy,cost,schedule,readiness};
}
function renderVehicleTable(m){
  const rows=m.vehicles.slice(0,MAX_RENDER_ROWS);
  $('vehicle-report-count').textContent=`${m.vehicles.length} vehicle${m.vehicles.length===1?'':'s'}`;
  const html=rows.map(v=>{const d=driverForVehicle(v.id);const stat=vehicleStats(v,m);const readinessClass=stat.readiness==='At risk'?'risk':stat.readiness==='Ready'?'ready':stat.readiness==='Charging'?'charging':'queued';return `<tr data-report-vehicle="${esc(v.id)}"><td><div class="entity-main"><strong>${esc(v.id)}</strong><span>${esc(v.name)}</span></div></td><td><div class="entity-main"><strong>${esc(d?.name||'Unassigned')}</strong><span>${esc(d?.department||'Unassigned')}</span></div></td><td>${stat.sessions.length}</td><td>${num(stat.energy,1)} kWh</td><td>${money(stat.cost)}</td><td><div class="report-soc"><strong>${v.battery}%</strong><div class="ui-progress"><span class="ui-progress__bar" style="width:${Math.min(100,Number(v.battery)||0)}%"></span></div></div></td><td><span class="ui-pill status-pill status-${readinessClass}">${stat.readiness}</span></td><td><span class="ui-pill status-pill status-${esc(v.status)}">${esc(statusLabel(v.status))}</span></td><td><button class="ui-row-menu" type="button" data-report-vehicle-open="${esc(v.id)}" aria-label="Open analytics">•••</button></td></tr>`}).join('');
  const truncated=m.vehicles.length>MAX_RENDER_ROWS?`<tr><td colspan="9"><div class="reports-empty">Showing first ${MAX_RENDER_ROWS} of ${m.vehicles.length} vehicles. Narrow the filters to keep the report responsive.</div></td></tr>`:'';
  els.vehicleRows.innerHTML=(html||'<tr><td colspan="9"><div class="reports-empty">No vehicles match the current filters.</div></td></tr>')+truncated;
  document.querySelectorAll('[data-report-vehicle-open]').forEach(btn=>btn.addEventListener('click',e=>{e.stopPropagation();openVehicleDrawer(btn.dataset.reportVehicleOpen)}));
  document.querySelectorAll('[data-report-vehicle]').forEach(row=>row.addEventListener('dblclick',()=>openVehicleDrawer(row.dataset.reportVehicle)));
}

function chargerStats(charger,m){
  const related=m.sessions.filter(x=>x.charger===charger.id);
  const energy=related.reduce((a,x)=>a+(Number(x.energy)||0),0)*m.factor;
  const failed=related.filter(x=>x.status==='failed').length;
  const baseUtil=charger.status==='busy'?68:charger.status==='reserved'?43:charger.status==='faulty'?8:28;
  const utilization=Math.min(96,Math.round(baseUtil+related.length*3));
  return {sessions:related,energy,failed,utilization};
}
function renderChargerTable(m){
  const rows=m.chargers.slice(0,MAX_RENDER_ROWS);
  const html=rows.map(c=>{const stat=chargerStats(c,m);return `<tr><td><div class="entity-main"><strong>${esc(c.id)}</strong><span>${esc(c.type)} · ${esc(c.power)} kW · Bay ${esc(c.bay)}</span></div></td><td><span class="ui-pill status-pill status-${esc(c.status)}">${esc(statusLabel(c.status))}</span></td><td>${stat.sessions.length}</td><td>${num(stat.energy,1)} kWh</td><td><div class="report-util-cell"><strong>${stat.utilization}%</strong><div class="ui-progress"><span class="ui-progress__bar" style="width:${stat.utilization}%"></span></div></div></td><td><span class="report-health ${c.health<70?'is-low':c.health<90?'is-warning':''}">${c.health}%</span></td><td><button class="ui-row-menu" type="button" data-report-charger="${esc(c.id)}" aria-label="Open charger">•••</button></td></tr>`}).join('');
  const truncated=m.chargers.length>MAX_RENDER_ROWS?`<tr><td colspan="7"><div class="reports-empty">Showing first ${MAX_RENDER_ROWS} of ${m.chargers.length} chargers.</div></td></tr>`:'';
  els.chargerRows.innerHTML=(html||'<tr><td colspan="7"><div class="reports-empty">No charger data matches the current filters.</div></td></tr>')+truncated;
  document.querySelectorAll('[data-report-charger]').forEach(btn=>btn.addEventListener('click',()=>{location.href=`./depot.html?charger=${encodeURIComponent(btn.dataset.reportCharger)}`}));
}

function renderHomeCharging(m){
  const claims=m.reimbursements;
  const energy=claims.reduce((a,x)=>a+(Number(x.energy)||0),0)*m.homeFactor;
  const amount=claims.reduce((a,x)=>a+(Number(x.amount)||0),0)*m.homeFactor;
  const approved=claims.filter(x=>x.status==='approved').length;
  $('report-home-summary').innerHTML=`<div><span>Home energy</span><strong>${num(energy,1)} kWh</strong></div><div><span>Reimbursement</span><strong>${money(amount)}</strong></div><div><span>Approved claims</span><strong>${approved}/${claims.length}</strong></div>`;
  const by={};
  claims.forEach(x=>{const dep=departmentForVehicle(x.vehicle);if(!by[dep])by[dep]={energy:0,amount:0,count:0};by[dep].energy+=Number(x.energy)||0;by[dep].amount+=Number(x.amount)||0;by[dep].count++});
  $('report-home-list').innerHTML=Object.entries(by).map(([dep,v])=>`<div class="report-home-row"><div><strong>${esc(dep)}</strong><span>${v.count} claim${v.count===1?'':'s'} · ${num(v.energy*m.homeFactor,1)} kWh</span></div><strong>${money(v.amount*m.homeFactor)}</strong></div>`).join('')||'<div class="reports-empty">No home charging claims in the selected scope.</div>';
}

function renderSchedules(m){
  const rows=m.schedules.slice(0,MAX_RENDER_ROWS);
  const html=rows.map(sc=>{const v=vehicleById.get(sc.vehicle);const d=driverForVehicle(sc.vehicle);let result='Planned',cls='planned';if(sc.status==='risk'||v?.status==='risk'){result='At risk';cls='risk'}else if(sc.status==='conflict'){result='Conflict';cls='conflict'}else if(v&&(v.status==='ready'||Number(v.battery)>=Number(sc.target||v.target))){result='Ready';cls='ready'}else if(v?.status==='charging'){result='Charging';cls='charging'}return `<tr><td><strong>${esc(sc.id)}</strong></td><td><div class="entity-main"><strong>${esc(sc.vehicle)}</strong><span>${esc(v?.name||'Vehicle')}</span></div></td><td>${esc(d?.name||'Unassigned')}</td><td>${esc(sc.route)}</td><td>${esc(sc.departure)}</td><td>${esc(sc.target)}%</td><td>${v?`${v.battery}%`:'—'}</td><td><span class="ui-pill status-pill status-${cls}">${result}</span></td></tr>`}).join('');
  const truncated=m.schedules.length>MAX_RENDER_ROWS?`<tr><td colspan="8"><div class="reports-empty">Showing first ${MAX_RENDER_ROWS} of ${m.schedules.length} schedules.</div></td></tr>`:'';
  els.scheduleRows.innerHTML=(html||'<tr><td colspan="8"><div class="reports-empty">No schedules match this fleet filter.</div></td></tr>')+truncated;
}

function updateFilterSummary(m){
  const parts=[m.cfg.label];
  if(els.department.value!=='all')parts.push(els.department.value);
  if(els.vehicle.value!=='all')parts.push(els.vehicle.value);
  if(els.driver.value!=='all')parts.push(driverById.get(els.driver.value)?.name||els.driver.value);
  if(els.charger.value!=='all')parts.push(els.charger.value);
  $('report-filter-summary').textContent=`${m.vehicles.length} vehicles · ${parts.join(' · ')}`;
}

function renderNow(){
  if(renderBusy){renderQueued=true;return;}
  renderBusy=true;
  try{
    const m=buildMetrics();
    renderKpis(m);renderTrend(m);renderReadiness(m);renderDepartmentCost(m);renderStatusMix(m);renderVehicleTable(m);renderChargerTable(m);renderHomeCharging(m);renderSchedules(m);updateFilterSummary(m);
  }catch(error){
    console.error('[VoltDrive Reports] Render failed',error);
    const summary=$('report-filter-summary');
    if(summary)summary.textContent='Report rendering failed. Check the browser console.';
  }finally{
    renderBusy=false;
    if(renderQueued){renderQueued=false;requestAnimationFrame(renderNow);}
  }
}
function scheduleRender(){
  if(renderQueued)return;
  renderQueued=true;
  requestAnimationFrame(()=>{renderQueued=false;renderNow();});
}

function openVehicleDrawer(vehicleId){
  const v=vehicleById.get(vehicleId);if(!v)return;
  const m=buildMetrics();const d=driverForVehicle(v.id);const stat=vehicleStats(v,m);drawerEntity=v.id;
  $('report-drawer-kicker').textContent='Vehicle analytics';$('report-drawer-title').textContent=`${v.id} · ${v.name}`;$('report-drawer-subtitle').textContent=`${v.route} · ${d?.department||'Unassigned'} · ${m.cfg.label}`;
  const driverName=d?.name||'Unassigned';
  $('report-drawer-body').innerHTML=`
    <section class="ui-detail-section"><div class="report-drawer-kpis"><div><span>Energy</span><strong>${num(stat.energy,1)} kWh</strong></div><div><span>Charging cost</span><strong>${money(stat.cost)}</strong></div><div><span>Sessions</span><strong>${stat.sessions.length}</strong></div><div><span>Current SOC</span><strong>${v.battery}%</strong></div></div></section>
    <section class="ui-detail-section"><h3>Vehicle readiness</h3><div class="ui-detail-grid"><div><span>Status</span><strong><span class="ui-pill status-pill status-${esc(v.status)}">${esc(statusLabel(v.status))}</span></strong></div><div><span>Target SOC</span><strong>${v.target}%</strong></div><div><span>Departure</span><strong>${esc(v.departure)}</strong></div><div><span>Required energy</span><strong>${num(v.requiredKwh,1)} kWh</strong></div></div></section>
    <section class="ui-detail-section"><h3>Assignment</h3><div class="ui-detail-list"><div><span>Driver</span><strong>${esc(driverName)}</strong></div><div><span>Department</span><strong>${esc(d?.department||'Unassigned')}</strong></div><div><span>Route</span><strong>${esc(v.route)}</strong></div><div><span>Charger</span><strong>${esc(v.charger||'—')}</strong></div><div><span>Power</span><strong>${num(v.power,0)} kW</strong></div></div></section>
    <section class="ui-detail-section"><h3>Charging activity</h3><div class="report-drawer-session-list">${stat.sessions.length?stat.sessions.slice(0,50).map(x=>`<div><div><strong>${esc(x.id)}</strong><span>${esc(x.charger)} · ${esc(x.connector)} · ${esc(x.duration)}</span></div><div><strong>${num((Number(x.energy)||0)*m.factor,1)} kWh</strong><span>${money((Number(x.cost)||0)*m.factor)}</span></div></div>`).join(''):'<div class="reports-empty">No sessions in this filtered scope.</div>'}</div></section>`;
  els.backdrop.hidden=false;
  requestAnimationFrame(()=>{
    els.drawer.classList.add('is-open');
    els.backdrop.classList.add('is-visible');
    els.drawer.setAttribute('aria-hidden','false');
  });
}
function closeDrawer(){
  els.drawer.classList.remove('is-open');
  els.backdrop.classList.remove('is-visible');
  els.drawer.setAttribute('aria-hidden','true');
  drawerEntity=null;
  setTimeout(()=>{els.backdrop.hidden=true;},180);
}

function toast(message){els.toast.textContent=message;els.toast.classList.add('is-visible');clearTimeout(toast.timer);toast.timer=setTimeout(()=>els.toast.classList.remove('is-visible'),2600)}
function exportCsv(){
  const m=buildMetrics();
  const rows=[['Vehicle','Driver','Department','Route','Sessions','Energy kWh','Cost AMD','SOC %','Target %','Status']];
  m.vehicles.forEach(v=>{const d=driverForVehicle(v.id),stat=vehicleStats(v,m);rows.push([v.id,d?.name||'',d?.department||'',v.route,stat.sessions.length,stat.energy.toFixed(1),Math.round(stat.cost),v.battery,v.target,statusLabel(v.status)])});
  const csv=rows.map(row=>row.map(cell=>`"${String(cell??'').replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`voltdrive-fleet-report-${els.period.value}.csv`;a.click();URL.revokeObjectURL(url);toast('Filtered fleet report exported.');
}
function resetFilters(){els.period.value='week';els.department.value='all';els.vehicle.value='all';els.driver.value='all';els.charger.value='all';scheduleRender();toast('Report filters reset.');}

[els.period,els.department,els.vehicle,els.driver,els.charger].forEach(el=>el?.addEventListener('change',scheduleRender));
$('trend-tabs')?.addEventListener('click',e=>{const btn=e.target.closest('[data-trend]');if(!btn)return;trendMode=btn.dataset.trend;document.querySelectorAll('#trend-tabs .ui-tab').forEach(x=>x.classList.toggle('is-active',x===btn));const m=buildMetrics();renderTrend(m)});
$('report-export')?.addEventListener('click',exportCsv);$('report-reset')?.addEventListener('click',resetFilters);$('open-schedules')?.addEventListener('click',()=>location.href='./schedules.html');
$('report-drawer-close')?.addEventListener('click',closeDrawer);els.backdrop?.addEventListener('click',closeDrawer);
$('report-drawer-primary')?.addEventListener('click',()=>{if(drawerEntity)location.href=`./vehicles.html?vehicle=${encodeURIComponent(drawerEntity)}`});
$('report-drawer-secondary')?.addEventListener('click',()=>{if(drawerEntity)location.href=`./sessions.html?vehicle=${encodeURIComponent(drawerEntity)}`});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&els.drawer?.classList.contains('is-open'))closeDrawer()});

populateFilters();
renderNow();
