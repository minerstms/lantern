/**
 * Lantern Avatar Activity Bank — shared read/selection layer for Avatar Match
 * and the upcoming Avatar Quiz Mission.
 *
 * Eligibility is teacher-upload / assigned-asset based, not "currently approved".
 * Self-service student upload is closed; admin-set student rows use staged:approved_by.
 */
import { formatAvatarActivityDisplayName, avatarActivityNameKey } from './avatar-activity-name.js';
import { isAdminStagedAvatarMarker } from './avatar-media-gate.js';
import { isKnownDemoPersonaName } from './demo-persona-guard.js';
import { studentIdIsRestricted } from './media-publicity.js';

const SUPERSEDED_BY_ADMIN_RE = /superseded by system admin avatar assignment/i;

function trimStr(v) {
  return v == null ? '' : String(v).trim();
}

function lower(v) {
  return trimStr(v).toLowerCase();
}

export function isTestOrSyntheticIdentity(key) {
  const k = lower(key);
  if (!k) return true;
  return k.startsWith('test_') || k.startsWith('e2e_') || k.startsWith('verify_');
}

/**
 * True when the submission is a teacher/admin upload or an assigned school avatar.
 * Unreviewed student self-uploads (pending, no admin marker) are excluded.
 */
export function isTeacherOriginatedAvatarSubmission(row) {
  if (!row) return false;
  const imageKey = trimStr(row.image_key);
  if (!imageKey) return false;
  if (isAdminStagedAvatarMarker(row.approved_by)) return true;
  const status = lower(row.status);
  const reason = trimStr(row.rejected_reason);
  if (status === 'rejected' && SUPERSEDED_BY_ADMIN_RE.test(reason)) return true;
  if (status === 'pending' && !trimStr(row.approved_by)) return false;
  if (status === 'rejected') return false;
  if (status === 'approved' && trimStr(row.approved_by)) return true;
  if (status === 'approved' && imageKey) return true;
  return false;
}

export function countDisplayNameCollisions(entries) {
  const counts = Object.create(null);
  (entries || []).forEach((e) => {
    const k = avatarActivityNameKey(e && e.display_name);
    if (!k) return;
    counts[k] = (counts[k] || 0) + 1;
  });
  const collisions = Object.keys(counts)
    .filter((k) => counts[k] > 1)
    .map((k) => ({ display_name_key: k, count: counts[k] }));
  return { collisions, collision_identity_count: collisions.length };
}

function nameRowFromAccount(row) {
  return {
    first_name: row && row.first_name,
    last_name: row && row.last_name,
    display_name: row && (row.display_name || row.public_display_name),
    student_name: row && row.student_name,
  };
}

function resolveIdentityLabel(characterName, accountByKey, rosterBySid) {
  const key = trimStr(characterName);
  const low = lower(key);
  const account = accountByKey[low] || null;
  const roster = rosterBySid[low] || null;
  const label = formatAvatarActivityDisplayName(nameRowFromAccount(account || roster || {}));
  const role = lower((account && account.role) || (roster ? 'student' : ''));
  return {
    display_name: label,
    person_type: role === 'student' || roster ? 'student' : role ? 'staff' : 'student',
    account,
    roster,
  };
}

export function buildAvatarActivityBank(opts) {
  const origin = trimStr(opts && opts.origin);
  const submissions = (opts && opts.submissions) || [];
  const profiles = (opts && opts.profiles) || [];
  const accounts = (opts && opts.accounts) || [];
  const rosterStudents = (opts && opts.rosterStudents) || [];
  const restrictedSet = opts && opts.restrictedSet;

  const accountByKey = Object.create(null);
  accounts.forEach((a) => {
    [a && a.username, a && a.mtss_student_id, a && a.student_character_name].forEach((k) => {
      const low = lower(k);
      if (low) accountByKey[low] = a;
    });
  });
  const rosterBySid = Object.create(null);
  rosterStudents.forEach((s) => {
    const sid = lower(s && s.student_id);
    if (sid) rosterBySid[sid] = s;
  });

  const seenKeys = new Set();
  const entries = [];

  function pushEntry(imageKey, characterName, source) {
    const key = trimStr(imageKey);
    const owner = trimStr(characterName);
    if (!key || !owner) return;
    if (isTestOrSyntheticIdentity(owner)) return;
    if (studentIdIsRestricted(owner, restrictedSet)) return;
    const dedupe = lower(owner) + '|' + lower(key);
    if (seenKeys.has(dedupe)) return;
    const ident = resolveIdentityLabel(owner, accountByKey, rosterBySid);
    if (!ident.display_name) return;
    if (isKnownDemoPersonaName(ident.display_name) || isKnownDemoPersonaName(owner)) return;
    seenKeys.add(dedupe);
    entries.push({
      entry_id: source + ':' + owner + ':' + key,
      avatar_key: key,
      avatar_url: origin ? origin + '/api/avatar/image?key=' + encodeURIComponent(key) : '',
      display_name: ident.display_name,
      public_display_name: ident.display_name,
      person_type: ident.person_type,
    });
  }

  submissions.forEach((row) => {
    if (!isTeacherOriginatedAvatarSubmission(row)) return;
    pushEntry(row.image_key, row.character_name, 'submission');
  });
  profiles.forEach((p) => {
    if (!p || !trimStr(p.current_avatar_key)) return;
    pushEntry(p.current_avatar_key, p.character_name, 'profile');
  });

  return entries;
}

