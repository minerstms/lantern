/**
 * Mission photo/media continuity tests — Prompt #72
 *
 * Root cause reproduced from real production data (Lucas, economy key 20889):
 * a mission submission with submission_type 'text' can have allows_image=1 (the
 * unified media field lets the student attach a photo alongside their written
 * response), but app/missions.html's submitCurrentMission() picked ONE of
 * text/image/video/link via a mutually-exclusive if/else-if chain. If the student
 * typed any text AND attached a photo, the text branch won and the successfully
 * uploaded photo was silently discarded before it ever reached the submit payload
 * — confirmed against production rows msub_1786237934679_ubau0k ("asdf") and
 * msub_1786238034732_xadb0a ("fffffffff"), both submission_type='text' with plain
 * (non-JSON) content and no image reference whatsoever.
 *
 * Downstream, three independent consumers (worker/missions-handlers.js's
 * /api/missions/submissions/approved mapper, app/js/lantern-profile-app.js's
 * missionSubmissionPreviewText, and worker/feed-handlers.js's normalizeMissionRow)
 * already anticipated a { text, image_url } JSON envelope for submission_type
 * 'text' — this is the SAME convention already used by poll/bug_report content
 * (JSON-in-content, no schema change). This fix completes the missing producer
 * (student submit) and the one remaining consumer that wasn't envelope-aware
 * (worker/feed-handlers.js, the actual live Explore /api/feed mapper) and adds a
 * shared extraction helper (extractMissionSubmissionMedia) used by every read path
 * so a photo, once uploaded, survives identically through teacher review, approval,
 * the approved-submissions API, and the public Explore feed.
 *
 * Usage: node worker/scripts/mission-media-continuity-test.mjs
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';
import { validateMissionSubmissionPayload, extractMissionSubmissionMedia } from '../missions-auth.js';
import { collectApprovedFeed } from '../feed-handlers.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let pass = 0;
let fail = 0;

function ok(label) {
  pass++;
  console.log('PASS', label);
}
function bad(label, detail) {
  fail++;
  console.error('FAIL', label, detail !== undefined ? JSON.stringify(detail) : '');
}

const IMG_URL = 'https://lantern-api.example.com/api/news/image?key=missions%2Fabc123.png';
const TEXT_VAL = 'I planted seeds in the school garden and watered them every day this week.';

// ---------------------------------------------------------------------------
// 1. Extract the REAL type/content selection block from app/missions.html's
//    submitCurrentMission() and exercise it directly (no DOM needed — it is a
//    pure branch over already-computed local values).
// ---------------------------------------------------------------------------
const missionsHtml = fs.readFileSync(path.join(root, 'app/missions.html'), 'utf8').replace(/\r\n/g, '\n');

function extractTypeContentBlock(src) {
  const startMarker = "var type = 'text';\n      var content = '';";
  const endMarker = "if (m.submission_type === 'confirmation') type = 'confirmation';";
  const startIdx = src.indexOf(startMarker);
  if (startIdx === -1) throw new Error('start marker not found in missions.html — has submitCurrentMission changed shape?');
  const endIdx = src.indexOf(endMarker, startIdx);
  if (endIdx === -1) throw new Error('end marker not found in missions.html — has submitCurrentMission changed shape?');
  return src.slice(startIdx, endIdx + endMarker.length);
}

let runTypeContentBlock;
try {
  const blockSrc = extractTypeContentBlock(missionsHtml);
  // eslint-disable-next-line no-new-func
  runTypeContentBlock = new Function(
    'm', 'allowsText', 'allowsImage', 'allowsVideo', 'allowsLink',
    'textVal', 'imageVal', 'videoVal', 'linkVal',
    'validText', 'validImage', 'validVideo', 'validLink',
    'missionVideoUploadedUrl',
    blockSrc + '\nreturn { type: type, content: content };'
  );
  ok('submitCurrentMission type/content block extracted from app/missions.html');
} catch (e) {
  bad('extract submitCurrentMission type/content block', String(e && e.message || e));
  runTypeContentBlock = null;
}

if (runTypeContentBlock) {
  const base = { m: { submission_type: 'text' }, allowsText: true, allowsImage: true, allowsVideo: false, allowsLink: false, textVal: '', imageVal: '', videoVal: '', linkVal: '', validText: false, validImage: false, validVideo: false, validLink: false, missionVideoUploadedUrl: '' };

  // A. Text-only submission — unchanged behavior.
  const textOnly = runTypeContentBlock(base.m, base.allowsText, base.allowsImage, base.allowsVideo, base.allowsLink, TEXT_VAL, '', '', '', true, false, false, false, '');
  if (textOnly.type === 'text' && textOnly.content === TEXT_VAL) {
    ok('text-only submission still produces plain text content (unchanged)');
  } else bad('text-only submission regressed', textOnly);

  // B. Image-only submission — unchanged behavior.
  const imageOnly = runTypeContentBlock(base.m, base.allowsText, base.allowsImage, base.allowsVideo, base.allowsLink, '', IMG_URL, '', '', false, true, false, false, '');
  if (imageOnly.type === 'image_url' && imageOnly.content === IMG_URL) {
    ok('image-only submission still produces image_url type + raw URL content (unchanged)');
  } else bad('image-only submission regressed', imageOnly);

  // C. THE BUG: text + image together must now be preserved (previously the image was dropped).
  const combo = runTypeContentBlock(base.m, base.allowsText, base.allowsImage, base.allowsVideo, base.allowsLink, TEXT_VAL, IMG_URL, '', '', true, true, false, false, '');
  let comboParsed = null;
  try { comboParsed = JSON.parse(combo.content); } catch (_) {}
  if (combo.type === 'text' && comboParsed && comboParsed.text === TEXT_VAL && comboParsed.image_url === IMG_URL) {
    ok('text + attached photo together now preserve BOTH via a { text, image_url } envelope (fixes the real production photo loss)');
  } else bad('text+image combo did not preserve both fields', combo);

  // D. Video/link fallbacks (missions with no text/image) remain unaffected.
  const linkOnly = runTypeContentBlock({ submission_type: 'link' }, false, false, false, true, '', '', '', 'https://example.com/x', false, false, false, true, '');
  if (linkOnly.type === 'link' && linkOnly.content === 'https://example.com/x') {
    ok('link-only submission unaffected by the text+image combining change');
  } else bad('link-only submission regressed', linkOnly);
}

// ---------------------------------------------------------------------------
// 2. Worker: validateMissionSubmissionPayload — text/image_url + the new
//    combined-envelope path, including min-character enforcement on the TEXT
//    portion only (not the JSON wrapper length).
// ---------------------------------------------------------------------------
const missionNoMin = { submission_type: 'text', allows_text: 1, allows_image: 1, allows_video: 0, allows_link: 0, min_characters: 0 };
const missionMin20 = { ...missionNoMin, min_characters: 20 };

const vText = validateMissionSubmissionPayload(missionNoMin, 'text', TEXT_VAL);
if (vText.ok && vText.content === TEXT_VAL) {
  ok('validateMissionSubmissionPayload: plain text submission unaffected');
} else bad('validateMissionSubmissionPayload plain text regressed', vText);

const vImage = validateMissionSubmissionPayload(missionNoMin, 'image_url', IMG_URL);
if (vImage.ok && vImage.content === IMG_URL) {
  ok('validateMissionSubmissionPayload: plain image_url submission unaffected');
} else bad('validateMissionSubmissionPayload image_url regressed', vImage);

const comboContent = JSON.stringify({ text: TEXT_VAL, image_url: IMG_URL });
const vCombo = validateMissionSubmissionPayload(missionNoMin, 'text', comboContent);
let vComboParsed = null;
try { vComboParsed = JSON.parse(vCombo.content); } catch (_) {}
if (vCombo.ok && vComboParsed && vComboParsed.text === TEXT_VAL && vComboParsed.image_url === IMG_URL) {
  ok('validateMissionSubmissionPayload: accepts and preserves the text+image envelope');
} else bad('validateMissionSubmissionPayload combo envelope rejected/mangled', vCombo);

const vComboShortText = validateMissionSubmissionPayload(missionMin20, 'text', JSON.stringify({ text: 'hi', image_url: IMG_URL }));
if (!vComboShortText.ok && /Minimum/.test(vComboShortText.error || '')) {
  ok('validateMissionSubmissionPayload: min-character rule still enforced against the TEXT portion of a combined envelope, not the JSON wrapper length');
} else bad('min-character enforcement bypassed by envelope wrapping', vComboShortText);

const vComboImageOnly = validateMissionSubmissionPayload(missionNoMin, 'text', JSON.stringify({ text: '', image_url: IMG_URL }));
if (vComboImageOnly.ok) {
  ok('validateMissionSubmissionPayload: an envelope with only an image (no text) is still accepted when the mission allows images');
} else bad('image-only envelope incorrectly rejected', vComboImageOnly);

const vPlainTextThatStartsWithBrace = validateMissionSubmissionPayload(missionNoMin, 'text', '{not real json');
if (vPlainTextThatStartsWithBrace.ok && vPlainTextThatStartsWithBrace.content === '{not real json') {
  ok('validateMissionSubmissionPayload: text that merely starts with "{" but is not valid JSON safely falls back to plain text');
} else bad('malformed-JSON-looking plain text mishandled', vPlainTextThatStartsWithBrace);

const vEmptyRejected = validateMissionSubmissionPayload(missionNoMin, 'text', '');
if (!vEmptyRejected.ok) {
  ok('validateMissionSubmissionPayload: still rejects a fully empty text submission');
} else bad('empty submission incorrectly accepted', vEmptyRejected);

// ---------------------------------------------------------------------------
// 3. Worker: extractMissionSubmissionMedia — the single shared helper now used
//    by BOTH the teacher pending-queue endpoint and the approved-submissions
//    endpoint, so both read paths show the same media/caption.
// ---------------------------------------------------------------------------
const mEnvelope = extractMissionSubmissionMedia('text', comboContent);
if (mEnvelope.caption === TEXT_VAL.slice(0, 200) && mEnvelope.image_url === IMG_URL) {
  ok('extractMissionSubmissionMedia: recovers both text and image from a stored envelope');
} else bad('extractMissionSubmissionMedia envelope extraction broken', mEnvelope);

const mPlainText = extractMissionSubmissionMedia('text', 'fffffffff');
if (mPlainText.caption === 'fffffffff' && !mPlainText.image_url) {
  ok('extractMissionSubmissionMedia: plain (non-JSON) text submission still returns readable caption, no fabricated image (matches real production row msub_1786238034732_xadb0a)');
} else bad('extractMissionSubmissionMedia plain-text handling broken', mPlainText);

const mImageType = extractMissionSubmissionMedia('image_url', IMG_URL);
if (mImageType.image_url === IMG_URL && !mImageType.caption) {
  ok('extractMissionSubmissionMedia: submission_type image_url still returns the raw URL as image_url, no caption');
} else bad('extractMissionSubmissionMedia image_url handling broken', mImageType);

const mVideoType = extractMissionSubmissionMedia('video', 'https://example.com/v.mp4');
if (mVideoType.video_url === 'https://example.com/v.mp4') {
  ok('extractMissionSubmissionMedia: submission_type video still returns the raw URL as video_url');
} else bad('extractMissionSubmissionMedia video handling broken', mVideoType);

// ---------------------------------------------------------------------------
// 4. app/js/lantern-media.js — normalizeMissionItemForMedia must be envelope-aware
//    (this is the single helper teacher.html's review modal, row preview, and
//    thumbnail extraction all call through).
// ---------------------------------------------------------------------------
const lanternMediaSrc = fs.readFileSync(path.join(root, 'app/js/lantern-media.js'), 'utf8');
const mediaSandbox = {};
vm.createContext(mediaSandbox);
vm.runInContext(lanternMediaSrc, mediaSandbox);
const LanternMedia = mediaSandbox.LanternMedia;

if (LanternMedia && typeof LanternMedia.normalizeMissionItemForMedia === 'function') {
  const envItem = { submission_type: 'text', submission_content: comboContent };
  const envOut = LanternMedia.normalizeMissionItemForMedia(envItem);
  if (envOut.image_url === IMG_URL && envOut.text === TEXT_VAL) {
    ok('lantern-media.js normalizeMissionItemForMedia: extracts image_url AND text from a text-type envelope (fixes Teacher review showing a photoless response)');
  } else bad('normalizeMissionItemForMedia envelope extraction broken', envOut);

  const plainItem = { submission_type: 'text', submission_content: 'hi there' };
  const plainOut = LanternMedia.normalizeMissionItemForMedia(plainItem);
  // Prompt #73 Defect 4: .text is now ALWAYS a defined string (never undefined) so callers never
  // fall back to displaying raw submission_content (which could be a media URL) as visible text.
  if (plainOut.image_url === undefined && plainOut.text === 'hi there') {
    ok('lantern-media.js normalizeMissionItemForMedia: plain text submission returns its real text via .text (no fabricated media, no raw-content fallback needed)');
  } else bad('normalizeMissionItemForMedia plain-text handling regressed', plainOut);

  const imageItem = { submission_type: 'image_url', submission_content: IMG_URL };
  const imageOut = LanternMedia.normalizeMissionItemForMedia(imageItem);
  if (imageOut.image_url === IMG_URL) {
    ok('lantern-media.js normalizeMissionItemForMedia: image_url submission_type unaffected');
  } else bad('normalizeMissionItemForMedia image_url handling regressed', imageOut);
} else {
  bad('LanternMedia.normalizeMissionItemForMedia not available after loading lantern-media.js');
}

// ---------------------------------------------------------------------------
// 5. worker/feed-handlers.js — collectApprovedFeed() drives the LIVE Explore
//    /api/feed endpoint (app/js/lantern-feed-api.js -> app/explore.html). This
//    is the actual "photo lost in Explore" surface reported live.
// ---------------------------------------------------------------------------
function makeFeedDb(missionSubmissionRows) {
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
          throw new Error('Unhandled feed SQL: ' + s.slice(0, 100));
        },
      };
      return api;
    },
  };
}

async function runFeedTests() {
  const origin = 'https://lantern-42i.pages.dev';

  const rowCombo = { id: 'msub_combo', mission_id: 'tm_1', character_name: '20889', submission_type: 'text', submission_content: comboContent, status: 'accepted', created_at: '2026-08-09T01:00:00.000Z', reviewed_at: '2026-08-09T01:05:00.000Z', reviewed_by: 'Rick Radle' };
  const feedCombo = await collectApprovedFeed(makeFeedDb([rowCombo]), origin, { limit: 10 });
  const itemCombo = feedCombo.find((it) => it.id === 'mission:msub_combo');
  if (itemCombo && itemCombo.imageUrl === IMG_URL && itemCombo.thumbnailUrl === IMG_URL && itemCombo.body === TEXT_VAL) {
    ok('collectApprovedFeed: a text+image envelope submission publishes to Explore with the SAME photo and text (fixes the live "Explore published a photoless version" report)');
  } else bad('collectApprovedFeed combo mission item missing photo/text', itemCombo);

  const rowImageOnly = { id: 'msub_img', mission_id: 'tm_2', character_name: '20889', submission_type: 'image_url', submission_content: IMG_URL, status: 'accepted', created_at: '2026-04-22T02:35:26.604Z', reviewed_at: '2026-04-22T02:40:00.000Z', reviewed_by: 'Rick Radle' };
  const feedImage = await collectApprovedFeed(makeFeedDb([rowImageOnly]), origin, { limit: 10 });
  const itemImage = feedImage.find((it) => it.id === 'mission:msub_img');
  if (itemImage && itemImage.imageUrl === IMG_URL) {
    ok('collectApprovedFeed: a plain image_url mission submission also now publishes its photo to Explore (previously always dropped — image_r2_key was never actually populated by any producer)');
  } else bad('collectApprovedFeed image_url mission item missing photo', itemImage);

  const rowPlainText = { id: 'msub_txt', mission_id: 'tm_3', character_name: '20889', submission_type: 'text', submission_content: 'fffffffff', status: 'accepted', created_at: '2026-08-09T01:13:54.732Z', reviewed_at: '2026-08-09T01:20:00.000Z', reviewed_by: 'Rick Radle' };
  const feedText = await collectApprovedFeed(makeFeedDb([rowPlainText]), origin, { limit: 10 });
  const itemText = feedText.find((it) => it.id === 'mission:msub_txt');
  if (itemText && itemText.body === 'fffffffff' && !itemText.imageUrl) {
    ok('collectApprovedFeed: a plain-text mission submission shows its real text (previously showed the literal broken string "{}" for every plain-text mission — see production rows msub_1786237934679_ubau0k / msub_1786238034732_xadb0a)');
  } else bad('collectApprovedFeed plain-text mission item broken', itemText);
}

await runFeedTests();

// ---------------------------------------------------------------------------
// 6. Prompt #76 — official Mission cover fallback, exercised through the SAME
//    Explore card pipeline real cards use (feed item -> normalizeFeedItemToFaceModel
//    -> resolveCardFaceImageUrlWithFallbacks), driven by real collectApprovedFeed()
//    output so this proves the actual production data shape, not a hand-built stub.
// ---------------------------------------------------------------------------
const lanternCardsSrc = fs.readFileSync(path.join(root, 'app/js/lantern-cards.js'), 'utf8');
const cardsSandbox = { console, document: undefined, window: undefined, LANTERN_AVATAR_API: undefined, LanternMedia: undefined };
cardsSandbox.global = cardsSandbox;
vm.createContext(cardsSandbox);
vm.runInContext(lanternCardsSrc, cardsSandbox);
const LC = cardsSandbox.LanternCards;

if (LC && LC.normalizeFeedItemToFaceModel && LC.resolveCardFaceImageUrlWithFallbacks) {
  const origin = 'https://lantern-42i.pages.dev';

  // Test E: approved TEXT-ONLY mission submission -> Explore card falls back to the
  // official Mission cover (never the broken topic-library/default_creation.png chain).
  const rowTextOnly2 = { id: 'msub_cover_e', mission_id: 'tm_e', character_name: '20889', submission_type: 'text', submission_content: 'no photo here', status: 'accepted', created_at: '2026-08-09T02:00:00.000Z', reviewed_at: '2026-08-09T02:05:00.000Z', reviewed_by: 'Rick Radle' };
  const feedE = await collectApprovedFeed(makeFeedDb([rowTextOnly2]), origin, { limit: 10 });
  const itemE = feedE.find((it) => it.id === 'mission:msub_cover_e');
  const modelE = itemE && LC.normalizeFeedItemToFaceModel(itemE);
  const resolvedE = modelE && LC.resolveCardFaceImageUrlWithFallbacks(modelE);
  if (itemE && !itemE.imageUrl && resolvedE === 'assets/mission-card.png') {
    ok('Test E — Explore: approved TEXT-ONLY mission submission resolves to the official Mission cover (assets/mission-card.png), not the broken library/default chain');
  } else bad('Test E failed — approved text-only mission did not resolve to the Mission cover', { itemE, resolvedE });

  // Test F: approved mission WITH a real student photo -> Explore card shows the real
  // photo, the Mission cover must NOT override it (real media always wins).
  const rowWithPhoto = { id: 'msub_cover_f', mission_id: 'tm_f', character_name: '20889', submission_type: 'image_url', submission_content: IMG_URL, status: 'accepted', created_at: '2026-08-09T02:10:00.000Z', reviewed_at: '2026-08-09T02:15:00.000Z', reviewed_by: 'Rick Radle' };
  const feedF = await collectApprovedFeed(makeFeedDb([rowWithPhoto]), origin, { limit: 10 });
  const itemF = feedF.find((it) => it.id === 'mission:msub_cover_f');
  const modelF = itemF && LC.normalizeFeedItemToFaceModel(itemF);
  const resolvedF = modelF && LC.resolveCardFaceImageUrlWithFallbacks(modelF);
  if (itemF && itemF.imageUrl === IMG_URL && resolvedF === IMG_URL) {
    ok('Test F — Explore: approved mission WITH a real student photo resolves to that REAL photo, NOT the Mission cover fallback (real media always wins)');
  } else bad('Test F failed — real mission photo did not win over the fallback', { itemF, resolvedF });

  // Test G: non-Mission Explore item types (News/Post/etc.) are completely unaffected —
  // they still resolve through their OWN existing fallback (never the Mission cover).
  const newsModel = LC.normalizeFeedItemToFaceModel({ id: 'news:1', type: 'news', title: 'A news item', authorDisplayName: 'Teacher' });
  const resolvedNews = LC.resolveCardFaceImageUrlWithFallbacks(newsModel);
  if (resolvedNews !== 'assets/mission-card.png') {
    ok('Test G — News/non-Mission Explore items are unaffected: fallback resolution never returns the Mission cover for type="news"');
  } else bad('Test G failed — a non-Mission item incorrectly resolved to the Mission cover', { newsModel, resolvedNews });
} else {
  bad('LanternCards.normalizeFeedItemToFaceModel/resolveCardFaceImageUrlWithFallbacks not available', {});
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log('\n---');
console.log(pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);
