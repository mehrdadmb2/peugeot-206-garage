import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import '../../assets/js/odometer-intelligence.js';
import '../../assets/js/persian-calendar.js';
import { calculateFuelModel } from '../../assets/js/fuel-intelligence.mjs';

const projectRoot = resolve(new URL('../..', import.meta.url).pathname);
const realEvents = () => {
  const index = JSON.parse(readFileSync(resolve(projectRoot, 'data/index.json'), 'utf8'));
  return index.months.flatMap(month => JSON.parse(readFileSync(resolve(projectRoot, `data/logs/${month}.json`), 'utf8')).events);
};

test('the live five-refuel history learns from every valid odometer sample without rewriting source events', () => {
  const events = realEvents();
  const original = events.find(event => event.id === 'b1762239-9e3e-4ef7-a1be-4167b6cc4b23');
  const originalKm = original.odometerKm;
  const model = calculateFuelModel(events, { tankCapacityLiters: 50 });
  assert.equal(model.refuelCount, 5);
  assert.ok(model.hasEstimate);
  assert.equal(model.odometerReadingCount, 42);
  assert.ok(model.odometerReadingsInFuelWindow >= 30);
  assert.ok(model.odometerDistanceKm >= 1000);
  assert.equal(model.lastOdometerKm, 432270);
  assert.ok(model.inferredRefuelOdometerCount >= 1);
  assert.ok(model.refuelOdometerAdjustments.some(row => row.eventId === original.id && row.inferredKm === 431992));
  assert.equal(original.odometerKm, originalKm, 'derived inference must not mutate the immutable source ledger');
  assert.ok(model.modelIntervals[0].intermediateOdometerReadingCount >= 30);
});

test('a new odometer entry updates the fuel model telemetry and current mileage even without a new fuel purchase', () => {
  const events = realEvents();
  const before = calculateFuelModel(events);
  const newReading = {
    id: 'new-odo-telemetry', type: 'odometer', odometerKm: 432300,
    occurredAt: '2026-11-21T08:00:00+03:30', createdAt: '2026-11-21T04:30:00.000Z',
    date: '2026-11-21', time: '08:00'
  };
  const after = calculateFuelModel([...events, newReading]);
  assert.equal(after.odometerReadingCount, before.odometerReadingCount + 1);
  assert.equal(after.lastOdometerKm, 432300);
  assert.equal(after.odometerDistanceKm, before.odometerDistanceKm + 30);
  assert.equal(after.refuelCount, before.refuelCount);
  assert.equal(after.consumptionLPer100, before.consumptionLPer100, 'odometer-only telemetry must not invent fuel burned or purchased');
});

test('a subsequent partial refuel becomes a new sample and updates the model distance, liters and price learning', () => {
  const events = realEvents();
  const before = calculateFuelModel(events);
  const newRefuel = {
    id: 'new-partial-refuel', type: 'fuel', odometerKm: 432400, liters: 15,
    costRial: 450000, fullTank: false,
    occurredAt: '2026-11-22T08:00:00+03:30', createdAt: '2026-11-22T04:30:00.000Z',
    date: '2026-11-22', time: '08:00'
  };
  const after = calculateFuelModel([...events, newRefuel]);
  assert.equal(after.refuelCount, before.refuelCount + 1);
  assert.equal(after.sampleDistanceKm, 1200);
  assert.notEqual(after.priceTomanPerLiter, before.priceTomanPerLiter);
  assert.ok(after.odometerReadingsInFuelWindow >= before.odometerReadingsInFuelWindow);
});

test('a refuel without an explicit odometer can use a nearby trusted odometer reading and expose its provenance', () => {
  const events = [
    { id: 'odo-1', type: 'odometer', odometerKm: 1000, occurredAt: '2026-01-01T10:00:00+03:30', date: '2026-01-01', createdAt: '2026-01-01T06:30:00Z' },
    { id: 'fuel-1', type: 'fuel', liters: 18, costRial: 270000, occurredAt: '2026-01-01T14:00:00+03:30', date: '2026-01-01' },
    { id: 'odo-2', type: 'odometer', odometerKm: 1200, occurredAt: '2026-01-10T10:00:00+03:30', date: '2026-01-10', createdAt: '2026-01-10T06:30:00Z' },
    { id: 'fuel-2', type: 'fuel', odometerKm: 1200, liters: 18, costRial: 270000, occurredAt: '2026-01-10T11:00:00+03:30', date: '2026-01-10' }
  ];
  const model = calculateFuelModel(events);
  assert.equal(model.inferredRefuelOdometerCount, 1);
  assert.equal(model.refuelOdometerAdjustments[0].eventId, 'fuel-1');
  assert.equal(model.refuelOdometerAdjustments[0].inferredKm, 1000);
  assert.equal(model.refuelCount, 2);
  assert.ok(model.hasEstimate);
});
