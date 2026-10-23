# Garage OS v3.1.0 — Time Intelligence & Driver Attribution

## Analytics
- Added interactive hourly, daily, weekly, and monthly time windows.
- Added window summaries for events, driven distance, fuel, paid expenses, unpaid fines, and service/repair.
- Added operation-category distribution and driving-distance-by-person breakdowns.
- Scoped expense-by-person and cost-per-kilometre to the selected window.
- Improved x-axis label density for hourly and daily plots.

## Attribution & Telegram
- Distance between two valid odometer readings is attributed to the person on the later reading, matching messages such as `بابام کیلومتر 431381`.
- Added `/operations`, `/operations all`, and `/operations today|week|month` to send operation IDs in manageable Telegram batches with inline detail/edit/delete buttons.
- Telegram navigation uses descriptive clickable link text; long raw URLs are not displayed as message text.
- Message formatting now emphasizes headings and IDs, uses monospace for identifiers and measurements, and blockquotes for descriptions/notes.
- Added `/operations` to the persistent keyboard and expanded export fields.

## Notes
- Driver attribution is a calculation from odometer intervals, not an independent GPS record. The person on the newer odometer reading is treated as the driver for the distance since the previous reading.
- Hourly analytics use the last 24 hours; daily the last 30 days; weekly the last 12 weeks with Saturday week boundaries; monthly the last 12 months.
- This release changes code/UI, not vehicle records. Use the safe patch to retain your current `data/logs/*.json`, `data/config.json`, and `data/index.json`.
