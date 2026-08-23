/**
 * Prompt #257C / #257C1 — Lantern Activities admin (global missions + games registry).
 */
import { WAVE2_MISSION_IDS } from './mission-event-completions.js';
import { EDUCATIONAL_TRIVIA_MISSIONS, ensureEducationalTriviaMissions } from './educational-trivia-missions.js';
import { FIGHT_SONG_MISSION_ID, ensureFightSongMission } from './fight-song-challenge.js';
import {
  suggestedMissionReward,
  clampMissionRewardAmount,
  validateOrdinaryMissionMinCharacters,
  formatMissionStudentPreview,
  MISSION_MIN_PRESETS,
} from './mission-reward-bands.js';
import {
  isGlobalStudentFacingMission,
  isPublishedGlobalMission,
  classifyMissionEvidenceKind,
  missionProvenance,
  EVIDENCE_SUBMISSION,
  EVIDENCE_VERIFIED_ACTIVITY,
  GLOBAL_MISSION_ADMIN_WHERE,
} from './global-mission-eligibility.js';
import { missionRequiresImage, persistAllowsImageValue } from './missions-auth.js';
import { buildGameEconomyPublicPayload, formatPlayEconomyCopy } from './game-play-economy.js';

export const PLACEMENT_MISSION = 'mission';
export const PLACEMENT_GAME = 'game';

/** Known global missions — capability/placement metadata (not eligibility; eligibility is audience-based). */
export const GLOBAL_MISSION_REGISTRY = [
  { id: 'perm_create_something', kind: 'submission', placement: PLACEMENT_MISSION, placementLocked: true },
  { id: 'perm_explain_something', kind: 'submission', placement: PLACEMENT_MISSION, placementLocked: true },
  { id: 'perm_report_good_news', kind: 'submission', placement: PLACEMENT_MISSION, placementLocked: true },
  { id: 'perm_show_something_cool', kind: 'submission', placement: PLACEMENT_MISSION, placementLocked: true },
  { id: 'perm_teach_us_something', kind: 'submission', placement: PLACEMENT_MISSION, placementLocked: true },
  { id: 'perm_shoutout_someone', kind: 'submission', placement: PLACEMENT_MISSION, placementLocked: true },
  { id: 'perm_create_a_poll', kind: 'event', placement: PLACEMENT_MISSION, placementLocked: true },
  { id: 'perm_daily_checkin', kind: 'event', placement: PLACEMENT_MISSION, placementLocked: true },
  { id: 'perm_first_game', kind: 'event', placement: PLACEMENT_MISSION, placementLocked: true },
  { id: 'perm_grade_reflection', kind: 'submission', placement: PLACEMENT_MISSION, placementLocked: true },
  { id: 'perm_thank_you', kind: 'event', placement: PLACEMENT_MISSION, placementLocked: true },
  { id: 'perm_fight_song', kind: 'event', placement: PLACEMENT_MISSION, placementLocked: true },
  { id: 'perm_handbook_trivia', kind: 'trivia', placement: PLACEMENT_MISSION, placementLocked: true, dualCapable: true, linkedGameId: 'handbook-trivia' },
  { id: 'perm_local_history_trivia', kind: 'trivia', placement: PLACEMENT_MISSION, placementLocked: true, dualCapable: true, linkedGameId: 'local-history-trivia' },
  { id: 'perm_srp_safety', kind: 'trivia', placement: PLACEMENT_MISSION, placementLocked: true, dualCapable: true, linkedGameId: 'srp-safety-trivia' },
  { id: 'perm_seven_habits', kind: 'trivia', placement: PLACEMENT_MISSION, placementLocked: true, dualCapable: true, linkedGameId: 'seven-habits-trivia' },
  { id: 'tmission_1773676581540_qzl0kx', kind: 'submission', placement: PLACEMENT_MISSION, placementLocked: true },
  { id: 'tmission_1773763739628_hhzqrr', kind: 'submission', placement: PLACEMENT_MISSION, placementLocked: true },
];

const REGISTRY_BY_ID = Object.create(null);
GLOBAL_MISSION_REGISTRY.forEach((r) => {
  REGISTRY_BY_ID[r.id] = r;
});

export function registryForMissionId(id) {
  return REGISTRY_BY_ID[String(id || '').trim()] || null;
}

export {
  isGlobalStudentFacingMission,
  isPublishedGlobalMission,
  classifyMissionEvidenceKind,
  missionProvenance,
  EVIDENCE_SUBMISSION,
  EVIDENCE_VERIFIED_ACTIVITY,
};

function placementSettingKey(activityId) {
  return `activity.placement.${String(activityId || '').trim()}`;
}

