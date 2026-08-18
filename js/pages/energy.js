import {loadState, saveState, routeName} from '../core/fleet-state.js';
import {initCommon} from '../layout/common.js';

const access=initCommon();
if(!access.denied){

const state = loadState();
const $ = id => document.getElementById(id);
function syncPolicyEnergyAlert(targetState){
  const threshold=Math.max(1,Number(targetState.settings.alertThreshold)||80);
  const capacity=Math.max(1,Number(targetState.energy.capacityKw)||600);
  const pct=Math.round(Number(targetState.energy.currentKw||0)/capacity*100);
  const id='AL-POLICY-ENERGY';
  let alert=(targetState.alerts||[]).find(a=>a.id===id);
  if(pct>=threshold){
    const severity=pct>=95?'critical':'warning';
    const body=`Depot load is ${pct}% (${Math.round(targetState.energy.currentKw)} kW of ${Math.round(capacity)} kW). Fleet Settings threshold is ${threshold}%.`;
    if(!alert){alert={id,severity,title:'Depot load policy threshold exceeded',body,time:'Policy monitor · now',status:'open',category:'energy',sourceType:'Energy',sourceId:targetState.company.depot,acknowledged:false,comments:[],timeline:[]};targetState.alerts=[alert,...(targetState.alerts||[])];}
    else{alert.severity=severity;alert.body=body;if(alert.status==='resolved'){alert.status='open';alert.acknowledged=false;}}
  }else if(alert&&alert.status!=='resolved'){alert.status='resolved';alert.acknowledged=true;alert.resolutionNote=`Automatically cleared when site load returned below ${threshold}%.`;}
}

let selectedVehicleId = null;

function ensureEnergyState(){
  const evLoad = state.vehicles.reduce((sum,v)=>sum + Number(v.power || 0),0);
  const derivedBase = Math.max(80, Number(state.energy.currentKw || 0) - evLoad);
  state.energy = {
    ...state.energy,
    strategyMode: state.settings.energyMode === 'manual' ? 'manual' : 'auto',
    peakLimitKw: Number(state.settings.peakLimitKw ?? state.energy.peakLimitKw ?? 520),
    reserveKw: Number(state.settings.safetyReserveKw ?? state.energy.reserveKw ?? 40),
    baseLoadKw: Number(state.energy.baseLoadKw || derivedBase || 118),
    solarEnabled: state.settings.solarPreference !== false,
    batteryAssist: state.settings.batteryAssist !== false,
    batteryReservePct: Number(state.energy.batteryReservePct || 25)
  };
  state.energy.currentKw = currentSiteLoad();
}

function activeVehicles(){
  return state.vehicles.filter(v => v.charger && v.charger !== '—' && ['charging','risk'].includes(v.status));
}

function chargerFor(vehicle){
  return state.chargers.find(c=>c.id===vehicle.charger) || {id:vehicle.charger || '—', type:'DC', power:150};
}

function currentEvLoad(){
  return activeVehicles().reduce((sum,v)=>sum + Number(v.power || 0),0);
}

function currentSiteLoad(){
  return Number(state.energy.baseLoadKw || 118) + currentEvLoad();
}

function effectiveLimit(){
  const capacity = Number(state.energy.capacityKw || 600);
  if(!state.settings.peakProtection) return capacity;
  return Math.max(0, Math.min(Number(state.energy.peakLimitKw || capacity), capacity - Number(state.energy.reserveKw || 0)));
}

function batteryOutput(){
  const load = currentSiteLoad();
  if(!state.energy.batteryAssist || Number(state.energy.siteBatteryPct || 0) <= state.energy.batteryReservePct) return 0;
  return load >= effectiveLimit() * .78 ? 24 : 0;
}

function gridImport(){
  const solar = state.energy.solarEnabled ? Number(state.energy.solarKw || 0) : 0;
  return Math.max(0, currentSiteLoad() - solar - batteryOutput());
}

function fmt(n){ return Math.round(Number(n || 0)).toLocaleString('en-US'); }
function cap(s){ return String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1); }

function toast(message){
  const el = $('energy-toast');
  el.textContent = message;
  el.classList.add('is-visible');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(()=>el.classList.remove('is-visible'),2200);
}

