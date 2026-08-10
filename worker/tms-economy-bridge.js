/**
 * Prompt #96/#107 -- one Nugget economy: Lantern client for TMS bridge.
 * Supports student_id (students) and staff principal (tms_staff_id) routes.
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

/** Prompt #107 — staff principal balance via tms_staff_id. */
export async function tmsStaffEconomyBalance(env, tmsStaffId) {
  const id = String(tmsStaffId || '').trim();
  if (!id) return { ok: false, notFound: true };
  const result = await callTmsEconomyBridge(env, 'balance', { principal_type: 'staff', tms_staff_id: id });
  if (result._httpStatus === 404) return { ok: false, notFound: true };
  if (!result.ok) {
    return { ok: false, notFound: false, error: result.error, code: result.code, httpStatus: result._httpStatus };
  }
  return {
    ok: true,
    notFound: false,
    tmsStaffId: result.tms_staff_id || id,
    earned: Number(result.earned) || 0,
    spent: Number(result.spent) || 0,
    available: Number(result.available) || 0,
    recentHistory: Array.isArray(result.recent_history) ? result.recent_history : [],
  };
}

/** Prompt #107 — staff principal grant/spend via tms_staff_id. */
export async function tmsStaffEconomyTransact(env, tmsStaffId, delta, kind, source, note, reference) {
  const id = String(tmsStaffId || '').trim();
  const d = Math.floor(Number(delta));
  if (!id) return { ok: false, notFound: true };
  if (!Number.isFinite(d) || d === 0) return { ok: false, notFound: false, error: 'invalid_delta' };
  const ref = String(reference || '').trim();
  if (!ref) return { ok: false, notFound: false, error: 'reference_required' };
  const result = await callTmsEconomyBridge(env, 'transact', {
    principal_type: 'staff',
    tms_staff_id: id,
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
    tmsStaffId: result.tms_staff_id || id,
    delta: Number(result.delta) || d,
    earned: Number(result.earned) || 0,
    spent: Number(result.spent) || 0,
    available: Number(result.available) || 0,
  };
}
