# Peugeot 206 Garage — v3.11.0

## Root-cause repair
- Restored the dashboard page renderers and export handlers that were referenced during startup but missing from `assets/js/app.js`.
- Prevented a missing event-handler function from aborting the `DOMContentLoaded` bootstrap before `loadDashboard()` could start.
- Isolated each dashboard section renderer so a fault in one page does not stop the remaining pages from rendering.
- Fixed the error-isolation path so an unmapped section does not query an invalid empty CSS selector.
- Made connection badge, refresh button, month filter and toast handling defensive when an optional DOM element is absent.

## Diagnostics
- Added a separate `assets/js/diagnostics.js` module loaded before the data loader and application code.
- Added a floating **گزارش فنی** panel with live log view, data-source self-test, JSON export and copy support.
- Captures runtime exceptions, unhandled Promise rejections, network online/offline changes, blocked resources, CSP violations, HTTP responses, source failures and request durations.
- Keeps a bounded, privacy-filtered diagnostic history in localStorage so errors survive refresh.
- Redacts authorization headers, token/secret/password fields and URL query strings. Vehicle events, full config, and bot credentials are not included in the diagnostic export.

## Data loading and rendering
- Kept the independent snapshot/raw-data/offline-cache loading architecture from v3.10.3.
- Kept cache-busted script and stylesheet URLs.
- Added DOM id coverage and persistence/redaction tests.
- Added direct full-data rendering smoke coverage with the repository's current snapshot.

## Compatibility
- No change to Cloudflare Worker routes, Telegram webhook, GitHub data schema, GitHub Actions permissions, Secrets, or vehicle records.
- Worker deployment is not required for this dashboard-only repair.
