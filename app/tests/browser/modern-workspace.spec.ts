import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('appearance migration persists and every candidate tool stays reachable on mobile',async({page})=>{
 const privateWrites:string[]=[];
 page.on('request',r=>{if(r.method()!=='GET'&&r.url().includes('/api/v1/'))privateWrites.push(r.url())});
 await page.addInitScript(()=>{if(!localStorage.getItem('kerjaos-theme'))localStorage.setItem('kerjaos-theme','luna')});
 await page.goto('/foundation');await expect(page.getByLabel('Theme',{exact:true})).toHaveValue('dark');
 await expect(page.getByLabel('Password',{exact:true})).toHaveValue('KerjaDemo2026!');
 await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await page.getByLabel('Theme',{exact:true}).selectOption('light');
 await page.setViewportSize({width:390,height:844});
 const nav=page.getByRole('navigation',{name:'Workspace navigation'});
 for(const name of ['Jobs','Profile','Interview Results','Quiz','Identity','Background','Discover','Assistant','Interviews','Tracker','Analytics','Reminders','Privacy','Applications']){
  await nav.getByRole('button',{name,exact:true}).click();
  await expect(nav.getByRole('button',{name,exact:true})).toHaveAttribute('aria-current','page');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),name+' fits mobile').toBe(true);
 }
 await expect(page.getByRole('heading',{name:'Your next chapter'})).toBeVisible();
 await page.emulateMedia({reducedMotion:'reduce'});
 expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
 await page.getByRole('button',{name:'Sign out',exact:true}).click();await page.reload();
 await expect(page.getByLabel('Theme',{exact:true})).toHaveValue('light');
 expect(privateWrites).toEqual([]);
});
