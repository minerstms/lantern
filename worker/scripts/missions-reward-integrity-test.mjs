/**
 * Mission approval/reward integrity tests — Prompt #67
 * Mock D1 with PRIMARY KEY enforcement and conditional UPDATE changes.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { approveMissionWithReward, creditMissionApprovalReward, missionRewardTxId } from '../missions-reward.js';

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

function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

function makeRewardDb(initial) {
  const state = {
    submissions: clone(initial.submissions || {}),
    transactions: clone(initial.transactions || {}),
    wallets: clone(initial.wallets || {}),
    failNextCreditBatch: false,
    failRevert: false,
  };

  function snapshot() {
    return {
      submissions: clone(state.submissions),
      transactions: clone(state.transactions),
      wallets: clone(state.wallets),
    };
  }

  function restore(snap) {
    state.submissions = snap.submissions;
    state.transactions = snap.transactions;
    state.wallets = snap.wallets;
  }

  function runStatement(sql, binds) {
    const s = String(sql).replace(/\s+/g, ' ').trim();

    if (s.startsWith('SELECT id, character_name, delta, kind, created_at FROM lantern_transactions WHERE id =')) {
      const id = binds[0];
      return state.transactions[id] || null;
    }

    if (s.startsWith('SELECT balance FROM lantern_wallets WHERE character_name =')) {
      const key = binds[0];
      const w = state.wallets[key];
      return w ? { balance: w.balance } : null;
    }

    if (s.startsWith('SELECT id, status, character_name, mission_id FROM lantern_mission_submissions WHERE id =')) {
      const id = binds[0];
      const row = state.submissions[id];
      return row
        ? { id: row.id, status: row.status, character_name: row.character_name, mission_id: row.mission_id || '' }
        : null;
    }

    if (s.startsWith('SELECT id, status, character_name FROM lantern_mission_submissions WHERE id =')) {
      const id = binds[0];
      const row = state.submissions[id];
      return row ? { id: row.id, status: row.status, character_name: row.character_name } : null;
    }

    if (
      s.startsWith(
        "SELECT id, created_at FROM lantern_mission_submissions WHERE mission_id = ? AND character_name = ? AND status = 'accepted' AND id != ?"
      ) ||
      s.includes("status = 'accepted' AND id != ?")
    ) {
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

    if (s.startsWith('SELECT status FROM lantern_mission_submissions WHERE id =')) {
      const id = binds[0];
      const row = state.submissions[id];
      return row ? { status: row.status } : null;
    }

    if (s.startsWith('SELECT status, character_name FROM lantern_mission_submissions WHERE id =')) {
      const id = binds[0];
      const row = state.submissions[id];
      return row ? { status: row.status, character_name: row.character_name } : null;
    }

    if (
      s.startsWith('UPDATE lantern_mission_submissions SET status = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ? AND status = ?')
    ) {
      const [status, reviewedBy, reviewedAt, id, expectedStatus] = binds;
      const row = state.submissions[id];
      if (!row || String(row.status) !== String(expectedStatus)) {
        return { meta: { changes: 0 } };
      }
      if (state.failRevert && status === 'pending' && expectedStatus === 'accepted') {
        return { meta: { changes: 0 } };
      }
      row.status = status;
      row.reviewed_by = reviewedBy;
      row.reviewed_at = reviewedAt;
      return { meta: { changes: 1 } };
    }

    if (s.startsWith('INSERT INTO lantern_transactions')) {
      const [id, characterName, delta, kind, source, note, createdAt, metaJson] = binds;
      if (state.transactions[id]) {
        const err = new Error('D1_ERROR: UNIQUE constraint failed: lantern_transactions.id');
        err.code = 'SQLITE_CONSTRAINT_PRIMARYKEY';
        throw err;
      }
      state.transactions[id] = {
        id,
        character_name: characterName,
        delta,
        kind,
        source,
        note,
        created_at: createdAt,
        meta_json: metaJson,
      };
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

    throw new Error('Unhandled SQL in mock: ' + s.slice(0, 120));
  }

  const db = {
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
      if (state.failNextCreditBatch) {
        state.failNextCreditBatch = false;
        throw new Error('simulated_batch_failure');
      }
      const snap = snapshot();
      try {
        for (const stmt of stmts) {
          await stmt.run();
        }
      } catch (e) {
        restore(snap);
        throw e;
      }
    },
  };

  return db;
}

function countMissionRewardTx(db, submissionId) {
  const txId = missionRewardTxId(submissionId);
  return db._state.transactions[txId] ? 1 : 0;
}

function walletBalance(db, characterName) {
  const w = db._state.wallets[characterName];
  return w ? Number(w.balance) || 0 : 0;
}

// --- Schema proof (static) ---
const schemaDoc = fs.readFileSync(path.join(root, 'docs/archive/LANTERN_SCHEMA.md'), 'utf8');
const backupSql = fs.readFileSync(
  path.join(root, 'worker/backups/d1-backup-20260403-155348/lantern-db-full.sql'),
  'utf8'
);

if (/`id TEXT PRIMARY KEY`/m.test(schemaDoc) && schemaDoc.includes('lantern_transactions')) {
  ok('schema doc: lantern_transactions.id is TEXT PRIMARY KEY');
} else bad('schema doc missing PK on lantern_transactions.id');

if (/CREATE TABLE lantern_transactions \(\s*id TEXT PRIMARY KEY/m.test(backupSql)) {
  ok('D1 backup SQL: lantern_transactions.id PRIMARY KEY');
} else bad('backup SQL missing PK');

const txCol = 'id';
const txIdExample = missionRewardTxId('sub_123');
if (txIdExample === 'tx_mission_sub_123') {
  ok('deterministic tx id lands in lantern_transactions.id column');
} else bad('tx id format', txIdExample);

// --- Double approve ---
(async function runAsyncTests() {
  const db1 = makeRewardDb({
    submissions: {
      sub_123: { id: 'sub_123', status: 'pending', character_name: '20889' },
    },
    wallets: { '20889': { character_name: '20889', balance: 10, updated_at: '' } },
  });

  const first = await approveMissionWithReward(db1, {
    submissionId: 'sub_123',
    recipientCharacterName: '20889',
    rewardAmount: 99,
    reviewerLabel: 'Teacher A',
  });
  const second = await approveMissionWithReward(db1, {
    submissionId: 'sub_123',
    recipientCharacterName: '20889',
    rewardAmount: 99,
    reviewerLabel: 'Teacher A',
  });

  if (first.ok && !first.idempotent && first.nuggets === 1) ok('first approval succeeds with +1');
  else bad('first approval', first);

  if (second.ok && second.idempotent && second.nuggets === 1) ok('second approval is idempotent success');
  else bad('second approval idempotent', second);

  if (db1._state.submissions.sub_123.status === 'accepted') ok('status remains accepted after replay');
  else bad('status after replay', db1._state.submissions.sub_123.status);

  if (countMissionRewardTx(db1, 'sub_123') === 1) ok('exactly one ledger row after double approve');
  else bad('ledger count after double approve', Object.keys(db1._state.transactions));

  if (walletBalance(db1, '20889') === 11) ok('wallet +1 total (10→11) after double approve');
  else bad('wallet after double approve', walletBalance(db1, '20889'));

  // --- Concurrent approve simulation ---
  const db2 = makeRewardDb({
    submissions: {
      sub_race: { id: 'sub_race', status: 'pending', character_name: '20889' },
    },
    wallets: { '20889': { character_name: '20889', balance: 0, updated_at: '' } },
  });

  const [rA, rB] = await Promise.all([
    approveMissionWithReward(db2, {
      submissionId: 'sub_race',
      recipientCharacterName: '20889',
      rewardAmount: 5,
      reviewerLabel: 'Teacher A',
    }),
    approveMissionWithReward(db2, {
      submissionId: 'sub_race',
      recipientCharacterName: '20889',
      rewardAmount: 5,
      reviewerLabel: 'Teacher A',
    }),
  ]);

  if (rA.ok && rB.ok) ok('concurrent approvals both return ok (one wins, one idempotent)');
  else bad('concurrent approvals', { rA, rB });

  if (countMissionRewardTx(db2, 'sub_race') === 1) ok('concurrent race: exactly one ledger row');
  else bad('concurrent ledger count', Object.keys(db2._state.transactions));

  if (walletBalance(db2, '20889') === 1) ok('concurrent race: wallet +1 only once');
  else bad('concurrent wallet', walletBalance(db2, '20889'));

  const winners = [rA, rB].filter((r) => !r.idempotent).length;
  const idempotent = [rA, rB].filter((r) => r.idempotent).length;
  if (winners === 1 && idempotent === 1) ok('concurrent race: exactly one first-time and one idempotent');
  else bad('concurrent winner split', { winners, idempotent });

  // --- Reward failure reverts to pending ---
  const db3 = makeRewardDb({
    submissions: {
      sub_fail: { id: 'sub_fail', status: 'pending', character_name: '20889' },
    },
    wallets: { '20889': { character_name: '20889', balance: 0, updated_at: '' } },
  });
  db3._state.failNextCreditBatch = true;

  const fail = await approveMissionWithReward(db3, {
    submissionId: 'sub_fail',
    recipientCharacterName: '20889',
    rewardAmount: 5,
    reviewerLabel: 'Teacher A',
  });

  if (!fail.ok && fail.error) ok('reward failure returns error (not success)');
  else bad('reward failure should not succeed', fail);

  if (db3._state.submissions.sub_fail.status === 'pending') ok('reward failure restores pending');
  else bad('status after reward failure', db3._state.submissions.sub_fail.status);

  if (countMissionRewardTx(db3, 'sub_fail') === 0) ok('reward failure: no ledger row');
  else bad('ledger after reward failure');

  if (walletBalance(db3, '20889') === 0) ok('reward failure: no wallet change');
  else bad('wallet after reward failure', walletBalance(db3, '20889'));

  // Retry after failure should succeed
  const retry = await approveMissionWithReward(db3, {
    submissionId: 'sub_fail',
    recipientCharacterName: '20889',
    rewardAmount: 5,
    reviewerLabel: 'Teacher A',
  });
  if (retry.ok && !retry.idempotent) ok('retry after failed payout can approve safely');
  else bad('retry after failure', retry);

  // --- Revert failure leaves accepted_without_reward flag ---
  const db4 = makeRewardDb({
    submissions: {
      sub_stuck: { id: 'sub_stuck', status: 'pending', character_name: '20889' },
    },
    wallets: { '20889': { character_name: '20889', balance: 0, updated_at: '' } },
  });
  db4._state.failNextCreditBatch = true;
  db4._state.failRevert = true;

  const stuck = await approveMissionWithReward(db4, {
    submissionId: 'sub_stuck',
    recipientCharacterName: '20889',
    rewardAmount: 5,
    reviewerLabel: 'Teacher A',
  });

  if (!stuck.ok && stuck.accepted_without_reward) ok('revert failure surfaces accepted_without_reward (no silent success)');
  else bad('revert failure handling', stuck);

  if (db4._state.submissions.sub_stuck.status === 'accepted') ok('revert failure: submission stays accepted (documented edge)');
  else bad('stuck submission status', db4._state.submissions.sub_stuck.status);

  // --- Duplicate INSERT PK behavior ---
  const db5 = makeRewardDb({
    wallets: { '20889': { character_name: '20889', balance: 0, updated_at: '' } },
  });
  const c1 = await creditMissionApprovalReward(db5, '20889', 'sub_pk', 5, 'note');
  const c2 = await creditMissionApprovalReward(db5, '20889', 'sub_pk', 5, 'note');
  if (c1.ok && !c1.idempotent && c2.ok && c2.idempotent) ok('duplicate INSERT blocked by PK; second call idempotent');
  else bad('PK duplicate behavior', { c1, c2 });
  if (walletBalance(db5, '20889') === 1) ok('PK race: wallet incremented once');
  else bad('PK race wallet', walletBalance(db5, '20889'));

  // --- Batch atomicity: failed wallet path rolls back ledger ---
  const db6 = makeRewardDb({
    wallets: { '20889': { character_name: '20889', balance: 0, updated_at: '' } },
  });
  db6._state.failNextCreditBatch = true;
  const batchFail = await creditMissionApprovalReward(db6, '20889', 'sub_batch', 5, 'note');
  if (!batchFail.ok) ok('batch failure returns error');
  else bad('batch failure', batchFail);
  if (countMissionRewardTx(db6, 'sub_batch') === 0) ok('batch failure rolls back ledger insert');
  else bad('ledger after batch failure');

  console.log('\n--- missions-reward-integrity-test: ' + passed + ' passed, ' + failed + ' failed ---');
  process.exit(failed > 0 ? 1 : 0);
})();
