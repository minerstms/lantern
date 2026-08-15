/**
 * Prompt #32 — unified Admin Add Student.
 * TMS roster identity first (existing lantern-bridge roster/list + roster/create),
 * then Lantern login with the same school Student ID. Never writes Geppetto.
 */
import {
  generateStaffTempPassword,
  validateDisplayName,
  validateStaffNamePart,
} from './admin-account-utils.js';
import { defaultPublicDisplayName } from './staff-public-name.js';

export const ADD_STUDENT_ID_MAX_LEN = 256;
export const ADD_STUDENT_PATH = '/api/admin/students/add';

export function normalizeAddStudentGradeSlug(raw) {
  const s = String(raw ?? '').trim().toLowerCase();
  if (!s) return 'grade-6';
  if (/^(grade[-_\s]*)?[678](st|nd|rd|th)?(\s*grade)?$/i.test(s) || /^grade-[678]$/.test(s)) {
    const m = s.match(/([678])/);
    return m ? 'grade-' + m[1] : 'grade-6';
  }
  return '';
}

export function findTmsStudentsById(students, studentId) {
  const want = String(studentId || '').trim().toLowerCase();
  if (!want) return [];
  return (Array.isArray(students) ? students : []).filter((s) => {
    return String(s && s.student_id != null ? s.student_id : '').trim().toLowerCase() === want;
  });
}

function idsEqual(a, b) {
  return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
}

function fail(error, status, extra) {
  return Object.assign(
    {
      ok: false,
      error,
      status: status || 400,
      tms_roster: 'not_created',
      lantern_login: 'not_created',
      geppetto: 'not_available',
    },
    extra || {}
  );
}

function successShape(fields) {
  return Object.assign(
    {
      ok: true,
      geppetto: 'available_on_next_roster_sync',
      geppetto_message: 'Student is ready for Geppetto roster sync.',
    },
    fields
  );
}

async function loadPilotByUsername(db, username) {
  return db
    .prepare(
      `SELECT username, role, mtss_student_id, is_active, display_name, first_name, last_name
       FROM lantern_pilot_accounts WHERE lower(trim(username)) = lower(trim(?))`
    )
    .bind(username)
    .first();
}

async function loadPilotsByMtssId(db, studentId) {
  const rows = await db
    .prepare(
      `SELECT username, role, mtss_student_id, is_active FROM lantern_pilot_accounts
       WHERE mtss_student_id IS NOT NULL AND lower(trim(mtss_student_id)) = lower(trim(?))`
    )
    .bind(studentId)
    .all();
  return rows && rows.results ? rows.results : [];
}

async function ensureTmsRosterIdentity(env, spec, callTmsRosterBridge) {
  const list = await callTmsRosterBridge(env, 'roster/list', { include_inactive: true });
  if (!list || !list.ok) {
    return fail(list && list.error ? list.error : 'tms_roster_unavailable', (list && list._httpStatus) || 502, {
      tms_roster: 'failed',
      lantern_login: 'not_created',
      message: 'TMS roster lookup failed. Lantern login was not created.',
    });
  }

  const matches = findTmsStudentsById(list.students, spec.studentId);
  if (matches.length > 1) {
    return fail('duplicate_student_id', 409, {
      tms_roster: 'conflict',
      lantern_login: 'not_created',
      student_id: spec.studentId,
      message: 'Student ID is assigned to more than one TMS roster row. Reconcile in TMS before adding.',
    });
  }
  if (matches.length === 1) {
    const row = matches[0];
    const existingName = String(row.student_name || '').trim();
    return {
      ok: true,
      tms_roster: 'existing',
      student_id: String(row.student_id || spec.studentId).trim() || spec.studentId,
      tms_student_name: existingName,
      tms_active: row.is_active != null ? Number(row.is_active) === 1 : true,
      name_differs: !!(existingName && existingName !== spec.studentName),
    };
  }

  const created = await callTmsRosterBridge(env, 'roster/create', {
    student_name: spec.studentName,
    first_name: spec.firstName,
    last_name: spec.lastName,
    student_id: spec.studentId,
    grade: spec.grade,
    grade_slug: spec.gradeSlug,
  });
  if (created && created.ok) {
    return {
      ok: true,
      tms_roster: 'created',
      student_id: created.student_id != null && String(created.student_id).trim() ? String(created.student_id).trim() : spec.studentId,
      tms_student_name: String(created.student_name || spec.studentName).trim(),
      tms_active: true,
      grade: created.grade != null ? String(created.grade) : spec.grade,
      name_differs: false,
    };
  }

  const code = String((created && (created.code || created.error)) || '');
  if (code === 'duplicate_student_id' || code === 'already_exists') {
    const again = await callTmsRosterBridge(env, 'roster/list', { include_inactive: true });
    const found = findTmsStudentsById(again && again.ok ? again.students : [], spec.studentId);
    if (found.length === 1) {
      const row = found[0];
      const existingName = String(row.student_name || '').trim();
      return {
        ok: true,
        tms_roster: 'existing',
        student_id: String(row.student_id || spec.studentId).trim() || spec.studentId,
        tms_student_name: existingName,
        tms_active: row.is_active != null ? Number(row.is_active) === 1 : true,
        name_differs: !!(existingName && existingName !== spec.studentName),
      };
    }
    return fail('duplicate_student_id', 409, {
      tms_roster: 'conflict',
      lantern_login: 'not_created',
      student_id: spec.studentId,
      message: created.message || created.error || 'Student ID already exists on TMS. Lantern login was not created.',
    });
  }

  return fail((created && created.error) || 'tms_create_failed', (created && created._httpStatus) || 502, {
    tms_roster: 'failed',
    lantern_login: 'not_created',
    message: 'TMS roster was not created. Lantern login was not created.',
  });
}

