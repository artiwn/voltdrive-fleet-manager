import {loadState,saveState,departmentName} from '../core/fleet-state.js';
import {initCommon} from '../layout/common.js';

const access=initCommon();
if(!access.denied){

let state=loadState();
let activeInvoiceId=null;
let toastTimer=null;

const $=id=>document.getElementById(id);
const money=value=>`${Number(value||0).toLocaleString('en-US')} AMD`;
const escapeHtml=value=>String(value??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
const statusLabel=value=>String(value||'').replace(/(^|[-_\s])\w/g,m=>m.toUpperCase());

const els={
  summary:$('billing-summary'),breakdown:$('cost-breakdown'),invoiceTable:$('invoice-table'),paymentMethods:$('payment-methods'),account:$('billing-account'),
  autoPay:$('autopay'),autoPayState:$('autopay-state'),autoPayNote:$('autopay-note'),periodChip:$('billing-period-chip'),spendChip:$('period-spend-chip'),invoiceCount:$('invoice-count'),
  transactionTable:$('transaction-table'),transactionSearch:$('transaction-search'),transactionStatus:$('transaction-status'),transactionType:$('transaction-type'),transactionCount:$('transaction-count'),
  allocationSummary:$('allocation-summary'),costCenterTable:$('cost-center-table'),
  drawer:$('invoice-drawer'),backdrop:$('invoice-drawer-backdrop'),drawerTitle:$('invoice-drawer-title'),drawerSubtitle:$('invoice-drawer-subtitle'),drawerBody:$('invoice-drawer-body'),invoiceDownload:$('invoice-download'),invoicePay:$('invoice-pay'),
  paymentDialog:$('payment-dialog'),paymentForm:$('payment-form'),profileDialog:$('profile-dialog'),profileForm:$('profile-form'),payDialog:$('pay-dialog'),payForm:$('pay-form'),toast:$('billing-toast')
};

function defaultMethod(){return (state.billing.paymentMethods||[]).find(x=>x.default&&x.status==='active')||(state.billing.paymentMethods||[]).find(x=>x.status==='active')||null;}
function openInvoices(){return (state.invoices||[]).filter(x=>x.status==='open');}
function amountDue(){return openInvoices().reduce((sum,x)=>sum+Number(x.amount||0),0);}

function renderSummary(){
  const b=state.billing,p=state.fleetPlan,due=amountDue(),credit=Math.max(0,Number(b.creditLimit||0)-due);
  els.summary.innerHTML=`
    <div class="finance-card finance-card--primary"><span>Amount due</span><strong>${money(due)}</strong><small>${openInvoices().length?`${openInvoices().length} open invoice${openInvoices().length===1?'':'s'}`:'No open invoices'}</small></div>
    <div class="finance-card"><span>Current charging spend</span><strong>${money(b.total)}</strong><small>${escapeHtml(b.currentPeriod)}</small></div>
    <div class="finance-card"><span>Fleet plan</span><strong>${money(p.monthlyFee)}</strong><small>${escapeHtml(p.name)}</small></div>
    <div class="finance-card"><span>Available credit</span><strong>${money(credit)}</strong><small>Limit ${money(b.creditLimit)}</small></div>`;
  els.periodChip.textContent=b.currentPeriod;
  els.spendChip.textContent=money(b.total);
  els.invoiceCount.textContent=`${state.invoices.length} invoices`;
}

function renderBreakdown(){
  const b=state.billing;
  const rows=[
    ['Charging energy',money(b.energyCost),''],
    ['Idle & parking fees',money(b.idleFees),''],
    ['Reservation fees',money(b.reservationFees||0),''],
    ['Home charging reimbursement',money(b.homeReimbursement),''],
    ['Fleet discounts',`− ${money(b.discounts)}`,'discount'],
    ['Charging services total',money(b.total),'total']
  ];
  els.breakdown.innerHTML=rows.map(([label,value,kind])=>`<div class="breakdown-row ${kind?`breakdown-row--${kind}`:''}"><span>${label}</span><strong>${value}</strong></div>`).join('');
}

function renderInvoices(){
  els.invoiceTable.innerHTML=(state.invoices||[]).map(i=>`<tr data-invoice-row="${escapeHtml(i.id)}">
    <td><div class="entity-main"><strong>${escapeHtml(i.id)}</strong><span>Issued ${escapeHtml(i.issued||'—')}</span></div></td>
    <td>${escapeHtml(i.period)}</td><td><strong>${money(i.amount)}</strong></td><td>${escapeHtml(i.due)}</td>
    <td><span class="ui-pill status-pill status-${escapeHtml(i.status)}">${statusLabel(i.status)}</span></td>
    <td><button class="action-button" data-open-invoice="${escapeHtml(i.id)}" type="button">Details</button></td>
  </tr>`).join('');
  document.querySelectorAll('[data-open-invoice]').forEach(btn=>btn.addEventListener('click',()=>openInvoice(btn.dataset.openInvoice)));
  document.querySelectorAll('[data-invoice-row]').forEach(row=>row.addEventListener('dblclick',()=>openInvoice(row.dataset.invoiceRow)));
}

function renderPaymentMethods(){
  const methods=state.billing.paymentMethods||[];
  els.paymentMethods.innerHTML=methods.map(m=>`<div class="billing-payment-card ${m.default?'is-default':''}">
    <div class="billing-payment-card__icon">${m.type==='Visa'?'V':m.type==='Mastercard'?'M':'¤'}</div>
    <div class="entity-main"><strong>${escapeHtml(m.label)}</strong><span>Expires ${escapeHtml(m.expiry)}${m.default?' · Default':''}</span></div>
    <div class="billing-payment-card__actions">${!m.default?`<button class="action-button" type="button" data-default-method="${escapeHtml(m.id)}">Set default</button>`:'<span class="ui-pill status-pill status-active">Default</span>'}</div>
  </div>`).join('')||'<div class="ops-empty-inline">No payment methods configured.</div>';
  document.querySelectorAll('[data-default-method]').forEach(btn=>btn.addEventListener('click',()=>setDefaultMethod(btn.dataset.defaultMethod)));
}

function renderAccount(){
  const b=state.billing;
  els.account.innerHTML=`<div class="ui-detail-list billing-account-list">
    <div><span>Legal name</span><strong>${escapeHtml(b.legalName)}</strong></div>
    <div><span>Tax ID</span><strong>${escapeHtml(b.taxId)}</strong></div>
    <div><span>Billing email</span><strong>${escapeHtml(b.billingEmail)}</strong></div>
    <div><span>Payment terms</span><strong>${escapeHtml(b.paymentTerms)}</strong></div>
    <div><span>Currency</span><strong>${escapeHtml(b.currency)}</strong></div>
  </div>`;
  els.autoPay.checked=Boolean(b.autoPay);
  els.autoPayState.textContent=b.autoPay?'Enabled':'Disabled';
  const method=defaultMethod();
  els.autoPayNote.textContent=b.autoPay?(method?`${method.label} will be charged automatically on the invoice due date.`:'Add a default payment method to use automatic payment.'):'Invoices require manual payment approval.';
}

function transactionTypes(){return [...new Set((state.billing.transactions||[]).map(x=>x.type))].sort();}
function fillTransactionTypes(){
  const current=els.transactionType.value||'all';
  els.transactionType.innerHTML='<option value="all">All types</option>'+transactionTypes().map(x=>`<option value="${escapeHtml(x)}">${escapeHtml(x)}</option>`).join('');
  if([...els.transactionType.options].some(o=>o.value===current))els.transactionType.value=current;
}
function filteredTransactions(){
  const q=(els.transactionSearch.value||'').trim().toLowerCase(),status=els.transactionStatus.value,type=els.transactionType.value;
  return (state.billing.transactions||[]).filter(x=>{
    const hay=[x.id,x.date,x.type,x.reference,x.vehicle,x.costCenter,x.status].join(' ').toLowerCase();
    return (!q||hay.includes(q))&&(status==='all'||x.status===status)&&(type==='all'||x.type===type);
  });
}
function renderTransactions(){
  const data=filteredTransactions();
  els.transactionCount.textContent=`${data.length} shown`;
  els.transactionTable.innerHTML=data.map(x=>`<tr><td>${escapeHtml(x.date)}</td><td>${escapeHtml(x.type)}</td><td><strong>${escapeHtml(x.reference)}</strong></td><td>${escapeHtml(x.vehicle)}</td><td>${escapeHtml(x.costCenter)}</td><td><span class="ui-pill status-pill status-${escapeHtml(x.status)}">${statusLabel(x.status)}</span></td><td><strong class="${Number(x.amount)<0?'billing-negative':''}">${Number(x.amount)<0?'− ':''}${money(Math.abs(Number(x.amount)))}</strong></td></tr>`).join('')||'<tr><td colspan="7"><div class="ops-empty">No transactions match these filters.</div></td></tr>';
}

function renderAllocation(){
  const centers=state.billing.costCenters||[],total=centers.reduce((a,x)=>a+Number(x.monthCost||0),0);
  els.allocationSummary.innerHTML=`
    <div class="kpi-card"><span>Allocated spend</span><strong>${money(total)}</strong><small>Across ${centers.length} cost centers</small></div>
    <div class="kpi-card"><span>Largest cost center</span><strong>${escapeHtml([...centers].sort((a,b)=>b.monthCost-a.monthCost)[0]?.name||'—')}</strong><small>${money(Math.max(0,...centers.map(x=>Number(x.monthCost||0))))}</small></div>
    <div class="kpi-card"><span>Mapped vehicles</span><strong>${centers.reduce((a,x)=>a+Number(x.vehicles||0),0)}</strong><small>Finance allocation enabled</small></div>`;
  els.costCenterTable.innerHTML=centers.map(x=>{const share=total?Math.round(x.monthCost/total*100):0;return `<tr><td><strong>${escapeHtml(x.name)}</strong></td><td>${escapeHtml(departmentName(state,x.departmentId||x.department))}</td><td>${x.vehicles}</td><td><strong>${money(x.monthCost)}</strong></td><td><div class="billing-share"><div class="ui-progress"><span class="ui-progress__bar" style="width:${share}%"></span></div><strong>${share}%</strong></div></td></tr>`}).join('');
}

function invoiceBreakdown(i){return [
  ['Charging energy',i.energy],['Fees',i.fees],['Home reimbursements',i.reimbursements],['Discounts',-Number(i.discounts||0)],['Tax',i.tax||0]
];}
function openInvoice(id){
  const i=(state.invoices||[]).find(x=>x.id===id);if(!i)return;
  activeInvoiceId=id;els.drawerTitle.textContent=i.id;els.drawerSubtitle.textContent=`${i.period} · Due ${i.due}`;
  els.drawerBody.innerHTML=`
    <section class="billing-invoice-hero"><div><span>Invoice total</span><strong>${money(i.amount)}</strong><small>${i.status==='paid'?`Paid ${escapeHtml(i.paid||i.due)}`:`Due ${escapeHtml(i.due)}`}</small></div><span class="ui-pill status-pill status-${escapeHtml(i.status)}">${statusLabel(i.status)}</span></section>
    <section class="ui-detail-section"><h3>Invoice information</h3><div class="ui-detail-grid"><div><span>Invoice</span><strong>${escapeHtml(i.id)}</strong></div><div><span>Billing period</span><strong>${escapeHtml(i.period)}</strong></div><div><span>Issued</span><strong>${escapeHtml(i.issued||'—')}</strong></div><div><span>Due date</span><strong>${escapeHtml(i.due)}</strong></div><div><span>Payment terms</span><strong>${escapeHtml(state.billing.paymentTerms)}</strong></div><div><span>Currency</span><strong>${escapeHtml(state.billing.currency)}</strong></div></div></section>
    <section class="ui-detail-section"><h3>Charges</h3><div class="breakdown">${invoiceBreakdown(i).map(([label,value])=>`<div class="breakdown-row"><span>${label}</span><strong class="${Number(value)<0?'billing-negative':''}">${Number(value)<0?'− ':''}${money(Math.abs(Number(value)))}</strong></div>`).join('')}<div class="breakdown-row breakdown-row--total"><span>Invoice total</span><strong>${money(i.amount)}</strong></div></div></section>
    <section class="ui-detail-section"><h3>Bill to</h3><div class="ui-detail-list"><div><span>Company</span><strong>${escapeHtml(state.billing.legalName)}</strong></div><div><span>Tax ID</span><strong>${escapeHtml(state.billing.taxId)}</strong></div><div><span>Billing email</span><strong>${escapeHtml(state.billing.billingEmail)}</strong></div><div><span>Address</span><strong>${escapeHtml(state.billing.billingAddress)}</strong></div></div></section>`;
  els.invoicePay.hidden=i.status==='paid';
  els.invoicePay.disabled=!defaultMethod();
  els.invoicePay.textContent=defaultMethod()?'Pay now':'Add payment method';
  els.backdrop.hidden=false;requestAnimationFrame(()=>els.backdrop.classList.add('is-visible'));els.drawer.classList.add('is-open');els.drawer.setAttribute('aria-hidden','false');
}
function closeInvoice(){els.drawer.classList.remove('is-open');els.drawer.setAttribute('aria-hidden','true');els.backdrop.classList.remove('is-visible');setTimeout(()=>{els.backdrop.hidden=true;},180);}

function downloadInvoice(id=activeInvoiceId){
  const i=(state.invoices||[]).find(x=>x.id===id);if(!i)return;
  const rows=invoiceBreakdown(i).map(([a,v])=>`${a}: ${Number(v)<0?'- ':''}${money(Math.abs(Number(v)))}`);
  const content=['VoltDrive Fleet — Corporate Invoice',`Invoice: ${i.id}`,`Period: ${i.period}`,`Issued: ${i.issued||'—'}`,`Due: ${i.due}`,`Status: ${statusLabel(i.status)}`,'',...rows,'',`TOTAL: ${money(i.amount)}`,'',`Bill to: ${state.billing.legalName}`,`Tax ID: ${state.billing.taxId}`,`Billing email: ${state.billing.billingEmail}`].join('\n');
  downloadText(`${i.id}.txt`,content,'text/plain;charset=utf-8');notify(`${i.id} downloaded.`);
}
function exportTransactions(){
  const rows=[['Date','Type','Reference','Vehicle','Cost center','Status','Amount AMD'],...(state.billing.transactions||[]).map(x=>[x.date,x.type,x.reference,x.vehicle,x.costCenter,x.status,x.amount])];
  const csv=rows.map(r=>r.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(',')).join('\n');downloadText('fleet-billing-transactions.csv',csv,'text/csv;charset=utf-8');notify('Transactions exported.');
}
function downloadText(filename,content,type){const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);}

function setDefaultMethod(id){state.billing.paymentMethods.forEach(x=>x.default=x.id===id);const m=defaultMethod();state.billing.paymentMethod=m?.label||'No payment method';saveState(state);renderPaymentMethods();renderAccount();notify('Default payment method updated.');}
function openPaymentDialog(){
  $('payment-last4').value='';$('payment-expiry').value='';$('payment-default').value=(state.billing.paymentMethods||[]).length?'no':'yes';els.paymentDialog.showModal();
}
function savePaymentMethod(){
  const last4=$('payment-last4').value.trim(),expiry=$('payment-expiry').value.trim(),type=$('payment-type').value,isDefault=$('payment-default').value==='yes';
  if(!/^\d{4}$/.test(last4)||!/^\d{2}\/\d{2}$/.test(expiry)){notify('Enter valid last 4 digits and expiry.');return false;}
  if(isDefault)state.billing.paymentMethods.forEach(x=>x.default=false);
  const id=`PM-${String((state.billing.paymentMethods||[]).length+1).padStart(2,'0')}`;
  const method={id,type,label:`${type} •••• ${last4}`,expiry,default:isDefault||!(state.billing.paymentMethods||[]).length,status:'active'};
  state.billing.paymentMethods=[...(state.billing.paymentMethods||[]),method];const def=defaultMethod();state.billing.paymentMethod=def?.label||method.label;saveState(state);renderPaymentMethods();renderAccount();notify('Payment method added.');return true;
}

function openProfileDialog(){const b=state.billing;$('profile-legal-name').value=b.legalName||'';$('profile-tax-id').value=b.taxId||'';$('profile-email').value=b.billingEmail||'';$('profile-address').value=b.billingAddress||'';$('profile-terms').value=b.paymentTerms||'Net 15';$('profile-currency').value=b.currency||'AMD';els.profileDialog.showModal();}
function saveProfile(){const b=state.billing;b.legalName=$('profile-legal-name').value.trim();b.taxId=$('profile-tax-id').value.trim();b.billingEmail=$('profile-email').value.trim();b.billingAddress=$('profile-address').value.trim();b.paymentTerms=$('profile-terms').value;b.currency=$('profile-currency').value;saveState(state);renderAccount();notify('Billing profile updated.');}

function openPayDialog(){
  const i=(state.invoices||[]).find(x=>x.id===activeInvoiceId);if(!i)return;
  const method=defaultMethod();if(!method){openPaymentDialog();return;}
  $('pay-dialog-copy').textContent=`Pay ${i.id} for ${money(i.amount)} now?`;$('pay-method-copy').textContent=`${method.label} · expires ${method.expiry}`;
  const body=els.payDialog.querySelector('.ui-dialog__body');body.querySelector('#billing-policy-fields')?.remove();
  const wrap=document.createElement('div');wrap.id='billing-policy-fields';wrap.className='billing-policy-fields';
  wrap.innerHTML=`${state.settings.costCenterRequired?'<div class="ui-callout ui-callout--info"><strong>Cost center policy active</strong><span>Payment will be posted to Corporate billing and remain available for department allocation.</span></div>':''}${state.settings.requirePo?'<label class="form-field"><span>Purchase order reference</span><input id="pay-po-reference" placeholder="PO-2026-..." required></label>':''}`;body.appendChild(wrap);els.payDialog.showModal();
}
function payInvoice(){
  const i=(state.invoices||[]).find(x=>x.id===activeInvoiceId);if(!i||i.status==='paid')return;
  const po=$('pay-po-reference');if(state.settings.requirePo&&!po?.value.trim()){notify('Purchase order reference is required by Fleet Settings.');return false;}
  const poRef=po?.value.trim()||'';
  i.status='paid';i.paid='Today';
  state.billing.transactions=[{id:`TX-PAY-${Date.now()}`,date:'Today',type:'Invoice payment',reference:i.id,vehicle:'—',costCenter:'Corporate billing',amount:i.amount,status:'posted',poReference:poRef},...(state.billing.transactions||[])];
  saveState(state);renderAll();openInvoice(i.id);notify(`${i.id} marked as paid.`);
}

function switchTab(name){
  document.querySelectorAll('[data-billing-view]').forEach(x=>x.hidden=x.dataset.billingView!==name);
  document.querySelectorAll('#billing-tabs [data-tab]').forEach(x=>x.classList.toggle('is-active',x.dataset.tab===name));
  if(name==='transactions')renderTransactions();if(name==='allocation')renderAllocation();
}
function notify(message){if(!els.toast)return;clearTimeout(toastTimer);els.toast.textContent=message;els.toast.classList.add('is-visible');toastTimer=setTimeout(()=>els.toast.classList.remove('is-visible'),2300);}

function renderAll(){state=loadState();renderSummary();renderBreakdown();renderInvoices();renderPaymentMethods();renderAccount();fillTransactionTypes();renderTransactions();renderAllocation();}

document.querySelectorAll('#billing-tabs [data-tab]').forEach(btn=>btn.addEventListener('click',()=>switchTab(btn.dataset.tab)));
els.autoPay?.addEventListener('change',()=>{state.billing.autoPay=els.autoPay.checked;saveState(state);renderAccount();notify(`Auto-pay ${state.billing.autoPay?'enabled':'disabled'}.`);});
els.transactionSearch?.addEventListener('input',renderTransactions);els.transactionStatus?.addEventListener('change',renderTransactions);els.transactionType?.addEventListener('change',renderTransactions);
$('export-transactions')?.addEventListener('click',exportTransactions);$('add-payment-method')?.addEventListener('click',openPaymentDialog);$('edit-billing-profile')?.addEventListener('click',openProfileDialog);$('edit-billing-profile-2')?.addEventListener('click',openProfileDialog);
$('invoice-drawer-close')?.addEventListener('click',closeInvoice);els.backdrop?.addEventListener('click',closeInvoice);els.invoiceDownload?.addEventListener('click',()=>downloadInvoice());els.invoicePay?.addEventListener('click',openPayDialog);
els.paymentForm?.addEventListener('submit',e=>{if(e.submitter?.id==='save-payment'&&!savePaymentMethod())e.preventDefault();});
els.profileForm?.addEventListener('submit',e=>{if(e.submitter?.id==='save-profile')saveProfile();});
els.payForm?.addEventListener('submit',e=>{if(e.submitter?.id==='confirm-pay'&&payInvoice()===false)e.preventDefault();});

renderAll();
const params=new URLSearchParams(location.search);if(params.get('invoice'))openInvoice(params.get('invoice'));
}
