# Changelog

All notable changes to the peptide-e2e smoke suite will be documented here.

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
