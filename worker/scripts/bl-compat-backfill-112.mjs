/**
 * Prompt #112 — Bounded Lantern → Behavior Logger compatibility backfill.
 *
 * DEFAULT: DRY RUN ONLY (no D1 writes).
 * Production writes require BOTH:
 *   --apply
 *   --confirm-twelve=YES
 * and optionally a subset via --usernames=a,b,c (must be ⊆ APPROVED_TWELVE).
 *
 * NEVER:
 *   - fuzzy-match names/emails
 *   - change existing identity links
 *   - add privileged capabilities
 *   - rewrite historical logs/devices/nuggets
 *   - process students or arbitrary unlinked staff
 *
 * Usage (from lantern/worker or lantern root):
 *   node worker/scripts/bl-compat-backfill-112.mjs
 *   node worker/scripts/bl-compat-backfill-112.mjs --usernames=eric.colorado
 *   node worker/scripts/bl-compat-backfill-112.mjs --apply --confirm-twelve=YES
 *
 * DO NOT pass --apply unless an explicit production approval follows deploy.
 */
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  compatibilityTeacherIdFromLanternStaffId,
  canonicalLanternStaffDisplayName,
} from '../tms-compat-provision.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const lanternWorkerDir = path.resolve(__dirname, '..');
const lanternRoot = path.resolve(lanternWorkerDir, '..');
const mtssRoot = path.resolve(lanternRoot, '..', 'mtss-behavior-log');

/** Hard allow-list from audit #110 / dry-run #111 — only these may ever be backfilled by this script. */
export const APPROVED_TWELVE = Object.freeze([
  { username: 'amanda.cooper', staff_id: 7, teacher_id: 'L7' },
  { username: 'ashleigh.ackerman', staff_id: 8, teacher_id: 'L8' },
  { username: 'ashley.cordova', staff_id: 9, teacher_id: 'L9' },
  { username: 'darcy.dunker', staff_id: 11, teacher_id: 'L11' },
  { username: 'eric.colorado', staff_id: 13, teacher_id: 'L13' },
  { username: 'je.lynn', staff_id: 34, teacher_id: 'L34' },
  { username: 'norma.rice', staff_id: 22, teacher_id: 'L22' },
  { username: 'shanda.vasquez', staff_id: 26, teacher_id: 'L26' },
  { username: 'sherry.garcia', staff_id: 27, teacher_id: 'L27' },
  { username: 'theresa.sanchez', staff_id: 30, teacher_id: 'L30' },
  { username: 'tom.romero', staff_id: 31, teacher_id: 'L31' },
  { username: 'xander.wilson', staff_id: 33, teacher_id: 'L33' },
]);

const APPROVED_BY_USER = Object.fromEntries(APPROVED_TWELVE.map((r) => [r.username, r]));

function parseArgs(argv) {
  const out = {
    apply: false,
    confirmTwelve: '',
    usernames: null,
  };
  for (const a of argv) {
    if (a === '--apply') out.apply = true;
    else if (a.startsWith('--confirm-twelve=')) out.confirmTwelve = a.slice('--confirm-twelve='.length).trim();
    else if (a.startsWith('--usernames=')) {
      out.usernames = a
        .slice('--usernames='.length)
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
    }
  }
  return out;
}

