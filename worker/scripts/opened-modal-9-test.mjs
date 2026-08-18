/**
 * Prompt #9 — branded opened-modal shell + scroll lock (geometry superseded by #168).
 * Usage: node worker/scripts/opened-modal-9-test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const cardsCss = fs.readFileSync(path.join(root, 'app/css/lantern-cards.css'), 'utf8');
const cardUi = fs.readFileSync(path.join(root, 'app/js/lantern-card-ui.js'), 'utf8');
const explore = fs.readFileSync(path.join(root, 'app/explore.html'), 'utf8');

let pass = 0;
let fail = 0;
function ok(label) { pass++; console.log('PASS', label); }
function bad(label, detail) { fail++; console.error('FAIL', label, detail != null ? detail : ''); }
function assert(cond, label, detail) { if (cond) ok(label); else bad(label, detail); }

assert(/--lantern-opened-modal-top-gap:\s*32px/.test(cardsCss), '1. #168 top gap (viewport-fit max-height superseded)');
assert(/aspect-ratio:\s*16\s*\/\s*9/.test(cardsCss) && /object-fit:\s*contain/.test(cardsCss), '2. full 16:9 contain media (no viewport image clamp)');
assert(/backdrop-filter:\s*blur\(12px\)/.test(cardsCss), '3. translucent blurred backdrop');
assert(/rgba\(5,\s*10,\s*20,\s*0\.72\)/.test(cardsCss), '4. backdrop not opaque full-page replace');
assert(/#lanternCardDetailOverlay\s+\.lanternCardDetailModal[\s\S]{0,220}max-height:\s*none/.test(cardsCss), '5. modal natural height');
assert(/#lanternCardDetailOverlay\s+\.lanternCardDetailModal[\s\S]{0,240}overflow:\s*visible/.test(cardsCss), '6. modal card overflow visible');
assert(/#lanternCardDetailOverlay\s+\.lanternSurfaceContent[\s\S]{0,200}overflow:\s*visible/.test(cardsCss), '7. no inner content scroller');
assert(/#lanternCardDetailOverlay\s+\.lanternCardDetailHeader[\s\S]{0,160}flex-shrink:\s*0/.test(cardsCss), '8. close header remains in shell');
assert(/overscroll-behavior:\s*contain/.test(cardsCss), '9. overlay overscroll contained');
assert(/touch-action:\s*pan-y/.test(cardsCss), '10. overlay allows vertical pan');
assert(/linear-gradient\(180deg,\s*rgba\(22,\s*36,\s*62/.test(cardsCss), '11. branded modal surface gradient');
assert(/pollChoiceBtn[\s\S]{0,200}linear-gradient\(180deg,\s*rgba\(90,167,255/.test(cardsCss), '12. poll choices polished');
assert(/submitPollChoice/.test(cardUi) && !/textContent = 'Lock In'/.test(cardUi), '13. poll tap submits immediately');
assert(/lanternCardDetailBody[\s\S]{0,120}border-radius:\s*14px/.test(cardsCss), '14. body section surface');
assert(/lanternCardDetailReactions[\s\S]{0,160}border-radius:\s*14px/.test(cardsCss), '15. reactions section surface');

assert(/function lockPageScrollForDetail/.test(cardUi), '16. page scroll lock helper');
assert(/function unlockPageScrollForDetail/.test(cardUi), '17. page scroll unlock helper');
assert(/function showDetailOverlay/.test(cardUi), '18. shared showDetailOverlay');
assert(/showDetailOverlay\(el\)/.test(cardUi) && /openNews|openCreation|openPoll|openTextDetail|openFeedItem/.test(cardUi), '19. open paths use show helper');
assert(/unlockPageScrollForDetail\(\)/.test(cardUi) && /function closeDetail/.test(cardUi), '20. close unlocks scroll');
assert(/fillPollDetailModal/.test(cardUi) && /submitPollChoice/.test(cardUi), '21. poll direct-submit flow preserved');
assert(/openPoll/.test(cardUi) && /type === 'poll'/.test(cardUi), '22. poll routing preserved');
assert(/fillCreationDetailModal|openCreation/.test(cardUi), '23. mission/creation modal preserved');
assert(/fillNewsDetailModal|openNews/.test(cardUi), '24. news/shout modal preserved');
assert(/wireOpenedPostMediaInteractions/.test(cardUi), '25. media interactions preserved');
assert(/openReportModal/.test(cardUi), '26. report modal preserved');
assert(/LANTERN_REACTIONS|renderReactionBar/.test(cardUi), '27. reactions preserved');

assert(/lantern-cards\.css/.test(explore), '28. Explore loads shared card CSS');
assert(/max-width:\s*420px[\s\S]{0,280}--lantern-opened-modal-top-gap:\s*16px/.test(cardsCss), '29. mobile top gap + full width');
assert(/#lanternCardDetailOverlay\.lanternSurfaceShell\{[\s\S]*?overflow-y:\s*auto/.test(cardsCss), '30. overlay is the vertical scroller');

console.log('\nopened-modal-9-test: ' + pass + ' PASS ' + fail + ' FAIL');
if (fail) process.exit(1);
