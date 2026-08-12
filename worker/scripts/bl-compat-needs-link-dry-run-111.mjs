/**
 * Prompt #111 — DRY-RUN preview for the 12 Needs Link Lantern staff (READ ONLY).
 * No D1 writes. Uses wrangler d1 execute --remote --command (SELECT only).
 *
 * Usage (from lantern repo):
 *   node worker/scripts/bl-compat-needs-link-dry-run-111.mjs
 */
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { compatibilityTeacherIdFromLanternStaffId } from '../tms-compat-provision.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const lanternWorkerDir = path.resolve(__dirname, '..');
const lanternRoot = path.resolve(lanternWorkerDir, '..');
const mtssRoot = path.resolve(lanternRoot, '..', 'mtss-behavior-log');

const NEEDS_LINK = [
  'amanda.cooper',
  'ashleigh.ackerman',
  'ashley.cordova',
  'darcy.dunker',
  'eric.colorado',
  'je.lynn',
  'norma.rice',
  'shanda.vasquez',
  'sherry.garcia',
  'theresa.sanchez',
  'tom.romero',
  'xander.wilson',
];

function runWranglerD1Command(cwd, dbName, sql) {
  // Pass SQL as one shell-quoted argument (Windows-safe via JSON.stringify).
  const cmd =
    'npx.cmd wrangler d1 execute ' +
    dbName +
    ' --remote --json --command ' +
    JSON.stringify(sql);
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

const listSql = NEEDS_LINK.map((u) => "'" + u + "'").join(',');
const lanternSql =
  'SELECT p.username, p.staff_id, p.display_name, p.first_name, p.last_name, p.email, p.role, p.is_active, ' +
  '(SELECT l.tms_staff_id FROM tms_identity_links l WHERE lower(trim(l.lantern_username))=lower(trim(p.username)) LIMIT 1) AS existing_link ' +
  'FROM lantern_pilot_accounts p WHERE lower(trim(p.username)) IN (' +
  listSql +
  ') ORDER BY p.username';

console.log('READ-ONLY dry-run — no writes.\n');

const lanternRows = runWranglerD1Command(lanternWorkerDir, 'lantern-db', lanternSql);
const proposedIds = lanternRows
  .map((r) => compatibilityTeacherIdFromLanternStaffId(r.staff_id))
  .filter(Boolean);

let mtssExisting = new Set();
if (proposedIds.length) {
  const mtssSql =
    'SELECT teacher_id, teacher_name FROM staff WHERE teacher_id IN (' +
    proposedIds.map((id) => "'" + id + "'").join(',') +
    ')';
  try {
    const mtssRows = runWranglerD1Command(mtssRoot, 'mtss-db', mtssSql);
    mtssExisting = new Set(mtssRows.map((r) => String(r.teacher_id)));
  } catch (e) {
    console.warn('MTSS lookup warning:', e.message);
  }
}

const report = [];
for (const u of NEEDS_LINK) {
  const row = lanternRows.find((r) => String(r.username).toLowerCase() === u);
  if (!row) {
    report.push({ username: u, status: 'MISSING_IN_LANTERN' });
    continue;
  }
  const teacherId = compatibilityTeacherIdFromLanternStaffId(row.staff_id);
  const link = row.existing_link ? String(row.existing_link).trim() : '';
  const mtssExists = teacherId ? mtssExisting.has(teacherId) : false;
  let collision = 'none';
  if (link && teacherId && link !== teacherId) {
    collision = 'existing_link_differs(' + link + ')';
  }
  if (!teacherId) collision = 'invalid_staff_id';
  report.push({
    staff_id: row.staff_id,
    username: row.username,
    canonical_display: String(row.display_name || (row.first_name || '') + ' ' + (row.last_name || '')).trim(),
    email: row.email || '',
    proposed_teacher_id: teacherId,
    proposed_capability: 'TEACHER',
    mtss_teacher_id_exists: mtssExists,
    identity_link_exists: !!link,
    existing_link_tms_staff_id: link || null,
    collision_status: collision,
  });
}

console.log(JSON.stringify({ ok: true, dry_run: true, writes: false, count: report.length, accounts: report }, null, 2));
