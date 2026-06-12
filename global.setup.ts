/**
 * global.setup.ts
 *
 * What: Authenticates to WordPress admin once and persists the session to disk.
 * Who triggers it: Playwright "setup" project, runs before all smoke tests.
 * Dependencies: WP_ADMIN_USER and WP_ADMIN_PASSWORD env vars.
 *
 * The saved auth state (playwright/.auth/admin.json) is reused by the
 * "chromium" project so individual tests don't each incur a login round-trip.
 *
 * Retry hardening (2026-06-12): Hostinger rate-limits GitHub runner IPs on
 * wp-login.php, causing TimeoutError on page.goto. The login attempt is now
 * retried up to MAX_ATTEMPTS times with a fresh browser context per attempt
 * and BACKOFF_MS delay between attempts so transient throttle windows clear.
 */

import { test as setup, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

const AUTH_FILE = path.join(__dirname, 'playwright/.auth/admin.json');

const MAX_ATTEMPTS = 3;
const BACKOFF_MS   = 15_000;  // 15 s between attempts
const NAV_TIMEOUT  = 90_000;  // raised from 30 s → 90 s per attempt

setup('authenticate as WP admin', async ({ browser }) => {
  const user = process.env.WP_ADMIN_USER;
  const password = process.env.WP_ADMIN_PASSWORD;
  const baseURL = process.env.BASE_URL ?? 'https://staging.peptiderepo.com';

  if (!user || !password) {
    throw new Error(
      'WP_ADMIN_USER and WP_ADMIN_PASSWORD must be set in .env or CI secrets'
    );
  }

  // Ensure auth directory exists
  fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });

  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    console.log(
      `[setup] Login attempt ${attempt}/${MAX_ATTEMPTS} — navigating to wp-login.php ...`
    );

    // Fresh context per attempt so stale cookies / throttle state don't carry over.
    const context = await browser.newContext({ baseURL });
    const page = await context.newPage();

    try {
      await page.goto('/wp-login.php', { timeout: NAV_TIMEOUT });
      await page.fill('#user_login', user);
      await page.fill('#user_pass', password);
      await page.click('#wp-submit');

      // Wait for any post-login navigation. The site may redirect successful
      // logins to the homepage (via a login_redirect filter) rather than to
      // wp-admin — staging does this. So we don't assert the post-submit URL;
      // instead, we verify we're no longer ON wp-login.php (which would
      // indicate a credential rejection or 2FA prompt) and then navigate
      // explicitly to wp-admin.
      await page.waitForURL(
        (url) => !url.pathname.includes('/wp-login.php'),
        { timeout: NAV_TIMEOUT }
      );

      // Navigate explicitly into wp-admin to capture the authenticated admin session.
      await page.goto('/wp-admin/', { timeout: NAV_TIMEOUT });
      await expect(page).toHaveURL(/\/wp-admin\//, { timeout: 20_000 });
      await expect(page.locator('#wpadminbar')).toBeVisible({ timeout: 20_000 });

      // Persist session cookies + localStorage to disk
      await page.context().storageState({ path: AUTH_FILE });

      console.log(`[setup] Login succeeded on attempt ${attempt}/${MAX_ATTEMPTS}`);
      await context.close();
      return; // success — exit setup
    } catch (err) {
      lastError = err;
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[setup] Login attempt ${attempt}/${MAX_ATTEMPTS} FAILED: ${message}`
      );

      await context.close();

      if (attempt < MAX_ATTEMPTS) {
        console.log(`[setup] Waiting ${BACKOFF_MS / 1000}s before retry ...`);
        await new Promise((resolve) => setTimeout(resolve, BACKOFF_MS));
      }
    }
  }

  // All attempts exhausted — surface the last error with a clear diagnostic.
  throw new Error(
    `[setup] All ${MAX_ATTEMPTS} login attempts failed. ` +
    `Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}\n` +
    `Hint: Hostinger may still be throttling GitHub runner IPs. ` +
    `Re-run the workflow once the throttle window clears, or increase BACKOFF_MS / MAX_ATTEMPTS.`
  );
});
