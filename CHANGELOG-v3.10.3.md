# Peugeot 206 Garage OS — v3.10.3

## Resilient dashboard loading

- Added `assets/js/data-loader.js` as a dedicated browser-side data-loading layer.
- The dashboard snapshot is validated for schema, event count, duplicate/empty IDs, service intervals, part catalog, service catalog, computed maintenance entries, distance entries, source freshness, and Tehran-local generation date.
- HTTP 403/404, network errors, response-body stalls, empty responses, malformed JSON, invalid snapshots, and stale snapshots trigger automatic raw-data fallback instead of stopping the dashboard.
- Raw data is attempted through GitHub Pages, GitHub Raw, and jsDelivr with staggered requests, `AbortController`, a full-response timeout, and `cache: no-store`.
- When the snapshot is unusable, the browser loads `data/index.json`, `data/config.json`, and monthly logs, then runs the existing dashboard calculations locally. No GitHub Actions run is required to render the dashboard.
- Missing monthly logs produce a visible partial-data state. If no source is trustworthy, the dashboard reports an error instead of showing false zero values.
- The last valid dataset is cached locally in the browser (data only; no tokens/secrets). If all online sources are unavailable on a later visit, the dashboard recalculates from this cache and marks itself as offline/stale.
- The splash screen now has a soft fallback notice and a hard-stop state; the connection badge cannot remain in an endless "connecting" state if the app script fails to start.
- The Telegram bot tag and existing dashboard visual system are retained.
- Worker logic and secrets are unchanged. The static dashboard does not call the Worker; the Worker does not require the dashboard to process Telegram updates.

## Files changed

- `index.html`
- `assets/css/style.css`
- `assets/js/app.js`
- `assets/js/data-loader.js` (new)
- `worker/tests/dashboard-loader.test.mjs`
- `README.md`

## Data safety

No files under `data/` are replaced by the replacement package. The existing `config.json`, `index.json`, monthly logs, deleted-event archive, and reminder state remain intact.
