/**
 * Prompt #33 — Admin inspect / permanent-delete / archive for mistaken TMS students.
 * Lantern Admin session → Worker → TMS lantern-bridge. Never exposes the TMS secret.
 */

export const STUDENT_DELETE_INSPECT_PATH = '/api/admin/students/delete-inspect';
export const STUDENT_DELETE_PATH = '/api/admin/students/delete';
export const STUDENT_ARCHIVE_PATH = '/api/admin/students/archive';
export const DELETE_CONFIRM_TEXT = 'DELETE';

const LANTERN_HISTORY_QUERIES = [
  { key: 'missions', label: 'Mission submissions', sql: 'SELECT COUNT(*) AS c FROM lantern_mission_submissions WHERE character_name = ?' },
  { key: 'mission_completions', label: 'Mission completions', sql: 'SELECT COUNT(*) AS c FROM lantern_mission_completions WHERE character_name = ?' },
  { key: 'news', label: 'News posts', sql: 'SELECT COUNT(*) AS c FROM lantern_news_submissions WHERE character_name = ? OR author_username = ?' },
  { key: 'poll_votes', label: 'Poll votes', sql: 'SELECT COUNT(*) AS c FROM lantern_poll_votes WHERE character_name = ?' },
  { key: 'poll_contributions', label: 'Poll contributions', sql: 'SELECT COUNT(*) AS c FROM lantern_poll_contributions WHERE character_name = ?' },
  { key: 'transactions', label: 'Purchases / transactions', sql: 'SELECT COUNT(*) AS c FROM lantern_transactions WHERE character_name = ?' },
  { key: 'feed', label: 'Feed posts', sql: 'SELECT COUNT(*) AS c FROM lantern_feed_items WHERE character_name = ? OR author_username = ?' },
  { key: 'comments', label: 'Feed comments', sql: 'SELECT COUNT(*) AS c FROM lantern_feed_comments WHERE character_name = ?' },
  { key: 'achievements', label: 'Achievements', sql: 'SELECT COUNT(*) AS c FROM lantern_achievements WHERE character_name = ?' },
  { key: 'cosmetics', label: 'Cosmetics', sql: 'SELECT COUNT(*) AS c FROM lantern_cosmetic_ownership WHERE character_name = ?' },
  { key: 'avatars', label: 'Avatar uploads', sql: 'SELECT COUNT(*) AS c FROM lantern_avatar_submissions WHERE character_name = ?' },
  { key: 'reactions', label: 'Reactions', sql: 'SELECT COUNT(*) AS c FROM lantern_final_reaction_responses WHERE character_name = ?' },
];

function fail(error, status, extra) {
  return Object.assign({ ok: false, error, status: status || 400 }, extra || {});
}

function idsEqual(a, b) {
  return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
}

function uniqueKeys(values) {
  const out = [];
  const seen = new Set();
  (values || []).forEach((v) => {
    const s = String(v || '').trim();
    if (!s) return;
    const k = s.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    out.push(s);
  });
  return out;
}

async function countSafe(db, sql, binds) {
  try {
    const row = await db.prepare(sql).bind(...binds).first();
    return Number(row && (row.c != null ? row.c : row.n)) || 0;
  } catch (e) {
    const msg = String((e && e.message) || e || '');
    if (/no such table/i.test(msg)) return 0;
    const err = new Error('lantern_history_inspect_failed');
    err.code = 'lantern_history_inspect_failed';
    throw err;
  }
}

export async function loadPilotsByMtssId(db, studentId) {
  const rows = await db
    .prepare(
      `SELECT username, role, mtss_student_id, is_active, student_character_name, display_name
       FROM lantern_pilot_accounts
       WHERE mtss_student_id IS NOT NULL AND lower(trim(mtss_student_id)) = lower(trim(?))`
    )
    .bind(studentId)
    .all();
  return rows && rows.results ? rows.results : [];
}

export async function inspectLanternAccountHistory(db, account) {
  const keys = uniqueKeys([
    account && account.username,
    account && account.student_character_name,
    account && account.mtss_student_id,
  ]);
  const counts = {};
  const categories = [];
  for (const spec of LANTERN_HISTORY_QUERIES) {
    let n = 0;
    for (const key of keys) {
      const binds = spec.sql.includes('OR author_username') ? [key, key] : [key];
      n += await countSafe(db, spec.sql, binds);
    }
    counts[spec.key] = n;
    if (n > 0) categories.push(spec.label);
  }
  return {
    has_history: categories.length > 0,
    categories,
    counts,
  };
}

