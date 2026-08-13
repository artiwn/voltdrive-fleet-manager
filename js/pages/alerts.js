import {loadState,saveState} from '../core/fleet-state.js';
import {initCommon} from '../layout/common.js';

initCommon();
let state=loadState();
let activeAlertId=null;

const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
const label=value=>({critical:'Critical',warning:'Warning',info:'Information',readiness:'Readiness',charger:'Charger',energy:'Energy',queue:'Queue',open:'Open',acknowledged:'Acknowledged',resolved:'Resolved',none:'No escalation',monitor:'Monitor · 60 min',urgent:'Urgent · 30 min',immediate:'Immediate · 15 min'})[value]||value;
const userById=id=>(state.users||[]).find(user=>user.id===id);
const vehicleById=id=>(state.vehicles||[]).find(vehicle=>vehicle.id===id);
const chargerById=id=>(state.chargers||[]).find(charger=>charger.id===id);
const sessionById=id=>(state.sessions||[]).find(session=>session.id===id);
const nowLabel=()=>new Intl.DateTimeFormat('en',{hour:'2-digit',minute:'2-digit'}).format(new Date());

const severityDefaults={critical:{assignee:'USR-02',escalation:'immediate'},warning:{assignee:'USR-03',escalation:'urgent'},info:{assignee:null,escalation:'monitor'}};

function inferCategory(alert){
  if(alert.category) return alert.category;
  const text=`${alert.title} ${alert.body}`;
  if(/miss departure|projected to reach/i.test(text)) return 'readiness';
  if(/charger|connector|fault/i.test(text)) return 'charger';
  if(/load|capacity|energy/i.test(text)) return 'energy';
  return 'queue';
}
function inferRelations(alert){
  const text=`${alert.title} ${alert.body}`;
  const vehicleId=alert.vehicleId||text.match(/AM-\d+/)?.[0]||null;
  const chargerId=alert.chargerId||text.match(/(?:DC|AC)-\d+/)?.[0]||null;
  let sessionId=alert.sessionId||null;
  if(!sessionId&&chargerId){
    const related=(state.sessions||[]).find(session=>session.charger===chargerId&&(session.status==='active'||session.status==='failed'));
    sessionId=related?.id||null;
  }
  return {vehicleId,chargerId,sessionId};
}
function sourceFor(alert){
  if(alert.sourceType&&alert.sourceId) return {type:alert.sourceType,id:alert.sourceId};
  const rel=inferRelations(alert);
  if(rel.vehicleId) return {type:'Vehicle',id:rel.vehicleId};
  if(rel.chargerId) return {type:'Charger',id:rel.chargerId};
  return {type:inferCategory(alert)==='energy'?'Energy':'Depot',id:state.company.depot};
}
function activeStatus(alert){return alert.status==='resolved'?'resolved':alert.acknowledged?'acknowledged':'open';}
function severityClass(severity){return severity==='critical'?'status-risk':severity==='warning'?'status-attention':'status-info';}
function alertStatusClass(alert){return alert.status==='resolved'?'status-ready':alert.acknowledged?'status-queued':'status-risk';}
function assigneeName(alert){return alert.assigneeId?userById(alert.assigneeId)?.name||'Unknown user':'Unassigned';}
function normalizeAlert(raw){
  const category=inferCategory(raw);
  const relations=inferRelations(raw);
  const source=sourceFor(raw);
  return {...raw,category,relations,source,acknowledged:Boolean(raw.acknowledged),comments:Array.isArray(raw.comments)?raw.comments:[],timeline:Array.isArray(raw.timeline)?raw.timeline:[],assigneeId:raw.assigneeId??severityDefaults[raw.severity]?.assignee??null,escalation:raw.escalation||severityDefaults[raw.severity]?.escalation||'none',resolutionNote:raw.resolutionNote||'',maintenanceTicket:raw.maintenanceTicket||null};
}

