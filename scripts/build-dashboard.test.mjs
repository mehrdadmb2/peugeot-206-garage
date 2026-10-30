import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDashboardData, calculateCurrentOdometer, calculateDueItems } from './build-dashboard.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

test('real repository data builds a complete dashboard snapshot without dropping events or catalog data', () => {
  const snapshot = buildDashboardData({ rootDir: projectRoot, now: new Date('2026-10-30T06:00:00.000Z') });
  assert.equal(snapshot.schemaVersion, 1);
  assert.ok(snapshot.events.length >= 1);
  assert.equal(snapshot.computed.eventCount, snapshot.events.length);
  assert.equal(snapshot.computed.componentCount, 62);
  assert.equal(snapshot.computed.serviceIntervalCount, 17);
  assert.equal(snapshot.computed.serviceCatalogCount, 17);
  assert.ok(snapshot.computed.currentOdometerKm > 428000);
  assert.ok(Array.isArray(snapshot.computed.dueItems));
  assert.ok(Array.isArray(snapshot.computed.distanceEntries));
  assert.equal(new Set(snapshot.events.map(event => event.id)).size, snapshot.events.length);
});

test('precomputation de-duplicates events and calculates odometer, monthly fuel/cost and maintenance due state', () => {
  const temp = mkdtempSync(join(tmpdir(), '206-garage-dashboard-'));
  try {
    const config = {
      schemaVersion: 5,
      vehicle: { make: 'Peugeot', model: '206 SD' },
      ownership: { purchaseOdometerKm: 9000, purchaseDate: null, defaultActor: 'من' },
      serviceIntervals: { engine_oil: { label: 'روغن موتور', intervalKm: 1000, intervalDays: 0 } },
      partCatalog: { categories: { engine: { label: 'موتور' } }, items: { oil: { label: 'روغن' } }, services: { oil_change: { label: 'تعویض روغن' } } },
      people: []
    };
    const odometerA = { id: 'odo-a', type: 'odometer', date: '2026-10-01', occurredAt: '2026-10-01T10:00:00+03:30', odometerKm: 10000 };
    const odometerB = { id: 'odo-b', type: 'odometer', date: '2026-10-02', occurredAt: '2026-10-02T10:00:00+03:30', odometerKm: 10050 };
    const fuel = { id: 'fuel-a', type: 'fuel', date: '2026-10-02', occurredAt: '2026-10-02T11:00:00+03:30', liters: 2, costRial: 20000 };
    writeJson(join(temp, 'data/config.json'), config);
    writeJson(join(temp, 'data/index.json'), { updatedAt: '2026-10-02T11:00:00+03:30', months: ['2026-09', '2026-10'] });
    writeJson(join(temp, 'data/logs/2026-09.json'), { month: '2026-09', events: [odometerA] });
    writeJson(join(temp, 'data/logs/2026-10.json'), { month: '2026-10', updatedAt: '2026-10-02T11:00:00+03:30', events: [odometerA, odometerB, fuel] });

    const snapshot = buildDashboardData({ rootDir: temp, now: new Date('2026-10-02T12:00:00.000Z') });
    assert.equal(snapshot.events.length, 3);
    assert.equal(snapshot.computed.currentOdometerKm, 10050);
    assert.equal(snapshot.computed.currentMonth, '2026-10');
    assert.equal(snapshot.computed.currentMonthEventCount, 3);
    assert.equal(snapshot.computed.currentMonthFuelLiters, 2);
    assert.equal(snapshot.computed.currentMonthCostRial, 20000);
    assert.equal(snapshot.computed.dueItems.length, 1);
    assert.equal(snapshot.computed.dueItems[0].key, 'engine_oil');
    assert.equal(snapshot.computed.dueItems[0].stage, 'overdue');
    assert.equal(calculateCurrentOdometer(snapshot.events), 10050);
    assert.equal(calculateDueItems(snapshot.events, config, 10050, '2026-10-02')[0].stage, 'overdue');
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test('invalid or missing monthly data fails the build instead of publishing an empty dashboard', () => {
  const temp = mkdtempSync(join(tmpdir(), '206-garage-dashboard-invalid-'));
  try {
    writeJson(join(temp, 'data/config.json'), { serviceIntervals: { oil: {} }, partCatalog: { categories: { engine: {} }, items: { oil: {} }, services: { oil: {} } } });
    writeJson(join(temp, 'data/index.json'), { months: ['2026-10'] });
    mkdirSync(join(temp, 'data/logs'), { recursive: true });
    assert.throws(() => buildDashboardData({ rootDir: temp }), /missing monthly logs/);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
