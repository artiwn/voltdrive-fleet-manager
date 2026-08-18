import {loadState,getAccessContext,setCurrentAccessUserId,getPrototypeAccessDirectory} from '../core/fleet-state.js';

const SIDEBAR_SCROLL_KEY='voltdrive_fleet_sidebar_scroll_v1';
const SESSION_ACTIVITY_KEY='voltdrive_fleet_session_activity_v1';

const PAGE_RULES={
  'dashboard.html':{nav:'dashboard',view:['dashboard.view']},
  'operations.html':{nav:'operations',view:['operations.manage'],manage:'operations.manage'},
  'vehicles.html':{nav:'vehicles',view:['vehicles.view','vehicles.manage'],manage:'vehicles.manage'},
  'drivers.html':{nav:'drivers',view:['drivers.view','drivers.manage'],manage:'drivers.manage'},
  'schedules.html':{nav:'schedules',view:['schedules.view','schedules.manage'],manage:'schedules.manage'},
  'depot.html':{nav:'depot',view:['chargers.view','chargers.manage'],manage:'chargers.manage'},
  'sessions.html':{nav:'sessions',view:['sessions.view','sessions.stop'],manage:'sessions.stop'},
  'reservations.html':{nav:'reservations',view:['reservations.view','reservations.manage'],manage:'reservations.manage'},
  'energy.html':{nav:'energy',view:['energy.view','energy.manage'],manage:'energy.manage'},
  'billing.html':{nav:'billing',view:['billing.view','billing.manage'],manage:'billing.manage',scope:'all-depots'},
  'fleet-plan.html':{nav:'plan',view:['billing.view','billing.manage'],manage:'billing.manage',scope:'all-depots'},
  'home-charging.html':{nav:'home-charging',view:['home.manage'],manage:'home.manage'},
  'reports.html':{nav:'reports',view:['reports.view']},
  'alerts.html':{nav:'alerts',view:['alerts.view','alerts.manage'],manage:'alerts.manage'},
  'users.html':{nav:'users',view:['users.view','users.manage','roles.view','roles.manage','audit.view']},
  'fleet-settings.html':{nav:'settings',view:['settings.manage'],manage:'settings.manage',scope:'all-depots'}
};
const NAV_RULES=Object.fromEntries(Object.values(PAGE_RULES).map(rule=>[rule.nav,rule]));

const ACTION_RULES={
  vehicles:{permission:'vehicles.manage',selectors:['#simulate-button','#add-vehicle','#drawer-edit','#drawer-driver','#vehicle-save','#driver-dialog button.button--primary']},
  drivers:{permission:'drivers.manage',selectors:['#driver-reset','#driver-add','#driver-assign','#driver-edit','#driver-status-action','#driver-form-save','#driver-assign-save']},
  schedules:{permission:'schedules.manage',selectors:['#schedule-import','#schedule-add','#schedule-edit','#schedule-confirm','#schedule-form-save']},
  depot:{permission:'chargers.manage',selectors:['#rebalance-button','#assign-button','#charger-secondary-action','#charger-primary-action','#charger-dialog-confirm','[data-assign-vehicle]','.queue-charger-select']},
  sessions:{permission:'sessions.stop',selectors:['#session-primary-action','#confirm-session-stop']},
  reservations:{permission:'reservations.manage',selectors:['#new-reservation','#reservation-secondary-action','#reservation-primary-action','#reservation-next','#confirm-reservation-cancel','[data-reservation-waitlist]']},
  energy:{permission:'energy.manage',selectors:['#edit-strategy','#rebalance-power','#edit-strategy-inline','#energy-adjust-power','#save-energy-strategy','#save-power','[data-adjust-power]','#strategy-smart-priority','#strategy-peak-protection','#strategy-solar','#strategy-battery']},
  billing:{permission:'billing.manage',selectors:['#edit-billing-profile','#edit-billing-profile-2','#add-payment-method','#invoice-pay','#save-payment','#save-profile','#confirm-pay','#autopay','[data-default-method]']},
  plan:{permission:'billing.manage',selectors:['#add-capacity','#manage-plan','#confirm-plan-change','#confirm-capacity','[data-select-plan]']},
  'home-charging':{permission:'home.manage',selectors:['#create-batch','#home-reject','#home-approve','#home-review-confirm','#home-batch-confirm','#home-paid-confirm']},
  alerts:{permission:'alerts.manage',selectors:['#acknowledge-all','#resolve-info','#alert-manage','#alert-acknowledge','#alert-resolve','#alert-manage-save','#alert-resolve-save','[data-ack]','[data-resolve]','[data-reopen]','#create-maintenance-ticket','#alert-comment-form textarea','#alert-comment-form button']},
  users:[{permission:'users.manage',selectors:['#invite-user','#admin-edit-user','#admin-toggle-user','#user-save']},{permission:'roles.manage',selectors:['#role-edit','#role-save']},{permission:'audit.export',selectors:['#audit-export']}],
  settings:{permission:'settings.manage',selectors:['#test-erp','#reset-settings','.settings-tab-panel input','.settings-tab-panel select','.settings-tab-panel textarea']}
};

