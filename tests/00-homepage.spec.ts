/**
 * 00-homepage.spec.ts
 *
 * What: Verifies the site root loads with no fatal PHP errors and basic
 *       theme elements are present. Catches theme activation failures,
 *       white screens, and missing plugin-provided content.
 * Who triggers it: Playwright chromium project (post-auth setup).
 * Dependencies: peptide-starter-theme, PR Core active.
 */

import { test, expect } from '@playwright/test';

test.describe('Homepage', () => {
  test('loads with HTTP 200 and no fatal error', async ({ page }) => {
    const response = await page.goto('/');
    expect(response?.status()).toBe(200);
  });

  test('has no PHP fatal error or white screen', async ({ page }) => {
    await page.goto('/');
    const body = await page.textContent('body');
    // PHP fatals produce these strings in non-production WP configs
    expect(body).not.toContain('Fatal error');
    expect(body).not.toContain('Parse error');
    expect(body).not.toContain('Warning: ');
    // White-screen: body is empty or nearly empty
    expect((body ?? '').trim().length).toBeGreaterThan(200);
  });

  test('renders site name in page title', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/peptiderepo/i);
  });

  test('wp-admin bar present (logged-in session)', async ({ page }) => {
    await page.goto('/');
    // The auth state from global.setup means we should see the admin bar
    await expect(page.locator('#wpadminbar')).toBeVisible();
  });
});
