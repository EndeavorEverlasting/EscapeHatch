import { expect, test } from '@playwright/test';
for (const kind of ['answer', 'application'] as const) {
  test(`validation focus cannot steal the next edit in ${kind}`, async ({ page }) => {
    const answer = kind === 'answer';
    const first = answer ? 'input-answer-title' : 'input-company';
    const second = answer ? 'textarea-answer-content' : 'input-role';
    const save = answer ? 'button-save-answer' : 'button-save-application';
    await page.goto(answer ? '/answers' : '/applications');
    await page.getByTestId(answer ? 'button-add-answer' : 'button-add-application').click();
    await expect(page.getByRole('dialog')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByTestId('button-close-dialog')).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(page.getByTestId(save)).toBeFocused();
    await page.getByTestId(first).fill('Synthetic focus record');
    await page.getByTestId(second).fill('Synthetic detail');
    await page.getByTestId(save).click();
    const row = page.getByRole('article').filter({ hasText: 'Synthetic focus record' });
    await (answer ? row.getByRole('button', { name: 'Edit Synthetic focus record' }) : row.locator('[data-testid^="button-edit-application-"]')).click();
    await expect(page.getByRole('dialog')).toBeFocused();
    await page.getByTestId(first).fill('');
    await page.evaluate(() => {
      const host = window as Window & { savedRAF?: typeof requestAnimationFrame; heldFrames?: FrameRequestCallback[] };
      host.savedRAF = requestAnimationFrame; host.heldFrames = [];
      window.requestAnimationFrame = callback => { host.heldFrames!.push(callback); return host.heldFrames!.length; };
    });
    try {
      await page.getByTestId(save).dispatchEvent('click');
      await expect(page.getByTestId(answer ? 'answer-title-error' : 'company-error')).toBeVisible();
      await page.getByTestId(first).fill('Synthetic focus record');
      const field = page.getByTestId(second);
      await field.focus(); await page.keyboard.press('ControlOrMeta+A');
      await page.evaluate(() => {
        const host = window as Window & { savedRAF?: typeof requestAnimationFrame; heldFrames?: FrameRequestCallback[] };
        window.requestAnimationFrame = host.savedRAF!;
        for (const callback of host.heldFrames || []) callback(performance.now());
      });
      await expect(field).toBeFocused();
      await page.keyboard.press('Backspace');
      await expect(field).toHaveValue('');
      await page.getByTestId(save).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await expect(row).toContainText('Synthetic detail');
    } finally {
      await page.evaluate(() => { const host = window as Window & { savedRAF?: typeof requestAnimationFrame }; if (host.savedRAF) window.requestAnimationFrame = host.savedRAF; });
    }
  });
}
