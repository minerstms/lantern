/**
 * Individual student access-request / teacher-approval helpers — Phase #31 (School Access
 * Foundation, part 2: "Request Access" -> teacher approval).
 *
 * Pure/stateless helpers only (phrase generation, opaque secret generation/hashing, cookie
 * strings, derived-status computation). D1 reads/writes and route wiring live in
 * worker/index.js (handleClassAccessRoutes) — same split as worker/school-schedule.js in
 * Phase #30, so this module stays trivially unit-testable without mocking D1.
 *
 * Security model (see worker/migrations/050_lantern_school_access_foundation.sql and the
 * miners-yearbook donor pattern this borrows from): the memorable `request_phrase` (e.g.
 * "GREEN-FALCON-49") is a DISPLAY/LOOKUP IDENTIFIER ONLY, so a teacher can match a spoken phrase
 * to the correct pending row. It is NEVER a credential and is never accepted by any endpoint as
 * proof of anything. The actual security boundary is the high-entropy `device secret`: generated
 * server-side, sent to the browser ONLY as an HttpOnly cookie (never in a URL/query string, never
 * returned to the teacher), and only its SHA-256 hash is ever stored in D1
 * (`device_secret_hash`). A browser that only knows the phrase cannot derive, guess, or submit
 * the matching device secret, so it can never read or claim another browser's request/grant.
 */

export const ACCESS_DEVICE_COOKIE_NAME = 'lantern_access_device';

/** Covers the 10-minute pending window plus up to a 30-minute approved grant, with buffer. */
export const ACCESS_DEVICE_COOKIE_MAX_AGE_SEC = 60 * 60;

export const ACCESS_REQUEST_PENDING_TTL_SEC = 10 * 60;

export const ACCESS_REQUEST_ALLOWED_GRANT_MINUTES = [15, 30];

export const ACCESS_REQUEST_RATE_LIMIT_WINDOW_SEC = 10 * 60;
export const ACCESS_REQUEST_RATE_LIMIT_MAX_PER_WINDOW = 5;

/** Phase #33 — "Extend +15 min" / "Extend +30 min" on an already-active individual grant. */
export const ACCESS_GRANT_EXTEND_ALLOWED_MINUTES = [15, 30];

/** Hard ceiling (minutes from the moment of extension) a grant's expiry can ever be pushed to,
 * no matter how many times it is extended -- this is what guarantees an "Extend" action can
 * never accidentally turn a temporary grant into a de-facto permanent one. */
export const ACCESS_GRANT_MAX_TOTAL_MINUTES = 180;

// Classroom-safe word lists: no offensive/ambiguous vocabulary, no numerals/letters that read
// alike, no near-duplicate words within a list (avoids a teacher mis-hearing one phrase as
// another). WORD-WORD-NUMBER format per the prompt's own example (GREEN-FALCON-49 is directly
// reachable from these lists).
const PHRASE_ADJECTIVES = [
  'GREEN', 'BLUE', 'GOLD', 'SILVER', 'CORAL', 'AMBER', 'VIOLET', 'IVORY',
  'JADE', 'RUBY', 'PEARL', 'MAPLE', 'BRIGHT', 'SWIFT', 'BOLD', 'CALM',
];
const PHRASE_NOUNS = [
  'FALCON', 'OTTER', 'EAGLE', 'TIGER', 'PANDA', 'RAVEN', 'HAWK', 'WOLF',
  'LYNX', 'BISON', 'CONDOR', 'HERON', 'MARLIN', 'FOX', 'PUMA', 'HERO',
];

/** WORD-WORD-NN memorable request identifier. Display/lookup only -- see module header. */
export function generateRequestPhrase() {
  const rand = new Uint32Array(3);
  crypto.getRandomValues(rand);
  const adj = PHRASE_ADJECTIVES[rand[0] % PHRASE_ADJECTIVES.length];
  const noun = PHRASE_NOUNS[rand[1] % PHRASE_NOUNS.length];
  const num = (rand[2] % 90) + 10; // 10..99
  return `${adj}-${noun}-${num}`;
}

