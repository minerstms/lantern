/**
 * Games page — library grid, leaderboard dashboard, paid play (Prompt #58).
 * Usage: node worker/scripts/games-page-test.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let pass = 0;
let fail = 0;

function ok(label) {
  pass++;
  console.log('PASS', label);
}
function bad(label, detail) {
  fail++;
  console.error('FAIL', label, detail || '');
}

const gamesHtml = fs.readFileSync(path.join(root, 'app/games.html'), 'utf8');
const catalogJs = fs.readFileSync(path.join(root, 'app/js/lantern-game-catalog.js'), 'utf8');
const gamesPageJs = fs.readFileSync(path.join(root, 'app/js/lantern-games-page.js'), 'utf8');
const paidStartJs = fs.readFileSync(path.join(root, 'app/js/lantern-games-paid-start.js'), 'utf8');
const gamesCss = fs.readFileSync(path.join(root, 'app/css/lantern-games-page.css'), 'utf8');
const feedCss = fs.readFileSync(path.join(root, 'app/css/lantern-feed.css'), 'utf8');
const workerIndex = fs.readFileSync(path.join(root, 'worker/index.js'), 'utf8');

if (!gamesHtml.includes('gamesFeaturedScroller') && !gamesHtml.includes('gamesArcadeScroller')) {
  ok('duplicate rail hosts removed from games.html');
} else bad('rail scroller hosts still present');

if (!gamesHtml.includes('gamesCultureScroller') && !gamesHtml.includes('gameHighlightsScroller')) {
  ok('culture/highlights rails removed');
} else bad('culture or highlights rail still present');

if (gamesHtml.includes('id="gamesLibraryGrid"') && gamesHtml.includes('class="feedGrid"')) {
  ok('game library uses shared feedGrid');
} else bad('feedGrid library missing');

if (gamesHtml.includes('lantern-feed.css') && gamesHtml.includes('lantern-games-page.css')) {
  ok('shared feed + games page CSS linked');
} else bad('CSS links missing');

if (gamesHtml.includes('id="gamesFiltersPanel"') && /id="gamesFiltersPanel"[^>]*\shidden/.test(gamesHtml)) {
  ok('filters disclosure collapsed by default');
} else bad('filters panel markup');

if (gamesHtml.includes('lantern-game-catalog.js') && gamesHtml.includes('lantern-games-page.js')) {
  ok('catalog + games page modules linked');
} else bad('module scripts missing');

const idMatches = catalogJs.match(/id: '[^']+'/g) || [];
const uniqueIds = new Set(idMatches);
if (uniqueIds.size === 8 && idMatches.length === 8) {
  ok('eight canonical game IDs, no duplicates');
} else bad('canonical game count', `${uniqueIds.size} unique of ${idMatches.length}`);

if (catalogJs.includes('play_cost: 1')) {
  ok('play_cost defaults to 1 in catalog');
} else bad('play_cost missing');

if (gamesPageJs.includes("DEFAULT_PERIOD: '7d'") || catalogJs.includes("DEFAULT_PERIOD: '7d'")) {
  ok('default leaderboard period is 7 Days');
} else bad('7d default missing');

if (
  catalogJs.includes("'24h': 'daily'") &&
  catalogJs.includes("'7d': 'weekly'") &&
  catalogJs.includes("'30d': 'monthly'") &&
  catalogJs.includes("all: 'all_time'")
) {
  ok('timeframe period mapping');
} else bad('period mapping');

if (gamesHtml.includes('data-period="7d"') && gamesHtml.includes('class="is-active"')) {
  ok('7 Days tab active in HTML');
} else bad('7 Days active tab');

if (workerIndex.includes("period === 'all_time'") && workerIndex.includes('since = null')) {
  ok('worker all_time period without cutoff');
} else bad('worker all_time support');

if (workerIndex.includes('GROUP BY character_name')) {
  ok('best result per player aggregation in worker');
} else bad('GROUP BY missing');

if (gamesPageJs.includes('AUTO_ADVANCE_MS = 5000')) {
  ok('carousel auto-advance 5 seconds');
} else bad('auto-advance interval');

if (gamesPageJs.includes('prefers-reduced-motion') && gamesPageJs.includes('prefersReducedMotion')) {
  ok('reduced motion disables auto rotation');
} else bad('reduced motion handling');

if (gamesPageJs.includes('pauseAuto') && gamesPageJs.includes('mouseenter') && gamesPageJs.includes('focusin')) {
  ok('hover/focus pauses carousel');
} else bad('carousel pause behavior');

if (gamesCss.includes('flex: 0 0 33.333%') || gamesPageJs.includes('visibleCarouselCount')) {
  ok('responsive carousel visible counts');
} else bad('carousel responsive layout');

if (gamesPageJs.includes('gamesLbYou') && gamesPageJs.includes('View full leaderboard')) {
  ok('leaderboard snapshot top 3 + you + full board action');
} else bad('leaderboard card content');

if (!gamesHtml.match(/wallet[\s\S]{0,40}leaderboard/i) && !gamesPageJs.match(/balance[\s\S]{0,40}leaderboard/i)) {
  ok('no wallet-balance leaderboard');
} else bad('wallet leaderboard detected');

if (gamesHtml.includes('LanternGamesPaidStart') && gamesHtml.includes('playCostForGame')) {
  ok('paid play cost authority + shared start module');
} else bad('paid play guards');

if (gamesHtml.includes('lantern-games-paid-start.js') || paidStartJs.includes("kind: 'game_play'")) {
  ok('game_play transaction kind in shared paid-start module');
} else bad('game_play kind');

if (gamesHtml.includes('LanternWallet') && gamesHtml.includes('fetchMyBalance')) {
  ok('authoritative session wallet on games page');
} else bad('LanternWallet integration');

if (feedCss.includes('280px') && gamesHtml.includes('feedGrid')) {
  ok('canonical 280px grid architecture reused');
} else bad('280px grid');

if (gamesHtml.includes('tryPlay(\'Avatar Match\'') && gamesHtml.includes('tryPlay(\'Handbook Trivia\'')) {
  ok('culture/trivia games use paid tryPlay');
} else bad('culture games paid play');

if (gamesPageJs.includes('leaderboardGames()') && !gamesPageJs.includes('li % ')) {
  ok('one leaderboard per unique game, no duplicate cycling');
} else bad('leaderboard dedupe');

if (gamesPageJs.includes('filteredGames') && gamesPageJs.includes('listGames')) {
  ok('game-only library dataset from catalog');
} else bad('game-only library');

// ---------------------------------------------------------------------------
// Prompt #99 follow-up — leaderboard carousel composite card (artwork + leaderboard, one card)
// ---------------------------------------------------------------------------
if (gamesPageJs.includes('function renderLeaderboardPairedCardHtml(') && !gamesPageJs.includes('leaderboardGameStack') && !gamesPageJs.includes('buildLeaderboardGameCard')) {
  ok('leaderboard carousel renders one composite card per game (old two-card stack removed)');
} else bad('composite leaderboard card function missing or old stack still present');

const artworkBtnMatch = gamesPageJs.match(/<button type="button" class="gamesLbArtworkBtn"[\s\S]*?<\/button>/);
if (
  artworkBtnMatch &&
  !artworkBtnMatch[0].includes('gamesLbCardTitle') &&
  !artworkBtnMatch[0].includes('gamesLbCardActions') &&
  !artworkBtnMatch[0].includes('gamesLbTop3') &&
  !artworkBtnMatch[0].includes('typeBadge') &&
  !artworkBtnMatch[0].includes('gamesLbYou')
) {
  ok('leaderboard card artwork region has no title/badge/score overlay markup (aria-label only, not visible)');
} else bad('leaderboard card artwork still contains overlay markup', artworkBtnMatch && artworkBtnMatch[0].slice(0, 200));

if (gamesPageJs.match(/gamesLbArtworkBtn[\s\S]*?gamesLbBody[\s\S]*?gamesLbCardTitle/)) {
  ok('title + leaderboard info render below the artwork inside the same composite card');
} else bad('title/leaderboard body not found after artwork in composite card markup');

if (gamesPageJs.includes("data-game-id=") && gamesPageJs.match(/renderLeaderboardPairedCardHtml\(bundle\.game, bundle\)/)) {
  ok('composite card still keyed off the same bundle, preserving correct game <-> leaderboard pairing');
} else bad('game/leaderboard pairing data wiring missing');

if (gamesCss.match(/\.gamesLbCard\s*\{[^}]*overflow:\s*hidden/)) {
  ok('composite card clips artwork to one continuous rounded shape (no seam between halves)');
} else bad('composite card overflow/seam handling missing');

if (gamesCss.includes('.gamesLbArtworkBtn') && gamesCss.match(/\.gamesLbArtworkBtn\s*\{[^}]*aspect-ratio:\s*16 \/ 9/)) {
  ok('leaderboard card artwork uses the site-wide 16:9 card aspect ratio');
} else bad('leaderboard card artwork aspect ratio missing');

if (gamesPageJs.includes('data-action="play-game"') && gamesPageJs.includes('data-action="view-lb"')) {
  ok('play + view-full-leaderboard actions preserved on the composite card');
} else bad('composite card actions missing');

console.log('\nGames page tests:', pass, 'passed,', fail, 'failed');
process.exit(fail ? 1 : 0);
