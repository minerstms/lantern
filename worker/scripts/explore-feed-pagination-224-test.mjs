/**
 * Prompt #224 — Explore keyset pagination (created_at + id), no D1 migration.
 * Usage: node worker/scripts/explore-feed-pagination-224-test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EXPLORE_PAGE_SIZE,
  encodeFeedCursor,
  parseFeedCursor,
  paginateFeedItems,
} from '../feed-handlers.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let pass = 0;
let fail = 0;
function ok(label) { pass++; console.log('PASS', label); }
function bad(label, detail) { fail++; console.error('FAIL', label, detail != null ? detail : ''); }

function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }

const items = [];
for (let i = 0; i < 130; i++) {
  const n = String(i).padStart(3, '0');
  items.push({
    id: 'news:item-' + n,
    type: 'article',
    title: 'Card ' + n,
    approvedAt: '2026-08-01T00:00:' + n + 'Z',
    createdAt: '2026-08-01T00:00:' + n + 'Z',
  });
}
const sameTs = [
  { id: 'news:a', type: 'article', title: 'A', approvedAt: '2026-08-02T00:00:00Z', createdAt: '2026-08-02T00:00:00Z' },
  { id: 'news:b', type: 'article', title: 'B', approvedAt: '2026-08-02T00:00:00Z', createdAt: '2026-08-02T00:00:00Z' },
  { id: 'news:c', type: 'article', title: 'C', approvedAt: '2026-08-02T00:00:00Z', createdAt: '2026-08-02T00:00:00Z' },
];

if (EXPLORE_PAGE_SIZE === 60) ok('1. explore page size is 60');
else bad('1. page size', EXPLORE_PAGE_SIZE);

const first = paginateFeedItems(items, { limit: '60', sort: 'newest' });
if (first.items.length === 60 && first.has_more === true && first.next_cursor) {
  ok('2. first page returns 60 + next_cursor');
} else bad('2. first page', { n: first.items.length, more: first.has_more });

const second = paginateFeedItems(items, { limit: '60', sort: 'newest', cursor: first.next_cursor });
if (second.items.length === 60 && second.has_more === true) ok('3. second page appends older 60');
else bad('3. second page', { n: second.items.length, more: second.has_more });

const ids = first.items.concat(second.items).map((it) => it.id);
if (new Set(ids).size === 120) ok('4. no duplicates across first two pages');
else bad('4. duplicates', new Set(ids).size);

const last = paginateFeedItems(items, { limit: '60', sort: 'newest', cursor: second.next_cursor });
if (last.items.length === 10 && last.has_more === false && !last.next_cursor) {
  ok('5. final page has no-more cursor');
} else bad('5. final page', last);

const newestFirst = first.items[0].id;
if (newestFirst === 'news:item-129') ok('6. newest-first ordering');
else bad('6. order', newestFirst);

const parsed = parseFeedCursor(first.next_cursor);
if (parsed && parsed.t && parsed.id && encodeFeedCursor(first.items[59]) === first.next_cursor) {
  ok('7. cursor encodes createdAt|id');
} else bad('7. cursor shape', parsed);

const tied = paginateFeedItems(sameTs, { limit: '2', sort: 'newest' });
const tied2 = paginateFeedItems(sameTs, { limit: '2', sort: 'newest', cursor: tied.next_cursor });
const tiedIds = tied.items.concat(tied2.items).map((it) => it.id).sort();
if (tied.has_more && tied2.items.length === 1 && tiedIds.join() === 'news:a,news:b,news:c') {
  ok('8. same-timestamp items are not skipped or duplicated');
} else bad('8. tiebreaker', { tiedIds, more: tied.has_more });

const feedJs = read('app/js/lantern-feed-explore.js');
const exploreHtml = read('app/explore.html');
const feedApi = read('app/js/lantern-feed-api.js');
const workerFeed = read('worker/feed-handlers.js');
if (
  exploreHtml.includes('id="feedLoadMoreBtn"') &&
  feedJs.includes('Load More') &&
  feedJs.includes("You've reached the beginning of Lantern.") &&
  feedJs.includes('state.loading') &&
  feedApi.includes('getFeed') &&
  workerFeed.includes('next_cursor') &&
  workerFeed.includes('has_more') &&
  workerFeed.includes('ORDER BY COALESCE') &&
  !workerFeed.includes('CREATE INDEX')
) {
  ok('9. Explore Load More is wired to server cursor pagination without a new index');
} else bad('9. wiring');

console.log('\nExplore feed pagination #224:', pass, 'passed,', fail, 'failed');
process.exit(fail ? 1 : 0);
