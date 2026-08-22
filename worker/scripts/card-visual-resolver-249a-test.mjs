/**
 * Prompt #249A — student-facing card visual resolver.
 * Fails if a normal Explore card can terminate in the gray "Lantern" SVG
 * or if empty same-origin API base yields no cover.
 * Usage: node worker/scripts/card-visual-resolver-249a-test.mjs
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const cardsPath = path.join(root, 'app/js/lantern-cards.js');
const mediaPath = path.join(root, 'app/js/lantern-media.js');
const cardsSrc = fs.readFileSync(cardsPath, 'utf8');
const mediaSrc = fs.readFileSync(mediaPath, 'utf8');

let pass = 0;
let fail = 0;
function ok(m) {
  pass++;
  console.log('PASS', m);
}
function bad(m, d) {
  fail++;
  console.error('FAIL', m, d != null ? d : '');
}
function assert(cond, m, d) {
  if (cond) ok(m);
  else bad(m, d);
}

function loadCards(apiBase) {
  const sandbox = {
    console,
    document: undefined,
    window: undefined,
    LANTERN_AVATAR_API: apiBase,
    LanternMedia: undefined,
  };
  sandbox.global = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(cardsSrc, sandbox);
  return { sandbox, LC: sandbox.LanternCards };
}

const GRAY_MARKERS = [
  'svgUniversalLanternDataUri',
  'getUniversalFallbackMediaDataUri',
  'data:image/svg+xml',
  '>Lantern</text>',
];

assert(!/data-lc-u="' \+ esc\(uniSvg\)/.test(cardsSrc), 'canonical compositor no longer binds universal gray SVG');
assert(/resolveCardVisual/.test(cardsSrc), 'resolveCardVisual present');
assert(/APPROVED_FINAL_FALLBACK_URL/.test(cardsSrc), 'approved final fallback constant present');
assert(/function apiBase\(\)[\s\S]*return ''/.test(cardsSrc), 'apiBase treats missing/empty as same-origin');

const { LC } = loadCards('');
assert(LC && typeof LC.resolveCardVisual === 'function', 'LanternCards.resolveCardVisual exported');

function expectVisual(name, item, url, kind) {
  const v = LC.resolveCardVisual(item);
  assert(v && v.cardUrl === url, name + ' cardUrl', v);
  if (kind) assert(v.kind === kind, name + ' kind=' + kind, v);
  assert(v && v.cardUrl && !/^data:image\/svg/i.test(v.cardUrl), name + ' not SVG', v);
}

expectVisual('1 text-only article', { type: 'article', title: 'Plain writing' }, 'assets/good-news.png', 'type_art');
expectVisual('2 text-only news', { type: 'news', title: 'School news' }, 'assets/good-news.png', 'type_art');
expectVisual('3 text-only Shout-Out', { type: 'shout_out', title: 'Shout-out: Sam' }, 'assets/shout-out-card.png', 'type_art');
expectVisual('4 poll no image', { type: 'poll', title: 'Favorite lunch?' }, 'assets/make-poll.png', 'type_art');
expectVisual('5 video no still', { type: 'video', title: 'Clip', videoUrl: '/api/news/video?key=news/video/x' }, 'assets/create-something.png', 'type_art');
expectVisual('6 link no image', { type: 'link', title: 'Article', url: 'https://example.com/page' }, 'assets/good-news.png', 'type_art');
expectVisual('7 generic mission no photo', { type: 'mission', missionId: 'tmission_custom_xyz' }, 'assets/mission-card.png', 'mission_art');
expectVisual('8 built-in thank-you', { type: 'mission', missionId: 'perm_thank_you' }, 'assets/thank-you-letter.png', 'mission_art');
expectVisual('9 Draw/Create', { type: 'creation', title: 'Draw something' }, 'assets/create-something.png', 'type_art');
expectVisual('10 STEM Today', { type: 'mission', missionId: 'tmission_1773763739628_hhzqrr' }, 'assets/stem-today.png', 'mission_art');
expectVisual('11 unknown type', { type: 'mystery_widget', title: '???' }, 'assets/mission-card.png', 'approved_fallback');
expectVisual(
  '12 real student image wins',
  { type: 'article', imageUrl: 'https://cdn.example/student.jpg' },
  'https://cdn.example/student.jpg',
  'real_media'
);

const broken = LC.resolveCardVisual({ type: 'news', thumbnailUrl: '/api/news/image?key=news/stale-gone' });
assert(broken.kind === 'type_art' && broken.cardUrl === 'assets/good-news.png', '13 missing stored thumb uses approved type art, not the original delivery URL', broken);

const emptyBase = loadCards('');
assert(
  emptyBase.LC.getDefaultImageUrl('news') === '/api/media/image?key=default%2Fdefault_news.png',
  '14 empty same-origin API base still builds /api/media/image URL',
  emptyBase.LC.getDefaultImageUrl('news')
);
assert(
  emptyBase.LC.resolveCardVisual({ type: 'news' }).cardUrl === 'assets/good-news.png',
  '15 empty same-origin API base still resolves approved repo art'
);

const explicit = loadCards('https://api.example.test');
assert(
  explicit.LC.getDefaultImageUrl('poll') === 'https://api.example.test/api/media/image?key=default%2Fdefault_poll.png',
  '16 explicit API base preserved on getDefaultImageUrl',
  explicit.LC.getDefaultImageUrl('poll')
);
assert(
  explicit.LC.resolveCardVisual({ type: 'poll' }).cardUrl === 'assets/make-poll.png',
  '17 explicit API base still prefers repo type art for cards'
);

const htmlCases = [
  { type: 'article', title: 'Text only' },
  { type: 'shout_out', title: 'Shout-out' },
  { type: 'poll', title: 'Poll' },
  { type: 'video', title: 'Video' },
  { type: 'link', title: 'Link', url: 'https://example.com' },
  { type: 'mission', missionId: 'unknown_mission', title: 'Mission' },
  { type: 'mission', missionId: 'perm_create_something', title: 'Create' },
  { type: 'zzz_unknown', title: 'Unknown' },
  { type: 'news', thumbnailUrl: '/api/news/image?key=news/broken' },
];
htmlCases.forEach((item) => {
  const model = LC.normalizeFeedItemToFaceModel(item);
  const html = LC.buildCanonicalCardFaceHtml(model, { lanternCardType: item.type });
  assert(html && /lanternCanonicalCardImage/.test(html), 'html has card image: ' + item.type);
  const img = html.match(/<img class="lanternCanonicalCardImage"[^>]*>/);
  assert(!!img, 'canonical image tag present for ' + item.type);
  const tag = img ? img[0] : '';
  assert(!/data:image\/svg\+xml/.test(tag), 'card <img> has no SVG data-URI for ' + item.type, tag);
  assert(!/>Lantern<\/text>/.test(tag), 'card <img> is not gray Lantern SVG for ' + item.type);
  assert(/src="(assets\/[a-z0-9-]+\.png|\/api\/news\/thumb[^"]*)"/.test(tag), 'card <img> uses approved PNG or stored thumb for ' + item.type, tag);
  assert(/data-lc-t="assets\/[a-z0-9-]+\.png"/.test(tag), 'onerror type target is approved PNG for ' + item.type, tag);
  assert(/data-lc-u="assets\/mission-card\.png"/.test(tag), 'onerror final target is approved mission-card for ' + item.type, tag);
});

assert(!mediaSrc.includes('>Lantern</text>'), 'lantern-media explore no longer embeds gray Lantern SVG');
assert(mediaSrc.includes('assets/create-something.png'), 'lantern-media video-without-still uses approved creation art');

const teacherKeepsGlyph = mediaSrc.includes('TEACHER_IMG_FALLBACK_SVG') && /variant === 'teacher'/.test(mediaSrc);
assert(teacherKeepsGlyph, 'teacher review still has evidence-only image fallback glyph');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
