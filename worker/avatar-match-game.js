/**
 * Prompt #238 — Avatar Match competitive modes, unique questions, accuracy-first score.
 * Persistence reuses lantern_leaderboard_entries (no new table).
 */
export const AVATAR_MATCH_MIN_POOL = 4;
export const AVATAR_MATCH_FIXED_MODES = [10, 25, 50, 100];
export const AVATAR_MATCH_TIME_CAP_MS = 99999999;
export const AVATAR_MATCH_ACCURACY_SCALE = 10000;
export const AVATAR_MATCH_TIME_BUCKET = 100000000;

export function avatarMatchModeAvailability(eligibleCount) {
  const n = Math.max(0, Math.floor(Number(eligibleCount) || 0));
  const playable = n >= AVATAR_MATCH_MIN_POOL;
  return {
    eligibleCount: n,
    playable,
    modes: [
      { id: '10', label: '10 Questions', questions: 10, enabled: playable && n >= 10, requires: 10 },
      { id: '25', label: '25 Questions', questions: 25, enabled: playable && n >= 25, requires: 25 },
      { id: '50', label: '50 Questions', questions: 50, enabled: playable && n >= 50, requires: 50 },
      { id: '100', label: '100 Questions', questions: 100, enabled: playable && n >= 100, requires: 100 },
      { id: 'full', label: 'Full Roster', questions: n, enabled: playable, requires: AVATAR_MATCH_MIN_POOL },
    ],
  };
}

export function resolveAvatarMatchMode(rawMode, eligibleCount) {
  const avail = avatarMatchModeAvailability(eligibleCount);
  const id = String(rawMode || '').trim().toLowerCase();
  return avail.modes.find((m) => m.id === id) || null;
}

export function questionProgressLabel(index, total) {
  return 'Question ' + Math.max(1, Math.floor(Number(index) || 1)) + ' of ' + Math.max(1, Math.floor(Number(total) || 1));
}

export function teachingRevealCopy(displayName) {
  const name = String(displayName || '').trim();
  if (!name) return "That's the correct person.";
  return /[.!?]$/.test(name) ? "That's " + name : "That's " + name + '.';
}

export function avatarMatchRevealDelayMs(isCorrect, reducedMotion) {
  if (reducedMotion) return 650;
  return isCorrect ? 800 : 950;
}

export function formatAvatarMatchClock(elapsedMs) {
  const ms = Math.max(0, Math.floor(Number(elapsedMs) || 0));
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return m + ':' + String(s).padStart(2, '0');
}

export function avatarMatchAccuracyPct(correct, total) {
  const n = Math.max(0, Math.floor(Number(total) || 0));
  const c = Math.max(0, Math.floor(Number(correct) || 0));
  if (!n) return 0;
  return Math.round((c / n) * 1000) / 10;
}

export function encodeAvatarMatchScore(correct, total, elapsedMs) {
  const t = Math.max(0, Math.min(AVATAR_MATCH_TIME_CAP_MS, Math.floor(Number(elapsedMs) || 0)));
  const c = Math.max(0, Math.floor(Number(correct) || 0));
  const n = Math.max(1, Math.floor(Number(total) || 0));
  const safeCorrect = Math.min(c, n);
  const bp = Math.round((safeCorrect / n) * AVATAR_MATCH_ACCURACY_SCALE);
  return bp * AVATAR_MATCH_TIME_BUCKET + (AVATAR_MATCH_TIME_CAP_MS - t);
}

export function formatAvatarMatchScoreDisplay(correct, total, elapsedMs) {
  const acc = avatarMatchAccuracyPct(correct, total).toFixed(1);
  return String(Math.floor(Number(correct) || 0)) + '/' + String(Math.floor(Number(total) || 0)) + ' · ' + acc + '% · ' + formatAvatarMatchClock(elapsedMs);
}

export function shuffleInPlace(list) {
  const arr = Array.isArray(list) ? list : [];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
  return arr;
}

export function selectUniqueTargets(roster, modeId) {
  const list = shuffleInPlace((roster || []).slice());
  if (String(modeId) === 'full') return list;
  const n = Math.floor(Number(modeId) || 0);
  if (n < 1) return [];
  return list.slice(0, n);
}

export function compareAvatarMatchScores(a, b) {
  const accA = Number(a && a.accuracy != null ? a.accuracy : -1);
  const accB = Number(b && b.accuracy != null ? b.accuracy : -1);
  if (accA !== accB) return accB - accA;
  const tA = Number(a && a.elapsed_ms != null ? a.elapsed_ms : AVATAR_MATCH_TIME_CAP_MS);
  const tB = Number(b && b.elapsed_ms != null ? b.elapsed_ms : AVATAR_MATCH_TIME_CAP_MS);
  return tA - tB;
}

export function parseAvatarMatchRecordBody(body) {
  const raw = body && typeof body === 'object' ? body : {};
  const meta = raw.meta && typeof raw.meta === 'object' ? raw.meta : {};
  const mode = String(raw.am_mode || meta.am_mode || '').trim().toLowerCase();
  const questions = Math.floor(Number(raw.am_questions != null ? raw.am_questions : meta.am_questions));
  const correct = Math.floor(Number(raw.am_correct != null ? raw.am_correct : meta.am_correct));
  const elapsed = Math.floor(Number(raw.am_elapsed_ms != null ? raw.am_elapsed_ms : meta.am_elapsed_ms));
  return { mode, questions, correct, elapsed };
}

export function validateAvatarMatchResult(body, eligibleCount) {
  const parsed = parseAvatarMatchRecordBody(body);
  const mode = resolveAvatarMatchMode(parsed.mode, Number.isFinite(eligibleCount) ? eligibleCount : parsed.questions);
  if (!mode) return { ok: false, error: 'invalid_avatar_match_mode' };
  if (mode.id !== 'full' && parsed.questions !== mode.questions) {
    return { ok: false, error: 'invalid_avatar_match_questions' };
  }
  if (mode.id === 'full' && parsed.questions < AVATAR_MATCH_MIN_POOL) {
    return { ok: false, error: 'invalid_avatar_match_questions' };
  }
  if (!Number.isFinite(parsed.correct) || parsed.correct < 0 || parsed.correct > parsed.questions) {
    return { ok: false, error: 'invalid_avatar_match_correct' };
  }
  if (!Number.isFinite(parsed.elapsed) || parsed.elapsed < 1 || parsed.elapsed > AVATAR_MATCH_TIME_CAP_MS) {
    return { ok: false, error: 'invalid_avatar_match_time' };
  }
  const expected = encodeAvatarMatchScore(parsed.correct, parsed.questions, parsed.elapsed);
  if (body && body.score != null && Number.isFinite(Number(body.score)) && Math.floor(Number(body.score)) !== expected) {
    return { ok: false, error: 'avatar_match_score_mismatch' };
  }
  const accuracy = avatarMatchAccuracyPct(parsed.correct, parsed.questions);
  return {
    ok: true,
    mode: mode.id,
    questions: parsed.questions,
    correct: parsed.correct,
    elapsed: parsed.elapsed,
    accuracy,
    score: expected,
    score_display: formatAvatarMatchScoreDisplay(parsed.correct, parsed.questions, parsed.elapsed),
  };
}

export function avatarMatchDivisionKey(mode, questions) {
  const id = String(mode || '').trim().toLowerCase();
  if (id === 'full') return 'full:' + Math.floor(Number(questions) || 0);
  return id;
}
