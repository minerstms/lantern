/**
 * Prompt #150 — reusable activity-backed educational trivia missions.
 * type: game_correct_target  ·  server-owned target=10  ·  reward=1
 * Correctness is scored against Worker banks (parity with lantern-game-content.js).
 * Run state lives in existing lantern_mission_submissions JSON (no schema migration).
 */
import {
  HANDBOOK_TRIVIA_BANK,
  LOCAL_HISTORY_TRIVIA_BANK,
  SRP_SAFETY_TRIVIA_BANK,
  SEVEN_HABITS_TRIVIA_BANK,
  SEVEN_HABITS_NAMES,
} from './educational-trivia-banks.js';
import { completeMissionByEvent } from './mission-event-completions.js';
import { isEveryCompletionMode, resolveMissionRewardMode } from './mission-reward-mode.js';
import { sanitizeRunId } from './lantern-game-catalog.js';

export const GAME_CORRECT_TARGET_TYPE = 'game_correct_target';
export const EDUCATIONAL_TRIVIA_CORRECT_TARGET = 10;
export const EDUCATIONAL_TRIVIA_REWARD_NUGGETS = 1;
export const TRIVIA_RUN_CONTENT_TYPE = 'trivia_run';

export const EDUCATIONAL_TRIVIA_MISSIONS = {
  perm_handbook_trivia: {
    id: 'perm_handbook_trivia',
    type: GAME_CORRECT_TARGET_TYPE,
    game_id: 'handbook-trivia',
    game_name: 'Handbook Trivia',
    title: 'Student Handbook Challenge',
    description: 'Get 10 Student Handbook questions correct in one game session.',
    correct_target: EDUCATIONAL_TRIVIA_CORRECT_TARGET,
    reward_nuggets: EDUCATIONAL_TRIVIA_REWARD_NUGGETS,
    trigger_type: 'handbook_trivia',
    icon: '📖',
    cover: 'assets/handbook-triva-card.png',
  },
  perm_local_history_trivia: {
    id: 'perm_local_history_trivia',
    type: GAME_CORRECT_TARGET_TYPE,
    game_id: 'local-history-trivia',
    game_name: 'Local History Trivia',
    title: 'Trinidad History Challenge',
    description: 'Get 10 Trinidad history questions correct in one game session.',
    correct_target: EDUCATIONAL_TRIVIA_CORRECT_TARGET,
    reward_nuggets: EDUCATIONAL_TRIVIA_REWARD_NUGGETS,
    trigger_type: 'local_history_trivia',
    icon: '🏛️',
    cover: 'assets/history-trivia-card.png',
  },
  perm_srp_safety: {
    id: 'perm_srp_safety',
    type: GAME_CORRECT_TARGET_TYPE,
    game_id: 'srp-safety-trivia',
    game_name: 'SRP Safety Challenge',
    title: 'SRP Safety Challenge',
    description: 'Learn the five SRP safety actions. Get 10 questions correct in one session.',
    correct_target: EDUCATIONAL_TRIVIA_CORRECT_TARGET,
    reward_nuggets: EDUCATIONAL_TRIVIA_REWARD_NUGGETS,
    trigger_type: 'srp_safety_trivia',
    icon: '🛡️',
    cover: 'assets/srp-safety.png',
  },
  perm_seven_habits: {
    id: 'perm_seven_habits',
    type: GAME_CORRECT_TARGET_TYPE,
    game_id: 'seven-habits-trivia',
    game_name: '7 Habits Challenge',
    title: '7 Habits Challenge',
    description:
      'Practice the 7 Habits through school, home, friendships, teamwork, and everyday choices. Learn the habits, recognize them in action, and decide how they can help.',
    correct_target: EDUCATIONAL_TRIVIA_CORRECT_TARGET,
    reward_nuggets: EDUCATIONAL_TRIVIA_REWARD_NUGGETS,
    trigger_type: 'seven_habits_trivia',
    icon: '🌱',
    cover: 'assets/lantern-trivia-card.png',
    selection: 'balanced_habit_pairs',
    allow_practice_after_complete: true,
    require_full_run_before_completion: true,
    run_length: 14,
  },
};

export const SEVEN_HABITS_SELECTION = 'balanced_habit_pairs';
export { SEVEN_HABITS_NAMES };