function renderKpis(){
  const site = currentSiteLoad();
  const ev = currentEvLoad();
  const capacity = Number(state.energy.capacityKw);
  const headroom = Math.max(0, capacity - site);
  const solar = state.energy.solarEnabled ? Number(state.energy.solarKw || 0) : 0;
  const renewableShare = site ? Math.round(solar / site * 100) : 0;
  const cards = [
    ['Site load', `${fmt(site)} kW`, `${Math.round(site/capacity*100)}% of ${fmt(capacity)} kW`, site > effectiveLimit() ? 'danger' : 'info'],
    ['EV charging', `${fmt(ev)} kW`, `${activeVehicles().length} vehicles drawing power`, 'success'],
    ['Capacity headroom', `${fmt(headroom)} kW`, `${fmt(Math.max(0,effectiveLimit()-site))} kW to configured limit`, headroom < 80 ? 'danger' : 'success'],
    ['Local renewable', `${fmt(solar)} kW`, `${renewableShare}% of live demand`, 'success'],
    ['Energy price', `${fmt(state.energy.priceAmd)} AMD`, 'per kWh · current period', 'info']
  ];
  $('energy-kpis').innerHTML = cards.map(([label,value,sub,tone])=>`<article class="kpi-card kpi-card--${tone}"><div class="kpi-card__top"><span>${label}</span><i></i></div><strong>${value}</strong><small>${sub}</small></article>`).join('');
}

function renderLoad(){
  const site = currentSiteLoad();
  const capacity = Number(state.energy.capacityKw);
  const pct = Math.min(100, Math.round(site/capacity*100));
  const limit = effectiveLimit();
  const limitPct = Math.max(0, Math.min(100, limit/capacity*100));
  state.energy.currentKw = site;

  $('energy-load').textContent = `${fmt(site)} kW`;
  $('energy-capacity').textContent = `${fmt(capacity)} kW installed site capacity`;
  $('energy-percent').textContent = `${pct}%`;
  $('energy-bar').style.width = `${pct}%`;
  $('energy-bar').classList.toggle('is-high', site > limit * .92);
  $('energy-peak-marker').style.left = `${limitPct}%`;
  $('energy-peak-label').textContent = `Peak limit ${fmt(limit)} kW`;
  $('energy-peak-label').style.left = `${limitPct}%`;
  $('energy-capacity-label').textContent = `${fmt(capacity)} kW`;
  $('energy-mode-chip').textContent = state.energy.strategyMode === 'auto' ? 'Automatic optimization' : 'Manual allocation';

  const solar = state.energy.solarEnabled ? Number(state.energy.solarKw || 0) : 0;
  const battery = batteryOutput();
  const flow = [
    ['EV charging', `${fmt(currentEvLoad())} kW`, 'Vehicle charging demand'],
    ['Building load', `${fmt(state.energy.baseLoadKw)} kW`, 'Depot operations'],
    ['Grid import', `${fmt(gridImport())} kW`, 'Utility supply now'],
    ['Solar + battery', `${fmt(solar + battery)} kW`, `${fmt(solar)} solar · ${fmt(battery)} battery`]
  ];
  $('energy-flow-grid').innerHTML = flow.map(([a,b,c])=>`<div class="energy-flow-card"><span>${a}</span><strong>${b}</strong><small>${c}</small></div>`).join('');
}

