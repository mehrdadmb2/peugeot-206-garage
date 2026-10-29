# Changelog — Garage OS v3.7.0

## Maintenance timeline and per-item schedules

- The maintenance page now renders dynamic cards for recorded service events, repairs, washes, open issues and replacement parts, including items that are not yet configured in the static schedule list.
- Dynamic and scheduled cards display the latest service/replacement date, the odometer reading at that event, elapsed days, elapsed kilometers, actor, cost, event ID and saved notes when available.
- A replacement `part` or completed, keyed `repair`/`wash`/`service` event can satisfy the latest-maintenance lookup for its scheduled component. Open issues do not reset a schedule.
- Added `/maintnote` to save a persistent maintenance-plan note separately from historical event notes.
- Extended `/interval` to resolve part-catalog items and service-catalog entries, persist custom kilometer/day intervals, and optionally save a plan note.
- Due calculations and `/due` now include service-catalog keys and replacement components using configured overrides.
- The settings view consolidates service intervals and custom maintenance overrides.
- Updated README, installation notes and the visible website version.

## Backward compatibility and safety

- Existing events remain in the same monthly JSON logs.
- Existing custom values in `data/config.json` are preserved by `scripts/upgrade-config-v3.7.mjs`.
- The safe patch archive excludes `data/` so it cannot overwrite current logs/configuration when extracted.
- Interval values are reminders; verify them against the vehicle manual and the exact component/engine spec.