export function isEducationalTriviaMissionId(missionId) {
  return !!EDUCATIONAL_TRIVIA_MISSIONS[String(missionId || '').trim()];
}

export function resolveEducationalTriviaMission(missionId) {
  return EDUCATIONAL_TRIVIA_MISSIONS[String(missionId || '').trim()] || null;
}

export function resolveEducationalTriviaMissionForGame(missionId, gameId) {
  const def = resolveEducationalTriviaMission(missionId);
  if (!def) return null;
  if (String(gameId || '').trim() !== def.game_id) return null;
  return def;
}

export function getEducationalTriviaBank(gameId) {
  const id = String(gameId || '').trim();
  if (id === 'handbook-trivia') return HANDBOOK_TRIVIA_BANK;
  if (id === 'local-history-trivia') return LOCAL_HISTORY_TRIVIA_BANK;
  if (id === 'srp-safety-trivia') return SRP_SAFETY_TRIVIA_BANK;
  if (id === 'seven-habits-trivia') return SEVEN_HABITS_TRIVIA_BANK;
  return [];
}

function pickFromPool(pool, avoidSet, rng) {
  const fresh = (pool || []).filter((q) => q && q.id && !avoidSet.has(String(q.id)));
  const use = fresh.length ? fresh : (pool || []).filter((q) => q && q.id);
  if (!use.length) return null;
  return use[Math.floor(rng() * use.length)];
}

function shuffleInPlace(list, rng) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = list[i];
    list[i] = list[j];
    list[j] = t;
  }
  return list;
}

/**
 * Optional 7 Habits selector. Other educational missions keep pickNextQuestion.
 * One recognition + one application per habit, then shuffle the 14.
 */
export function pickBalancedSevenHabitsRun(bank, avoidIds, rngFn) {
  const rng = typeof rngFn === 'function' ? rngFn : Math.random;
  const avoid = new Set((avoidIds || []).map((id) => String(id)));
  const selected = [];
  SEVEN_HABITS_NAMES.forEach((habit) => {
    const rec = (bank || []).filter((q) => q && q.habit === habit && q.qtype === 'recognition');
    const app = (bank || []).filter((q) => q && q.habit === habit && q.qtype === 'application');
    const r = pickFromPool(rec, avoid, rng);
    const a = pickFromPool(app, avoid, rng);
    if (r) selected.push(r);
    if (a) selected.push(a);
  });
  return shuffleInPlace(selected, rng);
}

async function loadRecentSevenHabitsAvoidIds(db, missionId, characterName) {
  try {
    const row = await db
      .prepare(
        'SELECT submission_content FROM lantern_mission_submissions WHERE mission_id = ? AND character_name = ? ORDER BY created_at DESC LIMIT 1'
      )
      .bind(missionId, characterName)
      .first();
    const state = parseTriviaRunContent(row && row.submission_content);
    if (state && Array.isArray(state.run_queue) && state.run_queue.length) return state.run_queue;
  } catch (_) {}
  return [];
}

export function eventKeyEducationalTrivia(missionId, characterName) {
  const def = resolveEducationalTriviaMission(missionId);
  if (!def) return '';
  return `${def.trigger_type}:${String(characterName || '').trim()}`;
}

/** Per-run event key for every-completion reward mode (distinct legitimate runs pay once each). */
export function eventKeyEducationalTriviaRun(missionId, characterName, runId) {
  const def = resolveEducationalTriviaMission(missionId);
  if (!def) return '';
  const run = sanitizeRunId(runId);
  const key = String(characterName || '').trim();
  if (run) return `${def.trigger_type}:${key}:${run}`;
  return `${def.trigger_type}:${key}`;
}

export function triviaRunSubmissionId(runId) {
  const safe = sanitizeRunId(runId);
  if (!safe) return '';
  return `msub_trivia_${safe}`.slice(0, 120);
}

export function parseTriviaRunContent(raw) {
  try {
    const o = JSON.parse(String(raw || ''));
    if (!o || o.type !== TRIVIA_RUN_CONTENT_TYPE) return null;
    return o;
  } catch (_) {
    return null;
  }
}

