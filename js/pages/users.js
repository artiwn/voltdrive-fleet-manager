import {loadState,saveState} from '../core/fleet-state.js';
import {initCommon} from '../layout/common.js';
const access=initCommon();

let state=access.state||loadState();
let selectedUserId=null;
let selectedRoleId=null;
let editUserId=null;

const permissionCatalog=[
  {group:'Overview',items:[['dashboard.view','View dashboard']]},
  {group:'Fleet operations',items:[['operations.manage','Manage live operations'],['vehicles.view','View vehicles'],['vehicles.manage','Manage vehicles'],['drivers.view','View drivers'],['drivers.manage','Manage drivers'],['schedules.view','View schedules'],['schedules.manage','Manage schedules']]},
  {group:'Charging',items:[['chargers.view','View chargers'],['chargers.manage','Manage chargers'],['sessions.view','View sessions'],['sessions.stop','Stop charging sessions'],['reservations.view','View reservations'],['reservations.manage','Manage reservations']]},
  {group:'Energy & finance',items:[['energy.view','View energy'],['energy.manage','Manage energy'],['billing.view','View billing'],['billing.manage','Manage billing'],['home.manage','Manage home charging']]},
  {group:'Analytics & administration',items:[['reports.view','View reports'],['alerts.view','View alerts'],['alerts.manage','Manage alerts'],['users.manage','Manage users & roles'],['settings.manage','Manage fleet settings'],['audit.view','View audit log']]}
];

const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
const roleById=id=>state.roles.find(r=>r.id===id);
const initials=name=>String(name||'U').split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase();
const statusClass=status=>status==='active'?'status-active':status==='invited'?'status-queued':'status-suspended';
const labelStatus=status=>status==='invited'?'Invited':status==='suspended'?'Suspended':'Active';

function toast(message){
  const el=$('admin-toast');
  if(!el) return;
  el.textContent=message;el.classList.add('is-visible');
  clearTimeout(window.__adminToast);window.__adminToast=setTimeout(()=>el.classList.remove('is-visible'),1800);
}
function addAudit(action,resource,result='success'){
  const id='AUD-'+Date.now().toString().slice(-6);
  state.auditLog.unshift({id,time:'Just now',user:access.user?.name||state.company.manager,action,resource,result});
}
function persist(){saveState(state);renderAll();}

function populateFilters(){
  const roleFilter=$('admin-role-filter');
  const roleSelect=$('user-role');
  if(roleFilter){
    const current=roleFilter.value||'all';
    roleFilter.innerHTML='<option value="all">All roles</option>'+state.roles.map(r=>`<option value="${esc(r.id)}">${esc(r.name)}</option>`).join('');
    roleFilter.value=[...roleFilter.options].some(o=>o.value===current)?current:'all';
  }
  if(roleSelect){
    const current=roleSelect.value;
    roleSelect.innerHTML=state.roles.map(r=>`<option value="${esc(r.id)}">${esc(r.name)}</option>`).join('');
    if(current && [...roleSelect.options].some(o=>o.value===current)) roleSelect.value=current;
  }
}

function renderKpis(){
  const active=state.users.filter(u=>u.status==='active').length;
  const invited=state.users.filter(u=>u.status==='invited').length;
  const two=state.users.filter(u=>u.status==='active'&&u.twoFactor).length;
  $('admin-active-users').textContent=active;
  $('admin-user-limit').textContent=`${active} of ${state.fleetPlan.usersIncluded||12} plan seats used`;
  $('admin-role-count').textContent=state.roles.length;
  $('admin-2fa').textContent=active?`${Math.round(two/active*100)}%`:'0%';
  $('admin-2fa-note').textContent=`${two} of ${active} active users protected`;
  $('admin-invited').textContent=invited;
}

