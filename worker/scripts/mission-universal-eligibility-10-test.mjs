/**
 * Prompt #10 — active manual missions are universal for authenticated Lantern users.
 * Usage: node worker/scripts/mission-universal-eligibility-10-test.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  missionEligibleForParticipant,
  missionInCatalogForParticipant,
  missionVisibleToParticipant,
  resolveParticipantMissionIdentity,
} from '../missions-auth.js';
import { approveMissionWithReward, missionRewardTxId } from '../missions-reward.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let pass = 0;
let fail = 0;
function ok(m) {
  pass++;
  console.log('PASS', m);
}
function bad(m, d) {
  fail++;
  console.error('FAIL', m, d != null ? d : '');
}
function assert(cond, m, d) {
  if (cond) ok(m);
  else bad(m, d);
}

const authJs = fs.readFileSync(path.join(root, 'worker/missions-auth.js'), 'utf8');
const handlers = fs.readFileSync(path.join(root, 'worker/missions-handlers.js'), 'utf8');
const teacherHtml = fs.readFileSync(path.join(root, 'app/teacher.html'), 'utf8');
const missionsHtml = fs.readFileSync(path.join(root, 'app/missions.html'), 'utf8');

const student = resolveParticipantMissionIdentity(
  { username: 'stu1', role: 'student', mtss_student_id: 'S001' },
  () => 'S001'
);
const teacher = resolveParticipantMissionIdentity(
  { username: 'rick.radle', role: 'teacher', display_name: 'Rick Radle' },
  () => ''
);
const admin = resolveParticipantMissionIdentity({ username: 'admin', role: 'admin', display_name: 'Admin' }, () => '');

const studentsOnlyPhoto = {
  id: 'tmission_1773676581540_qzl0kx',
  title: 'First Photo Share',
  active: 1,
  archived: 0,
  audience: 'school_mission',
  participant_scope: 'students',
  submission_type: 'image_url',
};
const selectedAudience = {
  id: 'tmission_selected',
  audience: 'selected_students',
  participant_scope: 'students',
  target_character_names: JSON.stringify(['Other Student']),
};
const staffOnly = { id: 'm_staff', audience: 'school_mission', participant_scope: 'staff' };

assert(student.ok && teacher.ok && admin.ok, '1. student/teacher/admin identities resolve');
assert(missionEligibleForParticipant(studentsOnlyPhoto, student), '2. students-scope photo eligible for student');
assert(missionEligibleForParticipant(studentsOnlyPhoto, teacher), '3. students-scope photo eligible for teacher (Rick)');
assert(missionEligibleForParticipant(studentsOnlyPhoto, admin), '4. students-scope photo eligible for admin');
assert(missionEligibleForParticipant(selectedAudience, teacher), '5. audience selected_students no longer blocks teacher');
assert(missionEligibleForParticipant(selectedAudience, student), '6. audience selected_students no longer blocks student');
assert(missionEligibleForParticipant(staffOnly, student), '7. staff-scope no longer blocks student');
assert(missionInCatalogForParticipant(studentsOnlyPhoto, teacher), '8. catalog includes students-scope for teacher');
assert(missionInCatalogForParticipant(staffOnly, student), '9. catalog includes staff-scope for student');
assert(missionVisibleToParticipant(studentsOnlyPhoto, teacher) === true, '10. visible/eligible alias true for Rick');

assert(/Prompt #10/.test(authJs) && /NOT authorization gates/.test(authJs), '11. auth comments document Prompt #10');
assert(/const audience = 'school_mission'/.test(handlers) && /const participantScope = 'everyone'/.test(handlers), '12. create normalizes school_mission + everyone');
assert(!/id="missionAudience"/.test(teacherHtml) && !/id="missionParticipantScope"/.test(teacherHtml), '13. Create Mission targeting controls removed');
assert(!/data-edit="audience"/.test(teacherHtml), '14. Edit Mission audience control removed');
assert(/Active missions are available to every signed-in Lantern account/.test(teacherHtml), '15. Create form states universal availability');
assert(/You already have a submission awaiting review/.test(missionsHtml), '16. pending message is accurate (not account-unavailable)');
assert(/redoOfPrior/.test(handlers), '17. Prompt #8 redo path still present');
assert(/use_daily_checkin/.test(handlers) && /use_thank_you/.test(handlers) && /use_games/.test(handlers), '18. special mission endpoints still dedicated');

// Live Rick denial reproduction (pre-fix condition encoded as historical row shape).
assert(
  teacher.characterName === 'staff:rick.radle' &&
    studentsOnlyPhoto.participant_scope === 'students' &&
    missionEligibleForParticipant(studentsOnlyPhoto, teacher),
  '19. Rick + First Photo Share would no longer 403 on Mission not available'
);

function makeDb(initial) {
  const state = {
    submissions: JSON.parse(JSON.stringify(initial.submissions || {})),
    transactions: JSON.parse(JSON.stringify(initial.transactions || {})),
    wallets: JSON.parse(JSON.stringify(initial.wallets || {})),
  };
  function runStatement(sql, binds) {
    const s = String(sql).replace(/\s+/g, ' ').trim();
    if (s.startsWith('SELECT id, character_name, delta, kind, created_at FROM lantern_transactions WHERE id =')) {
      return state.transactions[binds[0]] || null;
    }
    if (s.startsWith('SELECT balance FROM lantern_wallets WHERE character_name =')) {
      const w = state.wallets[binds[0]];
      return w ? { balance: w.balance } : null;
    }
    if (s.startsWith('SELECT id, status, character_name, mission_id FROM lantern_mission_submissions WHERE id =')) {
      const row = state.submissions[binds[0]];
      return row
        ? { id: row.id, status: row.status, character_name: row.character_name, mission_id: row.mission_id || '' }
        : null;
    }
    if (s.includes("status = 'accepted' AND id != ?")) {
      const [missionId, characterName, excludeId] = binds;
      const found = Object.values(state.submissions).find(
        (row) =>
          row &&
          String(row.mission_id || '') === String(missionId) &&
          String(row.character_name || '') === String(characterName) &&
          String(row.status || '') === 'accepted' &&
          String(row.id) !== String(excludeId)
      );
      return found ? { id: found.id, created_at: found.created_at || '' } : null;
    }
    if (s.startsWith('SELECT status, character_name FROM lantern_mission_submissions WHERE id =')) {
      const row = state.submissions[binds[0]];
      return row ? { status: row.status, character_name: row.character_name } : null;
    }
    if (s.startsWith('SELECT status FROM lantern_mission_submissions WHERE id =')) {
      const row = state.submissions[binds[0]];
      return row ? { status: row.status } : null;
    }
    if (s.startsWith('UPDATE lantern_mission_submissions SET status = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ? AND status = ?')) {
      const [status, reviewedBy, reviewedAt, id, expectedStatus] = binds;
      const row = state.submissions[id];
      if (!row || String(row.status) !== String(expectedStatus)) return { meta: { changes: 0 } };
      row.status = status;
      row.reviewed_by = reviewedBy;
      row.reviewed_at = reviewedAt;
      return { meta: { changes: 1 } };
    }
    if (s.startsWith('INSERT INTO lantern_transactions')) {
      const [id, characterName, delta, kind, source, note, createdAt, metaJson] = binds;
      if (state.transactions[id]) throw new Error('UNIQUE');
      state.transactions[id] = { id, character_name: characterName, delta, kind, source, note, created_at: createdAt, meta_json: metaJson };
      return { meta: { changes: 1 } };
    }
    if (s.startsWith('INSERT INTO lantern_wallets')) {
      const [characterName, balance, updatedAt, deltaAdd, updatedAt2] = binds;
      const existing = state.wallets[characterName];
      if (existing) {
        existing.balance = Number(existing.balance || 0) + Number(deltaAdd || 0);
        existing.updated_at = updatedAt2 || updatedAt;
      } else {
        state.wallets[characterName] = { character_name: characterName, balance: Number(balance), updated_at: updatedAt };
      }
      return { meta: { changes: 1 } };
    }
    throw new Error('Unhandled SQL: ' + s.slice(0, 140));
  }
  return {
    _state: state,
    prepare(sql) {
      const binds = [];
      const api = {
        bind(...args) {
          binds.length = 0;
          binds.push(...args);
          return api;
        },
        async first() {
          const row = runStatement(sql, binds);
          return row && row.meta ? null : row;
        },
        async run() {
          return runStatement(sql, binds);
        },
      };
      return api;
    },
    async batch(stmts) {
      for (const stmt of stmts) await stmt.run();
    },
  };
}

(async function run() {
  const db = makeDb({
    submissions: {
      sub_a: {
        id: 'sub_a',
        status: 'accepted',
        character_name: 'staff:rick.radle',
        mission_id: 'tmission_1773676581540_qzl0kx',
        created_at: '2026-01-01T00:00:00.000Z',
      },
      sub_b: {
        id: 'sub_b',
        status: 'pending',
        character_name: 'staff:rick.radle',
        mission_id: 'tmission_1773676581540_qzl0kx',
        created_at: '2026-08-12T00:00:00.000Z',
      },
    },
    transactions: {
      [missionRewardTxId('sub_a')]: {
        id: missionRewardTxId('sub_a'),
        character_name: 'staff:rick.radle',
        delta: 1,
        kind: 'teacher_mission',
        created_at: '2026-01-01T00:00:00.000Z',
      },
    },
    wallets: { 'staff:rick.radle': { character_name: 'staff:rick.radle', balance: 3, updated_at: '' } },
  });
  const redo = await approveMissionWithReward(db, {
    submissionId: 'sub_b',
    recipientCharacterName: 'staff:rick.radle',
    rewardAmount: 1,
    reviewerLabel: 'Other Teacher',
  });
  assert(redo.ok && redo.reward_skipped && redo.nuggets === 0, '20. prior completion redo still +0 once-ever', redo);

  console.log('\nmission-universal-eligibility-10-test:', pass, 'PASS', fail, 'FAIL');
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
