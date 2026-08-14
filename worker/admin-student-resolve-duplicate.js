/**
 * Prompt #38 — Admin resolve blank-ID duplicate against one identified same-name TMS student.
 * Lantern Admin session → Worker → TMS lantern-bridge. Never exposes the TMS secret.
 */

export const STUDENT_RESOLVE_INSPECT_PATH = '/api/admin/students/resolve-duplicate-inspect';
export const STUDENT_RESOLVE_PATH = '/api/admin/students/resolve-duplicate';
export const RESOLVE_CONFIRM_TEXT = 'RESOLVE';

function fail(error, status, extra) {
  return Object.assign({ ok: false, error, status: status || 400 }, extra || {});
}

export async function inspectResolveDuplicate(env, body, deps) {
  const studentName = String((body && (body.student_name || body.source_student_name)) || '').trim();
  const keepId = String((body && (body.keep_student_id || body.student_id)) || '').trim();
  if (!studentName) return fail('student_name_required', 400, { message: 'Source student name is required.' });
  if (!keepId) return fail('target_id_blank', 400, { message: 'Keep Student ID is required.' });
  const tms = await deps.callTmsRosterBridge(env, 'roster/inspect-resolve-duplicate', {
    student_name: studentName,
    keep_student_id: keepId,
  });
  if (!tms || tms.ok === false) {
    return fail(tms && (tms.error || tms.code) || 'bridge_failed', tms && tms._httpStatus ? tms._httpStatus : 502, {
      message: (tms && (tms.message || tms.error)) || 'Could not inspect duplicate.',
      code: tms && tms.code ? tms.code : null,
    });
  }
  return {
    ok: true,
    already_resolved: !!tms.already_resolved,
    can_resolve: !!tms.can_resolve,
    confirm_text: RESOLVE_CONFIRM_TEXT,
    source: tms.source || { student_name: studentName, student_id: '', missing_id: true },
    keep: tms.keep || { student_name: studentName, student_id: keepId },
    message: tms.message || '',
  };
}

export async function resolveDuplicate(env, body, deps) {
  const confirm = String((body && (body.confirm || body.confirm_text)) || '').trim();
  if (confirm !== RESOLVE_CONFIRM_TEXT) {
    return fail('confirm_required', 400, { message: 'Type RESOLVE to confirm.' });
  }
  const studentName = String((body && (body.student_name || body.source_student_name)) || '').trim();
  const keepId = String((body && (body.keep_student_id || body.student_id)) || '').trim();
  if (!studentName) return fail('student_name_required', 400);
  if (!keepId) return fail('target_id_blank', 400);
  const tms = await deps.callTmsRosterBridge(env, 'roster/resolve-duplicate', {
    student_name: studentName,
    keep_student_id: keepId,
    confirm: RESOLVE_CONFIRM_TEXT,
  });
  if (!tms || tms.ok === false) {
    return fail(tms && (tms.error || tms.code) || 'bridge_failed', tms && tms._httpStatus ? tms._httpStatus : 502, {
      message: (tms && (tms.message || tms.error)) || 'Could not resolve duplicate.',
      code: tms && tms.code ? tms.code : null,
    });
  }
  return {
    ok: true,
    already_resolved: !!tms.already_resolved,
    action: tms.action || 'resolve_duplicate',
    student_name: tms.student_name || studentName,
    keep_student_id: tms.keep_student_id || keepId,
    removed_missing_id: !!tms.removed_missing_id,
    history_preserved: tms.history_preserved !== false,
    message: tms.message || '',
  };
}