function initSidebarScroll(sidebar){
  if(!sidebar)return;
  const restore=()=>{
    const saved=Number(sessionStorage.getItem(SIDEBAR_SCROLL_KEY));
    if(Number.isFinite(saved)&&saved>0)sidebar.scrollTop=saved;
  };
  requestAnimationFrame(()=>requestAnimationFrame(restore));
  const persist=()=>sessionStorage.setItem(SIDEBAR_SCROLL_KEY,String(sidebar.scrollTop));
  sidebar.addEventListener('scroll',persist,{passive:true});
  sidebar.querySelectorAll('a.nav-link').forEach(link=>link.addEventListener('click',persist));
  window.addEventListener('pagehide',persist);
}

function pageName(){return location.pathname.split('/').pop()||'dashboard.html';}
function canAny(access,permissions=[]){return permissions.some(permission=>access.can(permission));}
function ruleAllowed(access,rule){return Boolean(rule&&canAny(access,rule.view)&&(rule.scope!=='all-depots'||access.allDepots));}
function currentRule(){return PAGE_RULES[pageName()]||null;}
function actionGroups(rule){const action=rule&&ACTION_RULES[rule.nav];return !action?[]:(Array.isArray(action)?action:[action]);}

function applyNavigation(access){
  document.querySelectorAll('.nav-link[data-nav]').forEach(link=>{
    const rule=NAV_RULES[link.dataset.nav];
    const allowed=!rule||ruleAllowed(access,rule);
    link.hidden=!allowed;
    link.setAttribute('aria-hidden',String(!allowed));
  });
  document.querySelectorAll('.sidebar__group').forEach(group=>{
    const visible=[...group.querySelectorAll('.nav-link')].some(link=>!link.hidden);
    group.hidden=!visible;
  });
  // Guard contextual links outside the sidebar as well.
  document.querySelectorAll('a[href$=".html"]').forEach(link=>{
    let target;
    try{target=new URL(link.href,location.href).pathname.split('/').pop();}catch{return;}
    const rule=PAGE_RULES[target];
    if(!rule||ruleAllowed(access,rule))return;
    link.dataset.accessRestricted='true';
    link.setAttribute('aria-disabled','true');
    link.title='Your current role does not have access to this section.';
  });
}

function renderAccessIdentity(state,access){
  const user=access.user;
  const role=access.role;
  const headerRight=document.querySelector('.app-header .header__right');
  if(headerRight&&!headerRight.querySelector('.role-chip')){
    const chip=document.createElement('span');chip.className='role-chip';headerRight.prepend(chip);
  }
  document.querySelectorAll('[data-manager-name]').forEach(el=>el.textContent=user?.name||state.company.manager);
  document.querySelectorAll('[data-company-name]').forEach(el=>el.textContent=state.company.name);
  document.querySelectorAll('[data-depot-name]').forEach(el=>el.textContent=access.scope||state.company.depot);
  document.querySelectorAll('.role-chip').forEach(el=>el.textContent=role?.name||'No role');
  document.querySelectorAll('.sidebar__avatar').forEach(el=>el.textContent=user?.avatar||'U');
  document.body.dataset.accessRole=role?.id||'none';
  document.body.dataset.accessScope=access.scope||'All depots';
}

