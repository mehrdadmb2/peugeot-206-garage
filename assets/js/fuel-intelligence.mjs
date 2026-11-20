/**
 * Fuel model shared by GitHub Pages, the dashboard snapshot builder and Worker.
 *
 * A full tank is an optional strong measurement, never a prerequisite.
 * Partial refuels are modeled with a tank-inventory balance:
 *   fuel burned = fuel added after the first observation
 *                 + tank level after first observation
 *                 - tank level after last observation.
 *
 * For a partial fill, post-refuel inventory is bounded by [liters bought, tank
 * capacity]. That produces a physically grounded consumption interval instead
 * of pretending the tank was empty at each station. Full-tank checkpoints make
 * the corresponding interval exact. The dashboard reports the point estimate
 * together with min/max bounds and confidence; it must not present a partial-
 * fill estimate as an ECU measurement.
 */

const DEFAULT_TANK_CAPACITY_LITERS = 50;
const MIN_INTERVAL_KM = 100;
const MAX_INTERVAL_KM = 5000;
const MAX_CONSUMPTION_L_PER_100 = 30;
const RAPID_REFUEL_MAX_HOURS = 6;
const RAPID_REFUEL_MAX_DISTANCE_KM = 30;
const ODOMETER_INFERENCE_MAX_HOURS = 36;
const ODOMETER_INFERENCE_MAX_DISTANCE_KM = 100;

