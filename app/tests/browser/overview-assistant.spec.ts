import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('combined overview follows management and recruitment changes and opens review queues',async({page})=>{
  await page.goto('/foundation');await page.getByRole('button',{name:'Recruiter demo',exact:true}).click();await page.getByRole('button',{name:'Sign in',exact:true}).click();
  const modes=page.getByRole('navigation',{name:'Workspace modes'});
  const overview=page.getByRole('region',{name:'Combined workspace overview'});
  const metric=(label:string)=>overview.locator('.main-overview-metrics article').filter({hasText:label}).locator('strong');
  await expect(modes.getByRole('button',{name:'Main Overview',exact:true})).toHaveAttribute('aria-current','page');
  await expect(metric('Open roles')).toHaveText('3');await expect(metric('Ongoing applications')).toHaveText('2');await expect(metric('Active employees')).toHaveText('3');await expect(metric('Unfinished onboarding')).toHaveText('18');
  await expect(overview).not.toContainText('4,650');await expect(overview.locator('.overview-pipeline')).toContainText('Resume');
  await modes.getByRole('button',{name:'Management',exact:true}).click();await page.getByLabel('Complete Accounts & access').check();
  await modes.getByRole('button',{name:'Main Overview',exact:true}).click();await expect(metric('Unfinished onboarding')).toHaveText('17');
  await overview.getByRole('button',{name:'Open Payroll review / issue'}).click();await expect(page.getByRole('heading',{name:'Payroll',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Approve payroll',exact:true}).click();await page.getByRole('button',{name:'Issue payslip',exact:true}).click();
  await modes.getByRole('button',{name:'Main Overview',exact:true}).click();await expect(overview.locator('.attention-panel li').filter({hasText:'Payroll review / issue'}).locator(':scope > span')).toHaveText('2');
  await overview.getByRole('button',{name:'Open Recruitment',exact:true}).click();await page.getByRole('navigation',{name:'Workspace navigation'}).getByRole('button',{name:'Jobs',exact:true}).click();await page.getByRole('button',{name:'Create job / requirements intake'}).click();await page.getByLabel('Job title',{exact:true}).fill('Overview integration role');await page.getByRole('button',{name:'Publish sample role'}).click();
  await modes.getByRole('button',{name:'Main Overview',exact:true}).click();await expect(metric('Open roles')).toHaveText('4');
  await overview.getByRole('button',{name:'Open Timesheets to review'}).click();await expect(page.getByRole('heading',{name:'Timesheets',exact:true})).toBeVisible();
  await modes.getByRole('button',{name:'Main Overview',exact:true}).click();await overview.getByRole('button',{name:'Open Leave requests to review'}).click();await expect(page.getByRole('heading',{name:'Leave requests',exact:true})).toBeVisible();
});

test('floating demo chat keeps its conversation across modes and restores focus on Escape',async({page})=>{
  const writes:string[]=[];page.on('request',r=>{if(r.method()!=='GET'&&r.url().includes('/api/v1/')&&!r.url().includes('/demo-preview'))writes.push(r.url())});
  await page.goto('/foundation');await page.getByRole('button',{name:'Recruiter demo',exact:true}).click();await page.getByRole('button',{name:'Sign in',exact:true}).click();
  const launcher=page.getByRole('button',{name:'Open assistant',exact:true});await launcher.click();
  const chat=page.getByRole('dialog',{name:'KerjaOS assistant'});await expect(chat.getByLabel('Assistant question')).toBeFocused();
  await chat.getByLabel('Assistant question').fill('onboarding overview');await chat.getByRole('button',{name:'Ask assistant',exact:true}).click();await expect(chat).toContainText('18 unfinished tasks');
  await page.getByRole('navigation',{name:'Workspace modes'}).getByRole('button',{name:'Recruitment',exact:true}).click();await expect(chat).toBeVisible();await expect(chat).toContainText('18 unfinished tasks');
  await chat.getByLabel('Assistant question').fill('approve payroll');await chat.getByRole('button',{name:'Ask assistant',exact:true}).click();await expect(chat).toContainText('Decisions and changes require a human');
  await page.keyboard.press('Escape');await expect(chat).not.toBeVisible();await expect(launcher).toBeFocused();
  await launcher.click();await expect(chat).toContainText('onboarding overview');await chat.getByRole('button',{name:'Close assistant'}).click();await expect(launcher).toHaveAttribute('aria-expanded','false');
  expect(writes).toEqual([]);
});

test('overview and floating chat fit mobile light/dark/reduced-motion and employee totals stay own',async({page})=>{
  await page.goto('/foundation');await page.getByRole('button',{name:'Employee demo',exact:true}).click();await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});
  const modes=page.getByRole('navigation',{name:'Workspace modes'});
  for(const theme of ['light','dark']){
    await modes.getByRole('button',{name:'Management',exact:true}).click();await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByLabel('HR theme').selectOption(theme);await page.getByRole('button',{name:'Settings',exact:true}).click();
    await modes.getByRole('button',{name:'Main Overview',exact:true}).click();
    const overview=page.getByRole('region',{name:'Combined workspace overview'});await expect(overview.locator('.main-overview-metrics article').filter({hasText:'Active employees'}).locator('strong')).toHaveText('1');await expect(overview).not.toContainText('Payroll review / issue');
    await page.getByRole('button',{name:'Open assistant',exact:true}).click();await page.getByRole('dialog',{name:'KerjaOS assistant'}).getByRole('button',{name:'Main overview',exact:true}).click();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
    await page.evaluate(()=>document.documentElement.style.zoom='2');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.evaluate(()=>document.documentElement.style.zoom='1');
    await page.getByRole('button',{name:'Close assistant'}).click();
  }
});

test('live assistant uses scoped API and CSRF, overview marks unavailable HR instead of inventing figures',async({page})=>{
  let signed=false;let sent=0;
  await page.route('**/api/v1/**',async route=>{
    const req=route.request(),path=new URL(req.url()).pathname;let data:any=[],status=200;
    if(path.endsWith('/auth/login')){signed=true;data={}}
    else if(path.endsWith('/me')){status=signed?200:401;data=signed?{id:'assistant-fixture',email:'fixture@example.test',aal:'aal1',csrf_token:'CHAT_CSRF',memberships:[],password_recovery:false}:{detail:'Sign in required'}}
    else if(path.endsWith('/hr/context')){status=503;data={detail:'HR unavailable'}}
    else if(path.endsWith('/jobs'))data=[{id:'role',title:'Fixture role',department:'Engineering'}];
    else if(path.endsWith('/applications'))data=[{id:'00000000-0000-4000-8000-000000000001',job_id:'role',stage:'P1',status:'under_review',version:0}];
    else if(path.endsWith('/chat/options'))data=[{id:'00000000-0000-4000-8000-000000000001',title:'Fixture role'}];
    else if(path.endsWith('/chat/messages')){expect(req.headers()['x-csrf-token']).toBe('CHAT_CSRF');expect(req.postDataJSON().scope).toBe('candidate');expect(req.postDataJSON().application_id).toBe('00000000-0000-4000-8000-000000000001');sent++;data={answer:'Fixture role — P1 / under_review.',fallback_warning:null,read_only:true,choices:[],citations:[],provenance:{plan:'Fixture',actual_model:'rules',provider:'local',requested_model:'rules'}}}
    else if(path.includes('/identity/'))data=path.endsWith('/policy')?{version:'fixture',text:{en:'Fixture',ms:'Fixture'},real_capture_enabled:false}:[];
    else if(path.includes('/background/'))data=path.endsWith('/policy')?{checks:[]}:[];
    else if(path.includes('/discover/'))data=path.endsWith('/progress')?{enabled:false,sources:[]}:[];
    else if(path.includes('/interviews/'))data=path.endsWith('/context')?{applications:[],slots:[],bookings:[],interviewers:[],email_delivery:'disabled'}:[];
    await route.fulfill({status,json:data});
  });
  await page.goto('/foundation');await page.getByRole('button',{name:'My account',exact:true}).click();await page.getByLabel('Email',{exact:true}).fill('fixture@example.test');await page.getByLabel('Password',{exact:true}).fill('fixture-password');await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await page.getByRole('navigation',{name:'Workspace modes'}).getByRole('button',{name:'Main Overview',exact:true}).click();
  const overview=page.getByRole('region',{name:'Combined workspace overview'});await expect(overview.locator('.main-overview-metrics article').filter({hasText:'Active employees'}).locator('strong')).toHaveText('—');await expect(overview.locator('.main-overview-metrics article').filter({hasText:'Ongoing applications'}).locator('strong')).toHaveText('1');await expect(overview).not.toContainText('Payroll review / issue');
  await page.getByRole('button',{name:'Open assistant',exact:true}).click();const chat=page.getByRole('dialog',{name:'KerjaOS assistant'});
  await chat.getByLabel('Progress selection').selectOption('00000000-0000-4000-8000-000000000001');await chat.getByLabel('Assistant question').fill('Where is my progress?');await chat.getByRole('button',{name:'Ask assistant',exact:true}).click();await expect(chat).toContainText('Fixture role — P1');expect(sent).toBe(1);
  await chat.getByRole('button',{name:'Workspace summary'}).click();await expect(chat).toContainText('Management data is not available yet');expect(sent).toBe(1);
  await chat.getByRole('button',{name:'Close assistant'}).click();await page.getByRole('navigation',{name:'Workspace modes'}).getByRole('button',{name:'Recruitment',exact:true}).click();await page.getByRole('button',{name:'Sign out',exact:true}).click();await expect(page.getByRole('button',{name:'Open assistant',exact:true})).toHaveCount(0);
});
