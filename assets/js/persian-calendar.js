(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.GaragePersianCalendar = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const TIME_ZONE = 'Asia/Tehran';
  const MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
  const PERSIAN_PARTS = new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit'
  });
  const GREGORIAN_PARTS = new Intl.DateTimeFormat('en-CA-u-nu-latn', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  });
  const PERSIAN_TIME = new Intl.DateTimeFormat('fa-IR-u-nu-latn', {
    timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  });
  const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

  function toPersianDigits(value) {
    return String(value).replace(/\d/g, digit => PERSIAN_DIGITS[Number(digit)]);
  }

  function parseDate(value) {
    if (value instanceof Date) return Number.isFinite(value.getTime()) ? new Date(value.getTime()) : null;
    const raw = String(value == null ? '' : value).trim();
    if (!raw) return null;
    // A date-only ISO string is a Tehran calendar day, not a UTC instant.
    // Parse it at local noon so the displayed day cannot shift at midnight.
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      const [year, month, day] = raw.split('-').map(Number);
      if (!isValidGregorianDate(year, month, day)) return null;
      const date = new Date(`${raw}T12:00:00+03:30`);
      return Number.isFinite(date.getTime()) ? date : null;
    }
    const date = new Date(raw);
    return Number.isFinite(date.getTime()) ? date : null;
  }

  function isValidGregorianDate(year, month, day) {
    if (![year, month, day].every(Number.isInteger) || year < 1600 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) return false;
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day;
  }

  function parts(formatter, value) {
    const date = parseDate(value);
    if (!date) return null;
    const result = {};
    for (const item of formatter.formatToParts(date)) {
      if (item.type !== 'literal' && item.type !== 'era') result[item.type] = item.value;
    }
    return result;
  }

  function formatDate(value, options = {}) {
    const result = parts(PERSIAN_PARTS, value);
    if (!result?.year || !result?.month || !result?.day) return '';
    const separator = options.separator ?? '/';
    const month = String(Number(result.month)).padStart(2, '0');
    const day = String(Number(result.day)).padStart(2, '0');
    const output = `${result.year}${separator}${month}${separator}${day}`;
    return options.digits === 'latin' ? output : toPersianDigits(output);
  }

  function formatTime(value) {
    const date = parseDate(value);
    return date ? PERSIAN_TIME.format(date) : '';
  }

  function formatDateTime(value) {
    const date = parseDate(value);
    if (!date) return '';
    const dateLabel = formatDate(date);
    const timeLabel = formatTime(date);
    return [dateLabel, timeLabel].filter(Boolean).join(' · ');
  }

  function gregorianDateKey(value) {
    const result = parts(GREGORIAN_PARTS, value);
    return result?.year && result?.month && result?.day
      ? `${result.year}-${String(result.month).padStart(2, '0')}-${String(result.day).padStart(2, '0')}`
      : '';
  }

  function gregorianHourKey(value) {
    const result = parts(GREGORIAN_PARTS, value);
    return result?.hour ? String(result.hour).padStart(2, '0') : '';
  }

  function monthKey(value) {
    const result = parts(PERSIAN_PARTS, value);
    return result?.year && result?.month
      ? `${result.year}-${String(Number(result.month)).padStart(2, '0')}`
      : '';
  }

  function monthKeyFromEvent(event) {
    return monthKey(event && (event.occurredAt || event.date || event.createdAt));
  }

  function eventDateLabel(event) {
    if (!event || typeof event !== 'object') return formatDate(event);
    return formatDate(event.occurredAt || event.date || event.createdAt || '');
  }

  function monthLabel(key, numberFormatter = value => toPersianDigits(value)) {
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

  function addGregorianDays(dateKey, amount) {
    const [year, month, day] = String(dateKey || '').split('-').map(Number);
    if (!isValidGregorianDate(year, month, day)) return '';
    const date = new Date(Date.UTC(year, month - 1, day + Number(amount || 0)));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
  }

  return Object.freeze({
    timeZone: TIME_ZONE, parseDate, formatDate, formatTime, formatDateTime,
    gregorianDateKey, gregorianHourKey, monthKey, monthKeyFromEvent,
    eventDateLabel, monthLabel, previousMonthKeys, addGregorianDays,
    toPersianDigits, isValidGregorianDate
  });
});
