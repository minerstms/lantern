/**
 * Prompt #257B — per-game play pricing (server-authoritative).
 *
 * Config in lantern_settings:
 *   economy.game_default_play_mode  → global | 1 | 2 | 3 | free
 *   economy.game.<game_id>.play_mode → global | 1 | 2 | 3 | free
 *
 * Multi-play bundles persist in lantern_transactions (kind game_play):
 *   purchase row: delta -1, meta.bundle_id, bundle_plays_total, bundle_play_index
 *   consume row:  delta  0, same bundle_id, next bundle_play_index
 */
import { LANTERN_LEADERBOARD_GAMES, resolveRegisteredLeaderboardGame } from './lantern-game-catalog.js';
import { parseTransactionMeta } from './game-paid-run-proof.js';
import { resolveEconomyAmount } from './nugget-economy-settings.js';

export const GAME_DEFAULT_PLAY_MODE_KEY = 'economy.game_default_play_mode';

export const PLAY_MODE_VALUES = ['global', '1', '2', '3', 'free'];

export function gamePlayModeSettingKey(gameId) {
  return `economy.game.${String(gameId || '').trim()}.play_mode`;
}

async function readSettingRaw(db, key) {
  if (!db) return null;
  try {
    const row = await db.prepare('SELECT value FROM lantern_settings WHERE key = ?').bind(key).first();
    return row && row.value != null ? row.value : null;
  } catch (_err) {
    return null;
  }
}

