import { test, expect } from '@playwright/test';

test('secure workspace removes legacy browser identity and displays scoped applications', async ({ page }) => {
  let signedIn = false;
  let submissions = 0;
  await page.addInitScript(() => {
    localStorage.setItem('candidateSessionV3', '{"role":"admin"}');
    localStorage.setItem('hiringManagerSessionV1', 'legacy');
  });
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let data: unknown;
    let status = 200;
    if(path.includes('/interviews/')) data=path.endsWith('/context')?{applications:[],slots:[],bookings:[],interviewers:[],email_delivery:'disabled'}:[];
    else if(path.includes('/discover/')) data=path.endsWith('/progress')?{enabled:false,sources:[]}:[];
    else if(path.includes('/chat/')) data=[];
    else if(path.includes('/background/')) data=path.endsWith('/policy')?{official_provider:'not_configured',real_capture_enabled:false,checks:[]}:[];
    else if(path.includes('/quiz/')) data=[];
    else if(path.includes('/identity/')) data=path.endsWith('/policy')?{version:'identity-v1',text:{en:'Synthetic identity consent',ms:'Persetujuan identiti sintetik'},real_capture_enabled:false}:[];
    else if (path.endsWith('/auth/login')) { signedIn = true; data = { signed_in: true }; }
    else if (path.endsWith('/auth/logout')) { signedIn = false; data = { signed_out: true }; }
    else if (path.endsWith('/me')) {
      status = signedIn ? 200 : 401;
      data = signedIn ? { id: 'A', email: 'a@example.test', aal: 'aal1', csrf_token: 'test-csrf', memberships: [], password_recovery: false } : { detail: 'Sign in required' };
    } else if (path.endsWith('/jobs')) data = [{ id: 'X', title: 'Synthetic test role', department: 'Fixture only' }];
    else if (path.endsWith('/applications')) {
      if (route.request().method() === 'POST') {
        expect(route.request().headers()['x-csrf-token']).toBe('test-csrf');
        expect(route.request().postDataJSON().idempotency_key).toMatch(/^[a-f0-9-]{36}$/);
        submissions++; data = { id: 'AX' };
      } else data = submissions ? [{ id: 'AX', job_id: 'X', stage: 'P0', status: 'applied', version: 0 }] : [];
    } else throw new Error('Unexpected browser fixture route: ' + path);
    await route.fulfill({ status, json: data });
  });
  await page.goto('/');
  await expect(page).toHaveURL(/\/foundation$/);
  await page.goto('/candidate');
  await expect(page).toHaveURL(/\/foundation$/);
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([]);
  await page.getByLabel('Email', { exact: true }).fill('a@example.test');
  await page.getByLabel('Password', { exact: true }).fill('fixture-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText('Synthetic test role', { exact: false }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.getByText('P0 · Apply / approach · applied')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Apply', exact: true })).toBeDisabled();
  expect(submissions).toBe(1);
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([]);
  await page.getByRole('combobox', { name: 'Language / Bahasa' }).selectOption('ms');
  await expect(page.getByRole('heading', { name: 'Permohonan saya' })).toBeVisible();
  await page.getByRole('button', { name: 'Log keluar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Log masuk', exact: true })).toBeVisible();
});
