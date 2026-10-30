(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GaragePersianCalendar = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const TIME_ZONE = 'Asia/Tehran';
  const FORMATTER = new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit'
  });
  const MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];

  function asDate(value) {
    if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
    const raw = String(value == null ? '' : value).trim();
    if (!raw) return null;
    const date = /^\d{4}-\d{2}-\d{2}$/.test(raw)
      ? new Date(`${raw}T12:00:00+03:30`)
      : new Date(raw);
    return Number.isFinite(date.getTime()) ? date : null;
  }

  function monthKey(value) {
    const date = asDate(value);
    if (!date) return '';
    const parts = Object.fromEntries(FORMATTER.formatToParts(date)
      .filter(part => part.type !== 'literal' && part.type !== 'era')
      .map(part => [part.type, part.value]));
    return parts.year && parts.month ? `${parts.year}-${String(parts.month).padStart(2, '0')}` : '';
  }

  function monthKeyFromEvent(event) {
    return monthKey(event && (event.occurredAt || event.date || event.createdAt));
  }

  function monthLabel(key, numberFormatter = value => String(value)) {
    const [year, month] = String(key || '').split('-').map(Number);
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return String(key || 'ماه نامشخص');
    return `${MONTHS[month - 1]} ${numberFormatter(year)}`;
  }

  function previousMonthKeys(lastKey, count) {
    let [year, month] = String(lastKey || '').split('-').map(Number);
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return [];
    const result = [];
    for (let index = 0; index < Math.max(0, Number(count) || 0); index++) {
      result.unshift(`${year}-${String(month).padStart(2, '0')}`);
      month -= 1;
      if (month < 1) { month = 12; year -= 1; }
    }
    return result;
  }

  return Object.freeze({ timeZone: TIME_ZONE, monthKey, monthKeyFromEvent, monthLabel, previousMonthKeys });
});