/** 32 bytes (256 bits) of high-entropy opaque material for the device-binding cookie. Never
 * derived from or reconstructible from the memorable phrase. */
export function generateDeviceSecret() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** SHA-256 hex digest. Used so raw device secrets / IPs are never stored at rest in D1. */
export async function hashOpaqueSecret(secret) {
  const enc = new TextEncoder().encode(String(secret == null ? '' : secret));
  const digest = await crypto.subtle.digest('SHA-256', enc);
  const bytes = new Uint8Array(digest);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
  return hex;
}

/** Same shape as worker/index.js's pilotSetCookieHeader, new cookie name -- HttpOnly always (this
 * secret is never read by page JS), conditional Secure, SameSite=None (cross-site Pages->Worker
 * calls), Path=/. Never placed in a URL/query string. */
export function buildAccessDeviceCookieHeader(secret, secure) {
  const parts = [
    `${ACCESS_DEVICE_COOKIE_NAME}=${encodeURIComponent(secret)}`,
    'Path=/',
    `Max-Age=${ACCESS_DEVICE_COOKIE_MAX_AGE_SEC}`,
    'HttpOnly',
    'SameSite=None',
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function clearAccessDeviceCookieHeader(secure) {
  const parts = [`${ACCESS_DEVICE_COOKIE_NAME}=`, 'Path=/', 'Max-Age=0', 'HttpOnly', 'SameSite=None'];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

/**
 * Derived lifecycle status of a `lantern_access_requests` row at `nowIso`, computed purely from
 * current server time -- never mutates the row and needs no cleanup job (matches the Phase #30/#31
 * requirement that authorization rely on current server time, not a background job). One of:
 * 'pending' | 'approved' | 'denied' | 'expired' | 'revoked' | 'not_found'.
 */
export function derivedRequestStatus(row, nowIso) {
  if (!row) return 'not_found';
  if (row.status === 'denied') return 'denied';
  if (row.status === 'approved') {
    if (row.revoked_at) return 'revoked';
    if (!row.grant_expires_at || row.grant_expires_at <= nowIso) return 'expired';
    return 'approved';
  }
  // status === 'pending' (or any other stored value defaults to the pending expiry check)
  if (!row.request_expires_at || row.request_expires_at <= nowIso) return 'expired';
  return 'pending';
}

/** Whether `row` currently represents a qualifying individual grant at `nowIso`. Phase #31: purely
 * informational on GET /api/class-access/state -- never changes accessState/tokenValid while
 * schedule enforcement is off (see isSchoolScheduleEnforcementEnabled in school-schedule.js). */
export function isQualifyingGrant(row, nowIso) {
  return derivedRequestStatus(row, nowIso) === 'approved';
}

/**
 * Phase #33 — pure computation of a grant's new `grant_expires_at` after an "Extend +N min"
 * action. Extends from whichever is later of (a) the grant's current expiry or (b) `now` (so an
 * already-elapsed grant doesn't get "back-extended" from its stale old expiry), then clamps to a
 * hard ceiling of `ACCESS_GRANT_MAX_TOTAL_MINUTES` minutes from `now` -- this clamp is what makes
 * it impossible for repeated extension clicks to ever add up to a de-facto permanent grant.
 *
 * @param {string} currentExpiresAtIso
 * @param {number} deltaMinutes
 * @param {Date|number} [now]
 * @returns {string} new ISO expiry
 */
export function computeExtendedGrantExpiresAt(currentExpiresAtIso, deltaMinutes, now) {
  const nowDate = now instanceof Date ? now : new Date(now == null ? Date.now() : now);
  const nowMs = nowDate.getTime();
  const currentExpiryMs = new Date(currentExpiresAtIso).getTime();
  const baseMs = Number.isFinite(currentExpiryMs) && currentExpiryMs > nowMs ? currentExpiryMs : nowMs;
  const extendedMs = baseMs + deltaMinutes * 60 * 1000;
  const ceilingMs = nowMs + ACCESS_GRANT_MAX_TOTAL_MINUTES * 60 * 1000;
  return new Date(Math.min(extendedMs, ceilingMs)).toISOString();
}