export function isTriviaRunPendingSubmission(row) {
  if (!row) return false;
  if (String(row.status || '').trim().toLowerCase() !== 'pending') return false;
  if (isEducationalTriviaMissionId(row.mission_id) && parseTriviaRunContent(row.submission_content)) return true;
  return !!parseTriviaRunContent(row.submission_content);
}

export function publicQuestionFromItem(item) {
  if (!item) return null;
  return {
    id: item.id,
    question: item.question,
    options: Array.isArray(item.options) ? item.options.slice() : [],
  };
}

export function pickNextQuestion(bank, askedIds, lastId) {
  const asked = new Set((askedIds || []).map((id) => String(id)));
  const unused = bank.filter((q) => q && q.id && !asked.has(q.id));
  let pool = unused.length ? unused : bank.filter((q) => q && q.id && q.id !== lastId);
  if (!pool.length) pool = bank.slice();
  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

function findBankItem(bank, questionId) {
  const id = String(questionId || '').trim();
  return bank.find((q) => q && q.id === id) || null;
}

export function overlayEducationalTriviaMissions(list) {
  const out = Array.isArray(list) ? list.slice() : [];
  const have = new Set(out.map((m) => String((m && m.id) || '').trim()));
  const createdAt = '2026-08-12T00:00:00.000Z';
  Object.values(EDUCATIONAL_TRIVIA_MISSIONS).forEach((def) => {
    if (have.has(def.id)) return;
    out.push({
      id: def.id,
      title: def.title,
      description: def.description,
      reward_amount: EDUCATIONAL_TRIVIA_REWARD_NUGGETS,
      submission_type: 'confirmation',
      created_by_teacher_id: 'mr_radle',
      created_by_teacher_name: 'Mr. Radle',
      audience: 'school_mission',
      participant_scope: 'students',
      target_character_names: [],
      featured: false,
      active: true,
      archived: false,
      site_eligible: false,
      allows_text: false,
      allows_image: false,
      allows_video: false,
      allows_link: false,
      min_characters: 0,
      card_image_r2_key: null,
      card_image_url: null,
      created_at: createdAt,
      activity: {
        type: def.type,
        game_id: def.game_id,
        correct_target: def.correct_target,
        reward_nuggets: def.reward_nuggets,
      },
    });
  });
  return out.map((m) => {
    const def = resolveEducationalTriviaMission(m && m.id);
    if (!def) return m;
    return {
      ...m,
      title: m.title || def.title,
      description: m.description || def.description,
      reward_amount: m.reward_amount != null && m.reward_amount !== '' ? m.reward_amount : EDUCATIONAL_TRIVIA_REWARD_NUGGETS,
      activity: {
        type: def.type,
        game_id: def.game_id,
        correct_target: def.correct_target,
        reward_nuggets: m.reward_amount != null && m.reward_amount !== '' ? m.reward_amount : def.reward_nuggets,
      },
    };
  });
}

export async function ensureEducationalTriviaMissions(db) {
  if (!db) return;
  const createdAt = '2026-08-12T00:00:00.000Z';
  for (const def of Object.values(EDUCATIONAL_TRIVIA_MISSIONS)) {
    try {
      await db
        .prepare(
          'INSERT OR IGNORE INTO lantern_missions (id, teacher_id, teacher_name, title, description, reward_amount, submission_type, audience, participant_scope, target_character_names, featured, active, archived, site_eligible, allows_text, allows_image, allows_video, allows_link, min_characters, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        )
        .bind(
          def.id,
          'mr_radle',
          'Mr. Radle',
          def.title,
          def.description,
          EDUCATIONAL_TRIVIA_REWARD_NUGGETS,
          'confirmation',
          'school_mission',
          'students',
          null,
          0,
          1,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          createdAt
        )
        .run();
    } catch (_) {
      try {
        await db
          .prepare(
            'INSERT OR IGNORE INTO lantern_missions (id, teacher_id, teacher_name, title, description, reward_amount, submission_type, audience, featured, active, site_eligible, created_at, allows_text, allows_image, allows_video, allows_link, min_characters) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
          )
          .bind(
            def.id,
            'mr_radle',
            'Mr. Radle',
            def.title,
            def.description,
            EDUCATIONAL_TRIVIA_REWARD_NUGGETS,
            'confirmation',
            'school_mission',
            0,
            1,
            0,
            createdAt,
            0,
            0,
            0,
            0,
            0
          )
          .run();
      } catch (_) {}
    }
  }
}

function isFullRunMission(def) {
  return !!(def && def.require_full_run_before_completion);
}

function fullRunLength(def, state) {
  if (state && Array.isArray(state.run_queue) && state.run_queue.length) return state.run_queue.length;
  const n = Number(def && def.run_length);
  return Number.isFinite(n) && n > 0 ? n : 14;
}

function runProgressPayload(state, def, extras) {
  const fullRun = isFullRunMission(def);
  const askedN = Array.isArray(state.asked_ids) ? state.asked_ids.length : 0;
  const runLen = fullRun ? fullRunLength(def, state) : 0;
  const passed = Number(state.correct_count) >= EDUCATIONAL_TRIVIA_CORRECT_TARGET;
  const completed = fullRun
    ? !!(state.locked && passed && askedN >= runLen)
    : !!state.locked || passed;
  return {
    ok: true,
    mission_id: def.id,
    game_id: def.game_id,
    type: def.type,
    correct_count: Number(state.correct_count) || 0,
    target: EDUCATIONAL_TRIVIA_CORRECT_TARGET,
    reward_nuggets: EDUCATIONAL_TRIVIA_REWARD_NUGGETS,
    run_id: state.run_id,
    locked: !!state.locked,
    completed,
    ...(fullRun
      ? {
          run_length: runLen,
          asked_count: askedN,
          question_number: state.current_question_id ? askedN + 1 : askedN,
        }
      : {}),
    ...(extras || {}),
  };
}

async function loadTriviaRunRow(db, runId) {
  const sid = triviaRunSubmissionId(runId);
  if (!sid) return null;
  return (
    (await db
      .prepare(
        'SELECT id, mission_id, character_name, submission_type, submission_content, status, created_at, reviewed_by FROM lantern_mission_submissions WHERE id = ?'
      )
      .bind(sid)
      .first()) || null
  );
}

async function writeTriviaRunState(db, row, state) {
  await db
    .prepare('UPDATE lantern_mission_submissions SET submission_content = ? WHERE id = ?')
    .bind(JSON.stringify(state), row.id)
    .run();
}

/**
 * Start (or resume) a mission trivia run. Does not charge Nuggets.
 * Client target/reward/character_name are ignored.
 */
export async function startEducationalTriviaRun(db, env, opts) {
  const characterName = String((opts && opts.characterName) || '').trim();
  const missionId = String((opts && opts.missionId) || '').trim();
  const gameId = String((opts && opts.gameId) || '').trim();
  const runId = sanitizeRunId(opts && opts.runId);
  if (!characterName) return { ok: false, error: 'missing_identity', _httpStatus: 401 };
  if (!runId) return { ok: false, error: 'invalid_run_id', _httpStatus: 400 };
  const def = resolveEducationalTriviaMissionForGame(missionId, gameId);
  if (!def) return { ok: false, error: 'invalid_mission', _httpStatus: 400 };

  await ensureEducationalTriviaMissions(db);

  const rewardMode = await resolveMissionRewardMode(db, def.id);
  const everyMode = isEveryCompletionMode(rewardMode);

  const eventKey = eventKeyEducationalTrivia(def.id, characterName);
  const existingComplete = await db
    .prepare(
      "SELECT id FROM lantern_mission_submissions WHERE mission_id = ? AND character_name = ? AND status = 'accepted' ORDER BY created_at ASC LIMIT 1"
    )
    .bind(def.id, characterName)
    .first();
  if (existingComplete && !def.allow_practice_after_complete && !everyMode) {
    return {
      ok: true,
      already_completed: true,
      rewarded: false,
      mission_id: def.id,
      game_id: def.game_id,
      target: EDUCATIONAL_TRIVIA_CORRECT_TARGET,
      reward_nuggets: EDUCATIONAL_TRIVIA_REWARD_NUGGETS,
      question: null,
    };
  }

  const bank = getEducationalTriviaBank(def.game_id);
  if (!bank.length) return { ok: false, error: 'bank_unavailable', _httpStatus: 500 };

  const existing = await loadTriviaRunRow(db, runId);
  if (existing) {
    if (String(existing.character_name || '') !== characterName) {
      return { ok: false, error: 'run_not_owned', _httpStatus: 403 };
    }
    if (String(existing.mission_id || '') !== def.id) {
      return { ok: false, error: 'run_mission_mismatch', _httpStatus: 400 };
    }
    const state = parseTriviaRunContent(existing.submission_content);
    if (!state) return { ok: false, error: 'run_corrupt', _httpStatus: 500 };
    const current = findBankItem(bank, state.current_question_id);
    return runProgressPayload(state, def, {
      question: state.locked ? null : publicQuestionFromItem(current),
      resumed: true,
    });
  }

  let first = null;
  let runQueue = null;
  if (def.selection === SEVEN_HABITS_SELECTION) {
    const avoid = await loadRecentSevenHabitsAvoidIds(db, def.id, characterName);
    const runItems = pickBalancedSevenHabitsRun(bank, avoid);
    if (!runItems.length) return { ok: false, error: 'bank_unavailable', _httpStatus: 500 };
    runQueue = runItems.map((q) => q.id);
    first = runItems[0];
  } else {
    first = pickNextQuestion(bank, [], '');
  }
  if (!first || !first.id) return { ok: false, error: 'bank_unavailable', _httpStatus: 500 };
  const state = {
    type: TRIVIA_RUN_CONTENT_TYPE,
    mission_id: def.id,
    game_id: def.game_id,
    run_id: runId,
    correct_count: 0,
    target: EDUCATIONAL_TRIVIA_CORRECT_TARGET,
    asked_ids: [],
    current_question_id: first.id,
    locked: false,
    last_answer: null,
    ...(runQueue ? { run_queue: runQueue, selection: SEVEN_HABITS_SELECTION } : {}),
  };
  const now = new Date().toISOString();
  const sid = triviaRunSubmissionId(runId);
  try {
    await db
      .prepare(
        'INSERT INTO lantern_mission_submissions (id, mission_id, character_name, submission_type, submission_content, status, created_at, reviewed_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .bind(sid, def.id, characterName, 'confirmation', JSON.stringify(state), 'pending', now, 'system')
      .run();
  } catch (e) {
    const again = await loadTriviaRunRow(db, runId);
    if (!again) return { ok: false, error: 'run_insert_failed', detail: String(e && e.message ? e.message : e), _httpStatus: 500 };
    const againState = parseTriviaRunContent(again.submission_content);
    return runProgressPayload(againState || state, def, {
      question: publicQuestionFromItem(findBankItem(bank, (againState && againState.current_question_id) || first.id)),
      resumed: true,
    });
  }
  return runProgressPayload(state, def, {
    question: publicQuestionFromItem(first),
    event_key: eventKey,
  });
}

/**
 * Submit one answer. Server owns correctness, target, and reward.
 * Client-reported correctCount / target / reward / character_name are ignored.
 */
export async function answerEducationalTriviaRun(db, env, opts) {
  const characterName = String((opts && opts.characterName) || '').trim();
  const missionId = String((opts && opts.missionId) || '').trim();
  const gameId = String((opts && opts.gameId) || '').trim();
  const runId = sanitizeRunId(opts && opts.runId);
  const questionId = String((opts && opts.questionId) || '').trim();
  const choiceIndex = Number(opts && opts.choiceIndex);
  if (!characterName) return { ok: false, error: 'missing_identity', _httpStatus: 401 };
  if (!runId) return { ok: false, error: 'invalid_run_id', _httpStatus: 400 };
  if (!questionId || !Number.isInteger(choiceIndex) || choiceIndex < 0 || choiceIndex > 3) {
    return { ok: false, error: 'invalid_answer', _httpStatus: 400 };
  }
  const def = resolveEducationalTriviaMissionForGame(missionId, gameId);
  if (!def) return { ok: false, error: 'invalid_mission', _httpStatus: 400 };

  const row = await loadTriviaRunRow(db, runId);
  if (!row) return { ok: false, error: 'run_not_found', _httpStatus: 404 };
  if (String(row.character_name || '') !== characterName) return { ok: false, error: 'run_not_owned', _httpStatus: 403 };
  if (String(row.mission_id || '') !== def.id) return { ok: false, error: 'run_mission_mismatch', _httpStatus: 400 };

  const state = parseTriviaRunContent(row.submission_content);
  if (!state) return { ok: false, error: 'run_corrupt', _httpStatus: 500 };
  const bank = getEducationalTriviaBank(def.game_id);

  if (state.locked || (!isFullRunMission(def) && Number(state.correct_count) >= EDUCATIONAL_TRIVIA_CORRECT_TARGET)) {
    return runProgressPayload(state, def, {
      already_completed: true,
      rewarded: false,
      question: null,
      correct: true,
    });
  }

  if (state.last_answer && state.last_answer.question_id === questionId) {
    if (Number(state.last_answer.choice_index) === choiceIndex) {
      const current = findBankItem(bank, state.current_question_id);
      return runProgressPayload(state, def, {
        correct: !!state.last_answer.correct,
        explanation: state.last_answer.explanation || '',
        question: state.locked ? null : publicQuestionFromItem(current),
        duplicate_answer: true,
        rewarded: false,
      });
    }
    return { ok: false, error: 'already_answered', _httpStatus: 409 };
  }

  if (String(state.current_question_id || '') !== questionId) {
    return { ok: false, error: 'stale_question', _httpStatus: 409 };
  }

  const item = findBankItem(bank, questionId);
  if (!item) return { ok: false, error: 'unknown_question', _httpStatus: 400 };
  const isCorrect = choiceIndex === Number(item.correctIndex);
  const asked = Array.isArray(state.asked_ids) ? state.asked_ids.slice() : [];
  if (!asked.includes(questionId)) asked.push(questionId);

  let correctCount = Number(state.correct_count) || 0;
  if (isCorrect) correctCount += 1;

  const reachedTarget = correctCount >= EDUCATIONAL_TRIVIA_CORRECT_TARGET;
  const fullRun = isFullRunMission(def);
  let next = null;
  if (fullRun && Array.isArray(state.run_queue) && state.run_queue.length) {
    const remaining = state.run_queue.filter((id) => id && !asked.includes(id));
    next = remaining.length ? findBankItem(bank, remaining[0]) : null;
  } else if (!reachedTarget) {
    next = pickNextQuestion(bank, asked, questionId);
  }
  const finished = fullRun ? !next : reachedTarget;
  const completed = fullRun ? finished && reachedTarget : reachedTarget;
  state.asked_ids = asked;
  state.correct_count = correctCount;
  state.locked = finished;
  state.current_question_id = next ? next.id : null;
  state.last_answer = {
    question_id: questionId,
    choice_index: choiceIndex,
    correct: isCorrect,
    explanation: String(item.explanation || ''),
  };
  await writeTriviaRunState(db, row, state);

  let rewardResult = null;
  if (completed) {
    const rewardMode = await resolveMissionRewardMode(db, def.id);
    const everyMode = isEveryCompletionMode(rewardMode);
    const completionEventKey = everyMode
      ? eventKeyEducationalTriviaRun(def.id, characterName, runId)
      : eventKeyEducationalTrivia(def.id, characterName);
    rewardResult = await completeMissionByEvent(db, env, {
      missionId: def.id,
      characterName,
      triggerType: def.trigger_type,
      eventKey: completionEventKey,
      sourceRef: runId,
      cadence: 'once',
      rewardMode,
      note: def.title,
      content: JSON.stringify({
        type: GAME_CORRECT_TARGET_TYPE,
        game_id: def.game_id,
        run_id: runId,
        correct_count: correctCount,
      }).slice(0, 500),
    });
    if (!rewardResult.ok) {
      return { ok: false, error: rewardResult.error || 'completion_failed', _httpStatus: 500 };
    }
  }

  return runProgressPayload(state, def, {
    correct: isCorrect,
    explanation: String(item.explanation || ''),
    correct_index: Number(item.correctIndex),
    question: next ? publicQuestionFromItem(next) : null,
    rewarded: !!(rewardResult && rewardResult.rewarded),
    reward_idempotent: !!(rewardResult && (rewardResult.idempotent || rewardResult.reward_idempotent)),
    already_completed: !!(rewardResult && rewardResult.already_completed),
    run_exhausted: !completed && !next,
    balance_after: rewardResult && rewardResult.balance_after != null ? rewardResult.balance_after : undefined,
  });
}
