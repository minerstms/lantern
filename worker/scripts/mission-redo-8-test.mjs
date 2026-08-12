/**
 * Prompt #8 — active manual missions remain redoable; reward cadence stays separate.
 * Usage: node worker/scripts/mission-redo-8-test.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { approveMissionWithReward, missionRewardTxId } from '../missions-reward.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '../..');
let pass = 0;
let fail = 0;
function ok(msg) {
  pass++;
  console.log('PASS', msg);
}
function bad(msg, detail) {
  fail++;
  console.error('FAIL', msg, detail != null ? detail : '');
}
function assert(cond, msg, detail) {
  if (cond) ok(msg);
  else bad(msg, detail);
}

const handlers = fs.readFileSync(path.join(root, 'worker/missions-handlers.js'), 'utf8');
const rewardJs = fs.readFileSync(path.join(root, 'worker/missions-reward.js'), 'utf8');
const missionsHtml = fs.readFileSync(path.join(root, 'app/missions.html'), 'utf8');
const thankYou = fs.readFileSync(path.join(root, 'worker/thank-you-mission.js'), 'utf8');
const eventComp = fs.readFileSync(path.join(root, 'worker/mission-event-completions.js'), 'utf8');
const content224 = fs.readFileSync(path.join(root, 'worker/content-creation-reward.js'), 'utf8');

// --- Static: server redo authorization ---
assert(/redoOfPrior\s*=\s*true/.test(handlers) && !/\berror:\s*'already_submitted'/.test(handlers), '1. submit path allows redo after accepted/rejected');
assert(/redoOfPrior\s*=\s*true/.test(handlers), '2. submit marks redoOfPrior for accepted/rejected');
assert(/redo:\s*redoOfPrior/.test(handlers), '3. submit response includes redo flag');
assert(/submission_pending/.test(handlers) && /use_resubmit/.test(handlers), '4. pending/returned still blocked');
assert(/Mission is not active[\s\S]{0,80}no longer active/.test(handlers), '5. inactive mission accurate message');
assert(/findPriorAcceptedMissionSubmission/.test(rewardJs), '6. prior-accepted helper for once-ever skip');
assert(/reward_skipped/.test(rewardJs) && /reward_skipped/.test(handlers), '7. approve reports reward_skipped');

// --- Static: UI Do / Redo ---
assert(/Do Mission/.test(missionsHtml), '8. Do Mission CTA present');
assert(/Redo Mission/.test(missionsHtml), '9. Redo Mission CTA present');
assert(/currentMissionIsRedo/.test(missionsHtml), '10. redo modal flag');
assert(/Completed before · Redo available/.test(missionsHtml), '11. completed helper text');
assert(/Reward already earned/.test(missionsHtml), '12. reward helper text');
assert(/This mission is no longer active/.test(missionsHtml), '13. inactive message mapped');
assert(/Mission not available[\s\S]{0,200}not available for your account/.test(missionsHtml), '14. generic account message reserved for eligibility');
assert(/openMissionSubmitModal\(m,\s*null,\s*''\s*,\s*\{\s*redo:\s*true\s*\}\)/.test(missionsHtml), '15. completed manual opens redo modal');
assert(/contribute\.html\?type=photo/.test(missionsHtml) && /photoCompleted \? 'Redo Mission'/.test(missionsHtml), '16. photo mission redoable via contribute');
assert(/onActivate:\s*fgDone\s*\?\s*function\(\)\s*\{/.test(missionsHtml) && /openTextDetail\('First Game Played'/.test(missionsHtml), '17. automatic First Game stays Completed without Redo submit');
assert(!/mid === WAVE2_MISSION\.firstGame[\s\S]{0,900}Redo Mission/.test(missionsHtml), '17b. First Game card has no Redo Mission CTA');
assert(/thankYouClaimed[\s\S]{0,300}Come back tomorrow/.test(missionsHtml), '18. Thank-a-Teacher same-day send limit preserved in UI');

// --- Static: economy / specials preserved ---
assert(/lantern:mission_reward:/.test(rewardJs), '19. TMS mission reward reference preserved');
assert(/skipReward:\s*true/.test(eventComp) && /CREATE_POLL|create_poll/.test(eventComp), '20. #224 poll/shout mission skipReward preserved');
assert(/content_reward:/.test(content224) || /awardStudentDailyContentCreationReward/.test(content224), '21. #224 content reward module present');
assert(/thank_you:/.test(thankYou) && /completed_today|send_status/.test(thankYou), '22. Thank-a-Teacher anti-spam / daily send preserved');
assert(/cadence:\s*'daily'/.test(eventComp) && /daily_checkin/.test(eventComp), '23. daily check-in cadence preserved');
assert(/cadence:\s*'once'/.test(eventComp) && /first_game|first_photo/.test(eventComp), '24. once-ever event cadence preserved');

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
        character_name: '20889',
        mission_id: 'tmission_photo_demo',
        created_at: '2026-01-01T00:00:00.000Z',
      },
      sub_b: {
        id: 'sub_b',
        status: 'pending',
        character_name: '20889',
        mission_id: 'tmission_photo_demo',
        created_at: '2026-08-12T00:00:00.000Z',
      },
    },
    transactions: {
      [missionRewardTxId('sub_a')]: {
        id: missionRewardTxId('sub_a'),
        character_name: '20889',
        delta: 1,
        kind: 'teacher_mission',
        created_at: '2026-01-01T00:00:00.000Z',
      },
    },
    wallets: { '20889': { character_name: '20889', balance: 5, updated_at: '' } },
  });

  const redoApprove = await approveMissionWithReward(db, {
    submissionId: 'sub_b',
    recipientCharacterName: '20889',
    rewardAmount: 1,
    reviewerLabel: 'Teacher',
  });
  assert(redoApprove.ok && redoApprove.reward_skipped === true && redoApprove.nuggets === 0, '25. redo approve accepts with +0', redoApprove);
  assert(db._state.submissions.sub_b.status === 'accepted', '26. redo submission becomes accepted');
  assert(!db._state.transactions[missionRewardTxId('sub_b')], '27. no second once-ever reward tx for redo');
  assert(Number(db._state.wallets['20889'].balance) === 5, '28. wallet unchanged after redo approve');

  const firstOnly = makeDb({
    submissions: {
      sub_new: { id: 'sub_new', status: 'pending', character_name: '20889', mission_id: 'm1', created_at: '2026-08-12T00:00:00.000Z' },
    },
    wallets: { '20889': { character_name: '20889', balance: 0, updated_at: '' } },
  });
  const first = await approveMissionWithReward(firstOnly, {
    submissionId: 'sub_new',
    recipientCharacterName: '20889',
    rewardAmount: 1,
    reviewerLabel: 'Teacher',
  });
  assert(first.ok && first.nuggets === 1 && !first.reward_skipped, '29. never-completed first approve still +1', first);

  console.log('\nmission-redo-8-test:', pass, 'PASS', fail, 'FAIL');
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
