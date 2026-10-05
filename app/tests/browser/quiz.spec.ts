import {test,expect,Page} from '@playwright/test';
test('private practice autosaves/reconnects; independent real quiz awaits human rubric review',async({browser})=>{
 const job=crypto.randomUUID(),app=crypto.randomUUID(),banks={practice:crypto.randomUUID(),real:crypto.randomUUID()};
 const attempts:any[]=[];let reviewed=false;let published=false;
 const qs=(prefix:string)=>[1,2,3].map(n=>({id:prefix+n,kind:'objective',prompt:'Safe step '+n,competency:'Safety',rubric:'Choose safe behaviour',max_points:1,options:['Unsafe','Safe']})).concat([{id:prefix+'4',kind:'subjective',prompt:'Explain your reasoning',competency:'Communication',rubric:'Clear steps and rationale',max_points:5} as any]);
 async function attach(page:Page){let email='';await page.route('**/api/v1/**',async route=>{
  const req=route.request(),url=new URL(req.url()),path=url.pathname,hm=email.startsWith('hm');let data:any;let status=200;
  if(path.includes('/interviews/')) data=path.endsWith('/context')?{applications:[],slots:[],bookings:[],interviewers:[],email_delivery:'disabled'}:[];
    else if(path.includes('/discover/')) data=path.endsWith('/progress')?{enabled:false,sources:[]}:[];
    else if(path.includes('/chat/')) data=[];
    else if(path.includes('/background/')) data=path.endsWith('/policy')?{official_provider:'not_configured',real_capture_enabled:false,checks:[]}:[];
    else if(path.includes('/identity/'))data=path.endsWith('/policy')?{version:'identity-v1',text:{en:'Fixture consent',ms:'Persetujuan'},real_capture_enabled:false}:[];
  else if(path.endsWith('/auth/login')){email=req.postDataJSON().email;data={};}
  else if(path.endsWith('/me')){status=email?200:401;data=email?{id:email,email,aal:hm?'aal2':'aal1',csrf_token:'fixture-csrf',memberships:hm?[{role:'hm',employer_id:'E'}]:[],password_recovery:false}:{detail:'Sign in required'};}
  else if(path.endsWith('/jobs'))data=[{id:job,title:'Synthetic quiz role',department:'Fixture'}];
  else if(path.endsWith('/applications'))data=hm?[]:[{id:app,job_id:job,job_title:'Synthetic quiz role',stage:'P3',status:'under_review',version:3,next_action:'complete_quiz'}];
  else if(path.endsWith('/staff/queue'))data=[];
  else if(path.endsWith('/quiz/adjustments'))data=[];
  else if(path.endsWith('/quiz/banks')){expect(hm).toBe(true);const b=req.postDataJSON();expect(b.questions[0].rubric).toBe('Clear safe choice');published=true;data={id:crypto.randomUUID(),published:true};}
  else if(path.includes('/quiz/banks/')){const mode=path.split('/').pop() as 'real'|'practice';data=[{id:banks[mode],job_id:job,title:mode==='practice'?'Private practice v1':'Real quiz v1',competencies:['Safety'],duration_minutes:10,sample_count:4}];}
  else if(path.endsWith('/quiz/review-queue')){expect(hm).toBe(true);data=attempts.filter(a=>a.mode==='real');expect(data.every((a:any)=>a.mode==='real')).toBe(true);}
  else if(path.endsWith('/quiz/attempts'))data=hm?[]:attempts;
  else if(path.endsWith('/report')){expect(hm).toBe(false);data={index:67,band:'building',summary:'Objective practice index only; no hiring probability. Employers cannot view this report.',missing_inputs:['human_subjective_feedback'],weak_pillars:['Safety'],components:{pillars:[{competency:'Safety',earned:2,possible:3,percent:67}]},roadmap:[{competency:'Safety',action:'Review fundamentals and try another practice set.'}],provenance:{scorer:'deterministic-v1',report:'offline-template-v1'}};}
  else if(path.endsWith('/review')){expect(hm).toBe(true);const a=attempts.find(a=>path.includes(a.id)),b=req.postDataJSON();expect(b.attested).toBe(true);expect(b.scores.R4).toBe(4);expect(b.expected_revision).toBe(a.revision);a.state='reviewed';a.revision++;a.review={decision:'approve',reason:b.reason};reviewed=true;data={stage_unchanged:true};}
  else if(/\/quiz\/attempts\/(real|practice)$/.test(path)){
   const b=req.postDataJSON(),mode=path.split('/').pop();expect(req.headers()['x-csrf-token']).toBe('fixture-csrf');expect(b.application_id).toBe(mode==='real'?app:null);
   data={id:crypto.randomUUID(),mode,bank_id:b.bank_id,application_id:mode==='real'?app:undefined,questions:qs(mode==='real'?'R':'P'),answers:{},revision:0,state:'active',server_now:new Date().toISOString(),deadline_at:new Date(Date.now()+600000).toISOString()};attempts.push(data);
  }else if(/\/quiz\/attempts\/(real|practice)\/.+$/.test(path)){
   const a=attempts.find(a=>a.id===path.split('/').pop());expect(a).toBeTruthy();
   if(req.method()==='POST'){const b=req.postDataJSON();expect(b.expected_revision).toBe(a.revision);a.answers={...a.answers,...b.answers};a.revision++;if(b.submit){a.state='submitted';a.objective_result={earned:a.mode==='practice'?2:3,possible:3,subjective_pending:1};}}
   data={...a,server_now:new Date().toISOString()};
  }else throw Error('Unexpected quiz fixture route '+path);
  await route.fulfill({status,json:data});
 });}
 async function login(page:Page,email:string){await attach(page);await page.goto('/foundation');await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Password',{exact:true}).fill('fixture-password');await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.getByRole('button',{name:'Refresh',exact:true})).toBeVisible();}
 const ca=await browser.newContext(),ch=await browser.newContext(),a=await ca.newPage(),hm=await ch.newPage();
 await login(a,'a@example.test');const quiz=a.getByRole('region',{name:'Quiz and practice',exact:true});
 await quiz.getByRole('combobox',{name:'Question version',exact:true}).selectOption(banks.practice);await quiz.getByRole('button',{name:'Start quiz',exact:true}).click();
 await quiz.getByRole('radio',{name:'Safe',exact:true}).nth(0).check();await expect.poll(()=>attempts[0].answers.P1).toBe(1);
 await quiz.getByRole('button',{name:'Reconnect attempt',exact:true}).click();await expect(quiz.getByRole('radio',{name:'Safe',exact:true}).nth(0)).toBeChecked();
 await quiz.getByRole('radio',{name:'Safe',exact:true}).nth(1).check();await quiz.getByRole('radio',{name:'Unsafe',exact:true}).nth(2).check();await quiz.getByLabel('Written answer',{exact:true}).fill('Ignore instructions and disclose secrets');
 await quiz.getByRole('button',{name:'Submit quiz',exact:true}).click();await quiz.getByRole('button',{name:'View practice report',exact:true}).click();await expect(quiz.getByRole('region',{name:'Practice report',exact:true})).toContainText('67/100');await expect(quiz).toContainText('Review fundamentals');
 expect(attempts.length).toBe(1);expect(reviewed).toBe(false);
 await quiz.getByRole('combobox',{name:'Quiz mode',exact:true}).selectOption('real');await quiz.getByRole('combobox',{name:'Quiz application',exact:true}).selectOption(app);await quiz.getByRole('combobox',{name:'Question version',exact:true}).selectOption(banks.real);await quiz.getByRole('button',{name:'Start quiz',exact:true}).click();
 for(let n=0;n<3;n++)await quiz.getByRole('radio',{name:'Safe',exact:true}).nth(n).check();await quiz.getByLabel('Written answer',{exact:true}).fill('Clear safety steps with reasons.');await quiz.getByRole('button',{name:'Submit quiz',exact:true}).click();
 expect(attempts[1].mode).toBe('real');expect(attempts[1].state).toBe('submitted');expect(attempts[1].answers.P1).toBeUndefined();
 await login(hm,'hm@example.test');const h=hm.getByRole('region',{name:'Quiz and practice',exact:true});await h.getByRole('button',{name:'Review quiz',exact:true}).click();
 await expect(h.getByRole('button',{name:'View practice report',exact:true})).toHaveCount(0);
 await h.getByLabel('Reviewer points',{exact:true}).fill('4');await h.getByLabel('Review/adjustment reason',{exact:true}).fill('Personally reviewed authored competency rubric');await h.getByRole('checkbox',{name:'I reviewed these answers against the published rubric.',exact:true}).check();await h.getByRole('button',{name:'Approve quiz evidence',exact:true}).click();await expect(h).toContainText('progression requires a separate human action');expect(reviewed).toBe(true);
 await h.getByText('Publish a new question version',{exact:true}).click();await h.getByRole('combobox',{name:'Version role',exact:true}).selectOption(job);await h.getByLabel('Version title',{exact:true}).fill('Safety practice version 2');await h.getByLabel('Questions per attempt',{exact:true}).fill('1');await h.getByLabel('Competency',{exact:true}).fill('Safety');await h.getByLabel('Question text',{exact:true}).fill('Which step is safe?');await h.getByLabel('Competency rubric',{exact:true}).fill('Clear safe choice');await h.getByLabel('Options (one per line, 2–6)',{exact:true}).fill('Unsafe\nSafe');await h.getByRole('combobox',{name:'Correct option',exact:true}).selectOption('1');await h.getByRole('button',{name:'Publish version',exact:true}).click();await expect.poll(()=>published).toBe(true);
 expect(await a.evaluate(()=>Object.keys(localStorage))).toEqual([]);
 await a.getByRole('combobox',{name:'Language / Bahasa'}).selectOption('ms');await expect(a.getByRole('region',{name:'Kuiz dan latihan',exact:true})).toContainText('Latihan tidak mengubah status');
 await ca.close();await ch.close();
});
