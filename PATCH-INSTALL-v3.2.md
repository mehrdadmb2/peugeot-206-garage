# Install the Peugeot 206 Garage v3.2 safe patch

This patch intentionally omits `data/config.json`, `data/index.json`, `data/logs/`, and deletion archives so extraction does not overwrite current vehicle records. It updates the app, worker code, tests, and documentation. The Worker defaults to a purchase baseline of 428,000 km and estimate of 2,400 km if no `ownership` object exists.

## 1. Back up first

From the existing repository root, run:

```powershell
git status
git add -A
git commit -m "Backup before Garage OS 3.2"
```

If you do not want a backup commit, at minimum copy `data/` to a separate local folder. Never upload tokens or `.env` files.

## 2. Extract the safe patch

Extract `peugeot-206-garage-v3.2-safe-patch.zip` directly over the existing repository root (the folder containing `index.html`, `assets/`, and `worker/`). Choose overwrite/replace if Windows prompts. Do not extract to a new nested `project` subfolder. The patch intentionally does not contain `data/`; all current log JSON files should remain untouched.

## 3. Test Worker locally

```powershell
cd worker
npm install
npm test
npm run check
```

All tests should pass. If not, do not deploy; copy the complete error output and restore the backup if needed.

## 4. Publish the site and Worker

From `worker/`, deploy the Worker:

```powershell
npx wrangler deploy
```

Then return to the repository root, inspect the changed files, and push the site and code:

```powershell
cd ..
git status
git add index.html assets worker/src/index.js worker/package.json worker/tests README.md CHANGELOG-v3.2.md PATCH-INSTALL-v3.2.md botfather-commands.txt
git commit -m "Upgrade Peugeot 206 Garage to v3.2"
git push origin main
```

GitHub Pages publishes the UI after the push. Check the Actions/Pages build status. The Worker webhook path remains `/telegram`; do not reset the webhook unless needed, and retain `callback_query` in Telegram `allowed_updates` so inline event buttons can work.

## 5. Update BotFather commands

Open [@BotFather](https://t.me/BotFather), send `/setcommands`, select `@Peugeot206GarageBot`, and paste the entire `botfather-commands.txt` file. Registering menu commands only changes menu visibility, not Worker code; publish the Worker first.

## 6. Verify new commands

Message the bot:

- `/guide` — four-part full Persian manual.
- `/purchasekm` — see the saved purchase reading and discrepancy.
- `/fines` — totals for all, paid, and unpaid fines.
- `/operations all` — full active operation list in batches with IDs and management buttons.
- `/analysis week` — textual summary plus three PNG charts. Try `hour`, `day`, `week`, and `month` for different time windows.

## Purchase mileage reconciliation (important)

The current snapshot's newest logged reading is `431381`, and the configured purchase reading is `428000`. Their arithmetic difference is `3381 km`, not `2400 km`; the estimate differs by `981 km`. The system deliberately surfaces this difference instead of editing real odometer data. If the current dashboard display actually reads `430400`, you may record `/km 430400` after checking the car, but never enter that value just to fit the estimate. A lower new reading starts a correction checkpoint in lifetime driver-distance attribution.

The exact purchase date is unknown, so the baseline historical distance is included in total ownership mileage and assigned to `من` unless a recorded first reading names someone else; it is not assigned to a fabricated hour/day/week. For future odometer updates, a message such as `بابام کیلومتر 431500` attributes the interval since the prior valid reading to `بابام`.

## Telegram chart reporting and network dependency

`/analysis` generates 3 PNG charts using QuickChart and sends them as Telegram photos. It sends only aggregate numeric series and labels to the chart renderer; the event descriptions, notes, names and full event records are not sent. If the external chart provider is unavailable, the bot falls back to the textual summary.

## Files included in the safe patch

- `index.html`, `assets/css/style.css`, `assets/js/app.js` — UI, searchable help, ownership dashboard, fine cards.
- `worker/src/index.js` — guide, purchase baseline, fine totals, image report, correction-aware mileage math.
- `worker/package.json`, `worker/tests/worker.test.mjs` — test and package updates.
- `README.md`, `CHANGELOG-v3.2.md`, `PATCH-INSTALL-v3.2.md`, `botfather-commands.txt` — docs and BotFather command list.
