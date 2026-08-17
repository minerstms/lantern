/**
 * Canonical Lantern game registry — one ID per playable game.
 * play_cost is the authoritative entry fee (minimum 1 for scored games).
 *
 * Server-side result validation lives in worker/lantern-game-catalog.js (same ids/names).
 * Premium Games (locked): Stack Lab (tower), Minecart Switch, Orbit Lock.
 */
(function (global) {
  'use strict';

  var GAMES = [
    {
      id: 'avatar-match',
      name: 'Avatar Match',
      type: 'memory',
      playBtnId: 'avatarMatchPlayBtn',
      play_cost: 0,
      mission_activity: true,
      student_surface: 'missions',
      icon: '👤',
      image: 'assets/avatar-match-card.png',
      featured: true,
      status: 'playable',
      scoring: { lowerIsBetter: false },
      leaderboard: true,
      description: 'Match the avatar to the correct character name. Score based on speed and correctness.',
    },
    {
      id: 'lantern-live-trivia',
      name: 'Lantern Live Trivia',
      type: 'trivia',
      playBtnId: 'lanternLiveTriviaPlayBtn',
      play_cost: 1,
      icon: '🏮',
      image: 'assets/lantern-trivia-card.png',
      featured: false,
      status: 'archived',
      scoring: { lowerIsBetter: false },
      leaderboard: true,
      description: 'Teacher-approved questions submitted by students.',
    },
    {
      id: 'handbook-trivia',
      name: 'Handbook Trivia',
      type: 'trivia',
      playBtnId: 'handbookTriviaPlayBtn',
      play_cost: 1,
      icon: '📖',
      /* Prompt #87 — source asset on disk is named "handbook-triva-card.png" (missing the
         "i" in "trivia"); using the exact existing filename rather than renaming the shipped
         artwork file. */
      image: 'assets/handbook-triva-card.png',
      featured: false,
      status: 'playable',
      scoring: { lowerIsBetter: false },
      leaderboard: true,
      description: 'Multiple-choice on school expectations and digital citizenship.',
    },
    {
      id: 'local-history-trivia',
      name: 'Local History Trivia',
      type: 'trivia',
      playBtnId: 'localHistoryTriviaPlayBtn',
      play_cost: 1,
      icon: '🏛️',
      image: 'assets/history-trivia-card.png',
      featured: false,
      status: 'playable',
      scoring: { lowerIsBetter: false },
      leaderboard: true,
      description: 'Multiple-choice on Trinidad, Colorado history.',
    },
    {
      id: 'srp-safety-trivia',
      name: 'SRP Safety Challenge',
      type: 'trivia',
      playBtnId: 'srpSafetyTriviaPlayBtn',
      play_cost: 1,
      icon: '🛡️',
      image: 'assets/srp-safety.png',
      featured: false,
      status: 'playable',
      scoring: { lowerIsBetter: false },
      leaderboard: true,
      description: 'Multiple-choice on the five Standard Response Protocol actions.',
    },
    {
      id: 'seven-habits-trivia',
      name: '7 Habits Challenge',
      type: 'trivia',
      playBtnId: 'sevenHabitsTriviaPlayBtn',
      play_cost: 1,
      icon: '🌱',
      image: 'assets/lantern-trivia-card.png',
      featured: false,
      status: 'playable',
      scoring: { lowerIsBetter: false },
      leaderboard: true,
      description: 'Learn the seven habits through real-life stories and choices.',
    },
    {
      id: 'reaction',
      name: 'Reaction Tap',
      type: 'arcade',
      playBtnId: 'reactionPlayBtn',
      play_cost: 1,
      icon: '⚡',
      image: 'assets/reaction-tap-card.png',
      featured: true,
      status: 'playable',
      scoring: { lowerIsBetter: true },
      leaderboard: true,
      description: 'Wait for GO, then tap as fast as you can. Fastest time wins.',
    },
    {
      id: 'clickrush',
      name: 'Nugget Click Rush',
      type: 'arcade',
      playBtnId: 'clickrushPlayBtn',
      play_cost: 1,
      icon: '🖱️',
      image: 'assets/nugget-click-rush-card.png',
      featured: false,
      status: 'playable',
      scoring: { lowerIsBetter: false },
      leaderboard: true,
      description: '10-second tap challenge. Tap as many times as you can!',
    },
    {
      id: 'memory',
      name: 'Memory Match',
      type: 'memory',
      playBtnId: 'memoryPlayBtn',
      play_cost: 1,
      icon: '🧠',
      image: 'assets/memory-match-card.png',
      featured: false,
      status: 'playable',
      scoring: { lowerIsBetter: true },
      leaderboard: true,
      description: 'Match the emoji pairs. Flip two cards at a time.',
    },
    {
      id: 'nuggetHunt',
      name: 'Nugget Hunt',
      type: 'arcade',
      playBtnId: 'nuggetHuntPlayBtn',
      play_cost: 1,
      icon: '🔍',
      image: 'assets/nugget-hunt-card.png',
      featured: false,
      status: 'archived',
      scoring: { lowerIsBetter: true },
      leaderboard: true,
      description: 'Find the special icon among decoys. Full-screen search.',
    },
    {
      id: 'tower',
      name: 'Stack Lab',
      type: 'arcade',
      playBtnId: 'towerPlayBtn',
      play_cost: 1,
      icon: '🏗️',
      image: 'assets/tower-card.png',
      featured: false,
      status: 'playable',
      scoring: { lowerIsBetter: false },
      leaderboard: true,
      qualifyingWin: { floors: 10 },
      description: 'Stack floors from a swinging crane. Tap, click, or press Space to place each floor. Overlap stays; three misses end the run. Reach 10 floors to finish. Higher score wins.',
    },
    {
      id: 'minecart-switch',
      name: 'Minecart Switch',
      type: 'arcade',
      playBtnId: 'minecartSwitchPlayBtn',
      play_cost: 1,
      icon: '🛒',
      image: 'assets/minecart-switch-card.png',
      featured: false,
      status: 'playable',
      scoring: { lowerIsBetter: false },
      leaderboard: true,
      description: 'Switch tracks to dodge rocks, gaps, and gates in a Trinidad mine tunnel.',
    },
    {
      id: 'orbit-lock',
      name: 'Orbit Lock',
      type: 'arcade',
      playBtnId: 'orbitLockPlayBtn',
      play_cost: 1,
      icon: '◉',
      image: 'assets/orbit-lock-card.svg',
      featured: false,
      status: 'playable',
      scoring: { lowerIsBetter: false },
      leaderboard: true,
      description: 'Tap when the marker is inside the target arc. Perfect locks score more as the orbit speeds up.',
    },
  ];

  var BY_ID = {};
  var BY_NAME = {};
  GAMES.forEach(function (g) {
    BY_ID[g.id] = g;
    BY_NAME[g.name] = g;
  });

  var PREMIUM_GAME_IDS = ['tower', 'minecart-switch', 'orbit-lock'];

  var TYPE_LABELS = {
    all: 'All',
    trivia: 'Trivia',
    arcade: 'Arcade',
    memory: 'Memory',
    other: 'Other',
  };

  function listGames() {
    return GAMES.slice();
  }

  function getGameById(id) {
    return BY_ID[id] || null;
  }

  function getGameByName(name) {
    return BY_NAME[name] || null;
  }

  /** Canonical leaderboard key — same string for record POST and GET query. */
  function leaderboardKey(nameOrId) {
    var g = getGameByName(nameOrId) || getGameById(nameOrId);
    return g ? g.name : nameOrId ? String(nameOrId) : '';
  }

  function normalizedPlayCost(cost) {
    if (cost === 0 || cost === '0') return 0;
    var n = Math.floor(Number(cost));
    if (!Number.isFinite(n) || n < 1) return 1;
    return n;
  }

  function playCostLabel(cost) {
    var n = normalizedPlayCost(cost);
    if (n === 0) return 'Free mission';
    return n === 1 ? '1 Nugget' : n + ' Nuggets';
  }

  /**
   * Prompt #114 — Games library card face overlay ONLY. Exact playable copy; no emoji/icon.
   * Does not change play_cost, ledger, or paid-start labels (see playActionLabel).
   */
  function playCostCardMeta(cost) {
    var n = normalizedPlayCost(cost);
    if (n === 0) return 'Mission';
    return n === 1 ? '1 Nugget = 1 Play' : n + ' Nuggets = 1 Play';
  }

  function playActionLabel(cost) {
    var n = normalizedPlayCost(cost);
    if (n === 0) return 'Play mission';
    return n === 1 ? 'Play for 1 Nugget' : 'Play for ' + n + ' Nuggets';
  }

  /** Canonical artwork URL for cards + selected-game hero (same field). */
  function artworkUrl(gameOrIdOrName) {
    var g = gameOrIdOrName;
    if (!g || typeof g === 'string') {
      g = getGameById(gameOrIdOrName) || getGameByName(gameOrIdOrName);
    }
    return g && g.image ? String(g.image) : '';
  }

  function isStudentGameLibraryEntry(gameOrId) {
    var g = gameOrId && typeof gameOrId === 'object' ? gameOrId : getGameById(gameOrId);
    if (!g) return false;
    if (g.status !== 'playable') return false;
    if (g.mission_activity || g.student_surface === 'missions') return false;
    return true;
  }

  function leaderboardGames() {
    return GAMES.filter(function (g) {
      return g.leaderboard && isStudentGameLibraryEntry(g);
    });
  }

  function isPremiumGame(gameOrId) {
    var id = gameOrId && typeof gameOrId === 'object' ? gameOrId.id : gameOrId;
    return PREMIUM_GAME_IDS.indexOf(String(id || '')) !== -1;
  }

  function premiumGames() {
    return PREMIUM_GAME_IDS.map(function (id) {
      return BY_ID[id];
    }).filter(Boolean);
  }

  global.LANTERN_GAME_CATALOG = {
    GAMES: GAMES,
    PREMIUM_GAME_IDS: PREMIUM_GAME_IDS,
    listGames: listGames,
    getGameById: getGameById,
    getGameByName: getGameByName,
    isPremiumGame: isPremiumGame,
    premiumGames: premiumGames,
    leaderboardKey: leaderboardKey,
    playCostLabel: playCostLabel,
    playCostCardMeta: playCostCardMeta,
    playActionLabel: playActionLabel,
    artworkUrl: artworkUrl,
    normalizedPlayCost: normalizedPlayCost,
    isStudentGameLibraryEntry: isStudentGameLibraryEntry,
    leaderboardGames: leaderboardGames,
    TYPE_LABELS: TYPE_LABELS,
    PERIOD_MAP: {
      '24h': 'daily',
      '7d': 'weekly',
      '30d': 'monthly',
      all: 'all_time',
    },
    DEFAULT_PERIOD: '7d',
  };
})(typeof window !== 'undefined' ? window : globalThis);
