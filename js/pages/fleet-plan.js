import {loadState,saveState} from '../core/fleet-state.js';
import {initCommon} from '../layout/common.js';

const access=initCommon();
if(!access.denied){

let state=loadState();
let toastTimer=null;
let selectedCapacity=10;

const $=id=>document.getElementById(id);
const money=value=>`${Number(value||0).toLocaleString('en-US')} AMD`;
const escapeHtml=value=>String(value??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));

const catalog=[
  {id:'essentials',name:'VoltDrive Fleet Essentials',price:89000,vehicles:40,users:6,depots:1,overage:3000,support:'Standard fleet support',description:'Core fleet charging controls for a single depot and smaller operational teams.',features:['Scheduled charging','Fleet vehicle directory','Charging session history','Basic cost reporting','Email support']},
  {id:'business',name:'VoltDrive Fleet Business',price:145000,vehicles:75,users:12,depots:3,overage:2500,support:'Priority fleet support',description:'Managed depot charging, energy optimization and corporate fleet workflows.',features:['Smart depot optimization','Advanced reporting','Home charging reimbursement','Priority support','Multi-user fleet access']},
  {id:'enterprise',name:'VoltDrive Fleet Enterprise',price:320000,vehicles:250,users:40,depots:10,overage:1800,support:'24/7 enterprise support',description:'Multi-depot operations, advanced controls and enterprise support for large fleets.',features:['Multi-depot command center','Advanced energy policies','ERP & finance integrations','24/7 enterprise support','Advanced roles & audit']}
];

const featureDescriptions={
  'Smart depot optimization':'Automatic charging priorities based on departure time, SOC and available site power.',
  'Advanced reporting':'Fleet-level cost, utilization, readiness and energy reporting.',
  'Home charging reimbursement':'Review and reimburse verified employee home charging sessions.',
  'Priority support':'Priority operational support for fleet charging incidents.',
  'Multi-user fleet access':'Separate access for fleet managers and operational users.',
  'Scheduled charging':'Create charging schedules around planned fleet departures.',
  'Fleet vehicle directory':'Manage fleet vehicles and readiness status.',
  'Charging session history':'Review completed and active charging sessions.',
  'Basic cost reporting':'Monitor fleet charging spend and monthly totals.',
  'Email support':'Standard support during business hours.',
  'Multi-depot command center':'Coordinate charging operations across multiple depots.',
  'Advanced energy policies':'Use depot-level peak, battery and renewable energy policies.',
  'ERP & finance integrations':'Connect finance workflows to ERP and accounting systems.',
  '24/7 enterprise support':'Round-the-clock operational support and escalation.',
  'Advanced roles & audit':'Granular user permissions and administrative audit history.'
};

function currentCatalogPlan(){return catalog.find(x=>x.id===state.fleetPlan.id)||catalog.find(x=>x.name===state.fleetPlan.name)||catalog[1];}
function percentage(value,max){return Math.min(100,Math.round(Number(value||0)/Math.max(1,Number(max||1))*100));}
function meterTone(pct){return pct>=90?'warning':'success';}

function renderHero(){
  const p=state.fleetPlan,base=currentCatalogPlan();
  $('plan-name').textContent=p.name;$('plan-description').textContent=base.description;$('plan-contract').textContent=p.contractRef;$('plan-review').textContent=p.nextReview;$('plan-price').textContent=money(p.monthlyFee);$('plan-renewal').textContent=p.renewal;$('plan-auto-renew').checked=Boolean(p.autoRenew);$('plan-current-chip').textContent=p.name.replace('VoltDrive Fleet ','');
}

function usageCard(label,active,included,unit,detail){
  const pct=percentage(active,included),remaining=Math.max(0,Number(included)-Number(active));
  return `<article class="plan-usage-card"><div class="plan-usage-card__head"><div><span>${label}</span><strong>${active} / ${included}</strong></div><span class="ui-pill status-pill ${pct>=90?'status-open':'status-active'}">${pct}% used</span></div><div class="ui-progress ui-progress--${meterTone(pct)}"><span class="ui-progress__bar" style="width:${pct}%"></span></div><div class="plan-usage-card__foot"><span>${remaining} ${unit} remaining</span><strong>${detail}</strong></div></article>`;
}
function renderUsage(){const p=state.fleetPlan;const activeUsers=Array.isArray(state.users)?state.users.filter(u=>u.status==='active').length:p.activeUsers;$('plan-usage-grid').innerHTML=usageCard('Vehicle capacity',p.activeVehicles,p.vehiclesIncluded,'vehicles',`${money(p.overageVehicleFee)} / extra vehicle`)+usageCard('User seats',activeUsers,p.usersIncluded,'seats','Role-based access')+usageCard('Depot capacity',p.activeDepots,p.depotsIncluded,'depots','Managed charging sites');}