function notificationChannels(severity){
  const channels=[];
  if(state.settings.notifyManagers)channels.push('In-app');
  if(severity==='critical'&&state.settings.emailCritical)channels.push('Email');
  if(severity==='critical'&&state.settings.smsCritical)channels.push('SMS');
  return channels.length?channels:['Portal only'];
}
function syncEnergyThresholdAlert(){
  const threshold=Math.max(1,Number(state.settings.alertThreshold)||80);
  const capacity=Math.max(1,Number(state.energy.capacityKw)||600);
  const pct=Math.round(Number(state.energy.currentKw||0)/capacity*100);
  const id='AL-POLICY-ENERGY';
  let alert=(state.alerts||[]).find(a=>a.id===id);
  if(pct>=threshold){
    const severity=pct>=95?'critical':'warning';
    const body=`Depot load is ${pct}% (${Math.round(state.energy.currentKw)} kW of ${Math.round(capacity)} kW). Fleet Settings threshold is ${threshold}%.`;
    if(!alert){alert={id,severity,title:'Depot load policy threshold exceeded',body,time:'Policy monitor · now',status:'open',category:'energy',sourceType:'Energy',sourceId:state.company.depot,acknowledged:false,comments:[],timeline:[]};state.alerts.unshift(alert);}
    else{alert.severity=severity;alert.body=body;if(alert.status==='resolved'){alert.status='open';alert.acknowledged=false;} }
    alert.notificationChannels=notificationChannels(severity);
  }else if(alert&&alert.status!=='resolved'){
    alert.status='resolved';alert.acknowledged=true;alert.resolutionNote=`Automatically cleared when site load returned below ${threshold}%.`;
  }
}

function ensureAlertModel(){
  let changed=false;
  state.alerts=(state.alerts||[]).map(raw=>{
    const normalized=normalizeAlert(raw);
    const baseTimeline=normalized.timeline.length?normalized.timeline:[{id:`${raw.id}-EV1`,time:raw.time||'Detected',title:'Alert detected',detail:raw.body,type:'detected'}];
    const next={...raw,category:normalized.category,vehicleId:normalized.relations.vehicleId,chargerId:normalized.relations.chargerId,sessionId:normalized.relations.sessionId,sourceType:normalized.source.type,sourceId:normalized.source.id,acknowledged:normalized.acknowledged,assigneeId:normalized.assigneeId,escalation:normalized.escalation,comments:normalized.comments,timeline:baseTimeline,resolutionNote:normalized.resolutionNote,maintenanceTicket:normalized.maintenanceTicket};
    if(JSON.stringify(next)!==JSON.stringify(raw)) changed=true;
    return next;
  });
  if(changed) saveState(state);
}
syncEnergyThresholdAlert();
ensureAlertModel();
saveState(state);

const severityFilter=$('severity-filter');
const statusFilter=$('alert-status-filter');
const categoryFilter=$('category-filter');
const assigneeFilter=$('assignee-filter');
const search=$('alert-search');
const list=$('alert-list');

function toast(message){const el=$('alert-toast');if(!el)return;el.textContent=message;el.classList.add('is-visible');clearTimeout(window.__alertToast);window.__alertToast=setTimeout(()=>el.classList.remove('is-visible'),1800);}
function addAudit(action,resource,result='success'){
  state.auditLog=state.auditLog||[];
  state.auditLog.unshift({id:'AUD-'+Date.now().toString().slice(-6),time:'Just now',user:state.company.manager,action,resource,result});
}
function addTimeline(alert,title,detail,type='activity'){
  alert.timeline=alert.timeline||[];
  alert.timeline.unshift({id:`${alert.id}-${Date.now()}`,time:`Today · ${nowLabel()}`,title,detail,type});
}
function persist(message){saveState(state);render();if(activeAlertId&&$('alert-drawer').classList.contains('is-open'))renderDrawer();if(message)toast(message);}

function populateAssignees(){
  const current=assigneeFilter.value||'all';
  assigneeFilter.innerHTML='<option value="all">All assignees</option><option value="unassigned">Unassigned</option>'+(state.users||[]).filter(user=>user.status==='active').map(user=>`<option value="${esc(user.id)}">${esc(user.name)}</option>`).join('');
  assigneeFilter.value=[...assigneeFilter.options].some(option=>option.value===current)?current:'all';
}

