import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('accepted hire rehearsal joins company, tracks time and leave, and keeps career tools',async({page})=>{
 const writes:string[]=[];page.on('request',r=>{if(r.method()!=='GET'&&r.url().includes('/api/v1/'))writes.push(r.url())});
 await page.goto('/foundation');await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await page.getByRole('button',{name:'Rehearse accepted hire → employee journey'}).click();
 await expect(page.getByRole('heading',{name:'Welcome to Kerja Studio'})).toBeVisible();
 await page.getByRole('button',{name:'Join company',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Welcome to Kerja Studio'})).not.toBeVisible();
 await page.getByLabel('Complete Accounts & access').check();
 await page.getByRole('button',{name:'Start timer',exact:true}).click();
 await expect(page.getByLabel('Tracked session time').locator('..')).toContainText('Tracking');
 await page.getByRole('button',{name:'Pause timer',exact:true}).click();
 await page.getByRole('button',{name:'Reset timer',exact:true}).click();
 await page.getByRole('button',{name:'Break reminder',exact:true}).click();await expect(page.getByRole('button',{name:'Break reminder'})).toHaveAttribute('aria-pressed','true');
 await page.getByRole('button',{name:'Timesheets',exact:true}).click();
 await page.getByLabel('Minutes worked').fill('45');await page.getByLabel('Work summary').fill('First company session');
 await page.getByRole('button',{name:'Save time draft'}).click();await page.getByRole('button',{name:'Submit time'}).click();await expect(page.getByRole('table')).toContainText('submitted');
 await page.getByRole('navigation',{name:'HR navigation'}).getByRole('button',{name:'Overview',exact:true}).click();
 await page.getByRole('button',{name:'Leave requests',exact:true}).click();await page.getByLabel('Leave reason').fill('Annual personal leave');await page.getByRole('button',{name:'Request leave'}).click();
 await expect(page.locator('.hr-record')).toContainText('pending');await page.getByRole('button',{name:'Withdraw leave'}).click();await expect(page.locator('.hr-record')).toContainText('withdrawn');
 await page.getByRole('button',{name:'Open career workspace'}).click();await expect(page.getByRole('heading',{name:'Your next chapter'})).toBeVisible();expect(writes).toEqual([]);
});

test('management directory, monthly payroll review/export and company event work',async({page})=>{
 const writes:string[]=[];page.on('request',r=>{if(r.method()!=='GET'&&r.url().includes('/api/v1/')&&!r.url().includes('/demo-preview'))writes.push(r.url())});
 await page.goto('/foundation');await page.getByRole('button',{name:'Recruiter demo',exact:true}).click();await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.getByRole('navigation',{name:'Workspace modes'}).getByRole('button',{name:'Management',exact:true}).click();
 const hr=page.getByRole('region',{name:'HR workspace',exact:true});
 await hr.getByRole('navigation',{name:'HR navigation'}).getByRole('button',{name:'People',exact:true}).click();
 await hr.getByLabel('Search people').fill('Farah');await expect(hr.locator('tbody tr')).toHaveCount(1);await hr.getByLabel('Select Farah Ahmad').check();await expect(hr.locator('tbody tr')).toHaveClass('selected');
 await hr.getByRole('navigation',{name:'HR navigation'}).getByRole('button',{name:'Payroll',exact:true}).click();
 await hr.locator('.payroll-roster').getByRole('button',{name:/Farah Ahmad/}).click();
 await hr.getByRole('button',{name:'Edit draft'}).click();await hr.getByLabel('Base earnings (MYR)').fill('5000.01');await hr.getByRole('button',{name:'Save payroll draft'}).click();
 await expect(hr.locator('.payroll-record')).toContainText('4,800.01');await hr.getByRole('button',{name:'Approve payroll'}).click();await hr.getByRole('button',{name:'Issue payslip'}).click();
 await expect(hr.locator('.payroll-record')).toContainText('issued');const file=page.waitForEvent('download');await hr.getByRole('button',{name:'Download payslip'}).click();expect((await file).suggestedFilename()).toContain('payslip');
 const csv=page.waitForEvent('download');await hr.getByRole('button',{name:'Export payroll CSV'}).click();expect((await csv).suggestedFilename()).toContain('.csv');
 expect((await new AxeBuilder({page}).include('.hr-shell').analyze()).violations).toEqual([]);
 await hr.getByRole('navigation',{name:'HR navigation'}).getByRole('button',{name:'Overview',exact:true}).click();
 await hr.getByRole('button',{name:'Calendar',exact:true}).click();
 await hr.getByLabel('Event title').fill('First month review');await hr.getByLabel('Starts at (Kuala Lumpur)').fill('2026-10-06T15:00');await hr.getByRole('button',{name:'Schedule company event'}).click();
 await hr.getByRole('button',{name:'First month review',exact:true}).click();await expect(hr.getByRole('dialog')).toContainText('Kuala Lumpur');await page.keyboard.press('Escape');await expect(hr.getByRole('dialog')).not.toBeVisible();
 await hr.getByRole('button',{name:'Next week'}).click();await expect(hr.getByText('No scheduled events this week.')).toBeVisible();await hr.getByRole('button',{name:'Today',exact:true}).click();
 expect(writes).toEqual([]);
});

test('employee demo has only own payslip and accessible narrow light/dark layouts',async({page})=>{
 await page.goto('/foundation');await page.getByRole('button',{name:'Employee demo',exact:true}).click();await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Good morning, Farah'})).toBeVisible();
 for(const mode of ['light','dark']){
  await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByLabel('HR theme').selectOption(mode);await page.getByRole('button',{name:'Settings',exact:true}).click();
  expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
 }
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.emulateMedia({reducedMotion:'reduce'});expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
 await page.getByRole('navigation',{name:'HR navigation'}).getByRole('button',{name:'People',exact:true}).click();await expect(page.locator('tbody tr')).toHaveCount(1);
 await page.getByRole('navigation',{name:'HR navigation'}).getByRole('button',{name:'Payroll',exact:true}).click();await expect(page.getByRole('heading',{name:'My payslips'})).toBeVisible();await expect(page.getByRole('button',{name:'Export payroll CSV'})).toHaveCount(0);await expect(page.getByRole('button',{name:'Approve payroll'})).toHaveCount(0);await expect(page.getByRole('button',{name:'Download payslip'})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('normal account opens invited employee home and posts join with CSRF then returns to applications',async({page})=>{
 let signed=false,joined=false;const writes:any[]=[];const employee={id:'00000000-0000-4000-8000-000000000010',user_id:'fixture-user',employer_id:'company',application_id:'hired',name:'Private Employee',title:'Engineer',department:'Engineering',state:'invited',start_date:'2026-10-01',revision:0};
 await page.route('**/api/v1/**',async route=>{const r=route.request(),p=new URL(r.url()).pathname;let data:any=[],status=200;
  if(p.endsWith('/auth/login')){signed=true;data={}}
  else if(p.endsWith('/me')){status=signed?200:401;data=signed?{id:'fixture-user',email:'private@example.test',aal:'aal1',csrf_token:'HR_CSRF',memberships:[],password_recovery:false}:{detail:'Sign in required'}}
  else if(p.endsWith('/hr/context')){const e={...employee,state:joined?'active':'invited',revision:joined?1:0};data={companies:[{id:'company',name:'Private Company'}],company_id:'company',employees:[e],mine:[e],tasks:[],times:[],leaves:[],payroll:[],events:[],hr:false,payroll_admin:false}}
  else if(p.endsWith('/hr/command')){expect(r.headers()['x-csrf-token']).toBe('HR_CSRF');const b=r.postDataJSON();expect(b.action).toBe('join');expect(b.employee_id).toBe(employee.id);expect(b.owner_id).toBeUndefined();expect(b.expected_revision).toBe(0);expect(b.idempotency_key).toMatch(/^[a-f0-9-]{36}$/);writes.push(b);joined=true;data={...employee,state:'active'}}
  else if(p.includes('/identity/'))data=p.endsWith('/policy')?{version:'fixture',text:{en:'Fixture policy',ms:'Sintetik'},real_capture_enabled:false}:[];
  else if(p.includes('/background/'))data=p.endsWith('/policy')?{checks:[]}:[];
  else if(p.includes('/discover/'))data=p.endsWith('/progress')?{enabled:false,sources:[]}:[];
  else if(p.includes('/interviews/'))data=p.endsWith('/context')?{applications:[],slots:[],bookings:[],interviewers:[],email_delivery:'disabled'}:[];
  else if(p.endsWith('/applications'))data=[{id:'other-app',job_id:'role',stage:'P0',status:'applied',version:0}];
  await route.fulfill({status,json:data});
 });
 await page.goto('/foundation');await page.getByRole('button',{name:'My account',exact:true}).click();await page.getByLabel('Email',{exact:true}).fill('private@example.test');await page.getByLabel('Password',{exact:true}).fill('fixture-password');await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Welcome to Private Company'})).toBeVisible();await page.getByRole('button',{name:'Join company',exact:true}).click();await expect(page.getByRole('heading',{name:'Welcome to Private Company'})).not.toBeVisible();
 await expect(page.getByRole('heading',{name:'Good morning, Private'})).toBeVisible();expect(writes).toHaveLength(1);
 await page.getByRole('button',{name:'Timesheets',exact:true}).click();await page.getByLabel('Work summary').fill('Retained account draft');
 await page.getByRole('button',{name:'Open career workspace'}).click();await expect(page.getByRole('navigation',{name:'Workspace navigation'})).toBeVisible();await expect(page.getByRole('button',{name:'Company HR'})).toBeVisible();await page.getByRole('button',{name:'Refresh',exact:true}).click();await expect(page.getByRole('navigation',{name:'Workspace navigation'})).toBeVisible();
 await page.getByRole('navigation',{name:'Workspace modes'}).getByRole('button',{name:'Management',exact:true}).click();await expect(page.getByLabel('Work summary')).toHaveValue('Retained account draft');expect(writes).toHaveLength(1);
});
