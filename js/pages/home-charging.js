import {loadState,saveState,departmentName} from '../core/fleet-state.js';
import {initCommon} from '../layout/common.js';

const access=initCommon();
if(!access.denied){
let state=loadState();
let activeClaimId=null;
let reviewAction='approve';
let toastTimer;

const $=id=>document.getElementById(id);
const els={
  body:$('home-claims-body'),search:$('home-search'),status:$('home-filter'),payment:$('home-payment-filter'),department:$('home-department'),count:$('home-result-count'),
  drawer:$('home-claim-drawer'),backdrop:$('home-drawer-backdrop'),drawerTitle:$('home-drawer-title'),drawerSubtitle:$('home-drawer-subtitle'),drawerBody:$('home-drawer-body'),
  viewDriver:$('home-view-driver'),approve:$('home-approve'),reject:$('home-reject'),reviewDialog:$('home-review-dialog'),reviewForm:$('home-review-form'),reviewTitle:$('home-review-title'),reviewCopy:$('home-review-copy'),reviewCalc:$('home-review-calculation'),reviewNote:$('home-review-note'),reviewConfirm:$('home-review-confirm'),
  batchDialog:$('home-batch-dialog'),batchForm:$('home-batch-form'),batchSummary:$('home-batch-summary'),batchRef:$('home-batch-reference'),batchNote:$('home-batch-note'),
  paidDialog:$('home-paid-dialog'),paidForm:$('home-paid-form'),paidCopy:$('home-paid-copy'),paymentRef:$('home-payment-reference'),toast:$('home-toast')
};
const fmt=new Intl.NumberFormat('en-US');
const money=n=>`${fmt.format(Math.round(Number(n)||0))} AMD`;
const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const label=v=>String(v||'—').replace(/-/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
const todayLabel=()=>new Intl.DateTimeFormat('en',{month:'short',day:'numeric'}).format(new Date());

function driverFor(claim){return state.drivers.find(x=>x.id===claim.driver)}
function vehicleFor(claim){return state.vehicles.find(x=>x.id===claim.vehicle)}
function departmentIdFor(claim){return driverFor(claim)?.departmentId||null}
function departmentFor(claim){const d=driverFor(claim);return d?departmentName(state,d.departmentId||d.department):'Unassigned'}
function costCenterFor(claim){
  const departmentId=departmentIdFor(claim);
  const dep=departmentFor(claim);
  return state.billing?.costCenters?.find(x=>x.departmentId===departmentId||(!x.departmentId&&x.department===dep))?.name||`${dep} Fleet`;
}
function reviewClass(status){return `status-${status||'pending'}`}
function paymentClass(status){return status==='queued'?'status-queued-payment':`status-${status||'unpaid'}`}
function initials(name){return String(name||'?').split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase()}
function notify(message){if(!els.toast)return;clearTimeout(toastTimer);els.toast.textContent=message;els.toast.classList.add('is-visible');toastTimer=setTimeout(()=>els.toast.classList.remove('is-visible'),2300)}

function canAutoApprove(r){
  if(!state.settings.autoApproveHome)return false;
  if(!['pending','review'].includes(r.status))return false;
  const rate=Number(r.rate||state.settings.homeRate);
  const evidence=Array.isArray(r.evidence)?r.evidence:[];
  const hasEvidence=evidence.some(x=>/meter|charger session/i.test(String(x)));
  return rate===Number(state.settings.homeRate)&&Number(r.energy)>0&&hasEvidence;
}
function applyAutoApproval(r){
  if(!canAutoApprove(r))return false;
  r.status='approved';r.paymentStatus=r.paymentStatus||'unpaid';r.reviewedAt=r.reviewedAt||`${todayLabel()} · policy`;r.reviewer='System policy';
  r.note=r.note||'Automatically approved under Fleet Settings home charging policy.';
  r.autoApproved=true;
  return true;
}
function normalize(){
  const defaults={paymentStatus:'unpaid',batchId:null,submittedAt:'—',reviewedAt:null,reviewer:null,homeCharger:'Registered home charger',meterId:'—',meterStart:null,meterEnd:null,tariffSource:'VoltDrive fleet home tariff',location:'Home charging',evidence:['Home charger session'],note:''};
  let autoApproved=0;state.reimbursements=(state.reimbursements||[]).map(r=>{const next={...defaults,...r,rate:Number(r.rate)||Number(state.settings.homeRate)||0,amount:Number(r.amount)||Math.round((Number(r.energy)||0)*(Number(r.rate)||Number(state.settings.homeRate)||0))};if(applyAutoApproval(next))autoApproved++;return next;});if(autoApproved){saveState(state);}
}

function populateDepartments(){
  const current=els.department.value||'all';
  const deps=[...new Set((state.drivers||[]).map(x=>x.departmentId).filter(Boolean))].sort((a,b)=>departmentName(state,a).localeCompare(departmentName(state,b)));
  els.department.innerHTML='<option value="all">All departments</option>'+deps.map(id=>`<option value="${esc(id)}">${esc(departmentName(state,id))}</option>`).join('');
  els.department.value=deps.includes(current)?current:'all';
}

function filteredClaims(){
  const q=els.search.value.trim().toLowerCase();
  return (state.reimbursements||[]).filter(r=>{
    const d=driverFor(r),v=vehicleFor(r),hay=[r.id,r.driver,d?.name,r.vehicle,v?.name,v?.plate,r.date].join(' ').toLowerCase();
    return (!q||hay.includes(q)) && (els.status.value==='all'||r.status===els.status.value) && (els.payment.value==='all'||r.paymentStatus===els.payment.value) && (els.department.value==='all'||d?.departmentId===els.department.value);
  }).sort((a,b)=>String(b.date).localeCompare(String(a.date)));
}

function renderKpis(){
  const claims=state.reimbursements||[];
  $('home-total').textContent=claims.length;
  $('home-pending').textContent=claims.filter(r=>['pending','review'].includes(r.status)).length;
  $('home-approved').textContent=money(claims.filter(r=>r.status==='approved').reduce((a,r)=>a+r.amount,0)).replace(' AMD','');
  $('home-payable').textContent=money(claims.filter(r=>r.status==='approved'&&r.paymentStatus!=='paid').reduce((a,r)=>a+r.amount,0)).replace(' AMD','');
  $('home-rate').textContent=state.settings.homeRate;
  $('home-auto-policy').textContent=state.settings.autoApproveHome?'Enabled':'Manager review';
  $('home-erp').textContent=state.settings.erpProvider||'Not configured';
}

function renderClaims(){
  const claims=filteredClaims();
  els.count.textContent=`${claims.length} claim${claims.length===1?'':'s'}`;
  els.body.innerHTML=claims.map(r=>{
    const d=driverFor(r),v=vehicleFor(r);
    return `<tr data-claim="${esc(r.id)}">
      <td><strong class="home-claim-id">${esc(r.id)}</strong><small>${esc(r.date)}</small></td>
      <td><div class="home-claim-driver"><span class="ui-avatar">${esc(initials(d?.name))}</span><div><strong>${esc(d?.name||r.driver)}</strong><small>${esc(r.vehicle)} · ${esc(v?.name||'Vehicle')}</small></div></div></td>
      <td><strong>${Number(r.energy).toFixed(1)} kWh</strong><small>${esc(r.homeCharger)}</small></td>
      <td><strong>${fmt.format(r.rate)} AMD</strong><small>${esc(r.tariffSource)}</small></td>
      <td><strong>${money(r.amount)}</strong><small>${esc(departmentFor(r))}</small></td>
      <td><span class="ui-pill ${reviewClass(r.status)}">${esc(label(r.status))}</span></td>
      <td><span class="ui-pill ${paymentClass(r.paymentStatus)}">${esc(r.paymentStatus==='queued'?'Queued':label(r.paymentStatus))}</span></td>
      <td><button class="action-button" type="button" data-open-claim="${esc(r.id)}">Review</button></td>
    </tr>`;
  }).join('')||'<tr><td colspan="8"><div class="empty-state--panel">No home charging claims match the current filters.</div></td></tr>';
  els.body.querySelectorAll('[data-open-claim]').forEach(btn=>btn.addEventListener('click',e=>{e.stopPropagation();openClaim(btn.dataset.openClaim)}));
  els.body.querySelectorAll('tr[data-claim]').forEach(row=>row.addEventListener('dblclick',()=>openClaim(row.dataset.claim)));
}

function renderBatches(){
  const groups=new Map();
  (state.reimbursements||[]).filter(r=>r.batchId).forEach(r=>{if(!groups.has(r.batchId))groups.set(r.batchId,[]);groups.get(r.batchId).push(r)});
  const entries=[...groups.entries()];
  $('home-batches').innerHTML=entries.length?`<div class="home-batch-list">${entries.map(([id,rows])=>{
    const total=rows.reduce((a,r)=>a+r.amount,0),paid=rows.filter(r=>r.paymentStatus==='paid').length;
    return `<div class="home-batch-row"><div><strong>${esc(id)}</strong><span>${rows.length} claims · ${paid}/${rows.length} paid</span></div><strong>${money(total)}</strong></div>`;
  }).join('')}</div>`:'<div class="empty-state--panel">No reimbursement batches created yet.</div>';
}

function renderPolicies(){
  const policies=[
    ['Standard reimbursement rate',`${state.settings.homeRate} AMD / kWh`,'status-active'],
    ['Manager approval',state.settings.autoApproveHome?'Automatic when policy matches':'Required',state.settings.autoApproveHome?'status-active':'status-review'],
    ['Cost center required',state.settings.costCenterRequired?'Required':'Optional',state.settings.costCenterRequired?'status-active':'status-unpaid'],
    ['ERP integration',state.settings.erpProvider||'Not configured',state.settings.erpProvider?'status-active':'status-attention']
  ];
  $('home-policy-checks').innerHTML=policies.map(([title,value,cls])=>`<div class="home-policy-row"><div><strong>${esc(title)}</strong><span>Configured in Fleet Settings</span></div><span class="ui-pill ${cls}">${esc(value)}</span></div>`).join('');
}

function timeline(r){
  const items=[['Claim submitted',r.submittedAt||r.date],r.reviewedAt?[r.status==='approved'?'Claim approved':'Claim reviewed',`${r.reviewedAt} · ${r.reviewer||'Fleet manager'}`]:['Awaiting manager decision','Pending review']];
  if(r.batchId)items.push(['Sent to billing',r.batchId]);
  if(r.paymentStatus==='paid')items.push(['Reimbursement paid',r.paymentReference||'Finance confirmed payment']);
  return `<div class="home-timeline">${items.map(x=>`<div class="home-timeline-item"><span class="home-timeline-dot"></span><div class="home-timeline-copy"><strong>${esc(x[0])}</strong><span>${esc(x[1])}</span></div></div>`).join('')}</div>`;
}

function openClaim(id){
  state=loadState();normalize();activeClaimId=id;const r=state.reimbursements.find(x=>x.id===id);if(!r)return;const d=driverFor(r),v=vehicleFor(r);
  els.drawerTitle.textContent=r.id;els.drawerSubtitle.textContent=`${d?.name||r.driver} · ${r.vehicle}`;
  els.drawerBody.innerHTML=`
    <div class="home-detail-hero"><div><span class="ui-pill ${reviewClass(r.status)}">${esc(label(r.status))}</span><h3>${esc(d?.name||r.driver)}</h3><p>${esc(r.vehicle)} · ${esc(v?.name||'Vehicle')} · ${esc(departmentFor(r))}</p></div><div class="home-amount"><strong>${money(r.amount)}</strong><span>${Number(r.energy).toFixed(1)} kWh × ${r.rate} AMD</span></div></div>
    <section class="ui-detail-section"><h3>Claim & meter data</h3><div class="ui-detail-grid"><div><span>Charging date</span><strong>${esc(r.date)}</strong></div><div><span>Home charger</span><strong>${esc(r.homeCharger)}</strong></div><div><span>Meter ID</span><strong>${esc(r.meterId)}</strong></div><div><span>Meter reading</span><strong>${r.meterStart!=null&&r.meterEnd!=null?`${r.meterStart} → ${r.meterEnd} kWh`:'—'}</strong></div><div><span>Tariff source</span><strong>${esc(r.tariffSource)}</strong></div><div><span>Payment status</span><strong><span class="ui-pill ${paymentClass(r.paymentStatus)}">${esc(r.paymentStatus==='queued'?'Queued':label(r.paymentStatus))}</span></strong></div></div></section>
    <section class="ui-detail-section"><h3>Reimbursement calculation</h3><div class="ui-callout ui-callout--info"><strong>${Number(r.energy).toFixed(1)} kWh × ${r.rate} AMD/kWh = ${money(r.amount)}</strong><span>Fleet policy rate: ${state.settings.homeRate} AMD/kWh. ${r.rate===state.settings.homeRate?'Claim matches policy.':'Claim rate differs from current policy and requires review.'}</span></div></section>
    <section class="ui-detail-section"><h3>Evidence</h3><div class="home-evidence-list">${(r.evidence||[]).map((x,i)=>`<div class="home-evidence-item"><div><strong>${esc(x)}</strong><span>Evidence item ${i+1} · available in prototype</span></div><span class="ui-pill status-active">Verified</span></div>`).join('')}</div></section>
    <section class="ui-detail-section"><h3>Manager note</h3><div class="ui-detail-list"><div><span>Note</span><strong>${esc(r.note||'No manager note yet.')}</strong></div><div><span>Reviewer</span><strong>${esc(r.reviewer||'Not reviewed')}</strong></div><div><span>Batch</span><strong>${esc(r.batchId||'Not batched')}</strong></div></div></section>
    <section class="ui-detail-section"><h3>Activity</h3>${timeline(r)}</section>`;
  els.viewDriver.href=`./drivers.html?driver=${encodeURIComponent(r.driver)}`;
  els.reject.hidden=r.status==='rejected'||r.paymentStatus==='paid';
  els.approve.hidden=r.paymentStatus==='paid';
  els.approve.textContent=r.status==='approved'?(r.paymentStatus==='queued'?'Mark paid':'Approved'):'Approve claim';
  els.approve.disabled=r.status==='approved'&&r.paymentStatus==='unpaid';
  if(r.status==='approved'&&r.paymentStatus==='queued'){els.approve.disabled=false;els.approve.textContent='Mark paid'}
  els.backdrop.hidden=false;requestAnimationFrame(()=>{els.backdrop.classList.add('is-visible');els.drawer.classList.add('is-open');els.drawer.setAttribute('aria-hidden','false')});
}
function closeClaim(){els.drawer.classList.remove('is-open');els.backdrop.classList.remove('is-visible');els.drawer.setAttribute('aria-hidden','true');setTimeout(()=>{if(!els.backdrop.classList.contains('is-visible'))els.backdrop.hidden=true},180)}

function openReview(action){
  const r=state.reimbursements.find(x=>x.id===activeClaimId);if(!r)return;reviewAction=action;
  els.reviewTitle.textContent=action==='approve'?'Approve reimbursement':'Reject reimbursement';
  els.reviewCopy.textContent=`${r.id} · ${money(r.amount)} · ${Number(r.energy).toFixed(1)} kWh`;
  els.reviewCalc.textContent=`Claim rate ${r.rate} AMD/kWh; fleet policy ${state.settings.homeRate} AMD/kWh. ${r.rate===state.settings.homeRate?'Rate matches policy.':'Rate variance requires manager confirmation.'}`;
  els.reviewNote.value=r.note||'';els.reviewConfirm.textContent=action==='approve'?'Approve claim':'Reject claim';els.reviewDialog.showModal();
}
function submitReview(){
  const r=state.reimbursements.find(x=>x.id===activeClaimId);if(!r)return;
  r.status=reviewAction==='approve'?'approved':'rejected';r.reviewedAt=`${todayLabel()} · now`;r.reviewer=state.company.manager||'Fleet manager';r.note=els.reviewNote.value.trim()||r.note||'';
  if(r.status==='rejected')r.paymentStatus='unpaid';
  state.auditLog=[{id:`AUD-HOME-${Date.now()}`,time:'Today',user:state.company.manager,action:`${reviewAction==='approve'?'Approved':'Rejected'} home charging claim`,resource:r.id,result:'success'},...(state.auditLog||[])];
  saveState(state);renderAll();openClaim(r.id);notify(`${r.id} ${r.status}.`);
}

function eligibleForBatch(){return (state.reimbursements||[]).filter(r=>r.status==='approved'&&r.paymentStatus==='unpaid')}
function openBatch(){
  state=loadState();normalize();const rows=eligibleForBatch();if(!rows.length){notify('No approved unpaid claims are ready for billing.');return}
  els.batchSummary.textContent=`${rows.length} claims · ${money(rows.reduce((a,r)=>a+r.amount,0))}`;els.batchRef.value=`RB-${new Date().toISOString().slice(5,10).replace('-','')}-${String(Date.now()).slice(-3)}`;els.batchNote.value='';els.batchDialog.showModal();
}
function createBatch(){
  const rows=eligibleForBatch(),ref=els.batchRef.value.trim()||`RB-${Date.now()}`;if(!rows.length)return;
  rows.forEach(r=>{
    r.paymentStatus='queued';r.batchId=ref;
    const existing=(state.billing.transactions||[]).find(t=>t.reference===r.id&&t.type==='Home reimbursement');
    const tx={id:existing?.id||`TX-HR-${Date.now()}-${r.id.slice(-2)}`,date:'Today',type:'Home reimbursement',reference:r.id,vehicle:r.vehicle,depotId:r.depotId,costCenter:costCenterFor(r),amount:r.amount,status:'pending',batchId:ref};
    if(existing)Object.assign(existing,tx);else state.billing.transactions=[tx,...(state.billing.transactions||[])];
  });
  state.auditLog=[{id:`AUD-HOME-${Date.now()}`,time:'Today',user:state.company.manager,action:'Created home reimbursement batch',resource:ref,result:'success'},...(state.auditLog||[])];
  saveState(state);renderAll();notify(`${ref} sent to Billing.`);
}

function openPaid(){const r=state.reimbursements.find(x=>x.id===activeClaimId);if(!r)return;els.paidCopy.textContent=`${r.id} · ${money(r.amount)} · batch ${r.batchId||'—'}`;els.paymentRef.value=`PAY-${String(Date.now()).slice(-7)}`;els.paidDialog.showModal()}
function markPaid(){
  const r=state.reimbursements.find(x=>x.id===activeClaimId);if(!r)return;r.paymentStatus='paid';r.paymentReference=els.paymentRef.value.trim()||`PAY-${Date.now()}`;
  const tx=(state.billing.transactions||[]).find(t=>t.reference===r.id&&t.type==='Home reimbursement');if(tx){tx.status='posted';tx.paymentReference=r.paymentReference}
  saveState(state);renderAll();openClaim(r.id);notify(`${r.id} marked paid.`);
}

function exportCsv(){
  const rows=filteredClaims();const data=[['Claim','Driver','Vehicle','Department','Date','Energy kWh','Rate AMD/kWh','Amount AMD','Review status','Payment status','Batch'],...rows.map(r=>[r.id,driverFor(r)?.name||r.driver,r.vehicle,departmentFor(r),r.date,r.energy,r.rate,r.amount,r.status,r.paymentStatus,r.batchId||''])];
  const csv=data.map(row=>row.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(',')).join('\n');const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='home-charging-reimbursements.csv';document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);notify('Home charging CSV exported.');
}

function renderAll(){state=loadState();normalize();populateDepartments();renderKpis();renderClaims();renderBatches();renderPolicies()}
[els.search].forEach(x=>x?.addEventListener('input',renderClaims));[els.status,els.payment,els.department].forEach(x=>x?.addEventListener('change',renderClaims));
$('home-drawer-close')?.addEventListener('click',closeClaim);els.backdrop?.addEventListener('click',closeClaim);document.addEventListener('keydown',e=>{if(e.key==='Escape'&&els.drawer.classList.contains('is-open'))closeClaim()});
els.reject?.addEventListener('click',()=>openReview('reject'));els.approve?.addEventListener('click',()=>{const r=state.reimbursements.find(x=>x.id===activeClaimId);if(r?.status==='approved'&&r.paymentStatus==='queued')openPaid();else openReview('approve')});
els.reviewForm?.addEventListener('submit',e=>{if(e.submitter?.id==='home-review-confirm')submitReview()});$('create-batch')?.addEventListener('click',openBatch);els.batchForm?.addEventListener('submit',e=>{if(e.submitter?.id==='home-batch-confirm')createBatch()});els.paidForm?.addEventListener('submit',e=>{if(e.submitter?.id==='home-paid-confirm')markPaid()});$('export-home')?.addEventListener('click',exportCsv);
const contextParams=new URLSearchParams(location.search);
const requestedDriver=contextParams.get('driver');
const requestedClaim=contextParams.get('claim');
if(requestedDriver&&els.search){els.search.value=requestedDriver;}
renderAll();
if(requestedClaim)openClaim(requestedClaim);
}