function lanternLoginShape(linkedRows, history) {
  if (!linkedRows.length) {
    return {
      linked: false,
      username: null,
      is_active: null,
      has_history: false,
      categories: [],
      can_delete_login: false,
      options: [],
    };
  }
  if (linkedRows.length > 1) {
    return {
      linked: true,
      ambiguous: true,
      username: null,
      is_active: null,
      has_history: true,
      categories: ['Multiple linked Lantern logins'],
      can_delete_login: false,
      options: [],
    };
  }
  const row = linkedRows[0];
  const username = String(row.username || '').trim();
  const isActive = row.is_active != null ? Number(row.is_active) === 1 : true;
  const hasHistory = !!(history && history.has_history);
  return {
    linked: true,
    ambiguous: false,
    username,
    is_active: isActive ? 1 : 0,
    has_history: hasHistory,
    categories: hasHistory ? history.categories : [],
    can_delete_login: !hasHistory,
    options: hasHistory ? ['unlink'] : ['delete_login', 'unlink'],
  };
}

function auditStudentAction(action, studentId, actor) {
  try {
    console.log(
      JSON.stringify({
        event: 'admin_student_action',
        action,
        student_id: String(studentId || '').trim(),
        actor: String(actor || 'admin').trim(),
        ts: new Date().toISOString(),
      })
    );
  } catch (_) {}
}

export async function inspectStudentDelete(db, env, body, deps) {
  deps = deps || {};
  const studentId = String((body && body.student_id) || '').trim();
  if (!studentId) return fail('student_id_required', 400);
  if (!deps.callTmsRosterBridge) return fail('server_misconfigured', 500);

  const tms = await deps.callTmsRosterBridge(env, 'roster/inspect-delete', { student_id: studentId });
  if (!tms || tms.ok === false) {
    return fail((tms && (tms.error || tms.code)) || 'tms_inspect_failed', (tms && tms._httpStatus) || 502, {
      tms,
      message: 'TMS delete inspection failed.',
    });
  }

  const linked = await loadPilotsByMtssId(db, studentId);
  let history = { has_history: false, categories: [], counts: {} };
  if (linked.length === 1) {
    history = await inspectLanternAccountHistory(db, linked[0]);
  }
  const lantern_login = lanternLoginShape(linked, history);
  const tmsDeletable = !!tms.can_permanently_delete && !tms.already_removed;
  const lanternBlocksDelete = lantern_login.linked && lantern_login.ambiguous;
  const can_permanently_delete = tmsDeletable && !lanternBlocksDelete;
  const categories = []
    .concat(Array.isArray(tms.categories) ? tms.categories : [])
    .concat(lantern_login.has_history ? ['Lantern activity'] : []);

  return {
    ok: true,
    student_id: studentId,
    student_name: tms.student_name || null,
    already_removed: !!tms.already_removed,
    classification: !can_permanently_delete && !tms.already_removed
      ? tms.classification === 'safe_mistake' && lanternBlocksDelete
        ? 'cannot_delete_has_history'
        : tms.classification || 'cannot_delete_has_history'
      : tms.classification || 'safe_mistake',
    can_permanently_delete,
    can_archive: !!tms.can_archive,
    tms,
    lantern_login,
    geppetto: {
      inspected: false,
      reason: 'no_s2s_lookup',
      will_leave_future_roster_sync: true,
      local_history_not_deleted: true,
    },
    categories,
    message: tms.already_removed
      ? 'Student ID is not on the TMS roster.'
      : can_permanently_delete
        ? 'This student appears safe to delete.'
        : 'Cannot permanently delete this student because historical records exist.',
  };
}

async function unlinkLanternLogin(db, username, studentId) {
  await db
    .prepare(
      `UPDATE lantern_pilot_accounts
       SET mtss_student_id = NULL, updated_at = datetime('now')
       WHERE username = ? AND lower(trim(mtss_student_id)) = lower(trim(?)) AND lower(trim(role)) = 'student'`
    )
    .bind(username, studentId)
    .run();
}

async function deleteLanternLogin(db, username, studentId) {
  await db
    .prepare(
      `DELETE FROM lantern_pilot_accounts
       WHERE username = ? AND lower(trim(mtss_student_id)) = lower(trim(?)) AND lower(trim(role)) = 'student'`
    )
    .bind(username, studentId)
    .run();
}

