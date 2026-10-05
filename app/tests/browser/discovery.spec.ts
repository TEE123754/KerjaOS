import {test,expect,Page} from '@playwright/test';
test('Discover keeps source visits distinct from self-reported apply and isolates saved private notes',async({browser})=>{
 const listing=crypto.randomUUID();const own:Record<string,{saved:boolean;status:string|null;note:string;clicked_at:string|null}>={};
 const row={id:listing,title:'Synthetic Software Engineer <img src=x onerror=window.m7Injected=true>',company:'Fixture Company',location:'Kuala Lumpur, Malaysia',category:'technology',seniority:'junior',region:'malaysia',classification:'unverified',url:'https://jobs.lever.co/fixture/a/apply',source:'Synthetic approved replay',synthetic:true,state:'active',fetched_at:'2026-10-03T00:00:00Z',expires_at:'2026-10-06T00:00:00Z'};
 async function attach(page:Page){let email='';await page.route('**/api/v1/**',async route=>{
  const req=route.request(),url=new URL(req.url()),path=url.pathname;let data:any;let code=200;
  if(path.includes('/interviews/'))data=path.endsWith('/context')?{applications:[],slots:[],bookings:[],interviewers:[],email_delivery:'disabled'}:[];
  else if(path.includes('/identity/'))data=path.endsWith('/policy')?{version:'identity-v1',text:{en:'Fixture',ms:'Sintetik'},real_capture_enabled:false}:[];
  else if(path.includes('/background/'))data=path.endsWith('/policy')?{checks:[]}:[];
  else if(path.includes('/quiz/')||path.includes('/chat/'))data=[];
  else if(path.endsWith('/auth/login')){email=req.postDataJSON().email;own[email]??={saved:false,status:null,note:'',clicked_at:null};data={};}
  else if(path.endsWith('/me')){code=email?200:401;data=email?{id:email,email,aal:'aal1',csrf_token:'fixture-csrf',memberships:[],password_recovery:false}:{detail:'Sign in required'};}
  else if(path.endsWith('/jobs')||path.endsWith('/applications'))data=[];
  else if(path.endsWith('/discover/listings')){const p=own[email];data=url.searchParams.get('synthetic')==='true'&&(!url.searchParams.get('saved')||url.searchParams.get('saved')!=='true'||p.saved||p.status)?[{...row,saved:p.saved,external_status:p.status,note:p.note,clicked_at:p.clicked_at}]:[];}
  else if(path.endsWith('/discover/progress'))data={enabled:false,sources:[{id:'s',name:'Synthetic fixture',enabled:false,synthetic:true,last_run_at:null,warning:null}]};
  else if(path.endsWith('/discover/saved')){expect(req.headers()['x-csrf-token']).toBe('fixture-csrf');const body=req.postDataJSON();expect(body.listing_id).toBe(listing);expect(body.actor_id).toBeUndefined();own[email].saved=body.saved;data={};}
  else if(path.endsWith('/discover/tracker')){const body=req.postDataJSON();expect(req.headers()['x-csrf-token']).toBe('fixture-csrf');if(body.click){own[email].clicked_at='2026-10-03T00:00:00Z';own[email].status??='considering';}else{own[email].status=body.status;own[email].note=body.note;}data={self_reported:true,submitted_to_employer:false};}
  else if(path.endsWith('/discover/forget')){own[email]={saved:false,status:null,note:'',clicked_at:null};data={};}
  else throw Error('Unexpected M7 fixture '+path);
  await route.fulfill({status:code,json:data});
 });}
 async function login(page:Page,email:string){await attach(page);await page.goto('/foundation');await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Password',{exact:true}).fill('fixture-password');await page.getByRole('button',{name:'Sign in',exact:true}).click();}
 const ca=await browser.newContext(),cb=await browser.newContext(),a=await ca.newPage(),b=await cb.newPage();await login(a,'a@example.test');const d=a.getByRole('region',{name:'Discover jobs',exact:true});
 await expect(d).toContainText('Job collection is paused');await expect(d).toContainText('No roles match');await d.getByRole('checkbox',{name:'Synthetic demo only',exact:true}).check();await expect(d).toContainText(row.title);expect(await a.evaluate(()=>(window as any).m7Injected)).toBeUndefined();await expect(d.locator('img')).toHaveCount(0);
 await d.getByRole('button',{name:'Save job',exact:true}).click();await expect(d.getByRole('button',{name:'Unsave',exact:true})).toBeVisible();
 const link=d.getByRole('link',{name:'Apply on source',exact:true});await expect(link).toHaveAttribute('href',row.url);await expect(link).toHaveAttribute('rel','noopener noreferrer');
 await ca.route('https://jobs.lever.co/**',route=>route.fulfill({status:200,body:'Offline source page fixture'}));const opened=a.waitForEvent('popup');await link.click();await (await opened).close();await expect(d).toContainText('Visit recorded; application not confirmed');await expect(d.getByLabel('External status (self-reported)',{exact:true})).toHaveValue('considering');
 await d.getByLabel('External status (self-reported)',{exact:true}).selectOption('applied');await d.getByLabel('Private note (no sensitive documents)',{exact:true}).fill('A private external note');await d.getByRole('button',{name:'Save self-reported update',exact:true}).click();await expect(d.getByLabel('External status (self-reported)',{exact:true})).toHaveValue('applied');
 await d.getByRole('checkbox',{name:'My saved jobs and tracker',exact:true}).check();await expect(d).toContainText(row.title);
 await login(b,'b@example.test');const other=b.getByRole('region',{name:'Discover jobs',exact:true});await other.getByRole('checkbox',{name:'Synthetic demo only',exact:true}).check();await other.getByRole('checkbox',{name:'My saved jobs and tracker',exact:true}).check();await expect(other).not.toContainText(row.title);await expect(other).not.toContainText('A private external note');
 await a.getByRole('combobox',{name:'Language / Bahasa',exact:true}).selectOption('ms');await expect(a.getByRole('region',{name:'Temui jawatan',exact:true})).toContainText('laporan sendiri');
 await a.getByRole('button',{name:'Padam penjejak dan simpanan',exact:true}).click();await expect(a.getByRole('region',{name:'Temui jawatan',exact:true})).not.toContainText(row.title);
 expect(await a.evaluate(()=>Object.keys(localStorage))).toEqual([]);await ca.close();await cb.close();
});
