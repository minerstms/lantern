/**
 * Prompt #219 — opened modal: LRHC expand icon (viewport-fit shell superseded by #168).
 * Usage: node worker/scripts/opened-modal-219-test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const cardsCss = fs.readFileSync(path.join(root, 'app/css/lantern-cards.css'), 'utf8');
const mediaJs = fs.readFileSync(path.join(root, 'app/js/lantern-media.js'), 'utf8');
const cardUi = fs.readFileSync(path.join(root, 'app/js/lantern-card-ui.js'), 'utf8');
const rxCss = fs.readFileSync(path.join(root, 'app/css/lantern-reactions.css'), 'utf8');

let pass = 0;
let fail = 0;
function ok(label) { pass++; console.log('PASS', label); }
function bad(label, detail) { fail++; console.error('FAIL', label, detail != null ? detail : ''); }
function assert(cond, label, detail) { if (cond) ok(label); else bad(label, detail); }

assert(!/lanternCardDetailViewFullImgWrap/.test(cardUi), '1. bottom View full image wrap removed from card-ui');
assert(!/fullBtn\.textContent\s*=\s*'View full image'/.test(cardUi), '2. no text button assignment');
assert(/aria-label="View full image"/.test(mediaJs) && /lanternDetailMediaExpandBtn/.test(mediaJs), '3. detail media includes accessible expand icon');
assert(/lanternDetailMedia--img[\s\S]{0,200}lanternDetailMediaExpandBtn/.test(mediaJs), '4. expand icon is inside image markup');
assert(/bottom:\s*10px/.test(cardsCss) && /\.lanternDetailMedia--img\s+\.lanternDetailMediaExpandBtn/.test(cardsCss), '5. CSS places expand icon in image LRHC');
assert(/--lantern-opened-modal-top-gap:\s*32px/.test(cardsCss), '6. #168 top gap (viewport-fit max-height superseded)');
assert(/--lantern-opened-modal-max-width/.test(cardsCss), '7. modal max-width token present');
assert(/safe-area-inset/.test(cardsCss), '8. safe-area padding on overlay');
assert(/#lanternCardDetailOverlay\s+\.lanternCardDetailModal[\s\S]{0,240}max-height:\s*none/.test(cardsCss), '9. overlay modal is not viewport-capped');
assert(/#lanternCardDetailOverlay\s+\.lanternSurfaceContent[\s\S]{0,160}overflow:\s*visible/.test(cardsCss), '10. content is not an inner scroller');
assert(/#lanternCardDetailOverlay\s+\.lanternCardDetailHeader[\s\S]{0,160}flex-shrink:\s*0/.test(cardsCss), '11. close header remains');
assert(/object-fit:\s*contain/.test(cardsCss) && /aspect-ratio:\s*16\s*\/\s*9/.test(cardsCss), '12. opened image contain in 16:9 frame');
assert(/#lanternCardDetailOverlay\.lanternSurfaceShell\{[\s\S]*?overflow-y:\s*auto/.test(cardsCss), '13. overlay scrolls; rail crop is not used on detail');
assert(/display:\s*none\s*!important/.test(rxCss), '14. legacy View full image CSS hidden');
assert(/openMediaFullscreen\('image'/.test(cardUi), '15. fullscreen image behavior preserved');
assert(/type === 'poll'/.test(cardUi) && /openPoll/.test(cardUi), '16. poll routing preserved');
assert(/shoutOutRecognizedPartyLabel|fillFeedItemDetailModal/.test(cardUi), '17. feed detail modal preserved');
assert(/min-width:\s*1600px/.test(cardsCss), '19. ultrawide keeps readable max width');

console.log('\nopened-modal-219-test:', pass, 'PASS', fail, 'FAIL');
process.exit(fail ? 1 : 0);
