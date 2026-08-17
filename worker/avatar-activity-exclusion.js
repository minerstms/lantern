/**
 * Prompt #280 — persistent per-avatar Avatar Activity include/exclude.
 * Keyed by immutable submission id (and image_key for profile-path matches).
 * Default is INCLUDED (no row). Does not change moderation, profile, or R2.
 */

function trimStr(v) {
  return v == null ? '' : String(v).trim();
}

function lower(v) {
  return trimStr(v).toLowerCase();
}

export function emptyAvatarActivityExclusionSets() {
  return { submissionIds: new Set(), imageKeys: new Set() };
}

export function isAvatarActivityExcluded(row, exclusionSets) {
  const sets = exclusionSets || emptyAvatarActivityExclusionSets();
  const sid = lower(row && (row.submission_id || row.id));
  const key = lower(row && (row.image_key || row.avatar_key || row.current_avatar_key));
  if (sid && sets.submissionIds && sets.submissionIds.has(sid)) return true;
  if (key && sets.imageKeys && sets.imageKeys.has(key)) return true;
  return false;
}

export async function loadAvatarActivityExclusionSets(db) {
  const out = emptyAvatarActivityExclusionSets();
  if (!db) return out;
  try {
    const res = await db
      .prepare(
        `SELECT submission_id, image_key FROM lantern_avatar_activity_exclusions
         WHERE excluded = 1`
      )
      .all();
    (res && res.results ? res.results : []).forEach((row) => {
      const sid = lower(row && row.submission_id);
      const key = lower(row && row.image_key);
      if (sid) out.submissionIds.add(sid);
      if (key) out.imageKeys.add(key);
    });
  } catch (_) {
    /* Table not migrated yet — fail open to the default (all included). */
  }
  return out;
}

export async function setAvatarActivityExclusion(db, opts) {
  const submissionId = trimStr(opts && opts.submission_id);
  const imageKey = trimStr(opts && opts.image_key);
  const excluded = !!(opts && opts.excluded);
  const updatedBy = trimStr(opts && opts.updated_by) || 'admin';
  const now = trimStr(opts && opts.updated_at) || new Date().toISOString();
  if (!db || !submissionId) return { ok: false, error: 'submission_id_required' };
  if (excluded) {
    if (!imageKey) return { ok: false, error: 'image_key_required' };
    await db
      .prepare(
        `INSERT OR REPLACE INTO lantern_avatar_activity_exclusions (submission_id, image_key, excluded, updated_at, updated_by)
         VALUES (?, ?, 1, ?, ?)`
      )
      .bind(submissionId, imageKey, now, updatedBy)
      .run();
    return { ok: true, submission_id: submissionId, image_key: imageKey, activity_included: false };
  }
  await db.prepare('DELETE FROM lantern_avatar_activity_exclusions WHERE submission_id = ?').bind(submissionId).run();
  return { ok: true, submission_id: submissionId, image_key: imageKey, activity_included: true };
}
