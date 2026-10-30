(() => {
  'use strict';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const state = { events: [], config: null, months: [], precomputed: null, snapshotGeneratedAt: null, dataMode: 'idle', dataWarnings: [], range: 6, analyticsPeriod: 'month', componentCategoryFilter: 'all', shown: 12, filtered: [], refreshedAt: null };
  const typeLabels = {
    odometer: 'کیلومترشمار', trip: 'مسافت', fuel: 'سوخت‌گیری', service: 'سرویس', part: 'قطعه',
    expense: 'هزینه', fine: 'جریمه', wash: 'کارواش', issue: 'خرابی', repair: 'تعمیر', note: 'یادداشت'
  };
  const typeIcons = { odometer: '⌁', trip: '↗', fuel: '⛽', service: '⚙', part: '◈', expense: '◉', fine: '!', wash: '✦', issue: '⚠', repair: '✓', note: '≡' };
  const serviceColors = { critical: 'rgba(255,109,131,.08)', safety: 'rgba(255,175,104,.07)', service: 'rgba(64,229,244,.06)' };
  const serviceAliases = {
    engine_oil: ['روغن موتور', 'oil'], oil_filter: ['فیلتر روغن', 'oil filter'], air_filter: ['فیلتر هوا', 'air filter'],
    cabin_filter: ['فیلتر کابین', 'فیلتر اتاق', 'cabin filter'], fuel_filter: ['فیلتر بنزین', 'فیلتر سوخت', 'fuel filter'],
    spark_plugs: ['شمع موتور', 'شمع', 'spark plug'], timing_belt: ['تسمه تایم', 'timing belt'], coolant: ['ضدیخ', 'مایع خنک‌کننده', 'آب رادیاتور', 'coolant'],
    brake_fluid: ['روغن ترمز', 'brake fluid'], brake_inspection: ['بازدید ترمز', 'لنت', 'brake'], tyre_inspection: ['لاستیک', 'فشار باد', 'tyre'], battery_check: ['باتری', 'باطری', 'battery']
  };
  let toastTimer = null;

  document.addEventListener('DOMContentLoaded', () => {
    const diag = window.GarageDiagnostics;
    const safeBind = (selector, type, handler) => {
      const element = $(selector);
      if (!element) { diag?.log('warn', 'app.dom', `عنصر ${selector} پیدا نشد؛ رویداد ${type} متصل نشد.`); return; }
      if (typeof handler !== 'function') { diag?.log('error', 'app.bind', `تابع رویداد ${selector}/${type} تعریف نشده است.`); return; }
      element.addEventListener(type, handler);
    };
    try {
      document.addEventListener('click', event => {
        const target = event.target;
        const categoryButton = target?.closest?.('[data-component-category]');
        if (categoryButton) {
          state.componentCategoryFilter = categoryButton.dataset.componentCategory || 'all';
          safeRender('catalog-filter', renderComponentCatalog);
          return;
        }
        const tab = target?.closest?.('[data-tab]');
        if (tab) { event.preventDefault(); activateTab(tab.dataset.tab); return; }
        const anchor = target?.closest?.('a[href^="#"]');
        if (anchor) {
          const id = anchor.getAttribute('href').slice(1);
          const targetNode = id ? document.getElementById(id) : null;
          const pane = targetNode?.closest('[data-view-pane]');
          if (pane) { event.preventDefault(); activateTab(pane.dataset.viewPane); }
          else if (id === 'top') { event.preventDefault(); activateTab('overview'); }
        }
      });
      safeBind('#refreshButton', 'click', () => loadDashboard(true));
      document.addEventListener('click', async event => {
        const commandButton = event.target?.closest?.('[data-component-command]');
        if (!commandButton) return;
        const command = commandButton.dataset.componentCommand || '';
        try { await navigator.clipboard.writeText(command); showToast('نمونه دستور ثبت قطعه/سرویس کپی شد.'); }
        catch { showToast(command); }
      });
      safeBind('#exportCsv', 'click', exportCsv);
      safeBind('#exportJson', 'click', exportJson);
      safeBind('#exportCsvAll', 'click', exportCsvAll);
      safeBind('#exportJsonAll', 'click', exportJsonAll);
      safeBind('#expenseCsv', 'click', exportExpensesCsv);
      safeBind('#copyApiExample', 'click', copyApiExample);
      safeBind('#searchInput', 'input', updateJournal);
      safeBind('#typeFilter', 'change', updateJournal);
      safeBind('#monthFilter', 'change', updateJournal);
      safeBind('#actorFilter', 'change', updateJournal);
      safeBind('#guideSearch', 'input', filterGuideCards);
      safeBind('#loadMoreButton', 'click', () => { state.shown += 12; renderJournal(); });
      $$('[data-analytics-period]').forEach(button => button.addEventListener('click', () => {
        $$('[data-analytics-period]').forEach(item => { const active = item === button; item.classList.toggle('active', active); item.setAttribute('aria-pressed', active ? 'true' : 'false'); });
        state.analyticsPeriod = button.dataset.analyticsPeriod || 'month';
        safeRender('analytics', renderAnalytics);
      }));
      $$('.range-button').forEach(button => button.addEventListener('click', () => {
        $$('.range-button').forEach(x => x.classList.toggle('active', x === button));
        state.range = Number(button.dataset.range) || 6;
        safeRender('fuel-page', renderFuelPage); safeRender('expense-page', renderExpensePage);
      }));
      safeBind('#copyHelpButton', 'click', async () => {
        const help = 'کیلومتر ۱۵۶۲۰۰\nامروز ۸۵ کیلومتر رانندگی کردم\n۲۰ لیتر بنزین · هزینه ۷۰۰ هزار تومان · کیلومتر ۱۵۶۲۰۰\nروغن موتور را عوض کردم · هزینه ۹۰۰ هزار تومان · کیلومتر ۱۵۶۰۰۰\nخرابی: صدای جلوبندی\nجریمه سرعت ۵۰۰ هزار تومان\nکارواش ۱۸۰ هزار تومان';
        try { await navigator.clipboard.writeText(help); showToast('نمونه دستورهای ثبت خودرو کپی شد.'); }
        catch { showToast('کپی خودکار در این مرورگر در دسترس نیست.'); }
      });
      try { initTilt(); } catch (error) { diag?.log('warn', 'app.effects', 'افکت تعاملی غیرفعال شد.', error); }
      activateTab('overview', false);
      diag?.log('info', 'app.bootstrap', 'رویدادهای رابط کاربری متصل شدند.');
      loadDashboard(false);
    } catch (error) {
      diag?.log('error', 'app.bootstrap', 'راه‌اندازی رابط کاربری با خطا مواجه شد.', error);
      setConnection('error');
      const note = $('#lastUpdated');
      if (note) note.textContent = `خطا هنگام راه‌اندازی رابط کاربری: ${String(error?.message || error)}`;
      if (window.__garageBootScreen?.fail) window.__garageBootScreen.fail('راه‌اندازی داشبورد با خطا مواجه شد. از «گزارش فنی» خروجی بگیر.');
      // Data loading is still attempted independently of nonessential UI bindings.
      loadDashboard(false);
    }
  });

  async function loadDashboard(userInitiated) {
    const loadStartedAt = Date.now();
    window.GarageDiagnostics?.log('info', 'app.load', 'بارگذاری داشبورد آغاز شد.', { userInitiated: Boolean(userInitiated), loaderAvailable: Boolean(window.GarageDataLoader?.load) });
    const refreshButton = $('#refreshButton');
    try {
      setConnection('loading');
      refreshButton?.classList.add('is-loading');
      if (!window.GarageDataLoader || typeof window.GarageDataLoader.load !== 'function') {
        throw new Error('موتور بارگذاری مستقل assets/js/data-loader.js پیدا نشد؛ مطمئن شو فایل جدید و نسخهٔ index.html هم‌زمان منتشر شده‌اند.');
      }

      const dataset = await window.GarageDataLoader.load();
      if (!dataset || !dataset.config || !Array.isArray(dataset.events) || !Array.isArray(dataset.months)) {
        throw new Error('منبع داده پاسخ کامل و قابل‌استفاده برنگرداند.');
      }

      window.GarageDiagnostics?.log('info', 'app.dataset', 'داده از موتور بارگذاری دریافت شد.', { mode: dataset.mode, eventCount: dataset.events.length, monthCount: dataset.months.length, serviceIntervals: Object.keys(dataset.config.serviceIntervals || {}).length, partCategories: Object.keys(dataset.config.partCatalog?.categories || {}).length, partItems: Object.keys(dataset.config.partCatalog?.items || {}).length, serviceCatalog: Object.keys(dataset.config.partCatalog?.services || {}).length, failedMonths: dataset.failedMonths || [], source: dataset.source || 'unknown' });
      state.config = dataset.config;
      state.events = dataset.events.filter(event => event && event.id && !event.deletedAt);
      state.months = dataset.months.filter(month => /^\d{4}-\d{2}$/.test(month)).sort().reverse();
      state.precomputed = dataset.precomputed && typeof dataset.precomputed === 'object' ? dataset.precomputed : null;
      state.snapshotGeneratedAt = dataset.generatedAt || null;
      state.dataMode = dataset.mode || 'unknown';
      state.dataWarnings = Array.isArray(dataset.warnings) ? dataset.warnings : [];
      state.failedMonths = Array.isArray(dataset.failedMonths) ? dataset.failedMonths : [];
      state.refreshedAt = new Date();

      populateMonthFilter();
      populateActorFilter();
      renderAll();
      setConnection('connected', state.dataMode);
      window.GarageDiagnostics?.setContext({ mode: state.dataMode, eventCount: state.events.length, monthCount: state.months.length, failedMonths: state.failedMonths, warningCount: state.dataWarnings.length, loadedInMs: Date.now() - loadStartedAt });

      const idxDate = dataset.updatedAt ? formatDateTime(dataset.updatedAt) : 'زمان ثبت منبع نامشخص';
      const countLabel = `${formatNumber(state.events.length)} رویداد از ${formatNumber(state.months.length)} ماه`;
      const modeLabel = state.dataMode === 'snapshot' ? 'محاسبات آماده' :
        state.dataMode === 'snapshot-recalculated' ? 'بازمحاسبهٔ محلی از آخرین دادهٔ سالم' :
        state.dataMode === 'offline-cache' ? 'حافظهٔ آفلاین مرورگر' :
        state.dataMode === 'direct-partial' ? 'محاسبهٔ مستقیم · دادهٔ ناقص' : 'محاسبهٔ مستقیم مرورگر';
      const lastUpdatedNode = $('#lastUpdated');
      if (lastUpdatedNode) lastUpdatedNode.textContent = `آخرین به‌روزرسانی منبع: ${idxDate} · ${modeLabel}`;

      const notes = [];
      if (state.dataMode === 'snapshot') {
        notes.push(`Snapshot معتبر: ${state.snapshotGeneratedAt ? formatDateTime(state.snapshotGeneratedAt) : 'زمان تولید نامشخص'}.`);
      } else if (state.dataMode === 'offline-cache') {
        notes.push('اتصال آنلاین برقرار نشد؛ آخرین نسخهٔ ذخیره‌شده در همین مرورگر با محاسبات مستقیم استفاده شده است.');
      } else {
        notes.push('داده‌های اصلی مستقیماً خوانده شدند؛ محاسبات در مرورگر انجام می‌شود و به GitHub Actions وابسته نیست.');
      }
      if (state.failedMonths.length) notes.push(`فایل‌های ماهانهٔ ناموفق: ${state.failedMonths.join('، ')}.`);
      notes.push(...state.dataWarnings);
      const journalBottomNote = $('#journalBottomNote');
      if (journalBottomNote) journalBottomNote.textContent = `${countLabel} · ${notes.join(' ')}`;

      if (window.__garageBootScreen?.success) window.__garageBootScreen.success();
      if (userInitiated) {
        showToast(state.dataMode === 'snapshot'
          ? 'فایل محاسبات آماده با موفقیت بارگیری شد.'
          : state.dataMode === 'offline-cache'
            ? 'اتصال برقرار نشد؛ آخرین دادهٔ ذخیره‌شده به‌صورت آفلاین نمایش داده شد.'
            : state.failedMonths.length
            ? 'داده‌ها با محاسبهٔ مستقیم بارگیری شدند، اما بعضی ماه‌ها ناقص‌اند.'
            : 'فایل محاسبات آماده نبود؛ سایت داده‌های خام را خواند و محاسبه کرد.');
      }
    } catch (error) {
      console.error('[206 Garage] dashboard load failed:', error);
      window.GarageDiagnostics?.log('error', 'app.load', 'بارگذاری یا رندر داشبورد ناموفق شد.', error);
      state.dataMode = 'error';
      setConnection('error');
      const reason = String(error?.message || 'خطای نامشخص');
      const lastUpdatedNode = $('#lastUpdated');
      if (lastUpdatedNode) lastUpdatedNode.textContent = 'هیچ منبع دادهٔ قابل‌اعتمادی در دسترس نبود؛ اعداد ساختگی نمایش داده نمی‌شوند.';
      const eventListNode = $('#eventList');
      if (eventListNode) eventListNode.innerHTML = `<div class="empty-state"><b>داده‌ها از هیچ‌یک از منابع دریافت نشدند.</b><br><small>${escapeHtml(reason)}</small><br>سایت مستقل از ربات و GitHub Actions است؛ برای بازیابی داده، اتصال GitHub Pages، GitHub Raw یا jsDelivr را بررسی کن.</div>`;
      const journalBottomNote = $('#journalBottomNote');
      if (journalBottomNote) journalBottomNote.textContent = `خطای دریافت داده: ${reason}`;
      if (window.__garageBootScreen?.fail) window.__garageBootScreen.fail(`بارگذاری مستقیم و فایل محاسبات آماده هر دو ناموفق شدند: ${reason}`);
      if (userInitiated) showToast('دریافت داده ناموفق بود؛ جزئیات در دفتر وقایع ثبت شد.');
    } finally {
      refreshButton?.classList.remove('is-loading');
      if (window.__garageBootScreen?.release) window.__garageBootScreen.release();
      else {
        const boot = $('#bootScreen');
        if (boot) { boot.classList.add('boot-screen-hidden'); boot.style.display = 'none'; setTimeout(() => boot.remove(), 50); }
      }
    }
  }

  function safeRender(name, renderer) {
    try {
      if (typeof renderer !== 'function') throw new Error(`تابع رندر ${name} تعریف نشده است.`);
      renderer();
      window.GarageDiagnostics?.log('debug', 'app.render', `بخش ${name} با موفقیت رندر شد.`);
      return true;
    } catch (error) {
      window.GarageDiagnostics?.log('error', `render.${name}`, `رندر بخش ${name} ناموفق بود.`, error);
      const targetMap = { stats: '#statOdometer', services: '#serviceGrid', analytics: '#costChart', journal: '#eventList', fuel: '#fuelEventList', expenses: '#expenseEventList', traffic: '#unpaidFinesList', settings: '#settingsServiceTable' };
      const targetSelector = targetMap[name];
      const target = targetSelector ? $(targetSelector) : null;
      if (target) target.insertAdjacentHTML('beforeend', `<div class="empty-state render-error">خطا در نمایش این بخش: ${escapeHtml(error?.message || error)}</div>`);
      return false;
    }
  }

  function renderAll() {
    const sections = [
      ['stats', renderStats], ['services', renderServices], ['analytics', renderAnalytics],
      ['journal', updateJournal], ['fines', renderFinesAndIssues], ['overview-extras', renderOverviewExtras],
      ['fuel', renderFuelPage], ['expenses', renderExpensePage], ['traffic', renderTrafficDetails],
      ['settings', renderSettingsPage], ['ownership', renderOwnershipSummary]
    ];
    sections.forEach(([name, renderer]) => safeRender(name, renderer));
  }

  function activateTab(name, scroll = true) {
    const valid = ['overview','maintenance','fuel','analytics','expenses','traffic','journal','settings'];
    const target = valid.includes(name) ? name : 'overview';
    $$('[data-view-pane]').forEach(pane => pane.classList.toggle('active', pane.dataset.viewPane === target));
    $$('[data-tab]').forEach(item => {
      const active = item.dataset.tab === target;
      item.classList.toggle('active', active);
      if (item.classList.contains('app-tab')) item.setAttribute('aria-selected', active ? 'true' : 'false');
      if (item.tagName === 'A') { if (active) item.setAttribute('aria-current','page'); else item.removeAttribute('aria-current'); }
    });
    if (scroll) window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    if (target === 'analytics') requestAnimationFrame(renderAnalytics);
  }

  function setConnection(status, mode = '') {
    const badge = $('#connectionBadge');
    if (!badge) {
      window.GarageDiagnostics?.log('error', 'app.dom', 'عنصر connectionBadge در HTML وجود ندارد.');
      return;
    }
    badge.classList.remove('connected', 'error', 'fallback', 'partial', 'offline');
    if (status === 'connected') {
      if (mode === 'snapshot') {
        badge.classList.add('connected'); badge.innerHTML = '<i></i> داده‌ها آماده';
        badge.title = 'فایل محاسبات آماده و معتبر است.';
      } else if (mode === 'direct-partial') {
        badge.classList.add('partial'); badge.innerHTML = '<i></i> محاسبه مستقیم · ناقص';
        badge.title = 'بعضی فایل‌های ماهانه در دسترس نبودند؛ جزئیات در دفتر وقایع است.';
      } else if (mode === 'offline-cache') {
        badge.classList.add('offline'); badge.innerHTML = '<i></i> حافظه آفلاین';
        badge.title = 'منابع آنلاین در دسترس نبودند؛ آخرین دادهٔ ذخیره‌شده در این مرورگر نمایش داده شده است.';
      } else {
        badge.classList.add('fallback'); badge.innerHTML = '<i></i> محاسبه مستقیم';
        badge.title = 'داده‌ها مستقیم خوانده و در مرورگر محاسبه شده‌اند؛ GitHub Actions ضروری نیست.';
      }
    } else if (status === 'error') {
      badge.classList.add('error'); badge.innerHTML = '<i></i> خطای دریافت داده';
      badge.title = 'تمام منابع داده ناموفق بودند.';
    } else {
      badge.innerHTML = '<i></i> در حال دریافت داده';
      badge.title = 'در حال بررسی Snapshot و منابع خام جایگزین.';
    }
  }

  function renderStats() {
    const all = state.events;
    const now = localDateString(new Date());
    const monthKey = now.slice(0, 7);
    const monthEvents = all.filter(event => String(event.date || event.occurredAt || '').slice(0, 7) === monthKey);
    const currentOdo = calculateOdometer(all);
    const monthFuel = monthEvents.filter(e => e.type === 'fuel');
    const cached = state.precomputed?.currentMonth === monthKey ? state.precomputed : null;
    const totalLiters = cached ? Number(cached.currentMonthFuelLiters) || 0 : sum(monthFuel, e => e.liters);
    const due = calculateDue(all, state.config, currentOdo);
    const cost = cached ? Number(cached.currentMonthCostRial) || 0 : sum(all.filter(e => isActualExpense(e) && expenseDate(e).slice(0, 7) === monthKey), e => e.costRial);
    $('#statOdometer').textContent = currentOdo == null ? '—' : formatNumber(currentOdo);
    $('#statOdometerFoot').textContent = currentOdo == null ? 'ابتدا /km را در تلگرام ثبت کن' : `بر پایه ${countOdometerSources(all)} ثبت کیلومتر/مسافت`;
    $('#statCost').textContent = currentOdo == null && !monthEvents.length ? '—' : compactMoney(cost / 10);
    $('#statCostFoot').textContent = `${formatNumber(monthEvents.length)} رویداد در ماه جاری`;
    $('#statFuel').textContent = monthFuel.length ? formatNumber(totalLiters, 1) : '۰';
    $('#statFuelFoot').textContent = `${formatNumber(monthFuel.length)} بار سوخت‌گیری`;
    $('#statDue').textContent = due.length ? formatNumber(due.length) : '۰';
    $('#statDueFoot').textContent = due.some(x => x.overdue) ? 'حداقل یک سرویس از موعد گذشته' : due.length ? 'سرویس نزدیک موعد را بررسی کن' : 'از داده‌های سرویس ثبت‌شده';
  }

  function maintenanceStage(remainingKm, remainingDays, intervalKm, intervalDays) {
    const kmOver = remainingKm != null && remainingKm < 0 ? Math.abs(remainingKm) : 0;
    const daysOver = remainingDays != null && remainingDays < 0 ? Math.abs(remainingDays) : 0;
    if ((intervalKm > 0 && kmOver >= Math.max(1000, intervalKm * .2)) || daysOver >= 30) return 'critical';
    if ((remainingKm != null && remainingKm <= 0) || (remainingDays != null && remainingDays <= 0)) return 'overdue';
    if ((remainingKm != null && intervalKm > 0 && remainingKm <= Math.max(100, intervalKm * .02)) || (remainingDays != null && remainingDays <= 3)) return 'due';
    if ((remainingKm != null && intervalKm > 0 && remainingKm <= Math.max(500, intervalKm * .1)) || (remainingDays != null && remainingDays <= 14)) return 'upcoming';
    return 'ok';
  }
  function maintenanceStageLabel(stage) {
    return ({ critical: '🔴 بحرانی', overdue: '⛔ عقب‌افتاده', due: '🟠 سر موعد', upcoming: '🟡 نزدیک موعد', ok: '🟢 در بازه مجاز', monitor: '🔎 پایش عمر' })[stage] || '🔎 بررسی';
  }
  function maintenanceStageClass(stage) {
    return ({ critical: 'critical', overdue: 'danger', due: 'due', upcoming: 'warn', ok: 'ok', monitor: 'ok' })[stage] || '';
  }
  function maintenanceStageRank(stage) {
    return ({ critical: 0, overdue: 1, due: 2, upcoming: 3, ok: 4, monitor: 5 })[stage] ?? 6;
  }
  function latestMaintenanceEvent(events, key, typeKey = 'serviceKey') {
    return events.filter(e =>
      ((e.type === 'service' || e.type === 'part' || e.type === 'repair') && (e[typeKey] === key || e.componentKey === key)) &&
      !(e.type === 'issue' && e.status !== 'fixed')
    ).sort((a, b) => eventEpoch(b) - eventEpoch(a))[0] || null;
  }

  function renderServices() {
    const config = state.config || {};
    const services = Object.entries(config.serviceIntervals || {});
    const events = state.events;
    const ownership = config.ownership || {};
    const purchaseKm = Number(ownership.purchaseOdometerKm ?? config.vehicle?.purchaseOdometerKm ?? 428000);
    const purchaseDate = /^\d{4}-\d{2}-\d{2}$/.test(String(ownership.purchaseDate || '')) ? ownership.purchaseDate : null;
    const currentOdo = calculateOdometer(events);
    const serviceCards = services.map(([key, service]) => {
      const latest = events.filter(e =>
        (e.type === 'service' && (e.serviceKey === key || e.componentKey === key || e.serviceCatalogKey === key)) ||
        ((e.type === 'part' || e.type === 'repair' || (e.type === 'issue' && e.status === 'fixed')) && e.status !== 'open' && (e.serviceKey === key || e.componentKey === key || e.serviceCatalogKey === key) && (e.componentReplaced || e.type === 'repair' || e.status === 'fixed'))
      ).sort((a, b) => eventEpoch(b) - eventEpoch(a))[0] || null;
      const baseline = !latest;
      const reference = latest || {
        id: `purchase-${key}`,
        type: 'purchase-baseline',
        odometerKm: purchaseKm,
        date: purchaseDate,
        occurredAt: purchaseDate ? `${purchaseDate}T12:00:00+03:30` : null,
        jalaliDate: purchaseDate ? purchaseDate : 'از مبنای خرید',
        baseline: true
      };
      const intervalKm = Number(service.intervalKm) || 0;
      const intervalDays = Number(service.intervalDays) || 0;
      const referenceKm = Number.isFinite(Number(reference.odometerKm)) ? Number(reference.odometerKm) : null;
      const remainingKm = intervalKm > 0 && currentOdo != null && referenceKm != null ? Math.round(referenceKm + intervalKm - currentOdo) : null;
      const referenceDate = reference.date || String(reference.occurredAt || '').slice(0, 10) || null;
      const dueDate = intervalDays > 0 && referenceDate ? addDays(referenceDate, intervalDays) : null;
      const remainingDays = dueDate ? daysBetween(localDateString(new Date()), dueDate) : null;
      const hasInterval = intervalKm > 0 || intervalDays > 0;
      const stage = hasInterval ? maintenanceStage(remainingKm, remainingDays, intervalKm, intervalDays) : 'monitor';
      const status = `${maintenanceStageLabel(stage)}${baseline ? ' · بدون سابقه' : ''}`;
      const statusClass = maintenanceStageClass(stage);
      const progress = intervalKm > 0 && remainingKm != null
        ? clamp((intervalKm - remainingKm) / intervalKm * 100, 0, 100)
        : (intervalDays > 0 && remainingDays != null ? clamp((intervalDays - remainingDays) / intervalDays * 100, 0, 100) : 0);
      const headline = remainingKm != null
        ? (remainingKm <= 0 ? `${formatNumber(Math.abs(remainingKm))} km عبور از موعد` : `${formatNumber(remainingKm)} km`)
        : remainingDays != null ? `${formatNumber(Math.abs(remainingDays))} روز${remainingDays <= 0 ? ' عبور از موعد' : ' تا موعد'}`
          : currentOdo != null && referenceKm != null ? `${formatNumber(Math.max(0, currentOdo - referenceKm))} km از مبنا` : 'نامشخص';
      const subline = remainingKm != null ? (remainingKm <= 0 ? 'از موعد کیلومتری گذشته' : 'تا موعد کیلومتری بعدی')
        : remainingDays != null ? (remainingDays <= 0 ? 'از موعد زمانی گذشته' : 'تا موعد زمانی بعدی')
          : baseline ? 'از مبنای کیلومتر خرید؛ تاریخ خرید برای محاسبه روز مشخص نیست' : 'برای تخمین موعد، تاریخ/کیلومتر معتبر لازم است';
      const footParts = [];
      if (baseline) {
        footParts.push(`سابقه سرویس ثبت نشده؛ مبنای کیلومتری ${formatNumber(purchaseKm)} km`);
        footParts.push(purchaseDate ? `تاریخ مبنا: ${escapeHtml(purchaseDate)}` : 'سن تقویمی از خرید محاسبه نمی‌شود');
      } else {
        if (latest.odometerKm != null) footParts.push(`آخرین سرویس/تعویض: ${formatNumber(latest.odometerKm)} km`);
        footParts.push(`تاریخ: ${escapeHtml(latest.jalaliDate || latest.date || '—')}`);
        if (latest.actor) footParts.push(`انجام‌دهنده: ${escapeHtml(latest.actor)}`);
        if (latest.note) footParts.push(`توضیح: ${escapeHtml(latest.note)}`);
      }
      return { key, stage, rank: maintenanceStageRank(stage), kmSort: remainingKm ?? Infinity, card: serviceCard({ key, service, latest: reference, status, statusClass, headline, subline, progress, foot: footParts.join(' · ') }) };
    }).sort((a, b) => a.rank - b.rank || a.kmSort - b.kmSort || a.key.localeCompare(b.key));
    const dynamicCards = renderInstalledMaintenanceCards(config, events, currentOdo);
    $('#serviceGrid').innerHTML = serviceCards.length
      ? serviceCards.map(item => item.card).join('')
      : '<div class="empty-state">سرویس اصلی تعریف نشده است؛ موارد پویای قطعات در بخش پایین نمایش داده می‌شوند.</div>';
    const dynamicRoot = $('#dynamicMaintenanceGrid');
    if (dynamicRoot) dynamicRoot.innerHTML = dynamicCards.length ? dynamicCards.join('') : '<div class="empty-state">هنوز قلم تکمیلی در کاتالوگ تعریف نشده است.</div>';
    renderComponentCatalog();
    renderInstalledComponents();
    renderServiceCatalog();
  }

  function renderInstalledMaintenanceCards(config, events, currentOdo) {
    const catalog = config?.partCatalog || {};
    const items = catalog.items || {};
    const categories = catalog.categories || {};
    const scheduled = config?.serviceIntervals || {};
    const ownership = config?.ownership || {};
    const purchaseKm = Number(ownership.purchaseOdometerKm ?? config?.vehicle?.purchaseOdometerKm ?? 428000);
    const purchaseDate = /^\d{4}-\d{2}-\d{2}$/.test(String(ownership.purchaseDate || '')) ? ownership.purchaseDate : null;
    const cards = [];
    for (const [key, item] of Object.entries(items)) {
      if (key in scheduled || (item.serviceKey && item.serviceKey in scheduled)) continue;
      const event = events.filter(e =>
        ((e.componentKey === key || e.serviceKey === key || e.serviceCatalogKey === key) && (e.componentReplaced || e.type === 'repair' || e.type === 'service' || (e.type === 'issue' && e.status === 'fixed')))
      ).filter(e => e.status !== 'open').sort((a,b) => eventEpoch(b)-eventEpoch(a))[0] || null;
      const baseline = !event;
      const reference = event || { id: `purchase-${key}`, type: 'purchase-baseline', date: purchaseDate, occurredAt: purchaseDate ? `${purchaseDate}T12:00:00+03:30` : null, jalaliDate: purchaseDate || 'از مبنای خرید', odometerKm: purchaseKm, baseline: true };
      const category = categories[item.category] || { label: item.category || 'قطعه', icon: '🔩', theme: '#36c7e8' };
      const refKm = Number.isFinite(Number(reference.odometerKm)) ? Number(reference.odometerKm) : null;
      const kmSince = currentOdo != null && refKm != null ? Number(currentOdo) - refKm : null;
      const referenceDate = reference.date || String(reference.occurredAt || '').slice(0,10) || null;
      const daysSince = referenceDate ? Math.max(0, daysBetween(referenceDate, localDateString(new Date()))) : null;
      const intervalKm = Number(item.intervalKm) || 0;
      const intervalDays = Number(item.intervalDays) || 0;
      const hasInterval = item.mode === 'periodic' && (intervalKm > 0 || intervalDays > 0);
      const remainingKm = hasInterval && intervalKm > 0 && kmSince != null ? intervalKm - kmSince : null;
      const remainingDays = hasInterval && intervalDays > 0 && referenceDate ? intervalDays - daysSince : null;
      const stage = hasInterval ? maintenanceStage(remainingKm, remainingDays, intervalKm, intervalDays) : 'monitor';
      const status = `${maintenanceStageLabel(stage)}${baseline ? ' · سابقه ندارد' : ''}`;
      const statusClass = maintenanceStageClass(stage);
      const headline = hasInterval
        ? (remainingKm != null ? (remainingKm <= 0 ? `${formatNumber(Math.abs(remainingKm))} km عبور از موعد` : `${formatNumber(remainingKm)} km`) : remainingDays != null ? `${formatNumber(Math.max(0, remainingDays))} روز` : 'موعد نامشخص')
        : (kmSince != null ? `${formatNumber(Math.max(0, kmSince))} km` : 'عمر نامشخص');
      const subline = hasInterval
        ? (stage === 'critical' ? 'بسیار فراتر از بازه؛ بررسی فوری' : stage === 'overdue' ? 'از بازهٔ تنظیم‌شده عبور کرده' : stage === 'due' ? 'موعد تعویض/بازدید رسیده' : stage === 'upcoming' ? 'به موعد نزدیک می‌شود' : 'کارکرد از مرجع نگهداری')
        : (baseline ? 'پایش از کیلومتر خرید؛ نصب/تعویض ثبت نشده' : 'کارکرد پس از نصب ثبت‌شده');
      const footParts = [];
      if (baseline) {
        footParts.push(`سابقه نصب/تعویض ثبت نشده؛ مبنای کیلومتری ${formatNumber(purchaseKm)} km`);
        footParts.push(purchaseDate ? `تاریخ مبنا: ${escapeHtml(purchaseDate)}` : 'روزهای گذشته از خرید قابل محاسبه نیست');
      } else {
        footParts.push(`آخرین ثبت: ${escapeHtml(reference.jalaliDate || reference.date || '—')}`);
        if (reference.odometerKm != null) footParts.push(`کیلومتر ثبت: ${formatNumber(reference.odometerKm)} km`);
        if (reference.actor) footParts.push(`شخص: ${escapeHtml(reference.actor)}`);
        if (reference.brand) footParts.push(`برند: ${escapeHtml(reference.brand)}`);
        if (reference.model) footParts.push(`مدل: ${escapeHtml(reference.model)}`);
        if (reference.note) footParts.push(`توضیح: ${escapeHtml(reference.note)}`);
      }
      const intervalLabel = hasInterval ? [intervalKm ? `${formatNumber(intervalKm)} km` : '', intervalDays ? `${formatNumber(intervalDays)} روز` : ''].filter(Boolean).join(' · ') : 'عمرمحور / بازدیدمحور؛ بازه ثابت تعریف نشده';
      const progress = hasInterval && intervalKm > 0 && kmSince != null ? clamp(kmSince / intervalKm * 100,0,100) : hasInterval && intervalDays > 0 && daysSince != null ? clamp(daysSince / intervalDays * 100,0,100) : 0;
      cards.push({ rank: maintenanceStageRank(stage), sortKm: remainingKm ?? Infinity, key, html: `<article class="service-card installed-lifetime-card maintenance-${stage}" style="--service-glow:rgba(64,229,244,.07);--component-color:${escapeAttr(category.theme || '#36c7e8')}"><div class="service-card-head"><span class="service-name">${escapeHtml(item.icon || category.icon || '🔩')} ${escapeHtml(item.label || key)}</span><span class="service-status ${statusClass}">${escapeHtml(status)}</span></div><p class="service-description">${escapeHtml(category.label || item.category || 'قطعه')} · ${escapeHtml(item.note || 'وضعیت از روی سوابق و بازدید واقعی پایش شود.')}</p><div class="service-metrics"><div class="service-metric"><strong>${escapeHtml(headline)}</strong><small>${escapeHtml(hasInterval ? 'وضعیت بازه' : (baseline ? 'از مبنای خرید، نه لزوماً از نصب' : 'از آخرین نصب/تعمیر ثبت‌شده'))}</small></div><div class="service-metric"><strong>${escapeHtml(intervalLabel)}</strong><small>${escapeHtml(hasInterval ? 'بازهٔ قابل تنظیم' : 'تعریف نشده')}</small></div></div><div class="service-progress"><span style="width:${progress}%"></span></div><div class="service-foot">${footParts.join(' · ')} · ${baseline ? 'تأیید نصب/تعویض با ثبت عملیات لازم است' : `شناسه <code>${escapeHtml(String(reference.id).slice(0,8))}</code>`}</div></article>` });
    }
    // Include completed catalog services that do not already have their own primary interval card.
    const serviceCatalog = catalog.services || {};
    const serviceKeys = new Set();
    for (const [key, service] of Object.entries(serviceCatalog)) {
      if (key in scheduled) continue;
      const latest = events.filter(e => e.type === 'service' && (e.serviceCatalogKey === key || e.serviceKey === key)).sort((a,b)=>eventEpoch(b)-eventEpoch(a))[0] || null;
      if (!latest) continue;
      serviceKeys.add(key);
      const category = categories[service.category] || { label: service.category || 'سرویس', icon: '🧰', theme: '#4ade80' };
      const kmSince = currentOdo != null && latest.odometerKm != null ? Math.max(0, Number(currentOdo)-Number(latest.odometerKm)) : null;
      const daysSince = latest.date ? Math.max(0, daysBetween(latest.date, localDateString(new Date()))) : null;
      cards.push({ rank: 4, sortKm: Infinity, key: `service-${key}`, html: `<article class="service-card installed-lifetime-card maintenance-monitor" style="--service-glow:rgba(93,230,176,.07);--component-color:${escapeAttr(category.theme || '#4ade80')}"><div class="service-card-head"><span class="service-name">${escapeHtml(service.icon || category.icon || '🧰')} ${escapeHtml(service.label || key)}</span><span class="service-status ok">🧾 آخرین سرویس ثبت‌شده</span></div><p class="service-description">${escapeHtml(service.note || 'شرح و نتیجهٔ عملیات را در دفتر وقایع بررسی کن.')}</p><div class="service-metrics"><div class="service-metric"><strong>${kmSince == null ? '—' : `${formatNumber(kmSince)} km`}</strong><small>از آخرین سرویس</small></div><div class="service-metric"><strong>${daysSince == null ? '—' : `${formatNumber(daysSince)} روز`}</strong><small>از تاریخ ثبت</small></div></div><div class="service-foot">تاریخ: ${escapeHtml(latest.jalaliDate || latest.date || '—')} · ${latest.odometerKm != null ? `کیلومتر: ${formatNumber(latest.odometerKm)} km · ` : ''}شناسه <code>${escapeHtml(String(latest.id).slice(0,8))}</code></div></article>` });
    }
    cards.sort((a,b)=>a.rank-b.rank || a.sortKm-b.sortKm || a.key.localeCompare(b.key));
    return cards.map(item=>item.html);
  }

  function renderComponentCatalog() {
    const root = $('#componentCatalog');
    const filters = $('#componentCategoryFilters');
    if (!root || !filters) return;
    const catalog = state.config?.partCatalog || {};
    const categories = catalog.categories || {};
    const items = Object.entries(catalog.items || {});
    if (!items.length) { root.innerHTML = '<div class="empty-state">دیکشنری قطعات هنوز در data/config.json تعریف نشده است.</div>'; return; }
    const selected = state.componentCategoryFilter || 'all';
    filters.innerHTML = `<button type="button" class="component-filter ${selected === 'all' ? 'active' : ''}" data-component-category="all">🌐 همه <small>${formatNumber(items.length)}</small></button>` + Object.entries(categories).map(([key, category]) => {
      const count = items.filter(([, item]) => item.category === key).length;
      return `<button type="button" class="component-filter ${selected === key ? 'active' : ''}" data-component-category="${escapeAttr(key)}" style="--component-color:${escapeAttr(category.theme || '#36c7e8')}">${escapeHtml(category.icon || '🔧')} ${escapeHtml(category.label || key)} <small>${formatNumber(count)}</small></button>`;
    }).join('');
    const filtered = selected === 'all' ? items : items.filter(([, item]) => item.category === selected);
    root.innerHTML = filtered.map(([key, item]) => {
      const category = categories[item.category] || { label: 'سایر', icon: '🔩', theme: '#36c7e8' };
      const isPeriodic = item.mode === 'periodic';
      const interval = [Number(item.intervalKm) > 0 ? `${formatNumber(item.intervalKm)} km` : '', Number(item.intervalDays) > 0 ? `${formatNumber(item.intervalDays)} روز` : ''].filter(Boolean).join(' · ') || (isPeriodic ? 'بازه تنظیم نشده' : 'عمرمحور / شرط‌محور');
      const latest = state.events.filter(event => event.componentKey === key && event.componentReplaced).sort((a,b)=>eventEpoch(b)-eventEpoch(a))[0];
      const fitment = latest ? `آخرین نصب: ${escapeHtml(latest.jalaliDate || latest.date || '—')}${latest.odometerKm != null ? ` · ${formatNumber(latest.odometerKm)} km` : ''}` : 'هنوز در سوابق نصب ثبت نشده';
      const technical = [latest?.brand ? `برند ${latest.brand}` : '', latest?.model ? `مدل ${latest.model}` : '', latest?.partNumber ? `کد ${latest.partNumber}` : ''].filter(Boolean).join(' · ');
      const modeLabel = isPeriodic ? 'مصرفی / موعدمحور' : 'عمرمحور / بازدیدمحور';
      const latestDetails = latest && latest.odometerKm != null && calculateOdometer(state.events) != null ? Math.max(0, calculateOdometer(state.events) - Number(latest.odometerKm)) : null;
      const tracking = latest ? (isPeriodic ? `آخرین تعویض ثبت شده${latestDetails != null ? ` · ${formatNumber(latestDetails)} km پیموده‌شده` : ''}` : `مدت ثبت‌شده از نصب: ${formatNumber(daysBetween(latest.date || String(latest.occurredAt).slice(0,10), localDateString(new Date())))} روز${latestDetails != null ? ` · ${formatNumber(latestDetails)} km` : ''}`) : 'برای شروع پایش، نصب/تعویض را ثبت کن';
      return `<article class="component-card" style="--component-color:${escapeAttr(category.theme || '#36c7e8')}"><div class="component-card-top"><span class="component-icon">${escapeHtml(item.icon || category.icon || '🔩')}</span><span class="component-category-pill">${escapeHtml(category.label || item.category || 'سایر')}</span></div><h3>${escapeHtml(item.label || key)}</h3><div class="component-mode-badge ${isPeriodic ? 'periodic' : 'condition'}">${modeLabel}</div><p class="component-note">${escapeHtml(item.note || 'شرح تخصصی در صورت نیاز تکمیل شود.')}</p><div class="component-interval"><span>◷</span><b>${escapeHtml(interval)}</b></div><div class="component-track-status">${escapeHtml(fitment)}</div><div class="component-track-status">${escapeHtml(tracking)}</div>${technical ? `<div class="component-technical">${escapeHtml(technical)}</div>` : ''}<div class="component-card-actions"><button type="button" class="component-command-copy" data-component-command="/part ${key} تعویض شد km=${calculateOdometer(state.events) || ''}">نمونه ثبت ↗</button><span class="component-key">${escapeHtml(key)}</span></div></article>`;
    }).join('');
  }

  function renderInstalledComponents() {
    const root = $('#installedComponentGrid');
    if (!root) return;
    const items = state.config?.partCatalog?.items || {};
    const latestByKey = new Map();
    state.events.filter(event => event.componentKey && event.componentReplaced).sort((a,b)=>eventEpoch(a)-eventEpoch(b)).forEach(event => latestByKey.set(event.componentKey, event));
    const currentOdo = calculateOdometer(state.events);
    const rows = [...latestByKey.entries()].map(([key,event]) => ({ key, event, item: items[key] || {} })).sort((a,b)=>String(a.item.category||'').localeCompare(String(b.item.category||''),'en'));
    if (!rows.length) { root.innerHTML = '<div class="empty-state">هنوز تعویضی به دیکشنری متصل نشده است. برای نمونه: /part باتری 12 ولت 60 آمپر برند=نامشخص km=431462</div>'; return; }
    root.innerHTML = rows.map(({key,event,item}) => {
      const category = state.config?.partCatalog?.categories?.[item.category] || {label:item.category || 'سایر',icon:'🔩',theme:'#36c7e8'};
      const kmSince = currentOdo != null && event.odometerKm != null ? currentOdo - Number(event.odometerKm) : null;
      const daysSince = event.date ? Math.max(0,daysBetween(event.date,localDateString(new Date()))) : null;
      const age = [kmSince != null && kmSince >= 0 ? `${formatNumber(kmSince)} km` : '',daysSince != null ? `${formatNumber(daysSince)} روز` : ''].filter(Boolean).join(' · ');
      const intervalKm = Number(item.intervalKm)||0;
      const intervalDays = Number(item.intervalDays)||0;
      const remainingKm = item.mode === 'periodic' && intervalKm > 0 && kmSince != null ? intervalKm-kmSince : null;
      const dueDate = item.mode === 'periodic' && intervalDays > 0 && event.date ? addDays(event.date,intervalDays) : null;
      const remainingDays = dueDate ? daysBetween(localDateString(new Date()),dueDate) : null;
      const status = item.mode === 'periodic' ? ((remainingKm != null && remainingKm <= 0) || (remainingDays != null && remainingDays <= 0) ? 'موعد گذشته' : 'یادآور موعد') : 'عمر ثبت‌شده · سلامت نیازمند بازدید';
      const specs = event.specs && typeof event.specs === 'object' ? Object.entries(event.specs).map(([k,v])=>`${k}: ${v}`).join(' · ') : '';
      return `<article class="installed-component-card" style="--component-color:${escapeAttr(category.theme || '#36c7e8')}"><div class="installed-component-heading"><span>${escapeHtml(item.icon || category.icon || '🔩')}</span><div><b>${escapeHtml(item.label || event.componentName || key)}</b><small>${escapeHtml(category.label || item.category || 'قطعه')}</small></div><em>${escapeHtml(status)}</em></div><div class="installed-component-age">${age ? `از نصب: ${escapeHtml(age)}` : 'زمان/کیلومتر نصب کامل نیست'}</div><div class="installed-component-meta">نصب: ${escapeHtml(event.jalaliDate || event.date || '—')}${event.odometerKm != null ? ` · ${formatNumber(event.odometerKm)} km` : ''}</div>${event.brand ? `<div class="installed-component-meta">برند: ${escapeHtml(event.brand)}${event.model ? ` · مدل: ${escapeHtml(event.model)}` : ''}</div>` : ''}${specs ? `<div class="installed-component-meta">${escapeHtml(specs)}</div>` : ''}${item.mode === 'periodic' ? `<div class="installed-component-meta">${remainingKm != null ? (remainingKm <= 0 ? `${formatNumber(Math.abs(remainingKm))} km عبور از بازه` : `${formatNumber(remainingKm)} km تا بازه`) : ''}${remainingDays != null ? ` · ${remainingDays < 0 ? `${formatNumber(Math.abs(remainingDays))} روز از موعد گذشته` : `${formatNumber(remainingDays)} روز باقی‌مانده`}` : ''}</div>` : ''}<div class="installed-component-foot">شناسه <code>${escapeHtml(String(event.id).slice(0,8))}</code> · عمر/موعد تخمینی جایگزین بازدید قطعه نیست.</div></article>`;
    }).join('');
  }

  function renderServiceCatalog() {
    const root = $('#serviceCatalogGrid');
    if (!root) return;
    const catalog = state.config?.partCatalog || {};
    const services = Object.entries(catalog.services || {});
    if (!services.length) { root.innerHTML = '<div class="empty-state">دیکشنری سرویس‌ها در config.json تعریف نشده است.</div>'; return; }
    root.innerHTML = services.map(([key,item]) => {
      const category = catalog.categories?.[item.category] || {label:item.category || 'سرویس',icon:'🧰',theme:'#4ade80'};
      const latest = state.events.filter(event => event.type === 'service' && event.serviceCatalogKey === key).sort((a,b)=>eventEpoch(b)-eventEpoch(a))[0];
      return `<article class="service-catalog-card" style="--component-color:${escapeAttr(category.theme || '#4ade80')}"><div class="service-catalog-icon">${escapeHtml(item.icon || category.icon || '🧰')}</div><div class="service-catalog-body"><div class="service-catalog-tags"><span>${escapeHtml(category.label || 'سرویس')}</span><small>${escapeHtml(key)}</small></div><h3>${escapeHtml(item.label || key)}</h3><p>${escapeHtml(item.note || 'شرح کار و نتیجه را در توضیحات ذخیره کن.')}</p><small class="service-last-entry">${latest ? `آخرین ثبت: ${escapeHtml(latest.jalaliDate || latest.date || '—')}${latest.odometerKm != null ? ` · ${formatNumber(latest.odometerKm)} km` : ''}` : 'هنوز سابقه ثبت نشده'}</small></div><button type="button" class="component-command-copy" data-component-command="/service ${key} km=${calculateOdometer(state.events) || ''}">نمونه ثبت</button></article>`;
    }).join('');
  }

  function serviceCard(data) {
    const { key, service, latest, status, statusClass, headline, subline, progress, foot } = data;
    const intervalLabel = [Number(service.intervalKm) ? `${formatNumber(service.intervalKm)} km` : '', Number(service.intervalDays) ? `${formatNumber(service.intervalDays)} روز` : ''].filter(Boolean).join(' · ') || 'بدون بازه پیش‌فرض';
    const note = service.note ? escapeHtml(service.note) : 'بازه قابل تنظیم';
    const glow = serviceColors[service.category] || serviceColors.service;
    return `<article class="service-card" style="--service-glow:${glow}"><div class="service-card-head"><span class="service-name">${escapeHtml(service.label || key)}</span><span class="service-status ${statusClass}">${escapeHtml(status)}</span></div><p class="service-description">${note}</p><div class="service-metrics"><div class="service-metric"><strong>${escapeHtml(headline)}</strong><small>${escapeHtml(subline)}</small></div><div class="service-metric"><strong>${escapeHtml(intervalLabel)}</strong><small>بازه تنظیم‌شده</small></div></div><div class="service-progress"><span style="width:${clamp(Number(progress) || 0, 0, 100)}%"></span></div><div class="service-foot">${latest ? foot : 'سابقه پیدا نشد؛ مبنای خرید برای محاسبه کیلومتر استفاده می‌شود.'}</div></article>`;
  }

  function calculateDue(events, config, currentOdo) {
    if (events === state.events && config === state.config && Array.isArray(state.precomputed?.dueItems)) return state.precomputed.dueItems;
    const result = [];
    const ownership = config?.ownership || {};
    const purchaseKm = Number(ownership.purchaseOdometerKm ?? 428000);
    const purchaseDate = /^\d{4}-\d{2}-\d{2}$/.test(String(ownership.purchaseDate || '')) ? ownership.purchaseDate : null;
    const today = localDateString(new Date());
    for (const [key, service] of Object.entries(config?.serviceIntervals || {})) {
      const latest = events.filter(e => (e.type === 'service' && e.serviceKey === key) || ((e.type === 'part' || e.type === 'repair') && e.status !== 'open' && (e.serviceKey === key || e.componentKey === key) && (e.componentReplaced || e.type === 'repair' || e.status === 'fixed'))).sort((a, b) => eventEpoch(b) - eventEpoch(a))[0] || null;
      const baseline = !latest;
      const refOdo = latest ? (latest.odometerKm != null && Number.isFinite(Number(latest.odometerKm)) ? Number(latest.odometerKm) : null) : purchaseKm;
      const refDate = latest?.date || (latest?.occurredAt ? String(latest.occurredAt).slice(0,10) : null) || (baseline ? purchaseDate : null);
      const kmInterval = Number(service.intervalKm) || 0;
      const dayInterval = Number(service.intervalDays) || 0;
      const leftKm = kmInterval > 0 && currentOdo != null && refOdo != null ? refOdo + kmInterval - currentOdo : null;
      const dueDate = dayInterval > 0 && refDate ? addDays(refDate, dayInterval) : null;
      const leftDays = dueDate ? daysBetween(today, dueDate) : null;
      const nearKm = leftKm != null && leftKm <= Math.max(500, kmInterval * .1);
      const nearDays = leftDays != null && leftDays <= 14;
      const overdueKm = leftKm != null && leftKm < 0 ? Math.abs(leftKm) : 0;
      const overdueDays = leftDays != null && leftDays < 0 ? Math.abs(leftDays) : 0;
      const stage = (overdueKm >= Math.max(1000, kmInterval * .2) && kmInterval > 0) || overdueDays >= 30 ? 'critical'
        : (leftKm != null && leftKm <= 0) || (leftDays != null && leftDays <= 0) ? 'overdue'
        : (leftKm != null && kmInterval > 0 && leftKm <= Math.max(100, kmInterval * .02)) || (leftDays != null && leftDays <= 3) ? 'due'
        : nearKm || nearDays ? 'upcoming' : 'ok';
      if (stage !== 'ok') result.push({ key, label: service.label || key, stage, overdue: stage === 'overdue' || stage === 'critical', leftKm, leftDays, latest, baseline, intervalKm: kmInterval, intervalDays: dayInterval, refOdo, refDate });
    }
    const catalog = config?.partCatalog || {};
    for (const [key, item] of Object.entries(catalog.items || {})) {
      if (item.mode !== 'periodic' || config?.serviceIntervals?.[key]) continue;
      const latest = events.filter(e => (e.componentKey === key || e.serviceKey === key || e.serviceCatalogKey === key) && (e.componentReplaced || e.type === 'service' || e.type === 'repair' || (e.type === 'issue' && e.status === 'fixed')) && e.status !== 'open').sort((a,b)=>eventEpoch(b)-eventEpoch(a))[0] || null;
      const baseline = !latest;
      const refOdo = latest ? (latest.odometerKm != null && Number.isFinite(Number(latest.odometerKm)) ? Number(latest.odometerKm) : null) : purchaseKm;
      const refDate = latest?.date || (latest?.occurredAt ? String(latest.occurredAt).slice(0,10) : null) || (baseline ? purchaseDate : null);
      const kmInterval = Number(item.intervalKm) || 0;
      const dayInterval = Number(item.intervalDays) || 0;
      const kmSince = currentOdo != null && refOdo != null ? currentOdo - refOdo : null;
      const leftKm = kmInterval > 0 && kmSince != null ? kmInterval - kmSince : null;
      const dueDate = dayInterval > 0 && refDate ? addDays(refDate,dayInterval) : null;
      const leftDays = dueDate ? daysBetween(today,dueDate) : null;
      const overdueKm = leftKm != null && leftKm < 0 ? Math.abs(leftKm) : 0;
      const overdueDays = leftDays != null && leftDays < 0 ? Math.abs(leftDays) : 0;
      const stage = (overdueKm >= Math.max(1000,kmInterval*.2) && kmInterval>0)||overdueDays>=30 ? 'critical'
        : (leftKm != null && leftKm <= 0)||(leftDays != null && leftDays <= 0) ? 'overdue'
        : (leftKm != null && kmInterval>0 && leftKm<=Math.max(100,kmInterval*.02))||(leftDays != null && leftDays<=3) ? 'due'
        : (leftKm != null && kmInterval>0 && leftKm<=Math.max(500,kmInterval*.1))||(leftDays != null && leftDays<=14) ? 'upcoming' : 'ok';
      if (stage !== 'ok') result.push({ key, label:item.label || key, stage, overdue:stage==='overdue'||stage==='critical', leftKm,leftDays,latest,baseline,intervalKm:kmInterval,intervalDays:dayInterval,refOdo,refDate,category:item.category,component:true });
    }
    const rank = { critical: 0, overdue: 1, due: 2, upcoming: 3, ok: 4 };
    return result.sort((a,b)=>(rank[a.stage]??9)-(rank[b.stage]??9) || Math.min(a.leftKm ?? Infinity,(a.leftDays ?? Infinity)*100)-Math.min(b.leftKm ?? Infinity,(b.leftDays ?? Infinity)*100));
  }

  function renderOwnershipSummary() {
    const settings = state.config?.ownership || {};
    const purchaseKm = Number(settings.purchaseOdometerKm ?? settings.baselineOdometerKm ?? state.config?.vehicle?.purchaseOdometerKm ?? 428000);
    const currentKm = calculateOdometer(state.events);
    const actualKm = currentKm != null && currentKm >= purchaseKm ? currentKm - purchaseKm : null;
    const put = (selector, value) => { const node=$(selector); if(node) node.textContent=value; };
    put('#ownershipPurchaseKm', `${formatNumber(purchaseKm)} km`);
    put('#ownershipCurrentKm', currentKm == null ? '—' : `${formatNumber(currentKm)} km`);
    put('#ownershipDrivenKm', actualKm == null ? '—' : `${formatNumber(actualKm)} km`);
    const reconciliation = $('#ownershipReconciliation');
    if (reconciliation) {
      reconciliation.classList.remove('is-warning');
      reconciliation.classList.toggle('is-confirmed', actualKm != null);
      reconciliation.innerHTML = actualKm == null
        ? '<b>⌁ کیلومتر معتبر برای محاسبه موجود نیست</b><span>آخرین کیلومترشمار را ثبت یا اصلاح کن؛ عدد پیمایش ساختگی استفاده نمی‌شود.</span>'
        : `<b>✓ پیمایش واقعی از مبنای خرید</b><span>${formatNumber(currentKm)} − ${formatNumber(purchaseKm)} = ${formatNumber(actualKm)} کیلومتر. برآورد حدسی در محاسبات وجود ندارد.${settings.purchaseDate ? ` تاریخ خرید ثبت‌شده: ${escapeHtml(settings.purchaseDate)}.` : ' تاریخ خرید ثبت نشده؛ سن تقویمی از خرید محاسبه نمی‌شود.'}</span>`;
    }
    const breakdown = $('#ownershipDriverBreakdown');
    if (breakdown) {
      const entries = calculateDistanceEntries(state.events, settings);
      const grouped = {};
      entries.forEach(entry => { const name=String(entry.actor||'من').trim()||'من'; grouped[name]=(grouped[name]||0)+(Number(entry.distanceKm)||0); });
      const rows = Object.entries(grouped).filter(([,value])=>value>0).sort((a,b)=>b[1]-a[1]);
      const total = rows.reduce((n,row)=>n+row[1],0);
      breakdown.innerHTML = rows.length ? rows.map(([name,value],i)=>`<div class="ownership-driver-row"><div class="ownership-driver-title"><b>${escapeHtml(name)}</b><span>${formatNumber(value)} km · ${formatNumber(total?value/total*100:0,1)}٪</span></div><div class="ownership-driver-track"><span style="width:${clamp(total?value/total*100:0,0,100)}%"></span></div>${i===0?'<small>فاصلهٔ تاریخی از مبنای خرید تا اولین قرائت، بدون جزئیات جداگانهٔ سفرها به نام شخص پیش‌فرض ثبت می‌شود.</small>':''}</div>`).join('') : '<div class="empty-state">برای ساخت سهم رانندگی، مبنای خرید و حداقل یک ثبت کیلومتر لازم است.</div>';
    }
  }

  function filterGuideCards() {
    const input = $('#guideSearch');
    const grid = $('#fullGuideGrid');
    if (!input || !grid) return;
    const query = input.value.trim().toLocaleLowerCase('fa');
    const cards = $$('.guide-card', grid);
    let visible = 0;
    cards.forEach(card => {
      const text = `${card.dataset.search || ''} ${card.textContent || ''}`.toLocaleLowerCase('fa');
      const show = !query || text.includes(query);
      card.hidden = !show;
      if (show) visible++;
    });
    const counter = $('#guideResultCount');
    if (counter) counter.textContent = `${formatNumber(visible)} دستور از ${formatNumber(cards.length)}`;
  }

  function renderFinesAndIssues() {
    const fines = state.events.filter(e => e.type === 'fine').sort((a,b)=>eventEpoch(b)-eventEpoch(a));
    const unpaid = fines.filter(e => !e.paid);
    const totalFine = sum(fines, e => e.costRial) / 10;
    const paidFine = sum(fines.filter(e => e.paid), e => e.costRial) / 10;
    const unpaidFine = sum(unpaid, e => e.costRial) / 10;
    $('#fineTotals').textContent = `کل جریمه‌ها: ${moneyText(totalFine)} تومان · بدهی: ${moneyText(unpaidFine)} تومان`;
    if ($('#fineTotalAll')) $('#fineTotalAll').textContent = `${moneyText(totalFine)} تومان`;
    if ($('#fineTotalPaid')) $('#fineTotalPaid').textContent = `${moneyText(paidFine)} تومان`;
    if ($('#fineTotalUnpaid')) $('#fineTotalUnpaid').textContent = `${moneyText(unpaidFine)} تومان`;
    if ($('#fineCountAll')) $('#fineCountAll').textContent = `${formatNumber(fines.length)} مورد ثبت‌شده`;
    $('#fineSummary').innerHTML = fines.length ? fines.slice(0,4).map(e=>{ const ticketDate=String(e.ticketDate||e.date||e.occurredAt||'').slice(0,10); const deadline=e.deadlineDate || (ticketDate ? addDays(ticketDate, e.appealed && e.appealDecisionDate ? 20 : 60) : null); const days=deadline ? daysBetween(localDateString(new Date()),deadline) : null; const age=ticketDate ? Math.max(0,daysBetween(ticketDate,localDateString(new Date()))) : null; return `<div class="mini-row"><div class="mini-row-main"><div class="mini-row-title">${escapeHtml(e.description || 'جریمه ثبت‌شده')}</div><div class="mini-row-meta">${escapeHtml(e.jalaliDate || ticketDate || '—')} · ${String(e.id).slice(0,8)}${age != null ? ` · ${formatNumber(age)} روز گذشته` : ''}</div><div class="mini-row-meta fine-deadline-meta">${e.paid ? `پرداخت: ${escapeHtml(e.paymentDate||String(e.paidAt||'').slice(0,10)||'تاریخ نامشخص')}${e.paymentReference ? ` · پیگیری ${escapeHtml(e.paymentReference)}` : ''}` : days == null ? 'مهلت: نیازمند بررسی' : days < 0 ? `${formatNumber(Math.abs(days))} روز از مهلت محاسباتی گذشته؛ استعلام رسمی` : `${formatNumber(days)} روز تا مهلت محاسباتی`}</div></div><div class="mini-row-value ${e.paid?'paid':''}">${escapeHtml(moneyText((Number(e.costRial)||0)/10))}<div class="mini-row-meta">${e.paid?'پرداخت شد':'پرداخت‌نشده'}</div></div></div>`; }).join('') : '<div class="empty-state">جریمه‌ای ثبت نشده است.</div>';
    const issues = state.events.filter(e => e.type === 'issue' || e.type === 'repair').sort((a,b)=>eventEpoch(b)-eventEpoch(a));
    const open = issues.filter(e=>e.type==='issue' && e.status!=='fixed');
    $('#issueTotals').textContent = `خرابی باز: ${formatNumber(open.length)}`;
    $('#issueSummary').innerHTML = issues.length ? issues.slice(0,4).map(e=>`<div class="mini-row"><div class="mini-row-main"><div class="mini-row-title">${escapeHtml(e.title || (e.type==='repair'?'تعمیر':'خرابی'))}</div><div class="mini-row-desc">${escapeHtml((e.description || '').slice(0,100))}</div><div class="mini-row-meta">${escapeHtml(e.jalaliDate || e.date || '—')} · ${e.status==='fixed'?'رفع‌شده':e.type==='repair'?'تعمیر':'باز'}</div></div><div class="mini-row-value ${e.status==='fixed'?'paid':''}">${Number(e.costRial)>0?escapeHtml(moneyText(Number(e.costRial)/10))+' تومان':e.status==='fixed'?'✓':'—'}</div></div>`).join('') : '<div class="empty-state">خرابی‌ای ثبت نشده است.</div>';
  }

  function populateActorFilter() {
    const select = $('#actorFilter');
    if (!select) return;
    const old = select.value || 'all';
    const actors = [...new Set([...(Array.isArray(state.config?.people) ? state.config.people : []), ...state.events.map(event => String(event.actor || 'من').trim() || 'من')])].sort((a, b) => a.localeCompare(b, 'fa'));
    select.innerHTML = '<option value="all">همه اشخاص</option>' + actors.map(actor => `<option value="${escapeAttr(actor)}">${escapeHtml(actor)}</option>`).join('');
    select.value = actors.includes(old) ? old : 'all';
  }

  function populateMonthFilter() {
    const select = $('#monthFilter');
    if (!select) return;
    const old = select.value;
    const months = [...new Set([...state.months, ...state.events.map(e=>String(e.date || '').slice(0,7)).filter(m=>/^\d{4}-\d{2}$/.test(m))])].sort().reverse();
    select.innerHTML = '<option value="all">تمام ماه‌ها</option>' + months.map(m=>`<option value="${m}">${escapeHtml(monthShort(m))} · ${m}</option>`).join('');
    if (old === 'all' || months.includes(old)) select.value = old; else select.value = 'all';
  }

  function exportCsv() {
    const rows = state.filtered.slice();
    if (!rows.length) { showToast('با فیلتر فعلی داده‌ای برای خروجی وجود ندارد.'); return; }
    const keys = ['id','type','title','description','actor','note','occurredAt','jalaliDate','date','time','odometerKm','previousOdometerKm','deltaSincePreviousKm','distanceKm','liters','costRial','serviceKey','serviceCatalogKey','serviceLabel','componentKey','componentName','componentCategory','componentMode','componentReplaced','brand','model','partNumber','specs','quantity','expenseCategory','repairGroupId','paid','ticketDate','deadlineDate','appealed','appealDecisionDate','ticketNumber','fineLocation','officialCurrentAmountRial','paidAmountRial','paidAt','paymentDate','paymentReference','repairCostRial','resolvedAt','repairDescription','status','fullTank','updatedAt','revision'];
    const csv = [keys.join(','), ...rows.map(e=>keys.map(k=>csvCell(e[k])).join(','))].join('\r\n');
    downloadBlob(`206-garage-${localDateString(new Date())}.csv`, '\uFEFF'+csv, 'text/csv;charset=utf-8');
    showToast('خروجی CSV آماده شد.');
  }
  function exportJson() {
    const rows = state.filtered.slice();
    if (!rows.length) { showToast('هنوز داده‌ای برای خروجی وجود ندارد.'); return; }
    downloadBlob(`206-garage-${localDateString(new Date())}.json`, JSON.stringify({ exportedAt: new Date().toISOString(), vehicle: state.config?.vehicle || {}, events: rows }, null, 2), 'application/json;charset=utf-8');
    showToast('خروجی JSON آماده شد.');
  }
  function downloadBlob(filename, content, type) {
    const blob = new Blob([content], { type }); const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function csvCell(value) { return `"${String(value ?? '').replace(/"/g,'""')}"`; }
  function expenseAmount(event) {
    if (!event || (event.type === 'fine' && !event.paid)) return 0;
    if (event.type === 'issue' && Number(event.repairCostRial) > 0) return Number(event.repairCostRial) || 0;
    return Number(event.costRial) > 0 ? Number(event.costRial) : 0;
  }
  function isActualExpense(event) { return expenseAmount(event) > 0; }
  function expenseDate(event) {
    if (event.type === 'fine' && event.paid && event.paidAt) return String(event.paidAt).slice(0,10);
    if (event.type === 'issue' && Number(event.repairCostRial)>0 && event.resolvedAt) return String(event.resolvedAt).slice(0,10);
    return String(event.occurredAt || event.date || event.createdAt || '').slice(0,10);
  }
  function calculateOdometer(events) {
    if (events === state.events && state.precomputed?.currentOdometerKm != null && Number.isFinite(Number(state.precomputed.currentOdometerKm))) return Number(state.precomputed.currentOdometerKm);
    let current = null;
    const timeline = events.filter(e=>e.type==='odometer'||e.type==='trip').sort((a,b)=>eventEpoch(a)-eventEpoch(b));
    for (const event of timeline) {
      if (event.type==='odometer' && event.odometerKm !== null && event.odometerKm !== undefined && Number.isFinite(Number(event.odometerKm))) current = Number(event.odometerKm);
      else if (event.type==='trip' && Number.isFinite(Number(event.distanceKm)) && current !== null) current += Number(event.distanceKm);
    }
    return current == null ? null : Math.round(current*10)/10;
  }

  function calculateDistanceEntries(events, ownershipConfig = null) {
    if (events === state.events && Array.isArray(state.precomputed?.distanceEntries)) return state.precomputed.distanceEntries;
    const allOdometers = events.filter(e=>e.type==='odometer' && e.odometerKm!==null && e.odometerKm!==undefined && Number.isFinite(Number(e.odometerKm))).sort((a,b)=>eventEpoch(a)-eventEpoch(b));
    let correctionIndex = 0;
    for (let i=1;i<allOdometers.length;i++) if (Number(allOdometers[i].odometerKm)<Number(allOdometers[i-1].odometerKm)) correctionIndex=i;
    const odometers = allOdometers.slice(correctionIndex);
    const coveredTrips = new Set();
    const result = [];
    const purchaseKm = Number(ownershipConfig?.purchaseOdometerKm ?? ownershipConfig?.baselineOdometerKm ?? state.config?.vehicle?.purchaseOdometerKm ?? 428000);
    const purchaseDate = /^\d{4}-\d{2}-\d{2}$/.test(String(ownershipConfig?.purchaseDate || '')) ? ownershipConfig.purchaseDate : null;
    const historicalActor = String(ownershipConfig?.historicalActor || ownershipConfig?.defaultActor || 'من').trim() || 'من';
    const first = odometers[0];
    if (first && Number.isFinite(purchaseKm) && purchaseKm > 0) {
      const baselineDistance = Number(first.odometerKm) - purchaseKm;
      if (baselineDistance > 0) {
        const purchaseTime = purchaseDate ? Date.parse(`${purchaseDate}T00:00:00+03:30`) : NaN;
        const firstTime = eventEpoch(first);
        const historicalTrips = events.filter(trip => trip.type === 'trip' && Number(trip.distanceKm) > 0 && eventEpoch(trip) <= firstTime && (!Number.isFinite(purchaseTime) || eventEpoch(trip) >= purchaseTime) && (correctionIndex === 0 || eventEpoch(trip) >= firstTime));
        const tripTotal = sum(historicalTrips, trip => trip.distanceKm);
        if (tripTotal > 0 && tripTotal <= baselineDistance) {
          for (const trip of historicalTrips) {
            coveredTrips.add(trip.id);
            result.push({ date: trip.date || String(trip.occurredAt || '').slice(0,10), occurredAt: trip.occurredAt, distanceKm: Number(trip.distanceKm), actor: String(trip.actor || 'من').trim() || 'من', source: 'ownership_historical_trip', eventId: trip.id, estimatedHistorical: true, fromOdometerKm: purchaseKm, toOdometerKm: Number(first.odometerKm) });
          }
        }
        const residual = baselineDistance - (tripTotal > 0 && tripTotal <= baselineDistance ? tripTotal : 0);
        if (residual > 0) result.push({ date: purchaseDate, occurredAt: purchaseDate ? `${purchaseDate}T12:00:00+03:30` : null, distanceKm: residual, actor: historicalActor, source: 'ownership_baseline', eventId: first.id, estimatedHistorical: true, fromOdometerKm: purchaseKm, toOdometerKm: Number(first.odometerKm) });
      }
    }
    for (let i=1;i<odometers.length;i++) {
      const previous=odometers[i-1], current=odometers[i];
      const delta=Number(current.odometerKm)-Number(previous.odometerKm);
      if (delta<=0 || delta>5000) continue;
      const start=eventEpoch(previous), end=eventEpoch(current);
      const trips=events.filter(trip=>trip.type==='trip'&&eventEpoch(trip)>start&&eventEpoch(trip)<=end&&Number(trip.distanceKm)>0).sort((a,b)=>eventEpoch(a)-eventEpoch(b));
      const tripDistance=sum(trips,trip=>trip.distanceKm);
      trips.forEach(trip=>coveredTrips.add(trip.id));
      if(trips.length&&tripDistance<=delta){
        for(const trip of trips) result.push({date:trip.date||String(trip.occurredAt||'').slice(0,10),occurredAt:trip.occurredAt,distanceKm:Number(trip.distanceKm),actor:String(trip.actor||'من').trim()||'من',source:'trip_within_odometer',eventId:trip.id,fromOdometerKm:Number(previous.odometerKm),toOdometerKm:Number(current.odometerKm)});
        const residual=delta-tripDistance;
        if(residual>0) result.push({date:current.date||String(current.occurredAt||'').slice(0,10),occurredAt:current.occurredAt,distanceKm:residual,actor:String(current.actor||'من').trim()||'من',source:'odometer_residual',fromOdometerKm:Number(previous.odometerKm),toOdometerKm:Number(current.odometerKm)});
      } else result.push({date:current.date||String(current.occurredAt||'').slice(0,10),occurredAt:current.occurredAt,distanceKm:delta,actor:String(current.actor||'من').trim()||'من',fromOdometerKm:Number(previous.odometerKm),toOdometerKm:Number(current.odometerKm),source:'odometer_delta'});
    }
    for (const event of events) if (event.type==='trip'&&!coveredTrips.has(event.id)&&Number(event.distanceKm)>0) result.push({date:event.date||String(event.occurredAt||'').slice(0,10),occurredAt:event.occurredAt,distanceKm:Number(event.distanceKm),actor:String(event.actor||'من').trim()||'من',source:'trip',eventId:event.id});
    return result.sort((a,b)=>(eventEpoch(a)||0)-(eventEpoch(b)||0));
  }

  function safeText(selector, value) { const node = $(selector); if (node) node.textContent = value == null ? '' : String(value); }
  function eventDateKey(event) { return String(event?.date || event?.occurredAt || event?.createdAt || '').slice(0, 10); }
  function eventAmountToman(event) { return expenseAmount(event) / 10; }
  function eventTitle(event) { return String(event?.title || typeLabels[event?.type] || 'رویداد خودرو'); }
  function chartBars(selector, rows, formatter = value => formatNumber(value), emptyText = 'دادهٔ کافی برای نمودار وجود ندارد.') {
    const node = $(selector); if (!node) return;
    const values = rows.map(row => Math.max(0, Number(row.value) || 0));
    const max = Math.max(1, ...values);
    if (!rows.length || values.every(value => value === 0)) { node.innerHTML = `<div class="empty-state">${escapeHtml(emptyText)}</div>`; return; }
    node.innerHTML = `<div class="garage-bars">${rows.map((row, index) => {
      const value = Math.max(0, Number(row.value) || 0);
      const height = value > 0 ? Math.max(5, value / max * 100) : 2;
      return `<div class="garage-bar-column" title="${escapeHtml(row.label)}: ${escapeHtml(formatter(value))}"><strong>${escapeHtml(formatter(value))}</strong><div class="garage-bar-track"><span class="garage-bar-fill" style="height:${height.toFixed(1)}%"></span></div><small>${escapeHtml(row.shortLabel || row.label)}</small></div>`;
    }).join('')}</div>`;
  }
  function periodBucketKeys(period) {
    const now = new Date();
    if (period === 'hour') return Array.from({ length: 24 }, (_, i) => {
      const d = new Date(now.getTime() - (23 - i) * 3600000);
      return `${localDateString(d)}T${String(d.getHours()).padStart(2, '0')}`;
    });
    if (period === 'day') return Array.from({ length: 30 }, (_, i) => {
      const d = new Date(now.getTime()); d.setDate(d.getDate() - (29 - i)); return localDateString(d);
    });
    if (period === 'week') return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getTime()); d.setDate(d.getDate() - (d.getDay() + 6) % 7 - (11 - i) * 7);
      return localDateString(d);
    });
    return getMonthKeys(localDateString(now).slice(0, 7), 12);
  }
  function bucketForDate(value, period) {
    if (!value) return '';
    const date = new Date(`${String(value).slice(0, 10)}T12:00:00+03:30`);
    if (!Number.isFinite(date.getTime())) return '';
    if (period === 'hour') {
      const event = new Date(value);
      return `${localDateString(event)}T${String(event.getHours()).padStart(2, '0')}`;
    }
    if (period === 'day') return String(value).slice(0, 10);
    if (period === 'month') return String(value).slice(0, 7);
    const day = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    day.setUTCDate(day.getUTCDate() - (day.getUTCDay() + 6) % 7);
    return `${day.getUTCFullYear()}-${String(day.getUTCMonth() + 1).padStart(2, '0')}-${String(day.getUTCDate()).padStart(2, '0')}`;
  }
  function periodLabel(period) { return ({ hour: '۲۴ ساعت اخیر', day: '۳۰ روز اخیر', week: '۱۲ هفته اخیر', month: '۱۲ ماه اخیر' })[period] || '۱۲ ماه اخیر'; }
  function periodShortLabel(key, period) {
    if (period === 'hour') return key.slice(-2) + 'h';
    if (period === 'day') return key.slice(5);
    if (period === 'week') return key.slice(5);
    return monthShort(key);
  }
  function renderOverviewExtras() {
    const recent = state.events.slice().sort((a, b) => eventEpoch(b) - eventEpoch(a)).slice(0, 5);
    const recentNode = $('#recentEvents');
    if (recentNode) recentNode.innerHTML = recent.length ? recent.map(event => {
      const meta = [event.jalaliDate || eventDateKey(event), event.actor || 'من', event.odometerKm != null ? `${formatNumber(event.odometerKm)} km` : ''].filter(Boolean).join(' · ');
      const amount = eventAmountToman(event);
      return `<div class="mini-row"><div class="mini-row-main"><div class="mini-row-title">${escapeHtml(eventTitle(event))}</div><div class="mini-row-desc">${escapeHtml(event.description || event.note || '')}</div><div class="mini-row-meta">${escapeHtml(meta)}</div></div><div class="mini-row-value">${amount > 0 ? `${escapeHtml(moneyText(amount))} تومان` : escapeHtml(event.type === 'fuel' && event.liters ? `${formatNumber(event.liters, 1)} لیتر` : '—')}</div></div>`;
    }).join('') : '<div class="empty-state">هنوز رویدادی ثبت نشده است.</div>';
    const alertsNode = $('#overviewAlerts');
    if (alertsNode) {
      const due = calculateDue(state.events, state.config, calculateOdometer(state.events));
      const unpaid = state.events.filter(event => event.type === 'fine' && !event.paid);
      const openIssues = state.events.filter(event => event.type === 'issue' && event.status !== 'fixed');
      const alerts = [
        ...due.slice(0, 4).map(item => ({ icon: item.overdue ? '⛔' : '⚠', title: item.label, detail: item.leftKm != null ? `${formatNumber(item.leftKm)} کیلومتر تا موعد` : item.leftDays != null ? `${formatNumber(item.leftDays)} روز تا موعد` : item.stage })),
        ...unpaid.slice(0, 2).map(item => ({ icon: '🚦', title: 'جریمه پرداخت‌نشده', detail: `${moneyText((Number(item.costRial) || 0) / 10)} تومان` })),
        ...openIssues.slice(0, 2).map(item => ({ icon: '🔧', title: eventTitle(item), detail: item.description || 'نیازمند پیگیری' }))
      ];
      alertsNode.innerHTML = alerts.length ? alerts.slice(0, 6).map(item => `<div class="mini-row"><div class="mini-row-main"><div class="mini-row-title">${item.icon} ${escapeHtml(item.title)}</div><div class="mini-row-meta">${escapeHtml(item.detail)}</div></div></div>`).join('') : '<div class="empty-state">هشدار باز یا سرویس نزدیک موعدی در داده‌های فعلی پیدا نشد.</div>';
    }
  }
  function updateJournal() {
    const text = String($('#searchInput')?.value || '').trim().toLocaleLowerCase('fa');
    const type = $('#typeFilter')?.value || 'all';
    const month = $('#monthFilter')?.value || 'all';
    const actor = $('#actorFilter')?.value || 'all';
    state.filtered = state.events.filter(event => {
      if (type !== 'all' && event.type !== type) return false;
      if (month !== 'all' && eventDateKey(event).slice(0, 7) !== month) return false;
      if (actor !== 'all' && String(event.actor || 'من') !== actor) return false;
      if (text) {
        const haystack = [event.title, event.description, event.note, event.actor, event.serviceLabel, event.componentName, event.expenseCategory, event.fineLocation, event.ticketNumber].join(' ').toLocaleLowerCase('fa');
        if (!haystack.includes(text)) return false;
      }
      return true;
    }).sort((a, b) => eventEpoch(b) - eventEpoch(a));
    safeText('#resultCount', `${formatNumber(state.filtered.length)} رویداد`);
    safeText('#journalRange', state.filtered.length === state.events.length ? `${formatNumber(state.events.length)} رویداد از ${formatNumber(state.months.length)} ماه` : `${formatNumber(state.filtered.length)} مورد از ${formatNumber(state.events.length)} رویداد`);
    renderJournal();
  }
  function renderJournal() {
    const node = $('#eventList'); if (!node) return;
    const rows = (state.filtered || state.events).slice(0, state.shown);
    const labels = { odometer: 'کیلومترشمار', trip: 'مسافت', fuel: 'سوخت‌گیری', service: 'سرویس', part: 'قطعه', expense: 'هزینه', fine: 'جریمه', wash: 'کارواش', issue: 'خرابی', repair: 'تعمیر', note: 'یادداشت' };
    const icons = { odometer: '⌁', trip: '↗', fuel: '⛽', service: '⚙', part: '🔩', expense: '◈', fine: '🚦', wash: '✦', issue: '⚠', repair: '🔧', note: '≡' };
    node.innerHTML = rows.length ? rows.map(event => {
      const date = event.jalaliDate || eventDateKey(event) || 'تاریخ نامشخص';
      const detail = event.description || event.note || event.componentName || event.serviceLabel || 'بدون توضیح';
      const metrics = [];
      if (event.odometerKm != null) metrics.push(`${formatNumber(event.odometerKm)} km`);
      if (event.distanceKm != null && Number(event.distanceKm) > 0) metrics.push(`${formatNumber(event.distanceKm, 1)} km مسافت`);
      if (event.liters != null && Number(event.liters) > 0) metrics.push(`${formatNumber(event.liters, 1)} لیتر`);
      const amount = expenseAmount(event);
      if (amount > 0) metrics.push(`${moneyText(amount / 10)} تومان`);
      if (event.actor) metrics.push(`👤 ${event.actor}`);
      if (event.paid === false && event.type === 'fine') metrics.push('پرداخت‌نشده');
      return `<article class="event-entry"><div class="event-entry-icon">${icons[event.type] || '•'}</div><div class="event-entry-main"><div class="event-entry-head"><b>${escapeHtml(eventTitle(event))}</b><span class="event-type-pill">${escapeHtml(labels[event.type] || event.type || 'رویداد')}</span></div><p>${escapeHtml(detail)}</p><small>${escapeHtml(date)}${event.time ? ` · ${escapeHtml(event.time)}` : ''} · ${escapeHtml(String(event.id || '').slice(0, 8))}</small><div class="event-entry-metrics">${metrics.map(item => `<span>${escapeHtml(item)}</span>`).join('')}</div></div></article>`;
    }).join('') : '<div class="empty-state">با فیلتر فعلی رویدادی پیدا نشد. فیلترها را تغییر بده یا داده‌های تلگرام را بررسی کن.</div>';
    const more = $('#loadMoreButton'); if (more) more.hidden = rows.length >= (state.filtered || state.events).length;
  }
  function renderFuelPage() {
    const fuel = state.events.filter(event => event.type === 'fuel').sort((a, b) => eventEpoch(a) - eventEpoch(b));
    const totalLiters = sum(fuel, event => event.liters);
    const totalCost = sum(fuel, event => event.costRial);
    safeText('#fuelPageLiters', formatNumber(totalLiters, 1));
    safeText('#fuelPageLitersFoot', `${formatNumber(fuel.length)} سوخت‌گیری ثبت‌شده`);
    safeText('#fuelPageCost', compactMoney(totalCost / 10));
    safeText('#fuelPageCostFoot', 'مجموع هزینهٔ ثبت‌شده سوخت');
    safeText('#fuelPageStops', formatNumber(fuel.length));
    safeText('#fuelPageStopsFoot', fuel.length ? `${formatNumber(fuel.filter(event => event.fullTank).length)} بار باک کامل` : 'هنوز سوخت‌گیری ثبت نشده است');
    const measurements = [];
    let previousFullIndex = -1;
    fuel.forEach((event, index) => {
      if (!event.fullTank) return;
      if (previousFullIndex >= 0) {
        const previous = fuel[previousFullIndex];
        const fromKm = Number(previous.odometerKm), toKm = Number(event.odometerKm);
        const distance = toKm - fromKm;
        const liters = sum(fuel.slice(previousFullIndex + 1, index + 1), item => item.liters);
        if (Number.isFinite(distance) && distance > 0 && distance < 3000 && liters > 0) {
          measurements.push({ date: event.jalaliDate || eventDateKey(event), distance, liters, rate: liters / distance * 100, fromKm, toKm });
        }
      }
      previousFullIndex = index;
    });
    const weightedDistance = sum(measurements, item => item.distance);
    const weightedLiters = sum(measurements, item => item.liters);
    const average = weightedDistance > 0 ? weightedLiters / weightedDistance * 100 : null;
    safeText('#fuelPageEfficiency', average == null ? '—' : formatNumber(average, 2));
    safeText('#fuelPageEfficiencyFoot', average == null ? 'برای محاسبه، دو ثبت باک کامل همراه کیلومتر لازم است.' : `${formatNumber(measurements.length)} بازه معتبر باک کامل`);
    const months = getMonthKeys(localDateString(new Date()).slice(0, 7), 8);
    chartBars('#fuelOnlyChart', months.map(key => ({ label: key, shortLabel: monthShort(key), value: sum(fuel.filter(event => eventDateKey(event).slice(0, 7) === key), event => event.liters) })), value => `${formatNumber(value, 1)} L`, 'هنوز سوخت‌گیری ثبت نشده است.');
    chartBars('#fuelConsumptionChart', measurements.slice(-8).map(item => ({ label: item.date, shortLabel: item.date, value: item.rate })), value => `${formatNumber(value, 2)}`, 'برای محاسبه مصرف، دو سوخت‌گیری باک کامل و کیلومتر معتبر لازم است.');
    safeText('#fuelWeightedAverage', average == null ? '—' : `${formatNumber(average, 2)} L/100km`);
    const list = $('#fuelEventList');
    if (list) list.innerHTML = fuel.length ? fuel.slice().reverse().slice(0, 12).map(event => `<div class="mini-row"><div class="mini-row-main"><div class="mini-row-title">${escapeHtml(event.jalaliDate || eventDateKey(event))} · ${formatNumber(Number(event.liters) || 0, 1)} لیتر</div><div class="mini-row-meta">${event.odometerKm != null ? `${formatNumber(event.odometerKm)} km · ` : ''}${event.fullTank ? 'باک کامل · ' : ''}${escapeHtml(event.actor || 'من')}</div></div><div class="mini-row-value">${moneyText((Number(event.costRial) || 0) / 10)} تومان</div></div>`).join('') : '<div class="empty-state">سوخت‌گیری ثبت نشده است.</div>';
    const history = $('#fuelConsumptionHistory');
    if (history) history.innerHTML = measurements.length ? measurements.slice().reverse().map(item => `<div class="fuel-measurement-row"><b>${escapeHtml(item.date)}</b><span>${formatNumber(item.distance)} km</span><span>${formatNumber(item.liters, 1)} L</span><strong>${formatNumber(item.rate, 2)} L/100km</strong></div>`).join('') : '<div class="empty-state">اندازه‌گیری معتبر هنوز ثبت نشده است.</div>';
  }
  function renderExpensePage() {
    const rows = state.events.filter(isActualExpense).slice().sort((a, b) => eventEpoch(b) - eventEpoch(a));
    const total = sum(rows, expenseAmount) / 10;
    const month = localDateString(new Date()).slice(0, 7);
    const monthly = sum(rows.filter(event => expenseDate(event).slice(0, 7) === month), expenseAmount) / 10;
    const largest = rows.slice().sort((a, b) => expenseAmount(b) - expenseAmount(a))[0];
    const categories = {};
    rows.forEach(event => { const key = String(event.expenseCategory || (event.type === 'fuel' ? 'سوخت' : event.type === 'fine' ? 'جریمه پرداخت‌شده' : typeLabels[event.type] || event.type)); categories[key] = (categories[key] || 0) + expenseAmount(event) / 10; });
    safeText('#expensePageTotal', compactMoney(total));
    safeText('#expensePageTotalFoot', `${formatNumber(rows.length)} رویداد دارای هزینه واقعی`);
    safeText('#expensePageMonthly', compactMoney(monthly));
    safeText('#expensePageMonthlyFoot', `${monthShort(month)} · ${month}`);
    safeText('#expensePageLargest', largest ? compactMoney(expenseAmount(largest) / 10) : '—');
    safeText('#expensePageLargestFoot', largest ? eventTitle(largest) : 'هزینه‌ای ثبت نشده است');
    safeText('#expensePageCategories', formatNumber(Object.keys(categories).length));
    const months = getMonthKeys(localDateString(new Date()).slice(0, 7), 8);
    chartBars('#expenseMonthlyChart', months.map(key => ({ label: key, shortLabel: monthShort(key), value: sum(rows.filter(event => expenseDate(event).slice(0, 7) === key), expenseAmount) / 10 })), value => compactMoney(value), 'هنوز دادهٔ مالی ثبت نشده است.');
    const catNode = $('#expenseCategoryChart');
    const catRows = Object.entries(categories).sort((a, b) => b[1] - a[1]);
    if (catNode) {
      const max = Math.max(1, ...catRows.map(row => row[1]));
      catNode.innerHTML = catRows.length ? catRows.slice(0, 12).map(([name, value]) => `<div class="category-breakdown-row"><div><b>${escapeHtml(name)}</b><span>${moneyText(value)} تومان</span></div><div class="category-track"><i style="width:${(value / max * 100).toFixed(1)}%"></i></div></div>`).join('') : '<div class="empty-state">با ثبت هزینه‌ها دسته‌ها نمایش داده می‌شوند.</div>';
    }
    const list = $('#expenseEventList');
    if (list) list.innerHTML = rows.length ? rows.slice(0, 20).map(event => `<div class="mini-row"><div class="mini-row-main"><div class="mini-row-title">${escapeHtml(eventTitle(event))}</div><div class="mini-row-desc">${escapeHtml(event.description || event.note || '')}</div><div class="mini-row-meta">${escapeHtml(event.jalaliDate || expenseDate(event))} · ${escapeHtml(event.expenseCategory || event.actor || '—')}</div></div><div class="mini-row-value">${moneyText(expenseAmount(event) / 10)} تومان</div></div>`).join('') : '<div class="empty-state">هزینه‌ای ثبت نشده است.</div>';
  }
  function renderTrafficDetails() {
    const unpaid = state.events.filter(event => event.type === 'fine' && !event.paid).sort((a, b) => eventEpoch(b) - eventEpoch(a));
    const issues = state.events.filter(event => event.type === 'issue' && event.status !== 'fixed').sort((a, b) => eventEpoch(b) - eventEpoch(a));
    const unpaidNode = $('#unpaidFinesList');
    if (unpaidNode) unpaidNode.innerHTML = unpaid.length ? unpaid.map(event => `<div class="mini-row"><div class="mini-row-main"><div class="mini-row-title">${escapeHtml(event.description || 'جریمه ثبت‌شده')}</div><div class="mini-row-meta">${escapeHtml(event.jalaliDate || eventDateKey(event))}${event.ticketNumber ? ` · قبض ${escapeHtml(event.ticketNumber)}` : ''}</div></div><div class="mini-row-value">${moneyText((Number(event.costRial) || 0) / 10)} تومان</div></div>`).join('') : '<div class="empty-state">جریمه پرداخت‌نشده‌ای ثبت نشده است.</div>';
    const issueNode = $('#openIssuesList');
    if (issueNode) issueNode.innerHTML = issues.length ? issues.map(event => `<div class="mini-row"><div class="mini-row-main"><div class="mini-row-title">${escapeHtml(eventTitle(event))}</div><div class="mini-row-desc">${escapeHtml(event.description || event.symptom || '')}</div><div class="mini-row-meta">${escapeHtml(event.jalaliDate || eventDateKey(event))} · ${escapeHtml(event.actor || 'من')}</div></div><div class="mini-row-value">باز</div></div>`).join('') : '<div class="empty-state">خرابی باز ثبت نشده است.</div>';
  }
  function renderSettingsPage() {
    const servicesNode = $('#settingsServiceTable');
    const services = Object.entries(state.config?.serviceIntervals || {});
    if (servicesNode) servicesNode.innerHTML = services.length ? `<div class="settings-config-table"><div class="settings-config-row settings-config-head"><b>سرویس</b><b>بازه کیلومتر</b><b>بازه زمانی</b></div>${services.map(([key, item]) => `<div class="settings-config-row"><span>${escapeHtml(item.label || key)}</span><span>${Number(item.intervalKm) > 0 ? `${formatNumber(item.intervalKm)} km` : '—'}</span><span>${Number(item.intervalDays) > 0 ? `${formatNumber(item.intervalDays)} روز` : '—'}</span></div>`).join('')}</div>` : '<div class="empty-state">در config.json بازهٔ سرویس تعریف نشده است.</div>';
    const peopleNode = $('#settingsPeopleList');
    if (peopleNode) {
      const people = [...new Set([...(Array.isArray(state.config?.people) ? state.config.people : []), ...state.events.map(event => event.actor).filter(Boolean)])].sort((a, b) => String(a).localeCompare(String(b), 'fa'));
      peopleNode.innerHTML = people.length ? people.map(person => `<span class="person-chip">👤 ${escapeHtml(person)}</span>`).join('') : '<div class="empty-state">هنوز شخصی در تنظیمات یا سوابق ثبت نشده است.</div>';
    }
    filterGuideCards();
  }
  function renderAnalytics() {
    const period = ['hour', 'day', 'week', 'month'].includes(state.analyticsPeriod) ? state.analyticsPeriod : 'month';
    const keys = periodBucketKeys(period);
    const keySet = new Set(keys);
    const counts = Object.fromEntries(keys.map(key => [key, { events: 0, distance: 0, fuel: 0, cost: 0, fines: 0, services: 0 }]));
    const inPeriodEvents = [];
    state.events.forEach(event => {
      const key = bucketForDate(event.occurredAt || event.date || event.createdAt, period);
      if (!keySet.has(key)) return;
      inPeriodEvents.push(event);
      const bucket = counts[key]; bucket.events++;
      if (event.type === 'fuel') bucket.fuel += Number(event.liters) || 0;
      if (event.type === 'fine') bucket.fines += Number(event.costRial) || 0;
      if (['service', 'part', 'repair'].includes(event.type)) bucket.services++;
      bucket.cost += expenseAmount(event);
    });
    const distanceEntries = calculateDistanceEntries(state.events, state.config?.ownership || {});
    distanceEntries.forEach(entry => {
      const key = bucketForDate(entry.occurredAt || entry.date, period);
      if (keySet.has(key)) counts[key].distance += Number(entry.distanceKm) || 0;
    });
    const values = keys.map(key => counts[key]);
    const sumValue = property => values.reduce((total, row) => total + (Number(row[property]) || 0), 0);
    const title = periodLabel(period);
    safeText('#analyticsPeriodLabel', title);
    safeText('#analyticsChartCaption', `تحلیل داده‌های واقعی ثبت‌شده · ${title}`);
    safeText('#periodEventsNumber', formatNumber(sumValue('events')));
    safeText('#periodDistanceNumber', `${formatNumber(sumValue('distance'), 1)} km`);
    safeText('#periodFuelNumber', `${formatNumber(sumValue('fuel'), 1)} L`);
    safeText('#periodCostNumber', `${compactMoney(sumValue('cost') / 10)} تومان`);
    safeText('#periodFineNumber', `${compactMoney(sumValue('fines') / 10)} تومان`);
    safeText('#periodServiceNumber', formatNumber(sumValue('services')));
    safeText('#periodFineFoot', `${formatNumber(inPeriodEvents.filter(event => event.type === 'fine' && !event.paid).length)} جریمه پرداخت‌نشده`);
    const labelRows = keys.map(key => ({ label: key, shortLabel: periodShortLabel(key, period), value: counts[key].cost / 10 }));
    chartBars('#costChart', labelRows, value => compactMoney(value), 'در بازه انتخابی هزینه‌ای ثبت نشده است.');
    safeText('#costChartTitle', `روند هزینه · ${title}`);
    safeText('#costChartTotal', `${moneyText(sumValue('cost') / 10)} تومان`);
    chartBars('#fuelChart', keys.map(key => ({ label: key, shortLabel: periodShortLabel(key, period), value: counts[key].fuel })), value => `${formatNumber(value, 1)} L`, 'در بازه انتخابی سوختی ثبت نشده است.');
    safeText('#fuelChartTitle', `سوخت ثبت‌شده · ${title}`);
    safeText('#fuelChartTotal', `${formatNumber(sumValue('fuel'), 1)} لیتر`);
    const byActorCost = {};
    inPeriodEvents.filter(isActualExpense).forEach(event => { const actor = String(event.actor || 'من'); byActorCost[actor] = (byActorCost[actor] || 0) + expenseAmount(event) / 10; });
    const actorCostNode = $('#actorCostBreakdown');
    if (actorCostNode) actorCostNode.innerHTML = Object.keys(byActorCost).length ? Object.entries(byActorCost).sort((a, b) => b[1] - a[1]).map(([actor, value]) => `<div class="actor-breakdown-row"><div><b>${escapeHtml(actor)}</b><strong>${moneyText(value)} تومان</strong></div><div class="category-track"><i style="width:${Math.max(3, value / Math.max(1, ...Object.values(byActorCost)) * 100)}%"></i></div></div>`).join('') : '<div class="empty-state">در این بازه هزینه‌ای به نام اشخاص ثبت نشده است.</div>';
    const byActorDistance = {};
    distanceEntries.forEach(entry => { const key = bucketForDate(entry.occurredAt || entry.date, period); if (keySet.has(key)) { const actor = String(entry.actor || 'من'); byActorDistance[actor] = (byActorDistance[actor] || 0) + (Number(entry.distanceKm) || 0); } });
    const actorDistanceNode = $('#actorDistanceBreakdown');
    if (actorDistanceNode) actorDistanceNode.innerHTML = Object.keys(byActorDistance).length ? Object.entries(byActorDistance).sort((a, b) => b[1] - a[1]).map(([actor, value]) => `<div class="actor-breakdown-row"><div><b>${escapeHtml(actor)}</b><strong>${formatNumber(value, 1)} km</strong></div><div class="category-track"><i style="width:${Math.max(3, value / Math.max(1, ...Object.values(byActorDistance)) * 100)}%"></i></div></div>`).join('') : '<div class="empty-state">در این بازه مسافت قابل انتسابی وجود ندارد.</div>';
    const totalKm = sumValue('distance');
    const totalCost = sumValue('cost') / 10;
    safeText('#costPerKmValue', totalKm > 0 ? `${formatNumber(totalCost / totalKm, 0)} تومان/km` : '—');
    safeText('#costPerKmFoot', totalKm > 0 ? `${moneyText(totalCost)} تومان هزینه واقعی تقسیم بر ${formatNumber(totalKm, 1)} کیلومتر` : 'برای محاسبه به هزینه و مسافت قابل محاسبه نیاز است.');
    const track = $('#costPerKmTrack'); if (track) track.style.width = `${clamp(totalKm > 0 ? totalCost / totalKm / 1000 * 100 : 0, 0, 100)}%`;
    chartBars('#driverTimelineChart', keys.map(key => ({ label: key, shortLabel: periodShortLabel(key, period), value: counts[key].distance })), value => `${formatNumber(value, 1)} km`, 'در این بازه دادهٔ مسافت زمان‌مند موجود نیست.');
    safeText('#driverTimelineLegend', Object.keys(byActorDistance).sort().join(' · '));
    const categories = {};
    inPeriodEvents.filter(isActualExpense).forEach(event => { const category = String(event.expenseCategory || typeLabels[event.type] || event.type); categories[category] = (categories[category] || 0) + expenseAmount(event) / 10; });
    const categoryNode = $('#analyticsCategoryBreakdown');
    if (categoryNode) categoryNode.innerHTML = Object.entries(categories).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([name,value])=>`<div class="actor-breakdown-row"><div><b>${escapeHtml(name)}</b><strong>${moneyText(value)} تومان</strong></div></div>`).join('') || '<div class="empty-state">داده‌ای برای دسته‌بندی هزینه‌ها وجود ندارد.</div>';
    const fuelEvents = inPeriodEvents.filter(event => event.type === 'fuel');
    const fuelFull = fuelEvents.filter(event => event.fullTank && Number.isFinite(Number(event.odometerKm)));
    safeText('#fuelInsight', fuelFull.length >= 2 ? `${formatNumber(fuelFull.length)} ثبت باک کامل در بازه موجود است؛ مصرف دقیق پس از تطبیق فاصلهٔ دو باک محاسبه می‌شود.` : 'برای مصرف قابل اتکا، حداقل دو سوخت‌گیری باک کامل همراه کیلومتر ثبت کن.');
    const topCategory = Object.entries(categories).sort((a,b)=>b[1]-a[1])[0];
    safeText('#topCostInsight', topCategory ? `بیشترین هزینه مربوط به ${topCategory[0]} با ${moneyText(topCategory[1])} تومان است.` : 'در بازهٔ انتخابی هزینه‌ای ثبت نشده است.');
    const topDriver = Object.entries(byActorDistance).sort((a,b)=>b[1]-a[1])[0];
    safeText('#driveInsight', topDriver ? `${topDriver[0]} با ${formatNumber(topDriver[1], 1)} کیلومتر بیشترین مسافت قابل انتساب را در این بازه دارد.` : 'با ثبت چند کیلومترشمار یا مسافت، الگوی رانندگی نمایش داده می‌شود.');
  }
  function exportCsvRows(rows, filename) {
    const keys = ['id','type','title','description','actor','note','occurredAt','jalaliDate','date','time','odometerKm','previousOdometerKm','deltaSincePreviousKm','distanceKm','liters','costRial','serviceKey','serviceCatalogKey','serviceLabel','componentKey','componentName','componentCategory','componentMode','componentReplaced','brand','model','partNumber','specs','quantity','expenseCategory','repairGroupId','paid','ticketDate','deadlineDate','appealed','appealDecisionDate','ticketNumber','fineLocation','officialCurrentAmountRial','paidAmountRial','paidAt','paymentDate','paymentReference','repairCostRial','resolvedAt','repairDescription','status','fullTank','updatedAt','revision'];
    const csv = [keys.join(','), ...rows.map(event => keys.map(key => csvCell(event[key])).join(','))].join('\\r\\n');
    downloadBlob(filename, '\\uFEFF' + csv, 'text/csv;charset=utf-8');
  }
  function exportCsvAll() {
    if (!state.events.length) { showToast('سوابقی برای خروجی وجود ندارد.'); return; }
    exportCsvRows(state.events, `206-garage-all-${localDateString(new Date())}.csv`); showToast('خروجی کامل CSV آماده شد.');
  }
  function exportJsonAll() {
    if (!state.events.length) { showToast('سوابقی برای خروجی وجود ندارد.'); return; }
    downloadBlob(`206-garage-all-${localDateString(new Date())}.json`, JSON.stringify({ exportedAt: new Date().toISOString(), vehicle: state.config?.vehicle || {}, config: state.config, months: state.months, events: state.events }, null, 2), 'application/json;charset=utf-8');
    showToast('پشتیبان کامل JSON آماده شد.');
  }
  function exportExpensesCsv() {
    const rows = state.events.filter(isActualExpense);
    if (!rows.length) { showToast('هزینه‌ای برای خروجی وجود ندارد.'); return; }
    exportCsvRows(rows, `206-garage-expenses-${localDateString(new Date())}.csv`); showToast('خروجی هزینه‌ها آماده شد.');
  }
  async function copyApiExample() {
    const node = $('#copyApiExample')?.parentElement?.querySelector('.api-code code');
    const value = node?.textContent || 'curl -X GET "https://peugeot-206-garage-bot.game-developer-mb.workers.dev/health"';
    try { await navigator.clipboard.writeText(value); showToast('نمونه درخواست API کپی شد.'); }
    catch { showToast(value); }
  }

  function countOdometerSources(events) { return events.filter(e=>e.type==='odometer'||e.type==='trip').length; }
  function sum(rows, selector) { return rows.reduce((total,row)=>total+(Number(selector(row))||0),0); }
  function eventEpoch(event) {
    const value = event?.occurredAt || (event?.date ? `${String(event.date).slice(0,10)}T${event?.time || '12:00'}:00+03:30` : event?.createdAt);
    const t = Date.parse(value || ''); return Number.isFinite(t) ? t : 0;
  }
  function localDateString(date) {
    const parts = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tehran',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
    const p = Object.fromEntries(parts.filter(x=>x.type!=='literal').map(x=>[x.type,x.value])); return `${p.year}-${p.month}-${p.day}`;
  }
  function formatJalaliDate(value) {
    if (!value) return '—'; const date = new Date(`${String(value).slice(0,10)}T09:00:00Z`);
    return new Intl.DateTimeFormat('fa-IR-u-ca-persian',{timeZone:'Asia/Tehran',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
  }
  function formatDateTime(value) { const date = new Date(value); if (!Number.isFinite(date.getTime())) return String(value); return `${formatJalaliDate(localDateString(date))} · ${formatTime(date)}`; }
  function formatTime(value) { const date = value instanceof Date ? value : new Date(value); if (!Number.isFinite(date.getTime())) return '—'; return new Intl.DateTimeFormat('fa-IR',{timeZone:'Asia/Tehran',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(date); }
  function monthShort(key) { const [y,m] = key.split('-').map(Number); return new Intl.DateTimeFormat('fa-IR-u-ca-persian',{month:'short',timeZone:'Asia/Tehran'}).format(new Date(Date.UTC(y,m-1,15,9))); }
  function getMonthKeys(last, count) { const [y,m] = last.split('-').map(Number); return Array.from({length:count},(_,i)=>{const d=new Date(Date.UTC(y,m-1-(count-1-i),1));return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`;}); }
  function addDays(value, days) { const [y,m,d]=String(value).slice(0,10).split('-').map(Number); const date=new Date(Date.UTC(y,m-1,d+days)); return `${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,'0')}-${String(date.getUTCDate()).padStart(2,'0')}`; }
  function daysBetween(from,to) { return Math.round((Date.parse(`${to}T00:00:00Z`)-Date.parse(`${from}T00:00:00Z`))/86400000); }
  function formatNumber(value, fraction=0) { return new Intl.NumberFormat('fa-IR',{maximumFractionDigits:fraction}).format(Number(value)||0); }
  function compactMoney(value) { const n=Number(value)||0; if(n>=1e9)return `${formatNumber(n/1e9,1)} میلیارد`; if(n>=1e6)return `${formatNumber(n/1e6,1)} م`; if(n>=1e3)return `${formatNumber(n/1e3,0)} هزار`; return formatNumber(n); }
  function moneyText(value) { return new Intl.NumberFormat('fa-IR',{maximumFractionDigits:0}).format(Math.round(Number(value)||0)); }
  function niceMax(value) { const power=Math.pow(10,Math.floor(Math.log10(value||1)));const scaled=value/power;const nice=scaled<=1?1:scaled<=2?2:scaled<=5?5:10;return nice*power; }
  function axisShort(value) { if(value>=1e9)return `${formatNumber(value/1e9,1)}B`;if(value>=1e6)return `${formatNumber(value/1e6,1)}M`;if(value>=1e3)return `${formatNumber(value/1e3,0)}k`;return formatNumber(value); }
  function clamp(value,min,max) { return Math.max(min,Math.min(max,value)); }
  function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
  function escapeAttr(value) { return /^[a-z0-9_-]+$/i.test(String(value)) ? String(value) : ''; }
  function showToast(text) { const el=$('#toast'); if (!el) { window.GarageDiagnostics?.log('warn','app.toast','عنصر اعلان موقت (#toast) در HTML وجود ندارد.',{ message:String(text || '') }); return; } el.textContent=text;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),3000); }
  function initTilt() {
    const finePointer = matchMedia('(hover:hover) and (pointer:fine)').matches;
    if (!finePointer || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    document.addEventListener('pointermove', event => {
      const cards = $$('.hover-tilt:hover');
      for (const card of cards) {
        const rect=card.getBoundingClientRect();const x=(event.clientX-rect.left)/rect.width-.5;const y=(event.clientY-rect.top)/rect.height-.5;
        card.style.transform=`perspective(800px) rotateX(${(-y*2.5).toFixed(2)}deg) rotateY(${(x*3).toFixed(2)}deg) translateY(-2px)`;
      }
    },{passive:true});
    document.addEventListener('pointerout',event=>{const card=event.target.closest?.('.hover-tilt');if(card&&!card.contains(event.relatedTarget))card.style.transform='';},{passive:true});
  }
})();