function odometerApi() { return globalThis.GarageOdometerIntelligence || null; }
function epochOf(event) {
  const api = odometerApi();
  if (api?.eventTimelineEpoch) return api.eventTimelineEpoch(event);
  const value = event?.occurredAt || (event?.date ? `${String(event.date).slice(0, 10)}T${event?.time || '12:00'}:00+03:30` : event?.createdAt);
  const timestamp = Date.parse(value || '');
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function enrichRefuelsWithOdometer(sourceEvents, odoState, cutoff) {
  const readings = (odoState?.acceptedOdometerEvents || []).filter(event => epochOf(event) <= cutoff);
  const enriched = [];
  const adjustments = [];
  let inferredCount = 0;
  for (const event of (Array.isArray(sourceEvents) ? sourceEvents : []).filter(row => row?.type === 'fuel' && epochOf(row) <= cutoff)) {
    const eventEpoch = epochOf(event);
    const nearby = readings.map(reading => ({ reading, deltaMs: epochOf(reading) - eventEpoch }))
      .filter(item => Math.abs(item.deltaMs) <= ODOMETER_INFERENCE_MAX_HOURS * 3600000)
      .sort((a, b) => Math.abs(a.deltaMs) - Math.abs(b.deltaMs));
    const before = nearby.filter(item => item.deltaMs <= 0).sort((a, b) => b.deltaMs - a.deltaMs)[0];
    const after = nearby.filter(item => item.deltaMs > 0).sort((a, b) => a.deltaMs - b.deltaMs)[0];
    const nearest = before || after;
    const originalKm = finitePositive(event.odometerKm);
    let effectiveKm = originalKm;
    let inference = null;

    // Auto-assigned odometers are only provisional. If a trusted contemporaneous
    // reading is nearby and the provisional value is materially behind it,
    // anchor the model to the odometer record without altering the source event.
    if (event.odometerAutoAssigned === true && nearest && originalKm !== null) {
      const candidateKm = finitePositive(nearest.reading.odometerKm);
      const difference = candidateKm === null ? 0 : candidateKm - originalKm;
      const sameLocalDay = String(event.date || '').slice(0, 10) === String(nearest.reading.date || '').slice(0, 10);
      if (candidateKm !== null && difference > 0 && difference <= ODOMETER_INFERENCE_MAX_DISTANCE_KM && sameLocalDay && nearest.deltaMs <= 0) {
        effectiveKm = candidateKm;
        inference = { sourceEventId: nearest.reading.id, originalKm, inferredKm: candidateKm, reason: 'nearby-odometer-corrected-auto-assigned' };
      }
    }
    if (effectiveKm === null && nearest) {
      const candidateKm = finitePositive(nearest.reading.odometerKm);
      if (candidateKm !== null) {
        effectiveKm = candidateKm;
        inference = { sourceEventId: nearest.reading.id, originalKm: null, inferredKm: candidateKm, reason: 'missing-refuel-odometer-inferred' };
      }
    }
    if (effectiveKm !== null && inference) {
      inferredCount += 1;
      adjustments.push({ eventId: event.id, ...inference });
      enriched.push({ ...event, odometerKm: effectiveKm, odometerInferred: true, odometerInferenceSourceId: inference.sourceEventId, odometerOriginalKm: inference.originalKm });
    } else {
      enriched.push({ ...event, odometerKm: effectiveKm });
    }
  }
  return { events: enriched, inferredCount, adjustments };
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

function dateLabel(event) {
  const calendar = globalThis.GaragePersianCalendar;
  return calendar?.eventDateLabel?.(event) || event?.jalaliDate || event?.date || String(event?.occurredAt || '').slice(0, 10) || '—';
}

function intervalBase(from, to, refuelCount, method) {
  return {
    from, to,
    fromOdometerKm: Number(from.odometerKm),
    toOdometerKm: Number(to.odometerKm),
    distanceKm: Number(to.odometerKm) - Number(from.odometerKm),
    fromDate: dateLabel(from),
    toDate: dateLabel(to),
    refuelCount,
    method,
    measured: method === 'full-to-full',
    valid: false,
    rejectedReason: null
  };
}

function findRapidRefuelPairs(refuels, policy) {
  const pairs = [];
  for (let index = 1; index < refuels.length; index += 1) {
    const from = refuels[index - 1];
    const to = refuels[index];
    const elapsedHours = (epochOf(to) - epochOf(from)) / 3_600_000;
    const distanceKm = Number(to.odometerKm) - Number(from.odometerKm);
    if (elapsedHours >= 0 && elapsedHours <= policy.rapidRefuelMaxHours && distanceKm >= 0 && distanceKm <= policy.rapidRefuelMaxDistanceKm) {
      pairs.push({ from, to, elapsedHours, distanceKm });
    }
  }
  return { count: pairs.length, pairs };
}

function validateRefuelSequence(sourceEvents, capacity) {
  const all = (Array.isArray(sourceEvents) ? sourceEvents : [])
    .filter(event => event?.type === 'fuel')
    .map(event => ({ event, liters: finitePositive(event.liters), odometer: finitePositive(event.odometerKm), timestamp: epochOf(event) }))
    .sort((a, b) => a.timestamp - b.timestamp || (a.odometer ?? Infinity) - (b.odometer ?? Infinity) || String(a.event.id || '').localeCompare(String(b.event.id || '')));

  const valid = [];
  const rejected = [];
  let previous = null;
  for (const item of all) {
    if (item.liters === null) { rejected.push({ event: item.event, reason: 'invalid-refuel-liters' }); continue; }
    if (item.odometer === null) { rejected.push({ event: item.event, reason: 'missing-refuel-odometer' }); continue; }
    if (item.liters > capacity) {
      rejected.push({ event: item.event, reason: 'refuel-exceeds-tank-capacity' });
      continue;
    }
    if (previous && item.odometer < previous.odometer) {
      rejected.push({ event: item.event, reason: 'odometer-regression' });
      // Do not allow one erroneous meter reading to poison all later records.
      // Start a new sequence at this reading; its first/last inventory remains unknown.
      valid.push({ ...item, sequenceBreak: true });
      previous = item;
      continue;
    }
    valid.push(item);
    previous = item;
  }
  return { valid, rejected };
}

function buildExactIntervals(refuels, capacity, policy) {
  const fullIndices = refuels.reduce((indices, item, index) => {
    if (item.event.fullTank === true) indices.push(index);
    return indices;
  }, []);
  const result = [];
  for (let cursor = 1; cursor < fullIndices.length; cursor += 1) {
    const startIndex = fullIndices[cursor - 1];
    const endIndex = fullIndices[cursor];
    const from = refuels[startIndex].event;
    const to = refuels[endIndex].event;
    const interval = intervalBase(from, to, endIndex - startIndex, 'full-to-full');
    const window = refuels.slice(startIndex + 1, endIndex + 1);
    const liters = window.reduce((sum, item) => sum + item.liters, 0);
    const elapsedMs = epochOf(to) - epochOf(from);
    const rate = interval.distanceKm > 0 ? liters / interval.distanceKm * 100 : null;
    const physicalTrace = traceTankInventory(refuels, startIndex, endIndex, capacity, capacity, policy);
    const fullEndpointReachable = Boolean(physicalTrace && Math.abs(physicalTrace.minimum - capacity) <= 1e-6 && Math.abs(physicalTrace.maximum - capacity) <= 1e-6);
    const valid = interval.distanceKm >= policy.minimumDistanceKm
      && interval.distanceKm <= policy.maximumDistanceKm
      && elapsedMs >= 0
      && liters > 0
      && Number.isFinite(rate)
      && rate > 0
      && rate <= policy.maximumPlausibleConsumptionLPer100
      && fullEndpointReachable;
    result.push({
      ...interval,
      liters,
      minLiters: liters,
      maxLiters: liters,
      rate,
      minRate: rate,
      maxRate: rate,
      valid,
      rejectedReason: valid ? null : !fullEndpointReachable ? 'infeasible-intermediate-tank-balance' : interval.distanceKm < policy.minimumDistanceKm || interval.distanceKm > policy.maximumDistanceKm ? 'invalid-distance' : elapsedMs < 0 ? 'invalid-time' : !Number.isFinite(rate) || rate <= 0 || rate > policy.maximumPlausibleConsumptionLPer100 ? 'implausible-rate' : 'missing-liters',
      capacityLiters: capacity
    });
  }
  return { intervals: result, fullIndices };
}

/**
 * Propagate the physically reachable post-refuel tank inventory for a fixed
 * starting inventory. Each stop constrains the tank to [litres just bought,
 * tank capacity], and each odometer gap caps the possible fuel burned.
 */
function traceTankInventory(refuels, startIndex, endIndex, startingInventory, capacity, policy) {
  let minimum = startingInventory;
  let maximum = startingInventory;
  for (let index = startIndex + 1; index <= endIndex; index += 1) {
    const previous = refuels[index - 1];
    const current = refuels[index];
    const distance = current.odometer - previous.odometer;
    if (distance < 0) return null;
    const maximumBurn = distance * policy.maximumPlausibleConsumptionLPer100 / 100;
    const requiredPostFill = current.event.fullTank === true ? capacity : current.liters;
    const nextMinimum = Math.max(requiredPostFill, minimum + current.liters - maximumBurn);
    const nextMaximum = Math.min(capacity, maximum + current.liters);
    if (nextMinimum > nextMaximum + 1e-7) return null;
    minimum = Math.max(0, nextMinimum);
    maximum = Math.min(capacity, nextMaximum);
  }
  return { minimum, maximum };
}

function bisectBoundary(lowValue, highValue, predicate, seekFirstTrue) {
  let low = lowValue;
  let high = highValue;
  for (let iteration = 0; iteration < 48; iteration += 1) {
    const middle = (low + high) / 2;
    const matches = predicate(middle);
    if (seekFirstTrue) {
      if (matches) high = middle;
      else low = middle;
    } else if (matches) low = middle;
    else high = middle;
  }
  return seekFirstTrue ? high : low;
}

/** Build a partial-fill segment using feasible tank levels at every refuel stop. */
function buildPartialSegment(refuels, startIndex, endIndex, capacity, boundary, policy) {
  if (endIndex <= startIndex) return null;
  const start = refuels[startIndex];
  const end = refuels[endIndex];
  const distanceKm = end.odometer - start.odometer;
  if (!(distanceKm >= policy.minimumDistanceKm && distanceKm <= policy.maximumDistanceKm)) return null;
  const rowsAfterStart = refuels.slice(startIndex + 1, endIndex + 1);
  const litersAddedAfterStart = rowsAfterStart.reduce((sum, item) => sum + item.liters, 0);
  if (!(litersAddedAfterStart > 0)) return null;

  const startIsFull = start.event.fullTank === true;
  const endIsFull = end.event.fullTank === true;
  const startMin = startIsFull ? capacity : start.liters;
  const startMax = capacity;
  const endMin = endIsFull ? capacity : end.liters;
  const endMax = capacity;
  const trace = starting => traceTankInventory(refuels, startIndex, endIndex, starting, capacity, policy);

  // First find the highest physically feasible starting inventory. This also
  // catches impossible back-to-back purchases that would overflow the tank
  // unless enough distance/fuel burn occurred between them.
  const traceAtMinimumStart = trace(startMin);
  if (!traceAtMinimumStart) {
    return { ...intervalBase(start.event, end.event, endIndex - startIndex + 1, 'partial-tank-balance'), distanceKm, valid: false, measured: false, capacityLiters: capacity, rejectedReason: 'infeasible-intermediate-tank-balance' };
  }
  let maximumFeasibleStart = startMax;
  if (!trace(maximumFeasibleStart)) {
    maximumFeasibleStart = bisectBoundary(startMin, startMax, value => Boolean(trace(value)), false);
  }

  // The ending inventory must satisfy the last stop's own observation. If the
  // last refuel is marked full, this interval must be able to reach capacity.
  const canReachMinimumEnd = value => {
    const result = trace(value);
    return Boolean(result && result.maximum + 1e-7 >= endMin);
  };
  if (!canReachMinimumEnd(maximumFeasibleStart)) {
    return { ...intervalBase(start.event, end.event, endIndex - startIndex + 1, 'partial-tank-balance'), distanceKm, valid: false, measured: false, capacityLiters: capacity, rejectedReason: 'ending-inventory-unreachable' };
  }
  const feasibleStartMinimum = canReachMinimumEnd(startMin)
    ? startMin
    : bisectBoundary(startMin, maximumFeasibleStart, canReachMinimumEnd, true);

  const canRespectMaximumEnd = value => {
    const result = trace(value);
    return Boolean(result && result.minimum <= endMax + 1e-7);
  };
  if (!canRespectMaximumEnd(feasibleStartMinimum)) {
    return { ...intervalBase(start.event, end.event, endIndex - startIndex + 1, 'partial-tank-balance'), distanceKm, valid: false, measured: false, capacityLiters: capacity, rejectedReason: 'ending-inventory-exceeded-capacity' };
  }
  const feasibleStartMaximum = canRespectMaximumEnd(maximumFeasibleStart)
    ? maximumFeasibleStart
    : bisectBoundary(feasibleStartMinimum, maximumFeasibleStart, canRespectMaximumEnd, false);

  const minimumConsumptionTrace = trace(feasibleStartMinimum);
  const maximumConsumptionTrace = trace(feasibleStartMaximum);
  const highestReachableEnd = Math.min(endMax, minimumConsumptionTrace.maximum);
  const lowestReachableEnd = Math.max(endMin, maximumConsumptionTrace.minimum);
  const rawMinLiters = Math.max(0, feasibleStartMinimum + litersAddedAfterStart - highestReachableEnd);
  const rawMaxLiters = Math.max(0, feasibleStartMaximum + litersAddedAfterStart - lowestReachableEnd);
  const minLiters = rawMinLiters;
  // Floating-point tolerance must never leak a rate just above the configured
  // physical plausibility ceiling into the UI or exported estimates.
  const maxLiters = Math.min(rawMaxLiters, distanceKm * policy.maximumPlausibleConsumptionLPer100 / 100);
  const base = intervalBase(start.event, end.event, endIndex - startIndex + 1, 'partial-tank-balance');
  const valid = maxLiters >= minLiters - 1e-7 && maxLiters > 0 && Number.isFinite(maxLiters);
  const safeMinLiters = valid ? minLiters : null;
  const safeMaxLiters = valid ? Math.max(minLiters, maxLiters) : null;
  const midLiters = valid ? (safeMinLiters + safeMaxLiters) / 2 : null;
  const minRate = valid ? safeMinLiters / distanceKm * 100 : null;
  const maxRate = valid ? safeMaxLiters / distanceKm * 100 : null;
  const rate = valid ? midLiters / distanceKm * 100 : null;

  return {
    ...base,
    distanceKm,
    liters: midLiters,
    minLiters: safeMinLiters,
    maxLiters: safeMaxLiters,
    rate,
    minRate,
    maxRate,
    valid,
    measured: false,
    boundary,
    startingInventoryKnown: startIsFull,
    endingInventoryKnown: endIsFull,
    startingInventoryMinLiters: feasibleStartMinimum,
    startingInventoryMaxLiters: feasibleStartMaximum,
    endingInventoryMinLiters: lowestReachableEnd,
    endingInventoryMaxLiters: highestReachableEnd,
    litersAddedAfterStart,
    capacityLiters: capacity,
    rejectedReason: valid ? null : 'infeasible-tank-balance'
  };
}

function buildPartialIntervals(refuels, fullIndices, capacity, policy) {
  if (refuels.length < 2) return [];
  const result = [];
  const firstFull = fullIndices.length ? fullIndices[0] : -1;
  const lastFull = fullIndices.length ? fullIndices[fullIndices.length - 1] : -1;

  if (fullIndices.length === 0) {
    const interval = buildPartialSegment(refuels, 0, refuels.length - 1, capacity, 'both-ends-unknown', policy);
    if (interval) result.push(interval);
    return result;
  }

  // Leading partial history → first known full tank.
  if (firstFull > 0) {
    const interval = buildPartialSegment(refuels, 0, firstFull, capacity, 'ending-full-known', policy);
    if (interval) result.push(interval);
  }

  // Trailing known full tank → latest partial refuel.
  if (lastFull < refuels.length - 1) {
    const interval = buildPartialSegment(refuels, lastFull, refuels.length - 1, capacity, 'starting-full-known', policy);
    if (interval) result.push(interval);
  }

  return result;
}

function confidenceFor(intervals, exact, sampleDistanceKm, minRate, maxRate) {
  if (!intervals.length || !(sampleDistanceKm > 0)) return { key: 'none', label: 'برای شروع، حداقل دو سوخت‌گیری با کیلومتر معتبر لازم است' };
  if (exact) {
    if (intervals.length >= 3 && sampleDistanceKm >= 1000) return { key: 'high', label: 'اطمینان بالا · چند بازهٔ باک‌به‌باک دقیق' };
    if (intervals.length >= 2 && sampleDistanceKm >= 500) return { key: 'good', label: 'اطمینان خوب · بازه‌های باک‌به‌باک' };
    if (sampleDistanceKm >= 250) return { key: 'medium', label: 'اطمینان متوسط · یک بازهٔ باک‌به‌باک' };
    return { key: 'low', label: 'اطمینان محدود · دادهٔ باک‌به‌باک کوتاه' };
  }
  const center = (minRate + maxRate) / 2;
  const relativeWidth = center > 0 ? (maxRate - minRate) / center : Infinity;
  if (sampleDistanceKm >= 2000 && relativeWidth <= 0.25) return { key: 'good', label: 'اطمینان خوب · موازنهٔ چند سوخت‌گیری جزئی با عدم‌قطعیت کم' };
  if (sampleDistanceKm >= 1000 && relativeWidth <= 0.5) return { key: 'medium', label: 'اطمینان متوسط · تخمین موازنهٔ باک با بازهٔ خطا' };
  return { key: 'low', label: 'تخمین اولیه · سطح بنزین ابتدا/انتها نامعلوم است؛ بازهٔ مصرف را ببین' };
}

function filterExactOutliers(intervals) {
  const plausible = intervals.filter(item => item.valid);
  if (plausible.length < 4) return { accepted: plausible, rejected: intervals.filter(item => !item.valid) };
  const middle = median(plausible.map(item => item.rate));
  if (middle === null) return { accepted: plausible, rejected: intervals.filter(item => !item.valid) };
  const deviations = plausible.map(item => Math.abs(item.rate - middle));
  const mad = median(deviations) || 0;
  const tolerance = Math.max(4.5, middle * 0.45, mad * 3.5);
  const trimmed = plausible.filter(item => Math.abs(item.rate - middle) <= tolerance);
  const accepted = trimmed.length >= 3 ? trimmed : plausible;
  const acceptedSet = new Set(accepted);
  return { accepted, rejected: intervals.filter(item => !item.valid || !acceptedSet.has(item)).map(item => ({ ...item, outlier: item.valid && !acceptedSet.has(item) })) };
}

/**
 * Calculates fuel usage from full checkpoints when available; otherwise, from
 * partial-only tank-balance bounds. `options.tankCapacityLiters` defaults to 50.
 */
export function calculateFuelModel(events, options = {}) {
  const cutoffValue = Number(options.at);
  const cutoff = Number.isFinite(cutoffValue) ? cutoffValue : Infinity;
  const capacity = Math.min(100, Math.max(20, finitePositive(options.tankCapacityLiters) || DEFAULT_TANK_CAPACITY_LITERS));
  const policy = {
    minimumDistanceKm: Math.min(500, Math.max(10, finitePositive(options.minimumDistanceKm) || MIN_INTERVAL_KM)),
    maximumDistanceKm: Math.min(20000, Math.max(500, finitePositive(options.maximumDistanceKm) || MAX_INTERVAL_KM)),
    maximumPlausibleConsumptionLPer100: Math.min(60, Math.max(8, finitePositive(options.maximumPlausibleConsumptionLPer100) || MAX_CONSUMPTION_L_PER_100)),
    rapidRefuelMaxHours: Math.min(48, Math.max(1, finitePositive(options.rapidRefuelMaxHours) || RAPID_REFUEL_MAX_HOURS)),
    rapidRefuelMaxDistanceKm: Math.min(200, Math.max(1, finitePositive(options.rapidRefuelMaxDistanceKm) || RAPID_REFUEL_MAX_DISTANCE_KM))
  };
  const sourceEvents = Array.isArray(events) ? events : [];
  const odometerState = odometerApi()?.getOdometerState
    ? odometerApi().getOdometerState(sourceEvents, { asOf: cutoff })
    : { acceptedOdometerEvents: sourceEvents.filter(event => event?.type === 'odometer' && finitePositive(event.odometerKm)).sort((a, b) => epochOf(a) - epochOf(b)), rejectedOdometerEvents: [] };
  const enrichedRefuels = enrichRefuelsWithOdometer(sourceEvents, odometerState, cutoff);
  const eligibleEvents = enrichedRefuels.events;
  const { valid: validated, rejected: invalidRefuels } = validateRefuelSequence(eligibleEvents, capacity);

  // A backwards odometer value is a hard segment boundary. Never interpolate
  // consumption across a meter reset/correction.
  const sequences = [];
  let current = [];
  for (const item of validated) {
    if (item.sequenceBreak && current.length) {
      sequences.push(current);
      current = [];
    }
    current.push(item);
  }
  if (current.length) sequences.push(current);

  const exactRaw = [];
  const partialRaw = [];
  for (const sequence of sequences) {
    const { intervals: exact, fullIndices } = buildExactIntervals(sequence, capacity, policy);
    exactRaw.push(...exact);
    partialRaw.push(...buildPartialIntervals(sequence, fullIndices, capacity, policy));
  }

  const exactFiltered = filterExactOutliers(exactRaw);
  const acceptedOdometerRows = odometerState.acceptedOdometerEvents || [];
  const addOdometerTelemetry = interval => ({
    ...interval,
    intermediateOdometerReadingCount: acceptedOdometerRows.filter(row => epochOf(row) > epochOf(interval.from) && epochOf(row) <= epochOf(interval.to)).length
  });
  const acceptedExact = exactFiltered.accepted.map(item => ({ ...addOdometerTelemetry(item), outlier: false }));
  const rejectedExact = exactFiltered.rejected.map(addOdometerTelemetry);
  const acceptedPartial = partialRaw.filter(item => item.valid).map(addOdometerTelemetry);
  const rejectedPartial = partialRaw.filter(item => !item.valid).map(addOdometerTelemetry);

  // Exact full-to-full windows dominate a point estimate. Partial windows remain
  // visible as supplementary bounds but are not double-counted with exact spans.
  const useExact = acceptedExact.length > 0;
  const selectedIntervals = useExact ? acceptedExact : acceptedPartial;
  const sampleDistanceKm = selectedIntervals.reduce((sum, item) => sum + item.distanceKm, 0);
  const sampleMinLiters = selectedIntervals.reduce((sum, item) => sum + item.minLiters, 0);
  const sampleMaxLiters = selectedIntervals.reduce((sum, item) => sum + item.maxLiters, 0);
  const consumptionMinLPer100 = sampleDistanceKm > 0 ? sampleMinLiters / sampleDistanceKm * 100 : null;
  const consumptionMaxLPer100 = sampleDistanceKm > 0 ? sampleMaxLiters / sampleDistanceKm * 100 : null;
  const consumptionLPer100 = consumptionMinLPer100 !== null && consumptionMaxLPer100 !== null
    ? (consumptionMinLPer100 + consumptionMaxLPer100) / 2 : null;
  const confidence = confidenceFor(selectedIntervals, useExact, sampleDistanceKm, consumptionMinLPer100, consumptionMaxLPer100);

  const recentPriced = sourceEvents
    .filter(event => event?.type === 'fuel' && epochOf(event) <= cutoff && finitePositive(event.liters) && refuelCostRial(event))
    .sort((a, b) => epochOf(b) - epochOf(a))
    .slice(0, Math.max(1, Math.min(20, Number(options.recentPriceSamples ?? options.priceSampleCount) || 5)));
  const pricedLiters = recentPriced.reduce((sum, item) => sum + Number(item.liters), 0);
  const pricedCostRial = recentPriced.reduce((sum, item) => sum + refuelCostRial(item), 0);
  const priceTomanPerLiter = pricedLiters > 0 ? pricedCostRial / pricedLiters / 10 : null;

  const allValidRefuels = validated.map(item => item.event);
  const rapid = findRapidRefuelPairs(validated.map(item => ({ ...item.event, odometerKm: item.odometer })), policy);
  const includedEvents = new Set();
  for (const item of selectedIntervals) {
    const startIndex = allValidRefuels.findIndex(event => event === item.from || (item.from?.id && String(event.id) === String(item.from.id)));
    const endIndex = allValidRefuels.findIndex(event => event === item.to || (item.to?.id && String(event.id) === String(item.to.id)));
    if (startIndex >= 0 && endIndex >= startIndex) {
      for (let index = startIndex; index <= endIndex; index += 1) includedEvents.add(allValidRefuels[index]);
    } else {
      if (item.from) includedEvents.add(item.from);
      if (item.to) includedEvents.add(item.to);
    }
  }
  const unmeasuredRefuelCount = Math.max(0, allValidRefuels.length - includedEvents.size);
  const intervalRows = [...selectedIntervals, ...rejectedExact, ...rejectedPartial].sort((a, b) => epochOf(a.to) - epochOf(b.to));
  const acceptedOdometers = acceptedOdometerRows;
  const odometerDistanceKm = acceptedOdometers.slice(1).reduce((total, row, index) => {
    const previous = acceptedOdometers[index];
    const delta = Number(row.odometerKm) - Number(previous.odometerKm);
    return total + (delta > 0 && delta <= 5000 ? delta : 0);
  }, 0);
  const firstRefuelEpoch = validated.length ? validated[0].timestamp : Infinity;
  const lastRefuelEpoch = validated.length ? validated[validated.length - 1].timestamp : -Infinity;
  const odometerReadingsInFuelWindow = acceptedOdometers.filter(row => epochOf(row) >= firstRefuelEpoch && epochOf(row) <= lastRefuelEpoch);

  return {
    consumptionLPer100,
    consumptionMinLPer100,
    consumptionMaxLPer100,
    intervals: intervalRows,
    acceptedIntervals: [...selectedIntervals, ...(useExact ? acceptedPartial : [])],
    modelIntervals: selectedIntervals,
    rawIntervals: [...exactRaw, ...partialRaw],
    rejectedIntervals: [...rejectedExact, ...rejectedPartial],
    refuelCount: allValidRefuels.length,
    odometerReadingCount: acceptedOdometers.length,
    rejectedOdometerReadingCount: (odometerState.rejectedOdometerEvents || []).length,
    odometerDistanceKm: Math.round(odometerDistanceKm * 10) / 10,
    lastOdometerKm: odometerState.currentOdometerKm ?? null,
    odometerReadingsInFuelWindow: odometerReadingsInFuelWindow.length,
    inferredRefuelOdometerCount: enrichedRefuels.inferredCount,
    refuelOdometerAdjustments: enrichedRefuels.adjustments,
    sampleIntervals: selectedIntervals.length,
    exactIntervals: acceptedExact.length,
    estimatedIntervals: acceptedPartial.length,
    sampleDistanceKm,
    sampleLiters: (sampleMinLiters + sampleMaxLiters) / 2,
    sampleMinLiters,
    sampleMaxLiters,
    tankCapacityLiters: capacity,
    modelPolicy: policy,
    priceTomanPerLiter,
    confidenceKey: confidence.key,
    confidenceLabel: confidence.label,
    method: useExact ? 'full-to-full' : acceptedPartial.length ? 'partial-tank-balance' : 'insufficient-refuel-data',
    hasEstimate: consumptionLPer100 !== null && Number.isFinite(consumptionLPer100),
    rapidRefuelPairCount: rapid.count,
    rapidRefuelPairs: rapid.pairs,
    unmeasuredRefuelCount,
    partialOnlyRefuelCount: allValidRefuels.filter(event => event.fullTank !== true).length,
    invalidRefuelCount: invalidRefuels.length,
    invalidRefuels,
    ignoredPartialPairCount: 0
  };
}

/** Estimate fuel/price for a driven distance and retain the model's uncertainty band. */
export function estimateFuelTrip(events, distanceKm, options = {}) {
  const distance = finitePositive(distanceKm);
  if (distance === null) return null;
  const model = calculateFuelModel(events, options);
  if (!model.hasEstimate) return null;
  const fuelLiters = distance * model.consumptionLPer100 / 100;
  const minFuelLiters = distance * model.consumptionMinLPer100 / 100;
  const maxFuelLiters = distance * model.consumptionMaxLPer100 / 100;
  const costToman = model.priceTomanPerLiter === null ? null : fuelLiters * model.priceTomanPerLiter;
  const minCostToman = model.priceTomanPerLiter === null ? null : minFuelLiters * model.priceTomanPerLiter;
  const maxCostToman = model.priceTomanPerLiter === null ? null : maxFuelLiters * model.priceTomanPerLiter;
  return {
    distanceKm: distance,
    consumptionLPer100: model.consumptionLPer100,
    consumptionMinLPer100: model.consumptionMinLPer100,
    consumptionMaxLPer100: model.consumptionMaxLPer100,
    fuelLiters,
    minFuelLiters,
    maxFuelLiters,
    priceTomanPerLiter: model.priceTomanPerLiter,
    costToman,
    minCostToman,
    maxCostToman,
    costRial: costToman === null ? null : Math.round(costToman * 10),
    minCostRial: minCostToman === null ? null : Math.round(minCostToman * 10),
    maxCostRial: maxCostToman === null ? null : Math.round(maxCostToman * 10),
    confidenceKey: model.confidenceKey,
    confidenceLabel: model.confidenceLabel,
    sampleRefuels: model.refuelCount,
    sampleIntervals: model.sampleIntervals,
    sampleDistanceKm: model.sampleDistanceKm,
    odometerReadingCount: model.odometerReadingCount,
    odometerReadingsInFuelWindow: model.odometerReadingsInFuelWindow,
    sampleMinLiters: model.sampleMinLiters,
    sampleMaxLiters: model.sampleMaxLiters,
    method: model.method,
    estimated: true
  };
}
