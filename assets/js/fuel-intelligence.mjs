/**
 * Shared fuel-consumption estimator for the browser dashboard and Telegram Worker.
 * It supports partial refuels. A refuel-to-refuel interval is an estimate unless
 * both ends are confirmed full; changes in tank level therefore remain a source
 * of uncertainty. No consumption is invented when the data cannot support it.
 */
const MIN_INTERVAL_KM = 40;
const MAX_INTERVAL_KM = 5000;
const MIN_RATE = 2;
const MAX_RATE = 25;

function epochOf(event) {
  const value = event?.occurredAt || (event?.date ? `${String(event.date).slice(0, 10)}T${event?.time || '12:00'}:00+03:30` : event?.createdAt);
  const timestamp = Date.parse(value || '');
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function finitePositive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function confidenceFor(intervals, sampleDistanceKm) {
  if (!intervals.length) return { key: 'none', label: 'دادهٔ کافی موجود نیست' };
  const exact = intervals.filter(item => item.measured);
  const estimated = intervals.length - exact.length;
  const exactDistance = exact.reduce((sum, item) => sum + item.distanceKm, 0);
  if (exact.length >= 3 && exactDistance >= 1000) return { key: 'high', label: 'اطمینان بالا · چند بازهٔ باک‌کامل' };
  if (exact.length >= 2 && exactDistance >= 500) return { key: 'good', label: 'اطمینان خوب · اندازه‌گیری باک‌کامل' };
  if (exact.length === 1 && exactDistance >= 250 && estimated === 0) return { key: 'medium', label: 'اطمینان متوسط · یک بازهٔ باک‌کامل' };
  if (estimated >= 6 && sampleDistanceKm >= 1200) return { key: 'high', label: 'اطمینان بالا · چند بازهٔ سوخت‌گیری جزئی' };
  if (estimated >= 4 && sampleDistanceKm >= 700) return { key: 'good', label: 'اطمینان متوسط رو به خوب · دادهٔ چندمرحله‌ای' };
  if (intervals.length >= 2 && sampleDistanceKm >= 300) return { key: 'medium', label: 'اطمینان متوسط · مدل در حال یادگیری' };
  return { key: 'low', label: 'برآورد اولیه · داده هنوز کم است' };
}

/**
 * Build a distance-weighted fuel model from all valid refuel records.
 * Full-to-full windows absorb every partial stop between the two full-tank
 * checkpoints and are treated as measured. Outside those windows, adjacent
 * partial-fill pairs provide a lower-confidence estimate. This prevents
 * counting the same fuel twice when a full-to-full interval contains partials.
 */
export function calculateFuelModel(events, options = {}) {
  const cutoffValue = Number(options.at);
  const cutoff = Number.isFinite(cutoffValue) ? cutoffValue : Infinity;
  const sourceEvents = Array.isArray(events) ? events : [];
  const refuels = sourceEvents
    .filter(event => {
      if (!event || event.type !== 'fuel' || epochOf(event) > cutoff) return false;
      const liters = Number(event.liters);
      return finitePositive(event.odometerKm) !== null && Number.isFinite(liters) && liters >= 0;
    })
    .sort((a, b) => epochOf(a) - epochOf(b) || Number(a.odometerKm) - Number(b.odometerKm));

  const intervals = [];
  const covered = new Set();
  const fullIndices = refuels.reduce((indices, event, index) => {
    if (event.fullTank === true) indices.push(index);
    return indices;
  }, []);

  // Exact measurement: from one confirmed full tank to the next, add every
  // intermediate partial fill and the litres needed to refill the second one.
  for (let cursor = 1; cursor < fullIndices.length; cursor += 1) {
    const fromIndex = fullIndices[cursor - 1];
    const toIndex = fullIndices[cursor];
    const from = refuels[fromIndex];
    const to = refuels[toIndex];
    const distanceKm = Number(to.odometerKm) - Number(from.odometerKm);
    const elapsedMs = epochOf(to) - epochOf(from);
    const liters = refuels.slice(fromIndex + 1, toIndex + 1)
      .reduce((sum, event) => sum + (finitePositive(event.liters) || 0), 0);
    const rate = distanceKm > 0 ? liters / distanceKm * 100 : null;
    if (distanceKm < MIN_INTERVAL_KM || distanceKm > MAX_INTERVAL_KM || elapsedMs <= 0 || liters <= 0 || rate < MIN_RATE || rate > MAX_RATE) continue;
    intervals.push({
      from, to, fromOdometerKm: Number(from.odometerKm), toOdometerKm: Number(to.odometerKm),
      distanceKm, liters, rate, measured: true, method: 'full-to-full',
      fromDate: from.jalaliDate || from.date || String(from.occurredAt || '').slice(0, 10),
      toDate: to.jalaliDate || to.date || String(to.occurredAt || '').slice(0, 10)
    });
    for (let index = fromIndex; index <= toIndex; index += 1) covered.add(index);
  }

  // Estimated measurement: use consecutive stops only when they are not part
  // of an exact full-to-full interval. The tank-level difference is unknown.
  for (let index = 1; index < refuels.length; index += 1) {
    if (covered.has(index - 1) || covered.has(index)) continue;
    const from = refuels[index - 1];
    const to = refuels[index];
    const distanceKm = Number(to.odometerKm) - Number(from.odometerKm);
    const elapsedMs = epochOf(to) - epochOf(from);
    const liters = finitePositive(to.liters) || 0;
    const rate = distanceKm > 0 ? liters / distanceKm * 100 : null;
    if (distanceKm < MIN_INTERVAL_KM || distanceKm > MAX_INTERVAL_KM || elapsedMs <= 0 || liters <= 0 || rate < MIN_RATE || rate > MAX_RATE) continue;
    intervals.push({
      from, to, fromOdometerKm: Number(from.odometerKm), toOdometerKm: Number(to.odometerKm),
      distanceKm, liters, rate, measured: false, method: 'partial-refuel-estimate',
      fromDate: from.jalaliDate || from.date || String(from.occurredAt || '').slice(0, 10),
      toDate: to.jalaliDate || to.date || String(to.occurredAt || '').slice(0, 10)
    });
  }

  intervals.sort((a, b) => epochOf(a.to) - epochOf(b.to));
  // Keep exact checkpoints intact; trim only obvious partial-fill outliers.
  const exactIntervals = intervals.filter(item => item.measured);
  const partialIntervals = intervals.filter(item => !item.measured);
  let acceptedPartial = partialIntervals;
  const middle = median(partialIntervals.map(item => item.rate));
  if (partialIntervals.length >= 4 && middle !== null) {
    const tolerance = Math.max(3, middle * 0.55);
    const trimmed = partialIntervals.filter(item => Math.abs(item.rate - middle) <= tolerance);
    if (trimmed.length >= Math.min(2, partialIntervals.length)) acceptedPartial = trimmed;
  }
  const accepted = [...exactIntervals, ...acceptedPartial].sort((a, b) => epochOf(a.to) - epochOf(b.to));
  const sampleDistanceKm = accepted.reduce((sum, item) => sum + item.distanceKm, 0);
  const sampleLiters = accepted.reduce((sum, item) => sum + item.liters, 0);
  const consumptionLPer100 = sampleDistanceKm > 0 ? sampleLiters / sampleDistanceKm * 100 : null;
  const confidence = confidenceFor(accepted, sampleDistanceKm);
  const recentPriced = sourceEvents
    .filter(event => event?.type === 'fuel' && epochOf(event) <= cutoff && finitePositive(event.liters) && finitePositive(event.costRial))
    .sort((a, b) => epochOf(b) - epochOf(a))
    .slice(0, 5);
  const pricedLiters = recentPriced.reduce((sum, item) => sum + Number(item.liters), 0);
  const pricedCostRial = recentPriced.reduce((sum, item) => sum + Number(item.costRial), 0);
  const priceTomanPerLiter = pricedLiters > 0 ? pricedCostRial / pricedLiters / 10 : null;
  const allExact = accepted.length > 0 && accepted.every(item => item.measured);

  return {
    consumptionLPer100,
    intervals: accepted,
    acceptedIntervals: accepted,
    rawIntervals: intervals,
    refuelCount: refuels.length,
    sampleIntervals: accepted.length,
    exactIntervals: exactIntervals.length,
    estimatedIntervals: acceptedPartial.length,
    sampleDistanceKm,
    sampleLiters,
    priceTomanPerLiter,
    confidenceKey: confidence.key,
    confidenceLabel: confidence.label,
    method: allExact ? 'full-to-full' : 'partial-refuel-estimate',
    hasEstimate: consumptionLPer100 !== null
  };
}

/** Estimate fuel and price for a known driven distance using only prior refuels. */
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
