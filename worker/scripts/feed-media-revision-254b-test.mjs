/**
 * Prompt #254B — Feed / Mission / Poll contribution media revision parity.
 * Usage: node worker/scripts/feed-media-revision-254b-test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../index.js';
import { clearSidecarForSource, touchSidecarForOriginal } from '../image-thumbnails.js';
import { feedMediaRevisionTest, feedRevisionPayload, resolveFeedImageFromMediaAction } from '../feed-media-revision.js';
import { buildMissionResubmitContent } from '../mission-resubmit-media.js';
import { resolvePollContributionMedia, pollResubmitMediaTest } from '../poll-resubmit-media.js';

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

const createHtml = read('app/create.html');
const feedHandlers = read('worker/feed-handlers.js');
const feedMedia = read('worker/feed-media-revision.js');
const missionHandlers = read('worker/missions-handlers.js');
const missionMedia = read('worker/mission-resubmit-media.js');
const pollMedia = read('worker/poll-resubmit-media.js');
const indexSrc = read('worker/index.js');
const missionsHtml = read('app/missions.html');
const contribute = read('app/contribute.html');

assert(/LanternUnifiedMediaField/.test(createHtml) && /LanternMediaEdit/.test(createHtml), 'create.html uses shared media field');
assert(/getRevision/.test(createHtml) && /media_action/.test(createHtml), 'create sends media_action and loads revision');
assert(/\/api\/feed\/revision\//.test(feedHandlers), 'feed revision GET route');
assert(!/image_r2_key = COALESCE/.test(feedHandlers), 'feed update no longer uses COALESCE for image');
assert(/resolveFeedImageFromMediaAction/.test(feedHandlers), 'feed update uses explicit media_action via resolver');
assert(/client_media_key_not_allowed/.test(feedMedia) || /rejectClientMediaKeys/.test(feedMedia), 'feed rejects client R2 keys');
assert(/clearSidecarForSource/.test(feedMedia) && /touchSidecarForOriginal/.test(feedMedia), 'feed sidecar keep/replace/remove');
assert(/validateMissionSubmissionPayload/.test(missionHandlers.split('submissions/resubmit')[1] || ''), 'mission resubmit calls validateMissionSubmissionPayload');
assert(/buildMissionResubmitContent/.test(missionHandlers), 'mission resubmit uses media builder');
assert(/media_action/.test(missionMedia), 'mission media_action contract');
assert(/resolvePollContributionMedia/.test(indexSrc), 'poll resubmit uses media resolver');
assert(/applyPollContributionSidecar/.test(indexSrc), 'poll resubmit touches sidecar');
assert(!/fallbackResolved = imageUrl/.test(indexSrc.split('/api/polls/resubmit')[1] || ''), 'poll resubmit no ambiguous empty image_url fallback');
assert(/missionMediaEdit/.test(missionsHtml) && /media_action/.test(missionsHtml), 'missions.html resubmit media_action');
assert(/pollMediaEdit/.test(contribute) && /media_action/.test(contribute.split('pollMediaAction')[0] + contribute.split('pollMediaAction')[1]), 'contribute poll resubmit media_action');
assert(feedMediaRevisionTest.FORBIDDEN_CLIENT_KEYS.indexOf('image_r2_key') >= 0, 'forbidden client keys include image_r2_key');

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

const STUDENT_A = { username: 'lucas', display_name: 'Lucas', role: 'student', student_character_name: 'Lucas', mtss_student_id: 'SID-A', is_active: 1, must_change_password: 0 };
const STUDENT_B = { username: 'mia', display_name: 'Mia', role: 'student', student_character_name: 'Mia', mtss_student_id: 'SID-B', is_active: 1, must_change_password: 0 };

class MemBucket {
  constructor() { this.objects = new Map(); }
  async put(key, bytes) { this.objects.set(String(key), bytes); }
}

function makeFeedDb(state) {
  return {
    prepare(sql) {
      const s = String(sql);
      const binds = [];
      return {
        bind(...args) { binds.push(...args); return this; },
        async first() {
          if (s.includes('FROM lantern_feed_items WHERE id = ?')) return state.feed[binds[0]] || null;
          if (s.includes('FROM lantern_image_thumbnails')) return state.thumbs[`${binds[0]}:${binds[1]}`] || null;
          return null;
        },
        async run() {
          if (s.includes('UPDATE lantern_feed_items SET')) {
            const row = state.feed[binds[6]];
            if (row) {
              row.title = binds[0];
              row.body = binds[1];
              row.summary = binds[2];
              row.type = binds[3];
              row.image_r2_key = binds[4];
              row.tags = binds[5];
            }
          }
          if (s.includes('INSERT INTO lantern_image_thumbnails') || s.includes('UPDATE lantern_image_thumbnails')) {
            state.thumbWrites = (state.thumbWrites || 0) + 1;
          }
          if (s.includes('DELETE FROM lantern_image_thumbnails')) state.thumbClears = (state.thumbClears || 0) + 1;
          return { success: true };
        },
        all: async () => ({ results: [] }),
      };
    },
  };
}

async function testFeedMediaKeepReplaceRemove() {
  const bucket = new MemBucket();
  const priorKey = 'news/feed-prior-a.png';
  const state = {
    feed: {
      'feed-1': {
        id: 'feed-1', type: 'article', title: 'T', body: 'B', summary: 'B', status: 'returned',
        author_display_name: 'Lucas', author_id: 'lucas', image_r2_key: priorKey, tags: '[]',
      },
    },
    thumbs: { 'feed:feed-1': { source_kind: 'feed', source_id: 'feed-1', original_object_key: priorKey, image_version: 1 } },
    thumbWrites: 0,
    thumbClears: 0,
  };
  const db = makeFeedDb(state);

  const keep = await resolveFeedImageFromMediaAction({ media_action: 'keep' }, priorKey, bucket);
  assert(keep.ok && keep.imageKey === priorKey && !keep.sidecarClear, 'feed keep retains key');

  const removed = await resolveFeedImageFromMediaAction({ media_action: 'remove' }, priorKey, bucket);
  assert(removed.ok && removed.imageKey === null && removed.sidecarClear, 'feed remove clears key');

  const replaced = await resolveFeedImageFromMediaAction({
    media_action: 'replace', image: TINY_PNG_B64, mime_type: 'image/png', file_name: 'b.png',
  }, priorKey, bucket);
  assert(replaced.ok && replaced.imageKey && replaced.imageKey !== priorKey, 'feed replace new key');
  assert(replaced.sidecarTouchKey === replaced.imageKey, 'feed replace sidecar touch');
}

async function testMissionRequireImageReject() {
  const bucket = new MemBucket();
  const row = {
    submission_type: 'text',
    submission_content: JSON.stringify({ text: 'hello', image_url: 'https://x.test/api/news/image?key=news/prior.png' }),
  };
  const built = await buildMissionResubmitContent(
    { media_action: 'remove', submission_content: 'hello revised' },
    row,
    'https://x.test',
    bucket
  );
  assert(built.ok && !JSON.parse(built.content).image_url, 'mission remove strips image from envelope');
}

async function testPollMediaKeepRemove() {
  const bucket = new MemBucket();
  const prior = {
    image_url: 'https://x.test/api/news/image?key=news/poll-a.png',
    fallback_key: null,
  };
  const keep = await resolvePollContributionMedia({ media_action: 'keep' }, prior, 'https://x.test', bucket);
  assert(keep.ok && keep.imageUrl === prior.image_url, 'poll keep retains image_url');

  const remove = await resolvePollContributionMedia({ media_action: 'remove' }, prior, 'https://x.test', bucket);
  assert(remove.ok && remove.imageUrl === null && remove.fallbackKey === 'poll' && remove.sidecarClear, 'poll remove uses fallback');
}

await testFeedMediaKeepReplaceRemove();
await testMissionRequireImageReject();
await testPollMediaKeepRemove();

assert(typeof feedRevisionPayload === 'function', 'feedRevisionPayload exported');
assert(typeof pollResubmitMediaTest.isRealStudentImageUrl === 'function', 'poll student image helper');

console.log(`\n254B results: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
