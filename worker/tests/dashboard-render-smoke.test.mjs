import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import * as fuelEngine from '../../assets/js/fuel-intelligence.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const appSource = readFileSync(resolve(root, 'assets/js/app.js'), 'utf8');
const snapshot = JSON.parse(readFileSync(resolve(root, 'data/dashboard.json'), 'utf8'));

class FakeClassList {
  constructor() { this.values = new Set(); }
  add(...items) { items.forEach(item => this.values.add(item)); }
  remove(...items) { items.forEach(item => this.values.delete(item)); }
  contains(item) { return this.values.has(item); }
  toggle(item, force) {
    const enabled = force === undefined ? !this.values.has(item) : Boolean(force);
    if (enabled) this.values.add(item); else this.values.delete(item);
    return enabled;
  }
}

class FakeElement {
  constructor(selector) {
    this.selector = selector;
    this.dataset = {};
    this.style = {};
    this.classList = new FakeClassList();
    this.attributes = {};
    this.value = selector === '#searchInput' ? '' : selector === '#fuelTripDistanceInput' ? '40' : 'all';
    this.hidden = false;
    this.tagName = selector.startsWith('#') ? 'DIV' : String(selector).toUpperCase();
    this.textContent = '';
    this.innerHTML = '';
    this.title = '';
    this.parentElement = this;
  }
  addEventListener() {}
  setAttribute(key, value) { this.attributes[key] = value; }
  removeAttribute(key) { delete this.attributes[key]; }
  querySelector() { return new FakeElement('nested'); }
  querySelectorAll() { return []; }
  closest() { return null; }
  getAttribute() { return null; }
  insertAdjacentHTML(_position, html) { this.innerHTML += html; }
  appendChild() { return null; }
  remove() {}
  click() {}
  contains() { return false; }
  getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 100 }; }
}

