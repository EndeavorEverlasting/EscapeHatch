import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const popup = readFileSync(new URL('../../../browser/application-assist/popup.html', import.meta.url), 'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
const guide = readFileSync(new URL('../../../browser/application-assist/journey-guide.js', import.meta.url), 'utf8');
type Scenario = { saved?: boolean; initialReadError?: boolean; invalidSaved?: boolean; setError?: boolean; readbackError?: boolean; mismatch?: boolean; delayWrite?: boolean; phone?: boolean };

/** Actual popup DOM/CSS + guide script; Chrome storage and session controls stay synthetic. */
async function mount(page: Page, scenario: Scenario = {}) {
  await page.setContent(popup);
  await page.evaluate(scenario => {
    const key = 'escapeHatch.extensionGuidedMode.v1';
    const state = { reads: 0, writes: 0, saved: scenario.saved as unknown, actions: [] as string[], scroll: [] as string[], resolveWrite: undefined as undefined | (() => void) };
    (window as any).__guideTest = state;
    Object.defineProperty(window, 'chrome', { configurable: true, value: { storage: { local: {
      get: async () => {
        state.reads++;
        if ((state.reads === 1 && scenario.initialReadError) || (state.reads > 1 && scenario.readbackError)) throw new Error('synthetic read error');
        if (scenario.invalidSaved) return { [key]: 'invalid' };
        if (state.saved === undefined) return {};
        return { [key]: scenario.mismatch && state.reads > 1 ? !state.saved : state.saved };
      },
      set: async (value: Record<string, boolean>) => {
        state.writes++;
        if (scenario.setError) throw new Error('synthetic set error');
        if (scenario.delayWrite) await new Promise<void>(resolve => { state.resolveWrite = resolve; });
        state.saved = value[key];
      },
    } } } });
    Element.prototype.scrollIntoView = function (options) { state.scroll.push((options as ScrollIntoViewOptions)?.behavior || 'auto'); };
    (window as any).EscapeHatchAssistModality = { invokeSemantic: (action: string) => {
      state.actions.push(action);
      if (action === 'open_profile_panel') document.documentElement.classList.add('profile-open');
      if (action === 'dismiss_overlay') document.documentElement.classList.remove('profile-open');
    } };
    for (const button of document.querySelectorAll('button[data-action], #recordConfirmation, #armSubmission, #stopSubmission')) {
      button.addEventListener('click', () => state.actions.push(button.id || button.getAttribute('data-action') || 'unknown'));
    }
    const sheet = document.getElementById('phoneSheetActions')!;
    sheet.innerHTML = '<button data-action="start_assist">Synthetic Start</button><button data-action="fill_allowed">Synthetic Fill</button>';
    for (const button of sheet.querySelectorAll('button')) button.addEventListener('click', () => state.actions.push(button.getAttribute('data-action')!));
    document.documentElement.setAttribute('data-modality', scenario.phone ? 'phone' : 'mouse');
    document.documentElement.classList.toggle('modality-phone', !!scenario.phone);
  }, scenario);
  await page.addScriptTag({ content: guide });
  await expect(page.locator('#guideStatus')).not.toHaveText('Loading your guide setting…');
}

test('missing preference shows guide while saved quiet mode restores without a write', async ({ page }) => {
  await mount(page);
  await expect(page.locator('#extensionJourneyGuide')).toBeVisible();
  await expect(page.locator('#guideToggle')).toBeEnabled();
  expect(await page.evaluate(() => (window as any).__guideTest.writes)).toBe(0);
  await mount(page, { saved: false });
  await expect(page.locator('#extensionJourneyGuide')).toBeHidden();
  await expect(page.locator('#guideToggle')).toHaveText('Show guide');
  expect(await page.evaluate(() => (window as any).__guideTest.writes)).toBe(0);
  await expect(page.locator('#materialsReviewHint')).toContainText('Materials desk');
});

for (const scenario of [{ initialReadError: true }, { invalidSaved: true }]) {
  test(`unknown saved preference cannot be overwritten: ${Object.keys(scenario)[0]}`, async ({ page }) => {
    await mount(page, { saved: false, ...scenario });
    await expect(page.locator('#guideToggle')).toBeDisabled();
    await expect(page.locator('#guidedMode')).toBeDisabled();
    await expect(page.locator('#extensionJourneyGuide')).toBeVisible();
    await page.locator('#guideToggle').evaluate(button => (button as HTMLButtonElement).click());
    expect(await page.evaluate(() => (window as any).__guideTest.writes)).toBe(0);
  });
}

for (const scenario of [{ setError: true }, { readbackError: true }, { mismatch: true }]) {
  test(`failed setting verification stays honest: ${Object.keys(scenario)[0]}`, async ({ page }) => {
    await mount(page, { saved: true, ...scenario });
    await page.locator('#guideToggle').click();
    await expect(page.locator('#guideStatus')).toContainText('could not');
    await expect(page.locator('#guideStatus')).not.toContainText('Previous mode preserved');
    await expect(page.locator('#extensionJourneyGuide')).toBeVisible();
    await expect(page.locator('#guideToggle')).toBeDisabled();
    await expect(page.locator('#guidedMode')).toBeDisabled();
    expect(await page.evaluate(() => (window as any).__guideTest.writes)).toBe(1);
    if (!scenario.setError) expect(await page.evaluate(() => (window as any).__guideTest.saved)).toBe(false);
  });
}

test('rapid mode requests serialize through verified readback', async ({ page }) => {
  await mount(page, { saved: true, delayWrite: true });
  await page.locator('#guideToggle').click();
  await expect(page.locator('#guideToggle')).toBeDisabled();
  await page.locator('#guideToggle').evaluate(button => { button.dispatchEvent(new MouseEvent('click')); button.dispatchEvent(new MouseEvent('click')); });
  expect(await page.evaluate(() => (window as any).__guideTest.writes)).toBe(1);
  await page.evaluate(() => (window as any).__guideTest.resolveWrite());
  await expect(page.locator('#extensionJourneyGuide')).toBeHidden();
  await expect(page.locator('#guideToggle')).toBeEnabled();
  await expect(page.locator('#guideStatus')).toContainText('Quiet mode saved');
});

test('keyboard scene inspection keeps stable focus and safely focuses informative regions', async ({ page }) => {
  await mount(page);
  const workspace = page.locator('#guideScenes button').nth(1);
  await workspace.focus();
  await page.keyboard.press('Enter');
  await expect(workspace).toBeFocused();
  await expect(workspace).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Space');
  await expect(workspace).toBeFocused();
  await page.locator('#guideFind').click();
  await expect(page.locator('#workspaceStatus')).toBeFocused();
  await page.locator('#guideScenes button').nth(5).click();
  await expect(page.locator('#workspaceStatus')).not.toHaveAttribute('tabindex');
  await page.locator('#guideFind').click();
  await expect(page.locator('#submissionState')).toBeFocused();
  expect(await page.evaluate(() => (window as any).__guideTest.actions)).toEqual([]);
  expect(await page.evaluate(() => (window as any).__guideTest.writes)).toBe(0);
});

test('phone profile handoff exposes the requested command without triggering it and reduced motion scroll is immediate', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 320, height: 800 });
  await mount(page, { phone: true });
  await page.locator('#guideFind').click();
  await expect(page.locator('#profilePanel')).toBeVisible();
  await expect(page.locator('#phoneSheet')).toBeHidden();
  await page.locator('#guideScenes button').nth(3).click();
  await page.locator('#guideFind').click();
  await expect(page.locator('#phoneSheet')).toBeVisible();
  await expect(page.locator('#phoneSheet [data-action="start_assist"]')).toBeFocused();
  await page.locator('#guideScenes button').nth(4).click();
  await page.locator('#guideFind').click();
  await expect(page.locator('#phoneSheet [data-action="fill_allowed"]')).toBeFocused();
  expect(await page.evaluate(() => (window as any).__guideTest.actions)).toEqual(['open_profile_panel', 'dismiss_overlay']);
  expect(await page.evaluate(() => (window as any).__guideTest.scroll)).toEqual(['auto', 'auto', 'auto']);
  await expect(page.locator('#guideStatus')).toContainText('no employer action was triggered');
});


test('hidden and disabled controls are never reported as focused or activated', async ({ page }) => {
  await mount(page);
  await page.locator('#guideScenes button').nth(3).click();
  await page.locator('#startAssist').evaluate(button => { (button as HTMLButtonElement).disabled = true; });
  await page.locator('#guideFind').click();
  await expect(page.locator('#guideStatus')).toContainText('not visible');
  await expect(page.locator('#guideFind')).toBeFocused();
  await page.locator('#guideScenes button').nth(1).click();
  await page.locator('#workspaceStatus').evaluate(region => { region.hidden = true; });
  await page.locator('#guideFind').click();
  await expect(page.locator('#guideStatus')).toContainText('not visible');
  expect(await page.evaluate(() => (window as any).__guideTest.actions)).toEqual([]);
});
