# 206 Garage OS v3.9.1 — GitHub Pages Loader Hotfix

- Added an independent in-page splash failsafe. The loading overlay is released after 12 seconds even when the dashboard script fails or never finishes.
- Added a small glassmorphism error banner with a reload action so a failed data request cannot permanently cover the site.
- Added 9-second timeouts and `AbortController` handling for dashboard JSON requests.
- Monthly logs that cannot load are reported in the journal footer rather than silently failing or keeping the splash screen active.
- Added cache-busting query versions to CSS and JavaScript assets to avoid stale GitHub Pages assets.
- Added regression tests for the splash failsafe, resource timeouts, partial-load messaging, and responsive notice.
- No car history or `data/` files were changed by this hotfix.