function normalizedAlerts(){return (state.alerts||[]).map(normalizeAlert);}
function filteredAlerts(){
  const q=search.value.trim().toLowerCase();
  return normalizedAlerts().filter(alert=>{
    const status=activeStatus(alert);
    const statusMatch=statusFilter.value==='all'||(statusFilter.value==='active'?alert.status==='open':status===statusFilter.value);
    const assigneeMatch=assigneeFilter.value==='all'||(assigneeFilter.value==='unassigned'?!alert.assigneeId:alert.assigneeId===assigneeFilter.value);
    const hay=`${alert.id} ${alert.title} ${alert.body} ${alert.source.type} ${alert.source.id} ${alert.relations.vehicleId||''} ${alert.relations.chargerId||''} ${alert.relations.sessionId||''} ${assigneeName(alert)} ${alert.category}`.toLowerCase();
    return (severityFilter.value==='all'||alert.severity===severityFilter.value)&&(categoryFilter.value==='all'||alert.category===categoryFilter.value)&&statusMatch&&assigneeMatch&&(!q||hay.includes(q));
  }).sort((a,b)=>({critical:3,warning:2,info:1}[b.severity]-({critical:3,warning:2,info:1}[a.severity]))||Number(a.status==='resolved')-Number(b.status==='resolved'));
}

function syncSummary(){
  const active=normalizedAlerts().filter(alert=>alert.status==='open');
  $('summary-critical').textContent=active.filter(alert=>alert.severity==='critical').length;
  $('summary-warning').textContent=active.filter(alert=>alert.severity==='warning').length;
  $('summary-acknowledged').textContent=active.filter(alert=>alert.acknowledged).length;
  $('summary-unassigned').textContent=active.filter(alert=>!alert.assigneeId).length;
  const badge=$('alert-badge');if(badge)badge.textContent=active.length;
}

function entityLabel(alert){
  if(alert.relations.vehicleId){const vehicle=vehicleById(alert.relations.vehicleId);return vehicle?`${vehicle.id} · ${vehicle.name}`:alert.relations.vehicleId;}
  if(alert.relations.chargerId){const charger=chargerById(alert.relations.chargerId);return charger?`${charger.id} · Bay ${charger.bay||'—'}`:alert.relations.chargerId;}
  return alert.source.id;
}

function render(){
  populateAssignees();
  const alerts=filteredAlerts();
  syncSummary();
  $('visible-count').textContent=`${alerts.length} alert${alerts.length===1?'':'s'}`;
  const highest=alerts[0]?.severity||null;
  $('highest-severity').textContent=highest?label(highest):'None';
  const impacted=new Set(alerts.filter(alert=>alert.category==='readiness'&&alert.relations.vehicleId).map(alert=>alert.relations.vehicleId));
  $('readiness-impact').textContent=`${impacted.size} vehicle${impacted.size===1?'':'s'}`;
  const escalated=alerts.filter(alert=>alert.status==='open'&&['urgent','immediate'].includes(alert.escalation)).length;
  $('escalated-count').textContent=`${escalated} alert${escalated===1?'':'s'}`;

  list.innerHTML=alerts.length?alerts.map(alert=>{
    const status=activeStatus(alert);
    const assignee=assigneeName(alert);
    return `<article class="alert-item alert-item--${esc(alert.severity)} ${alert.status==='resolved'?'is-resolved':''}" data-alert-card="${esc(alert.id)}">
      <div class="alert-item__top"><div class="alert-title-wrap"><span class="severity-dot sev-${esc(alert.severity)}"></span><div><div class="alert-eyebrow"><span>${esc(label(alert.severity))}</span><span>${esc(label(alert.category))}</span><span>${esc(alert.id)}</span>${alert.maintenanceTicket?`<span>${esc(alert.maintenanceTicket)}</span>`:''}</div><strong>${esc(alert.title)}</strong></div></div><span class="ui-pill status-pill ${alertStatusClass(alert)}">${esc(label(status))}</span></div>
      <p>${esc(alert.body)}</p>
      <div class="alert-context-grid"><div><span>Affected entity</span><strong>${esc(entityLabel(alert))}</strong></div><div><span>Owner</span><strong>${esc(assignee)}</strong></div><div><span>Escalation</span><strong>${esc(label(alert.escalation))}</strong></div><div><span>Detected</span><strong>${esc(alert.time)}</strong></div></div>
      <div class="alert-actions"><div class="alert-actions__hint">${alert.status==='resolved'?'Resolved and retained for operational history.':alert.acknowledged?'Reviewed by fleet operations; continue tracking until cleared.':'Needs review and operational ownership.'}</div><div class="alert-actions__buttons"><button class="action-button" data-open-alert="${esc(alert.id)}" type="button">Open details</button>${alert.status==='open'&&!alert.acknowledged?`<button class="action-button" data-ack="${esc(alert.id)}" type="button">Acknowledge</button>`:''}${alert.status==='open'?`<button class="action-button action-button--primary" data-resolve="${esc(alert.id)}" type="button">Resolve</button>`:`<button class="action-button" data-reopen="${esc(alert.id)}" type="button">Reopen</button>`}</div></div>
    </article>`;
  }).join(''):'<section class="panel"><div class="panel__body empty-alert-state"><strong>No alerts match the selected filters</strong><span>Change severity, category, status, assignee or search terms.</span></div></section>';
  bindListActions();
}

