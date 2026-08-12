/**
 * Prompt #11/#15 — built-in mission artwork mapping (stable ids → assets/*.png).
 * Usage: node worker/scripts/mission-built-in-artwork-11-test.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let pass = 0;
let fail = 0;
function ok(m) {
  pass++;
  console.log('PASS', m);
}
function bad(m, d) {
  fail++;
  console.error('FAIL', m, d != null ? d : '');
}
function assert(cond, m, d) {
  if (cond) ok(m);
  else bad(m, d);
}

const cardsJs = fs.readFileSync(path.join(root, 'app/js/lantern-cards.js'), 'utf8');
const missionsHtml = fs.readFileSync(path.join(root, 'app/missions.html'), 'utf8');

const expected = {
  perm_create_something: 'assets/create-something.png',
  perm_daily_checkin: 'assets/daily-check-in.png',
  tmission_1773760134919_yy72fc: 'assets/interview-family.png',
  perm_first_game: 'assets/first-game-played.png',
  tmission_1773676581540_qzl0kx: 'assets/first-photo.png',
  perm_show_something_cool: 'assets/something-cool.png',
  tmission_1773763739628_hhzqrr: 'assets/stem-today.png',
  perm_teach_us_something: 'assets/teach-us.png',
  quick_hidden_nugget: 'assets/hidden-nugget.png',
  perm_create_a_poll: 'assets/make-poll.png',
  perm_explain_something: 'assets/explain-something.png',
  perm_grade_reflection: 'assets/grade-reflection.png',
  tmission_1773626540637_abm6oh: 'assets/help-someone.png',
  tmission_1773860977399_p9ilb3: 'assets/random-kindness.png',
  perm_report_good_news: 'assets/good-news.png',
  perm_thank_you: 'assets/thank-you-letter.png',
  perm_shoutout_someone: 'assets/shout-out-card.png',
};

Object.keys(expected).forEach((id) => {
  const file = expected[id].replace(/^assets\//, '');
  assert(fs.existsSync(path.join(root, 'assets', file)), `asset exists: assets/${file}`);
  assert(fs.existsSync(path.join(root, 'app/assets', file)), `Pages asset exists: app/assets/${file}`);
});

assert(/BUILT_IN_MISSION_COVER_BY_ID/.test(cardsJs), 'central map present in lantern-cards.js');
assert(/builtInMissionCoverUrl/.test(cardsJs) && /missionCoverFallbackUrl/.test(cardsJs), 'cover helpers exported from lantern-cards');
assert(/missionLibraryCoverUrl/.test(missionsHtml), 'missions library uses shared cover helper');
assert(/builtInMissionCoverUrl\('quick_hidden_nugget'\)/.test(missionsHtml), 'Hidden Nugget quick card uses central map');
assert(!/imageUrl:\s*\(m\.card_image_url && String\(m\.card_image_url\)\.trim\(\)\) \|\| 'assets\/thank-you-letter\.png'/.test(missionsHtml), 'thank-you no longer hardcodes one-off imageUrl');

const sandbox = { window: {}, console };
vm.createContext(sandbox);
vm.runInContext(cardsJs.replace(/^\(function \(global\) \{/, '(function (global) {').replace(/\}\)\(typeof window !== 'undefined' \? window : globalThis\);?\s*$/, '})(window);'), sandbox);
const LC = sandbox.window.LanternCards;
assert(LC && typeof LC.builtInMissionCoverUrl === 'function', 'LanternCards.builtInMissionCoverUrl available');

Object.keys(expected).forEach((id) => {
  assert(LC.builtInMissionCoverUrl(id) === expected[id], `map ${id} → ${expected[id]}`);
});
assert(LC.builtInMissionCoverUrl('unknown_mission') === '', 'unknown id returns empty (generic later)');
assert(LC.missionCoverFallbackUrl('unknown_mission') === 'assets/mission-card.png', 'unknown falls back to mission-card');
assert(LC.missionCoverFallbackUrl('perm_thank_you') === 'assets/thank-you-letter.png', 'known id preferred over generic');

// Priority: real image wins over built-in
const withPhoto = LC.resolveCardFaceImageUrlWithFallbacks({
  type: 'mission',
  missionId: 'perm_thank_you',
  imageUrl: 'https://example.com/student.jpg',
});
assert(withPhoto === 'https://example.com/student.jpg', 'submission media wins over built-in');

const builtInOnly = LC.resolveCardFaceImageUrlWithFallbacks({
  type: 'mission',
  missionId: 'perm_create_something',
});
assert(builtInOnly === 'assets/create-something.png', 'built-in used when no media');

const customCardWins = LC.resolveCardFaceImageUrlWithFallbacks({
  type: 'mission',
  missionId: 'perm_create_something',
  imageUrl: 'https://example.com/teacher-custom-card.png',
});
assert(customCardWins === 'https://example.com/teacher-custom-card.png', 'teacher custom card image wins over built-in');

const genericOnly = LC.resolveCardFaceImageUrlWithFallbacks({ type: 'mission', id: 'tmission_custom_xyz' });
assert(genericOnly === 'assets/mission-card.png', 'custom mission without map uses generic cover');

const mapBlock = cardsJs.match(/BUILT_IN_MISSION_COVER_BY_ID[\s\S]*?\};/)[0];
assert(!/reaction-tap-card\.png/.test(mapBlock), 'reaction-tap not mapped as a mission (game art only)');
assert(!/avatar-match-card\.png/.test(mapBlock), 'avatar-match game art not mapped as mission');
assert(!/nugget-click-rush-card\.png/.test(mapBlock), 'nugget-click-rush game art not mapped as mission');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