function renderCatalog(){
  const current=state.fleetPlan.id;
  $('plan-catalog').innerHTML=catalog.map(plan=>`<article class="plan-tier-card ${plan.id===current?'is-current':''}"><div class="plan-tier-card__head"><div><span>${plan.id===current?'CURRENT PLAN':plan.id.toUpperCase()}</span><h3>${escapeHtml(plan.name.replace('VoltDrive Fleet ',''))}</h3></div>${plan.id===current?'<span class="ui-pill status-pill status-active">Active</span>':''}</div><strong class="plan-tier-card__price">${money(plan.price)}<small>/ month</small></strong><p>${escapeHtml(plan.description)}</p><div class="plan-tier-card__limits"><span>${plan.vehicles} vehicles</span><span>${plan.users} users</span><span>${plan.depots} depots</span></div><ul>${plan.features.slice(0,4).map(f=>`<li>✓ ${escapeHtml(f)}</li>`).join('')}</ul><button class="button ${plan.id===current?'button--secondary':'button--primary'}" type="button" data-select-plan="${plan.id}" ${plan.id===current?'disabled':''}>${plan.id===current?'Current plan':plan.price>currentCatalogPlan().price?'Upgrade plan':'Switch plan'}</button></article>`).join('');
  document.querySelectorAll('[data-select-plan]').forEach(btn=>btn.addEventListener('click',()=>openManagePlan(btn.dataset.selectPlan)));
}

function renderFeatures(){const p=state.fleetPlan;$('plan-features').innerHTML=(p.features||[]).map(f=>`<div class="feature-card"><strong>✓ ${escapeHtml(f)}</strong><p>${escapeHtml(featureDescriptions[f]||'Included capability for this fleet subscription.')}</p></div>`).join('');}
function renderDetails(){const p=state.fleetPlan;$('plan-details').innerHTML=`<div class="ui-detail-list"><div><span>Billing cycle</span><strong>${escapeHtml(p.billingCycle)}</strong></div><div><span>Next renewal</span><strong>${escapeHtml(p.renewal)}</strong></div><div><span>Auto-renew</span><strong>${p.autoRenew?'Enabled':'Disabled'}</strong></div><div><span>Additional vehicle</span><strong>${money(p.overageVehicleFee)}</strong></div><div><span>Support level</span><strong>${escapeHtml(p.support)}</strong></div><div><span>Contract</span><strong>${escapeHtml(p.contractRef)}</strong></div></div><div class="ui-callout ui-callout--info plan-detail-note"><strong>Billing connection</strong><span>Plan fees are managed through the corporate billing account.</span></div>`;}
function renderHistory(){const history=state.fleetPlan.history||[];$('plan-history').innerHTML=history.map((x,i)=>`<div class="plan-history-item"><div class="plan-history-item__rail"><span class="${i===0?'is-current':''}"></span></div><div><time>${escapeHtml(x.date)}</time><strong>${escapeHtml(x.title)}</strong><p>${escapeHtml(x.detail)}</p></div></div>`).join('')||'<div class="ops-empty-inline">No plan changes recorded.</div>';}

function openManagePlan(preselect=state.fleetPlan.id){
  $('plan-dialog-options').innerHTML=catalog.map(plan=>`<label class="plan-dialog-option ${plan.id===preselect?'is-selected':''}"><input type="radio" name="plan-option" value="${plan.id}" ${plan.id===preselect?'checked':''}><div><div class="plan-dialog-option__head"><strong>${escapeHtml(plan.name)}</strong><span>${money(plan.price)} / month</span></div><p>${escapeHtml(plan.description)}</p><small>${plan.vehicles} vehicles · ${plan.users} users · ${plan.depots} depots</small></div></label>`).join('');
  document.querySelectorAll('input[name="plan-option"]').forEach(input=>input.addEventListener('change',()=>{document.querySelectorAll('.plan-dialog-option').forEach(x=>x.classList.remove('is-selected'));input.closest('.plan-dialog-option').classList.add('is-selected');}));
  $('manage-plan-dialog').showModal();
}

