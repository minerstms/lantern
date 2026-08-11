/**
 * Prompt #175 — Teacher Shout-Out media parity + shared artwork fallback.
 * Usage: node worker/scripts/teacher-shoutout-media-175-test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeShoutOutRow } from '../feed-handlers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..', '..');

let pass = 0;
let fail = 0;
function ok(label) { pass++; console.log('PASS', label); }
function bad(label, detail) { fail++; console.error('FAIL', label, detail != null ? detail : ''); }
function assert(cond, label, detail) { if (cond) ok(label); else bad(label, detail); }

const teacherHtml = fs.readFileSync(path.join(root, 'app/teacher.html'), 'utf8');
const cardsJs = fs.readFileSync(path.join(root, 'app/js/lantern-cards.js'), 'utf8');
const contribHtml = fs.readFileSync(path.join(root, 'app/contribute.html'), 'utf8');
const workerJs = fs.readFileSync(path.join(root, 'worker/index.js'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'worker/migrations/061_teacher_recognition_media.sql'), 'utf8');
const unified = fs.readFileSync(path.join(root, 'app/js/lantern-unified-media-field.js'), 'utf8');

assert(/id="shoutOutMediaMount"/.test(teacherHtml), 'Teacher form has unified media mount');
assert(/Add photo, video, or link/.test(teacherHtml), 'Teacher media label present');
assert(/lantern-unified-media-field\.js/.test(teacherHtml), 'Teacher loads LanternUnifiedMediaField');
assert(/cropper\.min\.js/.test(teacherHtml), 'Teacher loads CropperJS for photo parity');
assert(/\/api\/news\/upload-image/.test(teacherHtml) && /\/api\/news\/upload-video/.test(teacherHtml), 'Teacher reuses news upload endpoints');
assert(/LanternUnifiedMediaField\.mount/.test(teacherHtml), 'Teacher mounts canonical media field');
assert(/allowImage:\s*true/.test(teacherHtml) && /allowVideo:\s*true/.test(teacherHtml) && /allowLink:\s*true/.test(teacherHtml), 'Teacher allows photo/video/link');
assert(/Post Shout-Out!/.test(teacherHtml), 'plain-text Post button preserved');
assert(/\/api\/recognition\/create/.test(teacherHtml), 'Teacher still posts via recognition create');

assert(/LanternUnifiedMediaField/.test(unified), 'canonical unified media helper present');
assert(/newsUnifiedMediaMount/.test(contribHtml) && /allowImage:\s*true/.test(contribHtml), 'student Contribute Shout-Out media unchanged');

assert(/image_r2_key/.test(migration) && /video_r2_key/.test(migration) && /link_url/.test(migration), 'migration adds canonical media columns');
assert(/full_image_r2_key/.test(workerJs) && /link_url/.test(workerJs), 'recognition create accepts media fields');
assert(/media_schema_required|news\/video\//.test(workerJs), 'recognition create validates R2 key prefixes');
assert(!/created_by_teacher_name:\s*'Teacher'/.test(teacherHtml.match(/initShoutOutWorkspace[\s\S]*?\n    \}\)\(\);/)?.[0] || ''), 'client no longer spoofs Teacher author name in create body');

assert(/t === 'shoutout' \|\| t === 'shout_out'/.test(cardsJs), 'artwork key maps shout_out → default_shoutout');
assert(/default\/default_shoutout\.png/.test(cardsJs), 'canonical Shout-Out asset referenced');

const origin = 'https://example.test';
const withPhoto = normalizeShoutOutRow({
  id: 'rec-1',
  character_name: 'Lucas',
  message: 'Great work',
  category: 'Effort',
  created_at: '2026-08-10T12:00:00.000Z',
  created_by_teacher_id: 'Radle',
  created_by_teacher_name: 'Rick Radle',
  image_r2_key: 'news/abc.png',
  full_image_r2_key: 'news/abc-full.png',
}, origin);
assert(withPhoto.type === 'shout_out', 'normalize type shout_out');
assert(withPhoto.authorRole === 'teacher' && withPhoto.authorDisplayName === 'Rick Radle', 'teacher author preserved');
assert(withPhoto.contentSlot && withPhoto.contentSlot.recipient === 'Lucas', 'recipient preserved');
assert(/\/api\/news\/image\?key=news%2Fabc\.png/.test(withPhoto.thumbnailUrl || ''), 'photo artwork from R2');
assert(/abc-full/.test(withPhoto.imageUrl || ''), 'full image preferred when present');

const textOnly = normalizeShoutOutRow({
  id: 'rec-2',
  character_name: 'Mia',
  message: 'Kindness',
  created_at: '2026-08-10T12:00:00.000Z',
  created_by_teacher_name: 'Rick Radle',
}, origin);
assert(!textOnly.thumbnailUrl && !textOnly.imageUrl && !textOnly.videoUrl, 'text-only has no media URLs (card uses shoutout asset)');
assert(textOnly.contentSlot && !textOnly.contentSlot.linkUrl, 'text-only no link');

const withVideo = normalizeShoutOutRow({
  id: 'rec-3',
  character_name: 'Mia',
  message: 'Clip',
  created_at: '2026-08-10T12:00:00.000Z',
  created_by_teacher_name: 'Rick Radle',
  video_r2_key: 'news/video/v1.mp4',
}, origin);
assert(/\/api\/news\/video\?key=/.test(withVideo.videoUrl || ''), 'videoUrl on feed item');
assert(/\/api\/news\/video\?key=/.test((withVideo.contentSlot && withVideo.contentSlot.videoUrl) || ''), 'videoUrl in contentSlot for opened view');
assert(!withVideo.thumbnailUrl, 'video without poster uses Shout-Out fallback artwork on card face');

const withLink = normalizeShoutOutRow({
  id: 'rec-4',
  character_name: 'Mia',
  message: 'Link shout',
  created_at: '2026-08-10T12:00:00.000Z',
  created_by_teacher_name: 'Rick Radle',
  link_url: 'https://example.com/path',
}, origin);
assert(withLink.contentSlot && withLink.contentSlot.linkUrl === 'https://example.com/path', 'link persists in contentSlot');
assert(!withLink.thumbnailUrl && !withLink.imageUrl, 'link without preview image uses Shout-Out fallback artwork');

console.log('\nteacher-shoutout-media-175-test:', pass, 'PASS', fail, 'FAIL');
process.exit(fail ? 1 : 0);
