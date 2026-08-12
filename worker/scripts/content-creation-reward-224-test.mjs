/**
 * Prompt #224 — daily student content-creation reward caps (News / Shout-Out / Poll).
 * Usage: node worker/scripts/content-creation-reward-224-test.mjs
 */
import {
  awardStudentDailyContentCreationReward,
  contentRewardEventKey,
  contentRewardTxId,
  contentRewardReference,
  isStudentContentRewardRecipient,
} from '../content-creation-reward.js';
import { denverLocalDateYYYYMMDD } from '../school-schedule.js';

let pass = 0;
let fail = 0;
function ok(msg) {
  pass++;
  console.log('OK', msg);
}
function bad(msg, detail) {
  fail++;
  console.error('FAIL', msg, detail != null ? detail : '');
}

function makeDb(state) {
  state.transactions = state.transactions || [];
  state.wallets = state.wallets || {};
  function prepare(sql) {
    const s = String(sql);
    const binds = [];
    const api = {
      bind(...args) {
        binds.push(...args);
        return api;
      },
      async first() {
        if (s.includes('FROM lantern_transactions WHERE id = ?')) {
          return state.transactions.find((t) => t.id === binds[0]) || null;
        }
        if (s.includes('FROM lantern_wallets WHERE character_name = ?')) {
          const bal = state.wallets[binds[0]];
          return bal != null ? { balance: bal } : null;
        }
        return null;
      },
      async run() {
        if (s.includes('INSERT INTO lantern_transactions')) {
          if (state.transactions.some((t) => t.id === binds[0])) {
            const err = new Error('UNIQUE constraint failed: lantern_transactions.id');
            throw err;
          }
          state.transactions.push({
            id: binds[0],
            character_name: binds[1],
            delta: binds[2],
            kind: binds[3],
            note: binds[5],
            meta_json: binds[7],
          });
        } else if (s.includes('INSERT INTO lantern_wallets')) {
          state.wallets[binds[0]] = (state.wallets[binds[0]] || 0) + Number(binds[3] || 0);
        }
        return { success: true, meta: { changes: 1 } };
      },
      async all() {
        return { results: [] };
      },
    };
    return api;
  }
  return {
    prepare,
    async batch(stmts) {
      for (const st of stmts) await st.run();
    },
  };
}

// Identity helpers
{
  if (isStudentContentRewardRecipient('20889', 'student')) ok('student eligible');
  else bad('student eligible');
  if (!isStudentContentRewardRecipient('staff_id:4', 'teacher')) ok('staff_id ineligible');
  else bad('staff_id ineligible');
  if (!isStudentContentRewardRecipient('Rick Radle', 'admin')) ok('admin author_type ineligible');
  else bad('admin author_type ineligible');
  if (!isStudentContentRewardRecipient('staff:admin', 'student')) ok('staff: key ineligible');
  else bad('staff: key ineligible');
}

{
  const day = '2026-08-11';
  const ek = contentRewardEventKey('news', '20889', day);
  if (ek === 'content_reward:news:20889:2026-08-11') ok('event key format');
  else bad('event key', ek);
  if (contentRewardReference(ek) === 'lantern:content_reward:news:20889:2026-08-11') ok('TMS reference format');
  else bad('TMS reference', contentRewardReference(ek));
  if (contentRewardTxId(ek).startsWith('tx_content_')) ok('tx id deterministic prefix');
  else bad('tx id', contentRewardTxId(ek));
}

const dayA = new Date('2026-08-11T18:00:00.000Z');
const dayB = new Date('2026-08-12T18:00:00.000Z');
const denverA = denverLocalDateYYYYMMDD(dayA);
const denverB = denverLocalDateYYYYMMDD(dayB);

