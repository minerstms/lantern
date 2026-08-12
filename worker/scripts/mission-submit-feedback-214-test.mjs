/**
 * Prompt #214 — Mission Preview "Submit mission" must give visible feedback and call the API.
 * Usage: node worker/scripts/mission-submit-feedback-214-test.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { validateMissionSubmissionPayload } from '../missions-auth.js';

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
function assert(cond, msg) {
  if (cond) ok(msg);
  else bad(msg);
}

const missionsHtml = fs.readFileSync(path.join(root, 'app/missions.html'), 'utf8');
const missionsCss = fs.readFileSync(path.join(root, 'app/css/lantern-missions-page.css'), 'utf8');
const handlers = fs.readFileSync(path.join(root, 'worker/missions-handlers.js'), 'utf8');

assert(/z-index:\s*10250/.test(missionsHtml), '1. toast z-index above mission modal');
assert(/\.missionDetailOverlay[\s\S]{0,120}z-index:\s*10100/.test(missionsCss), '2. mission overlay remains 10100');
assert(/missionSubmitInlineError/.test(missionsHtml), '3. inline submit error host present');
assert(/Submitting…/.test(missionsHtml), '4. Submitting… busy label');
assert(/setMissionSubmitBusy/.test(missionsHtml), '5. busy helper present');
assert(/getMissionSubmitImageEvidenceUrl/.test(missionsHtml), '6. evidence URL ignores bare img.src page URL');
assert(/getAttribute\('src'\)/.test(missionsHtml), '7. uses getAttribute for upload preview src');
assert(/mapMissionSubmitError/.test(missionsHtml), '8. user-facing error mapper');
assert(/missionSubmitInFlight/.test(missionsHtml), '9. in-flight double-submit guard');
assert(/Add your message and\/or photo/.test(missionsHtml), '10. empty submit shows useful validation');
assert(/\/api\/missions\/submit/.test(missionsHtml) && /callSubmitMissionCompletion/.test(missionsHtml), '11. Submit still posts /api/missions/submit');
assert(/submitBtn\.disabled = remaining > 0/.test(missionsHtml) === false, '12. no silent disable on char countdown alone');
assert(/if \(submitBtn\) submitBtn\.disabled = remaining > 0/.test(missionsHtml) === false, '13. char-gate silent disable removed');
assert(/perm_thank_you|WAVE2_MISSION\.thankYou|use_thank_you/.test(handlers) || /THANK_YOU/.test(handlers), '14. Thank a Teacher still dedicated path');
assert(!/Thank You Ms\. Shanda/.test(handlers), '15. no Shanda-specific hack in handlers');

const shandaLike = {
  submission_type: 'text',
  allows_text: 1,
  allows_image: 1,
  allows_video: 0,
  allows_link: 0,
  min_characters: 1,
};
const empty = validateMissionSubmissionPayload(shandaLike, 'text', '');
assert(!empty.ok, '16. empty submission rejected server-side');
const msg = validateMissionSubmissionPayload(shandaLike, 'text', 'Thank you Ms. Shanda!');
assert(msg.ok, '17. text submission accepted');
const combo = validateMissionSubmissionPayload(
  shandaLike,
  'text',
  JSON.stringify({ text: 'Thank you!', image_url: 'https://example.com/a.jpg' })
);
assert(combo.ok, '18. text+image envelope accepted');

assert(/missionSubmitBtn[\s\S]{0,120}submitCurrentMission/.test(missionsHtml), '19. Submit button listener wired');
assert(/status:\s*'pending'/.test(handlers) || /'pending'/.test(handlers), '20. submit creates pending review status');

console.log('\nmission-submit-feedback-214-test:', pass, 'PASS', fail, 'FAIL');
process.exit(fail ? 1 : 0);
