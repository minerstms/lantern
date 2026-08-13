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
    },
  };

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

  function launchUrl(missionId, opts) {
    var def = resolve(missionId);
    if (!def) return 'games.html';
    var replay = opts && opts.replay;
    if (replay) return 'games.html?game=' + encodeURIComponent(def.game_id);
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
    resolve: resolve,
    resolveForGame: resolveForGame,
    candidateFromLocation: candidateFromLocation,
    launchUrl: launchUrl,
    startRun: startRun,
    submitAnswer: submitAnswer,
    encourage: encourage,
  };
})(typeof window !== 'undefined' ? window : this);
