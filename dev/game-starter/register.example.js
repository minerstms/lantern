/**
 * REGISTRATION EXAMPLE — copy these objects when promoting a real game.
 * Do NOT paste the starter-tap-once id into production catalogs.
 *
 * 1) app/js/lantern-game-catalog.js  — add one object to GAMES
 * 2) worker/lantern-game-catalog.js  — add one object to LANTERN_LEADERBOARD_GAMES
 * 3) app/games.html                  — hidden play button + surface + IIFE
 *
 * Keep id + name identical in both catalogs. Ordinary play_cost is 1.
 */

export const FRONTEND_CATALOG_EXAMPLE = {
  id: 'your-game-id',
  name: 'Your Game Title',
  type: 'arcade',
  playBtnId: 'yourGamePlayBtn',
  play_cost: 1,
  icon: '🎮',
  image: 'assets/your-game-card.png',
  featured: false,
  status: 'playable',
  scoring: { lowerIsBetter: false },
  leaderboard: true,
  description: 'One-sentence player-facing description.',
};

export const WORKER_ALLOWLIST_EXAMPLE = {
  id: 'your-game-id',
  name: 'Your Game Title',
  lowerIsBetter: false,
  scoreMin: 0,
  scoreMax: 100,
  leaderboard: true,
  status: 'playable',
};

export const GAMES_HTML_TRIGGER_EXAMPLE = '<button type="button" id="yourGamePlayBtn"></button>';

export const GAMES_HTML_SURFACE_EXAMPLE =
  '<div class="gameArea" id="yourGameArea" style="display:none;"></div>';