function bindListActions(){
  document.querySelectorAll('[data-open-alert]').forEach(button=>button.addEventListener('click',event=>{event.stopPropagation();openDrawer(button.dataset.openAlert);}));
  document.querySelectorAll('[data-alert-card]').forEach(card=>card.addEventListener('dblclick',()=>openDrawer(card.dataset.alertCard)));
  document.querySelectorAll('[data-ack]').forEach(button=>button.addEventListener('click',event=>{event.stopPropagation();acknowledgeAlert(button.dataset.ack);}));
  document.querySelectorAll('[data-resolve]').forEach(button=>button.addEventListener('click',event=>{event.stopPropagation();openResolveDialog(button.dataset.resolve);}));
  document.querySelectorAll('[data-reopen]').forEach(button=>button.addEventListener('click',event=>{event.stopPropagation();reopenAlert(button.dataset.reopen);}));
}

function openBackdrop(){const backdrop=$('alert-drawer-backdrop'),drawer=$('alert-drawer');backdrop.hidden=false;requestAnimationFrame(()=>{backdrop.classList.add('is-visible');drawer.classList.add('is-open');drawer.setAttribute('aria-hidden','false');});}
function closeDrawer(){const backdrop=$('alert-drawer-backdrop'),drawer=$('alert-drawer');drawer.classList.remove('is-open');drawer.setAttribute('aria-hidden','true');backdrop.classList.remove('is-visible');setTimeout(()=>{backdrop.hidden=true;},180);}
function openDrawer(id){activeAlertId=id;renderDrawer();openBackdrop();}

function relationButtons(alert){
  const buttons=[];
  if(alert.relations.vehicleId)buttons.push(`<button class="action-button" data-related-type="vehicle" data-related-id="${esc(alert.relations.vehicleId)}" type="button">Vehicle ${esc(alert.relations.vehicleId)}</button>`);
  if(alert.relations.chargerId)buttons.push(`<button class="action-button" data-related-type="charger" data-related-id="${esc(alert.relations.chargerId)}" type="button">Charger ${esc(alert.relations.chargerId)}</button>`);
  if(alert.relations.sessionId)buttons.push(`<button class="action-button" data-related-type="session" data-related-id="${esc(alert.relations.sessionId)}" type="button">Session ${esc(alert.relations.sessionId)}</button>`);
  if(alert.category==='energy')buttons.push('<button class="action-button" data-related-type="energy" type="button">Energy center</button>');
  if(alert.category==='readiness'||alert.category==='queue')buttons.push('<button class="action-button" data-related-type="operations" type="button">Live Operations</button>');
  return buttons.join('');
}
function renderTimeline(alert){
  const events=[...(alert.timeline||[])];
  if(alert.status==='resolved'&&alert.resolvedAt&&!events.some(event=>event.type==='resolved'))events.unshift({time:alert.resolvedAt,title:'Alert resolved',detail:alert.resolutionNote||'Issue cleared.',type:'resolved'});
  return events.map((event,index)=>`<div class="alert-timeline__item"><div class="alert-timeline__rail"><span class="alert-timeline__dot ${index===0?'is-current':''}"></span></div><time>${esc(event.time)}</time><div><strong>${esc(event.title)}</strong><span>${esc(event.detail)}</span></div></div>`).join('');
}
function renderComments(alert){return (alert.comments||[]).map(comment=>`<article class="alert-comment"><span class="ui-avatar">${esc(comment.initials||'NP')}</span><div><div class="alert-comment__meta"><strong>${esc(comment.author)}</strong><span>${esc(comment.time)}</span></div><p>${esc(comment.text)}</p></div></article>`).join('')||'<div class="alert-comments-empty">No comments yet. Add operational context for the next manager.</div>';}