function installPrototypeUserSwitcher(state,access){
  const footer=document.querySelector('.sidebar__footer');
  if(!footer||footer.querySelector('.access-preview'))return;
  const directory=getPrototypeAccessDirectory();
  const active=directory.users||[];
  if(!active.length)return;
  const wrap=document.createElement('div');
  wrap.className='access-preview';
  wrap.innerHTML=`<label><span>Prototype access</span><select class="access-preview__select" aria-label="Preview portal as another user">${active.map(user=>{
    const role=(directory.roles||[]).find(item=>item.id===user.role);
    return `<option value="${user.id}" ${user.id===access.user?.id?'selected':''}>${user.name} · ${role?.name||'No role'}</option>`;
  }).join('')}</select></label><small>Prototype only · ${active.length} active users · current scope: ${access.scope||'No depot scope'}</small>`;
  footer.appendChild(wrap);
  wrap.querySelector('select')?.addEventListener('change',event=>{
    setCurrentAccessUserId(event.target.value);
    location.reload();
  });
}

function accessLabel(permission){
  return permission.replace(/\./g,' · ').replace(/\b\w/g,char=>char.toUpperCase());
}
function restrictElement(element,permission){
  if(!element||element.dataset.accessRestricted==='true')return;
  element.dataset.accessRestricted='true';
  element.dataset.requiredPermission=permission;
  element.title=`Requires ${accessLabel(permission)}`;
  if(element.matches('button,input,select,textarea'))element.disabled=true;
  if(element.matches('a'))element.setAttribute('aria-disabled','true');
}
function applyActionRules(access,securityCompliant=true){
  const groups=actionGroups(currentRule());
  groups.forEach(action=>{
    if(access.can(action.permission)&&securityCompliant)return;
    action.selectors.forEach(selector=>{document.querySelectorAll(selector).forEach(element=>restrictElement(element,action.permission));});
  });
}
function installMutationPermissionObserver(access,securityCompliant=true){
  const groups=actionGroups(currentRule());
  if(!groups.some(action=>!(access.can(action.permission)&&securityCompliant)))return;
  const observer=new MutationObserver(()=>applyActionRules(access,securityCompliant));
  observer.observe(document.body,{childList:true,subtree:true});
}


function showSecurityPolicyBanner(state,access){
  const needs2fa=Boolean(state.settings?.requireTwoFactor);
  const compliant=!needs2fa||Boolean(access.user?.twoFactor);
  if(compliant)return true;
  const main=document.querySelector('.page-content');
  if(main&&!main.querySelector('.security-policy-banner')){
    const banner=document.createElement('div');
    banner.className='ui-callout ui-callout--warning security-policy-banner';
    banner.innerHTML=`<strong>Two-factor authentication required</strong><span>${access.user?.name||'This account'} can review data, but modifying actions are locked by Fleet Settings until 2FA is enabled.</span>`;
    main.prepend(banner);
  }
  document.body.dataset.securityCompliant='false';
  return false;
}

