/*
 * 206 Garage resilient data loader v3.10.3
 * The browser must not depend on GitHub Actions or the Cloudflare Worker.
 * It prefers the precomputed snapshot, validates freshness, and falls back
 * to raw repository JSON on the website origin, GitHub Raw, or jsDelivr.
 */
(function (root) {
  'use strict';

  const OWNER = 'mehrdadmb2';
  const REPO = 'peugeot-206-garage';
  const BRANCH = 'main';
  const REQUEST_TIMEOUT_MS = 6500;
  const HEDGE_DELAYS_MS = [0, 350, 950];
  const MAX_JSON_CHARS = 8 * 1024 * 1024;
  const LOCAL_CACHE_KEY = 'peugeot206garage:data-cache:v1';
  const LOCAL_CACHE_MAX_CHARS = 3.5 * 1024 * 1024;

  function todayInTehran(now = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(now);
    const fields = Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
    return `${fields.year}-${fields.month}-${fields.day}`;
  }

  function sourceUrls(path) {
    const cleanPath = String(path || '').replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/');
    const stamp = Date.now().toString(36);
    const urls = [];
    try {
      const local = new URL(cleanPath, root.location.href);
      local.searchParams.set('_garage', stamp);
      urls.push(local.href);
    } catch (_) {}
    urls.push(`https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/${cleanPath}?_garage=${stamp}`);
    urls.push(`https://cdn.jsdelivr.net/gh/${OWNER}/${REPO}@${BRANCH}/${cleanPath}?_garage=${stamp}`);
    return [...new Set(urls)];
  }

  async function requestJson(url, label, controller) {
    let timeoutId = null;
    const timeout = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        controller.abort();
        reject(new Error(`${label}: مهلت ${REQUEST_TIMEOUT_MS / 1000} ثانیه‌ای تمام شد.`));
      }, REQUEST_TIMEOUT_MS);
    });

    const request = (async () => {
      const response = await fetch(url, {
        method: 'GET',
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'follow',
        headers: { Accept: 'application/json' },
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`${label}: HTTP ${response.status}`);
      const text = await response.text();
      if (!text || !text.trim()) throw new Error(`${label}: پاسخ خالی است.`);
      if (text.length > MAX_JSON_CHARS) throw new Error(`${label}: حجم JSON غیرمنتظره و بیش از حد مجاز است.`);
      try { return JSON.parse(text); }
      catch (error) { throw new Error(`${label}: JSON نامعتبر است (${error.message}).`); }
    })();

    try {
      return await Promise.race([request, timeout]);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  async function fetchJson(path, label) {
    const urls = sourceUrls(path);
    const activeControllers = [];
    const delayedTimers = [];
    const attempts = urls.map((url, index) => new Promise((resolve, reject) => {
      const delay = HEDGE_DELAYS_MS[index] ?? (index * 650);
      const timer = setTimeout(async () => {
        const controller = new AbortController();
        activeControllers.push(controller);
        try {
          const data = await requestJson(url, label, controller);
          resolve({ data, url, source: sourceName(url) });
        } catch (error) {
          reject(new Error(`${sourceName(url)} → ${error.message}`));
        }
      }, delay);
      delayedTimers.push(timer);
    }));

    try {
      return await Promise.any(attempts);
    } catch (error) {
      const failures = error?.errors || [];
      throw new Error(`تمام منابع برای ${label} ناموفق بودند: ${failures.map(item => item.message).join(' | ')}`);
    } finally {
      delayedTimers.forEach(clearTimeout);
      activeControllers.forEach(controller => controller.abort());
    }
  }

  function sourceName(url) {
    if (url.includes('raw.githubusercontent.com')) return 'GitHub Raw';
    if (url.includes('cdn.jsdelivr.net')) return 'jsDelivr';
    return 'GitHub Pages';
  }

  function validateConfig(config) {
    return Boolean(config && typeof config === 'object' &&
      config.serviceIntervals && Object.keys(config.serviceIntervals).length &&
      config.partCatalog?.categories && Object.keys(config.partCatalog.categories).length &&
      config.partCatalog?.items && Object.keys(config.partCatalog.items).length &&
      config.partCatalog?.services && Object.keys(config.partCatalog.services).length);
  }

  function validateIndex(index) {
    return Boolean(index && typeof index === 'object' && Array.isArray(index.months) &&
      index.months.every(month => /^\d{4}-\d{2}$/.test(String(month))));
  }

  function validateSnapshot(snapshot) {
    if (!snapshot || snapshot.schemaVersion !== 1 || !snapshot.config ||
        !Array.isArray(snapshot.events) || !Array.isArray(snapshot.months)) {
      throw new Error('ساختار dashboard.json معتبر نیست.');
    }
    if (!validateConfig(snapshot.config)) {
      throw new Error('کاتالوگ سرویس‌ها یا قطعات در dashboard.json ناقص است.');
    }
    if (!snapshot.computed || typeof snapshot.computed !== 'object' ||
        Number(snapshot.computed.eventCount) !== snapshot.events.length ||
        !Array.isArray(snapshot.computed.dueItems) ||
        !Array.isArray(snapshot.computed.distanceEntries)) {
      throw new Error('محاسبات داخل dashboard.json ناقص یا ناسازگار است.');
    }
    if (!snapshot.months.every(month => /^\d{4}-\d{2}$/.test(String(month)))) {
      throw new Error('فهرست ماه‌ها در dashboard.json نامعتبر است.');
    }
    if (snapshot.months.length && !snapshot.events.length) {
      throw new Error('ماه ثبت‌شده وجود دارد اما خروجی محاسبات هیچ رویدادی ندارد.');
    }
    const ids = new Set();
    for (const event of snapshot.events) {
      if (!event || !event.id || ids.has(String(event.id))) throw new Error('شناسهٔ رویداد در dashboard.json تکراری یا خالی است.');
      ids.add(String(event.id));
    }
    return true;
  }

  function snapshotStaleness(snapshot, index) {
    const reasons = [];
    const today = todayInTehran();
    if (snapshot.generatedForLocalDate && snapshot.generatedForLocalDate !== today) {
      reasons.push(`تاریخ محاسبات ${snapshot.generatedForLocalDate} است؛ امروز ${today} است.`);
    }
    const generatedAt = Date.parse(snapshot.generatedAt || '');
    if (!Number.isFinite(generatedAt) || Date.now() - generatedAt > 36 * 60 * 60 * 1000) {
      reasons.push('زمان تولید فایل محاسبات نامعتبر یا قدیمی‌تر از ۳۶ ساعت است.');
    }
    if (index) {
      const indexTime = Date.parse(index.updatedAt || '');
      const snapshotSourceTime = Date.parse(snapshot.sourceUpdatedAt || '');
      if (Number.isFinite(indexTime) && (!Number.isFinite(snapshotSourceTime) || indexTime > snapshotSourceTime + 1000)) {
        reasons.push('index.json جدیدتر از آخرین دادهٔ پردازش‌شده در dashboard.json است.');
      }
      const missing = index.months.filter(month => !snapshot.months.includes(month));
      if (missing.length) reasons.push(`ماه‌های جدید در snapshot نیستند: ${missing.join('، ')}.`);
    }
    return reasons;
  }

  function uniqueEvents(monthLogs) {
    const seen = new Set();
    return monthLogs.flatMap(log => log.events).filter(event => {
      if (!event || !event.id || event.deletedAt || seen.has(String(event.id))) return false;
      seen.add(String(event.id));
      return true;
    }).sort((a, b) => {
      const aDate = String(a.occurredAt || a.date || a.createdAt || '');
      const bDate = String(b.occurredAt || b.date || b.createdAt || '');
      return aDate.localeCompare(bDate) || String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
    });
  }

  async function fetchMonthLogs(months) {
    const monthLogs = [];
    const failedMonths = [];
    const sourceWarnings = [];
    for (let offset = 0; offset < months.length; offset += 4) {
      const batch = months.slice(offset, offset + 4);
      const results = await Promise.all(batch.map(async month => {
        try {
          const result = await fetchJson(`data/logs/${month}.json`, `لاگ ${month}`);
          if (!result.data || !Array.isArray(result.data.events)) throw new Error(`لاگ ${month} آرایهٔ events ندارد.`);
          return { month, log: result.data };
        } catch (error) {
          failedMonths.push(month);
          sourceWarnings.push(error.message);
          return null;
        }
      }));
      monthLogs.push(...results.filter(Boolean).map(result => result.log));
    }
    return { monthLogs, failedMonths, sourceWarnings };
  }

  function saveLocalCache(dataset) {
    try {
      if (!root.localStorage || !dataset || !dataset.config || !Array.isArray(dataset.events) || !Array.isArray(dataset.months)) return false;
      const payload = {
        schemaVersion: 1, savedAt: new Date().toISOString(), updatedAt: dataset.updatedAt || null,
        config: dataset.config, events: dataset.events, months: dataset.months,
        failedMonths: dataset.failedMonths || [], warnings: dataset.warnings || []
      };
      const serialized = JSON.stringify(payload);
      if (serialized.length > LOCAL_CACHE_MAX_CHARS) return false;
      root.localStorage.setItem(LOCAL_CACHE_KEY, serialized);
      return true;
    } catch (_) { return false; }
  }

  function readLocalCache() {
    try {
      const raw = root.localStorage?.getItem(LOCAL_CACHE_KEY);
      if (!raw || raw.length > LOCAL_CACHE_MAX_CHARS) return null;
      const cached = JSON.parse(raw);
      if (cached?.schemaVersion !== 1 || !validateConfig(cached.config) ||
          !Array.isArray(cached.events) || !Array.isArray(cached.months) ||
          !cached.months.every(month => /^\d{4}-\d{2}$/.test(String(month)))) return null;
      const ids = new Set();
      const events = cached.events.filter(event => {
        if (!event || !event.id || event.deletedAt || ids.has(String(event.id))) return false;
        ids.add(String(event.id)); return true;
      });
      if (cached.months.length && !events.length) return null;
      return {
        mode: 'offline-cache', config: cached.config, events, months: cached.months.slice().sort().reverse(),
        precomputed: null, generatedAt: cached.savedAt || null, updatedAt: cached.updatedAt || null,
        failedMonths: Array.isArray(cached.failedMonths) ? cached.failedMonths : [],
        warnings: [...(Array.isArray(cached.warnings) ? cached.warnings : []),
          `تمام منابع آنلاین در دسترس نبودند؛ آخرین دادهٔ ذخیره‌شده در این مرورگر از ${cached.savedAt ? new Date(cached.savedAt).toLocaleString('fa-IR') : 'زمان نامشخص'} نمایش داده می‌شود.`],
        source: 'local-browser-cache'
      };
    } catch (_) { return null; }
  }

  async function load() {
    try {
      const dataset = await loadOnline();
      if (dataset.mode !== 'offline-cache') saveLocalCache(dataset);
      return dataset;
    } catch (error) {
      const cached = readLocalCache();
      if (cached) {
        cached.warnings.push(`بازیابی آنلاین ناموفق بود: ${error.message}`);
        return cached;
      }
      throw error;
    }
  }

  async function loadOnline() {
    const [snapshotSettled, indexSettled] = await Promise.allSettled([
      fetchJson('data/dashboard.json', 'تصویر آماده داشبورد'),
      fetchJson('data/index.json', 'data/index.json')
    ]);

    let snapshot = null;
    let snapshotError = null;
    if (snapshotSettled.status === 'fulfilled') {
      snapshot = snapshotSettled.value.data;
      try { validateSnapshot(snapshot); }
      catch (error) { snapshotError = error; snapshot = null; }
    } else snapshotError = snapshotSettled.reason;

    let index = null;
    let indexSourceError = null;
    if (indexSettled.status === 'fulfilled') {
      index = indexSettled.value.data;
      if (!validateIndex(index)) {
        indexSourceError = new Error('ساختار data/index.json معتبر نیست.');
        index = null;
      }
    } else indexSourceError = indexSettled.reason;

    if (snapshot) {
      const staleReasons = snapshotStaleness(snapshot, index);
      if (!staleReasons.length) {
        return {
          mode: 'snapshot', config: snapshot.config,
          events: snapshot.events.filter(event => event && event.id && !event.deletedAt),
          months: snapshot.months.slice().sort().reverse(),
          precomputed: snapshot.computed, generatedAt: snapshot.generatedAt,
          updatedAt: snapshot.sourceUpdatedAt || snapshot.generatedAt,
          failedMonths: [], warnings: [], source: snapshotSettled.value.source
        };
      }
      snapshotError = new Error(staleReasons.join(' '));
    }

    // Actions can fail, time out, publish a broken JSON, or lag behind the data.
    // In every such case load the source-of-truth files and calculate in the browser.
    let directIndex = index;
    if (!directIndex) {
      try {
        const result = await fetchJson('data/index.json', 'data/index.json (مسیر مستقیم)');
        directIndex = result.data;
        if (!validateIndex(directIndex)) throw new Error('ساختار data/index.json معتبر نیست.');
      } catch (error) {
        if (snapshot) {
          return {
            mode: 'snapshot-recalculated', config: snapshot.config,
            events: snapshot.events.filter(event => event && event.id && !event.deletedAt),
            months: snapshot.months.slice().sort().reverse(), precomputed: null,
            generatedAt: snapshot.generatedAt, updatedAt: snapshot.sourceUpdatedAt || snapshot.generatedAt,
            failedMonths: [], warnings: [`index.json از منابع جایگزین خوانده نشد؛ از دادهٔ snapshot استفاده شد: ${error.message}`],
            source: snapshotSettled.value.source
          };
        }
        throw new Error(`فایل محاسبات معتبر نیست و data/index.json هم از هیچ منبعی دریافت نشد. Snapshot: ${snapshotError?.message || 'نامشخص'}. Index: ${error.message}`);
      }
    }

    const configPromise = fetchJson('data/config.json', 'data/config.json');
    const logsPromise = fetchMonthLogs(directIndex.months.slice().sort());
    const [configSettled, logs] = await Promise.all([Promise.allSettled([configPromise]), logsPromise]);
    const configResult = configSettled[0];
    let config = configResult.status === 'fulfilled' ? configResult.value.data : null;

    if (!validateConfig(config)) {
      if (snapshot) {
        return {
          mode: 'snapshot-recalculated', config: snapshot.config,
          events: snapshot.events.filter(event => event && event.id && !event.deletedAt),
          months: snapshot.months.slice().sort().reverse(), precomputed: null,
          generatedAt: snapshot.generatedAt, updatedAt: snapshot.sourceUpdatedAt || snapshot.generatedAt,
          failedMonths: [], warnings: [`config.json مستقیم خوانده نشد؛ برای جلوگیری از صفحهٔ خالی از آخرین snapshot استفاده شد. ${configResult.status === 'rejected' ? configResult.reason.message : 'کاتالوگ config ناقص است.'}`],
          source: snapshotSettled.value.source
        };
      }
      throw new Error(`config.json ناقص یا غیرقابل‌دسترسی است. ${configResult.status === 'rejected' ? configResult.reason.message : 'کاتالوگ سرویس/قطعات خالی است.'}`);
    }

    const events = uniqueEvents(logs.monthLogs);
    if (directIndex.months.length && !events.length) {
      if (snapshot) {
        return {
          mode: 'snapshot-recalculated', config: snapshot.config,
          events: snapshot.events.filter(event => event && event.id && !event.deletedAt),
          months: snapshot.months.slice().sort().reverse(), precomputed: null,
          generatedAt: snapshot.generatedAt, updatedAt: snapshot.sourceUpdatedAt || snapshot.generatedAt,
          failedMonths: logs.failedMonths,
          warnings: ['لاگ‌های خام هنوز قابل دریافت نیستند؛ دادهٔ آخرین snapshot با محاسبات مستقیم مرورگر نمایش داده شد.', ...logs.sourceWarnings],
          source: snapshotSettled.value.source
        };
      }
      throw new Error(`ماه در index.json ثبت شده اما هیچ رویدادی از لاگ‌ها دریافت نشد. ${logs.sourceWarnings.join(' | ')}`);
    }

    const warnings = [];
    if (snapshotError) warnings.push(`فایل محاسبات قابل اتکا نبود؛ محاسبهٔ مستقیم فعال شد. علت: ${snapshotError.message}`);
    if (indexSourceError) warnings.push(`index.json از مسیر اول دریافت نشد؛ منبع جایگزین استفاده شد: ${indexSourceError.message}`);
    if (logs.failedMonths.length) warnings.push(`بارگذاری ${logs.failedMonths.length} ماه ناقص بود: ${logs.failedMonths.join('، ')}.`);

    return {
      mode: logs.failedMonths.length ? 'direct-partial' : 'direct-fallback',
      config, events, months: directIndex.months.slice().sort().reverse(),
      precomputed: null, generatedAt: null, updatedAt: directIndex.updatedAt || null,
      failedMonths: logs.failedMonths, warnings: [...warnings, ...logs.sourceWarnings],
      source: 'raw-data'
    };
  }

  root.GarageDataLoader = Object.freeze({
    load, fetchJson, validateConfig, validateIndex, validateSnapshot, snapshotStaleness,
    saveLocalCache, readLocalCache,
    version: '3.10.3'
  });
})(window);
