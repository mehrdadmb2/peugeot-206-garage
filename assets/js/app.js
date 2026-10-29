(() => {
  'use strict';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const state = { events: [], config: null, months: [], range: 6, analyticsPeriod: 'month', componentCategoryFilter: 'all', shown: 12, filtered: [], refreshedAt: null };
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
    document.addEventListener('click', event => {
      const categoryButton = event.target.closest('[data-component-category]');
      if (categoryButton) {
        state.componentCategoryFilter = categoryButton.dataset.componentCategory || 'all';
        renderComponentCatalog();
        return;
      }
      const tab = event.target.closest('[data-tab]');
      if (tab) { event.preventDefault(); activateTab(tab.dataset.tab); return; }
      const anchor = event.target.closest('a[href^="#"]');
      if (anchor) {
        const id = anchor.getAttribute('href').slice(1);
        const target = id ? document.getElementById(id) : null;
        const pane = target?.closest('[data-view-pane]');
        if (pane) { event.preventDefault(); activateTab(pane.dataset.viewPane); }
        else if (id === 'top') { event.preventDefault(); activateTab('overview'); }
      }
    });
    $('#refreshButton').addEventListener('click', () => loadDashboard(true));
    document.addEventListener('click', async event => {
      const commandButton = event.target.closest('[data-component-command]');
      if (!commandButton) return;
      const command = commandButton.dataset.componentCommand || '';
      try { await navigator.clipboard.writeText(command); showToast('نمونه دستور ثبت قطعه/سرویس کپی شد.'); }
      catch { showToast(command); }
    });
    $('#exportCsv').addEventListener('click', exportCsv);
    $('#exportJson').addEventListener('click', exportJson);
    $('#exportCsvAll').addEventListener('click', exportCsvAll);
    $('#exportJsonAll').addEventListener('click', exportJsonAll);
    $('#expenseCsv').addEventListener('click', exportExpensesCsv);
    $('#copyApiExample').addEventListener('click', copyApiExample);
    $('#searchInput').addEventListener('input', updateJournal);
    $('#typeFilter').addEventListener('change', updateJournal);
    $('#monthFilter').addEventListener('change', updateJournal);
    $('#actorFilter')?.addEventListener('change', updateJournal);
    $('#guideSearch')?.addEventListener('input', filterGuideCards);
    $('#loadMoreButton').addEventListener('click', () => { state.shown += 12; renderJournal(); });
    $$('[data-analytics-period]').forEach(button => button.addEventListener('click', () => {
      $$('[data-analytics-period]').forEach(item => { const active = item === button; item.classList.toggle('active', active); item.setAttribute('aria-pressed', active ? 'true' : 'false'); });
      state.analyticsPeriod = button.dataset.analyticsPeriod || 'month';
      renderAnalytics();
    }));
    $$('.range-button').forEach(button => button.addEventListener('click', () => {
      $$('.range-button').forEach(x => x.classList.toggle('active', x === button));
      state.range = Number(button.dataset.range) || 6;
      renderFuelPage(); renderExpensePage();
    }));
    $('#copyHelpButton').addEventListener('click', async () => {
      const help = 'کیلومتر ۱۵۶۲۰۰\nامروز ۸۵ کیلومتر رانندگی کردم\n۲۰ لیتر بنزین · هزینه ۷۰۰ هزار تومان · کیلومتر ۱۵۶۲۰۰\nروغن موتور را عوض کردم · هزینه ۹۰۰ هزار تومان · کیلومتر ۱۵۶۰۰۰\nخرابی: صدای جلوبندی\nجریمه سرعت ۵۰۰ هزار تومان\nکارواش ۱۸۰ هزار تومان';
      try { await navigator.clipboard.writeText(help); showToast('نمونه دستورهای ثبت خودرو کپی شد.'); }
      catch { showToast('کپی خودکار در این مرورگر در دسترس نیست.'); }
    });
    initTilt();
    activateTab('overview', false);
    loadDashboard(false);
  });

  async function loadDashboard(userInitiated) {
    setConnection('loading');
    const refreshButton = $('#refreshButton');
    refreshButton.classList.add('is-loading');
    try {
      const stamp = Date.now();
      const [indexResponse, configResponse] = await Promise.all([
        fetch(`data/index.json?v=${stamp}`, { cache: 'no-store' }),
        fetch(`data/config.json?v=${stamp}`, { cache: 'no-store' })
      ]);
      if (!indexResponse.ok) throw new Error(`index.json: HTTP ${indexResponse.status}`);
      if (!configResponse.ok) throw new Error(`config.json: HTTP ${configResponse.status}`);
      const [index, config] = await Promise.all([indexResponse.json(), configResponse.json()]);
      state.config = config;
      state.months = (Array.isArray(index.months) ? index.months : []).filter(month => /^\d{4}-\d{2}$/.test(month)).sort().reverse();
      const monthResults = await Promise.all(state.months.map(async month => {
        try {
          const response = await fetch(`data/logs/${month}.json?v=${stamp}`, { cache: 'no-store' });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const json = await response.json();
          return Array.isArray(json.events) ? json.events : [];
        } catch (error) { console.warn(`Could not load ${month}`, error); return []; }
      }));
      const seen = new Set();
      state.events = monthResults.flat().filter(event => {
        if (!event || !event.id || event.deletedAt || seen.has(event.id)) return false;
        seen.add(event.id); return true;
      }).sort((a, b) => String(a.occurredAt || '').localeCompare(String(b.occurredAt || '')) || String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
      state.refreshedAt = new Date();
      populateMonthFilter();
      populateActorFilter();
      renderAll();
      setConnection('connected');
      const idxDate = index.updatedAt ? formatDateTime(index.updatedAt) : 'هنوز ثبت اولیه انجام نشده';
      $('#lastUpdated').textContent = state.events.length ? `آخرین به‌روزرسانی دفتر: ${idxDate}` : 'آماده دریافت اولین رویداد از تلگرام';
      $('#journalBottomNote').textContent = `آخرین بررسی مرورگر: ${formatTime(state.refreshedAt)} · برای تازه‌سازی از دکمه بالا استفاده کن.`;
      if (userInitiated) showToast('اطلاعات GitHub دوباره بارگیری شد.');
    } catch (error) {
      console.error(error);
      setConnection('error');
      $('#lastUpdated').textContent = 'داده‌ها بارگیری نشدند؛ مخزن و GitHub Pages را بررسی کن.';
      $('#eventList').innerHTML = `<div class="empty-state">اتصال به فایل‌های داده برقرار نشد.<br><small>${escapeHtml(error.message || 'Unknown error')}</small><br>آدرس GitHub Pages، فایل data/index.json و وضعیت انتشار را بررسی کن.</div>`;
      if (userInitiated) showToast('بارگیری ناموفق بود؛ اتصال یا مسیر فایل‌های JSON را بررسی کن.');
    } finally {
      refreshButton.classList.remove('is-loading');
      const boot = $('#bootScreen');
      if (boot) { boot.classList.add('boot-screen-hidden'); setTimeout(() => boot.remove(), 700); }
    }
  }

  function renderAll() {
    renderStats();
    renderServices();
    renderAnalytics();
    updateJournal();
    renderFinesAndIssues();
    renderOverviewExtras();
    renderFuelPage();
    renderExpensePage();
    renderTrafficDetails();
    renderSettingsPage();
    renderOwnershipSummary();
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

  function setConnection(status) {
    const badge = $('#connectionBadge');
    badge.classList.remove('connected', 'error');
    if (status === 'connected') {
      badge.classList.add('connected'); badge.innerHTML = '<i></i> داده‌ها بارگیری شد';
    } else if (status === 'error') {
      badge.classList.add('error'); badge.innerHTML = '<i></i> خطای بارگیری';
    } else badge.innerHTML = '<i></i> در حال اتصال';
  }

  function renderStats() {
    const all = state.events;
    const now = localDateString(new Date());
    const monthKey = now.slice(0, 7);
    const monthEvents = all.filter(event => String(event.date || event.occurredAt || '').slice(0, 7) === monthKey);
    const currentOdo = calculateOdometer(all);
    const monthFuel = monthEvents.filter(e => e.type === 'fuel');
    const totalLiters = sum(monthFuel, e => e.liters);
    const due = calculateDue(all, state.config, currentOdo);
    const cost = sum(all.filter(e => isActualExpense(e) && expenseDate(e).slice(0, 7) === monthKey), e => e.costRial);
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
  function isActualExpense(event) { return Number(event.costRial)>0 && (event.type !== 'fine' || Boolean(event.paid)); }
  function expenseDate(event) {
    if (event.type === 'fine' && event.paid && event.paidAt) return String(event.paidAt).slice(0,10);
    if (event.type === 'issue' && Number(event.repairCostRial)>0 && event.resolvedAt) return String(event.resolvedAt).slice(0,10);
    return String(event.occurredAt || event.date || event.createdAt || '').slice(0,10);
  }
  function calculateOdometer(events) {
    let current = null;
    const timeline = events.filter(e=>e.type==='odometer'||e.type==='trip').sort((a,b)=>eventEpoch(a)-eventEpoch(b));
    for (const event of timeline) {
      if (event.type==='odometer' && event.odometerKm !== null && event.odometerKm !== undefined && Number.isFinite(Number(event.odometerKm))) current = Number(event.odometerKm);
      else if (event.type==='trip' && Number.isFinite(Number(event.distanceKm)) && current !== null) current += Number(event.distanceKm);
    }
    return current == null ? null : Math.round(current*10)/10;
  }

  function calculateDistanceEntries(events, ownershipConfig = null) {
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
  function showToast(text) { const el=$('#toast');el.textContent=text;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),3000); }
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
