import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test('ready candidate account supports multiple applications, practice, tracker and reminder',async({page})=>{
 const privateWrites:string[]=[];page.on('request',r=>{if(r.method()!=='GET'&&r.url().includes('/api/v1/')&&!r.url().includes('/demo-preview'))privateWrites.push(r.url())});
 await page.goto('/foundation');await expect(page.getByLabel('Email',{exact:true})).toHaveValue('candidate@demo.kerjaos.test');await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Your next chapter'})).toBeVisible();
 await page.getByRole('navigation',{name:'Workspace navigation'}).getByRole('button',{name:'Jobs',exact:true}).click();await page.getByRole('button',{name:'Apply',exact:true}).click();await expect(page.getByRole('heading',{name:'Product Designer'})).toBeVisible();
 await page.getByRole('navigation',{name:'Workspace navigation'}).getByRole('button',{name:'Quiz',exact:true}).click();await page.getByRole('button',{name:'Start practice quiz'}).click();await page.getByLabel('Use semantic buttons and keyboard access').check();await page.getByLabel('A human reviews relevant evidence').check();await page.getByRole('button',{name:'Submit practice'}).click();await expect(page.getByText('Readiness index: 100%')).toBeVisible();
 await page.getByRole('navigation',{name:'Workspace navigation'}).getByRole('button',{name:'Reminders',exact:true}).click();await page.getByLabel('Reminder title').fill('Follow up with recruiter');await page.getByLabel('Due date').fill('2026-10-12');await page.getByRole('button',{name:'Add reminder',exact:true}).click();await expect(page.getByText('Follow up with recruiter',{exact:false})).toBeVisible();
 await page.getByRole('button',{name:'Sign out',exact:true}).click();await expect(page.getByRole('button',{name:'Sign in',exact:true})).toBeVisible();expect(privateWrites).toEqual([]);
});
test('recruiter demo runs real local agents and publishes a sample role',async({page})=>{
 await page.goto('/foundation');await page.getByRole('button',{name:'Recruiter demo',exact:true}).click();await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.getByRole('navigation',{name:'Workspace modes'}).getByRole('button',{name:'Recruitment',exact:true}).click();await expect(page.getByRole('heading',{name:'Recruitment overview'})).toBeVisible();
 await page.getByRole('navigation',{name:'Workspace navigation'}).getByRole('button',{name:'Jobs',exact:true}).click();await page.getByRole('button',{name:'Create job / requirements intake'}).click();await page.getByRole('button',{name:'Run agent review',exact:true}).click();await expect(page.getByRole('heading',{name:'Role match & fairness'})).toBeVisible({timeout:30000});await expect(page.getByRole('heading',{name:'Screening questions',exact:true})).toBeVisible();
 await page.getByLabel('Job title',{exact:true}).fill('QA Engineer');await page.getByRole('button',{name:'Publish sample role'}).click();await page.getByRole('navigation',{name:'Workspace navigation'}).getByRole('button',{name:'Jobs',exact:true}).click();await expect(page.getByRole('heading',{name:'QA Engineer'})).toBeVisible();
});
test('light and dark workspace are accessible, branded and fit a narrow screen',async({page})=>{
 await page.goto('/foundation');await expect(page.locator('main')).not.toContainText('404');expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
 await page.getByRole('button',{name:'Sign in',exact:true}).click();expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
 await page.getByLabel('Theme').selectOption('dark');await expect(page.locator('main')).toHaveAttribute('data-theme','dark');
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);await expect(page.getByRole('heading',{name:'Your next chapter'})).toBeVisible();
});
