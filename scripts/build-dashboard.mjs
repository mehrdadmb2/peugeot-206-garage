import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_PURCHASE_KM = 428000;
const TIME_ZONE = 'Asia/Tehran';

function readJson(filePath, label) {
  if (!existsSync(filePath)) throw new Error(`Missing ${label}: ${filePath}`);
  try { return JSON.parse(readFileSync(filePath, 'utf8')); }
  catch (error) { throw new Error(`Invalid JSON in ${label}: ${error.message}`); }
}

function localDateString(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.filter(item => item.type !== 'literal').map(item => [item.type, item.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function eventEpoch(event) {
  const value = event?.occurredAt || (event?.date ? `${String(event.date).slice(0, 10)}T${event?.time || '12:00'}:00+03:30` : event?.createdAt);
  const timestamp = Date.parse(value || '');
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function daysBetween(from, to) {
  if (!from || !to) return null;
  const start = Date.parse(`${String(from).slice(0, 10)}T00:00:00Z`);
  const end = Date.parse(`${String(to).slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.round((end - start) / 86400000);
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function sum(rows, selector) {
  return rows.reduce((total, row) => total + (Number(selector(row)) || 0), 0);
}

export function calculateCurrentOdometer(events) {
  let current = null;
  const timeline = events.filter(event => event.type === 'odometer' || event.type === 'trip')
    .sort((a, b) => eventEpoch(a) - eventEpoch(b) || String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
  for (const event of timeline) {
    if (event.type === 'odometer' && event.odometerKm !== null && event.odometerKm !== undefined && Number.isFinite(Number(event.odometerKm))) {
      current = Number(event.odometerKm);
    } else if (event.type === 'trip' && Number.isFinite(Number(event.distanceKm)) && current !== null) {
      current += Number(event.distanceKm);
    }
  }
  return current === null ? null : Math.round(current * 10) / 10;
}

export function calculateDueItems(events, config, currentOdo, today = localDateString()) {
  const result = [];
  const ownership = config?.ownership || {};
  const purchaseKm = Number(ownership.purchaseOdometerKm ?? DEFAULT_PURCHASE_KM);
  const purchaseDate = /^\d{4}-\d{2}-\d{2}$/.test(String(ownership.purchaseDate || '')) ? ownership.purchaseDate : null;

  for (const [key, service] of Object.entries(config?.serviceIntervals || {})) {
    const latest = events.filter(event =>
      (event.type === 'service' && event.serviceKey === key) ||
      ((event.type === 'part' || event.type === 'repair') && event.status !== 'open' &&
        (event.serviceKey === key || event.componentKey === key) &&
        (event.componentReplaced || event.type === 'repair' || event.status === 'fixed'))
    ).sort((a, b) => eventEpoch(b) - eventEpoch(a))[0] || null;

    const baseline = !latest;
    const refOdo = latest ? numberOrNull(latest.odometerKm) : purchaseKm;
    const refDate = latest?.date || (latest?.occurredAt ? String(latest.occurredAt).slice(0, 10) : null) || (baseline ? purchaseDate : null);
    const intervalKm = Number(service.intervalKm) || 0;
    const intervalDays = Number(service.intervalDays) || 0;
    const leftKm = intervalKm > 0 && currentOdo !== null && refOdo !== null ? Math.round(refOdo + intervalKm - currentOdo) : null;
    const dueDate = intervalDays > 0 && refDate ? addDays(refDate, intervalDays) : null;
    const leftDays = dueDate ? daysBetween(today, dueDate) : null;
    const kmOver = leftKm !== null && leftKm < 0 ? Math.abs(leftKm) : 0;
    const daysOver = leftDays !== null && leftDays < 0 ? Math.abs(leftDays) : 0;
    const stage = (kmOver >= Math.max(1000, intervalKm * 0.2) && intervalKm > 0) || daysOver >= 30 ? 'critical'
      : (leftKm !== null && leftKm <= 0) || (leftDays !== null && leftDays <= 0) ? 'overdue'
      : (leftKm !== null && intervalKm > 0 && leftKm <= Math.max(100, intervalKm * 0.02)) || (leftDays !== null && leftDays <= 3) ? 'due'
      : (leftKm !== null && intervalKm > 0 && leftKm <= Math.max(500, intervalKm * 0.1)) || (leftDays !== null && leftDays <= 14) ? 'upcoming' : 'ok';

    if (stage !== 'ok') result.push({ key, label: service.label || key, stage, overdue: stage === 'overdue' || stage === 'critical', leftKm, leftDays, intervalKm, intervalDays, refOdo, refDate, baseline });
  }

  const catalog = config?.partCatalog || {};
  for (const [key, item] of Object.entries(catalog.items || {})) {
    if (item.mode !== 'periodic' || config?.serviceIntervals?.[key]) continue;
    const latest = events.filter(event =>
      (event.componentKey === key || event.serviceKey === key || event.serviceCatalogKey === key) &&
      (event.componentReplaced || event.type === 'service' || event.type === 'repair' || (event.type === 'issue' && event.status === 'fixed')) &&
      event.status !== 'open'
    ).sort((a, b) => eventEpoch(b) - eventEpoch(a))[0] || null;

    const baseline = !latest;
    const refOdo = latest ? numberOrNull(latest.odometerKm) : purchaseKm;
    const refDate = latest?.date || (latest?.occurredAt ? String(latest.occurredAt).slice(0, 10) : null) || (baseline ? purchaseDate : null);
    const intervalKm = Number(item.intervalKm) || 0;
    const intervalDays = Number(item.intervalDays) || 0;
    const kmSince = currentOdo !== null && refOdo !== null ? currentOdo - refOdo : null;
    const leftKm = intervalKm > 0 && kmSince !== null ? intervalKm - kmSince : null;
    const dueDate = intervalDays > 0 && refDate ? addDays(refDate, intervalDays) : null;
    const leftDays = dueDate ? daysBetween(today, dueDate) : null;
    const kmOver = leftKm !== null && leftKm < 0 ? Math.abs(leftKm) : 0;
    const daysOver = leftDays !== null && leftDays < 0 ? Math.abs(leftDays) : 0;
    const stage = (kmOver >= Math.max(1000, intervalKm * 0.2) && intervalKm > 0) || daysOver >= 30 ? 'critical'
      : (leftKm !== null && leftKm <= 0) || (leftDays !== null && leftDays <= 0) ? 'overdue'
      : (leftKm !== null && intervalKm > 0 && leftKm <= Math.max(100, intervalKm * 0.02)) || (leftDays !== null && leftDays <= 3) ? 'due'
      : (leftKm !== null && intervalKm > 0 && leftKm <= Math.max(500, intervalKm * 0.1)) || (leftDays !== null && leftDays <= 14) ? 'upcoming' : 'ok';

    if (stage !== 'ok') result.push({ key, label: item.label || key, stage, overdue: stage === 'overdue' || stage === 'critical', leftKm, leftDays, intervalKm, intervalDays, refOdo, refDate, baseline, category: item.category, component: true });
  }

  const rank = { critical: 0, overdue: 1, due: 2, upcoming: 3, ok: 4 };
  return result.sort((a, b) => (rank[a.stage] ?? 9) - (rank[b.stage] ?? 9) ||
    Math.min(a.leftKm ?? Infinity, (a.leftDays ?? Infinity) * 100) - Math.min(b.leftKm ?? Infinity, (b.leftDays ?? Infinity) * 100));
}

function addDays(value, count) {
  const [year, month, day] = String(value).slice(0, 10).split('-').map(Number);
  if (![year, month, day].every(Number.isFinite)) return null;
  const date = new Date(Date.UTC(year, month - 1, day + count));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function expenseDate(event) {
  if (event.type === 'fine' && event.paid && event.paidAt) return String(event.paidAt).slice(0, 10);
  if (event.type === 'issue' && event.resolvedAt && Number(event.repairCostRial) > 0) return String(event.resolvedAt).slice(0, 10);
  return String(event.occurredAt || event.date || event.createdAt || '').slice(0, 10);
}

function calculateDistanceEntries(events, ownership = {}) {
  const allOdometers = events.filter(event => event.type === 'odometer' && event.odometerKm !== null && event.odometerKm !== undefined && Number.isFinite(Number(event.odometerKm)))
    .sort((a, b) => eventEpoch(a) - eventEpoch(b));
  let correctionIndex = 0;
  for (let index = 1; index < allOdometers.length; index++) {
    if (Number(allOdometers[index].odometerKm) < Number(allOdometers[index - 1].odometerKm)) correctionIndex = index;
  }
  const odometers = allOdometers.slice(correctionIndex);
  const coveredTrips = new Set();
  const result = [];
  const purchaseKm = Number(ownership.purchaseOdometerKm ?? ownership.baselineOdometerKm ?? DEFAULT_PURCHASE_KM);
  const purchaseDate = /^\d{4}-\d{2}-\d{2}$/.test(String(ownership.purchaseDate || '')) ? ownership.purchaseDate : null;
  const historicalActor = String(ownership.historicalActor || ownership.defaultActor || 'من').trim() || 'من';
  const first = odometers[0];
  if (first && Number.isFinite(purchaseKm) && purchaseKm > 0) {
    const baselineDistance = Number(first.odometerKm) - purchaseKm;
    if (baselineDistance > 0) {
      const purchaseTime = purchaseDate ? Date.parse(`${purchaseDate}T00:00:00+03:30`) : NaN;
      const firstTime = eventEpoch(first);
      const historicalTrips = events.filter(trip => trip.type === 'trip' && Number(trip.distanceKm) > 0 && eventEpoch(trip) <= firstTime &&
        (!Number.isFinite(purchaseTime) || eventEpoch(trip) >= purchaseTime) && (correctionIndex === 0 || eventEpoch(trip) >= firstTime));
      const tripTotal = sum(historicalTrips, trip => trip.distanceKm);
      if (tripTotal > 0 && tripTotal <= baselineDistance) {
        for (const trip of historicalTrips) {
          coveredTrips.add(trip.id);
          result.push({ date: trip.date || String(trip.occurredAt || '').slice(0, 10), occurredAt: trip.occurredAt, distanceKm: Number(trip.distanceKm), actor: String(trip.actor || 'من').trim() || 'من', source: 'ownership_historical_trip', eventId: trip.id, estimatedHistorical: true, fromOdometerKm: purchaseKm, toOdometerKm: Number(first.odometerKm) });
        }
      }
      const residual = baselineDistance - (tripTotal > 0 && tripTotal <= baselineDistance ? tripTotal : 0);
      if (residual > 0) result.push({ date: purchaseDate, occurredAt: purchaseDate ? `${purchaseDate}T12:00:00+03:30` : null, distanceKm: residual, actor: historicalActor, source: 'ownership_baseline', eventId: first.id, estimatedHistorical: true, fromOdometerKm: purchaseKm, toOdometerKm: Number(first.odometerKm) });
    }
  }
  for (let index = 1; index < odometers.length; index++) {
    const previous = odometers[index - 1];
    const current = odometers[index];
    const delta = Number(current.odometerKm) - Number(previous.odometerKm);
    if (delta <= 0 || delta > 5000) continue;
    const start = eventEpoch(previous);
    const end = eventEpoch(current);
    const trips = events.filter(trip => trip.type === 'trip' && eventEpoch(trip) > start && eventEpoch(trip) <= end && Number(trip.distanceKm) > 0)
      .sort((a, b) => eventEpoch(a) - eventEpoch(b));
    const tripDistance = sum(trips, trip => trip.distanceKm);
    trips.forEach(trip => coveredTrips.add(trip.id));
    if (trips.length && tripDistance <= delta) {
      for (const trip of trips) result.push({ date: trip.date || String(trip.occurredAt || '').slice(0, 10), occurredAt: trip.occurredAt, distanceKm: Number(trip.distanceKm), actor: String(trip.actor || 'من').trim() || 'من', source: 'trip_within_odometer', eventId: trip.id, fromOdometerKm: Number(previous.odometerKm), toOdometerKm: Number(current.odometerKm) });
      const residual = delta - tripDistance;
      if (residual > 0) result.push({ date: current.date || String(current.occurredAt || '').slice(0, 10), occurredAt: current.occurredAt, distanceKm: residual, actor: String(current.actor || 'من').trim() || 'من', source: 'odometer_residual', fromOdometerKm: Number(previous.odometerKm), toOdometerKm: Number(current.odometerKm) });
    } else {
      result.push({ date: current.date || String(current.occurredAt || '').slice(0, 10), occurredAt: current.occurredAt, distanceKm: delta, actor: String(current.actor || 'من').trim() || 'من', fromOdometerKm: Number(previous.odometerKm), toOdometerKm: Number(current.odometerKm), source: 'odometer_delta' });
    }
  }
  for (const event of events) {
    if (event.type === 'trip' && !coveredTrips.has(event.id) && Number(event.distanceKm) > 0) {
      result.push({ date: event.date || String(event.occurredAt || '').slice(0, 10), occurredAt: event.occurredAt, distanceKm: Number(event.distanceKm), actor: String(event.actor || 'من').trim() || 'من', source: 'trip', eventId: event.id });
    }
  }
  return result.sort((a, b) => (eventEpoch(a) || 0) - (eventEpoch(b) || 0));
}

export function buildDashboardData({ rootDir = process.cwd(), now = new Date() } = {}) {
  const dataDir = join(rootDir, 'data');
  const logDir = join(dataDir, 'logs');
  const config = readJson(join(dataDir, 'config.json'), 'data/config.json');
  const index = readJson(join(dataDir, 'index.json'), 'data/index.json');
  if (!config || typeof config !== 'object' ||
      !config.serviceIntervals || !Object.keys(config.serviceIntervals).length ||
      !config.partCatalog?.categories || !Object.keys(config.partCatalog.categories).length ||
      !config.partCatalog?.items || !Object.keys(config.partCatalog.items).length ||
      !config.partCatalog?.services || !Object.keys(config.partCatalog.services).length) {
    throw new Error('config.json is missing required serviceIntervals, partCatalog.categories, partCatalog.items or partCatalog.services data.');
  }
  if (!existsSync(logDir) || !statSync(logDir).isDirectory()) throw new Error('data/logs directory is missing.');

  const logFiles = readdirSync(logDir).filter(name => /^\d{4}-\d{2}\.json$/.test(name)).sort();
  const indexMonths = Array.isArray(index.months) ? index.months.filter(month => /^\d{4}-\d{2}$/.test(month)) : [];
  const months = [...new Set([...indexMonths, ...logFiles.map(name => basename(name, '.json'))])].sort();
  const missingMonths = indexMonths.filter(month => !logFiles.includes(`${month}.json`));
  if (missingMonths.length) throw new Error(`Index references missing monthly logs: ${missingMonths.join(', ')}`);

  const seen = new Set();
  const events = [];
  const logUpdatedAt = [];
  for (const month of months) {
    const log = readJson(join(logDir, `${month}.json`), `data/logs/${month}.json`);
    if (!Array.isArray(log.events)) throw new Error(`data/logs/${month}.json does not contain an events array.`);
    if (log.updatedAt) logUpdatedAt.push(log.updatedAt);
    for (const event of log.events) {
      if (!event || !event.id || event.deletedAt || seen.has(String(event.id))) continue;
      seen.add(String(event.id));
      events.push(event);
    }
  }
  events.sort((a, b) => eventEpoch(a) - eventEpoch(b) || String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
  if (indexMonths.length && !events.length) {
    throw new Error(`Indexed data contains ${indexMonths.length} month(s), but no valid events were found. Refusing to publish an empty dashboard snapshot.`);
  }

  const today = localDateString(now);
  const currentMonth = today.slice(0, 7);
  const currentMonthEvents = events.filter(event => String(event.date || event.occurredAt || '').slice(0, 7) === currentMonth);
  const currentMonthCosts = events.filter(event => Number(event.costRial) > 0 && (event.type !== 'fine' || Boolean(event.paid)) && expenseDate(event).slice(0, 7) === currentMonth);
  const currentMonthFuel = currentMonthEvents.filter(event => event.type === 'fuel');
  const currentOdometerKm = calculateCurrentOdometer(events);
  const dueItems = calculateDueItems(events, config, currentOdometerKm, today);
  const eventTypes = {};
  for (const event of events) eventTypes[event.type] = (eventTypes[event.type] || 0) + 1;

  const sourceTimestamps = [index.updatedAt, config.updatedAt, ...logUpdatedAt].filter(Boolean).sort();
  const distanceEntries = calculateDistanceEntries(events, config.ownership || {});
  const snapshot = {
    schemaVersion: 1,
    generatedAt: now.toISOString(),
    generatedForLocalDate: today,
    sourceUpdatedAt: sourceTimestamps.at(-1) || null,
    months,
    config,
    events,
    computed: {
      eventCount: events.length,
      currentOdometerKm,
      currentMonth,
      currentMonthEventCount: currentMonthEvents.length,
      currentMonthCostRial: sum(currentMonthCosts, event => event.costRial),
      currentMonthFuelLiters: sum(currentMonthFuel, event => event.liters),
      currentMonthFuelCount: currentMonthFuel.length,
      dueItems,
      dueCount: dueItems.length,
      eventTypes,
      serviceIntervalCount: Object.keys(config.serviceIntervals || {}).length,
      componentCount: Object.keys(config.partCatalog?.items || {}).length,
      serviceCatalogCount: Object.keys(config.partCatalog?.services || {}).length,
      distanceEntries
    }
  };
  return snapshot;
}

export function buildDashboardFile(rootDir = process.cwd(), now = new Date()) {
  const snapshot = buildDashboardData({ rootDir, now });
  const outputPath = join(rootDir, 'data', 'dashboard.json');
  writeFileSync(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  return { outputPath, snapshot, bytes: statSync(outputPath).size };
}

function isDirectExecution() {
  const invoked = process.argv[1];
  return invoked && import.meta.url === pathToFileURL(invoked).href;
}

if (isDirectExecution()) {
  try {
    const result = buildDashboardFile(process.cwd());
    console.log(`Dashboard snapshot generated: ${result.outputPath}`);
    console.log(`Events: ${result.snapshot.computed.eventCount} | Months: ${result.snapshot.months.length} | Odometer: ${result.snapshot.computed.currentOdometerKm ?? 'unknown'} km | Due items: ${result.snapshot.computed.dueCount}`);
    console.log(`Output size: ${(result.bytes / 1024).toFixed(1)} KiB`);
  } catch (error) {
    console.error(`Dashboard build failed: ${error.message}`);
    process.exitCode = 1;
  }
}
