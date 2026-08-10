/**
 * Deterministic tests for the canonical school-hours schedule evaluator — Prompt #30.
 * Pure function, no D1/env needed. Covers every case from the prompt plus a dedicated
 * DST-conversion proof (America/Denver MDT vs MST) and enforcement-flag default.
 *
 * Usage: node worker/scripts/school-schedule-test.mjs
 */
import { evaluateSchoolSchedule, isSchoolScheduleEnforcementEnabled, SCHOOL_SCHEDULE_TIMEZONE } from '../school-schedule.js';

let pass = 0;
let fail = 0;
function ok(label) { pass++; console.log('PASS', label); }
function bad(label, detail) { fail++; console.error('FAIL', label, detail != null ? detail : ''); }

/** Build an ISO UTC instant offset from a Mountain-Time wall-clock reading, given the correct
 * seasonal UTC offset (-6 for MDT, -7 for MST) so we are not relying on evaluateSchoolSchedule
 * itself to pick the instant. */
function mtInstant(localDateTime, utcOffsetHours) {
  return new Date(`${localDateTime}:00${utcOffsetHours < 0 ? '-' : '+'}${String(Math.abs(utcOffsetHours)).padStart(2, '0')}:00`);
}

function check(label, localDateTime, offsetHours, expected) {
  const now = mtInstant(localDateTime, offsetHours);
  const result = evaluateSchoolSchedule(now);
  const mismatches = [];
  for (const key of Object.keys(expected)) {
    if (result[key] !== expected[key]) mismatches.push(`${key}: expected ${JSON.stringify(expected[key])}, got ${JSON.stringify(result[key])}`);
  }
  if (mismatches.length) bad(label, { input: localDateTime, result, mismatches });
  else ok(label);
}

// ---------------------------------------------------------------------------
// Exact cases from CURSOR PROMPT #30
// ---------------------------------------------------------------------------

check('2026-09-08 10:00 Mountain -> regular scheduled lock', '2026-09-08T10:00', -6, {
  schoolDay: true, scheduleType: 'regular', withinScheduledLock: true,
});

check('2026-09-09 11:30 -> early-release scheduled lock', '2026-09-09T11:30', -6, {
  schoolDay: true, scheduleType: 'early_release', withinScheduledLock: true,
});

check('2026-09-09 12:30 -> no scheduled lock', '2026-09-09T12:30', -6, {
  withinScheduledLock: false,
});

check('2026-09-07 10:00 -> no school', '2026-09-07T10:00', -6, {
  schoolDay: false, scheduleType: 'no_school', withinScheduledLock: false,
});

check('2026-10-09 Friday 10:00 -> scheduled lock', '2026-10-09T10:00', -6, {
  schoolDay: true, scheduleType: 'regular', withinScheduledLock: true,
});

check('2026-10-16 Friday 10:00 -> no scheduled lock', '2026-10-16T10:00', -6, {
  schoolDay: false, scheduleType: 'friday_off', withinScheduledLock: false,
});

check('2026-11-23 Monday 10:00 -> scheduled lock', '2026-11-23T10:00', -7, {
  schoolDay: true, scheduleType: 'regular', withinScheduledLock: true,
});

check('2026-11-25 10:00 -> no school', '2026-11-25T10:00', -7, {
  schoolDay: false, scheduleType: 'no_school', withinScheduledLock: false,
});

check('2026-12-23 10:00 -> no school', '2026-12-23T10:00', -7, {
  schoolDay: false, scheduleType: 'no_school', withinScheduledLock: false,
});

check('2027-01-13 11:00 -> early-release scheduled lock', '2027-01-13T11:00', -7, {
  schoolDay: true, scheduleType: 'early_release', withinScheduledLock: true,
});

check('2027-01-13 13:00 -> no scheduled lock', '2027-01-13T13:00', -7, {
  withinScheduledLock: false,
});

check('2027-03-23 10:00 -> no school', '2027-03-23T10:00', -6, {
  schoolDay: false, scheduleType: 'no_school', withinScheduledLock: false,
});

check('2027-05-20 Thursday 10:00 -> scheduled lock', '2027-05-20T10:00', -6, {
  schoolDay: true, scheduleType: 'regular', withinScheduledLock: true,
});

check('2027-05-21 Friday 10:00 -> school-year schedule expired', '2027-05-21T10:00', -6, {
  schoolDay: false, scheduleType: 'summer', withinScheduledLock: false, reason: 'school_year_expired',
});

// ---------------------------------------------------------------------------
// Extra coverage: exact localDate/localTime/lockStart/lockEnd/reason shape
// ---------------------------------------------------------------------------

