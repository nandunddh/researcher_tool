const $=id=>document.getElementById(id);
const escape=value=>String(value??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let accounts=[];
function render(){const query=$('search').value.toLowerCase(),status=$('status').value;const visible=accounts.filter(a=>(!status||a.status===status)&&[a.client_name,a.client_email,a.org_name,...a.members.map(m=>m.email)].join(' ').toLowerCase().includes(query));
$('rows').innerHTML=visible.map(a=>`<tr><td><strong>${escape(a.org_name||a.client_name)}</strong><small>${a.is_root?'Root administrator':a.account_type==='org'?'Organization':'Client account'}</small></td><td>${escape(a.client_name)}<small>${escape(a.client_email)}</small></td><td>${escape(a.tier)}</td><td><span class="badge">${escape(a.status)}</span></td><td>${a.members.length} members</td><td>${a.scistudio_access?'Enabled':'Disabled'}</td><td><button data-account="${accounts.indexOf(a)}">View details</button></td></tr>`).join('')||'<tr><td colspan="7">No matching accounts.</td></tr>';
$('rows').querySelectorAll('[data-account]').forEach(b=>b.onclick=()=>details(accounts[Number(b.dataset.account)]));}
function details(a){const fields={'Organization':a.org_name||'Individual account','Owner':a.client_name,'Email':a.client_email,'Status':a.status,'Plan':a.tier,'Expires':a.expires_at,'Daily limit':a.daily_limit===-1?'Unlimited':a.daily_limit,'Member seats':a.seat_limit===-1?'Unlimited':a.seat_limit,'Created':a.created_at};$('detail-content').innerHTML='<dl>'+Object.entries(fields).map(([k,v])=>`<dt>${escape(k)}</dt><dd>${escape(v)}</dd>`).join('')+'</dl><h3>Team members</h3>'+ (a.members.length?'<div class="table-wrap"><table><thead><tr><th>Name / email</th><th>Role</th><th>SciStudio flag</th></tr></thead><tbody>'+a.members.map(m=>`<tr><td>${escape(m.name)}<small>${escape(m.email)}</small></td><td>${escape(m.role)}</td><td>${m.scistudio_access?'Enabled':'Disabled'}</td></tr>`).join('')+'</tbody></table></div>':'<p>No team members added.</p>')+'<p>Conference assignments are not configured. Member SciStudio operations remain restricted until assignments are implemented.</p><a href="/admin">Open license and team management →</a>';$('details').showModal();}
async function load(){ $('notice').textContent='Loading accounts…';try{const response=await fetch('/api/admin/overview',{cache:'no-store'});if(!response.ok)throw new Error(response.status===401||response.status===403?'Root access required. Sign in with your root account.':'Unable to load accounts. Try again.');const data=await response.json();accounts=data.accounts;const clients=accounts.filter(a=>!a.is_root);const metrics=[['Client accounts',clients.length],['Organizations',clients.filter(a=>a.account_type==='org').length],['Team members',clients.reduce((n,a)=>n+a.members.length,0)],['Active client accounts',clients.filter(a=>a.status==='active').length]];$('metrics').innerHTML=metrics.map(([label,count])=>`<div class="metric"><strong>${count}</strong><span>${label}</span></div>`).join('');render();$('notice').textContent='';}catch(error){$('notice').textContent=error.message;}}
$('search')?.addEventListener('input',render);$('status')?.addEventListener('change',render);$('close')?.addEventListener('click',()=>$('details').close());$('logout')?.addEventListener('click',async()=>{const response=await fetch('/api/auth/logout',{method:'POST'});if(response.ok)location.href='/';else $('notice').textContent='Sign out failed. Please try again.';});load();

let adminSection='manage';
function openAdminControls(section='manage',push=true){
  if(push)history.pushState({},'',{add:'/root/add-account',manage:'/root/accounts',licenses:'/root/licenses'}[section]);
  adminSection=section;
  $('root-overview').hidden=true;$('root-admin-controls').hidden=false;
  $('root-page-title').textContent={add:'Add Account',manage:'Manage Accounts',licenses:'Licenses'}[adminSection];
  document.querySelectorAll('.app-sidebar .nav-tab').forEach(el=>el.classList.toggle('active',el.id==='root-'+adminSection));
  if(!$('admin-console-frame').getAttribute('src'))$('admin-console-frame').src='/admin?section='+adminSection;
  $('details').close();
  applyAdminSection();
}
for(const section of ['add','manage'])$('root-'+section)?.addEventListener('click',()=>openAdminControls(section));
document.addEventListener('click',event=>{const link=event.target.closest('a[href="/admin"]');if(link){event.preventDefault();openAdminControls();}});
$('admin-console-frame').addEventListener('load',()=>{
  const doc=$('admin-console-frame').contentDocument;if(!doc)return;
  const style=doc.createElement('style');style.textContent='.admin-header{display:none!important}html,body{max-width:100%;overflow-x:hidden}.admin-container{max-width:none;margin:0;padding:24px}.content-grid{grid-template-columns:minmax(260px,340px) minmax(0,1fr)}.content-grid>*{min-width:0}.card-panel{min-width:0}.admin-table{font-size:12px}.admin-table td,.admin-table th{padding:12px 10px}.admin-table td{overflow-wrap:anywhere}@media(max-width:1150px){.content-grid{grid-template-columns:minmax(0,1fr)}}@media(max-width:600px){.admin-container{padding:12px}.card-panel{padding:14px}.kpi-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}.form-grid{grid-template-columns:1fr}.admin-table{min-width:680px}}';doc.head.append(style);
});

function applyAdminSection(){
 const doc=$('admin-console-frame').contentDocument;if(!doc||!doc.querySelector('.content-grid'))return;
 doc.body.dataset.rootSection=adminSection;
 const panels=doc.querySelectorAll('.content-grid > .card-panel');
 panels.forEach((panel,index)=>panel.hidden=adminSection==='add'?index!==0:index===0);
 const addHeading=panels[0]?.querySelector('.panel-title');if(addHeading)addHeading.textContent='Add account';
 const heading=panels[1]?.querySelector('.panel-title');if(heading)heading.textContent='Manage accounts';
 doc.documentElement.scrollTop=0;doc.body.scrollTop=0;
}
$('admin-console-frame').addEventListener('load',()=>{
 const doc=$('admin-console-frame').contentDocument;if(!doc)return;
 applyAdminSection();
});

function restoreRootRoute(){const section={'/root/add-account':'add','/root/accounts':'manage','/root/licenses':'manage'}[location.pathname];if(section)openAdminControls(section,false);else{$('root-overview').hidden=false;$('root-admin-controls').hidden=true;$('root-page-title').textContent='Root Dashboard';document.querySelectorAll('.app-sidebar .nav-tab').forEach(el=>el.classList.toggle('active',el.getAttribute('href')==='/root/dashboard'));}}
window.addEventListener('popstate',restoreRootRoute);restoreRootRoute();
