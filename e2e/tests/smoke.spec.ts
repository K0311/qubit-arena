import { expect, test } from '@playwright/test';

test('client app loads the main menu', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'QUBIT ARENA' })).toBeVisible();
  await expect(page.getByTestId('menu-play')).toBeVisible();
});
