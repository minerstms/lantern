/**
 * Prompt #211 — Poll publish / teacher immediate / approve finalize contract tests.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  finalizePollContributionPublish,
  isPollPublisherRole,
  parsePollChoices,
  resolvePollImageUrl,
} from '../poll-publish.js';

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

const workerIndex = fs.readFileSync(path.join(root, 'worker/index.js'), 'utf8');
const contributeHtml = fs.readFileSync(path.join(root, 'app/contribute.html'), 'utf8');
const pollPublish = fs.readFileSync(path.join(root, 'worker/poll-publish.js'), 'utf8');
const missions = fs.readFileSync(path.join(root, 'worker/missions-handlers.js'), 'utf8');

if (isPollPublisherRole('teacher') && isPollPublisherRole('admin') && !isPollPublisherRole('student')) {
  ok('publisher roles: teacher/admin yes, student no');
} else bad('publisher role helper wrong');

if (parsePollChoices('["A","B","C"]').length === 3 && parsePollChoices(['x', 'y']).length === 2) {
  ok('parsePollChoices works');
} else bad('parsePollChoices');

{
  const abs = resolvePollImageUrl({ image_url: '/api/news/image?key=abc' }, 'https://tmslantern.org');
  if (abs === 'https://tmslantern.org/api/news/image?key=abc') ok('relative poll image absolutized');
  else bad('relative poll image', abs);
}

if (pollPublish.includes('created_by_character') && pollPublish.includes('approved_at') && pollPublish.includes('mission_submission_id')) {
  ok('shared finalize writes created_by_character + approved_at + contrib key');
} else bad('shared finalize missing required columns');

if (workerIndex.includes('finalizePollContributionPublish') && workerIndex.includes('isPollPublisherRole')) {
  ok('worker uses shared poll publish helper');
} else bad('worker missing shared helper import/use');

{
  const contribIdx = workerIndex.indexOf("path === '/api/polls/contribute'");
  const slice = workerIndex.slice(contribIdx, contribIdx + 5500);
  if (slice.includes('getPilotAccountFromRequest') && slice.includes('staffPublisher') && slice.includes("status: 'approved'")) {
    ok('contribute: session auth + staff immediate approved');
  } else bad('contribute missing session immediate publish');
  if (slice.includes('forbidden') && slice.includes('clientClaim')) {
    ok('contribute: rejects student spoofing publisher role');
  } else bad('contribute missing spoof rejection');
}

{
  const apprIdx = workerIndex.indexOf("path === '/api/approvals/approve'");
  const slice = workerIndex.slice(apprIdx, apprIdx + 9000);
  if (slice.includes("item_type === 'poll_contribution'") && slice.includes('finalizePollContributionPublish')) {
    ok('approve: poll finalize via shared helper');
  } else bad('approve missing shared finalize');
  const finalizeBefore =
    slice.indexOf('finalizePollContributionPublish') < slice.indexOf("item_type === 'news'") ||
    slice.indexOf('finalizePollContributionPublish') < slice.indexOf("UPDATE lantern_approvals SET status");
  // Poll branch should finalize then update approval (or update only when pending after finalize)
  if (slice.includes('poll_publish_failed')) ok('approve: surface poll publish failures (no silent swallow)');
  else bad('approve still swallows poll failures');
}

if (missions.includes('created_by_character')) {
  ok('mission poll side-effect inserts created_by_character');
} else bad('mission poll insert still omits created_by_character');

if (contributeHtml.includes("credentials: 'include'") && contributeHtml.includes('Publish Poll') && contributeHtml.includes("pres.status")) {
  ok('contribute UI: credentials + Publish Poll + status toast');
} else bad('contribute UI missing staff poll publish UX');

// Idempotency unit with fake db
{
  const store = { polls: [], contribs: {} };
  const db = {
    prepare(sql) {
      const s = String(sql);
      return {
        bind(...args) {
          this._args = args;
          return this;
        },
        async first() {
          if (/FROM lantern_polls WHERE mission_submission_id/.test(s)) {
            return store.polls.find((p) => p.mission_submission_id === this._args[0]) || null;
          }
          return null;
        },
        async run() {
          if (/INSERT INTO lantern_polls/.test(s)) {
            store.polls.push({
              id: this._args[0],
              mission_submission_id: this._args[1],
              approved_at: this._args[this._args.length - 1],
              created_by_character: this._args[5] || this._args[4],
            });
          }
          if (/UPDATE lantern_poll_contributions/.test(s)) {
            store.contribs[this._args[this._args.length - 1]] = 'approved';
          }
          return { success: true };
        },
      };
    },
  };
  const pc = {
    id: 'pcontrib_test1',
    character_name: 'Teacher Name',
    question: 'Q?',
    choices_json: '["A","B"]',
    image_url: null,
    fallback_key: 'poll',
  };
  const a = await finalizePollContributionPublish(db, 'https://example.com', pc, { reviewedBy: 'Admin' });
  const b = await finalizePollContributionPublish(db, 'https://example.com', pc, { reviewedBy: 'Admin' });
  if (a.ok && b.ok && a.pollId && a.pollId === b.pollId && store.polls.length === 1) {
    ok('idempotent finalize: repeated publish does not duplicate poll');
  } else bad('idempotent finalize failed', { a, b, n: store.polls.length });
  if (store.polls[0] && store.polls[0].created_by_character === 'Teacher Name' && store.polls[0].approved_at) {
    ok('finalize sets created_by_character and approved_at');
  } else bad('finalize column values', store.polls[0]);
}

console.log('\n--- poll-publish-211-test: ' + passed + ' passed, ' + failed + ' failed ---');
process.exit(failed ? 1 : 0);
