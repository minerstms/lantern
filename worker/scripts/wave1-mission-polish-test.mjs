/**
 * Prompt #164 — Draw Something / image-capable mission validation smoke.
 * Confirms Wave-1 Draw Something model accepts image submissions with the
 * existing missions-auth validators (no live D1 writes).
 */
import { validateMissionSubmissionPayload, extractMissionSubmissionMedia } from '../missions-auth.js';

let passed = 0;
let failed = 0;
function ok(msg) {
  passed += 1;
  console.log('OK  ' + msg);
}
function bad(msg, detail) {
  failed += 1;
  console.error('FAIL ' + msg, detail != null ? detail : '');
}

const IMG = 'https://example.com/draw.png';
const CAPTION = 'I drew a lighthouse at sunset.';

// Mirrors post-#164 Draw Something row (image_url + caption text allowed).
const drawMission = {
  submission_type: 'image_url',
  allows_text: 1,
  allows_image: 1,
  allows_video: 0,
  allows_link: 0,
  min_characters: 20,
};

const imageOnly = validateMissionSubmissionPayload(drawMission, 'image_url', IMG);
if (imageOnly.ok && imageOnly.submissionType === 'image_url' && imageOnly.content === IMG) {
  ok('Draw Something accepts image_url submission');
} else {
  bad('Draw Something image_url rejected', imageOnly);
}

const envelope = JSON.stringify({ text: CAPTION, image_url: IMG });
const withCaption = validateMissionSubmissionPayload(drawMission, 'text', envelope);
if (withCaption.ok && withCaption.submissionType === 'text') {
  ok('Draw Something accepts text+image envelope caption path');
} else {
  bad('Draw Something caption envelope rejected', withCaption);
}

const media = extractMissionSubmissionMedia('image_url', IMG);
if (media.image_url === IMG) {
  ok('extractMissionSubmissionMedia returns image for Draw Something type');
} else {
  bad('media extract failed', media);
}

// Random Act of Kindness Wave-1 model: text + optional image
const kindness = {
  submission_type: 'text',
  allows_text: 1,
  allows_image: 1,
  allows_video: 0,
  allows_link: 0,
  min_characters: 40,
};
const kindText = 'I held the door open for a classmate who had their hands full of books.';
const vKind = validateMissionSubmissionPayload(kindness, 'text', kindText);
if (vKind.ok) ok('Random Act of Kindness accepts text evidence');
else bad('Random Act text rejected', vKind);

const interview = {
  submission_type: 'text',
  allows_text: 1,
  allows_image: 0,
  allows_video: 0,
  allows_link: 1,
  min_characters: 40,
};
const vInterview = validateMissionSubmissionPayload(
  interview,
  'text',
  'Grandma said: "Always finish what you start." I learned patience matters.'
);
if (vInterview.ok) ok('Family / Community Interview accepts text quote');
else bad('Interview text rejected', vInterview);

const vLink = validateMissionSubmissionPayload(interview, 'link', 'https://example.com/notes');
if (vLink.ok) ok('Family / Community Interview accepts link submission');
else bad('Interview link rejected', vLink);

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
