/**
 * Global production guard — fake/test user capability must not ship in active runtime paths.
 * Usage: node worker/scripts/lantern-fake-user-guard.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const EXCLUDE_DIR_NAMES = new Set([
  'node_modules',
  '.git',
  'locker-sources',
]);

const EXCLUDE_PATH_PREFIXES = [
  'docs/archive/',
  'archive/verify-page/',
  'app/assets/know-your-town/',
];

const EXCLUDE_FILES = new Set([
  'worker/scripts/lantern-fake-user-guard.mjs',
  'worker/scripts/locker-fake-guard.mjs',
  'app/build-locker.cjs',
  // Prompt #97: this module's entire purpose is the opposite of what this guard checks for — it
  // is the single, sanctioned exclusion list used to KEEP these known demo/fake persona names OUT
  // of production-facing list responses (ticker, news, recognition, Explore feed). See
  // worker/demo-persona-guard.js for the production filter this guard's names feed into.
  'worker/demo-persona-guard.js',
]);

const EXCLUDE_SUFFIXES = ['-test.mjs', '-guard.mjs'];

const SCAN_EXTENSIONS = new Set(['.html', '.js', '.mjs', '.css']);

const RULES = [
  { id: 'persona_alex', pattern: 'Alex Adventure' },
  { id: 'persona_sam', pattern: 'Sam Star' },
  { id: 'persona_jordan', pattern: 'Jordan Joy' },
  { id: 'persona_casey', pattern: 'Casey Cool' },
  { id: 'persona_riley', pattern: 'Riley Rise' },
  { id: 'create_test_student', pattern: 'Create Test Student' },
  { id: 'switch_student', pattern: 'Switch Student' },
  { id: 'adopt_char_btn', pattern: 'adopt-char-btn' },
  { id: 'sim_student_param', pattern: 'simStudent=' },
  { id: 'sim_student_query', pattern: "params.get('simStudent')" },
  { id: 'sim_student_forbidden', pattern: "params.get(\"simStudent\")" },
  { id: 'test_students_fetch', pattern: "/api/test-students'" },
  { id: 'test_students_fetch_dq', pattern: '/api/test-students"' },
  { id: 'handle_test_student_routes', pattern: 'handleTestStudentRoutes' },
  { id: 'insert_test_students', pattern: 'INSERT INTO lantern_test_students' },
  { id: 'set_adopted_character', pattern: "setItem('LANTERN_ADOPTED_CHARACTER'" },
  { id: 'set_adopted_character_dq', pattern: 'setItem("LANTERN_ADOPTED_CHARACTER"' },
  { id: 'get_adopted_character', pattern: "getItem('LANTERN_ADOPTED_CHARACTER'" },
  { id: 'get_adopted_character_dq', pattern: 'getItem("LANTERN_ADOPTED_CHARACTER"' },
  { id: 'client_achievement_unlock_route', pattern: "/api/locker/achievements/unlock'" },
  { id: 'client_achievement_unlock_route_dq', pattern: '/api/locker/achievements/unlock"' },
  { id: 'call_unlock_achievement', pattern: 'callUnlockAchievement(' },
  { id: 'ls_achievements_write', pattern: "setItem('LANTERN_ACHIEVEMENTS'" },
  { id: 'ls_achievements_write_dq', pattern: 'setItem("LANTERN_ACHIEVEMENTS"' },
  { id: 'ls_cosmetic_ownership_write', pattern: "setItem('LANTERN_COSMETIC_OWNERSHIP'" },
  { id: 'ls_cosmetic_ownership_write_dq', pattern: 'setItem("LANTERN_COSMETIC_OWNERSHIP"' },
];

function normalizeRel(p) {
  return p.replace(/\\/g, '/');
}

function shouldExclude(rel) {
  if (EXCLUDE_FILES.has(rel)) return true;
  for (const prefix of EXCLUDE_PATH_PREFIXES) {
    if (rel.startsWith(prefix)) return true;
  }
  for (const suffix of EXCLUDE_SUFFIXES) {
    if (rel.endsWith(suffix)) return true;
  }
  if (rel.includes('/migrations/') || rel.startsWith('worker/migrations/')) return true;
  return false;
}

function walk(dir, out) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (_) {
    return;
  }
  for (const ent of entries) {
    if (EXCLUDE_DIR_NAMES.has(ent.name)) continue;
    const abs = path.join(dir, ent.name);
    const rel = normalizeRel(path.relative(root, abs));
    if (shouldExclude(rel)) continue;
    if (ent.isDirectory()) {
      if (rel === 'app' || rel === 'worker' || rel.startsWith('app/') || rel.startsWith('worker/')) {
        walk(abs, out);
      }
      continue;
    }
    const ext = path.extname(ent.name).toLowerCase();
    if (!SCAN_EXTENSIONS.has(ext)) continue;
    if (!rel.startsWith('app/') && !rel.startsWith('worker/')) continue;
    out.push(abs);
  }
}

const files = [];
walk(path.join(root, 'app'), files);
walk(path.join(root, 'worker'), files);

const hits = [];
for (const file of files) {
  const rel = normalizeRel(path.relative(root, file));
  if (shouldExclude(rel)) continue;
  const text = fs.readFileSync(file, 'utf8');
  const allowTestStudentsDisableStub =
    rel === 'worker/index.js' && text.includes('test_students_disabled');
  const allowAchievementUnlockRemovalStub =
    rel === 'worker/locker-handlers.js' && text.includes('achievement_unlock_client_forbidden');
  const allowLocalUnlockStub =
    rel === 'app/js/lantern-locker-me.js' && text.includes('achievement_unlock_client_forbidden');
  for (const rule of RULES) {
    if (allowTestStudentsDisableStub && (rule.id === 'test_students_fetch' || rule.id === 'test_students_fetch_dq')) {
      continue;
    }
    if (allowAchievementUnlockRemovalStub && (rule.id === 'client_achievement_unlock_route' || rule.id === 'client_achievement_unlock_route_dq')) {
      continue;
    }
    if (allowLocalUnlockStub && rule.id === 'call_unlock_achievement') {
      continue;
    }
    if (text.includes(rule.pattern)) {
      hits.push({ file: rel, rule: rule.id, pattern: rule.pattern });
    }
  }
}

if (hits.length) {
  console.error('lantern-fake-user-guard FAIL — forbidden fake/test user strings:');
  for (const h of hits) console.error(' ', h.rule, '→', h.file);
  process.exit(1);
}

console.log(
  'lantern-fake-user-guard PASS — 0 forbidden strings (',
  files.length,
  'files scanned; exclusions:',
  [...EXCLUDE_PATH_PREFIXES, ...EXCLUDE_FILES, 'locker-sources/', 'docs/archive/', 'migrations/', '*-test.mjs', '*-guard.mjs'].join(', '),
  ')'
);
