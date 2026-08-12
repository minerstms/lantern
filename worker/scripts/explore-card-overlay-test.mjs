/**
 * Prompt #158 — Explore card overlay contract:
 * LINE 1 headline · LINE 2 [avatar] First L. · M/D/YY · description
 * Usage: node worker/scripts/explore-card-overlay-test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const cardsJs = fs.readFileSync(path.join(root, 'app/js/lantern-cards.js'), 'utf8');
const cardsCss = fs.readFileSync(path.join(root, 'app/css/lantern-cards.css'), 'utf8');

let pass = 0;
let fail = 0;
function ok(label) { pass++; console.log('PASS', label); }
function bad(label, detail) { fail++; console.error('FAIL', label, detail != null ? detail : ''); }
function assert(cond, label, detail) { if (cond) ok(label); else bad(label, detail); }

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
          if (sel === '.exploreCard' && stub.firstElementChild) return stub.firstElementChild;
          return null;
        },
        set innerHTML(v) {
          stub._html = String(v || '');
          const m = stub._html.match(/^<(div|a)([^>]*)>([\s\S]*)<\/\1>$/);
          const cls = m ? ((m[2].match(/class="([^"]*)"/) || [])[1] || '') : '';
          stub.firstElementChild = {
            outerHTML: stub._html,
            classList: { _s: new Set(cls.split(/\s+/).filter(Boolean)), contains(c) { return this._s.has(c); }, add(c) { this._s.add(c); } },
            setAttribute(k, val) { this['_' + k] = val; },
            getAttribute(k) { return this['_' + k] || null; },
            querySelector: () => null,
          };
        },
        get innerHTML() { return stub._html; },
      };
      return stub;
    },
  },
  window: undefined,
  LanternMedia: undefined,
  LANTERN_AVATAR_API: '',
  location: { href: '' },
  open() {},
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(cardsJs, sandbox);
const LC = sandbox.LanternCards;

assert(typeof LC.formatCompactAuthor === 'function', 'exports formatCompactAuthor');
assert(typeof LC.formatCompactDate === 'function', 'exports formatCompactDate');
assert(typeof LC.getExploreDescriptionPreview === 'function', 'exports getExploreDescriptionPreview');

assert(LC.formatCompactAuthor('Zane Morris') === 'Zane M.', 'author Zane Morris → Zane M.');
assert(LC.formatCompactAuthor('Rick Radle') === 'Rick R.', 'author Rick Radle → Rick R.');
assert(LC.formatCompactAuthor('Lucas Radle') === 'Lucas R.', 'author Lucas Radle → Lucas R.');
assert(LC.formatCompactAuthor('Madonna') === 'Madonna', 'single-name stays single');
assert(LC.formatCompactAuthor('2081234') === '', 'numeric student id suppressed');
assert(LC.formatCompactAuthor('Zane Morris · 2081234') === 'Zane M.', 'trailing id stripped then compact');

assert(LC.formatCompactDate('2026-03-02T12:00:00.000Z') === '3/2/26' || LC.formatCompactDate(new Date(2026, 2, 2)) === '3/2/26', 'date M/D/YY');
assert(LC.formatCompactDate(new Date(2026, 7, 10)) === '8/10/26', 'date Aug 10 → 8/10/26');

assert(LC.getExploreDescriptionPreview({ title: 'T', summary: 'Mission' }) === '', 'junk Mission description omitted');
assert(LC.getExploreDescriptionPreview({ title: 'T', summary: 'Mission completed' }) === '', 'junk Mission completed omitted');
assert(LC.getExploreDescriptionPreview({ title: 'T', summary: 'Photo submission' }) === '', 'junk Photo submission omitted');
assert(LC.getExploreDescriptionPreview({ title: 'T', summary: 'Shout-Out!' }) === '', 'junk Shout-Out! omitted');
assert(LC.getExploreDescriptionPreview({ title: 'Hello', summary: 'Hello' }) === '', 'description equal to title omitted');
assert(
  LC.getExploreDescriptionPreview({ title: 'Lighthouse Interview', summary: 'Interviewed the lighthouse keeper about storms.' })
    .startsWith('Interviewed'),
  'real description preview kept'
);

const newsItem = {
  id: 'news:1',
  type: 'news',
  title: 'Lighthouse Interview',
  body: 'Interviewed the lighthouse keeper about storms along the coast.',
  summary: 'Interviewed the lighthouse keeper about storms along the coast.',
  authorDisplayName: 'Zane Morris',
  character_name: 'Zane Morris',
  approvedAt: '2026-03-02T18:00:00.000Z',
  createdAt: '2026-03-02T18:00:00.000Z',
};
const newsModel = LC.normalizeFeedItemToFaceModel(newsItem);
assert(newsModel.exploreOverlay === true, '1. explore overlay flag set');
assert(newsModel.title === 'Lighthouse Interview', '1b. canonical headline title');
assert(!/Mission/i.test(newsModel.dateMeta || ''), '3. content-type not in dateMeta');
assert(newsModel.dateMeta === LC.formatCompactDate(newsItem.approvedAt), '5. dateMeta is M/D/YY');
assert(LC.formatCompactAuthor(newsModel.author) === 'Zane M.', '4. author formats to First L.');
assert(newsModel.descriptionPreview.indexOf('Interviewed') === 0, '7. description preview present');

const html = LC.buildCanonicalCardFaceHtml(newsModel);
assert(/lanternCanonicalCardTitle/.test(html), 'headline class present');
assert(/lanternCanonicalCardAuthor/.test(html) && /Zane M\./.test(html), 'author First L. in face HTML');
assert(/lanternCanonicalCardDate/.test(html) && /\d{1,2}\/\d{1,2}\/\d{2}/.test(html), 'compact date in face HTML');
assert(/lanternCanonicalCardDesc/.test(html) && /Interviewed/.test(html), 'description in face HTML');
assert(/exploreCardAvatarImg|identity-chip/.test(html), '6. avatar markup present when explore overlay');
assert(!/208\d+/.test(html), '2. internal IDs not rendered');
assert(!/>\s*Mission\s*</.test(html) && !/ · Mission/.test(html), '3b. Mission label not in overlay meta');
assert(!/Aug(ust)?\s+\d/i.test(html) && !/March\s+\d/i.test(html), 'no long month-name date');

const missionItem = {
  id: 'mission:9',
  type: 'mission',
  title: 'Daily Check-In',
  body: '',
  summary: 'Mission completed',
  authorDisplayName: 'Lucas Radle',
  character_name: 'Lucas Radle',
  approvedAt: '2026-08-06T12:00:00.000Z',
  contentSlot: { missionId: 'm1' },
};
const missionModel = LC.normalizeFeedItemToFaceModel(missionItem);
assert(missionModel.title === 'Daily Check-In', '9. mission uses source mission title');
assert(missionModel.descriptionPreview === '', '8. no-description stops cleanly (junk summary dropped)');
const missionHtml = LC.buildCanonicalCardFaceHtml(missionModel);
assert(/Daily Check-In/.test(missionHtml), '9b. mission title in face');
assert(!/lanternCanonicalCardDesc/.test(missionHtml), '8b. no empty description segment');
assert(!/Mission completed|Mission Submission|\bMission\b/.test(missionHtml.replace(/Daily Check-In/g, '')), 'mission junk labels absent from overlay');

const pollModel = LC.normalizeFeedItemToFaceModel({
  id: 'poll:1',
  type: 'poll',
  title: 'What is your favorite lunch?',
  summary: 'Pizza · Tacos · Salad',
  authorDisplayName: 'Rick Radle',
  approvedAt: '2026-08-10T00:00:00.000Z',
});
const pollHtml = LC.buildCanonicalCardFaceHtml(pollModel);
assert(/What is your favorite lunch\?/.test(pollHtml), '10. poll question is headline');
assert(/Rick R\./.test(pollHtml), '10b. poll author compact');
assert(!/ · Poll/.test(pollHtml), '10c. Poll type not in meta line');

const shoutModel = LC.normalizeFeedItemToFaceModel({
  id: 'shout_out:1',
  type: 'shout_out',
  title: 'Mrs. Glorioso Rules!',
  summary: 'Thanks for always helping our class learn and grow.',
  body: 'Recognizing: Mrs. Glorioso\n\nThanks for always helping our class learn and grow.',
  authorDisplayName: 'Rick Radle',
  approvedAt: '2026-08-06T00:00:00.000Z',
  contentSlot: { recipient: 'Mrs. Glorioso' },
});
const shoutHtml = LC.buildCanonicalCardFaceHtml(shoutModel);
assert(/Mrs\. Glorioso Rules!/.test(shoutHtml), '10d. shout-out headline');
assert(/lanternCanonicalCardDesc/.test(shoutHtml) && /Mrs\. Glorioso/.test(shoutHtml), '10e. shout-out compact meta = recognized party');
assert(!/Recognizing:/.test(shoutHtml), '10e2. Recognizing: prefix omitted from compact card');
assert(!/Thanks for always helping/.test(shoutHtml), '10e3. shout message not used as compact meta');

const shoutFree = LC.normalizeFeedItemToFaceModel({
  id: 'shout_out:2',
  type: 'shout_out',
  title: 'Team shout',
  summary: 'Recognizing: Volleyball Coaches\n\nGreat season!',
  body: 'Recognizing: Volleyball Coaches\n\nGreat season!',
  authorDisplayName: 'Rick Radle',
  approvedAt: '2026-08-11T00:00:00.000Z',
});
assert(shoutFree.descriptionPreview === 'Volleyball Coaches', '10f. free-text recognition label only');
assert(!/^Recognizing:/i.test(shoutFree.descriptionPreview || ''), '10f2. no Recognizing: in descriptionPreview');

// Prompt #220 — staff honorific authors on Explore cards
assert(typeof LC.formatExploreAuthorLabel === 'function', '220a. formatExploreAuthorLabel exported');
assert(LC.formatExploreAuthorLabel({ authorPublicLabel: 'Mr. Radle', authorRole: 'teacher' }) === 'Mr. Radle', '220b. Mr. Radle passthrough');
assert(LC.formatExploreAuthorLabel({ authorPublicLabel: 'Ms. Pachelli', authorRole: 'teacher' }) === 'Ms. Pachelli', '220c. Ms. Pachelli passthrough');
assert(LC.formatExploreAuthorLabel({ author: 'Rick Radle', authorRole: 'teacher' }) === 'Rick Radle', '220d. missing honorific keeps full staff name');
const staffAuthored = LC.normalizeFeedItemToFaceModel({
  id: 'news:staff220',
  type: 'news',
  title: 'Staff News',
  authorDisplayName: 'Rick Radle',
  authorPublicLabel: 'Mr. Radle',
  authorRole: 'teacher',
  approvedAt: '2026-08-11T00:00:00.000Z',
});
const staffAuthoredHtml = LC.buildCanonicalCardFaceHtml(staffAuthored);
assert(/Mr\. Radle/.test(staffAuthoredHtml), '220e. compact card shows Mr. Radle');
assert(!/Rick R\./.test(staffAuthoredHtml), '220f. staff not reduced to First L.');

const shoutMissing = LC.normalizeFeedItemToFaceModel({
  id: 'shout_out:3',
  type: 'shout_out',
  title: 'Empty recognition',
  summary: 'Just a message with no recognition line.',
  body: 'Just a message with no recognition line.',
  authorDisplayName: 'Rick Radle',
  approvedAt: '2026-08-11T00:00:00.000Z',
});
assert(shoutMissing.descriptionPreview === '', '10g. missing recognition omits compact segment');

assert(/-webkit-line-clamp:\s*1/.test(cardsCss) && /line-clamp:\s*1/.test(cardsCss), '11. CSS one-line title clamp');
assert(/lanternCanonicalCardDesc/.test(cardsCss) && /text-overflow:\s*ellipsis/.test(cardsCss), '11b. description CSS ellipsis');
assert(
  /--lantern-content-author-avatar-size:\s*28px/.test(cardsCss) &&
    /\.lanternCanonicalCardMeta\s+\.exploreCardAvatarImg[\s\S]{0,120}var\(--lantern-content-author-avatar-size/.test(cardsCss) &&
    /max-height:\s*58%/.test(cardsCss),
  '11c. LLHC overlay avatar matches shared 28px token and fits overlay'
);

const gameSpec = LC.specGameHubRailCard({
  title: 'Nugget Hunt',
  hubIdentityLabel: '',
  metaOne: '1 Nugget = 1 Play',
  extraClass: 'exploreCard--gamesLibrary',
});
const gameHtml = LC.buildCanonicalCardFaceHtml(gameSpec.canonicalModel);
assert(gameSpec.canonicalModel.exploreOverlay !== true, 'games hub stays non-explore overlay');
assert(/1 Nugget = 1 Play/.test(gameHtml), '12. games cost meta unchanged');

console.log('\nexplore-card-overlay-test:', pass, 'PASS', fail, 'FAIL');
process.exit(fail ? 1 : 0);
