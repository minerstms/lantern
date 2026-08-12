/**
 * Prompt #13 — staff immediate finalize, student review, public User labels, Explore readiness.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  formatCompactPersonName,
  formatPublicStaffName,
  resolveMissionCreatorPublicLabel,
  resolveMissionSubmitterPublicLabel,
  buildStaffPublicNameIndex,
  resolveAuthorPublicLabel,
} from '../staff-public-name.js';
import { isStaffSideParticipantRole, resolveParticipantMissionIdentity } from '../missions-auth.js';
import { finalizeMissionSubmission } from '../missions-handlers.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let passed = 0;
let failed = 0;

function ok(msg) {
  passed++;
  console.log('PASS', msg);
}
function bad(msg, detail) {
  failed++;
  console.log('FAIL', msg, detail != null ? detail : '');
}
function assert(cond, msg) {
  if (cond) ok(msg);
  else bad(msg);
}

const teacherHtml = fs.readFileSync(path.join(root, 'app/teacher.html'), 'utf8');
const missionsHtml = fs.readFileSync(path.join(root, 'app/missions.html'), 'utf8');
const handlersSrc = fs.readFileSync(path.join(root, 'worker/missions-handlers.js'), 'utf8');
const feedSrc = fs.readFileSync(path.join(root, 'worker/feed-handlers.js'), 'utf8');

assert(/finalizeMissionSubmission/.test(handlersSrc), '1. finalizeMissionSubmission exists');
assert(/staffImmediate/.test(handlersSrc) || /participantKind === 'staff'/.test(handlersSrc), '2. staff immediate path wired');
assert(/explore_ready:\s*true/.test(handlersSrc), '3. success includes explore_ready');
assert(/User:/.test(teacherHtml) && /submitter_public_label/.test(teacherHtml), '4. review modal uses User + public label');
assert(!/metaRows\.push\(\['Reviewer'/.test(teacherHtml), '5. Reviewer meta row removed from mission review');
assert(/reviewMetaLabel">User:/.test(teacherHtml), '6. User label in mission review HTML');
assert(!/reviewMetaLabel">Student:/.test(teacherHtml.split('if (type === \'mission\')')[1] || ''), '7. Student label gone from mission review block');
assert(/Nugget/.test(teacherHtml), '8. Nugget capitalization in review reward');
assert(/created_by_teacher_public_label/.test(teacherHtml), '9. Created by uses public label when present');
assert(/author_role: \(staffUser/.test(feedSrc) || /author_role: \(staffUser \|\|/.test(feedSrc), '10. Explore mission author_role staff-aware');
assert(/missionsParticipantIsStaff/.test(missionsHtml), '11. missions page staff pending finish path');
assert(isStaffSideParticipantRole('teacher') && isStaffSideParticipantRole('admin') && isStaffSideParticipantRole('staff'), '12. staff-side roles');
assert(!isStaffSideParticipantRole('student'), '13. student not staff-side');

const idx = buildStaffPublicNameIndex([
  {
    username: 'rick.radle',
    role: 'teacher',
    first_name: 'Rick',
    last_name: 'Radle',
    honorific: 'Mr.',
    display_name: 'Rick Radle',
  },
  {
    username: 'tom.romero',
    role: 'teacher',
    first_name: 'Tom',
    last_name: 'Romero',
    honorific: 'Mr.',
    public_display_name: 'Mr. Tom',
    display_name: 'Tom Romero',
  },
  {
    username: 'mike.martinez',
    role: 'staff',
    first_name: 'Mike',
    last_name: 'Martinez',
    honorific: 'SRO',
    display_name: 'Mike Martinez',
  },
]);

assert(formatPublicStaffName(idx.byUsername['rick.radle']) === 'Mr. Radle', '14. Mr. Radle');
assert(formatPublicStaffName(idx.byUsername['tom.romero']) === 'Mr. Tom', '15. Display Name override Mr. Tom');
assert(formatPublicStaffName(idx.byUsername['mike.martinez']) === 'SRO Martinez', '16. SRO Martinez');
assert(formatCompactPersonName('Lucas Radle') === 'Lucas R.', '17. student First L.');
assert(
  resolveMissionSubmitterPublicLabel(idx, 'staff:rick.radle') === 'Mr. Radle',
  '18. submitter label strips staff: key'
);
assert(resolveMissionSubmitterPublicLabel(idx, 'staff:rick.radle') !== 'staff:rick.radle', '19. no staff: leakage');
assert(
  resolveMissionSubmitterPublicLabel(idx, '20889', 'Lucas Radle') === 'Lucas R.',
  '20. student submitter First L.'
);
assert(
  resolveMissionCreatorPublicLabel(idx, 'rick.radle', 'Rick Radle') === 'Mr. Radle',
  '21. creator public label'
);
assert(
  resolveAuthorPublicLabel(idx, {
    authorId: 'staff:rick.radle',
    authorRole: 'staff',
    authorDisplayName: 'staff:rick.radle',
  }) === 'Mr. Radle',
  '22. feed author resolves staff: id'
);

const idStaffRole = resolveParticipantMissionIdentity(
  { username: 'aide1', role: 'staff', display_name: 'Aide One' },
  () => ''
);
assert(idStaffRole.ok && idStaffRole.participantKind === 'staff', '23. role=staff participates as staff');

// Mock finalize: accept + explore_ready; reject false success when not accepted
{
  const state = {
    submissions: {
      msub_ok: {
        id: 'msub_ok',
        mission_id: 'm1',
        character_name: '20889',
        status: 'pending',
        submission_type: 'text',
        submission_content: 'hi',
      },
    },
    transactions: {},
    wallets: { '20889': { balance: 0 } },
  };

  function makeDb() {
    return {
      prepare(sql) {
        const s = String(sql).replace(/\s+/g, ' ').trim();
        return {
          bind(...binds) {
            this._binds = binds;
            return this;
          },
          async first() {
            if (s.includes('FROM lantern_mission_submissions WHERE id')) {
              const id = this._binds[0];
              const row = state.submissions[id];
              return row ? { ...row } : null;
            }
            if (s.includes('FROM lantern_transactions WHERE id')) {
              return state.transactions[this._binds[0]] || null;
            }
            if (s.includes('FROM lantern_wallets')) {
              const w = state.wallets[this._binds[0]];
              return w ? { balance: w.balance } : null;
            }
            if (s.includes("status = 'accepted' AND id !=")) {
              return null;
            }
            return null;
          },
          async run() {
            if (s.startsWith('UPDATE lantern_mission_submissions SET status')) {
              const [status, reviewer, reviewedAt, id, expect] = this._binds;
              const row = state.submissions[id];
              if (!row || String(row.status) !== String(expect)) return { meta: { changes: 0 } };
              row.status = status;
              row.reviewed_by = reviewer;
              row.reviewed_at = reviewedAt;
              return { meta: { changes: 1 } };
            }
            if (s.startsWith('INSERT INTO lantern_transactions')) {
              const [id, character_name, delta] = this._binds;
              if (state.transactions[id]) throw new Error('pk');
              state.transactions[id] = { id, character_name, delta };
              return { meta: { changes: 1 } };
            }
            if (s.includes('INSERT INTO lantern_wallets') || s.includes('ON CONFLICT')) {
              const key = this._binds[0];
              const add = Number(this._binds[3] != null ? this._binds[3] : this._binds[1]) || 0;
              const cur = state.wallets[key] ? Number(state.wallets[key].balance) || 0 : 0;
              state.wallets[key] = { balance: cur + (this._binds[3] != null ? add : Number(this._binds[1]) || 0) };
              return { meta: { changes: 1 } };
            }
            return { meta: { changes: 1 } };
          },
          async batch(stmts) {
            for (const st of stmts) await st.run();
          },
        };
      },
      async batch(stmts) {
        for (const st of stmts) await st.run();
      },
    };
  }

  const db = makeDb();
  const fin = await finalizeMissionSubmission(db, null, {
    submissionRow: state.submissions.msub_ok,
    rewardAmount: 1,
    reviewerLabel: 'Teacher B',
  });
  assert(fin.ok && fin.explore_ready === true && state.submissions.msub_ok.status === 'accepted', '24. finalize accepts + explore_ready');
  assert((Number(fin.nuggets) || 0) === 1, '25. student reward +1');

  const again = await finalizeMissionSubmission(db, null, {
    submissionId: 'msub_ok',
    rewardAmount: 1,
    reviewerLabel: 'Teacher B',
  });
  assert(again.ok && again.idempotent, '26. re-finalize idempotent');
  const txCount = Object.keys(state.transactions).length;
  assert(txCount === 1, '27. reward idempotency preserved');
}

// False success: approveMissionWithReward failure must not report explore_ready
{
  const badDb = {
    prepare() {
      return {
        bind() {
          return this;
        },
        async first() {
          return {
            id: 'msub_x',
            mission_id: 'm1',
            character_name: '20889',
            status: 'returned',
            submission_type: 'text',
            submission_content: 'x',
          };
        },
        async run() {
          return { meta: { changes: 0 } };
        },
      };
    },
  };
  const finBad = await finalizeMissionSubmission(badDb, {}, {
    submissionId: 'msub_x',
    rewardAmount: 1,
    reviewerLabel: 'T',
  });
  assert(!finBad.ok && !finBad.explore_ready, '28. false Approved success impossible for non-pending');
}

assert(/isStaffEconomyKey\(s\.character_name\)/.test(handlersSrc), '29. teacher queue filters staff pending');
assert(/DELETE FROM lantern_mission_submissions WHERE id = \? AND status = \?/.test(handlersSrc), '30. staff failed finalize cleans pending');

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed) process.exit(1);
