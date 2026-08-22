/**
 * Prompt #250 — per-object news media delivery authorization.
 * Usage: node worker/scripts/news-media-delivery-250-test.mjs
 */
import worker from '../index.js';
import {
  authorizeNewsMediaDelivery,
  contentReferencesObjectKey,
  findNewsMediaReferences,
  isMissionCardObjectKey,
  viewerMayReceiveNewsMedia,
} from '../news-media-delivery.js';
import { isNewsDeliveryObjectKey } from '../protected-content.js';
import { isNewsImageObjectKey, isNewsVideoObjectKey } from '../r2-key-guards.js';

const TEST_PILOT_SECRET = 'test-secret-not-a-real-pilot-session-secret';
let pass = 0;
let fail = 0;
function ok(label) {
  pass++;
  console.log('PASS', label);
}
function bad(label, detail) {
  fail++;
  console.error('FAIL', label, detail != null ? detail : '');
}

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
  const token = await signTestJwt(
    {
      sub: account.username,
      role: account.role,
      scn: account.student_character_name || null,
      tid: account.teacher_id || null,
      iat: now,
      exp: now + 3600,
    },
    TEST_PILOT_SECRET
  );
  return `lantern_pilot=${token}`;
}

function pilotEconomyCharacterName(row) {
  if (!row) return '';
  const role = String(row.role || '').trim().toLowerCase();
  if (role !== 'student') return '';
  const mid = row.mtss_student_id != null ? String(row.mtss_student_id).trim() : '';
  if (mid) return mid;
  const scn = row.student_character_name != null ? String(row.student_character_name).trim() : '';
  if (scn) return scn;
  return String(row.username || '').trim();
}

const owner = {
  username: '20889',
  display_name: 'Lucas',
  role: 'student',
  student_character_name: 'Lucas',
  mtss_student_id: '20889',
  is_active: 1,
  must_change_password: 0,
};
const peer = {
  username: '20890',
  display_name: 'Pat',
  role: 'student',
  student_character_name: 'Pat',
  mtss_student_id: '20890',
  is_active: 1,
  must_change_password: 0,
};
const teacher = {
  username: 'ms_carter',
  display_name: 'Ms. Carter',
  role: 'teacher',
  teacher_id: 'ms_carter',
  staff_id: 10,
  is_active: 1,
  must_change_password: 0,
};
const admin = {
  username: 'admin',
  display_name: 'Web Admin',
  role: 'admin',
  staff_id: 1,
  is_active: 1,
  must_change_password: 0,
};

if (contentReferencesObjectKey('/api/news/image?key=' + encodeURIComponent('news/news-abc'), 'news/news-abc')) {
  ok('encoded delivery URL matches exact key');
} else bad('encoded delivery URL');
if (!contentReferencesObjectKey('/api/news/image?key=' + encodeURIComponent('news/news-abcdef'), 'news/news-abc')) {
  ok('prefix key does not match a longer sibling key');
} else bad('prefix collision');
if (contentReferencesObjectKey('{"image_url":"news/missions/x.png"}', 'news/missions/x.png')) {
  ok('quoted raw key in JSON matches');
} else bad('json quoted key');
if (isMissionCardObjectKey('missions/card/mission-card-1.png') && !isMissionCardObjectKey('missions/student.png')) {
  ok('mission card namespace');
} else bad('mission card namespace');
if (isNewsDeliveryObjectKey('news/n1.png') && isNewsImageObjectKey('news/n1.png') && isNewsVideoObjectKey('news/video/v1.mp4')) {
  ok('existing key guards still classify image vs video');
} else bad('key guards');

const approvedNews = {
  source: 'news',
  row: { id: 'n-ok', status: 'approved', hidden_at: null, actor_id: '20889', author_name: 'Lucas' },
};
const pendingNews = {
  source: 'news',
  row: { id: 'n-pend', status: 'pending', hidden_at: null, actor_id: '20889', author_name: 'Lucas' },
};
const rejectedNews = {
  source: 'news',
  row: { id: 'n-rej', status: 'rejected', hidden_at: null, actor_id: '20889', author_name: 'Lucas' },
};
const hiddenNews = {
  source: 'news',
  row: { id: 'n-hid', status: 'approved', hidden_at: '2026-08-01T00:00:00.000Z', actor_id: '20889', author_name: 'Lucas' },
};
const acceptedMission = {
  source: 'mission_submission',
  row: {
    id: 'm-ok',
    status: 'accepted',
    hidden_at: null,
    character_name: '20889',
    submission_content: '/api/news/image?key=' + encodeURIComponent('news/mission-ok.png'),
  },
};
const pendingMission = {
  source: 'mission_submission',
  row: {
    id: 'm-pend',
    status: 'pending',
    hidden_at: null,
    character_name: '20889',
    submission_content: '/api/news/image?key=' + encodeURIComponent('news/mission-pend.png'),
  },
};
const liveRecognition = { source: 'recognition', row: { id: 'r1', character_name: 'Lucas' } };
const missionCard = { source: 'mission_card', row: { id: 'mc1', card_image_r2_key: 'missions/card/art.png' } };

