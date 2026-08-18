/**
 * Prompt #225 — require-image persistence (allows_image=2) and validation.
 * Usage: node worker/scripts/mission-require-image-225-test.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  persistAllowsImageValue,
  missionRequiresImage,
  validateMissionSubmissionPayload,
} from '../missions-auth.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let pass = 0;
let fail = 0;
function ok(msg) {
  pass++;
  console.log('PASS', msg);
}
function bad(msg, detail) {
  fail++;
  console.error('FAIL', msg, detail || '');
}

if (persistAllowsImageValue({ allows_image: true }, 0) === 1) ok('legacy allow-image persists as 1');
else bad('legacy allow');
if (persistAllowsImageValue({ require_image: true, allows_image: true }, 0) === 2) ok('require image persists as 2');
else bad('require persist');
if (persistAllowsImageValue({ require_image: false, allows_image: true }, 2) === 1) ok('turning require off keeps optional image');
else bad('require off');
if (persistAllowsImageValue({ allows_image: false, require_image: false }, 1) === 0) ok('neither image option stores 0');
else bad('none persist');

const optional = { allows_text: 1, allows_image: 1, allows_video: 0, allows_link: 0, min_characters: 0 };
if (missionRequiresImage(optional) === false) ok('allows_image=1 is optional, not required');
else bad('optional must not require');
if (missionRequiresImage({ allows_image: 2, allows_text: 1 }) === true) ok('allows_image=2 requires image');
else bad('2 requires');

const required = { submission_type: 'text', allows_text: 1, allows_image: 2, require_image: true, min_characters: 50 };
const noImg = validateMissionSubmissionPayload(required, 'text', 'This response is long enough to pass the minimum character rule.');
if (!noImg.ok && /Image required/.test(noImg.error || '')) ok('server rejects required-image text-only');
else bad('server require image', noImg);

const withImg = validateMissionSubmissionPayload(
  required,
  'text',
  JSON.stringify({ text: 'This response is long enough to pass the minimum character rule.', image_url: '/api/media/image?key=x' })
);
if (withImg.ok) ok('server accepts required-image envelope');
else bad('envelope require', withImg);

const short = validateMissionSubmissionPayload(required, 'text', JSON.stringify({ text: 'hi', image_url: '/api/media/image?key=x' }));
if (!short.ok && /Minimum 50/.test(short.error || '')) ok('min characters uses trimmed inner text');
else bad('min chars', short);

const zeroMin = { submission_type: 'text', allows_text: 1, allows_image: 1, min_characters: 0 };
const zeroOk = validateMissionSubmissionPayload(zeroMin, 'text', 'ok');
if (zeroOk.ok) ok('min 0 means no minimum');
else bad('zero min', zeroOk);

const teacher = fs.readFileSync(path.join(root, 'app/teacher.html'), 'utf8');
if (/Require image/.test(teacher) && /Minimum text characters/.test(teacher) && /missionRequireImage/.test(teacher)) {
  ok('teacher UI has Require image + minimum text characters');
} else bad('teacher UI');

const missions = fs.readFileSync(path.join(root, 'app/missions.html'), 'utf8');
if (/Image required/.test(missions) && /Minimum /.test(missions) && /currentMissionRequiresImage/.test(missions)) {
  ok('student UI shows Image required / minimum characters');
} else bad('student UI');

const handlers = fs.readFileSync(path.join(root, 'worker/missions-handlers.js'), 'utf8');
if (/persistAllowsImageValue/.test(handlers) && /require_image: missionRequiresImage/.test(handlers)) {
  ok('handlers persist and expose require_image');
} else bad('handlers wiring');

console.log('\n--- mission-require-image-225-test: ' + pass + ' passed, ' + fail + ' failed ---');
process.exit(fail ? 1 : 0);
