/**
 * Prompt #102 — Create-a-Poll must not publish a second Explore mission card for the
 * system event-completion marker (confirmed:poll:pcontrib_...).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { collectApprovedFeed } from '../feed-handlers.js';
import { isSystemMissionEventMarkerSubmission } from '../mission-event-completions.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
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
function assert(cond, msg, detail) {
  if (cond) ok(msg);
  else bad(msg, detail);
}

assert(
  isSystemMissionEventMarkerSubmission({
    submission_type: 'confirmation',
    reviewed_by: 'system',
    submission_content: 'confirmed:poll:pcontrib_1786564450449_vhfpnvdi',
  }),
  '1. poll progress marker is system event marker'
);
assert(
  !isSystemMissionEventMarkerSubmission({
    submission_type: 'text',
    reviewed_by: 'system',
    submission_content: 'Teacher photo caption',
  }),
  '2. staff immediate photo (text + system reviewer) is NOT an event marker'
);
assert(
  !isSystemMissionEventMarkerSubmission({
    submission_type: 'confirmation',
    reviewed_by: 'Ms. Carter',
    submission_content: 'I confirm',
  }),
  '3. teacher-reviewed confirmation mission is NOT filtered as system marker'
);

const feedSrc = fs.readFileSync(path.join(root, 'worker/feed-handlers.js'), 'utf8');
const indexSrc = fs.readFileSync(path.join(root, 'worker/index.js'), 'utf8');
assert(/isSystemMissionEventMarkerSubmission/.test(feedSrc), '4. Explore mission fetch filters system markers');
assert(
  /ensureContentApprovedMissionCompletion\(db,\s*env,\s*'poll'/.test(indexSrc),
  '5. poll contribute still records Create-a-Poll mission progress'
);
assert(/finalizePollContributionPublish/.test(indexSrc), '6. poll contribute still publishes real lantern_polls row');

function makeFeedDb({ missions, polls, titles }) {
  const missionRows = missions || [];
  const pollRows = polls || [];
  const missionTitles = titles || {};
  return {
    prepare(sql) {
      const s = String(sql).replace(/\s+/g, ' ').trim();
      const api = {
        bind(...args) {
          api._binds = args;
          return api;
        },
        async all() {
          if (s.includes('FROM lantern_mission_submissions')) return { results: missionRows };
          if (s.includes('FROM lantern_feed_items')) return { results: [] };
          if (s.includes('FROM lantern_news_submissions')) return { results: [] };
          if (s.includes('FROM lantern_polls')) return { results: pollRows };
          if (s.includes('FROM lantern_teacher_recognition')) return { results: [] };
          if (s.includes('FROM lantern_missions')) {
            const ids = api._binds || [];
            return {
              results: ids.map((id) => ({
                id,
                title: Object.prototype.hasOwnProperty.call(missionTitles, id) ? missionTitles[id] : '',
              })),
            };
          }
          if (s.includes('FROM lantern_pilot_accounts')) return { results: [] };
          throw new Error('Unhandled feed SQL: ' + s.slice(0, 120));
        },
        async first() {
          return null;
        },
      };
      return api;
    },
  };
}

const marker = {
  id: 'msub_evt_create_poll_jeffrey_hecht',
  mission_id: 'perm_create_a_poll',
  character_name: 'Jeffrey Hecht',
  submission_type: 'confirmation',
  submission_content: 'confirmed:poll:pcontrib_1786564450449_vhfpnvdi',
  status: 'accepted',
  created_at: '2026-08-12T19:54:10.630Z',
  reviewed_at: '2026-08-12T19:54:10.630Z',
  reviewed_by: 'system',
};
const ordinary = {
  id: 'msub_real_help',
  mission_id: 'tmission_help',
  character_name: '20889',
  submission_type: 'text',
  submission_content: 'I helped a classmate with math.',
  status: 'accepted',
  created_at: '2026-08-12T18:00:00.000Z',
  reviewed_at: '2026-08-12T18:05:00.000Z',
  reviewed_by: 'Rick Radle',
};
const poll = {
  id: 'poll_1786564450493_6jqmbvp0',
  mission_submission_id: 'contrib:pcontrib_1786564450449_vhfpnvdi',
  question: 'What part of summer will you miss the most?',
  choices_json: JSON.stringify(['Friends', 'Travel', 'Sleep']),
  image_url: 'https://example.com/poll.png',
  character_name: 'Jeffrey Hecht',
  created_at: '2026-08-12T19:54:10.449Z',
  approved_at: '2026-08-12T19:54:10.449Z',
};

const feed = await collectApprovedFeed(
  makeFeedDb({
    missions: [marker, ordinary],
    polls: [poll],
    titles: {
      perm_create_a_poll: 'Create a Poll',
      tmission_help: 'Help Someone',
    },
  }),
  'https://tmslantern.org',
  { limit: 20 }
);

assert(
  feed.some((it) => it.type === 'poll' && it.id === 'poll:poll_1786564450493_6jqmbvp0'),
  '7. real poll Explore item present'
);
assert(
  !feed.some((it) => it.id === 'mission:msub_evt_create_poll_jeffrey_hecht'),
  '8. confirmation token mission card excluded from Explore'
);
assert(
  !feed.some((it) => String(it.body || '').includes('confirmed:poll:')),
  '9. no Explore body shows confirmed:poll: token'
);
assert(
  feed.some((it) => it.id === 'mission:msub_real_help'),
  '10. ordinary accepted mission contribution still on Explore'
);

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed) process.exit(1);
