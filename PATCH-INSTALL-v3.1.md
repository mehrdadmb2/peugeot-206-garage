# Peugeot 206 Garage OS v3.1.0 — safe patch

## What changed
- Switchable hourly, daily, weekly, and monthly analytics; period KPI cards and more breakdowns.
- Distance between odometer readings is credited to the actor on the later reading. When explicit `/trip` records exist between two odometer readings, those distances are credited to each trip's actor first and the residual to the actor on the later reading.
- `/operations`, `/operations all`, and `/operations today|week|month` send operation IDs in Telegram batches with inline detail/edit/delete actions.
- Telegram messages use named clickable navigation, monospace IDs/measurements, and quoted note/description lines.
- New BotFather commands list: `botfather-commands.txt`.

## Safe update steps
1. Keep a local copy of the repository or at minimum `data/index.json`, `data/config.json`, and `data/logs/`.
2. Extract this patch into the current v3 project root and allow the listed code/UI/doc files to overwrite existing versions. Do **not** replace your `data/` folder with the full-snapshot data.
3. Review `git diff` before pushing.
4. Run from `worker/`: `npm install`, `npm test`, `npm run check`, `npx wrangler deploy`.
5. Push the updated `index.html`, `assets/`, `worker/src/index.js`, tests and docs to GitHub for Pages to publish.
6. In BotFather, run `/setcommands` for `@Peugeot206GarageBot` and paste all lines in `botfather-commands.txt`.
7. Ensure the Telegram webhook `allowed_updates` includes both `message` and `callback_query`; the latter is required for inline management buttons. The webhook path remains `/telegram`.

## Driver-attribution rule
For a message such as `بابام کیلومتر 431381`, the vehicle log stores the reading as an odometer event by `بابام`. The dashboard computes the difference from the previous valid reading and credits that distance to the person on the new reading. This is an interval estimate, not GPS tracking.
