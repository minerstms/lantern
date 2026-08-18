/**
 * Prompt #229 — server-authoritative Nugget Economy settings.
 *
 * Reuses lantern_settings (migration 055). No new table. Missing/invalid keys
 * fall back to documented defaults. Clients cannot choose transaction amounts.
 *
 * Bounds (current live scale is 0 / 1 for routine actions; cosmetics 2–18 are
 * catalog prices, not this matrix; staff starter 1–100 stays a separate admin tool):
 *   earn-only: 0 … +5
 *   spend-only: −10 … 0
 *   mission teacher range: 0 … 5
 */
export const ECONOMY_SETTING_DEFS = {
  poll_response: {
    key: 'economy.poll_response',
    label: 'Poll response',
    group: 'participation',
    kind: 'poll_complete',
    default: 0,
    min: 0,
    max: 5,
    sign: 'earn',
    help: 'Ordinary poll participation. 0 = no Nugget transaction.',
  },
  reaction: {
    key: 'economy.reaction',
    label: 'Reaction',
    group: 'participation',
    kind: 'reaction',
    default: 0,
    min: 0,
    max: 5,
    sign: 'earn',
    help: 'Ordinary reaction. 0 = no Nugget transaction. Non-zero is stored for a future reaction ledger path.',
    dormant: true,
  },
  game_play: {
    key: 'economy.game_play',
    label: 'Game play',
    group: 'games',
    kind: 'game_play',
    default: -1,
    min: -10,
    max: 0,
    sign: 'spend',
    help: 'Ordinary paid game start. 0 = free play. Negative = spend that many Nuggets.',
  },
  game_win: {
    key: 'economy.game_win',
    label: 'Game win',
    group: 'games',
    kind: 'game_win',
    default: 1,
    min: 0,
    max: 5,
    sign: 'earn',
    help: 'Verified win credit for a started run. 0 = no win Nugget.',
  },
  content_creation: {
    key: 'economy.content_creation',
    label: 'Daily first publish',
    group: 'creation',
    kind: 'content_creation',
    default: 1,
    min: 0,
    max: 5,
    sign: 'earn',
    help: 'Student first News, Shout-Out, or Poll publish that Denver school day.',
  },
  avatar_upload: {
    key: 'economy.avatar_upload',
    label: 'Avatar upload',
    group: 'creation',
    kind: 'avatar_upload',
    default: -1,
    min: -10,
    max: 0,
    sign: 'spend',
    help: 'Student avatar upload cost. 0 = free. Admin assign stays 0 Nuggets.',
  },
  hidden_nugget: {
    key: 'economy.hidden_nugget',
    label: 'Hidden Nugget',
    group: 'discovery',
    kind: 'hidden_nugget',
    default: 1,
    min: 0,
    max: 5,
    sign: 'earn',
    help: 'Daily Explore Hidden Nugget treasure-hunt reward. 0 = discovery still records, no TMS credit.',
    dormant: false,
  },
  mission_default: {
    key: 'economy.mission_default',
    label: 'Default Mission Reward',
    group: 'missions',
    kind: 'lantern_mission_reward',
    default: 1,
    min: 0,
    max: 5,
    sign: 'earn',
    help: 'Pre-filled reward on a new teacher mission. Existing missions keep their saved reward.',
  },
  mission_min: {
    key: 'economy.mission_min',
    label: 'Minimum Teacher Mission Reward',
    group: 'missions',
    kind: null,
    default: 0,
    min: 0,
    max: 5,
    sign: 'earn',
    help: 'Teachers cannot save a mission reward below this.',
  },
  mission_max: {
    key: 'economy.mission_max',
    label: 'Maximum Teacher Mission Reward',
    group: 'missions',
    kind: null,
    default: 5,
    min: 0,
    max: 5,
    sign: 'earn',
    help: 'Teachers cannot save a mission reward above this.',
  },
};

export const ECONOMY_ROW_ORDER = [
  'poll_response',
  'reaction',
  'game_play',
  'game_win',
  'content_creation',
  'avatar_upload',
  'hidden_nugget',
  'mission_default',
  'mission_min',
  'mission_max',
];

