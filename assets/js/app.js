(() => {
  'use strict';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const state = { events: [], config: null, months: [], range: 6, analyticsPeriod: 'month', shown: 12, filtered: [], refreshedAt: null };
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

  function renderServices() {
    const config = state.config || {};
    const services = Object.entries(config.serviceIntervals || {});
    const events = state.events;
    if (!services.length) {
      $('#serviceGrid').innerHTML = '<div class="empty-state">فهرست سرویس‌ها در data/config.json پیدا نشد.</div>'; return;
    }
    const currentOdo = calculateOdometer(events);
    const cards = services.map(([key, service]) => {
      const latest = events.filter(e => e.type === 'service' && e.serviceKey === key).sort((a, b) => eventEpoch(b) - eventEpoch(a))[0];
      if (!latest) return serviceCard({ key, service, latest: null, status: 'بدون سابقه', statusClass: '', headline: 'ثبت نشده', subline: 'اولین سرویس را در تلگرام ثبت کن', progress: 0, foot: 'تا قبل از ثبت سرویس قبلی، موعد بعدی قابل محاسبه نیست.' });
      const intervalKm = Number(service.intervalKm) || 0;
      const intervalDays = Number(service.intervalDays) || 0;
      const remainingKm = intervalKm > 0 && currentOdo != null && latest.odometerKm !== null && latest.odometerKm !== undefined && Number.isFinite(Number(latest.odometerKm)) ? Number(latest.odometerKm) + intervalKm - currentOdo : null;
      const dueDate = intervalDays > 0 ? addDays(latest.date || String(latest.occurredAt).slice(0, 10), intervalDays) : null;
      const remainingDays = dueDate ? daysBetween(localDateString(new Date()), dueDate) : null;
      const isOverdue = (remainingKm != null && remainingKm <= 0) || (remainingDays != null && remainingDays <= 0);
      const near = !isOverdue && ((remainingKm != null && remainingKm <= Math.max(500, intervalKm * .1)) || (remainingDays != null && remainingDays <= 14));
      const status = isOverdue ? 'عقب‌افتاده' : near ? 'نزدیک موعد' : 'در بازه مجاز';
      const statusClass = isOverdue ? 'danger' : near ? 'warn' : 'ok';
      const progress = intervalKm > 0 && remainingKm != null ? clamp((intervalKm - remainingKm) / intervalKm * 100, 0, 100) : (remainingDays != null ? clamp((intervalDays - remainingDays) / intervalDays * 100, 0, 100) : 0);
      const headline = remainingKm == null ? (remainingDays == null ? 'نامشخص' : `${formatNumber(Math.abs(remainingDays))} روز`) : `${formatNumber(Math.max(0, remainingKm))} km`;
      const subline = remainingKm != null ? (remainingKm <= 0 ? `${formatNumber(Math.abs(remainingKm))} کیلومتر از موعد گذشته` : 'تا موعد کیلومتری بعدی') : (remainingDays != null ? (remainingDays <= 0 ? `${formatNumber(Math.abs(remainingDays))} روز از موعد گذشته` : 'تا موعد زمانی بعدی') : 'برای محاسبه، کارکرد لازم است');
      const footParts = [];
      if (latest.odometerKm != null) footParts.push(`آخرین سرویس: ${formatNumber(latest.odometerKm)} km`);
      footParts.push(`تاریخ: ${escapeHtml(latest.jalaliDate || latest.date || '—')}`);
      return serviceCard({ key, service, latest, status, statusClass, headline, subline, progress, foot: footParts.join(' · '), remainingKm, remainingDays, currentOdo });
    });
    $('#serviceGrid').innerHTML = cards.join('');
  }

  function serviceCard(data) {
    const { key, service, latest, status, statusClass, headline, subline, progress, foot } = data;
    const intervalLabel = [Number(service.intervalKm) ? `${formatNumber(service.intervalKm)} km` : '', Number(service.intervalDays) ? `${formatNumber(service.intervalDays)} روز` : ''].filter(Boolean).join(' · ') || 'بدون بازه پیش‌فرض';
    const note = service.note ? escapeHtml(service.note) : 'بازه قابل تنظیم';
    const glow = serviceColors[service.category] || serviceColors.service;
    return `<article class="service-card" style="--service-glow:${glow}"><div class="service-card-head"><span class="service-name">${escapeHtml(service.label || key)}</span><span class="service-status ${statusClass}">${escapeHtml(status)}</span></div><p class="service-description">${note}</p><div class="service-metrics"><div class="service-metric"><strong>${escapeHtml(headline)}</strong><small>${escapeHtml(subline)}</small></div><div class="service-metric"><strong>${escapeHtml(intervalLabel)}</strong><small>بازه تنظیم‌شده</small></div></div><div class="service-progress"><span style="width:${clamp(Number(progress) || 0, 0, 100)}%"></span></div><div class="service-foot">${latest ? foot : 'هیچ سرویس قبلی ثبت نشده؛ این مورد هنوز قابل پیش‌بینی دقیق نیست.'}</div></article>`;
  }

  function calculateDue(events, config, currentOdo) {
    const result = [];
    for (const [key, service] of Object.entries(config?.serviceIntervals || {})) {
      const latest = events.filter(e => e.type === 'service' && e.serviceKey === key).sort((a, b) => eventEpoch(b) - eventEpoch(a))[0];
      if (!latest) continue;
      const kmInterval = Number(service.intervalKm) || 0;
      const dayInterval = Number(service.intervalDays) || 0;
      const leftKm = kmInterval > 0 && currentOdo != null && latest.odometerKm !== null && latest.odometerKm !== undefined && Number.isFinite(Number(latest.odometerKm)) ? Number(latest.odometerKm) + kmInterval - currentOdo : null;
      const nextDate = dayInterval > 0 ? addDays(latest.date || String(latest.occurredAt).slice(0, 10), dayInterval) : null;
      const leftDays = nextDate ? daysBetween(localDateString(new Date()), nextDate) : null;
      const nearKm = leftKm != null && leftKm <= Math.max(500, kmInterval * .1);
      const nearDays = leftDays != null && leftDays <= 14;
      if (nearKm || nearDays) result.push({ key, label: service.label || key, overdue: (leftKm != null && leftKm <= 0) || (leftDays != null && leftDays <= 0), leftKm, leftDays, latest });
    }
    return result;
  }

  function renderAnalytics() {
    const period = state.analyticsPeriod || 'month';
    const buckets = buildAnalyticsBuckets(period);
    const distanceEntries = calculateDistanceEntries(state.events, state.config?.ownership);
    const bucketIndex = timestamp => buckets.findIndex(bucket => timestamp >= bucket.start && timestamp < bucket.end);
    const eventTime = event => eventEpoch(event);
    const expenseTime = event => {
      const value = event.type === 'fine' && event.paid && event.paidAt ? event.paidAt
        : event.type === 'issue' && Number(event.repairCostRial) > 0 && event.resolvedAt ? event.resolvedAt
        : event.occurredAt || (event.date ? `${event.date}T${event.time || '12:00'}:00+03:30` : event.createdAt);
      const t = Date.parse(value || ''); return Number.isFinite(t) ? t : 0;
    };
    const rangeEvents = state.events.filter(event => bucketIndex(eventTime(event)) >= 0);
    const rangeExpenses = state.events.filter(event => isActualExpense(event) && bucketIndex(expenseTime(event)) >= 0);
    const rangeDistance = distanceEntries.filter(entry => !entry.estimatedHistorical && bucketIndex(eventEpoch(entry)) >= 0);
    const datasets = buckets.map((bucket, index) => {
      const items = rangeEvents.filter(event => bucketIndex(eventTime(event)) === index);
      const costs = rangeExpenses.filter(event => bucketIndex(expenseTime(event)) === index);
      const dist = rangeDistance.filter(entry => bucketIndex(eventEpoch(entry)) === index);
      return {
        month: bucket.key, label: bucket.label, start: bucket.start, end: bucket.end,
        cost: sum(costs, e => e.costRial) / 10,
        fuel: sum(items.filter(e => e.type === 'fuel'), e => e.liters),
        distance: sum(dist, e => e.distanceKm),
        eventCount: items.length,
        services: items.filter(e => ['service','part','repair'].includes(e.type)).length,
        expenses: costs.length,
        unpaidFines: items.filter(e => e.type === 'fine' && !e.paid).length,
        fuelCost: sum(items.filter(e => e.type === 'fuel'), e => e.costRial) / 10
      };
    });
    const totalCost = sum(datasets, d => d.cost);
    const totalFuel = sum(datasets, d => d.fuel);
    const totalDistance = sum(datasets, d => d.distance);
    const selectedUnpaid = rangeEvents.filter(e => e.type === 'fine' && !e.paid);
    const selectedUnpaidRial = sum(selectedUnpaid, e => e.costRial);
    $('#costChartTotal').textContent = moneyText(totalCost) + ' تومان';
    $('#fuelChartTotal').textContent = `${formatNumber(totalFuel, 1)} لیتر`;
    $('#costChart').innerHTML = barChart(datasets, 'cost', { id: 'expense', color: 'cyan', unit: 'تومان', empty: 'در بازه انتخابی هزینه‌ای ثبت نشده است.' });
    $('#fuelChart').innerHTML = mixedChart(datasets);
    const periodLabels = { hour: '۲۴ ساعت اخیر', day: '۳۰ روز اخیر', week: '۱۲ هفته اخیر', month: '۱۲ ماه اخیر' };
    const chartTitles = { hour: ['هزینه به تفکیک ساعت','سوخت و مسافت ساعتی'], day: ['هزینه به تفکیک روز','سوخت و مسافت روزانه'], week: ['هزینه به تفکیک هفته','سوخت و مسافت هفتگی'], month: ['روند هزینه ماهانه','سوخت و مسافت ماهانه'] };
    const labelRoot = $('#analyticsPeriodLabel'); if (labelRoot) labelRoot.textContent = periodLabels[period] || periodLabels.month;
    const titles = chartTitles[period] || chartTitles.month;
    if ($('#costChartTitle')) $('#costChartTitle').textContent = titles[0];
    if ($('#fuelChartTitle')) $('#fuelChartTitle').textContent = titles[1];
    const put = (selector, value) => { const node = $(selector); if (node) node.textContent = value; };
    put('#periodEventsNumber', formatNumber(rangeEvents.length));
    put('#periodDistanceNumber', formatNumber(totalDistance));
    put('#periodFuelNumber', `${formatNumber(totalFuel, 1)} L`);
    put('#periodCostNumber', compactMoney(totalCost));
    put('#periodFineNumber', formatNumber(selectedUnpaid.length));
    put('#periodFineFoot', selectedUnpaid.length ? `بدهی ثبت‌شده: ${moneyText(selectedUnpaidRial / 10)} تومان` : 'جریمهٔ پرداخت‌نشده در این بازه نیست');
    put('#periodServiceNumber', formatNumber(sum(datasets, d => d.services)));
    const currentBucket = datasets[datasets.length - 1];
    put('#analyticsChartCaption', `${periodLabels[period]} · ${formatNumber(sum(datasets,d=>d.eventCount))} رویداد · ${formatNumber(totalDistance)} کیلومتر · ${moneyText(totalCost)} تومان هزینهٔ پرداخت‌شده`);
    renderActorInsights(rangeExpenses);
    renderDriverInsights(rangeDistance);
    renderCostPerKm(rangeExpenses, rangeDistance);
    renderAnalyticsCategories(rangeEvents);
    renderInsights(datasets, period);
  }

  function buildAnalyticsBuckets(period) {
    const now = Date.now(), offset = 210 * 60 * 1000, hour = 3600000, day = 86400000;
    const local = new Date(now + offset);
    let starts = [], count, base, unit;
    if (period === 'hour') {
      count = 24; unit = hour; base = Math.floor((now + offset) / hour) * hour - offset;
      for (let i = count - 1; i >= 0; i--) starts.push(base - i * unit);
    } else if (period === 'day') {
      count = 30; unit = day; base = Math.floor((now + offset) / day) * day - offset;
      for (let i = count - 1; i >= 0; i--) starts.push(base - i * unit);
    } else if (period === 'week') {
      count = 12; unit = 7 * day;
      const localMidnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - offset;
      base = localMidnight - ((local.getUTCDay() + 1) % 7) * day;
      for (let i = count - 1; i >= 0; i--) starts.push(base - i * unit);
    } else {
      count = 12;
      for (let i = count - 1; i >= 0; i--) starts.push(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() - i, 1) - offset);
    }
    return starts.map((start, index) => {
      const end = starts[index + 1] || (period === 'month' ? Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, 1) - offset : start + unit);
      const d = new Date(start + offset);
      const dateString = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
      let label = '';
      if (period === 'hour') label = new Intl.DateTimeFormat('fa-IR', { timeZone: 'Asia/Tehran', hour: '2-digit', hourCycle: 'h23' }).format(new Date(start));
      else if (period === 'day') label = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { timeZone: 'Asia/Tehran', day: 'numeric', month: 'numeric' }).format(new Date(start + 12 * hour));
      else if (period === 'week') label = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { timeZone: 'Asia/Tehran', day: 'numeric', month: 'short' }).format(new Date(start + 12 * hour));
      else label = monthShort(dateString.slice(0,7));
      return { start, end, key: period + ':' + start, date: dateString, label, period };
    });
  }

  function renderAnalyticsCategories(events) {
    const root = $('#analyticsCategoryBreakdown'); if (!root) return;
    const counts = new Map();
    events.forEach(event => { const key = event.type || 'note'; counts.set(key, (counts.get(key) || 0) + 1); });
    const rows = [...counts.entries()].sort((a,b)=>b[1]-a[1]);
    if (!rows.length) { root.innerHTML = '<div class="empty-state">در بازهٔ انتخابی رویدادی ثبت نشده است.</div>'; return; }
    const max = Math.max(1,...rows.map(row=>row[1]));
    root.innerHTML = rows.map(([type,count],index)=>`<div class="actor-cost-row"><div class="actor-cost-head"><span><i>${typeIcons[type]||'◈'}</i>${escapeHtml(typeLabels[type]||type)}</span><strong>${formatNumber(count)} <small>رویداد</small></strong></div><div class="actor-cost-track"><span style="width:${Math.max(2,count/max*100)}%"></span></div></div>`).join('');
  }

  function renderActorInsights(expenseEvents = state.events.filter(isActualExpense)) {
    const root = $('#actorCostBreakdown');
    if (!root) return;
    const totals = new Map();
    expenseEvents.filter(e => isActualExpense(e) && Number(e.costRial) > 0).forEach(event => {
      const actor = String(event.actor || 'من').trim() || 'من';
      totals.set(actor, (totals.get(actor) || 0) + Number(event.costRial) / 10);
    });
    const rows = [...totals.entries()].sort((a, b) => b[1] - a[1]);
    if (!rows.length) { root.innerHTML = '<div class="empty-state">هزینهٔ پرداخت‌شده‌ای برای مقایسه ثبت نشده است.</div>'; return; }
    const max = Math.max(...rows.map(row => row[1]), 1);
    root.innerHTML = rows.map(([actor, cost], index) => `<div class="actor-cost-row"><div class="actor-cost-head"><span><i>${index + 1}</i>${escapeHtml(actor)}</span><strong>${escapeHtml(moneyText(cost))} <small>تومان</small></strong></div><div class="actor-cost-track"><span style="width:${Math.max(2, cost / max * 100)}%"></span></div><small class="actor-cost-share">${formatNumber(cost / rows.reduce((n, row) => n + row[1], 0) * 100, 1)}٪ از هزینه‌های تفکیک‌شده</small></div>`).join('');
  }

  function renderDriverInsights(distanceEntries = calculateDistanceEntries(state.events, state.config?.ownership)) {
    const root = $('#actorDistanceBreakdown'); if (!root) return;
    const totals = new Map();
    distanceEntries.forEach(entry => { const actor = String(entry.actor || 'من').trim() || 'من'; totals.set(actor, (totals.get(actor) || 0) + (Number(entry.distanceKm) || 0)); });
    const rows = [...totals.entries()].sort((a,b)=>b[1]-a[1]);
    if (!rows.length) { root.innerHTML = '<div class="empty-state">برای محاسبه مسافت هر راننده، کیلومترشمار را در دو یا چند نوبت ثبت کن. رانندهٔ ثبت دوم به فاصلهٔ بین دو ثبت منتسب می‌شود.</div>'; return; }
    const total = rows.reduce((n,row)=>n+row[1],0), max = Math.max(1,...rows.map(row=>row[1]));
    root.innerHTML = rows.map(([actor,km],index)=>`<div class="actor-cost-row"><div class="actor-cost-head"><span><i>${index+1}</i>${escapeHtml(actor)}</span><strong>${formatNumber(km)} <small>km</small></strong></div><div class="actor-cost-track"><span style="width:${Math.max(2,km/max*100)}%"></span></div><small class="actor-cost-share">${formatNumber(total ? km/total*100 : 0,1)}٪ از مسافت قابل محاسبه در بازه</small></div>`).join('');
  }

  function renderCostPerKm(expenseEvents = state.events.filter(isActualExpense), distanceEntries = calculateDistanceEntries(state.events, state.config?.ownership)) {
    const value = $('#costPerKmValue');
    if (!value) return;
    const costRial = sum(expenseEvents.filter(e => isActualExpense(e)), e => e.costRial);
    const kms = distanceEntries.reduce((total, entry) => total + (Number(entry.distanceKm) || 0), 0);
    if (!(kms > 0) || !(costRial > 0)) {
      value.textContent = '—';
      $('#costPerKmFoot').textContent = 'هنوز هم‌زمان هزینه و مسافت قابل محاسبه کافی ثبت نشده است.';
      $('#costPerKmTrack').style.width = '0%';
      return;
    }
    const perKm = costRial / 10 / kms;
    value.textContent = formatNumber(Math.round(perKm));
    $('#costPerKmFoot').textContent = `بر پایه ${formatNumber(Math.round(kms))} کیلومترِ قابل محاسبه و ${moneyText(costRial / 10)} تومان هزینهٔ ثبت‌شده در کل سوابق. این میانگین با کامل‌تر شدن داده‌ها تغییر می‌کند.`;
    $('#costPerKmTrack').style.width = `${Math.min(100, Math.max(3, Math.log10(perKm + 1) * 15))}%`;
  }

  function barChart(data, key, options = {}) {
    if (!data.some(d => d[key] > 0)) return `<div class="empty-state">${options.empty || 'داده‌ای برای نمایش وجود ندارد.'}</div>`;
    const width = 540, height = 220, left = 12, right = 10, top = 18, bottom = 34;
    const plotW = width - left - right, plotH = height - top - bottom;
    const max = niceMax(Math.max(...data.map(d => d[key]), 1));
    const slot = plotW / data.length, barW = Math.min(34, slot * .58);
    const lines = [0, .25, .5, .75, 1].map(t => {
      const y = top + plotH * t;
      return `<line class="chart-gridline" x1="${left}" y1="${y}" x2="${width-right}" y2="${y}"/><text class="axis-text" x="${width-right}" y="${y-4}" text-anchor="end">${axisShort(max * (1-t))}</text>`;
    }).join('');
    const labelEvery = data.length > 20 ? 4 : data.length > 12 ? 2 : 1;
    const bars = data.map((d, i) => {
      const bh = (d[key] / max) * plotH;
      const x = left + i * slot + (slot - barW) / 2;
      const y = top + plotH - bh;
      const tick = i % labelEvery === 0 || i === data.length - 1 ? d.label : '';
      return `<g><title>${escapeHtml(d.month)}: ${formatNumber(d[key], 1)} ${escapeHtml(options.unit || 'تومان')}</title><rect class="bar-expense" x="${x}" y="${y}" width="${barW}" height="${Math.max(0,bh)}" rx="5"/><text class="axis-text" x="${x+barW/2}" y="${height-10}" text-anchor="middle">${escapeHtml(tick)}</text></g>`;
    }).join('');
    return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="نمودار میله‌ای هزینه‌های ماهانه"><defs><linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#71f0f7"/><stop offset="1" stop-color="#2f79d7" stop-opacity=".56"/></linearGradient></defs>${lines}${bars}</svg>`;
  }

  function mixedChart(data) {
    if (!data.some(d => d.fuel > 0 || d.distance > 0)) return '<div class="empty-state">برای ساخت نمودار، سوخت‌گیری و مسافت را از تلگرام ثبت کن.</div>';
    const width = 540, height = 220, left = 13, right = 12, top = 18, bottom = 34;
    const plotW = width - left - right, plotH = height - top - bottom;
    const slot = plotW / data.length, barW = Math.min(26, slot * .44);
    const maxFuel = niceMax(Math.max(...data.map(d => d.fuel), 1));
    const maxDist = niceMax(Math.max(...data.map(d => d.distance), 1));
    const grid = [0,.25,.5,.75,1].map(t=>`<line class="chart-gridline" x1="${left}" y1="${top+plotH*t}" x2="${width-right}" y2="${top+plotH*t}"/>`).join('');
    const bars = data.map((d,i)=>{ const h=d.fuel/maxFuel*plotH; const x=left+i*slot+(slot-barW)/2; const y=top+plotH-h; return `<g><title>${escapeHtml(d.month)}: ${formatNumber(d.fuel,1)} لیتر</title><rect class="bar-fuel" x="${x}" y="${y}" width="${barW}" height="${h}" rx="4"/></g>`;}).join('');
    const points = data.map((d,i)=>({x:left+i*slot+slot/2,y:top+plotH-(d.distance/maxDist*plotH),d}));
    const path = points.map((p,i)=>`${i?'L':'M'} ${p.x} ${p.y}`).join(' ');
    const circles = points.map(p=>`<g><title>${escapeHtml(p.d.month)}: ${formatNumber(p.d.distance)} کیلومتر</title><circle class="point-distance" cx="${p.x}" cy="${p.y}" r="3.5"/></g>`).join('');
    const labelEvery = data.length > 20 ? 4 : data.length > 12 ? 2 : 1;
    const labels = data.map((d,i)=>`<text class="axis-text" x="${left+i*slot+slot/2}" y="${height-10}" text-anchor="middle">${escapeHtml(i % labelEvery === 0 || i === data.length - 1 ? d.label : '')}</text>`).join('');
    return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="نمودار سوخت و مسافت"><defs><linearGradient id="fuelGradient" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#ffbc79"/><stop offset="1" stop-color="#bb6a4b" stop-opacity=".42"/></linearGradient></defs>${grid}${bars}<path class="line-distance" d="${path}"/>${circles}${labels}</svg><div class="chart-legend"><span><i class="legend-fuel"></i>سوخت (لیتر)</span><span><i class="legend-distance"></i>مسافت (کیلومتر، مقیاس مستقل)</span></div>`;
  }

  function renderInsights(datasets, period = 'month') {
    const allFuel = state.events.filter(e => e.type === 'fuel');
    const fullTanks = allFuel.filter(e => e.fullTank && Number.isFinite(Number(e.odometerKm))).sort((a,b)=>eventEpoch(a)-eventEpoch(b));
    let consumption = 'برای محاسبه دقیق‌تر، دو سوخت‌گیری با باک کامل و کیلومترشمار ثبت کن.';
    if (fullTanks.length >= 2) {
      const a = fullTanks[fullTanks.length - 2], b = fullTanks[fullTanks.length - 1];
      const km = Number(b.odometerKm) - Number(a.odometerKm);
      const liters = allFuel.filter(e => eventEpoch(e) > eventEpoch(a) && eventEpoch(e) <= eventEpoch(b)).reduce((s,e)=>s+(Number(e.liters)||0),0);
      if (km > 0 && liters > 0) consumption = `در بازه بین دو سوخت‌گیری کامل، حدود ${formatNumber(liters / km * 100, 1)} لیتر در ۱۰۰ کیلومتر ثبت شده است. این برآورد به کامل بودن باک و درست بودن کیلومترها وابسته است.`;
    }
    $('#fuelInsight').textContent = consumption;
    const costByType = {};
    state.events.filter(isActualExpense).forEach(e => costByType[e.type] = (costByType[e.type] || 0) + (Number(e.costRial) || 0));
    const top = Object.entries(costByType).sort((a,b)=>b[1]-a[1])[0];
    $('#topCostInsight').textContent = top ? `${typeLabels[top[0]] || top[0]} با حدود ${moneyText(top[1]/10)} تومان، بیشترین هزینه ثبت‌شده را دارد.` : 'هنوز هزینه کافی برای مقایسه دسته‌ها ثبت نشده است.';
    const totalDistance = datasets.reduce((s,d)=>s+d.distance,0);
    const activeMonths = datasets.filter(d=>d.distance>0).length;
    const windowLabel = ({hour:'ساعت',day:'روز',week:'هفته',month:'ماه'})[period] || 'بازه';
    $('#driveInsight').textContent = totalDistance ? `در ${formatNumber(activeMonths)} ${windowLabel} از بازهٔ انتخابی، ${formatNumber(totalDistance)} کیلومتر مسافت محاسبه شده است. فاصلهٔ بین دو کیلومترشمار به نام راننده‌ای منظور می‌شود که کیلومتر جدید را ثبت کرده است.` : 'مسافتی در بازه انتخابی محاسبه نشده؛ کیلومترشمار را در چند نوبت با نام راننده ثبت کن یا از /trip استفاده کن.';
  }

  function renderOverviewExtras() {
    const recent = state.events.slice().sort((a,b)=>eventEpoch(b)-eventEpoch(a)).slice(0,4);
    $('#recentEvents').innerHTML = recent.length ? recent.map(event => {
      const cost = Number(event.costRial) > 0 ? `${moneyText(Number(event.costRial)/10)} تومان` : event.liters != null ? `${formatNumber(event.liters,1)} لیتر` : event.odometerKm != null ? `${formatNumber(event.odometerKm)} km` : 'ثبت اطلاعات';
      return `<div class="mini-row"><div class="mini-row-main"><div class="mini-row-title">${escapeHtml(event.title || typeLabels[event.type] || 'رویداد')}</div><div class="mini-row-desc">${escapeHtml((event.description || '').slice(0,72))}</div><div class="mini-row-meta">${escapeHtml(event.jalaliDate || event.date || '—')} · ${escapeHtml(event.time || '')}</div></div><div class="mini-row-value">${escapeHtml(cost)}</div></div>`;
    }).join('') : '<div class="empty-state">هنوز رویدادی ثبت نشده است؛ از ربات اولین کیلومتر یا سوخت‌گیری را ثبت کن.</div>';
    const due = calculateDue(state.events, state.config, calculateOdometer(state.events));
    const alerts = [];
    due.filter(item=>item.overdue).forEach(item=>alerts.push({kind:'danger',title:`${item.label} عقب‌افتاده`,detail:item.leftKm!=null?`${formatNumber(Math.abs(item.leftKm))} کیلومتر از موعد گذشته`: 'موعد زمانی گذشته است'}));
    due.filter(item=>!item.overdue).forEach(item=>alerts.push({kind:'warn',title:`${item.label} نزدیک موعد`,detail:item.leftKm!=null?`${formatNumber(Math.max(0,item.leftKm))} کیلومتر باقی مانده`: `${formatNumber(Math.max(0,item.leftDays||0))} روز باقی مانده`}));
    state.events.filter(e=>e.type==='issue' && e.status!=='fixed').slice(-3).reverse().forEach(e=>alerts.push({kind:'danger',title:'خرابی باز',detail:(e.description||e.title||'نیازمند بررسی').slice(0,90)}));
    $('#overviewAlerts').innerHTML = alerts.length ? alerts.slice(0,5).map(a=>`<div class="alert-row ${a.kind}"><span class="alert-mark">${a.kind==='danger'?'!':'◷'}</span><div><b>${escapeHtml(a.title)}</b><small>${escapeHtml(a.detail)}</small></div></div>`).join('') : '<div class="empty-state">در داده‌های ثبت‌شده هشدار فوری پیدا نشد. این بررسی فقط به رویدادهایی وابسته است که ثبت کرده‌ای.</div>';
  }

  function getFuelConsumption() {
    const fuel = state.events.filter(e => e.type === 'fuel');
    const full = fuel.filter(e => e.fullTank && Number.isFinite(Number(e.odometerKm)) && e.odometerKm !== null).sort((a,b)=>eventEpoch(a)-eventEpoch(b));
    if (full.length < 2) return null;
    const a = full[full.length-2], b = full[full.length-1];
    const km = Number(b.odometerKm) - Number(a.odometerKm);
    const liters = fuel.filter(e=>eventEpoch(e)>eventEpoch(a)&&eventEpoch(e)<=eventEpoch(b)).reduce((n,e)=>n+(Number(e.liters)||0),0);
    if (!(km > 0) || !(liters > 0) || km > 5000) return null;
    return { value: liters / km * 100, km, liters, from: a, to: b };
  }

  function renderFuelPage() {
    const fuel = state.events.filter(e=>e.type==='fuel').sort((a,b)=>eventEpoch(b)-eventEpoch(a));
    const totalLiters = sum(fuel,e=>e.liters);
    const totalCost = sum(fuel,e=>e.costRial)/10;
    const nowMonth = localDateString(new Date()).slice(0,7);
    const monthFuel = fuel.filter(e=>String(e.date||e.occurredAt||'').slice(0,7)===nowMonth);
    $('#fuelPageLiters').textContent = formatNumber(totalLiters,1);
    $('#fuelPageLitersFoot').textContent = `${formatNumber(monthFuel.reduce((n,e)=>n+(Number(e.liters)||0),0),1)} لیتر در ماه جاری`;
    $('#fuelPageCost').textContent = compactMoney(totalCost);
    $('#fuelPageCostFoot').textContent = `${formatNumber(fuel.length)} ثبت سوخت‌گیری`;
    $('#fuelPageStops').textContent = formatNumber(fuel.length);
    $('#fuelPageStopsFoot').textContent = `${formatNumber(fuel.filter(e=>e.fullTank).length)} بار باک کامل علامت خورده`;
    const consumption = getFuelConsumption();
    $('#fuelPageEfficiency').textContent = consumption ? formatNumber(consumption.value,1) : '—';
    $('#fuelPageEfficiencyFoot').textContent = consumption ? `بر پایه ${formatNumber(consumption.km)} کیلومتر بین دو باک کامل` : 'به دو سوخت‌گیری کامل با کیلومتر نیاز است';
    const months = getMonthKeys(nowMonth,Math.max(6,state.range)).map(month=>({month,label:monthShort(month),liters:sum(fuel.filter(e=>String(e.date||e.occurredAt||'').slice(0,7)===month),e=>e.liters)}));
    $('#fuelOnlyChart').innerHTML = barChart(months,'liters',{unit:'لیتر',empty:'در این بازه هنوز سوخت‌گیری ثبت نشده است.'});
    $('#fuelEventList').innerHTML = fuel.length ? fuel.slice(0,8).map(e=>`<div class="mini-row"><div class="mini-row-main"><div class="mini-row-title">${escapeHtml(e.jalaliDate||e.date||'—')} · ${formatNumber(e.liters,1)} لیتر</div><div class="mini-row-desc">${escapeHtml((e.description||'سوخت‌گیری').slice(0,95))}</div><div class="mini-row-meta">${e.odometerKm!=null?`${formatNumber(e.odometerKm)} km`:'بدون کیلومتر'}${e.fullTank?' · باک کامل':''}</div></div><div class="mini-row-value">${Number(e.costRial)>0?`${moneyText(Number(e.costRial)/10)} ت`:'—'}</div></div>`).join('') : '<div class="empty-state">سوخت‌گیری ثبت نشده است. نمونه: <code>20l fuel cost=700000 toman km=156200 full</code></div>';
  }

  function expenseCategoryName(event) {
    if (event.type==='fuel') return 'سوخت';
    if (event.type==='service') return 'سرویس و نگهداری';
    if (event.type==='part') return 'قطعات';
    if (event.type==='wash') return 'شست‌وشو';
    if (event.type==='fine') return 'جریمه پرداخت‌شده';
    if (event.type==='issue'||event.type==='repair') return 'تعمیرات';
    return 'هزینه متفرقه';
  }

  function renderExpensePage() {
    const expenses = state.events.filter(e=>isActualExpense(e) && Number(e.costRial)>0).sort((a,b)=>eventEpoch(b)-eventEpoch(a));
    const allTotal = sum(expenses,e=>e.costRial)/10;
    const month = localDateString(new Date()).slice(0,7);
    const monthRows = expenses.filter(e=>expenseDate(e).slice(0,7)===month);
    const monthTotal = sum(monthRows,e=>e.costRial)/10;
    const largest = expenses.slice().sort((a,b)=>(Number(b.costRial)||0)-(Number(a.costRial)||0))[0];
    $('#expensePageTotal').textContent = compactMoney(allTotal);
    $('#expensePageTotalFoot').textContent = `${formatNumber(expenses.length)} رویداد با هزینه‌ی حساب‌شده`;
    $('#expensePageMonthly').textContent = compactMoney(monthTotal);
    $('#expensePageMonthlyFoot').textContent = `${formatNumber(monthRows.length)} هزینه در ماه جاری`;
    $('#expensePageLargest').textContent = largest ? compactMoney(Number(largest.costRial)/10) : '—';
    $('#expensePageLargestFoot').textContent = largest ? `${escapeHtml(largest.title||typeLabels[largest.type]||'رویداد')} · ${escapeHtml(largest.jalaliDate||largest.date||'')}` : 'هنوز هزینه‌ای ثبت نشده';
    const byCategory = {};
    expenses.forEach(e=>{const key=expenseCategoryName(e);byCategory[key]=(byCategory[key]||0)+(Number(e.costRial)||0)/10;});
    const categories = Object.entries(byCategory).sort((a,b)=>b[1]-a[1]);
    $('#expensePageCategories').textContent = formatNumber(categories.length);
    const monthly = getMonthKeys(month,Math.max(6,state.range)).map(key=>({month:key,label:monthShort(key),cost:sum(expenses.filter(e=>expenseDate(e).slice(0,7)===key),e=>e.costRial)/10}));
    $('#expenseMonthlyChart').innerHTML = barChart(monthly,'cost',{unit:'تومان',empty:'در ماه‌های انتخابی هزینه‌ای ثبت نشده است.'});
    $('#expenseCategoryChart').innerHTML = categories.length ? categories.map(([name,value])=>`<div class="category-row"><div class="category-row-head"><span>${escapeHtml(name)}</span><b>${escapeHtml(moneyText(value))} تومان</b></div><div class="category-track"><span style="width:${clamp(value/(categories[0][1]||1)*100,0,100)}%"></span></div><small>${formatNumber(allTotal?value/allTotal*100:0,1)}٪ از کل هزینه‌های حساب‌شده</small></div>`).join('') : '<div class="empty-state">با ثبت هزینه، تحلیل دسته‌ها در این بخش ظاهر می‌شود.</div>';
    $('#expenseEventList').innerHTML = expenses.length ? expenses.slice(0,12).map(e=>`<div class="expense-row"><span class="expense-type-icon">${typeIcons[e.type]||'◈'}</span><div class="expense-row-main"><b>${escapeHtml(e.title||typeLabels[e.type]||'هزینه')}</b><small>${escapeHtml(e.jalaliDate||e.date||'—')} · ${escapeHtml(e.description||'').slice(0,100)}</small></div><span class="expense-row-category">${escapeHtml(expenseCategoryName(e))}</span><strong>${moneyText(Number(e.costRial)/10)} <small>تومان</small></strong></div>`).join('') : '<div class="empty-state">هیچ هزینه‌ی پرداخت‌شده‌ای ثبت نشده است.</div>';
  }

  function renderTrafficDetails() {
    const unpaid = state.events.filter(e=>e.type==='fine'&&!e.paid).sort((a,b)=>eventEpoch(b)-eventEpoch(a));
    $('#unpaidFinesList').innerHTML = unpaid.length ? unpaid.slice(0,10).map(e=>`<div class="mini-row"><div class="mini-row-main"><div class="mini-row-title">${escapeHtml(e.description||'جریمه')}</div><div class="mini-row-meta">ID ${escapeHtml(String(e.id).slice(0,8))} · ${escapeHtml(e.jalaliDate||e.date||'—')}</div></div><div class="mini-row-value">${moneyText(Number(e.costRial||0)/10)} تومان</div></div>`).join('') : '<div class="empty-state">جریمه‌ی پرداخت‌نشده‌ای ثبت نشده است.</div>';
    const open = state.events.filter(e=>e.type==='issue'&&e.status!=='fixed').sort((a,b)=>eventEpoch(b)-eventEpoch(a));
    $('#openIssuesList').innerHTML = open.length ? open.slice(0,10).map(e=>`<div class="mini-row"><div class="mini-row-main"><div class="mini-row-title">${escapeHtml(e.title||'خرابی ثبت‌شده')}</div><div class="mini-row-desc">${escapeHtml((e.description||'').slice(0,100))}</div><div class="mini-row-meta">${escapeHtml(e.jalaliDate||e.date||'—')} · ID ${escapeHtml(String(e.id).slice(0,8))}</div></div><div class="mini-row-value negative">باز</div></div>`).join('') : '<div class="empty-state">خرابی بازی ثبت نشده است.</div>';
  }

  function renderSettingsPage() {
    const config = state.config || {};
    const entries = Object.entries(config.serviceIntervals || {});
    $('#settingsServiceTable').innerHTML = entries.length ? `<div class="settings-service-head"><span>سرویس / قطعه</span><span>بازه</span></div>`+entries.map(([key,item])=>`<div class="settings-service-row"><div><b>${escapeHtml(item.label||key)}</b><small>${escapeHtml(key)}</small></div><span>${Number(item.intervalKm)?`${formatNumber(item.intervalKm)} km`:''}${Number(item.intervalDays)?` · ${formatNumber(item.intervalDays)} روز`:''}</span></div>`).join('') : '<div class="empty-state">فایل config.json بارگیری نشده است.</div>';
    const people = Array.isArray(config.people) ? config.people : [];
    const peopleRoot = $('#settingsPeopleList');
    if (peopleRoot) peopleRoot.innerHTML = people.length ? people.map((person, index) => `<div class="person-settings-row"><span class="person-settings-index">${index + 1}</span><b>${escapeHtml(person)}</b><small>ACTOR</small></div>`).join('') : '<div class="empty-state">فهرست شخصی هنوز خالی است؛ از دستور /people add نام استفاده کن.</div>';
    filterGuideCards();
  }

  async function copyApiExample() {
    const sample = 'curl -X POST "https://peugeot-206-garage-bot.game-developer-mb.workers.dev/api/v1/record" ^\n  -H "Authorization: Bearer YOUR_API_ACCESS_TOKEN" ^\n  -H "Content-Type: application/json" ^\n  -d "{\\"text\\":\\"20l fuel, cost 700000 toman, km 156200\\"}"';
    try { await navigator.clipboard.writeText(sample); showToast('نمونه درخواست CMD کپی شد؛ توکن آزمایشی را با Secret خودت جایگزین کن.'); }
    catch { showToast('کپی خودکار در این مرورگر فعال نیست؛ نمونه را از صفحه انتخاب و کپی کن.'); }
  }

  function exportCsvAll() {
    if (!state.events.length) { showToast('هنوز رویدادی برای خروجی وجود ندارد.'); return; }
    const keys = ['id','type','title','description','actor','note','occurredAt','jalaliDate','date','time','odometerKm','distanceKm','liters','costRial','serviceKey','paid','paidAt','repairCostRial','resolvedAt','repairDescription','status','fullTank','updatedAt','revision'];
    const csv = [keys.join(','), ...state.events.map(e=>keys.map(k=>csvCell(e[k])).join(','))].join('\r\n');
    downloadBlob(`206-garage-all-${localDateString(new Date())}.csv`,'\uFEFF'+csv,'text/csv;charset=utf-8'); showToast('CSV کامل همه‌ی رویدادها آماده شد.');
  }
  function exportJsonAll() {
    if (!state.events.length) { showToast('هنوز رویدادی برای خروجی وجود ندارد.'); return; }
    downloadBlob(`206-garage-all-${localDateString(new Date())}.json`,JSON.stringify({exportedAt:new Date().toISOString(),vehicle:state.config?.vehicle||{},events:state.events},null,2),'application/json;charset=utf-8'); showToast('JSON کامل همه‌ی رویدادها آماده شد.');
  }
  function exportExpensesCsv() {
    const rows = state.events.filter(e=>isActualExpense(e)&&Number(e.costRial)>0);
    if (!rows.length) { showToast('هزینه‌ای برای خروجی وجود ندارد.'); return; }
    const keys=['id','type','title','description','actor','note','occurredAt','jalaliDate','odometerKm','distanceKm','liters','costRial','paid','paidAt','resolvedAt','updatedAt','revision'];
    const csv=[keys.join(','),...rows.map(e=>keys.map(k=>csvCell(e[k])).join(','))].join('\r\n');
    downloadBlob(`206-garage-expenses-${localDateString(new Date())}.csv`,'\uFEFF'+csv,'text/csv;charset=utf-8'); showToast('خروجی هزینه‌های قابل محاسبه آماده شد.');
  }

  function updateJournal() {
    state.shown = 12;
    const query = ($('#searchInput').value || '').trim().toLowerCase();
    const type = $('#typeFilter').value;
    const month = $('#monthFilter').value;
    state.filtered = state.events.filter(event => {
      const searchText = [event.title,event.description,event.note,event.actor,event.serviceLabel,event.serviceKey,event.id,event.jalaliDate,event.date,event.costRial,event.odometerKm].join(' ').toLowerCase();
      const actor = $('#actorFilter')?.value || 'all';
      return (type === 'all' || event.type === type) && (month === 'all' || String(event.date || event.occurredAt || '').slice(0,7) === month) && (actor === 'all' || String(event.actor || 'من') === actor) && (!query || searchText.includes(query));
    }).sort((a,b)=>eventEpoch(b)-eventEpoch(a));
    renderJournal();
  }

  function renderJournal() {
    const visible = state.filtered.slice(0, state.shown);
    $('#resultCount').textContent = `${formatNumber(state.filtered.length)} رویداد`;
    $('#journalRange').textContent = state.filtered.length ? `${formatNumber(visible.length)} مورد از ${formatNumber(state.filtered.length)} مورد` : 'موردی با این فیلتر پیدا نشد';
    $('#loadMoreButton').hidden = state.filtered.length <= state.shown;
    if (!state.filtered.length) {
      $('#eventList').innerHTML = `<div class="empty-state">${state.events.length ? 'با این جست‌وجو یا فیلتر، رویدادی پیدا نشد.' : 'هنوز رویدادی ثبت نشده است. در تلگرام /start را بزن و اولین کیلومتر یا هزینه را ثبت کن.'}</div>`;
      return;
    }
    $('#eventList').innerHTML = visible.map(event => {
      const icon = typeIcons[event.type] || '•';
      const eventDate = escapeHtml(event.jalaliDate || formatJalaliDate(event.date || event.occurredAt));
      const time = escapeHtml(event.time || formatTime(event.occurredAt));
      const odo = Number.isFinite(Number(event.odometerKm)) && event.odometerKm !== null ? `<span>⌁ ${formatNumber(event.odometerKm)} km</span>` : '';
      const liters = Number.isFinite(Number(event.liters)) && event.liters !== null ? `<span>⛽ ${formatNumber(event.liters,1)} L</span>` : '';
      const distance = Number.isFinite(Number(event.distanceKm)) && event.distanceKm !== null ? `<span>↗ ${formatNumber(event.distanceKm)} km</span>` : '';
      const status = event.type === 'fine' ? (event.paid ? 'پرداخت‌شده' : 'پرداخت‌نشده') : event.type === 'issue' ? (event.status === 'fixed' ? 'رفع‌شده' : 'باز') : event.type === 'service' ? 'سرویس' : '';
      const cost = Number(event.costRial) > 0 ? `<div class="event-cost ${event.type==='fine'&&!event.paid?'negative':''}">${escapeHtml(moneyText(Number(event.costRial)/10))}<small>تومان</small></div>` : '<div class="event-cost">—</div>';
      const desc = (event.description || '').slice(0, 200);
      const actor = String(event.actor || 'من').trim() || 'من';
      const note = String(event.note || '').trim();
      const manageUrl = `https://t.me/Peugeot206GarageBot?start=e_${encodeURIComponent(String(event.id).slice(0,8))}`;
      return `<article class="event-row"><div class="event-icon ${escapeAttr(event.type)}">${icon}</div><div class="event-body"><div class="event-title-line"><span class="event-title">${escapeHtml(event.title || typeLabels[event.type] || 'رویداد')}</span><span class="event-pill">${escapeHtml(typeLabels[event.type] || event.type || 'رویداد')}</span>${status ? `<span class="event-pill">${escapeHtml(status)}</span>` : ''}</div><div class="event-description">${escapeHtml(desc)}</div><div class="event-person-row"><span class="event-person">👤 ${escapeHtml(actor)}</span>${note ? `<span class="event-note">📝 ${escapeHtml(note)}</span>` : ''}</div><div class="event-meta"><span>${eventDate}</span><span>${time}</span>${odo}${distance}${liters}<span>ID: ${escapeHtml(String(event.id).slice(0,8))}</span></div><a class="event-manage-link" href="${escapeAttr(manageUrl)}" target="_blank" rel="noopener noreferrer">جزئیات و مدیریت در تلگرام ↗</a></div>${cost}</article>`;
    }).join('');
  }

  function renderOwnershipSummary() {
    const settings = state.config?.ownership || {};
    const purchaseKm = Number(settings.purchaseOdometerKm ?? settings.baselineOdometerKm ?? state.config?.vehicle?.purchaseOdometerKm ?? 428000);
    const estimateKm = Number(settings.estimatedKmSincePurchaseKm ?? settings.estimatedDrivenSincePurchaseKm ?? 2400);
    const currentKm = calculateOdometer(state.events);
    const actualKm = currentKm != null && currentKm >= purchaseKm ? currentKm - purchaseKm : null;
    const difference = actualKm == null ? null : actualKm - estimateKm;
    const put = (selector, value) => { const node=$(selector); if(node) node.textContent=value; };
    put('#ownershipPurchaseKm', `${formatNumber(purchaseKm)} km`);
    put('#ownershipCurrentKm', currentKm == null ? '—' : `${formatNumber(currentKm)} km`);
    put('#ownershipDrivenKm', actualKm == null ? '—' : `${formatNumber(actualKm)} km`);
    put('#ownershipEstimateKm', `${formatNumber(estimateKm)} km`);
    const reconciliation = $('#ownershipReconciliation');
    if (reconciliation) {
      const warning = difference != null && Math.abs(difference) > 150;
      reconciliation.classList.toggle('is-warning', warning);
      reconciliation.classList.toggle('is-confirmed', !warning && difference != null);
      reconciliation.innerHTML = difference == null
        ? 'برای محاسبهٔ پیمایش از زمان خرید، ابتدا کیلومترشمار فعلی را ثبت کن.'
        : warning
          ? `<b>⚠️ اختلاف نیازمند بررسی</b><span>آخرین عدد ثبت‌شده نسبت به کیلومتر خرید، ${formatNumber(actualKm)} کیلومتر پیمایش نشان می‌دهد؛ درحالی‌که برآورد اولیه ${formatNumber(estimateKm)} کیلومتر بوده است. اختلاف ${difference > 0 ? '+' : ''}${formatNumber(difference)} کیلومتر است. اگر کیلومتر واقعی خودرو ۴۳۰۴۰۰ است، آن را با /km 430400 ثبت کن؛ فقط درصورتی انجام بده که کیلومترشمار خودرو همین عدد را نشان دهد.</span>`
          : `<b>✓ برآورد با کیلومتر ثبت‌شده نزدیک است</b><span>اختلاف برآورد و کیلومتر واقعی ثبت‌شده ${formatNumber(difference)} کیلومتر است.</span>`;
    }
    const breakdown = $('#ownershipDriverBreakdown');
    if (breakdown) {
      const entries = calculateDistanceEntries(state.events, settings);
      const grouped = {};
      entries.forEach(entry => { const name=String(entry.actor||'من').trim()||'من'; grouped[name]=(grouped[name]||0)+(Number(entry.distanceKm)||0); });
      const rows = Object.entries(grouped).filter(([,value])=>value>0).sort((a,b)=>b[1]-a[1]);
      const total = rows.reduce((n,row)=>n+row[1],0);
      breakdown.innerHTML = rows.length ? rows.map(([name,value],i)=>`<div class="ownership-driver-row"><div class="ownership-driver-title"><b>${escapeHtml(name)}</b><span>${formatNumber(value)} km · ${formatNumber(total?value/total*100:0,1)}٪</span></div><div class="ownership-driver-track"><span style="width:${clamp(total?value/total*100:0,0,100)}%"></span></div>${i===0?'<small>سهم تاریخی از مبنای خرید به نام «من» فرض شده، مگر اینکه شخص دیگری برای کیلومتر ثبت شده باشد.</small>':''}</div>`).join('') : '<div class="empty-state">برای ساخت سهم رانندگی، مبنای خرید و حداقل یک ثبت کیلومتر لازم است.</div>';
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
    $('#fineSummary').innerHTML = fines.length ? fines.slice(0,4).map(e=>`<div class="mini-row"><div class="mini-row-main"><div class="mini-row-title">${escapeHtml(e.description || 'جریمه ثبت‌شده')}</div><div class="mini-row-meta">${escapeHtml(e.jalaliDate || e.date || '—')} · ${String(e.id).slice(0,8)}</div></div><div class="mini-row-value ${e.paid?'paid':''}">${escapeHtml(moneyText((Number(e.costRial)||0)/10))}<div class="mini-row-meta">${e.paid?'پرداخت شد':'پرداخت‌نشده'}</div></div></div>`).join('') : '<div class="empty-state">جریمه‌ای ثبت نشده است.</div>';
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
    const keys = ['id','type','title','description','actor','note','occurredAt','jalaliDate','date','time','odometerKm','distanceKm','liters','costRial','serviceKey','paid','paidAt','repairCostRial','resolvedAt','repairDescription','status','fullTank','updatedAt','revision'];
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