function renderDrawer(){
  const raw=(state.alerts||[]).find(alert=>alert.id===activeAlertId);if(!raw)return;
  const alert=normalizeAlert(raw);
  const assignee=assigneeName(alert);
  $('alert-drawer-eyebrow').textContent=`${label(alert.severity)} · ${label(alert.category)} · ${alert.id}`;
  $('alert-drawer-title').textContent=alert.title;
  $('alert-drawer-subtitle').textContent=`${entityLabel(alert)} · detected ${alert.time}`;
  $('alert-drawer-body').innerHTML=`
    <div class="ui-callout ${alert.severity==='critical'?'ui-callout--danger':alert.severity==='warning'?'ui-callout--warning':'ui-callout--info'}"><strong>${esc(label(alert.severity))} operational alert</strong><p>${esc(alert.body)}</p></div>
    <section class="ui-detail-section"><h3>Ownership & SLA</h3><div class="ui-detail-grid"><div><span>Status</span><strong><span class="ui-pill ${alertStatusClass(alert)}">${esc(label(activeStatus(alert)))}</span></strong></div><div><span>Assignee</span><strong>${esc(assignee)}</strong></div><div><span>Escalation</span><strong>${esc(label(alert.escalation))}</strong></div><div><span>Category</span><strong>${esc(label(alert.category))}</strong></div></div></section>
    <section class="ui-detail-section"><h3>Affected resources</h3><div class="alert-related-actions">${relationButtons(alert)||'<span>No linked fleet entity</span>'}</div></section>
    ${alert.maintenanceTicket?`<section class="ui-detail-section"><h3>Maintenance</h3><div class="ui-callout ui-callout--info"><strong>${esc(alert.maintenanceTicket)}</strong><p>Maintenance ticket created from this alert and shared with technical operations.</p></div></section>`:alert.category==='charger'?`<section class="ui-detail-section"><h3>Maintenance</h3><button class="button button--secondary button--block" id="create-maintenance-ticket" type="button">Create maintenance ticket</button></section>`:''}
    <section class="ui-detail-section"><h3>Notification policy</h3><div class="ui-detail-list"><div><span>Channels</span><strong>${esc((alert.notificationChannels||notificationChannels(alert.severity)).join(' · '))}</strong></div><div><span>Quiet hours</span><strong>${esc(state.settings.quietHours||'Not configured')}</strong></div><div><span>Driver notifications</span><strong>${state.settings.notifyDrivers?'Enabled':'Disabled'}</strong></div></div></section>
    <section class="ui-detail-section"><h3>Operational timeline</h3><div class="alert-timeline">${renderTimeline(alert)}</div></section>
    <section class="ui-detail-section"><div class="alert-section-title"><h3>Comments</h3><span>${alert.comments.length}</span></div><div class="alert-comments">${renderComments(alert)}</div><form class="alert-comment-form" id="alert-comment-form"><label class="form-field"><span>Add comment</span><textarea id="alert-comment-text" rows="3" placeholder="Add investigation notes, handover context or next action..."></textarea></label><button class="button button--secondary" type="submit">Add comment</button></form></section>
    ${alert.status==='resolved'?`<section class="ui-detail-section"><h3>Resolution</h3><div class="ui-callout ui-callout--info"><strong>${esc(alert.resolvedBy||state.company.manager)} · ${esc(alert.resolvedAt||'Resolved')}</strong><p>${esc(alert.resolutionNote||'Issue cleared.')}</p></div></section>`:''}`;

  $('alert-acknowledge').hidden=alert.status==='resolved'||alert.acknowledged;
  $('alert-resolve').textContent=alert.status==='resolved'?'Reopen alert':'Resolve';
  $('alert-open-source').disabled=!alert.source;

  document.querySelectorAll('[data-related-type]').forEach(button=>button.addEventListener('click',()=>navigateRelation(button.dataset.relatedType,button.dataset.relatedId)));
  $('create-maintenance-ticket')?.addEventListener('click',createMaintenanceTicket);
  $('alert-comment-form')?.addEventListener('submit',event=>{event.preventDefault();addComment();});
}

