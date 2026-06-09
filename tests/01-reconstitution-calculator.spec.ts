/**
 * 01-reconstitution-calculator.spec.ts
 *
 * What: Smoke-tests the Peptide Reconstitution Calculator (PRC) plugin.
 *       Verifies the shortcode renders, presets load, and basic math produces
 *       a non-zero result — catching broken PHP, failed asset enqueue, or
 *       missing PR Core integration.
 * Who triggers it: Playwright chromium project (post-auth setup).
 * Dependencies: peptide-reconstitution-calculator plugin active, [prc_calculator]
 *               shortcode on the page at CALC_PAGE_PATH.
 *
 * @see C:\Users\ongte\apps\Peptide Repo CTO\app-maps\peptide-reconstitution-calculator.md
 */

import { test, expect } from '@playwright/test';

const CALC_PATH = process.env.CALC_PAGE_PATH ?? '/calculator/';

test.describe('Reconstitution Calculator', () => {
  test.beforeEach(async ({ page }) => {
    const res = await page.goto(CALC_PATH);
    // Tolerate 200 or 301 (redirect to trailing slash)
    expect([200, 301]).toContain(res?.status());
    await page.waitForLoadState('networkidle');
  });

  test('shortcode widget renders on page', async ({ page }) => {
    // The shortcode wraps the widget in a container with class prc-calculator
    // or similar; at minimum a <select> for peptide presets must exist.
    const widget = page.locator('.prc-calculator, [data-prc], #prc-calculator').first();
    await expect(widget).toBeVisible({ timeout: 10_000 });
  });

  test('peptide preset dropdown is populated', async ({ page }) => {
    // At minimum the 8 hardcoded defaults; more if PR Core is active
    const select = page.locator('select').first();
    await expect(select).toBeVisible();
    const options = await select.locator('option').count();
    expect(options).toBeGreaterThan(1); // >1 means at least one peptide beyond placeholder
  });

	test('fills inputs and gets a numeric result', async ({ page }) => {
		const calc = page.locator('.prc-calculator');
		// The calculator auto-computes once a peptide preset is chosen (the preset
		// supplies vial size, recommended water volume and a default dose).
		await calc.locator('#prc-peptide-select').selectOption({ index: 1 });
		// Results panel unhides and renders numeric result cards.
		const results = page.locator('#prc-results');
		await expect(results).toBeVisible({ timeout: 10_000 });
		await expect(page.locator('.prc-result-card__value').first()).toHaveText(/\d/, { timeout: 5_000 });
	});
});
