import { defineConfig } from '@playwright/test';
import base from './playwright.config';

/** Screenshot tour (P-4.4): same servers as `pnpm e2e`, one test at a time, no retries. */
export default defineConfig({
  ...base,
  testDir: './screens',
  workers: 1,
  retries: 0,
  timeout: 240_000,
});
