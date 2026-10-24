# Peugeot 206 Garage OS — v3.3.0

## Added
- Expanded part dictionary: 58 components, 15 categories and 13 services. Categories use distinct emoji/theme cards on the dashboard.
- Catalog metadata and component lifecycle: periodic consumables vs condition/age-tracked parts, replacement date, odometer-at-installation, brand/model/part number and specifications.
- Multi-operation workshop record `/repairjob`, grouping a diagnostic visit into individual issue, service, component and labor records. Unknown price or brand remains unknown rather than being guessed.
- Fine record details: payment status, payment date, amount actually paid, reference, elapsed days and reminder deadline; `/fines` aggregates all, paid and unpaid amounts. Deadline output is advisory and not an official assessment of a surcharge.
- Commands `/catalog`, `/components`, `/services`, `/repairjob`, and `/fineinfo`; updated Persian guide and BotFather commands.
- More robust config migration script that preserves vehicle settings, custom interval values and people and creates a pre-upgrade backup.

## Important
- The workshop example is provided as a prompt file only; it has **not** been inserted into the actual vehicle logs.
- The safe patch intentionally excludes `data/config.json`, `data/index.json` and `data/logs/`. Run `node scripts/merge-config-v3.3.mjs` after extracting it.
- Service intervals are configurable reminders. Verify the exact engine/trim, manufacturer manual and local operating conditions.
