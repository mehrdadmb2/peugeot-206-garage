# Peugeot 206 Garage OS — v3.4.0

## Fixed
- Telegram sends an immediate receipt before the first GitHub API operation. Large multi-record workshop visits continue through `ExecutionContext.waitUntil()` and send a final status separately.
- Telegram `update_id` values for state-changing text messages are recorded in `data/index.json`; webhook delivery retries do not write the same event twice.
- New events store a SHA-256 fingerprint of their source message. An exact resend is held for explicit confirmation rather than silently written again.
- Legacy multi-record repair jobs are compared using date, actor, odometer, component/service keys, specs, price and row count before a repeated job is accepted.
- `/duplicates` lists suspicious matching events; it does not delete or merge anything unless the user chooses the inline action.
- Merging fills missing fields in the keeper and archives the second event. Archiving remains reversible through `/restore`.
- Replacement events of type `part` now act as the latest maintenance anchor by `serviceKey` or `componentKey`, so spark plugs and other scheduled consumables appear in the maintenance calendar and backend due-report.

## Validation
- Worker tests cover quick acknowledgement, exact duplicate prevention/decline flow, repeated multi-part `/repairjob`, duplicate-review buttons and scheduled-part due calculations.
- Run `npm test`, `npm run check`, and `node --check assets/js/app.js` before deployment.