export async function permanentlyDeleteStudent(db, env, body, deps) {
  deps = deps || {};
  const studentId = String((body && body.student_id) || '').trim();
  const confirm = String((body && body.confirm) || '').trim();
  const loginAction = String((body && body.lantern_login_action) || '').trim().toLowerCase();
  if (!studentId) return fail('student_id_required', 400);
  if (confirm !== DELETE_CONFIRM_TEXT) {
    return fail('confirmation_required', 400, { message: 'Type DELETE to confirm permanent deletion.' });
  }
  if (!deps.callTmsRosterBridge) return fail('server_misconfigured', 500);

  const inspect = await inspectStudentDelete(db, env, { student_id: studentId }, deps);
  if (!inspect.ok) return inspect;
  if (inspect.already_removed && !inspect.lantern_login.linked) {
    auditStudentAction('permanent_delete_already_removed', studentId, deps.adminUsername);
    return {
      ok: true,
      already_removed: true,
      action: 'permanent_delete',
      student_id: studentId,
      lantern_login: 'none',
      message: 'Student already removed.',
    };
  }
  if (!inspect.can_permanently_delete) {
    return fail('cannot_delete_has_history', 409, {
      student_id: studentId,
      student_name: inspect.student_name,
      categories: inspect.categories,
      can_archive: inspect.can_archive,
      lantern_login: inspect.lantern_login,
      message: inspect.message,
    });
  }

  let lanternResult = 'none';
  if (inspect.lantern_login.linked) {
    if (inspect.lantern_login.has_history || !inspect.lantern_login.can_delete_login) {
      if (loginAction === 'delete_login') {
        return fail('lantern_login_has_history', 409, {
          student_id: studentId,
          lantern_username: inspect.lantern_login.username,
          categories: inspect.lantern_login.categories,
          message: 'Linked Lantern login has activity. It was not deleted. Choose unlink or Archive.',
        });
      }
      await unlinkLanternLogin(db, inspect.lantern_login.username, studentId);
      lanternResult = 'unlinked';
    } else if (loginAction === 'delete_login') {
      await deleteLanternLogin(db, inspect.lantern_login.username, studentId);
      lanternResult = 'deleted';
    } else if (loginAction === 'unlink') {
      await unlinkLanternLogin(db, inspect.lantern_login.username, studentId);
      lanternResult = 'unlinked';
    } else {
      return fail('lantern_login_action_required', 400, {
        student_id: studentId,
        lantern_username: inspect.lantern_login.username,
        options: inspect.lantern_login.options,
        message: 'This roster row is linked to a Lantern login. Choose delete_login or unlink.',
      });
    }
  }

  const tms = await deps.callTmsRosterBridge(env, 'roster/safe-delete', { student_id: studentId });
  if (!tms || tms.ok === false) {
    return fail((tms && (tms.error || tms.code)) || 'tms_delete_failed', (tms && tms._httpStatus) || 502, {
      tms,
      lantern_login: lanternResult,
      message: 'TMS roster was not deleted.',
    });
  }

  auditStudentAction('permanent_delete', studentId, deps.adminUsername);
  return {
    ok: true,
    already_removed: !!tms.already_removed,
    action: 'permanent_delete',
    student_id: studentId,
    student_name: tms.student_name || inspect.student_name,
    lantern_login: lanternResult,
    geppetto: 'removed_from_future_roster_sync',
    message: tms.already_removed ? 'Student already removed.' : 'Mistaken student removed.',
  };
}

export async function archiveStudent(db, env, body, deps) {
  deps = deps || {};
  const studentId = String((body && body.student_id) || '').trim();
  if (!studentId) return fail('student_id_required', 400);
  if (!deps.callTmsRosterBridge) return fail('server_misconfigured', 500);

  const tms = await deps.callTmsRosterBridge(env, 'roster/archive', {
    student_id: studentId,
    reason: 'lantern_admin_archive',
  });
  if (!tms || tms.ok === false) {
    return fail((tms && (tms.error || tms.code)) || 'tms_archive_failed', (tms && tms._httpStatus) || 502, {
      tms,
      message: 'TMS archive failed.',
    });
  }

  auditStudentAction('archive', studentId, deps.adminUsername);
  return {
    ok: true,
    action: 'archive',
    already_archived: !!tms.already_archived,
    student_id: studentId,
    student_name: tms.student_name || null,
    tms_active: 0,
    lantern_login: 'unchanged',
    message: tms.message || 'Student archived. History is preserved.',
  };
}
