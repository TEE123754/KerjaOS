import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('HR mode header separates dashboards and preserves both modes across keyboard switches',async({page})=>{
  const writes:string[]=[];
  page.on('request',r=>{if(r.method()!=='GET'&&r.url().includes('/api/v1/')&&!r.url().includes('/demo-preview'))writes.push(r.url())});
  await page.goto('/foundation');
  await page.getByRole('button',{name:'Recruiter demo',exact:true}).click();
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await page.getByRole('navigation',{name:'Workspace modes'}).getByRole('button',{name:'Management',exact:true}).click();
  const modes=page.getByRole('navigation',{name:'Workspace modes'});
  const management=modes.getByRole('button',{name:'Management',exact:true});
  const recruitment=modes.getByRole('button',{name:'Recruitment',exact:true});
  const hr=page.getByRole('region',{name:'HR workspace',exact:true});
  await expect(management).toHaveAttribute('aria-current','page');
  await expect(page.getByRole('heading',{name:'Pipeline Overview'})).not.toBeVisible();
  await hr.getByRole('navigation',{name:'HR navigation'}).getByRole('button',{name:'People',exact:true}).click();
  await hr.getByLabel('Search people').fill('Farah');
  await hr.getByLabel('Select Farah Ahmad').check();
  await recruitment.focus();await page.keyboard.press('Enter');
  await expect(recruitment).toHaveAttribute('aria-current','page');await expect(hr).not.toBeVisible();
  await expect(page.getByRole('heading',{name:'Pipeline Overview'})).toBeVisible();
  await page.getByRole('navigation',{name:'Workspace navigation'}).getByRole('button',{name:'Jobs',exact:true}).click();
  await page.getByRole('button',{name:'Create job / requirements intake'}).click();
  await page.getByLabel('Job title',{exact:true}).fill('Unpublished recruitment draft');
  await management.click();
  await expect(hr.getByLabel('Search people')).toHaveValue('Farah');
  await expect(hr.getByLabel('Select Farah Ahmad')).toBeChecked();
  await hr.getByRole('navigation',{name:'HR navigation'}).getByRole('button',{name:'Payroll',exact:true}).click();
  await hr.locator('.payroll-roster').getByRole('button',{name:/Farah Ahmad/}).click();
  await hr.getByRole('button',{name:'Edit draft'}).click();
  await hr.getByLabel('Base earnings (MYR)').fill('5123.45');
  await recruitment.click();await expect(page.getByLabel('Job title',{exact:true})).toHaveValue('Unpublished recruitment draft');
  await management.click();await expect(hr.getByLabel('Base earnings (MYR)')).toHaveValue('5123.45');
  await page.setViewportSize({width:390,height:844});
  for(const mode of ['light','dark']){
    await hr.getByRole('button',{name:'Settings',exact:true}).click();
    await hr.getByLabel('HR theme').selectOption(mode);
    await hr.getByRole('button',{name:'Settings',exact:true}).click();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
    await recruitment.click();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
    await management.click();
  }
  expect(writes).toEqual([]);
});