export function publicAvatarActivityEntries(entries) {
  return (entries || []).map((e) => ({
    display_name: e.display_name,
    public_display_name: e.public_display_name || e.display_name,
    avatar_url: e.avatar_url || null,
    person_type: e.person_type || 'student',
  }));
}

function shuffleInPlace(arr, rand) {
  const rnd = typeof rand === 'function' ? rand : Math.random;
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
  return arr;
}

/**
 * Four-choice avatar question for the upcoming Avatar Quiz Mission (and Avatar Match rounds).
 * Never places indistinguishable display labels in the same question.
 */
export function buildAvatarMultipleChoiceQuestion(bank, opts) {
  const rand = opts && typeof opts.random === 'function' ? opts.random : Math.random;
  const usable = (bank || []).filter((e) => e && e.display_name && (e.avatar_url || e.avatar_key));
  const byLabel = Object.create(null);
  usable.forEach((e) => {
    const k = avatarActivityNameKey(e.display_name);
    if (!k) return;
    if (!byLabel[k]) byLabel[k] = [];
    byLabel[k].push(e);
  });
  const distinctLabels = Object.keys(byLabel);
  if (distinctLabels.length < 4) {
    return {
      ok: false,
      error: 'insufficient_identities',
      bank_count: usable.length,
      distinct_identity_count: distinctLabels.length,
    };
  }
  let target = opts && opts.target && usable.indexOf(opts.target) !== -1 ? opts.target : null;
  if (!target && opts && opts.target && opts.target.display_name) {
    const forced = avatarActivityNameKey(opts.target.display_name);
    if (byLabel[forced] && byLabel[forced].length) {
      target = opts.target.avatar_url || opts.target.avatar_key
        ? opts.target
        : byLabel[forced][0];
    }
  }
  if (!target) {
    const targetLabel = distinctLabels[Math.floor(rand() * distinctLabels.length)];
    const targetPool = byLabel[targetLabel];
    target = targetPool[Math.floor(rand() * targetPool.length)];
  }
  const distractorLabels = distinctLabels.filter((k) => k !== avatarActivityNameKey(target.display_name));
  shuffleInPlace(distractorLabels, rand);
  const chosen = distractorLabels.slice(0, 3);
  const choices = [target.display_name].concat(chosen.map((k) => byLabel[k][0].display_name));
  shuffleInPlace(choices, rand);
  if (new Set(choices.map(avatarActivityNameKey)).size !== 4) {
    return { ok: false, error: 'duplicate_choice_labels', bank_count: usable.length };
  }
  return {
    ok: true,
    targetAvatar: target,
    correctIdentity: target.display_name,
    choices,
  };
}

export async function loadAvatarActivityBank(db, env, origin, extras) {
  if (!db) return [];
  let submissions = [];
  let profiles = [];
  let accounts = [];
  try {
    const sub = await db
      .prepare(
        `SELECT id, character_name, image_key, status, approved_by, rejected_reason
         FROM lantern_avatar_submissions
         WHERE image_key IS NOT NULL AND TRIM(image_key) != ''`
      )
      .all();
    submissions = (sub && sub.results) || [];
  } catch (_) {
    submissions = [];
  }
  try {
    const prof = await db.prepare('SELECT character_name, current_avatar_key FROM lantern_avatar_profiles').all();
    profiles = (prof && prof.results) || [];
  } catch (_) {
    profiles = [];
  }
  try {
    const acc = await db
      .prepare(
        `SELECT username, display_name, public_display_name, first_name, last_name, honorific, role, student_character_name, mtss_student_id
         FROM lantern_pilot_accounts`
      )
      .all();
    accounts = (acc && acc.results) || [];
  } catch (_) {
    accounts = [];
  }
  return buildAvatarActivityBank({
    origin,
    submissions,
    profiles,
    accounts,
    rosterStudents: (extras && extras.rosterStudents) || [],
    restrictedSet: extras && extras.restrictedSet,
  });
}