test('real project snapshot boots the app and all dashboard sections render without runtime errors', async () => {
  const dataset = {
    mode: 'snapshot', config: snapshot.config, events: snapshot.events,
    months: snapshot.months, precomputed: snapshot.computed,
    generatedAt: snapshot.generatedAt, updatedAt: snapshot.sourceUpdatedAt,
    failedMonths: [], warnings: [], source: 'test-fixture'
  };
  const elements = new Map();
  const listeners = new Map();
  const diagnosticEntries = [];
  const document = {
    readyState: 'complete', scripts: [],
    addEventListener: (name, callback) => listeners.set(name, callback),
    querySelector: selector => {
      if (!elements.has(selector)) elements.set(selector, new FakeElement(selector));
      return elements.get(selector);
    },
    querySelectorAll: () => [],
    getElementById: id => document.querySelector(`#${id}`),
    createElement: tag => new FakeElement(tag),
    body: new FakeElement('body')
  };
  const window = {
    document, location: { href: 'https://garage.test/' },
    navigator: { onLine: true, language: 'fa-IR' },
    GarageDataLoader: { load: async () => dataset },
    __fuelEngine: fuelEngine,
    GarageDiagnostics: {
      log: (...entry) => diagnosticEntries.push(entry),
      setContext: context => diagnosticEntries.push(['context', context])
    },
    __garageBootScreen: { success() {}, fail: message => diagnosticEntries.push(['boot-fail', message]), release() {} },
    matchMedia: () => ({ matches: false }), scrollTo() {},
    setTimeout, clearTimeout, innerWidth: 1280, innerHeight: 800
  };
  const sandbox = {
    window, document, navigator: window.navigator, console,
    Intl, Date, Math, JSON, Number, String, Boolean, Array, Object, Set, Map, Promise,
    Error, RegExp, Blob, URL, TextEncoder, TextDecoder,
    parseInt, parseFloat, isNaN, setTimeout, clearTimeout,
    matchMedia: () => ({ matches: false }), requestAnimationFrame: callback => callback()
  };

  const appWithFuelEngine = appSource.replace("await import('./fuel-intelligence.mjs')", 'window.__fuelEngine');
  vm.runInNewContext(appWithFuelEngine, sandbox, { filename: 'assets/js/app.js' });
  listeners.get('DOMContentLoaded')?.();
  await new Promise(resolveWait => setTimeout(resolveWait, 20));

  const renderErrors = diagnosticEntries.filter(entry => entry[0] === 'error' && String(entry[1]).startsWith('render.'));
  assert.equal(renderErrors.length, 0, JSON.stringify(renderErrors));
  assert.match(elements.get('#connectionBadge')?.innerHTML || '', /داده‌ها آماده/);
  assert.ok((elements.get('#serviceGrid')?.innerHTML || '').length > 1000, 'service cards should be populated');
  assert.equal(elements.get('#statFuel')?.textContent, '۳۵', 'Aban fuel metric must count the 35 L entry stored in the Gregorian October log');
  assert.ok((elements.get('#statCost')?.textContent || '').includes('۴'), 'Aban expense card must not show zero');
  assert.match(elements.get('#statCostFoot')?.textContent || '', /آبان/);
  assert.match(elements.get('#statFuelFoot')?.textContent || '', /آبان/);
  assert.match(elements.get('#monthFilter')?.innerHTML || '', /آبان/);
  assert.match(elements.get('#fuelOnlyChart')?.innerHTML || '', /۳۵/);
  assert.match(elements.get('#expensePageMonthly')?.textContent || '', /۴/);
  assert.match(elements.get('#expenseMonthlyChart')?.innerHTML || '', /۴/);
  assert.match(elements.get('#serviceReconciliation')?.textContent || '', /۳٬۷۸۷ km/);
  assert.match(elements.get('#serviceReconciliation')?.textContent || '', /۳۲۵ km از تعویض/);
  assert.match(elements.get('#serviceGrid')?.innerHTML || '', /۱۹٬۶۷۵ km مانده/);
  assert.match(elements.get('#serviceGrid')?.innerHTML || '', /۹٬۴۱۳ km مانده/);
  assert.match(elements.get('#serviceGrid')?.innerHTML || '', /۱٬۲۱۳ km مانده/);
  assert.doesNotMatch(elements.get('#serviceGrid')?.innerHTML || '', /۱٬۴۱۶ km عبور از موعد/);
  assert.ok((elements.get('#componentCatalog')?.innerHTML || '').length > 1000, 'part catalog should be populated');
  assert.ok((elements.get('#serviceCatalogGrid')?.innerHTML || '').length > 500, 'service catalog should be populated');
  assert.ok((elements.get('#eventList')?.innerHTML || '').length > 500, 'journal should show real events');
  assert.ok((elements.get('#costChart')?.innerHTML || '').length > 100, 'analytics chart should be rendered');
  assert.ok((elements.get('#fuelEventList')?.innerHTML || '').length > 100, 'fuel page should render');
  assert.match(elements.get('#fuelEstimateRate')?.textContent || '', /۹٫۱۹ L\/100km/);
  assert.match(elements.get('#fuelEstimateLiters')?.textContent || '', /۳٫۶۷ لیتر/);
  assert.match(elements.get('#fuelEstimateCost')?.textContent || '', /۵٬۵۱۲ تومان/);
  assert.match(elements.get('#eventList')?.innerHTML || '', /برآورد سوخت این پیمایش/);
  assert.match(elements.get('#eventList')?.innerHTML || '', /۳٫۶۷ لیتر/);
  assert.match(elements.get('#eventList')?.innerHTML || '', /۵٬۵۱۲ تومان/);
  assert.match(elements.get('#specVehicleNameHero')?.textContent || '', /Peugeot 206 SD/);
  assert.match(elements.get('#specEngineIdentity')?.textContent || '', /TU3/);
  assert.match(elements.get('#eventList')?.innerHTML || '', /km داده/);
  assert.ok((elements.get('#expenseEventList')?.innerHTML || '').length > 100, 'expense page should render');
  assert.equal(dataset.events.length, snapshot.events.length);
  assert.equal(Object.keys(dataset.config.partCatalog.items).length, 62);

  const sampleEvent = snapshot.events[0];
  const globalMatches = window.GarageApp.searchEvents(String(sampleEvent.id), 5);
  assert.ok(globalMatches.some(item => item.id === String(sampleEvent.id)), 'global search should find an existing event by ID');
  assert.equal(window.GarageApp.openEvent(String(sampleEvent.id)), true, 'global search result should open the matching journal event');
  assert.equal(elements.get('#searchInput')?.value, String(sampleEvent.id));
  assert.match(elements.get('#eventList')?.innerHTML || '', new RegExp(`data-event-id=\"${String(sampleEvent.id)}\"`));
});
