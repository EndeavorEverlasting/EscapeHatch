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
  const tour = page.getByRole('region', { name: 'Guided preparation and application tour' });
  await tour.getByRole('button', { name: 'Next' }).press('Enter');
  await tour.getByRole('heading', { name: 'Build your reusable profile' }).waitFor({ timeout: 5_000 });
  await tour.getByRole('link', { name: 'Open this scene' }).click();
  const firstName = page.getByRole('textbox', { name: 'First name', exact: true });
  if (restoring) {
    assert.equal(await firstName.inputValue(), fixture);
    await page.getByRole('status').filter({ hasText: 'Workspace recovered' }).waitFor({ timeout: 5_000 });
    console.log('A fresh browser recovered the workspace after removing and restarting the container.');
  } else {
    assert.equal(await firstName.inputValue(), '');
    await firstName.fill(fixture);
    await page.getByRole('textbox', { name: 'Last name', exact: true }).fill('Sample');
    await page.getByRole('textbox', { name: 'Email', exact: true }).fill('fixture@example.test');
    await page.getByRole('button', { name: 'Save profile' }).click();
    await page.getByRole('status').filter({ hasText: 'Workspace saved on this computer.' }).waitFor({ timeout: 5_000 });
    const state = await page.evaluate(async () => (await (await fetch('/__escapehatch/workspace/status')).json()).state);
    assert.equal(state, 'READY');
    console.log('The managed browser workspace opened the interactive tutorial and saved a profile.');
  }
} finally {
  await browser.close();
}
