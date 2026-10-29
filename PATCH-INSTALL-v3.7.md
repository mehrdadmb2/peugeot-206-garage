# Installation — Peugeot 206 Garage OS v3.7.0

## Safe upgrade

1. Back up the repository and especially `data/`.
2. Extract `peugeot-206-garage-v3.7-safe-patch.zip` into the repository root. The ZIP contains the `index.html`, `assets/`, `worker/`, `scripts/` and documentation paths directly; it does not include `data/`.
3. From the repository root, run the optional config preparation script:

   ```powershell
   node .\scripts\upgrade-config-v3.7.mjs
   ```

   It creates `data/config.pre-v3.7.json` only if that file does not already exist, initializes `maintenanceOverrides` when missing, preserves existing keys and values, and advances `schemaVersion` to at least 6.

4. Test and deploy the Worker:

   ```powershell
   cd .\worker
   npm install
   npm test
   npm run check
   npx wrangler deploy
   ```

5. Return to the repository root, review `git status`, and commit/push the website and code updates so GitHub Pages refreshes.
6. If the Telegram bot uses command suggestions, send the contents of `botfather-commands.txt` through BotFather `/setcommands`. This affects the menu only; executable behavior comes from the deployed Worker.

## Per-item interval

```text
/interval spark_plugs 20000 730 | توضیح: نمونهٔ قابل تنظیم؛ با دفترچه بررسی شود
/interval engine_diagnostics 5000 30
/maintnote spark_plugs | شمع نصب‌شده از نوع ایریدیوم است؛ وضعیت جرقه در بازدید بعدی بررسی شود
```

General form:

`/interval <component-or-service-key-or-name> <interval-km> <interval-days> | توضیح: ...`

`/maintnote <component-or-service-key-or-name> | <persistent-plan-note>`

Use `/catalog`, `/services`, or `/config` to confirm keys/aliases. If a catalog name cannot be resolved, use its exact key. The per-plan note is distinct from the note attached to an individual event.

## Expected maintenance timeline behavior

- A configured periodic component shows its latest replacement/service/completed keyed repair event, date, odometer at service, elapsed days and kilometers, plus the remaining interval or due status.
- An event with no configured interval still appears as a dynamic history/lifetime card rather than disappearing.
- Replaced parts are included when looking for the latest event for that component, even when the event is stored with type `part`.
- A non-periodic part does not receive an invented replacement deadline; its age and history are shown instead.

## Troubleshooting

- If a new event does not appear, run `/latest` and confirm the event saved with a date and component/service key; then refresh GitHub Pages after the Worker has committed it.
- If a card is still not recognized as a schedule, set the custom interval through `/interval` using the catalog key and add a note through `/maintnote`.
- Do not replace `data/` with files from a full snapshot over a live repository unless you intend to replace those logs.
