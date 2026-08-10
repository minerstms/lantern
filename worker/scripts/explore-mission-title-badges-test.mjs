/**
 * Prompt #123 — Explore mission-submission titles + no ULHC/URHC feed-card badges.
 * Usage: node worker/scripts/explore-mission-title-badges-test.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';
import { collectApprovedFeed } from '../feed-handlers.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const feedSrc = fs.readFileSync(path.join(root, 'worker/feed-handlers.js'), 'utf8');
const cardsSrc = fs.readFileSync(path.join(root, 'app/js/lantern-cards.js'), 'utf8');
const feedCardSrc = fs.readFileSync(path.join(root, 'app/js/lantern-feed-card.js'), 'utf8');
const cssSrc = fs.readFileSync(path.join(root, 'app/css/lantern-cards.css'), 'utf8');

let pass = 0;
let fail = 0;
function ok(msg) {
  pass++;
  console.log('PASS ' + msg);
}
function bad(msg, detail) {
  fail++;
  console.log('FAIL ' + msg + (detail ? ' — ' + JSON.stringify(detail) : ''));
}

function makeFeedDb(missionSubmissionRows, missionTitles) {
  missionTitles = missionTitles || {};
  return {
    prepare(sql) {
      const s = String(sql).replace(/\s+/g, ' ').trim();
      const api = {
        bind(...args) {
          api._binds = args;
          return api;
        },
        async all() {
          if (s.includes('FROM lantern_mission_submissions')) return { results: missionSubmissionRows };
          if (s.includes('FROM lantern_feed_items')) return { results: [] };
          if (s.includes('FROM lantern_news_submissions')) return { results: [] };
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
          throw new Error('Unhandled feed SQL: ' + s.slice(0, 120));
        },
      };
      return api;
    },
  };
}

function loadLanternCards() {
  const sandbox = { console, document: undefined, window: undefined, LANTERN_AVATAR_API: undefined };
  sandbox.global = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(cardsSrc, sandbox);
  return sandbox.LanternCards;
}

// --- Static contracts ---
if (/const missionTitle = String\(row\.mission_title/.test(feedSrc) &&
    /title: missionTitle \|\| 'Mission Submission'/.test(feedSrc.replace(/\s+/g, ' '))) {
  ok('feed-handlers uses source mission title with Mission Submission emergency fallback only');
} else bad('feed-handlers title contract missing');

if (/SELECT id, title FROM lantern_missions WHERE id IN/.test(feedSrc)) {
  ok('fetchApprovedMissions joins lantern_missions titles by mission_id');
} else bad('missing lantern_missions title lookup in feed-handlers');

if (!/title: 'Mission submission'/.test(feedSrc)) {
  ok('hard-coded title: \'Mission submission\' removed from normalizeMissionRow');
} else bad('legacy hard-coded Mission submission title still present');

if (/typeBadge:\s*''/.test(cardsSrc) && /Prompt #123/.test(cardsSrc)) {
  ok('normalizeFeedItemToFaceModel clears typeBadge for Explore feed faces');
} else bad('Explore feed face model still emits type badges');

if (/feedExploreCard[\s\S]{0,200}lanternCanonicalCardBadgeLayer/.test(cssSrc) ||
    /\.exploreCard\.feedExploreCard \.lanternCanonicalCardBadgeLayer/.test(cssSrc)) {
  ok('CSS hides corner badge layer on Explore .feedExploreCard');
} else bad('missing Explore feedExploreCard badge-hide CSS');

if (/typeBadge:\s*''/.test(feedCardSrc)) {
  ok('lantern-feed-card fallback model does not inject type badges');
} else bad('lantern-feed-card fallback still sets type badges');

// Missions library must keep state badges path (not cleared globally in buildCanonicalCardFaceHtml)
if (/exploreCard--missionsLibrary .lanternCanonicalCardTypeBadge/.test(cssSrc) &&
    /model\.typeBadge/.test(cardsSrc) && /model\.stateBadge/.test(cardsSrc)) {
  ok('canonical compositor still supports badges for non-Explore surfaces');
} else bad('canonical badge compositor unexpectedly removed');

// --- Runtime: collectApprovedFeed titles ---
const origin = 'https://lantern-42i.pages.dev';
const titles = {
  tm_checkin: 'Daily Check-In',
  tm_thanks: 'Thank-You Letter',
};
const rows = [
  {
    id: 'msub_a',
    mission_id: 'tm_checkin',
    character_name: '20889',
    submission_type: 'text',
    submission_content: 'Feeling good',
    status: 'accepted',
    created_at: '2026-08-09T01:00:00.000Z',
    reviewed_at: '2026-08-09T01:05:00.000Z',
    reviewed_by: 'Rick Radle',
  },
  {
    id: 'msub_b',
    mission_id: 'tm_thanks',
    character_name: '20889',
    submission_type: 'text',
    submission_content: 'Thanks',
    status: 'accepted',
    created_at: '2026-08-09T02:00:00.000Z',
    reviewed_at: '2026-08-09T02:05:00.000Z',
    reviewed_by: 'Rick Radle',
  },
  {
    id: 'msub_orphan',
    mission_id: 'tm_deleted',
    character_name: '20889',
    submission_type: 'text',
    submission_content: 'orphan',
    status: 'accepted',
    created_at: '2026-08-09T03:00:00.000Z',
    reviewed_at: '2026-08-09T03:05:00.000Z',
    reviewed_by: 'Rick Radle',
  },
];

const feed = await collectApprovedFeed(makeFeedDb(rows, titles), origin, { limit: 20 });
const a = feed.find((it) => it.id === 'mission:msub_a');
const b = feed.find((it) => it.id === 'mission:msub_b');
const orphan = feed.find((it) => it.id === 'mission:msub_orphan');

if (a && a.title === 'Daily Check-In') ok('Explore feed item uses source mission title: Daily Check-In');
else bad('Daily Check-In title missing', a && a.title);

if (b && b.title === 'Thank-You Letter') ok('Explore feed item uses source mission title: Thank-You Letter');
else bad('Thank-You Letter title missing', b && b.title);

if (orphan && orphan.title === 'Mission Submission') {
  ok('unresolved mission_id keeps emergency fallback Mission Submission (no data mutation)');
} else bad('orphan / deleted mission fallback incorrect', orphan && orphan.title);

if (a && a.contentSlot && a.contentSlot.missionId === 'tm_checkin') {
  ok('contentSlot retains missionId for relationship');
} else bad('missionId missing from contentSlot', a && a.contentSlot);

const LC = loadLanternCards();
if (LC && LC.normalizeFeedItemToFaceModel) {
  const modelA = LC.normalizeFeedItemToFaceModel(a);
  if (modelA && modelA.title === 'Daily Check-In') ok('face model title inherits source mission title');
  else bad('face model title wrong', modelA && modelA.title);

  if (modelA && !modelA.typeBadge && !modelA.stateBadge) {
    ok('face model emits empty typeBadge/stateBadge (no corner badges)');
  } else bad('face model still has badges', { typeBadge: modelA && modelA.typeBadge, stateBadge: modelA && modelA.stateBadge });

  const html = LC.buildCanonicalCardFaceHtml(modelA, {});
  if (!/lanternCanonicalCardBadgeLayer/.test(html) && !/lanternCanonicalCardTypeBadge/.test(html)) {
    ok('canonical face HTML for Explore feed item contains no badge markup');
  } else bad('badge markup still present in Explore face HTML');

  const newsModel = LC.normalizeFeedItemToFaceModel({
    id: 'news:1',
    type: 'news',
    typeLabel: 'News',
    title: 'School news',
    authorDisplayName: 'Editor',
  });
  if (!newsModel.typeBadge) ok('news Explore feed faces also have no typeBadge');
  else bad('news face still gets typeBadge', newsModel.typeBadge);
} else {
  bad('LanternCards.normalizeFeedItemToFaceModel unavailable');
}

console.log('\nexplore-mission-title-badges-test:', pass, 'PASS', fail, 'FAIL');
process.exit(fail ? 1 : 0);