async function createLanternStudentLogin(db, spec, deps) {
  const salt = deps.randomSalt();
  const temporaryPassword = generateStaffTempPassword();
  const hash = await deps.hashPassword(temporaryPassword, salt);
  const publicDisplayName =
    defaultPublicDisplayName({
      username: spec.username,
      role: 'student',
      first_name: spec.firstName,
      last_name: spec.lastName,
      display_name: spec.displayName,
    }) || spec.displayName;
  const adminUsername = spec.adminUsername || 'admin';
  try {
    const ins = await db
      .prepare(
        `INSERT INTO lantern_pilot_accounts (username, display_name, first_name, last_name, honorific, public_display_name, staff_id, email, role, password_hash, password_salt, student_character_name, teacher_id, mtss_student_id, updated_at, is_active, must_change_password, password_reset_at, password_reset_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), 1, ?, CASE WHEN ? = 1 THEN datetime('now') ELSE NULL END, ?)`
      )
      .bind(
        spec.username,
        spec.displayName,
        spec.firstName,
        spec.lastName,
        null,
        publicDisplayName,
        null,
        null,
        'student',
        hash,
        salt,
        null,
        null,
        spec.studentId,
        1,
        1,
        adminUsername
      )
      .run();
    if (!ins || !ins.success) {
      return { ok: false, error: 'insert_failed' };
    }
  } catch (e) {
    const msg = String((e && e.message) || e || '');
    if (/UNIQUE/i.test(msg)) return { ok: false, error: 'username_taken' };
    return { ok: false, error: 'insert_failed' };
  }
  return { ok: true, temporary_password: temporaryPassword, must_change_password: true };
}

/**
 * @param {object} db
 * @param {object} env
 * @param {object} body
 * @param {{ callTmsRosterBridge: Function, hashPassword: Function, randomSalt: Function, adminUsername?: string }} deps
 */
