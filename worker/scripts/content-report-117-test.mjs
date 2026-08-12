/**
 * Prompt #117 — report → quarantine regression tests.
 * Usage: node worker/scripts/content-report-117-test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  normalizeReportItemType,
  resolveReportTargetIds,
  quarantineReportedContent,
  reportQuarantineAuditLabel,
  reporterIdentityFromAccount,
  isReportQuarantineLabel,
  reportStatusLabel,
} from '../content-report-quarantine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '../..');
const indexSrc = fs.readFileSync(path.join(root, 'worker/index.js'), 'utf8');
const cardUi = fs.readFileSync(path.join(root, 'app/js/lantern-card-ui.js'), 'utf8');
const cards = fs.readFileSync(path.join(root, 'app/js/lantern-cards.js'), 'utf8');
const feedCard = fs.readFileSync(path.join(root, 'app/js/lantern-feed-card.js'), 'utf8');
const teacher = fs.readFileSync(path.join(root, 'app/teacher.html'), 'utf8');

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

assert(normalizeReportItemType('poll')?.hideKind === 'poll', 'A1 poll type');
assert(normalizeReportItemType('news')?.hideKind === 'news', 'A2 news type');
assert(normalizeReportItemType('shoutout')?.canonical === 'news', 'A3 shoutout → news');
assert(normalizeReportItemType('mission')?.hideKind === 'mission', 'A4 mission type');
assert(normalizeReportItemType('feed_item')?.hideKind === 'feed', 'A5 feed_item type');
assert(normalizeReportItemType('bogus') == null, 'A6 unknown rejected');

assert(resolveReportTargetIds('feed_item', 'poll:p1')?.hideKind === 'poll', 'A7 prefixed poll id');
assert(resolveReportTargetIds('feed_item', 'poll:p1')?.itemId === 'p1', 'A8 strip poll prefix');
assert(resolveReportTargetIds('feed_item', 'mission:ms1')?.itemId === 'ms1', 'A9 strip mission prefix');
assert(resolveReportTargetIds('news', 'news:n1')?.itemId === 'n1', 'A10 strip news prefix');

assert(isReportQuarantineLabel('report:alice'), 'A11 report audit label');
assert(reportStatusLabel('report:alice') === 'REPORTED — HIDDEN PENDING REVIEW', 'A12 status label');
assert(reportQuarantineAuditLabel({ username: 'eric.colorado' }) === 'report:eric.colorado', 'A13 audit from account');
assert(reporterIdentityFromAccount({ username: 'u1', role: 'teacher' }, () => '') === 'u1', 'A14 reporter identity');

function makeDb(state) {
  return {
    prepare(sql) {
      const s = String(sql);
      const binds = [];
      const api = {
        bind(...args) {
          binds.push(...args);
          return api;
        },
        async first() {
          if (s.includes('FROM lantern_news_submissions')) return state.news[binds[0]] || null;
          if (s.includes('FROM lantern_polls')) return state.polls[binds[0]] || null;
          if (s.includes('FROM lantern_mission_submissions')) return state.missions[binds[0]] || null;
          if (s.includes('FROM lantern_feed_items')) return state.feed[binds[0]] || null;
          return null;
        },
        async run() {
          if (s.includes('UPDATE lantern_news_submissions SET hidden_at')) {
            const row = state.news[binds[2]];
            if (row) {
              row.hidden_at = binds[0];
              row.hidden_by = binds[1];
            }
          } else if (s.includes('UPDATE lantern_polls SET hidden_at')) {
            const row = state.polls[binds[2]];
            if (row) {
              row.hidden_at = binds[0];
              row.hidden_by = binds[1];
            }
          } else if (s.includes('UPDATE lantern_mission_submissions SET hidden_at')) {
            const row = state.missions[binds[2]];
            if (row) {
              row.hidden_at = binds[0];
              row.hidden_by = binds[1];
            }
          } else if (s.includes('UPDATE lantern_feed_items SET status')) {
            const row = state.feed[binds[2]];
            if (row) {
              row.status = 'hidden';
              row.hidden_at = binds[0];
              row.hidden_by = binds[1];
            }
          } else if (s.includes('INSERT INTO lantern_content_flags')) {
            state.flags.push({
              id: binds[0],
              item_type: binds[1],
              item_id: binds[2],
              reported_by: binds[3],
              reason: binds[4],
              created_at: binds[5],
            });
          }
          return { success: true, meta: { changes: 1 } };
        },
      };
      return api;
    },
  };
}

const state = {
  news: { n1: { id: 'n1', status: 'approved', hidden_at: null, title: 'Hello', body: 'x' } },
  polls: { p1: { id: 'p1', approved_at: 't', hidden_at: null, choices_json: '["a","b"]', votes: 3 } },
  missions: { m1: { id: 'm1', status: 'accepted', hidden_at: null, character_name: 'Sam' } },
  feed: { f1: { id: 'f1', status: 'approved', hidden_at: null } },
  flags: [],
};
const db = makeDb(state);

{
  const r = await quarantineReportedContent(db, 'news', 'n1', 'report:u', '2026-01-01T00:00:00Z');
  assert(r.ok && state.news.n1.hidden_at === '2026-01-01T00:00:00Z', 'B news quarantined');
  assert(state.news.n1.title === 'Hello', 'B news source preserved');
  const r2 = await quarantineReportedContent(db, 'news', 'n1', 'report:u2', '2026-01-02T00:00:00Z');
  assert(r2.ok && r2.already_hidden && state.news.n1.hidden_at === '2026-01-01T00:00:00Z', 'H news idempotent hide');
}
{
  const r = await quarantineReportedContent(db, 'poll', 'p1', 'report:u', 't2');
  assert(r.ok && state.polls.p1.hidden_at === 't2', 'D poll quarantined');
  assert(state.polls.p1.choices_json === '["a","b"]' && state.polls.p1.votes === 3, 'D poll votes/data remain');
}
{
  const r = await quarantineReportedContent(db, 'mission', 'm1', 'report:u', 't3');
  assert(r.ok && state.missions.m1.hidden_at === 't3', 'G mission quarantined');
  assert(state.missions.m1.status === 'accepted', 'G mission status untouched');
}
{
  const r = await quarantineReportedContent(db, 'feed', 'f1', 'report:u', 't4');
  assert(r.ok && state.feed.f1.status === 'hidden', 'feed item quarantined');
}

assert(/not_authenticated/.test(indexSrc) && /resolveReportTargetIds|quarantineReportedContent/.test(indexSrc), 'I server requires auth + quarantine');
assert(!/This item type is not reportable through the server yet/.test(cardUi), 'J no unsupported toast copy');
assert(/apiItemType = 'poll'/.test(cardUi) && /mission_submission/.test(cardUi) && /feed_item/.test(cardUi), 'J frontend maps poll/mission/feed');
assert(/credentials:\s*'include'/.test(cardUi) && /removeReportedContentFromUi/.test(cardUi), 'J credentials + UI removal');
const moderationList = fs.readFileSync(path.join(root, 'app/js/lantern-moderation-list.js'), 'utf8');
assert(
  (/REPORTED — HIDDEN PENDING REVIEW/.test(teacher) || /REPORTED — HIDDEN PENDING REVIEW/.test(moderationList)) &&
    (/Restore/.test(teacher) || /Restore/.test(moderationList)),
  'moderation shows reported+restore'
);
assert(/\/api\/feed\/restore/.test(fs.readFileSync(path.join(root, 'worker/feed-handlers.js'), 'utf8')), 'feed restore endpoint');
assert(/reportType: ''/.test(cards) || /catalog mission cards are not user posts/.test(cards), 'catalog mission no Report');
assert(/item\.type === 'poll'/.test(feedCard) || /mission_submission/.test(feedCard), 'feed card report types');

console.log('\ncontent-report-117-test:', pass, 'PASS', fail, 'FAIL');
process.exit(fail ? 1 : 0);
