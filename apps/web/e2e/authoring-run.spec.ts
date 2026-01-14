import { expect, test } from '@playwright/test';

test('authoring creates a run and pins a timeline event', async ({ page }) => {
  await page.goto('/authoring');

  const createButton = page.getByTestId('create-run');
  await expect(createButton).toBeEnabled();
  await createButton.click();

  await expect(page).toHaveURL(/\/runs\/.+/);
  await expect(page.getByTestId('ws-status')).toContainText(/Live|Connecting/);

  await page.getByRole('tab', { name: 'Timeline' }).click();
  const timeline = page.getByTestId('time-warp-timeline');
  await expect(timeline).toBeVisible();

  const pinnedCount = page.getByTestId('pinned-count');
  await expect(pinnedCount).toHaveText(/0|1|2/);

  const marker = timeline.locator('svg g[role="button"]').first();
  await expect(marker).toBeVisible();
  await marker.click();

  await expect(pinnedCount).not.toHaveText('0');
});
