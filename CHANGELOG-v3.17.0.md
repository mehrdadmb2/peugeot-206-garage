# Peugeot 206 Garage · v3.17.0

## Technical vehicle profile

- Added a dedicated **مشخصات فنی** page for the Peugeot 206 SD profile.
- Grouped engine/powertrain, fluid capacities, tank size, body dimensions, cabin/boot, wheels/tyres, reference performance and factory-consumption data into a responsive technical data sheet.
- The configured engine remains `TU3 (verify exact engine/trim from vehicle documents)`. TU3/V20 figures are explicitly marked as variant references until the car's exact engine code and trim are verified from its documents or engine plate.
- Added direct references to the Iran Khodro owner handbook and technical reference pages. Secondary/variant-dependent quantities are labelled as such rather than presented as guaranteed service-fill values.

## Fuel intelligence

- Added `assets/js/fuel-intelligence.mjs`, a shared estimator used by the dashboard and Cloudflare Worker.
- Full-to-full checkpoints remain the measured baseline. Partial refuels between two confirmed full checkpoints are included exactly once.
- When no two full checkpoints exist, consecutive partial refuels produce a lower-confidence estimate using the quantity added and the odometer distance. The cumulative model is distance-weighted and becomes more stable as more refuels and kilometres are recorded.
- Implausible intervals are filtered; obvious partial-fill outliers are trimmed only after enough samples exist.
- Trip cost uses the weighted average recorded price per litre from up to the five most recent priced refuels before the trip timestamp.
- Odometer confirmations now include estimated trip litres, estimated fuel cost, the model's L/100 km rate, confidence and sample basis when enough data exists.
- Journal cards show the same estimate, sample distance, number of refuels/intervals and reference unit price. Older odometer events can be estimated from fuel history when possible.
- Fuel analytics now display the partial-refuel model alongside the full-to-full measurement history.

## Data and compatibility

- Existing event records, odometer baselines, refuel history, private vehicle documents, Worker KV bindings and Cloudflare secrets are preserved.
- New estimate fields are additive event properties; no destructive data migration is required.
- `data/dashboard.json` is regenerated as a derived dashboard snapshot. Raw logs and configuration remain the source of truth.
- Worker version and package version are set to `3.17.0`.
- GitHub Actions syntax checks include the shared fuel model.

## Important estimation note

A series of partial refuels cannot reveal the exact tank level at the beginning and end of every period. The partial-refuel result is therefore an estimate, not a direct measurement. Its confidence is intentionally shown, and a confirmed full-to-full interval remains the preferred measurement. The cost is also approximate because it uses recent recorded fuel prices.
