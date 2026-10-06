import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test('synthetic release notice, private export and reviewed erasure remain truthful across themes',async({page})=>{
 let signed=false;const requests:any[]=[];
 await page.route('**/api/v1/**',async route=>{
  const req=route.request(),p=new URL(req.url()).pathname;let data:any=[];let status=200;
  if(p.endsWith('/auth/login')){signed=true;data={};}
  else if(p.endsWith('/me')){status=signed?200:401;data=signed?{id:'synthetic-A',email:'a@example.test',aal:'aal1',csrf_token:'fixture',memberships:[],password_recovery:false}:{detail:'Sign in required'};}
  else if(p.endsWith('/privacy/notice'))data={text:{en:'Synthetic demo only. Manual retention review before erasure.',ms:'Demo sintetik sahaja.'},contact:null};
  else if(p.endsWith('/privacy/requests')){if(req.method()==='POST'){expect(req.headers()['x-csrf-token']).toBe('fixture');const b=req.postDataJSON();expect(b.kind).toBe('erase_account');expect(b.owner_id).toBeUndefined();requests.push({id:crypto.randomUUID(),kind:b.kind,state:'pending_review'});data=requests[0];}else data=requests;}
  else if(p.includes('/interviews/'))data=p.endsWith('/context')?{applications:[],slots:[],bookings:[],interviewers:[],email_delivery:'disabled'}:[];
  else if(p.includes('/identity/'))data=p.endsWith('/policy')?{version:'identity-v1',text:{en:'Synthetic',ms:'Sintetik'},real_capture_enabled:false}:[];
  else if(p.includes('/background/'))data=p.endsWith('/policy')?{checks:[]}:[];
  else if(p.includes('/discover/'))data=p.endsWith('/progress')?{enabled:false,sources:[]}:[];
  await route.fulfill({status,json:data});
 });
 await page.goto('/foundation');await expect(page.locator('main')).toContainText('Synthetic demo only');await page.getByLabel('Email',{exact:true}).fill('a@example.test');await page.getByLabel('Password',{exact:true}).fill('synthetic-password');await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await page.getByRole('navigation',{name:'Workspace navigation'}).getByRole('button',{name:'Privacy',exact:true}).click();const centre=page.getByRole('region',{name:'Privacy centre',exact:true});await centre.getByRole('button',{name:'Load notice and requests',exact:true}).click();await expect(centre).toContainText('Not configured; public release deferred');await expect(centre.getByRole('link',{name:'Export applications',exact:true})).toHaveAttribute('href','/api/v1/privacy/export?section=applications');
 await centre.getByRole('combobox',{name:'Privacy request type',exact:true}).selectOption('erase_account');await centre.getByRole('textbox',{name:'Privacy request reason',exact:true}).fill('Please review full account erasure');await centre.getByRole('button',{name:'Submit privacy request',exact:true}).click();await expect(centre).toContainText('pending_review');await expect(centre).toContainText('does not confirm erasure');
 for(const theme of ['light','dark']){await page.getByRole('combobox',{name:'Theme',exact:true}).selectOption(theme);expect((await new AxeBuilder({page}).include('.foundation').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);}
 await page.getByRole('combobox',{name:'Language / Bahasa',exact:true}).selectOption('ms');await expect(page.getByRole('region',{name:'Pusat privasi',exact:true})).toContainText('Demo sintetik sahaja');
});
