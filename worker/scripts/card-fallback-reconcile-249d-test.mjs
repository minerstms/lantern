/**
 * Prompt #249D — Explore card faces must not terminate on legacy default/* placeholders.
 * Exercises resolveCardVisual AND the rendered compact-face HTML path.
 * Usage: node worker/scripts/card-fallback-reconcile-249d-test.mjs
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const cardsSrc = fs.readFileSync(path.join(root, 'app/js/lantern-cards.js'), 'utf8');
const feedCardSrc = fs.readFileSync(path.join(root, 'app/js/lantern-feed-card.js'), 'utf8');
const exploreSrc = fs.readFileSync(path.join(root, 'app/js/lantern-feed-explore.js'), 'utf8');
const cardUiSrc = fs.readFileSync(path.join(root, 'app/js/lantern-card-ui.js'), 'utf8');
const mediaSrc = fs.readFileSync(path.join(root, 'app/js/lantern-media.js'), 'utf8');

let pass = 0;
let fail = 0;
function ok(m) { pass++; console.log('PASS', m); }
function bad(m, d) { fail++; console.error('FAIL', m, d != null ? d : ''); }
function assert(cond, m, d) {
  if (cond) ok(m);
  else bad(m, d);
}

function loadCards() {
  const sandbox = { console, document: undefined, window: undefined, LANTERN_AVATAR_API: '' };
  sandbox.global = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(cardsSrc, sandbox);
  return sandbox.LanternCards;
}

const LC = loadCards();

function imgSrc(html) {
  const m = String(html || '').match(/<img class="lanternCanonicalCardImage"[^>]*src="([^"]*)"/);
  return m ? m[1] : '';
}

function renderItem(item) {
  const model = LC.normalizeFeedItemToFaceModel(item);
  return LC.buildCanonicalCardFaceHtml(model, { lanternCardType: item.type || 'news' });
}

assert(typeof LC.isLegacyDefaultMediaUrl === 'function', 'isLegacyDefaultMediaUrl exported');
assert(LC.isLegacyDefaultMediaUrl('/api/media/image?key=default/default_poll.png'), 'detects default_poll key');
assert(LC.isLegacyDefaultMediaUrl('https://tmslantern.org/api/media/image?key=default%2Fdefault_poll.png'), 'detects encoded default_poll');
assert(LC.isLegacyDefaultMediaUrl('default/default_news.png'), 'detects bare default_news key');
assert(!LC.isLegacyDefaultMediaUrl('/api/media/image?key=library/art/art_1.png'), 'library art is not a legacy default');
assert(!LC.isLegacyDefaultMediaUrl('/api/news/thumb?source_kind=poll&source_id=p1'), 'stored thumb is not a legacy default');

const POLL_SHAPES = [
  { name: 'normal imageless poll', item: { type: 'poll', title: 'Lunch?' } },
  { name: 'null image_url', item: { type: 'poll', title: 'Lunch?', imageUrl: null } },
  { name: 'empty-string image_url', item: { type: 'poll', title: 'Lunch?', imageUrl: '', image_url: '' } },
  { name: 'legacy default_poll URL', item: { type: 'poll', title: 'Lunch?', imageUrl: '/api/media/image?key=default/default_poll.png' } },
  { name: 'encoded default_poll URL', item: { type: 'poll', title: 'Lunch?', thumbnailUrl: 'https://tmslantern.org/api/media/image?key=default%2Fdefault_poll.png' } },
  { name: 'fallback_key present', item: { type: 'poll', title: 'Lunch?', fallback_key: 'poll', image_url: '/api/media/image?key=default/default_poll.png' } },
  { name: 'fallback_key absent', item: { type: 'poll', title: 'Lunch?', fallback_key: '' } },
  { name: 'poll contribution no image', item: { type: 'poll', title: 'Contrib poll', source: 'poll_contribution' } },
  { name: 'broken image_url', item: { type: 'poll', title: 'Broken', thumbnailUrl: 'assets/does-not-exist-249d.png' } },
];

POLL_SHAPES.forEach((row) => {
  const v = LC.resolveCardVisual(row.item);
  const html = renderItem(row.item);
  const src = imgSrc(html);
  const expectArt = row.name === 'broken image_url' ? 'assets/does-not-exist-249d.png' : 'assets/make-poll.png';
  if (row.name === 'broken image_url') {
    assert(src === 'assets/does-not-exist-249d.png', row.name + ' broken src is attempted then onerror type art', src);
    assert(/data-lc-t="assets\/make-poll\.png"/.test(html), row.name + ' onerror → make-poll.png');
  } else {
    assert(v.cardUrl === 'assets/make-poll.png' && v.kind === 'type_art', row.name + ' resolveCardVisual → make-poll.png', v);
    assert(src === 'assets/make-poll.png', row.name + ' rendered src is make-poll.png', src);
  }
  assert(!/default\/default_poll/.test(html), row.name + ' HTML has no default_poll');
  assert(!/DEFAULT POLL/.test(html), row.name + ' HTML has no DEFAULT POLL text');
  void expectArt;
});

const withThumb = {
  type: 'poll',
  title: 'Thumbed poll',
  storedThumbnailUrl: '/api/news/thumb?source_kind=poll&source_id=p-ok',
  imageUrl: '/api/media/image?key=default/default_poll.png',
};
const thumbV = LC.resolveCardVisual(withThumb);
assert(thumbV.kind === 'stored_thumbnail' && thumbV.cardUrl.indexOf('/api/news/thumb') === 0, 'stored thumbnail wins over default_poll', thumbV);
assert(imgSrc(renderItem(withThumb)).indexOf('/api/news/thumb') === 0, 'rendered stored thumb wins');

const realLib = {
  type: 'poll',
  title: 'Library poll',
  imageUrl: '/api/media/image?key=library/art/art_1.png',
};
const libV = LC.resolveCardVisual(realLib);
assert(libV.kind === 'real_media' && /library\/art/.test(libV.cardUrl), 'valid library poll image still wins', libV);

const TYPES = [
  { name: 'shout-out', item: { type: 'shout_out', title: 'Go team' }, art: 'assets/shout-out-card.png' },
  { name: 'article/news', item: { type: 'article', title: 'News' }, art: 'assets/good-news.png' },
  { name: 'link', item: { type: 'link', title: 'Link', url: 'https://example.com' }, art: 'assets/good-news.png' },
  { name: 'video', item: { type: 'video', title: 'Vid', videoUrl: '/api/news/video?key=news/video/x' }, art: 'assets/create-something.png' },
  { name: 'generic mission', item: { type: 'mission', missionId: 'tmission_custom_xyz' }, art: 'assets/mission-card.png' },
  { name: 'built-in mission', item: { type: 'mission', missionId: 'perm_thank_you' }, art: 'assets/thank-you-letter.png' },
  { name: 'Create/Draw', item: { type: 'creation', title: 'Draw' }, art: 'assets/create-something.png' },
  { name: 'STEM Today', item: { type: 'mission', missionId: 'tmission_1773763739628_hhzqrr' }, art: 'assets/stem-today.png' },
  { name: 'unknown type', item: { type: 'mystery_widget', title: '??' }, art: 'assets/mission-card.png' },
];
TYPES.forEach((row) => {
  const html = renderItem(row.item);
  const tag = String(html || '').match(/<img class="lanternCanonicalCardImage"[^>]*>/);
  const src = imgSrc(html);
  assert(src === row.art, row.name + ' rendered art', src);
  assert(tag && !/DEFAULT POLL/.test(tag[0]) && !/data:image\/svg/.test(tag[0]) && !/>Lantern<\/text>/.test(tag[0]), row.name + ' card image is not a legacy placeholder', tag && tag[0]);
});

const newsDefault = renderItem({
  type: 'news',
  title: 'Old default news',
  imageUrl: '/api/media/image?key=default/default_news.png',
});
assert(imgSrc(newsDefault) === 'assets/good-news.png', 'legacy default_news is not a card face', imgSrc(newsDefault));

const missingThumb = LC.resolveCardVisual({
  type: 'poll',
  imageUrl: '/api/news/image?key=news/poll-photo.png',
});
assert(missingThumb.cardUrl === 'assets/make-poll.png', 'missing stored thumb does not use /api/news/image on the grid', missingThumb);

assert(!/getDefaultImageUrl\(/.test(exploreSrc), 'explore controller does not call getDefaultImageUrl');
assert(/LANTERN_FEED_CARD/.test(exploreSrc) && /buildCard/.test(exploreSrc), 'Explore uses LANTERN_FEED_CARD.buildCard');
assert(/normalizeFeedItemToFaceModel/.test(feedCardSrc), 'feed card uses normalizeFeedItemToFaceModel');
assert(!/default\/default_poll\.png/.test(cardUiSrc), 'card-ui no longer hardcodes default_poll.png');
assert(/isLegacyDefaultMediaUrl/.test(cardUiSrc), 'card-ui rejects legacy default media');
assert(/TEACHER_IMG_FALLBACK_SVG/.test(mediaSrc) && /variant === 'teacher'/.test(mediaSrc), 'Teacher Review evidence glyph unchanged');

const LEGACY_MARKERS = ['DEFAULT POLL', 'default/default_poll.png', 'svgUniversalLanternDataUri(', 'getUniversalFallbackMediaDataUri'];
const exploreHtml = renderItem({ type: 'poll', imageUrl: '/api/media/image?key=default/default_poll.png' });
LEGACY_MARKERS.forEach((m) => {
  assert(exploreHtml.indexOf(m) === -1, 'rendered Explore HTML cannot contain ' + m);
});

console.log(fail ? `FAIL ${fail}  PASS ${pass}` : `PASS ${pass}`);
if (fail) process.exit(1);
