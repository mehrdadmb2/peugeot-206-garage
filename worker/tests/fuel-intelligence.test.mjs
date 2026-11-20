import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateFuelModel, estimateFuelTrip } from '../../assets/js/fuel-intelligence.mjs';

const refuel = ({ id, date, km, liters, costRial = 0, fullTank = false, time = '10:00' }) => ({
  id, type: 'fuel', occurredAt: `${date}T${time}:00+03:30`, date, time,
  odometerKm: km, liters, costRial, fullTank
});

test('two partial refuels activate a bounded consumption estimate without full-tank checkpoints', () => {
  const events = [
    refuel({ id: 'a', date: '2026-10-22', km: 431200, liters: 36.5, costRial: 547500 }),
    refuel({ id: 'b', date: '2026-10-29', km: 431581, liters: 35, costRial: 525000 })
  ];
  const model = calculateFuelModel(events);
  assert.equal(model.hasEstimate, true);
  assert.equal(model.method, 'partial-tank-balance');
  assert.equal(model.refuelCount, 2);
  assert.equal(model.sampleIntervals, 1);
  assert.equal(model.partialOnlyRefuelCount, 2);
  assert.ok(model.consumptionMinLPer100 > 0);
  assert.ok(model.consumptionMaxLPer100 > model.consumptionMinLPer100);
  assert.ok(model.consumptionLPer100 >= model.consumptionMinLPer100);
  assert.ok(model.consumptionLPer100 <= model.consumptionMaxLPer100);
  assert.equal(model.priceTomanPerLiter, 1500);
  assert.equal(model.confidenceKey, 'low');
});

test('the five real partial refuels in the current vehicle history produce a bounded estimate', () => {
  const events = [
    refuel({ id: 'real-1', date: '2026-10-22', km: 431200, liters: 36.5, costRial: 547500 }),
    refuel({ id: 'real-2', date: '2026-10-29', km: 431581, liters: 35, costRial: 525000 }),
    refuel({ id: 'real-3', date: '2026-11-11', km: 431955, liters: 24.89, costRial: 373350 }),
    refuel({ id: 'real-4', date: '2026-11-19', km: 432193, liters: 35, costRial: 1050000 }),
    refuel({ id: 'real-5', date: '2026-11-20', km: 432261, liters: 10.48, costRial: 314400 })
  ];
  const model = calculateFuelModel(events, { tankCapacityLiters: 50 });
  assert.equal(model.hasEstimate, true);
  assert.equal(model.refuelCount, 5);
  assert.equal(model.sampleDistanceKm, 1061);
  assert.ok(Math.abs(model.consumptionMinLPer100 - 8.65881244) < 0.0001);
  assert.ok(Math.abs(model.consumptionMaxLPer100 - 12.27992460) < 0.0001);
  assert.ok(Math.abs(model.consumptionLPer100 - 10.46936852) < 0.0001);
  assert.equal(model.confidenceKey, 'medium');
});

test('many partial top-ups are aggregated into one continuous tank-balance segment', () => {
  const events = [
    refuel({ id: 'a', date: '2026-09-01', km: 1000, liters: 20 }),
    refuel({ id: 'b', date: '2026-09-11', km: 1200, liters: 20 }),
    refuel({ id: 'c', date: '2026-09-21', km: 1400, liters: 20 }),
    refuel({ id: 'd', date: '2026-10-01', km: 1600, liters: 20 }),
    refuel({ id: 'e', date: '2026-10-11', km: 1800, liters: 20 })
  ];
  const model = calculateFuelModel(events);
  assert.equal(model.hasEstimate, true);
  assert.equal(model.sampleIntervals, 1);
  assert.equal(model.modelIntervals[0].refuelCount, 5);
  assert.equal(model.sampleDistanceKm, 800);
  assert.ok(model.consumptionMinLPer100 >= 0);
  assert.ok(model.consumptionMaxLPer100 <= 30);
  assert.equal(model.method, 'partial-tank-balance');
});

test('rapid nearby fuel-station visits are not treated as an empty tank or separate consumption cycles', () => {
  const events = [
    refuel({ id: 'a', date: '2026-10-01', time: '08:00', km: 1000, liters: 12 }),
    refuel({ id: 'b', date: '2026-10-01', time: '10:00', km: 1008, liters: 8 }),
    refuel({ id: 'c', date: '2026-10-01', time: '18:00', km: 1150, liters: 15 })
  ];
  const model = calculateFuelModel(events);
  assert.equal(model.rapidRefuelPairCount, 1);
  assert.equal(model.refuelCount, 3);
  assert.equal(model.hasEstimate, true);
  assert.equal(model.modelIntervals.length, 1);
  assert.equal(model.modelIntervals[0].refuelCount, 3);
  assert.equal(model.modelIntervals[0].distanceKm, 150);
  assert.ok(model.consumptionMaxLPer100 <= 30);
});

