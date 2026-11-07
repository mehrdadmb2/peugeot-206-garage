/**
 * Vehicle cost model shared by GitHub Pages, dashboard snapshot builder and Worker.
 * Currency fields in the event ledger are IRR; all public calculations are Toman.
 * This model separates fuel, recorded wear/maintenance, other running costs and fines.
 * Unpaid fines are liabilities, not paid expenses. Fines are reported historically but
 * excluded from a forecast trip because they are exceptional and not distance-driven.
 */
import { calculateFuelModel, estimateFuelTrip } from './fuel-intelligence.mjs';

const positive = value => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
};

function eventTimestamp(event) {
  const raw = event?.occurredAt || event?.date || event?.createdAt || '';
  const time = Date.parse(raw);
  return Number.isFinite(time) ? time : 0;
}

function recordedAmountRial(event) {
  if (!event || (event.type === 'fine' && event.paid !== true)) return 0;
  const amountRial = positive(event.costRial) || positive(event.repairCostRial) || positive(event.amountRial);
  const amountTomanAsRial = (positive(event.costToman) || positive(event.amountToman) || positive(event.repairCostToman)) * 10;
  if (event.type === 'fine') return positive(event.paidAmountRial) || positive(event.paidAmountToman) * 10 || amountRial || amountTomanAsRial;
  if (event.type === 'issue') return positive(event.repairCostRial) || positive(event.repairCostToman) * 10 || amountRial || amountTomanAsRial;
  return amountRial || amountTomanAsRial;
}

function deduplicateGroupedCosts(events) {
  const groups = new Map();
  for (const event of events) {
    if (!event?.repairGroupId) continue;
    const key = String(event.repairGroupId);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(event);
  }
  const skipped = new Set();
  for (const grouped of groups.values()) {
    const summaryRows = grouped.filter(event => event.type === 'issue' && (positive(event.repairCostRial) > 0 || positive(event.repairCostToman) > 0));
    const detailRows = grouped.filter(event => event.type !== 'issue' && recordedAmountRial(event) > 0);
    // A parent issue's repairCost is a group total in the common workshop format.
    // When itemized costs exist, prefer the itemized rows instead of counting the
    // parent aggregate a second time. If no child amount exists, retain the parent.
    if (detailRows.length) summaryRows.forEach(event => skipped.add(event.id));
  }
  return skipped;
}

function categorize(event) {
  if (event.type === 'fuel') return 'fuel';
  if (event.type === 'fine') return 'fines';
  if (['service', 'part', 'repair', 'issue'].includes(event.type)) return 'wear';
  const category = String(event.expenseCategory || '').normalize('NFKC').toLocaleLowerCase('fa');
  if (/(تعمیر|سرویس|نگهداری|قطعه|استهلاک|اجرت|دستمزد|کارگر|maintenance|repair|service|part|labor|wage)/i.test(category)) return 'wear';
  if (/(بنزین|سوخت|fuel|petrol)/i.test(category)) return 'fuel';
  return 'other';
}

/**
 * Compute a fresh ownership cost model from the supplied full event set.
 * options: { purchaseOdometerKm, currentOdometerKm, distanceKm, tripDistanceKm }
 */