function renderAllocation(){
  const vehicles = activeVehicles();
  $('allocation-total').textContent = `${fmt(currentEvLoad())} kW allocated`;
  $('allocation-table').innerHTML = vehicles.map(v=>{
    const charger = chargerFor(v);
    const max = Number(charger.power || 150);
    const p = Math.min(100, Math.round(Number(v.power || 0)/max*100));
    return `<tr data-energy-vehicle="${v.id}">
      <td><div class="entity-main"><strong>${v.id}</strong><span>${v.name}</span></div></td>
      <td><div class="entity-main"><strong>${charger.id}</strong><span>${charger.type} · ${max} kW</span></div></td>
      <td><span class="ui-pill priority-pill priority-${v.priority}">${v.priority}</span></td>
      <td><div class="energy-soc-inline"><strong>${v.battery}% → ${v.target}%</strong><span>${fmt(v.requiredKwh)} kWh required</span></div></td>
      <td><div class="energy-power-cell"><div><strong>${fmt(v.power)} kW</strong><span>${p}% of charger</span></div><div class="energy-power-track"><i style="width:${p}%"></i></div></div></td>
      <td>${max} kW</td>
      <td><div class="entity-main"><strong>${v.departure}</strong><span>${routeName(state,v.routeId||v.route)}</span></div></td>
      <td><button class="action-button" data-adjust-power="${v.id}" type="button">Adjust</button></td>
    </tr>`;
  }).join('') || '<tr><td colspan="8"><div class="empty-state">No vehicles are currently drawing charging power.</div></td></tr>';

  document.querySelectorAll('[data-energy-vehicle]').forEach(row=>row.addEventListener('click',e=>{
    if(e.target.closest('button')) return;
    openVehicleDrawer(row.dataset.energyVehicle);
  }));
  document.querySelectorAll('[data-adjust-power]').forEach(btn=>btn.addEventListener('click',e=>{
    e.stopPropagation();
    openPowerDialog(btn.dataset.adjustPower);
  }));
}

function forecastData(){
  const base = [
    ['00:00',286],['03:00',248],['06:00',362],['09:00',474],['12:00',498],['15:00',516],['18:00',565],['21:00',421]
  ];
  const delta = currentSiteLoad() - 428;
  return base.map(([time,kw],i)=>[time, Math.max(120,Math.round(kw + delta*(i>=2 && i<=6 ? .55 : .22)))]);
}

function renderForecast(){
  const data = forecastData();
  const capacity = Number(state.energy.capacityKw);
  const limit = effectiveLimit();
  const peak = Math.max(...data.map(d=>d[1]));
  const peakTime = data.find(d=>d[1]===peak)?.[0] || '—';
  $('forecast-peak-chip').textContent = `Peak ${fmt(peak)} kW at ${peakTime}`;
  $('energy-forecast').innerHTML = data.map(([time,kw])=>{
    const height = Math.max(5, Math.min(100,kw/capacity*100));
    const limitHeight = Math.max(0,Math.min(100,limit/capacity*100));
    return `<div class="energy-forecast-bar ${kw>limit?'is-over-limit':''}"><div class="energy-forecast-bar__plot"><b>${kw}</b><span style="height:${height}%"></span><i style="bottom:${limitHeight}%"></i></div><small>${time}</small></div>`;
  }).join('');
}

function renderStrategy(){
  const rows = [
    ['Mode', state.energy.strategyMode === 'auto' ? 'Automatic' : 'Manual'],
    ['Peak limit', `${fmt(state.energy.peakLimitKw)} kW`],
    ['Safety reserve', `${fmt(state.energy.reserveKw)} kW`],
    ['Smart priority', state.settings.smartPriority ? 'Enabled' : 'Disabled'],
    ['Peak protection', state.settings.peakProtection ? 'Enabled' : 'Disabled']
  ];
  $('strategy-summary').innerHTML = `<div class="energy-strategy-summary">${rows.map(([a,b])=>`<div class="metric-row"><span>${a}</span><strong>${b}</strong></div>`).join('')}</div>`;
}

function renderSources(){
  const solar = state.energy.solarEnabled ? Number(state.energy.solarKw || 0) : 0;
  const battery = batteryOutput();
  const sources = [
    ['Grid import', `${fmt(gridImport())} kW`, 'Live utility draw', 'info'],
    ['Solar', `${fmt(solar)} kW`, state.energy.solarEnabled ? 'Local generation active' : 'Preference disabled', 'positive'],
    ['Site battery', `${fmt(battery)} kW`, `${fmt(state.energy.siteBatteryPct)}% state of charge`, battery ? 'positive' : 'info'],
    ['Building', `${fmt(state.energy.baseLoadKw)} kW`, 'Non-EV depot demand', 'warning']
  ];
  $('energy-sources').innerHTML = sources.map(([a,b,c,t])=>`<div class="energy-source energy-source--${t}"><span>${a}</span><strong>${b}</strong><small>${c}</small></div>`).join('');
}

