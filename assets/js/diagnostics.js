/* 206 Garage Diagnostics v3.11.0
 * Privacy-first client diagnostics. No vehicle records, tokens or secrets are exported.
 */
(function (root) {
  'use strict';
  const VERSION = '3.11.0';
  const MAX_ENTRIES = 500;
  const PERSIST_KEY = 'peugeot206garage:diagnostics:v1';
  const PERSIST_LIMIT = 220;
  const entries = [];
  let sequence = 0;
  let context = {};
  let panel = null;
  let persistTimer = null;

  function restorePersistedEntries() {
    try {
      const raw = root.localStorage?.getItem(PERSIST_KEY);
      if (!raw || raw.length > 900_000) return;
      const stored = JSON.parse(raw);
      if (!Array.isArray(stored)) return;
      for (const item of stored.slice(-PERSIST_LIMIT)) {
        if (!item || !['debug', 'info', 'warn', 'error'].includes(item.level) || !item.at) continue;
        entries.push({
          id: Number(item.id) || ++sequence,
          at: String(item.at), level: item.level,
          scope: redact(item.scope || 'app'), message: redact(item.message || ''),
          ...(item.details === undefined ? {} : { details: safeDetails(item.details) })
        });
        sequence = Math.max(sequence, Number(item.id) || 0);
      }
      while (entries.length > MAX_ENTRIES) entries.shift();
    } catch (_) {}
  }

  function flushPersistedEntries() {
    if (persistTimer) { root.clearTimeout(persistTimer); persistTimer = null; }
    try { root.localStorage?.setItem(PERSIST_KEY, JSON.stringify(entries.slice(-PERSIST_LIMIT))); }
    catch (_) { /* Diagnostics must never break the dashboard when storage is full or disabled. */ }
  }

  function schedulePersist() {
    if (persistTimer) return;
    persistTimer = root.setTimeout(flushPersistedEntries, 500);
  }

  function redact(value) {
    let text = String(value == null ? '' : value);
    text = text.replace(/(authorization\s*[:=]\s*(?:bearer\s+)?)[^\s,;]+/gi, '$1[REDACTED]');
    text = text.replace(/((?:token|secret|password|api[_-]?key|access[_-]?token)\s*[=:]\s*)[^\s&,;]+/gi, '$1[REDACTED]');
    text = text.replace(/https?:\/\/[^\s"']+/gi, url => {
      try { const u = new URL(url); u.search = ''; u.hash = ''; return u.toString(); } catch (_) { return '[URL]'; }
    });
    return text.slice(0, 1200);
  }

  function safeDetails(value, depth = 0) {
    if (depth > 3) return '[depth-limit]';
    if (value == null || typeof value === 'boolean' || typeof value === 'number') return value;
    if (typeof value === 'string') return redact(value);
    if (value instanceof Error) return { name: value.name, message: redact(value.message), stack: redact(value.stack || '').slice(0, 1800) };
    if (Array.isArray(value)) return value.slice(0, 30).map(item => safeDetails(item, depth + 1));
    if (typeof value === 'object') {
      const out = {};
      for (const [key, item] of Object.entries(value).slice(0, 40)) {
        if (/token|secret|password|authorization|cookie|credential|api.?key/i.test(key)) out[key] = '[REDACTED]';
        else out[key] = safeDetails(item, depth + 1);
      }
      return out;
    }
    return redact(value);
  }

  function log(level, scope, message, details) {
    const entry = {
      id: ++sequence,
      at: new Date().toISOString(),
      level: ['debug', 'info', 'warn', 'error'].includes(level) ? level : 'info',
      scope: redact(scope || 'app'),
      message: redact(message || ''),
      ...(details === undefined ? {} : { details: safeDetails(details) })
    };
    entries.push(entry);
    if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
    schedulePersist();
    if (panel) refreshPanel();
    return entry.id;
  }

  function getRuntime() {
    let storageAvailable = false;
    try {
      const key = '__garage_diag_test__';
      root.localStorage.setItem(key, '1'); root.localStorage.removeItem(key); storageAvailable = true;
    } catch (_) {}
    const nav = root.navigator || {};
    const perf = root.performance;
    const resources = perf && typeof perf.getEntriesByType === 'function'
      ? perf.getEntriesByType('resource').slice(-100).map(item => ({
          name: redact(item.name).replace(/[?#].*$/, ''),
          durationMs: Math.round(item.duration || 0),
          transferSize: Number(item.transferSize) || 0,
          type: item.initiatorType || 'unknown'
        })) : [];
    return {
      diagnosticsVersion: VERSION,
      capturedAt: new Date().toISOString(),
      page: `${root.location?.origin || ''}${root.location?.pathname || ''}`,
      userAgent: nav.userAgent || 'unknown',
      language: nav.language || 'unknown',
      online: nav.onLine !== false,
      timezone: (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (_) { return 'unknown'; } })(),
      localStorageAvailable: storageAvailable,
      viewport: { width: root.innerWidth || 0, height: root.innerHeight || 0, dpr: root.devicePixelRatio || 1 },
      scripts: Array.from(root.document?.scripts || []).filter(s => s.src).map(s => ({
        src: redact(s.src).replace(/[?#].*$/, ''), loaded: Boolean(s.dataset.garageLoaded)
      })),
      context: safeDetails(context),
      resources
    };
  }

  function report() {
    return {
      application: 'Peugeot 206 Garage',
      reportVersion: VERSION,
      runtime: getRuntime(),
      summary: {
        total: entries.length,
        errors: entries.filter(e => e.level === 'error').length,
        warnings: entries.filter(e => e.level === 'warn').length,
        lastEventAt: entries.length ? entries[entries.length - 1].at : null
      },
      logs: entries.slice()
    };
  }

  function downloadReport() {
    const blob = new Blob([JSON.stringify(report(), null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = root.document.createElement('a');
    a.href = url; a.download = `206-garage-diagnostics-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    root.document.body.appendChild(a); a.click(); a.remove();
    root.setTimeout(() => URL.revokeObjectURL(url), 1500);
    log('info', 'diagnostics.export', 'گزارش فنی JSON ساخته شد.');
  }

  async function copyReport() {
    const text = JSON.stringify(report(), null, 2);
    try {
      if (!root.navigator?.clipboard?.writeText) throw new Error('Clipboard API unavailable');
      await root.navigator.clipboard.writeText(text);
      log('info', 'diagnostics.copy', 'گزارش فنی در کلیپ‌بورد کپی شد.');
      return true;
    } catch (error) {
      log('warn', 'diagnostics.copy', 'کپی مستقیم در این مرورگر ممکن نبود؛ فایل JSON را دانلود کن.', error);
      downloadReport();
      return false;
    }
  }

  function setContext(next) {
    context = { ...context, ...safeDetails(next || {}) };
    log('info', 'app.context', 'وضعیت برنامه به‌روزرسانی شد.', context);
  }

  function mountPanel() {
    if (panel || !root.document?.body) return;
    const host = root.document.createElement('div');
    host.id = 'garageDiagnosticsRoot';
    host.innerHTML = `
      <button type="button" class="garage-diag-fab" id="garageDiagOpen" aria-haspopup="dialog" aria-controls="garageDiagDialog">🛠 گزارش فنی</button>
      <div class="garage-diag-backdrop" id="garageDiagBackdrop" hidden>
        <section class="garage-diag-dialog" id="garageDiagDialog" role="dialog" aria-modal="true" aria-labelledby="garageDiagTitle" dir="rtl">
          <header class="garage-diag-head"><div><span class="garage-diag-kicker">SYSTEM DIAGNOSTICS / ${VERSION}</span><h2 id="garageDiagTitle">عیب‌یابی و گزارش خطا</h2><p>گزارش شامل خطاهای جاوااسکریپت، وضعیت فایل‌ها و زمان پاسخ منابع است؛ اطلاعات خودرو و Secretها به گزارش اضافه نمی‌شوند.</p></div><button type="button" class="garage-diag-close" id="garageDiagClose" aria-label="بستن">×</button></header>
          <div class="garage-diag-toolbar">
            <button type="button" class="primary-button small" id="garageDiagRun">آزمایش کامل منابع</button>
            <button type="button" class="secondary-button small" id="garageDiagDownload">دانلود گزارش JSON ↓</button>
            <button type="button" class="secondary-button small" id="garageDiagCopy">کپی گزارش</button>
            <button type="button" class="secondary-button small" id="garageDiagClear">پاک‌کردن لاگ</button>
          </div>
          <div class="garage-diag-summary" id="garageDiagSummary"></div>
          <div class="garage-diag-log-head"><strong>رویدادهای ثبت‌شده</strong><span id="garageDiagCount">۰</span></div>
          <div class="garage-diag-log" id="garageDiagLog" aria-live="polite"></div>
          <footer class="garage-diag-foot">برای بررسی، فایل JSON دانلودشده را همین‌جا در گفتگو ارسال کن. این گزارش هیچ توکن، رمز یا متن کامل سوابق خودرو را شامل نمی‌شود.</footer>
        </section>
      </div>`;
    root.document.body.appendChild(host);
    panel = host;
    const backdrop = host.querySelector('#garageDiagBackdrop');
    host.querySelector('#garageDiagOpen').addEventListener('click', () => { backdrop.hidden = false; refreshPanel(); });
    host.querySelector('#garageDiagClose').addEventListener('click', () => { backdrop.hidden = true; });
    backdrop.addEventListener('click', event => { if (event.target === backdrop) backdrop.hidden = true; });
    host.querySelector('#garageDiagDownload').addEventListener('click', downloadReport);
    host.querySelector('#garageDiagCopy').addEventListener('click', copyReport);
    host.querySelector('#garageDiagClear').addEventListener('click', () => {
      entries.length = 0; sequence = 0;
      try { root.localStorage?.removeItem(PERSIST_KEY); } catch (_) {}
      log('info', 'diagnostics', 'لاگ‌های قبلی توسط کاربر پاک شدند.'); refreshPanel();
    });
    host.querySelector('#garageDiagRun').addEventListener('click', runChecks);
    refreshPanel();
  }

  function refreshPanel() {
    if (!panel) return;
    const summary = panel.querySelector('#garageDiagSummary');
    const count = panel.querySelector('#garageDiagCount');
    const list = panel.querySelector('#garageDiagLog');
    const errors = entries.filter(e => e.level === 'error').length;
    const warnings = entries.filter(e => e.level === 'warn').length;
    const online = root.navigator?.onLine !== false;
    summary.innerHTML = `
      <div><b>${online ? 'آنلاین' : 'آفلاین'}</b><small>وضعیت شبکه</small></div>
      <div><b>${errors}</b><small>خطا</small></div>
      <div><b>${warnings}</b><small>هشدار</small></div>
      <div><b>${entries.length}</b><small>رویداد</small></div>`;
    count.textContent = String(entries.length);
    const recent = entries.slice(-80).reverse();
    list.innerHTML = recent.length ? recent.map(item => `<article class="garage-diag-entry level-${item.level}"><div><b>${escapeHtml(item.scope)}</b><time>${escapeHtml(new Date(item.at).toLocaleTimeString())}</time><span>${escapeHtml(item.level.toUpperCase())}</span></div><p>${escapeHtml(item.message)}</p>${item.details ? `<pre>${escapeHtml(JSON.stringify(item.details, null, 2).slice(0, 1500))}</pre>` : ''}</article>`).join('') : '<div class="empty-state">هنوز خطایی ثبت نشده است. «آزمایش کامل منابع» را اجرا کن.</div>';
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }

  async function runChecks() {
    const startId = sequence;
    log('info', 'diagnostics.self-test', 'آزمایش منابع و ساختار داشبورد شروع شد.');
    const requiredIds = ['connectionBadge', 'statOdometer', 'serviceGrid', 'componentCatalog', 'eventList', 'lastUpdated'];
    const missingIds = requiredIds.filter(id => !root.document.getElementById(id));
    if (missingIds.length) log('error', 'diagnostics.dom', 'عناصر ضروری HTML پیدا نشدند.', { missingIds });
    else log('info', 'diagnostics.dom', 'عناصر ضروری HTML موجود هستند.', { count: requiredIds.length });
    const loader = root.GarageDataLoader;
    if (!loader?.load) log('error', 'diagnostics.loader', 'موتور GarageDataLoader بارگذاری نشده است.');
    else {
      try {
        const data = await loader.load();
        log('info', 'diagnostics.data', 'آزمایش دریافت و اعتبارسنجی داده موفق بود.', {
          mode: data.mode, events: data.events?.length || 0, months: data.months?.length || 0,
          serviceIntervals: Object.keys(data.config?.serviceIntervals || {}).length,
          partCategories: Object.keys(data.config?.partCatalog?.categories || {}).length,
          partItems: Object.keys(data.config?.partCatalog?.items || {}).length,
          serviceCatalog: Object.keys(data.config?.partCatalog?.services || {}).length,
          failedMonths: data.failedMonths || [], warnings: (data.warnings || []).slice(0, 5), source: data.source || 'unknown'
        });
      } catch (error) {
        log('error', 'diagnostics.data', 'آزمایش بارگذاری داده ناموفق بود.', error);
      }
    }
    const newErrors = entries.filter(e => e.id > startId && e.level === 'error').length;
    log(newErrors ? 'warn' : 'info', 'diagnostics.self-test', 'آزمایش ساختار تمام شد.', { newErrorCount: newErrors, totalPreviousErrors: entries.filter(e => e.level === 'error').length - newErrors, online: root.navigator?.onLine !== false });
    refreshPanel();
  }

  root.document?.addEventListener('load', event => {
    const target = event.target;
    if (target?.tagName === 'SCRIPT' && target.src) {
      target.dataset.garageLoaded = 'true';
      log('debug', 'resource.load', 'فایل JavaScript با موفقیت بارگذاری شد.', { url: String(target.src).replace(/[?#].*$/, '') });
    }
  }, true);
  root.addEventListener('error', event => {
    const target = event.target;
    if (target && target !== root && (target.src || target.href)) {
      log('error', 'resource.load', 'بارگذاری یک منبع صفحه ناموفق بود.', { tag: target.tagName, url: String(target.src || target.href).replace(/[?#].*$/, '') });
      return;
    }
    log('error', 'javascript.runtime', event.message || 'خطای جاوااسکریپت', {
      file: String(event.filename || '').replace(/[?#].*$/, ''), line: event.lineno || 0, column: event.colno || 0,
      error: event.error || null
    });
  }, true);
  root.addEventListener('unhandledrejection', event => log('error', 'javascript.promise', 'Promise بدون مدیریت خطا رد شد.', event.reason));
  root.addEventListener('online', () => log('info', 'network', 'اتصال شبکه برقرار شد.'));
  root.addEventListener('offline', () => log('warn', 'network', 'مرورگر اتصال شبکه را از دست داد.'));
  root.addEventListener('securitypolicyviolation', event => log('error', 'security.csp', 'درخواست توسط Content Security Policy مسدود شد.', { directive: event.violatedDirective, blockedURI: event.blockedURI }));

  if (root.fetch) {
    const nativeFetch = root.fetch.bind(root);
    root.fetch = async function (input, init) {
      const rawUrl = typeof input === 'string' ? input : input?.url || '';
      const start = root.performance?.now?.() || Date.now();
      try {
        const response = await nativeFetch(input, init);
        if (/data\/(?:dashboard|index|config)|data\/logs\//.test(rawUrl)) {
          log(response.ok ? 'info' : 'warn', 'network.fetch', `HTTP ${response.status}`, { url: String(rawUrl).replace(/[?#].*$/, ''), durationMs: Math.round((root.performance?.now?.() || Date.now()) - start) });
        }
        return response;
      } catch (error) {
        log('error', 'network.fetch', 'درخواست شبکه با خطا متوقف شد.', { url: String(rawUrl).replace(/[?#].*$/, ''), durationMs: Math.round((root.performance?.now?.() || Date.now()) - start), error });
        throw error;
      }
    };
  }

  restorePersistedEntries();
  root.addEventListener('pagehide', flushPersistedEntries);
  root.addEventListener('beforeunload', flushPersistedEntries);
  root.GarageDiagnostics = Object.freeze({ version: VERSION, log, report, setContext, runChecks, downloadReport, copyReport, get entries() { return entries.slice(); } });
  if (root.document?.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', mountPanel, { once: true });
  else mountPanel();
  log('info', 'diagnostics.boot', `موتور عیب‌یابی نسخه ${VERSION} آماده شد.`, { page: `${root.location?.origin || ''}${root.location?.pathname || ''}` });
})(window);
