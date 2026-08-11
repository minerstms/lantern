/**
 * Prompt #177 — Shout-Outs stay primary type shout_out regardless of attached media.
 * Usage: node worker/scripts/shoutout-primary-type-177-test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  inferNewsType,
  isPeerShoutOutNewsSubmission,
  normalizeNewsRow,
  normalizeShoutOutRow,
  filterFeedItems,
} from '../feed-handlers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..', '..');

let pass = 0;
let fail = 0;
function ok(label) { pass++; console.log('PASS', label); }
function bad(label, detail) { fail++; console.error('FAIL', label, detail != null ? detail : ''); }
function assert(cond, label, detail) { if (cond) ok(label); else bad(label, detail); }

const cardsJs = fs.readFileSync(path.join(root, 'app/js/lantern-cards.js'), 'utf8');
const feedSrc = fs.readFileSync(path.join(root, 'worker/feed-handlers.js'), 'utf8');
const indexSrc = fs.readFileSync(path.join(root, 'worker/index.js'), 'utf8');

assert(/isPeerShoutOutNewsSubmission/.test(feedSrc), 'shared peer shout-out detector present');
assert(/isPeerShoutOutNewsSubmission\(row\)\) return 'shout_out'/.test(feedSrc),
  'inferNewsType prefers shout_out before media');
assert(/isPeerShoutOutNewsSubmission\(newsRow\)/.test(indexSrc), 'news approval hooks Shout-Out Someone for peer shout-outs');
assert(/default\/default_shoutout\.png/.test(cardsJs), 'fallback artwork preserved');

const shoutBody = 'Shout-out (Kindness)\n\nRecognizing: Lucas\n\nThank you for helping today with enough text.';
const origin = 'https://example.test';

assert(isPeerShoutOutNewsSubmission({ body: shoutBody, title: 'Shout-out: Lucas' }), 'peer shout detector matches Contribute body');
assert(!isPeerShoutOutNewsSubmission({ body: 'Campus photo day', title: 'Photo', image_r2_key: 'news/x.png' }), 'standalone photo is not a peer shout');

assert(inferNewsType({ body: shoutBody, title: 'Shout-out: Lucas' }) === 'shout_out', 'text-only student shout → shout_out');
assert(inferNewsType({ body: shoutBody, title: 'Shout-out: Lucas', image_r2_key: 'news/a.png' }) === 'shout_out', 'photo shout → shout_out not photo');
assert(inferNewsType({ body: shoutBody, title: 'Shout-out: Lucas', video_r2_key: 'news/video/v.mp4' }) === 'shout_out', 'video shout → shout_out not video');
assert(inferNewsType({ body: shoutBody, title: 'Shout-out: Lucas', link_url: 'https://example.com' }) === 'shout_out', 'link shout → shout_out not article');

assert(inferNewsType({ body: 'hi', title: 'Photo post', image_r2_key: 'img/1' }) === 'photo', 'standalone photo stays photo');
assert(inferNewsType({ body: 'clip', title: 'Video', video_r2_key: 'news/video/v.mp4' }) === 'video', 'standalone video stays video');
assert(inferNewsType({ body: 'text', title: 'Article only', category: 'features' }) === 'article', 'article stays article');
assert(inferNewsType({ body: 'bulletin', title: 'News', category: 'news' }) === 'news', 'news category stays news');

const photoShout = normalizeNewsRow({
  id: 'n-shout-photo',
  title: 'Shout-out: Lucas',
  body: shoutBody,
  author_name: 'zane_morrison',
  author_type: 'student',
  category: 'Student Spotlight',
  image_r2_key: 'news/abc.png',
  full_image_r2_key: 'news/abc-full.png',
  created_at: '2026-08-10T12:00:00.000Z',
  reviewed_at: '2026-08-10T12:05:00.000Z',
}, origin);
assert(photoShout.type === 'shout_out' && photoShout.typeLabel === 'Shout-Out', 'normalized photo shout primary type');
assert(/\/api\/news\/image\?key=/.test(photoShout.thumbnailUrl || ''), 'photo media still on feed item');
assert(filterFeedItems([photoShout], { type: 'shout_out' }).length === 1, 'photo shout appears under Shout-Outs filter');
assert(filterFeedItems([photoShout], { type: 'photo' }).length === 0, 'photo shout does NOT appear under Photos');

const videoShout = normalizeNewsRow({
  id: 'n-shout-video',
  title: 'Shout-out: Mia',
  body: shoutBody.replace('Lucas', 'Mia'),
  author_name: 'zane_morrison',
  author_type: 'student',
  video_r2_key: 'news/video/v1.mp4',
  created_at: '2026-08-10T12:00:00.000Z',
  reviewed_at: '2026-08-10T12:05:00.000Z',
}, origin);
assert(videoShout.type === 'shout_out', 'normalized video shout primary type');
assert(/\/api\/news\/video\?key=/.test(videoShout.videoUrl || ''), 'video media still on feed item');
assert(filterFeedItems([videoShout], { type: 'video' }).length === 0, 'video shout does NOT appear under Videos');

const linkShout = normalizeNewsRow({
  id: 'n-shout-link',
  title: 'Shout-out: Pat',
  body: shoutBody.replace('Lucas', 'Pat'),
  author_name: 'zane_morrison',
  author_type: 'student',
  link_url: 'https://example.com/path',
  created_at: '2026-08-10T12:00:00.000Z',
  reviewed_at: '2026-08-10T12:05:00.000Z',
}, origin);
assert(linkShout.type === 'shout_out', 'normalized link shout primary type');
assert(linkShout.contentSlot && linkShout.contentSlot.linkUrl === 'https://example.com/path', 'link still in contentSlot');
assert(filterFeedItems([linkShout], { type: 'article' }).length === 0, 'link shout does NOT appear under Articles');

const textShout = normalizeNewsRow({
  id: 'n-shout-text',
  title: 'Shout-out: Chris',
  body: shoutBody.replace('Lucas', 'Chris'),
  author_name: 'zane_morrison',
  author_type: 'student',
  category: 'Student Spotlight',
  created_at: '2026-08-10T12:00:00.000Z',
  reviewed_at: '2026-08-10T12:05:00.000Z',
}, origin);
assert(textShout.type === 'shout_out' && !textShout.thumbnailUrl && !textShout.imageUrl && !textShout.videoUrl,
  'text-only shout has no media URLs (card uses default_shoutout.png)');

const teacher = normalizeShoutOutRow({
  id: 'rec-1',
  character_name: 'Lucas',
  message: 'Great work',
  created_at: '2026-08-10T12:00:00.000Z',
  created_by_teacher_name: 'Rick Radle',
  image_r2_key: 'news/t.png',
  video_r2_key: null,
  link_url: null,
}, origin);
assert(teacher.type === 'shout_out', 'teacher photo shout remains shout_out');
assert(filterFeedItems([teacher], { type: 'photo' }).length === 0, 'teacher photo shout not in Photos');

// Mixed feed: shouts under shout_out; standalone photo under photo.
const mixed = [photoShout, videoShout, linkShout, textShout, teacher, normalizeNewsRow({
  id: 'n-photo',
  title: 'Photo post',
  body: 'hi',
  author_name: 'Lucas',
  image_r2_key: 'img/1',
  created_at: '2026-08-10T12:00:00.000Z',
  reviewed_at: '2026-08-10T12:05:00.000Z',
}, origin)];
assert(filterFeedItems(mixed, { type: 'shout_out' }).length === 5, 'all five shouts under Shout-Outs');
assert(filterFeedItems(mixed, { type: 'photo' }).length === 1, 'only standalone photo under Photos');
assert(filterFeedItems(mixed, {}).length === 6, 'All filter still includes everything');

// No secondary media facets invented.
assert(!/secondary.?facet|media_type/.test(feedSrc), 'no new secondary-facet / media_type architecture');

console.log('\nshoutout-primary-type-177-test:', pass, 'PASS', fail, 'FAIL');
process.exit(fail ? 1 : 0);