function navigateRelation(type,id){
  if(type==='vehicle')location.href=`./vehicles.html?vehicle=${encodeURIComponent(id)}`;
  else if(type==='charger')location.href=`./depot.html?charger=${encodeURIComponent(id)}`;
  else if(type==='session')location.href=`./sessions.html?session=${encodeURIComponent(id)}`;
  else if(type==='energy')location.href='./energy.html';
  else if(type==='operations')location.href='./operations.html';
}
function navigateSource(){
  const alert=normalizeAlert((state.alerts||[]).find(item=>item.id===activeAlertId)||{});
  if(alert.source.type==='Vehicle')navigateRelation('vehicle',alert.source.id);
  else if(alert.source.type==='Charger')navigateRelation('charger',alert.source.id);
  else if(alert.source.type==='Energy')navigateRelation('energy');
  else if(alert.relations.sessionId)navigateRelation('session',alert.relations.sessionId);
  else navigateRelation('operations');
}

function acknowledgeAlert(id){
  const alert=(state.alerts||[]).find(item=>item.id===id);if(!alert||alert.status==='resolved')return;
  alert.acknowledged=true;alert.acknowledgedAt=`Today · ${nowLabel()}`;alert.acknowledgedBy=state.company.manager;
  addTimeline(alert,'Alert acknowledged',`${state.company.manager} reviewed the issue.`,'acknowledged');
  addAudit('Acknowledged alert',id);persist('Alert acknowledged');
}
function reopenAlert(id){
  const alert=(state.alerts||[]).find(item=>item.id===id);if(!alert)return;
  alert.status='open';alert.acknowledged=false;alert.resolutionNote='';alert.resolvedAt=null;alert.resolvedBy=null;
  addTimeline(alert,'Alert reopened',`${state.company.manager} returned the issue to active operations.`,'reopened');
  addAudit('Reopened alert',id);persist('Alert reopened');
}
function openResolveDialog(id=activeAlertId){activeAlertId=id;$('alert-resolution-note').value='';$('alert-resolve-dialog').showModal();}
function resolveAlert(){
  const alert=(state.alerts||[]).find(item=>item.id===activeAlertId);if(!alert)return false;
  const note=$('alert-resolution-note').value.trim();if(!note){toast('Add a resolution note before closing the alert.');return false;}
  alert.status='resolved';alert.acknowledged=true;alert.resolutionNote=note;alert.resolvedAt=`Today · ${nowLabel()}`;alert.resolvedBy=state.company.manager;
  addTimeline(alert,'Alert resolved',note,'resolved');addAudit('Resolved alert',alert.id);persist('Alert resolved');return true;
}
function openManageDialog(){
  const alert=normalizeAlert((state.alerts||[]).find(item=>item.id===activeAlertId)||{});
  $('manage-assignee').innerHTML='<option value="">Unassigned</option>'+(state.users||[]).filter(user=>user.status==='active').map(user=>`<option value="${esc(user.id)}">${esc(user.name)}</option>`).join('');
  $('manage-assignee').value=alert.assigneeId||'';$('manage-severity').value=alert.severity;$('manage-escalation').value=alert.escalation;$('manage-category').value=alert.category;$('alert-manage-dialog').showModal();
}
function saveManagedAlert(){
  const alert=(state.alerts||[]).find(item=>item.id===activeAlertId);if(!alert)return;
  const oldAssignee=alert.assigneeId||null,oldSeverity=alert.severity,oldEscalation=alert.escalation||'none';
  alert.assigneeId=$('manage-assignee').value||null;alert.severity=$('manage-severity').value;alert.escalation=$('manage-escalation').value;alert.category=$('manage-category').value;
  const changes=[];if(oldAssignee!==alert.assigneeId)changes.push(`owner → ${alert.assigneeId?userById(alert.assigneeId)?.name:'Unassigned'}`);if(oldSeverity!==alert.severity)changes.push(`severity → ${label(alert.severity)}`);if(oldEscalation!==alert.escalation)changes.push(`escalation → ${label(alert.escalation)}`);
  addTimeline(alert,'Alert management updated',changes.join(' · ')||'Alert metadata updated.','managed');addAudit('Updated alert ownership',alert.id);persist('Alert management updated');
}
function addComment(){
  const alert=(state.alerts||[]).find(item=>item.id===activeAlertId);const text=$('alert-comment-text')?.value.trim();if(!alert||!text)return;
  alert.comments=alert.comments||[];alert.comments.push({id:`COM-${Date.now()}`,author:state.company.manager,initials:state.company.manager.split(/\s+/).map(x=>x[0]).slice(0,2).join('').toUpperCase(),time:`Today · ${nowLabel()}`,text});
  addTimeline(alert,'Comment added',text,'comment');saveState(state);render();renderDrawer();toast('Comment added');
}
function createMaintenanceTicket(){
  const alert=(state.alerts||[]).find(item=>item.id===activeAlertId);if(!alert||alert.maintenanceTicket)return;
  alert.maintenanceTicket='MT-'+Date.now().toString().slice(-5);alert.acknowledged=true;
  addTimeline(alert,'Maintenance ticket created',`${alert.maintenanceTicket} created for ${alert.chargerId||'charger investigation'}.`,'maintenance');addAudit('Created maintenance ticket',alert.maintenanceTicket);persist('Maintenance ticket created');
}

