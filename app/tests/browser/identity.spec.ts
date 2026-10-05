import {test,expect,Page} from '@playwright/test';
test('candidate consents/uploads/corrects and qualified reviewer records labelled manual demo',async({browser})=>{
 const app='00000000-0000-4000-8000-000000000021',job='00000000-0000-4000-8000-000000000022',id='00000000-0000-4000-8000-000000000023';
 let row:any=null;let assertion:any=null;
 async function attach(page:Page){let email='';await page.route('**/api/v1/**',async route=>{
 const request=route.request(),path=new URL(request.url()).pathname;let data:any;let status=200;
 const hm=email.startsWith('hm');
 if(path.includes('/interviews/')) data=path.endsWith('/context')?{applications:[],slots:[],bookings:[],interviewers:[],email_delivery:'disabled'}:[];
    else if(path.includes('/discover/')) data=path.endsWith('/progress')?{enabled:false,sources:[]}:[];
    else if(path.includes('/chat/')) data=[];
    else if(path.includes('/background/')) data=path.endsWith('/policy')?{official_provider:'not_configured',real_capture_enabled:false,checks:[]}:[];
    else if(path.includes('/quiz/')) data=[];
    else if(path.endsWith('/auth/login')){email=request.postDataJSON().email;data={id:email};}
 else if(path.endsWith('/me')){status=email?200:401;data=email?{id:email,email,aal:hm?'aal2':'aal1',csrf_token:'fixture-csrf',memberships:hm?[{role:'hm',employer_id:'E'}]:[],password_recovery:false}:{detail:'Sign in required'};}
 else if(path.endsWith('/jobs'))data=[{id:job,title:'Synthetic identity role',department:'Fixture'}];
 else if(path.endsWith('/staff/queue'))data=[];
 else if(path.endsWith('/applications'))data=hm?[]:[{id:app,job_id:job,job_title:'Synthetic identity role',stage:'P2',status:'under_review',version:2,next_action:'complete_identity'}];
 else if(path.endsWith('/identity/policy'))data={version:'identity-v1',text:{en:'Consent to selected employer. Synthetic fixture. Delete within 24 hours.',ms:'Persetujuan majikan dipilih. Padam dalam 24 jam.'},real_capture_enabled:false};
 else if(path.endsWith('/identity/assertions'))data=!hm&&assertion?[assertion]:[];
 else if(path.endsWith('/identity/shares'))data=[];
 else if(path.endsWith('/identity/review-queue'))data=hm&&row?[row]:[];
 else if(path.endsWith('/identity/consents')){expect(request.postDataJSON().agree).toBe(true);data={id:'consent',version:'identity-v1'};}
 else if(path.endsWith('/identity/cases')){
  if(request.method()==='POST'){const body=request.postDataJSON();row={id,application_id:app,route:body.route,synthetic:true,state:body.route==='alternative'?'awaiting_review':'awaiting_document',assigned:true,version:row?4:0};data=row;}
  else data=!hm&&row?[row]:[];
 }else if(path.endsWith('/document')){expect(request.headers()['x-csrf-token']).toBe('fixture-csrf');row={...row,state:'awaiting_review',version:2,quality_hint:'needs_review'};data={id:'doc',state:'quarantined',official:false};}
 else if(path.endsWith('/review')){const body=request.postDataJSON();expect(hm).toBe(true);expect(body.expected_version).toBe(row.version);row={...row,state:body.decision==='verified_manual'?'verified_mock':'needs_review',reason_code:body.reason_code,version:row.version+1};if(body.decision==='verified_manual'){expect(body.attested).toBe(true);assertion={id:'00000000-0000-4000-8000-000000000024',method:'mock',verified_at:'2026-10-02',expires_at:'2026-12-01',revoked:false};}data={id,method:'mock'};}
 else if(path.endsWith('/revoke')){row={...row,state:'cancelled'};assertion={...assertion,revoked:true};data={revoked:true,profile_deleted:false};}
 else throw Error('Unexpected identity fixture route '+path);
 await route.fulfill({status,json:data});
 });}
 async function login(page:Page,email:string){await attach(page);await page.goto('/foundation');await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Password',{exact:true}).fill('fixture-password');await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.getByRole('button',{name:'Refresh',exact:true})).toBeVisible();}
 const ca=await browser.newContext(),ch=await browser.newContext(),a=await ca.newPage(),hm=await ch.newPage();
 await login(a,'a@example.test');await a.getByRole('combobox',{name:'Identity application',exact:true}).selectOption(app);await a.getByRole('checkbox',{name:'I consent for the selected application and employer',exact:true}).check();await a.getByRole('button',{name:'Start identity review',exact:true}).click();
 await a.getByLabel('Upload identity evidence (PDF/PNG/JPEG, 3 MB)',{exact:true}).setInputFiles({name:'synthetic.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lN8AAAAASUVORK5CYII=','base64')});
 await expect(a.getByRole('region',{name:'Identity review',exact:true})).toContainText('awaiting_review');
 await login(hm,'hm@example.test');await hm.getByRole('button',{name:'Request correction',exact:true}).click();await hm.getByRole('button',{name:'Confirm identity decision',exact:true}).click();
 await a.getByRole('button',{name:'Refresh',exact:true}).click();await expect(a.getByRole('region',{name:'Identity review',exact:true})).toContainText('needs_review');
 await a.getByRole('combobox',{name:'Document route',exact:true}).selectOption('alternative');await a.getByRole('button',{name:'Start identity review',exact:true}).click();
 await hm.getByRole('button',{name:'Refresh',exact:true}).click();await hm.getByRole('button',{name:'Record manual verification',exact:true}).click();await hm.getByRole('checkbox',{name:'I personally reviewed this evidence or completed the alternative review. No official registry claim.',exact:true}).check();await hm.getByRole('button',{name:'Confirm identity decision',exact:true}).click();
 await a.getByRole('button',{name:'Refresh',exact:true}).click();await expect(a.getByRole('region',{name:'Identity review',exact:true})).toContainText('verified_mock');
 await a.getByRole('button',{name:'Revoke identity consent',exact:true}).click();await expect(a.getByRole('region',{name:'Identity review',exact:true})).toContainText('cancelled');
 expect(await a.evaluate(()=>Object.keys(localStorage))).toEqual([]);
 await ca.close();await ch.close();
});
