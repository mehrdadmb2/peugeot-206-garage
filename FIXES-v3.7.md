# v3.7 maintenance-display fixes

- Service-catalog history was not always represented in the main maintenance grid when its key was missing from `serviceIntervals`. The renderer now combines configured schedules with custom overrides and also creates dynamic cards for eligible recorded history.
- Installed-part lifetime cards could be separated from service cards even if that part had a periodic interval. A replacement event is now used as the latest service event for the matching key.
- Unknown or non-periodic maintenance history now remains visible with elapsed time and odometer delta instead of being discarded simply because no fixed lifetime is configured.
- Added persistent per-item maintenance notes with `/maintnote` and custom km/day intervals via `/interval`.
- The due report now matches service-catalog identifiers and replacement part events.
- Added `scripts/upgrade-config-v3.7.mjs` for a safe config schema step; the script preserves existing config and does not overwrite an existing backup.

Validation performed locally:
- `npm test --prefix worker`: 27 passing tests.
- `npm run check --prefix worker`: passed.
- `node --check assets/js/app.js`: passed.
