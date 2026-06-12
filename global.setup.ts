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
 * Retry hardening (2026-06-12 v1): Hostinger rate-limits GitHub runner IPs on
 * wp-login.php, causing TimeoutError on page.goto. The login attempt is now
 * retried up to MAX_ATTEMPTS times with a fresh browser context per attempt
 * and BACKOFF_MS delay between attempts so transient throttle windows clear.
 *
 * Retry hardening (2026-06-12 v2 — ERR_ABORTED fix): When Hostinger aborts
 * the connection (net::ERR_ABORTED), Playwright marks the context as closed
 * internally. A subsequent context.close() call throws
 * "browserContext.close: Target page, context or browser has been closed",
 * which propagated out of the catch block and crashed setup without consuming
 * remaining retries. Fix: context.close() is now guarded in its own
 * try/catch so an already-closed context never aborts the retry loop.
 * MAX_ATTEMPTS raised to 5; backoff doubled each time (5s/10s/20s/40s) so the
 * LiteSpeed throttle window has time to clear before each retry.
 *
 * Timing math (job timeout-minutes: 15 = 900 s):
 *   5 attempts × NAV_TIMEOUT (90 s) = 450 s navigation ceiling
 *   4 inter-attempt waits (5+10+20+40 s) = 75 s backoff ceiling
 *   Total worst-case: ~525 s — well under the 900 s job timeout.
 */

import { test as setup, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

const AUTH_FILE = path.join(__dirname, 'playwright/.auth/admin.json');

const MAX_ATTEMPTS = 5;
const NAV_TIMEOUT  = 90_000;  // 90 s per navigation attempt

/** Exponential backoff delays (ms) between attempts: 5 s, 10 s, 20 s, 40 s */
function backoffMs(attempt: number): number {
  return 5_000 * Math.pow(2, attempt - 1);
}

/** Safely close a context that Playwright may have already closed internally. */
async function safeClose(context: import('@playwright/test').BrowserContext): Promise<void> {
  try {
    await context.close();
  } catch {
    // Ignored: context was already closed (e.g. after ERR_ABORTED or crash).
  }
}

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
      await safeClose(context);
      return; // success — exit setup
    } catch (err) {
      lastError = err;
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[setup] Login attempt ${attempt}/${MAX_ATTEMPTS} FAILED: ${message}`
      );

      // IMPORTANT: use safeClose — if Playwright received ERR_ABORTED it marks
      // the context closed internally, so a plain context.close() throws
      // "Target page, context or browser has been closed". Without this guard
      // that secondary throw propagated out of catch and killed setup before
      // the remaining retries ran.
      await safeClose(context);

      if (attempt < MAX_ATTEMPTS) {
        const wait = backoffMs(attempt);
        console.log(
          `[setup] Waiting ${wait / 1000}s before retry ` +
          `(LiteSpeed throttle cool-down — attempt ${attempt + 1}/${MAX_ATTEMPTS}) ...`
        );
        await new Promise((resolve) => setTimeout(resolve, wait));
      }
    }
  }

  // All attempts exhausted — surface the last error with a clear diagnostic.
  throw new Error(
    `[setup] All ${MAX_ATTEMPTS} login attempts failed. ` +
    `Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}\n` +
    `Hypothesis: Hostinger LiteSpeed is throttling GitHub runner IPs on wp-login.php — ` +
    `connections abort (ERR_ABORTED) or time out in bursts. ` +
    `Re-run the workflow once the throttle window clears, or increase MAX_ATTEMPTS / backoffMs().`
  );
});
