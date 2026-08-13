import {loadState,statusLabel} from '../core/fleet-state.js';
import {initCommon} from '../layout/common.js';

const s=loadState();
initCommon();

const charging=s.vehicles.filter(v=>v.status==='charging').length;
const ready=s.vehicles.filter(v=>v.status==='ready').length;
const risk=s.vehicles.filter(v=>v.status==='risk').length;
const queued=s.vehicles.filter(v=>v.status==='queued').length;
const available=s.chargers.filter(c=>c.status==='available').length;
const openAlerts=s.alerts.filter(a=>a.status==='open').length;
const total=s.vehicles.length;
const readinessScore=Math.round(((ready+charging*0.65+queued*0.25)/Math.max(total,1))*100);

const kpiData=[
  ['Charging now',charging,'Active fleet sessions','success'],
  ['Ready to depart',ready,'Vehicles at or above target','success'],
  ['At risk',risk,'Needs intervention','danger'],
  ['Available chargers',available,`${s.chargers.length} chargers total`,'info']
];
document.getElementById('kpis').innerHTML=kpiData.map(([label,value,detail,tone])=>`<article class="kpi-card kpi-card--${tone}"><div class="kpi-card__top"><span>${label}</span><i></i></div><strong>${value}</strong><small>${detail}</small></article>`).join('');

document.getElementById('smart-priority-state').textContent=s.settings.smartPriority?'Enabled':'Disabled';
document.getElementById('peak-protection-state').textContent=s.settings.peakProtection?'Enabled':'Disabled';
document.getElementById('open-alerts').textContent=openAlerts;

document.getElementById('readiness-score').textContent=`${readinessScore}%`;
document.getElementById('score-ring').style.setProperty('--score',`${readinessScore*3.6}deg`);
document.getElementById('readiness-breakdown').innerHTML=`
  <div><span><i class="mini-dot dot-ready"></i>Ready</span><strong>${ready}</strong></div>
  <div><span><i class="mini-dot dot-charging"></i>Charging</span><strong>${charging}</strong></div>
  <div><span><i class="mini-dot dot-queued"></i>Queued</span><strong>${queued}</strong></div>
  <div><span><i class="mini-dot dot-risk"></i>At risk</span><strong>${risk}</strong></div>`;

const priorityRank={critical:0,high:1,normal:2,low:3};
const orderedVehicles=[...s.vehicles].sort((a,b)=>a.departure.localeCompare(b.departure)||priorityRank[a.priority]-priorityRank[b.priority]);
const pr=v=>`<span class="ui-pill priority-pill priority-${v.priority}">${v.priority}</span>`;
const st=v=>`<span class="ui-pill status-pill status-${v.status}">${statusLabel(v.status)}</span>`;

document.getElementById('next-departures').innerHTML=orderedVehicles.slice(0,4).map((v,index)=>{
  const tone=v.status==='risk'?'danger':v.status==='ready'?'success':v.status==='charging'?'info':'neutral';
  return `<div class="departure-row departure-row--${tone}"><div class="departure-time"><span>${v.departure}</span><small>#${index+1}</small></div><div class="departure-vehicle"><strong>${v.name}</strong><span>${v.route} · ${v.battery}% battery</span></div><div class="departure-status">${st(v)}<small>${v.requiredKwh} kWh needed</small></div></div>`;
}).join('');

const pct=Math.round(s.energy.currentKw/s.energy.capacityKw*100);
const headroom=Math.max(0,s.energy.capacityKw-s.energy.currentKw);
const gridKw=Math.max(0,s.energy.currentKw-s.energy.solarKw);
const avgActivePower=charging?Math.round(s.vehicles.filter(v=>v.status==='charging').reduce((n,v)=>n+v.power,0)/charging):0;
document.getElementById('energy-snapshot').innerHTML=`
  <div class="energy-stat"><span>Current draw</span><strong>${s.energy.currentKw} kW</strong><small>${pct}% of site capacity</small></div>
  <div class="energy-stat"><span>Grid draw</span><strong>${gridKw} kW</strong><small>${s.energy.solarKw} kW supplied by solar</small></div>
  <div class="energy-stat"><span>Avg. active charger</span><strong>${avgActivePower} kW</strong><small>${charging} vehicles charging</small></div>
  <div class="energy-stat"><span>Energy price</span><strong>${s.energy.priceAmd} AMD</strong><small>per kWh now</small></div>`;

document.getElementById('readiness-table').innerHTML=orderedVehicles.slice(0,7).map(v=>`<tr class="${v.status==='risk'?'row-risk':''}"><td><div class="entity-main"><strong>${v.name}</strong><span>${v.plate} · ${v.route}</span></div></td><td><strong>${v.departure}</strong></td><td><div class="battery-cell"><span>${v.battery}% → ${v.target}%</span><div class="mini-progress"><i style="width:${Math.min(100,v.battery)}%"></i></div></div></td><td>${v.requiredKwh} kWh</td><td>${st(v)}</td><td>${v.charger}</td><td>${pr(v)}</td></tr>`).join('');

document.getElementById('assignment-table').innerHTML=s.chargers.filter(c=>c.vehicle).map(c=>{const v=s.vehicles.find(v=>v.id===c.vehicle);return `<tr><td><div class="entity-main"><strong>${c.id}</strong><span>${c.type} · ${c.power} kW max</span></div></td><td>${v?.name||c.vehicle}</td><td><strong>${v?.power||0} kW</strong></td><td>${c.bay}</td><td><span class="health-text ${c.health<90?'health-text--warn':''}">${c.health}%</span></td><td><span class="ui-pill status-pill status-${c.status}">${statusLabel(c.status)}</span></td></tr>`}).join('');

document.getElementById('load-value').textContent=`${s.energy.currentKw} kW`;
document.getElementById('load-percent').textContent=`${pct}%`;
document.getElementById('load-bar').style.width=`${pct}%`;
document.getElementById('capacity-label').textContent=`${s.energy.capacityKw} kW capacity`;
document.getElementById('headroom').textContent=`${headroom} kW`;
document.getElementById('price').textContent=`${s.energy.priceAmd} AMD/kWh`;
document.getElementById('solar').textContent=`${s.energy.solarKw} kW`;
document.getElementById('site-battery').textContent=`${s.energy.siteBatteryPct}%`;

const chargingVehicles=s.vehicles.filter(v=>v.status==='charging').sort((a,b)=>b.power-a.power);
document.getElementById('power-allocation').innerHTML=chargingVehicles.map(v=>{
  const share=Math.round(v.power/Math.max(s.energy.capacityKw,1)*100);
  return `<div class="allocation-row"><div class="allocation-row__head"><div><strong>${v.name}</strong><span>${v.charger} · departs ${v.departure}</span></div><strong>${v.power} kW</strong></div><div class="allocation-bar"><span style="width:${share}%"></span></div></div>`;
}).join('') || '<div class="empty-state">No active charging sessions.</div>';

document.getElementById('dashboard-alerts').innerHTML=s.alerts.filter(a=>a.status==='open').slice(0,4).map(a=>`<div class="alert-item"><div class="alert-item__top"><strong><span class="severity-dot sev-${a.severity}"></span>${a.title}</strong><small>${a.time}</small></div><p>${a.body}</p></div>`).join('');
