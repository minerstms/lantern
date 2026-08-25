/**
 * Prompt #257C — Writing & Submission Quality settings.
 * Reuses lantern_settings (migration 055). Single JSON blob key. No new table.
 */

export const WRITING_QUALITY_SETTING_KEY = 'writing_quality.settings';

export const WRITING_QUALITY_DEFAULTS = {
  enabled: true,
  block_paste: true,
  block_drag_drop: true,
  preserve_spellcheck: true,
  limit_phrase_suggestions: true,
  require_pre_submit_check: true,
  allow_submit_anyway: true,
  show_suggestion_count: true,
  categories: {
    spelling: true,
    capitalization: true,
    ending_punctuation: true,
    repeated_punctuation: true,
    repeated_spaces: true,
    duplicate_words: true,
    lowercase_i: true,
    excessive_caps: true,
    low_effort: true,
  },
  quality_floor: {
    enabled: true,
    repeated_char_threshold: 5,
    repeated_punctuation_threshold: 3,
    max_caps_ratio_percent: 40,
    min_text_length: 12,
  },
};

const BOOL_KEYS = [
  'enabled',
  'block_paste',
  'block_drag_drop',
  'preserve_spellcheck',
  'limit_phrase_suggestions',
  'require_pre_submit_check',
  'allow_submit_anyway',
  'show_suggestion_count',
];

const CATEGORY_KEYS = Object.keys(WRITING_QUALITY_DEFAULTS.categories);

const FLOOR_KEYS = Object.keys(WRITING_QUALITY_DEFAULTS.quality_floor);

function parseBool(raw, fallback) {
  if (raw == null || raw === '') return fallback;
  if (typeof raw === 'boolean') return raw;
  const s = String(raw).trim().toLowerCase();
  if (s === 'true' || s === '1' || s === 'on' || s === 'yes') return true;
  if (s === 'false' || s === '0' || s === 'off' || s === 'no') return false;
  return fallback;
}

function clampInt(raw, min, max, fallback) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export function mergeWritingQualitySettings(partial) {
  const base = JSON.parse(JSON.stringify(WRITING_QUALITY_DEFAULTS));
  if (!partial || typeof partial !== 'object') return base;

  BOOL_KEYS.forEach(function (k) {
    if (partial[k] != null) base[k] = parseBool(partial[k], base[k]);
  });

  if (partial.preserve_single_word_suggestions != null && partial.limit_phrase_suggestions == null) {
    base.limit_phrase_suggestions = parseBool(partial.preserve_single_word_suggestions, base.limit_phrase_suggestions);
  }

  if (partial.categories && typeof partial.categories === 'object') {
    CATEGORY_KEYS.forEach(function (k) {
      if (partial.categories[k] != null) {
        base.categories[k] = parseBool(partial.categories[k], base.categories[k]);
      }
    });
  }

  if (partial.quality_floor && typeof partial.quality_floor === 'object') {
    const qf = partial.quality_floor;
    if (qf.enabled != null) base.quality_floor.enabled = parseBool(qf.enabled, base.quality_floor.enabled);
    if (qf.repeated_char_threshold != null) {
      base.quality_floor.repeated_char_threshold = clampInt(qf.repeated_char_threshold, 3, 20, base.quality_floor.repeated_char_threshold);
    }
    if (qf.repeated_punctuation_threshold != null) {
      base.quality_floor.repeated_punctuation_threshold = clampInt(qf.repeated_punctuation_threshold, 2, 10, base.quality_floor.repeated_punctuation_threshold);
    }
    if (qf.max_caps_ratio_percent != null) {
      base.quality_floor.max_caps_ratio_percent = clampInt(qf.max_caps_ratio_percent, 10, 90, base.quality_floor.max_caps_ratio_percent);
    }
    if (qf.min_text_length != null) {
      base.quality_floor.min_text_length = clampInt(qf.min_text_length, 0, 500, base.quality_floor.min_text_length);
    }
  }

  return base;
}

export function validateWritingQualityPatch(body) {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'missing_body' };
  }
  const settings = body.settings;
  if (!settings || typeof settings !== 'object') {
    return { ok: false, error: 'missing_settings' };
  }
  return { ok: true, value: mergeWritingQualitySettings(settings) };
}

export async function getWritingQualitySettings(db) {
  try {
    const row = await db
      .prepare('SELECT value, updated_at, updated_by FROM lantern_settings WHERE key = ?')
      .bind(WRITING_QUALITY_SETTING_KEY)
      .first();
    if (!row || row.value == null || row.value === '') {
      return {
        settings: mergeWritingQualitySettings(null),
        source: 'default',
        updated_at: null,
        updated_by: null,
      };
    }
    let parsed;
    try {
      parsed = JSON.parse(String(row.value));
    } catch (_err) {
      return {
        settings: mergeWritingQualitySettings(null),
        source: 'default',
        updated_at: row.updated_at || null,
        updated_by: row.updated_by || null,
      };
    }
    return {
      settings: mergeWritingQualitySettings(parsed),
      source: 'stored',
      updated_at: row.updated_at || null,
      updated_by: row.updated_by || null,
    };
  } catch (_err) {
    return {
      settings: mergeWritingQualitySettings(null),
      source: 'default',
      updated_at: null,
      updated_by: null,
    };
  }
}

export async function setWritingQualitySettings(db, settings, updatedBy) {
  const merged = mergeWritingQualitySettings(settings);
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO lantern_settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`
    )
    .bind(WRITING_QUALITY_SETTING_KEY, JSON.stringify(merged), now, updatedBy || null)
    .run();
  return { settings: merged, updated_at: now };
}

export function writingQualityPublicPayload(bundle) {
  return {
    ok: true,
    settings: bundle.settings,
    defaults: WRITING_QUALITY_DEFAULTS,
    source: bundle.source,
    updated_at: bundle.updated_at,
    updated_by: bundle.updated_by,
  };
}

export async function handleWritingQualitySettings(request, path, env, cors, deps) {
  const db = env.DB;
  if (!db) return deps.jsonResponse({ ok: false, error: 'DB not configured' }, 503, cors);

  if (request.method === 'GET' && path === '/api/settings/writing-quality') {
    const bundle = await getWritingQualitySettings(db);
    return deps.jsonResponse(writingQualityPublicPayload(bundle), 200, cors);
  }

  if (request.method === 'PATCH' && path === '/api/settings/writing-quality') {
    const gate = await deps.requireAdminPilotSession(request, env, cors);
    if (gate.response) return gate.response;
    let body;
    try {
      body = JSON.parse((await request.text()) || '{}');
    } catch (_err) {
      return deps.jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, cors);
    }
    const validated = validateWritingQualityPatch(body);
    if (!validated.ok) {
      return deps.jsonResponse({ ok: false, error: validated.error }, 400, cors);
    }
    const updatedBy = deps.adminAuditLabel ? deps.adminAuditLabel(gate.account) : '';
    const saved = await setWritingQualitySettings(db, validated.value, updatedBy);
    const bundle = await getWritingQualitySettings(db);
    return deps.jsonResponse(
      Object.assign(writingQualityPublicPayload(bundle), { saved: saved.settings, updated_by: updatedBy }),
      200,
      cors
    );
  }

  return null;
}
