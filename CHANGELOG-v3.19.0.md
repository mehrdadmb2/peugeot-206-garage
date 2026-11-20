# Changelog — Peugeot 206 Garage v3.19.0

## Fuel intelligence
- Consumption is now measured only between two explicit full-tank checkpoints with valid odometer readings.
- Every intermediate top-up is counted exactly once in the enclosing full-to-full interval.
- Partial-to-partial records no longer generate consumption, fuel/km, or trip-fuel estimates.
- Close refuelling pairs are diagnostics only; they are never interpreted as an empty tank.
- The dashboard explains missing measurement coverage and keeps recorded fuel spend/weighted unit price separate from measured consumption.

## Road Police fine SMS
- Added direct Telegram ingestion for the two supplied official SMS shapes: ticket/serial format and camera-speed format.
- Extracts ticket number, serial, payment ID, Jalali/Gregorian date, time, place/axis, ticket type, vehicle description, plate, violation, speed limit, recorded speed, camera code, single-ticket amount and reported aggregate unpaid balance.
- Stores the original SMS verbatim in the event explanation (`originalSms` and `note`).
- Keeps the amount of the current ticket separate from the aggregate unpaid balance in the SMS.
- Adds semantic duplicate detection using ticket identifiers, or date/time + violation + amount + a matching identifying detail.
- Exposes fine metadata in event details, journal search, and CSV exports.

## Snapshot & reliability
- Snapshot calculator version: 5.
- Future-dated events remain in the raw ledger but are excluded from as-of current-month, odometer, maintenance-due and cost model calculations.
- Updated version/cache-busting metadata and regression coverage.

## Validation
- `npm test`: 93 tests passed.
- `npm run check`: passed.
- `node scripts/build-dashboard.mjs`: passed; 62 events, 2 months, current odometer 432261 km, 158.3 KiB output.
- `node worker/test/smoke.mjs`: passed.
