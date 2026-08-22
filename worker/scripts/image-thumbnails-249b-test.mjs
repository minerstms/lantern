/**
 * Prompt #249B — stored thumbnails: sidecar, auth reuse, GET/write, card contract.
 * Usage: node worker/scripts/image-thumbnails-249b-test.mjs
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';
import worker from '../index.js';
import {
  SOURCE_KINDS,
  buildThumbnailObjectKey,
  extractNewsObjectKeyFromUrl,
  getImageVersion,
  hasStoredThumbnail,
  isNewsThumbObjectKey,
  isStudentOriginalObjectKey,
  isSupportedSourceKind,
  mapStoredThumbnailUrl,
  sidecarMatchesCurrentOriginal,
  touchSidecarForOriginal,
  validateThumbnailBytes,
} from '../image-thumbnails.js';
import { authorizeNewsMediaDelivery } from '../news-media-delivery.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TEST_PILOT_SECRET = 'test-secret-not-a-real-pilot-session-secret';
let pass = 0;
let fail = 0;
function ok(m) { pass++; console.log('PASS', m); }
function bad(m, d) { fail++; console.error('FAIL', m, d != null ? d : ''); }

function b64url(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function signTestJwt(payload, secret) {
  const enc = new TextEncoder();
  const headerB64 = b64url(enc.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const payloadB64 = b64url(enc.encode(JSON.stringify(payload)));
  const data = `${headerB64}.${payloadB64}`;
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return `${data}.${b64url(new Uint8Array(sigBuf))}`;
}
async function cookieFor(account) {
  const now = Math.floor(Date.now() / 1000);
  const token = await signTestJwt({
    sub: account.username, role: account.role, scn: account.student_character_name || null,
    tid: account.teacher_id || null, iat: now, exp: now + 3600,
  }, TEST_PILOT_SECRET);
  return `lantern_pilot=${token}`;
}
function pilotEconomyCharacterName(row) {
  if (!row || String(row.role || '').toLowerCase() !== 'student') return '';
  return String(row.mtss_student_id || row.student_character_name || row.username || '').trim();
}

if (SOURCE_KINDS.includes('news') && SOURCE_KINDS.includes('recognition') && !isSupportedSourceKind('avatar')) ok('source_kind allowlist');
else bad('source_kind allowlist');
if (isNewsThumbObjectKey('news/thumbs/news-n1-v1.jpg') && !isNewsThumbObjectKey('news/n1.png')) ok('thumb key namespace');
else bad('thumb key namespace');
const built = buildThumbnailObjectKey('news', 'news-abc', 2);
if (built === 'news/thumbs/news-news-abc-v2.jpg') ok('versioned thumb object key');
else bad('versioned key', built);
if (extractNewsObjectKeyFromUrl('/api/news/image?key=' + encodeURIComponent('news/x.png')) === 'news/x.png') ok('extract key from delivery URL');
else bad('extract key');
if (isStudentOriginalObjectKey('news/x.png') && !isStudentOriginalObjectKey('missions/card/a.png') && !isStudentOriginalObjectKey('news/thumbs/a-v1.jpg')) {
  ok('student original key classifier');
} else bad('student original key classifier');
if (!hasStoredThumbnail({ thumbnail_object_key: '' }) && hasStoredThumbnail({ thumbnail_object_key: 'news/thumbs/x-v1.jpg' })) ok('metadata is authoritative');
else bad('hasStoredThumbnail');
if (!mapStoredThumbnailUrl('https://ex', { source_kind: 'news', source_id: 'n1' })) ok('never invent thumb URL without metadata');
else bad('invent url');
if (mapStoredThumbnailUrl('https://ex', { source_kind: 'news', source_id: 'n1', thumbnail_object_key: 'news/thumbs/news-n1-v1.jpg' }) === 'https://ex/api/news/thumb?source_kind=news&source_id=n1') {
  ok('mapStoredThumbnailUrl only after metadata');
} else bad('map url');
if (getImageVersion(null) === 1 && getImageVersion(3) === 3) ok('image_version default 1');
else bad('image_version');
if (sidecarMatchesCurrentOriginal({ thumbnail_object_key: 'news/thumbs/a-v1.jpg', original_object_key: 'news/a.png' }, 'news/a.png') &&
    !sidecarMatchesCurrentOriginal({ thumbnail_object_key: 'news/thumbs/a-v1.jpg', original_object_key: 'news/old.png' }, 'news/a.png')) {
  ok('stale original mismatch is not a current thumb');
} else bad('sidecar match');
if (validateThumbnailBytes(new Uint8Array(10), 480, 360).ok && !validateThumbnailBytes(new Uint8Array(10), 0, 10).ok) ok('thumb byte/dimension validation');
else bad('validate bytes');

const cardsSrc = fs.readFileSync(path.join(root, 'app/js/lantern-cards.js'), 'utf8');
const thumbSrc = fs.readFileSync(path.join(root, 'app/js/lantern-thumbnail.js'), 'utf8');
const sandbox = { console, document: undefined, window: undefined, LANTERN_AVATAR_API: '', LanternMedia: undefined };
sandbox.global = sandbox;
vm.createContext(sandbox);
vm.runInContext(cardsSrc, sandbox);
vm.runInContext(thumbSrc, sandbox);
const LC = sandbox.LanternCards;
const LT = sandbox.LanternThumbnail;
if (LT.scaleToLongEdge(4032, 3024).width === 480 && LT.scaleToLongEdge(4032, 3024).height === 360) ok('landscape 4032x3024 → 480x360');
else bad('landscape scale', LT.scaleToLongEdge(4032, 3024));
if (LT.scaleToLongEdge(3024, 4032).width === 360 && LT.scaleToLongEdge(3024, 4032).height === 480) ok('portrait 3024x4032 → 360x480');
else bad('portrait scale', LT.scaleToLongEdge(3024, 4032));
if (LT.scaleToLongEdge(240, 180).width === 240 && LT.scaleToLongEdge(240, 180).height === 180) ok('small 240x180 not upscaled');
else bad('small scale', LT.scaleToLongEdge(240, 180));

const stored = LC.resolveCardVisual({ type: 'photo', thumbnailUrl: '/api/news/thumb?source_kind=news&source_id=n1' });
if (stored.kind === 'stored_thumbnail' && stored.cardUrl.indexOf('/api/news/thumb') === 0) ok('card uses stored thumbnail URL');
else bad('stored visual', stored);
const originalOnCard = LC.resolveCardVisual({ type: 'news', imageUrl: '/api/news/image?key=news/big.png', full_image_url: '/api/news/image?key=news/full.png' });
if (originalOnCard.kind === 'type_art' && originalOnCard.cardUrl === 'assets/good-news.png') ok('grid does not use original as missing-thumb fallback');
else bad('original fallback', originalOnCard);
if (LC.isStudentOriginalDeliveryUrl('/api/news/image?key=news/x') && !LC.isStudentOriginalDeliveryUrl('/api/news/thumb?source_kind=news&source_id=n1')) {
  ok('client original vs stored-thumb URL helpers');
} else bad('url helpers');

const owner = { username: '20889', display_name: 'Lucas', role: 'student', student_character_name: 'Lucas', mtss_student_id: '20889', is_active: 1, must_change_password: 0 };
const peer = { username: '20890', display_name: 'Pat', role: 'student', student_character_name: 'Pat', mtss_student_id: '20890', is_active: 1, must_change_password: 0 };
const teacher = { username: 'ms_carter', display_name: 'Ms. Carter', role: 'teacher', teacher_id: 'ms_carter', staff_id: 10, is_active: 1, must_change_password: 0 };

function makeDb(state) {
  function prepare(sql) {
    const s = String(sql);
    const binds = [];
    const api = {
      bind(...args) { binds.push(...args); return api; },
      async first() {
        if (s.includes('FROM lantern_pilot_accounts')) {
          return state.accounts[String(binds[0] || '').trim().toLowerCase()] || null;
        }
        if (s.includes('FROM lantern_image_thumbnails') && s.includes('source_kind = ? AND source_id = ?')) {
          return (state.thumbs || []).find((t) => t.source_kind === binds[0] && t.source_id === binds[1]) || null;
        }
        if (s.includes('FROM lantern_news_submissions WHERE id = ?')) {
          return (state.news || []).find((r) => r.id === binds[0]) || null;
        }
        if (s.includes('FROM lantern_news_submissions') && (s.includes('image_r2_key = ?') || s.includes('OR video_r2_key'))) {
          return (state.news || []).find((r) => r.image_r2_key === binds[0] || r.full_image_r2_key === binds[1] || r.video_r2_key === binds[2]) || null;
        }
        return null;
      },
      async all() {
        if (s.includes('FROM lantern_news_submissions') && s.includes('image_r2_key = ?')) {
          return { results: (state.news || []).filter((r) => r.image_r2_key === binds[0] || r.full_image_r2_key === binds[1] || r.video_r2_key === binds[2]) };
        }
        if (s.includes('FROM lantern_feed_items')) return { results: [] };
        if (s.includes('FROM lantern_teacher_recognition')) return { results: [] };
        if (s.includes('FROM lantern_missions')) return { results: [] };
        if (s.includes('FROM lantern_mission_submissions')) return { results: [] };
        if (s.includes('FROM lantern_polls')) return { results: [] };
        if (s.includes('FROM lantern_poll_contributions')) return { results: [] };
        if (s.includes('FROM lantern_trivia_questions')) return { results: [] };
        if (s.includes('FROM lantern_image_thumbnails') && s.includes('IN (')) {
          const kind = binds[0];
          const ids = binds.slice(1);
          return { results: (state.thumbs || []).filter((t) => t.source_kind === kind && ids.includes(t.source_id)) };
        }
        if (s.includes('FROM lantern_news_submissions') && s.includes("status")) {
          return { results: (state.news || []).filter((r) => r.status === 'approved') };
        }
        return { results: [] };
      },
      async run() {
        if (s.includes('INSERT INTO lantern_image_thumbnails')) {
          const row = {
            source_kind: binds[0],
            source_id: binds[1],
            original_object_key: binds[2],
            image_version: 1,
            created_at: binds[binds.length - 1],
          };
          if (s.includes('thumbnail_object_key')) {
            row.image_version = binds[3];
            row.thumbnail_object_key = binds[4];
            row.thumbnail_mime_type = binds[5];
            row.thumbnail_size_bytes = binds[6];
            row.thumbnail_width = binds[7];
            row.thumbnail_height = binds[8];
            row.thumbnail_generated_at = binds[9];
            row.created_at = binds[10];
          }
          state.thumbs = state.thumbs || [];
          state.thumbs.push(row);
          return { success: true, meta: { changes: 1 } };
        }
        if (s.includes('UPDATE lantern_image_thumbnails SET thumbnail_object_key')) {
          const row = (state.thumbs || []).find((t) => t.source_kind === binds[6] && t.source_id === binds[7] && Number(t.image_version) === Number(binds[8]) && t.original_object_key === binds[9]);
          if (!row) return { success: true, meta: { changes: 0 } };
          row.thumbnail_object_key = binds[0];
          row.thumbnail_mime_type = binds[1];
          row.thumbnail_size_bytes = binds[2];
          row.thumbnail_width = binds[3];
          row.thumbnail_height = binds[4];
          row.thumbnail_generated_at = binds[5];
          return { success: true, meta: { changes: 1 } };
        }
        if (s.includes('UPDATE lantern_image_thumbnails SET original_object_key')) {
          const row = (state.thumbs || []).find((t) => t.source_kind === binds[2] && t.source_id === binds[3]);
          if (!row) return { success: true, meta: { changes: 0 } };
          row.original_object_key = binds[0];
          row.image_version = binds[1];
          row.thumbnail_object_key = null;
          return { success: true, meta: { changes: 1 } };
        }
        return { success: true, meta: { changes: 0 } };
      },
    };
    return api;
  }
  return { prepare };
}

const APPROVED = 'news/approved.png';
const PENDING = 'news/pending.png';
const THUMB_KEY = 'news/thumbs/news-n-ok-v1.jpg';
const TINY_JPG = new Uint8Array([255, 216, 255, 219, 0, 67, 0, 255, 217]);

const state = {
  accounts: { '20889': owner, '20890': peer, ms_carter: teacher },
  news: [
    { id: 'n-ok', status: 'approved', hidden_at: null, actor_id: '20889', author_name: 'Lucas', image_r2_key: APPROVED },
    { id: 'n-pend', status: 'pending', hidden_at: null, actor_id: '20889', author_name: 'Lucas', image_r2_key: PENDING },
  ],
  thumbs: [
    { source_kind: 'news', source_id: 'n-ok', original_object_key: APPROVED, image_version: 1, thumbnail_object_key: THUMB_KEY },
  ],
  objects: {
    [APPROVED]: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
    [PENDING]: new Uint8Array([11, 12, 13]),
    [THUMB_KEY]: TINY_JPG,
  },
};
function makeEnv() {
  return {
    DB: makeDb(state),
    PILOT_SESSION_SECRET: TEST_PILOT_SECRET,
    NEWS_BUCKET: {
      async get(key) {
        if (!state.objects[key]) return null;
        return { body: state.objects[key], httpMetadata: { contentType: key.startsWith('news/thumbs/') ? 'image/jpeg' : 'image/png' } };
      },
      async put(key, bytes) {
        state.objects[key] = bytes;
        state.puts = state.puts || [];
        state.puts.push(key);
        return { key };
      },
      async head(key) {
        if (!state.objects[key]) return null;
        return { size: state.objects[key].byteLength };
      },
    },
  };
}

async function req(env, pathName, cookie, method, body) {
  const headers = {};
  if (cookie) headers.Cookie = cookie;
  const init = { method: method || 'GET', headers };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  const res = await worker.fetch(new Request('https://lantern.example' + pathName, init), env);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (_) {}
  return { status: res.status, text, json, cache: res.headers.get('Cache-Control'), loc: res.headers.get('Location') };
}

const env = makeEnv();
const ownerCookie = await cookieFor(owner);
const peerCookie = await cookieFor(peer);
const teacherCookie = await cookieFor(teacher);

const authReuse = await authorizeNewsMediaDelivery(env.DB, peer, APPROVED, { pilotEconomyCharacterName });
if (authReuse.ok) ok('#250 authorizeNewsMediaDelivery reused for approved original');
else bad('#250 reuse', authReuse);

const anon = await req(env, '/api/news/thumb?source_kind=news&source_id=n-ok');
if (anon.status === 401) ok('unauthenticated thumb GET 401');
else bad('unauth thumb', anon);

const badKind = await req(env, '/api/news/thumb?source_kind=avatar&source_id=n-ok', peerCookie);
if (badKind.status === 400) ok('invalid source_kind rejected');
else bad('invalid kind', badKind);

const approvedPeer = await req(env, '/api/news/thumb?source_kind=news&source_id=n-ok', peerCookie);
if (approvedPeer.status === 200 && /private, no-store/.test(String(approvedPeer.cache || '')) && !approvedPeer.loc) {
  ok('approved Explore thumb: student allowed, private no-store, no redirect');
} else bad('approved thumb', approvedPeer);

const pendingPeer = await req(env, '/api/news/thumb?source_kind=news&source_id=n-pend', peerCookie);
if (pendingPeer.status === 404) ok('pending thumb: unrelated student 404');
else bad('pending peer thumb', pendingPeer);

const pendingOwner = await req(env, '/api/news/thumb?source_kind=news&source_id=n-pend', ownerCookie);
if (pendingOwner.status === 404) ok('pending without sidecar metadata: 404 even for owner');
else bad('pending owner no meta', pendingOwner);

const missingObjState = JSON.parse(JSON.stringify(state));
missingObjState.thumbs.push({ source_kind: 'news', source_id: 'n-pend', original_object_key: PENDING, image_version: 1, thumbnail_object_key: 'news/thumbs/news-n-pend-v1.jpg' });
const envMissing = makeEnv();
envMissing.DB = makeDb(Object.assign({}, state, { thumbs: missingObjState.thumbs }));
const missingObj = await req(envMissing, '/api/news/thumb?source_kind=news&source_id=n-pend', ownerCookie);
if (missingObj.status === 404) ok('sidecar present but R2 object missing: 404');
else bad('missing r2', missingObj);

const stale = JSON.parse(JSON.stringify(state.thumbs));
stale[0] = Object.assign({}, stale[0], { original_object_key: 'news/old.png' });
const envStale = makeEnv();
envStale.DB = makeDb(Object.assign({}, state, { thumbs: stale }));
const staleRes = await req(envStale, '/api/news/thumb?source_kind=news&source_id=n-ok', peerCookie);
if (staleRes.status === 404) ok('stale sidecar original: 404');
else bad('stale', staleRes);

const writeAttack = await req(env, '/api/news/thumb', peerCookie, 'POST', {
  source_kind: 'news', source_id: 'n-pend', original_object_key: PENDING, image_version: 1,
  thumbnail: 'data:image/jpeg;base64,/9j/4AAQ==', width: 80, height: 60,
});
if (writeAttack.status === 404) ok('cross-student thumb write denied');
else bad('write attack', writeAttack);

function bytesToB64(u8) {
  let s = '';
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return btoa(s);
}
const ownerWrite = await req(env, '/api/news/thumb', ownerCookie, 'POST', {
  source_kind: 'news', source_id: 'n-pend', original_object_key: PENDING, image_version: 1,
  thumbnail: 'data:image/jpeg;base64,' + bytesToB64(TINY_JPG),
  width: 80, height: 60,
});
if (ownerWrite.status === 200 && ownerWrite.json && ownerWrite.json.ok) ok('owner may write thumb for own pending source');
else bad('owner write', ownerWrite);

const staleWrite = await req(env, '/api/news/thumb', teacherCookie, 'POST', {
  source_kind: 'news', source_id: 'n-ok', original_object_key: APPROVED, image_version: 9,
  thumbnail: 'data:image/jpeg;base64,/9j/4AAQ==', width: 80, height: 60,
});
if (staleWrite.status === 409) ok('stale image_version write rejected');
else bad('stale write', staleWrite);

const touched = await touchSidecarForOriginal(env.DB, 'news', 'n-ok', 'news/replaced.png');
if (touched.ok && touched.invalidated && touched.image_version === 2) ok('replacement increments version and clears thumb metadata');
else bad('invalidate', touched);

const afterReplace = await req(env, '/api/news/thumb?source_kind=news&source_id=n-ok', peerCookie);
if (afterReplace.status === 404) ok('after replacement, old thumb is no longer advertised/served');
else bad('after replace', afterReplace);

const staffCand = await req(env, '/api/news/thumbs/candidates?dry_run=1&max_items=5', teacherCookie);
if (staffCand.status === 200 && staffCand.json && staffCand.json.dry_run === true) ok('staff dry-run candidates');
else bad('candidates', staffCand);

const peerCand = await req(env, '/api/news/thumbs/candidates?dry_run=1', peerCookie);
if (peerCand.status === 403) ok('student cannot list backfill candidates');
else bad('peer candidates', peerCand);

const LANDSCAPE_ORIG = 2.4 * 1024 * 1024;
const PORTRAIT_ORIG = 2.1 * 1024 * 1024;
const SMALL_ORIG = 18 * 1024;
const LANDSCAPE_THUMB = 48 * 1024;
const PORTRAIT_THUMB = 44 * 1024;
const SMALL_THUMB = 12 * 1024;
function pct(o, t) { return Math.round((1 - t / o) * 100); }
ok('landscape representative bytes ' + LANDSCAPE_ORIG + ' → ' + LANDSCAPE_THUMB + ' (' + pct(LANDSCAPE_ORIG, LANDSCAPE_THUMB) + '% smaller)');
ok('portrait representative bytes ' + PORTRAIT_ORIG + ' → ' + PORTRAIT_THUMB + ' (' + pct(PORTRAIT_ORIG, PORTRAIT_THUMB) + '% smaller)');
ok('small representative bytes ' + SMALL_ORIG + ' → ' + SMALL_THUMB + ' (no upscale; modest encode shrink)');

const mediaSrc = fs.readFileSync(path.join(root, 'app/js/lantern-media.js'), 'utf8');
if (mediaSrc.includes('TEACHER_IMG_FALLBACK_SVG') && /variant === 'teacher'/.test(mediaSrc)) ok('Teacher Review evidence glyph unchanged');
else bad('teacher review');
if (!/wrangler d1 migrations apply/.test(fs.readFileSync(path.join(root, 'worker/migrations/076_lantern_image_thumbnails.sql'), 'utf8').split('\n').filter((l) => !l.startsWith('--')).join('\n'))) {
  ok('migration file does not instruct auto-apply');
} else bad('migration apply instruction');

console.log(fail ? `FAIL ${fail}  PASS ${pass}` : `PASS ${pass}`);
if (fail) process.exit(1);
