/**
 * Prompt #249G — mission-submission thumbnail key extraction + sidecar self-repair.
 * Usage: node worker/scripts/thumb-mission-parser-249g-test.mjs
 */
import { fileURLToPath } from 'url';
import path from 'path';
import worker from '../index.js';
import {
  extractNewsObjectKeyFromUrl,
  missionSubmissionOriginalKey,
  resolveSourceOriginal,
  touchSidecarForOriginal,
  isStudentOriginalObjectKey,
} from '../image-thumbnails.js';
import { listBackfillCandidates } from '../image-thumbnail-routes.js';
import { extractMissionSubmissionMedia } from '../missions-auth.js';
import { authorizeNewsMediaDelivery } from '../news-media-delivery.js';
import { isNewsDeliveryObjectKey } from '../protected-content.js';
import { isNewsImageObjectKey, isSafeObjectKey } from '../r2-key-guards.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
void root;
const TEST_PILOT_SECRET = 'test-secret-not-a-real-pilot-session-secret';

let pass = 0;
let fail = 0;
function ok(m) { pass++; console.log('PASS', m); }
function bad(m, d) { fail++; console.error('FAIL', m, d != null ? d : ''); }

function assertCleanKey(key, label) {
  if (!key) {
    bad(label + ' missing key');
    return false;
  }
  if (/["'}\s]/.test(key)) {
    bad(label + ' contains delimiter', key);
    return false;
  }
  if (!isSafeObjectKey(key) || !(isNewsDeliveryObjectKey(key) || isNewsImageObjectKey(key))) {
    bad(label + ' failed news-key validation', key);
    return false;
  }
  if (!isStudentOriginalObjectKey(key)) {
    bad(label + ' not a student original key', key);
    return false;
  }
  ok(label);
  return true;
}

const FIXTURE_1 = {
  id: 'msub_1786548406723_y54zc9',
  character_name: 'staff:rick.radle',
  status: 'accepted',
  hidden_at: null,
  submission_type: 'text',
  submission_content:
    '{"text":"Thank you Ms. Shanda!","image_url":"/api/news/image?key=news%2Fnews-aa3f2624-c22e-4198-8cfa-0d8b6207756a"}',
};
const FIXTURE_2 = {
  id: 'msub_1787176314313_i82i0b',
  character_name: '121662',
  status: 'accepted',
  hidden_at: null,
  submission_type: 'text',
  submission_content:
    '{"text":"I was walking down a road and saw an alien that was barking, I think it was a dog that got infected and now everyone believes aliens.","image_url":"/api/news/image?key=news%2Fnews-65c5dfca-7bc8-46ff-9a54-160b7d1d845b"}',
};
const CLEAN_1 = 'news/news-aa3f2624-c22e-4198-8cfa-0d8b6207756a';
const CLEAN_2 = 'news/news-65c5dfca-7bc8-46ff-9a54-160b7d1d845b';
const DIRTY_1 = CLEAN_1 + '"}';
const DIRTY_2 = CLEAN_2 + '"}';

const TINY_PNG = Uint8Array.from(atob(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
), (c) => c.charCodeAt(0));

const teacher = {
  username: 'ms_carter',
  display_name: 'Ms. Carter',
  role: 'teacher',
  teacher_id: 'ms_carter',
  staff_id: 10,
  is_active: 1,
  must_change_password: 0,
};

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
        if (s.includes('FROM lantern_mission_submissions WHERE id = ?')) {
          return (state.missions || []).find((r) => r.id === binds[0]) || null;
        }
        if (s.includes('FROM lantern_news_submissions WHERE id = ?')) {
          return (state.news || []).find((r) => r.id === binds[0]) || null;
        }
        if (s.includes('FROM lantern_polls WHERE id = ?')) {
          return (state.polls || []).find((r) => r.id === binds[0]) || null;
        }
        return null;
      },
      async all() {
        if (s.includes('FROM lantern_news_submissions') && s.includes('ORDER BY')) {
          return { results: (state.news || []).filter((r) => String(r.status || '').toLowerCase() === 'approved') };
        }
        if (s.includes('FROM lantern_polls') && s.includes('ORDER BY')) {
          return { results: state.polls || [] };
        }
        if (s.includes('FROM lantern_teacher_recognition') && s.includes('ORDER BY')) {
          return { results: state.recognition || [] };
        }
        if (s.includes('FROM lantern_mission_submissions') && s.includes("status") && s.includes('ORDER BY')) {
          return { results: (state.missions || []).filter((r) => String(r.status || '').toLowerCase() === 'accepted') };
        }
        if (s.includes('FROM lantern_mission_submissions') && s.includes('instr')) {
          const k = String(binds[0] || '');
          const enc = String(binds[1] || '');
          return {
            results: (state.missions || []).filter((r) => {
              const c = String(r.submission_content || '');
              return c.includes(k) || (enc && c.includes(enc));
            }),
          };
        }
        if (s.includes('FROM lantern_news_submissions')) return { results: [] };
        if (s.includes('FROM lantern_feed_items')) return { results: [] };
        if (s.includes('FROM lantern_teacher_recognition')) return { results: [] };
        if (s.includes('FROM lantern_missions')) return { results: [] };
        if (s.includes('FROM lantern_poll_contributions')) return { results: [] };
        if (s.includes('FROM lantern_trivia_questions')) return { results: [] };
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
          state.thumbs = state.thumbs || [];
          state.thumbs.push(row);
          return { success: true, meta: { changes: 1 } };
        }
        if (s.includes('UPDATE lantern_image_thumbnails SET original_object_key')) {
          const row = (state.thumbs || []).find((t) => t.source_kind === binds[2] && t.source_id === binds[3]);
          if (!row) return { success: true, meta: { changes: 0 } };
          row.original_object_key = binds[0];
          row.image_version = binds[1];
          row.thumbnail_object_key = null;
          row.thumbnail_mime_type = null;
          row.thumbnail_size_bytes = null;
          row.thumbnail_width = null;
          row.thumbnail_height = null;
          row.thumbnail_generated_at = null;
          return { success: true, meta: { changes: 1 } };
        }
        return { success: true, meta: { changes: 0 } };
      },
    };
    return api;
  }
  return { prepare };
}