async function writeSettingRaw(db, key, value, updatedBy) {
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO lantern_settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`
    )
    .bind(key, String(value), now, updatedBy || null)
    .run();
  return { ok: true, value: String(value), updated_at: now };
}

export function normalizePlayMode(raw, allowGlobal) {
  const s = String(raw == null ? '' : raw)
    .trim()
    .toLowerCase();
  if (allowGlobal && (s === 'global' || s === 'use_global' || s === 'use global')) return 'global';
  if (s === 'free' || s === 'free_play' || s === 'free play') return 'free';
  if (s === '1' || s === 'one' || s === '1_play' || s === '1 play') return '1';
  if (s === '2' || s === 'two' || s === '2_plays' || s === '2 plays') return '2';
  if (s === '3' || s === 'three' || s === '3_plays' || s === '3 plays') return '3';
  return null;
}

/** @returns {{ mode: string, playsPerNugget: number, free: boolean, nuggetDebit: number }} */
export function resolvedPlayEconomyFromMode(mode) {
  const m = normalizePlayMode(mode, false) || '1';
  if (m === 'free') {
    return { mode: 'free', playsPerNugget: 0, free: true, nuggetDebit: 0 };
  }
  const n = m === '2' ? 2 : m === '3' ? 3 : 1;
  return { mode: m, playsPerNugget: n, free: false, nuggetDebit: 1 };
}

export async function readGameDefaultPlayMode(db) {
  const raw = await readSettingRaw(db, GAME_DEFAULT_PLAY_MODE_KEY);
  const parsed = normalizePlayMode(raw, false);
  if (parsed) return parsed;
  return '1';
}

export async function readGameOverridePlayMode(db, gameId) {
  const raw = await readSettingRaw(db, gamePlayModeSettingKey(gameId));
  const parsed = normalizePlayMode(raw, true);
  return parsed || 'global';
}

export async function resolveGamePlayEconomy(db, gameId) {
  const game = resolveRegisteredLeaderboardGame(gameId);
  if (!game) return null;
  const override = await readGameOverridePlayMode(db, game.id);
  let effective = override;
  if (override === 'global') {
    effective = await readGameDefaultPlayMode(db);
  }
  const resolved = resolvedPlayEconomyFromMode(effective);
  if (!resolved.free && (override === 'global' || effective === '1')) {
    const legacyDelta = await resolveEconomyAmount(db, 'game_play');
    if (legacyDelta === 0) {
      return {
        id: game.id,
        name: game.name,
        override_mode: override,
        effective_mode: 'free',
        mode: 'free',
        playsPerNugget: 0,
        free: true,
        nuggetDebit: 0,
        legacy_global_free: true,
      };
    }
  }
  return {
    id: game.id,
    name: game.name,
    override_mode: override,
    effective_mode: effective,
    ...resolved,
  };
}

export async function buildGameEconomyPublicPayload(db) {
  const defaultMode = await readGameDefaultPlayMode(db);
  const games = [];
  for (let i = 0; i < LANTERN_LEADERBOARD_GAMES.length; i++) {
    const g = LANTERN_LEADERBOARD_GAMES[i];
    if (g.status !== 'playable') continue;
    const row = await resolveGamePlayEconomy(db, g.id);
    if (row) games.push(row);
  }
  return {
    default_play_mode: defaultMode,
    games,
  };
}

export function formatPlayEconomyCopy(resolved) {
  const r = resolved || resolvedPlayEconomyFromMode('1');
  if (r.free) {
    return {
      card_meta: 'Free Play',
      pregame_cost: 'Free Play',
      play_action: 'Play Free',
      insufficient: 'Free Play',
      win_note: null,
    };
  }
  const n = r.playsPerNugget || 1;
  if (n === 1) {
    return {
      card_meta: '1 Nugget = 1 Play',
      pregame_cost: '1 Nugget = 1 Play',
      play_action: 'Play for 1 Nugget',
      insufficient: 'You need 1 Nugget to play.',
      win_note: null,
    };
  }
  return {
    card_meta: '1 Nugget = ' + n + ' Plays',
    pregame_cost: '1 Nugget = ' + n + ' Plays',
    play_action: 'Buy ' + n + ' Plays — 1 Nugget',
    insufficient: 'You need 1 Nugget for ' + n + ' Plays.',
    win_note: null,
  };
}

export async function countBundlePlaysUsed(db, bundleId) {
  if (!db || !bundleId) return 0;
  try {
    const row = await db
      .prepare(
        `SELECT COUNT(*) AS c FROM lantern_transactions
         WHERE kind = 'game_play'
           AND json_extract(meta_json, '$.bundle_id') = ?`
      )
      .bind(String(bundleId))
      .first();
    return row && row.c != null ? Math.max(0, Math.floor(Number(row.c))) : 0;
  } catch (_) {
    return 0;
  }
}

/**
 * Find a purchased bundle with remaining plays for this student + game.
 */
export async function findActivePlayBundle(db, characterName, gameId) {
  if (!db || !characterName || !gameId) return null;
  try {
    const rows = await db
      .prepare(
        `SELECT meta_json, created_at FROM lantern_transactions
         WHERE character_name = ?
           AND kind = 'game_play'
           AND json_extract(meta_json, '$.game_id') = ?
           AND json_extract(meta_json, '$.bundle_id') IS NOT NULL
           AND json_extract(meta_json, '$.bundle_plays_total') IS NOT NULL
         ORDER BY created_at DESC
         LIMIT 30`
      )
      .bind(String(characterName), String(gameId))
      .all();
    const seen = Object.create(null);
    const list = (rows && rows.results) || [];
    for (let i = 0; i < list.length; i++) {
      const meta = parseTransactionMeta(list[i].meta_json);
      const bundleId = String(meta.bundle_id || '').trim();
      const total = Math.max(1, Math.floor(Number(meta.bundle_plays_total)) || 1);
      if (!bundleId || seen[bundleId]) continue;
      seen[bundleId] = true;
      if (total <= 1) continue;
      const used = await countBundlePlaysUsed(db, bundleId);
      if (used < total) {
        return {
          bundle_id: bundleId,
          plays_total: total,
          plays_used: used,
          plays_remaining: total - used,
        };
      }
    }
  } catch (_) {
    return null;
  }
  return null;
}

export async function getPlayEntitlementsForCharacter(db, characterName) {
  const out = Object.create(null);
  if (!db || !characterName) return out;
  for (let i = 0; i < LANTERN_LEADERBOARD_GAMES.length; i++) {
    const g = LANTERN_LEADERBOARD_GAMES[i];
    if (g.status !== 'playable') continue;
    const active = await findActivePlayBundle(db, characterName, g.id);
    if (active && active.plays_remaining > 0) {
      out[g.id] = {
        bundle_id: active.bundle_id,
        plays_total: active.plays_total,
        plays_used: active.plays_used,
        plays_remaining: active.plays_remaining,
      };
    }
  }
  return out;
}

/**
 * Resolve authoritative game_play debit + meta for a new run.
 * @returns {Promise<{ ok: true, delta: number, meta: object, bundle?: object } | { ok: false, error: string }>}
 */
export async function resolveGamePlayTransact(db, characterName, gameIdOrName, runId, baseMeta) {
  const rid = String(runId || '').trim();
  if (!rid) return { ok: false, error: 'invalid_run' };

  const gameRef = String(gameIdOrName || '').trim();
  if (!gameRef) {
    const legacyDelta = await resolveEconomyAmount(db, 'game_play');
    const meta = Object.assign({}, baseMeta || {}, { run_id: rid, legacy_global: true });
    return { ok: true, delta: legacyDelta, meta, economy: null, legacy: true };
  }

  const game = resolveRegisteredLeaderboardGame(gameRef);
  if (!game) return { ok: false, error: 'invalid_game' };

  const economy = await resolveGamePlayEconomy(db, game.id);
  if (!economy) return { ok: false, error: 'invalid_game' };

  const meta = Object.assign({}, baseMeta || {}, {
    run_id: rid,
    game_id: game.id,
    game_name: game.name,
  });

  if (economy.free) {
    meta.free_play = true;
    delete meta.bundle_id;
    delete meta.bundle_plays_total;
    delete meta.bundle_play_index;
    return { ok: true, delta: 0, meta, economy };
  }

  const active = await findActivePlayBundle(db, characterName, game.id);
  if (active && active.plays_remaining > 0) {
    meta.bundle_id = active.bundle_id;
    meta.bundle_plays_total = active.plays_total;
    meta.bundle_play_index = active.plays_used + 1;
    meta.bundle_consume = true;
    return {
      ok: true,
      delta: 0,
      meta,
      economy,
      bundle: active,
    };
  }

  const playsTotal = Math.max(1, economy.playsPerNugget || 1);
  const bundleId = crypto.randomUUID();
  meta.bundle_id = bundleId;
  meta.bundle_plays_total = playsTotal;
  meta.bundle_play_index = 1;
  meta.bundle_purchase = true;
  return {
    ok: true,
    delta: -1,
    meta,
    economy,
    bundle: { bundle_id: bundleId, plays_total: playsTotal, plays_used: 0, plays_remaining: playsTotal },
  };
}

export async function saveGameEconomySettings(db, payload, updatedBy) {
  const saved = { game_default_play_mode: null, game_overrides: {} };
  if (!payload || typeof payload !== 'object') {
    return { ok: false, error: 'missing_payload' };
  }
  if (payload.game_default_play_mode != null) {
    const mode = normalizePlayMode(payload.game_default_play_mode, false);
    if (!mode || mode === 'global') {
      return { ok: false, error: 'invalid_default_play_mode', setting: 'game_default_play_mode' };
    }
    await writeSettingRaw(db, GAME_DEFAULT_PLAY_MODE_KEY, mode, updatedBy);
    saved.game_default_play_mode = mode;
  }
  const overrides = payload.game_overrides;
  if (overrides && typeof overrides === 'object') {
    const ids = Object.keys(overrides);
    for (let i = 0; i < ids.length; i++) {
      const gameId = ids[i];
      const game = resolveRegisteredLeaderboardGame(gameId);
      if (!game) continue;
      const mode = normalizePlayMode(overrides[gameId], true);
      if (!mode) {
        return { ok: false, error: 'invalid_game_play_mode', setting: gameId };
      }
      if (mode === 'global') {
        await db.prepare('DELETE FROM lantern_settings WHERE key = ?').bind(gamePlayModeSettingKey(game.id)).run();
        saved.game_overrides[game.id] = 'global';
      } else {
        await writeSettingRaw(db, gamePlayModeSettingKey(game.id), mode, updatedBy);
        saved.game_overrides[game.id] = mode;
      }
    }
  }
  return { ok: true, saved };
}
