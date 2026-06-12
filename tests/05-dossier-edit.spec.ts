/**
 * 05-dossier-edit.spec.ts
 *
 * What: Smoke for the PRAutoBlogger dossier EDIT + RE-RUN surface
 *       (plugin v0.20.0, Phase 2 admin M3). Read-only: opens/closes the
 *       edit panel and asserts structure — it NEVER clicks Save or any
 *       Re-run button (those fork inputs / queue paid LLM jobs).
 * Who triggers it: Playwright chromium project (post-auth setup).
 * Dependencies: wp-admin authenticated session (from global.setup.ts).
 *
 * SKIP-IF-ABSENT (M3 binding): this spec targets a surface that may not
 * be deployed yet. When the M3 markup (.prab-stage-rerun-footer) is
 * absent from the dossier, the test SKIPS with a loud annotation so this
 * PR can merge before the plugin PR ships. Once v0.20.0 is live, the
 * skip path goes dead and the assertions gate as usual.
 *
 * Selectors sourced from prautoblogger v0.20.0:
 *   templates/admin/dossier-stage-section.php  (.prab-stage-rerun-footer,
 *     .prab-edit-toggle, .prab-edit-unavailable, .prab-rerun-from)
 *   templates/admin/dossier-edit-panel.php     (.prab-edit-panel,
 *     .prab-edit-textarea, .prab-edit-save, .prab-edit-rerun)
 *   templates/admin/dossier-sidebar-cards.php  (.prab-run-spend,
 *     .prab-models-card)
 *
 * @see prautoblogger PR #161 (v0.20.0) — the surface under test.
 */

import { test, expect } from '@playwright/test';

const ADMIN = '/wp-admin';
const CANDIDATE_POST_IDS = [925, 930]; // canonical staging posts

test.describe('WP Admin — PRAutoBlogger dossier edit + re-run (M3)', () => {
  test('edit affordances render structurally (no mutations)', async ({ page, request }) => {
    // ── Post discovery (same defensive strategy as the dossier smoke) ──
    let targetPostId: number | null = null;
    for (const pid of CANDIDATE_POST_IDS) {
      const apiRes = await request.get(`/wp-json/wp/v2/posts/${pid}`);
      if (apiRes.ok()) {
        targetPostId = pid;
        break;
      }
    }
    if (targetPostId === null) {
      const listRes = await request.get('/wp-json/wp/v2/posts?per_page=5&orderby=date&order=desc');
      if (listRes.ok()) {
        const posts: Array<{ id: number }> = await listRes.json();
        if (posts.length > 0) {
          targetPostId = posts[0].id;
        }
      }
    }
    if (targetPostId === null) {
      test.info().annotations.push({
        type: 'warning',
        description:
          '[dossier-edit smoke] No post found on this environment — ' +
          'cannot exercise the edit surface. Skipping.',
      });
      test.skip();
      return;
    }

    const res = await page.goto(`${ADMIN}/admin.php?page=prautoblogger-dossier&post_id=${targetPostId}`);
    expect(res?.status()).toBe(200);
    await expect(page.locator('#wpbody')).toBeVisible();
    const body = await page.textContent('body');
    expect(body).not.toContain('Fatal error');
    expect(body).not.toContain('Invalid plugin page');

    // ── SKIP-IF-ABSENT gate: M3 markup not deployed yet ────────────────
    const footers = page.locator('.prab-stage-rerun-footer');
    const footerCount = await footers.count();
    if (footerCount === 0) {
      test.info().annotations.push({
        type: 'warning',
        description:
          '[dossier-edit smoke] .prab-stage-rerun-footer absent — the M3 ' +
          'edit+rerun surface (plugin v0.20.0) is not deployed on this ' +
          'environment, or this post has no stage sections. Skipping per ' +
          'the merge-early binding.',
      });
      test.skip();
      return;
    }

    console.log(`[dossier-edit smoke] Found ${footerCount} stage rerun footers on post id=${targetPostId}`);

    // ── Disabled affordances must explain themselves ───────────────────
    const unavailable = page.locator('.prab-edit-unavailable');
    const unavailableCount = await unavailable.count();
    for (let i = 0; i < unavailableCount; i++) {
      const reason = (await unavailable.nth(i).textContent())?.trim() ?? '';
      expect(reason.length, 'disabled edit affordances must carry a visible reason').toBeGreaterThan(10);
    }

    // ── Edit panel open/close (read-only — NEVER click save/rerun) ─────
    const toggles = page.locator('.prab-edit-toggle');
    const toggleCount = await toggles.count();
    if (toggleCount === 0) {
      test.info().annotations.push({
        type: 'info',
        description:
          '[dossier-edit smoke] No editable stage on this post (no recorded ' +
          'request_json yet, or post is published/frozen). Disabled-state ' +
          'reasons were asserted; panel interaction not exercisable.',
      });
      return;
    }

    const firstToggle = toggles.first();
    const panelId = await firstToggle.getAttribute('aria-controls');
    expect(panelId).toBeTruthy();
    const panel = page.locator(`#${panelId}`);

    await firstToggle.click();
    await expect(panel).toBeVisible();
    await expect(firstToggle).toHaveAttribute('aria-expanded', 'true');

    // Panel structure: textareas + save + rerun buttons + fork/queue copy.
    expect(await panel.locator('.prab-edit-textarea').count()).toBeGreaterThan(0);
    await expect(panel.locator('.prab-edit-save')).toBeVisible();
    await expect(panel.locator('.prab-edit-rerun')).toBeVisible();
    const copy = (await panel.textContent()) ?? '';
    expect(copy).toContain('original is preserved'); // fork copy (guardrail 1)
    expect(copy.toLowerCase()).toContain('queued');  // chained-cron copy

    // Close it again — leave the page exactly as found.
    await firstToggle.click();
    await expect(panel).toBeHidden();

    // ── M3 sidebar cards present when run data exists ──────────────────
    await expect(page.locator('.prab-run-spend')).toBeVisible();
    await expect(page.locator('.prab-models-card')).toBeVisible();
  });
});
