# 🚘 206 Garage — Peugeot 206 Vehicle OS

**Your personal vehicle log, maintenance tracker, fuel monitor, and expense dashboard.**

206 Garage is a Telegram-powered vehicle management system built for a Peugeot 206 Type 2 (2008). It combines a Telegram bot, Cloudflare Workers, GitHub as the event store, and GitHub Pages as a visual dashboard.

Record mileage, fuel, maintenance, repairs, fines, and expenses through Telegram. Every successful write is committed to GitHub, and stored events are used to generate reports and calculate maintenance deadlines.

## ✨ Features

- **Instant event persistence:** Write vehicle events to GitHub using the Contents API. A successful registration response is sent only after the relevant GitHub writes complete.
- **Request-driven architecture:** The Worker runs when it receives an HTTP request or Telegram webhook. No Cron trigger is required for normal logging or on-demand reports.
- **Persian and English input:** Supports Persian and English digits, common vehicle terminology, amounts, and natural-language descriptions.
- **Odometer tracking:** Record current mileage and trip distances, with estimates based on available readings.
- **Fuel tracking:** Log liters, price, odometer, and full-tank refueling events. Estimate consumption when sufficient full-tank records exist.
- **Maintenance management:** Record oil changes, filters, timing-belt work, inspections, and other service events. Configure distance- and time-based intervals.
- **Repairs and issues:** Register vehicle problems and record their resolution.
- **Fines and expenses:** Track unpaid fines, record payments, and categorize vehicle spending.
- **Reports and exports:** Request daily, weekly, or monthly summaries, fuel statistics, upcoming maintenance, recent events, and CSV exports.
- **Responsive dashboard:** Explore event history, costs, fuel trends, maintenance status, and statistics through GitHub Pages.
- **Authenticated external API:** Allow authorized applications to submit records or request reports without embedding credentials in the public website.

## 🧱 Architecture

```text
Telegram Bot / External Client
             |
             v
Cloudflare Worker
  - Request validation
  - Command parsing
  - Persian digit normalization
  - Vehicle calculations
  - Report generation
             |
             v
GitHub Contents API
  - data/logs/YYYY-MM.json
  - data/index.json
  - data/config.json
             |
             v
GitHub Pages Dashboard
  - KPIs and charts
  - Maintenance deadlines
  - Fuel and expense reports
  - Journal and exports
```

### Storage model

| Path | Purpose |
|---|---|
| `data/index.json` | Month index and last-update metadata |
| `data/logs/YYYY-MM.json` | Vehicle events organized by event month |
| `data/config.json` | Vehicle details and configurable service intervals |
| `worker/src/index.js` | Worker routes, Telegram processing, persistence, and reports |
| `worker/wrangler.toml` | Worker deployment configuration |
| `worker/scripts/set-webhook.mjs` | Telegram webhook and initial command-menu setup |
| `worker/tests/worker.test.mjs` | Automated Worker tests |

Event files use JSON so that the records remain structured and can be processed by the Worker and dashboard.

## 🚀 Deployment

### Requirements