function finiteInt(raw) {
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

export function validateEconomyValue(id, raw) {
  const def = ECONOMY_SETTING_DEFS[id];
  if (!def) return { ok: false, error: 'unknown_setting' };
  const n = finiteInt(raw);
  if (n == null) return { ok: false, error: 'not_a_number', min: def.min, max: def.max };
  if (n < def.min || n > def.max) {
    return { ok: false, error: 'out_of_range', min: def.min, max: def.max };
  }
  if (def.sign === 'earn' && n < 0) return { ok: false, error: 'sign_reversal', min: def.min, max: def.max };
  if (def.sign === 'spend' && n > 0) return { ok: false, error: 'sign_reversal', min: def.min, max: def.max };
  return { ok: true, value: n };
}

export function fallbackEconomyValue(id) {
  const def = ECONOMY_SETTING_DEFS[id];
  return def ? def.default : 0;
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

export async function resolveEconomyAmount(db, id) {
  const def = ECONOMY_SETTING_DEFS[id];
  if (!def) return 0;
  const raw = await readSettingRaw(db, def.key);
  const validated = validateEconomyValue(id, raw);
  return validated.ok ? validated.value : def.default;
}

export async function getEconomySettings(db) {
  const values = {};
  const sources = {};
  for (let i = 0; i < ECONOMY_ROW_ORDER.length; i++) {
    const id = ECONOMY_ROW_ORDER[i];
    const def = ECONOMY_SETTING_DEFS[id];
    const raw = await readSettingRaw(db, def.key);
    const validated = validateEconomyValue(id, raw);
    if (validated.ok) {
      values[id] = validated.value;
      sources[id] = 'stored';
    } else {
      values[id] = def.default;
      sources[id] = raw == null || raw === '' ? 'fallback' : 'invalid_fallback';
    }
  }
  if (values.mission_min > values.mission_max) {
    values.mission_min = ECONOMY_SETTING_DEFS.mission_min.default;
    values.mission_max = ECONOMY_SETTING_DEFS.mission_max.default;
    sources.mission_min = 'invalid_fallback';
    sources.mission_max = 'invalid_fallback';
  }
  if (values.mission_default < values.mission_min || values.mission_default > values.mission_max) {
    values.mission_default = Math.min(values.mission_max, Math.max(values.mission_min, ECONOMY_SETTING_DEFS.mission_default.default));
    sources.mission_default = 'clamped_fallback';
  }
  return { values, sources };
}

export async function setEconomyValue(db, id, raw, updatedBy) {
  const validated = validateEconomyValue(id, raw);
  if (!validated.ok) return validated;
  const def = ECONOMY_SETTING_DEFS[id];
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO lantern_settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`
    )
    .bind(def.key, String(validated.value), now, updatedBy || null)
    .run();
  return { ok: true, value: validated.value, updated_at: now };
}

export function clampTeacherMissionReward(raw, settingsValues) {
  const vals = settingsValues || {};
  const min = Number.isFinite(Number(vals.mission_min)) ? Math.trunc(Number(vals.mission_min)) : 0;
  const max = Number.isFinite(Number(vals.mission_max)) ? Math.trunc(Number(vals.mission_max)) : 5;
  const fallback = Number.isFinite(Number(vals.mission_default)) ? Math.trunc(Number(vals.mission_default)) : 1;
  if (raw == null || raw === '') return fallback;
  const n = finiteInt(raw);
  if (n == null) return fallback;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

export async function resolveTeacherMissionReward(db, raw) {
  const { values } = await getEconomySettings(db);
  return clampTeacherMissionReward(raw, values);
}

export async function resolveStoredMissionPayout(db, storedReward) {
  const { values } = await getEconomySettings(db);
  const n = finiteInt(storedReward);
  if (n == null) return values.mission_default;
  if (n < 0) return 0;
  if (n > 5) return values.mission_max;
  return n;
}

/**
 * Event completions (trivia, check-in, first game, thank-you, fight song, …):
 * persisted mission.reward_amount → Default Mission Reward → documented fallback (1).
 * Never trusts a client-supplied amount. 0 is a real saved reward (no TMS credit).
 */
export async function resolveEventMissionPayout(db, missionId) {
  const mid = String(missionId || '').trim();
  if (db && mid) {
    try {
      const row = await db.prepare('SELECT reward_amount FROM lantern_missions WHERE id = ?').bind(mid).first();
      if (row && row.reward_amount != null && row.reward_amount !== '') {
        return resolveStoredMissionPayout(db, row.reward_amount);
      }
    } catch (_err) {
      /* missing table/row → configured default */
    }
  }
  return resolveEconomyAmount(db, 'mission_default');
}

export function economyPublicPayload(bundle) {
  const rows = ECONOMY_ROW_ORDER.map((id) => {
    const def = ECONOMY_SETTING_DEFS[id];
    return {
      id,
      key: def.key,
      label: def.label,
      group: def.group,
      kind: def.kind,
      value: bundle.values[id],
      source: bundle.sources[id],
      default: def.default,
      min: def.min,
      max: def.max,
      sign: def.sign,
      help: def.help,
      dormant: !!def.dormant,
    };
  });
  return {
    ok: true,
    values: bundle.values,
    sources: bundle.sources,
    rows,
    bounds: {
      earn_min: 0,
      earn_max: 5,
      spend_min: -10,
      spend_max: 0,
      mission_abs_min: 0,
      mission_abs_max: 5,
    },
  };
}

export async function handleNuggetEconomySettings(request, path, env, cors, deps) {
  const db = env.DB;
  if (!db) return deps.jsonResponse({ ok: false, error: 'DB not configured' }, 503, cors);

  if (request.method === 'GET' && path === '/api/settings/nugget-economy') {
    const bundle = await getEconomySettings(db);
    return deps.jsonResponse(economyPublicPayload(bundle), 200, cors);
  }

  if (request.method === 'PATCH' && path === '/api/settings/nugget-economy') {
    const gate = await deps.requireAdminPilotSession(request, env, cors);
    if (gate.response) return gate.response;
    let body;
    try {
      body = JSON.parse((await request.text()) || '{}');
    } catch (_err) {
      return deps.jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, cors);
    }
    const incoming = body && (body.values || body);
    if (!incoming || typeof incoming !== 'object') {
      return deps.jsonResponse({ ok: false, error: 'missing_values' }, 400, cors);
    }
    const updatedBy = deps.adminAuditLabel ? deps.adminAuditLabel(gate.account) : '';
    const saved = {};
    const ids = Object.keys(incoming);
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      if (!ECONOMY_SETTING_DEFS[id]) continue;
      const result = await setEconomyValue(db, id, incoming[id], updatedBy);
      if (!result.ok) {
        return deps.jsonResponse(
          { ok: false, error: result.error, setting: id, min: result.min, max: result.max },
          400,
          cors
        );
      }
      saved[id] = result.value;
    }
    const bundle = await getEconomySettings(db);
    return deps.jsonResponse(
      Object.assign(economyPublicPayload(bundle), { saved, updated_by: updatedBy }),
      200,
      cors
    );
  }

  return null;
}