function filteredUsers(){
  const q=($('admin-search')?.value||'').trim().toLowerCase();
  const role=$('admin-role-filter')?.value||'all';
  const status=$('admin-status-filter')?.value||'all';
  return state.users.filter(u=>{
    const text=`${u.name} ${u.email} ${u.scope}`.toLowerCase();
    return (!q||text.includes(q))&&(role==='all'||u.role===role)&&(status==='all'||u.status===status);
  });
}
function renderUsers(){
  const rows=filteredUsers();
  $('admin-user-count').textContent=`${rows.length} users`;
  $('admin-users-body').innerHTML=rows.map(u=>{
    const role=roleById(u.role);
    return `<tr data-user-id="${esc(u.id)}"><td><div class="admin-user-identity"><span class="ui-avatar">${esc(u.avatar||initials(u.name))}</span><div><strong>${esc(u.name)}</strong><span>${esc(u.email)}</span></div></div></td><td><strong>${esc(role?.name||'Unknown role')}</strong></td><td>${esc(u.scope)}</td><td><span class="ui-pill ${u.twoFactor?'status-active':'status-attention'}">${u.twoFactor?'Enabled':'Not enabled'}</span></td><td>${esc(u.lastActive)}</td><td><span class="ui-pill ${statusClass(u.status)}">${labelStatus(u.status)}</span></td><td><button class="action-button" type="button" data-open-user="${esc(u.id)}">Open</button></td></tr>`;
  }).join('')||'<tr><td colspan="7"><div class="reports-empty">No users match the current filters.</div></td></tr>';
  document.querySelectorAll('[data-open-user]').forEach(btn=>btn.addEventListener('click',()=>openUser(btn.dataset.openUser)));
}

function renderRoles(){
  $('admin-role-grid').innerHTML=state.roles.map(role=>{
    const count=state.users.filter(u=>u.role===role.id).length;
    return `<article class="admin-role-card" data-role-id="${esc(role.id)}"><div class="admin-role-card__head"><div><span>ROLE</span><h3>${esc(role.name)}</h3></div><span class="panel-chip">${count} user${count===1?'':'s'}</span></div><p>${esc(role.description)}</p><div class="admin-role-card__meta"><span>${role.permissions.length} permissions</span><span>${role.system?'System role':'Custom role'}</span></div><button class="button button--secondary" type="button" data-open-role="${esc(role.id)}">View permissions</button></article>`;
  }).join('');
  document.querySelectorAll('[data-open-role]').forEach(btn=>btn.addEventListener('click',()=>openRole(btn.dataset.openRole)));
}
function filteredAudit(){
  const q=($('audit-search')?.value||'').trim().toLowerCase();
  const result=$('audit-result-filter')?.value||'all';
  return state.auditLog.filter(a=>{
    const text=`${a.time} ${a.user} ${a.action} ${a.resource}`.toLowerCase();
    return (!q||text.includes(q))&&(result==='all'||a.result===result);
  });
}
function renderAudit(){
  const rows=filteredAudit();
  $('audit-count').textContent=`${rows.length} events`;
  $('audit-body').innerHTML=rows.map(a=>`<tr><td>${esc(a.time)}</td><td><strong>${esc(a.user)}</strong></td><td>${esc(a.action)}</td><td>${esc(a.resource)}</td><td><span class="ui-pill ${a.result==='success'?'status-active':'status-risk'}">${a.result==='success'?'Success':'Blocked'}</span></td></tr>`).join('')||'<tr><td colspan="5"><div class="reports-empty">No audit events match the current filters.</div></td></tr>';
}
function renderAll(){populateFilters();renderKpis();renderUsers();renderRoles();renderAudit();if(selectedUserId && $('admin-user-drawer').classList.contains('is-open')) renderUserDrawer();if(selectedRoleId && $('role-drawer').classList.contains('is-open')) renderRoleDrawer();}

function openBackdrop(backdrop,drawer){backdrop.hidden=false;requestAnimationFrame(()=>{backdrop.classList.add('is-visible');drawer.classList.add('is-open');drawer.setAttribute('aria-hidden','false')});}
function closeBackdrop(backdrop,drawer){drawer.classList.remove('is-open');drawer.setAttribute('aria-hidden','true');backdrop.classList.remove('is-visible');setTimeout(()=>backdrop.hidden=true,180);}

