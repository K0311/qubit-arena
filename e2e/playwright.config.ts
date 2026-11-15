import { defineConfig, devices } from '@playwright/test';

const baseURL = 'http://localhost:5173';

export default defineConfig({
  testDir: './tests',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL, trace: 'on-first-retry' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // The client talks to the game server, so both run for every e2e test.
  webServer: [
    {
      command: 'pnpm --filter @qa/server start',
      port: 8080,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'pnpm --filter @qa/client dev',
      url: baseURL,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