function renderPrices(){
  const hour = new Date().getHours();
  const periods = [
    {label:'00:00–07:00',from:0,to:7,price:62},
    {label:'07:00–17:00',from:7,to:17,price:78},
    {label:'17:00–21:00',from:17,to:21,price:96},
    {label:'21:00–24:00',from:21,to:24,price:68}
  ];
  const max = Math.max(...periods.map(p=>p.price));
  const current = periods.find(p=>hour>=p.from && hour<p.to) || periods[0];
  state.energy.priceAmd = current.price;
  $('energy-price-list').innerHTML = periods.map(p=>`<div class="energy-price-row ${p===current?'is-current':''}"><span>${p.label}</span><div><i style="width:${Math.round(p.price/max*100)}%"></i></div><strong>${p.price} AMD/kWh</strong></div>`).join('');
}

function renderOptimization(){
  const load = currentSiteLoad();
  const limit = effectiveLimit();
  const headroom = limit-load;
  const critical = activeVehicles().filter(v=>v.priority==='critical');
  const items = [
    [headroom < 60 ? 'warning':'ok', headroom < 60 ? 'Peak headroom is tight' : 'Peak protection healthy', `${fmt(Math.max(0,headroom))} kW remains below the controlled limit.`],
    ['ok','Critical departures prioritized', `${critical.length} critical vehicle${critical.length===1?' is':'s are'} receiving priority weighting.`],
    [state.energy.solarEnabled ? 'ok':'warning', state.energy.solarEnabled ? 'Solar preference active' : 'Solar preference disabled', state.energy.solarEnabled ? `${fmt(state.energy.solarKw)} kW of local generation is available.` : 'Automatic charging will not react to solar availability.'],
    [state.energy.batteryAssist ? 'ok':'warning', state.energy.batteryAssist ? 'Site battery available' : 'Battery assist disabled', `${fmt(state.energy.siteBatteryPct)}% battery state of charge.`]
  ];
  $('optimization-list').innerHTML = items.map(([tone,title,text])=>`<div class="energy-optimization-item ${tone==='warning'?'energy-optimization-item--warning':''}"><i></i><div><strong>${title}</strong><span>${text}</span></div></div>`).join('');
}

function render(){
  renderPrices();
  renderKpis();
  renderLoad();
  renderAllocation();
  renderForecast();
  renderStrategy();
  renderSources();
  renderOptimization();
  saveState(state);
}

function openVehicleDrawer(id){
  const v = state.vehicles.find(x=>x.id===id);
  if(!v) return;
  selectedVehicleId = id;
  const charger = chargerFor(v);
  const max = Number(charger.power || 150);
  const limit = effectiveLimit();
  $('energy-drawer-title').textContent = `${v.id} · ${v.name}`;
  $('energy-drawer-subtitle').textContent = `${charger.id} · ${routeName(state,v.routeId||v.route)}`;
  $('energy-view-vehicle').href = `./vehicles.html?vehicle=${encodeURIComponent(v.id)}`;
  $('energy-drawer-body').innerHTML = `
    <div class="energy-allocation-hero"><div><span>Allocated charging power</span><strong>${fmt(v.power)} kW</strong><small>${Math.round(v.power/max*100)}% of ${fmt(max)} kW charger limit</small></div><div><span>SOC</span><strong>${v.battery}% → ${v.target}%</strong><small>${fmt(v.requiredKwh)} kWh required</small></div></div>
    <section class="ui-detail-section"><h3>Operational context</h3><div class="ui-detail-grid"><div><span>Priority</span><strong><span class="ui-pill priority-pill priority-${v.priority}">${v.priority}</span></strong></div><div><span>Departure</span><strong>${v.departure}</strong></div><div><span>Route</span><strong>${routeName(state,v.routeId||v.route)}</strong></div><div><span>Charger</span><strong>${charger.id} · ${charger.type}</strong></div></div></section>
    <section class="ui-detail-section"><h3>Power constraints</h3><div class="ui-detail-list"><div><span>Charger maximum</span><strong>${fmt(max)} kW</strong></div><div><span>Depot controlled limit</span><strong>${fmt(limit)} kW</strong></div><div><span>Current site load</span><strong>${fmt(currentSiteLoad())} kW</strong></div><div><span>Safety reserve</span><strong>${fmt(state.energy.reserveKw)} kW</strong></div></div></section>
    <section class="ui-detail-section"><div class="ui-callout ${v.status==='risk'?'ui-callout--danger':'ui-callout--info'}"><strong>${v.status==='risk'?'Readiness risk':'Allocation status'}</strong><span>${v.status==='risk'?'This vehicle is marked at risk. Increasing its allocation may improve departure readiness.':'Power can be adjusted manually or optimized with Rebalance power.'}</span></div></section>`;
  const backdrop = $('energy-drawer-backdrop');
  backdrop.hidden = false;
  requestAnimationFrame(()=>backdrop.classList.add('is-visible'));
  $('energy-drawer').classList.add('is-open');
  $('energy-drawer').setAttribute('aria-hidden','false');
}

