# Peugeot 206 Garage — v3.10.0

## Performance and data reliability
- Added a precomputed dashboard snapshot at `data/dashboard.json`.
- Added a Node.js builder that validates all indexed monthly logs, merges available month files, deduplicates event IDs and calculates odometer, month totals, maintenance due states and driver-distance entries.
- Added a GitHub Actions workflow that rebuilds and commits the snapshot when source data changes, plus a daily date-sensitive refresh.
- Updated the browser loader to prefer the snapshot and retain the legacy loader only as a first-install fallback when the snapshot is not yet published.
- Replaced misleading all-zero rendering on invalid/missing data with an explicit loading error.

## Worker and automation
- Improved the scheduled-reminder endpoint diagnostics: missing/short Worker secret returns `503 schedule_secret_not_configured`; a different GitHub Actions value returns `403 schedule_secret_mismatch`.
- Added a matching Actions-side minimum-length check before calling the Worker.
- Bumped Worker version to `3.10.0`.
- Updated stale smoke assertions and added snapshot regression tests.

## Dashboard UI
- Added a responsive clickable Telegram bot identity pill for `@Peugeot206GarageBot` in the hero section.
- Updated asset cache versions to `3.10.0-snapshot`.