- A GitHub repository with the project files on the `main` branch.
- Node.js LTS and npm.
- A Cloudflare account with permission to deploy Workers.
- A Telegram bot token obtained from [@BotFather](https://t.me/BotFather).
- A GitHub fine-grained token with `Contents: Read and write` access to this repository.

### 1. Install dependencies

Open Windows Command Prompt and navigate to the Worker directory:

```cmd
cd /d "%USERPROFILE%\Documents\peugeot-206-garage\worker"
npm install
npm test
npx wrangler login
```

Adjust the directory path if the repository is stored elsewhere.

### 2. Configure Worker secrets

Register the following secrets using Wrangler:

```cmd
npx wrangler secret put GITHUB_TOKEN
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
npx wrangler secret put ALLOWED_TELEGRAM_USER_ID
npx wrangler secret put API_ACCESS_TOKEN
```

| Secret | Description |
|---|---|
| `GITHUB_TOKEN` | GitHub token with permission to read and write repository contents |
| `TELEGRAM_BOT_TOKEN` | Private token issued by BotFather |
| `TELEGRAM_WEBHOOK_SECRET` | Random secret used to validate Telegram webhook requests |
| `ALLOWED_TELEGRAM_USER_ID` | Numeric Telegram user ID permitted to operate the bot |
| `API_ACCESS_TOKEN` | Separate strong token for external API clients |

Never commit these values to GitHub. Do not include them in `index.html`, dashboard JavaScript, screenshots, or public documentation.

### 3. Deploy the Worker

```cmd
npx wrangler deploy
```

The deployment URL is shown by Wrangler. The configured Worker name is `peugeot-206-garage-bot`.

### 4. Configure the Telegram webhook

In the same Command Prompt session, from the Worker directory, set the environment variables:

```cmd
set "BOT_TOKEN=YOUR_TELEGRAM_BOT_TOKEN"
set "WORKER_URL=https://peugeot-206-garage-bot.game-developer-mb.workers.dev"
set "WEBHOOK_SECRET=YOUR_TELEGRAM_WEBHOOK_SECRET"
node scripts\set-webhook.mjs
```

Replace the placeholders with actual values. `WEBHOOK_SECRET` must match the secret saved as `TELEGRAM_WEBHOOK_SECRET` in Cloudflare.

A successful script response confirms that Telegram accepted the webhook configuration and command-menu setup.

### 5. Publish GitHub Pages

In the repository, open **Settings → Pages**.

Choose `Deploy from a branch`, then select:

- Branch: `main`
- Folder: `/(root)`

Save the configuration. The entry point `index.html` must be located at the repository root.

The expected project URL is:

`https://mehrdadmb2.github.io/peugeot-206-garage/`

## 💬 Telegram commands

| Command | Description |
|---|---|
| `/start` | Introduction and quick help |
| `/help` | Command reference and examples |
| `/id` | Show numeric Telegram user and chat IDs |
| `/km 156000` | Record current odometer |
| `/trip 85` | Record a trip distance |
| `/fuel 20l cost=700000 toman km=156200 full` | Log a full-tank refueling event |
| `/service oil cost=900000 toman km=156000` | Record a service |
| `/part air_filter km=156000` | Record a component |
| `/interval engine_oil 4000 180` | Configure distance and time intervals |
| `/due` | Calculate upcoming maintenance |
| `/summary today` | Daily report |
| `/summary week` | Weekly report |
| `/summary month` | Monthly report |
| `/config` | View vehicle and maintenance settings |
| `/fuelstats` | Fuel usage and consumption report |
| `/fine 500000 toman speeding` | Register a fine |
| `/fines` | List fines and payment status |
| `/paid a1b2c3d4` | Mark a fine as paid using its event ID |
| `/wash 180000 toman` | Record a car wash |
| `/repair suspension cost=450000 toman` | Resolve the most recent open issue or record a repair |
| `/expense 250000 toman parking` | Record an additional expense |
| `/note inspect tires next visit` | Save a vehicle note |
| `/latest` | Show recent events |
| `/export` | Export the current month's events as CSV |
| `/export 2026-10` | Export a specific month |

The bot also accepts supported natural-language entries. Examples:

```text
امروز با کیلومتر ۱۵۶۲۸۰ به خانه برگشتم
۲۰ لیتر بنزین زدم، ۷۰۰ هزار تومان، کیلومتر ۱۵۶۲۰۰ و باک کامل
روغن موتور را عوض کردم، هزینه ۹۰۰ هزار تومان، کیلومتر ۱۵۶۰۰۰
خرابی: صدای جلوبندی
تعمیر شد: جلوبندی، هزینه ۴۵۰ هزار تومان
جریمه سرعت ۵۰۰ هزار تومان
کارواش ۱۸۰ هزار تومان
```

Input recognition is best-effort. For important records, use an explicit command and include the relevant mileage, amount, and currency. Ambiguous messages should not be treated as successfully registered events.

`/undo` is intentionally disabled to prevent accidental deletion. Correcting or deleting existing records requires a separate, explicit data-management workflow.

## 📊 External API

The Worker can also be called by other applications.

### Record a natural-language event

```http
POST /api/v1/record
Authorization: Bearer YOUR_API_ACCESS_TOKEN
Content-Type: application/json
```

Example JSON:

```json
{
  "text": "20l fuel, cost 700000 toman, km 156200"
}
```

### Available endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/health` | Public Worker health information |
| `GET` | `/` | API information and endpoint overview |
| `POST` | `/telegram` | Telegram webhook |
| `POST` | `/api/v1/record` | Register an event or process a command |
| `POST` | `/api/v1/command` | Command/record endpoint alias |
| `GET` | `/api/v1/overview` | Aggregated vehicle statistics |
| `GET` | `/api/v1/events?type=fuel&limit=100` | Read event history |
| `GET` | `/api/v1/due` | Calculate maintenance deadlines |
| `GET` | `/api/v1/config` | Read vehicle and interval configuration |
| `GET` | `/api/v1/export?month=2026-10` | Export monthly events as CSV |

All `/api/v1/*` endpoints require a valid bearer token, including API reads. The `/health` route is separate and does not expose secret values.

### Typed event example

```json
{
  "type": "fuel",
  "title": "سوخت‌گیری",
  "description": "20 liters; full tank",
  "occurredAt": "2026-10-21T18:30:00+03:30",
  "odometerKm": 156200,
  "liters": 20,
  "costRial": 7000000,
  "fullTank": true
}
```

For typed events, `costRial` is expressed in Iranian rials. The example represents 700,000 tomans.

## 🔧 Maintenance configuration

Service intervals are stored in `data/config.json` and can be adjusted through the bot.

For example:

```text
/interval engine_oil 4000 180
```

This configures a 4,000 km distance interval and a 180-day time interval for engine oil.

Maintenance deadlines are estimates calculated from the available service history and odometer records. Initial interval values are configurable reminders, not guaranteed manufacturer specifications. Verify the correct intervals against the vehicle's exact engine, components, service history, and maintenance documentation.

## ⏱️ Request-driven operation

Normal event registration, reading, calculations, and report generation happen when a request arrives.

There is no scheduled Worker handler in this configuration.

This means:

- Telegram messages trigger the Worker immediately.
- Authorized API requests trigger the Worker immediately.
- `/due` calculates maintenance status when requested.
- GitHub writes are awaited before a successful registration response is returned.

An unsolicited daily reminder cannot be delivered at a specified time without a separate scheduler or an external service that initiates a request. That functionality is intentionally outside this request-driven design.

## 🛡️ Security and privacy

- Use a fine-grained GitHub token restricted to this repository.
- Keep all Worker secrets outside the published website.
- Allow only the intended Telegram numeric user ID to operate the private bot.
- Keep the API access token private and use it only in trusted clients.
- Review Worker logs for failed writes and authorization errors.
- Avoid storing home addresses, personal routes, or other sensitive information in public logs.

**Important:** If this repository is public, the JSON event history is publicly accessible. GitHub Pages content is also public in the standard public-site configuration. Choose the repository's visibility with this in mind.

## 🧪 Testing

Run the automated tests from the Worker directory:

```cmd
npm test
```

The tests exercise the Worker using mocked GitHub and Telegram requests; they do not prove that real account tokens or deployed services work.

After deployment, verify the integration in this order:

1. Request `/health`.
2. Send `/start` and `/help` to the Telegram bot.
3. Register one real odometer reading.
4. Confirm that `data/logs/YYYY-MM.json` and `data/index.json` have new commits.
5. Open GitHub Pages and refresh the dashboard.

A GitHub commit may complete before the updated public Pages build becomes visible. Dashboard publication is separate from the Worker write operation.

## ⚠️ Operational limitations

GitHub Contents API is the persistence layer. Each event typically requires a write to its monthly event file and another write to the month index. This is deliberately simple and auditable, but high request volumes can encounter GitHub API rate limits or concurrent-write conflicts.

If GitHub rejects a write, do not assume the event was safely stored just because Telegram received a message. Inspect the repository and Worker logs before retrying a potentially duplicated record.

This project is a personal vehicle recordkeeping system. Its service reminders and consumption estimates do not replace mechanical inspection, the vehicle's maintenance documentation, or professional advice.

---

**Repository:** [mehrdadmb2/peugeot-206-garage](https://github.com/mehrdadmb2/peugeot-206-garage)

**Worker:** `peugeot-206-garage-bot`

**Telegram bot:** [@Peugeot206GarageBot](https://t.me/Peugeot206GarageBot)

**Dashboard:** [GitHub Pages](https://mehrdadmb2.github.io/peugeot-206-garage/)