// ---- generic extractor hardening ----
if (extractNewsObjectKeyFromUrl('/api/news/image?key=' + encodeURIComponent('news/x.png')) === 'news/x.png') {
  ok('clean delivery URL still extracts');
} else bad('clean delivery URL');
if (extractNewsObjectKeyFromUrl('/api/news/image?key=' + encodeURIComponent(CLEAN_1) + '&w=1') === CLEAN_1) {
  ok('key then extra query param');
} else bad('extra query', extractNewsObjectKeyFromUrl('/api/news/image?key=' + encodeURIComponent(CLEAN_1) + '&w=1'));
if (extractNewsObjectKeyFromUrl('news/x.png') === 'news/x.png') ok('bare news key');
else bad('bare news key', extractNewsObjectKeyFromUrl('news/x.png'));
if (extractNewsObjectKeyFromUrl(FIXTURE_1.submission_content) === CLEAN_1) {
  ok('hardened extractor stops at JSON delimiters for fixture 1');
} else bad('raw JSON fixture 1', extractNewsObjectKeyFromUrl(FIXTURE_1.submission_content));
if (extractNewsObjectKeyFromUrl(FIXTURE_2.submission_content) === CLEAN_2) {
  ok('hardened extractor stops at JSON delimiters for fixture 2');
} else bad('raw JSON fixture 2', extractNewsObjectKeyFromUrl(FIXTURE_2.submission_content));
if (extractNewsObjectKeyFromUrl('not a url') === '') ok('non-url returns empty');
else bad('non-url');
if (extractNewsObjectKeyFromUrl('{"text":"x"}') === '') ok('JSON without image_url invents no key');
else bad('json no image');
if (extractNewsObjectKeyFromUrl('/api/news/image?key=library/art/a.png') === '') ok('library key rejected');
else bad('library');
if (extractNewsObjectKeyFromUrl('/api/news/image?key=news/video/a.mp4') === '') ok('video key rejected');
else bad('video key');
if (extractNewsObjectKeyFromUrl(DIRTY_1) === '') ok('polluted bare key rejected');
else bad('dirty bare', extractNewsObjectKeyFromUrl(DIRTY_1));

// ---- mission parser reuse ----
const media1 = extractMissionSubmissionMedia(FIXTURE_1.submission_type, FIXTURE_1.submission_content);
if (media1.image_url === '/api/news/image?key=news%2Fnews-aa3f2624-c22e-4198-8cfa-0d8b6207756a') {
  ok('extractMissionSubmissionMedia isolates fixture 1 image_url');
} else bad('media 1', media1);
if (missionSubmissionOriginalKey(FIXTURE_1) === CLEAN_1) ok('fixture 1 clean key');
else bad('fixture 1 key', missionSubmissionOriginalKey(FIXTURE_1));
if (missionSubmissionOriginalKey(FIXTURE_2) === CLEAN_2) ok('fixture 2 clean key');
else bad('fixture 2 key', missionSubmissionOriginalKey(FIXTURE_2));
assertCleanKey(missionSubmissionOriginalKey(FIXTURE_1), 'fixture 1 key validation');
assertCleanKey(missionSubmissionOriginalKey(FIXTURE_2), 'fixture 2 key validation');

