/**
 * Prompt #40 — server-authoritative student identity health for Lantern Admin.
 * TMS remains the roster source. This classifier never auto-links by name.
 */

export const STUDENT_HEALTH = {
  HEALTHY: 'healthy',
  MISSING_SCHOOL_ID: 'missing_school_id',
  MISSING_LANTERN_LOGIN: 'missing_lantern_login',
  UNLINKED_LANTERN_LOGIN: 'unlinked_lantern_login',
  DUPLICATE_ROSTER: 'duplicate_roster',
  CONFLICTING_SCHOOL_ID: 'conflicting_school_id',
  NAME_CONFLICT: 'name_conflict',
  ARCHIVED_ROSTER_ACTIVE_LOGIN: 'archived_roster_active_login',
  ACTIVE_ROSTER_ARCHIVED_LOGIN: 'active_roster_archived_login',
  MULTIPLE_LANTERN_ACCOUNTS: 'multiple_lantern_accounts',
  IDENTITY_NEEDS_REVIEW: 'identity_needs_review',
};

export const HEALTH_LABELS = {
  healthy: 'Healthy',
  missing_school_id: 'Missing School ID',
  missing_lantern_login: 'Missing Lantern Login',
  unlinked_lantern_login: 'Unlinked Lantern Login',
  duplicate_roster: 'Duplicate Roster Record',
  conflicting_school_id: 'Conflicting School ID',
  name_conflict: 'Name Conflict',
  archived_roster_active_login: 'Archived Roster / Active Login',
  active_roster_archived_login: 'Active Roster / Archived Login',
  multiple_lantern_accounts: 'Multiple Lantern Accounts',
  identity_needs_review: 'Identity Needs Review',
};