function applyPlanChange(){
  const selected=document.querySelector('input[name="plan-option"]:checked')?.value,plan=catalog.find(x=>x.id===selected);if(!plan||plan.id===state.fleetPlan.id){notify('Current plan kept unchanged.');return;}
  const previous=state.fleetPlan.name;
  Object.assign(state.fleetPlan,{id:plan.id,name:plan.name,vehiclesIncluded:plan.vehicles,usersIncluded:plan.users,depotsIncluded:plan.depots,monthlyFee:plan.price,overageVehicleFee:plan.overage,support:plan.support,features:[...plan.features]});
  state.fleetPlan.history=[{date:'Today',title:`Plan changed to ${plan.name.replace('VoltDrive Fleet ','')}`,detail:`Previous plan: ${previous.replace('VoltDrive Fleet ','')} · ${money(plan.price)} monthly`},...(state.fleetPlan.history||[])];
  saveState(state);renderAll();notify(`${plan.name.replace('VoltDrive Fleet ','')} activated.`);
}

function renderCapacityOptions(){
  const p=state.fleetPlan,choices=[5,10,25];
  $('capacity-options').innerHTML=choices.map(n=>`<label class="capacity-option ${n===selectedCapacity?'is-selected':''}"><input type="radio" name="capacity-option" value="${n}" ${n===selectedCapacity?'checked':''}><strong>+${n} vehicles</strong><span>+ ${money(n*p.overageVehicleFee)} / month</span></label>`).join('');
  document.querySelectorAll('input[name="capacity-option"]').forEach(input=>input.addEventListener('change',()=>{selectedCapacity=Number(input.value);renderCapacityOptions();renderCapacityPreview();}));
}
function renderCapacityPreview(){const p=state.fleetPlan,newCapacity=p.vehiclesIncluded+selectedCapacity,newFee=p.monthlyFee+selectedCapacity*p.overageVehicleFee;$('capacity-preview').innerHTML=`<div><span>New vehicle capacity</span><strong>${newCapacity} vehicles</strong></div><div><span>New monthly fee</span><strong>${money(newFee)}</strong></div><div><span>Increase</span><strong>+ ${money(selectedCapacity*p.overageVehicleFee)}</strong></div>`;}
function openCapacityDialog(){selectedCapacity=10;renderCapacityOptions();renderCapacityPreview();$('capacity-dialog').showModal();}
function addCapacity(){const p=state.fleetPlan,fee=selectedCapacity*p.overageVehicleFee;p.vehiclesIncluded+=selectedCapacity;p.monthlyFee+=fee;p.history=[{date:'Today',title:'Vehicle capacity increased',detail:`+${selectedCapacity} vehicles · new capacity ${p.vehiclesIncluded}`},...(p.history||[])];saveState(state);renderAll();notify(`${selectedCapacity} vehicle slots added.`);}

function notify(message){const toast=$('plan-toast');if(!toast)return;clearTimeout(toastTimer);toast.textContent=message;toast.classList.add('is-visible');toastTimer=setTimeout(()=>toast.classList.remove('is-visible'),2300);}
function renderAll(){state=loadState();renderHero();renderUsage();renderCatalog();renderFeatures();renderDetails();renderHistory();}

$('manage-plan')?.addEventListener('click',()=>openManagePlan());$('add-capacity')?.addEventListener('click',openCapacityDialog);$('plan-auto-renew')?.addEventListener('change',e=>{state.fleetPlan.autoRenew=e.target.checked;saveState(state);renderDetails();notify(`Auto-renew ${e.target.checked?'enabled':'disabled'}.`);});
$('manage-plan-form')?.addEventListener('submit',e=>{if(e.submitter?.id==='confirm-plan-change')applyPlanChange();});$('capacity-form')?.addEventListener('submit',e=>{if(e.submitter?.id==='confirm-capacity')addCapacity();});

renderAll();
}
