# v3.12.0 — Persian month accounting & service reconciliation

- Monthly dashboard expenses, fuel, expense page, fuel charts, analytics monthly buckets, and journal month filter now use the Asia/Tehran Persian calendar rather than Gregorian `YYYY-MM` grouping.
- Fixed current-month Snapshot precomputation to use a Persian month key and the same expense-amount semantics as the browser (including resolved repair costs, excluding unpaid fines).
- Added explicit service reconciliation showing purchase odometer, current odometer, ownership distance, and recent replaced components.
- Clarified that positive service distances are kilometres remaining; only negative values are labelled as overdue.
- Unified scheduled-service event matching across `serviceKey`, `componentKey`, and `serviceCatalogKey`, and guarded missing odometer values from being interpreted as zero.
- Reduced diagnostic noise by treating intentional hedged-request aborts as expected cancellation; Snapshot staleness reasons are now included in diagnostics.
