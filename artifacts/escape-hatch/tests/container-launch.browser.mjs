import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const restoring = process.argv[2] === 'restore';
const fixture = 'ContainerFixture';
let launchUrl = '';
for await (const chunk of process.stdin.setEncoding('utf8')) launchUrl += chunk;
const url = new URL(launchUrl.trim());
assert.equal(url.hostname, 'localhost');

const browser = await chromium.launch({
  executablePath: process.env.ESCAPEHATCH_TEST_CHROMIUM,
  args: ['--host-resolver-rules=MAP fonts.googleapis.com ~NOTFOUND, MAP fonts.gstatic.com ~NOTFOUND'],
});
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  await page.goto(url.href);
  await page.getByRole('heading', { name: 'Welcome to EscapeHatch.' }).waitFor({ timeout: 10_000 });
  assert.equal(new URL(page.url()).pathname, '/journey');
  if (!restoring) {
    assert.equal(await page.getByTestId('journey-canonical-auth_handoff').count(), 0);
    assert.equal(await page.getByTestId('journey-destination-materials').count(), 0);
    await page.goto(new URL('/journey?scene=AUTH_HANDOFF', url).href);
    await page.getByRole('heading', { name: 'Welcome to EscapeHatch.' }).waitFor();
    assert.equal(await page.getByTestId('journey-branch-preview').count(), 0);
    await page.getByTestId('journey-step-5').press('Enter');
    await page.getByRole('heading', { name: 'Review and submit in your browser' }).waitFor();
    assert.equal(await page.getByTestId('journey-open-stage').getAttribute('href'), '/applications');
    await page.getByTestId('journey-open-stage').click();
    await page.getByRole('link', { name: 'Open Application prep' }).click();
    await page.getByRole('heading', { name: 'Review your reusable answers.' }).waitFor();
    assert.equal(await page.getByTestId('button-managed-launch').count(), 0);

    const documentRequests = [];
    page.on('request', request => {
      if (request.url().includes('/__escapehatch/managed-assist/documents/')) documentRequests.push(request.url());
    });
    await page.goto(new URL('/materials', url).href);
    await page.getByRole('heading', { name: 'Attach files on the employer’s site.' }).waitFor();
    assert.equal(await page.getByTestId('materials-review-scene').count(), 0);
    assert.deepEqual(documentRequests, []);
    await page.goto(new URL('/journey', url).href);
    await page.getByRole('heading', { name: 'Welcome to EscapeHatch.' }).waitFor();
  }

  const tour = page.getByRole('region', { name: 'Guided preparation and application tour' });
  await tour.getByRole('button', { name: 'Next' }).press('Enter');
  await tour.getByRole('heading', { name: 'Build your reusable profile' }).waitFor({ timeout: 5_000 });
  await tour.getByRole('link', { name: 'Open this scene' }).click();
  const firstName = page.getByRole('textbox', { name: 'First name', exact: true });
  if (restoring) {
    assert.equal(await firstName.inputValue(), fixture);
    await page.getByRole('status').filter({ hasText: 'Workspace recovered' }).waitFor({ timeout: 5_000 });
    console.log('A fresh browser recovered the saved workspace after restart.');
  } else {
    assert.equal(await firstName.inputValue(), '');
    await firstName.fill(fixture);
    await page.getByRole('textbox', { name: 'Last name', exact: true }).fill('Sample');
    await page.getByRole('textbox', { name: 'Email', exact: true }).fill('fixture@example.test');
    await page.getByRole('button', { name: 'Save profile' }).click();
    await page.getByRole('status').filter({ hasText: 'Workspace saved on this computer.' }).waitFor({ timeout: 5_000 });
    const state = await page.evaluate(async () => (await (await fetch('/__escapehatch/workspace/status')).json()).state);
    assert.equal(state, 'READY');
    console.log('The Docker cockpit opened the available tutorial steps and saved a profile.');
  }
} finally {
  await browser.close();
}
