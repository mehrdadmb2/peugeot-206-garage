# Peugeot 206 Garage OS v3.5.0

## Breakdown and odometer context
- Expanded natural-language recognition for vehicle breakdowns and no-start/no-crank symptoms.
- When a supported event (issue, repair, service, part, fuel, wash, expense or fine) lacks an explicit odometer, the Worker uses the latest known valid odometer when available and marks that it was auto-inherited.
- Telegram responds quickly to a state-changing webhook, then sends a separate final processing result through the Worker execution context.

## Fuel economy
- `/fuelstats` reports per-segment full-tank-to-full-tank fuel economy, segment km, total liters and cost when available.
- Partial fill events between full-tank checkpoints are counted toward liters for that segment.
- Dashboard Fuel page includes measured consumption history and weighted L/100 km only where the readings support it.

## Driver mileage visualization
- The Analytics page adds a stacked timeline for distance by actor across selected period buckets.
- Distance between consecutive reliable odometer readings is attributed to the actor of the later reading. This is an estimate, not GPS. Use explicit `/trip` records for better attribution when multiple drivers share an interval.

## Test status
- 21 Worker tests pass in the local test suite.
- `npm run check` and `node --check ../assets/js/app.js` pass.
