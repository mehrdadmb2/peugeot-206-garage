# 🚘 206 Garage — Peugeot 206 SD Vehicle OS

[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-dashboard-40e5f4?style=for-the-badge&logo=github)](https://mehrdadmb2.github.io/peugeot-206-garage/)
[![Cloudflare Workers](https://img.shields.io/badge/API-Cloudflare%20Workers-f38020?style=for-the-badge&logo=cloudflare)](https://peugeot-206-garage-bot.game-developer-mb.workers.dev/health)
[![Telegram Bot](https://img.shields.io/badge/Telegram-%40Peugeot206GarageBot-26a5e4?style=for-the-badge&logo=telegram)](https://t.me/Peugeot206GarageBot)
[![Request Driven](https://img.shields.io/badge/Runtime-request--driven-16a34a?style=for-the-badge)](#request-driven-design)

**A personal vehicle journal for the white 2008 Peugeot 206 SD sedan.** Record odometer readings, trips, fuel, maintenance, parts, repairs, fines, payments and expenses through Telegram or the authenticated API. GitHub stores the event log; GitHub Pages renders the dashboard.

> Private-use project. Do not store personal routes, home addresses, plate numbers, or secrets in a public repository.

## Table of contents

- [Architecture](#architecture)
- [Features](#features)
- [Repository layout](#repository-layout)
- [Deploy GitHub Pages](#deploy-github-pages)
- [Deploy the Worker](#deploy-the-worker)
- [Connect Telegram webhook without any script file](#connect-telegram-webhook-without-any-script-file)
- [Bot commands](#bot-commands)
- [API](#api)
- [Data model and units](#data-model-and-units)
- [Troubleshooting](#troubleshooting)
- [Security](#security)

## Architecture

```text
Telegram / authorized HTTP client
                 |
                 v
       Cloudflare Worker
       parse -> validate -> calculate
                 |
                 v
       GitHub Contents API
       data/logs/YYYY-MM.json
       data/index.json
                 |
                 v
       GitHub Pages dashboard
```

## Features

- Responsive Persian-first dashboard with separate views for overview, maintenance, fuel, analytics, expenses, fines/issues, journal, and API/help.
- Request-driven Worker: no Cron trigger is required for event recording, queries, or on-demand reports.
- GitHub-backed event persistence; a successful event response is returned only after the write operations complete.
- Persian and English digits; common Persian/English command aliases.
- Odometer, trip distance, fuel liters and full-tank flag, cost, service intervals, repairs, fines and payments, washes, notes and CSV export.
- Jalali-friendly timestamps and `Asia/Tehran` handling.
- Dashboard refresh, search/filter, charts, and CSV/JSON downloads.
- Custom sedan illustration and favicon for the 206 SD profile.

## Repository layout

| Path | Purpose |
|---|---|
| `index.html` | GitHub Pages application shell |
| `assets/css/style.css` | Responsive styling and animation |
| `assets/js/app.js` | Dashboard rendering, charts, filters, exports |
| `assets/img/206-white.svg` | Local 206 SD illustration |
| `assets/img/favicon.svg` | Browser tab icon |
| `site.webmanifest` | Installable-site metadata |
| `data/config.json` | Vehicle profile and editable service intervals |
| `data/index.json` | List of months available to the dashboard |
| `data/logs/YYYY-MM.json` | Monthly event log; created by the Worker on first event |
| `worker/src/index.js` | Worker, Telegram handler, GitHub persistence, API |
| `worker/wrangler.toml` | Worker name and repository configuration |
| `worker/package.json` | Test and Wrangler scripts |
| `worker/tests/worker.test.mjs` | Local route/security tests |

## Deploy GitHub Pages

1. Push the repository contents to the `main` branch. `index.html` must be at the repository root.
2. Open **Settings → Pages**.
3. Select **Deploy from a branch**, branch `main`, folder `/(root)`, then Save.
4. Wait for the Pages deployment to finish.
5. Open <https://mehrdadmb2.github.io/peugeot-206-garage/> and hard-refresh with `Ctrl+F5`.
6. Verify that `data/index.json`, `data/config.json`, `assets/img/206-white.svg`, `assets/img/favicon.svg`, `assets/css/style.css`, and `assets/js/app.js` all return HTTP 200 when opened under the Pages URL.

The dashboard reads static JSON files from the Pages origin. It does not contain GitHub or Telegram tokens. The initial `data/index.json` intentionally contains an empty month list until the first record is committed.

## Deploy the Worker

Requirements: supported Node.js LTS, npm, a Cloudflare account, and Wrangler authentication.

Run these commands in **PowerShell or CMD** from the repository directory:

```powershell
cd .\worker
npm install
npm test
npx wrangler login
```

Configure secrets interactively:

```powershell
npx wrangler secret put GITHUB_TOKEN
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
npx wrangler secret put ALLOWED_TELEGRAM_USER_ID
npx wrangler secret put API_ACCESS_TOKEN
```

Secret meanings:

- `GITHUB_TOKEN`: fine-grained GitHub token restricted to this repository, with **Contents: Read and write**.
- `TELEGRAM_BOT_TOKEN`: token from BotFather.
- `TELEGRAM_WEBHOOK_SECRET`: random 32-byte hex value used to validate Telegram's webhook header.
- `ALLOWED_TELEGRAM_USER_ID`: your numeric Telegram user ID, not your username and not the bot ID.
- `API_ACCESS_TOKEN`: a different strong token for authorized external API requests.

To create a random secret in PowerShell:

```powershell
[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).ToLower()
```

Run it twice for two different secrets. Store the first as `TELEGRAM_WEBHOOK_SECRET`, the second as `API_ACCESS_TOKEN`.

Deploy:

```powershell
npx wrangler deploy
```

Check the Worker:

```powershell
Invoke-RestMethod "https://peugeot-206-garage-bot.game-developer-mb.workers.dev/health" | ConvertTo-Json -Depth 6
```

A healthy response should report `ok: true`, `mode: request-driven`, and configured booleans. These booleans indicate whether secret values are present, not whether credentials are valid against external services.

## Connect Telegram webhook without any script file

**Important:** use a plain URL. Do not include Markdown link syntax such as `[https://...](https://...)` in a variable. That syntax is documentation formatting, not part of the URL, and can cause Telegram to reject the webhook with a DNS resolution error.

Open PowerShell and paste the complete block below. It does not create or require any file. Enter the real BotFather token and the exact `TELEGRAM_WEBHOOK_SECRET` value saved in Cloudflare when prompted.

```powershell
$tokenSecure = Read-Host "BotFather bot token" -AsSecureString
$BOT_TOKEN = [System.Net.NetworkCredential]::new("", $tokenSecure).Password
$secretSecure = Read-Host "Exact TELEGRAM_WEBHOOK_SECRET from Cloudflare" -AsSecureString
$WEBHOOK_SECRET = [System.Net.NetworkCredential]::new("", $secretSecure).Password
$WORKER_URL = "https://peugeot-206-garage-bot.game-developer-mb.workers.dev/telegram"

if ($WEBHOOK_SECRET -notmatch '^[A-Za-z0-9_-]{1,256}$') { throw "Invalid Telegram webhook secret format." }

# Check that the Worker host resolves from this computer before asking Telegram to register it.
$workerHost = ([uri]$WORKER_URL).DnsSafeHost
Resolve-DnsName $workerHost -ErrorAction Stop | Select-Object Name, Type, IPAddress

$payload = @{
  url = $WORKER_URL
  secret_token = $WEBHOOK_SECRET
  allowed_updates = @("message", "callback_query")
  drop_pending_updates = $false
} | ConvertTo-Json -Depth 5

$result = Invoke-RestMethod -Method Post `
  -Uri ("https://api.telegram.org/bot{0}/setWebhook" -f $BOT_TOKEN) `
  -ContentType "application/json; charset=utf-8" `
  -Body $payload
$result | ConvertTo-Json -Depth 5
```

Expected result: `ok: true`, `result: true`. If `Resolve-DnsName` fails, stop there and check the Worker hostname, Cloudflare deployment, DNS/network/VPN settings. If the local DNS test passes but Telegram reports `Failed to resolve host`, verify the URL is exactly the plain HTTPS URL above and that the deployed hostname is active and publicly resolvable.

Verify the webhook in the same PowerShell window:

```powershell
$info = Invoke-RestMethod -Method Get -Uri ("https://api.telegram.org/bot{0}/getWebhookInfo" -f $BOT_TOKEN)
$info.result | Select-Object url, pending_update_count, last_error_date, last_error_message, allowed_updates | Format-List
```

Then message the bot with `/start`. If it does not reply, open **Cloudflare Dashboard → Workers & Pages → `peugeot-206-garage-bot` → Logs** and inspect the request at the time you sent the message.

### Set the Telegram command menu without a file

This is optional; the command menu does not implement bot logic by itself. Run in the same PowerShell session:

```powershell
$commands = @(
  @{command="start";description="شروع و معرفی ربات"},
  @{command="help";description="راهنمای فرمان‌ها"},
  @{command="id";description="شناسه عددی کاربر"},
  @{command="km";description="ثبت کیلومترشمار"},
  @{command="trip";description="ثبت مسافت"},
  @{command="fuel";description="ثبت سوخت‌گیری"},
  @{command="service";description="ثبت سرویس"},
  @{command="part";description="ثبت قطعه مصرفی"},
  @{command="interval";description="تنظیم فاصله سرویس"},
  @{command="due";description="موعد سرویس‌ها"},
  @{command="summary";description="گزارش هزینه و مسافت"},
  @{command="fuelstats";description="آمار سوخت"},
  @{command="fine";description="ثبت جریمه"},
  @{command="fines";description="فهرست جریمه‌ها"},
  @{command="paid";description="ثبت پرداخت جریمه"},
  @{command="wash";description="ثبت کارواش"},
  @{command="repair";description="ثبت تعمیر"},
  @{command="expense";description="ثبت هزینه متفرقه"},
  @{command="note";description="یادداشت خودرو"},
  @{command="latest";description="آخرین رویدادها"},
  @{command="export";description="خروجی CSV"}
)
$menu = @{commands=$commands} | ConvertTo-Json -Depth 5
Invoke-RestMethod -Method Post `
  -Uri ("https://api.telegram.org/bot{0}/setMyCommands" -f $BOT_TOKEN) `
  -ContentType "application/json; charset=utf-8" -Body $menu | ConvertTo-Json -Depth 5
```

## Bot commands

| Command | Example | Purpose |
|---|---|---|
| `/start`, `/help` | `/help` | Introduction and help |
| `/id` | `/id` | Show numeric user/chat IDs |
| `/km` | `/km 156321` | Record current odometer |
| `/trip` | `/trip 85` | Record distance driven |
| `/fuel` | `/fuel 20l cost=700000 toman km=156321 full` | Record refueling |
| `/service` | `/service oil cost=900000 toman km=156321` | Record maintenance |
| `/part` | `/part air_filter km=156321` | Record a component |
| `/interval` | `/interval engine_oil 4000 180` | Set km/day interval |
| `/due` | `/due` | Calculate due maintenance now |
| `/summary` | `/summary week` | Summary report |
| `/fuelstats` | `/fuelstats` | Fuel statistics |
| `/fine` | `/fine 500000 toman speeding` | Record a fine |
| `/fines` | `/fines` | List fines |
| `/paid` | `/paid EVENT_ID` | Mark a fine as paid |
| `/wash` | `/wash 180000 toman` | Record car wash |
| `/repair` | `/repair suspension cost=450000 toman` | Resolve an open issue / record repair |
| `/expense` | `/expense 250000 toman parking` | Other expense |
| `/note` | `/note inspect tires next visit` | Save a note |
| `/latest` | `/latest` | Recent events |
| `/export` | `/export 2026-10` | Export a month as CSV |
| `/config` | `/config` | Vehicle/service configuration |

The bot supports common aliases and Persian digits, but natural-language parsing is best-effort. For important records, use an explicit command and include amount, currency, and odometer where applicable. Do not assume an ambiguous sentence was recorded unless the bot confirms it.

## API

All `/api/v1/*` endpoints require `Authorization: Bearer YOUR_API_ACCESS_TOKEN`. The health route is public.

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/health` | Health and configuration presence |
| `GET` | `/` | API guide |
| `POST` | `/telegram` | Telegram webhook |
| `POST` | `/api/v1/record` | Register natural-language text or typed event |
| `POST` | `/api/v1/command` | Command alias |
| `GET` | `/api/v1/overview` | Aggregated statistics |
| `GET` | `/api/v1/events?month=YYYY-MM&type=fuel&limit=100` | Read filtered events |
| `GET` | `/api/v1/due` | Maintenance deadlines |
| `GET` | `/api/v1/config` | Vehicle and interval configuration |
| `GET` | `/api/v1/export?month=2026-10` | CSV export |

Example PowerShell API request (replace the token in memory; never commit it):

```powershell
$apiSecure = Read-Host "API_ACCESS_TOKEN" -AsSecureString
$API_TOKEN = [System.Net.NetworkCredential]::new("", $apiSecure).Password
$body = @{ text = "20l fuel, cost 700000 toman, km 156321 full" } | ConvertTo-Json
Invoke-RestMethod -Method Post `
  -Uri "https://peugeot-206-garage-bot.game-developer-mb.workers.dev/api/v1/record" `
  -Headers @{ Authorization = "Bearer $API_TOKEN" } `
  -ContentType "application/json" -Body $body | ConvertTo-Json -Depth 6
```

## Data model and units

- The vehicle profile is **Peugeot 206 SD, white, model year 1387 (2008/09)**. Verify exact engine and trim from the vehicle documents; do not infer it from body style alone.
- Time zone: `Asia/Tehran`.
- Costs are stored as integer Iranian **rials** (`costRial`) and displayed as **tomans** by dividing by ten.
- The `occurredAt` timestamp represents event time; `createdAt` represents record creation time.
- Monthly log files are selected by event date, and `data/index.json` lists the available months.
- Fuel consumption estimates need enough consistent odometer/full-tank entries; partial data may not produce a reliable L/100 km result.
- Service intervals are editable reminders, not manufacturer guarantees. Verify timing belt, brakes, fluids, and oil intervals against the exact engine, maintenance history, and a qualified mechanic.

## Request-driven design

There is no scheduled Worker handler in this project. Incoming Telegram updates and API calls trigger work. Reports such as `/due` are calculated when requested. Automatic messages at a fixed time require a scheduler or another service to initiate a request; they are intentionally not part of this request-only configuration.

## Troubleshooting

| Symptom | Check |
|---|---|
| Telegram says `Failed to resolve host` | URL must be plain text, not Markdown; verify Worker hostname and public DNS. |
| `/health` fails | Worker may not be deployed at that hostname; check Wrangler output and Cloudflare dashboard. |
| Webhook returns 403 | `TELEGRAM_WEBHOOK_SECRET` must match the value supplied to `setWebhook`. |
| Bot says access denied | `ALLOWED_TELEGRAM_USER_ID` must equal your numeric Telegram user ID. |
| Bot does not reply | Inspect `getWebhookInfo`, Cloudflare Worker logs, token, and allowed user ID. |
| `configured.github` is false | Check `GITHUB_TOKEN`, `GITHUB_OWNER`, and `GITHUB_REPO`. |
| GitHub read/write fails | Check token expiry, repository scope, `Contents: Read and write`, branch `main`, and GitHub API errors. |
| Dashboard says data failed | Check Pages deployment and direct HTTP access to `data/index.json` and `data/config.json`. |
| Car image or icon missing | Verify `assets/img/206-white.svg` and `assets/img/favicon.svg` return HTTP 200. |
| Changes do not appear | Wait for Pages deployment, then press `Ctrl+F5`; the dashboard is a static site. |

## Tests

From the `worker` directory:

```powershell
npm test
npm run check
```

These local tests verify key routing and authorization behavior with mocked requests. They do not prove that deployed Cloudflare secrets, Telegram credentials, or GitHub permissions are valid. Perform one real `/km` record and confirm a new commit in `data/logs/YYYY-MM.json` and `data/index.json` before relying on the system.

## Security

- Restrict the GitHub fine-grained token to this repository and only the permissions needed.
- Keep all secrets in Cloudflare Worker secrets or local shell memory, never in GitHub files or the public dashboard.
- The Telegram bot is restricted by numeric user ID; configure the correct ID.
- A public repository exposes all committed vehicle events. Use a private repository if the records are personal, and confirm that your GitHub Pages setup supports your repository visibility and plan.
- GitHub Contents API writes may conflict under simultaneous requests or hit rate limits. If a write fails, verify the repository before retrying to avoid duplicate records.

## Links

- Repository: <https://github.com/mehrdadmb2/peugeot-206-garage>
- Dashboard: <https://mehrdadmb2.github.io/peugeot-206-garage/>
- Worker health: <https://peugeot-206-garage-bot.game-developer-mb.workers.dev/health>
- Telegram: <https://t.me/Peugeot206GarageBot>
- Telegram Bot API: <https://core.telegram.org/bots/api>
- Cloudflare Workers secrets: <https://developers.cloudflare.com/workers/configuration/secrets/>
- GitHub Contents API: <https://docs.github.com/en/rest/repos/contents>
