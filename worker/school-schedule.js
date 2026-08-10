/**
 * Canonical school-hours schedule evaluator — Phase #30 (School Access Foundation).
 *
 * ONE source of truth for "is this moment inside the scheduled school-hours lock window",
 * so date/time logic is not scattered across frontend pages or duplicated Worker branches.
 *
 * IMPORTANT: this module is purely additive. It does not change `isLockHours()` in
 * `worker/index.js` (the function that currently governs real production access), and nothing
 * calls this evaluator to gate access yet. It only feeds new, informational fields on
 * `GET /api/class-access/state` (see index.js) — see docs/class-access.md /
 * docs/LANTERN_AUTH_BASELINE.md for the existing (unchanged) access rules.
 *
 * Deterministic / testable: every exported evaluator takes an explicit `now` (a Date or
 * epoch-ms number) instead of reading the clock itself, and there is no public endpoint or query
 * parameter that lets a caller spoof server time — production call sites always pass `new
 * Date()`; tests pass fixed instants (see worker/scripts/school-schedule-test.mjs).
 */

export const SCHOOL_SCHEDULE_TIMEZONE = 'America/Denver';

/** Through this local date (inclusive), lock days are Monday-Friday. */
const PERIOD_A_END_DATE = '2026-10-09';

/** After this local date, the 2026-27 automatic school schedule expires entirely (no lock, ever). */
const SCHOOL_YEAR_END_DATE = '2027-05-20';

/** On these local dates, the lock window is 8:00 AM-12:00 PM instead of the normal window. */
const EARLY_RELEASE_DATES = new Set([
  '2026-09-09',
  '2026-10-14',
  '2026-11-11',
  '2026-12-09',
  '2027-01-13',
  '2027-02-10',
  '2027-03-10',
  '2027-04-14',
  '2027-05-12',
]);

/** Individual no-school local dates (no automatic lock, regardless of weekday/period). */
const NO_SCHOOL_DATES = new Set([
  '2026-09-07',
  '2026-11-25',
  '2026-11-26',
]);

/** Inclusive no-school local date ranges (winter break, spring break). */
const NO_SCHOOL_DATE_RANGES = [
  ['2026-12-21', '2026-12-31'],
  ['2027-03-22', '2027-03-25'],
];

const REGULAR_LOCK_START = '08:00';
const REGULAR_LOCK_END = '16:00';
const EARLY_RELEASE_LOCK_START = '08:00';
const EARLY_RELEASE_LOCK_END = '12:00';

function isNoSchoolLocalDate(localDate) {
  if (NO_SCHOOL_DATES.has(localDate)) return true;
  for (const [start, end] of NO_SCHOOL_DATE_RANGES) {
    if (localDate >= start && localDate <= end) return true;
  }
  return false;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function timeStringToMinutes(hhmm) {
  const parts = String(hhmm || '').split(':');
  const h = parseInt(parts[0], 10) || 0;
  const m = parseInt(parts[1], 10) || 0;
  return h * 60 + m;
}

/**
 * Local wall-clock parts for `date` in `timeZone`, using Intl (DST-aware; no manual UTC-offset
 * table, no fixed MST/MDT assumption). Never use `UTC-7` / `UTC-6` — always resolve through this.
 */
function localPartsInTimeZone(date, timeZone) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
    hour12: false,
  });
  const map = {};
  for (const p of fmt.formatToParts(date)) map[p.type] = p.value;
  let hour = parseInt(map.hour, 10);
  if (hour === 24) hour = 0; // some engines report midnight as "24" with hour12:false
  return {
    weekday: String(map.weekday || '').toLowerCase(),
    localDate: `${map.year}-${map.month}-${map.day}`,
    hour,
    minute: parseInt(map.minute, 10) || 0,
  };
}

/**
 * Evaluate the canonical 2026-27 school-hours schedule at `now`.
 *
 * @param {Date|number} [now] - Instant to evaluate (defaults to `new Date()`). Callers on the
 *   server always pass an explicit instant or accept this default; there is no way for a client
 *   request to override it.
 * @returns {{
 *   timezone: string,
 *   localDate: string,
 *   localTime: string,
 *   schoolDay: boolean,
 *   scheduleType: 'regular'|'early_release'|'no_school'|'weekend'|'friday_off'|'summer'|'outside_hours',
 *   lockStart: string|null,
 *   lockEnd: string|null,
 *   withinScheduledLock: boolean,
 *   reason: string,
 * }}
 */
