import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Odometer from '../../assets/js/odometer-intelligence.js';

const projectRoot = resolve(new URL('../..', import.meta.url).pathname);
const readRealEvents = () => {
  const index = JSON.parse(readFileSync(resolve(projectRoot, 'data/index.json'), 'utf8'));
  return index.months.flatMap(month => JSON.parse(readFileSync(resolve(projectRoot, `data/logs/${month}.json`), 'utf8')).events);
};

test('real vehicle data reconciles the same-day entry timestamp anomaly and returns the true latest odometer', () => {
  const events = readRealEvents();
  const latest = events.find(event => event.id === '8dbce69d-82a5-4069-99e6-8fe72fd8d7cf');
  const suspicious = events.find(event => event.id === 'ca224d23-e58a-41b0-ba95-2b66bfabbe84');
  assert.ok(latest && suspicious);
  assert.ok(Date.parse(suspicious.occurredAt) > Date.parse(latest.occurredAt));
  assert.ok(Date.parse(suspicious.createdAt) < Date.parse(latest.createdAt));
  assert.equal(Odometer.eventTimelineEpoch(suspicious), Date.parse(suspicious.createdAt));
  const state = Odometer.getOdometerState(events);
  assert.equal(state.currentOdometerKm, 432270);
  assert.equal(state.rejectedOdometerCount, 0);
  assert.ok(state.odometerReadingCount >= 40);
});

test('backward odometer readings are rejected without discarding subsequent valid forward readings', () => {
  const events = [
    { id: 'a', type: 'odometer', odometerKm: 1000, occurredAt: '2026-01-01T08:00:00+03:30' },
    { id: 'b', type: 'odometer', odometerKm: 1090, occurredAt: '2026-01-02T08:00:00+03:30' },
    { id: 'bad', type: 'odometer', odometerKm: 1080, occurredAt: '2026-01-03T08:00:00+03:30' },
    { id: 'c', type: 'odometer', odometerKm: 1120, occurredAt: '2026-01-04T08:00:00+03:30' }
  ];
  const state = Odometer.getOdometerState(events);
  assert.equal(state.currentOdometerKm, 1120);
  assert.deepEqual(state.rejectedOdometerEvents.map(row => [row.event.id, row.reason]), [['bad', 'odometer-regression']]);
  assert.deepEqual(state.acceptedOdometerEvents.map(row => row.id), ['a', 'b', 'c']);
});

test('explicit odometer reset starts a new sequence and is not treated as a typo', () => {
  const events = [
    { id: 'before', type: 'odometer', odometerKm: 250000, occurredAt: '2026-01-01T08:00:00+03:30' },
    { id: 'reset', type: 'odometer', odometerKm: 120, odometerReset: true, occurredAt: '2026-01-02T08:00:00+03:30' },
    { id: 'after', type: 'odometer', odometerKm: 220, occurredAt: '2026-01-03T08:00:00+03:30' }
  ];
  const state = Odometer.getOdometerState(events);
  assert.equal(state.currentOdometerKm, 220);
  assert.equal(state.rejectedOdometerCount, 0);
  assert.equal(state.acceptedOdometerEvents[2]._garageOdometerSequence, 1);
});

test('trip additions update the projected odometer but a later absolute reading remains authoritative', () => {
  const events = [
    { id: 'a', type: 'odometer', odometerKm: 1000, occurredAt: '2026-01-01T08:00:00+03:30' },
    { id: 'trip', type: 'trip', distanceKm: 45.5, occurredAt: '2026-01-02T08:00:00+03:30' },
    { id: 'b', type: 'odometer', odometerKm: 1040, occurredAt: '2026-01-03T08:00:00+03:30' }
  ];
  assert.equal(Odometer.calculateCurrentOdometer(events), 1040);
  assert.equal(Odometer.getOdometerState(events).tripCount, 1);
});

test('future entries, invalid values and physically implausible jumps do not corrupt the current reading', () => {
  const events = [
    { id: 'a', type: 'odometer', odometerKm: 1000, occurredAt: '2026-01-01T08:00:00+03:30' },
    { id: 'bad', type: 'odometer', odometerKm: 99999999, occurredAt: '2026-01-01T08:01:00+03:30' },
    { id: 'future', type: 'odometer', odometerKm: 1100, occurredAt: '2026-01-03T08:00:00+03:30' }
  ];
  const state = Odometer.getOdometerState(events, { asOf: Date.parse('2026-01-02T08:00:00+03:30') });
  assert.equal(state.currentOdometerKm, 1000);
  assert.equal(state.rejectedOdometerCount, 1);
  assert.equal(state.acceptedOdometerEvents.length, 1);
});
