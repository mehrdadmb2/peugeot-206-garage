import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const html = readFileSync(resolve(root, 'index.html'), 'utf8');
const app = readFileSync(resolve(root, 'assets/js/app.js'), 'utf8');
const loaderSource = readFileSync(resolve(root, 'assets/js/data-loader.js'), 'utf8');
const css = readFileSync(resolve(root, 'assets/css/style.css'), 'utf8');

function jsonResponse(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return { ok: true, status: 200, text: async () => text };
}

function createLoader(fetchMock, storage = new Map()) {
  const window = {
    location: { href: 'https://mehrdadmb2.github.io/peugeot-206-garage/' },
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) }
  };
  const sandbox = {
    window, fetch: fetchMock, URL, AbortController, Promise, Date, Intl,
    setTimeout, clearTimeout, AggregateError, Object, Array, String, Number, Error, Set
  };
  vm.runInNewContext(loaderSource, sandbox, { filename: 'data-loader.js' });
  return window.GarageDataLoader;
}

function payloadFor(url) {
  const parsed = new URL(url);
  let relative = parsed.pathname;
  const markerMain = relative.indexOf('/main/');
  const markerCdn = relative.indexOf('@main/');
  if (markerMain >= 0) relative = relative.slice(markerMain + 6);
  else if (markerCdn >= 0) relative = relative.slice(markerCdn + 6);
  else relative = relative.replace(/^.*?\/peugeot-206-garage\//, '');
  if (!relative.startsWith('data/')) throw new Error(`Unexpected test path: ${relative}`);
  return JSON.parse(readFileSync(resolve(root, relative), 'utf8'));
}

test('HTML loads a cache-busted independent browser data loader before the app', () => {
  assert.match(html, /assets\/js\/data-loader\.js\?v=3\.10\.3-resilience/);
  assert.match(html, /assets\/js\/app\.js\?v=3\.10\.3-resilience/);
  assert.match(html, /assets\/css\/style\.css\?v=3\.10\.3-resilience/);
  assert.ok(html.indexOf('assets/js/data-loader.js') < html.indexOf('assets/js/app.js'));
  assert.match(html, /window\.__garageBootScreen/);
  assert.match(html, /10500/);
  assert.match(html, /منابع جایگزین/);
  assert.match(html, /terminalWatchdog/);
  assert.match(html, /completed = true/);
});


test('browser data loader can recover from a GitHub Pages outage through GitHub Raw', async () => {
  const loader = createLoader(async url => {
    const host = new URL(url).hostname;
    if (host.includes('github.io')) throw new Error('simulated Pages outage');
    return jsonResponse(payloadFor(url));
  });
  const result = await loader.fetchJson('data/index.json', 'index mirror test');
  assert.equal(result.source, 'GitHub Raw');
  assert.ok(result.data.months.includes('2026-10'));
});

test('browser data loader can recover through jsDelivr when Pages and GitHub Raw fail', async () => {
  const loader = createLoader(async url => {
    const host = new URL(url).hostname;
    if (!host.includes('cdn.jsdelivr.net')) throw new Error('simulated upstream outage');
    return jsonResponse(payloadFor(url));
  });
  const result = await loader.fetchJson('data/config.json', 'config mirror test');
  assert.equal(result.source, 'jsDelivr');
  assert.equal(Object.keys(result.data.partCatalog.items).length, 62);
});

test('browser data loader validates snapshots and falls back to raw JSON when the snapshot is unavailable', async () => {
  const loader = createLoader(async url => {
    if (new URL(url).pathname.endsWith('/data/dashboard.json')) return { ok: false, status: 403, text: async () => '{\"ok\":false,\"error\":\"forbidden\"}' };
    return jsonResponse(payloadFor(url));
  });
  const result = await loader.load();
  assert.equal(result.mode, 'direct-fallback');
  assert.equal(result.precomputed, null);
  assert.equal(result.events.length, 31);
  assert.equal(Object.keys(result.config.partCatalog.items).length, 62);
  assert.equal(Object.keys(result.config.partCatalog.services).length, 17);
  assert.ok(result.warnings.some(warning => warning.includes('محاسبهٔ مستقیم')));
});

test('browser data loader ignores a stale Action snapshot and recalculates current raw data', async () => {
  const stale = payloadFor('https://raw.githubusercontent.com/mehrdadmb2/peugeot-206-garage/main/data/dashboard.json');
  stale.generatedForLocalDate = '2026-10-01';
  const loader = createLoader(async url => {
    if (new URL(url).pathname.endsWith('/data/dashboard.json')) return jsonResponse(stale);
    return jsonResponse(payloadFor(url));
  });
  const result = await loader.load();
  assert.equal(result.mode, 'direct-fallback');
  assert.equal(result.precomputed, null);
  assert.equal(result.events.length, 31);
  assert.ok(result.warnings.some(warning => warning.includes('محاسبات')));
});


test('browser data loader keeps available data and clearly reports missing monthly files', async () => {
  const loader = createLoader(async url => {
    const pathname = new URL(url).pathname;
    if (pathname.endsWith('/data/dashboard.json')) return { ok: false, status: 403, text: async () => 'forbidden' };
    if (pathname.endsWith('/data/index.json')) {
      const index = payloadFor(url);
      index.months = ['2026-09', '2026-10'];
      return jsonResponse(index);
    }
    if (pathname.endsWith('/data/logs/2026-09.json')) return { ok: false, status: 404, text: async () => 'not found' };
    return jsonResponse(payloadFor(url));
  });
  const result = await loader.load();
  assert.equal(result.mode, 'direct-partial');
  assert.equal(result.events.length, 31);
  assert.deepEqual(Array.from(result.failedMonths), ['2026-09']);
  assert.ok(result.warnings.some(warning => warning.includes('بارگذاری')));
});

test('browser data loader uses a valid fresh snapshot without loading every monthly log', async () => {
  const calls = [];
  const loader = createLoader(async url => {
    calls.push(new URL(url).pathname);
    return jsonResponse(payloadFor(url));
  });
  const result = await loader.load();
  assert.equal(result.mode, 'snapshot');
  assert.equal(result.precomputed.eventCount, result.events.length);
  assert.equal(result.events.length, 31);
  assert.equal(calls.some(path => /data\/logs\//.test(path)), false);
});


test('browser data loader serves the last valid local cache when all online sources are unavailable', async () => {
  const storage = new Map();
  const online = createLoader(async url => jsonResponse(payloadFor(url)), storage);
  const first = await online.load();
  assert.equal(first.mode, 'snapshot');
  assert.ok(storage.has('peugeot206garage:data-cache:v1'));

  const offline = createLoader(async () => { throw new Error('simulated total network outage'); }, storage);
  const cached = await offline.load();
  assert.equal(cached.mode, 'offline-cache');
  assert.equal(cached.precomputed, null);
  assert.equal(cached.events.length, 31);
  assert.ok(cached.warnings.some(warning => warning.includes('آخرین دادهٔ ذخیره‌شده')));
});

test('browser data loader checks primary, GitHub Raw and jsDelivr sources with full-response timeout and abort', () => {
  assert.match(loaderSource, /raw\.githubusercontent\.com/);
  assert.match(loaderSource, /cdn\.jsdelivr\.net/);
  assert.match(loaderSource, /REQUEST_TIMEOUT_MS\s*=\s*6500/);
  assert.match(loaderSource, /response\.text\(\)/);
  assert.match(loaderSource, /new AbortController\(\)/);
  assert.match(loaderSource, /Promise\.race\(\[request, timeout\]\)/);
  assert.match(loaderSource, /Promise\.any\(attempts\)/);
  assert.match(loaderSource, /LOCAL_CACHE_KEY/);
  assert.match(loaderSource, /readLocalCache/);
});

test('app renders explicit direct-compute and partial-data statuses instead of staying in connecting state', () => {
  assert.match(app, /window\.GarageDataLoader\.load\(\)/);
  assert.match(app, /محاسبه مستقیم/);
  assert.match(app, /direct-partial/);
  assert.match(app, /offline-cache/);
  assert.match(app, /تمام منابع داده ناموفق بودند/);
  assert.match(app, /state\.precomputed\?\.dueItems/);
  assert.match(app, /state\.precomputed\?\.distanceEntries/);
  assert.match(app, /state\.precomputed\?\.currentOdometerKm/);
});

test('failsafe notice has responsive styling and stays above the dashboard', () => {
  assert.match(css, /\.boot-failsafe-notice\{[^}]*position:fixed/s);
  assert.match(css, /@media\(max-width:620px\)\{\.boot-failsafe-notice/s);
  assert.match(css, /\.status-badge\.fallback/);
  assert.match(css, /\.status-badge\.partial/);
  assert.match(css, /\.status-badge\.offline/);
});

test('dashboard keeps a clickable Telegram bot identity tag in the hero area', () => {
  assert.match(html, /class="hero-bot-pill"/);
  assert.match(html, /@Peugeot206GarageBot/);
  assert.match(css, /\.hero-bot-pill/);
});
