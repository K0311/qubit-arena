import { expect, test } from '@playwright/test';

test('client app loads', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Qubit Arena' })).toBeVisible();
});
