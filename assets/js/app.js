(() => {
  'use strict';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const state = { events: [], config: null, months: [], range: 6, shown: 12, filtered: [], refreshedAt: null };
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
    $('#refreshButton').addEventListener('click', () => loadDashboard(true));
    $('#exportCsv').addEventListener('click', exportCsv);
    $('#exportJson').addEventListener('click', exportJson);
    $('#searchInput').addEventListener('input', updateJournal);
    $('#typeFilter').addEventListener('change', updateJournal);
    $('#monthFilter').addEventListener('change', updateJournal);
    $('#loadMoreButton').addEventListener('click', () => { state.shown += 12; renderJournal(); });
    $$('.range-button').forEach(button => button.addEventListener('click', () => {
      $$('.range-button').forEach(x => x.classList.toggle('active', x === button));
      state.range = Number(button.dataset.range) || 6;
      renderAnalytics();
    }));
    $('#copyHelpButton').addEventListener('click', async () => {
      const help = 'کیلومتر ۱۵۶۲۰۰\nامروز ۸۵ کیلومتر رانندگی کردم\n۲۰ لیتر بنزین · هزینه ۷۰۰ هزار تومان · کیلومتر ۱۵۶۲۰۰\nروغن موتور را عوض کردم · هزینه ۹۰۰ هزار تومان · کیلومتر ۱۵۶۰۰۰\nخرابی: صدای جلوبندی\nجریمه سرعت ۵۰۰ هزار تومان\nکارواش ۱۸۰ هزار تومان';
      try { await navigator.clipboard.writeText(help); showToast('نمونه دستورهای ثبت خودرو کپی شد.'); }
      catch { showToast('کپی خودکار در این مرورگر در دسترس نیست.'); }
    });
    initTilt();
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
        if (!event || !event.id || seen.has(event.id)) return false;
        seen.add(event.id); return true;
      }).sort((a, b) => String(a.occurredAt || '').localeCompare(String(b.occurredAt || '')) || String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
      state.refreshedAt = new Date();
      populateMonthFilter();
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
    }
  }

  function renderAll() {
    renderStats();
    renderServices();
    renderAnalytics();
    updateJournal();
    renderFinesAndIssues();
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
    const nowMonth = localDateString(new Date()).slice(0, 7);
    const months = getMonthKeys(nowMonth, state.range);
    const distanceEntries = calculateDistanceEntries(state.events);
    const datasets = months.map(month => {
      const items = state.events.filter(e => String(e.date || e.occurredAt || '').slice(0, 7) === month);
      return {
        month,
        label: monthShort(month),
        cost: sum(state.events.filter(e => isActualExpense(e) && expenseDate(e).slice(0, 7) === month), e => e.costRial) / 10,
        fuel: sum(items.filter(e => e.type === 'fuel'), e => e.liters),
        distance: distanceEntries.filter(entry => String(entry.date).slice(0, 7) === month).reduce((total, entry) => total + entry.distanceKm, 0)
      };
    });
    const totalCost = datasets.reduce((s, d) => s + d.cost, 0);
    const totalFuel = datasets.reduce((s, d) => s + d.fuel, 0);
    $('#costChartTotal').textContent = moneyText(totalCost) + ' تومان';
    $('#fuelChartTotal').textContent = `${formatNumber(totalFuel, 1)} لیتر`;
    $('#costChart').innerHTML = barChart(datasets, 'cost', { id: 'expense', color: 'cyan', empty: 'در بازه انتخابی هزینه‌ای ثبت نشده است.' });
    $('#fuelChart').innerHTML = mixedChart(datasets);
    renderInsights(datasets);
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
    const bars = data.map((d, i) => {
      const bh = (d[key] / max) * plotH;
      const x = left + i * slot + (slot - barW) / 2;
      const y = top + plotH - bh;
      return `<g><title>${escapeHtml(d.month)}: ${moneyText(d[key])} تومان</title><rect class="bar-expense" x="${x}" y="${y}" width="${barW}" height="${Math.max(0,bh)}" rx="5"/><text class="axis-text" x="${x+barW/2}" y="${height-10}" text-anchor="middle">${escapeHtml(d.label)}</text></g>`;
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
    const labels = data.map((d,i)=>`<text class="axis-text" x="${left+i*slot+slot/2}" y="${height-10}" text-anchor="middle">${escapeHtml(d.label)}</text>`).join('');
    return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="نمودار سوخت و مسافت"><defs><linearGradient id="fuelGradient" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#ffbc79"/><stop offset="1" stop-color="#bb6a4b" stop-opacity=".42"/></linearGradient></defs>${grid}${bars}<path class="line-distance" d="${path}"/>${circles}${labels}</svg><div class="chart-legend"><span><i class="legend-fuel"></i>سوخت (لیتر)</span><span><i class="legend-distance"></i>مسافت (کیلومتر، مقیاس مستقل)</span></div>`;
  }

  function renderInsights(datasets) {
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
    $('#driveInsight').textContent = totalDistance ? `در ${formatNumber(activeMonths)} ماه از بازه انتخابی، ${formatNumber(totalDistance)} کیلومتر مسافت ثبت شده است. اگر فقط کارکرد کیلومترشمار را ثبت کرده باشی، مسافت بین ثبت‌ها جداگانه قابل تخمین است.` : 'مسافتی در بازه انتخابی محاسبه نشده؛ ثبت کیلومترشمار در چند نوبت روز یا استفاده از /trip تحلیل را دقیق‌تر می‌کند.';
  }

  function updateJournal() {
    state.shown = 12;
    const query = ($('#searchInput').value || '').trim().toLowerCase();
    const type = $('#typeFilter').value;
    const month = $('#monthFilter').value;
    state.filtered = state.events.filter(event => {
      const searchText = [event.title,event.description,event.serviceLabel,event.serviceKey,event.id,event.jalaliDate,event.date,event.costRial,event.odometerKm].join(' ').toLowerCase();
      return (type === 'all' || event.type === type) && (month === 'all' || String(event.date || event.occurredAt || '').slice(0,7) === month) && (!query || searchText.includes(query));
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
      return `<article class="event-row"><div class="event-icon ${escapeAttr(event.type)}">${icon}</div><div class="event-body"><div class="event-title-line"><span class="event-title">${escapeHtml(event.title || typeLabels[event.type] || 'رویداد')}</span><span class="event-pill">${escapeHtml(typeLabels[event.type] || event.type || 'رویداد')}</span>${status ? `<span class="event-pill">${escapeHtml(status)}</span>` : ''}</div><div class="event-description">${escapeHtml(desc)}</div><div class="event-meta"><span>${eventDate}</span><span>${time}</span>${odo}${distance}${liters}<span>ID: ${escapeHtml(String(event.id).slice(0,8))}</span></div></div>${cost}</article>`;
    }).join('');
  }

  function renderFinesAndIssues() {
    const fines = state.events.filter(e => e.type === 'fine').sort((a,b)=>eventEpoch(b)-eventEpoch(a));
    const unpaid = fines.filter(e => !e.paid);
    $('#fineTotals').textContent = `مجموع بدهی: ${moneyText(sum(unpaid,e=>e.costRial)/10)} تومان`;
    $('#fineSummary').innerHTML = fines.length ? fines.slice(0,4).map(e=>`<div class="mini-row"><div class="mini-row-main"><div class="mini-row-title">${escapeHtml(e.description || 'جریمه ثبت‌شده')}</div><div class="mini-row-meta">${escapeHtml(e.jalaliDate || e.date || '—')} · ${String(e.id).slice(0,8)}</div></div><div class="mini-row-value ${e.paid?'paid':''}">${escapeHtml(moneyText((Number(e.costRial)||0)/10))}<div class="mini-row-meta">${e.paid?'پرداخت شد':'پرداخت‌نشده'}</div></div></div>`).join('') : '<div class="empty-state">جریمه‌ای ثبت نشده است.</div>';
    const issues = state.events.filter(e => e.type === 'issue' || e.type === 'repair').sort((a,b)=>eventEpoch(b)-eventEpoch(a));
    const open = issues.filter(e=>e.type==='issue' && e.status!=='fixed');
    $('#issueTotals').textContent = `خرابی باز: ${formatNumber(open.length)}`;
    $('#issueSummary').innerHTML = issues.length ? issues.slice(0,4).map(e=>`<div class="mini-row"><div class="mini-row-main"><div class="mini-row-title">${escapeHtml(e.title || (e.type==='repair'?'تعمیر':'خرابی'))}</div><div class="mini-row-desc">${escapeHtml((e.description || '').slice(0,100))}</div><div class="mini-row-meta">${escapeHtml(e.jalaliDate || e.date || '—')} · ${e.status==='fixed'?'رفع‌شده':e.type==='repair'?'تعمیر':'باز'}</div></div><div class="mini-row-value ${e.status==='fixed'?'paid':''}">${Number(e.costRial)>0?escapeHtml(moneyText(Number(e.costRial)/10))+' تومان':e.status==='fixed'?'✓':'—'}</div></div>`).join('') : '<div class="empty-state">خرابی‌ای ثبت نشده است.</div>';
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
    const keys = ['id','type','title','description','occurredAt','jalaliDate','date','time','odometerKm','distanceKm','liters','costRial','serviceKey','paid','paidAt','repairCostRial','resolvedAt','repairDescription','status','fullTank'];
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

  function calculateDistanceEntries(events) {
    const odometers = events.filter(e=>e.type==='odometer' && e.odometerKm!==null && e.odometerKm!==undefined && Number.isFinite(Number(e.odometerKm))).sort((a,b)=>eventEpoch(a)-eventEpoch(b));
    const coveredTrips = new Set();
    const result = [];
    for (let i=1;i<odometers.length;i++) {
      const previous=odometers[i-1], current=odometers[i];
      const delta=Number(current.odometerKm)-Number(previous.odometerKm);
      if (delta<=0 || delta>5000) continue;
      const start=eventEpoch(previous), end=eventEpoch(current);
      for (const trip of events) if (trip.type==='trip' && eventEpoch(trip)>start && eventEpoch(trip)<=end) coveredTrips.add(trip.id);
      result.push({date:current.date || String(current.occurredAt||'').slice(0,10),occurredAt:current.occurredAt,distanceKm:delta,source:'odometer_delta'});
    }
    for (const event of events) if (event.type==='trip' && !coveredTrips.has(event.id) && Number(event.distanceKm)>0) result.push({date:event.date || String(event.occurredAt||'').slice(0,10),occurredAt:event.occurredAt,distanceKm:Number(event.distanceKm),source:'trip'});
    return result.sort((a,b)=>eventEpoch(a)-eventEpoch(b));
  }
  function countOdometerSources(events) { return events.filter(e=>e.type==='odometer'||e.type==='trip').length; }
  function sum(rows, selector) { return rows.reduce((total,row)=>total+(Number(selector(row))||0),0); }
  function eventEpoch(event) { const t = Date.parse(event?.occurredAt || event?.date || event?.createdAt || ''); return Number.isFinite(t) ? t : 0; }
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