if (viewerMayReceiveNewsMedia(peer, [approvedNews], pilotEconomyCharacterName)) ok('approved explore: unrelated student allowed');
else bad('approved peer');
if (viewerMayReceiveNewsMedia(teacher, [approvedNews], pilotEconomyCharacterName)) ok('approved explore: staff allowed');
else bad('approved staff');
if (!viewerMayReceiveNewsMedia(peer, [pendingNews], pilotEconomyCharacterName)) ok('pending: unrelated student denied');
else bad('pending peer');
if (viewerMayReceiveNewsMedia(owner, [pendingNews], pilotEconomyCharacterName)) ok('pending: submitting student allowed');
else bad('pending owner');
if (viewerMayReceiveNewsMedia(teacher, [pendingNews], pilotEconomyCharacterName)) ok('pending: review staff allowed');
else bad('pending staff');
if (!viewerMayReceiveNewsMedia(peer, [rejectedNews], pilotEconomyCharacterName)) ok('rejected: unrelated student denied');
else bad('rejected peer');
if (viewerMayReceiveNewsMedia(owner, [rejectedNews], pilotEconomyCharacterName)) ok('rejected: owner locker history allowed');
else bad('rejected owner');
if (viewerMayReceiveNewsMedia(admin, [rejectedNews], pilotEconomyCharacterName)) ok('rejected: admin review allowed');
else bad('rejected admin');
if (!viewerMayReceiveNewsMedia(peer, [hiddenNews], pilotEconomyCharacterName)) ok('hidden: unrelated student denied');
else bad('hidden peer');
if (viewerMayReceiveNewsMedia(owner, [hiddenNews], pilotEconomyCharacterName)) ok('hidden: owner locker allowed');
else bad('hidden owner');
if (viewerMayReceiveNewsMedia(teacher, [hiddenNews], pilotEconomyCharacterName)) ok('hidden: review staff allowed');
else bad('hidden staff');
if (viewerMayReceiveNewsMedia(peer, [acceptedMission], pilotEconomyCharacterName)) ok('accepted mission media: authenticated student allowed');
else bad('accepted mission peer');
if (!viewerMayReceiveNewsMedia(peer, [pendingMission], pilotEconomyCharacterName)) ok('pending mission media: unrelated student denied');
else bad('pending mission peer');
if (viewerMayReceiveNewsMedia(peer, [liveRecognition], pilotEconomyCharacterName)) ok('teacher recognition media: authenticated student allowed');
else bad('recognition peer');
if (viewerMayReceiveNewsMedia(peer, [missionCard], pilotEconomyCharacterName)) ok('mission card art: authenticated student allowed');
else bad('mission card peer');
if (!viewerMayReceiveNewsMedia(peer, [], pilotEconomyCharacterName)) ok('no refs: denied');
else bad('empty refs');

function makeMediaDb(state) {
  function prepare(sql) {
    const s = String(sql);
    const binds = [];
    const api = {
      bind(...args) {
        binds.push(...args);
        return api;
      },
      async first() {
        if (s.includes('FROM lantern_pilot_accounts WHERE lower(trim(username))')) {
          return state.accounts[String(binds[0] || '').trim().toLowerCase()] || null;
        }
        return null;
      },
      async all() {
        const key = binds[0];
        const matchKeyCols = (rows, cols) => rows.filter((r) => cols.some((c) => r[c] === key));
        const matchUrl = (rows, col) => rows.filter((r) => contentReferencesObjectKey(r[col], key));
        if (s.includes('FROM lantern_news_submissions')) {
          return { results: matchKeyCols(state.news || [], ['image_r2_key', 'full_image_r2_key', 'video_r2_key']) };
        }
        if (s.includes('FROM lantern_feed_items')) {
          return { results: matchKeyCols(state.feed || [], ['image_r2_key', 'video_r2_key']) };
        }
        if (s.includes('FROM lantern_teacher_recognition')) {
          return { results: matchKeyCols(state.recognition || [], ['image_r2_key', 'full_image_r2_key', 'video_r2_key']) };
        }
        if (s.includes('FROM lantern_missions')) {
          return { results: matchKeyCols(state.missions || [], ['card_image_r2_key']) };
        }
        if (s.includes('FROM lantern_mission_submissions')) {
          return { results: matchUrl(state.missionSubs || [], 'submission_content') };
        }
        if (s.includes('FROM lantern_polls') && !s.includes('lantern_poll_contributions')) {
          return { results: matchUrl(state.polls || [], 'image_url') };
        }
        if (s.includes('FROM lantern_poll_contributions')) {
          return { results: matchUrl(state.contribs || [], 'image_url') };
        }
        if (s.includes('FROM lantern_trivia_questions')) {
          return { results: matchKeyCols(state.trivia || [], ['image_r2_key']) };
        }
        return { results: [] };
      },
      async run() {
        return { success: true, meta: { changes: 0 } };
      },
    };
    return api;
  }
  return { prepare };
}