export function normalizeHealthName(raw) {
  return String(raw || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function rowKey(row) {
  return normalizeHealthName(row && row.student_name) + '|' + String((row && row.student_id) || '').trim();
}

function compactPeer(row) {
  return {
    student_name: String((row && row.student_name) || '').trim(),
    student_id: String((row && row.student_id) || '').trim(),
    is_active: row && Number(row.is_active) === 1 ? 1 : 0,
  };
}

export function buildRosterPeerIndex(students) {
  const list = Array.isArray(students) ? students : [];
  const byName = new Map();
  const byId = new Map();
  for (let i = 0; i < list.length; i++) {
    const row = list[i];
    const name = normalizeHealthName(row && row.student_name);
    const sid = String((row && row.student_id) || '').trim();
    if (name) {
      if (!byName.has(name)) byName.set(name, []);
      byName.get(name).push(row);
    }
    if (sid) {
      const idKey = sid.toLowerCase();
      if (!byId.has(idKey)) byId.set(idKey, []);
      byId.get(idKey).push(row);
    }
  }
  return { byName, byId };
}

function peersExceptSelf(list, row) {
  const self = rowKey(row);
  return (list || []).filter((other) => rowKey(other) !== self);
}

export function classifyStudentHealth(row, index) {
  const name = String((row && row.student_name) || '').trim();
  const sid = String((row && row.student_id) || '').trim();
  const active = !(row && Number(row.is_active) === 0);
  const lantern = String((row && row.lantern_account) || '');
  const sameName = peersExceptSelf(index && index.byName ? index.byName.get(normalizeHealthName(name)) : [], row);
  const sameId = sid
    ? peersExceptSelf(index && index.byId ? index.byId.get(sid.toLowerCase()) : [], row)
    : [];
  const identifiedSameName = sameName.filter((p) => String(p.student_id || '').trim());
  const blankSameName = sameName.filter((p) => !String(p.student_id || '').trim());

  let health_state = STUDENT_HEALTH.HEALTHY;
  let health_detail = 'This student record looks complete.';
  let primary_action = null;
  let possible_duplicate = null;
  const name_peers = identifiedSameName.map(compactPeer);
  const id_peers = sameId.map(compactPeer);

  if (sameId.length) {
    health_state = STUDENT_HEALTH.CONFLICTING_SCHOOL_ID;
    health_detail = 'More than one roster row uses School ID ' + sid + '. Review before editing.';
    primary_action = 'resolve';
  } else if (lantern === 'Ambiguous') {
    health_state = STUDENT_HEALTH.MULTIPLE_LANTERN_ACCOUNTS;
    health_detail = 'More than one Lantern login is tied to this School ID. Do not guess which one to keep.';
    primary_action = 'resolve';
  } else if (lantern === 'Broken' && !row.exact_match_linkable) {
    health_state = STUDENT_HEALTH.IDENTITY_NEEDS_REVIEW;
    health_detail = 'A Lantern login matches this School ID but is linked to a different student. Unlink or correct it explicitly.';
    primary_action = 'resolve';
  } else if (!sid && identifiedSameName.length === 1) {
    health_state = STUDENT_HEALTH.DUPLICATE_ROSTER;
    possible_duplicate = compactPeer(identifiedSameName[0]);
    health_detail =
      'Possible duplicate: School ID ' +
      possible_duplicate.student_id +
      '. Confirm they are the same student before consolidating.';
    primary_action = 'resolve';
  } else if (!sid) {
    health_state = STUDENT_HEALTH.MISSING_SCHOOL_ID;
    health_detail =
      identifiedSameName.length > 1
        ? 'This row has no School ID, and more than one identified student uses this name. Assign the real ID or remove a mistaken row.'
        : 'This row has no School ID. Assign the real school ID, mark it as a duplicate of an identified student, or remove it if it was entered by mistake.';
    primary_action = 'resolve';
  } else if (sid && identifiedSameName.length) {
    health_state = STUDENT_HEALTH.NAME_CONFLICT;
    health_detail = 'Another identified student already uses this exact name. Confirm they are different people or resolve the extra row.';
    primary_action = 'resolve';
  } else if (!active && lantern === 'Linked') {
    health_state = STUDENT_HEALTH.ARCHIVED_ROSTER_ACTIVE_LOGIN;
    health_detail = 'The roster row is archived, but the Lantern login is still active.';
    primary_action = 'resolve';
  } else if (active && lantern === 'Linked Archived') {
    health_state = STUDENT_HEALTH.ACTIVE_ROSTER_ARCHIVED_LOGIN;
    health_detail = 'The roster row is active, but the Lantern login is archived.';
    primary_action = 'resolve';
  } else if (row.exact_match_linkable) {
    health_state = STUDENT_HEALTH.UNLINKED_LANTERN_LOGIN;
    health_detail = 'A Lantern login already uses this School ID as its username. Link it only if an administrator confirms the match.';
    primary_action = 'link_login';
  } else if (active && lantern === 'Missing') {
    health_state = STUDENT_HEALTH.MISSING_LANTERN_LOGIN;
    health_detail = 'This student has a School ID but no Lantern login yet.';
    primary_action = 'create_login';
  } else if (lantern === 'Broken') {
    health_state = STUDENT_HEALTH.UNLINKED_LANTERN_LOGIN;
    health_detail = 'A Lantern login uses this School ID as its username and can be linked.';
    primary_action = 'link_login';
  }

  const needs_attention = health_state !== STUDENT_HEALTH.HEALTHY;
  return {
    health_state,
    health_label: HEALTH_LABELS[health_state] || 'Identity Needs Review',
    health_detail,
    needs_attention,
    primary_action,
    possible_duplicate,
    name_peers,
    id_peers,
    blank_name_peer_count: blankSameName.length,
  };
}

export function attachStudentHealth(students) {
  const list = Array.isArray(students) ? students : [];
  const index = buildRosterPeerIndex(list);
  return list.map((row) => Object.assign({}, row, classifyStudentHealth(row, index)));
}

export function summarizeStudentHealth(students) {
  const list = Array.isArray(students) ? students : [];
  let healthy = 0;
  let needs_attention = 0;
  const by_state = {};
  for (let i = 0; i < list.length; i++) {
    const state = String(list[i].health_state || STUDENT_HEALTH.HEALTHY);
    by_state[state] = (by_state[state] || 0) + 1;
    if (list[i].needs_attention) needs_attention += 1;
    else healthy += 1;
  }
  return { healthy, needs_attention, by_state };
}

export function findConflictingNamePeer(students, studentName, excludeStudentId) {
  const want = normalizeHealthName(studentName);
  const exclude = String(excludeStudentId || '').trim().toLowerCase();
  if (!want) return null;
  const list = Array.isArray(students) ? students : [];
  for (let i = 0; i < list.length; i++) {
    const row = list[i];
    if (normalizeHealthName(row && row.student_name) !== want) continue;
    const sid = String((row && row.student_id) || '').trim();
    if (sid && sid.toLowerCase() !== exclude) return compactPeer(row);
  }
  return null;
}
