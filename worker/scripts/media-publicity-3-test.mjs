/**
 * Prompt #3 — Media/Publicity Restriction + external clearance + Hallway eligibility.
 * Usage: node worker/scripts/media-publicity-3-test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isMediaPublicityRestrictedValue,
  studentIdIsRestricted,
  computeExternalAssetFingerprint,
  evaluateHallwayTvEligibility,
  evaluateExternalPublicationEligibility,
  knownRestrictedPeopleFromRows,
  setStudentMediaPublicityRestriction,
  loadRestrictedStudentIdSet,
  recordExternalMediaClearance,
  getExternalMediaClearance,
  assertExternalPublicationAllowed,
} from '../media-publicity.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
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
function assert(cond, msg, detail) {
  if (cond) ok(msg);
  else bad(msg, detail);
}

const migrate071 = fs.readFileSync(path.join(root, 'worker/migrations/071_lantern_media_publicity_restriction.sql'), 'utf8');
const migrate072 = fs.readFileSync(path.join(root, 'worker/migrations/072_lantern_external_media_clearance.sql'), 'utf8');
const adminHtml = fs.readFileSync(path.join(root, 'app/admin.html'), 'utf8');
const teacherHtml = fs.readFileSync(path.join(root, 'app/teacher.html'), 'utf8');
const indexJs = fs.readFileSync(path.join(root, 'worker/index.js'), 'utf8');
const tickerJs = fs.readFileSync(path.join(root, 'app/js/lantern-ticker.js'), 'utf8');
const moduleJs = fs.readFileSync(path.join(root, 'worker/media-publicity.js'), 'utf8');

assert(/media_publicity_restricted/.test(migrate071), '1. additive restriction column');
assert(/DEFAULT 0/.test(migrate071), '2. default Allowed');
assert(/lantern_external_media_clearance/.test(migrate072), '3. clearance table');
assert(/studentsEditMediaPublicity/.test(adminHtml), '4. Admin Media/Publicity control');
assert(/media_restricted/.test(adminHtml), '5. Admin Restricted filter');
assert(/mediaPublicityRestrictionsPanel/.test(teacherHtml), '6. Review Submissions restriction list');
assert(/External Media Check|external-media clearance|reviewExternalMediaClearChk/.test(teacherHtml), '7. external media checkbox UI');
assert(/\/api\/admin\/students\/media-publicity/.test(indexJs), '8. Admin set API');
assert(/\/api\/approvals\/media-publicity-restrictions/.test(indexJs), '9. staff-only list API');
assert(/for_display/.test(indexJs) && /for_display=1/.test(tickerJs), '10. Hallway for_display surface');
assert(/assertExternalPublicationAllowed/.test(moduleJs), '11. YouTube/external helper exported');
assert(!/face.?detect|facial.?recog|biometric/i.test(moduleJs), '12. no facial recognition');
assert(!/parent.?reason|custody|waiver.?text|medical/i.test(moduleJs), '13. no sensitive notes fields');
assert(/FERPA opt-out/i.test(adminHtml) === false, '14. no FERPA opt-out wording in Admin');

assert(isMediaPublicityRestrictedValue(1) === true, '15. restricted=1');
assert(isMediaPublicityRestrictedValue(0) === false, '16. allowed=0');

const set = new Set(['20889']);
assert(studentIdIsRestricted('20889', set), '17. id match');
assert(!studentIdIsRestricted('20999', set), '18. non-restricted');

{
  const people = knownRestrictedPeopleFromRows(
    [
      { person_kind: 'student', person_key: '20889', display_label: 'Jordan S.', relationship: 'tagged' },
      { person_kind: 'staff', person_key: '4', display_label: 'Mr. Radle', relationship: 'tagged' },
      { person_kind: 'student', person_key: '20999', display_label: 'Sam S.', relationship: 'recognized' },
    ],
    set
  );
  assert(people.length === 1 && people[0].person_key === '20889', '19. known restricted from structured people only', people);
}

{
  const hallwayAuthor = evaluateHallwayTvEligibility({
    restrictedSet: set,
    authorStudentIds: ['20889'],
    authorType: 'student',
    knownRestrictedPeople: [],
  });
  assert(hallwayAuthor.hallway_eligible === false, '20. restricted author excluded from Hallway');

  const hallwayTagged = evaluateHallwayTvEligibility({
    restrictedSet: set,
    authorStudentIds: ['20999'],
    authorType: 'student',
    knownRestrictedPeople: [{ person_key: '20889', label: 'Jordan S.' }],
  });
  assert(hallwayTagged.hallway_eligible === false, '21. restricted tagged blocks Hallway');

  const hallwayOk = evaluateHallwayTvEligibility({
    restrictedSet: set,
    authorStudentIds: ['20999'],
    authorType: 'student',
    knownRestrictedPeople: [],
  });
  assert(hallwayOk.hallway_eligible === true, '22. allowed student Hallway eligible');

  const staffAuthor = evaluateHallwayTvEligibility({
    restrictedSet: set,
    authorStudentIds: [],
    authorType: 'teacher',
    knownRestrictedPeople: [],
  });
  assert(staffAuthor.hallway_eligible === true, '23. staff content not blocked by student restriction model');
}

{
  const fp1 = computeExternalAssetFingerprint({ videoKey: 'news/video/a.mp4', peopleKeys: ['20889', 'a'] });
  const fp2 = computeExternalAssetFingerprint({ videoKey: 'news/video/b.mp4', peopleKeys: ['20889', 'a'] });
  assert(fp1 !== fp2, '24. media replace changes fingerprint');

  const blockedKnown = evaluateExternalPublicationEligibility({
    knownRestrictedPeople: [{ person_key: '20889', label: 'Jordan' }],
    authorRestricted: false,
    hasExternalMedia: true,
    clearance: { asset_fingerprint: fp1 },
    assetFingerprint: fp1,
  });
  assert(blockedKnown.external_eligible === false, '25. known restricted subject blocks external');

  const creatorOnly = evaluateExternalPublicationEligibility({
    knownRestrictedPeople: [],
    authorRestricted: true,
    hasExternalMedia: true,
    clearance: { asset_fingerprint: fp1 },
    assetFingerprint: fp1,
  });
  assert(creatorOnly.external_eligible === true, '26. restricted creator alone may be eligible with clearance');

  const missingClear = evaluateExternalPublicationEligibility({
    knownRestrictedPeople: [],
    authorRestricted: false,
    hasExternalMedia: true,
    clearance: null,
    assetFingerprint: fp1,
  });
  assert(missingClear.external_eligible === false && missingClear.reason === 'external_media_clearance_required', '27. missing clearance blocks');

  const stale = evaluateExternalPublicationEligibility({
    knownRestrictedPeople: [],
    authorRestricted: true,
    hasExternalMedia: true,
    clearance: { asset_fingerprint: fp1 },
    assetFingerprint: fp2,
  });
  assert(stale.external_eligible === false, '28. media replacement invalidates clearance');
}

function makeDb(state) {
  state.identities = state.identities || {};
  state.clearance = state.clearance || {};
  state.news = state.news || {};
  state.people = state.people || {};
  function prepare(sql) {
    const s = String(sql);
    const binds = [];
    const api = {
      bind(...args) {
        binds.push(...args);
        return api;
      },
      async first() {
        if (s.includes('FROM lantern_student_identities WHERE lower(trim(character_name))')) {
          const id = String(binds[0] || '').toLowerCase();
          return state.identities[id] || null;
        }
        if (s.includes('FROM lantern_external_media_clearance')) {
          const key = binds[0] + '|' + binds[1];
          return state.clearance[key] || null;
        }
        if (s.includes('FROM lantern_news_submissions WHERE id')) return state.news[binds[0]] || null;
        return null;
      },
      async all() {
        if (s.includes('FROM lantern_student_identities') && s.includes('media_publicity_restricted')) {
          return {
            results: Object.keys(state.identities)
              .filter((k) => Number(state.identities[k].media_publicity_restricted) === 1)
              .map((k) => state.identities[k]),
          };
        }
        if (s.includes('lantern_content_people') || s.includes('FROM lantern_content_people')) {
          return { results: state.people[binds[0] + '|' + binds[1]] || [] };
        }
        return { results: [] };
      },
      async run() {
        if (s.includes('INSERT INTO lantern_student_identities')) {
          const id = String(binds[0]).toLowerCase();
          state.identities[id] = {
            character_name: binds[0],
            display_name: binds[1],
            media_publicity_restricted: binds[3],
            media_publicity_updated_at: binds[4],
            media_publicity_updated_by: binds[5],
          };
        } else if (s.includes('UPDATE lantern_student_identities')) {
          const id = String(binds[binds.length - 1]).toLowerCase();
          if (state.identities[id]) {
            state.identities[id].media_publicity_restricted = binds[0];
            state.identities[id].media_publicity_updated_at = binds[1];
            state.identities[id].media_publicity_updated_by = binds[2];
          }
        } else if (s.includes('INSERT INTO lantern_external_media_clearance')) {
          const key = binds[0] + '|' + binds[1];
          state.clearance[key] = {
            content_kind: binds[0],
            content_id: binds[1],
            cleared_at: binds[2],
            cleared_by: binds[3],
            asset_fingerprint: binds[4],
          };
        }
        return { success: true };
      },
    };
    return api;
  }
  return { prepare };
}

{
  const state = { identities: {} };
  const db = makeDb(state);
  const r1 = await setStudentMediaPublicityRestriction(db, {
    studentId: '20889',
    restricted: true,
    displayName: 'Jordan Smith',
    updatedBy: 'admin:admin',
  });
  assert(r1.ok && r1.media_publicity_restricted === 1, '29. Admin can mark Restricted');
  const r2 = await setStudentMediaPublicityRestriction(db, {
    studentId: '20889',
    restricted: false,
    displayName: 'Jordan Smith',
    updatedBy: 'admin:admin',
  });
  assert(r2.ok && r2.media_publicity_restricted === 0, '30. Admin can return to Allowed');
  const again = await setStudentMediaPublicityRestriction(db, {
    studentId: '20889',
    restricted: true,
    updatedBy: 'admin:admin',
  });
  assert(again.ok, '31. status persists write');
  const loaded = await loadRestrictedStudentIdSet(db);
  assert(loaded.has('20889'), '32. restricted set loads');
}

{
  const state = { clearance: {}, news: { 'news-1': { id: 'news-1', video_r2_key: 'v1', image_r2_key: '', actor_id: '20999', author_name: 'Sam', author_type: 'student' } }, people: {} };
  const db = makeDb(state);
  // Monkey-patch listContentPeople via assert path uses import — use record/get directly
  const fp = computeExternalAssetFingerprint({ videoKey: 'v1', peopleKeys: [] });
  const saved = await recordExternalMediaClearance(db, {
    contentKind: 'news',
    contentId: 'news-1',
    clearedBy: 'Teacher',
    assetFingerprint: fp,
  });
  assert(saved.ok, '33. durable clearance write');
  const got = await getExternalMediaClearance(db, 'news', 'news-1');
  assert(got && got.asset_fingerprint === fp && got.cleared_by === 'Teacher', '34. clearance readable');
}

assert(/No Media\/Publicity Restrictions on file/.test(teacherHtml), '35. empty state copy');
assert(/filterNewsRowsForHallwayTv|filterRecognitionRowsForHallwayTv|filterFeedItemsForHallwayTv/.test(indexJs + fs.readFileSync(path.join(root, 'worker/feed-handlers.js'), 'utf8')), '36. Hallway filters wired');
assert(/youtube|YouTube Unlisted/.test(teacherHtml), '37. YouTube Unlisted labeled in review UI');
assert(!/DELETE FROM lantern_|bucket\.delete|R2.*delete/.test(moduleJs), '38. no destructive media cleanup');

console.log('\nmedia-publicity-3-test:', pass, 'PASS', fail, 'FAIL');
process.exit(fail ? 1 : 0);