function renderPermissionSummary(role){
  return permissionCatalog.map(group=>{
    const granted=group.items.filter(([key])=>role.permissions.includes(key));
    if(!granted.length) return '';
    return `<section class="ui-detail-section"><h3>${esc(group.group)}</h3><div class="admin-permission-list">${granted.map(([,label])=>`<div><span>${esc(label)}</span><span class="ui-pill status-active">Allowed</span></div>`).join('')}</div></section>`;
  }).join('');
}
function openUser(id){selectedUserId=id;renderUserDrawer();openBackdrop($('admin-drawer-backdrop'),$('admin-user-drawer'));}
function renderUserDrawer(){
  const u=state.users.find(x=>x.id===selectedUserId);if(!u)return;
  const role=roleById(u.role);
  $('admin-drawer-title').textContent=u.name;$('admin-drawer-subtitle').textContent=u.email;
  $('admin-drawer-body').innerHTML=`<div class="admin-profile-hero"><span class="ui-avatar ui-avatar--large">${esc(u.avatar||initials(u.name))}</span><div><strong>${esc(role?.name||'Unknown role')}</strong><span>${esc(u.scope)}</span></div><span class="ui-pill ${statusClass(u.status)}">${labelStatus(u.status)}</span></div><section class="ui-detail-section"><h3>Account</h3><div class="ui-detail-grid"><div><span>User ID</span><strong>${esc(u.id)}</strong></div><div><span>Two-factor auth</span><strong>${u.twoFactor?'Required':'Not required'}</strong></div><div><span>Last active</span><strong>${esc(u.lastActive)}</strong></div><div><span>Fleet scope</span><strong>${esc(u.scope)}</strong></div></div></section>${role?renderPermissionSummary(role):''}`;
  $('admin-toggle-user').textContent=u.status==='suspended'?'Reactivate':u.status==='invited'?'Cancel invitation':'Suspend user';
}
function closeUser(){closeBackdrop($('admin-drawer-backdrop'),$('admin-user-drawer'));}

function openRole(id){selectedRoleId=id;renderRoleDrawer();openBackdrop($('role-drawer-backdrop'),$('role-drawer'));}
function renderRoleDrawer(){
  const role=roleById(selectedRoleId);if(!role)return;
  const count=state.users.filter(u=>u.role===role.id).length;
  $('role-drawer-title').textContent=role.name;$('role-drawer-subtitle').textContent=`${count} assigned users · ${role.permissions.length} permissions`;
  $('role-drawer-body').innerHTML=`<div class="ui-callout ui-callout--info"><strong>${esc(role.name)}</strong><p>${esc(role.description)}</p></div>${renderPermissionSummary(role)}`;
}
function closeRole(){closeBackdrop($('role-drawer-backdrop'),$('role-drawer'));}

function openUserDialog(id=null){
  editUserId=id;populateFilters();
  const u=id?state.users.find(x=>x.id===id):null;
  $('user-dialog-title').textContent=u?'Edit user access':'Invite user';
  $('user-save').textContent=u?'Save changes':'Send invitation';
  $('user-name').value=u?.name||'';$('user-email').value=u?.email||'';$('user-role').value=u?.role||state.roles[1]?.id||state.roles[0]?.id||'';$('user-scope').value=u?.scope||'Yerevan Central Depot';$('user-2fa').checked=u?.twoFactor??state.settings.requireTwoFactor;
  $('user-dialog').showModal();
}
function saveUserFromDialog(){
  const name=$('user-name').value.trim(),email=$('user-email').value.trim();
  if(!name||!email) return false;
  if(editUserId){
    const u=state.users.find(x=>x.id===editUserId);if(!u)return false;
    const oldRole=u.role;Object.assign(u,{name,email,role:$('user-role').value,scope:$('user-scope').value,twoFactor:$('user-2fa').checked,avatar:initials(name)});
    addAudit(oldRole!==u.role?'Changed user role':'Updated user access',u.name);
    toast('User access updated');selectedUserId=u.id;
    if(u.id===access.user?.id&&oldRole!==u.role)setTimeout(()=>location.reload(),250);
  }else{
    const id='USR-'+String(Math.max(0,...state.users.map(u=>Number(String(u.id).replace(/\D/g,''))||0))+1).padStart(2,'0');
    state.users.push({id,name,email,role:$('user-role').value,scope:$('user-scope').value,status:'invited',twoFactor:$('user-2fa').checked,lastActive:'Invitation pending',avatar:initials(name)});
    addAudit('Invited portal user',email);toast('Invitation created');
  }
  saveState(state);renderAll();return true;
}

