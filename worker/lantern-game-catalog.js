/**
 * Canonical server-side Lantern game registry for result / leaderboard validation.
 *
 * This is the Worker allowlist. POST /api/leaderboards/record only accepts games listed here.
 * GET /api/leaderboards combined views only return these names.
 *
 * Keep IDs and display names aligned with app/js/lantern-game-catalog.js.
 * To register a future donor game (e.g. Tower): add one object here AND in the frontend catalog.
 * Do not accept unlisted/lab game names until they are registered.
 *
 * Score max values are generous gameplay ceilings derived from current client math, not
 * cryptographic anti-cheat. They exist to reject obviously impossible payloads.
 */

export const LANTERN_LEADERBOARD_GAMES = [
  {
    id: 'avatar-match',
    name: 'Avatar Match',
    lowerIsBetter: false,
    scoreMin: 0,
    scoreMax: 500,
    leaderboard: true,
    status: 'playable',
  },
  {
    id: 'lantern-live-trivia',
    name: 'Lantern Live Trivia',
    lowerIsBetter: false,
    scoreMin: 0,
    scoreMax: 100,
    leaderboard: true,
    status: 'playable',
  },
  {
    id: 'handbook-trivia',
    name: 'Handbook Trivia',
    lowerIsBetter: false,
    scoreMin: 0,
    scoreMax: 100,
    leaderboard: true,
    status: 'playable',
  },
  {
    id: 'local-history-trivia',
    name: 'Local History Trivia',
    lowerIsBetter: false,
    scoreMin: 0,
    scoreMax: 100,
    leaderboard: true,
    status: 'playable',
  },
  {
    id: 'srp-safety-trivia',
    name: 'SRP Safety Challenge',
    lowerIsBetter: false,
    scoreMin: 0,
    scoreMax: 100,
    leaderboard: true,
    status: 'playable',
  },
  {
    id: 'reaction',
    name: 'Reaction Tap',
    lowerIsBetter: true,
    scoreMin: 1,
    scoreMax: 600000,
    leaderboard: true,
    status: 'playable',
  },
  {
    id: 'clickrush',
    name: 'Nugget Click Rush',
    lowerIsBetter: false,
    scoreMin: 0,
    scoreMax: 10000,
    leaderboard: true,
    status: 'playable',
  },
  {
    id: 'memory',
    name: 'Memory Match',
    lowerIsBetter: true,
    scoreMin: 1,
    scoreMax: 3600,
    leaderboard: true,
    status: 'playable',
  },
  {
    id: 'nuggetHunt',
    name: 'Nugget Hunt',
    lowerIsBetter: true,
    scoreMin: 0,
    scoreMax: 120,
    leaderboard: true,
    status: 'playable',
  },
  {
    id: 'orbit-lock',
    name: 'Orbit Lock',
    lowerIsBetter: false,
    scoreMin: 0,
    scoreMax: 6000,
    leaderboard: true,
    status: 'playable',
  },
];

const BY_ID = Object.create(null);
const BY_NAME = Object.create(null);
LANTERN_LEADERBOARD_GAMES.forEach((g) => {
  BY_ID[g.id] = g;
  BY_NAME[g.name] = g;
});

export function resolveRegisteredLeaderboardGame(gameIdOrName) {
  const raw = String(gameIdOrName || '').trim();
  if (!raw) return null;
  return BY_ID[raw] || BY_NAME[raw] || null;
}

export function leaderboardGameNames() {
  return LANTERN_LEADERBOARD_GAMES.filter((g) => g.leaderboard && g.status === 'playable').map((g) => g.name);
}

export function isLowerIsBetterGame(gameIdOrName) {
  const g = resolveRegisteredLeaderboardGame(gameIdOrName);
  return !!(g && g.lowerIsBetter);
}

/**
 * @returns {{ ok: true, score: number } | { ok: false, error: string }}
 */
export function validateLeaderboardScore(game, rawScore) {
  if (rawScore === null || rawScore === undefined || rawScore === '') {
    return { ok: false, error: 'malformed_score' };
  }
  const n = Number(rawScore);
  if (!Number.isFinite(n)) return { ok: false, error: 'malformed_score' };
  const score = Math.floor(n);
  if (score !== n && String(rawScore).indexOf('.') !== -1) {
    // Non-integers are floored; still accepted if the floor is in range.
  }
  if (!Number.isFinite(score)) return { ok: false, error: 'malformed_score' };
  const min = game && game.scoreMin != null ? game.scoreMin : 0;
  const max = game && game.scoreMax != null ? game.scoreMax : Number.MAX_SAFE_INTEGER;
  if (score < min || score > max) return { ok: false, error: 'score_out_of_range' };
  return { ok: true, score };
}

/**
 * Strip control chars and HTML metacharacters from score_display.
 * Empty result falls back to the numeric score string.
 */
export function sanitizeScoreDisplay(raw, score) {
  let s = String(raw == null ? '' : raw);
  s = s.replace(/[\u0000-\u001F\u007F]/g, '').replace(/[<>]/g, '').trim().slice(0, 100);
  if (!s) return String(score);
  return s;
}

/** Optional client run/result id used for idempotent retries. */
export function sanitizeRunId(raw) {
  const s = String(raw == null ? '' : raw).trim().slice(0, 80);
  if (!s) return '';
  if (!/^[A-Za-z0-9._:-]+$/.test(s)) return '';
  return s;
}
