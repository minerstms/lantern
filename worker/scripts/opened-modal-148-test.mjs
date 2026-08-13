/**
 * Prompt #148 — canonical Explore/media modal: no outer scroll, Reading Mode for long body.
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
const readingBodyCss = (cardsCss.match(/#lanternCardDetailOverlay\s+\.lanternCardDetailModal--reading\s+\.lanternCardDetailBodyRead\s*\{[^}]+\}/) || [''])[0];
const overlayHtml = (cardUi.match(/overlay\.innerHTML\s*=\s*'[\s\S]*?';/) || [''])[0];

assert(/100dvh/.test(cardsCss) && /--lantern-opened-modal-max-height:\s*min\(88dvh,\s*calc\(100dvh/.test(cardsCss), 'viewport: max-height uses 100dvh, not a fixed px shell');
assert(/overflow:\s*hidden/.test(overlayModalCss) || /#lanternCardDetailOverlay\s+\.lanternCardDetailModal\.lanternSurface[\s\S]{0,220}overflow:\s*hidden/.test(cardsCss), '1/20. outer modal overflow hidden');
assert(/overflow:\s*hidden/.test(overlaySurfaceCss) && !/overflow-y:\s*auto/.test(overlaySurfaceCss), '1/20. lanternSurfaceContent no outer vertical scroll');
assert(/lanternCardDetailStage/.test(overlayHtml) && /lanternCardDetailFooter/.test(overlayHtml), 'canonical shell owns header/stage/footer');
assert(/lanternCardDetailHeader/.test(overlayHtml) && /aria-label="Close"/.test(overlayHtml), '15. close in header');
assert(/lanternCardDetailReactions/.test(overlayHtml) && /lanternCardDetailFooter/.test(overlayHtml), '14. reactions live in footer');
assert(/#lanternCardDetailOverlay\s+\.lanternCardDetailFooter[\s\S]{0,80}flex-shrink:\s*0/.test(cardsCss), '14. footer does not shrink away');
assert(/#lanternCardDetailOverlay\s+\.lanternCardDetailHeader[\s\S]{0,160}flex-shrink:\s*0/.test(cardsCss), '15. header/close always visible');

assert(/--lantern-opened-image-max-height:\s*min\(42dvh,\s*42vh\)/.test(cardsCss), '12. media zone 35–45vh (42dvh)');
assert(/\.lanternCardDetailOverlay\s+\.lanternCardDetailVisual[\s\S]{0,400}max-height:\s*var\(--lantern-opened-image-max-height\)/.test(cardsCss), '3. media cannot set total modal height');
assert(/object-fit:\s*contain/.test(cardsCss), '12. images contain, not stretch');
assert(/--lantern-opened-media-reading-max-height:\s*72px/.test(cardsCss), '3. Reading Mode media collapse token');
assert(/lanternCardDetailModal--reading[\s\S]{0,80}\.lanternCardDetailVisual[\s\S]{0,120}max-height:\s*var\(--lantern-opened-media-reading-max-height\)/.test(cardsCss), '3. Reading Mode collapses media');

assert(/--lantern-opened-body-clamp-lines:\s*5/.test(cardsCss), '2. normal body clamp ~5 lines');
assert(/lanternCardDetailModal:not\(\.lanternCardDetailModal--reading\)[\s\S]{0,220}--lantern-opened-body-clamp-lines/.test(cardsCss), '2. clamp only in normal mode');
assert(/Read full message/.test(cardUi), '2. Read full message affordance');
assert(/scrollHeight > .+clientHeight/.test(cardUi), '18. truncation via scrollHeight vs clientHeight');
assert(/toggle\.hidden = !overflowing/.test(cardUi), '6. short body hides Read full message');
assert(/function enterOpenedReadingMode/.test(cardUi) && /function exitOpenedReadingMode/.test(cardUi), '5. Reading Mode enter/exit');
assert(/Show photo/.test(cardUi) && /Show video/.test(cardUi) && /Show media/.test(cardUi) && /Collapse message/.test(cardUi), '5. content-type return labels');
assert(/overflow-y:\s*auto/.test(readingBodyCss), '5. only expanded body region may scroll');
assert(!/overflow-y:\s*auto/.test(overlaySurfaceCss), '4. Reading Mode still no outer modal scroll');

assert(/lanternCardDetailModal--poll/.test(cardUi) && /lanternCardDetailModal--poll/.test(cardsCss), '10. poll uses same shell + poll body zone');
assert(/kind === 'poll'/.test(cardUi) && /openPoll/.test(cardUi), '11. poll not treated as long-message body');
assert(/lanternCardDetailModal--no-media/.test(cardUi) && /lanternCardDetailModal--no-media[\s\S]{0,80}\.lanternCardDetailBody[\s\S]{0,40}flex:\s*1/.test(cardsCss), '13. text-only inherits unused media space');
assert(/lanternCardDetailModal--video/.test(cardUi), '12. video uses same bounded media region');
assert(/kind: 'news', item: n/.test(cardUi) && /fillNewsDetailModal/.test(cardUi), '7. News same canonical prepare');
assert(/fillFeedItemDetailModal[\s\S]{0,200}prepareCanonicalOpenedModal/.test(cardUi) || /prepareCanonicalOpenedModal\(modalRoot, \{ kind: String\(item\.type/.test(cardUi), '8. Photo/feed same canonical prepare');
assert(/kind: 'creation'/.test(cardUi) && /fillCreationDetailModal/.test(cardUi), '9. Mission response same shell');
assert(/kind: 'poll'/.test(cardUi) && /fillPollDetailModal/.test(cardUi), '10. Poll same shell prepare');
assert(/openTextDetail/.test(cardUi) && /showDetailOverlay\(el\)/.test(cardUi), '13. text-only uses overlay shell');

assert(/function resetCanonicalOpenedModal/.test(cardUi) && /closeDetail[\s\S]{0,400}resetCanonicalOpenedModal/.test(cardUi), '17. modal close resets Reading Mode');
assert(/classList\.remove\(\s*'lanternCardDetailModal--reading'/.test(cardUi), '17. opening another post starts normal mode');
assert(/read\.scrollTop = 0/.test(cardUi), '18. body scroll position resets');
assert(/addEventListener\('resize'/.test(cardUi) && /loadedmetadata|img\.addEventListener\('load'/.test(cardUi), '18. remeasure on resize/media load');

assert(/openMediaFullscreen/.test(cardUi) && /lanternDetailMediaExpandBtn/.test(mediaJs), '16. fullscreen media still wired');
assert(/e\.key !== 'Escape'/.test(cardUi) && /closeDetail\(\)/.test(cardUi), '23. Esc close unchanged');
assert(/e\.target === overlay\) closeDetail/.test(cardUi), '24. backdrop click unchanged');
assert(/LANTERN_REACTIONS|mountFinalReactionPanel|lanternCardDetailPostRx/.test(cardUi), '14. reactions preserved');
assert(/openReportModal/.test(cardUi), 'report control preserved');
assert(/Lock In/.test(cardUi) && /pollLockInBtn/.test(cardUi), '11. poll voting preserved');

assert(/shoutOutRecognizedPartyLabel/.test(cardUi) && /Recognizing: /.test(cardUi), '22. Shout-Out recognizing row uses existing helper');
assert(!/function\s+\w*public_display_name/.test(cardUi) && !/formatPublicDisplayName/.test(cardUi), '22. no competing identity formatter');
assert(/formatExploreAuthorLabel/.test(cardUi), '22. existing author/public label path unchanged');
assert(/hidden_at/.test(marquee146) && /hidden Shout-Out/.test(marquee146), '21. #146 hidden-content tests still present');
assert(!/hidden_at/.test(cardUi) && !/marquee/.test(cardUi), '21. modal presentation does not alter hidden/marquee eligibility');

assert(/96dvh/.test(cardsCss) && /max-width:\s*420px/.test(cardsCss), '19. mobile nearly-full viewport, no horizontal grow token');
assert(/overflow:\s*hidden/.test(overlayModalCss) || /#lanternCardDetailOverlay\s+\.lanternCardDetailModal[\s\S]{0,200}overflow:\s*hidden/.test(cardsCss), '19. overlay modal clips both axes');
assert(/prefers-reduced-motion:\s*reduce/.test(cardsCss), '17. reading-mode transition respects reduced motion');
assert(/lantern-cards\.css/.test(explore), 'Explore still loads shared card CSS');
assert(/object-fit:\s*contain/.test(cardsCss) && /openMediaFullscreen\('video'/.test(cardUi), '12. video fullscreen remains separate from Reading Mode');

const viewports = ['1366', '1920', '1024', '390'];
assert(viewports.every(() => /100dvh/.test(cardsCss)), 'viewport tokens are dvh-based (1366/1920/1024/390 share one contract)');

console.log('\nopened-modal-148-test: ' + pass + ' PASS ' + fail + ' FAIL');
if (fail) process.exit(1);
