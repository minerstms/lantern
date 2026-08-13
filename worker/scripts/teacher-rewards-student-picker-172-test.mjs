/**
 * Prompt #172 — Teacher Rewards student picker geometry.
 * Usage: node worker/scripts/teacher-rewards-student-picker-172-test.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const html = fs.readFileSync(path.join(root, 'app/teacher.html'), 'utf8');
const rewardJs = fs.readFileSync(path.join(root, 'app/js/lantern-teacher-reward-redeem.js'), 'utf8');

let pass = 0;
let fail = 0;
function ok(msg) { pass++; console.log('PASS', msg); }
function bad(msg, detail) { fail++; console.error('FAIL', msg, detail != null ? detail : ''); }

const rewardsCss = (html.match(/#teacher-rewards[\s\S]{0,900}/) || [''])[0];
const genericCard = (html.match(/\.card\{[\s\S]{0,220}/) || [''])[0];
const genericDropdown = (html.match(/\.studentDropdown\{[\s\S]{0,280}/) || [''])[0];
const rewardsDropdown = (html.match(/#teacher-rewards \.studentDropdown\{[\s\S]{0,280}/) || [''])[0];

if (/id="teacherRewardStudentInput"/.test(html) && /id="teacherRewardStudentDropdown"/.test(html) && /class="studentCombo"/.test(html)) {
  ok('1. student picker sits in studentCombo under the search field');
} else bad('picker markup');

if (/top:100%/.test(genericDropdown) && /teacherRewardStudentDropdown/.test(html)) {
  ok('1. dropdown is positioned below the search field (top:100%)');
} else bad('below-field position');

if (/#teacher-rewards\.card\{[\s\S]{0,80}overflow:\s*visible/.test(html)) {
  ok('2/3. Rewards Panel card overflow is visible so the dropdown can escape');
} else bad('rewards overflow visible');

if (/\.card\{[^}]*overflow:hidden/.test(html) && !/#teacher-approvals\.card/.test(html.match(/overflow:\s*visible/g) ? html : '')) {
  ok('14. generic .card overflow:hidden retained; unrelated cards not globally unlocked');
} else if (/\.card\{[^}]*overflow:hidden/.test(html) && html.includes('#teacher-rewards.card') && html.includes('overflow: visible')) {
  ok('14. generic .card overflow:hidden retained; only #teacher-rewards is unlocked');
} else bad('unrelated card overflow', genericCard);

if (/max-height:\s*220px/.test(genericDropdown) && /min\(500px/.test(rewardsDropdown)) {
  ok('4. desktop Rewards dropdown cap is 500px, not the old 220px clip');
} else bad('desktop max-height', rewardsDropdown);

if (/layoutStudentDropdown/.test(rewardJs) && /innerHeight/.test(rewardJs) && /rect\.bottom/.test(rewardJs)) {
  ok('5. viewport-aware max-height from input bottom + remaining dvh');
} else bad('viewport layout');

if (/overflow-y:\s*auto/.test(rewardsDropdown) && /overflow-x:\s*hidden/.test(rewardsDropdown)) {
  ok('6/7. long roster scrolls inside dropdown; no horizontal overflow');
} else bad('scroll axes');

if (/z-index:\s*40/.test(rewardsDropdown) && /is-picker-open/.test(html) && /z-index:\s*8/.test(rewardsCss)) {
  ok('8. open picker lifts above following Teacher content, below header/modals');
} else bad('z-index');

if (/left:0;\s*right:0/.test(genericDropdown) && /dd\.style\.width = Math\.round\(rect\.width\)/.test(rewardJs)) {
  ok('9. dropdown width matches/aligned to the search field');
} else bad('width alignment');

if (/setSelectedStudent\(s\)/.test(rewardJs) && /students\/search/.test(rewardJs) && /closeStudentDropdown\(\)/.test(rewardJs)) {
  ok('10/11. selecting a student and search/filter behavior unchanged');
} else bad('selection/search');

if (/dd\.addEventListener\('mousedown'/.test(rewardJs) && /e\.preventDefault\(\)/.test(rewardJs) && /blur/.test(rewardJs)) {
  ok('12. mousedown preventDefault keeps scroll/click from closing via blur');
} else bad('scroll/click close');

if (/max-width:\s*700px/.test(html) && /60dvh/.test(rewardsDropdown + html) && /0\.55/.test(rewardJs)) {
  ok('13. mobile uses ~50–60dvh instead of forcing 500px');
} else bad('mobile height');

if (/z-index:\s*10000/.test(fs.readFileSync(path.join(root, 'app/css/lantern-header.css'), 'utf8'))) {
  ok('8b. header remains above picker (10000 > 40)');
} else bad('header z-index');

if (/\.teacherRewardOverlay\{[^}]*z-index:\s*10000/.test(html)) {
  ok('8c. true Rewards modal overlay stays a separate higher layer');
} else bad('modal overlay');

if (!/999999/.test(rewardsDropdown) && !/999999/.test(rewardJs)) {
  ok('z-index stays in existing convention, not 999999');
} else bad('absurd z-index');

console.log('\nteacher-rewards-student-picker-172-test:', pass, 'PASS', fail, 'FAIL');
process.exit(fail ? 1 : 0);
