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
const diagnosticsSource = readFileSync(resolve(root, 'assets/js/diagnostics.js'), 'utf8');

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
  assert.match(html, /assets\/js\/diagnostics\.js\?v=3\.12\.0-persian-months/);
  assert.match(html, /assets\/js\/data-loader\.js\?v=3\.12\.0-persian-months/);
  assert.match(html, /assets\/js\/app\.js\?v=3\.12\.0-persian-months/);
  assert.match(html, /assets\/css\/style\.css\?v=3\.12\.0-persian-months/);
  assert.ok(html.indexOf('assets/js/diagnostics.js') < html.indexOf('assets/js/data-loader.js'));
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


test('browser data loader rejects an old calculator snapshot and recalculates raw source data', async () => {
  const oldSnapshot = payloadFor('https://raw.githubusercontent.com/mehrdadmb2/peugeot-206-garage/main/data/dashboard.json');
  delete oldSnapshot.computed.calculationVersion;
  const loader = createLoader(async url => {
    if (new URL(url).pathname.endsWith('/data/dashboard.json')) return jsonResponse(oldSnapshot);
    return jsonResponse(payloadFor(url));
  });
  const result = await loader.load();
  assert.equal(result.mode, 'direct-fallback');
  assert.equal(result.precomputed, null);
  assert.equal(result.events.length, 31);
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
  assert.match(loaderSource, /REQUEST_TIMEOUT_MS\s*=\s*5200/);
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


test('all dashboard renderers and export handlers referenced by bootstrap are actually defined', () => {
  const required = ['updateJournal','renderJournal','renderAnalytics','renderOverviewExtras','renderFuelPage','renderExpensePage','renderTrafficDetails','renderSettingsPage','exportCsvAll','exportJsonAll','exportExpensesCsv','copyApiExample'];
  for (const name of required) assert.match(app, new RegExp(`function\\s+${name}\\s*\\(`), `${name} must be declared before runtime`);
});

test('every literal DOM id used by the application exists in index.html', () => {
  const usedIds = [...app.matchAll(/\$\(['\"]#([A-Za-z0-9_-]+)['\"]\)/g)].map(match => match[1]);
  for (const id of new Set(usedIds)) assert.match(html, new RegExp(`id=[\"']${id}[\"']`), `#${id} must exist in index.html`);
});

test('startup and connection indicators tolerate missing optional DOM elements', () => {
  assert.match(app, /refreshButton\?\.classList\.add/);
  assert.match(app, /refreshButton\?\.classList\.remove/);
  assert.match(app, /if \(!badge\)\s*\{/);
  assert.match(app, /const target = targetSelector \? \$\(targetSelector\) : null;/);
});

test('render failures are isolated so one broken page does not stop the remaining dashboard', () => {
  assert.match(app, /function safeRender\(/);
  assert.match(app, /sections\.forEach\(\(\[name, renderer\]\) => safeRender/);
  assert.match(app, /GarageDiagnostics\?\.log\('error', `render\./);
  assert.match(app, /const targetSelector = targetMap\[name\];/);
  assert.doesNotMatch(app, /\$\(targetMap\[name\] \|\| ''\)/);
});

test('privacy-safe diagnostics are loaded before all app code and provide export, persistent logs and self-check', () => {
  assert.ok(html.indexOf('assets/js/diagnostics.js') < html.indexOf('assets/js/data-loader.js'));
  assert.match(diagnosticsSource, /unhandledrejection/);
  assert.match(diagnosticsSource, /securitypolicyviolation/);
  assert.match(diagnosticsSource, /downloadReport/);
  assert.match(diagnosticsSource, /async function runChecks/);
  assert.match(diagnosticsSource, /GarageDiagnostics/);
  assert.match(diagnosticsSource, /REDACTED/);
  assert.match(diagnosticsSource, /PERSIST_KEY/);
  assert.match(diagnosticsSource, /pagehide/);
});

test('intentional mirror AbortError is logged as debug rather than a network failure', async () => {
  const listeners = new Map();
  const window = {
    location: { origin: 'https://example.test', pathname: '/garage/' },
    navigator: { onLine: true, userAgent: 'test', language: 'fa-IR' },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    document: { readyState: 'loading', addEventListener: (name, fn) => listeners.set(`doc:${name}`, fn), scripts: [] },
    addEventListener: (name, fn) => listeners.set(name, fn),
    setTimeout, clearTimeout, performance: { getEntriesByType: () => [] }, innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1,
    fetch: async () => { const error = new Error('aborted'); error.name = 'AbortError'; throw error; }
  };
  vm.runInNewContext(diagnosticsSource, { window, URL, Date, Intl, JSON, Object, Array, String, Number, Error, Blob }, { filename: 'diagnostics-abort-test.js' });
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(window.fetch('https://raw.githubusercontent.com/example/data.json', { signal: controller.signal }), { name: 'AbortError' });
  const networkEntries = window.GarageDiagnostics.entries.filter(entry => entry.scope === 'network.fetch');
  assert.ok(networkEntries.some(entry => entry.level === 'debug'));
  assert.equal(networkEntries.some(entry => entry.level === 'error'), false);
});

test('diagnostic entries survive page refresh and redact authorization and secret fields', () => {
  const storage = new Map();
  const listeners = new Map();
  const createDiagnostics = () => {
    const window = {
      location: { origin: 'https://example.test', pathname: '/garage/' },
      navigator: { onLine: true, userAgent: 'test', language: 'fa-IR' },
      localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
      document: { readyState: 'loading', addEventListener: (name, fn) => listeners.set(`doc:${name}`, fn), scripts: [] },
      addEventListener: (name, fn) => listeners.set(name, fn),
      setTimeout, clearTimeout, performance: { getEntriesByType: () => [] }, innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1
    };
    vm.runInNewContext(diagnosticsSource, { window, URL, Date, Intl, JSON, Object, Array, String, Number, Error, Blob }, { filename: 'diagnostics.js' });
    return window.GarageDiagnostics;
  };
  const first = createDiagnostics();
  first.log('error', 'test.scope', 'Authorization: Bearer abc123 token=secret123', { accessToken: 'private-value', safe: 'visible' });
  listeners.get('pagehide')();
  const saved = storage.get('peugeot206garage:diagnostics:v1');
  assert.ok(saved);
  assert.doesNotMatch(saved, /abc123|secret123|private-value/);
  assert.match(saved, /REDACTED/);
  const second = createDiagnostics();
  assert.ok(second.entries.some(entry => entry.scope === 'test.scope'));
  assert.ok(second.entries.some(entry => entry.level === 'error'));
});