function makeEnv(state) {
  const objects = state.objects || {};
  return {
    DB: makeMediaDb(state),
    PILOT_SESSION_SECRET: TEST_PILOT_SECRET,
    NEWS_BUCKET: {
      async get(key) {
        if (!objects[key]) return null;
        return { body: objects[key], httpMetadata: { contentType: key.startsWith('news/video/') ? 'video/mp4' : 'image/png' } };
      },
    },
  };
}

async function req(env, pathName, cookie) {
  const headers = {};
  if (cookie) headers.Cookie = cookie;
  const res = await worker.fetch(new Request('https://lantern.example' + pathName, { method: 'GET', headers }), env);
  const text = await res.text();
  return { status: res.status, text: text, cache: res.headers.get('Cache-Control') };
}

const APPROVED_KEY = 'news/approved.png';
const PENDING_KEY = 'news/pending.png';
const HIDDEN_KEY = 'news/hidden.png';
const REJECTED_KEY = 'news/rejected.png';
const VIDEO_KEY = 'news/video/approved.mp4';
const ORPHAN_KEY = 'news/orphan.png';
const CARD_KEY = 'missions/card/unsaved.png';
const SAVED_CARD_KEY = 'missions/card/saved.png';

const state = {
  accounts: {
    '20889': owner,
    '20890': peer,
    ms_carter: teacher,
    admin: admin,
  },
  news: [
    { id: 'n-ok', status: 'approved', hidden_at: null, actor_id: '20889', author_name: 'Lucas', image_r2_key: APPROVED_KEY },
    { id: 'n-pend', status: 'pending', hidden_at: null, actor_id: '20889', author_name: 'Lucas', image_r2_key: PENDING_KEY },
    { id: 'n-hid', status: 'approved', hidden_at: '2026-08-01T00:00:00.000Z', actor_id: '20889', author_name: 'Lucas', image_r2_key: HIDDEN_KEY },
    { id: 'n-rej', status: 'rejected', hidden_at: null, actor_id: '20889', author_name: 'Lucas', image_r2_key: REJECTED_KEY },
    { id: 'n-vid', status: 'approved', hidden_at: null, actor_id: '20889', author_name: 'Lucas', video_r2_key: VIDEO_KEY },
  ],
  missions: [{ id: 'mission-1', card_image_r2_key: SAVED_CARD_KEY }],
  objects: {
    [APPROVED_KEY]: new Uint8Array([1]),
    [PENDING_KEY]: new Uint8Array([2]),
    [HIDDEN_KEY]: new Uint8Array([3]),
    [REJECTED_KEY]: new Uint8Array([4]),
    [VIDEO_KEY]: new Uint8Array([5]),
    [ORPHAN_KEY]: new Uint8Array([6]),
    [CARD_KEY]: new Uint8Array([7]),
    [SAVED_CARD_KEY]: new Uint8Array([8]),
  },
};
const env = makeEnv(state);
const ownerCookie = await cookieFor(owner);
const peerCookie = await cookieFor(peer);
const teacherCookie = await cookieFor(teacher);
const adminCookie = await cookieFor(admin);

const found = await findNewsMediaReferences(env.DB, APPROVED_KEY);
if (found.length === 1 && found[0].source === 'news') ok('findNewsMediaReferences locates approved news row');
else bad('find refs', found);

const orphanAuth = await authorizeNewsMediaDelivery(env.DB, peer, ORPHAN_KEY, { pilotEconomyCharacterName });
if (!orphanAuth.ok && orphanAuth.status === 404) ok('authorize: orphan key denied');
else bad('authorize orphan', orphanAuth);

const staffCard = await authorizeNewsMediaDelivery(env.DB, teacher, CARD_KEY, { pilotEconomyCharacterName });
if (staffCard.ok) ok('authorize: staff may preview unreferenced mission card');
else bad('staff card', staffCard);

const peerCard = await authorizeNewsMediaDelivery(env.DB, peer, CARD_KEY, { pilotEconomyCharacterName });
if (!peerCard.ok && peerCard.status === 404) ok('authorize: student cannot fetch unreferenced mission card');
else bad('peer card', peerCard);