test('full-to-full windows include intermediate partial top-ups once and keep trailing partial history visible', () => {
  const events = [
    refuel({ id: 'full-a', date: '2026-08-01', km: 1000, liters: 30, fullTank: true }),
    refuel({ id: 'partial-a', date: '2026-08-06', km: 1100, liters: 10 }),
    refuel({ id: 'partial-b', date: '2026-08-11', km: 1200, liters: 15 }),
    refuel({ id: 'full-b', date: '2026-08-16', km: 1500, liters: 50, fullTank: true }),
    refuel({ id: 'partial-c', date: '2026-08-20', km: 1600, liters: 10 })
  ];
  const model = calculateFuelModel(events);
  const exact = model.acceptedIntervals.find(item => item.measured);
  const partial = model.acceptedIntervals.find(item => !item.measured);
  assert.ok(exact);
  assert.equal(exact.distanceKm, 500);
  assert.equal(exact.liters, 75);
  assert.equal(exact.rate, 15);
  assert.ok(partial, 'the trailing partial interval remains available as a supplementary bound');
  assert.equal(partial.distanceKm, 100);
  assert.equal(model.method, 'full-to-full');
  assert.equal(model.consumptionLPer100, 15, 'exact intervals dominate the headline rate');
});

test('short-distance refuels stay recorded but are not used as a consumption interval', () => {
  const events = [
    refuel({ id: 'a', date: '2026-10-01', km: 1000, liters: 12 }),
    refuel({ id: 'b', date: '2026-10-01', km: 1020, liters: 8 })
  ];
  const model = calculateFuelModel(events);
  assert.equal(model.rapidRefuelPairCount, 1);
  assert.equal(model.refuelCount, 2);
  assert.equal(model.hasEstimate, false);
  assert.equal(estimateFuelTrip(events, 25), null);
});

test('impossible tank balances, over-capacity purchases and odometer regressions are not silently trusted', () => {
  const impossible = [
    refuel({ id: 'a', date: '2026-10-01', km: 1000, liters: 25 }),
    refuel({ id: 'b', date: '2026-10-02', km: 1020, liters: 20 }),
    refuel({ id: 'c', date: '2026-10-03', km: 1100, liters: 45 })
  ];
  const model = calculateFuelModel(impossible);
  assert.equal(model.hasEstimate, false);
  assert.ok(model.rejectedIntervals.length > 0);

  const oversized = calculateFuelModel([
    refuel({ id: 'a', date: '2026-10-01', km: 1000, liters: 51 }),
    refuel({ id: 'b', date: '2026-10-05', km: 1200, liters: 20 })
  ]);
  assert.equal(oversized.invalidRefuelCount, 1);

  const odometerRegression = calculateFuelModel([
    refuel({ id: 'a', date: '2026-10-01', km: 1000, liters: 20 }),
    refuel({ id: 'b', date: '2026-10-02', km: 1200, liters: 20 }),
    refuel({ id: 'c', date: '2026-10-03', km: 900, liters: 20 }),
    refuel({ id: 'd', date: '2026-10-04', km: 1200, liters: 20 })
  ]);
  assert.equal(odometerRegression.hasEstimate, true);
  assert.equal(odometerRegression.invalidRefuelCount, 1, 'the regressed odometer record is excluded and surfaced as a data-quality warning');
  assert.ok(odometerRegression.sampleDistanceKm <= 500);
});

test('trip calculator carries the model uncertainty through to litres and money', () => {
  const events = [
    refuel({ id: 'a', date: '2026-10-22', km: 431200, liters: 36.5, costRial: 547500 }),
    refuel({ id: 'b', date: '2026-10-29', km: 431581, liters: 35, costRial: 525000 })
  ];
  const estimate = estimateFuelTrip(events, 100);
  assert.ok(estimate);
  assert.ok(estimate.minFuelLiters < estimate.fuelLiters);
  assert.ok(estimate.maxFuelLiters > estimate.fuelLiters);
  assert.ok(estimate.minCostToman < estimate.costToman);
  assert.ok(estimate.maxCostToman > estimate.costToman);
  assert.equal(estimate.sampleRefuels, 2);
});

test('weighted fuel price supports Toman-denominated records and the partial balance model', () => {
  const events = [
    { id: 'a', type: 'fuel', occurredAt: '2026-10-01T10:00:00+03:30', odometerKm: 1000, liters: 40, costToman: 60000 },
    { id: 'b', type: 'fuel', occurredAt: '2026-10-10T10:00:00+03:30', odometerKm: 1200, liters: 40, amountToman: 64000 }
  ];
  const model = calculateFuelModel(events);
  assert.equal(model.priceTomanPerLiter, 1550);
  assert.equal(model.hasEstimate, true);
});
