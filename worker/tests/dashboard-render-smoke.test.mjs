import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import * as fuelEngine from '../../assets/js/fuel-intelligence.mjs';
import * as costEngine from '../../assets/js/vehicle-cost-intelligence.mjs';

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
    this.value = selector === '#searchInput' ? '' : (selector === '#fuelTripDistanceInput' || selector === '#ownershipTripDistanceInput') ? '40' : 'all';
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
    __fuelEngine: fuelEngine, __costEngine: costEngine,
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

  const appWithFuelEngine = appSource.replace("await import('./fuel-intelligence.mjs')", 'window.__fuelEngine').replace("await import('./vehicle-cost-intelligence.mjs')", 'window.__costEngine');
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
  const purchaseOdometerKm = Number(
    snapshot.config?.ownership?.purchaseOdometerKm ??
    snapshot.config?.ownership?.baselineOdometerKm ??
    snapshot.config?.vehicle?.purchaseOdometerKm ??
    428000
  );
  const currentOdometerKm = Number(snapshot.computed?.currentOdometerKm);
  const drivenSincePurchaseKm = currentOdometerKm - purchaseOdometerKm;
  assert.ok(Number.isFinite(drivenSincePurchaseKm) && drivenSincePurchaseKm >= 0,
    'snapshot must provide a valid current odometer at or above the purchase baseline');
  const expectedDrivenLabel = new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 0 }).format(drivenSincePurchaseKm);
  assert.ok(
    (elements.get('#serviceReconciliation')?.textContent || '').includes(`${expectedDrivenLabel} km`),
    `service reconciliation must reflect the current snapshot distance (${expectedDrivenLabel} km)`
  );
  const snapshotEventEpoch = event => {
    const value = event?.occurredAt || (event?.date ? `${String(event.date).slice(0, 10)}T${event?.time || '12:00'}:00+03:30` : event?.createdAt);
    const parsed = Date.parse(value || '');
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const latestReplacement = snapshot.events
    .filter(event => event.type === 'part' && event.componentReplaced === true && event.odometerKm !== null && event.odometerKm !== undefined && Number.isFinite(Number(event.odometerKm)))
    .sort((a, b) => snapshotEventEpoch(b) - snapshotEventEpoch(a))[0];
  assert.ok(latestReplacement, 'snapshot must contain at least one recorded replacement for the reconciliation test');
  const kmSinceLatestReplacement = Math.max(0, currentOdometerKm - Number(latestReplacement.odometerKm));
  const expectedReplacementDistance = new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 0 }).format(kmSinceLatestReplacement);
  assert.ok(
    (elements.get('#serviceReconciliation')?.textContent || '').includes(`${expectedReplacementDistance} km از تعویض`),
    `service reconciliation must calculate distance since the latest actual replacement (${expectedReplacementDistance} km)`
  );
  const serviceGridHtml = elements.get('#serviceGrid')?.innerHTML || '';
  const remainingServiceKm = key => {
    const service = snapshot.config?.serviceIntervals?.[key];
    assert.ok(service, `service interval ${key} must exist in the real vehicle configuration`);
    const matchingEvents = snapshot.events.filter(event => {
      const matches = [event.serviceKey, event.componentKey, event.serviceCatalogKey].filter(Boolean).includes(key);
      if (!matches) return false;
      if (event.type === 'service') return true;
      if (event.type === 'part') return event.componentReplaced === true;
      if (event.type === 'repair') return event.status !== 'open';
      if (event.type === 'issue') return event.status === 'fixed' && Boolean(event.componentReplaced || event.componentKey || event.serviceKey || event.serviceCatalogKey);
      return false;
    }).sort((a, b) => snapshotEventEpoch(b) - snapshotEventEpoch(a));
    const rawReferenceOdometer = matchingEvents[0]?.odometerKm;
    const referenceOdometer = rawReferenceOdometer !== null && rawReferenceOdometer !== undefined && Number.isFinite(Number(rawReferenceOdometer))
      ? Number(rawReferenceOdometer)
      : purchaseOdometerKm;
    return Math.round(referenceOdometer + Number(service.intervalKm || 0) - currentOdometerKm);
  };
  for (const key of ['spark_plugs', 'air_filter', 'engine_oil']) {
    const expectedRemaining = new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 0 }).format(remainingServiceKm(key));
    assert.ok(serviceGridHtml.includes(`${expectedRemaining} km مانده`),
      `${key} card must reflect the latest event and current odometer (${expectedRemaining} km remaining)`);
  }
  assert.doesNotMatch(elements.get('#serviceGrid')?.innerHTML || '', /۱٬۴۱۶ km عبور از موعد/);
  assert.ok((elements.get('#componentCatalog')?.innerHTML || '').length > 1000, 'part catalog should be populated');
  assert.ok((elements.get('#serviceCatalogGrid')?.innerHTML || '').length > 500, 'service catalog should be populated');
  assert.ok((elements.get('#eventList')?.innerHTML || '').length > 500, 'journal should show real events');
  assert.ok((elements.get('#costChart')?.innerHTML || '').length > 100, 'analytics chart should be rendered');
  assert.ok((elements.get('#fuelEventList')?.innerHTML || '').length > 100, 'fuel page should render');
  assert.match(elements.get('#fuelEstimateRate')?.textContent || '', /۹٫۱۹ L\/100km/);
  assert.match(elements.get('#fuelEstimateLiters')?.textContent || '', /۳٫۶۷ لیتر/);
  assert.match(elements.get('#fuelEstimateCost')?.textContent || '', /۵٬۵۱۲ تومان/);
  assert.match(elements.get('#eventList')?.innerHTML || '', /هزینهٔ بنزین این پیمایش/);
  assert.match(elements.get('#eventList')?.innerHTML || '', /۳٫۶۷ لیتر/);
  assert.match(elements.get('#eventList')?.innerHTML || '', /۵٬۵۱۲ تومان/);
  assert.match(elements.get('#eventList')?.innerHTML || '', /event-ownership-cost/);
  assert.ok((elements.get('#ownershipCostTotal')?.textContent || '').includes('تومان'), 'ownership costs must be recalculated from actual costs');
  assert.ok((elements.get('#ownershipAllRecordedCostPerKm')?.textContent || '').includes('تومان'), 'all paid costs including fines must have a separate historical per-km metric');
  assert.ok((elements.get('#ownershipTripTotal')?.textContent || '').includes('تومان'), 'trip calculator must render an estimated total');
  assert.ok((elements.get('#ownershipRecordedCostPerKm')?.textContent || '').includes('تومان/km'), 'historical paid cost per kilometre must be shown separately from the modeled rate');
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

  const eventWithNote = snapshot.events.find(event => typeof event.note === 'string' && event.note.trim());
  assert.ok(eventWithNote, 'the real dataset must contain an event with a separate explanatory note');
  assert.equal(window.GarageApp.openEvent(String(eventWithNote.id)), true, 'an event with a note must be directly navigable');
  const noteJournal = elements.get('#eventList')?.innerHTML || '';
  assert.match(noteJournal, /یادداشت تکمیلی/);
  assert.ok(noteJournal.includes(eventWithNote.note), 'journal must render the actual note, not replace it with the generic description');
});
