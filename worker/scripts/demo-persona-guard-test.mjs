/**
 * Prompt #97 — fake/demo persona production-content filter.
 *
 * Root cause (confirmed against the LIVE database, not just source): known demo/test persona
 * accounts (Alex Adventure, Sam Star, Casey Cool, Jordan Joy, Riley Rise) were used while
 * building the app and left real, "approved" rows in lantern_news_submissions and
 * lantern_teacher_recognition. worker/scripts/lantern-fake-user-guard.mjs already prevents these
 * names from reappearing in SOURCE code, but that guard has no visibility into already-stored
 * DATA rows -- this test covers the runtime display-filter (worker/demo-persona-guard.js) that
 * keeps those existing rows from surfacing in production-facing list/feed responses without
 * deleting the underlying historical data.
 *
 * Usage: node worker/scripts/demo-persona-guard-test.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { isKnownDemoPersonaName, filterOutDemoPersonas, KNOWN_DEMO_PERSONA_NAMES } from '../demo-persona-guard.js';
import { collectApprovedFeed } from '../feed-handlers.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0;
let fail = 0;
function ok(label) { pass++; console.log('PASS', label); }
function bad(label, detail) { fail++; console.error('FAIL', label, detail !== undefined ? JSON.stringify(detail) : ''); }

// ---------------------------------------------------------------------------
// A. isKnownDemoPersonaName / filterOutDemoPersonas — unit behavior
// ---------------------------------------------------------------------------
if (KNOWN_DEMO_PERSONA_NAMES.every((n) => isKnownDemoPersonaName(n))) {
  ok('isKnownDemoPersonaName: recognizes every listed known demo persona name');
} else bad('isKnownDemoPersonaName should recognize all listed names', KNOWN_DEMO_PERSONA_NAMES);

if (isKnownDemoPersonaName('  alex adventure  ') && isKnownDemoPersonaName('SAM STAR')) {
  ok('isKnownDemoPersonaName: case-insensitive and whitespace-tolerant');
} else bad('isKnownDemoPersonaName should be case/whitespace tolerant');

if (!isKnownDemoPersonaName('Lucas Radle') && !isKnownDemoPersonaName('') && !isKnownDemoPersonaName(null)) {
  ok('isKnownDemoPersonaName: does NOT flag a real/blank/null name as demo');
} else bad('isKnownDemoPersonaName should not false-positive on real/blank names');

{
  const list = [{ character_name: 'Alex Adventure' }, { character_name: 'Lucas Radle' }, { character_name: 'Jordan Joy' }];
  const out = filterOutDemoPersonas(list, 'character_name');
  if (out.length === 1 && out[0].character_name === 'Lucas Radle') {
    ok('filterOutDemoPersonas: drops demo personas by flat field name, keeps real students');
  } else bad('filterOutDemoPersonas flat-field filtering', out);
}

{
  const list = [{ meta: { who: 'Casey Cool' } }, { meta: { who: 'Real Kid' } }];
  const out = filterOutDemoPersonas(list, (item) => item.meta.who);
  if (out.length === 1 && out[0].meta.who === 'Real Kid') {
    ok('filterOutDemoPersonas: supports a getter function for nested name shapes');
  } else bad('filterOutDemoPersonas getter-function filtering', out);
}

// ---------------------------------------------------------------------------
// B. collectApprovedFeed integration — the actual live Explore feed pipeline (feed items, news,
//    accepted missions) must never surface a known demo persona's row, while real student rows
//    from all three sources are unaffected.
// ---------------------------------------------------------------------------
function makeFeedDb({ feedItems, newsRows, missionRows, missionTitles }) {
  missionTitles = missionTitles || {};
  return {
    prepare(sql) {
      const s = String(sql).replace(/\s+/g, ' ').trim();
      const api = {
        bind(...args) { api._binds = args; return api; },
        async all() {
          if (s.includes('FROM lantern_mission_submissions')) return { results: missionRows || [] };
          if (s.includes('FROM lantern_feed_items')) return { results: feedItems || [] };
          if (s.includes('FROM lantern_news_submissions')) return { results: newsRows || [] };
          if (s.includes('FROM lantern_polls')) return { results: [] };
          if (s.includes('FROM lantern_teacher_recognition')) return { results: [] };
          if (s.includes('FROM lantern_missions')) {
            const ids = api._binds || [];
            return {
              results: ids.map((id) => ({
                id,
                title: Object.prototype.hasOwnProperty.call(missionTitles, id)
                  ? missionTitles[id]
                  : '',
              })),
            };
          }
          throw new Error('Unhandled feed SQL: ' + s.slice(0, 100));
        },
      };
      return api;
    },
  };
}

async function runIntegrationTests() {
  const origin = 'https://lantern-42i.pages.dev';

  const db = makeFeedDb({
    feedItems: [
      { id: 'fi_demo', author_display_name: 'Sam Star', title: 'Demo post', status: 'approved', created_at: '2026-03-17T00:00:00.000Z' },
      { id: 'fi_real', author_display_name: 'Lucas Radle', title: 'Real post', status: 'approved', created_at: '2026-08-08T00:00:00.000Z' },
    ],
    newsRows: [
      { id: 'news_demo', title: 'Demo news', body: 'x', author_name: 'Alex Adventure', created_at: '2026-03-14T00:00:00.000Z', reviewed_at: '2026-03-14T00:00:00.000Z' },
      { id: 'news_real', title: 'Real news', body: 'x', author_name: 'Lucas Radle', created_at: '2026-08-08T00:00:00.000Z', reviewed_at: '2026-08-08T00:00:00.000Z' },
    ],
    missionRows: [
      { id: 'msub_demo', mission_id: 'tm_1', character_name: 'Jordan Joy', submission_type: 'text', submission_content: 'demo', status: 'accepted', created_at: '2026-03-18T00:00:00.000Z', reviewed_at: '2026-03-18T00:00:00.000Z' },
      { id: 'msub_real', mission_id: 'tm_1', character_name: 'Lucas Radle', submission_type: 'text', submission_content: 'real', status: 'accepted', created_at: '2026-08-08T00:00:00.000Z', reviewed_at: '2026-08-08T00:00:00.000Z' },
    ],
  });

  const feed = await collectApprovedFeed(db, origin, { limit: 50 });
  const ids = feed.map((it) => it.id);

  if (!ids.includes('fi_demo') && !ids.includes('news:news_demo') && !ids.includes('mission:msub_demo')) {
    ok('collectApprovedFeed: known demo personas are excluded from ALL three feed sources (feed items, news, missions)');
  } else bad('collectApprovedFeed should exclude every demo-persona row', ids);

  if (ids.includes('fi_real') && ids.includes('news:news_real') && ids.includes('mission:msub_real')) {
    ok('collectApprovedFeed: real students\' rows from all three sources are unaffected by the filter');
  } else bad('collectApprovedFeed should keep every real-student row', ids);

  if (feed.length === 3) {
    ok('collectApprovedFeed: exactly the 3 real rows survive (not more, not fewer)');
  } else bad('collectApprovedFeed unexpected result count', feed.length);
}

await runIntegrationTests();

// ---------------------------------------------------------------------------
// C. Prompt #99 — GET /api/leaderboards (games) must also apply the same demo-persona filter.
//    This route had never been wired to demo-persona-guard.js, so a known fake/demo persona name
//    could still surface on a game leaderboard as though it were a real student's score. Source-
//    level assertion (matching the style of the other worker/index.js checks in this repo) rather
//    than a full D1-mock integration test, since the leaderboards handler is not separately
//    exported for isolated invocation.
// ---------------------------------------------------------------------------
const workerIndexSrc = fs.readFileSync(path.join(root, 'index.js'), 'utf8');
const leaderboardsGetBlock = (() => {
  const startIdx = workerIndexSrc.indexOf("request.method === 'GET' && path === '/api/leaderboards'");
  if (startIdx === -1) return '';
  return workerIndexSrc.slice(startIdx, startIdx + 4500);
})();

if (
  leaderboardsGetBlock &&
  leaderboardsGetBlock.includes('filterOutDemoPersonas(') &&
  leaderboardsGetBlock.match(/filterOutDemoPersonas\([^)]*rows\.results[^)]*'character_name'/)
) {
  ok('GET /api/leaderboards applies filterOutDemoPersonas to character_name before responding');
} else bad('GET /api/leaderboards should filter demo personas out of entries', leaderboardsGetBlock.slice(0, 200));

if (leaderboardsGetBlock && leaderboardsGetBlock.includes('SELECT character_name, score_display,')) {
  ok('GET /api/leaderboards selects score_display alongside the MIN()/MAX() aggregate (real per-game display string, not just the bare number)');
} else bad('GET /api/leaderboards should select score_display for the winning row');

console.log(`\ndemo-persona-guard-test: ${pass} PASS ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
