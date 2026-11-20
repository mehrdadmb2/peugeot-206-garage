/** Shared Road Police fine timing and late-payment eligibility rules. */
function validIsoDate(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

function dateFromEvent(event) {
  return validIsoDate(event?.ticketDate) || validIsoDate(event?.date) || validIsoDate(String(event?.occurredAt || '').slice(0, 10));
}

function addDays(dateValue, days) {
  const date = validIsoDate(dateValue);
  if (!date) return null;
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function daysBetween(from, to) {
  const start = validIsoDate(from);
  const end = validIsoDate(to);
  if (!start || !end) return null;
  return Math.round((Date.parse(`${end}T12:00:00.000Z`) - Date.parse(`${start}T12:00:00.000Z`)) / 86_400_000);
}

function currentTehranDate() {
  const date = globalThis.GarageClock?.nowDate?.() || new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date);
  const fields = Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  return `${fields.year}-${fields.month}-${fields.day}`;
}

function normalizeType(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/[\u200c\u200d\sـ]/g, '')
    .replace(/[يى]/g, 'ی')
    .replace(/[ك]/g, 'ک')
    .toLocaleLowerCase('fa');
}

export function isDoubleSheetFine(event) {
  const ticketType = normalizeType(event?.ticketType);
  if (/دوبرگی|دوبرگ/.test(ticketType)) return true;
  // Backward compatibility for imported SMS records missing the parsed field.
  const sms = normalizeType(event?.originalSms || event?.note || '');
  return /نوعقبض[:：]?دوبرگی/.test(sms);
}

/**
 * Automatic late tracking and doubling hints are intentionally limited to
 * messages whose ticket type explicitly says «دوبرگی». Camera/automatic and
 * unknown ticket types never receive an automatic 60-day deadline or doubling.
 * Explicit user-entered deadlines remain reminders but do not imply doubling.
 */
export function calculateFineTimeline(event, nowDate = currentTehranDate()) {
  const ticketDate = dateFromEvent(event);
  const appealDate = validIsoDate(event?.appealDecisionDate);
  const explicitDeadline = validIsoDate(event?.deadlineDate);
  const doubleSheetEligible = isDoubleSheetFine(event);
  let deadlineDate = explicitDeadline;
  let deadlineBasis = explicitDeadline ? 'user-defined-reminder' : null;

  if (!deadlineDate && doubleSheetEligible) {
    if (event?.appealed && appealDate) {
      deadlineDate = addDays(appealDate, 20);
      deadlineBasis = 'two-sheet-appeal-decision-plus-20-days';
    } else if (!event?.appealed && ticketDate) {
      deadlineDate = addDays(ticketDate, 60);
      deadlineBasis = 'two-sheet-estimated-60-days';
    }
  }

  const elapsedDays = ticketDate ? daysBetween(ticketDate, nowDate) : null;
  const daysToDeadline = deadlineDate ? daysBetween(nowDate, deadlineDate) : null;
  const expired = daysToDeadline != null && daysToDeadline < 0;
  let statusLabel = event?.paid ? '✅ پرداخت‌شده' : '🔴 پرداخت‌نشده';

  if (!event?.paid && deadlineDate) {
    if (expired) statusLabel = deadlineBasis === 'user-defined-reminder' ? '⚠️ مهلت یادآوری ثبت‌شده گذشته' : '⚠️ مهلت پیگیری قبض دوبرگی گذشته';
    else if (daysToDeadline <= 10) statusLabel = '🟠 نزدیک پایان مهلت پیگیری';
    else statusLabel = '🟡 در مهلت پیگیری';
  } else if (!event?.paid && event?.appealed && !appealDate && !explicitDeadline) {
    statusLabel = '🟡 در انتظار نتیجه اعتراض';
  } else if (!event?.paid && !doubleSheetEligible) {
    statusLabel = '🔴 پرداخت‌نشده · بدون دیرکرد خودکار';
  }

  const baseAmount = Number(event?.officialCurrentAmountRial) > 0
    ? Number(event.officialCurrentAmountRial)
    : Number(event?.costRial) > 0 ? Number(event.costRial) : 0;
  const potentialAmountRial = !event?.paid && doubleSheetEligible && expired && baseAmount > 0
    ? baseAmount * 2 : null;

  let eligibilityLabel = doubleSheetEligible
    ? 'نوع قبض دوبرگی · مشمول پیگیری دیرکرد در مدل'
    : event?.cameraCode || /دوربین|دوربینی|camera/i.test(String(event?.ticketType || ''))
      ? 'قبض دوربینی · بدون دوبرابرشدن خودکار'
      : 'نوع قبض غیردوبرگی یا نامشخص · بدون دوبرابرشدن خودکار';

  return {
    ticketDate,
    deadlineDate,
    deadlineBasis,
    appealDate,
    elapsedDays,
    daysToDeadline,
    statusLabel,
    doubleSheetEligible,
    lateTrackingEligible: doubleSheetEligible || Boolean(explicitDeadline),
    eligibilityLabel,
    potentialAmountRial,
    expired
  };
}
