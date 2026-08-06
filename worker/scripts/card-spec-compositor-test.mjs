/**
 * Invoke every compact card spec with mock data; verify v2 DOM contract.
 * Usage: node worker/scripts/card-spec-compositor-test.mjs
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const cardsPath = path.join(root, 'app/js/lantern-cards.js');
const code = fs.readFileSync(cardsPath, 'utf8');

const sandbox = {
  console,
  document: {
    createElement() {
      const stub = {
        _html: '',
        firstElementChild: null,
        classList: { _s: new Set(), contains(c) { return this._s.has(c); }, add(c) { this._s.add(c); } },
        setAttribute(k, v) { stub['_' + k] = v; },
        getAttribute(k) { return stub['_' + k] || null; },
        querySelector(sel) {
          if (sel === '.exploreCard') {
            if (stub.firstElementChild && stub.firstElementChild.classList._s.has('exploreCard')) return stub.firstElementChild;
            if (stub.firstElementChild && stub.firstElementChild.querySelector) return stub.firstElementChild.querySelector('.exploreCard');
          }
          return null;
        },
        set innerHTML(v) {
          stub._html = String(v || '');
          const rootMatch = stub._html.match(/^<(div|a)([^>]*)>([\s\S]*)<\/\1>$/);
          const attrs = rootMatch ? rootMatch[2] : '';
          const cls = (attrs.match(/class="([^"]*)"/) || [])[1] || '';
          const child = {
            outerHTML: stub._html,
            classList: { _s: new Set(cls.split(/\s+/).filter(Boolean)), contains(c) { return this._s.has(c); }, add(c) { this._s.add(c); } },
            setAttribute(k, val) { child['_' + k] = val; },
            getAttribute(k) { return child['_' + k] || null; },
            querySelector() { return null; },
          };
          stub.firstElementChild = child;
        },
        get innerHTML() { return stub._html; },
      };
      return stub;
    },
  },
  window: undefined,
  LanternMedia: undefined,
  LANTERN_AVATAR_API: undefined,
  location: { href: '' },
  open: () => {},
};
sandbox.window = sandbox;
sandbox.global = sandbox;
vm.createContext(sandbox);
vm.runInContext(code, sandbox);
const LC = sandbox.LanternCards;

function assertHtml(name, html) {
  const errors = [];
  if (!html || typeof html !== 'string') errors.push('empty html');
  if (!/lanternCanonicalCard/.test(html)) errors.push('missing lanternCanonicalCard');
  if (!/lanternCanonicalCardFrame/.test(html)) errors.push('missing frame');
  if (!/lanternCanonicalCardOverlay/.test(html)) errors.push('missing overlay');
  if (!/lanternCanonicalCardTitle/.test(html)) errors.push('missing title');
  if (!/data-lantern-card-contract-version="2"/.test(html)) errors.push('contract not v2');
  if (/exploreCardRailStack|lcRailRow|class="feedCard"/.test(html)) errors.push('legacy v1 shell');
  if (/feedCardInner|feedCardMedia/.test(html)) errors.push('parallel feedCard face');
  return { name, pass: errors.length === 0, errors, htmlLen: html ? html.length : 0 };
}

const mockPost = {
  id: 'p1',
  type: 'news',
  title: 'Spec test post with a reasonable title',
  display_name: 'Test Author',
  created_at: '2026-01-01T00:00:00Z',
  thumbnailUrl: 'https://example.com/t.jpg',
};

function htmlFromSpec(spec) {
  const el = LC.createStudentCard(spec);
  if (!el) return '';
  if (el.classList && el.classList.contains('exploreCard')) return el.outerHTML || '';
  if (el.querySelector) {
    const inner = el.querySelector('.exploreCard');
    if (inner) return (el.outerHTML || '') + (inner.outerHTML || '');
  }
  return el.outerHTML || el._html || '';
}

const specs = [
  { name: 'specFeedPostRail', fn: () => htmlFromSpec(LC.specFeedPostRail(mockPost)) },
  { name: 'specNewsRailCard', fn: () => htmlFromSpec(LC.specNewsRailCard({ id: 'n1', title: 'News', author_name: 'Ed' }, LC.esc)) },
  { name: 'specPollRailCard', fn: () => htmlFromSpec(LC.specPollRailCard({ id: 'poll1', question: 'Vote?', author_name: 'Poll Author', choices: ['A', 'B'] })) },
  { name: 'specMissionSpotlightRail', fn: () => htmlFromSpec(LC.specMissionSpotlightRail({ id: 'm1', title: 'Mission', reward_amount: 5 })) },
  { name: 'specIconRailCard', fn: () => htmlFromSpec(LC.specIconRailCard({ title: 'Games', caption: 'Play now', imageUrl: 'https://x/y.jpg' })) },
  { name: 'specWeeklyPaceLinkCard', fn: () => htmlFromSpec(LC.specWeeklyPaceLinkCard('games.html', 'Week 1', '🌟', 'Jan 1', 'wp1')) },
  { name: 'specGameHubRailCard', fn: () => htmlFromSpec(LC.specGameHubRailCard({ title: 'Hub', metaOne: 'Sub', rewardText: '+10' })) },
  { name: 'specGamesLeaderboardSummaryCard', fn: () => htmlFromSpec(LC.specGamesLeaderboardSummaryCard('Snake', 'g1', [{ character_name: 'A', score: 100 }])) },
  { name: 'specLinkCard', fn: () => htmlFromSpec(LC.specLinkCard('https://x.com', { type: 'link', title: 'Link', author: 'Auth', dateMeta: 'meta', fallbackType: 'link' }, '', 'link', 'l1')) },
  { name: 'specGameHighlightLinkCard', fn: () => htmlFromSpec(LC.specGameHighlightLinkCard('games.html', 'Label', 'Headline', 'Body', 'gh1')) },
  { name: 'specVerifyStressLinkCard', fn: () => htmlFromSpec(LC.specVerifyStressLinkCard('#', 'Stress', 'meta', 'r1')) },
  { name: 'specCosmeticRailCard', fn: () => htmlFromSpec(LC.specCosmeticRailCard({ title: 'Hat', identityLabel: 'Store', rarityKey: 'rare', icon: '🎩' })) },
  { name: 'specLeaderboardChipRailCard', fn: () => htmlFromSpec(LC.specLeaderboardChipRailCard(1, 'Player', '100 pts', 0)) },
  { name: 'specDisplayNewsSpotlightCard', fn: () => htmlFromSpec(LC.specDisplayNewsSpotlightCard('d1', 'News', 'Display', 'Snippet')) },
  { name: 'specActivityPulseCard', fn: () => htmlFromSpec(LC.specActivityPulseCard('⚡', 'Live activity', 'Now', 'pulse', 'ap1')) },
  { name: 'postToRailModel', fn: () => htmlFromSpec(LC.compactFaceSpec(LC.postToRailModel(mockPost), { reportType: 'feed_post', reportId: 'p1' })) },
  { name: 'createStudentCard', fn: () => htmlFromSpec(LC.compactFaceSpec({ type: 'image', title: 'Student work', author: 'Stu', dateMeta: 'Jan 1', thumbnailUrl: 'https://x/y.jpg', fallbackType: 'image' }, { reportType: 'creation', reportId: 's1' })) },
  { name: 'materializeFeedPostCard', fn: () => htmlFromSpec(LC.specFeedPostRail(mockPost)) },
];

if (sandbox.LANTERN_FEED_CARD) {
  // not loaded in vm — skip buildCard unless we inject feed-card adapter
}

const results = specs.map(({ name, fn }) => {
  try {
    const out = fn();
    const html = typeof out === 'string' ? out : (out && out.outerHTML) || '';
    return assertHtml(name, html);
  } catch (e) {
    return { name, pass: false, errors: [String(e.message || e)] };
  }
});

const failed = results.filter((r) => !r.pass);
console.log(JSON.stringify({ summary: { total: results.length, failed: failed.length }, results }, null, 2));
process.exit(failed.length ? 1 : 0);