async function readPlacement(db, activityId, fallback) {
  if (!db || !activityId) return fallback;
  try {
    const row = await db.prepare('SELECT value FROM lantern_settings WHERE key = ?').bind(placementSettingKey(activityId)).first();
    const v = row && row.value != null ? String(row.value).trim().toLowerCase() : '';
    if (v === PLACEMENT_GAME || v === PLACEMENT_MISSION) return v;
  } catch (_) {}
  return fallback;
}

async function writePlacement(db, activityId, placement, updatedBy) {
  const p = String(placement || '').trim().toLowerCase();
  if (p !== PLACEMENT_GAME && p !== PLACEMENT_MISSION) return { ok: false, error: 'invalid_placement' };
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO lantern_settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`
    )
    .bind(placementSettingKey(activityId), p, now, updatedBy || null)
    .run();
  return { ok: true, placement: p };
}

export async function ensureGlobalMissionRows(db) {
  if (!db) return;
  try {
    await ensureEducationalTriviaMissions(db);
  } catch (_) {}
  try {
    await ensureFightSongMission(db);
  } catch (_) {}
}

function missionRowToActivity(row, origin, placementOverride) {
  const reg = registryForMissionId(row.id);
  const evidenceKind = classifyMissionEvidenceKind(row, reg ? reg.kind : null);
  const kind = reg ? reg.kind : evidenceKind === EVIDENCE_VERIFIED_ACTIVITY ? 'event' : 'submission';
  const requireImage = missionRequiresImage(row);
  const minChars = row.min_characters != null ? Math.max(0, Math.floor(Number(row.min_characters)) || 0) : 0;
  const reward = clampMissionRewardAmount(row.reward_amount, { allowLegacyZero: true });
  const defaultPlacement = reg ? reg.placement : PLACEMENT_MISSION;
  const placement = placementOverride || defaultPlacement;
  const provenance = missionProvenance(row);
  return {
    type: 'mission',
    id: row.id,
    title: row.title || '',
    description: row.description || '',
    kind,
    evidence_kind: evidenceKind,
    global: isGlobalStudentFacingMission(row),
    published: isPublishedGlobalMission(row),
    provenance,
    active: row.active !== 0,
    archived: !!row.archived,
    status: row.archived ? 'inactive' : row.active !== 0 ? 'active' : 'inactive',
    placement,
    placement_locked: !!(reg && reg.placementLocked && !reg.dualCapable),
    dual_capable: !!(reg && reg.dualCapable),
    linked_game_id: reg && reg.linkedGameId ? reg.linkedGameId : null,
    min_characters: minChars,
    require_image: requireImage,
    reward_amount: reward,
    suggested_reward: suggestedMissionReward(evidenceKind === EVIDENCE_SUBMISSION ? minChars || 100 : minChars),
    student_preview: formatMissionStudentPreview(minChars, reward, requireImage),
    card_image_url: row.card_image_r2_key
      ? String(origin || '').replace(/\/$/, '') + '/api/news/image?key=' + encodeURIComponent(row.card_image_r2_key)
      : null,
    submission_type: row.submission_type || 'text',
    min_presets: MISSION_MIN_PRESETS,
    audience: row.audience || 'school_mission',
    teacher_id: row.teacher_id || '',
    teacher_name: row.teacher_name || '',
  };
}

export async function buildActivitiesAdminPayload(db, origin) {
  await ensureGlobalMissionRows(db);
  const rows = await db
    .prepare(
      `SELECT id, teacher_id, teacher_name, title, description, reward_amount, submission_type, audience, participant_scope,
              target_character_names, featured, active, archived, site_eligible, allows_text, allows_image, allows_video,
              allows_link, min_characters, card_image_r2_key, created_at
       FROM lantern_missions
       WHERE ${GLOBAL_MISSION_ADMIN_WHERE}
       ORDER BY title COLLATE NOCASE ASC`
    )
    .all();
  const missions = [];
  const list = (rows && rows.results) || [];
  for (let i = 0; i < list.length; i++) {
    const row = list[i];
    if (!isGlobalStudentFacingMission(row)) continue;
    const reg = registryForMissionId(row.id);
    const defaultPlacement = reg ? reg.placement : PLACEMENT_MISSION;
    const placement = await readPlacement(db, row.id, defaultPlacement);
    missions.push(missionRowToActivity(row, origin, placement));
  }
  const gameEconomy = await buildGameEconomyPublicPayload(db);
  const games = (gameEconomy.games || []).map(function (g) {
    return Object.assign({}, g, {
      type: 'game',
      title: g.name,
      placement: PLACEMENT_GAME,
      placement_locked: g.id !== 'avatar-match',
      dual_capable: g.id === 'avatar-match',
      linked_mission_id: g.id === 'avatar-match' ? null : null,
      status: 'active',
      copy: formatPlayEconomyCopy(g),
    });
  });
  return {
    ok: true,
    missions,
    games,
    filters: ['all', 'missions', 'games', 'inactive'],
    reward_range: { min: 1, max: 10 },
    min_presets: MISSION_MIN_PRESETS,
    wave2_ids: WAVE2_MISSION_IDS,
    trivia_mission_ids: Object.keys(EDUCATIONAL_TRIVIA_MISSIONS),
    fight_song_id: FIGHT_SONG_MISSION_ID,
    avatar_match_stays_in_games: true,
    eligibility: {
      rule: 'audience=school_mission (includes perm_* and tmission_*); excludes selected_students and my_students',
      fields: ['audience', 'active', 'archived'],
    },
  };
}

export async function patchGlobalMissionActivity(db, missionId, body, updatedBy, origin) {
  const id = String(missionId || '').trim();
  const row = await db
    .prepare(
      'SELECT id, teacher_id, teacher_name, title, description, reward_amount, submission_type, audience, participant_scope, target_character_names, featured, active, archived, site_eligible, allows_text, allows_image, allows_video, allows_link, min_characters, card_image_r2_key, created_at FROM lantern_missions WHERE id = ?'
    )
    .bind(id)
    .first();
  if (!row) return { ok: false, error: 'not_found' };
  if (!isGlobalStudentFacingMission(row)) return { ok: false, error: 'not_global_mission' };
  const reg = registryForMissionId(id);
  const evidenceKind = classifyMissionEvidenceKind(row, reg ? reg.kind : null);
  const updates = [];
  const bindings = [];

  if (body.active !== undefined) {
    updates.push('active = ?');
    bindings.push(body.active ? 1 : 0);
  }
  if (body.archived !== undefined) {
    updates.push('archived = ?');
    bindings.push(body.archived ? 1 : 0);
    if (body.archived && body.active === undefined) {
      updates.push('active = ?');
      bindings.push(0);
    }
  }
  if (body.min_characters !== undefined) {
    const validated = validateOrdinaryMissionMinCharacters(body.min_characters, evidenceKind);
    if (!validated.ok) return validated;
    updates.push('min_characters = ?');
    bindings.push(validated.value);
  }
  if (body.require_image !== undefined || body.allows_image !== undefined) {
    updates.push('allows_image = ?');
    bindings.push(persistAllowsImageValue(body, row.allows_image));
  }
  if (body.reward_amount !== undefined) {
    const reward = clampMissionRewardAmount(body.reward_amount);
    updates.push('reward_amount = ?');
    bindings.push(reward);
  }
  if (body.placement !== undefined && reg && reg.dualCapable) {
    const saved = await writePlacement(db, id, body.placement, updatedBy);
    if (!saved.ok) return saved;
  }
  if (updates.length) {
    bindings.push(id);
    await db.prepare('UPDATE lantern_missions SET ' + updates.join(', ') + ' WHERE id = ?').bind(...bindings).run();
  }
  const fresh = await db
    .prepare(
      'SELECT id, teacher_id, teacher_name, title, description, reward_amount, submission_type, audience, participant_scope, target_character_names, featured, active, archived, site_eligible, allows_text, allows_image, allows_video, allows_link, min_characters, card_image_r2_key, created_at FROM lantern_missions WHERE id = ?'
    )
    .bind(id)
    .first();
  const placement = await readPlacement(db, id, reg ? reg.placement : PLACEMENT_MISSION);
  return { ok: true, activity: missionRowToActivity(fresh, origin, placement) };
}

export async function handleActivityAdminRoutes(request, path, env, cors, deps) {
  const db = env.DB;
  if (!db) return deps.jsonResponse({ ok: false, error: 'DB not configured' }, 503, cors);
  const origin = deps.requestOrigin ? deps.requestOrigin(request) : '';

  if (request.method === 'GET' && path === '/api/admin/activities') {
    const gate = await deps.requireAdminPilotSession(request, env, cors);
    if (gate.response) return gate.response;
    const payload = await buildActivitiesAdminPayload(db, origin);
    return deps.jsonResponse(payload, 200, cors);
  }

  const patchMatch = path.match(/^\/api\/admin\/activities\/mission\/([^/]+)$/);
  if (request.method === 'PATCH' && patchMatch) {
    const gate = await deps.requireAdminPilotSession(request, env, cors);
    if (gate.response) return gate.response;
    let body;
    try {
      body = JSON.parse((await request.text()) || '{}');
    } catch (_) {
      return deps.jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, cors);
    }
    const updatedBy = deps.adminAuditLabel ? deps.adminAuditLabel(gate.account) : '';
    const result = await patchGlobalMissionActivity(db, patchMatch[1], body, updatedBy, origin);
    if (!result.ok) {
      const status = result.error === 'not_found' ? 404 : 400;
      return deps.jsonResponse(result, status, cors);
    }
    return deps.jsonResponse(result, 200, cors);
  }

  return null;
}
