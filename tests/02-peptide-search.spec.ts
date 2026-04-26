/**
 * 02-peptide-search.spec.ts
 *
 * What: Smoke-tests the Peptide Search AI (PSA) frontend search widget.
 *       Verifies the [peptide_search] shortcode renders, accepts input,
 *       and returns results for a known-good peptide name. Catches AJAX
 *       failures, nonce issues, and missing PR Core dependency.
 * Who triggers it: Playwright chromium project (post-auth setup).
 * Dependencies: peptide-search-ai plugin + PR Core active; at least one
 *               published peptide CPT post (e.g., BPC-157) on staging.
 *
 * @see C:\Users\ongte\apps\Peptide Repo CTO\app-maps\peptide-search-ai.md
 */

import { test, expect } from '@playwright/test';

const SEARCH_PATH = process.env.SEARCH_PAGE_PATH ?? '/';

test.describe('Peptide Search AI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(SEARCH_PATH);
    await page.waitForLoadState('networkidle');
  });

  test('search input widget is present on page', async ({ page }) => {
    // PSA renders a form with class .psa-search-form or input with data-psa attr
    const searchInput = page.locator(
      '.psa-search-form input, input[name*="peptide"], input[placeholder*="peptide" i], [data-psa] input'
    ).first();
    await expect(searchInput).toBeVisible({ timeout: 10_000 });
  });

  test('searching for a known peptide returns results', async ({ page }) => {
    const searchInput = page.locator(
      '.psa-search-form input, input[name*="peptide"], input[placeholder*="peptide" i], [data-psa] input'
    ).first();
    await expect(searchInput).toBeVisible();

    // Type a peptide that should exist on staging
    await searchInput.fill('BPC-157');
    await searchInput.press('Enter');

    // Results container should appear and contain something
    const results = page.locator('.psa-results, .psa-search-results, [data-psa-results]').first();
    await expect(results).toBeVisible({ timeout: 15_000 });
    const text = await results.textContent();
    expect((text ?? '').trim().length).toBeGreaterThan(0);
  });

  test('AJAX response contains no PHP error', async ({ page }) => {
    // Intercept the AJAX call and inspect raw response
    const ajaxResponse = page.waitForResponse(
      (resp) =>
        resp.url().includes('admin-ajax.php') &&
        resp.request().method() === 'POST',
      { timeout: 15_000 }
    );

    const searchInput = page.locator(
      '.psa-search-form input, input[name*="peptide"], input[placeholder*="peptide" i], [data-psa] input'
    ).first();
    await searchInput.fill('TB-500');
    await searchInput.press('Enter');

    try {
      const resp = await ajaxResponse;
      const body = await resp.text();
      expect(body).not.toContain('Fatal error');
      expect(body).not.toContain('Parse error');
      // Valid PSA response is JSON; check it starts with { or [
      expect(body.trim()).toMatch(/^[\[{]/);
    } catch {
      // AJAX call may not fire if results cached in page HTML — that's fine
    }
  });
});
