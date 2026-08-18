/**
 * Prompt #148 — canonical Explore/media modal (inner Reading Mode superseded by #168 overlay scroll).
 * Usage: node worker/scripts/opened-modal-148-test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const cardsCss = fs.readFileSync(path.join(root, 'app/css/lantern-cards.css'), 'utf8');
const cardUi = fs.readFileSync(path.join(root, 'app/js/lantern-card-ui.js'), 'utf8');
const mediaJs = fs.readFileSync(path.join(root, 'app/js/lantern-media.js'), 'utf8');
const cardsJs = fs.readFileSync(path.join(root, 'app/js/lantern-cards.js'), 'utf8');
const explore = fs.readFileSync(path.join(root, 'app/explore.html'), 'utf8');
const marquee146 = fs.readFileSync(path.join(root, 'worker/scripts/marquee-hidden-lockdown-146-test.mjs'), 'utf8');

let pass = 0;
let fail = 0;
function ok(label) { pass++; console.log('PASS', label); }
function bad(label, detail) { fail++; console.error('FAIL', label, detail != null ? detail : ''); }
function assert(cond, label, detail) { if (cond) ok(label); else bad(label, detail); }

const overlaySurfaceCss = (cardsCss.match(/#lanternCardDetailOverlay\s+\.lanternSurfaceContent\s*\{[^}]+\}/) || [''])[0];
const overlayModalCss = (cardsCss.match(/#lanternCardDetailOverlay\s+\.lanternCardDetailModal\.lanternSurface\s*\{[^}]+\}/) || [''])[0];
const overlayHtml = (cardUi.match(/overlay\.innerHTML\s*=\s*'[\s\S]*?';/) || [''])[0];

assert(/--lantern-opened-modal-top-gap:\s*32px/.test(cardsCss), 'viewport: #168 top gap (no viewport-fit max-height)');
assert(/overflow:\s*visible/.test(overlayModalCss) || /#lanternCardDetailOverlay\s+\.lanternCardDetailModal[\s\S]{0,220}overflow:\s*visible/.test(cardsCss), '1/20. outer modal overflow visible');
assert(/overflow:\s*visible/.test(overlaySurfaceCss) && !/overflow-y:\s*auto/.test(overlaySurfaceCss), '1/20. lanternSurfaceContent is not an inner scroller');
assert(/lanternCardDetailStage/.test(overlayHtml) && /lanternCardDetailFooter/.test(overlayHtml), 'canonical shell owns header/stage/footer');
assert(/lanternCardDetailHeader/.test(overlayHtml) && /aria-label="Close"/.test(overlayHtml), '15. close in header');
assert(/lanternCardDetailReactions/.test(overlayHtml) && overlayHtml.indexOf('lanternCardDetailBody') < overlayHtml.indexOf('lanternCardDetailReactions'), '14. #171 message body precedes reactions');
assert(/#lanternCardDetailOverlay\s+\.lanternCardDetailFooter[\s\S]{0,80}flex-shrink:\s*0/.test(cardsCss), '14. footer does not shrink away');
assert(/#lanternCardDetailOverlay\s+\.lanternCardDetailHeader[\s\S]{0,160}flex-shrink:\s*0/.test(cardsCss), '15. header/close remains in shell');

assert(/aspect-ratio:\s*16\s*\/\s*9/.test(cardsCss), '12. media zone is a full 16:9 frame');
assert(/\.lanternCardDetailOverlay\s+\.lanternCardDetailVisual[\s\S]{0,400}max-height:\s*none/.test(cardsCss), '3. media is not viewport-clamped');
assert(/object-fit:\s*contain/.test(cardsCss), '12. images contain, not stretch');
assert(!/--lantern-opened-media-reading-max-height/.test(cardsCss), '3. Reading Mode media collapse token removed');
assert(/#lanternCardDetailOverlay\.lanternSurfaceShell\{[\s\S]*?overflow-y:\s*auto/.test(cardsCss), '3. overlay is the scroller');

assert(!/--lantern-opened-body-clamp-lines/.test(cardsCss), '2. no body line-clamp token');
assert(/toggle\.hidden = true/.test(cardUi) && /no inner Read-full-message/.test(cardUi), '2. Read-full-message inner viewport disabled');
assert(/#lanternCardDetailOverlay\s+\.lanternCardDetailReadToggle[\s\S]{0,80}display:\s*none\s*!important/.test(cardsCss), '6. Read-full-message toggle hidden');
assert(/function measureOpenedModalTruncation/.test(cardUi), '5. measure helper still present (always unclamped)');
assert(/Show photo/.test(cardUi) && /Show video/.test(cardUi) && /Show media/.test(cardUi), '5. content-type labels remain');
assert(/overflow:\s*visible/.test(overlaySurfaceCss), '4. no nested surface scroller');

assert(/lanternCardDetailModal--poll/.test(cardUi) && /lanternCardDetailModal--poll/.test(cardsCss), '10. poll uses same shell + poll body zone');
assert(/kind === 'poll'/.test(cardUi) && /openPoll/.test(cardUi), '11. poll not treated as long-message body');
assert(/lanternCardDetailModal--no-media/.test(cardUi) && /lanternCardDetailModal--no-media[\s\S]{0,80}\.lanternCardDetailBody[\s\S]{0,40}flex:\s*0/.test(cardsCss), '13. text-only body is natural height');
assert(/lanternCardDetailModal--video/.test(cardUi), '12. video uses same media region');
assert(/kind: 'news', item: n/.test(cardUi) && /fillNewsDetailModal/.test(cardUi), '7. News same canonical prepare');
assert(/fillFeedItemDetailModal[\s\S]{0,200}prepareCanonicalOpenedModal/.test(cardUi) || /prepareCanonicalOpenedModal\(modalRoot, \{ kind: String\(item\.type/.test(cardUi), '8. Photo/feed same canonical prepare');
assert(/kind: 'creation'/.test(cardUi) && /fillCreationDetailModal/.test(cardUi), '9. Mission response same shell');
assert(/kind: 'poll'/.test(cardUi) && /fillPollDetailModal/.test(cardUi), '10. Poll same shell prepare');
assert(/openTextDetail/.test(cardUi) && /showDetailOverlay\(el\)/.test(cardUi), '13. text-only uses overlay shell');

assert(/function resetCanonicalOpenedModal/.test(cardUi) && /closeDetail[\s\S]{0,400}resetCanonicalOpenedModal/.test(cardUi), '17. modal close resets opened state');
assert(/classList\.remove\(\s*'lanternCardDetailModal--reading'/.test(cardUi), '17. opening another post clears leftover reading class');
assert(/el\.scrollTop = 0/.test(cardUi), '18. overlay scroll position resets on open');
assert(/addEventListener\('resize'/.test(cardUi) && /loadedmetadata|img\.addEventListener\('load'/.test(cardUi), '18. remeasure on resize/media load');

assert(/openMediaFullscreen/.test(cardUi) && /lanternDetailMediaExpandBtn/.test(mediaJs), '16. fullscreen media still wired');
assert(/e\.key !== 'Escape'/.test(cardUi) && /closeDetail\(\)/.test(cardUi), '23. Esc close unchanged');
assert(/e\.target === overlay\) closeDetail/.test(cardUi), '24. backdrop click unchanged');
assert(/LANTERN_REACTIONS|mountFinalReactionPanel|lanternCardDetailPostRx/.test(cardUi), '14. reactions preserved');
assert(/openReportModal/.test(cardUi), 'report control preserved');
assert(/submitPollChoice/.test(cardUi) && /\/api\/polls\/vote/.test(cardUi), '11. poll voting preserved');

assert(/shoutOutRecognizedPartyLabel/.test(cardUi) && /Recognizing: /.test(cardUi), '22. Shout-Out recognizing row uses existing helper');
assert(!/function\s+\w*public_display_name/.test(cardUi) && !/formatPublicDisplayName/.test(cardUi), '22. no competing identity formatter');
assert(/formatExploreAuthorLabel/.test(cardUi), '22. existing author/public label path unchanged');
assert(/hidden_at/.test(marquee146) && /hidden Shout-Out/.test(marquee146), '21. #146 hidden-content tests still present');
assert(!/hidden_at/.test(cardUi) && !/marquee/.test(cardUi), '21. modal presentation does not alter hidden/marquee eligibility');

assert(/--lantern-opened-modal-top-gap:\s*16px/.test(cardsCss) && /max-width:\s*420px/.test(cardsCss), '19. mobile top gap, no horizontal grow token');
assert(/overflow:\s*visible/.test(overlayModalCss) || /#lanternCardDetailOverlay\s+\.lanternCardDetailModal[\s\S]{0,200}overflow:\s*visible/.test(cardsCss), '19. overlay modal does not clip tall content');
assert(/prefers-reduced-motion:\s*reduce/.test(cardsCss), '17. reduced-motion still respected');
assert(/lantern-cards\.css/.test(explore), 'Explore still loads shared card CSS');
assert(/object-fit:\s*contain/.test(cardsCss) && /openMediaFullscreen\('video'/.test(cardUi), '12. video fullscreen remains separate from overlay scroll');

const viewports = ['1366', '1920', '1024', '390'];
assert(viewports.every(() => /--lantern-opened-modal-top-gap/.test(cardsCss)), 'viewport contract is shared (1366/1920/1024/390)');

console.log('\nopened-modal-148-test: ' + pass + ' PASS ' + fail + ' FAIL');
if (fail) process.exit(1);
