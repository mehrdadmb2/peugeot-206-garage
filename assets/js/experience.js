/* Peugeot 206 Garage v3.15.0 — command palette, personalization and workspace utilities */
(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const STORAGE_KEY = 'garage.workspace.preferences.v1';
  const VALID_ACCENTS = new Set(['blue', 'mint', 'amber']);
  const tabs = [
    { key: 'overview', title: 'داشبورد و نمای کلی', icon: '◈', keywords: 'خانه آمار کیلومتر کارکرد وضعیت خودرو' },
    { key: 'maintenance', title: 'سرویس و نگهداری', icon: '⚙', keywords: 'قطعات موعد سرویس روغن فیلتر باتری تعمیر' },
    { key: 'fuel', title: 'سوخت و مصرف بنزین', icon: '⛽', keywords: 'بنزین لیتر مصرف میانگین باک کامل' },
    { key: 'analytics', title: 'تحلیل و نمودارها', icon: '⌁', keywords: 'آمار راننده هزینه روند ماهانه نمودار' },
    { key: 'expenses', title: 'هزینه‌ها و مخارج', icon: '◉', keywords: 'پرداخت مبلغ تعمیرگاه خرید مخارج' },
    { key: 'traffic', title: 'جریمه و خرابی‌ها', icon: '⚑', keywords: 'خلافی قبض بدهی پرداخت نشده مشکل تعمیر' },
    { key: 'journal', title: 'دفتر وقایع و سوابق', icon: '▤', keywords: 'جست‌وجو سوابق تاریخچه عملیات راننده' },
    { key: 'documents', title: 'مدارک خصوصی خودرو', icon: '▣', keywords: 'بیمه کارت ماشین گواهینامه معاینه فنی پلاک' },
    { key: 'settings', title: 'راهنما و دستورات ربات', icon: '⌘', keywords: 'تلگرام api worker راهنما فرمان دستور' }
  ];

  let preferences = { accent: 'blue', compact: false, reduceMotion: false };
  let installPrompt = null;
  let searchResults = [];
  let activeResultIndex = -1;
  let scrollTicking = false;

  function normalize(value) {
    return String(value ?? '').normalize('NFKC').toLocaleLowerCase('fa')
      .replace(/[يى]/g, 'ی').replace(/ك/g, 'ک')
      .replace(/[۰-۹]/g, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
      .replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
      .replace(/\s+/g, ' ').trim();
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
  }

  function notify(message) {
    const toast = $('#toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    window.clearTimeout(notify.timer);
    notify.timer = window.setTimeout(() => toast.classList.remove('show'), 2800);
  }

  function readPreferences() {
    try {
      const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}');
      if (stored && typeof stored === 'object') {
        preferences = {
          accent: VALID_ACCENTS.has(stored.accent) ? stored.accent : 'blue',
          compact: stored.compact === true,
          reduceMotion: stored.reduceMotion === true
        };
      }
    } catch { /* Private browsing or storage restrictions: use in-memory defaults. */ }
  }

  function savePreferences() {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences)); }
    catch { notify('تنظیمات فقط تا زمان باز بودن این صفحه نگهداری می‌شوند.'); }
  }

  function applyPreferences() {
    const root = document.documentElement;
    root.dataset.accent = preferences.accent;
    root.dataset.density = preferences.compact ? 'compact' : 'comfortable';
    root.dataset.motion = preferences.reduceMotion ? 'off' : 'on';

    $$('[data-accent-choice]').forEach(button => {
      button.setAttribute('aria-pressed', button.dataset.accentChoice === preferences.accent ? 'true' : 'false');
    });
    const compact = $('#garageCompactToggle');
    const motion = $('#garageMotionToggle');
    if (compact) compact.checked = preferences.compact;
    if (motion) motion.checked = preferences.reduceMotion;

    const themeColor = $('#theme-color') || $('meta[name="theme-color"]');
    if (themeColor) {
      const colors = { blue: '#071522', mint: '#071b17', amber: '#1b1209' };
      themeColor.setAttribute('content', colors[preferences.accent]);
    }
  }

  function openAppearance() {
    const panel = $('#garageAppearancePanel');
    const trigger = $('#garageAppearanceOpen');
    if (!panel || !trigger) return;
    panel.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    $('#garageAppearanceClose')?.focus({ preventScroll: true });
  }

  function closeAppearance() {
    const panel = $('#garageAppearancePanel');
    const trigger = $('#garageAppearanceOpen');
    if (panel) panel.hidden = true;
    trigger?.setAttribute('aria-expanded', 'false');
  }

  function toggleAppearance() {
    const panel = $('#garageAppearancePanel');
    if (!panel) return;
    if (panel.hidden) openAppearance();
    else closeAppearance();
  }

  function formatNumber(value) {
    return new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 0 }).format(Number(value) || 0);
  }

  function getCommandDialog() { return $('#garageCommandDialog'); }

  function openCommandPalette() {
    const dialog = getCommandDialog();
    const input = $('#garageCommandSearch');
    if (!dialog || !input) return;
    closeAppearance();
    if (typeof dialog.showModal === 'function' && !dialog.open) dialog.showModal();
    else dialog.setAttribute('open', '');
    input.value = '';
    renderSearchResults('');
    window.requestAnimationFrame(() => input.focus({ preventScroll: true }));
  }

  function closeCommandPalette(restoreFocus = true) {
    const dialog = getCommandDialog();
    if (!dialog) return;
    if (typeof dialog.close === 'function' && dialog.open) dialog.close();
    else dialog.removeAttribute('open');
    if (restoreFocus) $('#garageCommandOpen')?.focus({ preventScroll: true });
  }

  function groupMarkup(title, items) {
    if (!items.length) return '';
    return `<div class="garage-result-group-title">${escapeHtml(title)}</div>${items.map(item => `
      <button type="button" class="garage-result-item" role="option" data-kind="${escapeHtml(item.kind)}" data-result-key="${escapeHtml(item.key)}">
        <span class="garage-result-icon" aria-hidden="true">${escapeHtml(item.icon || '⌕')}</span>
        <span class="garage-result-copy"><b>${escapeHtml(item.title)}</b><small>${escapeHtml(item.subtitle || '')}</small></span>
        <span class="garage-result-side">${item.side ? `<strong>${escapeHtml(item.side)}</strong>` : ''}<span>${escapeHtml(item.hint || 'بازکردن')} ↵</span></span>
      </button>`).join('')}`;
  }

  function renderSearchResults(rawQuery) {
    const host = $('#garageCommandResults');
    const counter = $('#garageCommandCount');
    if (!host) return;
    const query = normalize(rawQuery);
    const terms = query.split(' ').filter(Boolean);
    const matches = value => {
      const text = normalize(value);
      return terms.every(term => text.includes(term));
    };

    const matchingTabs = tabs.filter(tab => !query || matches(`${tab.title} ${tab.keywords} ${tab.key}`)).slice(0, 5)
      .map(tab => ({ kind: 'tab', key: tab.key, icon: tab.icon, title: tab.title, subtitle: tab.keywords, hint: 'رفتن به بخش' }));

    const matchingEvents = query && window.GarageApp?.searchEvents
      ? window.GarageApp.searchEvents(query, 7).map(event => ({
        kind: 'event', key: event.id, icon: event.type === 'سوخت‌گیری' ? '⛽' : event.type === 'جریمه' ? '⚑' : '▤',
        title: event.title,
        subtitle: [event.date, event.actor, event.description].filter(Boolean).join(' · ') || 'بدون توضیح',
        side: event.amountToman != null ? `${formatNumber(event.amountToman)} تومان` : event.odometerKm != null ? `${formatNumber(event.odometerKm)} km` : '',
        hint: 'مشاهده رویداد'
      })) : [];

    const guideCards = query ? $$('.guide-card').filter(card => matches(`${card.dataset.search || ''} ${card.textContent || ''}`)).slice(0, 5) : [];
    const guideItems = guideCards.map((card, index) => ({
      kind: 'guide', key: String($$('.guide-card').indexOf(card)), icon: '⌘',
      title: card.querySelector('span')?.textContent?.trim() || 'دستور ربات',
      subtitle: card.querySelector('code')?.textContent?.trim() || 'راهنمای ربات تلگرام', hint: 'مشاهده راهنما'
    }));

    const quickActions = !query ? [
      { kind: 'tab', key: 'journal', icon: '▤', title: 'جست‌وجو در دفتر وقایع', subtitle: 'سوابق بر اساس شرح، شخص و تاریخ', hint: 'رفتن به بخش' },
      { kind: 'tab', key: 'maintenance', icon: '⚙', title: 'بررسی سرویس‌های خودرو', subtitle: 'موعدهای نگهداری و قطعات', hint: 'رفتن به بخش' },
      { kind: 'refresh', key: 'refresh', icon: '↻', title: 'تازه‌سازی اطلاعات', subtitle: 'دریافت آخرین داده‌ها از مخزن', hint: 'اجرای عملیات' }
    ] : [];

    searchResults = [...matchingEvents, ...matchingTabs, ...guideItems, ...quickActions];
    activeResultIndex = searchResults.length ? 0 : -1;
    if (counter) counter.textContent = query ? `${formatNumber(searchResults.length)} نتیجه پیدا شد` : 'دسترسی‌های پیشنهادی';

    if (!searchResults.length) {
      host.innerHTML = '<div class="garage-result-empty"><b>نتیجه‌ای پیدا نشد</b><span>عبارت را کوتاه‌تر کن یا با واژه‌های دیگری مثل «روغن»، «راننده»، «جریمه» یا «سوخت» جست‌وجو کن.</span></div>';
      return;
    }

    const sections = [
      groupMarkup('RECENT VEHICLE RECORDS', searchResults.filter(item => item.kind === 'event')),
      groupMarkup('DASHBOARD SECTIONS', searchResults.filter(item => item.kind === 'tab')),
      groupMarkup('BOT COMMAND GUIDE', searchResults.filter(item => item.kind === 'guide')),
      groupMarkup('QUICK ACTIONS', searchResults.filter(item => item.kind === 'refresh'))
    ].filter(Boolean);
    host.innerHTML = sections.join('');
    updateActiveResult();
  }

  function updateActiveResult() {
    const host = $('#garageCommandResults');
    if (!host) return;
    const buttons = $$('.garage-result-item', host);
    buttons.forEach((button, index) => {
      const active = index === activeResultIndex;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
      if (active) button.scrollIntoView({ block: 'nearest' });
    });
  }

  function activateResult(button) {
    if (!button) return;
    const kind = button.dataset.kind;
    const key = button.dataset.resultKey || '';
    closeCommandPalette(false);
    if (kind === 'tab') {
      window.GarageApp?.navigate(key);
      return;
    }
    if (kind === 'event') {
      const opened = window.GarageApp?.openEvent(key);
      if (!opened) notify('این رویداد دیگر در داده‌های فعلی موجود نیست.');
      return;
    }
    if (kind === 'guide') {
      const card = $$('.guide-card')[Number(key)];
      window.GarageApp?.navigate('settings');
      window.setTimeout(() => card?.scrollIntoView({ behavior: preferences.reduceMotion ? 'auto' : 'smooth', block: 'center' }), 120);
      return;
    }
    if (kind === 'refresh') window.GarageApp?.refresh();
  }

  function initClock() {
    const clock = $('#garageClock');
    if (!clock) return;
    const update = () => {
      const now = new Date();
      const time = new Intl.DateTimeFormat('fa-IR', { timeZone: 'Asia/Tehran', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
      const date = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { timeZone: 'Asia/Tehran', day: 'numeric', month: 'short' }).format(now);
      const b = clock.querySelector('b');
      if (b) b.textContent = time;
      clock.title = `تهران · ${date}`;
    };
    update();
    window.setInterval(update, 30000);
  }

  function initScrollUtilities() {
    const progress = document.createElement('div');
    progress.className = 'garage-scroll-progress';
    progress.setAttribute('aria-hidden', 'true');
    progress.innerHTML = '<span></span>';
    document.body.appendChild(progress);

    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'garage-back-top';
    back.setAttribute('aria-label', 'بازگشت به بالای صفحه');
    back.title = 'بازگشت به بالا';
    back.textContent = '↑';
    document.body.appendChild(back);
    back.addEventListener('click', () => window.scrollTo({ top: 0, behavior: preferences.reduceMotion ? 'auto' : 'smooth' }));

    const update = () => {
      const root = document.documentElement;
      const scrollable = Math.max(1, root.scrollHeight - window.innerHeight);
      const percentage = Math.min(100, Math.max(0, window.scrollY / scrollable * 100));
      const bar = progress.firstElementChild;
      if (bar) bar.style.width = `${percentage.toFixed(2)}%`;
      back.classList.toggle('is-visible', window.scrollY > 480);
      scrollTicking = false;
    };
    window.addEventListener('scroll', () => {
      if (scrollTicking) return;
      scrollTicking = true;
      window.requestAnimationFrame(update);
    }, { passive: true });
    window.addEventListener('resize', update, { passive: true });
    update();
  }

  function initInstallPrompt() {
    const button = $('#garageInstallApp');
    if (!button) return;
    window.addEventListener('beforeinstallprompt', event => {
      event.preventDefault();
      installPrompt = event;
      button.hidden = false;
    });
    button.addEventListener('click', async () => {
      if (!installPrompt) return;
      try {
        installPrompt.prompt();
        await installPrompt.userChoice;
      } catch { notify('درخواست نصب در این مرورگر در دسترس نیست.'); }
      installPrompt = null;
      button.hidden = true;
    });
    window.addEventListener('appinstalled', () => {
      installPrompt = null;
      button.hidden = true;
      notify('برنامه با موفقیت به دستگاه اضافه شد.');
    });
  }

  function initEvents() {
    $('#garageCommandOpen')?.addEventListener('click', openCommandPalette);
    $('#garageCommandClose')?.addEventListener('click', () => closeCommandPalette());
    $('#garageAppearanceOpen')?.addEventListener('click', toggleAppearance);
    $('#garageAppearanceClose')?.addEventListener('click', closeAppearance);

    $('#garageAppearancePanel')?.addEventListener('click', event => {
      const choice = event.target.closest('[data-accent-choice]');
      if (choice) {
        const accent = choice.dataset.accentChoice;
        if (!VALID_ACCENTS.has(accent)) return;
        preferences.accent = accent;
        applyPreferences();
        savePreferences();
        notify('پالت رنگ ذخیره شد.');
      }
    });

    $('#garageCompactToggle')?.addEventListener('change', event => {
      preferences.compact = event.target.checked;
      applyPreferences();
      savePreferences();
    });
    $('#garageMotionToggle')?.addEventListener('change', event => {
      preferences.reduceMotion = event.target.checked;
      applyPreferences();
      savePreferences();
    });
    $('#garageResetAppearance')?.addEventListener('click', () => {
      preferences = { accent: 'blue', compact: false, reduceMotion: false };
      applyPreferences();
      savePreferences();
      notify('تنظیمات ظاهری به حالت اولیه برگشت.');
    });

    $('#garageCommandSearch')?.addEventListener('input', event => renderSearchResults(event.target.value));
    $('#garageCommandResults')?.addEventListener('click', event => {
      const button = event.target.closest('.garage-result-item');
      if (button) activateResult(button);
    });

    getCommandDialog()?.addEventListener('click', event => {
      if (event.target === getCommandDialog()) closeCommandPalette();
    });
    getCommandDialog()?.addEventListener('keydown', event => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        const buttons = $$('.garage-result-item', $('#garageCommandResults'));
        if (!buttons.length) return;
        event.preventDefault();
        const delta = event.key === 'ArrowDown' ? 1 : -1;
        activeResultIndex = (activeResultIndex + delta + buttons.length) % buttons.length;
        updateActiveResult();
      } else if (event.key === 'Enter') {
        const button = $$('.garage-result-item', $('#garageCommandResults'))[activeResultIndex];
        if (button) { event.preventDefault(); activateResult(button); }
      }
    });

    document.addEventListener('click', event => {
      const panel = $('#garageAppearancePanel');
      if (panel && !panel.hidden && !panel.contains(event.target) && !$('#garageAppearanceOpen')?.contains(event.target)) closeAppearance();
    });

    document.addEventListener('keydown', event => {
      const target = event.target;
      const typing = target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        openCommandPalette();
      } else if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'p') {
        event.preventDefault();
        openAppearance();
      } else if (!typing && event.key === '/' && !event.altKey && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        openCommandPalette();
      } else if (!typing && event.altKey && /^[1-9]$/.test(event.key)) {
        event.preventDefault();
        window.GarageApp?.navigate(tabs[Number(event.key) - 1]?.key || 'overview');
      } else if (event.key === 'Escape') {
        closeAppearance();
      }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    readPreferences();
    applyPreferences();
    initEvents();
    initClock();
    initScrollUtilities();
    initInstallPrompt();
  }, { once: true });
})();
