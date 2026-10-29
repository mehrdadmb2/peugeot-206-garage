# Peugeot 206 Garage — v3.2.0

## Ownership / odometer
- Added a purchase-odometer baseline; ownership distance is now calculated only from actual odometer subtraction, with no guessed distance estimate.
- The baseline is attributed to the default actor “من” unless explicit older records name another driver.
- Ownership distance is calculated by subtracting the purchase odometer from the latest valid reading. No separate estimated-distance field is used.
- A later lower odometer value is treated as a correction checkpoint for distance-attribution totals; confirm the dashboard's real reading before recording a correction.
- Historical baseline distance with unknown purchase date is included in lifetime ownership totals but excluded from hourly/daily/weekly/monthly time buckets.

## Dashboard
- Ownership baseline KPIs and per-driver distance breakdown.
- Removed the obsolete estimated-distance comparison; only actual odometer subtraction is used.
- Fine total/paid/unpaid rollup on Traffic page.
- Searchable command encyclopedia in the settings page.
- Version footer updated to v3.2.0.

## Telegram Worker
- Added `/purchasekm`, `/guide`, and `/analysis hour|day|week|month`.
- `/analysis` sends a text report followed by three chart images (spending, refueling liters, distance); chart captions stay compact to avoid Telegram's caption length limit.
- `/fines` reports count and totals for all/paid/unpaid fines.
- Command output uses HTML with bold headings, monospace identifiers/values, blockquotes for notes, and named clickable links to the dashboard and bot.
- Added correction-checkpoint handling to both the worker and dashboard mileage breakdown.

## Validation
- Node syntax checks passed for Worker and dashboard JavaScript.
- 12 Worker tests passed, including attribution, fine totals, interactive operation listings, and three-image analysis delivery using mocked upstream services.
