/**
 * Conservative fuel-consumption engine shared by the dashboard and Worker.
 *
 * Consumption is measured only between two user-confirmed full-tank checkpoints.
 * Every refuel between those checkpoints is included exactly once. A sequence of
 * partial top-ups is deliberately NOT interpreted as fuel consumed: the amount
 * remaining in the tank before/after each visit is unknown, even when visits are
 * close together in time or distance.
 */
const MIN_INTERVAL_KM = 40;
const MAX_INTERVAL_KM = 5000;
const MIN_RATE = 2;
const MAX_RATE = 25;
const RAPID_REFUEL_MAX_HOURS = 6;
const RAPID_REFUEL_MAX_DISTANCE_KM = 30;

function epochOf(event) {
  const value = event?.occurredAt || (event?.date ? `${String(event.date).slice(0, 10)}T${event?.time || '12:00'}:00+03:30` : event?.createdAt);
  const timestamp = Date.parse(value || '');
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function finitePositive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function finiteNonNegative(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function refuelCostRial(event) {
  return finitePositive(event?.costRial)
    || finitePositive(event?.amountRial)
    || finitePositive(event?.costToman) * 10
    || finitePositive(event?.amountToman) * 10
    || null;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function confidenceFor(intervals, sampleDistanceKm) {
  if (!intervals.length) return { key: 'none', label: 'دادهٔ دقیق کافی نیست · دو ثبت باک‌کامل لازم است' };
  const exactDistance = intervals.reduce((sum, item) => sum + item.distanceKm, 0);
  if (intervals.length >= 3 && exactDistance >= 1000) return { key: 'high', label: 'اطمینان بالا · حداقل سه بازهٔ باک‌کامل' };
  if (intervals.length >= 2 && exactDistance >= 500) return { key: 'good', label: 'اطمینان خوب · چند بازهٔ باک‌کامل' };
  if (intervals.length === 1 && exactDistance >= 250) return { key: 'medium', label: 'اطمینان متوسط · یک بازهٔ باک‌کامل' };
  return { key: 'low', label: 'اطمینان محدود · فقط یک بازهٔ کوتاه' };
}

function findRapidRefuelPairs(refuels) {
  let count = 0;
  const pairs = [];
  for (let index = 1; index < refuels.length; index += 1) {
    const from = refuels[index - 1];
    const to = refuels[index];
    const elapsedHours = (epochOf(to) - epochOf(from)) / 3_600_000;
    const distanceKm = Number(to.odometerKm) - Number(from.odometerKm);
    if (elapsedHours >= 0 && elapsedHours <= RAPID_REFUEL_MAX_HOURS && distanceKm >= 0 && distanceKm <= RAPID_REFUEL_MAX_DISTANCE_KM) {
      count += 1;
      pairs.push({ from, to, elapsedHours, distanceKm });
    }
  }
  return { count, pairs };
}

/**
 * Calculate a distance-weighted model from full-to-full measurements only.
 * Partial fills inside a measured full-to-full window are included in its total.
 * Partial-only sequences remain useful for cost totals and unit-price trends, but
 * do not generate a consumption figure or a trip fuel forecast.
 */
export function calculateFuelModel(events, options = {}) {
  const cutoffValue = Number(options.at);
  const cutoff = Number.isFinite(cutoffValue) ? cutoffValue : Infinity;
  const sourceEvents = Array.isArray(events) ? events : [];
  const refuels = sourceEvents
    .filter(event => {
      if (!event || event.type !== 'fuel' || epochOf(event) > cutoff) return false;
      const liters = finiteNonNegative(event.liters);
      return finitePositive(event.odometerKm) !== null && liters !== null && (liters > 0 || event.fullTank === true);
    })
    .sort((a, b) => epochOf(a) - epochOf(b) || Number(a.odometerKm) - Number(b.odometerKm));

  const candidates = [];
  const fullIndices = refuels.reduce((indices, event, index) => {
    if (event.fullTank === true) indices.push(index);
    return indices;
  }, []);

  for (let cursor = 1; cursor < fullIndices.length; cursor += 1) {
    const fromIndex = fullIndices[cursor - 1];
    const toIndex = fullIndices[cursor];
    const from = refuels[fromIndex];
    const to = refuels[toIndex];
    const distanceKm = Number(to.odometerKm) - Number(from.odometerKm);
    const elapsedMs = epochOf(to) - epochOf(from);
    const windowEvents = refuels.slice(fromIndex + 1, toIndex + 1);
    const liters = windowEvents.reduce((sum, event) => sum + (finiteNonNegative(event.liters) || 0), 0);
    const rate = distanceKm > 0 ? liters / distanceKm * 100 : null;
    const valid = distanceKm >= MIN_INTERVAL_KM && distanceKm <= MAX_INTERVAL_KM && elapsedMs > 0 && liters > 0 && rate >= MIN_RATE && rate <= MAX_RATE;
    candidates.push({
      from, to,
      fromOdometerKm: Number(from.odometerKm),
      toOdometerKm: Number(to.odometerKm),
      distanceKm, liters, rate,
      measured: true,
      valid,
      rejectedReason: valid ? null : distanceKm < MIN_INTERVAL_KM || distanceKm > MAX_INTERVAL_KM ? 'invalid-distance' : elapsedMs <= 0 ? 'invalid-time' : liters <= 0 ? 'missing-liters' : 'implausible-rate',
      method: 'full-to-full',
      refuelCount: windowEvents.length,
      fromDate: from.jalaliDate || from.date || String(from.occurredAt || '').slice(0, 10),
      toDate: to.jalaliDate || to.date || String(to.occurredAt || '').slice(0, 10)
    });
  }

  // Remove only strong statistical outliers when there are enough independent
  // measurements. Never trim a model built from one, two or three intervals.
  const plausible = candidates.filter(item => item.valid);
  let accepted = plausible;
  const middle = median(plausible.map(item => item.rate));
  if (plausible.length >= 4 && middle !== null) {
    const deviations = plausible.map(item => Math.abs(item.rate - middle));
    const mad = median(deviations) || 0;
    const tolerance = Math.max(4.5, middle * 0.45, mad * 3.5);
    const trimmed = plausible.filter(item => Math.abs(item.rate - middle) <= tolerance);
    if (trimmed.length >= 3 && trimmed.length < plausible.length) accepted = trimmed;
  }
  const acceptedSet = new Set(accepted);
  const intervals = accepted.map(item => ({ ...item, outlier: false }));
  const rejectedIntervals = candidates.filter(item => !acceptedSet.has(item)).map(item => ({ ...item, outlier: item.valid }));
  const sampleDistanceKm = intervals.reduce((sum, item) => sum + item.distanceKm, 0);
  const sampleLiters = intervals.reduce((sum, item) => sum + item.liters, 0);
  const consumptionLPer100 = sampleDistanceKm > 0 ? sampleLiters / sampleDistanceKm * 100 : null;
  const confidence = confidenceFor(intervals, sampleDistanceKm);
  const recentPriced = sourceEvents
    .filter(event => event?.type === 'fuel' && epochOf(event) <= cutoff && finitePositive(event.liters) && refuelCostRial(event))
    .sort((a, b) => epochOf(b) - epochOf(a))
    .slice(0, 5);
  const pricedLiters = recentPriced.reduce((sum, item) => sum + Number(item.liters), 0);
  const pricedCostRial = recentPriced.reduce((sum, item) => sum + refuelCostRial(item), 0);
  const priceTomanPerLiter = pricedLiters > 0 ? pricedCostRial / pricedLiters / 10 : null;
  const rapid = findRapidRefuelPairs(refuels);
  const coveredIndices = new Set();
  for (const item of intervals) {
    const start = refuels.indexOf(item.from);
    const end = refuels.indexOf(item.to);
    if (start >= 0 && end >= start) for (let index = start; index <= end; index += 1) coveredIndices.add(index);
  }
  const unmeasuredRefuelCount = refuels.reduce((sum, event, index) => sum + (coveredIndices.has(index) ? 0 : 1), 0);

  return {
    consumptionLPer100,
    intervals,
    acceptedIntervals: intervals,
    rawIntervals: candidates,
    rejectedIntervals,
    refuelCount: refuels.length,
    sampleIntervals: intervals.length,
    exactIntervals: intervals.length,
    estimatedIntervals: 0,
    sampleDistanceKm,
    sampleLiters,
    priceTomanPerLiter,
    confidenceKey: confidence.key,
    confidenceLabel: confidence.label,
    method: intervals.length ? 'full-to-full' : 'insufficient-full-tank-checkpoints',
    hasEstimate: consumptionLPer100 !== null,
    rapidRefuelPairCount: rapid.count,
    rapidRefuelPairs: rapid.pairs,
    unmeasuredRefuelCount,
    partialOnlyRefuelCount: refuels.filter(event => event.fullTank !== true).length,
    ignoredPartialPairCount: Math.max(0, refuels.length - fullIndices.length - intervals.reduce((sum, item) => sum + item.refuelCount - 1, 0))
  };
}

/** Estimate fuel and price for a known driven distance using only prior measured intervals. */
export function estimateFuelTrip(events, distanceKm, options = {}) {
  const distance = finitePositive(distanceKm);
  if (distance === null) return null;
  const model = calculateFuelModel(events, options);
  if (!model.hasEstimate) return null;
  const fuelLiters = distance * model.consumptionLPer100 / 100;
  const costToman = model.priceTomanPerLiter === null ? null : fuelLiters * model.priceTomanPerLiter;
  return {
    distanceKm: distance,
    consumptionLPer100: model.consumptionLPer100,
    fuelLiters,
    priceTomanPerLiter: model.priceTomanPerLiter,
    costToman,
    costRial: costToman === null ? null : Math.round(costToman * 10),
    confidenceKey: model.confidenceKey,
    confidenceLabel: model.confidenceLabel,
    sampleRefuels: model.refuelCount,
    sampleIntervals: model.sampleIntervals,
    sampleDistanceKm: model.sampleDistanceKm,
    method: model.method,
    estimated: true
  };
}