export async function addAuthoritativeStudent(db, env, body, deps) {
  deps = deps || {};
  const studentId = String((body && body.student_id) || '').trim();
  const usernameWanted = String((body && body.username) || '').trim() || studentId;
  const firstCheck = validateStaffNamePart(body && body.first_name, 'first_name', { required: true });
  if (!firstCheck.ok) return fail(firstCheck.error, 400);
  const lastCheck = validateStaffNamePart(body && body.last_name, 'last_name', { required: false });
  if (!lastCheck.ok) return fail(lastCheck.error, 400);
  const firstName = firstCheck.value;
  const lastName = lastCheck.value;
  const studentName = [firstName, lastName].filter(Boolean).join(' ').trim();
  const dnCheck = validateDisplayName(studentName, { required: true });
  if (!dnCheck.ok) return fail(dnCheck.error, 400);

  if (!studentId) {
    return fail('student_id_required', 400, {
      message: 'School Student ID is required. Do not invent IDs.',
    });
  }
  if (studentId.length > ADD_STUDENT_ID_MAX_LEN) {
    return fail('student_id_too_long', 400, { max: ADD_STUDENT_ID_MAX_LEN });
  }
  if (!usernameWanted) return fail('username_required', 400);
  if (!deps.callTmsRosterBridge || !deps.hashPassword || !deps.randomSalt) {
    return fail('server_misconfigured', 500);
  }

  const gradeSlug = normalizeAddStudentGradeSlug(body && (body.grade_slug != null ? body.grade_slug : body.grade));
  if (!gradeSlug) {
    return fail('invalid_grade', 400, { message: 'grade must be 6, 7, or 8' });
  }
  const grade = gradeSlug.replace(/^grade-/, '');

  const tms = await ensureTmsRosterIdentity(
    env,
    { studentId, studentName, firstName, lastName, grade, gradeSlug },
    deps.callTmsRosterBridge
  );
  if (!tms.ok) return tms;

  const canonicalId = tms.student_id || studentId;
  const linked = await loadPilotsByMtssId(db, canonicalId);
  if (linked.length > 1) {
    return fail('ambiguous_mtss_student_id', 409, {
      tms_roster: tms.tms_roster,
      lantern_login: 'conflict',
      student_id: canonicalId,
      message: 'More than one Lantern account already uses this Student ID.',
    });
  }
  if (linked.length === 1) {
    const row = linked[0];
    const uname = String(row.username || '').trim();
    if (!idsEqual(uname, usernameWanted) && !idsEqual(usernameWanted, canonicalId)) {
      return fail('account_has_different_username', 409, {
        tms_roster: tms.tms_roster,
        lantern_login: 'conflict',
        student_id: canonicalId,
        lantern_username: uname,
        message: 'This Student ID is already linked to a different Lantern username.',
      });
    }
    return successShape({
      already_linked: true,
      tms_roster: tms.tms_roster,
      lantern_login: 'linked',
      student_id: canonicalId,
      lantern_username: uname,
      mtss_student_id: canonicalId,
      first_name: firstName,
      last_name: lastName,
      student_name: studentName,
      display_name: tms.tms_student_name || studentName,
      tms_student_name: tms.tms_student_name,
      name_differs: !!tms.name_differs,
      message: 'Student already linked. No duplicate TMS or Lantern identity created.',
    });
  }

  const existingUser = await loadPilotByUsername(db, usernameWanted);
  if (existingUser) {
    const role = String(existingUser.role || '').trim().toLowerCase();
    const existingMtss =
      existingUser.mtss_student_id != null ? String(existingUser.mtss_student_id).trim() : '';
    if (role !== 'student') {
      return fail('username_not_student_role', 409, {
        tms_roster: tms.tms_roster,
        lantern_login: 'conflict',
        student_id: canonicalId,
        lantern_username: String(existingUser.username || '').trim(),
        message: 'A non-student Lantern account already uses this username. Lantern login was not created.',
      });
    }
    if (existingMtss && !idsEqual(existingMtss, canonicalId)) {
      return fail('account_has_different_mtss_student_id', 409, {
        tms_roster: tms.tms_roster,
        lantern_login: 'conflict',
        student_id: canonicalId,
        lantern_username: String(existingUser.username || '').trim(),
        existing_mtss_student_id: existingMtss,
        message: 'Lantern account already has a different mtss_student_id. Reconcile manually.',
      });
    }
    if (!existingMtss) {
      const uname = String(existingUser.username || '').trim();
      if (!idsEqual(uname, canonicalId)) {
        return fail('explicit_username_mismatch', 409, {
          tms_roster: tms.tms_roster,
          lantern_login: 'conflict',
          student_id: canonicalId,
          lantern_username: uname,
          message: 'Unlinked Lantern account username does not match this Student ID. Use Link Existing Account.',
        });
      }
      await db
        .prepare(
          `UPDATE lantern_pilot_accounts SET mtss_student_id = ?, updated_at = datetime('now') WHERE username = ?`
        )
        .bind(canonicalId, uname)
        .run();
      return successShape({
        tms_roster: tms.tms_roster,
        lantern_login: 'linked',
        student_id: canonicalId,
        lantern_username: uname,
        mtss_student_id: canonicalId,
        first_name: firstName,
        last_name: lastName,
        student_name: studentName,
        display_name: tms.tms_student_name || studentName,
        tms_student_name: tms.tms_student_name,
        name_differs: !!tms.name_differs,
        message: 'Existing Lantern login linked to this Student ID. Password was not changed.',
      });
    }
  }

  const createdLogin = await createLanternStudentLogin(
    db,
    {
      username: usernameWanted,
      studentId: canonicalId,
      displayName: dnCheck.value,
      firstName,
      lastName,
      adminUsername: deps.adminUsername,
    },
    deps
  );
  if (!createdLogin.ok) {
    return fail(createdLogin.error || 'lantern_login_not_created', 500, {
      tms_roster: tms.tms_roster,
      lantern_login: 'not_created',
      student_id: canonicalId,
      tms_student_name: tms.tms_student_name,
      message:
        tms.tms_roster === 'created'
          ? 'TMS roster created. Lantern login not created. Retry/link required.'
          : 'TMS roster exists. Lantern login not created. Retry/link required.',
    });
  }

  return successShape({
    tms_roster: tms.tms_roster,
    lantern_login: 'created',
    student_id: canonicalId,
    lantern_username: usernameWanted,
    mtss_student_id: canonicalId,
    first_name: firstName,
    last_name: lastName,
    student_name: studentName,
    display_name: dnCheck.value,
    tms_student_name: tms.tms_student_name,
    name_differs: !!tms.name_differs,
    temporary_password: createdLogin.temporary_password,
    must_change_password: true,
    message: 'Student added.',
  });
}
