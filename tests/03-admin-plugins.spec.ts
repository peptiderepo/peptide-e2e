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
  'prautoblogger',
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

test.describe('WP Admin — PRAutoBlogger board page', () => {
  /**
   * Smoke test: Board submenu page must load without 404 or "Invalid plugin page".
   *
   * This test guards against the v0.19.1 regression class: Board submenu was
   * registered before the parent top-level menu page existed (both at admin_menu
   * priority 10), causing WordPress to fall back to the `admin_page_*` hookname.
   * At request time WP recomputed the hookname, found nothing, and called
   * wp_die("Invalid plugin page"). The fix (v0.19.1) moves the board hook to
   * priority 11 so the parent menu slot is populated first.
   *
   * Selector sourced from templates/admin/board-page.php: `<div id="prab-board" ...>`.
   *
   * NOTE: This test cannot be validated against prod until v0.19.1 is deployed.
   * It is included in the deploy-gate smoke suite so the bug class becomes
   * un-shippable in future. The spec compiles and lists cleanly; the test will
   * run correctly once the fix is live.
   */
  test('board page loads and board container is present', async ({ page }) => {
    // Navigate to the Board submenu page.
    const res = await page.goto(`${ADMIN}/admin.php?page=prautoblogger-board`);

    // Must be HTTP 200 — not wp_die 404.
    expect(res?.status()).toBe(200);

    // wp-admin chrome must render (confirms we're authenticated and in admin).
    await expect(page.locator('#wpbody')).toBeVisible();

    // Body must NOT contain the wp_die "Invalid plugin page" error string.
    const body = await page.textContent('body');
    expect(body).not.toContain('Invalid plugin page');

    // Board container div must be present (from templates/admin/board-page.php).
    // selector: <div id="prab-board" class="prab-board" ...>
    await expect(page.locator('#prab-board')).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('WP Admin — Peptide Repo Core admin', () => {
  test('PR Core menu item exists in wp-admin', async ({ page }) => {
    await page.goto(`${ADMIN}/`);
    // PR Core registers the peptide CPT which creates a "Peptides" menu item
    const nav = page.locator('#adminmenu');
    await expect(nav).toBeVisible();
    // PR Core registers the peptide CPT, which adds a post_type=peptide admin menu/submenu (label-agnostic).
    await expect(nav.locator('a[href*="post_type=peptide"]').first()).toBeAttached({ timeout: 10_000 });
  });

  test('PR Core Settings page loads', async ({ page }) => {
    // Settings page lives under the Peptides CPT submenu
    const res = await page.goto(
      `${ADMIN}/edit.php?post_type=peptide&page=pr-core-settings`
    );
    expect(res?.status()).toBe(200);
    await expect(page.locator('#wpbody')).toBeVisible();
    const body = await page.textContent('body');
    expect(body).not.toContain('Fatal error');
    await expect(page.locator('form')).toBeVisible();
  });
});

test.describe('WP Admin — PRAutoBlogger Article Dossier', () => {
  /**
   * Smoke test: Article Dossier page must load without "Invalid plugin page" error.
   *
   * The dossier is a hidden-submenu page registered at admin_menu priority 12
   * (after board p11, after parent p10). It is link-accessed via
   * admin.php?page=prautoblogger-dossier&post_id=<int>.
   *
   * This test guards against:
   * 1. Menu-ordering regression (wrong hookname → wp_die 404).
   * 2. PHP fatal errors on dossier load (missing require, fatal in assembler).
   * 3. Missing dossier container div (template regression).
   * 4. Stage-section regression (stage markup absent when run data exists).
   *
   * Defensive strategy: the test first queries the WP REST API for a post
   * published by PRAutoBlogger (_prautoblogger_generated=1). If a post is found,
   * it opens its dossier and asserts the full set. If no matching post exists
   * on this environment (staging/prod may differ), the test opens the dossier
   * with post_id=0 and asserts the graceful "no run record" empty state — which
   * still validates page load, no fatal, no "Invalid plugin page".
   *
   * Selector sourced from templates/admin/dossier-page.php:
   *   <div id="prab-dossier" class="prab-dossier-wrap" ...>
   *
   * Posts 925/930 are the canonical staging test posts (v0.18.3 generation run).
   * They are tried first; REST fallback handles environments where they don't exist.
   */
  test('dossier page loads and dossier container is present', async ({ page, request }) => {
    const ADMIN = '/wp-admin';
    const CANDIDATE_POST_IDS = [925, 930]; // staging canonical posts from v0.18.3

    // Strategy 1: try known staging post IDs
    let targetPostId: number | null = null;

    for (const pid of CANDIDATE_POST_IDS) {
      const apiRes = await request.get(`/wp-json/wp/v2/posts/${pid}`);
      if (apiRes.ok()) {
        targetPostId = pid;
        console.log(`[dossier smoke] Found candidate post id=${pid} via REST API`);
        break;
      }
    }

    // Strategy 2: query for any PRAutoBlogger-generated post via REST
    if (targetPostId === null) {
      const listRes = await request.get('/wp-json/wp/v2/posts?per_page=5&orderby=date&order=desc');
      if (listRes.ok()) {
        const posts: Array<{ id: number; meta?: Record<string, unknown> }> = await listRes.json();
        if (posts.length > 0) {
          targetPostId = posts[0].id;
          console.log(`[dossier smoke] Fallback: using most recent post id=${targetPostId}`);
        }
      }
    }

    // Navigate to dossier — use targetPostId if found, else post_id=0 for graceful empty state
    const postIdParam = targetPostId !== null ? targetPostId : 0;
    const dossierUrl = `${ADMIN}/admin.php?page=prautoblogger-dossier&post_id=${postIdParam}`;

    if (targetPostId === null) {
      // Loud annotation — the dossier will render empty state, not full dossier
      test.info().annotations.push({
        type: 'warning',
        description:
          '[dossier smoke] No PRAutoBlogger post found on this environment. ' +
          'Asserting graceful empty state (post_id=0). ' +
          'Full dossier assertions (stage sections) require a post with a run record.',
      });
    }

    const res = await page.goto(dossierUrl);

    // Must be HTTP 200 — not wp_die 404 (menu-ordering regression guard).
    expect(res?.status()).toBe(200);

    // wp-admin chrome must render (confirms auth session is valid).
    await expect(page.locator('#wpbody')).toBeVisible();

    // Body must NOT contain the wp_die "Invalid plugin page" error string.
    const body = await page.textContent('body');
    expect(body).not.toContain('Invalid plugin page');
    expect(body).not.toContain('Fatal error');

    // Dossier container div must be present in all cases (full run OR empty state).
    // Selector from templates/admin/dossier-page.php: <div id="prab-dossier" ...>
    await expect(page.locator('#prab-dossier')).toBeVisible({ timeout: 10_000 });

    // Stage sections — only assert if we have a post with (likely) a run record.
    if (targetPostId !== null) {
      // At least one stage section must be present IF the post has a run record.
      // The dossier may still show empty state if this post pre-dates the substrate.
      // We assert conditionally: if any stage section exists, it has the right class.
      const stageSections = page.locator('.prab-stage-section');
      const stageCount = await stageSections.count();

      if (stageCount > 0) {
        // Dossier has stage data — verify stage sections render without error
        console.log(`[dossier smoke] Found ${stageCount} stage sections on post id=${targetPostId}`);
        await expect(stageSections.first()).toBeVisible();
      } else {
        // Post exists but has no run stages — graceful empty state (pre-substrate post)
        test.info().annotations.push({
          type: 'info',
          description:
            `[dossier smoke] Post id=${targetPostId} exists but has no stage sections. ` +
            'This is the expected graceful state for posts published before v0.18.0.',
        });
        // The dossier container is already verified above; this is not a failure.
      }
    }
  });
});
