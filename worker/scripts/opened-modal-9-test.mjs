/**
 * Prompt #9 — opened modal stays in viewport; branded shell; scroll lock; no behavior rewrite.
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

assert(/--lantern-opened-modal-max-height:\s*min\(88dvh/.test(cardsCss), '1. modal max-height leaves viewport chrome room');
assert(/--lantern-opened-image-max-height:\s*min\(36dvh/.test(cardsCss), '2. image max-height reduced vs half-viewport');
assert(/backdrop-filter:\s*blur\(12px\)/.test(cardsCss), '3. translucent blurred backdrop');
assert(/rgba\(5,\s*10,\s*20,\s*0\.72\)/.test(cardsCss), '4. backdrop not opaque full-page replace');
assert(/max-height:\s*min\(var\(--lantern-opened-modal-max-height\),\s*100%\)/.test(cardsCss), '5. modal capped to viewport box');
assert(
  /#lanternCardDetailOverlay\s+\.lanternCardDetailModal\.lanternSurface\s*\{[^}]*overflow:\s*hidden/.test(cardsCss) ||
    /Shell scrolls only via \.lanternSurfaceContent[\s\S]{0,80}overflow:\s*hidden/.test(cardsCss),
  '6. modal shell overflow hidden'
);
assert(/#lanternCardDetailOverlay\s+\.lanternSurfaceContent[\s\S]{0,200}overflow-y:\s*auto/.test(cardsCss), '7. content scrolls internally');
assert(/position:\s*sticky/.test(cardsCss) && /lanternCardDetailHeader/.test(cardsCss), '8. close header sticky');
assert(/overscroll-behavior:\s*none/.test(cardsCss), '9. shell overscroll contained');
assert(/touch-action:\s*manipulation/.test(cardsCss), '10. reduce accidental zoom gestures');
assert(/linear-gradient\(180deg,\s*rgba\(22,\s*36,\s*62/.test(cardsCss), '11. branded modal surface gradient');
assert(/pollChoiceBtn[\s\S]{0,200}linear-gradient\(180deg,\s*rgba\(90,167,255/.test(cardsCss), '12. poll choices polished');
assert(/\.pollLockInBtn\s*\{[\s\S]{0,280}linear-gradient\(180deg,\s*rgba\(90,167,255/.test(cardsCss), '13. lock-in button polished');
assert(/lanternCardDetailBody[\s\S]{0,120}border-radius:\s*14px/.test(cardsCss), '14. body section surface');
assert(/lanternCardDetailReactions[\s\S]{0,160}border-radius:\s*14px/.test(cardsCss), '15. reactions section surface');

assert(/function lockPageScrollForDetail/.test(cardUi), '16. page scroll lock helper');
assert(/function unlockPageScrollForDetail/.test(cardUi), '17. page scroll unlock helper');
assert(/function showDetailOverlay/.test(cardUi), '18. shared showDetailOverlay');
assert(/showDetailOverlay\(el\)/.test(cardUi) && /openNews|openCreation|openPoll|openTextDetail|openFeedItem/.test(cardUi), '19. open paths use show helper');
assert(/unlockPageScrollForDetail\(\)/.test(cardUi) && /function closeDetail/.test(cardUi), '20. close unlocks scroll');
assert(/fillPollDetailModal/.test(cardUi) && /Lock In|Lock it in/.test(cardUi), '21. poll lock-in flow preserved');
assert(/openPoll/.test(cardUi) && /type === 'poll'/.test(cardUi), '22. poll routing preserved');
assert(/fillCreationDetailModal|openCreation/.test(cardUi), '23. mission/creation modal preserved');
assert(/fillNewsDetailModal|openNews/.test(cardUi), '24. news/shout modal preserved');
assert(/wireOpenedPostMediaInteractions/.test(cardUi), '25. media interactions preserved');
assert(/openReportModal/.test(cardUi), '26. report modal preserved');
assert(/LANTERN_REACTIONS|renderReactionBar/.test(cardUi), '27. reactions preserved');

assert(/lantern-cards\.css/.test(explore), '28. Explore loads shared card CSS');
assert(/max-width:\s*420px[\s\S]{0,280}--lantern-opened-modal-max-height:\s*min\(90dvh/.test(cardsCss), '29. mobile viewport max-height');
assert(/max-height:\s*640px[\s\S]{0,160}--lantern-opened-image-max-height:\s*min\(28dvh/.test(cardsCss), '30. short-viewport image shrink');

console.log('\nopened-modal-9-test: ' + pass + ' PASS ' + fail + ' FAIL');
if (fail) process.exit(1);
