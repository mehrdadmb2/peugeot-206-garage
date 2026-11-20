(() => {
  'use strict';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const state = { events: [], config: null, months: [], precomputed: null, snapshotGeneratedAt: null, dataMode: 'idle', dataWarnings: [], range: 6, analyticsPeriod: 'month', componentCategoryFilter: 'all', shown: 12, filtered: [], refreshedAt: null, fuelEngine: null, costEngine: null, fineEngine: null };
  const PersianCalendar = window.GaragePersianCalendar || null;
  const GarageClock = window.GarageClock || null;
  const garageNow = () => GarageClock?.nowDate?.() || new Date();
  const garageNowEpoch = () => GarageClock?.nowEpoch?.() ?? Date.now();
  const OdometerIntelligence = window.GarageOdometerIntelligence || null;
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
  let dashboardLoadInFlight = false;
  let lastDashboardLoadAt = 0;

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
      window.addEventListener?.('focus', () => { if (Date.now() - lastDashboardLoadAt > 20000) loadDashboard(false); });
      document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - lastDashboardLoadAt > 20000) loadDashboard(false); });
      window.setInterval?.(() => { if (!document.hidden && Date.now() - lastDashboardLoadAt > 85000) loadDashboard(false); }, 90000);
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
      safeBind('#fuelTripDistanceInput', 'input', renderFuelTripEstimator);
      safeBind('#ownershipTripDistanceInput', 'input', renderOwnershipCostModel);
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
    if (dashboardLoadInFlight) return;
    dashboardLoadInFlight = true;
    const loadStartedAt = Date.now();
    try { await GarageClock?.sync?.(); } catch (_) { /* The UI can still load with the device clock as a fallback. */ }
    window.GarageDiagnostics?.log('info', 'app.load', 'بارگذاری داشبورد آغاز شد.', { userInitiated: Boolean(userInitiated), loaderAvailable: Boolean(window.GarageDataLoader?.load) });
    const refreshButton = $('#refreshButton');
    try {
      if (!state.fuelEngine) {
        try { state.fuelEngine = await import('./fuel-intelligence.mjs'); }
        catch (error) { window.GarageDiagnostics?.log('warn', 'fuel.engine', 'موتور برآورد سوخت بارگذاری نشد؛ سایر بخش‌ها بدون آن ادامه می‌یابند.', error); }
      }
      if (!state.costEngine) {
        try { state.costEngine = await import('./vehicle-cost-intelligence.mjs'); }
        catch (error) { window.GarageDiagnostics?.log('error', 'cost.engine', 'موتور محاسبات هزینه بارگذاری نشد.', error); }
      }
      if (!state.fineEngine) {
        try { state.fineEngine = await import('./fine-intelligence.mjs'); }
        catch (error) { window.GarageDiagnostics?.log('error', 'fine.engine', 'موتور مشترک محاسبه مهلت جریمه بارگذاری نشد؛ مهلت خودکار اعمال نمی‌شود.', error); }
      }
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
      state.refreshedAt = garageNow();
      lastDashboardLoadAt = Date.now();

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
      dashboardLoadInFlight = false;
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
      ['settings', renderSettingsPage], ['ownership', renderOwnershipSummary], ['specifications', renderVehicleSpecs]
    ];
    sections.forEach(([name, renderer]) => safeRender(name, renderer));
  }

  function activateTab(name, scroll = true) {
    const valid = ['overview','maintenance','fuel','analytics','expenses','traffic','journal','specifications','documents','settings'];
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
    const monthKey = currentPersianMonthKey();
    const monthEvents = all.filter(event => eventPersianMonthKey(event) === monthKey);
    const currentOdo = calculateOdometer(all);
    const monthFuel = monthEvents.filter(event => event.type === 'fuel');
    const cached = state.precomputed?.currentMonth === monthKey ? state.precomputed : null;
    const totalLiters = cached ? Number(cached.currentMonthFuelLiters) || 0 : sum(monthFuel, event => event.liters);
    const due = calculateDue(all, state.config, currentOdo);
    const monthCostEvents = all.filter(event => isActualExpense(event) && persianMonthKey(expenseDate(event)) === monthKey);
    const cost = cached ? Number(cached.currentMonthCostRial) || 0 : sum(monthCostEvents, expenseAmount);
    $('#statOdometer').textContent = currentOdo == null ? '—' : formatNumber(currentOdo);
    const odometerDiagnostics = state.precomputed?.odometerDiagnostics || (OdometerIntelligence?.getOdometerState ? OdometerIntelligence.getOdometerState(all, { asOf: garageNowEpoch() }) : null);
    const rejectedOdometers = Number(odometerDiagnostics?.rejectedReadingCount ?? odometerDiagnostics?.rejectedOdometerCount) || 0;
    $('#statOdometerFoot').textContent = currentOdo == null ? 'ابتدا /km را در تلگرام ثبت کن' : `${formatNumber(odometerDiagnostics?.acceptedReadingCount ?? odometerDiagnostics?.odometerReadingCount ?? countOdometerSources(all))} ثبت معتبر${rejectedOdometers ? ` · ${formatNumber(rejectedOdometers)} قرائت مشکوک نادیده گرفته شد` : ''}`;
    $('#statCost').textContent = currentOdo == null && !monthEvents.length ? '—' : compactMoney(cost / 10);
    $('#statCostFoot').textContent = `${formatNumber(monthCostEvents.length)} رویداد هزینه‌دار در ${persianMonthLabel(monthKey)}`;
    $('#statFuel').textContent = monthFuel.length ? formatNumber(totalLiters, 1) : '۰';
    $('#statFuelFoot').textContent = `${formatNumber(monthFuel.length)} بار سوخت‌گیری در ${persianMonthLabel(monthKey)}`;
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
  function numberOrNull(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }
  function maintenanceEventMatches(event, key, item = null) {
    const accepted = new Set([key, item?.serviceKey].filter(Boolean).map(String));
    const identifiers = [event?.serviceKey, event?.componentKey, event?.serviceCatalogKey].filter(Boolean).map(String);
    if (!identifiers.some(identifier => accepted.has(identifier))) return false;
    if (event.type === 'service') return true;
    if (event.type === 'part') return event.componentReplaced === true;
    if (event.type === 'repair') return event.status !== 'open';
    if (event.type === 'issue') return event.status === 'fixed' && Boolean(event.componentReplaced || event.componentKey || event.serviceKey || event.serviceCatalogKey);
    return false;
  }
  function latestMaintenanceForKey(events, key, item = null) {
    return events.filter(event => maintenanceEventMatches(event, key, item))
      .sort((a, b) => eventEpoch(b) - eventEpoch(a))[0] || null;
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
      const latest = latestMaintenanceForKey(events, key, config.partCatalog?.items?.[key] || null);
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
      const referenceKm = numberOrNull(reference.odometerKm);
      const remainingKm = intervalKm > 0 && currentOdo != null && referenceKm != null ? Math.round(referenceKm + intervalKm - currentOdo) : null;
      const referenceDate = reference.date || String(reference.occurredAt || '').slice(0, 10) || null;
      const dueDate = intervalDays > 0 && referenceDate ? addDays(referenceDate, intervalDays) : null;
      const remainingDays = dueDate ? daysBetween(localDateString(garageNow()), dueDate) : null;
      const hasInterval = intervalKm > 0 || intervalDays > 0;
      const stage = hasInterval ? maintenanceStage(remainingKm, remainingDays, intervalKm, intervalDays) : 'monitor';
      const status = `${maintenanceStageLabel(stage)}${baseline ? ' · بدون سابقه' : ''}`;
      const statusClass = maintenanceStageClass(stage);
      const progress = intervalKm > 0 && remainingKm != null
        ? clamp((intervalKm - remainingKm) / intervalKm * 100, 0, 100)
        : (intervalDays > 0 && remainingDays != null ? clamp((intervalDays - remainingDays) / intervalDays * 100, 0, 100) : 0);
      const headline = remainingKm != null
        ? (remainingKm < 0 ? `${formatNumber(Math.abs(remainingKm))} km عبور از موعد` : remainingKm === 0 ? 'موعد سرویس رسیده' : `${formatNumber(remainingKm)} km مانده`)
        : remainingDays != null ? `${formatNumber(Math.abs(remainingDays))} روز${remainingDays <= 0 ? ' عبور از موعد' : ' تا موعد'}`
          : currentOdo != null && referenceKm != null ? `${formatNumber(Math.max(0, currentOdo - referenceKm))} km از مبنا` : 'نامشخص';
      const subline = remainingKm != null ? (remainingKm < 0 ? 'از موعد کیلومتری گذشته' : remainingKm === 0 ? 'موعد کیلومتری همین حالا رسیده' : 'مانده تا سرویس/بازدید بعدی')
        : remainingDays != null ? (remainingDays <= 0 ? 'از موعد زمانی گذشته' : 'تا موعد زمانی بعدی')
          : baseline ? 'از مبنای کیلومتر خرید؛ تاریخ خرید برای محاسبه روز مشخص نیست' : 'برای تخمین موعد، تاریخ/کیلومتر معتبر لازم است';
      const footParts = [];
      if (baseline) {
        footParts.push(`سابقه سرویس بعد از خرید ثبت نشده؛ مبنای ${formatNumber(purchaseKm)} km`);
        if (currentOdo != null && currentOdo >= purchaseKm) footParts.push(`از خرید ${formatNumber(currentOdo - purchaseKm)} km پیموده شده`);
        footParts.push(purchaseDate ? `تاریخ مبنا: ${escapeHtml(purchaseDate)}` : 'سن تقویمی از خرید محاسبه نمی‌شود');
      } else {
        if (latest.odometerKm != null) footParts.push(`آخرین سرویس/تعویض: ${formatNumber(latest.odometerKm)} km`);
        footParts.push(`تاریخ: ${escapeHtml(formatEventDate(latest))}`);
        if (latest.actor) footParts.push(`انجام‌دهنده: ${escapeHtml(latest.actor)}`);
        if (latest.note) footParts.push(`توضیح: ${escapeHtml(latest.note)}`);
      }
      return { key, stage, rank: maintenanceStageRank(stage), kmSort: remainingKm ?? Infinity, card: serviceCard({ key, service, latest: reference, status, statusClass, headline, subline, progress, foot: footParts.join(' · ') }) };
    }).sort((a, b) => a.rank - b.rank || a.kmSort - b.kmSort || a.key.localeCompare(b.key));
    renderServiceReconciliation(config, events, currentOdo);
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

  function renderServiceReconciliation(config, events, currentOdo) {
    const node = $('#serviceReconciliation');
    if (!node) return;
    const purchaseKm = numberOrNull(config?.ownership?.purchaseOdometerKm ?? config?.ownership?.baselineOdometerKm ?? config?.vehicle?.purchaseOdometerKm) ?? 428000;
    const driven = currentOdo != null && currentOdo >= purchaseKm ? currentOdo - purchaseKm : null;
    const latestReplacements = events.filter(event => event.type === 'part' && event.componentReplaced === true && numberOrNull(event.odometerKm) !== null)
      .sort((a, b) => eventEpoch(b) - eventEpoch(a));
    const seen = new Set();
    const replacementNotes = latestReplacements.filter(event => {
      const key = String(event.componentKey || event.componentName || event.title || event.id);
      if (seen.has(key)) return false;
      seen.add(key); return true;
    }).slice(0, 4).map(event => {
      const since = currentOdo == null ? null : Math.max(0, currentOdo - Number(event.odometerKm));
      return `${event.componentName || event.title || 'قطعه'}: ${since == null ? '—' : `${formatNumber(since)} km از تعویض`}`;
    });
    const parts = [
      `مبنای خرید: ${formatNumber(purchaseKm)} km`,
      `کیلومتر فعلی: ${currentOdo == null ? 'نامشخص' : `${formatNumber(currentOdo)} km`}`,
      `پیمایش از خرید: ${driven == null ? 'نامشخص' : `${formatNumber(driven)} km`}`
    ];
    if (replacementNotes.length) parts.push(`تعویض‌های اخیر: ${replacementNotes.join(' · ')}`);
    node.textContent = `${parts.join('  |  ')}. اعداد مثبت «مانده تا موعد» هستند؛ فقط عبارت «عبور از موعد» به معنی عقب‌افتادگی است.`;
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
      const event = latestMaintenanceForKey(events, key, item);
      const baseline = !event;
      const reference = event || { id: `purchase-${key}`, type: 'purchase-baseline', date: purchaseDate, occurredAt: purchaseDate ? `${purchaseDate}T12:00:00+03:30` : null, jalaliDate: purchaseDate || 'از مبنای خرید', odometerKm: purchaseKm, baseline: true };
      const category = categories[item.category] || { label: item.category || 'قطعه', icon: '🔩', theme: '#36c7e8' };
      const refKm = numberOrNull(reference.odometerKm);
      const kmSince = currentOdo != null && refKm != null ? Number(currentOdo) - refKm : null;
      const referenceDate = reference.date || String(reference.occurredAt || '').slice(0,10) || null;
      const daysSince = referenceDate ? Math.max(0, daysBetween(referenceDate, localDateString(garageNow()))) : null;
      const intervalKm = Number(item.intervalKm) || 0;
      const intervalDays = Number(item.intervalDays) || 0;
      const hasInterval = item.mode === 'periodic' && (intervalKm > 0 || intervalDays > 0);
      const remainingKm = hasInterval && intervalKm > 0 && kmSince != null ? intervalKm - kmSince : null;
      const remainingDays = hasInterval && intervalDays > 0 && referenceDate ? intervalDays - daysSince : null;
      const stage = hasInterval ? maintenanceStage(remainingKm, remainingDays, intervalKm, intervalDays) : 'monitor';
      const status = `${maintenanceStageLabel(stage)}${baseline ? ' · سابقه ندارد' : ''}`;
      const statusClass = maintenanceStageClass(stage);
      const headline = hasInterval
        ? (remainingKm != null ? (remainingKm < 0 ? `${formatNumber(Math.abs(remainingKm))} km عبور از موعد` : remainingKm === 0 ? 'موعد رسیده' : `${formatNumber(remainingKm)} km مانده`) : remainingDays != null ? `${formatNumber(Math.max(0, remainingDays))} روز` : 'موعد نامشخص')
        : (kmSince != null ? `${formatNumber(Math.max(0, kmSince))} km` : 'عمر نامشخص');
      const subline = hasInterval
        ? (stage === 'critical' ? 'بسیار فراتر از بازه؛ بررسی فوری' : stage === 'overdue' ? 'از بازهٔ تنظیم‌شده عبور کرده' : stage === 'due' ? 'موعد تعویض/بازدید رسیده' : stage === 'upcoming' ? 'به موعد نزدیک می‌شود' : 'کارکرد از مرجع نگهداری')
        : (baseline ? 'پایش از کیلومتر خرید؛ نصب/تعویض ثبت نشده' : 'کارکرد پس از نصب ثبت‌شده');
      const footParts = [];
      if (baseline) {
        footParts.push(`سابقه نصب/تعویض ثبت نشده؛ مبنای کیلومتری ${formatNumber(purchaseKm)} km`);
        footParts.push(purchaseDate ? `تاریخ مبنا: ${escapeHtml(purchaseDate)}` : 'روزهای گذشته از خرید قابل محاسبه نیست');
      } else {
        footParts.push(`آخرین ثبت: ${escapeHtml(formatEventDate(reference))}`);
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
      const daysSince = latest.date ? Math.max(0, daysBetween(latest.date, localDateString(garageNow()))) : null;
      cards.push({ rank: 4, sortKm: Infinity, key: `service-${key}`, html: `<article class="service-card installed-lifetime-card maintenance-monitor" style="--service-glow:rgba(93,230,176,.07);--component-color:${escapeAttr(category.theme || '#4ade80')}"><div class="service-card-head"><span class="service-name">${escapeHtml(service.icon || category.icon || '🧰')} ${escapeHtml(service.label || key)}</span><span class="service-status ok">🧾 آخرین سرویس ثبت‌شده</span></div><p class="service-description">${escapeHtml(service.note || 'شرح و نتیجهٔ عملیات را در دفتر وقایع بررسی کن.')}</p><div class="service-metrics"><div class="service-metric"><strong>${kmSince == null ? '—' : `${formatNumber(kmSince)} km`}</strong><small>از آخرین سرویس</small></div><div class="service-metric"><strong>${daysSince == null ? '—' : `${formatNumber(daysSince)} روز`}</strong><small>از تاریخ ثبت</small></div></div><div class="service-foot">تاریخ: ${escapeHtml(formatEventDate(latest))} · ${latest.odometerKm != null ? `کیلومتر: ${formatNumber(latest.odometerKm)} km · ` : ''}شناسه <code>${escapeHtml(String(latest.id).slice(0,8))}</code></div></article>` });
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
      const fitment = latest ? `آخرین نصب: ${escapeHtml(formatEventDate(latest))}${latest.odometerKm != null ? ` · ${formatNumber(latest.odometerKm)} km` : ''}` : 'هنوز در سوابق نصب ثبت نشده';
      const technical = [latest?.brand ? `برند ${latest.brand}` : '', latest?.model ? `مدل ${latest.model}` : '', latest?.partNumber ? `کد ${latest.partNumber}` : ''].filter(Boolean).join(' · ');
      const modeLabel = isPeriodic ? 'مصرفی / موعدمحور' : 'عمرمحور / بازدیدمحور';
      const latestDetails = latest && latest.odometerKm != null && calculateOdometer(state.events) != null ? Math.max(0, calculateOdometer(state.events) - Number(latest.odometerKm)) : null;
      const tracking = latest ? (isPeriodic ? `آخرین تعویض ثبت شده${latestDetails != null ? ` · ${formatNumber(latestDetails)} km پیموده‌شده` : ''}` : `مدت ثبت‌شده از نصب: ${formatNumber(daysBetween(latest.date || String(latest.occurredAt).slice(0,10), localDateString(garageNow())))} روز${latestDetails != null ? ` · ${formatNumber(latestDetails)} km` : ''}`) : 'برای شروع پایش، نصب/تعویض را ثبت کن';
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
      const daysSince = event.date ? Math.max(0,daysBetween(event.date,localDateString(garageNow()))) : null;
      const age = [kmSince != null && kmSince >= 0 ? `${formatNumber(kmSince)} km` : '',daysSince != null ? `${formatNumber(daysSince)} روز` : ''].filter(Boolean).join(' · ');
      const intervalKm = Number(item.intervalKm)||0;
      const intervalDays = Number(item.intervalDays)||0;
      const remainingKm = item.mode === 'periodic' && intervalKm > 0 && kmSince != null ? intervalKm-kmSince : null;
      const dueDate = item.mode === 'periodic' && intervalDays > 0 && event.date ? addDays(event.date,intervalDays) : null;
      const remainingDays = dueDate ? daysBetween(localDateString(garageNow()),dueDate) : null;
      const status = item.mode === 'periodic' ? ((remainingKm != null && remainingKm <= 0) || (remainingDays != null && remainingDays <= 0) ? 'موعد گذشته' : 'یادآور موعد') : 'عمر ثبت‌شده · سلامت نیازمند بازدید';
      const specs = event.specs && typeof event.specs === 'object' ? Object.entries(event.specs).map(([k,v])=>`${k}: ${v}`).join(' · ') : '';
      return `<article class="installed-component-card" style="--component-color:${escapeAttr(category.theme || '#36c7e8')}"><div class="installed-component-heading"><span>${escapeHtml(item.icon || category.icon || '🔩')}</span><div><b>${escapeHtml(item.label || event.componentName || key)}</b><small>${escapeHtml(category.label || item.category || 'قطعه')}</small></div><em>${escapeHtml(status)}</em></div><div class="installed-component-age">${age ? `از نصب: ${escapeHtml(age)}` : 'زمان/کیلومتر نصب کامل نیست'}</div><div class="installed-component-meta">نصب: ${escapeHtml(formatEventDate(event))}${event.odometerKm != null ? ` · ${formatNumber(event.odometerKm)} km` : ''}</div>${event.brand ? `<div class="installed-component-meta">برند: ${escapeHtml(event.brand)}${event.model ? ` · مدل: ${escapeHtml(event.model)}` : ''}</div>` : ''}${specs ? `<div class="installed-component-meta">${escapeHtml(specs)}</div>` : ''}${item.mode === 'periodic' ? `<div class="installed-component-meta">${remainingKm != null ? (remainingKm <= 0 ? `${formatNumber(Math.abs(remainingKm))} km عبور از بازه` : `${formatNumber(remainingKm)} km تا بازه`) : ''}${remainingDays != null ? ` · ${remainingDays < 0 ? `${formatNumber(Math.abs(remainingDays))} روز از موعد گذشته` : `${formatNumber(remainingDays)} روز باقی‌مانده`}` : ''}</div>` : ''}<div class="installed-component-foot">شناسه <code>${escapeHtml(String(event.id).slice(0,8))}</code> · عمر/موعد تخمینی جایگزین بازدید قطعه نیست.</div></article>`;
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
      return `<article class="service-catalog-card" style="--component-color:${escapeAttr(category.theme || '#4ade80')}"><div class="service-catalog-icon">${escapeHtml(item.icon || category.icon || '🧰')}</div><div class="service-catalog-body"><div class="service-catalog-tags"><span>${escapeHtml(category.label || 'سرویس')}</span><small>${escapeHtml(key)}</small></div><h3>${escapeHtml(item.label || key)}</h3><p>${escapeHtml(item.note || 'شرح کار و نتیجه را در توضیحات ذخیره کن.')}</p><small class="service-last-entry">${latest ? `آخرین ثبت: ${escapeHtml(formatEventDate(latest))}${latest.odometerKm != null ? ` · ${formatNumber(latest.odometerKm)} km` : ''}` : 'هنوز سابقه ثبت نشده'}</small></div><button type="button" class="component-command-copy" data-component-command="/service ${key} km=${calculateOdometer(state.events) || ''}">نمونه ثبت</button></article>`;
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
    const purchaseKm = numberOrNull(ownership.purchaseOdometerKm ?? ownership.baselineOdometerKm ?? config?.vehicle?.purchaseOdometerKm) ?? 428000;
    const purchaseDate = /^\d{4}-\d{2}-\d{2}$/.test(String(ownership.purchaseDate || '')) ? ownership.purchaseDate : null;
    const today = localDateString(garageNow());
    for (const [key, service] of Object.entries(config?.serviceIntervals || {})) {
      const latest = latestMaintenanceForKey(events, key, config?.partCatalog?.items?.[key] || null);
      const baseline = !latest;
      const refOdo = latest ? numberOrNull(latest.odometerKm) : purchaseKm;
      const refDate = latest?.date || (latest?.occurredAt ? String(latest.occurredAt).slice(0,10) : null) || (baseline ? purchaseDate : null);
      const kmInterval = Number(service.intervalKm) || 0;
      const dayInterval = Number(service.intervalDays) || 0;
      const leftKm = kmInterval > 0 && currentOdo != null && refOdo != null ? Math.round(refOdo + kmInterval - currentOdo) : null;
      const dueDate = dayInterval > 0 && refDate ? addDays(refDate, dayInterval) : null;
      const leftDays = dueDate ? daysBetween(today, dueDate) : null;
      const nearKm = leftKm != null && leftKm > 0 && leftKm <= Math.max(500, kmInterval * .1);
      const nearDays = leftDays != null && leftDays > 0 && leftDays <= 14;
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
      if (item.mode !== 'periodic' || config?.serviceIntervals?.[key] || (item.serviceKey && config?.serviceIntervals?.[item.serviceKey])) continue;
      const latest = latestMaintenanceForKey(events, key, item);
      const baseline = !latest;
      const refOdo = latest ? numberOrNull(latest.odometerKm) : purchaseKm;
      const refDate = latest?.date || (latest?.occurredAt ? String(latest.occurredAt).slice(0,10) : null) || (baseline ? purchaseDate : null);
      const kmInterval = Number(item.intervalKm) || 0;
      const dayInterval = Number(item.intervalDays) || 0;
      const kmSince = currentOdo != null && refOdo != null ? currentOdo - refOdo : null;
      const leftKm = kmInterval > 0 && kmSince != null ? Math.round(kmInterval - kmSince) : null;
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
    $('#fineSummary').innerHTML = fines.length ? fines.slice(0,4).map(e => {
      const timeline = state.fineEngine?.calculateFineTimeline
        ? state.fineEngine.calculateFineTimeline(e, localDateString(garageNow()))
        : { ticketDate: String(e.ticketDate || e.date || e.occurredAt || '').slice(0, 10) || null, elapsedDays: null, deadlineDate: e.deadlineDate || null, daysToDeadline: null, potentialAmountRial: null, eligibilityLabel: 'موتور مهلت در دسترس نیست؛ دیرکرد خودکار اعمال نشده است' };
      const ticketDate = timeline.ticketDate;
      const age = timeline.elapsedDays == null ? null : Math.max(0, timeline.elapsedDays);
      let deadlineText;
      if (e.paid) {
        deadlineText = `پرداخت: ${escapeHtml(e.paymentDate || String(e.paidAt || '').slice(0,10) || 'تاریخ نامشخص')}${e.paymentReference ? ` · پیگیری ${escapeHtml(e.paymentReference)}` : ''}`;
      } else if (timeline.potentialAmountRial != null) {
        deadlineText = `مهلت پیگیری قبض دوبرگی گذشته؛ مبلغ احتمالی با قاعدهٔ دوبرابری: ${escapeHtml(moneyText(timeline.potentialAmountRial / 10))} تومان · استعلام رسمی لازم است`;
      } else if (timeline.deadlineDate && timeline.daysToDeadline != null) {
        deadlineText = timeline.daysToDeadline < 0
          ? `${formatNumber(Math.abs(timeline.daysToDeadline))} روز از مهلت پیگیری/یادآوری گذشته · مبلغ نهایی را استعلام کن`
          : `${formatNumber(timeline.daysToDeadline)} روز تا مهلت پیگیری/یادآوری`;
      } else {
        deadlineText = `${timeline.eligibilityLabel || 'بدون دیرکرد خودکار'} · مهلت دوبرابرشدن خودکار ندارد`;
      }
      return `<div class="mini-row"><div class="mini-row-main"><div class="mini-row-title">${escapeHtml(e.description || 'جریمه ثبت‌شده')}</div><div class="mini-row-meta">${escapeHtml(formatEventDate(e) || ticketDate || '—')} · ${String(e.id).slice(0,8)}${age != null ? ` · ${formatNumber(age)} روز گذشته` : ''}</div><div class="mini-row-meta fine-deadline-meta">${deadlineText}</div></div><div class="mini-row-value ${e.paid?'paid':''}">${escapeHtml(moneyText((Number(e.costRial)||0)/10))}<div class="mini-row-meta">${e.paid?'پرداخت شد':'پرداخت‌نشده'}</div></div></div>`;
    }).join('') : '<div class="empty-state">جریمه‌ای ثبت نشده است.</div>';
    const issues = state.events.filter(e => e.type === 'issue' || e.type === 'repair').sort((a,b)=>eventEpoch(b)-eventEpoch(a));
    const open = issues.filter(e=>e.type==='issue' && e.status!=='fixed');
    $('#issueTotals').textContent = `خرابی باز: ${formatNumber(open.length)}`;
    $('#issueSummary').innerHTML = issues.length ? issues.slice(0,4).map(e=>`<div class="mini-row"><div class="mini-row-main"><div class="mini-row-title">${escapeHtml(e.title || (e.type==='repair'?'تعمیر':'خرابی'))}</div><div class="mini-row-desc">${escapeHtml((e.description || '').slice(0,100))}</div><div class="mini-row-meta">${escapeHtml(formatEventDate(e))} · ${e.status==='fixed'?'رفع‌شده':e.type==='repair'?'تعمیر':'باز'}</div></div><div class="mini-row-value ${e.status==='fixed'?'paid':''}">${Number(e.costRial)>0?escapeHtml(moneyText(Number(e.costRial)/10))+' تومان':e.status==='fixed'?'✓':'—'}</div></div>`).join('') : '<div class="empty-state">خرابی‌ای ثبت نشده است.</div>';
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
    const months = [...new Set([currentPersianMonthKey(), ...state.events.map(event => eventPersianMonthKey(event)).filter(Boolean)])].sort().reverse();
    select.innerHTML = '<option value="all">تمام ماه‌ها</option>' + months.map(month => `<option value="${month}">${escapeHtml(persianMonthLabel(month))} · ${formatNumber(Number(month.slice(0,4)))}-${formatNumber(Number(month.slice(5,7)))}</option>`).join('');
    if (old === 'all' || months.includes(old)) select.value = old; else select.value = 'all';
  }

  function exportCsv() {
    const rows = state.filtered.slice();
    if (!rows.length) { showToast('با فیلتر فعلی داده‌ای برای خروجی وجود ندارد.'); return; }
    const keys = ['id','type','title','description','actor','note','occurredAt','jalaliDate','date','time','odometerKm','previousOdometerKm','deltaSincePreviousKm','distanceKm','liters','costRial','fuelEstimateLiters','fuelEstimateCostRial','fuelEstimateMinCostRial','fuelEstimateMaxCostRial','fuelEstimateConfidenceLabel','fuelEstimateLPer100','fuelEstimateMinLPer100','fuelEstimateMaxLPer100','fuelEstimateMinLiters','fuelEstimateMaxLiters','fuelEstimatePriceTomanPerLiter','fuelEstimateConfidence','fuelEstimateSampleRefuels','fuelEstimateSampleIntervals','fuelEstimateSampleDistanceKm','fuelEstimateMethod','serviceKey','serviceCatalogKey','serviceLabel','componentKey','componentName','componentCategory','componentMode','componentReplaced','brand','model','partNumber','specs','quantity','expenseCategory','repairGroupId','paid','ticketDate','deadlineDate','appealed','appealDecisionDate','ticketNumber','ticketSerialNumber','ticketPaymentId','ticketType','fineLocation','vehicleDescription','vehiclePlate','violationDescription','ticketDateJalali','speedLimitKph','recordedSpeedKph','cameraCode','reportedUnpaidFineBalanceRial','reportedBalanceDate','amountCurrency','fineSource','originalSms','officialCurrentAmountRial','paidAmountRial','paidAt','paymentDate','paymentReference','repairCostRial','resolvedAt','repairDescription','status','fullTank','updatedAt','revision'];
    const csv = [keys.join(','), ...rows.map(e=>keys.map(k=>csvCell(e[k])).join(','))].join('\r\n');
    downloadBlob(`206-garage-${localDateString(garageNow())}.csv`, '\uFEFF'+csv, 'text/csv;charset=utf-8');
    showToast('خروجی CSV آماده شد.');
  }
  function exportJson() {
    const rows = state.filtered.slice();
    if (!rows.length) { showToast('هنوز داده‌ای برای خروجی وجود ندارد.'); return; }
    downloadBlob(`206-garage-${localDateString(garageNow())}.json`, JSON.stringify({ exportedAt: garageNow().toISOString(), vehicle: state.config?.vehicle || {}, events: rows }, null, 2), 'application/json;charset=utf-8');
    showToast('خروجی JSON آماده شد.');
  }
  function downloadBlob(filename, content, type) {
    const blob = new Blob([content], { type }); const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function csvCell(value) { return `"${String(value ?? '').replace(/"/g,'""')}"`; }
  function expenseAmount(event) {
    if (!event || (event.type === 'fine' && !event.paid)) return 0;
    const positive = value => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : 0;
    if (event.type === 'fine') {
      return positive(event.paidAmountRial) || positive(event.paidAmountToman) * 10 || positive(event.costRial) || positive(event.amountRial) || positive(event.costToman) * 10 || positive(event.amountToman) * 10;
    }
    if (event.type === 'issue') {
      return positive(event.repairCostRial) || positive(event.repairCostToman) * 10 || positive(event.costRial) || positive(event.amountRial) || positive(event.costToman) * 10 || positive(event.amountToman) * 10;
    }
    return positive(event.costRial) || positive(event.amountRial) || positive(event.costToman) * 10 || positive(event.amountToman) * 10 || positive(event.repairCostRial) || positive(event.repairCostToman) * 10;
  }
  function isActualExpense(event) { return expenseAmount(event) > 0; }
  function expenseDate(event) {
    const value = event.type === 'fine' && event.paid && event.paidAt ? event.paidAt
      : event.type === 'issue' && (Number(event.repairCostRial)>0 || Number(event.repairCostToman)>0) && event.resolvedAt ? event.resolvedAt
      : (event.occurredAt || event.date || event.createdAt || '');
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return String(value).slice(0, 10);
    return PersianCalendar?.gregorianDateKey?.(value) || String(value).slice(0, 10);
  }
  function calculateOdometer(events) {
    if (events === state.events && state.precomputed?.currentOdometerKm != null && Number.isFinite(Number(state.precomputed.currentOdometerKm))) return Number(state.precomputed.currentOdometerKm);
    if (OdometerIntelligence?.calculateCurrentOdometer) return OdometerIntelligence.calculateCurrentOdometer(events, { asOf: garageNowEpoch() });
    let current = null;
    const timeline = events.filter(e=>(e.type==='odometer'||e.type==='trip') && eventEpoch(e) <= garageNowEpoch()).sort((a,b)=>eventEpoch(a)-eventEpoch(b));
    let lastAbsolute = null;
    for (const event of timeline) {
      if (event.type==='odometer' && event.odometerKm !== null && event.odometerKm !== undefined && Number.isFinite(Number(event.odometerKm))) {
        const value = Number(event.odometerKm);
        if (lastAbsolute !== null && value < lastAbsolute && event.odometerReset !== true && event.meterReplaced !== true) continue;
        lastAbsolute = value;
        current = value;
      } else if (event.type==='trip' && Number.isFinite(Number(event.distanceKm)) && Number(event.distanceKm) > 0 && current !== null) current += Number(event.distanceKm);
    }
    return current == null ? null : Math.round(current*10)/10;
  }

  function calculateDistanceEntries(events, ownershipConfig = null) {
    if (events === state.events && Array.isArray(state.precomputed?.distanceEntries)) return state.precomputed.distanceEntries;
    const odoState = OdometerIntelligence?.getOdometerState
      ? OdometerIntelligence.getOdometerState(events, { asOf: garageNowEpoch() })
      : null;
    const odometers = odoState?.acceptedOdometerEvents || events.filter(e=>e.type==='odometer' && e.odometerKm!==null && e.odometerKm!==undefined && Number.isFinite(Number(e.odometerKm))).sort((a,b)=>eventEpoch(a)-eventEpoch(b));
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
        const historicalTrips = events.filter(trip => trip.type === 'trip' && Number(trip.distanceKm) > 0 && eventEpoch(trip) <= firstTime && (!Number.isFinite(purchaseTime) || eventEpoch(trip) >= purchaseTime));
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
  function eventDateKey(event) {
    // Ignore cached Jalali labels: timestamps are the source of truth and are
    // formatted in Asia/Tehran consistently on every browser/device.
    return formatJalaliDate(event?.occurredAt || event?.date || event?.createdAt || '');
  }
  function formatEventDate(event) { return eventDateKey(event) || 'تاریخ نامشخص'; }
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
    const now = garageNow();
    const today = localDateString(now);
    if (period === 'hour') return Array.from({ length: 24 }, (_, i) => {
      const d = new Date(now.getTime() - (23 - i) * 3600000);
      const day = localDateString(d);
      const hour = PersianCalendar?.gregorianHourKey ? PersianCalendar.gregorianHourKey(d) : new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tehran', hour: '2-digit', hourCycle: 'h23' }).format(d);
      return `${day}T${hour}`;
    });
    if (period === 'day') return Array.from({ length: 30 }, (_, i) => PersianCalendar?.addGregorianDays ? PersianCalendar.addGregorianDays(today, i - 29) : (() => { const [y,m,d]=today.split('-').map(Number); const date=new Date(Date.UTC(y,m-1,d+i-29)); return date.toISOString().slice(0,10); })());
    if (period === 'week') {
      const [year, month, day] = today.split('-').map(Number);
      const utc = new Date(Date.UTC(year, month - 1, day));
      const mondayOffset = (utc.getUTCDay() + 6) % 7;
      const currentMonday = new Date(Date.UTC(year, month - 1, day - mondayOffset));
      return Array.from({ length: 12 }, (_, i) => {
        const value = new Date(currentMonday.getTime() - (11 - i) * 7 * 86400000);
        return value.toISOString().slice(0, 10);
      });
    }
    return previousPersianMonthKeys(currentPersianMonthKey(), 12);
  }
  function bucketForDate(value, period) {
    if (!value) return '';
    const raw = String(value).trim();
    const dateKey = /^\d{4}-\d{2}-\d{2}$/.test(raw)
      ? raw
      : (PersianCalendar?.gregorianDateKey ? PersianCalendar.gregorianDateKey(raw) : localDateString(new Date(raw)));
    if (!dateKey) return '';
    if (period === 'hour') {
      const hour = PersianCalendar?.gregorianHourKey ? PersianCalendar.gregorianHourKey(raw) : new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tehran', hour: '2-digit', hourCycle: 'h23' }).format(new Date(raw));
      return `${dateKey}T${hour}`;
    }
    if (period === 'day') return dateKey;
    if (period === 'month') return persianMonthKey(raw);
    const [year, month, day] = dateKey.split('-').map(Number);
    const utc = new Date(Date.UTC(year, month - 1, day));
    utc.setUTCDate(utc.getUTCDate() - (utc.getUTCDay() + 6) % 7);
    return `${utc.getUTCFullYear()}-${String(utc.getUTCMonth() + 1).padStart(2, '0')}-${String(utc.getUTCDate()).padStart(2, '0')}`;
  }

  function periodLabel(period) { return ({ hour: '۲۴ ساعت اخیر', day: '۳۰ روز اخیر', week: '۱۲ هفته اخیر', month: '۱۲ ماه اخیر' })[period] || '۱۲ ماه اخیر'; }
  function periodShortLabel(key, period) {
    if (period === 'hour') return key.slice(-2) + 'h';
    if (period === 'day') return key.slice(5);
    if (period === 'week') return key.slice(5);
    return persianMonthLabel(key);
  }
  function renderOverviewExtras() {
    const recent = state.events.slice().sort((a, b) => eventEpoch(b) - eventEpoch(a)).slice(0, 5);
    const recentNode = $('#recentEvents');
    if (recentNode) recentNode.innerHTML = recent.length ? recent.map(event => {
      const meta = [formatEventDate(event), event.actor || 'من', event.odometerKm != null ? `${formatNumber(event.odometerKm)} km` : ''].filter(Boolean).join(' · ');
      const amount = eventAmountToman(event);
      return `<div class="mini-row"><div class="mini-row-main"><div class="mini-row-title">${escapeHtml(eventTitle(event))}</div><div class="mini-row-desc">${escapeHtml([event.description, event.note, event.repairDescription, event.symptom].filter(Boolean).join(' · '))}</div><div class="mini-row-meta">${escapeHtml(meta)}</div></div><div class="mini-row-value">${amount > 0 ? `${escapeHtml(moneyText(amount))} تومان` : escapeHtml(event.type === 'fuel' && event.liters ? `${formatNumber(event.liters, 1)} لیتر` : '—')}</div></div>`;
    }).join('') : '<div class="empty-state">هنوز رویدادی ثبت نشده است.</div>';
    const alertsNode = $('#overviewAlerts');
    if (alertsNode) {
      const due = calculateDue(state.events, state.config, calculateOdometer(state.events));
      const unpaid = state.events.filter(event => event.type === 'fine' && !event.paid);
      const openIssues = state.events.filter(event => event.type === 'issue' && event.status !== 'fixed');
      const alerts = [
        ...due.slice(0, 4).map(item => ({ icon: item.overdue ? '⛔' : '⚠', title: item.label, detail: item.leftKm != null ? `${formatNumber(item.leftKm)} کیلومتر تا موعد` : item.leftDays != null ? `${formatNumber(item.leftDays)} روز تا موعد` : item.stage })),
        ...unpaid.slice(0, 2).map(item => ({ icon: '🚦', title: 'جریمه پرداخت‌نشده', detail: `${moneyText((Number(item.costRial) || 0) / 10)} تومان` })),
        ...openIssues.slice(0, 2).map(item => ({ icon: '🔧', title: eventTitle(item), detail: [item.description, item.note, item.repairDescription, item.symptom].filter(Boolean).join(' · ') || 'نیازمند پیگیری' }))
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
      if (month !== 'all' && eventPersianMonthKey(event) !== month) return false;
      if (actor !== 'all' && String(event.actor || 'من') !== actor) return false;
      if (text) {
        const haystack = [event.id, event.title, event.description, event.note, event.repairDescription, event.symptom, event.diagnosis, event.resolution, event.repairAction, event.actor, event.serviceLabel, event.componentName, event.brand, event.model, event.partNumber, event.expenseCategory, event.fineLocation, event.ticketNumber, event.ticketSerialNumber, event.ticketPaymentId, event.paymentReference, event.vehiclePlate, event.vehicleDescription, event.violationDescription, event.cameraCode, event.originalSms, event.reportedBalanceDate, event.speedLimitKph, event.recordedSpeedKph, event.odometerKm, event.liters, event.costRial].join(' ').toLocaleLowerCase('fa');
        if (!haystack.includes(text)) return false;
      }
      return true;
    }).sort((a, b) => eventEpoch(b) - eventEpoch(a));
    safeText('#resultCount', `${formatNumber(state.filtered.length)} رویداد`);
    safeText('#journalRange', state.filtered.length === state.events.length ? `${formatNumber(state.events.length)} رویداد از ${formatNumber(state.months.length)} ماه` : `${formatNumber(state.filtered.length)} مورد از ${formatNumber(state.events.length)} رویداد`);
    renderJournal();
  }
  function fuelEstimateForOdometerEvent(event) {
    if (!event || event.type !== 'odometer' || !state.fuelEngine?.estimateFuelTrip) return null;
    const purchaseKm = Number(state.config?.ownership?.purchaseOdometerKm ?? 428000);
    const dynamicDistance = state.costEngine?.calculateCurrentOdometerDelta
      ? state.costEngine.calculateCurrentOdometerDelta(state.events, event.id, purchaseKm)
      : Number(event.deltaSincePreviousKm);
    if (!(Number(dynamicDistance) > 0)) return null;
    // Always rebuild from the current refuel ledger. Older stored estimates are
    // deliberately ignored so a corrected/added fuel record updates every trip.
    return state.fuelEngine.estimateFuelTrip(state.events, Number(dynamicDistance), { ...(state.config?.fuelModel || {}), at: eventEpoch(event), tankCapacityLiters: Number(state.config?.fuelModel?.tankCapacityLiters) || 50 });
  }

  function eventDescriptionBlocks(event) {
    const fields = [
      ['شرح', event.description],
      ['پیامک اصلی راهور', event.originalSms],
      ['یادداشت تکمیلی', event.note],
      ['شرح تعمیر', event.repairDescription],
      ['علائم', event.symptom || event.symptoms],
      ['تشخیص', event.diagnosis],
      ['اقدام انجام‌شده', event.resolution || event.repairAction || event.workDone],
      ['توضیحات سرویس', event.serviceDetails || event.maintenanceNote],
      ['توضیحات خرابی', event.issueDetails || event.details],
      ['دلیل ثبت', event.reason || event.comment],
      ['توضیحات فاکتور', event.invoiceDescription || event.receiptDescription],
      ['نام جایگاه سوخت', event.stationName],
      ['متن ثبت اولیه', event.sourceText || event.sourceMessage]
    ];
    const seen = new Set();
    return fields.filter(([label, value]) => {
      const text = typeof value === 'string' ? value.trim() : '';
      if (!text || seen.has(text) || text === String(event.title || '').trim()) return false;
      seen.add(text); return true;
    }).map(([label, value]) => `<div class="event-entry-description-row"><b>${escapeHtml(label)}:</b><span>${escapeHtml(String(value).trim())}</span></div>`).join('');
  }

  function eventStructuredDetails(event) {
    const rows = [];
    const add = (label, value) => { if (value !== null && value !== undefined && value !== '') rows.push(`<span><b>${escapeHtml(label)}:</b> ${escapeHtml(String(value))}</span>`); };
    add('سرویس', event.serviceLabel);
    add('شناسه سرویس', event.serviceKey || event.serviceCatalogKey);
    add('قطعه', event.componentName || event.componentKey);
    add('گروه قطعه', event.componentCategory);
    add('نوع ثبت قطعه', event.componentMode);
    add('قطعه تعویض‌شده', event.componentReplaced === true ? 'بله' : null);
    add('برند', event.brand);
    add('مدل', event.model);
    add('کد فنی', event.partNumber);
    add('تعداد', event.quantity);
    add('دسته هزینه', event.expenseCategory);
    add('وضعیت', event.status === 'fixed' ? 'رفع‌شده' : event.status === 'open' ? 'باز' : event.status);
    add('وضعیت پرداخت', event.type === 'fine' ? (event.paid ? 'پرداخت‌شده' : 'پرداخت‌نشده') : null);
    if (event.type === 'fine' && state.fineEngine?.calculateFineTimeline) {
      const timeline = state.fineEngine.calculateFineTimeline(event, localDateString(garageNow()));
      add('مهلت پیگیری', timeline.deadlineDate || 'ندارد؛ دیرکرد خودکار فعال نیست');
      add('قاعده دیرکرد', timeline.eligibilityLabel);
      add('وضعیت مهلت', timeline.statusLabel);
      add('مبلغ احتمالی پس از دوبرابرشدن (غیررسمی)', timeline.potentialAmountRial == null ? null : `${moneyText(timeline.potentialAmountRial / 10)} تومان`);
    }
    add('شناسه قبض', event.ticketNumber);
    add('شماره سریال قبض', event.ticketSerialNumber);
    add('شناسه پرداخت قبض', event.ticketPaymentId);
    add('نوع قبض', event.ticketType);
    add('تاریخ شمسی پیامک', event.ticketDateJalali);
    add('محل تخلف', event.fineLocation);
    add('وسیله نقلیه', event.vehicleDescription);
    add('پلاک', event.vehiclePlate);
    add('کد دوربین', event.cameraCode);
    add('سرعت مجاز (km/h)', event.speedLimitKph);
    add('سرعت ثبت‌شده (km/h)', event.recordedSpeedKph);
    add('شناسه پرداخت', event.paymentReference);
    add('مانده تجمیعی جریمه‌های پرداخت‌نشده (ریال)', event.reportedUnpaidFineBalanceRial);
    add('تاریخ مانده تجمیعی', event.reportedBalanceDate);
    add('واحد مبلغ پیامک', event.amountCurrency);
    add('منبع ثبت جریمه', event.fineSource === 'road-police-sms' ? 'پیامک راهور' : event.fineSource);
    add('تاریخ پرداخت', event.paymentDate || event.paidAt);
    const amountToman = (rial, toman) => Number(rial) > 0 ? Number(rial) / 10 : Number(toman) > 0 ? Number(toman) : null;
    const officialFine = amountToman(event.officialCurrentAmountRial, event.officialCurrentAmountToman);
    const paidAmount = amountToman(event.paidAmountRial, event.paidAmountToman);
    const repairAmount = amountToman(event.repairCostRial, event.repairCostToman);
    const recordedAmount = amountToman(event.costRial || event.amountRial, event.costToman || event.amountToman);
    add('مبلغ رسمی جریمه', officialFine == null ? null : `${moneyText(officialFine)} تومان`);
    add('مبلغ پرداختی', paidAmount == null ? null : `${moneyText(paidAmount)} تومان`);
    add('هزینه تعمیر', repairAmount == null ? null : `${moneyText(repairAmount)} تومان`);
    add('مبلغ ثبت‌شده', recordedAmount == null ? null : `${moneyText(recordedAmount)} تومان`);
    add('راننده مسافت', event.distanceActor);
    add('لیتر سوخت', event.liters);
    add('باک کامل', event.type === 'fuel' ? (event.fullTank ? 'بله' : 'خیر / جزئی') : null);
    add('کیلومتر به‌صورت خودکار ثبت شد', event.odometerAutoAssigned ? 'بله' : null);
    add('زمان رفع خرابی', event.resolvedAt);
    if (event.specs && typeof event.specs === 'object') {
      for (const [key, value] of Object.entries(event.specs)) add(`مشخصات ${key}`, value);
    }
    return rows.length ? `<div class="event-entry-structured-details">${rows.join('')}</div>` : '';
  }
  function ownershipTripForOdometerEvent(event) {
    if (!event || event.type !== 'odometer' || !state.costEngine?.calculateVehicleCostModel || !state.costEngine?.calculateCurrentOdometerDelta) return null;
    const purchaseKm = Number(state.config?.ownership?.purchaseOdometerKm ?? 428000);
    const distanceKm = state.costEngine.calculateCurrentOdometerDelta(state.events, event.id, purchaseKm);
    if (!(Number(distanceKm) > 0)) return null;
    const model = state.costEngine.calculateVehicleCostModel(state.events, {
      fuelOptions: { tankCapacityLiters: Number(state.config?.fuelModel?.tankCapacityLiters) || 50 },
      purchaseOdometerKm: purchaseKm,
      currentOdometerKm: calculateOdometer(state.events),
      tripDistanceKm: distanceKm
    });
    return model?.trip ? { model, trip: model.trip, distanceKm } : null;
  }

  function renderJournal() {
    const node = $('#eventList'); if (!node) return;
    const rows = (state.filtered || state.events).slice(0, state.shown);
    const labels = { odometer: 'کیلومترشمار', trip: 'مسافت', fuel: 'سوخت‌گیری', service: 'سرویس', part: 'قطعه', expense: 'هزینه', fine: 'جریمه', wash: 'کارواش', issue: 'خرابی', repair: 'تعمیر', note: 'یادداشت' };
    const icons = { odometer: '⌁', trip: '↗', fuel: '⛽', service: '⚙', part: '🔩', expense: '◈', fine: '🚦', wash: '✦', issue: '⚠', repair: '🔧', note: '≡' };
    node.innerHTML = rows.length ? rows.map(event => {
      const date = formatEventDate(event) || 'تاریخ نامشخص';
      const descriptions = eventDescriptionBlocks(event) || '<div class="event-entry-description-row"><b>شرح:</b><span>بدون توضیح ثبت‌شده</span></div>';
      const structured = eventStructuredDetails(event);
      const metrics = [];
      if (event.odometerKm != null) metrics.push(`${formatNumber(event.odometerKm)} km`);
      const dynamicDelta = event.type === 'odometer' && state.costEngine?.calculateCurrentOdometerDelta
        ? state.costEngine.calculateCurrentOdometerDelta(state.events, event.id, Number(state.config?.ownership?.purchaseOdometerKm ?? 428000))
        : Number(event.deltaSincePreviousKm);
      if (dynamicDelta != null && Number(dynamicDelta) > 0) metrics.push(`${formatNumber(dynamicDelta)} km از ثبت قبلی · راننده: ${event.distanceActor || event.actor || 'من'}`);
      if (event.distanceKm != null && Number(event.distanceKm) > 0) metrics.push(`${formatNumber(event.distanceKm, 1)} km مسافت`);
      if (event.liters != null && Number(event.liters) > 0) metrics.push(`${formatNumber(event.liters, 1)} لیتر`);
      const amount = expenseAmount(event);
      if (amount > 0) metrics.push(`${moneyText(amount / 10)} تومان`);
      if (event.actor) metrics.push(`👤 ${event.actor}`);
      if (event.paid === false && event.type === 'fine') metrics.push('پرداخت‌نشده');
      const fuelEstimate = fuelEstimateForOdometerEvent(event);
      const fuelBasis = `${formatNumber(fuelEstimate?.sampleRefuels || 0)} سوخت‌گیری · ${formatNumber(fuelEstimate?.sampleIntervals || 0)} بازه${fuelEstimate?.sampleDistanceKm ? ` · ${formatNumber(fuelEstimate.sampleDistanceKm)} km داده` : ''}`;
      const fuelEstimateCard = fuelEstimate ? `<div class="event-fuel-estimate confidence-${escapeAttr(fuelEstimate.confidenceKey || 'low')}"><span class="event-fuel-estimate-icon">⛽</span><div class="event-fuel-estimate-copy"><b>هزینهٔ بنزین این پیمایش · باز‌محاسبه‌شده</b><small>${formatNumber(fuelEstimate.consumptionLPer100, 2)} لیتر/۱۰۰ km · بازه ${formatNumber(fuelEstimate.consumptionMinLPer100, 1)} تا ${formatNumber(fuelEstimate.consumptionMaxLPer100, 1)}</small><small>${escapeHtml(fuelEstimate.confidenceLabel || 'برآورد اولیه')} · ${escapeHtml(fuelBasis)}</small></div><strong>${formatNumber(fuelEstimate.minFuelLiters, 2)}–${formatNumber(fuelEstimate.maxFuelLiters, 2)} لیتر</strong>${fuelEstimate.costToman == null ? '' : `<span class="event-fuel-estimate-cost">≈ ${moneyText(fuelEstimate.minCostToman)}–${moneyText(fuelEstimate.maxCostToman)} تومان<small>میانگین ${moneyText(fuelEstimate.costToman)} تومان</small></span>`}</div>` : ''; 
      const ownershipEstimate = ownershipTripForOdometerEvent(event);
      const ownershipTrip = ownershipEstimate?.trip;
      const ownershipFmt = value => value == null ? '—' : `${moneyText(value)} تومان`;
      const ownershipCostCard = ownershipTrip ? `<div class="event-ownership-cost confidence-${escapeAttr(ownershipTrip.fuelConfidenceKey || 'low')}"><div class="event-ownership-cost-heading"><b>هزینهٔ جامع این سفر · بنزین + استهلاک + جاری</b><small>${formatNumber(ownershipEstimate.distanceKm)} km · برآورد بر پایهٔ کل سوابق فعلی</small></div><div class="event-ownership-cost-parts"><span>⛽ بنزین: ${ownershipFmt(ownershipTrip.fuelCostToman)}</span><span>🛠️ ذخیرهٔ استهلاک: ${ownershipFmt(ownershipTrip.wearReserveToman)}</span><span>◈ سایر هزینه‌های جاری: ${ownershipFmt(ownershipTrip.otherRunningReserveToman)}</span></div><div class="event-ownership-cost-total"><small>جمع برآورد هزینهٔ عملیاتی سفر · بدون جریمه</small><strong>${ownershipFmt(ownershipTrip.estimatedOperatingCostToman)}</strong><small>${ownershipTrip.estimatedOperatingCostPerKmToman == null ? 'هزینهٔ هر کیلومتر: دادهٔ کافی نیست' : `${ownershipFmt(ownershipTrip.estimatedOperatingCostPerKmToman)} به‌ازای هر کیلومتر`}</small></div></div>` : '';
      return `<article class="event-entry" data-event-id="${escapeAttr(event.id)}"><div class="event-entry-icon">${icons[event.type] || '•'}</div><div class="event-entry-main"><div class="event-entry-head"><b>${escapeHtml(eventTitle(event))}</b><span class="event-type-pill">${escapeHtml(labels[event.type] || event.type || 'رویداد')}</span></div><div class="event-entry-descriptions">${descriptions}</div>${structured}<small>${escapeHtml(date)}${event.time ? ` · ${escapeHtml(event.time)}` : ''} · ${escapeHtml(String(event.id || '').slice(0, 8))}</small><div class="event-entry-metrics">${metrics.map(item => `<span>${escapeHtml(item)}</span>`).join('')}</div>${fuelEstimateCard}${ownershipCostCard}</div></article>`;
    }).join('') : '<div class="empty-state">با فیلتر فعلی رویدادی پیدا نشد. فیلترها را تغییر بده یا داده‌های تلگرام را بررسی کن.</div>';
    const more = $('#loadMoreButton'); if (more) more.hidden = rows.length >= (state.filtered || state.events).length;
  }
  function renderFuelPage() {
    const fuel = state.events.filter(event => event.type === 'fuel').sort((a, b) => eventEpoch(a) - eventEpoch(b));
    const totalLiters = sum(fuel, event => event.liters);
    const totalCost = sum(fuel, event => event.costRial);
    const fuelOptions = { ...(state.config?.fuelModel || {}), tankCapacityLiters: Number(state.config?.fuelModel?.tankCapacityLiters) || 50 };
    const model = state.fuelEngine?.calculateFuelModel ? state.fuelEngine.calculateFuelModel(state.events, fuelOptions) : null;
    safeText('#fuelPageLiters', formatNumber(totalLiters, 1));
    safeText('#fuelPageLitersFoot', `${formatNumber(fuel.length)} سوخت‌گیری ثبت‌شده`);
    safeText('#fuelPageCost', compactMoney(totalCost / 10));
    safeText('#fuelPageCostFoot', 'مجموع هزینهٔ ثبت‌شده سوخت');
    safeText('#fuelPageStops', formatNumber(fuel.length));
    safeText('#fuelPageStopsFoot', fuel.length ? `${formatNumber(fuel.filter(event => event.fullTank).length)} بار باک کامل · ${formatNumber(fuel.filter(event => !event.fullTank).length)} جزئی` : 'هنوز سوخت‌گیری ثبت نشده است');
    const intervals = model?.acceptedIntervals || [];
    const average = model?.consumptionLPer100 ?? null;
    safeText('#fuelPageEfficiency', average == null ? '—' : formatNumber(average, 2));
    safeText('#fuelPageEfficiencyFoot', average == null ? 'حداقل دو سوخت‌گیری با کیلومتر معتبر و فاصلهٔ کافی لازم است.' : `${model.confidenceLabel} · بازه ${formatNumber(model.consumptionMinLPer100, 1)} تا ${formatNumber(model.consumptionMaxLPer100, 1)} · ${formatNumber(model.sampleDistanceKm)} km · ${formatNumber(model.odometerReadingCount)} قرائت کیلومتر`);
    safeText('#fuelWeightedAverage', average == null ? '—' : `${formatNumber(average, 2)} L/100km · ${formatNumber(model.consumptionMinLPer100, 1)}–${formatNumber(model.consumptionMaxLPer100, 1)}`);
    const months = previousPersianMonthKeys(currentPersianMonthKey(), 8);
    chartBars('#fuelOnlyChart', months.map(key => ({ label: key, shortLabel: persianMonthLabel(key), value: sum(fuel.filter(event => eventPersianMonthKey(event) === key), event => event.liters) })), value => `${formatNumber(value, 1)} L`, 'هنوز سوخت‌گیری ثبت نشده است.');
    chartBars('#fuelConsumptionChart', intervals.slice(-10).map(item => ({ label: item.toDate, shortLabel: item.toDate, value: item.rate })), value => `${formatNumber(value, 2)}`, 'برای تخمین اولیه، حداقل دو سوخت‌گیری با کیلومتر معتبر و حداقل ۱۰۰ km فاصله لازم است.');
    const list = $('#fuelEventList');
    if (list) list.innerHTML = fuel.length ? fuel.slice().reverse().slice(0, 12).map(event => {
      const unitPrice = Number(event.liters) > 0 && Number(event.costRial) > 0 ? Number(event.costRial) / Number(event.liters) / 10 : null;
      return `<div class="mini-row"><div class="mini-row-main"><div class="mini-row-title">${escapeHtml(formatEventDate(event))} · ${formatNumber(Number(event.liters) || 0, 1)} لیتر</div><div class="mini-row-meta">${event.odometerKm != null ? `${formatNumber(event.odometerKm)} km · ` : ''}${event.fullTank ? 'باک کامل · ' : 'سوخت‌گیری جزئی · '}${escapeHtml(event.actor || 'من')}${unitPrice == null ? '' : ` · ${formatNumber(unitPrice)} تومان/لیتر`}</div></div><div class="mini-row-value">${moneyText((Number(event.costRial) || 0) / 10)} تومان</div></div>`;
    }).join('') : '<div class="empty-state">سوخت‌گیری ثبت نشده است.</div>';
    const history = $('#fuelConsumptionHistory');
    if (history) history.innerHTML = intervals.length ? intervals.slice().reverse().map(item => {
      const exact = item.method === 'full-to-full';
      const range = item.minRate != null && item.maxRate != null && Math.abs(item.maxRate - item.minRate) > 0.01
        ? `<small>بازهٔ ممکن: ${formatNumber(item.minRate, 2)} تا ${formatNumber(item.maxRate, 2)} L/100km</small>` : '';
      const label = exact ? 'باک‌به‌باک دقیق' : 'موازنهٔ سطح بنزین باک · تخمینی';
      return `<div class="fuel-measurement-row ${exact ? 'is-measured' : 'is-estimated'}"><b>${escapeHtml(item.fromDate)} ← ${escapeHtml(item.toDate)}<small>${label} · ${formatNumber(item.refuelCount)} ثبت سوخت</small>${range}</b><span>${formatNumber(item.distanceKm)} km</span><span>${formatNumber(item.minLiters ?? item.liters, 1)}–${formatNumber(item.maxLiters ?? item.liters, 1)} L</span><strong>${formatNumber(item.rate, 2)} L/100km</strong></div>`;
    }).join('') : '<div class="empty-state">برای شروع محاسبه، حداقل دو سوخت‌گیری همراه با کیلومتر معتبر و ۱۰۰ کیلومتر فاصله ثبت کن؛ لازم نیست باک کامل باشد.</div>';
    const diagnostics = $('#fuelModelDiagnostics');
    if (diagnostics) {
      const partialCount = Number(model?.partialOnlyRefuelCount) || 0;
      const rapidCount = Number(model?.rapidRefuelPairCount) || 0;
      const invalidCount = Number(model?.invalidRefuelCount) || 0;
      diagnostics.textContent = model?.hasEstimate
        ? `${model.method === 'full-to-full' ? 'مدل اصلی بر پایهٔ باک‌به‌باک دقیق است' : 'مدل با سوخت‌گیری‌های جزئی فعال شده است'} · ${formatNumber(model.sampleDistanceKm)} کیلومتر دادهٔ سوخت · ${formatNumber(model.odometerReadingCount)} قرائت معتبر کیلومتر (${formatNumber(model.odometerReadingsInFuelWindow)} مورد در بازهٔ سوخت) · ${formatNumber(model.odometerDistanceKm)} km پیمایش از قرائت‌ها · مصرف ${formatNumber(model.consumptionMinLPer100, 2)} تا ${formatNumber(model.consumptionMaxLPer100, 2)} L/100km · ظرفیت مبنا ${formatNumber(model.tankCapacityLiters)} لیتر. ${rapidCount ? `${formatNumber(rapidCount)} جفت مراجعهٔ نزدیک ثبت شده؛ همهٔ سوخت‌گیری‌ها در موازنه لحاظ شده‌اند و نزدیکی به‌معنی خالی‌شدن باک نیست. ` : ''}${invalidCount ? `${formatNumber(invalidCount)} ثبت غیرقابل استفاده به‌علت مقدار نامعتبر یا ظرفیت/کیلومتر بررسی‌نشده‌اند.` : ''}`
        : `${formatNumber(partialCount)} سوخت‌گیری جزئی ثبت شده است. ${formatNumber(model?.odometerReadingCount || 0)} قرائت کیلومتر نیز برای تشخیص کارکرد، فاصله‌ها و استنباط کیلومترهای خالی/خودکار بررسی می‌شود. برای محاسبهٔ مصرف لازم نیست باک کامل کنی؛ دو یا چند سوخت‌گیری با کیلومتر معتبر و حداقل ۱۰۰ کیلومتر فاصله لازم است. هرچه سوخت‌گیری و قرائت کیلومتر معتبر بیشتری ثبت شود، پایش مسافت و امکان استنباط بهتر می‌شود؛ اما قرائت کیلومتر به‌تنهایی مقدار لیتر مصرف‌شده را مشخص نمی‌کند. ${invalidCount ? `${formatNumber(invalidCount)} سوخت‌گیری نامعتبر کنار گذاشته شده است.` : ''}`;
    }
    renderFuelTripEstimator();
  }
  function renderFuelTripEstimator() {
    const rateNode = $('#fuelEstimateRate');
    if (!rateNode) return;
    const fuelOptions = { ...(state.config?.fuelModel || {}), tankCapacityLiters: Number(state.config?.fuelModel?.tankCapacityLiters) || 50 };
    const model = state.fuelEngine?.calculateFuelModel ? state.fuelEngine.calculateFuelModel(state.events, fuelOptions) : null;
    const distance = Number($('#fuelTripDistanceInput')?.value);
    const estimate = state.fuelEngine?.estimateFuelTrip && Number.isFinite(distance) && distance > 0
      ? state.fuelEngine.estimateFuelTrip(state.events, distance, fuelOptions)
      : null;
    safeText('#fuelEstimateRate', model?.hasEstimate ? `${formatNumber(model.consumptionLPer100, 2)} L/100km · ${formatNumber(model.consumptionMinLPer100, 1)}–${formatNumber(model.consumptionMaxLPer100, 1)}` : 'در انتظار داده');
    safeText('#fuelEstimateConfidence', model?.confidenceLabel || 'حداقل دو سوخت‌گیری با کیلومتر معتبر و فاصلهٔ ۱۰۰ کیلومتر لازم است؛ باک کامل الزامی نیست.');
    safeText('#fuelEstimateBasis', model?.hasEstimate ? `${formatNumber(model.sampleIntervals)} بازه · ${formatNumber(model.sampleDistanceKm)} km · ${formatNumber(model.refuelCount)} سوخت‌گیری · ${formatNumber(model.odometerReadingCount)} قرائت کیلومتر · ${model.method === 'full-to-full' ? 'اندازه‌گیری دقیق' : 'موازنهٔ جزئی با سطح باک نامعلوم'}` : 'سوخت‌گیری جزئی با کیلومتر دقیق را ثبت کن؛ برای شروع نیازی به پرکردن کامل باک نیست.');
    safeText('#fuelEstimateLiters', estimate ? `${formatNumber(estimate.minFuelLiters, 2)} تا ${formatNumber(estimate.maxFuelLiters, 2)} لیتر · میانگین ${formatNumber(estimate.fuelLiters, 2)}` : '—');
    safeText('#fuelEstimateCost', estimate?.costToman == null ? '—' : `${moneyText(estimate.minCostToman)} تا ${moneyText(estimate.maxCostToman)} تومان · میانگین ${moneyText(estimate.costToman)} تومان`);
    safeText('#fuelEstimatePrice', estimate?.priceTomanPerLiter == null ? 'نرخ قیمت ثبت نشده' : `${formatNumber(estimate.priceTomanPerLiter)} تومان/لیتر · میانگین وزنی ۵ خرید اخیر`);
  }
  function renderVehicleSpecs() {
    const vehicle = state.config?.vehicle || {};
    const vehicleName = vehicle.label || `${vehicle.make || 'Peugeot'} ${vehicle.model || '206 SD'}`;
    safeText('#specVehicleName', vehicleName);
    safeText('#specVehicleNameHero', `${vehicle.make || 'Peugeot'} ${vehicle.model || '206 SD'}`);
    safeText('#specVehicleYear', vehicle.modelYear ? formatNumber(vehicle.modelYear) : '—');
    safeText('#specEngineIdentity', vehicle.engine || 'کد موتور در تنظیمات خودرو ثبت نشده است');
    safeText('#specFuelType', vehicle.fuel === 'Petrol' ? 'بنزین' : (vehicle.fuel || '—'));
    const badge = $('#specEngineCaution');
    if (badge) badge.textContent = /TU3/i.test(String(vehicle.engine || ''))
      ? 'خانوادهٔ TU3 در تنظیمات فعلی ثبت شده؛ برای تعیین واریانت دقیق، کد موتور/تیپ مدارک را تطبیق بده.'
      : 'مشخصات موتور تا زمان تطبیق با کد فنی قطعی نیست.';
  }
  function renderExpensePage() {
    const rows = state.events.filter(isActualExpense).slice().sort((a, b) => eventEpoch(b) - eventEpoch(a));
    const total = sum(rows, expenseAmount) / 10;
    const month = currentPersianMonthKey();
    const monthly = sum(rows.filter(event => persianMonthKey(expenseDate(event)) === month), expenseAmount) / 10;
    const largest = rows.slice().sort((a, b) => expenseAmount(b) - expenseAmount(a))[0];
    const categories = {};
    rows.forEach(event => { const key = String(event.expenseCategory || (event.type === 'fuel' ? 'سوخت' : event.type === 'fine' ? 'جریمه پرداخت‌شده' : typeLabels[event.type] || event.type)); categories[key] = (categories[key] || 0) + expenseAmount(event) / 10; });
    safeText('#expensePageTotal', compactMoney(total));
    safeText('#expensePageTotalFoot', `${formatNumber(rows.length)} رویداد دارای هزینه واقعی`);
    safeText('#expensePageMonthly', compactMoney(monthly));
    safeText('#expensePageMonthlyFoot', `${persianMonthLabel(month)} · ${month}`);
    safeText('#expensePageLargest', largest ? compactMoney(expenseAmount(largest) / 10) : '—');
    safeText('#expensePageLargestFoot', largest ? eventTitle(largest) : 'هزینه‌ای ثبت نشده است');
    safeText('#expensePageCategories', formatNumber(Object.keys(categories).length));
    const months = previousPersianMonthKeys(currentPersianMonthKey(), 8);
    chartBars('#expenseMonthlyChart', months.map(key => ({ label: key, shortLabel: persianMonthLabel(key), value: sum(rows.filter(event => persianMonthKey(expenseDate(event)) === key), expenseAmount) / 10 })), value => compactMoney(value), 'هنوز دادهٔ مالی ثبت نشده است.');
    const catNode = $('#expenseCategoryChart');
    const catRows = Object.entries(categories).sort((a, b) => b[1] - a[1]);
    if (catNode) {
      const max = Math.max(1, ...catRows.map(row => row[1]));
      catNode.innerHTML = catRows.length ? catRows.slice(0, 12).map(([name, value]) => `<div class="category-breakdown-row"><div><b>${escapeHtml(name)}</b><span>${moneyText(value)} تومان</span></div><div class="category-track"><i style="width:${(value / max * 100).toFixed(1)}%"></i></div></div>`).join('') : '<div class="empty-state">با ثبت هزینه‌ها دسته‌ها نمایش داده می‌شوند.</div>';
    }
    const list = $('#expenseEventList');
    if (list) list.innerHTML = rows.length ? rows.slice(0, 20).map(event => `<div class="mini-row"><div class="mini-row-main"><div class="mini-row-title">${escapeHtml(eventTitle(event))}</div><div class="mini-row-desc">${escapeHtml([event.description, event.note].filter(Boolean).join(' · '))}</div><div class="mini-row-meta">${escapeHtml(formatEventDate(event))} · ${escapeHtml(event.expenseCategory || event.actor || '—')}</div></div><div class="mini-row-value">${moneyText(expenseAmount(event) / 10)} تومان</div></div>`).join('') : '<div class="empty-state">هزینه‌ای ثبت نشده است.</div>';
    renderOwnershipCostModel();
  }

  function renderOwnershipCostModel() {
    if (!$('#ownershipCostPerKm')) return;
    const distanceInput = Number($('#ownershipTripDistanceInput')?.value);
    const tripDistance = Number.isFinite(distanceInput) && distanceInput > 0 ? Math.min(distanceInput, 5000) : 100;
    const model = state.costEngine?.calculateVehicleCostModel
      ? state.costEngine.calculateVehicleCostModel(state.events, {
          fuelOptions: { tankCapacityLiters: Number(state.config?.fuelModel?.tankCapacityLiters) || 50 },
          purchaseOdometerKm: Number(state.config?.ownership?.purchaseOdometerKm ?? 428000),
          currentOdometerKm: calculateOdometer(state.events),
          tripDistanceKm: tripDistance
        }) : null;
    if (!model) return;
    const fmt = value => value == null ? '—' : `${moneyText(value)} تومان`;
    safeText('#ownershipCostTotal', fmt(model.totalRecordedToman));
    safeText('#ownershipCostPerKm', model.operatingCostPerKmToman == null ? '—' : `${moneyText(model.operatingCostPerKmToman)} تومان/km`);
    safeText('#ownershipRecordedCostPerKm', model.recordedOperatingCostPerKmToman == null ? '—' : `${moneyText(model.recordedOperatingCostPerKmToman)} تومان/km`);
    safeText('#ownershipWearPerKm', fmt(model.wearCostPerKmToman));
    safeText('#ownershipAllRecordedCostPerKm', model.allRecordedCostPerKmToman == null ? '—' : `${moneyText(model.allRecordedCostPerKmToman)} تومان/km`);
    safeText('#ownershipCostDistance', `${formatNumber(model.distanceKm, 1)} km · ${model.distanceBasis}`);
    safeText('#ownershipFuelHistorical', fmt(model.totalFuelToman));
    safeText('#ownershipWearHistorical', fmt(model.totalWearToman));
    safeText('#ownershipOtherHistorical', fmt(model.totalOtherToman));
    safeText('#ownershipFinesHistorical', fmt(model.totalPaidFinesToman));
    safeText('#ownershipFinesUnpaid', fmt(model.unpaidFinesToman));
    safeText('#ownershipCostCoverage', `${formatNumber(model.includedCostCount)} مبلغ وارد محاسبه · ${formatNumber(model.unpricedEventCount)} رویداد بدون مبلغ · ${formatNumber(model.skippedGroupedSummaryCount)} جمع تکراری گروه تعمیر حذف شد`);
    safeText('#ownershipTripHeading', `${formatNumber(tripDistance)} کیلومتر`);
    safeText('#ownershipTripFuel', model.trip?.fuelCostToman == null ? 'دادهٔ سوخت کافی نیست' : fmt(model.trip.fuelCostToman));
    safeText('#ownershipTripWear', model.trip?.wearReserveToman == null ? '—' : fmt(model.trip.wearReserveToman));
    safeText('#ownershipTripOther', model.trip?.otherRunningReserveToman == null ? '—' : fmt(model.trip.otherRunningReserveToman));
    safeText('#ownershipTripTotal', model.trip?.estimatedOperatingCostToman == null ? '—' : fmt(model.trip.estimatedOperatingCostToman));
    safeText('#ownershipTripPerKm', model.trip?.estimatedOperatingCostPerKmToman == null ? 'برای محاسبه دادهٔ بیشتری لازم است' : `${fmt(model.trip.estimatedOperatingCostPerKmToman)} به‌ازای هر کیلومتر`);
    const price = model.trip?.fuelPriceTomanPerLiter;
    safeText('#ownershipFuelRate', price == null ? 'نرخ ثبت‌شده پیدا نشد' : `${formatNumber(price, 0)} تومان/لیتر · نرخ موزون سوخت‌گیری‌های اخیر`);
    safeText('#ownershipCostFormula', `بنزین هر km = ${model.fuelCostPerKmToman == null ? '—' : fmt(model.fuelCostPerKmToman)} (${model.fuelCostPerKmBasis})؛ استهلاک/نگهداری هر km = ${fmt(model.wearCostPerKmToman)}؛ هزینهٔ عملیاتی مدل‌شده هر km = ${(model.operatingCostPerKmToman == null ? '—' : fmt(model.operatingCostPerKmToman))}. میانگین واقعی پرداخت‌های ثبت‌شده هر km جداست. جریمه‌های پرداخت‌شده در تاریخچه می‌آیند اما در سفر پیش‌بینی‌شده سرشکن نمی‌شوند.`);
  }
  function renderTrafficDetails() {
    const unpaid = state.events.filter(event => event.type === 'fine' && !event.paid).sort((a, b) => eventEpoch(b) - eventEpoch(a));
    const issues = state.events.filter(event => event.type === 'issue' && event.status !== 'fixed').sort((a, b) => eventEpoch(b) - eventEpoch(a));
    const unpaidNode = $('#unpaidFinesList');
    if (unpaidNode) unpaidNode.innerHTML = unpaid.length ? unpaid.map(event => `<div class="mini-row"><div class="mini-row-main"><div class="mini-row-title">${escapeHtml(event.description || 'جریمه ثبت‌شده')}</div><div class="mini-row-meta">${escapeHtml(formatEventDate(event))}${event.ticketNumber ? ` · قبض ${escapeHtml(event.ticketNumber)}` : ''}</div></div><div class="mini-row-value">${moneyText((Number(event.costRial) || 0) / 10)} تومان</div></div>`).join('') : '<div class="empty-state">جریمه پرداخت‌نشده‌ای ثبت نشده است.</div>';
    const issueNode = $('#openIssuesList');
    if (issueNode) issueNode.innerHTML = issues.length ? issues.map(event => `<div class="mini-row"><div class="mini-row-main"><div class="mini-row-title">${escapeHtml(eventTitle(event))}</div><div class="mini-row-desc">${escapeHtml(event.description || event.symptom || '')}</div><div class="mini-row-meta">${escapeHtml(formatEventDate(event))} · ${escapeHtml(event.actor || 'من')}</div></div><div class="mini-row-value">باز</div></div>`).join('') : '<div class="empty-state">خرابی باز ثبت نشده است.</div>';
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
    const fuelModel = state.fuelEngine?.calculateFuelModel
      ? state.fuelEngine.calculateFuelModel(state.events, { ...(state.config?.fuelModel || {}), tankCapacityLiters: Number(state.config?.fuelModel?.tankCapacityLiters) || 50 })
      : null;
    safeText('#fuelInsight', fuelModel?.hasEstimate
      ? `مدل از ${formatNumber(fuelModel.refuelCount)} سوخت‌گیری و ${formatNumber(fuelModel.odometerReadingCount)} قرائت کیلومتر (با ${formatNumber(fuelModel.odometerDistanceKm)} کیلومتر پیمایش ثبت‌شده) استفاده می‌کند؛ بازهٔ سوخت ${formatNumber(fuelModel.sampleDistanceKm)} کیلومتر است. مصرف میانی ${formatNumber(fuelModel.consumptionLPer100, 2)} و بازهٔ ممکن ${formatNumber(fuelModel.consumptionMinLPer100, 2)} تا ${formatNumber(fuelModel.consumptionMaxLPer100, 2)} لیتر در ۱۰۰ کیلومتر است؛ باک کامل شرط محاسبه نیست.`
      : 'با ثبت حداقل دو سوخت‌گیری جزئی دارای کیلومتر معتبر و حداقل ۱۰۰ کیلومتر فاصله، موازنهٔ سطح بنزین فعال می‌شود؛ باک کامل فقط یک نقطهٔ مرجع دقیق‌تر است.');
    const topCategory = Object.entries(categories).sort((a,b)=>b[1]-a[1])[0];
    safeText('#topCostInsight', topCategory ? `بیشترین هزینه مربوط به ${topCategory[0]} با ${moneyText(topCategory[1])} تومان است.` : 'در بازهٔ انتخابی هزینه‌ای ثبت نشده است.');
    const topDriver = Object.entries(byActorDistance).sort((a,b)=>b[1]-a[1])[0];
    safeText('#driveInsight', topDriver ? `${topDriver[0]} با ${formatNumber(topDriver[1], 1)} کیلومتر بیشترین مسافت قابل انتساب را در این بازه دارد.` : 'با ثبت چند کیلومترشمار یا مسافت، الگوی رانندگی نمایش داده می‌شود.');
  }
  function exportCsvRows(rows, filename) {
    const keys = ['id','type','title','description','actor','note','occurredAt','jalaliDate','date','time','odometerKm','previousOdometerKm','deltaSincePreviousKm','distanceKm','liters','costRial','fuelEstimateLiters','fuelEstimateCostRial','fuelEstimateMinCostRial','fuelEstimateMaxCostRial','fuelEstimateConfidenceLabel','fuelEstimateLPer100','fuelEstimateMinLPer100','fuelEstimateMaxLPer100','fuelEstimateMinLiters','fuelEstimateMaxLiters','fuelEstimatePriceTomanPerLiter','fuelEstimateConfidence','fuelEstimateSampleRefuels','fuelEstimateSampleIntervals','fuelEstimateSampleDistanceKm','fuelEstimateMethod','serviceKey','serviceCatalogKey','serviceLabel','componentKey','componentName','componentCategory','componentMode','componentReplaced','brand','model','partNumber','specs','quantity','expenseCategory','repairGroupId','paid','ticketDate','deadlineDate','appealed','appealDecisionDate','ticketNumber','ticketSerialNumber','ticketPaymentId','ticketType','fineLocation','vehicleDescription','vehiclePlate','violationDescription','ticketDateJalali','speedLimitKph','recordedSpeedKph','cameraCode','reportedUnpaidFineBalanceRial','reportedBalanceDate','amountCurrency','fineSource','originalSms','officialCurrentAmountRial','paidAmountRial','paidAt','paymentDate','paymentReference','repairCostRial','resolvedAt','repairDescription','status','fullTank','updatedAt','revision'];
    const csv = [keys.join(','), ...rows.map(event => keys.map(key => csvCell(event[key])).join(','))].join('\\r\\n');
    downloadBlob(filename, '\\uFEFF' + csv, 'text/csv;charset=utf-8');
  }
  function exportCsvAll() {
    if (!state.events.length) { showToast('سوابقی برای خروجی وجود ندارد.'); return; }
    exportCsvRows(state.events, `206-garage-all-${localDateString(garageNow())}.csv`); showToast('خروجی کامل CSV آماده شد.');
  }
  function exportJsonAll() {
    if (!state.events.length) { showToast('سوابقی برای خروجی وجود ندارد.'); return; }
    downloadBlob(`206-garage-all-${localDateString(garageNow())}.json`, JSON.stringify({ exportedAt: garageNow().toISOString(), vehicle: state.config?.vehicle || {}, config: state.config, months: state.months, events: state.events }, null, 2), 'application/json;charset=utf-8');
    showToast('پشتیبان کامل JSON آماده شد.');
  }
  function exportExpensesCsv() {
    const rows = state.events.filter(isActualExpense);
    if (!rows.length) { showToast('هزینه‌ای برای خروجی وجود ندارد.'); return; }
    exportCsvRows(rows, `206-garage-expenses-${localDateString(garageNow())}.csv`); showToast('خروجی هزینه‌ها آماده شد.');
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
    if (OdometerIntelligence?.eventTimelineEpoch) return OdometerIntelligence.eventTimelineEpoch(event);
    const value = event?.occurredAt || (event?.date ? `${String(event.date).slice(0,10)}T${event?.time || '12:00'}:00+03:30` : event?.createdAt);
    const t = Date.parse(value || ''); return Number.isFinite(t) ? t : 0;
  }
  function localDateString(date) {
    if (PersianCalendar?.gregorianDateKey) return PersianCalendar.gregorianDateKey(date);
    const parts = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tehran',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
    const p = Object.fromEntries(parts.filter(x=>x.type!=='literal').map(x=>[x.type,x.value])); return `${p.year}-${p.month}-${p.day}`;
  }
  const persianCalendarFormatter = new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit' });
  const persianMonthNames = ['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'];
  function persianMonthKey(value) {
    if (PersianCalendar?.monthKey) return PersianCalendar.monthKey(value);
    if (!value) return '';
    const raw = value instanceof Date ? value : String(value).trim();
    const date = raw instanceof Date ? raw : /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T12:00:00+03:30`) : new Date(raw);
    if (!Number.isFinite(date.getTime())) return '';
    const parts = Object.fromEntries(persianCalendarFormatter.formatToParts(date).filter(part => part.type !== 'literal' && part.type !== 'era').map(part => [part.type, part.value]));
    return parts.year && parts.month ? `${parts.year}-${String(parts.month).padStart(2, '0')}` : '';
  }
  function eventPersianMonthKey(event) {
    return PersianCalendar?.monthKeyFromEvent ? PersianCalendar.monthKeyFromEvent(event) : persianMonthKey(event?.occurredAt || event?.date || event?.createdAt);
  }
  function currentPersianMonthKey(now = garageNow()) { return persianMonthKey(now); }
  function previousPersianMonthKeys(lastKey, count) {
    if (PersianCalendar?.previousMonthKeys) return PersianCalendar.previousMonthKeys(lastKey, count);
    const [yearValue, monthValue] = String(lastKey || '').split('-').map(Number);
    if (!Number.isInteger(yearValue) || !Number.isInteger(monthValue) || monthValue < 1 || monthValue > 12) return [];
    let year = yearValue, month = monthValue;
    const result = [];
    for (let index = 0; index < Math.max(0, count); index++) { result.unshift(`${year}-${String(month).padStart(2, '0')}`); month--; if (month < 1) { month = 12; year--; } }
    return result;
  }
  function persianMonthLabel(key) {
    if (PersianCalendar?.monthLabel) return PersianCalendar.monthLabel(key, formatNumber);
    const [year, month] = String(key || '').split('-').map(Number);
    if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year)) return String(key || 'ماه نامشخص');
    return `${persianMonthNames[month - 1]} ${formatNumber(year)}`;
  }
  function formatJalaliDate(value) {
    if (!value) return '—';
    if (PersianCalendar?.formatDate) return PersianCalendar.formatDate(value) || '—';
    const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(String(value).slice(0,10)) ? `${String(value).slice(0,10)}T12:00:00+03:30` : value);
    return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('fa-IR-u-ca-persian',{timeZone:'Asia/Tehran',year:'numeric',month:'2-digit',day:'2-digit'}).format(date) : '—';
  }
  function formatDateTime(value) {
    if (PersianCalendar?.formatDateTime) return PersianCalendar.formatDateTime(value) || String(value || '—');
    const date = new Date(value); if (!Number.isFinite(date.getTime())) return String(value);
    return `${formatJalaliDate(date)} · ${formatTime(date)}`;
  }
  function formatTime(value) {
    if (PersianCalendar?.formatTime) return PersianCalendar.formatTime(value) || '—';
    const date = value instanceof Date ? value : new Date(value); if (!Number.isFinite(date.getTime())) return '—';
    return new Intl.DateTimeFormat('fa-IR',{timeZone:'Asia/Tehran',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(date);
  }
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
  function normalizeGlobalSearch(value) {
    return String(value ?? '').normalize('NFKC').toLocaleLowerCase('fa')
      .replace(/[يى]/g, 'ی').replace(/ك/g, 'ک')
      .replace(/[۰-۹]/g, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
      .replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
      .trim();
  }
  function searchEvents(query, limit = 8) {
    const needle = normalizeGlobalSearch(query);
    if (!needle || !state.events.length) return [];
    const tokens = needle.split(/\s+/).filter(Boolean);
    return state.events.map(event => {
      const haystack = normalizeGlobalSearch([
        event.id, event.title, event.description, event.note, event.actor,
        event.serviceLabel, event.componentName, event.expenseCategory,
        event.fineLocation, event.ticketNumber, event.ticketSerialNumber, event.ticketPaymentId, event.paymentReference, event.vehiclePlate, event.vehicleDescription, event.violationDescription, event.cameraCode, event.originalSms, event.reportedBalanceDate, event.speedLimitKph, event.recordedSpeedKph, event.odometerKm,
        event.distanceKm, event.liters, event.costRial
      ].join(' '));
      return { event, haystack };
    }).filter(item => tokens.every(token => item.haystack.includes(token)))
      .sort((a, b) => eventEpoch(b.event) - eventEpoch(a.event))
      .slice(0, Math.max(1, Math.min(20, Number(limit) || 8)))
      .map(({ event }) => ({
        id: String(event.id || ''),
        title: String(eventTitle(event) || event.type || 'رویداد'),
        description: [event.description, event.note, event.repairDescription, event.symptom, event.diagnosis].filter(Boolean).join(' · ') || String(event.componentName || event.serviceLabel || ''),
        actor: String(event.actor || 'من'),
        type: String(typeLabels[event.type] || event.type || 'رویداد'),
        date: String(formatEventDate(event) || ''),
        odometerKm: Number.isFinite(Number(event.odometerKm)) ? Number(event.odometerKm) : null,
        amountToman: expenseAmount(event) > 0 ? Math.round(expenseAmount(event) / 10) : null
      }));
  }
  function openEventById(id) {
    const key = String(id || '');
    if (!key || !state.events.some(event => String(event.id) === key)) return false;
    activateTab('journal', false);
    const input = $('#searchInput');
    if (input) input.value = key;
    const type = $('#typeFilter'); if (type) type.value = 'all';
    const month = $('#monthFilter'); if (month) month.value = 'all';
    const actor = $('#actorFilter'); if (actor) actor.value = 'all';
    state.shown = 12;
    updateJournal();
    const index = state.filtered.findIndex(event => String(event.id) === key);
    if (index >= 0) {
      state.shown = Math.max(12, index + 1);
      renderJournal();
      requestAnimationFrame(() => {
        const row = $$('#eventList [data-event-id]').find(node => node.dataset.eventId === key);
        if (row) {
          row.classList.add('is-command-target');
          row.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
          window.setTimeout(() => row.classList.remove('is-command-target'), 2600);
        }
      });
      return true;
    }
    return false;
  }
  // Narrow public bridge for the optional command palette; private document data is never exposed here.
  window.GarageApp = Object.freeze({
    searchEvents,
    openEvent: openEventById,
    navigate: name => activateTab(name),
    refresh: () => loadDashboard(true)
  });

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
