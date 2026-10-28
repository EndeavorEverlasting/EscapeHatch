import { expect, test } from '@playwright/test';

test('title discovery searches and saves only after explicit choice', async ({ page }) => {
  await page.route('**/__escapehatch/discovery/search?**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      ok: true,
      jobs: [{
        guid: 'https://himalayas.app/companies/demo/jobs/project-pm',
        title: 'Senior Project Manager',
        companyName: 'Demo Company',
        applicationLink: 'https://himalayas.app/companies/demo/jobs/project-pm/apply',
        seniority: ['Senior'],
        salaryPeriod: 'annual',currency:'USD',minSalary:150000,maxSalary:190000,
        categories:['Project Management'],parentCategories:['Business'],
      }],
    }),
  }));
  await page.goto('/applications');
  await page.getByTestId('discovery-title').fill('project manager');
  await page.getByTestId('discovery-search').click();
  await expect(page.getByTestId('discovery-result')).toContainText('Senior Project Manager');
  await page.getByTestId('discovery-save').click();
  const jobs=await page.evaluate(()=>JSON.parse(localStorage.getItem('escape-hatch-applications')||'[]'));
  expect(jobs.some((job:{role:string;status:string})=>job.role==='Senior Project Manager'&&job.status==='saved')).toBe(true);
});