function closeDrawer(){
  $('energy-drawer').classList.remove('is-open');
  $('energy-drawer').setAttribute('aria-hidden','true');
  const backdrop = $('energy-drawer-backdrop');
  backdrop.classList.remove('is-visible');
  setTimeout(()=>{backdrop.hidden=true;},180);
}

function availableForVehicle(v){
  const charger = chargerFor(v);
  const otherEv = activeVehicles().filter(x=>x.id!==v.id).reduce((sum,x)=>sum+Number(x.power||0),0);
  return Math.max(0, Math.min(Number(charger.power || 150), effectiveLimit() - Number(state.energy.baseLoadKw) - otherEv));
}

function openPowerDialog(id){
  const v = state.vehicles.find(x=>x.id===id);
  if(!v) return;
  selectedVehicleId = id;
  const charger = chargerFor(v);
  const chargerMax = Number(charger.power || 150);
  const availableMax = Math.max(1, Math.floor(availableForVehicle(v)));
  const min = Math.min(availableMax, charger.type==='AC' ? 6 : 20);
  const value = Math.max(min, Math.min(availableMax,Number(v.power || min)));
  $('power-dialog-title').textContent = `Adjust power · ${v.id}`;
  $('power-dialog-subtitle').textContent = `${charger.id} · ${chargerMax} kW charger maximum`;
  $('power-dialog-body').innerHTML = `<div class="energy-power-adjust">
    <div class="energy-power-adjust__head"><div><span>Current allocation</span><strong>${fmt(v.power)} kW</strong></div><div><span>Available maximum now</span><strong>${fmt(availableMax)} kW</strong></div></div>
    <div class="energy-range-output"><span>Manual allocation</span><output id="power-output">${fmt(value)} kW</output></div>
    <input class="ui-range" id="power-range" type="range" min="${min}" max="${availableMax}" step="1" value="${value}">
    <div class="ui-callout ${availableMax<chargerMax?'ui-callout--warning':'ui-callout--info'}"><strong>${availableMax<chargerMax?'Depot limit constrains this charger':'Full charger range available'}</strong><span>${availableMax<chargerMax?`The site strategy currently allows up to ${fmt(availableMax)} kW for this vehicle without exceeding the controlled limit.`:`This charger can currently use its full ${fmt(chargerMax)} kW rating.`}</span></div>
  </div>`;
  const range = $('power-range');
  range.addEventListener('input',()=>{$('power-output').textContent=`${fmt(range.value)} kW`;});
  $('power-dialog').showModal();
}

function openStrategy(){
  $('strategy-mode').value = state.energy.strategyMode;
  $('strategy-peak-limit').max = state.energy.capacityKw;
  $('strategy-peak-limit').value = state.energy.peakLimitKw;
  $('strategy-reserve').value = state.energy.reserveKw;
  $('strategy-smart-priority').checked = !!state.settings.smartPriority;
  $('strategy-peak-protection').checked = !!state.settings.peakProtection;
  $('strategy-solar').checked = !!state.energy.solarEnabled;
  $('strategy-battery').checked = !!state.energy.batteryAssist;
  $('energy-strategy-dialog').showModal();
}