export function evaluateSchoolSchedule(now) {
  const date = now instanceof Date ? now : new Date(now == null ? Date.now() : now);
  const timezone = SCHOOL_SCHEDULE_TIMEZONE;
  const { weekday, localDate, hour, minute } = localPartsInTimeZone(date, timezone);
  const localTime = `${pad2(hour)}:${pad2(minute)}`;
  const nowMinutes = hour * 60 + minute;

  const base = { timezone, localDate, localTime };

  // 1) End of school year first -- never accidentally keep the automatic schedule locking
  // students through summer.
  if (localDate > SCHOOL_YEAR_END_DATE) {
    return {
      ...base,
      schoolDay: false,
      scheduleType: 'summer',
      lockStart: null,
      lockEnd: null,
      withinScheduledLock: false,
      reason: 'school_year_expired',
    };
  }

  // 2) Explicit no-school dates/ranges override weekday/period rules.
  if (isNoSchoolLocalDate(localDate)) {
    return {
      ...base,
      schoolDay: false,
      scheduleType: 'no_school',
      lockStart: null,
      lockEnd: null,
      withinScheduledLock: false,
      reason: 'no_school_day',
    };
  }

  // 3) Early release dates override the normal window with 8:00 AM-12:00 PM, any weekday.
  if (EARLY_RELEASE_DATES.has(localDate)) {
    const within = nowMinutes >= timeStringToMinutes(EARLY_RELEASE_LOCK_START) && nowMinutes < timeStringToMinutes(EARLY_RELEASE_LOCK_END);
    return {
      ...base,
      schoolDay: true,
      scheduleType: within ? 'early_release' : 'outside_hours',
      lockStart: EARLY_RELEASE_LOCK_START,
      lockEnd: EARLY_RELEASE_LOCK_END,
      withinScheduledLock: within,
      reason: within ? 'early_release_school_day' : 'outside_scheduled_hours',
    };
  }

  // 4) Weekends never lock.
  if (weekday === 'sat' || weekday === 'sun') {
    return {
      ...base,
      schoolDay: false,
      scheduleType: 'weekend',
      lockStart: null,
      lockEnd: null,
      withinScheduledLock: false,
      reason: 'weekend',
    };
  }

  // 5) Regular week: Mon-Fri through Oct 9, 2026; Mon-Thu (Friday off) after, through the end of
  // the school year (checked in step 1 above).
  const isPeriodA = localDate <= PERIOD_A_END_DATE;
  const lockWeekdays = isPeriodA ? ['mon', 'tue', 'wed', 'thu', 'fri'] : ['mon', 'tue', 'wed', 'thu'];

  if (!lockWeekdays.includes(weekday)) {
    // Only reachable for Friday once the Mon-Thu period is in effect (weekends handled above).
    return {
      ...base,
      schoolDay: false,
      scheduleType: 'friday_off',
      lockStart: null,
      lockEnd: null,
      withinScheduledLock: false,
      reason: 'friday_off',
    };
  }

  const within = nowMinutes >= timeStringToMinutes(REGULAR_LOCK_START) && nowMinutes < timeStringToMinutes(REGULAR_LOCK_END);
  return {
    ...base,
    schoolDay: true,
    scheduleType: within ? 'regular' : 'outside_hours',
    lockStart: REGULAR_LOCK_START,
    lockEnd: REGULAR_LOCK_END,
    withinScheduledLock: within,
    reason: within ? 'regular_school_day' : 'outside_scheduled_hours',
  };
}

/** School schedule enforcement switch — Phase #30 requires this to default OFF in production. */
export function isSchoolScheduleEnforcementEnabled(env) {
  return String((env && env.SCHOOL_SCHEDULE_ENFORCEMENT_ENABLED) || '').trim().toLowerCase() === 'true';
}