const extraFields = {
  submission_type: 'text',
  submission_content: JSON.stringify({
    text: 'hello',
    image_url: '/api/news/image?key=' + encodeURIComponent(CLEAN_1),
    extra: 'after',
    note: 'more',
  }),
};
if (missionSubmissionOriginalKey(extraFields) === CLEAN_1) ok('JSON extra fields after image_url');
else bad('extra fields', missionSubmissionOriginalKey(extraFields));

const punct = {
  submission_type: 'text',
  submission_content: '{"text":"She said \\"wow\\"","image_url":"/api/news/image?key=' + encodeURIComponent(CLEAN_2) + '"}',
};
if (missionSubmissionOriginalKey(punct) === CLEAN_2) ok('JSON with quotes in text');
else bad('punct', missionSubmissionOriginalKey(punct));

const bareLegacy = {
  submission_type: 'image_url',
  submission_content: '/api/news/image?key=' + encodeURIComponent(CLEAN_1),
};
if (missionSubmissionOriginalKey(bareLegacy) === CLEAN_1) ok('bare legacy image_url type');
else bad('legacy', missionSubmissionOriginalKey(bareLegacy));

const plain = { submission_type: 'text', submission_content: 'just a written reflection' };
if (missionSubmissionOriginalKey(plain) === '') ok('plain text is not a candidate key');
else bad('plain', missionSubmissionOriginalKey(plain));

const malformed = { submission_type: 'text', submission_content: '{"text":"oops",' };
if (missionSubmissionOriginalKey(malformed) === '') ok('malformed JSON invents no key');
else bad('malformed', missionSubmissionOriginalKey(malformed));

const noImage = { submission_type: 'text', submission_content: JSON.stringify({ text: 'no photo' }) };
if (missionSubmissionOriginalKey(noImage) === '') ok('envelope without image_url invents no key');
else bad('no image_url', missionSubmissionOriginalKey(noImage));

const pollUrl = '/api/news/image?key=' + encodeURIComponent('news/poll-ok.png');
if (extractNewsObjectKeyFromUrl(pollUrl) === 'news/poll-ok.png') ok('poll-style URL unchanged');
else bad('poll url');

const newsKey = 'news/approved.png';
if (extractNewsObjectKeyFromUrl(newsKey) === newsKey) ok('news bare key unchanged');
else bad('news bare');

const recKey = 'recognition/r1.png';
if (extractNewsObjectKeyFromUrl(recKey) === recKey) ok('recognition bare key unchanged');
else bad('recognition');

// ---- resolve / candidates / sidecar / #250 ----
const state = {
  accounts: { ms_carter: teacher },
  missions: [FIXTURE_1, FIXTURE_2, Object.assign({ id: 'msub_plain' }, plain, { character_name: '121662', status: 'accepted', hidden_at: null })],
  news: [{ id: 'n-ok', status: 'approved', hidden_at: null, actor_id: '20889', author_name: 'Lucas', image_r2_key: 'news/approved.png' }],
  polls: [{ id: 'p-ok', approved_at: '2026-08-01T00:00:00.000Z', hidden_at: null, image_url: pollUrl, character_name: 'Lucas' }],
  thumbs: [
    {
      source_kind: 'mission_submission',
      source_id: FIXTURE_1.id,
      original_object_key: DIRTY_1,
      image_version: 1,
      thumbnail_object_key: null,
    },
    {
      source_kind: 'mission_submission',
      source_id: FIXTURE_2.id,
      original_object_key: DIRTY_2,
      image_version: 1,
      thumbnail_object_key: null,
    },
  ],
  objects: {
    [CLEAN_1]: TINY_PNG,
    [CLEAN_2]: TINY_PNG,
    'news/approved.png': TINY_PNG,
    'news/poll-ok.png': TINY_PNG,
  },
};
const db = makeDb(state);

const src1 = await resolveSourceOriginal(db, 'mission_submission', FIXTURE_1.id);
if (src1 && src1.original_object_key === CLEAN_1) ok('resolveSourceOriginal fixture 1 clean');
else bad('resolve 1', src1);
const src2 = await resolveSourceOriginal(db, 'mission_submission', FIXTURE_2.id);
if (src2 && src2.original_object_key === CLEAN_2) ok('resolveSourceOriginal fixture 2 clean');
else bad('resolve 2', src2);