{
  const state = {};
  const db = makeDb(state);
  const r1 = await awardStudentDailyContentCreationReward(db, null, {
    type: 'news',
    characterName: '20889',
    authorType: 'student',
    sourceRef: 'news-1',
    now: dayA,
  });
  if (r1.ok && r1.rewarded && state.transactions.length === 1 && state.wallets['20889'] === 1) ok('News #1 today +1');
  else bad('News #1', r1);

  const r2 = await awardStudentDailyContentCreationReward(db, null, {
    type: 'news',
    characterName: '20889',
    authorType: 'student',
    sourceRef: 'news-2',
    now: dayA,
  });
  if (r2.ok && !r2.rewarded && r2.capped && state.transactions.length === 1 && state.wallets['20889'] === 1) ok('News #2 today +0');
  else bad('News #2', r2);

  const s1 = await awardStudentDailyContentCreationReward(db, null, {
    type: 'shoutout',
    characterName: '20889',
    authorType: 'student',
    sourceRef: 'shout-1',
    now: dayA,
  });
  if (s1.ok && s1.rewarded && state.wallets['20889'] === 2) ok('Shout-Out #1 today +1');
  else bad('Shout #1', s1);

  const s2 = await awardStudentDailyContentCreationReward(db, null, {
    type: 'shoutout',
    characterName: '20889',
    authorType: 'student',
    sourceRef: 'shout-2',
    now: dayA,
  });
  if (s2.ok && !s2.rewarded && state.wallets['20889'] === 2) ok('Shout-Out #2 today +0');
  else bad('Shout #2', s2);

  const p1 = await awardStudentDailyContentCreationReward(db, null, {
    type: 'poll',
    characterName: '20889',
    authorType: 'student',
    sourceRef: 'poll-1',
    now: dayA,
  });
  if (p1.ok && p1.rewarded && state.wallets['20889'] === 3) ok('Poll #1 today +1');
  else bad('Poll #1', p1);

  const p2 = await awardStudentDailyContentCreationReward(db, null, {
    type: 'poll',
    characterName: '20889',
    authorType: 'student',
    sourceRef: 'poll-2',
    now: dayA,
  });
  if (p2.ok && !p2.rewarded && state.wallets['20889'] === 3) ok('Poll #2 today +0 (content still allowed)');
  else bad('Poll #2', p2);

  if (denverA !== denverB) {
    const next = await awardStudentDailyContentCreationReward(db, null, {
      type: 'news',
      characterName: '20889',
      authorType: 'student',
      sourceRef: 'news-next',
      now: dayB,
    });
    if (next.ok && next.rewarded && state.wallets['20889'] === 4) ok('next Denver day News eligible again');
    else bad('next day', { next, denverA, denverB, bal: state.wallets['20889'] });
  } else {
    bad('expected distinct Denver days for fixtures', { denverA, denverB });
  }
}

{
  const state = {};
  const db = makeDb(state);
  const staff = await awardStudentDailyContentCreationReward(db, null, {
    type: 'poll',
    characterName: 'staff_id:4',
    authorType: 'teacher',
    sourceRef: 'poll-staff',
    now: dayA,
  });
  if (staff.ok && staff.skipped_staff && !staff.rewarded && state.transactions.length === 0) ok('staff skipped (no creation farming reward)');
  else bad('staff skip', staff);
}

{
  const state = {};
  const db = makeDb(state);
  // Concurrent race: pre-seed nothing; two awards — second hits UNIQUE on insert
  const a = await awardStudentDailyContentCreationReward(db, null, {
    type: 'news',
    characterName: 'zane',
    authorType: 'student',
    sourceRef: 'a',
    now: dayA,
  });
  // Force race by clearing wallet check path: insert same tx again via direct call after first
  const b = await awardStudentDailyContentCreationReward(db, null, {
    type: 'news',
    characterName: 'zane',
    authorType: 'student',
    sourceRef: 'b',
    now: dayA,
  });
  if (a.ok && a.rewarded && b.ok && !b.rewarded && state.transactions.length === 1) ok('concurrent/replay content reward single tx');
  else bad('concurrent', { a, b, n: state.transactions.length });
}

console.log('\ncontent-creation-reward-224-test:', pass, 'PASS', fail, 'FAIL');
process.exit(fail ? 1 : 0);