const anon = await req(env, '/api/news/image?key=' + encodeURIComponent(APPROVED_KEY));
if (anon.status === 401) ok('unauthenticated denied');
else bad('unauth', anon);

const invalidNs = await req(env, '/api/news/image?key=avatars/x.png', peerCookie);
if (invalidNs.status === 403) ok('invalid key namespace denied');
else bad('invalid ns', invalidNs);

const approvedPeer = await req(env, '/api/news/image?key=' + encodeURIComponent(APPROVED_KEY), peerCookie);
if (approvedPeer.status === 200 && /private, no-store/.test(String(approvedPeer.cache || ''))) {
  ok('approved explore: authenticated student allowed with private no-store');
} else bad('approved peer http', approvedPeer);

const approvedStaff = await req(env, '/api/news/image?key=' + encodeURIComponent(APPROVED_KEY), teacherCookie);
if (approvedStaff.status === 200 && /private, no-store/.test(String(approvedStaff.cache || ''))) {
  ok('approved explore: authenticated staff allowed');
} else bad('approved staff http', approvedStaff);

const pendingOwner = await req(env, '/api/news/image?key=' + encodeURIComponent(PENDING_KEY), ownerCookie);
if (pendingOwner.status === 200) ok('pending: submitting student allowed');
else bad('pending owner http', pendingOwner);

const pendingStaff = await req(env, '/api/news/image?key=' + encodeURIComponent(PENDING_KEY), teacherCookie);
if (pendingStaff.status === 200) ok('pending: review staff allowed');
else bad('pending staff http', pendingStaff);

const pendingPeer = await req(env, '/api/news/image?key=' + encodeURIComponent(PENDING_KEY), peerCookie);
if (pendingPeer.status === 404 && pendingPeer.text === 'Not Found') ok('pending: unrelated student 404');
else bad('pending peer http', pendingPeer);

const hiddenPeer = await req(env, '/api/news/image?key=' + encodeURIComponent(HIDDEN_KEY), peerCookie);
if (hiddenPeer.status === 404) ok('hidden: unrelated student 404');
else bad('hidden peer http', hiddenPeer);

const hiddenStaff = await req(env, '/api/news/image?key=' + encodeURIComponent(HIDDEN_KEY), adminCookie);
if (hiddenStaff.status === 200) ok('hidden: admin review allowed');
else bad('hidden admin http', hiddenStaff);

const rejectedPeer = await req(env, '/api/news/image?key=' + encodeURIComponent(REJECTED_KEY), peerCookie);
if (rejectedPeer.status === 404) ok('rejected: unrelated student 404');
else bad('rejected peer http', rejectedPeer);

const rejectedOwner = await req(env, '/api/news/image?key=' + encodeURIComponent(REJECTED_KEY), ownerCookie);
if (rejectedOwner.status === 200) ok('rejected: owner locker allowed');
else bad('rejected owner http', rejectedOwner);

const orphanHttp = await req(env, '/api/news/image?key=' + encodeURIComponent(ORPHAN_KEY), peerCookie);
if (orphanHttp.status === 404 && orphanHttp.text === 'Not Found') ok('orphan key: 404 without disclosing R2 existence');
else bad('orphan http', orphanHttp);

const videoPeer = await req(env, '/api/news/video?key=' + encodeURIComponent(VIDEO_KEY), peerCookie);
if (videoPeer.status === 200 && /private, no-store/.test(String(videoPeer.cache || ''))) {
  ok('approved video: authenticated student allowed with private no-store');
} else bad('video peer', videoPeer);

const videoPendingPeer = await req(env, '/api/news/video?key=news/video/missing.mp4', peerCookie);
if (videoPendingPeer.status === 404) ok('unreferenced video key: 404');
else bad('video orphan', videoPendingPeer);

const savedCardPeer = await req(env, '/api/news/image?key=' + encodeURIComponent(SAVED_CARD_KEY), peerCookie);
if (savedCardPeer.status === 200) ok('saved mission card art: authenticated student allowed');
else bad('saved card', savedCardPeer);

const unsavedCardPeer = await req(env, '/api/news/image?key=' + encodeURIComponent(CARD_KEY), peerCookie);
if (unsavedCardPeer.status === 404) ok('unreferenced mission card: student 404');
else bad('unsaved card peer', unsavedCardPeer);

const unsavedCardStaff = await req(env, '/api/news/image?key=' + encodeURIComponent(CARD_KEY), teacherCookie);
if (unsavedCardStaff.status === 200) ok('unreferenced mission card: staff create-preview allowed');
else bad('unsaved card staff', unsavedCardStaff);

console.log(fail ? `FAIL ${fail}  PASS ${pass}` : `PASS ${pass}`);
if (fail) process.exit(1);
