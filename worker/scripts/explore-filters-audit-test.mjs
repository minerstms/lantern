/**
 * Prompt #154 — Explore helper copy cleanup + content-category filter audit.
 * Usage: node worker/scripts/explore-filters-audit-test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { collectApprovedFeed, filterFeedItems, FEED_TYPES, EXPLORE_FEED_FILTERS } from '../feed-handlers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..', '..');

let pass = 0;
let fail = 0;
function ok(label) { pass++; console.log('PASS', label); }
function bad(label, detail) { fail++; console.error('FAIL', label, detail != null ? detail : ''); }
function assert(cond, label, detail) { if (cond) ok(label); else bad(label, detail); }

function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }

const exploreHtml = read('app/explore.html');
const feedCss = read('app/css/lantern-feed.css');
const feedApiJs = read('app/js/lantern-feed-api.js');
const feedHandlers = read('worker/feed-handlers.js');

const EXPECTED = ['All', 'News', 'Missions', 'Polls', 'Shout-Outs', 'Photos', 'Videos', 'Articles'];
const EXPECTED_IDS = ['all', 'news', 'mission', 'poll', 'shout_out', 'photo', 'video', 'article'];
const ARCHIVED = ['Game Scores', 'Leaderboards', 'Achievements', 'Trivia'];

assert(!exploreHtml.includes('One feed — filter and sort approved Lantern content.'), '1. helper sentence absent');
assert(!/feedPageSub/.test(exploreHtml), '2. no Explore feedPageSub helper markup (dead spacing source removed)');
assert(/feedHeading--exploreHeaderFilters/.test(exploreHtml) && /id="feedFiltersPanel"/.test(exploreHtml), '2b. Explore filters panel under compact header-filters host (#187)');
assert(!/id="feedStatus"/.test(exploreHtml), '2c. Explore visible item count removed (#187)');
assert(!/feedMetaRow/.test(exploreHtml), '2d. obsolete Explore feedMetaRow wrapper removed (#169)');
assert(feedCss.includes('feedHeading--exploreHeaderFilters'), '2e. Explore header-filters CSS present');

assert(JSON.stringify(EXPLORE_FEED_FILTERS.map((f) => f.label)) === JSON.stringify(EXPECTED), '3–10. Explore filter labels exact order', JSON.stringify(EXPLORE_FEED_FILTERS.map((f) => f.label)));
assert(JSON.stringify(EXPLORE_FEED_FILTERS.map((f) => f.id)) === JSON.stringify(EXPECTED_IDS), 'filter ids exact order');

const sandbox = { window: {}, self: {} };
vm.runInNewContext(feedApiJs, sandbox);
const clientFilters = (sandbox.window.LANTERN_FEED || sandbox.self.LANTERN_FEED).FEED_FILTERS;
assert(JSON.stringify(clientFilters.map((f) => f.label)) === JSON.stringify(EXPECTED), 'client FEED_FILTERS match Explore order');
assert(JSON.stringify(clientFilters.map((f) => f.id)) === JSON.stringify(EXPECTED_IDS), 'client FEED_FILTERS ids match');

ARCHIVED.forEach((label) => {
  assert(!clientFilters.some((f) => f.label === label), '11–14 archived absent from UI: ' + label);
});
assert(!clientFilters.some((f) => f.id === 'trivia'), '14. Trivia removed from Explore filters (game/trivia system, not Explore posts)');
assert(!clientFilters.some((f) => f.id === 'game_score' || f.id === 'leaderboard' || f.id === 'achievement'), '11–13. game/system filters archived from UI');

assert(FEED_TYPES.poll === 'Poll', '15. poll is a real FEED_TYPES key');
assert(FEED_TYPES.shout_out === 'Shout-Out', '15b. shout_out remains a real FEED_TYPES key');
assert(FEED_TYPES.trivia === 'Trivia', '16. trivia type retained in FEED_TYPES (data untouched)');
assert(FEED_TYPES.game_score === 'Game Score', '16b. game_score type retained in FEED_TYPES');
assert(feedHandlers.includes('lantern_trivia_questions'), '16c. trivia API/handlers still present');
assert(feedHandlers.includes('/api/trivia'), '16d. trivia routes still present');

EXPECTED_IDS.filter((id) => id !== 'all').forEach((id) => {
  assert(Object.prototype.hasOwnProperty.call(FEED_TYPES, id), '15. visible filter maps to FEED_TYPES: ' + id);
});

function makeDb({ polls, shouts, news, missions, feedItems }) {
  return {
    prepare(sql) {
      const s = String(sql).replace(/\s+/g, ' ').trim();
      const api = {
        bind(...args) { api._binds = args; return api; },
        async all() {
          if (s.includes('FROM lantern_polls')) return { results: polls || [] };
          if (s.includes('FROM lantern_teacher_recognition')) return { results: shouts || [] };
          if (s.includes('FROM lantern_news_submissions')) return { results: news || [] };
          if (s.includes('FROM lantern_mission_submissions')) return { results: missions || [] };
          if (s.includes('FROM lantern_feed_items')) return { results: feedItems || [] };
          if (s.includes('FROM lantern_missions')) {
            const ids = api._binds || [];
            return { results: ids.map((id) => ({ id, title: 'Mission ' + id })) };
          }
          throw new Error('Unhandled: ' + s.slice(0, 120));
        },
      };
      return api;
    },
  };
}

const sample = await collectApprovedFeed(
  makeDb({
    polls: [
      {
        id: 'poll_1',
        question: 'Favorite lunch?',
        choices_json: JSON.stringify(['A', 'B']),
        image_url: null,
        character_name: 'Lucas Radle',
        created_at: '2026-08-01T00:00:00.000Z',
        approved_at: '2026-08-01T01:00:00.000Z',
      },
    ],
    shouts: [
      {
        id: 'rec_1',
        character_name: 'Lucas Radle',
        message: 'Great job!',
        category: 'Praise',
        created_at: '2026-08-02T00:00:00.000Z',
        created_by_teacher_id: 't1',
        created_by_teacher_name: 'Rick Radle',
      },
    ],
    news: [
      {
        id: 'n1',
        title: 'Photo post',
        body: 'hi',
        author_name: 'Lucas Radle',
        image_r2_key: 'img/1',
        created_at: '2026-08-03T00:00:00.000Z',
        reviewed_at: '2026-08-03T00:00:00.000Z',
      },
      {
        id: 'n2',
        title: 'Article only',
        body: 'text',
        author_name: 'Lucas Radle',
        category: 'features',
        created_at: '2026-08-04T00:00:00.000Z',
        reviewed_at: '2026-08-04T00:00:00.000Z',
      },
    ],
    missions: [
      {
        id: 'ms1',
        mission_id: 'tm1',
        character_name: 'Lucas Radle',
        submission_type: 'text',
        submission_content: 'done',
        status: 'accepted',
        created_at: '2026-08-05T00:00:00.000Z',
        reviewed_at: '2026-08-05T00:00:00.000Z',
      },
    ],
    feedItems: [],
  }),
  'https://lantern-42i.pages.dev',
  { limit: 50 }
);

assert(sample.some((i) => i.type === 'poll' && i.id === 'poll:poll_1'), '17. polls appear in collectApprovedFeed as type poll');
assert(sample.some((i) => i.type === 'shout_out'), '17b. shout-outs appear in collectApprovedFeed');
assert(sample.some((i) => i.type === 'mission'), '17c. missions still in feed');
assert(sample.some((i) => i.type === 'photo'), '17d. photos still in feed');
assert(sample.some((i) => i.type === 'article'), '17e. articles still in feed');

const pollsOnly = filterFeedItems(sample, { type: 'poll' });
assert(pollsOnly.length === 1 && pollsOnly[0].type === 'poll', '17f. Polls filter returns poll items only');
const articlesOnly = filterFeedItems(sample, { type: 'article' });
assert(articlesOnly.every((i) => i.type === 'article') && articlesOnly.length === 1, 'News≠Articles: article filter exact');
const newsOnly = filterFeedItems(sample, { type: 'news' });
assert(newsOnly.every((i) => i.type === 'news'), 'News filter exact (does not swallow articles)');

const sorted = filterFeedItems(sample, { sort: 'title' });
assert(sorted.length === sample.length, '18. sorting still returns full set');
const newest = filterFeedItems(sample, { sort: 'newest' });
assert(newest.length === sample.length, '18b. newest sort functional');

assert(exploreHtml.includes('feedSortSelect') && exploreHtml.includes('feedRefreshBtn'), '18c. sort/Refresh markup retained');
assert(!exploreHtml.includes('id="feedStatus"'), '18d. Explore item count host removed (#187)');
assert(read('app/locker.html').includes('id="feedStatus"'), '18e. Locker item count host retained');

console.log('\nexplore-filters-audit-test:', pass, 'PASS', fail, 'FAIL');
process.exit(fail ? 1 : 0);