const cands = await listBackfillCandidates(db, 'https://lantern.example', {
  maxItems: 25,
  sourceKind: 'mission_submission',
});
const byId = Object.fromEntries((cands || []).map((c) => [c.source_id, c]));
if (byId[FIXTURE_1.id] && byId[FIXTURE_1.id].original_object_key === CLEAN_1) ok('candidate 1 listed with clean key');
else bad('cand 1', byId[FIXTURE_1.id]);
if (byId[FIXTURE_2.id] && byId[FIXTURE_2.id].original_object_key === CLEAN_2) ok('candidate 2 listed with clean key');
else bad('cand 2', byId[FIXTURE_2.id]);
if (!byId.msub_plain) ok('plain-text mission is not a thumbnail candidate');
else bad('plain listed', byId.msub_plain);
if (byId[FIXTURE_1.id] && byId[FIXTURE_1.id].has_thumbnail === false) ok('dirty sidecar without thumb remains retryable');
else bad('retryable', byId[FIXTURE_1.id]);

const repaired1 = await touchSidecarForOriginal(db, 'mission_submission', FIXTURE_1.id, CLEAN_1);
if (repaired1.ok && repaired1.invalidated && repaired1.image_version === 2) {
  ok('sidecar self-repair advances image_version 1 → 2');
} else bad('repair version', repaired1);
const side1 = state.thumbs.find((t) => t.source_id === FIXTURE_1.id);
if (side1.original_object_key === CLEAN_1 && side1.thumbnail_object_key == null) {
  ok('sidecar original_object_key replaced; stale thumb fields cleared');
} else bad('sidecar row', side1);

const repaired2 = await touchSidecarForOriginal(db, 'mission_submission', FIXTURE_2.id, CLEAN_2);
if (repaired2.ok && repaired2.invalidated && repaired2.image_version === 2) ok('fixture 2 sidecar self-repair');
else bad('repair 2', repaired2);
if (state.thumbs.find((t) => t.source_id === FIXTURE_2.id).original_object_key === CLEAN_2) {
  ok('no manual D1 repair required');
} else bad('manual repair still needed');

const teacherAuthClean = await authorizeNewsMediaDelivery(db, teacher, CLEAN_1, {});
if (teacherAuthClean.ok) ok('#250 allows staff for clean key');
else bad('#250 clean', teacherAuthClean);
const teacherAuthDirty = await authorizeNewsMediaDelivery(db, teacher, DIRTY_1, {});
if (!teacherAuthDirty.ok) ok('#250 still 404s polluted key');
else bad('#250 dirty allowed', teacherAuthDirty);

function makeEnv() {
  return {
    DB: db,
    PILOT_SESSION_SECRET: TEST_PILOT_SECRET,
    NEWS_BUCKET: {
      async get(key) {
        if (!state.objects[key]) return null;
        return { body: state.objects[key], httpMetadata: { contentType: 'image/png' } };
      },
    },
  };
}

async function req(pathName, cookie) {
  const res = await worker.fetch(new Request('https://lantern.example' + pathName, {
    headers: cookie ? { Cookie: cookie } : {},
  }), makeEnv());
  return { status: res.status, type: res.headers.get('Content-Type'), body: await res.text() };
}

const teacherCookie = await cookieFor(teacher);
const img1 = await req('/api/news/image?key=' + encodeURIComponent(CLEAN_1), teacherCookie);
if (img1.status === 200 && /image\//.test(String(img1.type || ''))) ok('authorized original GET fixture 1 returns image');
else bad('GET clean 1', img1);
const img2 = await req('/api/news/image?key=' + encodeURIComponent(CLEAN_2), teacherCookie);
if (img2.status === 200 && /image\//.test(String(img2.type || ''))) ok('authorized original GET fixture 2 returns image');
else bad('GET clean 2', img2);
const dirtyGet = await req('/api/news/image?key=' + encodeURIComponent(DIRTY_1), teacherCookie);
if (dirtyGet.status === 404) ok('polluted key GET remains 404');
else bad('GET dirty', dirtyGet);

const newsSrc = await resolveSourceOriginal(db, 'news', 'n-ok');
if (newsSrc && newsSrc.original_object_key === 'news/approved.png') ok('news source resolution unchanged');
else bad('news resolve', newsSrc);
const pollSrc = await resolveSourceOriginal(db, 'poll', 'p-ok');
if (pollSrc && pollSrc.original_object_key === 'news/poll-ok.png') ok('poll source resolution unchanged');
else bad('poll resolve', pollSrc);

const mixed = await listBackfillCandidates(db, 'https://lantern.example', { maxItems: 10 });
const kinds = {};
for (const c of mixed) kinds[c.source_kind] = (kinds[c.source_kind] || 0) + 1;
if (kinds.news >= 1 && kinds.poll >= 1 && kinds.mission_submission >= 2) ok('news/poll/mission candidates coexist');
else bad('mixed kinds', kinds);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
