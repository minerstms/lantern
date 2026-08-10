/**
 * Enrolled classroom device pairing + device-group unlock helpers — Phase #32 (School Access
 * Foundation, part 3: teacher-approved classroom computer enrollment + group unlock).
 *
 * Pure/stateless helpers only. D1 reads/writes and route wiring live in worker/index.js
 * (handleClassAccessRoutes) — same split as worker/access-requests.js (Phase #31) and
 * worker/school-schedule.js (Phase #30).
 *
 * Security model:
 *  - `pairing_phrase` (e.g. "CRIMSON-CEDAR-49") is a DISPLAY/LOOKUP IDENTIFIER ONLY, so a teacher
 *    can recognize which pending pairing belongs to which classroom browser by sight/sound. It is
 *    NEVER accepted as a credential by any endpoint. A deliberately different word bank from
 *    Phase #31's individual-access phrases (colors/animals) is used here (gemstone
 *    colors/trees) so a teacher can never mistake "a student wants individual access" for
 *    "a classroom computer wants to be enrolled" from the phrase shape alone.
 *  - During the ~10 minute pending window, the requesting browser is bound by an opaque pairing
 *    secret (HttpOnly cookie, hash-only at rest) — the same pattern as Phase #31's per-request
 *    device-binding cookie.
 *  - Once a teacher approves (assigning a label and, optionally, a device group), the server
 *    mints a SEPARATE, unrelated, high-entropy device credential and stores only its hash
 *    (`lantern_access_devices.device_token_hash`). That credential is delivered to the ORIGINAL
 *    pairing browser exactly once — matched by the pairing secret, never by the phrase — and is
 *    the browser's own responsibility to persist (localStorage, so it survives across sessions)
 *    and present on future requests via the `X-Device-Token` header. It is never shown to staff,
 *    never placed in a URL, and never equivalent to the human-readable device label.
 *  - This is BROWSER enrollment, not hardware attestation: clearing that browser's storage loses
 *    the credential and requires re-enrollment. It does not survive a device reset/reimage.
 *  - LAN/network metadata (hashed IP) is stored only diagnostically (`last_seen_ip_hash`) and is
 *    NEVER an authorization signal — only `device_token_hash` + group membership + an active,
 *    unexpired, non-revoked group unlock ever qualify access.
 */

export const DEVICE_PAIRING_COOKIE_NAME = 'lantern_device_pairing';
export const DEVICE_TOKEN_HEADER = 'X-Device-Token';

/** Covers the 10-minute pending window with a little buffer for the final status poll. */
export const DEVICE_PAIRING_COOKIE_MAX_AGE_SEC = 11 * 60;
export const DEVICE_PAIRING_PENDING_TTL_SEC = 10 * 60;

export const DEVICE_PAIRING_RATE_LIMIT_WINDOW_SEC = 10 * 60;
export const DEVICE_PAIRING_RATE_LIMIT_MAX_PER_WINDOW = 5;

export const GROUP_UNLOCK_ALLOWED_MINUTES = [15, 30, 60];

// Deliberately distinct word banks from Phase #31's access-request phrases (see module header).
const PAIRING_ADJECTIVES = [
  'CRIMSON', 'COBALT', 'EMERALD', 'TOPAZ', 'ONYX', 'AZURE', 'INDIGO', 'SAFFRON',
  'UMBER', 'SIENNA', 'TEAL', 'MAGENTA', 'CYAN', 'ORCHID', 'SEPIA', 'GRAPHITE',
];
const PAIRING_NOUNS = [
  'CEDAR', 'BIRCH', 'ASPEN', 'WILLOW', 'SPRUCE', 'ELM', 'OAK', 'PINE',
  'ALDER', 'BEECH', 'HAZEL', 'LARCH', 'POPLAR', 'ROWAN', 'YEW', 'ASH',
];

/** WORD-WORD-NN memorable pairing identifier. Display/lookup only — see module header. */
export function generatePairingPhrase() {
  const rand = new Uint32Array(3);
  crypto.getRandomValues(rand);
  const adj = PAIRING_ADJECTIVES[rand[0] % PAIRING_ADJECTIVES.length];
  const noun = PAIRING_NOUNS[rand[1] % PAIRING_NOUNS.length];
  const num = (rand[2] % 90) + 10; // 10..99
  return `${adj}-${noun}-${num}`;
}

/** 32 bytes (256 bits) of high-entropy opaque material. Used for both the ephemeral pairing
 * secret and the persistent device credential — they are unrelated values, never derived from
 * one another or from the pairing phrase. */
export function generateOpaqueSecret() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** SHA-256 hex digest. Used so raw pairing secrets / device credentials / IPs are never stored
 * at rest in D1. */
export async function hashOpaqueSecret(secret) {
  const enc = new TextEncoder().encode(String(secret == null ? '' : secret));
  const digest = await crypto.subtle.digest('SHA-256', enc);
  const bytes = new Uint8Array(digest);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
  return hex;
}

export function buildPairingCookieHeader(secret, secure) {
  const parts = [
    `${DEVICE_PAIRING_COOKIE_NAME}=${encodeURIComponent(secret)}`,
    'Path=/',
    `Max-Age=${DEVICE_PAIRING_COOKIE_MAX_AGE_SEC}`,
    'HttpOnly',
    'SameSite=None',
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function clearPairingCookieHeader(secure) {
  const parts = [`${DEVICE_PAIRING_COOKIE_NAME}=`, 'Path=/', 'Max-Age=0', 'HttpOnly', 'SameSite=None'];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

/**
 * Derived lifecycle status of a `lantern_access_device_pairings` row at `nowIso`, computed purely
 * from current server time — never mutates the row, needs no cleanup job. One of:
 * 'pending' | 'approved' | 'denied' | 'expired' | 'not_found'.
 */
export function derivedPairingStatus(row, nowIso) {
  if (!row) return 'not_found';
  if (row.status === 'denied') return 'denied';
  if (row.status === 'approved') return 'approved';
  if (!row.request_expires_at || row.request_expires_at <= nowIso) return 'expired';
  return 'pending';
}

/** Whether an enrolled device row currently qualifies as active (exists, not revoked). Revocation
 * is immediate and permanent for that credential — a revoked device cannot silently restore
 * itself; only an explicit new teacher approval (re-enrollment) creates a new device row. */
export function isDeviceActive(deviceRow) {
  return !!deviceRow && !deviceRow.revoked_at;
}

/** Whether a `lantern_access_group_unlocks` row is currently active at `nowIso`. Authorization is
 * always this direct, current-time check — never a delayed/cleanup-job-dependent flag. */
export function isGroupUnlockActive(unlockRow, nowIso) {
  if (!unlockRow) return false;
  if (!unlockRow.is_active) return false;
  if (unlockRow.revoked_at) return false;
  if (!unlockRow.expires_at || unlockRow.expires_at <= nowIso) return false;
  return true;
}
