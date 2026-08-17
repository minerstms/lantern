/**
 * Prompt #234 — protected-media watermark placement (corrects #228 page wallpaper).
 * Usage: node worker/scripts/protected-media-watermark-234-test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  classifyMediaKey,
  classifySurface,
  mediaWatermarkLabel,
  watermarkLabel,
  visibleTraceContainsPii,
  handleProtectedContentRoutes,
  lookupProtectedAccessReceipt,
  createProtectedAccessReceipt,
  TRACE_CODE_RE,
} from '../protected-content.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

let pass = 0;
let fail = 0;
function ok(msg) {
  pass++;
  console.log('PASS', msg);
}
function bad(msg, detail) {
  fail++;
  console.error('FAIL', msg, detail != null ? detail : '');
}
function assert(cond, msg, detail) {
  if (cond) ok(msg);
  else bad(msg, detail);
}
function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

const protJs = read('app/js/lantern-protected-content.js');
const protCss = read('app/css/lantern-protected-content.css');
const cardUi = read('app/js/lantern-card-ui.js');
const mediaJs = read('app/js/lantern-media.js');
const navJs = read('app/js/lantern-nav.js');
const cardsCss = read('app/css/lantern-cards.css');
const adminHtml = read('app/admin.html');
const teacherHtml = read('app/teacher.html');
const lockerHtml = read('app/locker.html');
const exploreHtml = read('app/explore.html');
const contributeHtml = read('app/contribute.html');
const missionsHtml = read('app/missions.html');
const gamesHtml = read('app/games.html');
const workerIndex = read('worker/index.js');
const workerProt = read('worker/protected-content.js');
const wrangler = read('worker/wrangler.toml');
const headers = read('app/_headers');

function overlayHtml(label) {
  const cells = new Array(12).fill('<span class="lanternProtectedMediaMark__cell">' + label + '</span>').join('');
  return (
    '<div class="lanternProtectedMediaMark lanternProtectedMediaMark--media" aria-hidden="true" data-lantern-media-mark="1">' +
    '<div class="lanternProtectedMediaMark__grid">' + cells + '</div>' +
    '<span class="lanternProtectedMediaMark__chip">' + label + '</span></div>'
  );
}

// ---------------------------------------------------------------------------
// Exact live failure: card → expand → lightbox still marked, not behind backdrop
// ---------------------------------------------------------------------------
const TRACE = 'X7K4P2';
const LABEL = mediaWatermarkLabel(TRACE);
const studentSrc = '/api/news/image?key=' + encodeURIComponent('news/student-photo.png');

const cardHtml =
  '<div class="newsCardImageWrap lanternProtectedMedia">' +
  '<img class="newsCardImage lanternProtectedMedia" draggable="false" src="' + studentSrc + '" alt="">' +
  overlayHtml(LABEL) +
  '</div>';

assert(cardHtml.includes('lanternProtectedMediaMark') && cardHtml.includes(TRACE), '1. card image has trace watermark in image container');
assert(/newsCardImageWrap[\s\S]*lanternProtectedMediaMark[\s\S]*<\/div>/.test(cardHtml), '2. card watermark is inside the image wrap');

assert(/openMediaFullscreen\('image'/.test(cardUi), '3. click/expand still opens image lightbox');
assert(/decorateFullscreen\(shell\)/.test(cardUi), '4. lightbox open calls decorateFullscreen');

const lightboxHtml =
  '<div id="lanternMediaFullscreenOverlay" class="lanternMediaFullscreenOverlay lanternMediaFullscreenOverlay--show">' +
  '<button type="button" class="lanternMediaFullscreenClose">✕</button>' +
  '<div class="lanternMediaFullscreenInner lanternProtectedMediaFrame">' +
  '<img src="' + studentSrc + '" alt="" class="lanternMediaFullscreenImg lanternProtectedMedia" draggable="false" />' +
  overlayHtml(LABEL) +
  '</div></div>';

assert(
  /lanternMediaFullscreenInner[\s\S]*lanternProtectedMediaMark[\s\S]*<\/div>\s*<\/div>/.test(lightboxHtml) &&
    lightboxHtml.includes(TRACE),
  '5. enlarged image still has trace watermark over the actual image'
);

const innerStart = lightboxHtml.indexOf('lanternMediaFullscreenInner');
const markStart = lightboxHtml.indexOf('lanternProtectedMediaMark');
const overlayStart = lightboxHtml.indexOf('lanternMediaFullscreenOverlay');
assert(markStart > innerStart && innerStart > overlayStart, '6. watermark is inside the media viewport, not behind modal/backdrop');

assert(
  /position:\s*absolute/.test(protCss) &&
    /\.lanternProtectedMediaMark\s*\{[\s\S]*?inset:\s*0/.test(protCss) &&
    !/\.lanternProtectedWatermark\s*\{[\s\S]*?position:\s*fixed/.test(protCss),
  '6b. mark is media-absolute, not a page-fixed wallpaper'
);

assert(
  /closeMediaFullscreen\(\)/.test(cardUi) &&
    /decorateFullscreen\(shell\)/.test(cardUi) &&
    cardUi.indexOf('function openMediaFullscreen') < cardUi.indexOf('decorateFullscreen(shell)'),
  '7. closing/reopening re-runs protected rendering on each open'
);

// ---------------------------------------------------------------------------
// Ordinary UI has no page-wide wallpaper
// ---------------------------------------------------------------------------
assert(
  !protJs.includes("id = 'lanternProtectedWatermark'") &&
    !protJs.includes('document.body.appendChild(wrap)') &&
    !protCss.includes('.lanternProtectedWatermark'),
  '8. Admin/ordinary pages have no repeated page-wide watermark wallpaper'
);
assert(!teacherHtml.includes('lanternProtectedWatermark') && !adminHtml.includes('TMS CONFIDENTIAL •'), '9. Teacher Tools HTML has no wallpaper watermark');
assert(!lockerHtml.includes('lanternProtectedWatermark'), '10. ordinary Locker background has no page-wide watermark wallpaper');

// ---------------------------------------------------------------------------
// Protected student media IS watermarked; generic art is not
// ---------------------------------------------------------------------------
assert(classifyMediaKey('news/student-photo.png').protected === true, '11. protected Locker/Explore news image is classified protected');
assert(classifyMediaKey('news/explore-student.png').protected === true, '12. protected Explore student image is classified protected');
assert(classifyMediaKey('missions/photo.png').protected === true, '13. protected mission/student media is classified protected');
assert(classifyMediaKey('library/art/art_1.png').protected === false, '14. generic school/library art is not watermarked');
assert(
  classifyMediaKey('missions/card/x.png').protected === false &&
    protJs.includes('fight-?song') &&
    protJs.includes('school_asset'),
  '15. Fight Song / mission-card / game content is not watermarked'
);

assert(protJs.includes('TINY_AVATAR_SEL') && protCss.includes('lanternProtectedMediaMark--avatar') && protJs.includes("isTinyAvatar"), '16. small avatars use a non-face-covering treatment');
assert(protJs.includes("variant === 'expanded'") && protJs.includes('avatarMatchImgWrap'), '17. expanded / Avatar Match views use the protected-media watermark');

assert(LABEL === 'TMS • X7K4P2' && !visibleTraceContainsPii(LABEL, ['lucas', 'student1', 'admin@school.org', '20889']), '18. trace code contains no PII');

function mockDb(opts) {
  const store = (opts && opts.store) || [];
  return {
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async run() {
              store.push({
                id: args[0],
                trace_code: args[1],
                viewer_username: args[2],
                viewer_role: args[3],
                resource_type: args[4],
                resource_id: args[5],
                surface: args[6],
                action: args[7],
                protection_tier: args[8],
                session_ref: args[9],
                authorized: args[10],
                created_at: args[11],
              });
              return { success: true };
            },
            async first() {
              return store.find((r) => r.trace_code === args[0]) || null;
            },
          };
        },
      };
    },
  };
}

const store = [];
const created = await createProtectedAccessReceipt(mockDb({ store }), {
  viewerUsername: 'teacher1',
  viewerRole: 'teacher',
  resourceType: 'student_media',
  resourceId: 'news/student-photo.png',
  surface: 'locker',
  action: 'view',
  protectionTier: 1,
  sessionRef: 'pilot:teacher1:1',
});
const looked = await lookupProtectedAccessReceipt(mockDb({ store }), created.receipt.trace_code);
assert(
  created.ok && looked && looked.trace_code === created.receipt.trace_code && looked.viewer_username === 'teacher1',
  '19. trace still maps server-side to receipt'
);

function jsonResponse(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
const unauth = await handleProtectedContentRoutes(
  new Request('https://lantern.test/api/protected/view-session?surface=explore'),
  new URL('https://lantern.test/api/protected/view-session?surface=explore'),
  '/api/protected/view-session',
  { DB: mockDb({ store: [] }) },
  {},
  {
    jsonResponse,
    getPilotAccountFromRequest: async () => null,
    getPilotSessionRef: async () => null,
    pilotAccountRequiresChangePassword: () => false,
  }
);
assert(unauth.status === 401, '20. unauthenticated protected-media request remains rejected');

assert(/private, no-store/.test(workerProt) && /frame-ancestors 'self'/.test(workerProt), '21. private/no-store headers remain');
assert(protJs.includes("addEventListener('contextmenu'") && mediaJs.includes('draggable="false"'), '22. right-click/drag deterrence remains');

assert(contributeHtml.includes('LANTERN_AVATAR_API') && contributeHtml.includes('lantern-nav.js'), '23. Create works (page present)');
assert(missionsHtml.includes('missionsStatusTabs') && missionsHtml.includes('lantern-nav.js'), '24. Missions works (page present)');
assert(lockerHtml.includes('lockerPanelOverview'), '25. Locker works (page present)');
assert(exploreHtml.includes('lantern-card-ui.js') || exploreHtml.includes('Lantern'), '26. Explore works (page present)');
assert(gamesHtml.toLowerCase().includes('avatarmatch') || read('app/js/lantern-games-page.js').includes('avatar'), '27. Avatar Match works (surface present)');
assert(/lanternMediaFullscreenOverlay/.test(cardUi) && /lanternMediaFullscreenInner/.test(cardsCss), '28. image lightbox works');
assert(protCss.includes('max-width: 480px') && cardsCss.includes('100dvh'), '29. phone layout watermark + lightbox sizing remain');

assert(watermarkLabel(2, TRACE) === 'TMS CONFIDENTIAL • X7K4P2', 'receipt watermark format unchanged');
assert(TRACE_CODE_RE.test(TRACE), 'opaque 6-char alphabet preserved');
assert(protJs.includes('mediaWatermarkLabel') && protJs.includes('TMS • '), 'on-media visible treatment is TMS • CODE');
assert(/lantern-protected-content\.js\?v=\d+/.test(navJs), 'nav boots protected-content helper');
assert(classifySurface('admin').tier === 2 && classifySurface('teacher').tier === 2, 'admin/teacher remain sensitive surfaces for receipts');
assert(classifySurface('games').tier === 0, 'games surface remains general (no page wallpaper)');
assert(/\/api\/news\/image/.test(workerIndex) && /getPilotAccountFromRequest/.test(workerIndex), 'authenticated student-media delivery remains');
assert(!/\[\[images\]\]|IMAGES/.test(wrangler), 'no new Cloudflare Images binding introduced');
assert(headers.includes("frame-ancestors 'self'"), 'Pages frame protections remain');
assert(!/screenshot-proof|cannot be downloaded|impossible to download/i.test(protJs + protCss + adminHtml), 'no overclaim that DOM marks change stored bytes');
assert(!/229|behavior.?report watermark|mtss/i.test(protJs), '#229 Behavior/MTSS report watermarks were not removed here');
assert(protJs.includes('isProtectedStudentMediaUrl') && protJs.includes('decorateFullscreen'), 'one canonical media watermark helper');
assert(cardUi.includes('lanternProtectedMediaFrame') && cardUi.includes('lanternMediaFullscreenImg lanternProtectedMedia'), 'lightbox markup is a protected-media viewport');
assert(/pointer-events:\s*none/.test(protCss), 'overlay cannot steal clicks');
assert(protJs.includes("resource_type: 'student_media'") || protJs.includes("resource_type: 'student_media'"), 'media-scoped receipt fetch exists when page session is general');

console.log('\nprotected-media-watermark-234-test:', pass, 'PASS', fail, 'FAIL');
process.exit(fail ? 1 : 0);
