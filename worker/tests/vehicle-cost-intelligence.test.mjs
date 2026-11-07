import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateCurrentOdometerDelta, calculateVehicleCostModel } from '../../assets/js/vehicle-cost-intelligence.mjs';

const refuel = (id, date, km, liters, costRial) => ({
  id, type: 'fuel', occurredAt: `${date}T10:00:00+03:30`, date,
  odometerKm: km, liters, costRial, fullTank: false
});

test('ownership cost model separates fuel, wear, other operating costs and paid fines', () => {
  const events = [
    refuel('f1', '2026-01-01', 1000, 20, 300000),
    refuel('f2', '2026-01-10', 1200, 20, 320000),
    { id: 'p1', type: 'part', costRial: 500000, occurredAt: '2026-01-11T10:00:00+03:30' },
    { id: 's1', type: 'service', costRial: 100000, occurredAt: '2026-01-12T10:00:00+03:30' },
    { id: 'e1', type: 'expense', costRial: 50000, occurredAt: '2026-01-13T10:00:00+03:30' },
    { id: 'fine-paid', type: 'fine', paid: true, costRial: 100000, occurredAt: '2026-01-14T10:00:00+03:30' },
    { id: 'fine-unpaid', type: 'fine', paid: false, costRial: 900000, occurredAt: '2026-01-15T10:00:00+03:30' }
  ];
  const model = calculateVehicleCostModel(events, { purchaseOdometerKm: 1000, currentOdometerKm: 2000, tripDistanceKm: 100 });
  assert.equal(model.distanceKm, 1000);
  assert.equal(model.totalFuelRial, 620000);
  assert.equal(model.totalWearRial, 600000);
  assert.equal(model.totalOtherRial, 50000);
  assert.equal(model.totalPaidFinesRial, 100000);
  assert.equal(model.totalOperatingRial, 1270000);
  assert.equal(model.totalRecordedRial, 1370000);
  assert.equal(model.wearCostPerKmToman, 60);
  assert.equal(model.fuelCostPerKmToman, 155);
  assert.equal(model.recordedOperatingCostPerKmToman, 127);
  assert.equal(model.operatingCostPerKmToman, 220);
  assert.equal(model.allRecordedCostPerKmToman, 137);
  assert.ok(model.trip.estimatedOperatingCostToman > model.trip.fuelCostToman);
  assert.equal(model.trip.finesIncluded, false);
  assert.equal(model.fuelCostPerKmBasis.includes('نرخ موزون'), true);
});

test('group summary repair cost is not double-counted when itemized repair rows exist', () => {
  const events = [
    { id: 'issue-parent', type: 'issue', repairGroupId: 'g1', repairCostRial: 900000, occurredAt: '2026-02-01T10:00:00+03:30' },
    { id: 'part-child', type: 'part', repairGroupId: 'g1', costRial: 400000, occurredAt: '2026-02-01T10:00:00+03:30' },
    { id: 'labor-child', type: 'repair', repairGroupId: 'g1', costRial: 500000, occurredAt: '2026-02-01T10:00:00+03:30' }
  ];
  const model = calculateVehicleCostModel(events, { purchaseOdometerKm: 1000, currentOdometerKm: 2000 });
  assert.equal(model.totalWearRial, 900000);
  assert.equal(model.skippedGroupedSummaryCount, 1);
  assert.equal(model.includedCostCount, 2);
});

test('unpaid fines and unpriced service records do not become paid cost', () => {
  const events = [
    { id: 'fine', type: 'fine', paid: false, costRial: 200000 },
    { id: 'service-no-cost', type: 'service', description: 'بازدید بدون مبلغ' },
    { id: 'note', type: 'note', description: 'یادداشت' }
  ];
  const model = calculateVehicleCostModel(events, { purchaseOdometerKm: 1000, currentOdometerKm: 1100 });
  assert.equal(model.totalRecordedRial, 0);
  assert.equal(model.totalPaidFinesRial, 0);
  assert.equal(model.unpricedEventCount, 1);
});

