import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const html = readFileSync(resolve(root, 'index.html'), 'utf8');
const app = readFileSync(resolve(root, 'assets/js/app.js'), 'utf8');
const css = readFileSync(resolve(root, 'assets/css/style.css'), 'utf8');

test('HTML has a standalone splash failsafe and cache-busted dashboard assets', () => {
  assert.match(html, /assets\/js\/app\.js\?v=3\.10\.0-snapshot/);
  assert.match(html, /assets\/css\/style\.css\?v=3\.10\.0-snapshot/);
  assert.match(html, /window\.__garageBootScreen/);
  assert.match(html, /12000/);
  assert.match(html, /بارگذاری مجدد/);
});

test('dashboard data requests have an explicit timeout and abort controller', () => {
  assert.match(app, /DASHBOARD_FETCH_TIMEOUT_MS\s*=\s*9000/);
  assert.match(app, /new AbortController\(\)/);
  assert.match(app, /Promise\.race\(/);
  assert.match(app, /fetchJsonWithTimeout\('\.\/data\/dashboard\.json'/);
  assert.match(app, /fetchJsonWithTimeout\('\.\/data\/index\.json'/);
  assert.match(app, /fetchJsonWithTimeout\('\.\/data\/config\.json'/);
  assert.match(app, /fetchJsonWithTimeout\(`\.\/data\/logs/);
  assert.match(app, /state\.precomputed\?\.dueItems/);
  assert.match(app, /فهرست سرویس‌ها، دسته‌بندی‌ها، قطعات یا خدمات خالی است/);
  assert.match(app, /محاسبات فایل آماده ناقص یا ناسازگار است/);
  assert.match(app, /state\.precomputed\?\.distanceEntries/);
  assert.match(app, /cache: 'no-cache'/);
});

test('failed month logs become a visible partial-load warning instead of hanging silently', () => {
  assert.match(app, /failedMonths\.push\(month\)/);
  assert.match(app, /بعضی لاگ‌های ماهانه بارگیری نشدند/);
  assert.match(app, /window\.__garageBootScreen\?\.success/);
  assert.match(app, /window\.__garageBootScreen\?\.fail/);
  assert.match(app, /window\.__garageBootScreen\?\.release/);
});

test('failsafe notice has responsive styling and stays above the dashboard', () => {
  assert.match(css, /\.boot-failsafe-notice\{[^}]*position:fixed/s);
  assert.match(css, /@media\(max-width:620px\)\{\.boot-failsafe-notice/s);
});

test('dashboard has a clickable Telegram bot identity tag in the hero area', () => {
  assert.match(html, /class="hero-bot-pill"/);
  assert.match(html, /@Peugeot206GarageBot/);
  assert.match(css, /\.hero-bot-pill/);
});
