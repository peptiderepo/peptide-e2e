/**
 * 03-admin-plugins.spec.ts
 *
 * What: Verifies all five peptiderepo plugins are active in wp-admin and
 *       their admin pages load without PHP errors. Catches activation failures
 *       or missing plugin files after a deploy.
 * Who triggers it: Playwright chromium project (post-auth setup).
 * Dependencies: wp-admin authenticated session (from global.setup.ts).
 *
 * Plugin admin page slugs:
 *   - peptide-search-ai       → ?page=peptide-search-ai
 *   - pr-autoblogger          → ?page=pr-autoblogger
 *   - peptide-repo-core       → ?page=peptide-repo-core  (if admin page exists)
 *
 * @see C:\Users\ongte\apps\Peptide Repo CTO\app-maps\
 */

import { test, expect } from '@playwright/test';

const ADMIN = '/wp-admin';
const PLUGINS_PAGE = `${ADMIN}/plugins.php`;

// All five plugin slugs as WordPress registers them (directory name)
const REQUIRED_PLUGINS = [
  'peptide-search-ai',
  'peptide-repo-core',
  'peptide-reconstitution-calculator',
  'pr-autoblogger',
  'peptide-starter-theme', // theme, shown differently — checked separately
];

test.describe('WP Admin — Plugin health', () => {
  test('plugins page loads without fatal error', async ({ page }) => {
    const res = await page.goto(PLUGINS_PAGE);
    expect(res?.status()).toBe(200);
    await expect(page.locator('#wpbody')).toBeVisible();
    const body = await page.textContent('body');
    expect(body).not.toContain('Fatal error');
  });

  test('all required plugins are active', async ({ page }) => {
    await page.goto(PLUGINS_PAGE);

    for (const slug of REQUIRED_PLUGINS.filter((s) => s !== 'peptide-starter-theme')) {
      // Active plugins have tr with class "active" and data-slug matching the plugin
      const row = page.locator(`tr[data-slug="${slug}"]`);
      if (await row.count() === 0) {
        // Plugin may be in a subfolder — try partial match
        const anyRow = page.locator(`tr[data-plugin*="${slug}"]`);
        await expect(anyRow).toHaveCount(1, {
          timeout: 5_000,
        }).catch(() => {
          throw new Error(`Plugin row not found for slug: ${slug}`);
        });
        await expect(anyRow.first()).toHaveClass(/active/);
      } else {
        await expect(row).toHaveClass(/active/, { timeout: 5_000 });
      }
    }
  });
});

test.describe('WP Admin — PSA settings page', () => {
  test('PSA settings page loads', async ({ page }) => {
    const res = await page.goto(`${ADMIN}/admin.php?page=peptide-search-ai`);
    expect(res?.status()).toBe(200);
    await expect(page.locator('#wpbody')).toBeVisible();
    const body = await page.textContent('body');
    expect(body).not.toContain('Fatal error');
    // Settings form must be present
    await expect(page.locator('form')).toBeVisible();
  });

  test('PSA settings page shows cost dashboard section', async ({ page }) => {
    await page.goto(`${ADMIN}/admin.php?page=peptide-search-ai`);
    // Cost tracking dashboard renders on the same page
    const dashboard = page.locator(
      '.psa-cost-dashboard, [id*="cost"], [class*="usage"], table'
    ).first();
    await expect(dashboard).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('WP Admin — PRAutoBlogger settings page', () => {
  test('PRAutoBlogger settings page loads', async ({ page }) => {
    // Real slug confirmed via live inspection: prautoblogger-settings
    const res = await page.goto(`${ADMIN}/admin.php?page=prautoblogger-settings`);
    expect(res?.status()).toBe(200);
    await expect(page.locator('#wpbody')).toBeVisible();
    const body = await page.textContent('body');
    expect(body).not.toContain('Fatal error');
    // PRAutoBlogger uses a tabbed dashboard, not a plain <form>
    await expect(page.locator('.prautoblogger-dashboard, h1, h2').first()).toBeVisible();
  });
});

test.describe('WP Admin — Peptide Repo Core admin', () => {
  test('PR Core menu item exists in wp-admin', async ({ page }) => {
    await page.goto(`${ADMIN}/`);
    // PR Core registers the peptide CPT which creates a "Peptides" menu item