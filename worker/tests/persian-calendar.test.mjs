import test from 'node:test';
import assert from 'node:assert/strict';
import PersianCalendar from '../../assets/js/persian-calendar.js';

test('Persian calendar formats ISO date-only values in Tehran without UTC day drift', () => {
  assert.equal(PersianCalendar.formatDate('2026-11-20'), '۱۴۰۵/۰۸/۲۹');
  assert.equal(PersianCalendar.gregorianDateKey('2026-11-20'), '2026-11-20');
  assert.equal(PersianCalendar.monthKey('2026-11-20'), '1405-08');
});

test('Persian calendar handles exact Tehran midnight and Solar Hijri year boundaries', () => {
  assert.equal(PersianCalendar.formatDate('2026-10-22T20:29:59Z'), '۱۴۰۵/۰۷/۳۰');
  assert.equal(PersianCalendar.formatDate('2026-10-22T20:30:00Z'), '۱۴۰۵/۰۸/۰۱');
  assert.equal(PersianCalendar.formatDate('2026-03-20T20:29:59Z'), '۱۴۰۴/۱۲/۲۹');
  assert.equal(PersianCalendar.formatDate('2026-03-20T20:30:00Z'), '۱۴۰۵/۰۱/۰۱');
});

test('event date labels ignore stale cached Jalali strings and use occurredAt as source of truth', () => {
  const event = {
    date: '2026-11-19',
    occurredAt: '2026-11-20T00:05:00+03:30',
    jalaliDate: '۱۴۰۵/۰۸/۲۸'
  };
  assert.equal(PersianCalendar.eventDateLabel(event), '۱۴۰۵/۰۸/۲۹');
  assert.equal(PersianCalendar.monthKeyFromEvent(event), '1405-08');
});

test('month windows cross Esfand/Farvardin and month names are stable', () => {
  assert.deepEqual(PersianCalendar.previousMonthKeys('1405-01', 3), ['1404-11', '1404-12', '1405-01']);
  assert.equal(PersianCalendar.monthLabel('1405-08'), 'آبان ۱۴۰۵');
});
