/**
 * Prompt #254A — News/Shout-Out revision media + ownership + sidecar.
 * Usage: node worker/scripts/news-media-revision-254a-test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../index.js';
import { clearSidecarForSource } from '../image-thumbnails.js';
import { newsResubmitTest } from '../news-resubmit.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let pass = 0;
let fail = 0;
function ok(msg) { pass++; console.log('PASS', msg); }
function bad(msg, detail) { fail++; console.error('FAIL', msg, detail != null ? detail : ''); }
function assert(cond, msg, detail) {
  if (cond) ok(msg);
  else bad(msg, detail);
}
function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }

const contrib = read('app/contribute.html');
const um = read('app/js/lantern-unified-media-field.js');
const rev = read('app/js/lantern-locker-revision.js');
const newsResubmitSrc = read('worker/news-resubmit.js');
const thumbs = read('worker/image-thumbnails.js');

assert(/LanternMediaEdit/.test(um) && /intent/.test(um), 'shared LanternMediaEdit keep/replace/remove');
assert(/CURRENT IMAGE/.test(um) && /data-media-edit="undo"/.test(um), 'current-media + undo copy');
assert(/Use this/.test(um) && /Cancel change/.test(um), 'replace confirm actions');
assert(/applyNewsRevisionHydrate/.test(contrib) && /media_action/.test(contrib), 'contribute hydrates and sends media_action');
assert(/contributeRevisionFeedback/.test(contrib) && /Teacher feedback/.test(contrib), 'revision editor shows teacher feedback');
assert(/if \(peoplePayload && peoplePayload.length\) resubmitBody\.people/.test(contrib), 'resubmit omits empty people (keep)');
assert(!/newsUnifiedField\.clearPreview\(\)/.test(contrib.split('function handleImageFile')[1].split('function handleVideoFile')[0]), 'replace does not clearPreview (preserves existing + Cropper)');
assert(/openCropperFromDataUrl/.test(contrib) && /cropperUseBtn/.test(contrib), 'Cropper remains for News/Shout-Out');
assert(/contribute_type/.test(rev) && /shoutout/.test(rev), 'locker revise preserves Shout-Out type');
assert(/accountOwnsNewsRow/.test(newsResubmitSrc) && /student_owner_required/.test(newsResubmitSrc), 'resubmit requires student owner');
assert(/client_media_key_not_allowed/.test(newsResubmitSrc), 'client R2 keys rejected');
assert(/putNewsImageBytes/.test(newsResubmitSrc) && /putNewsVideoBytes/.test(newsResubmitSrc), 'replace uploads on the server');
assert(/clearSidecarForSource/.test(thumbs) && /DELETE FROM lantern_image_thumbnails/.test(thumbs), 'sidecar clear helper');
assert(!/CREATE TABLE/.test(newsResubmitSrc), 'no migration in resubmit helper');
assert(!/\.delete\(/.test(newsResubmitSrc), 'resubmit never deletes R2 objects');
assert(newsResubmitTest.FORBIDDEN_CLIENT_KEYS.indexOf('image_r2_key') >= 0, 'forbidden client key list includes image_r2_key');
const lockerState = read('worker/locker-item-state.js');
assert(!/image_r2_key/.test(lockerState) && !/video_r2_key/.test(lockerState), 'archive/reopen does not reset News media columns');
assert(/reopen_revision/.test(read('app/js/lantern-locker-org.js')), 'Reopen & Revise remains on archived returned items');

const TEST_PILOT_SECRET = 'test-secret-not-a-real-pilot-session-secret';
const TINY_PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

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
    sub: account.username,
    role: account.role,
    scn: account.student_character_name || null,
    tid: account.teacher_id || null,
    iat: now,
    exp: now + 3600,
  }, TEST_PILOT_SECRET);
  return `lantern_pilot=${token}`;
}

const STUDENT_A = {
  username: 'lucas',
  display_name: 'Lucas',
  role: 'student',
  student_character_name: 'Lucas',
  mtss_student_id: 'SID-A',
  is_active: 1,
  must_change_password: 0,
};
const STUDENT_B = {
  username: 'mia',
  display_name: 'Mia',
  role: 'student',
  student_character_name: 'Mia',
  mtss_student_id: 'SID-B',
  is_active: 1,
  must_change_password: 0,
};
const TEACHER = {
  username: 'mslee',
  display_name: 'Ms Lee',
  role: 'teacher',
  teacher_id: 't1',
  is_active: 1,
  must_change_password: 0,
};

function baseNews(overrides) {
  return Object.assign({
    id: 'news-1',
    title: 'Hello',
    body: 'Story',
    actor_id: 'SID-A',
    author_name: 'Lucas',
    author_type: 'student',
    image_r2_key: 'news/orig-a.png',
    full_image_r2_key: null,
    image_file_name: 'a.png',
    image_mime_type: 'image/png',
    image_file_size: 12,
    photo_credit: 'Photog A',
    video_r2_key: null,
    video_file_name: null,
    video_mime_type: null,
    video_file_size: null,
    link_url: null,
    category: 'School News',
    status: 'returned',
    decision_note: 'Please fix the photo',
  }, overrides || {});
}

function makeEnv(state) {
  state.accounts = state.accounts || {
    lucas: STUDENT_A,
    mia: STUDENT_B,
    mslee: TEACHER,
  };
  state.news = state.news || {};
  state.sidecars = state.sidecars || {};
  state.people = state.people || [];
  state.approvals = state.approvals || [];
  state.events = state.events || [];
  state.puts = state.puts || [];
  state.peopleReplaced = 0;
  state.failNextNewsUpdate = !!state.failNextNewsUpdate;

  function prepare(sql) {
    const s = String(sql);
    const binds = [];
    const api = {
      bind(...args) { binds.push(...args); return api; },
      async first() {
        if (s.includes('FROM lantern_pilot_accounts WHERE lower(trim(username))')) {
          return state.accounts[String(binds[0] || '').trim().toLowerCase()] || null;
        }
        if (s.includes('FROM lantern_news_submissions WHERE id')) {
          return state.news[binds[0]] || null;
        }
        if (s.includes('FROM lantern_approvals')) {
          return state.approvals.find((a) => a.item_id === binds[1]) || null;
        }
        if (s.includes('FROM lantern_image_thumbnails')) {
          return state.sidecars[binds[0] + ':' + binds[1]] || null;
        }
        return null;
      },
      async all() {
        if (s.includes('FROM lantern_content_people')) {
          return { results: state.people.filter((p) => p.content_id === binds[1]) };
        }
        return { results: [] };
      },
      async run() {
        if (s.includes('INSERT INTO lantern_moderation_events')) {
          state.events.push({ item_id: binds[2], event_type: binds[3], snapshot_json: binds[8] || binds[7] });
          return { success: true };
        }
        if (s.includes('DELETE FROM lantern_content_people')) {
          state.peopleReplaced += 1;
          state.people = state.people.filter((p) => !(p.content_id === binds[1]));
          return { success: true };
        }
        if (s.includes('INSERT INTO lantern_content_people')) {
          state.people.push({
            content_id: binds[2],
            person_kind: binds[3],
            person_key: binds[4],
            relationship: binds[5],
            display_label: binds[6],
          });
          return { success: true };
        }
        if (s.includes('DELETE FROM lantern_image_thumbnails')) {
          delete state.sidecars[binds[0] + ':' + binds[1]];
          return { success: true };
        }
        if (s.includes('INSERT INTO lantern_image_thumbnails')) {
          state.sidecars[binds[0] + ':' + binds[1]] = {
            source_kind: binds[0],
            source_id: binds[1],
            original_object_key: binds[2],
            image_version: 1,
            thumbnail_object_key: null,
          };
          return { success: true };
        }
        if (s.includes('UPDATE lantern_image_thumbnails SET original_object_key')) {
          const key = binds[2] + ':' + binds[3];
          const row = state.sidecars[key] || {};
          state.sidecars[key] = {
            source_kind: binds[2],
            source_id: binds[3],
            original_object_key: binds[0],
            image_version: binds[1],
            thumbnail_object_key: null,
          };
          return { success: true, meta: { changes: row ? 1 : 0 } };
        }
        if (s.includes('UPDATE lantern_news_submissions')) {
          if (state.failNextNewsUpdate) {
            state.failNextNewsUpdate = false;
            throw new Error('simulated_update_fail');
          }
          const id = binds[binds.length - 2];
          const row = state.news[id];
          if (!row) return { success: false };
          row.title = binds[0];
          row.body = binds[1];
          row.category = binds[2];
          row.image_r2_key = binds[3];
          row.full_image_r2_key = binds[4];
          row.photo_credit = binds[8];
          row.video_r2_key = binds[9];
          row.link_url = binds[13];
          row.status = binds[14];
          row.decision_note = binds[18];
          return { success: true };
        }
        if (s.includes('UPDATE lantern_approvals')) {
          return { success: true };
        }
        return { success: true };
      },
    };
    return api;
  }

  return {
    DB: { prepare },
    PILOT_SESSION_SECRET: TEST_PILOT_SECRET,
    NEWS_BUCKET: {
      async put(key, bytes) {
        state.puts.push({ key, size: bytes && bytes.length });
        return { key };
      },
    },
    state,
  };
}

async function call(env, path, opts) {
  const url = 'https://lantern.test' + path;
  const res = await worker.fetch(new Request(url, opts || {}), env, {});
  const text = await res.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch (_) { body = { raw: text }; }
  return { status: res.status, body };
}

{
  const db = { prepare() { return { bind() { return this; }, async run() { return { success: true }; }, async first() { return { original_object_key: 'news/a', image_version: 2 }; } }; } };
  const cleared = await clearSidecarForSource(db, 'news', 'news-1');
  assert(cleared.ok, 'clearSidecarForSource returns ok');
}

{
  const state = {
    news: { 'news-1': baseNews() },
    sidecars: { 'news:news-1': { original_object_key: 'news/orig-a.png', image_version: 3, thumbnail_object_key: 'news/thumbs/news-1-v3.jpg' } },
  };
  const env = makeEnv(state);
  const cookie = await cookieFor(STUDENT_A);
  const keep = await call(env, '/api/news/resubmit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ id: 'news-1', title: 'Hello edited', body: 'Story edited', media_action: 'keep' }),
  });
  assert(keep.body.ok && keep.body.id === 'news-1', 'keep resubmit same id');
  assert(state.news['news-1'].image_r2_key === 'news/orig-a.png', 'keep retains original A');
  assert(state.news['news-1'].photo_credit === 'Photog A', 'keep retains photo credit');
  assert(state.sidecars['news:news-1'].image_version === 3, 'keep does not bump image_version');
  assert(state.sidecars['news:news-1'].thumbnail_object_key === 'news/thumbs/news-1-v3.jpg', 'keep leaves stored thumb');
  assert(state.puts.length === 0, 'keep does not upload');
}

{
  const state = {
    news: { 'news-1': baseNews() },
    sidecars: { 'news:news-1': { original_object_key: 'news/orig-a.png', image_version: 1, thumbnail_object_key: 'news/thumbs/old.jpg' } },
  };
  const env = makeEnv(state);
  const cookie = await cookieFor(STUDENT_A);
  const replace = await call(env, '/api/news/resubmit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      id: 'news-1',
      title: 'Hello',
      body: 'Story',
      media_action: 'replace',
      media_kind: 'image',
      image: 'data:image/png;base64,' + TINY_PNG_B64,
      mime_type: 'image/png',
    }),
  });
  assert(replace.body.ok && replace.body.image_r2_key && replace.body.image_r2_key !== 'news/orig-a.png', 'replace sets new B key');
  assert(state.news['news-1'].image_r2_key === replace.body.image_r2_key, 'row current original is B');
  assert(state.news['news-1'].photo_credit == null, 'replace clears old photo credit');
  assert(state.sidecars['news:news-1'].original_object_key === replace.body.image_r2_key, 'sidecar original is B');
  assert(state.sidecars['news:news-1'].thumbnail_object_key == null, 'old thumb metadata cleared');
  assert(state.sidecars['news:news-1'].image_version === 2, 'sidecar version advanced');
  assert(state.puts.length === 1, 'replace uploaded once');
}

{
  const state = {
    news: { 'news-1': baseNews() },
    sidecars: { 'news:news-1': { original_object_key: 'news/orig-a.png', image_version: 1, thumbnail_object_key: 't.jpg' } },
    r2Exists: true,
  };
  const env = makeEnv(state);
  const cookie = await cookieFor(STUDENT_A);
  const removed = await call(env, '/api/news/resubmit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ id: 'news-1', title: 'Hello', body: 'Story', media_action: 'remove' }),
  });
  assert(removed.body.ok && !state.news['news-1'].image_r2_key, 'remove clears current image');
  assert(!state.sidecars['news:news-1'], 'remove deletes sidecar row');
  assert(state.news['news-1'].photo_credit == null, 'remove clears photo credit');
  assert(state.puts.length === 0, 'remove does not delete or re-put R2');
}

{
  const state = { news: { 'news-1': baseNews({ category: 'Student Spotlight', body: 'Recognizing: Mia\n\nGreat job' }) } };
  const env = makeEnv(state);
  const cookie = await cookieFor(STUDENT_A);
  const loaded = await call(env, '/api/news/revision/news-1', { method: 'GET', headers: { Cookie: cookie } });
  assert(loaded.body.ok && loaded.body.item.contribute_type === 'shoutout', 'revision GET preserves Shout-Out');
  assert(
    loaded.body.item.image_r2_key === 'news/orig-a.png' &&
      loaded.body.item.image_url &&
      loaded.body.item.image_url.indexOf('/api/news/image?key=') >= 0,
    'revision GET includes current image url'
  );
}

{
  const state = { news: { 'news-1': baseNews({ image_r2_key: null, video_r2_key: 'news/video/v1.mp4' }) } };
  const env = makeEnv(state);
  const cookie = await cookieFor(STUDENT_A);
  const keepVid = await call(env, '/api/news/resubmit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ id: 'news-1', title: 'Hello', body: 'Story', media_action: 'keep' }),
  });
  assert(keepVid.body.ok && state.news['news-1'].video_r2_key === 'news/video/v1.mp4', 'video keep retains key');
}
{
  const state = { news: { 'news-1': baseNews({ image_r2_key: null, video_r2_key: 'news/video/v1.mp4' }) } };
  const env = makeEnv(state);
  const rmVid = await call(env, '/api/news/resubmit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: await cookieFor(STUDENT_A) },
    body: JSON.stringify({ id: 'news-1', title: 'Hello', body: 'Story', media_action: 'remove' }),
  });
  assert(rmVid.body.ok && !state.news['news-1'].video_r2_key, 'video remove clears key');
}

{
  const state = { news: { 'news-1': baseNews({ image_r2_key: null, link_url: 'https://example.test/a' }) } };
  const env = makeEnv(state);
  const cookie = await cookieFor(STUDENT_A);
  const keepL = await call(env, '/api/news/resubmit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ id: 'news-1', title: 'Hello', body: 'Story', media_action: 'keep' }),
  });
  assert(keepL.body.ok && state.news['news-1'].link_url === 'https://example.test/a', 'link keep');
}
{
  const state = { news: { 'news-1': baseNews({ image_r2_key: null, link_url: 'https://example.test/a' }) } };
  const env = makeEnv(state);
  const repL = await call(env, '/api/news/resubmit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: await cookieFor(STUDENT_A) },
    body: JSON.stringify({
      id: 'news-1',
      title: 'Hello',
      body: 'Story',
      media_action: 'replace',
      media_kind: 'link',
      link_url: 'https://example.test/b',
    }),
  });
  assert(repL.body.ok && state.news['news-1'].link_url === 'https://example.test/b', 'link replace');
}

{
  const state = { news: { 'news-1': baseNews() } };
  const env = makeEnv(state);
  const cookieB = await cookieFor(STUDENT_B);
  const steal = await call(env, '/api/news/resubmit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieB },
    body: JSON.stringify({ id: 'news-1', title: 'Hacked', body: 'Nope', media_action: 'remove' }),
  });
  assert(steal.status === 403 && state.news['news-1'].title === 'Hello', 'student B cannot mutate A');
  assert(state.news['news-1'].image_r2_key === 'news/orig-a.png', 'student B cannot remove A media');
  const keyAttack = await call(env, '/api/news/resubmit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: await cookieFor(STUDENT_A) },
    body: JSON.stringify({
      id: 'news-1',
      title: 'Hello',
      body: 'Story',
      media_action: 'replace',
      media_kind: 'image',
      image_r2_key: 'news/stolen.png',
    }),
  });
  assert(keyAttack.body.error === 'client_media_key_not_allowed', 'client-supplied R2 key rejected');
  const teacher = await call(env, '/api/news/resubmit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: await cookieFor(TEACHER) },
    body: JSON.stringify({ id: 'news-1', title: 'Hello', body: 'Story', media_action: 'keep' }),
  });
  assert(teacher.body.error === 'student_owner_required', 'teacher cannot student-resubmit');
}

{
  const state = { news: { 'news-1': baseNews() }, failNextNewsUpdate: true };
  const env = makeEnv(state);
  const cookie = await cookieFor(STUDENT_A);
  let threw = false;
  try {
    await call(env, '/api/news/resubmit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        id: 'news-1',
        title: 'Hello',
        body: 'Story',
        media_action: 'replace',
        media_kind: 'image',
        image: 'data:image/png;base64,' + TINY_PNG_B64,
        mime_type: 'image/png',
      }),
    });
  } catch (_) {
    threw = true;
  }
  assert(threw || state.news['news-1'].image_r2_key === 'news/orig-a.png', 'failed DB save leaves A current');
  assert(state.news['news-1'].image_r2_key === 'news/orig-a.png', 'A remains authoritative after failed replace');
}

{
  const state = { news: { 'news-1': baseNews({ status: 'approved' }) } };
  const env = makeEnv(state);
  const approved = await call(env, '/api/news/resubmit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: await cookieFor(STUDENT_A) },
    body: JSON.stringify({ id: 'news-1', title: 'Hello', body: 'Story', media_action: 'keep' }),
  });
  assert(!approved.body.ok, 'approved work cannot be owner-edited');
}

{
  const state = {
    news: { 'news-1': baseNews() },
    people: [{ content_id: 'news-1', person_kind: 'student', person_key: 'SID-B', relationship: 'tagged', display_label: 'Mia' }],
  };
  const env = makeEnv(state);
  const cookie = await cookieFor(STUDENT_A);
  const keepPeople = await call(env, '/api/news/resubmit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ id: 'news-1', title: 'Hello', body: 'Story', media_action: 'keep', people: [] }),
  });
  assert(keepPeople.body.ok && state.peopleReplaced === 0, 'empty people array on keep does not clear tags');
  assert(state.people.length === 1 && state.people[0].person_key === 'SID-B', 'people remain preloaded unless edited');
}

{
  const state = {
    news: { 'news-1': baseNews({ image_r2_key: null, video_r2_key: 'news/video/v1.mp4' }) },
  };
  const env = makeEnv(state);
  const cookie = await cookieFor(STUDENT_A);
  const repVid = await call(env, '/api/news/resubmit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      id: 'news-1',
      title: 'Hello',
      body: 'Story',
      media_action: 'replace',
      media_kind: 'video',
      video: 'data:video/mp4;base64,' + TINY_PNG_B64,
      mime_type: 'video/mp4',
    }),
  });
  assert(repVid.body.ok && state.news['news-1'].video_r2_key && state.news['news-1'].video_r2_key !== 'news/video/v1.mp4', 'video replace sets new key');
  assert(!state.news['news-1'].image_r2_key, 'video replace does not invent image key');
  assert(state.puts.length === 1 && String(state.puts[0].key).indexOf('news/video/') === 0, 'video replace uses video put path');
}

{
  const state = { news: { 'news-1': baseNews() } };
  const env = makeEnv(state);
  const stealGet = await call(env, '/api/news/revision/news-1', {
    method: 'GET',
    headers: { Cookie: await cookieFor(STUDENT_B) },
  });
  assert(stealGet.status === 403, 'student B cannot load A revision');
  const ident = await call(env, '/api/news/revision/news-1?student_id=SID-A', {
    method: 'GET',
    headers: { Cookie: await cookieFor(STUDENT_A) },
  });
  assert(ident.body.error === 'identity_params_not_allowed', 'revision GET rejects identity selectors');
}

{
  const state = { news: { 'news-1': baseNews() } };
  const env = makeEnv(state);
  const withCredit = await call(env, '/api/news/resubmit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: await cookieFor(STUDENT_A) },
    body: JSON.stringify({
      id: 'news-1',
      title: 'Hello',
      body: 'Story',
      media_action: 'replace',
      media_kind: 'image',
      image: 'data:image/png;base64,' + TINY_PNG_B64,
      mime_type: 'image/png',
      photo_credit: 'Photog B',
    }),
  });
  assert(withCredit.body.ok && state.news['news-1'].photo_credit === 'Photog B', 'replace keeps only newly entered photo credit');
}

{
  const state = {
    news: { 'news-1': baseNews({ image_r2_key: 'news/orig-a.png', link_url: null }) },
    sidecars: { 'news:news-1': { original_object_key: 'news/orig-a.png', image_version: 1, thumbnail_object_key: 'old.jpg' } },
  };
  const env = makeEnv(state);
  const toLink = await call(env, '/api/news/resubmit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: await cookieFor(STUDENT_A) },
    body: JSON.stringify({
      id: 'news-1',
      title: 'Hello',
      body: 'Story',
      media_action: 'replace',
      media_kind: 'link',
      link_url: 'https://example.test/new',
    }),
  });
  assert(toLink.body.ok && state.news['news-1'].link_url === 'https://example.test/new', 'image→link replace sets link');
  assert(!state.news['news-1'].image_r2_key, 'image→link clears image key');
  assert(!state.sidecars['news:news-1'], 'image→link clears sidecar');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