function installSessionTimeout(state,access){
  const minutes=Math.max(1,Number(state.settings?.sessionTimeout)||60);
  const key=`${SESSION_ACTIVITY_KEY}:${access.user?.id||'anonymous'}`;
  let last=Number(sessionStorage.getItem(key))||Date.now();
  let locked=false;
  const mark=()=>{if(locked)return;last=Date.now();sessionStorage.setItem(key,String(last));};
  ['pointerdown','keydown','touchstart'].forEach(name=>window.addEventListener(name,mark,{passive:true}));
  const ensureOverlay=()=>{
    let overlay=document.getElementById('session-timeout-overlay');
    if(overlay)return overlay;
    overlay=document.createElement('div');
    overlay.id='session-timeout-overlay';overlay.className='session-timeout-overlay';overlay.hidden=true;
    overlay.innerHTML=`<div class="session-timeout-card"><span class="eyebrow">SECURITY POLICY</span><h2>Session timed out</h2><p>Fleet Settings requires re-authentication after ${minutes} minutes of inactivity.</p><button class="button button--primary" id="resume-session" type="button">Resume prototype session</button></div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#resume-session')?.addEventListener('click',()=>{locked=false;overlay.hidden=true;mark();});
    return overlay;
  };
  const check=()=>{if(locked)return;if(Date.now()-last>=minutes*60000){locked=true;ensureOverlay().hidden=false;}};
  setInterval(check,15000);
  check();
}

function showReadOnlyBanner(access,rule){
  if(!rule?.manage||access.can(rule.manage))return;
  const main=document.querySelector('.page-content');
  if(!main||main.querySelector('.access-readonly-banner'))return;
  const banner=document.createElement('div');
  banner.className='ui-callout ui-callout--info access-readonly-banner';
  banner.innerHTML=`<strong>Read-only access</strong><span>${access.role?.name||'This role'} can view this section but cannot change its operational data.</span>`;
  main.prepend(banner);
}
function showAccessDenied(access,rule){
  if(!rule||ruleAllowed(access,rule))return false;
  document.body.classList.add('is-access-denied');
  const appMain=document.querySelector('.app-main');
  if(!appMain)return true;
  const screen=document.createElement('section');
  screen.className='access-denied-screen';
  screen.innerHTML=`<div class="access-denied-card"><span class="access-denied-card__icon">⊘</span><span class="eyebrow">ACCESS CONTROL</span><h1>Access restricted</h1><p><strong>${access.role?.name||'Current role'}</strong> does not have permission or fleet scope to open this section.</p><div class="ui-detail-grid"><div><span>Signed in as</span><strong>${access.user?.name||'Unknown user'}</strong></div><div><span>Fleet scope</span><strong>${access.scope||'All depots'}</strong></div></div><a class="button button--primary" href="./dashboard.html">Return to dashboard</a></div>`;
  appMain.appendChild(screen);
  return true;
}

function installAccessEventGuard(access,securityCompliant=true){
  const groups=actionGroups(currentRule());
  const isActionRestricted=target=>{
    if(!target)return false;
    return groups.some(action=>{
      if(access.can(action.permission)&&securityCompliant)return false;
      return action.selectors.some(selector=>{try{return Boolean(target.closest(selector));}catch{return false;}});
    });
  };
  document.addEventListener('click',event=>{
    const restricted=event.target.closest('[data-access-restricted="true"]');
    if(!restricted&&!isActionRestricted(event.target))return;
    event.preventDefault();event.stopImmediatePropagation();
  },true);
  document.addEventListener('submit',event=>{
    const submitter=event.submitter;
    if(submitter?.dataset.accessRestricted==='true'||isActionRestricted(submitter)){
      event.preventDefault();event.stopImmediatePropagation();
    }
  },true);
}

export function initCommon(){
  const state=loadState();
  const access=getAccessContext(state);
  renderAccessIdentity(state,access);
  applyNavigation(access);
  installPrototypeUserSwitcher(state,access);
  const securityCompliant=showSecurityPolicyBanner(state,access);
  installAccessEventGuard(access,securityCompliant);
  installSessionTimeout(state,access);

  const btn=document.getElementById('menu-toggle'),sidebar=document.getElementById('sidebar'),overlay=document.getElementById('mobile-overlay');
  initSidebarScroll(sidebar);
  const close=()=>{sidebar?.classList.remove('is-open');overlay?.classList.remove('is-visible')};
  btn?.addEventListener('click',()=>{sidebar?.classList.toggle('is-open');overlay?.classList.toggle('is-visible')});
  overlay?.addEventListener('click',close);
  const badge=document.getElementById('alert-badge');
  if(badge)badge.textContent=(state.alerts||[]).filter(alert=>alert.status==='open').length;

  const rule=currentRule();
  const denied=showAccessDenied(access,rule);
  if(!denied){
    showReadOnlyBanner(access,rule);
    applyActionRules(access,securityCompliant);
    installMutationPermissionObserver(access,securityCompliant);
  }
  return {...access,state,page:rule,denied,securityCompliant};
}
