# Changelog

All notable changes to the peptide-e2e smoke suite will be documented here.

## [1.3.0] - 2026-06-12

### Fixed
- **Auth setup survives `ERR_ABORTED` on wp-login.php** (`global.setup.ts`).
  When Hostinger's LiteSpeed throttles a GitHub runner IP, `page.goto` can
  throw `net::ERR_ABORTED` rather than a `TimeoutError`. Playwright marks the
  browser context closed internally on abort, so the existing
  `context.close()` call in the catch block threw
  `"browserContext.close: Target page, context or browser has been closed"`,
  which propagated out of catch and killed setup before the remaining retries
  ran. Two production deploys were blocked by this flake on 2026-06-12.

  Fix: introduced `safeClose()` helper that swallows the already-closed
  error, so an aborted context never terminates the retry loop. Max attempts
  raised from 3 → 5; backoff is now exponential (5 s / 10 s / 20 s / 40 s)
  instead of a flat 15 s, giving the throttle window more time to clear.
  Worst-case timing: 5 × 90 s navigation + 75 s backoff = ~525 s, well under
  the 900 s (15 min) job timeout. Final-failure message explicitly names the
  LiteSpeed throttle hypothesis so future CI logs self-diagnose.

## [1.2.0] - 2026-06-12

### Added
- **Dossier page smoke test** (`03-admin-plugins.spec.ts` — `WP Admin — PRAutoBlogger Article Dossier`).
  Navigates to `/wp-admin/admin.php?page=prautoblogger-dossier&post_id=<N>`, asserts HTTP 200,
  `#prab-dossier` container visible, body does NOT contain "Invalid plugin page" or "Fatal error".
  Guards against: menu-ordering regression (wrong hookname → wp_die 404), PHP fatals on dossier
  load, missing dossier container, and stage-section regression.

  Defensive strategy: tries canonical staging post IDs 925/930 first, then falls back to the
  most recent REST post, then falls back to post_id=0 (graceful empty state). Stage-section
  assertions are conditional on a run record existing. Loud test.info() annotations on fallback
  paths. New in PRAutoBlogger v0.19.2 / v0.19.3.

## [1.1.0] - 2026-06-12

### Added
- **Board page smoke test** (`03-admin-plugins.spec.ts` — `WP Admin — PRAutoBlogger board page`).
  Navigates to `/wp-admin/admin.php?page=prautoblogger-board`, asserts HTTP 200,
  `#prab-board` container visible, and body does NOT contain "Invalid plugin page".
  Guards against the v0.19.1 regression class: Board submenu registered before parent
  menu existed (both at admin_menu priority 10) → WordPress fallback hookname →
  wp_die 404. Now in the deploy-gate smoke suite so this failure class is un-shippable.

  Note: cannot be validated against prod until v0.19.1 of PRAutoBlogger deploys.
  Spec compiles and lists cleanly under `npx playwright test --list`.

## [1.0.0] - 2026-06-11

Initial release. 21 tests across 5 specs: homepage, reconstitution calculator,
peptide search, admin plugins, REST API.