(function testFullShape() {
  const result = evaluateSchoolSchedule(mtInstant('2026-09-08T10:30', -6));
  const expected = {
    timezone: SCHOOL_SCHEDULE_TIMEZONE,
    localDate: '2026-09-08',
    localTime: '10:30',
    schoolDay: true,
    scheduleType: 'regular',
    lockStart: '08:00',
    lockEnd: '16:00',
    withinScheduledLock: true,
    reason: 'regular_school_day',
  };
  const mismatches = Object.keys(expected).filter((k) => JSON.stringify(result[k]) !== JSON.stringify(expected[k]));
  if (mismatches.length) bad('full shape matches prompt example exactly', { result, mismatches });
  else ok('full shape matches prompt example exactly (timezone/localDate/localTime/schoolDay/scheduleType/lockStart/lockEnd/withinScheduledLock/reason)');
})();

(function testWeekend() {
  // 2026-09-05 is a Saturday.
  const result = evaluateSchoolSchedule(mtInstant('2026-09-05T10:00', -6));
  if (result.scheduleType === 'weekend' && result.withinScheduledLock === false && result.schoolDay === false) ok('Saturday -> weekend, no lock');
  else bad('Saturday -> weekend, no lock', result);
})();

(function testOutsideHoursOnRegularDay() {
  // 2026-09-08 (Tuesday) at 18:00 -- a regular school day, but after the 08:00-16:00 window.
  const result = evaluateSchoolSchedule(mtInstant('2026-09-08T18:00', -6));
  if (result.schoolDay === true && result.scheduleType === 'outside_hours' && result.withinScheduledLock === false && result.lockStart === '08:00' && result.lockEnd === '16:00') {
    ok('regular school day after 16:00 -> schoolDay true, scheduleType outside_hours, withinScheduledLock false, lock window still reported');
  } else bad('regular school day after 16:00', result);
})();

// ---------------------------------------------------------------------------
// DST-sensitive conversion proof: same local wall-clock instant (noon), straddling the actual
// 2026 US fall-back transition (2026-11-01, 2:00 AM MDT -> 1:00 AM MST), computed purely via
// Intl/America-Denver (no hardcoded UTC-6/UTC-7 table inside the evaluator itself).
// ---------------------------------------------------------------------------

(function testDstAwareConversion() {
  const beforeFallBack = evaluateSchoolSchedule(new Date('2026-10-15T18:00:00.000Z')); // MDT (UTC-6) -> 12:00 local
  const afterFallBack = evaluateSchoolSchedule(new Date('2026-11-15T19:00:00.000Z')); // MST (UTC-7) -> 12:00 local
  const beforeOk = beforeFallBack.localDate === '2026-10-15' && beforeFallBack.localTime === '12:00';
  const afterOk = afterFallBack.localDate === '2026-11-15' && afterFallBack.localTime === '12:00';
  if (beforeOk && afterOk) {
    ok('DST-aware America/Denver conversion: 2026-10-15T18:00:00Z (MDT, UTC-6) and 2026-11-15T19:00:00Z (MST, UTC-7) both resolve to local 12:00 -- proves automatic DST offset switching, not a fixed UTC-6/UTC-7 table');
  } else {
    bad('DST-aware America/Denver conversion', { beforeFallBack, afterFallBack });
  }
})();

(function testDstSpringForward() {
  // 2027-03-14 is the second Sunday in March 2027 (US spring-forward date), 2:00 AM MST -> 3:00 AM MDT.
  // Before the transition (MST, UTC-7): 09:00 UTC -> 02:00 local. After (MDT, UTC-6): 09:00 UTC -> 03:00 local.
  const beforeSpringForward = evaluateSchoolSchedule(new Date('2027-03-13T18:00:00.000Z')); // MST (UTC-7) -> 11:00 local
  const afterSpringForward = evaluateSchoolSchedule(new Date('2027-03-15T18:00:00.000Z')); // MDT (UTC-6) -> 12:00 local
  if (beforeSpringForward.localTime === '11:00' && afterSpringForward.localTime === '12:00') {
    ok('DST spring-forward boundary (2027-03-14): UTC offset correctly flips from -7 to -6 across the transition');
  } else {
    bad('DST spring-forward boundary', { beforeSpringForward, afterSpringForward });
  }
})();

// ---------------------------------------------------------------------------
// Enforcement switch default
// ---------------------------------------------------------------------------

(function testEnforcementDefaultsOff() {
  if (isSchoolScheduleEnforcementEnabled({}) === false) ok('isSchoolScheduleEnforcementEnabled({}) defaults to false when unset');
  else bad('isSchoolScheduleEnforcementEnabled({}) should default to false');
  if (isSchoolScheduleEnforcementEnabled({ SCHOOL_SCHEDULE_ENFORCEMENT_ENABLED: 'false' }) === false) ok('isSchoolScheduleEnforcementEnabled reports false for "false"');
  else bad('isSchoolScheduleEnforcementEnabled should report false for "false"');
  if (isSchoolScheduleEnforcementEnabled({ SCHOOL_SCHEDULE_ENFORCEMENT_ENABLED: 'true' }) === true) ok('isSchoolScheduleEnforcementEnabled reports true only when explicitly "true"');
  else bad('isSchoolScheduleEnforcementEnabled should report true for "true"');
})();

console.log('\nschool-schedule-test:', pass, 'PASS', fail, 'FAIL');
process.exit(fail ? 1 : 0);