[severityFilter,statusFilter,categoryFilter,assigneeFilter].forEach(element=>element.addEventListener('change',render));
search.addEventListener('input',render);
$('acknowledge-all').addEventListener('click',()=>{
  const ids=new Set(filteredAlerts().filter(alert=>alert.status==='open'&&!alert.acknowledged).map(alert=>alert.id));
  state.alerts.filter(alert=>ids.has(alert.id)).forEach(alert=>{alert.acknowledged=true;alert.acknowledgedAt=`Today · ${nowLabel()}`;alert.acknowledgedBy=state.company.manager;addTimeline(alert,'Alert acknowledged',`${state.company.manager} reviewed the issue.`,'acknowledged');});
  if(ids.size){addAudit('Bulk acknowledged alerts',`${ids.size} alerts`);persist(`${ids.size} alerts acknowledged`);}else toast('No visible alerts require acknowledgement.');
});
$('resolve-info').addEventListener('click',()=>{
  const targets=state.alerts.filter(alert=>alert.severity==='info'&&alert.status==='open');
  targets.forEach(alert=>{alert.status='resolved';alert.acknowledged=true;alert.resolutionNote='Informational condition reviewed and cleared from Alert Center.';alert.resolvedAt=`Today · ${nowLabel()}`;alert.resolvedBy=state.company.manager;addTimeline(alert,'Alert resolved',alert.resolutionNote,'resolved');});
  if(targets.length){addAudit('Bulk resolved informational alerts',`${targets.length} alerts`);persist(`${targets.length} informational alerts resolved`);}else toast('No active informational alerts.');
});
document.querySelectorAll('[data-summary-severity]').forEach(button=>button.addEventListener('click',()=>{severityFilter.value=button.dataset.summarySeverity;statusFilter.value='active';render();}));
document.querySelectorAll('[data-summary-status]').forEach(button=>button.addEventListener('click',()=>{statusFilter.value=button.dataset.summaryStatus;render();}));
document.querySelectorAll('[data-summary-assignee]').forEach(button=>button.addEventListener('click',()=>{assigneeFilter.value=button.dataset.summaryAssignee;statusFilter.value='active';render();}));

$('alert-drawer-close').addEventListener('click',closeDrawer);$('alert-drawer-backdrop').addEventListener('click',closeDrawer);
$('alert-open-source').addEventListener('click',navigateSource);$('alert-manage').addEventListener('click',openManageDialog);$('alert-acknowledge').addEventListener('click',()=>acknowledgeAlert(activeAlertId));$('alert-resolve').addEventListener('click',()=>{const alert=(state.alerts||[]).find(item=>item.id===activeAlertId);if(alert?.status==='resolved')reopenAlert(activeAlertId);else openResolveDialog();});
$('alert-manage-form').addEventListener('submit',event=>{if(event.submitter?.value==='cancel')return;event.preventDefault();saveManagedAlert();$('alert-manage-dialog').close();});
$('alert-resolve-form').addEventListener('submit',event=>{if(event.submitter?.value==='cancel')return;event.preventDefault();if(resolveAlert())$('alert-resolve-dialog').close();});

render();
const requestedAlert=new URLSearchParams(location.search).get('alert');if(requestedAlert&&state.alerts.some(alert=>alert.id===requestedAlert))openDrawer(requestedAlert);
