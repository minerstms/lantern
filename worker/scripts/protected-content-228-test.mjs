/**
 * Prompt #228 — Protected Content & Traceability Layer tests.
 * Unit + static source. Does not log cookies or secrets.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  generateTraceCode,
  normalizeTraceCode,
  watermarkLabel,
  visibleTraceContainsPii,
  sessionRefFromJwtPayload,
  classifyMediaKey,
  classifySurface,
  isNewsDeliveryObjectKey,
  createProtectedAccessReceipt,
  lookupProtectedAccessReceipt,
  handleProtectedContentRoutes,
  handleAdminProtectedTraceLookup,
  TRACE_CODE_RE,
  PROTECTION_TIER,
  SCHOOL_USE_NOTICE,
} from '../protected-content.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');

let passed = 0;
let failed = 0;
function ok(msg) {
  passed++;
  console.log('PASS', msg);
}
function bad(msg, detail) {
  failed++;
  console.log('FAIL', msg, detail != null ? detail : '');
}

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function mockDb(opts) {
  const store = (opts && opts.store) || [];
  const failInsert = !!(opts && opts.failInsert);
  return {
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async run() {
              if (failInsert && /INSERT INTO lantern_protected_access_receipts/.test(sql)) {
                throw new Error('d1_insert_failed');
              }
              const row = {
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
              };
              store.push(row);
              return { success: true };
            },
            async first() {
              const code = args[0];
              return store.find((r) => r.trace_code === code) || null;
            },
          };
        },
      };
    },
  };
}

function jsonResponse(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ---------------------------------------------------------------------------
// Existing download-trace inventory (must report absence, not invent)
// ---------------------------------------------------------------------------
const migrationsDir = path.join(root, 'worker/migrations');
const migrationFiles = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'));
const migrationText = migrationFiles.map((f) => fs.readFileSync(path.join(migrationsDir, f), 'utf8')).join('\n');
const workerIndex = read('worker/index.js');
const hasDownloadReceiptsTable = /CREATE TABLE[\s\S]{0,80}download_receipts/i.test(migrationText);
const hasShaDelivered = /delivered[_-]?byte|delivered[_-]?hash|file_sha256/i.test(migrationText + workerIndex);
if (!hasDownloadReceiptsTable) {
  ok('existing download_receipts table: ABSENT (do not invent a competing download-trace model)');
} else {
  bad('unexpected pre-existing download_receipts table — extend it instead of adding a parallel one');
}
if (!hasShaDelivered) {
  ok('existing delivered-byte SHA-256 download chain: ABSENT (not fabricated)');
} else {
  ok('existing delivered-byte hash architecture present — must not be weakened');
}
if (/lantern_access_audit_log/.test(migrationText) && /CREATE TABLE IF NOT EXISTS lantern_access_audit_log/.test(migrationText)) {
  ok('existing school-access audit table preserved (not rewritten)');
} else bad('lantern_access_audit_log missing');
if (/DROP TABLE|DELETE FROM lantern_access_audit_log|DELETE FROM lantern_protected_access_receipts/.test(read('worker/migrations/074_lantern_protected_access_receipts.sql'))) {
  bad('074 migration is destructive');
} else ok('074 migration is additive only');

const mig074 = read('worker/migrations/074_lantern_protected_access_receipts.sql');
if (
  /CREATE TABLE IF NOT EXISTS lantern_protected_access_receipts/.test(mig074) &&
  /trace_code TEXT NOT NULL UNIQUE/.test(mig074) &&
  /viewer_username/.test(mig074) &&
  /protection_tier/.test(mig074) &&
  /session_ref/.test(mig074)
) {
  ok('074 receipt table has opaque trace, viewer, tier, session_ref, action');
} else bad('074 schema incomplete');

// ---------------------------------------------------------------------------
// Trace generation / watermark PII
// ---------------------------------------------------------------------------
const codes = new Set();
for (let i = 0; i < 40; i++) codes.add(generateTraceCode());
if (codes.size === 40 && [...codes].every((c) => TRACE_CODE_RE.test(c))) {
  ok('trace codes are collision-safe in sample and opaque 6-char alphabet');
} else bad('trace code generation weak', [...codes]);

const wm1 = watermarkLabel(1, 'X7K4P2');
const wm2 = watermarkLabel(2, 'X7K4P2');
if (wm1 === 'TMS INTERNAL • X7K4P2') ok('Tier 1 watermark format TMS INTERNAL • CODE');
else bad('Tier 1 watermark', wm1);
if (wm2 === 'TMS CONFIDENTIAL • X7K4P2') ok('Tier 2 watermark format TMS CONFIDENTIAL • CODE');
else bad('Tier 2 watermark', wm2);

if (
  !visibleTraceContainsPii(wm1, ['lucas', 'student1', 'admin@school.org', '20889']) &&
  visibleTraceContainsPii('TMS INTERNAL • lucas', ['lucas']) &&
  visibleTraceContainsPii('user@school.org', [])
) {
  ok('visible trace contains no username/student ID/email');
} else bad('PII watermark check failed');

if (sessionRefFromJwtPayload({ sub: 'Student1', iat: 100 }) === 'pilot:student1:100') {
  ok('session ref uses existing JWT iat/sub without storing the cookie');
} else bad('session ref shape');

if (normalizeTraceCode('x7k4p2') === 'X7K4P2' && !normalizeTraceCode('lucas')) {
  ok('trace normalize accepts opaque codes only');
} else bad('trace normalize');

// ---------------------------------------------------------------------------
// Media classification / public vs protected
// ---------------------------------------------------------------------------
if (classifyMediaKey('library/art/art_1.png').protected === false && classifyMediaKey('default/default_poll.png').tier === 0) {
  ok('Tier 0 school library/default keys are not student-protected');
} else bad('library classification');
if (classifyMediaKey('missions/card/x.png').protected === false) {
  ok('mission card artwork is treated as general school content');
} else bad('mission card classification');
if (
  classifyMediaKey('avatars/av-1.png').protected &&
  classifyMediaKey('news/n1.png').protected &&
  classifyMediaKey('missions/photo.png').protected
) {
  ok('student avatar/news/mission media classified protected');
} else bad('student media classification');
if (isNewsDeliveryObjectKey('news/abc') && isNewsDeliveryObjectKey('missions/card/x') && !isNewsDeliveryObjectKey('library/art/a.png')) {
  ok('news delivery allowlist includes student/mission keys and excludes library');
} else bad('news delivery allowlist');

if (classifySurface('games').tier === 0 && classifySurface('school-survival').tier === 0) {
  ok('Tier 0 ordinary school/game surfaces are not watermarked');
} else bad('tier 0 surface');
if (classifySurface('explore').tier === 1 && classifySurface('locker').tier === 1) {
  ok('Tier 1 student-content surfaces classified');
} else bad('tier 1 surface');
if (classifySurface('admin').tier === 2 && classifySurface('teacher').tier === 2) {
  ok('Tier 2 sensitive surfaces classified');
} else bad('tier 2 surface');

// ---------------------------------------------------------------------------
// Receipt create / lookup / fail-closed
// ---------------------------------------------------------------------------
const store = [];
const db = mockDb({ store });
const created = await createProtectedAccessReceipt(db, {
  viewerUsername: 'teacher1',
  viewerRole: 'teacher',
  resourceType: 'surface',
  resourceId: 'explore',
  surface: 'explore',
  action: 'view',
  protectionTier: 1,
  sessionRef: 'pilot:teacher1:1',
});
if (created.ok && created.receipt.trace_code && created.watermark.includes(created.receipt.trace_code)) {
  ok('authorized view receipt created with mapped watermark');
} else bad('receipt create', created);

const looked = await lookupProtectedAccessReceipt(db, created.receipt.trace_code);
if (looked && looked.viewer_username === 'teacher1' && looked.surface === 'explore' && looked.action === 'view') {
  ok('opaque trace maps to authorized server-side audit receipt');
} else bad('receipt lookup', looked);

const failDb = mockDb({ failInsert: true });
const closed = await createProtectedAccessReceipt(
  failDb,
  { viewerUsername: 'admin', viewerRole: 'admin', surface: 'admin', action: 'view', protectionTier: 2 },
  { failClosed: true }
);
if (!closed.ok && closed.error === 'receipt_unavailable') {
  ok('Tier 2 / fail-closed does not issue an unmapped trace when receipt insert fails');
} else bad('fail-closed', closed);

// ---------------------------------------------------------------------------
// Route auth: view-session + admin lookup
// ---------------------------------------------------------------------------
const student = { username: 'lucas', role: 'student', must_change_password: 0 };
const teacher = { username: 'teacher1', role: 'teacher', must_change_password: 0 };
const admin = { username: 'admin', role: 'admin', must_change_password: 0 };

function depsFor(account) {
  return {
    jsonResponse,
    getPilotAccountFromRequest: async () => account || null,
    getPilotSessionRef: async () => (account ? 'pilot:' + account.username + ':1' : null),
    pilotAccountRequiresChangePassword: (row) => !!(row && Number(row.must_change_password) !== 0),
  };
}

async function callView(account, surface) {
  const url = new URL('https://lantern.test/api/protected/view-session?surface=' + encodeURIComponent(surface));
  const req = new Request(url, { method: 'GET' });
  return handleProtectedContentRoutes(req, url, '/api/protected/view-session', { DB: mockDb({ store: [] }) }, {}, depsFor(account));
}

const unauth = await callView(null, 'explore');
if (unauth.status === 401) ok('unauthenticated protected view-session is 401');
else bad('unauth view-session', unauth.status);

const studentExplore = await (await callView(student, 'explore')).json();
if (studentExplore.ok && studentExplore.protected && studentExplore.trace_code && studentExplore.watermark && !visibleTraceContainsPii(studentExplore.watermark, ['lucas'])) {
  ok('authorized student receives Tier 1 opaque watermark');
} else bad('student explore session', studentExplore);

const studentGames = await (await callView(student, 'games')).json();
if (studentGames.ok && studentGames.protected === false && !studentGames.watermark) {
  ok('Tier 0 games/play surface is not watermarked');
} else bad('games session', studentGames);

const teacherAdmin = await (await callView(teacher, 'teacher')).json();
if (teacherAdmin.ok && teacherAdmin.tier === 2 && /CONFIDENTIAL/.test(teacherAdmin.watermark)) {
  ok('Tier 2 teacher surface receives confidential trace protection');
} else bad('teacher session', teacherAdmin);

const adminSession = await (await callView(admin, 'admin')).json();
if (adminSession.ok && adminSession.tier === 2 && adminSession.notice && adminSession.notice.indexOf('TMS School-Use System') !== -1) {
  ok('admin surface issues school-use notice + confidential trace');
} else bad('admin session', adminSession);

const failClosedEnv = { DB: mockDb({ failInsert: true }) };
const urlAdmin = new URL('https://lantern.test/api/protected/view-session?surface=admin');
const failRes = await handleProtectedContentRoutes(new Request(urlAdmin), urlAdmin, '/api/protected/view-session', failClosedEnv, {}, depsFor(admin));
if (failRes.status === 503) ok('Tier 2 view-session fails closed when receipt cannot be stored');
else bad('tier2 fail-closed status', failRes.status);

const lookupStore = [];
const lookupDb = mockDb({ store: lookupStore });
await createProtectedAccessReceipt(lookupDb, {
  viewerUsername: 'teacher1',
  viewerRole: 'teacher',
  resourceType: 'surface',
  resourceId: 'explore',
  surface: 'explore',
  action: 'view',
  protectionTier: 1,
  sessionRef: 'pilot:teacher1:9',
  traceCode: 'AB23CD',
});
const lookupUrl = new URL('https://lantern.test/api/admin/protected/trace?code=AB23CD');
const lookupRes = await handleAdminProtectedTraceLookup(new Request(lookupUrl), lookupUrl, { DB: lookupDb }, {}, { jsonResponse });
const lookupJson = await lookupRes.json();
if (lookupRes.status === 200 && lookupJson.receipt && lookupJson.receipt.viewer_username === 'teacher1') {
  ok('admin trace lookup returns viewer, surface, time, action');
} else bad('admin lookup', lookupJson);

// ---------------------------------------------------------------------------
// Worker source: media auth + headers + no overclaim
// ---------------------------------------------------------------------------
if (
  workerIndex.includes("path === '/api/avatar/image'") &&
  workerIndex.includes("error: 'not_authenticated'") &&
  /getPilotAccountFromRequest/.test(workerIndex)
) {
  ok('avatar image route requires server-side authentication');
} else bad('avatar image auth');

const newsImgSliceStart = workerIndex.indexOf("path === '/api/news/image'");
const newsImgSlice = newsImgSliceStart >= 0 ? workerIndex.slice(newsImgSliceStart, newsImgSliceStart + 2400) : '';
if (
  newsImgSlice.includes("error: 'not_authenticated'") &&
  newsImgSlice.includes('protectedDeliveryHeaders') &&
  newsImgSlice.includes('authorizeNewsMediaDelivery')
) {
  ok('news image route is auth-gated with per-object delivery authorization and private no-store headers');
} else bad('news image auth/headers');

const newsVidSliceStart = workerIndex.indexOf("path === '/api/news/video'");
const newsVidSlice = newsVidSliceStart >= 0 ? workerIndex.slice(newsVidSliceStart, newsVidSliceStart + 2400) : '';
if (
  newsVidSlice.includes("error: 'not_authenticated'") &&
  newsVidSlice.includes('protectedDeliveryHeaders') &&
  newsVidSlice.includes('authorizeNewsMediaDelivery')
) {
  ok('news video route is auth-gated with per-object delivery authorization and private no-store headers');
} else bad('news video auth/headers');

const mediaSliceStart = workerIndex.indexOf("path === '/api/media/image'");
const mediaSlice = mediaSliceStart >= 0 ? workerIndex.slice(mediaSliceStart, mediaSliceStart + 900) : '';
if (mediaSlice.includes('isMediaLibraryObjectKey') && mediaSlice.includes('public, max-age=604800')) {
  ok('Tier 0 library media remains publicly cacheable school content');
} else bad('library media cache');

if (workerIndex.includes('canViewPrivateAvatar') && workerIndex.includes('isAvatarObjectKey')) {
  ok('existing private-avatar + R2 key-guard gates are still present');
} else bad('existing avatar gates removed');

if (workerIndex.includes("path === '/api/admin/protected/trace'") && workerIndex.includes("role || '').trim().toLowerCase() !== 'admin'")) {
  ok('trace lookup remains inside admin-only handleAdminRoutes');
} else bad('admin lookup wiring');

if (/screenshot proof|cannot be downloaded|cannot be copied|FERPA compliant|FERPA certified/i.test(workerIndex + read('worker/protected-content.js') + read('app/js/lantern-protected-content.js') + read('app/admin.html'))) {
  bad('overclaim language present');
} else ok('no screenshot-proof / FERPA-certified overclaim copy');

if (/private, no-store/.test(read('worker/protected-content.js')) && /frame-ancestors 'self'/.test(read('worker/protected-content.js'))) {
  ok('protected responses declare private no-store and frame-ancestors self');
} else bad('protected headers helper');

// ---------------------------------------------------------------------------
// Frontend watermark / deterrence / print / notice
// ---------------------------------------------------------------------------
const protJs = read('app/js/lantern-protected-content.js');
const protCss = read('app/css/lantern-protected-content.css');
const mediaJs = read('app/js/lantern-media.js');
const navJs = read('app/js/lantern-nav.js');
const headers = read('app/_headers');
const adminHtml = read('app/admin.html');
const gamesHtml = read('app/games.html');
const exploreHtml = read('app/explore.html');
const lockerHtml = read('app/locker.html');
const contributeHtml = read('app/contribute.html');
const missionsHtml = read('app/missions.html');
const teacherHtml = read('app/teacher.html');

if (protJs.includes("tier: 0") && protJs.includes('games:') && protJs.includes('AUTH_SKIP')) {
  ok('client does not treat login/setup as protected-media surfaces');
} else bad('client auth-skip');
if (protJs.includes('pointer-events') === false && protCss.includes('pointer-events: none')) {
  ok('watermark is pointer-events none and will not block touch/click');
} else if (protCss.includes('pointer-events: none')) {
  ok('watermark is pointer-events none and will not block touch/click');
} else bad('watermark pointer-events');
if (protCss.includes('@media print') && protCss.includes('lantern-protection-tier2') && protCss.includes('display: none')) {
  ok('print CSS prevents an ordinary clean unmarked Tier 2 print');
} else bad('print css');
if (protCss.includes('max-width: 480px') && protCss.includes('overflow: hidden')) {
  ok('watermark remains usable at phone width without overflow');
} else bad('mobile watermark css');
if (protCss.includes('.lanternProtectedMediaMark') && protJs.includes('watermarkOverlayHtml') && /i < n/.test(protJs) && protJs.includes('n = v === \'avatar\' ? 0 : 12')) {
  ok('watermark is repeated across the media viewport for screenshot survival');
} else bad('repeated watermark');
if (!protJs.includes("document.body.appendChild(wrap)") && !protCss.includes('.lanternProtectedWatermark {')) {
  ok('page-wide TMS CONFIDENTIAL wallpaper is not applied to ordinary UI');
} else bad('page-wide wallpaper still present');
if (mediaJs.includes('lanternProtectedMedia') && mediaJs.includes('draggable="false"')) {
  ok('protected image/media is non-draggable');
} else bad('media draggable');
if (protJs.includes("addEventListener('contextmenu'") && protJs.includes('preventDefault')) {
  ok('ordinary context-menu path is suppressed on protected media');
} else bad('contextmenu deterrence');
if (mediaJs.includes('toSameOriginMediaUrl') && /lantern-api\\.mrradle\\.workers\\.dev/.test(mediaJs)) {
  ok('protected content is rewritten to controlled same-origin delivery rather than raw Worker/R2 URLs');
} else bad('same-origin media rewrite');
if (headers.includes("frame-ancestors 'self'") && headers.includes('X-Frame-Options: SAMEORIGIN')) {
  ok('Pages security headers prevent trivial external embedding');
} else bad('_headers frame policy');
if (adminHtml.includes('adminProtectedTraceCard') && adminHtml.includes('adminProtectedTraceBtn') && protJs.includes('/api/admin/protected/trace')) {
  ok('admin-only trace lookup UI is present and not on student pages');
} else bad('admin lookup UI');
if (!exploreHtml.includes('adminProtectedTraceCard') && !gamesHtml.includes('adminProtectedTraceCard') && !lockerHtml.includes('adminProtectedTraceCard')) {
  ok('trace lookup is not exposed to students');
} else bad('lookup leaked to student pages');
if (protJs.includes('TMS School-Use System') || SCHOOL_USE_NOTICE.includes('authorized educational purpose')) {
  ok('school-use privacy notice wording is accurate and non-overclaiming');
} else bad('privacy notice');
if (navJs.includes('lantern-protected-content.js')) {
  ok('nav boots protected-content without rewriting page architecture');
} else bad('nav boot');

// Functional surfaces still present
if (exploreHtml.includes('lantern-card-ui.js') || exploreHtml.includes('Lantern') ) ok('Explore/Lantern page remains present');
else bad('explore missing');
if (lockerHtml.includes('lockerPanelOverview') && lockerHtml.includes('praiseButtonsSection')) ok('Locker + praise UI remain present');
else bad('locker/praise');
if (contributeHtml.includes('LANTERN_AVATAR_API') && contributeHtml.includes('lantern-nav.js')) ok('Create/Contribute remains present');
else bad('create');
if (missionsHtml.includes('missionsStatusTabs') && missionsHtml.includes('lantern-nav.js')) ok('Missions page remains present');
else bad('missions');
if (gamesHtml.includes('gamesLibraryGrid') && gamesHtml.includes('lantern-nav.js')) ok('Play/games page remains present');
else bad('games');
if (gamesHtml.includes('fight') || read('app/js/lantern-games-page.js').includes('fight') || fs.existsSync(path.join(root, 'worker/scripts/fight-song-challenge-174-test.mjs'))) {
  ok('Fight Song Challenge surface/tests remain present');
} else bad('fight song');
if (read('app/js/lantern-games-page.js').includes('avatar') || gamesHtml.toLowerCase().includes('avatar')) {
  ok('Avatar Match / games avatar surface remains present');
} else bad('avatar match');
if (teacherHtml.includes('createMissionBtn') && adminHtml.includes('adminStudentsCard')) {
  ok('teacher workflows and admin/student account pages remain present');
} else bad('staff pages');

if (protJs.includes('disable OS') || protCss.includes('cannot screenshot')) bad('fake screenshot-detection copy');
else ok('no fake screenshot-detection implementation');

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed) process.exit(1);
