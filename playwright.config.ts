/**
 * Playwright configuration for peptiderepo.com smoke tests.
 *
 * Usage:
 *   npm test                          — run against BASE_URL (defaults to staging)
 *   npm run test:staging              — explicit staging run
 *   npm run test:prod                 — production smoke run
 *
 * Environment variables (set in .env or CI secrets):
 *   BASE_URL                 — target site root (default: https://staging.peptiderepo.com)
 *   WP_ADMIN_USER            — WordPress admin username
 *   WP_ADMIN_PASSWORD        — WordPress admin password
 *   CALC_PAGE_PATH           — URL path to the reconstitution calculator page (default: /reconstitution-calculator/)
 *   SEARCH_PAGE_PATH         — URL path to the peptide search page (default: /)
 *   DIRECTORY_PAGE_PATH      — URL path to the peptide directory page (default: /peptides/)
 */

import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '.env') });

const BASE_URL = process.env.BASE_URL ?? 'https://staging.peptiderepo.com';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,          // WP staging is single-server; parallel can cause rate-limit hits
  forbidOnly: !!process.env.CI,  // Prevent .only from landing in CI
  retries: process.env.CI ? 1 : 0,
  workers: 1,                    // Sequential against staging to be polite
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'on-failure' }]],

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },

  projects: [
    // Auth setup — runs first, saves session to disk
    {
      name: 'setup',
      testMatch: /global\.setup\.ts/,
    },
    // All smoke tests — depend on auth setup
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'playwright/.auth/admin.json',
      },
      dependencies: ['setup'],
    },
  ],
});