test('trip estimate and unit fuel rate update when new refuel data arrives', () => {
  const base = [
    refuel('a', '2026-03-01', 1000, 20, 300000),
    refuel('b', '2026-03-10', 1200, 20, 320000),
    { id: 'part', type: 'part', costRial: 100000, occurredAt: '2026-03-11T10:00:00+03:30' }
  ];
  const next = [...base, refuel('c', '2026-03-20', 1400, 22, 440000)];
  const early = calculateVehicleCostModel(base, { purchaseOdometerKm: 1000, currentOdometerKm: 1400, tripDistanceKm: 100 });
  const refreshed = calculateVehicleCostModel(next, { purchaseOdometerKm: 1000, currentOdometerKm: 1400, tripDistanceKm: 100 });
  assert.notEqual(early.trip.fuelPriceTomanPerLiter, refreshed.trip.fuelPriceTomanPerLiter);
  assert.notEqual(early.totalFuelRial, refreshed.totalFuelRial);
});

test('odometer distance is derived from the current event timeline, not stale saved deltas', () => {
  const events = [
    { id: 'odo-1', type: 'odometer', odometerKm: 1000, occurredAt: '2026-04-01T10:00:00+03:30' },
    { id: 'odo-2', type: 'odometer', odometerKm: 1080, deltaSincePreviousKm: 999, occurredAt: '2026-04-02T10:00:00+03:30' },
    { id: 'odo-3', type: 'odometer', odometerKm: 1100, deltaSincePreviousKm: 999, occurredAt: '2026-04-03T10:00:00+03:30' }
  ];
  assert.equal(calculateCurrentOdometerDelta(events, 'odo-2', 900), 80);
  assert.equal(calculateCurrentOdometerDelta(events, 'odo-3', 900), 20);
  const edited = events.map(event => event.id === 'odo-2' ? { ...event, odometerKm: 1060 } : event);
  assert.equal(calculateCurrentOdometerDelta(edited, 'odo-3', 900), 40);
});


test('editing or removing a recorded expense rebuilds historical per-kilometre and trip reserves', () => {
  const base = [
    refuel('f1', '2026-05-01', 1000, 20, 300000),
    refuel('f2', '2026-05-10', 1200, 20, 300000),
    { id: 'repair', type: 'service', costRial: 1000000, occurredAt: '2026-05-11T10:00:00+03:30' }
  ];
  const original = calculateVehicleCostModel(base, { purchaseOdometerKm: 1000, currentOdometerKm: 2000, tripDistanceKm: 100 });
  const edited = calculateVehicleCostModel(base.map(event => event.id === 'repair' ? { ...event, costRial: 2500000 } : event), { purchaseOdometerKm: 1000, currentOdometerKm: 2000, tripDistanceKm: 100 });
  const deleted = calculateVehicleCostModel(base.filter(event => event.id !== 'repair'), { purchaseOdometerKm: 1000, currentOdometerKm: 2000, tripDistanceKm: 100 });
  assert.ok(edited.wearCostPerKmToman > original.wearCostPerKmToman);
  assert.ok(edited.trip.wearReserveToman > original.trip.wearReserveToman);
  assert.equal(deleted.totalWearRial, 0);
  assert.equal(deleted.trip.wearReserveToman, 0);
});


test('Toman-denominated amounts, actual paid fine amounts and open fine liabilities are normalized correctly', () => {
  const events = [
    { id: 'expense-toman', type: 'expense', amountToman: 1200, expenseCategory: 'تعمیر و نگهداری' },
    { id: 'expense-labor', type: 'expense', amountRial: 30000, expenseCategory: 'labor' },
    { id: 'fine-paid', type: 'fine', paid: true, costRial: 1000000, paidAmountToman: 90000 },
    { id: 'fine-open', type: 'fine', paid: false, costRial: 1000000, officialCurrentAmountRial: 1200000 },
    { id: 'issue-summary', type: 'issue', repairGroupId: 'toman-group', repairCostToman: 4000 },
    { id: 'issue-detail', type: 'part', repairGroupId: 'toman-group', costRial: 50000 },
    { id: 'fuel-unpriced', type: 'fuel', liters: 8, odometerKm: 1200 }
  ];
  const model = calculateVehicleCostModel(events, { purchaseOdometerKm: 1000, currentOdometerKm: 2000 });
  assert.equal(model.totalWearRial, 92000);
  assert.equal(model.totalPaidFinesRial, 900000);
  assert.equal(model.unpaidFinesRial, 1200000);
  assert.equal(model.totalRecordedRial, 992000);
  assert.equal(model.unpricedEventCount, 1);
  assert.equal(model.skippedGroupedSummaryCount, 1);
});
