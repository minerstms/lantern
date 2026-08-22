/**
 * Prompt #249H — sidecar-without-thumbnail stays a candidate; no manual D1 repair.
 * Usage: node worker/scripts/thumb-sidecar-recovery-249h-test.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import worker from '../index.js';
import {
  getImageVersion,
  hasStoredThumbnail,
  sidecarHasCurrentThumbnail,
  sidecarOriginalIsCurrent,
  stripSourceIdPrefix,
  touchSidecarForOriginal,
} from '../image-thumbnails.js';
import { listBackfillCandidates } from '../image-thumbnail-routes.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const backfillJs = fs.readFileSync(path.join(root, 'app/js/lantern-thumbnail-backfill.js'), 'utf8');
const backfillHtml = fs.readFileSync(path.join(root, 'app/thumb-backfill.html'), 'utf8');
const TEST_PILOT_SECRET = 'test-secret-not-a-real-pilot-session-secret';
const TINY_JPG = new Uint8Array([255, 216, 255, 219, 0, 67, 0, 255, 217]);
const TINY_PNG = Uint8Array.from(atob(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
), (c) => c.charCodeAt(0));

let pass = 0;
let fail = 0;
function ok(m) { pass++; console.log('PASS', m); }
function bad(m, d) { fail++; console.error('FAIL', m, d != null ? d : ''); }

if (/Sidecar pending thumbnail/.test(backfillJs)) ok('Dry Run reports sidecar pending thumbnail');
else bad('pending counter');
if (/Source version updated — run Dry Run again/.test(backfillJs) && /Source version updated — run Dry Run again/.test(backfillHtml)) {
  ok('image_version_changed tells operator to Dry Run again');
} else bad('version hint');
if (!/automatically retry|autoRetry|retryWrites/.test(backfillJs)) ok('no invisible automatic write retry');
else bad('auto retry');

const FIXTURES = [
  {
    id: 'msub_1786548406723_y54zc9',
    character_name: 'staff:rick.radle',
    status: 'accepted',
    hidden_at: null,
    submission_type: 'text',
    submission_content:
      '{"text":"Thank you Ms. Shanda!","image_url":"/api/news/image?key=news%2Fnews-aa3f2624-c22e-4198-8cfa-0d8b6207756a"}',
    clean: 'news/news-aa3f2624-c22e-4198-8cfa-0d8b6207756a',
    dirty: 'news/news-aa3f2624-c22e-4198-8cfa-0d8b6207756a"}',
  },
  {
    id: 'msub_1787176314313_i82i0b',
    character_name: '121662',
    status: 'accepted',
    hidden_at: null,
    submission_type: 'text',
    submission_content:
      '{"text":"I was walking down a road and saw an alien that was barking, I think it was a dog that got infected and now everyone believes aliens.","image_url":"/api/news/image?key=news%2Fnews-65c5dfca-7bc8-46ff-9a54-160b7d1d845b"}',
    clean: 'news/news-65c5dfca-7bc8-46ff-9a54-160b7d1d845b',
    dirty: 'news/news-65c5dfca-7bc8-46ff-9a54-160b7d1d845b"}',
  },
];

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
    sub: account.username, role: account.role, scn: null, tid: account.teacher_id || null, iat: now, exp: now + 3600,
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
        return null;
      },
      async all() {
        if (s.includes('FROM lantern_mission_submissions') && s.includes('ORDER BY')) {
          return { results: (state.missions || []).filter((r) => String(r.status || '') === 'accepted') };
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
        if (s.includes('FROM lantern_news_submissions') && s.includes('ORDER BY')) return { results: [] };
        if (s.includes('FROM lantern_polls') && s.includes('ORDER BY')) return { results: [] };
        if (s.includes('FROM lantern_teacher_recognition') && s.includes('ORDER BY')) return { results: [] };
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
            image_version: s.includes('thumbnail_object_key') ? binds[3] : 1,
            created_at: binds[binds.length - 1],
          };
          if (s.includes('thumbnail_object_key')) {
            row.thumbnail_object_key = binds[4];
            row.thumbnail_mime_type = binds[5];
            row.thumbnail_size_bytes = binds[6];
            row.thumbnail_width = binds[7];
            row.thumbnail_height = binds[8];
            row.thumbnail_generated_at = binds[9];
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

function bytesToB64(u8) {
  let s = '';
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return btoa(s);
}

if (stripSourceIdPrefix('mission_submission:msub_1786548406723_y54zc9') === 'msub_1786548406723_y54zc9') {
  ok('failedIds prefix is stripped from source_id');
} else bad('prefix strip');

const pendingSide = {
  original_object_key: FIXTURES[0].clean,
  image_version: 2,
  thumbnail_object_key: null,
};
if (sidecarOriginalIsCurrent(pendingSide, FIXTURES[0].clean) && !sidecarHasCurrentThumbnail(pendingSide, FIXTURES[0].clean)) {
  ok('current sidecar + null thumb is not complete');
} else bad('pending completeness');
if (!hasStoredThumbnail(pendingSide)) ok('null thumbnail_object_key is not stored metadata');
else bad('hasStoredThumbnail null');

function seedState(fx, sidecar) {
  return {
    accounts: { ms_carter: teacher },
    missions: [fx],
    thumbs: [sidecar],
    objects: { [fx.clean]: TINY_PNG },
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
  return { status: res.status, json, text };
}

const teacherCookie = await cookieFor(teacher);

for (const fx of FIXTURES) {
  const label = fx.id;
  const state = seedState(fx, {
    source_kind: 'mission_submission',
    source_id: fx.id,
    original_object_key: fx.dirty,
    image_version: 1,
    thumbnail_object_key: null,
  });
  const env = {
    DB: makeDb(state),
    PILOT_SESSION_SECRET: TEST_PILOT_SECRET,
    NEWS_BUCKET: {
      async get(key) {
        if (!state.objects[key]) return null;
        return { body: state.objects[key], httpMetadata: { contentType: key.startsWith('news/thumbs/') ? 'image/jpeg' : 'image/png' } };
      },
      async put(key, bytes) {
        state.objects[key] = bytes;
        return { key };
      },
      async head(key) {
        if (!state.objects[key]) return null;
        return { size: state.objects[key].byteLength };
      },
    },
  };

  const dirtyList = await listBackfillCandidates(env.DB, 'https://lantern.example', {
    maxItems: 1,
    sourceKind: 'mission_submission',
    sourceId: 'mission_submission:' + fx.id,
  });
  if (dirtyList.length === 1 && dirtyList[0].original_object_key === fx.clean && dirtyList[0].image_version === 1 && dirtyList[0].sidecar_pending_thumbnail) {
    ok(label + ' dirty v1 sidecar is a candidate with clean original');
  } else bad(label + ' dirty list', dirtyList);

  const stale = await req(env, '/api/news/thumb', teacherCookie, 'POST', {
    source_kind: 'mission_submission',
    source_id: fx.id,
    original_object_key: fx.clean,
    image_version: 1,
    thumbnail: 'data:image/jpeg;base64,' + bytesToB64(TINY_JPG),
    width: 80,
    height: 60,
  });
  if (stale.status === 409 && stale.json && stale.json.error === 'image_version_changed') {
    ok(label + ' stale v1 write rejected');
  } else bad(label + ' stale write', stale);

  const sideAfter = state.thumbs.find((t) => t.source_id === fx.id);
  if (sideAfter.original_object_key === fx.clean && Number(sideAfter.image_version) === 2 && sideAfter.thumbnail_object_key == null) {
    ok(label + ' sidecar became clean current v2 with null thumb');
  } else bad(label + ' sidecar after stale', sideAfter);

  const pending = await listBackfillCandidates(env.DB, 'https://lantern.example', {
    maxItems: 1,
    sourceKind: 'mission_submission',
    sourceId: fx.id,
  });
  if (pending.length === 1 && pending[0].original_object_key === fx.clean && pending[0].image_version === 2 && pending[0].has_thumbnail === false && pending[0].has_sidecar === true) {
    ok(label + ' fresh Dry Run lists pending v2 sidecar');
  } else bad(label + ' pending list', pending);

  const v2 = await req(env, '/api/news/thumb', teacherCookie, 'POST', {
    source_kind: 'mission_submission',
    source_id: fx.id,
    original_object_key: fx.clean,
    image_version: 2,
    thumbnail: 'data:image/jpeg;base64,' + bytesToB64(TINY_JPG),
    width: 80,
    height: 60,
  });
  if (v2.status === 200 && v2.json && v2.json.ok) ok(label + ' fresh v2 write succeeds');
  else bad(label + ' v2 write', v2);

  const sideDone = state.thumbs.find((t) => t.source_id === fx.id);
  if (sideDone.thumbnail_object_key && sidecarHasCurrentThumbnail(sideDone, fx.clean) && getImageVersion(sideDone.image_version) === 2) {
    ok(label + ' thumbnail metadata is current after v2 write');
  } else bad(label + ' metadata after v2', sideDone);

  const after = await listBackfillCandidates(env.DB, 'https://lantern.example', {
    maxItems: 1,
    sourceKind: 'mission_submission',
    sourceId: fx.id,
  });
  if (after.length === 0) ok(label + ' subsequent Dry Run no longer lists completed item');
  else bad(label + ' still listed', after);
}

const missingFx = FIXTURES[0];
const missingState = seedState(missingFx, {
  source_kind: 'mission_submission',
  source_id: missingFx.id,
  original_object_key: missingFx.clean,
  image_version: 2,
  thumbnail_object_key: 'news/thumbs/mission_submission-' + missingFx.id.replace(/[^A-Za-z0-9._-]/g, '_') + '-v2.jpg',
});
const missingEnv = {
  DB: makeDb(missingState),
  PILOT_SESSION_SECRET: TEST_PILOT_SECRET,
  NEWS_BUCKET: {
    async get(key) {
      if (!missingState.objects[key]) return null;
      return { body: missingState.objects[key], httpMetadata: { contentType: 'image/png' } };
    },
    async put(key, bytes) {
      missingState.objects[key] = bytes;
      missingState.puts = missingState.puts || [];
      missingState.puts.push(key);
      return { key };
    },
    async head(key) {
      if (!missingState.objects[key]) return null;
      return { size: missingState.objects[key].byteLength };
    },
  },
};
const skipped = await listBackfillCandidates(missingEnv.DB, 'https://lantern.example', {
  maxItems: 1,
  sourceKind: 'mission_submission',
  sourceId: missingFx.id,
});
if (skipped.length === 0) ok('listing cannot cheaply prove R2; complete metadata is skipped on Dry Run');
else bad('missing-r2 untargeted', skipped);

const recoverable = await listBackfillCandidates(missingEnv.DB, 'https://lantern.example', {
  maxItems: 1,
  sourceKind: 'mission_submission',
  sourceId: missingFx.id,
  recover: true,
});
if (recoverable.length === 1 && recoverable[0].has_thumbnail === true) {
  ok('targeted recover includes metadata-complete item for recognize');
} else bad('recover list', recoverable);

const rec = await req(missingEnv, '/api/news/thumbs/recognize', teacherCookie, 'POST', {
  source_kind: 'mission_submission',
  source_id: missingFx.id,
  image_version: 2,
});
if (rec.status === 404 && rec.json && rec.json.error === 'thumbnail_object_missing') {
  ok('recognize reports missing R2 thumb (batch can regenerate)');
} else bad('recognize missing', rec);

const regen = await req(missingEnv, '/api/news/thumb', teacherCookie, 'POST', {
  source_kind: 'mission_submission',
  source_id: missingFx.id,
  original_object_key: missingFx.clean,
  image_version: 2,
  thumbnail: 'data:image/jpeg;base64,' + bytesToB64(TINY_JPG),
  width: 80,
  height: 60,
});
if (regen.status === 200 && regen.json && regen.json.ok) ok('bounded write recovers missing R2 thumb');
else bad('regen', regen);

const noSide = {
  accounts: { ms_carter: teacher },
  missions: [FIXTURES[0]],
  thumbs: [],
  objects: { [FIXTURES[0].clean]: TINY_PNG },
};
const none = await listBackfillCandidates(makeDb(noSide), 'https://lantern.example', {
  maxItems: 1,
  sourceKind: 'mission_submission',
  sourceId: FIXTURES[0].id,
});
if (none.length === 1 && none[0].has_sidecar === false) ok('no sidecar remains a candidate');
else bad('no sidecar', none);

const staleSide = {
  source_kind: 'mission_submission',
  source_id: FIXTURES[0].id,
  original_object_key: FIXTURES[0].dirty,
  image_version: 1,
  thumbnail_object_key: 'news/thumbs/old.jpg',
};
const staleState = seedState(FIXTURES[0], staleSide);
const staleCands = await listBackfillCandidates(makeDb(staleState), 'https://lantern.example', {
  maxItems: 1,
  sourceKind: 'mission_submission',
  sourceId: FIXTURES[0].id,
});
if (staleCands.length === 1) ok('stale original sidecar remains a candidate');
else bad('stale sidecar', staleCands);

const touched = await touchSidecarForOriginal(makeDb(staleState), 'mission_submission', FIXTURES[0].id, FIXTURES[0].clean);
if (touched.ok && touched.invalidated && touched.image_version === 2) ok('stale sidecar sync advances version through authorized path');
else bad('touch stale', touched);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
