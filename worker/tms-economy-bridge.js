/**
 * Prompt #96 -- one Nugget economy: Lantern's client for TMS Nuggets' system-originated economy
 * bridge (POST /api/lantern-bridge/economy/balance, POST /api/lantern-bridge/economy/transact).
 *
 * LOCKED: there is exactly one Nugget economy. TMS Nuggets is the authoritative ledger for every
 * real student's balance, grant, and spend -- Lantern does not maintain a competing wallet for
 * them. This module is the ONLY place Lantern calls out to that authoritative ledger for
 * student-driven / system-originated activity (games, missions, Store/Locker purchases, balance
 * reads). It is the sibling of the Prompt #95 `callTmsNuggetsBridge` (teacher-context routes) in
 * worker/index.js, using the same TMS_LANTERN_BRIDGE_SECRET + base URL, but for the
 * student_id-keyed system routes that don't require a staff actor.
 *
 * `studentId` here is always Lantern's own resolved economy key for a STUDENT account --
 * `pilotEconomyCharacterName(account)` (prefer mtss_student_id, else student_character_name, else
 * username) -- the same value Nuggets already receives as `students.student_id` via roster-upsert
 * and pushes back as `character_name` in the (now removed) legacy MTSS positive-reward call.
 * Never a display name; never anything client-supplied.
 *
 * A student_id that does not correspond to a real, active TMS student (Lantern demo/persona
 * characters, local dev/test fixtures, an account never linked to a real MTSS roster row) resolves
 * with `{ ok:false, notFound:true }`. Callers MUST treat that as "fall back to the legacy
 * Lantern-only wallet" -- it must never be treated as "grant/spend anyway", which is exactly how
 * fake/demo personas stay out of the real TMS ledger.
 */

function getTmsNuggetsApiBaseUrlForEconomy(env) {
  return (env.TMS_NUGGETS_API_BASE_URL || 'https://mtss-behavior-log.mrradle.workers.dev').trim().replace(/\/$/, '');
}

async function callTmsEconomyBridge(env, subPath, payload) {
  const secret = (env.TMS_LANTERN_BRIDGE_SECRET || '').trim();
  if (!secret) return { ok: false, error: 'bridge_not_configured', _httpStatus: 503 };
  const base = getTmsNuggetsApiBaseUrlForEconomy(env);
  let resp;
  try {
    resp = await fetch(base + '/api/lantern-bridge/economy/' + subPath, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
      body: JSON.stringify(payload),
    });
  } catch (_) {
    return { ok: false, error: 'bridge_request_failed', _httpStatus: 502 };
  }
  let data;
  try {
    data = await resp.json();
  } catch (_) {
    return { ok: false, error: 'bridge_bad_response', _httpStatus: 502 };
  }
  if (!data || typeof data !== 'object') return { ok: false, error: 'bridge_bad_response', _httpStatus: 502 };
  return { ...data, _httpStatus: resp.status };
}

/**
 * Authoritative balance + bounded history for a real TMS student. `notFound: true` means this
 * student_id is not a real/active TMS student -- caller must fall back to the legacy wallet, not
 * fabricate a TMS balance.
 */
export async function tmsEconomyBalance(env, studentId) {
  const id = String(studentId || '').trim();
  if (!id) return { ok: false, notFound: true };
  const result = await callTmsEconomyBridge(env, 'balance', { student_id: id });
  if (result._httpStatus === 404) return { ok: false, notFound: true };
  if (!result.ok) {
    return { ok: false, notFound: false, error: result.error, code: result.code, httpStatus: result._httpStatus };
  }
  return {
    ok: true,
    notFound: false,
    studentId: result.student_id,
    studentName: result.student_name,
    earned: Number(result.earned) || 0,
    spent: Number(result.spent) || 0,
    available: Number(result.available) || 0,
    recentHistory: Array.isArray(result.recent_history) ? result.recent_history : [],
  };
}

/**
 * Authoritative grant (delta > 0) / spend (delta < 0), applied exactly once per `reference`.
 * `reference` is REQUIRED -- every Lantern-originated economy write must carry a stable,
 * deterministic id tied to the underlying business event (mission submission id, game run id,
 * store purchase id, poll id, etc.) so a client/network retry can never double-apply it.
 * `notFound: true` means this student_id is not a real/active TMS student -- caller must fall
 * back to the legacy wallet, never apply the delta anywhere else as a substitute.
 */
export async function tmsEconomyTransact(env, studentId, delta, kind, source, note, reference) {
  const id = String(studentId || '').trim();
  const d = Math.floor(Number(delta));
  if (!id) return { ok: false, notFound: true };
  if (!Number.isFinite(d) || d === 0) return { ok: false, notFound: false, error: 'invalid_delta' };
  const ref = String(reference || '').trim();
  if (!ref) return { ok: false, notFound: false, error: 'reference_required' };
  const result = await callTmsEconomyBridge(env, 'transact', {
    student_id: id,
    delta: d,
    kind: String(kind || 'lantern').trim().slice(0, 60) || 'lantern',
    source: String(source || 'LANTERN').trim().slice(0, 60) || 'LANTERN',
    note: String(note || '').trim().slice(0, 500),
    reference: ref,
  });
  if (result._httpStatus === 404) return { ok: false, notFound: true };
  if (!result.ok) {
    return { ok: false, notFound: false, error: result.error, code: result.code, httpStatus: result._httpStatus };
  }
  return {
    ok: true,
    notFound: false,
    idempotent: !!result.idempotent,
    studentId: result.student_id,
    studentName: result.student_name,
    delta: Number(result.delta) || d,
    earned: Number(result.earned) || 0,
    spent: Number(result.spent) || 0,
    available: Number(result.available) || 0,
  };
}
