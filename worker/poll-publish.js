/**
 * Prompt #211 — shared Poll finalize/publish (teacher immediate + student approval).
 * Idempotent: one contribution → at most one lantern_polls row (mission_submission_id = contrib:<id>).
 * Always sets created_by_character (NOT NULL on production schema) + character_name + approved_at.
 */
import { copyContentPeople } from './content-people.js';

const ALLOWED_FALLBACK = ['poll', 'news', 'creation', 'generic', 'shoutout', 'explain'];
const DEF_FALLBACK = {
  poll: 'default/default_poll.png',
  news: 'default/default_news.png',
  creation: 'default/default_creation.png',
  generic: 'default/default_generic_stem.png',
  shoutout: 'default/default_shoutout.png',
  explain: 'default/default_explain.png',
};

export const POLL_PUBLISHER_ROLES = ['teacher', 'staff', 'admin'];

export function isPollPublisherRole(role) {
  return POLL_PUBLISHER_ROLES.includes(String(role || '').trim().toLowerCase());
}

export function parsePollChoices(choicesJsonOrArray) {
  let ch = [];
  if (Array.isArray(choicesJsonOrArray)) {
    ch = choicesJsonOrArray;
  } else {
    try {
      ch = JSON.parse(choicesJsonOrArray || '[]');
    } catch (_) {
      ch = [];
    }
  }
  return (ch || [])
    .map((c) => String(c).trim().slice(0, 200))
    .filter(Boolean)
    .slice(0, 5);
}

export function resolvePollImageUrl(pc, origin) {
  let pollImageUrl = (pc && pc.image_url && String(pc.image_url).trim().slice(0, 500)) || null;
  if (pollImageUrl && pollImageUrl.charAt(0) === '/' && origin) {
    pollImageUrl = String(origin).replace(/\/$/, '') + pollImageUrl;
  }
  if (!pollImageUrl && pc && pc.fallback_key) {
    const fk = ALLOWED_FALLBACK.includes(String(pc.fallback_key)) ? String(pc.fallback_key) : 'poll';
    const base = origin || '';
    pollImageUrl = base + '/api/media/image?key=' + encodeURIComponent(DEF_FALLBACK[fk] || DEF_FALLBACK.poll);
  }
  return pollImageUrl;
}

/**
 * Publish a poll contribution into lantern_polls (approved/visible).
 * @returns {{ ok: boolean, pollId?: string, created?: boolean, error?: string }}
 */
/** Live poll id → owning poll_contribution id (mission_submission_id = contrib:<id>). */
export async function resolvePollContributionIdFromLivePoll(db, pollId) {
  const id = String(pollId || '').trim();
  if (!id || !db) return null;
  const row = await db.prepare('SELECT mission_submission_id FROM lantern_polls WHERE id = ?').bind(id).first();
  if (!row || !row.mission_submission_id) return null;
  const m = String(row.mission_submission_id).match(/^contrib:(.+)$/i);
  return m && m[1] ? String(m[1]).trim() : null;
}

export async function finalizePollContributionPublish(db, origin, pc, opts) {
  opts = opts || {};
  if (!db || !pc || !pc.id) return { ok: false, error: 'missing_contribution' };
  const question = String(pc.question || '').trim().slice(0, 500);
  const choices = parsePollChoices(pc.choices_json != null ? pc.choices_json : pc.choices);
  if (!question) return { ok: false, error: 'question_required' };
  if (choices.length < 2) return { ok: false, error: 'choices_required' };

  const characterName = String(pc.character_name || '').trim();
  if (!characterName) return { ok: false, error: 'character_name_required' };

  const subId = 'contrib:' + pc.id;
  const existing = await db
    .prepare('SELECT id, approved_at, hidden_at FROM lantern_polls WHERE mission_submission_id = ? LIMIT 1')
    .bind(subId)
    .first();

  const now = opts.now || new Date().toISOString();
  const reviewedBy = opts.reviewedBy != null ? String(opts.reviewedBy).trim() : 'system';
  const pollImageUrl = resolvePollImageUrl(pc, origin);
  const choicesJson = JSON.stringify(choices);

  let pollId = existing && existing.id ? String(existing.id) : null;
  let created = false;

  if (existing) {
    // Ensure Explore gate fields are set (approved_at) without unhiding intentional archives
    // unless caller opts into clearHidden.
    if (!existing.approved_at) {
      await db
        .prepare(`UPDATE lantern_polls SET approved_at = ?, character_name = ?, created_by_character = COALESCE(NULLIF(created_by_character, ''), ?) WHERE id = ?`)
        .bind(now, characterName, characterName, existing.id)
        .run();
    }
    if (opts.clearHidden && existing.hidden_at) {
      await db
        .prepare(`UPDATE lantern_polls SET hidden_at = NULL, hidden_by = NULL WHERE id = ?`)
        .bind(existing.id)
        .run();
    }
  } else {
    pollId = 'poll_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
    try {
      await db
        .prepare(
          `INSERT INTO lantern_polls
            (id, mission_submission_id, question, choices_json, image_url, created_by_character, character_name, created_at, approved_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(pollId, subId, question, choicesJson, pollImageUrl, characterName, characterName, now, now)
        .run();
      created = true;
    } catch (e1) {
      try {
        await db
          .prepare(
            `INSERT INTO lantern_polls
              (id, mission_submission_id, question, choices_json, created_by_character, character_name, created_at, approved_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(pollId, subId, question, choicesJson, characterName, characterName, now, now)
          .run();
        created = true;
      } catch (e2) {
        return {
          ok: false,
          error: 'poll_insert_failed',
          detail: String((e2 && e2.message) || (e1 && e1.message) || e2 || e1 || ''),
        };
      }
    }
  }

  await db
    .prepare(
      `UPDATE lantern_poll_contributions
       SET status = 'approved', reviewed_at = ?, reviewed_by = ?, decision_note = NULL
       WHERE id = ?`
    )
    .bind(now, reviewedBy || null, pc.id)
    .run();

  try {
    await copyContentPeople(db, 'poll_contribution', pc.id, 'poll', pollId, reviewedBy || characterName);
  } catch (_) {}

  return { ok: true, pollId, created, character_name: characterName };
}
