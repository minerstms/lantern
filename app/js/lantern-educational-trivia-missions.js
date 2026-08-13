/**
 * Prompt #150 — client catalog for educational trivia missions.
 * Candidate mission IDs only; server owns target, reward, eligibility, and scoring.
 * Mission navigation itself never charges a Nugget.
 */
(function (global) {
  'use strict';

  var MISSIONS = {
    perm_handbook_trivia: {
      id: 'perm_handbook_trivia',
      type: 'game_correct_target',
      game_id: 'handbook-trivia',
      game_name: 'Handbook Trivia',
      playBtnId: 'handbookTriviaPlayBtn',
      title: 'Student Handbook Challenge',
      description: 'Get 10 Student Handbook questions correct in one game session.',
      cta: 'Play Trivia',
    },
    perm_local_history_trivia: {
      id: 'perm_local_history_trivia',
      type: 'game_correct_target',
      game_id: 'local-history-trivia',
      game_name: 'Local History Trivia',
      playBtnId: 'localHistoryTriviaPlayBtn',
      title: 'Trinidad History Challenge',
      description: 'Get 10 Trinidad history questions correct in one game session.',
      cta: 'Play Trivia',
      sponsored_free: true,
    },
    perm_srp_safety: {
      id: 'perm_srp_safety',
      type: 'game_correct_target',
      game_id: 'srp-safety-trivia',
      game_name: 'SRP Safety Challenge',
      playBtnId: 'srpSafetyTriviaPlayBtn',
      title: 'SRP Safety Challenge',
      description: 'Learn the five SRP safety actions. Get 10 questions correct in one session.',
      cta: 'Play Trivia',
      sponsored_free: true,
    },
  };

  var SPONSORED_FREE_MISSION_ID = 'perm_local_history_trivia';
  var SPONSORED_FREE_GAME_ID = 'local-history-trivia';
  var SPONSORED_FREE_PAIRS = [
    { missionId: 'perm_local_history_trivia', gameId: 'local-history-trivia' },
    { missionId: 'perm_srp_safety', gameId: 'srp-safety-trivia' },
  ];

  function resolve(missionId) {
    return MISSIONS[String(missionId || '').trim()] || null;
  }

  function resolveForGame(missionId, gameId) {
    var def = resolve(missionId);
    if (!def) return null;
    if (String(gameId || '').trim() !== def.game_id) return null;
    return def;
  }

  function candidateFromLocation(loc) {
    var search = loc && loc.search != null ? String(loc.search) : (typeof location !== 'undefined' ? location.search : '');
    var params = new URLSearchParams(search);
    var mission = params.get('mission') || '';
    var game = params.get('game') || '';
    if (!mission) return null;
    if (game) return resolveForGame(mission, game);
    return resolve(mission);
  }

  function isSponsoredFreePair(missionId, gameId) {
    var mid = String(missionId || '').trim();
    var gid = String(gameId || '').trim();
    for (var i = 0; i < SPONSORED_FREE_PAIRS.length; i++) {
      if (SPONSORED_FREE_PAIRS[i].missionId === mid && SPONSORED_FREE_PAIRS[i].gameId === gid) return true;
    }
    return false;
  }

  function isSponsoredFreeMissionId(missionId) {
    var mid = String(missionId || '').trim();
    for (var i = 0; i < SPONSORED_FREE_PAIRS.length; i++) {
      if (SPONSORED_FREE_PAIRS[i].missionId === mid) return true;
    }
    return false;
  }

  function isSponsoredFreeLaunch(loc, gameIdOrName) {
    var def = candidateFromLocation(loc);
    if (!def || !isSponsoredFreePair(def.id, def.game_id)) return null;
    if (gameIdOrName != null && String(gameIdOrName).trim() !== '') {
      var raw = String(gameIdOrName).trim();
      if (raw !== def.game_id && raw !== def.game_name) return null;
    }
    return def;
  }

  function generateMissionRunId() {
    if (typeof global.crypto !== 'undefined' && global.crypto && typeof global.crypto.randomUUID === 'function') {
      return global.crypto.randomUUID();
    }
    return 'mission_run_' + Date.now() + '_' + Math.random().toString(36).slice(2);
  }

  function launchUrl(missionId, opts) {
    var def = resolve(missionId);
    if (!def) return 'games.html';
    var replay = opts && opts.replay;
    // Prompt #160/#166 — sponsored Missions stay in Mission context on replay (free, no re-award).
    if (replay && !isSponsoredFreeMissionId(def.id)) {
      return 'games.html?game=' + encodeURIComponent(def.game_id);
    }
    return 'games.html?game=' + encodeURIComponent(def.game_id) + '&mission=' + encodeURIComponent(def.id);
  }

  function apiBase() {
    if (typeof window === 'undefined') return '';
    var raw =
      typeof window.LANTERN_ECONOMY_API !== 'undefined' &&
      window.LANTERN_ECONOMY_API !== null &&
      String(window.LANTERN_ECONOMY_API).trim() !== ''
        ? window.LANTERN_ECONOMY_API
        : window.LANTERN_AVATAR_API;
    if (raw == null) return '';
    return String(raw).replace(/\/$/, '');
  }

  function postJson(path, body) {
    var base = apiBase();
    return fetch(base + path, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    }).then(function (r) {
      return r.json().catch(function () {
        return { ok: false, error: 'bad_json' };
      });
    });
  }

  function startRun(missionId, gameId, runId) {
    return postJson('/api/missions/trivia/run/start', {
      mission_id: missionId,
      game_id: gameId,
      run_id: runId,
    });
  }

  function submitAnswer(missionId, gameId, runId, questionId, choiceIndex) {
    return postJson('/api/missions/trivia/answer', {
      mission_id: missionId,
      game_id: gameId,
      run_id: runId,
      question_id: questionId,
      choice_index: choiceIndex,
    });
  }

  function encourage(correctCount, target) {
    var n = Number(correctCount) || 0;
    var t = Number(target) || 10;
    if (n >= t) return 'Mission Complete!';
    if (n >= 7) return 'Almost there!';
    if (n >= 3) return 'Nice work — keep going!';
    if (n >= 1) return 'Nice start — keep going!';
    return 'Get 10 correct in this session.';
  }

  global.LANTERN_EDU_TRIVIA = {
    MISSIONS: MISSIONS,
    SPONSORED_FREE_MISSION_ID: SPONSORED_FREE_MISSION_ID,
    SPONSORED_FREE_GAME_ID: SPONSORED_FREE_GAME_ID,
    SPONSORED_FREE_PAIRS: SPONSORED_FREE_PAIRS,
    resolve: resolve,
    resolveForGame: resolveForGame,
    candidateFromLocation: candidateFromLocation,
    isSponsoredFreePair: isSponsoredFreePair,
    isSponsoredFreeLaunch: isSponsoredFreeLaunch,
    generateMissionRunId: generateMissionRunId,
    launchUrl: launchUrl,
    startRun: startRun,
    submitAnswer: submitAnswer,
    encourage: encourage,
  };
})(typeof window !== 'undefined' ? window : this);
