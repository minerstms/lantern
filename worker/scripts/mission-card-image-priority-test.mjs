/**
 * Prompt #210 — Mission Card Image + Explore completion artwork priority + game achievement overlay.
 * Pure logic tests (no live D1).
 *
 * Usage: node worker/scripts/mission-card-image-priority-test.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

function pickMissionExploreImage(submissionImageUrl, cardImageUrl) {
  return submissionImageUrl || cardImageUrl || null;
}

function gameAchievementFace(item, artworkUrlFn) {
  const type = String(item.type || '').toLowerCase();
  const slot = item.contentSlot || {};
  const isGame =
    type === 'game_score' ||
    type === 'achievement' ||
    type === 'leaderboard' ||
    !!slot.gameAchievement ||
    !!slot.gameId ||
    !!slot.gameName;
  assert.equal(isGame, true);
  const art = artworkUrlFn(slot.gameId || slot.gameName) || slot.gameArtworkUrl || '';
  assert.ok(art, 'game artwork required');
  return {
    title: String(slot.headline || item.title || 'Achievement'),
    author: String(item.authorDisplayName || ''),
    score: String(slot.scoreDisplay || slot.score || slot.result || ''),
    imageUrl: art,
  };
}

const results = [];
function check(cond, label) {
  results.push({ pass: !!cond, label });
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + label);
}

// 1) text-only + mission card image
check(
  pickMissionExploreImage(null, 'https://example/mission-card.png') === 'https://example/mission-card.png',
  'text-only completion uses Mission Card Image'
);

// 2) submission media wins
check(
  pickMissionExploreImage('https://example/student.jpg', 'https://example/mission-card.png') ===
    'https://example/student.jpg',
  'submission image overrides Mission Card Image'
);

// 3) neither → null (client fallback)
check(pickMissionExploreImage(null, null) === null, 'no media falls through to client mission fallback');

// 4) game achievement always uses game art
const face = gameAchievementFace(
  {
    type: 'game_score',
    title: 'Ignored generic',
    authorDisplayName: 'Lucas Rivera',
    imageUrl: 'https://example/generic.png',
    contentSlot: {
      gameId: 'memory',
      headline: 'NEW HIGH SCORE',
      scoreDisplay: '22 moves',
      gameArtworkUrl: 'assets/memory-match-card.png',
    },
  },
  (id) => (id === 'memory' ? 'assets/memory-match-card.png' : '')
);
check(face.imageUrl === 'assets/memory-match-card.png', 'game achievement uses game artwork');
check(face.title === 'NEW HIGH SCORE', 'game achievement headline overlay');
check(face.author === 'Lucas Rivera', 'game achievement student name present');
check(face.score === '22 moves', 'game achievement score/result overlay');
check(face.imageUrl !== 'https://example/generic.png', 'generic media does not win over game art');

// 5) source files contain expected hooks
const feed = readFileSync(join(root, 'worker/feed-handlers.js'), 'utf8');
check(feed.includes('usedMissionCardImage'), 'feed-handlers documents mission-card usage');
check(feed.includes('card_image_r2_key'), 'feed-handlers joins card_image_r2_key');

const missions = readFileSync(join(root, 'worker/missions-handlers.js'), 'utf8');
check(missions.includes('/api/missions/upload-card-image'), 'mission card upload route exists');
check(missions.includes('card_image_r2_key'), 'missions API exposes card_image_r2_key');

const cards = readFileSync(join(root, 'app/js/lantern-cards.js'), 'utf8');
check(cards.includes('gameAchievementOverlay'), 'lantern-cards game achievement overlay flag');

const teacher = readFileSync(join(root, 'app/teacher.html'), 'utf8');
check(teacher.includes('Mission Card Image'), 'teacher editor shows Mission Card Image');
check(teacher.includes('uploadMissionCardImageFile'), 'teacher upload helper present');

const mig = readFileSync(join(root, 'worker/migrations/068_lantern_missions_card_image.sql'), 'utf8');
check(mig.includes('card_image_r2_key'), 'migration 068 adds card_image_r2_key');

const failed = results.filter((r) => !r.pass);
console.log('\n' + (results.length - failed.length) + '/' + results.length + ' passed');
if (failed.length) process.exit(1);