function sqlStr(v) {
  return "'" + String(v == null ? '' : v).replace(/'/g, "''") + "'";
}

function runWranglerD1Command(cwd, dbName, sql, { allowWrite }) {
  if (!allowWrite) {
    const trimmed = String(sql).trim().toUpperCase();
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
    if (block && Array.isArray(block.results)) return block.results;
  }
  return [];
}

function selectTargets(args) {
  if (!args.usernames || !args.usernames.length) return [...APPROVED_TWELVE];
  const targets = [];
  for (const u of args.usernames) {
    const row = APPROVED_BY_USER[u];
    if (!row) {
      throw new Error('username not in APPROVED_TWELVE allow-list: ' + u);
    }
    targets.push(row);
  }
  return targets;
}

function planWouldActions(row) {
  const actions = [];
  if (!row.mtss_teacher_id_exists) {
    actions.push('CREATE mtss.staff teacher_id=' + row.proposed_teacher_id + ' name=' + row.canonical_display);
  } else {
    actions.push('SKIP staff row (exists)');
  }
  if (!row.has_teacher_capability) {
    actions.push('GRANT staff_capabilities TEACHER only');
  } else {
    actions.push('SKIP capability (TEACHER already present)');
  }
  if (!row.identity_link_exists) {
    actions.push(
      'CREATE tms_identity_links ' +
        row.username +
        ' → ' +
        row.proposed_teacher_id +
        ' (staff_id=' +
        row.staff_id +
        ', primary)'
    );
  } else if (row.existing_link_tms_staff_id !== row.proposed_teacher_id) {
    actions.push('REFUSE: existing link differs (' + row.existing_link_tms_staff_id + ')');
  } else {
    actions.push('SKIP identity link (exists)');
  }
  return actions;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const targets = selectTargets(args);
  const apply = !!args.apply;

  if (apply) {
    if (args.confirmTwelve !== 'YES') {
      console.error('REFUSED: --apply requires --confirm-twelve=YES');
      process.exit(2);
    }
    if (args.usernames && args.usernames.length) {
      // subset OK
    } else if (targets.length !== APPROVED_TWELVE.length) {
      console.error('REFUSED: apply target set unexpected');
      process.exit(2);
    }
  }

  console.log(apply ? 'MODE: APPLY (writes enabled)\n' : 'MODE: DRY RUN (no writes)\n');

  const userList = targets.map((t) => sqlStr(t.username)).join(',');
  const lanternSql =
    'SELECT p.username, p.staff_id, p.display_name, p.first_name, p.last_name, p.email, p.role, p.is_active, ' +
    '(SELECT l.tms_staff_id FROM tms_identity_links l WHERE lower(trim(l.lantern_username))=lower(trim(p.username)) LIMIT 1) AS existing_link ' +
    'FROM lantern_pilot_accounts p WHERE lower(trim(p.username)) IN (' +
    userList +
    ') ORDER BY p.username';

  const lanternRows = runWranglerD1Command(lanternWorkerDir, 'lantern-db', lanternSql, { allowWrite: false });

  const proposedIds = targets.map((t) => t.teacher_id);
  const mtssSql =
    'SELECT teacher_id, teacher_name FROM staff WHERE teacher_id IN (' +
    proposedIds.map(sqlStr).join(',') +
    ')';
  const mtssStaff = runWranglerD1Command(mtssRoot, 'mtss-db', mtssSql, { allowWrite: false });
  const mtssSet = new Set(mtssStaff.map((r) => String(r.teacher_id)));

  const capsSql =
    "SELECT teacher_id, capability FROM staff_capabilities WHERE teacher_id IN (" +
    proposedIds.map(sqlStr).join(',') +
    ") AND capability = 'TEACHER'";
  let capSet = new Set();
  try {
    const caps = runWranglerD1Command(mtssRoot, 'mtss-db', capsSql, { allowWrite: false });
    capSet = new Set(caps.map((r) => String(r.teacher_id)));
  } catch (e) {
    console.warn('capability lookup warning:', e.message);
  }

  const report = [];
  let refused = 0;

  for (const expected of targets) {
    const row = lanternRows.find((r) => String(r.username).toLowerCase() === expected.username);
    if (!row) {
      report.push({
        username: expected.username,
        status: 'REFUSED',
        reason: 'MISSING_IN_LANTERN',
        would_actions: [],
      });
      refused++;
      continue;
    }
    const staffId = Number(row.staff_id);
    const proposed = compatibilityTeacherIdFromLanternStaffId(staffId);
    const role = String(row.role || '').trim().toLowerCase();
    const active = row.is_active != null ? Number(row.is_active) !== 0 : true;
    const link = row.existing_link ? String(row.existing_link).trim() : '';
    const display = canonicalLanternStaffDisplayName(row);

    let collision = 'none';
    let status = 'ok';
    if (staffId !== expected.staff_id) {
      collision = 'staff_id_mismatch_expected_' + expected.staff_id + '_got_' + staffId;
      status = 'REFUSED';
    } else if (proposed !== expected.teacher_id) {
      collision = 'teacher_id_mismatch';
      status = 'REFUSED';
    } else if (role !== 'teacher' && role !== 'admin') {
      collision = 'not_staff_role';
      status = 'REFUSED';
    } else if (!active) {
      collision = 'inactive';
      status = 'REFUSED';
    } else if (link && link !== proposed) {
      collision = 'existing_link_differs(' + link + ')';
      status = 'REFUSED';
    }

    const entry = {
      username: row.username,
      staff_id: staffId,
      canonical_display: display,
      email: row.email || '',
      proposed_teacher_id: proposed,
      proposed_capability: 'TEACHER',
      mtss_teacher_id_exists: mtssSet.has(proposed),
      has_teacher_capability: capSet.has(proposed),
      identity_link_exists: !!link,
      existing_link_tms_staff_id: link || null,
      collision_status: collision,
      status,
    };
    entry.would_actions = status === 'REFUSED' ? ['NO_WRITE'] : planWouldActions(entry);
    if (status === 'REFUSED') refused++;
    report.push(entry);
  }

  console.log(
    JSON.stringify(
      {
        ok: refused === 0,
        dry_run: !apply,
        writes: false,
        apply_requested: apply,
        count: report.length,
        accounts: report,
      },
      null,
      2
    )
  );

  if (refused > 0) {
    console.error('\nREFUSED: ' + refused + ' account(s) failed safety checks. No writes.');
    process.exit(3);
  }

  if (!apply) {
    console.log('\nDry-run complete. No writes. To apply later (AFTER deploy + explicit approval):');
    console.log(
      '  node worker/scripts/bl-compat-backfill-112.mjs --apply --confirm-twelve=YES' +
        (args.usernames ? ' --usernames=' + args.usernames.join(',') : '')
    );
    return;
  }

  // APPLY path — still refuses if anything looks wrong mid-flight.
  console.log('\nApplying bounded compatibility rows…');
  let writes = 0;
  for (const entry of report) {
    const teacherId = entry.proposed_teacher_id;
    const display = entry.canonical_display;
    const email = entry.email || '';
    if (!entry.mtss_teacher_id_exists) {
      const ins =
        'INSERT INTO staff (teacher_id, teacher_name, teacher_email, is_admin, role, active, must_change_password) ' +
        'SELECT ' +
        sqlStr(teacherId) +
        ', ' +
        sqlStr(display) +
        ', ' +
        sqlStr(email) +
        ", '', 'Teacher', 1, 1 " +
        'WHERE NOT EXISTS (SELECT 1 FROM staff WHERE teacher_id = ' +
        sqlStr(teacherId) +
        ')';
      runWranglerD1Command(mtssRoot, 'mtss-db', ins, { allowWrite: true });
      writes++;
    }
    if (!entry.has_teacher_capability) {
      const now = new Date().toISOString();
      const cap =
        'INSERT OR IGNORE INTO staff_capabilities (teacher_id, capability, granted_at, granted_by) VALUES (' +
        sqlStr(teacherId) +
        ", 'TEACHER', " +
        sqlStr(now) +
        ", 'bl_compat_backfill_112')";
      runWranglerD1Command(mtssRoot, 'mtss-db', cap, { allowWrite: true });
      writes++;
    }
    if (!entry.identity_link_exists) {
      // Never UPDATE/REPLACE an existing link — only INSERT when absent.
      const linkSql =
        'INSERT INTO tms_identity_links (tms_staff_id, lantern_username, lantern_staff_id, is_primary, created_at, created_by) ' +
        'SELECT ' +
        sqlStr(teacherId) +
        ', ' +
        sqlStr(entry.username) +
        ', ' +
        Number(entry.staff_id) +
        ", 1, datetime('now'), 'bl_compat_backfill_112' " +
        'WHERE NOT EXISTS (SELECT 1 FROM tms_identity_links WHERE lower(trim(lantern_username)) = lower(trim(' +
        sqlStr(entry.username) +
        '))) ' +
        'AND NOT EXISTS (SELECT 1 FROM tms_identity_links WHERE lantern_staff_id = ' +
        Number(entry.staff_id) +
        ')';
      runWranglerD1Command(lanternWorkerDir, 'lantern-db', linkSql, { allowWrite: true });
      writes++;
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        dry_run: false,
        writes: true,
        write_statements_attempted: writes,
        note: 'Idempotent INSERT/INSERT OR IGNORE only; no link replacements; TEACHER only.',
      },
      null,
      2
    )
  );
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
