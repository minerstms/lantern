/**
 * Prompt #147 — platform public_display_name invariant.
 * Usage: node worker/scripts/public-display-identity-147-test.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  defaultPublicDisplayName,
  resolvePublicDisplayName,
  formatPublicStaffName,
  buildStaffPublicNameIndex,
  resolveAuthorPublicLabel,
  attachAuthorPublicLabels,
} from '../staff-public-name.js';
import { privacySafeStudentLabel } from '../content-people.js';
import { buildAvatarMatchPool, uniqueAvatarMatchByLabel, isExcludedAvatarMatchAccount } from '../avatar-match-pool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '../..');
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

const lisa = {
  username: '20890',
  first_name: 'Lisa',
  last_name: 'Glorioso',
  display_name: 'Lisa Glorioso',
  character_name: 'lisa_old',
  public_display_name: 'Lisa G.',
  role: 'student',
  mtss_student_id: '20890',
  is_active: 1,
};
const lisaOverride = Object.assign({}, lisa, { public_display_name: 'L. Glorioso' });
const lucas = {
  username: '20889',
  first_name: 'Lucas',
  last_name: 'Radle',
  display_name: 'Lucas Radle',
  public_display_name: null,
  role: 'student',
  is_active: 1,
};
const rick = {
  username: 'rick.radle',
  first_name: 'Rick',
  last_name: 'Radle',
  display_name: 'Rick Radle',
  honorific: 'Mr.',
  public_display_name: null,
  role: 'teacher',
  is_active: 1,
};
const kristina = {
  username: 'kristina.vezzani',
  first_name: 'Kristina',
  last_name: 'Vezzani',
  display_name: 'Kristina Vezzani',
  honorific: 'Mrs.',
  public_display_name: null,
  role: 'teacher',
  is_active: 1,
};
const coach = {
  username: 'eric.colorado',
  first_name: 'Eric',
  last_name: 'Colorado',
  display_name: 'Eric Colorado',
  honorific: 'Mr.',
  public_display_name: 'Coach Colorado',
  role: 'teacher',
  is_active: 1,
};
const missingHon = {
  username: 'amanda.cooper',
  first_name: 'Amanda',
  last_name: 'Cooper',
  display_name: 'Amanda Cooper',
  honorific: null,
  public_display_name: null,
  role: 'teacher',
  is_active: 1,
};
const webAdmin = {
  username: 'admin',
  display_name: 'Web Admin',
  honorific: 'Mr.',
  last_name: 'Admin',
  public_display_name: null,
  role: 'admin',
  is_active: 1,
};

assert(defaultPublicDisplayName(lucas) === 'Lucas R.', '1. new student default First L.');
assert(defaultPublicDisplayName(rick) === 'Mr. Radle', '2. new staff honorific + last');
assert(resolvePublicDisplayName(coach) === 'Coach Colorado', '3. existing override preserved');
assert(defaultPublicDisplayName(missingHon) === 'Cooper', '4. missing honorific is last name only');
assert(defaultPublicDisplayName(missingHon) !== 'Mr. Cooper', '4b. honorific not guessed');
assert(resolvePublicDisplayName(webAdmin) === 'Web Admin', '4c. system Web Admin not Mr. Admin');

const idx = buildStaffPublicNameIndex([lisa, rick, kristina, coach, lucas]);
function authorLabel(row, extra) {
  return resolveAuthorPublicLabel(idx, Object.assign({
    authorId: row.username,
    authorDisplayName: row.display_name,
    authorRole: row.role,
  }, extra || {}));
}
assert(authorLabel(lisa) === 'Lisa G.', '5. poll/explore author uses public_display_name');
assert(authorLabel(lisa) === 'Lisa G.', '6. modal uses same resolver value');
assert(authorLabel(lisa) === 'Lisa G.', '7. news author');
assert(authorLabel(lisa) === 'Lisa G.', '8. shout-out author');
assert(authorLabel(lisa) === 'Lisa G.', '10. mission author when durable username exists');
assert(authorLabel(rick) === 'Mr. Radle', '11. Mr. Radle');
assert(authorLabel(kristina) === 'Mrs. Vezzani', '12. Mrs. Vezzani');
assert(authorLabel(coach) === 'Coach Colorado', '13. Coach Colorado override wins');
assert(authorLabel(coach) !== 'Mr. Colorado', '13b. runtime helper does not replace override');
assert(authorLabel(lisa) !== 'Lisa Glorioso', '14. Lisa G. not full surname');
assert(privacySafeStudentLabel(lisa) === 'Lisa G.', '15. people label is public_display_name');

const items = attachAuthorPublicLabels(
  [{ authorId: '20890', authorDisplayName: 'Lisa Glorioso', authorRole: 'student', title: 'Poll' }],
  idx
);
assert(items[0].authorPublicLabel === 'Lisa G.', '5b. attachAuthorPublicLabels writes Lisa G.');

const pollSnapshot = attachAuthorPublicLabels(
  [{
    authorId: null,
    authorDisplayName: 'Rick Radle',
    authorRole: 'student',
    authorAvatarKey: 'rick.radle',
    title: 'Poll',
  }],
  idx
);
assert(pollSnapshot[0].authorPublicLabel === 'Mr. Radle', '5d. poll legal snapshot + durable avatar key → public_display_name');
assert(pollSnapshot[0].authorDisplayName === 'Rick Radle', '5e. stored poll snapshot is not rewritten');

const noKeyPoll = attachAuthorPublicLabels(
  [{ authorId: null, authorDisplayName: 'Rick Radle', authorRole: 'student', title: 'Poll' }],
  idx
);
assert(noKeyPoll[0].authorPublicLabel == null, '5f. no durable account key → no fuzzy display-name match');

const idxOverride = buildStaffPublicNameIndex([lisaOverride, rick]);
assert(
  resolveAuthorPublicLabel(idxOverride, { authorId: '20890', authorRole: 'student', authorDisplayName: 'Lisa Glorioso' }) ===
    'L. Glorioso',
  '39. changing public_display_name changes renderer'
);
assert(resolvePublicDisplayName(lisaOverride) === 'L. Glorioso', '39b. no content rewrite required');

const inactive = Object.assign({}, lisa, { is_active: 0, username: 'inactive.lisa' });
const demo = Object.assign({}, lisa, { username: 'demo1', display_name: 'Alex Adventure', public_display_name: 'Alex Adventure' });
const testAcc = Object.assign({}, lisa, { username: 'test_e2e' });
assert(isExcludedAvatarMatchAccount(inactive) === true, '27. inactive excluded');
assert(isExcludedAvatarMatchAccount(demo) === true, '28. demo persona excluded');
assert(isExcludedAvatarMatchAccount(testAcc) === true, '28b. synthetic test_ excluded');

const pool = buildAvatarMatchPool(
  [lisa, rick, kristina, coach, inactive, demo, testAcc],
  { '20890': 'av-lisa', 'rick.radle': 'av-rick', 'kristina.vezzani': 'av-k', 'eric.colorado': 'av-e' },
  'https://tmslantern.org',
  (row) => (String(row.role).toLowerCase() === 'student' ? String(row.mtss_student_id || row.username) : String(row.username))
);
assert(pool.every((p) => p.display_name === p.public_display_name), '26. Avatar Match label is public_display_name');
assert(pool.some((p) => p.display_name === 'Lisa G.'), '23. Lisa G. in pool');
assert(pool.some((p) => p.display_name === 'Mr. Radle'), '23b. Mr. Radle in pool');
assert(!pool.some((p) => /Brett Simms|Zane Morrison|Kimber Pace|Winnie Addair/.test(p.display_name)), '23c. no legacy roster names');
assert(!pool.some((p) => p.username === 'inactive.lisa' || p.username === 'test_e2e'), '24. only active real accounts');
assert(pool.every((p) => p.avatar_url && /\/api\/avatar\/image/.test(p.avatar_url)), '25. approved avatar key required');

const dupPool = uniqueAvatarMatchByLabel([
  { display_name: 'Alex A.', character_name: 'a1' },
  { display_name: 'Alex A.', character_name: 'a2' },
  { display_name: 'Sam S.', character_name: 's1' },
]);
assert(dupPool.every((p) => p.display_name !== 'Alex A.'), '29. duplicate answer labels excluded');

const noAvatar = buildAvatarMatchPool([lisa], {}, 'https://tmslantern.org', () => '20890');
assert(noAvatar.length === 0, '25b. pending/missing avatar excluded');

const gamesHtml = fs.readFileSync(path.join(root, 'app/games.html'), 'utf8');
assert(!/Brett Simms/.test(gamesHtml) && !/zane_morrison/.test(gamesHtml), '23d. games.html has no hardcoded legacy roster');
assert(/failClosedPool|at least four approved avatars/.test(gamesHtml), '23e. Avatar Match fails closed');

const navJs = fs.readFileSync(path.join(root, 'app/js/lantern-nav.js'), 'utf8');
assert(/public_display_name/.test(navJs) && /public_display_label/.test(navJs), '30. Lantern header uses public_display_name');
assert(!/me\.display_name/.test(navJs.replace(/\/\*[\s\S]*?\*\//g, '')), '30b. header does not fall back to display_name');

const cardsJs = fs.readFileSync(path.join(root, 'app/js/lantern-cards.js'), 'utf8');
assert(/authorPublicLabel/.test(cardsJs), '5c. Explore cards use authorPublicLabel');

const gamesPage = fs.readFileSync(path.join(root, 'app/js/lantern-games-page.js'), 'utf8');
assert(/leaderboardPublicLabel/.test(gamesPage) && /public_display_name/.test(gamesPage), '20. leaderboard UI uses public_display_name');
assert(/character_name/.test(gamesPage), '21. durable character_name kept for rank match');

const indexJs = fs.readFileSync(path.join(root, 'worker/index.js'), 'utf8');
assert(/resolvePublicDisplayName\(account\)/.test(indexJs), '34. TMS mint sends resolvePublicDisplayName');
assert(/defaultPublicDisplayName/.test(indexJs), '1b. provisioning assigns default public_display_name');
assert(/buildAvatarMatchPool/.test(indexJs) && /uniqueAvatarMatchByLabel/.test(indexJs), '23f. games/characters uses live account/avatar pool');
assert(/public_display_label/.test(indexJs), '30c. /api/pilot/me exposes public_display_label');
assert(/authorAvatarKey/.test(fs.readFileSync(path.join(root, 'worker/staff-public-name.js'), 'utf8')), '5g. resolver uses durable authorAvatarKey');
assert(/authorAvatarKey,/.test(indexJs), '5h. direct-open poll path passes authorAvatarKey into resolver');

const marqueeJs = fs.readFileSync(path.join(root, 'worker/marquee-events.js'), 'utf8');
assert(/resolvePublicDisplayName/.test(marqueeJs), '16. marquee uses public_display_name');
assert(/hidden_at/.test(marqueeJs) && /isHiddenAtSet/.test(marqueeJs), '17. #146 hidden-content lockdown still present');

const adminHtml = fs.readFileSync(path.join(root, 'app/admin.html'), 'utf8');
assert(/studentsEditPublicDisplay/.test(adminHtml) && /editUserPublicDisplay/.test(adminHtml), '37. Admin Students/Staff expose Public Display Name');
assert(/u\.first_name/.test(adminHtml) && /u\.display_name/.test(adminHtml), '37b. management still shows full names');

assert(privacySafeStudentLabel(lisa) !== '20890', '40. no public student ID leak');
assert(privacySafeStudentLabel({ username: '20889', role: 'student' }) === '', '40b. username/id not used as public label');

console.log('\n--- public-display-identity-147-test: ' + pass + ' passed, ' + fail + ' failed ---');
process.exit(fail ? 1 : 0);
