import { expect, test } from '@playwright/test';

test('experiments: select two runs and view config diff', async ({ page }) => {
  await page.goto('/experiments');

  const experimentLinks = page.locator('table tbody tr td a');
  await expect.poll(async () => experimentLinks.count()).toBeGreaterThan(0);
  const firstExperiment = experimentLinks.first();
  await expect(firstExperiment).toBeVisible();
  await firstExperiment.click({ noWaitAfter: true });

  await expect(page).toHaveURL(/\/experiments\/.+/);

  const checkboxes = page.locator('input[type="checkbox"]');
  await expect.poll(async () => checkboxes.count()).toBeGreaterThan(1);
  await checkboxes.nth(0).check();
  await checkboxes.nth(1).check();

  await expect(page.getByText('Compare runs')).toBeVisible();
  await expect(page.getByLabel('Config diff')).toBeVisible();
});
