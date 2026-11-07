import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateFuelModel, estimateFuelTrip } from '../../assets/js/fuel-intelligence.mjs';

const refuel = ({ id, date, km, liters, costRial = 0, fullTank = false }) => ({
  id, type: 'fuel', occurredAt: `${date}T10:00:00+03:30`, date, odometerKm: km, liters, costRial, fullTank
});

test('two partial refuels produce a first approximate consumption and trip cost without full tanks', () => {
  const events = [
    refuel({ id: 'a', date: '2026-10-22', km: 431200, liters: 36.5, costRial: 547500 }),
    refuel({ id: 'b', date: '2026-10-29', km: 431581, liters: 35, costRial: 525000 })
  ];
  const model = calculateFuelModel(events);
  assert.equal(model.hasEstimate, true);
  assert.equal(model.refuelCount, 2);
  assert.equal(model.sampleIntervals, 1);
  assert.equal(model.consumptionLPer100, 35 / 381 * 100);
  assert.equal(model.priceTomanPerLiter, 1500);
  assert.equal(model.confidenceKey, 'low');
  const trip = estimateFuelTrip(events, 40);
  assert.equal(trip.fuelLiters, 40 * (35 / 381 * 100) / 100);
  assert.equal(trip.costRial, 55118);
});

test('partial-refuel estimate gains confidence as additional non-overlapping samples accumulate', () => {
  const sparse = [
    refuel({ id: 'a', date: '2026-09-01', km: 1000, liters: 20 }),
    refuel({ id: 'b', date: '2026-09-11', km: 1200, liters: 20 }),
    refuel({ id: 'c', date: '2026-09-21', km: 1400, liters: 20 })
  ];
  const rich = [
    ...sparse,
    refuel({ id: 'd', date: '2026-10-01', km: 1600, liters: 20 }),
    refuel({ id: 'e', date: '2026-10-11', km: 1800, liters: 20 })
  ];
  const early = calculateFuelModel(sparse);
  const learned = calculateFuelModel(rich);
  assert.equal(early.consumptionLPer100, 10);
  assert.equal(learned.consumptionLPer100, 10);
  assert.equal(early.confidenceKey, 'medium');
  assert.equal(learned.confidenceKey, 'good');
  assert.equal(learned.sampleIntervals, 4);
});

test('full-to-full windows include every partial top-up exactly once', () => {
  const events = [
    refuel({ id: 'full-a', date: '2026-08-01', km: 1000, liters: 30, fullTank: true }),
    refuel({ id: 'partial-a', date: '2026-08-06', km: 1100, liters: 10 }),
    refuel({ id: 'partial-b', date: '2026-08-11', km: 1200, liters: 15 }),
    refuel({ id: 'full-b', date: '2026-08-16', km: 1500, liters: 50, fullTank: true }),
    refuel({ id: 'partial-c', date: '2026-08-20', km: 1600, liters: 10 })
  ];
  const model = calculateFuelModel(events);
  const exact = model.acceptedIntervals.find(item => item.measured);
  assert.ok(exact);
  assert.equal(exact.distanceKm, 500);
  assert.equal(exact.liters, 75);
  assert.equal(exact.rate, 15);
  assert.equal(model.acceptedIntervals.filter(item => item.measured).length, 1);
  assert.equal(model.acceptedIntervals.filter(item => !item.measured).length, 0);
  assert.equal(model.method, 'full-to-full');
});

test('invalid odometer spans and implausible partial-fill rates are excluded', () => {
  const events = [
    refuel({ id: 'a', date: '2026-10-01', km: 1000, liters: 25 }),
    refuel({ id: 'b', date: '2026-10-02', km: 1020, liters: 20 }),
    refuel({ id: 'c', date: '2026-10-03', km: 1100, liters: 45 })
  ];
  const model = calculateFuelModel(events);
  assert.equal(model.sampleIntervals, 0);
  assert.equal(model.hasEstimate, false);
  assert.equal(estimateFuelTrip(events, 50), null);
});


test('weighted fuel price also supports imported Toman-denominated refuel records', () => {
  const events = [
    { id: 'a', type: 'fuel', occurredAt: '2026-10-01T10:00:00+03:30', odometerKm: 1000, liters: 40, costToman: 60000 },
    { id: 'b', type: 'fuel', occurredAt: '2026-10-10T10:00:00+03:30', odometerKm: 1200, liters: 40, amountToman: 64000 }
  ];
  const model = calculateFuelModel(events);
  assert.equal(model.priceTomanPerLiter, 1550);
  const trip = estimateFuelTrip(events, 100);
  assert.equal(trip.priceTomanPerLiter, 1550);
  assert.equal(trip.costToman, trip.fuelLiters * 1550);
});
