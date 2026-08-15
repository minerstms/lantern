/**
 * Prompt #48 — Admin exact-ID human-name rename.
 * Lantern Admin session → Worker → TMS roster/rename. Never exposes the TMS secret.
 */

export const STUDENT_RENAME_PATH = '/api/admin/students/rename';
export const STUDENT_RENAME_REVISION = 'student-rename-48';

function fail(error, status, extra) {
  return Object.assign(
    {
      ok: false,
      verified: false,
      revision: STUDENT_RENAME_REVISION,
      error,
      status: status || 400,
    },
    extra || {}
  );
}

function normalizeName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

export function buildRenameRequestedName(first, last) {
  return [normalizeName(first), normalizeName(last)].filter(Boolean).join(' ').trim();
}

function splitDisplayName(fullName) {
  const parts = normalizeName(fullName).split(/\s+/).filter(Boolean);
  if (!parts.length) return { first_name: '', last_name: '' };
  if (parts.length === 1) return { first_name: parts[0], last_name: '' };
  return { first_name: parts[0], last_name: parts.slice(1).join(' ') };
}

function rosterNamePartsFromBridge(bridge, fallbackName) {
  if (bridge && (bridge.first_name != null || bridge.last_name != null)) {
    return {
      first_name: normalizeName(bridge.first_name),
      last_name: normalizeName(bridge.last_name),
    };
  }
  return splitDisplayName(fallbackName);
}

async function syncLanternDisplayName(db, studentId, authoritativeName, firstName, lastName) {
  if (!db || !studentId || !authoritativeName) return false;
  const names =
    firstName != null || lastName != null
      ? { first_name: normalizeName(firstName), last_name: normalizeName(lastName) }
      : splitDisplayName(authoritativeName);
  try {
    await db
      .prepare(
        `INSERT INTO lantern_student_identities (character_name, display_name, created_at)
         VALUES (?, ?, ?)
         ON CONFLICT(character_name) DO UPDATE SET display_name = excluded.display_name`
      )
      .bind(studentId, authoritativeName, new Date().toISOString())
      .run();
  } catch (_) {}
  const linkedRows = await db
    .prepare(
      `SELECT username FROM lantern_pilot_accounts
       WHERE mtss_student_id IS NOT NULL
         AND lower(trim(mtss_student_id)) = lower(trim(?))
         AND lower(trim(role)) = 'student'`
    )
    .bind(studentId)
    .all();
  const linked = linkedRows && linkedRows.results ? linkedRows.results : [];
  if (linked.length !== 1) return false;
  const username = String(linked[0].username || '').trim();
  if (!username) return false;
  await db
    .prepare(
      `UPDATE lantern_pilot_accounts
       SET display_name = ?, first_name = ?, last_name = ?, updated_at = datetime('now')
       WHERE username = ?
         AND lower(trim(role)) = 'student'
         AND lower(trim(mtss_student_id)) = lower(trim(?))`
    )
    .bind(authoritativeName, names.first_name, names.last_name, username, studentId)
    .run();
  return true;
}

/**
 * @param {{ callTmsRosterBridge: Function }} deps
 */
export async function renameAuthoritativeStudent(db, env, body, deps) {
  const studentId = String((body && body.student_id) || '').trim();
  const first = normalizeName(body && body.first_name);
  const last = normalizeName(body && body.last_name);
  const requestedName = buildRenameRequestedName(first, last);
  if (!studentId) return fail('student_id_required', 400, { message: 'student_id is required.' });
  if (!first) {
    return fail('first_name_required', 400, {
      message: 'First name is required.',
      student_id: studentId,
      requested_name: requestedName,
    });
  }
  if (!requestedName) {
    return fail('student_name_required', 400, {
      message: 'A nonblank human name is required.',
      student_id: studentId,
    });
  }
  if (!deps || typeof deps.callTmsRosterBridge !== 'function') {
    return fail('server_misconfigured', 500, { student_id: studentId, requested_name: requestedName });
  }

  const bridge = await deps.callTmsRosterBridge(env, 'roster/rename', {
    student_id: studentId,
    first_name: first,
    last_name: last,
  });

  const authoritativeName =
    bridge && bridge.authoritative_name != null ? normalizeName(bridge.authoritative_name) : '';
  const beforeName = bridge && bridge.before_name != null ? normalizeName(bridge.before_name) : '';
  const changes = bridge && bridge.changes != null ? Number(bridge.changes) : 0;
  const tmsVerified = !!(bridge && bridge.ok === true && bridge.verified === true);
  const names = rosterNamePartsFromBridge(bridge, authoritativeName);
  const partsMatch =
    names.first_name === first &&
    names.last_name === last &&
    !!authoritativeName &&
    authoritativeName.toLowerCase() === requestedName.toLowerCase();
  const idMatch = String((bridge && bridge.student_id) || '').trim() === studentId;
  const verified = !!(tmsVerified && partsMatch && idMatch);

  if (!verified) {
    const status = bridge && bridge._httpStatus && bridge._httpStatus >= 400 ? bridge._httpStatus : 409;
    return fail(bridge && (bridge.code || bridge.error) ? (bridge.code || bridge.error) : 'authoritative_update_not_applied', status, {
      code: (bridge && (bridge.code || bridge.error)) || 'authoritative_update_not_applied',
      message:
        (bridge && (bridge.message || bridge.error)) ||
        'The authoritative TMS row did not match the requested name.',
      student_id: studentId,
      before_name: beforeName || null,
      requested_name: requestedName,
      authoritative_name: authoritativeName || null,
      changes,
      verified: false,
    });
  }

  let lantern_display_updated = false;
  try {
    lantern_display_updated = await syncLanternDisplayName(db, studentId, authoritativeName, names.first_name, names.last_name);
  } catch (_) {
    lantern_display_updated = false;
  }

  return {
    ok: true,
    revision: STUDENT_RENAME_REVISION,
    student_id: studentId,
    before_name: beforeName,
    requested_name: requestedName,
    requested_first_name: first,
    requested_last_name: last,
    authoritative_name: authoritativeName,
    student_name: authoritativeName,
    first_name: names.first_name,
    last_name: names.last_name,
    changes,
    verified: true,
    lantern_display_updated,
  };
}
