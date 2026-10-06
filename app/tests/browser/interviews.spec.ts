import {test,expect,Page} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test('both workspace themes preserve drafts; candidate confirms and human scorecard/offer/acceptance precede hire',async({browser})=>{
 const job=crypto.randomUUID(),app=crypto.randomUUID(),person=crypto.randomUUID(),slotId=crypto.randomUUID(),bookingId=crypto.randomUUID();let version=0;let outcome='pending';let accepted:string|null=null;let booking:any=null;let slot:any=null;
 async function attach(page:Page){let email='';await page.route('**/api/v1/**',async route=>{
 const req=route.request(),u=new URL(req.url()),p=u.pathname,hm=email.startsWith('hm');let data:any;let code=200;
 if(p.endsWith('/hr/context'))data={companies:[],employees:[],mine:[],tasks:[],times:[],leaves:[],payroll:[],events:[],hr:false,payroll_admin:false};
 else if(p.includes('/recruiting/'))data=p.endsWith('/context')?{jobs:[],employers:[]}:p.includes('/dashboard')?{total:0,applications:[]}:[];
 else if(p.endsWith('/profile'))data={name:'Synthetic candidate',locale:'en'};
 else if(p.includes('/tracker/'))data=[];
 else if(p.includes('/analytics/'))data={};
 else if(p.includes('/reminders'))data=[];
 else if(p.includes('/privacy/'))data={};
 else if(p.includes('/identity/'))data=p.endsWith('/policy')?{version:'identity-v1',text:{en:'Synthetic consent',ms:'Sintetik'},real_capture_enabled:false}:[];
 else if(p.includes('/background/'))data=p.endsWith('/policy')?{checks:[]}:[];
 else if(p.includes('/quiz/')||p.includes('/chat/'))data=[];
 else if(p.includes('/discover/'))data=p.endsWith('/progress')?{enabled:false,sources:[]}:[];
 else if(p.endsWith('/auth/login')){email=req.postDataJSON().email;data={};}
 else if(p.endsWith('/me')){code=email?200:401;data=email?{id:hm?person:'candidate-A',email,aal:hm?'aal2':'aal1',csrf_token:'fixture-csrf',memberships:hm?[{role:'hm',employer_id:'E'}]:[],password_recovery:false}:{detail:'Sign in required'};}
 else if(p.endsWith('/jobs'))data=[];
 else if(p.endsWith('/staff/queue')||p.endsWith('/applications'))data=[];
 else if(p.endsWith('/interviews/context'))data={applications:[{id:app,job_id:job,title:'Synthetic interview role',stage:'P6',status:outcome==='hired'?'hired':'interview_ready',version,final_outcome:outcome,offer_accepted_at:accepted}],slots:slot&&!booking?[slot]:[],bookings:booking?[{...booking,slot,title:'Synthetic interview role',scorecard_submitted:booking.state==='completed'}]:[],interviewers:hm?[{id:person,job_id:job,name:'Human interviewer'}]:[],email_delivery:'disabled'};
 else if(p.endsWith('/interviews/reminders'))data=booking?.state==='confirmed'?[{booking_id:bookingId,starts_at:slot.starts_at}]:[];
 else if(p.endsWith('/interviews/slots')){expect(hm).toBe(true);slot={id:slotId,...req.postDataJSON()};data={id:slotId};}
 else if(p.endsWith('/interviews/proposals')){expect(hm).toBe(true);booking={id:bookingId,application_id:app,revision:0,state:'proposed'};data=booking;}
 else if(p.endsWith('/changes')){const b=req.postDataJSON();expect(b.expected_revision).toBe(booking.revision);expect(req.headers()['x-csrf-token']).toBe('fixture-csrf');booking.state=b.action==='confirm'?'confirmed':b.action==='cancel'?'cancelled':'proposed';booking.revision++;data=booking;}
 else if(p.endsWith('/scorecard')){expect(hm).toBe(true);booking.state='completed';booking.revision++;data={};}
 else if(p.endsWith('/outcome')){const b=req.postDataJSON();expect(hm&&b.human_attested).toBe(true);expect(b.expected_version).toBe(version);if(b.outcome==='hired')expect(accepted).not.toBeNull();outcome=b.outcome;version++;data={outcome,version};}
 else if(p.endsWith('/accept-offer')){expect(hm).toBe(false);accepted='2026-10-03T00:00:00Z';version++;data={accepted:true,hired:false};}
 else if(p.endsWith('/calendar.ics')){await route.fulfill({contentType:'text/calendar',body:'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n'});return;}
 else throw Error('Unexpected M8 route '+p);
 await route.fulfill({status:code,json:data});
 });}
 async function login(page:Page,email:string){await attach(page);await page.goto('/foundation');await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Password',{exact:true}).fill('fixture-password');await page.getByRole('button',{name:'Sign in',exact:true}).click();}
 const ch=await browser.newContext(),ca=await browser.newContext(),hm=await ch.newPage(),a=await ca.newPage();await login(hm,'hm@example.test');await login(a,'a@example.test');
 await hm.getByRole('navigation',{name:'Workspace navigation'}).getByRole('button',{name:'Interviews',exact:true}).click();const h=hm.getByRole('region',{name:'Human interviews',exact:true});await h.getByRole('checkbox',{name:'Staff / interviewer workspace',exact:true}).check();await h.getByRole('combobox',{name:'Interview application',exact:true}).selectOption(app);
 await h.getByLabel('Interview reason',{exact:true}).fill('Human interview invitation with reviewed evidence');await hm.getByRole('navigation',{name:'Workspace navigation'}).getByRole('button',{name:'Discover',exact:true}).click();await hm.getByRole('navigation',{name:'Workspace navigation'}).getByRole('button',{name:'Interviews',exact:true}).click();await expect(h.getByLabel('Interview reason',{exact:true})).toHaveValue('Human interview invitation with reviewed evidence');
 await hm.getByRole('button',{name:'Collapse Interviews',exact:true}).click();await expect(h).toBeHidden();await hm.getByRole('button',{name:'Expand Interviews',exact:true}).click();await expect(h.getByLabel('Interview reason',{exact:true})).toHaveValue('Human interview invitation with reviewed evidence');

 await h.getByRole('combobox',{name:'Assigned interviewer',exact:true}).selectOption(person);await h.getByLabel('Interview start UTC',{exact:true}).fill('2026-10-05T08:00');await h.getByLabel('Interview end UTC',{exact:true}).fill('2026-10-05T09:00');await h.getByLabel('Interview location',{exact:true}).fill('https://meet.example.test/room');await h.getByRole('button',{name:'Create slot',exact:true}).click();await h.getByRole('combobox',{name:'Available interview slot',exact:true}).selectOption(slotId);await h.getByRole('button',{name:'Propose interview',exact:true}).click();await expect(h).toContainText('proposed');
 await a.getByRole('navigation',{name:'Workspace navigation'}).getByRole('button',{name:'Interviews',exact:true}).click();const c=a.getByRole('region',{name:'Human interviews',exact:true});await c.getByRole('button',{name:'Refresh interviews',exact:true}).click();await c.getByLabel('Interview reason',{exact:true}).fill('I confirm this human interview');await c.getByRole('button',{name:'Confirm slot',exact:true}).click();await expect(c).toContainText('confirmed');await expect(c.getByRole('link',{name:'Download calendar ICS',exact:true})).toHaveAttribute('href','/api/v1/interviews/bookings/'+bookingId+'/calendar.ics');
 await a.getByRole('navigation',{name:'Workspace navigation'}).getByRole('button',{name:'All tools',exact:true}).click();await hm.getByRole('navigation',{name:'Workspace navigation'}).getByRole('button',{name:'All tools',exact:true}).click();
 for(const theme of ['light','dark']){await a.getByRole('combobox',{name:'Theme',exact:true}).selectOption(theme);await expect(a.locator('main')).toHaveAttribute('data-theme',theme);const result=await new AxeBuilder({page:a}).include('.foundation').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();expect(result.violations).toEqual([]);await hm.getByRole('combobox',{name:'Theme',exact:true}).selectOption(theme);const staffResult=await new AxeBuilder({page:hm}).include('.foundation').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();expect(staffResult.violations).toEqual([]);}
 await a.getByRole('navigation',{name:'Workspace navigation'}).getByRole('button',{name:'Interviews',exact:true}).click();await hm.getByRole('navigation',{name:'Workspace navigation'}).getByRole('button',{name:'Interviews',exact:true}).click();
 await a.setViewportSize({width:390,height:844});await expect.poll(()=>a.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);await a.evaluate(()=>document.documentElement.style.zoom='2');await expect.poll(()=>a.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);await a.evaluate(()=>document.documentElement.style.zoom='1');
 await h.getByRole('button',{name:'Refresh interviews',exact:true}).click();await h.getByLabel('Scorecard notes '+bookingId,{exact:true}).fill('Human interviewer reviewed skills and communication');await h.getByRole('button',{name:'Submit human scorecard',exact:true}).click();await expect(h).toContainText('Human scorecard submitted');await h.getByRole('checkbox',{name:'I am the human who reviewed evidence and the scorecard',exact:true}).check();await h.getByRole('button',{name:'Record final outcome',exact:true}).click();await expect(h).toContainText('Human final outcome: offer');
 await c.getByRole('button',{name:'Refresh interviews',exact:true}).click();await c.getByRole('combobox',{name:'Interview application',exact:true}).selectOption(app);await c.getByRole('button',{name:'Accept human offer',exact:true}).click();expect(outcome).toBe('offer');await h.getByRole('button',{name:'Refresh interviews',exact:true}).click();await h.getByRole('combobox',{name:'Final outcome',exact:true}).selectOption('hired');await h.getByRole('button',{name:'Record final outcome',exact:true}).click();await expect(h).toContainText('Human final outcome: hired');
 await a.getByRole('combobox',{name:'Language / Bahasa',exact:true}).selectOption('ms');await expect(a.getByRole('region',{name:'Temu duga manusia',exact:true})).toContainText('Senarai pendek bukan pengambilan');await ch.close();await ca.close();
});
