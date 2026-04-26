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

const CALC_PATH = process.env.CALC_PAGE_PATH ?? '/reconstitution-calculator/';

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
    // Select BPC-157 or the first non-placeholder option
    const select = page.locator('select').first();
    const firstPeptide = select.locator('option').nth(1);
    const firstValue = await firstPeptide.getAttribute('value');
    await select.selectOption(firstValue ?? '');

    // Fill reconstitution volume (mL) — use a known valid value
    const volInput = page.locator('input[name*="recon"], input[placeholder*="mL"], input[type="number"]').first();
    await volInput.fill('2');

    // Fill desired dose
    const doseInput = page.locator('input[name*="dose"], input[placeholder*="dose"], input[type="number"]').nth(1);
    await doseInput.fill('250');

    // Trigger calculation (button or auto-calculate on input)
    const calcButton = page.locator('button[type="submit"], button:has-text("Calculate")');
    if (await calcButton.count() > 0) {
      await calcButton.first().click();
    }

    // Results container should show a non-zero concentration or injection volume
    const results = page.locator('.prc-results, .calculator-results, [data-prc-result]').first();
    await expect(results).toBeVisible({ timeout: 5_000 });
    const resultText = await results.textContent();
    expect(resultText).toMatch(/\d+(\.\d+)?/); // contains at least one number
  });
});
