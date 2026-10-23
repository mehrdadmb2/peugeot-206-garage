# Garage OS v3.0.0 — Release notes

## Telegram
- Every event carries `actor` (default `من`) and a separate `note` field.
- Common family names can be used inline; custom names are managed with `/people add NAME` and `/people remove NAME`.
- Event messages have a formatted HTML layout, inline detail/edit/note/actor/delete actions, and reciprocal dashboard/bot links.
- Added `/detail`, `/edit`, `/annotate`, `/actor`, `/delete`, `/restore`, `/people`, `/export all`, and `/backup`.
- Deletions are archived before removal; restores retain the original event ID. Edits keep a bounded audit history.

## Dashboard
- Added person filtering and person-level cost breakdown.
- Event rows show actor and note and link back to the corresponding event in Telegram.
- Added cost-per-kilometre metric, reciprocal site/bot/repository links and refreshed v3 settings instructions.
- CSV/JSON exports include attribution and the separate note.

## Deploy notes
- The included `data/index.json` and `data/logs/2026-10.json` preserve the six existing October 2026 records captured from the repository at build time. Keep newer live records if any were added after that snapshot.
- Static Pages files update when committed to the GitHub Pages branch. The Worker update separately requires `cd worker`, `npm test`, `npm run check`, then `npx wrangler deploy`.
- No API token is shipped to the public site; event mutation APIs still require `API_ACCESS_TOKEN`, and Telegram actions still require the allowlisted user ID.
