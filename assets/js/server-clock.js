/* Peugeot 206 Garage · authoritative Tehran clock · v3.27.0
 * Uses the Cloudflare Worker clock as the time source for all date-sensitive
 * dashboard calculations. A monotonic timer keeps time moving even when the
 * device wall clock is incorrect or is changed while the page is open.
 */
(function (root) {
  'use strict';

  const HEALTH_URL = 'https://peugeot-206-garage-bot.game-developer-mb.workers.dev/health';
  const MAX_REQUEST_MS = 5000;
  const RESYNC_INTERVAL_MS = 10 * 60 * 1000;
  const monotonicNow = () => {
    try {
      if (root.performance && typeof root.performance.now === 'function') return root.performance.now();
    } catch (_) {}
    return Date.now();
  };

  let synced = false;
  let anchorEpochMs = Date.now();
  let anchorMonotonicMs = monotonicNow();
  let lastSyncMonotonicMs = -Infinity;
  let lastServerTime = null;
  let lastError = null;
  let pendingSync = null;

  function nowEpoch() {
    if (!synced) return Date.now();
    const elapsed = Math.max(0, monotonicNow() - anchorMonotonicMs);
    return Math.round(anchorEpochMs + elapsed);
  }

  function nowDate() {
    return new Date(nowEpoch());
  }

  function dateKey(date = nowDate()) {
    const parts = new Intl.DateTimeFormat('en-CA-u-nu-latn', {
      timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(date);
    const value = Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
    return `${value.year}-${value.month}-${value.day}`;
  }

  function status() {
    return Object.freeze({
      synced,
      timeZone: 'Asia/Tehran',
      serverTime: lastServerTime,
      error: lastError,
      epochMs: nowEpoch()
    });
  }

  async function sync(options = {}) {
    const force = options.force === true;
    const startedAt = monotonicNow();
    if (pendingSync) return pendingSync;
    if (!force && synced && startedAt - lastSyncMonotonicMs < RESYNC_INTERVAL_MS) return status();
    if (typeof root.fetch !== 'function') {
      lastError = 'fetch_unavailable';
      return status();
    }

    pendingSync = (async () => {
      let timeoutId = null;
      let controller = null;
      try {
        if (typeof root.AbortController === 'function') controller = new root.AbortController();
        const timeout = new Promise((_, reject) => {
          timeoutId = root.setTimeout(() => {
            try { controller?.abort(); } catch (_) {}
            reject(new Error('worker_time_timeout'));
          }, MAX_REQUEST_MS);
        });
        const request = root.fetch(`${HEALTH_URL}?clock=${Math.floor(startedAt)}`, {
          method: 'GET',
          mode: 'cors',
          cache: 'no-store',
          credentials: 'omit',
          headers: { Accept: 'application/json' },
          ...(controller ? { signal: controller.signal } : {})
        });
        const response = await Promise.race([request, timeout]);
        if (!response || !response.ok) throw new Error(`worker_time_http_${response?.status || 'unknown'}`);
        const payload = await response.json();
        const receivedAt = monotonicNow();
        const serverEpochMs = Number(payload?.epochMs) || Date.parse(payload?.serverTime || '') || Date.parse(payload?.time || '');
        if (payload?.ok !== true || !Number.isFinite(serverEpochMs) || serverEpochMs < Date.UTC(2020, 0, 1)) {
          throw new Error('worker_time_invalid_response');
        }
        // Worker time is sampled during this request; use the request midpoint
        // to reduce network-latency skew without consulting the PC wall clock.
        anchorEpochMs = serverEpochMs;
        anchorMonotonicMs = (startedAt + receivedAt) / 2;
        synced = true;
        lastSyncMonotonicMs = receivedAt;
        lastServerTime = String(payload.serverTime || payload.time || new Date(serverEpochMs).toISOString());
        lastError = null;
        try {
          root.dispatchEvent?.(new root.CustomEvent('garageclockchange', { detail: status() }));
        } catch (_) {}
        return status();
      } catch (error) {
        lastError = String(error?.message || error || 'worker_time_unavailable');
        return status();
      } finally {
        if (timeoutId !== null) root.clearTimeout(timeoutId);
        pendingSync = null;
      }
    })();
    return pendingSync;
  }

  const api = Object.freeze({
    timeZone: 'Asia/Tehran',
    nowEpoch,
    nowDate,
    dateKey,
    sync,
    status,
    get isSynced() { return synced; },
    get ready() { return pendingSync || Promise.resolve(status()); }
  });
  root.GarageClock = api;

  // Start the sync before app.js and experience.js begin their calculations.
  const initialSync = sync({ force: true });
  root.GarageClockReady = initialSync;
  root.addEventListener?.('focus', () => { void sync(); });
  root.document?.addEventListener?.('visibilitychange', () => {
    if (!root.document.hidden) void sync();
  });
  const timer = root.setInterval?.(() => { void sync(); }, RESYNC_INTERVAL_MS);
  timer?.unref?.();
})(typeof window !== 'undefined' ? window : globalThis);