export function calculateVehicleCostModel(events, options = {}) {
  const rows = Array.isArray(events) ? events.filter(Boolean) : [];
  const skipped = deduplicateGroupedCosts(rows);
  const totals = { fuel: 0, wear: 0, other: 0, fines: 0 };
  const counts = { fuel: 0, wear: 0, other: 0, fines: 0, unpaidFines: 0 };
  let unpaidFinesRial = 0;
  const included = [];
  const unpriced = new Set(['fuel', 'service', 'part', 'repair', 'issue', 'expense', 'wash']);
  let unpricedCount = 0;

  for (const event of rows) {
    if (event.type === 'fine' && event.paid !== true) {
      unpaidFinesRial += positive(event.officialCurrentAmountRial) || positive(event.costRial) || positive(event.amountRial) || positive(event.officialCurrentAmountToman) * 10 || positive(event.costToman) * 10 || positive(event.amountToman) * 10 || 0;
      counts.unpaidFines += 1;
      continue;
    }
    const amount = skipped.has(event.id) ? 0 : recordedAmountRial(event);
    if (amount > 0) {
      const category = categorize(event);
      totals[category] += amount;
      counts[category] += 1;
      included.push({ id: event.id, type: event.type, category, amountRial: amount, occurredAt: event.occurredAt || event.date || null });
    } else if (unpriced.has(event.type) && !skipped.has(event.id)) {
      unpricedCount += 1;
    }
  }

  const purchaseKm = positive(options.purchaseOdometerKm);
  const currentKm = positive(options.currentOdometerKm);
  let distanceKm = positive(options.distanceKm);
  let distanceBasis = 'ثبت کیلومترشمار';
  if (currentKm > 0 && purchaseKm > 0 && currentKm >= purchaseKm) {
    distanceKm = currentKm - purchaseKm;
  } else if (!(distanceKm > 0)) {
    distanceKm = rows.reduce((sum, event) => sum + (event.type === 'trip' ? positive(event.distanceKm) : 0), 0);
    distanceBasis = 'جمع مسافت‌های ثبت‌شده؛ بدون مبنای کامل کیلومتر خرید';
  }

  const totalOperatingRial = totals.fuel + totals.wear + totals.other;
  const totalRecordedRial = totalOperatingRial + totals.fines;
  const toToman = rial => rial / 10;
  const perKm = (rial, km = distanceKm) => km > 0 ? toToman(rial) / km : null;
  const fuelModel = calculateFuelModel(rows);
  const wearPerKmToman = perKm(totals.wear);
  const otherPerKmToman = perKm(totals.other);
  const fuelRecordedPerKmToman = perKm(totals.fuel);
  // A forward-looking fuel cost/km must use measured/estimated consumption and
  // the actual unit price inferred from recent receipts, not historic fill-up
  // expenditure divided by the entire ownership distance (which may predate
  // fuel logging). Keep that historic ledger average as a separate metric.
  const modeledFuelPerKmToman = fuelModel.consumptionLPer100 != null && fuelModel.priceTomanPerLiter != null
    ? fuelModel.consumptionLPer100 * fuelModel.priceTomanPerLiter / 100
    : null;
  const fuelCostPerKmToman = modeledFuelPerKmToman ?? (counts.fuel > 0 ? fuelRecordedPerKmToman : null);
  const operatingComponentsPerKm = [fuelCostPerKmToman, wearPerKmToman, otherPerKmToman].filter(value => value != null);
  const operatingPerKmToman = operatingComponentsPerKm.length
    ? operatingComponentsPerKm.reduce((sum, value) => sum + value, 0)
    : null;
  const recordedOperatingPerKmToman = totalOperatingRial > 0 ? perKm(totalOperatingRial) : null;
  const allRecordedPerKmToman = totalRecordedRial > 0 ? perKm(totalRecordedRial) : null;
  const fuelCostPerKmBasis = modeledFuelPerKmToman != null
    ? 'مصرف سوخت مدل × نرخ موزون پنج سوخت‌گیری قیمت‌دار اخیر ÷ ۱۰۰'
    : counts.fuel > 0 ? 'هزینه سوخت ثبت‌شده ÷ مسافت از کیلومتر خرید (پوشش ناقص ممکن است)' : 'داده کافی برای هزینه سوخت هر کیلومتر موجود نیست';

  const tripDistanceKm = positive(options.tripDistanceKm);
  const fuelTrip = tripDistanceKm > 0 ? estimateFuelTrip(rows, tripDistanceKm) : null;
  const estimatedFuelToman = fuelTrip?.costToman ?? null;
  const estimatedWearToman = tripDistanceKm > 0 && wearPerKmToman !== null ? wearPerKmToman * tripDistanceKm : null;
  const estimatedOtherToman = tripDistanceKm > 0 && otherPerKmToman !== null ? otherPerKmToman * tripDistanceKm : null;
  const tripComponents = [estimatedFuelToman, estimatedWearToman, estimatedOtherToman].filter(value => value !== null);
  const estimatedTripOperatingToman = tripComponents.length ? tripComponents.reduce((sum, value) => sum + value, 0) : null;

  const latestFuel = rows.filter(event => event.type === 'fuel' && positive(event.liters) > 0 && (positive(event.costRial) || positive(event.amountRial) || positive(event.costToman) || positive(event.amountToman)))
    .sort((a, b) => eventTimestamp(b) - eventTimestamp(a))[0] || null;
  const latestFuelCostRial = latestFuel
    ? positive(latestFuel.costRial) || positive(latestFuel.amountRial) || positive(latestFuel.costToman) * 10 || positive(latestFuel.amountToman) * 10
    : null;
  const latestFuelUnitPriceToman = latestFuel ? latestFuelCostRial / positive(latestFuel.liters) / 10 : null;

  return {
    currency: 'Toman', currencySource: 'IRR event amounts ÷ 10',
    distanceKm, distanceBasis, purchaseOdometerKm: purchaseKm || null, currentOdometerKm: currentKm || null,
    totalFuelRial: totals.fuel, totalWearRial: totals.wear, totalOtherRial: totals.other,
    totalPaidFinesRial: totals.fines, unpaidFinesRial, totalOperatingRial, totalRecordedRial,
    totalFuelToman: toToman(totals.fuel), totalWearToman: toToman(totals.wear),
    totalOtherToman: toToman(totals.other), totalPaidFinesToman: toToman(totals.fines), unpaidFinesToman: toToman(unpaidFinesRial),
    totalOperatingToman: toToman(totalOperatingRial), totalRecordedToman: toToman(totalRecordedRial),
    counts, includedCostCount: included.length, unpricedEventCount: unpricedCount,
    skippedGroupedSummaryCount: skipped.size, included,
    fuelCostPerKmToman, fuelRecordedCostPerKmToman: fuelRecordedPerKmToman,
    modeledFuelCostPerKmToman: modeledFuelPerKmToman, fuelCostPerKmBasis,
    wearCostPerKmToman: wearPerKmToman,
    otherCostPerKmToman: otherPerKmToman,
    operatingCostPerKmToman: operatingPerKmToman,
    recordedOperatingCostPerKmToman: recordedOperatingPerKmToman,
    allRecordedCostPerKmToman: allRecordedPerKmToman,
    fuelModel,
    latestFuelUnitPriceToman,
    trip: tripDistanceKm > 0 ? {
      distanceKm: tripDistanceKm,
      fuelLiters: fuelTrip?.fuelLiters ?? null,
      fuelCostToman: estimatedFuelToman,
      fuelPriceTomanPerLiter: fuelTrip?.priceTomanPerLiter ?? fuelModel.priceTomanPerLiter ?? latestFuelUnitPriceToman,
      fuelConsumptionLPer100: fuelTrip?.consumptionLPer100 ?? fuelModel.consumptionLPer100 ?? null,
      fuelConfidenceKey: fuelTrip?.confidenceKey ?? fuelModel.confidenceKey,
      fuelConfidenceLabel: fuelTrip?.confidenceLabel ?? fuelModel.confidenceLabel,
      wearReserveToman: estimatedWearToman,
      otherRunningReserveToman: estimatedOtherToman,
      estimatedOperatingCostToman: estimatedTripOperatingToman,
      estimatedOperatingCostPerKmToman: estimatedTripOperatingToman !== null ? estimatedTripOperatingToman / tripDistanceKm : null,
      finesIncluded: false
    } : null,
    formula: {
      wearCostPerKm: 'جمع هزینه‌های قطعه + سرویس + تعمیر ÷ مسافت پیموده‌شده از کیلومتر خرید',
      operatingCostPerKm: 'هزینه بنزین مدل‌شده هر km + (هزینه قطعه/سرویس/تعمیر ثبت‌شده ÷ km از خرید) + (سایر هزینه‌های جاری ثبت‌شده ÷ km از خرید)',
      tripCost: 'مسافت × (مصرف L/100km × نرخ تومان/لیتر ÷ 100 + ذخیره استهلاک/نگهداری هر km + سایر هزینه‌های جاری هر km)',
      paidFines: 'گزارش تاریخی جداگانه؛ در پیش‌بینی سفر وارد نمی‌شود',
      unpaidFines: 'بدهی باز جدا از پرداخت‌های واقعی نگهداری می‌شود',
      limits: 'هزینه‌های تاریخی با مبلغ ثبت‌شده و بدون تعدیل تورمی محاسبه می‌شوند؛ افت ارزش بازار به قیمت خرید و ارزش روز نیاز دارد.'
    }
  };
}

export function calculateCurrentOdometerDelta(events, eventId, purchaseOdometerKm = null) {
  const odometers = (Array.isArray(events) ? events : [])
    .filter(event => event?.type === 'odometer' && positive(event.odometerKm) > 0)
    .sort((a, b) => eventTimestamp(a) - eventTimestamp(b) || String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
  const index = odometers.findIndex(event => String(event.id) === String(eventId));
  if (index < 0) return null;
  const current = Number(odometers[index].odometerKm);
  const previous = index > 0 ? Number(odometers[index - 1].odometerKm) : positive(purchaseOdometerKm);
  if (!(previous > 0) || current <= previous) return null;
  const delta = current - previous;
  return delta <= 5000 ? delta : null;
}
