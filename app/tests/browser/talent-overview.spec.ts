import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test('overview restores trajectory, filters, candidate details and fair hiring controls',async({page})=>{
 await page.goto('/foundation');await page.getByRole('button',{name:'Recruiter demo',exact:true}).click();await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.getByRole('navigation',{name:'Workspace modes'}).getByRole('button',{name:'Recruitment',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Pipeline Overview'})).toBeVisible();await expect(page.locator('.scatter-point')).toHaveCount(2);
 await page.getByLabel('Position',{exact:true}).selectOption('react');await expect(page.locator('.scatter-point')).toHaveCount(1);
 await page.locator('.scatter-point').click();const dialog=page.getByRole('dialog',{name:'Candidate profile'});await expect(dialog).toBeVisible();await expect(dialog.getByRole('heading',{name:'Score breakdown'})).toBeVisible();
 await dialog.getByRole('button',{name:'Trajectory',exact:true}).click();await expect(dialog.getByRole('heading',{name:/Trajectory score: \d+\/100/})).toBeVisible();await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();
 await page.getByLabel('Position',{exact:true}).selectOption('all');await page.getByRole('button',{name:'Add Sample Candidates'}).click();await expect(page.locator('.scatter-point')).toHaveCount(4);
 await page.getByLabel('Scoring view').selectOption('comparison');await page.getByLabel(/Reputation comparison weight/).press('End');await expect(page.getByLabel(/Reputation comparison weight: 50%/)).toBeVisible();
 const audit=page.getByRole('table',{name:'Audit simulation · no hiring score changes'});await expect(audit).toBeVisible();await expect(audit.locator('tbody tr')).toHaveCount(4);
 expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
 await page.getByLabel('Hide candidate identity').uncheck();await expect(page.locator('.talent-card').filter({hasText:'Amir Hassan'})).toBeVisible();
 await page.getByRole('navigation',{name:'Workspace navigation'}).getByRole('button',{name:'Candidates',exact:true}).click();await page.getByLabel('Search candidates').fill('Sara');await expect(page.locator('.talent-card')).toHaveCount(1);await page.getByLabel('Sort candidates').selectOption('trajectory');
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('missing backend reviews stay unassessed and cannot invent trajectory scores',async({page})=>{
 await page.route('**/api/v1/recruiting/demo-preview',r=>r.fulfill({status:503,json:{detail:'Demo review paused'}}));
 await page.goto('/foundation');await page.getByRole('button',{name:'Recruiter demo',exact:true}).click();await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.getByRole('navigation',{name:'Workspace modes'}).getByRole('button',{name:'Recruitment',exact:true}).click();
 await expect(page.getByText('Some sample reviews are unavailable.',{exact:false})).toBeVisible();await expect(page.locator('.scatter-point')).toHaveCount(0);await expect(page.locator('.talent-card').first()).toContainText('Not assessed');
 await page.getByLabel('Theme',{exact:true}).selectOption('dark');expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
});
