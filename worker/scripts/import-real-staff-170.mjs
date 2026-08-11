/**
 * Prompt #170 — Import/reconcile real TMS staff identities into Lantern.
 *
 * Dry-run (default):
 *   node worker/scripts/import-real-staff-170.mjs --live
 *
 * Apply safe CREATE/UPDATE + exact TMS links (after migration 060):
 *   node worker/scripts/import-real-staff-170.mjs --live --apply
 *
 * Never prints plaintext passwords. New accounts are created with NULL hash/salt
 * (password_not_set until admin issues a temp password). Existing hashes untouched.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workerDir = path.join(__dirname, '..');
const EMAIL_DOMAIN = 'trinidad.k12.co.us';
const CREATED_BY = 'prompt-170-import';

/** @typedef {{ first: string, last: string, display: string, username: string, email: string, notes?: string }} StaffPerson */

/** @type {StaffPerson[]} */
export const REAL_STAFF_ROSTER = [
  { first: 'Alyssa', last: 'Glorioso', display: 'Alyssa Glorioso', username: 'alyssa.glorioso', email: `alyssa.glorioso@${EMAIL_DOMAIN}` },
  { first: 'Amanda', last: 'Cooper', display: 'Amanda Cooper', username: 'amanda.cooper', email: `amanda.cooper@${EMAIL_DOMAIN}` },
  { first: 'Ashleigh', last: 'Ackerman', display: 'Ashleigh Ackerman', username: 'ashleigh.ackerman', email: `ashleigh.ackerman@${EMAIL_DOMAIN}` },
  { first: 'Ashley', last: 'Cordova', display: 'Ashley Cordova', username: 'ashley.cordova', email: `ashley.cordova@${EMAIL_DOMAIN}` },
  { first: 'Charles', last: 'Glorioso', display: 'Charles Glorioso', username: 'charles.glorioso', email: `charles.glorioso@${EMAIL_DOMAIN}` },
  { first: 'Darcy', last: 'Dunker', display: 'Darcy Dunker', username: 'darcy.dunker', email: `darcy.dunker@${EMAIL_DOMAIN}` },
  { first: 'Deana', last: 'Pachelli', display: 'Deana Pachelli', username: 'deana.pachelli', email: `deana.pachelli@${EMAIL_DOMAIN}` },
  { first: 'Eric', last: 'Colorado', display: 'Eric Colorado', username: 'eric.colorado', email: `eric.colorado@${EMAIL_DOMAIN}` },
  { first: 'Frank', last: 'Begano', display: 'Frank Begano', username: 'frank.begano', email: `frank.begano@${EMAIL_DOMAIN}` },
  { first: 'Harmonee', last: 'Valdez', display: 'Harmonee Valdez', username: 'harmonee.valdez', email: `harmonee.valdez@${EMAIL_DOMAIN}` },
  { first: 'Jeffrey', last: 'Hecht', display: 'Jeffrey Hecht', username: 'jeffrey.hecht', email: `jeffrey.hecht@${EMAIL_DOMAIN}` },
  { first: 'Jessie', last: 'Russett', display: 'Jessie Russett', username: 'jessie.russett', email: `jessie.russett@${EMAIL_DOMAIN}` },
  { first: 'Kristina', last: 'Vezzani', display: 'Kristina Vezzani', username: 'kristina.vezzani', email: `kristina.vezzani@${EMAIL_DOMAIN}` },
  { first: 'Lisa', last: 'Glorioso', display: 'Lisa Glorioso', username: 'lisa.glorioso', email: `lisa.glorioso@${EMAIL_DOMAIN}` },
  { first: 'Michael', last: 'Peitsmeyer', display: 'Michael Peitsmeyer', username: 'michael.peitsmeyer', email: `michael.peitsmeyer@${EMAIL_DOMAIN}` },
  { first: 'Mychaela', last: 'Vecellio', display: 'Mychaela Vecellio', username: 'mychaela.vecellio', email: `mychaela.vecellio@${EMAIL_DOMAIN}` },
  { first: 'Nickol', last: 'Dominguez', display: 'Nickol Dominguez', username: 'nickol.dominguez', email: `nickol.dominguez@${EMAIL_DOMAIN}` },
  { first: 'Norma', last: 'Rice', display: 'Norma Rice', username: 'norma.rice', email: `norma.rice@${EMAIL_DOMAIN}` },
  { first: 'Preston', last: 'Russett', display: 'Preston Russett', username: 'preston.russett', email: `preston.russett@${EMAIL_DOMAIN}` },
  { first: 'Rebecca', last: 'Wilson', display: 'Rebecca Wilson', username: 'rebecca.wilson', email: `rebecca.wilson@${EMAIL_DOMAIN}` },
  {
    first: 'Rick',
    last: 'Radle',
    display: 'Rick Radle',
    username: 'rick.radle',
    email: `rick.radle@${EMAIL_DOMAIN}`,
    notes: 'Privileged admin login is "admin" (display Web Admin); teacher twin rick.radle remains a separate row.',
  },
  { first: 'Sara', last: 'Wilson', display: 'Sara Wilson', username: 'sara.wilson', email: `sara.wilson@${EMAIL_DOMAIN}` },
  { first: 'Shanda', last: 'Vasquez', display: 'Shanda Vasquez', username: 'shanda.vasquez', email: `shanda.vasquez@${EMAIL_DOMAIN}` },
  { first: 'Sherry', last: 'Garcia', display: 'Sherry Garcia', username: 'sherry.garcia', email: `sherry.garcia@${EMAIL_DOMAIN}` },
  { first: 'Sherry', last: 'Hinchley', display: 'Sherry Hinchley', username: 'sherry.hinchley', email: `sherry.hinchley@${EMAIL_DOMAIN}` },
  { first: 'Steph', last: 'Garcia', display: 'Steph Garcia', username: 'steph.garcia', email: `steph.garcia@${EMAIL_DOMAIN}` },
  { first: 'Theresa', last: 'Sanchez', display: 'Theresa Sanchez', username: 'theresa.sanchez', email: `theresa.sanchez@${EMAIL_DOMAIN}` },
  { first: 'Tom', last: 'Romero', display: 'Tom Romero', username: 'tom.romero', email: `tom.romero@${EMAIL_DOMAIN}` },
  { first: 'Vincent', last: 'Gumlich', display: 'Vincent Gumlich', username: 'vincent.gumlich', email: `vincent.gumlich@${EMAIL_DOMAIN}` },
  { first: 'Xander', last: 'Wilson', display: 'Xander Wilson', username: 'xander.wilson', email: `xander.wilson@${EMAIL_DOMAIN}` },
  {
    first: 'Jacqueline',
    last: 'Lynn',
    display: 'Jackie Lynn',
    username: 'je.lynn',
    email: `je.lynn@${EMAIL_DOMAIN}`,
    notes: 'Known exception — do not use jackie.lynn / jacqueline.lynn',
  },
];