function openRoleEditor(){
  const role=roleById(selectedRoleId);if(!role)return;
  $('role-dialog-title').textContent=`Edit ${role.name}`;
  $('permission-editor').innerHTML=permissionCatalog.map(group=>`<section class="admin-permission-group"><h3>${esc(group.group)}</h3>${group.items.map(([key,label])=>`<label class="admin-permission-check"><input type="checkbox" value="${esc(key)}" ${role.permissions.includes(key)?'checked':''}><span><strong>${esc(label)}</strong><small>${esc(key)}</small></span></label>`).join('')}</section>`).join('');
  $('role-dialog').showModal();
}
function saveRolePermissions(){
  const role=roleById(selectedRoleId);if(!role)return;
  role.permissions=[...$('permission-editor').querySelectorAll('input:checked')].map(x=>x.value);
  addAudit('Updated role permissions',role.name);saveState(state);renderAll();toast('Role permissions saved');if(role.id===access.role?.id)setTimeout(()=>location.reload(),250);
}
function exportAudit(){
  const rows=[['Time','User','Action','Resource','Result'],...filteredAudit().map(a=>[a.time,a.user,a.action,a.resource,a.result])];
  const csv=rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='voltdrive-audit-log.csv';a.click();URL.revokeObjectURL(url);toast('Audit CSV exported');
}

$('admin-tabs').addEventListener('click',e=>{const btn=e.target.closest('[data-admin-tab]');if(!btn)return;document.querySelectorAll('[data-admin-tab]').forEach(x=>x.classList.toggle('is-active',x===btn));document.querySelectorAll('[data-admin-panel]').forEach(p=>p.hidden=p.dataset.adminPanel!==btn.dataset.adminTab);});
['admin-search','admin-role-filter','admin-status-filter'].forEach(id=>$(id).addEventListener(id==='admin-search'?'input':'change',renderUsers));
['audit-search','audit-result-filter'].forEach(id=>$(id).addEventListener(id==='audit-search'?'input':'change',renderAudit));
$('invite-user').addEventListener('click',()=>openUserDialog());$('admin-drawer-close').addEventListener('click',closeUser);$('admin-drawer-backdrop').addEventListener('click',closeUser);$('role-drawer-close').addEventListener('click',closeRole);$('role-drawer-backdrop').addEventListener('click',closeRole);
$('admin-edit-user').addEventListener('click',()=>selectedUserId&&openUserDialog(selectedUserId));
$('admin-toggle-user').addEventListener('click',()=>{const u=state.users.find(x=>x.id===selectedUserId);if(!u)return;if(u.status==='invited'){state.users=state.users.filter(x=>x.id!==u.id);addAudit('Cancelled user invitation',u.email);closeUser();toast('Invitation cancelled');}else{u.status=u.status==='suspended'?'active':'suspended';u.lastActive=u.status==='suspended'?'Access suspended':'Reactivated just now';addAudit(u.status==='suspended'?'Suspended portal user':'Reactivated portal user',u.name);toast(u.status==='suspended'?'User suspended':'User reactivated');}saveState(state);renderAll();});
$('role-edit').addEventListener('click',openRoleEditor);$('audit-export').addEventListener('click',exportAudit);
$('user-form').addEventListener('submit',e=>{if(e.submitter?.value==='cancel')return;e.preventDefault();if(saveUserFromDialog())$('user-dialog').close();});
$('role-form').addEventListener('submit',e=>{if(e.submitter?.value==='cancel')return;e.preventDefault();saveRolePermissions();$('role-dialog').close();});

function applyUsersAccessMode(){
  const canManageUsers=access.can('users.manage');
  const canAudit=access.can('audit.view');
  document.querySelectorAll('[data-admin-tab="users"],[data-admin-tab="roles"]').forEach(button=>button.hidden=!canManageUsers);
  document.querySelectorAll('[data-admin-panel="users"],[data-admin-panel="roles"]').forEach(panel=>panel.hidden=!canManageUsers);
  const auditTab=document.querySelector('[data-admin-tab="audit"]');
  const auditPanel=document.querySelector('[data-admin-panel="audit"]');
  if(auditTab)auditTab.hidden=!canAudit;
  if(!canManageUsers&&canAudit){
    document.querySelectorAll('[data-admin-tab]').forEach(button=>button.classList.remove('is-active'));
    document.querySelectorAll('[data-admin-panel]').forEach(panel=>panel.hidden=true);
    auditTab?.classList.add('is-active');
    if(auditPanel)auditPanel.hidden=false;
  }
}
applyUsersAccessMode();
renderAll();
