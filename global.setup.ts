/**
 * global.setup.ts
 *
 * What: Authenticates to WordPress admin once and persists the session to disk.
 * Who triggers it: Playwright "setup" project, runs before all smoke tests.
 * Dependencies: WP_ADMIN_USER and WP_ADMIN_PASSWORD env vars.
 *
 * The saved auth state (playwright/.auth/admin.json) is reused by the
 * "chromium" project so individual tests don't each incur a login round-trip.
 */

import { test as setup, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

const AUTH_FILE = path.join(__dirname, 'playwright/.auth/admin.json');

setup('authenticate as WP admin', async ({ page }) => {
  const user = process.env.WP_ADMIN_USER;
  const password = process.env.WP_ADMIN_PASSWORD;

  if (!user || !password) {
    throw new Error(
      'WP_ADMIN_USER and WP_ADMIN_PASSWORD must be set in .env or CI secrets'
    );
  }

  // Ensure directory exists
  fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });

  await page.goto('/wp-login.php');
  await page.fill('#user_login', user);
  await page.fill('#user_pass', password);
  await page.click('#wp-submit');

  // Wait for successful redirect to wp-admin dashboard
  await expect(page).toHaveURL(/wp-admin/, { timeout: 20_000 });
  await expect(page.locator('#wpadminbar')).toBeVisible();

  // Persist session cookies + localStorage to disk
  await page.context().storageState({ path: AUTH_FILE });
});