function normName(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function sqlStr(s) {
  return `'${String(s).replace(/'/g, "''")}'`;
}

function readSnap(filePath) {
  let raw = fs.readFileSync(filePath);
  // PowerShell Out-File may emit UTF-16 LE; normalize to UTF-8 text.
  if (raw.length >= 2 && raw[0] === 0xff && raw[1] === 0xfe) {
    raw = Buffer.from(raw.toString('utf16le'));
  } else if (raw.includes(0x00)) {
    raw = Buffer.from(raw.toString('utf16le'));
  }
  let text = raw.toString('utf8').replace(/^\uFEFF/, '');
  const start = text.indexOf('[');
  if (start < 0) throw new Error('Bad snapshot JSON: ' + filePath);
  const parsed = JSON.parse(text.slice(start));
  const block = Array.isArray(parsed) ? parsed[0] : parsed;
  return (block && block.results) || [];
}

function refreshSnapshots() {
  const scriptsDir = __dirname;
  const mtssRoot = path.join(path.dirname(path.dirname(workerDir)), 'mtss-behavior-log');
  const lanternSql =
    "SELECT username, display_name, first_name, last_name, staff_id, email, role, is_active, CASE WHEN password_hash IS NULL OR password_hash = '' THEN 0 ELSE 1 END AS has_password, must_change_password FROM lantern_pilot_accounts WHERE lower(trim(role)) IN ('teacher','admin') ORDER BY lower(username)";
  const linksSql = 'SELECT tms_staff_id, lantern_username, created_at, created_by FROM tms_identity_links';
  const tmsSql = 'SELECT teacher_id, teacher_name, teacher_email, role, is_admin FROM staff ORDER BY teacher_name';

  const lanternOut = path.join(scriptsDir, '_snap_lantern_staff.json');
  const linksOut = path.join(scriptsDir, '_snap_links.json');
  const tmsOut = path.join(scriptsDir, '_snap_tms_staff.json');

  const run = (cwd, database, sql, outFile) => {
    const ps = `$out = npx wrangler d1 execute ${database} --remote --command ${JSON.stringify(sql)} --json; [System.IO.File]::WriteAllText(${JSON.stringify(outFile)}, $out, (New-Object System.Text.UTF8Encoding $false))`;
    const r = spawnSync('powershell.exe', ['-NoProfile', '-Command', ps], { cwd, encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`snapshot failed ${database}: ${r.stderr || r.stdout || r.status}`);
  };

  run(workerDir, 'lantern-db', lanternSql, lanternOut);
  run(workerDir, 'lantern-db', linksSql, linksOut);
  run(mtssRoot, 'mtss-db', tmsSql, tmsOut);
  return { lanternOut, linksOut, tmsOut };
}

function d1File(database, filePath, cwd) {
  const ps = `npx wrangler d1 execute ${database} --remote --file=${JSON.stringify(filePath)}`;
  const r = spawnSync('powershell.exe', ['-NoProfile', '-Command', ps], {
    cwd,
    encoding: 'utf8',
  });
  if (r.status !== 0) {
    throw new Error(`D1 file execute failed: ${r.stderr || r.stdout || r.status}`);
  }
  return String(r.stdout || '');
}

/**
 * Exact TMS match only: identical normalized first+last OR identical email.
 * No fuzzy / nickname guessing (Ashliegh≠Ashleigh is unmatched unless email exact).
 */
export function matchTmsStaff(person, tmsRows) {
  const wantFirst = normName(person.first);
  const wantLast = normName(person.last);
  const wantEmail = normName(person.email);
  const byName = [];
  const byEmail = [];
  for (const row of tmsRows || []) {
    const full = normName(row.teacher_name);
    const parts = full.split(' ').filter(Boolean);
    const tFirst = parts[0] || '';
    const tLast = parts.length > 1 ? parts[parts.length - 1] : '';
    if (tFirst === wantFirst && tLast === wantLast) byName.push(row);
    const em = normName(row.teacher_email);
    if (em && em === wantEmail) byEmail.push(row);
  }
  const uniq = new Map();
  for (const r of byName.concat(byEmail)) uniq.set(String(r.teacher_id), r);
  const hits = [...uniq.values()];
  if (hits.length === 1) return { status: 'exact', row: hits[0] };
  if (hits.length > 1) return { status: 'ambiguous', rows: hits };
  return { status: 'none', row: null };
}

/**
 * Choose Lantern match without inventing merges.
 * Rick special-case: prefer privileged admin username "admin" over rick.radle teacher twin.
 */
export function matchLanternAccount(person, lanternRows) {
  const rows = (lanternRows || []).filter((r) => {
    const role = normName(r.role);
    return role === 'teacher' || role === 'admin';
  });

  if (normName(person.first) === 'rick' && normName(person.last) === 'radle') {
    const primary = rows.find((r) => String(r.username) === 'admin');
    if (primary) {
      const alias = rows.find((r) => normName(r.username) === 'rick.radle' && String(r.username) !== 'admin');
      return {
        row: primary,
        conflictNotes: alias
          ? [`Separate Lantern username "rick.radle" (staff_id=${alias.staff_id}, role=${alias.role}) exists — not merged; privileged admin stays "admin".`]
          : [],
      };
    }
  }

  const byUser = rows.filter((r) => normName(r.username) === normName(person.username));
  if (byUser.length === 1) return { row: byUser[0], conflictNotes: [] };
  if (byUser.length > 1) {
    return { row: null, conflictNotes: ['Multiple Lantern rows share expected username'], conflict: true };
  }

  const byEmail = rows.filter((r) => r.email && normName(r.email) === normName(person.email));
  if (byEmail.length === 1) return { row: byEmail[0], conflictNotes: [] };
  if (byEmail.length > 1) {
    return { row: null, conflictNotes: ['Multiple Lantern rows share expected email'], conflict: true };
  }

  const byName = rows.filter(
    (r) => normName(r.first_name) === normName(person.first) && normName(r.last_name) === normName(person.last)
  );
  if (byName.length === 1) return { row: byName[0], conflictNotes: [] };
  if (byName.length > 1) {
    return { row: null, conflictNotes: ['Multiple Lantern rows share first+last'], conflict: true };
  }

  // Display-name exact for legacy rows missing first/last (e.g. pre-setup).
  const byDisplay = rows.filter((r) => normName(r.display_name) === normName(person.display));
  if (byDisplay.length === 1 && (!byDisplay[0].first_name || !byDisplay[0].last_name)) {
    return { row: byDisplay[0], conflictNotes: [] };
  }

  return { row: null, conflictNotes: [] };
}

export function planPerson(person, lanternRows, tmsRows, links) {
  const lanternMatch = matchLanternAccount(person, lanternRows);
  const tmsMatch = matchTmsStaff(person, tmsRows);
  const existingLink = (links || []).find(
    (l) =>
      (lanternMatch.row && normName(l.lantern_username) === normName(lanternMatch.row.username)) ||
      (tmsMatch.row && String(l.tms_staff_id) === String(tmsMatch.row.teacher_id))
  );

  /** @type {'CREATE'|'UPDATE'|'UNCHANGED'|'CONFLICT'} */
  let action = 'CREATE';
  const notes = [...(lanternMatch.conflictNotes || [])];

  if (lanternMatch.conflict) {
    action = 'CONFLICT';
  } else if (lanternMatch.row) {
    const row = lanternMatch.row;
    const isPrivilegedAdmin = String(row.username) === 'admin';
    const needFirst = !isPrivilegedAdmin && (!row.first_name || normName(row.first_name) !== normName(person.first));
    const needLast = !isPrivilegedAdmin && (!row.last_name || normName(row.last_name) !== normName(person.last));
    const needDisplay =
      person.display && normName(row.display_name) !== normName(person.display) &&
      // Never rename privileged admin display away from Web Admin via Jackie-style override.
      !isPrivilegedAdmin;
    // For matched rows, keep display_name if already set and names will compose the same; Jackie display is intentional.
    const wantDisplay = person.display;
    const composed = `${person.first} ${person.last}`.trim();
    const displayTarget = wantDisplay || composed;
    const needDisp =
      isPrivilegedAdmin
        ? false
        : normName(row.display_name) !== normName(displayTarget);
    const needEmail = !row.email || normName(row.email) !== normName(person.email);
    // Username rename is never applied automatically.
    if (normName(row.username) !== normName(person.username) && isPrivilegedAdmin) {
      notes.push('Username left as "admin" (expected rick.radle not applied — preserves sessions/TMS link).');
    } else if (normName(row.username) !== normName(person.username)) {
      notes.push(`Existing username "${row.username}" differs from expected "${person.username}" — username not renamed.`);
    }
    if (needFirst || needLast || needDisp || needEmail) action = 'UPDATE';
    else action = 'UNCHANGED';

    // If expected email taken by another username → CONFLICT on email write
    const emailOwner = (lanternRows || []).find(
      (r) => r.email && normName(r.email) === normName(person.email) && normName(r.username) !== normName(row.username)
    );
    if (needEmail && emailOwner) {
      action = 'CONFLICT';
      notes.push(`Email ${person.email} already on username ${emailOwner.username}`);
    }
  } else {
    const userTaken = (lanternRows || []).find((r) => normName(r.username) === normName(person.username));
    const emailTaken = (lanternRows || []).find((r) => r.email && normName(r.email) === normName(person.email));
    if (userTaken || emailTaken) {
      action = 'CONFLICT';
      if (userTaken) notes.push(`Username taken by ${userTaken.username}`);
      if (emailTaken) notes.push(`Email taken by ${emailTaken.username}`);
    } else {
      action = 'CREATE';
    }
  }

  let linkAction = 'none';
  let linkTarget = null;
  if (tmsMatch.status === 'exact') {
    linkTarget = tmsMatch.row;
    const lanternUser = lanternMatch.row ? String(lanternMatch.row.username) : person.username;
    // For CREATE, link username will be expected username after create.
    const finalUser = action === 'CREATE' ? person.username : lanternUser;
    // Privileged Rick admin stays linked as admin
    const linkUser = String(lanternMatch.row && String(lanternMatch.row.username) === 'admin' ? 'admin' : finalUser);
    if (existingLink) {
      if (
        String(existingLink.tms_staff_id) === String(tmsMatch.row.teacher_id) &&
        normName(existingLink.lantern_username) === normName(linkUser)
      ) {
        linkAction = 'unchanged';
      } else {
        linkAction = 'conflict';
        notes.push(
          `Existing TMS link ${existingLink.tms_staff_id}→${existingLink.lantern_username} conflicts with ${tmsMatch.row.teacher_id}→${linkUser}`
        );
        if (action !== 'CONFLICT') {
          /* keep account action; skip link */
        }
      }
    } else {
      // Ensure neither side already linked elsewhere
      const tmsBusy = (links || []).find((l) => String(l.tms_staff_id) === String(tmsMatch.row.teacher_id));
      const userBusy = (links || []).find((l) => normName(l.lantern_username) === normName(linkUser));
      if (tmsBusy || userBusy) {
        linkAction = 'conflict';
        notes.push('TMS link sides already used — left unlinked');
      } else if (action !== 'CONFLICT') {
        linkAction = 'create';
      }
    }
  } else if (tmsMatch.status === 'ambiguous') {
    linkAction = 'ambiguous';
    notes.push('Ambiguous TMS matches — left unlinked');
  } else {
    linkAction = 'unmatched';
  }

  return {
    person,
    action,
    notes,
    lantern: lanternMatch.row || null,
    tms: tmsMatch,
    linkAction,
    linkTarget,
    existingLink: existingLink || null,
  };
}

export function buildApplySql(plans) {
  const stmts = [];
  stmts.push(`-- Prompt #170 staff import generated ${new Date().toISOString()}`);

  for (const p of plans) {
    if (p.action === 'CONFLICT') continue;
    const person = p.person;
    const display = person.display || `${person.first} ${person.last}`;

    if (p.action === 'CREATE') {
      stmts.push('INSERT INTO lantern_staff_id_alloc DEFAULT VALUES;');
      stmts.push(
        `INSERT INTO lantern_pilot_accounts (
          username, display_name, first_name, last_name, staff_id, email, role,
          password_hash, password_salt, student_character_name, teacher_id, mtss_student_id,
          updated_at, is_active, must_change_password, password_reset_at, password_reset_by
        ) VALUES (
          ${sqlStr(person.username)},
          ${sqlStr(display)},
          ${sqlStr(person.first)},
          ${sqlStr(person.last)},
          (SELECT MAX(id) FROM lantern_staff_id_alloc),
          ${sqlStr(person.email)},
          'teacher',
          NULL, NULL, NULL, NULL, NULL,
          datetime('now'), 1, 0, NULL, NULL
        );`
      );
    } else if (p.action === 'UPDATE' && p.lantern) {
      const u = String(p.lantern.username);
      // Preserve role, password, must_change_password, staff_id, is_active.
      if (u === 'admin') {
        stmts.push(
          `UPDATE lantern_pilot_accounts
           SET email = ${sqlStr(person.email)},
               updated_at = datetime('now')
           WHERE username = ${sqlStr(u)};`
        );
      } else {
        stmts.push(
          `UPDATE lantern_pilot_accounts
           SET first_name = ${sqlStr(person.first)},
               last_name = ${sqlStr(person.last)},
               display_name = ${sqlStr(display)},
               email = ${sqlStr(person.email)},
               updated_at = datetime('now')
           WHERE username = ${sqlStr(u)};`
        );
      }
    }

    if (p.linkAction === 'create' && p.linkTarget) {
      const linkUser =
        p.lantern && String(p.lantern.username) === 'admin'
          ? 'admin'
          : p.action === 'CREATE'
            ? person.username
            : String(p.lantern.username);
      stmts.push(
        `INSERT INTO tms_identity_links (tms_staff_id, lantern_username, created_at, created_by)
         SELECT ${sqlStr(p.linkTarget.teacher_id)}, ${sqlStr(linkUser)}, datetime('now'), ${sqlStr(CREATED_BY)}
         WHERE NOT EXISTS (SELECT 1 FROM tms_identity_links WHERE tms_staff_id = ${sqlStr(p.linkTarget.teacher_id)})
           AND NOT EXISTS (SELECT 1 FROM tms_identity_links WHERE lower(trim(lantern_username)) = lower(trim(${sqlStr(linkUser)})));`
      );
    }
  }

  return stmts.join('\n');
}

function printTable(plans) {
  console.log('\nName | Expected username | Expected email | Lantern match | TMS match | Action');
  console.log('-'.repeat(120));
  for (const p of plans) {
    const lm = p.lantern ? `${p.lantern.username} (id=${p.lantern.staff_id || '—'}, ${p.lantern.role})` : '—';
    let tm = '—';
    if (p.tms.status === 'exact') tm = `${p.tms.row.teacher_id} / ${p.tms.row.teacher_name}`;
    else if (p.tms.status === 'ambiguous') tm = 'AMBIGUOUS';
    else tm = 'none';
    console.log(
      `${p.person.display} | ${p.person.username} | ${p.person.email} | ${lm} | ${tm} | ${p.action}` +
        (p.linkAction && p.linkAction !== 'none' ? ` [link:${p.linkAction}]` : '')
    );
    for (const n of p.notes || []) console.log(`  note: ${n}`);
  }
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const live = args.has('--live');
  const apply = args.has('--apply');
  const useSnap = args.has('--snapshot') || live || apply;
  if (!useSnap) {
    console.log('Pass --live or --snapshot to reconcile. Static roster size:', REAL_STAFF_ROSTER.length);
    const jackie = REAL_STAFF_ROSTER.find((p) => p.username === 'je.lynn');
    const theresa = REAL_STAFF_ROSTER.find((p) => p.username === 'theresa.sanchez');
    if (!jackie || jackie.email !== `je.lynn@${EMAIL_DOMAIN}`) throw new Error('Jackie mapping broken');
    if (!theresa) throw new Error('Theresa mapping broken');
    console.log('Jackie exception OK; Theresa username OK.');
    return;
  }

  const scriptsDir = __dirname;
  if (live) {
    console.log('Refreshing production snapshots…');
    refreshSnapshots();
  }

  const lanternRows = readSnap(path.join(scriptsDir, '_snap_lantern_staff.json'));
  const links = readSnap(path.join(scriptsDir, '_snap_links.json'));
  const tms = readSnap(path.join(scriptsDir, '_snap_tms_staff.json'));
  console.log(`Loaded snapshots: lantern=${lanternRows.length} tms=${tms.length} links=${links.length}`);

  const plans = REAL_STAFF_ROSTER.map((person) => planPerson(person, lanternRows, tms, links));
  printTable(plans);

  const counts = { CREATE: 0, UPDATE: 0, UNCHANGED: 0, CONFLICT: 0 };
  for (const p of plans) counts[p.action] += 1;
  console.log('\nAction counts:', counts);
  console.log(
    'Link create:',
    plans.filter((p) => p.linkAction === 'create').length,
    'unchanged:',
    plans.filter((p) => p.linkAction === 'unchanged').length,
    'unmatched:',
    plans.filter((p) => p.linkAction === 'unmatched').length,
    'ambiguous:',
    plans.filter((p) => p.linkAction === 'ambiguous').length,
    'conflict:',
    plans.filter((p) => p.linkAction === 'conflict').length
  );

  const sql = buildApplySql(plans);
  const outSql = path.join(scriptsDir, 'import-real-staff-170.apply.sql');
  fs.writeFileSync(outSql, sql, 'utf8');
  console.log('Wrote', outSql);

  if (!apply) {
    console.log('\nDry-run only. Re-run with --snapshot --apply (or --live --apply) after reviewing CONFLICT rows.');
    return;
  }

  const conflicts = plans.filter((p) => p.action === 'CONFLICT');
  if (conflicts.length) {
    console.error('CONFLICT rows skipped in SQL:', conflicts.map((c) => c.person.display).join(', '));
  }

  console.log('Applying SQL to lantern-db…');
  const result = d1File('lantern-db', outSql, workerDir);
  console.log(result.slice(-800));

  console.log('Refreshing after-apply snapshots…');
  refreshSnapshots();
  const after = readSnap(path.join(scriptsDir, '_snap_lantern_staff.json'));
  const afterLinks = readSnap(path.join(scriptsDir, '_snap_links.json'));
  console.log('After staff/admin count:', after.length);
  console.log('After links:', afterLinks.length);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
