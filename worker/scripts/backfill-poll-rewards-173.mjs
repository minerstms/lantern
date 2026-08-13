/**
 * Prompt #173 — historical Poll completion Nugget backfill.
 *
 * DEFAULT: DRY RUN (no writes).
 * APPLY writes TMS ledger rows only when the reconstructed set is exactly
 * 14 staff + 5 student = 19 / +19, every identity is exact, and each pair
 * lacks the canonical authoritative reward.
 *
 * Usage:
 *   node worker/scripts/backfill-poll-rewards-173.mjs
 *   node worker/scripts/backfill-poll-rewards-173.mjs --dry-run
 *   node worker/scripts/backfill-poll-rewards-173.mjs --apply
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  BACKFILL_NOTE,
  BACKFILL_SOURCE,
  EXPECTED_DELTA_EACH,
  EXPECTED_STAFF_CANDIDATES,
  EXPECTED_STUDENT_CANDIDATES,
  EXPECTED_TOTAL_CANDIDATES,
  EXPECTED_TOTAL_DELTA,
  POLL_COMPLETE_KIND,
  evaluateApplyGate,
  expectedBalanceDeltaByPrincipal,
  reconstructHistoricalPollRewardCandidates,
  sanitizeCandidateForReport,
} from '../poll-reward-backfill-173.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const lanternWorkerDir = path.resolve(__dirname, '..');
const lanternRoot = path.resolve(lanternWorkerDir, '..');

function resolveMtssRoot() {
  const candidates = [
    process.env.TMS_REPO_ROOT,
    path.resolve(lanternRoot, '..', 'mtss-behavior-log'),
    path.resolve(lanternRoot, '..', 'tms-173-poll-backfill'),
    path.join('C:', 'Users', 'mrrad', 'AppData', 'Local', 'Temp', 'tms-173-poll-backfill'),
    path.join('C:', 'Users', 'mrrad', 'Documents', 'GitHub', 'mtss-behavior-log'),
  ].filter(Boolean);
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, 'wrangler.toml'))) return c;
  }
  throw new Error('TMS repo with wrangler.toml not found (set TMS_REPO_ROOT)');
}

const mtssRoot = resolveMtssRoot();

function parseArgs(argv) {
  const out = { apply: false, dryRun: true };
  for (const a of argv) {
    if (a === '--apply') {
      out.apply = true;
      out.dryRun = false;
    } else if (a === '--dry-run') {
      out.dryRun = true;
      out.apply = false;
    }
  }
  return out;
}

function sqlStr(v) {
  return "'" + String(v == null ? '' : v).replace(/'/g, "''") + "'";
}

function runWranglerD1Command(cwd, dbName, sql, { allowWrite }) {
  const trimmed = String(sql).trim().toUpperCase();
  if (!allowWrite) {
    if (!trimmed.startsWith('SELECT') && !trimmed.startsWith('WITH')) {
      throw new Error('dry-run refused non-SELECT: ' + sql.slice(0, 80));
    }
  }
  const cmd =
    'npx.cmd wrangler d1 execute ' + dbName + ' --remote --json --command ' + JSON.stringify(sql);
  const r = spawnSync(cmd, { cwd, encoding: 'utf8', shell: true });
  if (r.status !== 0) {
    throw new Error(`wrangler failed (${dbName}): ${r.stderr || r.stdout || 'exit ' + r.status}`);
  }
  const out = String(r.stdout || '').trim();
  const start = out.indexOf('[');
  if (start < 0) throw new Error('no JSON from wrangler: ' + out.slice(0, 200));
  const parsed = JSON.parse(out.slice(start));
  const blocks = Array.isArray(parsed) ? parsed : [parsed];
  for (const block of blocks) {
    if (block && Array.isArray(block.results)) {
      return { results: block.results, meta: block.meta || {} };
    }
  }
  return { results: [], meta: (blocks[0] && blocks[0].meta) || {} };
}

function selectLantern(sql) {
  return runWranglerD1Command(lanternWorkerDir, 'lantern-db', sql, { allowWrite: false }).results;
}

function selectTms(sql) {
  return runWranglerD1Command(mtssRoot, 'mtss-db', sql, { allowWrite: false }).results;
}

function writeTms(sql) {
  return runWranglerD1Command(mtssRoot, 'mtss-db', sql, { allowWrite: true });
}

function writeLantern(sql) {
  return runWranglerD1Command(lanternWorkerDir, 'lantern-db', sql, { allowWrite: true });
}

function loadSnapshot() {
  const polls = selectLantern('SELECT id FROM lantern_polls');
  const votes = selectLantern('SELECT poll_id, character_name FROM lantern_poll_votes');
  const voterRewards = selectLantern('SELECT poll_id, character_name FROM lantern_poll_voter_rewards');
  const lanternAccounts = selectLantern(
    'SELECT username, role, mtss_student_id, student_character_name, staff_id FROM lantern_pilot_accounts'
  );
  const identityLinks = selectLantern(
    'SELECT lantern_username, tms_staff_id, lantern_staff_id FROM tms_identity_links'
  );
  const lanternWallets = selectLantern(
    "SELECT character_name, balance FROM lantern_wallets WHERE character_name LIKE 'staff:%' OR character_name LIKE 'staff_id:%'"
  );
  const tmsStudentPollTxns = selectTms(
    "SELECT reference, student_id, delta, kind FROM nugget_bridge_transactions " +
      "WHERE reference LIKE 'lantern:poll_vote:%' OR reference LIKE 'lantern:poll_complete:%' " +
      "OR kind IN ('poll_vote','poll_complete')"
  );
  const tmsStaffPollTxns = selectTms(
    "SELECT reference, tms_staff_id, delta, kind FROM nugget_staff_bridge_transactions " +
      "WHERE reference LIKE 'lantern:poll_vote:%' OR reference LIKE 'lantern:poll_complete:%' " +
      "OR kind IN ('poll_vote','poll_complete')"
  );
  const tmsStudents = selectTms(
    "SELECT student_id, student_name, is_active FROM students WHERE TRIM(COALESCE(student_id, '')) != ''"
  );
  const tmsStaff = selectTms('SELECT teacher_id FROM staff');
  return {
    polls,
    votes,
    voterRewards,
    lanternAccounts,
    identityLinks,
    lanternWallets,
    tmsStudentPollTxns,
    tmsStaffPollTxns,
    tmsStudents,
    tmsStaff,
  };
}

function readStaffBalance(tmsStaffId) {
  const rows = selectTms(
    'SELECT COALESCE(SUM(delta), 0) AS available FROM nugget_staff_bridge_transactions WHERE tms_staff_id = ' +
      sqlStr(tmsStaffId)
  );
  return Number(rows[0] && rows[0].available) || 0;
}

function readStudentBalance(studentName) {
  const sql =
    'SELECT (' +
    '(SELECT COALESCE(SUM(nugget_delta), 0) FROM logs WHERE student_name = ' +
    sqlStr(studentName) +
    ') - (SELECT COALESCE(SUM(total_cost), 0) FROM store_redeems WHERE student_name = ' +
    sqlStr(studentName) +
    ') + (SELECT COALESCE(SUM(delta), 0) FROM nugget_bridge_transactions WHERE student_name = ' +
    sqlStr(studentName) +
    ')) AS available';
  const rows = selectTms(sql);
  return Number(rows[0] && rows[0].available) || 0;
}

function printSanitizedPlan(plan, gate) {
  console.log('Staff candidates:', plan.counts.staff);
  console.log('Student candidates:', plan.counts.student);
  console.log('Total:', plan.counts.total);
  console.log('Delta each: +' + plan.counts.deltaEach);
  console.log('Total delta: +' + plan.counts.totalDelta);
  console.log('Unresolved identities:', plan.counts.unresolved);
  console.log('Gate:', gate.ok ? 'PASS 14 + 5 = 19 / +19' : 'FAIL ' + gate.reasons.join(', '));
  console.log('');
  for (const c of plan.candidates) {
    const row = sanitizeCandidateForReport(c);
    console.log(
      [
        row.principal_type,
        'poll=' + row.poll_id,
        'link=' + row.link_status,
        'ref=' + row.canonical_reference,
        'tms_reward=' + (row.has_authoritative_reward ? 'yes' : 'no'),
        'local_marker=' + (row.has_local_voter_reward ? 'yes' : 'no'),
        'wallet_evidence=' + (row.historical_wallet_present ? 'present' : 'none'),
        'delta=+' + row.delta,
      ].join('  ')
    );
  }
  if (plan.unresolved.length) {
    console.log('\nUnresolved (sanitized):');
    for (const u of plan.unresolved) {
      console.log(' ', u.principalType, 'poll=' + u.pollId, 'key_class=' + (u.keyClass || 'unknown'), 'reason=' + u.reason);
    }
  }
}

function applyOneCandidate(candidate) {
  const ref = candidate.canonicalReference;
  const now = new Date().toISOString();
  if (candidate.principalType === 'staff') {
    const existing = selectTms(
      'SELECT id FROM nugget_staff_bridge_transactions WHERE reference = ' + sqlStr(ref)
    );
    if (existing.length) return { status: 'already_applied' };
    writeTms(
      'INSERT INTO nugget_staff_bridge_transactions (reference, tms_staff_id, delta, kind, source, note, created_at) ' +
        'SELECT ' +
        sqlStr(ref) +
        ', ' +
        sqlStr(candidate.tmsStaffId) +
        ', ' +
        EXPECTED_DELTA_EACH +
        ', ' +
        sqlStr(POLL_COMPLETE_KIND) +
        ', ' +
        sqlStr(BACKFILL_SOURCE) +
        ', ' +
        sqlStr(BACKFILL_NOTE) +
        ', ' +
        sqlStr(now) +
        ' WHERE NOT EXISTS (SELECT 1 FROM nugget_staff_bridge_transactions WHERE reference = ' +
        sqlStr(ref) +
        ')'
    );
    const confirm = selectTms(
      'SELECT id FROM nugget_staff_bridge_transactions WHERE reference = ' + sqlStr(ref)
    );
    return confirm.length ? { status: 'credited' } : { status: 'failed', error: 'staff_insert_unconfirmed' };
  }

  const existing = selectTms(
    'SELECT id FROM nugget_bridge_transactions WHERE reference = ' + sqlStr(ref)
  );
  if (existing.length) return { status: 'already_applied' };
  writeTms(
    'INSERT INTO nugget_bridge_transactions (reference, student_name, student_id, delta, kind, source, note, created_at) ' +
      'SELECT ' +
      sqlStr(ref) +
      ', ' +
      sqlStr(candidate.studentName) +
      ', ' +
      sqlStr(candidate.studentId) +
      ', ' +
      EXPECTED_DELTA_EACH +
      ', ' +
      sqlStr(POLL_COMPLETE_KIND) +
      ', ' +
      sqlStr(BACKFILL_SOURCE) +
      ', ' +
      sqlStr(BACKFILL_NOTE) +
      ', ' +
      sqlStr(now) +
      ' WHERE NOT EXISTS (SELECT 1 FROM nugget_bridge_transactions WHERE reference = ' +
      sqlStr(ref) +
      ')'
  );
  const confirm = selectTms(
    'SELECT id FROM nugget_bridge_transactions WHERE reference = ' + sqlStr(ref)
  );
  return confirm.length ? { status: 'credited' } : { status: 'failed', error: 'student_insert_unconfirmed' };
}

function mirrorLanternTransaction(candidate) {
  const id = 'tx_173_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
  const meta = JSON.stringify({
    tms_reference: candidate.canonicalReference,
    poll_id: candidate.pollId,
    account_key: candidate.accountKey,
    backfill: true,
    source: BACKFILL_SOURCE,
    tms_backed: true,
    economy_authority: candidate.principalType === 'staff' ? 'tms_nuggets_staff' : 'tms_nuggets',
  });
  writeLantern(
    'INSERT INTO lantern_transactions (id, character_name, delta, kind, source, note, created_at, meta_json) VALUES (' +
      [
        sqlStr(id),
        sqlStr(candidate.accountKey),
        String(EXPECTED_DELTA_EACH),
        sqlStr(POLL_COMPLETE_KIND),
        sqlStr(BACKFILL_SOURCE),
        sqlStr(BACKFILL_NOTE),
        sqlStr(new Date().toISOString()),
        sqlStr(meta),
      ].join(', ') +
      ')'
  );
}

function readBalances(candidates) {
  const out = Object.create(null);
  for (const c of candidates) {
    if (c.principalType === 'staff') {
      const key = 'staff:' + c.tmsStaffId;
      if (out[key] == null) out[key] = readStaffBalance(c.tmsStaffId);
    } else {
      const key = 'student:' + c.studentId;
      if (out[key] == null) out[key] = readStudentBalance(c.studentName);
    }
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log(args.apply ? 'MODE: APPLY\n' : 'MODE: DRY RUN (no writes)\n');
  console.log(
    'Expected gate: staff ' +
      EXPECTED_STAFF_CANDIDATES +
      ' + student ' +
      EXPECTED_STUDENT_CANDIDATES +
      ' = ' +
      EXPECTED_TOTAL_CANDIDATES +
      ' / +' +
      EXPECTED_TOTAL_DELTA +
      '\n'
  );

  const snapshot = loadSnapshot();
  const plan = reconstructHistoricalPollRewardCandidates(snapshot);
  const gate = evaluateApplyGate(plan);
  printSanitizedPlan(plan, gate);

  if (!args.apply) {
    console.log('\nDRY RUN complete. No TMS or Lantern writes.');
    process.exit(gate.ok ? 0 : 3);
  }

  if (!gate.ok) {
    console.error('\nAPPLY REFUSED. Candidate set does not match the approved 14 + 5 = 19 / +19 gate.');
    console.error('Reasons:', gate.reasons.join(', '));
    process.exit(2);
  }

  const before = readBalances(plan.candidates);
  const expectedDeltas = expectedBalanceDeltaByPrincipal(plan.candidates);
  const results = { credited: 0, already_applied: 0, failed: 0, failures: [] };

  for (const candidate of plan.candidates) {
    try {
      const outcome = applyOneCandidate(candidate);
      if (outcome.status === 'credited') {
        try {
          mirrorLanternTransaction(candidate);
        } catch (_) {
          /* TMS credit is authoritative; local history mirror is best-effort. */
        }
        results.credited += 1;
      } else if (outcome.status === 'already_applied') {
        results.already_applied += 1;
      } else {
        results.failed += 1;
        results.failures.push({ pollId: candidate.pollId, principalType: candidate.principalType, error: outcome.error });
      }
    } catch (e) {
      results.failed += 1;
      results.failures.push({
        pollId: candidate.pollId,
        principalType: candidate.principalType,
        error: String(e && e.message ? e.message : e),
      });
    }
  }

  const afterSnapshot = loadSnapshot();
  const afterPlan = reconstructHistoricalPollRewardCandidates(afterSnapshot);
  const after = readBalances(plan.candidates);

  console.log('\nAPPLY RESULT');
  console.log('Selected:', EXPECTED_TOTAL_CANDIDATES);
  console.log('Credited:', results.credited);
  console.log('Already applied:', results.already_applied);
  console.log('Failed:', results.failed);
  console.log('Post-write deterministic missing:', afterPlan.counts.total);

  let balanceOk = true;
  for (const key of Object.keys(expectedDeltas)) {
    const exp = (Number(before[key]) || 0) + expectedDeltas[key];
    const got = Number(after[key]) || 0;
    if (got !== exp) {
      balanceOk = false;
      console.log('Balance mismatch', key, 'before', before[key], 'after', got, 'expected', exp);
    }
  }
  if (balanceOk) console.log('Balance deltas match approved per-principal counts.');

  if (results.failed) {
    console.error('Failures:', results.failures);
    process.exit(4);
  }
  if (afterPlan.counts.total !== 0) {
    console.error('Post-write reconciliation still has deterministic misses.');
    process.exit(5);
  }
  process.exit(0);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    main();
  } catch (e) {
    console.error(e && e.stack ? e.stack : e);
    process.exit(1);
  }
}

export { parseArgs, loadSnapshot };
