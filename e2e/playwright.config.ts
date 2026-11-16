import { defineConfig, devices } from '@playwright/test';

/**
 * e2e runs on its own ports, so it never reuses a dev server that is running other code, and
 * its game server starts in test mode with a fixed seed and a short deck (test-plan §3.5).
 */
const SERVER_PORT = 8091;
const CLIENT_PORT = 5174;
const baseURL = `http://localhost:${CLIENT_PORT}`;

/** 18 cards: every move type, short games, and enough to deal four hands of 4. */
export const TEST_DECK = 'H3,X3,Z2,S2,SX2,MEASURE3,CNOT3';

export default defineConfig({
  testDir: './tests',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 90_000,
  // Every page renders the 3D board in software (headless WebGL); more workers only slow each other.
  workers: 3,
  use: { baseURL, trace: 'on-first-retry' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // The client talks to the game server, so both run for every e2e test.
  webServer: [
    {
      command: 'pnpm --filter @qa/server start',
      port: SERVER_PORT,
      reuseExistingServer: !process.env.CI,
      env: { PORT: String(SERVER_PORT), NODE_ENV: 'test', TEST_SEED: '7', TEST_DECK },
    },
    {
      command: `pnpm --filter @qa/client exec vite --port ${CLIENT_PORT}`,
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      env: { VITE_SERVER_URL: `ws://localhost:${SERVER_PORT}` },
    },
  ],
});
