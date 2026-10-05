import { test, expect, Page } from '@playwright/test';

test('A/X A/Y B/X remain independent across candidate and assigned staff views',async({browser})=>{
 const X='00000000-0000-4000-8000-000000000010',Y='00000000-0000-4000-8000-000000000011';
 const apps:any[]=[];
 const histories:Record<string,any[]>={};
 async function attach(page:Page){
  let user='';
  await page.route('**/api/v1/**',async route=>{
   const req=route.request(),url=new URL(req.url()),path=url.pathname;let data:unknown;let status=200;
   const own=(a:any)=>a.owner===user || user==='hm@example.test' && a.job_id===X;
   if(path.includes('/interviews/')) data=path.endsWith('/context')?{applications:[],slots:[],bookings:[],interviewers:[],email_delivery:'disabled'}:[];
    else if(path.includes('/discover/')) data=path.endsWith('/progress')?{enabled:false,sources:[]}:[];
    else if(path.includes('/chat/')) data=[];
    else if(path.includes('/background/')) data=path.endsWith('/policy')?{official_provider:'not_configured',real_capture_enabled:false,checks:[]}:[];
    else if(path.includes('/quiz/')) data=[];
    else if(path.includes('/identity/')) data=path.endsWith('/policy')?{version:'identity-v1',text:{en:'Synthetic identity consent',ms:'Persetujuan identiti sintetik'},real_capture_enabled:false}:[];
    else if(path.endsWith('/auth/login')){user=req.postDataJSON().email;data={id:user};}
   else if(path.endsWith('/me')){status=user?200:401;data=user?{id:user,email:user,aal:user.startsWith('hm')?'aal2':'aal1',csrf_token:'fixture-csrf',memberships:user.startsWith('hm')?[{role:'hm',employer_id:'E'}]:[],password_recovery:false}:{detail:'Sign in required'};}
   else if(path.endsWith('/jobs'))data=[{id:X,title:'Role X',department:'Fixture'},{id:Y,title:'Role Y',department:'Fixture'}];
   else if(path.endsWith('/staff/queue'))data=apps.filter(a=>user.startsWith('hm')&&a.job_id===X);
   else if(path.endsWith('/notes'))data=user.startsWith('hm')?[{id:'note',note:'PRIVATE reviewer discussion'}]:[];
   else if(path.endsWith('/transitions')){
    const id=path.split('/')[4],app=apps.find(a=>a.id===id),body=req.postDataJSON();
    expect(req.headers()['x-csrf-token']).toBe('fixture-csrf');
    if(!app||!own(app)){status=403;data={detail:'Access denied'};}
    else if(body.expected_version!==app.version){status=409;data={detail:'Application changed'};}
    else{app.version++;if(body.action==='advance'){app.stage='P1';app.status='under_review';}else if(body.action==='pause'){app.status='on_hold';app.next_action='await_human_review';}else if(body.action==='withdraw'){app.status='withdrawn';app.next_action='none';}
      histories[id].push({id:crypto.randomUUID(),event_type:body.action,reason:body.reason,created_at:new Date().toISOString()});data=app;}
   }else if(path.endsWith('/applications')){
    if(req.method()==='POST'){
     const body=req.postDataJSON();const app={id:crypto.randomUUID(),owner:user,job_id:body.job_id,job_title:body.job_id===X?'Role X':'Role Y',stage:'P0',status:'applied',version:0,next_action:'await_resume_review',deadline_at:'2026-10-09T00:00:00Z',created_at:new Date().toISOString(),policy_version:1};
     apps.push(app);histories[app.id]=[{id:crypto.randomUUID(),event_type:'applied',reason:'',created_at:app.created_at}];data=app;
    }else data=apps.filter(a=>a.owner===user);
   }else if(/\/applications\/[^/]+$/.test(path)){
    const app=apps.find(a=>a.id===path.split('/').pop());
    if(!app||!own(app)){status=404;data={detail:'Application not found'};}else data={...app,events:histories[app.id]};
   }else throw Error('Unexpected M2 browser route '+path);
   await route.fulfill({status,json:data});
  });
 }
 async function signIn(page:Page,email:string){await attach(page);await page.goto('/foundation');await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Password',{exact:true}).fill('fixture-password');await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.getByRole('button',{name:'Refresh',exact:true})).toBeVisible();}
 const ca=await browser.newContext(),cb=await browser.newContext(),ch=await browser.newContext();
 const a=await ca.newPage(),b=await cb.newPage(),hm=await ch.newPage();
 await signIn(a,'a@example.test');
 const job=(page:Page,title:string)=>page.getByRole('listitem').filter({hasText:title}).filter({has:page.getByRole('button',{name:'Apply',exact:true})});
 await job(a,'Role X').getByRole('button',{name:'Apply',exact:true}).click();
 await expect(a.getByText('P0 · Apply / approach · applied')).toHaveCount(1);
 await job(a,'Role Y').getByRole('button',{name:'Apply',exact:true}).click();
 await expect(a.getByText('P0 · Apply / approach · applied')).toHaveCount(2);
 await signIn(b,'b@example.test');await job(b,'Role X').getByRole('button',{name:'Apply',exact:true}).click();
 await expect(b.getByText('P0 · Apply / approach · applied')).toHaveCount(1);
 expect(new Set(apps.map(a=>a.id)).size).toBe(3);
 const ax=apps.find(a=>a.owner==='a@example.test'&&a.job_id===X),bx=apps.find(a=>a.owner==='b@example.test');
 await signIn(hm,'hm@example.test');await hm.getByRole('button',{name:'Assigned job queue',exact:true}).click();
 const card=(page:Page,id:string)=>page.getByRole('listitem').filter({hasText:id});
 await card(hm,ax.id).getByRole('button',{name:'Advance',exact:true}).click();
 await hm.getByLabel('Reason / note',{exact:true}).fill('Human reviewed submitted profile');await hm.getByRole('button',{name:'Confirm action',exact:true}).click();
 await expect(card(hm,ax.id).getByText('P1 · Resume screening · under_review')).toBeVisible();
 await card(hm,bx.id).getByRole('button',{name:'Pause',exact:true}).click();
 await hm.getByLabel('Reason / note',{exact:true}).fill('Human requested additional review');await hm.getByRole('button',{name:'Confirm action',exact:true}).click();
 await expect(card(hm,bx.id).getByText('P0 · Apply / approach · on_hold')).toBeVisible();
 await a.getByRole('button',{name:'Refresh',exact:true}).click();await expect(a.getByText('P1 · Resume screening · under_review')).toBeVisible();await expect(a.getByText('P0 · Apply / approach · applied')).toBeVisible();
 await card(a,ax.id).getByRole('link',{name:'View history',exact:true}).click();
 await expect(a.getByRole('region',{name:'Application history',exact:true})).toContainText('Human reviewed submitted profile');
 await expect(a.getByText('PRIVATE reviewer discussion')).toHaveCount(0);
 await a.getByRole('combobox',{name:'Language / Bahasa'}).selectOption('ms');await expect(a.getByText('P1 · Saringan resume · under_review',{exact:true})).toBeVisible();
 await b.getByRole('button',{name:'Refresh',exact:true}).click();await expect(b.getByText('P0 · Apply / approach · on_hold')).toBeVisible();
 await b.goto('/foundation?application='+ax.id);await expect(b.getByRole('alert')).toContainText('Application not found');
 await ca.close();await cb.close();await ch.close();
});
