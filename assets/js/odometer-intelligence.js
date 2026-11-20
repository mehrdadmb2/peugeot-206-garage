(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.GarageOdometerIntelligence = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const MAX_READING_KM = 2_000_000;
  const MAX_TRIP_DISTANCE_KM = 3_000;
  const MAX_PLAUSIBLE_SPEED_KMH = 180;
  const MIN_ODOMETER_JUMP_ALLOWANCE_KM = 500;
  const FUTURE_ENTRY_SKEW_MS = 30 * 60 * 1000;
  const MAX_FORWARD_SKEW_MS = 6 * 60 * 60 * 1000;
  const TEHRAN = 'Asia/Tehran';

  function parseEpoch(value) {
    const timestamp = Date.parse(value || '');
    return Number.isFinite(timestamp) ? timestamp : null;
  }

  function localDateKey(epoch) {
    if (!Number.isFinite(epoch)) return '';
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: TEHRAN, year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date(epoch));
    const values = Object.fromEntries(parts.filter(item => item.type !== 'literal').map(item => [item.type, item.value]));
    return `${values.year}-${values.month}-${values.day}`;
  }

  /**
   * Prefer the entered occurrence time, except a same-day timestamp entered
   * more than 30 minutes into the future relative to the record's creation.
   * This catches accidental forward-time selections (as in the 432261 km row)
   * without changing legitimate backdated entries.
   */
  function eventTimelineEpoch(event) {
    const occurrence = parseEpoch(event?.occurredAt)
      ?? parseEpoch(event?.date ? `${String(event.date).slice(0, 10)}T${event?.time || '12:00'}:00+03:30` : '')
      ?? parseEpoch(event?.createdAt);
    if (occurrence === null) return 0;
    const created = parseEpoch(event?.createdAt);
    if (created === null || !['odometer', 'fuel'].includes(event?.type)) return occurrence;
    const forwardSkew = occurrence - created;
    if (forwardSkew > FUTURE_ENTRY_SKEW_MS && forwardSkew <= MAX_FORWARD_SKEW_MS && localDateKey(occurrence) === localDateKey(created)) {
      return created;
    }
    return occurrence;
  }

  function numericOdometer(event) {
    const value = Number(event?.odometerKm);
    return Number.isFinite(value) && value > 0 && value <= MAX_READING_KM ? value : null;
  }

  function numericTripDistance(event) {
    const value = Number(event?.distanceKm);
    return Number.isFinite(value) && value > 0 && value <= MAX_TRIP_DISTANCE_KM ? value : null;
  }

  function getOdometerState(events, options = {}) {
    const asOf = Number.isFinite(Number(options.asOf)) ? Number(options.asOf) : Infinity;
    const maxPlausibleSpeed = Math.max(80, Math.min(250, Number(options.maxPlausibleSpeedKmh) || MAX_PLAUSIBLE_SPEED_KMH));
    const minJumpAllowance = Math.max(100, Math.min(2000, Number(options.minimumJumpAllowanceKm) || MIN_ODOMETER_JUMP_ALLOWANCE_KM));
    const timeline = (Array.isArray(events) ? events : [])
      .filter(event => event && (event.type === 'odometer' || event.type === 'trip'))
      .map(event => ({ event, epoch: eventTimelineEpoch(event), createdEpoch: parseEpoch(event.createdAt) ?? 0 }))
      .filter(item => item.epoch > 0 && item.epoch <= asOf)
      .sort((a, b) => a.epoch - b.epoch || a.createdEpoch - b.createdEpoch || String(a.event.id || '').localeCompare(String(b.event.id || '')));

    const acceptedOdometerEvents = [];
    const rejectedOdometerEvents = [];
    const acceptedTripEvents = [];
    const rejectedTripEvents = [];
    const timelineEntries = [];
    let currentOdometerKm = null;
    let lastAbsoluteKm = null;
    let lastAbsoluteEpoch = null;
    let sequence = 0;

    for (const item of timeline) {
      const event = item.event;
      if (event.type === 'odometer') {
        const value = numericOdometer(event);
        if (value === null) {
          rejectedOdometerEvents.push({ event, reason: 'invalid-reading' });
          continue;
        }
        const explicitReset = event.odometerReset === true || event.meterReplaced === true || event.odometerSequenceReset === true;
        let rejection = null;
        if (lastAbsoluteKm !== null && !explicitReset && value < lastAbsoluteKm) rejection = 'odometer-regression';
        if (lastAbsoluteKm !== null && !explicitReset && value >= lastAbsoluteKm && lastAbsoluteEpoch !== null) {
          const elapsedHours = Math.max(0, (item.epoch - lastAbsoluteEpoch) / 3_600_000);
          const maximumDelta = Math.max(minJumpAllowance, elapsedHours * maxPlausibleSpeed);
          if (value - lastAbsoluteKm > maximumDelta) rejection = 'implausible-forward-jump';
        }
        if (rejection) {
          rejectedOdometerEvents.push({ event, reason: rejection, previousKm: lastAbsoluteKm, candidateKm: value });
          timelineEntries.push({ event, epoch: item.epoch, accepted: false, reason: rejection, odometerKm: value });
          continue;
        }
        if (explicitReset && lastAbsoluteKm !== null && value < lastAbsoluteKm) sequence += 1;
        const accepted = { ...event, _garageTimelineEpoch: item.epoch, _garageOdometerSequence: sequence };
        acceptedOdometerEvents.push(accepted);
        lastAbsoluteKm = value;
        lastAbsoluteEpoch = item.epoch;
        currentOdometerKm = value;
        timelineEntries.push({ event, epoch: item.epoch, accepted: true, odometerKm: value, sequence, reset: explicitReset });
      } else {
        const distance = numericTripDistance(event);
        if (distance === null) {
          rejectedTripEvents.push({ event, reason: 'invalid-trip-distance' });
          continue;
        }
        if (currentOdometerKm === null) {
          rejectedTripEvents.push({ event, reason: 'missing-odometer-baseline' });
          continue;
        }
        currentOdometerKm = Math.round((currentOdometerKm + distance) * 10) / 10;
        acceptedTripEvents.push(event);
        timelineEntries.push({ event, epoch: item.epoch, accepted: true, distanceKm: distance, projectedOdometerKm: currentOdometerKm, sequence });
      }
    }

    const rejectedReasons = {};
    for (const item of rejectedOdometerEvents) rejectedReasons[item.reason] = (rejectedReasons[item.reason] || 0) + 1;
    return {
      currentOdometerKm: currentOdometerKm === null ? null : Math.round(currentOdometerKm * 10) / 10,
      lastAbsoluteOdometerKm: lastAbsoluteKm,
      acceptedOdometerEvents,
      rejectedOdometerEvents,
      acceptedTripEvents,
      rejectedTripEvents,
      timelineEntries,
      odometerReadingCount: acceptedOdometerEvents.length,
      rejectedOdometerCount: rejectedOdometerEvents.length,
      tripCount: acceptedTripEvents.length,
      rejectedTripCount: rejectedTripEvents.length,
      rejectedReasons,
      lastValidReadingAt: acceptedOdometerEvents.length
        ? new Date(acceptedOdometerEvents[acceptedOdometerEvents.length - 1]._garageTimelineEpoch).toISOString()
        : null,
      hasMileageAnomalies: rejectedOdometerEvents.length > 0
    };
  }

  function calculateCurrentOdometer(events, options = {}) {
    return getOdometerState(events, options).currentOdometerKm;
  }

  return Object.freeze({ eventTimelineEpoch, getOdometerState, calculateCurrentOdometer, numericOdometer, numericTripDistance });
});