function saveStrategy(){
  const peak = Number($('strategy-peak-limit').value);
  const reserve = Number($('strategy-reserve').value);
  const capacity = Number(state.energy.capacityKw);
  if(!Number.isFinite(peak) || peak < 200 || peak > capacity) return false;
  if(!Number.isFinite(reserve) || reserve < 0 || reserve > 150) return false;
  state.energy.strategyMode = $('strategy-mode').value;
  state.energy.peakLimitKw = peak;
  state.energy.reserveKw = reserve;
  state.settings.energyMode = state.energy.strategyMode === 'manual' ? 'manual' : 'automatic';
  state.settings.peakLimitKw = peak;
  state.settings.safetyReserveKw = reserve;
  state.settings.smartPriority = $('strategy-smart-priority').checked;
  state.settings.peakProtection = $('strategy-peak-protection').checked;
  state.energy.solarEnabled = $('strategy-solar').checked;
  state.energy.batteryAssist = $('strategy-battery').checked;
  state.settings.solarPreference = state.energy.solarEnabled;
  state.settings.batteryAssist = state.energy.batteryAssist;
  state.energy.currentKw=currentSiteLoad();syncPolicyEnergyAlert(state);saveState(state);
  render();
  toast('Energy strategy saved and applied fleet-wide.');
  return true;
}

function rebalancePower(){
  const vehicles = activeVehicles();
  if(!vehicles.length){ toast('No active charging vehicles to rebalance.'); return; }
  const budget = Math.max(0, effectiveLimit() - Number(state.energy.baseLoadKw));
  const priorities = {critical:4,high:3,normal:2,low:1};
  const rows = vehicles.map(v=>{
    const charger = chargerFor(v);
    const max = Number(charger.power || 150);
    const min = Math.min(max, charger.type==='AC' ? 6 : 20);
    return {v,max,min,weight: state.settings.smartPriority ? (priorities[v.priority] || 1) : 1, allocation:min};
  });
  let remaining = Math.max(0,budget - rows.reduce((sum,r)=>sum+r.allocation,0));
  for(let pass=0; pass<12 && remaining>.5; pass++){
    const eligible = rows.filter(r=>r.allocation < r.max-.5);
    if(!eligible.length) break;
    const totalWeight = eligible.reduce((sum,r)=>sum+r.weight,0);
    let used = 0;
    eligible.forEach(r=>{
      const share = remaining * r.weight/totalWeight;
      const add = Math.min(share,r.max-r.allocation);
      r.allocation += add;
      used += add;
    });
    if(used < .1) break;
    remaining -= used;
  }
  rows.forEach(r=>{
    r.v.power = Math.max(0,Math.round(r.allocation));
    const session = (state.sessions || []).find(x=>x.vehicle===r.v.id && x.status==='active');
    if(session) session.power = r.v.power;
  });
  state.energy.strategyMode = 'auto';
  state.settings.energyMode = 'automatic';
  state.energy.currentKw = currentSiteLoad();
  syncPolicyEnergyAlert(state);
  saveState(state);
  render();
  if(selectedVehicleId) openVehicleDrawer(selectedVehicleId);
  toast('Power rebalanced using fleet priority and depot limits.');
}

$('energy-drawer-close').addEventListener('click',closeDrawer);
$('energy-drawer-backdrop').addEventListener('click',closeDrawer);
$('energy-adjust-power').addEventListener('click',()=>{ if(selectedVehicleId){ closeDrawer(); setTimeout(()=>openPowerDialog(selectedVehicleId),190); } });
$('edit-strategy').addEventListener('click',openStrategy);
$('edit-strategy-inline').addEventListener('click',openStrategy);
$('rebalance-power').addEventListener('click',rebalancePower);

$('energy-strategy-form').addEventListener('submit',e=>{
  if(e.submitter && e.submitter.value==='default'){
    if(!saveStrategy()){
      e.preventDefault();
      toast('Check peak limit and safety reserve values.');
    }
  }
});

$('power-form').addEventListener('submit',e=>{
  if(!e.submitter || e.submitter.value!=='default') return;
  const v = state.vehicles.find(x=>x.id===selectedVehicleId);
  const range = $('power-range');
  if(!v || !range) return;
  v.power = Number(range.value);
  state.energy.strategyMode = 'manual';
  state.settings.energyMode = 'manual';
  const session = (state.sessions || []).find(x=>x.vehicle===v.id && x.status==='active');
  if(session) session.power = v.power;
  state.energy.currentKw = currentSiteLoad();
  syncPolicyEnergyAlert(state);
  saveState(state);
  render();
  toast(`${v.id} allocation set to ${fmt(v.power)} kW.`);
});

ensureEnergyState();
render();
}
