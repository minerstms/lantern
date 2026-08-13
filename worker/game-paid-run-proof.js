/**
 * Prompt #159 — bind leaderboard results to a successful paid game_play transaction.
 *
 * The client-generated run_id is not authority. The persisted lantern_transactions
 * row (kind=game_play, delta=-1, matching account + game + run_id) is authority.
 *
 * Result window: 60 minutes. Covers every current production game with room for
 * slow student play (10-question trivia + explanations, Avatar Match, Memory)
 * without letting a paid run be hoarded indefinitely.
 * Actual play lengths today: Reaction/Click Rush seconds; Nugget Hunt ≤40s;
 * Memory 6 pairs; trivia 10 questions; Avatar Match a few minutes.
 */
import { resolveRegisteredLeaderboardGame } from './lantern-game-catalog.js';

export const PAID_RUN_RESULT_WINDOW_MS = 60 * 60 * 1000;

export function parseTransactionMeta(raw) {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (_) {
    return {};
  }
}

export function paidRunGameMatches(tx, game) {
  if (!tx || !game) return false;
  const meta = parseTransactionMeta(tx.meta_json);
  const metaId = String(meta.game_id || '').trim();
  const metaName = String(meta.game_name || '').trim();
  const note = String(tx.note || '').trim();
  if (metaId) {
    return metaId === game.id;
  }
  if (metaName) {
    const mapped = resolveRegisteredLeaderboardGame(metaName);
    return !!(mapped && mapped.id === game.id && metaName === game.name);
  }
  if (note) {
    const mapped = resolveRegisteredLeaderboardGame(note);
    return !!(mapped && mapped.id === game.id && note === game.name);
  }
  return false;
}

/**
 * @returns {{ ok: true, tx: object } | { ok: false, error: 'invalid_run' | 'run_expired' }}
 */
export function evaluatePaidGamePlayRun(tx, opts) {
  const characterName = String((opts && opts.characterName) || '');
  const game = opts && opts.game;
  const nowMs = Number(opts && opts.nowMs);
  const clock = Number.isFinite(nowMs) ? nowMs : Date.now();

  if (!tx || !game || !characterName) {
    return { ok: false, error: 'invalid_run' };
  }
  if (String(tx.kind || '') !== 'game_play') {
    return { ok: false, error: 'invalid_run' };
  }
  if (Math.floor(Number(tx.delta)) !== -1) {
    return { ok: false, error: 'invalid_run' };
  }
  if (String(tx.character_name || '') !== characterName) {
    return { ok: false, error: 'invalid_run' };
  }
  if (!paidRunGameMatches(tx, game)) {
    return { ok: false, error: 'invalid_run' };
  }

  const createdMs = Date.parse(tx.created_at);
  if (!Number.isFinite(createdMs)) {
    return { ok: false, error: 'invalid_run' };
  }
  if (createdMs > clock + 120000) {
    return { ok: false, error: 'invalid_run' };
  }
  if (clock - createdMs > PAID_RUN_RESULT_WINDOW_MS) {
    return { ok: false, error: 'run_expired' };
  }
  return { ok: true, tx };
}

export async function findPaidGamePlayByRunId(db, runId) {
  if (!db || !runId) return null;
  try {
    const row = await db
      .prepare(
        `SELECT id, character_name, delta, kind, source, note, created_at, meta_json
         FROM lantern_transactions
         WHERE kind = 'game_play'
           AND json_extract(meta_json, '$.run_id') = ?
         LIMIT 1`
      )
      .bind(runId)
      .first();
    return row || null;
  } catch (_) {
    return null;
  }
}
