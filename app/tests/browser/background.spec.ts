import {test,expect,Page} from '@playwright/test';
test('finalist consents to labelled mock, explains ambiguity and human reviews without auto decision',async({browser})=>{
 const job=crypto.randomUUID(),app=crypto.randomUUID(),caseId=crypto.randomUUID();let row:any=null;let appStatus='under_review';let configured=false;
 async function attach(page:Page){let email='';await page.route('**/api/v1/**',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname,hm=email.startsWith('hm');let data:any;let status=200;
  if(path.includes('/interviews/')) data=path.endsWith('/context')?{applications:[],slots:[],bookings:[],interviewers:[],email_delivery:'disabled'}:[];
    else if(path.includes('/discover/')) data=path.endsWith('/progress')?{enabled:false,sources:[]}:[];
    else if(path.includes('/chat/')) data=[];
    else if(path.includes('/identity/'))data=path.endsWith('/policy')?{version:'identity-v1',text:{en:'Synthetic consent',ms:'Persetujuan'},real_capture_enabled:false}:[];
  else if(path.includes('/quiz/'))data=[];
  else if(path.endsWith('/auth/login')){email=req.postDataJSON().email;data={};}
  else if(path.endsWith('/me')){status=email?200:401;data=email?{id:email,email,aal:hm?'aal2':'aal1',csrf_token:'fixture-csrf',memberships:hm?[{role:'hm',employer_id:'E'}]:[],password_recovery:false}:{detail:'Sign in required'};}
  else if(path.endsWith('/jobs'))data=[{id:job,title:'Synthetic finalist role',department:'Fixture'}];
  else if(path.endsWith('/staff/queue'))data=[];
  else if(path.endsWith('/background/policy'))data={official_provider:'not_configured',real_capture_enabled:false,checks:[{kind:'ctos_basic',label:'CTOS Basic',version:'background-ctos_basic-v1',text:{en:'Synthetic CTOS Basic purpose consent for selected application/employer, 24h report deletion and right to explanation/revocation.',ms:'Persetujuan bukti CTOS Basic untuk permohonan/majikan; hak penjelasan dan penarikan balik.'}}]};
  else if(path.endsWith('/background/applications'))data=hm?[]:[{id:app,job_id:job,title:'Synthetic finalist role',stage:'P4',status:appStatus,background_policy:{stage:'after_quiz',legal_approved:false,checks:[{kind:'ctos_basic',provider:'mock',necessity:'Synthetic role-specific necessity',exception_allowed:false}]}}];
  else if(path.endsWith('/background/review-queue')){expect(hm).toBe(true);data=row?[row]:[];}
  else if(path.endsWith('/background/consents')){const b=req.postDataJSON();expect(b.kind).toBe('ctos_basic');expect(b.version).toBe('background-ctos_basic-v1');expect(b.agree).toBe(true);data={id:'consent'};}
  else if(path.endsWith('/background/cases')){
   if(req.method()==='POST'){expect(hm).toBe(false);expect(req.postDataJSON().synthetic).toBe(true);row={id:caseId,application_id:app,kind:'ctos_basic',provider:'mock',synthetic:true,state:'queued',version:0,coverage:'not_processed',disputes:[]};data=row;}
   else data=hm?[]:row?[row]:[];
  }else if(path.endsWith('/background/policies')){expect(hm).toBe(true);const b=req.postDataJSON();expect(b.checks[0].kind).toBe('ccris');expect(b.checks[0].provider).toBe('manual');expect(b.checks[0].necessity.length).toBeGreaterThan(15);configured=true;data={new_applications_only:true,legal_approved:false};}
  else if(path.endsWith('/process')){expect(hm).toBe(true);row={...row,state:'needs_review',version:1,coverage:'synthetic_workflow_only',result_code:'simulated_needs_review'};appStatus='on_hold';data={official:false};}
  else if(path.endsWith('/dispute')){const b=req.postDataJSON();expect(hm).toBe(false);expect(b.expected_version).toBe(1);row={...row,state:'on_hold',version:2,disputes:[{id:'dispute',explanation:b.explanation,resolved:false}]};data={state:'on_hold'};}
  else if(path.endsWith('/review')){const b=req.postDataJSON();expect(hm).toBe(true);expect(b.attested&&b.explanation_considered).toBe(true);expect(b.expected_version).toBe(2);row={...row,state:'reviewed',version:3,review_decision:b.decision,review_reason:b.reason,disputes:row.disputes.map((d:any)=>({...d,resolved:true}))};data={stage_unchanged:true};}
  else if(path.endsWith('/revoke')){expect(hm).toBe(false);row={...row,state:'cancelled',version:4};data={revoked:true,profile_deleted:false};}
  else if(path.endsWith('/applications'))data=hm?[]:[{id:app,job_id:job,job_title:'Synthetic finalist role',stage:'P4',status:appStatus,version:appStatus==='on_hold'?1:0,next_action:'await_background_review'}];
  else throw Error('Unexpected M5 fixture route '+path);
  await route.fulfill({status,json:data});
 });}
 async function login(page:Page,email:string){await attach(page);await page.goto('/foundation');await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Password',{exact:true}).fill('fixture-password');await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.getByRole('button',{name:'Refresh',exact:true})).toBeVisible();}
 const ca=await browser.newContext(),ch=await browser.newContext(),a=await ca.newPage(),hm=await ch.newPage();await login(a,'a@example.test');
 const c=a.getByRole('region',{name:'Background evidence',exact:true});await c.getByRole('combobox',{name:'Background application',exact:true}).selectOption(app);await c.getByRole('checkbox',{name:'I consent to this selected check and employer',exact:true}).check();await c.getByRole('button',{name:'Consent and request demo check',exact:true}).click();await expect(c).toContainText('MOCK / SIMULATION');
 await login(hm,'hm@example.test');const h=hm.getByRole('region',{name:'Background evidence',exact:true});await h.getByRole('button',{name:'Process local demo item',exact:true}).click();await expect(h).toContainText('needs_review');
 await c.getByRole('button',{name:'Refresh background',exact:true}).click();await c.getByRole('button',{name:'Explain / dispute',exact:true}).click();await c.getByLabel('Explanation (avoid identity/account numbers)',{exact:true}).fill('This is synthetic ambiguity; please consider the relevant role context.');await c.getByRole('button',{name:'Send explanation and hold review',exact:true}).click();await expect(c).toContainText('on_hold');
 await h.getByRole('button',{name:'Refresh background',exact:true}).click();await h.getByRole('button',{name:'Review background evidence',exact:true}).click();await h.getByLabel('Role-related review reason',{exact:true}).fill('Personally considered explanation and role-specific requirements.');await h.getByRole('checkbox',{name:'I reviewed the evidence; this is no official clearance or ranking penalty.',exact:true}).check();await expect(h.getByRole('button',{name:'Record human review',exact:true})).toBeDisabled();await h.getByRole('checkbox',{name:'I considered the candidate explanation.',exact:true}).check();await h.getByRole('button',{name:'Record human review',exact:true}).click();await expect(h).toContainText('requires a separate human action');expect(appStatus).toBe('on_hold');
 await c.getByRole('button',{name:'Refresh background',exact:true}).click();await expect(c).toContainText('reviewed');await c.getByRole('button',{name:'Revoke check consent',exact:true}).click();await expect(c).toContainText('cancelled');
 await h.getByText('Check policy for new applications',{exact:true}).click();await h.getByRole('combobox',{name:'Policy role',exact:true}).selectOption(job);await h.getByRole('checkbox',{name:'CCRIS',exact:true}).check();await h.getByRole('combobox',{name:'Evidence method',exact:true}).selectOption('manual');await h.getByLabel('Necessity and justification',{exact:true}).fill('Role-specific necessity for synthetic evidence review');await h.getByRole('button',{name:'Save policy for new applications',exact:true}).click();await expect.poll(()=>configured).toBe(true);
 expect(await a.evaluate(()=>Object.keys(localStorage))).toEqual([]);await a.getByRole('combobox',{name:'Language / Bahasa'}).selectOption('ms');await expect(a.getByRole('region',{name:'Bukti latar belakang',exact:true})).toContainText('belum dikonfigurasi');
 await ca.close();await ch.close();
});
