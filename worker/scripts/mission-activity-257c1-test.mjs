/**
 * Prompt #257C1 — global mission eligibility + admin coverage tests.
 * Usage: node worker/scripts/mission-activity-257c1-test.mjs
 */
import {
  isGlobalStudentFacingMission,
  isPublishedGlobalMission,
  classifyMissionEvidenceKind,
  missionProvenance,
} from '../global-mission-eligibility.js';
import { buildActivitiesAdminPayload, patchGlobalMissionActivity } from '../activity-admin.js';
import { resolveEconomyAmount } from '../nugget-economy-settings.js';

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

const STEM = {
  id: 'tmission_1773763739628_hhzqrr',
  title: 'STEM Today',
  teacher_id: 'mr_radle',
  teacher_name: 'Mr. Radle',
  audience: 'school_mission',
  active: 1,
  archived: 0,
  submission_type: 'image_url',
  min_characters: 40,
  reward_amount: 1,
  allows_image: 1,
  allows_text: 1,
};

const PRIVATE = {
  id: 'tmission_private_1',
  title: 'Class-only mission',
  teacher_id: 't_carter',
  teacher_name: 'Ms. Carter',
  audience: 'selected_students',
  target_character_names: '["20889"]',
  active: 1,
  archived: 0,
  submission_type: 'text',
  min_characters: 100,
  reward_amount: 1,
};

const PERM = {
  id: 'perm_thank_you',
  title: 'Thank a Teacher',
  teacher_id: 'mr_radle',
  teacher_name: 'Mr. Radle',
  audience: 'school_mission',
  active: 1,
  archived: 0,
  submission_type: 'confirmation',
  min_characters: 10,
  reward_amount: 1,
};

if (isGlobalStudentFacingMission(STEM) && isGlobalStudentFacingMission(PERM) && !isGlobalStudentFacingMission(PRIVATE)) {
  ok('eligibility: school_mission includes tmission_* and perm_*; excludes selected_students');
} else bad('eligibility mix');

if (isPublishedGlobalMission(STEM) && !isPublishedGlobalMission({ ...STEM, active: 0 })) {
  ok('published requires active + unarchived');
} else bad('published');

if (missionProvenance(STEM).label === 'Created by Mr. Radle' && missionProvenance(PERM).label === 'System / Global') {
  ok('provenance labels');
} else bad('provenance', { stem: missionProvenance(STEM), perm: missionProvenance(PERM) });

if (
  classifyMissionEvidenceKind(PERM, 'event') === 'verified_activity' &&
  classifyMissionEvidenceKind(STEM, 'submission') === 'submission' &&
  classifyMissionEvidenceKind({ id: 'perm_handbook_trivia', submission_type: 'confirmation' }, 'trivia') === 'verified_activity'
) {
  ok('evidence classification submission vs verified');
} else bad('evidence kind');

function makeDb(missions) {
  const rows = { ...missions };
  const settings = {};
  return {
    prepare(sql) {
      const s = String(sql);
      const binds = [];
      const api = {
        bind(...args) {
          binds.push(...args);
          return api;
        },
        async first() {
          if (s.includes('FROM lantern_settings WHERE key')) {
            const v = settings[binds[0]];
            return v != null ? { value: v } : null;
          }
          if (s.includes('FROM lantern_missions WHERE id = ?')) {
            const row = rows[binds[0]];
            if (!row) return null;
            if (s.includes('SELECT id, allows_image FROM lantern_missions WHERE id = ?')) {
              return { id: row.id, allows_image: row.allows_image || 0 };
            }
            return { ...row };
          }
          return null;
        },
        async all() {
          if (s.includes('FROM lantern_missions') && s.includes('school_mission')) {
            return {
              results: Object.values(rows).filter((r) => isGlobalStudentFacingMission(r)),
            };
          }
          return { results: [] };
        },
        async run() {
          if (s.includes('UPDATE lantern_missions SET')) {
            const id = binds[binds.length - 1];
            const row = rows[id];
            if (!row) return { meta: { changes: 0 } };
            const setPart = s.split('UPDATE lantern_missions SET ')[1].split(' WHERE')[0];
            const fields = setPart.split(',').map((f) => f.trim().split('=')[0].trim());
            for (let i = 0; i < fields.length; i++) row[fields[i]] = binds[i];
            return { meta: { changes: 1 } };
          }
          if (s.includes('INSERT INTO lantern_settings')) {
            settings[binds[0]] = binds[1];
            return { success: true };
          }
          return { success: true };
        },
      };
      return api;
    },
  };
}

const db = makeDb({
  perm_thank_you: { ...PERM },
  tmission_1773763739628_hhzqrr: { ...STEM },
  tmission_private_1: { ...PRIVATE },
});

const payload = await buildActivitiesAdminPayload(db, 'https://x');
const titles = (payload.missions || []).map((m) => m.title);
if (titles.includes('STEM Today') && titles.includes('Thank a Teacher') && !titles.includes('Class-only mission')) {
  ok('admin payload includes STEM Today + perm; excludes private scoped mission');
} else bad('admin inventory', titles);

const stemRow = payload.missions.find((m) => m.id === STEM.id);
if (stemRow && stemRow.provenance.label === 'Created by Mr. Radle' && stemRow.evidence_kind === 'submission') {
  ok('STEM Today provenance + submission kind');
} else bad('STEM row', stemRow);

const stemPatch = await patchGlobalMissionActivity(db, STEM.id, { min_characters: 500, reward_amount: 5 }, 'Admin', 'https://x');
if (stemPatch.ok && stemPatch.activity.min_characters === 500 && stemPatch.activity.reward_amount === 5) {
  ok('admin can patch teacher-created global STEM Today');
} else bad('STEM patch', stemPatch);

const privatePatch = await patchGlobalMissionActivity(db, PRIVATE.id, { reward_amount: 3 }, 'Admin', 'https://x');
if (!privatePatch.ok && privatePatch.error === 'not_global_mission') {
  ok('private selected_students mission rejected from admin patch');
} else bad('private patch should fail', privatePatch);

const emptyDb = makeDb({});
const gameWinDefault = await resolveEconomyAmount(emptyDb, 'game_win');
if (gameWinDefault === 0) ok('game_win default is 0');
else bad('game_win default', gameWinDefault);

console.log('\nmission-activity-257c1-test: ' + pass + ' PASS ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
