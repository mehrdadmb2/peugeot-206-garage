# Loader Hotfix — Diagnosis and Fixes

## Symptom
GitHub Pages could remain behind the full-screen `#bootScreen` indefinitely.

## Root cause class
The dashboard previously waited on `fetch()` requests for `data/index.json`, `data/config.json`, and all indexed monthly logs without explicit timeouts. If the browser/network/CDN left a request pending, `loadDashboard()` never reached its `finally` block. Additionally, if the deferred JavaScript bundle failed before initialization, there was no independent mechanism to dismiss the splash screen.

## Fix
- Independent inline watchdog in `index.html` releases the overlay after 12 seconds even if `assets/js/app.js` never starts.
- The fallback manipulates inline `visibility`, `opacity`, and `pointer-events`, so it is not dependent on the external CSS successfully loading.
- JSON fetches now use `AbortController` and a 9-second timeout.
- Failed monthly log files are counted and the journal footer describes partial data instead of silently masking all failure.
- Explicit asset cache-busting makes the browser request the hotfix JS/CSS after deployment.

## Verification
- `node --check assets/js/app.js`
- `node --check worker/src/index.js`
- `npm test`
- `npm run check`
- Static regression tests confirm watchdog, request timeouts, cache busting and failure messaging.

This fix does not modify vehicle logs or current vehicle configuration. The site shows a recoverable warning after the failsafe timeout; it cannot guarantee data will load if GitHub Pages or the JSON files remain unreachable.
