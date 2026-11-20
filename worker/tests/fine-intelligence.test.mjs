import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateFineTimeline, isDoubleSheetFine } from '../../assets/js/fine-intelligence.mjs';

test('two-sheet fines receive estimated follow-up deadline and doubling warning after expiry', () => {
  const fine = { type: 'fine', ticketType: 'دوبرگی', ticketDate: '2026-01-01', costRial: 500000, paid: false };
  const timeline = calculateFineTimeline(fine, '2026-03-05');
  assert.equal(isDoubleSheetFine(fine), true);
  assert.equal(timeline.deadlineDate, '2026-03-02');
  assert.equal(timeline.expired, true);
  assert.equal(timeline.potentialAmountRial, 1000000);
  assert.match(timeline.eligibilityLabel, /دوبرگی/);
});

test('camera-based fines never receive automatic late tracking or doubling', () => {
  const fine = { type: 'fine', cameraCode: '616028', ticketDate: '2026-01-01', costRial: 1000000, paid: false };
  const timeline = calculateFineTimeline(fine, '2026-05-01');
  assert.equal(timeline.deadlineDate, null);
  assert.equal(timeline.daysToDeadline, null);
  assert.equal(timeline.potentialAmountRial, null);
  assert.equal(timeline.doubleSheetEligible, false);
  assert.match(timeline.statusLabel, /بدون دیرکرد خودکار/);
});

test('unknown and non-two-sheet manual fine types do not get an automatic deadline', () => {
  const timeline = calculateFineTimeline({ ticketDate: '2026-01-01', costRial: 200000, paid: false }, '2026-05-01');
  assert.equal(timeline.deadlineDate, null);
  assert.equal(timeline.potentialAmountRial, null);
});

test('explicit deadlines remain reminders but do not imply a doubled amount for camera tickets', () => {
  const timeline = calculateFineTimeline({ ticketType: 'دوربینی', cameraCode: '12345', ticketDate: '2026-01-01', deadlineDate: '2026-02-01', costRial: 300000, paid: false }, '2026-03-01');
  assert.equal(timeline.deadlineDate, '2026-02-01');
  assert.equal(timeline.expired, true);
  assert.equal(timeline.potentialAmountRial, null);
  assert.equal(timeline.deadlineBasis, 'user-defined-reminder');
});

test('appeal follow-up deadline is only generated for a two-sheet fine', () => {
  const fine = { ticketType: 'دوبرگی', ticketDate: '2026-01-01', appealed: true, appealDecisionDate: '2026-02-10', costRial: 400000 };
  const timeline = calculateFineTimeline(fine, '2026-03-01');
  assert.equal(timeline.deadlineDate, '2026-03-02');
  assert.equal(timeline.deadlineBasis, 'two-sheet-appeal-decision-plus-20-days');
  assert.equal(timeline.potentialAmountRial, null, 'doubling is only a warning after the follow-up deadline passes');
});


test('fine timeline default date follows the synchronized Tehran clock across a UTC date boundary', () => {
  const previous = globalThis.GarageClock;
  globalThis.GarageClock = { nowDate: () => new Date('2026-11-20T21:30:00.000Z') };
  try {
    const timeline = calculateFineTimeline({ ticketType: 'دوبرگی', ticketDate: '2026-11-20', costRial: 100000, paid: false });
    assert.equal(timeline.elapsedDays, 1, '21:30 UTC is already the next date in Tehran');
  } finally {
    if (previous === undefined) delete globalThis.GarageClock;
    else globalThis.GarageClock = previous;
  }
});
