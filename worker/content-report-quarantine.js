/**
 * Prompt #117 — Report → immediate recoverable quarantine (not delete).
 *
 * Reuses existing hidden_at / hidden_by on news, polls, mission submissions, feed items.
 * First accepted report hides the item from student-facing feed queries; source rows remain.
 */
export const REPORT_QUARANTINE_PREFIX = 'report:';

export const REPORTABLE_ITEM_TYPES = Object.freeze([
  'news',
  'poll',
  'mission_submission',
  'mission',
  'feed_item',
  'feed',
  'shoutout',
]);

/**
 * Normalize client/UI report types to canonical storage + hide target.
 * @returns {{ canonical: string, hideKind: 'news'|'poll'|'mission'|'feed' } | null}
 */
export function normalizeReportItemType(raw) {
  const t = String(raw || '')
    .trim()
    .toLowerCase();
  if (t === 'news' || t === 'shoutout' || t === 'shout-out' || t === 'shout_out') {
    return { canonical: 'news', hideKind: 'news' };
  }
  if (t === 'poll' || t === 'polls') {
    return { canonical: 'poll', hideKind: 'poll' };
  }
  if (t === 'mission_submission' || t === 'mission' || t === 'missions') {
    return { canonical: 'mission_submission', hideKind: 'mission' };
  }
  if (t === 'feed_item' || t === 'feed' || t === 'creation' || t === 'article' || t === 'post') {
    return { canonical: 'feed_item', hideKind: 'feed' };
  }
  return null;
}

/**
 * Explore feed synthetic ids use prefixes (poll:…, mission:…, news:…).
 * Strip them so quarantine hits the real D1 primary key.
 */
export function resolveReportTargetIds(itemType, itemId) {
  const rawId = String(itemId || '').trim();
  const m = rawId.match(/^(news|poll|mission|feed):(.+)$/i);
  let typeHint = String(itemType || '').trim();
  let id = rawId;
  if (m) {
    const prefix = m[1].toLowerCase();
    id = String(m[2] || '').trim();
    if (!typeHint) {
      if (prefix === 'poll') typeHint = 'poll';
      else if (prefix === 'mission') typeHint = 'mission_submission';
      else if (prefix === 'news') typeHint = 'news';
      else if (prefix === 'feed') typeHint = 'feed_item';
    } else if (prefix === 'poll') typeHint = 'poll';
    else if (prefix === 'mission') typeHint = 'mission_submission';
    else if (prefix === 'news') typeHint = 'news';
  }
  const norm = normalizeReportItemType(typeHint);
  if (!norm || !id) return null;
  return { ...norm, itemId: id };
}

export function reportQuarantineAuditLabel(account) {
  const u =
    (account && account.username != null && String(account.username).trim()) ||
    (account && account.display_name != null && String(account.display_name).trim()) ||
    'user';
  return REPORT_QUARANTINE_PREFIX + u;
}

export function isReportQuarantineLabel(hiddenBy) {
  return String(hiddenBy || '')
    .trim()
    .toLowerCase()
    .startsWith(REPORT_QUARANTINE_PREFIX);
}

export function reportStatusLabel(hiddenBy) {
  if (isReportQuarantineLabel(hiddenBy)) return 'REPORTED — HIDDEN PENDING REVIEW';
  return '';
}

function isAlreadyHidden(row) {
  return !!(row && row.hidden_at != null && String(row.hidden_at).trim() !== '');
}

/**
 * Soft-hide target by stable id. Idempotent when already hidden.
 * Does not delete votes, media, mission rewards, or source rows.
 */
export async function quarantineReportedContent(db, hideKind, itemId, auditLabel, nowIso) {
  const id = String(itemId || '').trim();
  const now = nowIso || new Date().toISOString();
  const by = String(auditLabel || REPORT_QUARANTINE_PREFIX + 'user').trim();
  if (!id) return { ok: false, error: 'missing_item_id', code: 400 };

  if (hideKind === 'news') {
    const row = await db
      .prepare('SELECT id, status, hidden_at, hidden_by FROM lantern_news_submissions WHERE id = ?')
      .bind(id)
      .first();
    if (!row) return { ok: false, error: 'not_found', code: 404 };
    if (isAlreadyHidden(row)) {
      return {
        ok: true,
        id,
        hide_kind: 'news',
        hidden_at: row.hidden_at,
        hidden_by: row.hidden_by,
        already_hidden: true,
        idempotent: true,
      };
    }
    await db
      .prepare('UPDATE lantern_news_submissions SET hidden_at = ?, hidden_by = ? WHERE id = ?')
      .bind(now, by, id)
      .run();
    return { ok: true, id, hide_kind: 'news', hidden_at: now, hidden_by: by, already_hidden: false };
  }

  if (hideKind === 'poll') {
    const row = await db
      .prepare('SELECT id, approved_at, hidden_at, hidden_by FROM lantern_polls WHERE id = ?')
      .bind(id)
      .first();
    if (!row) return { ok: false, error: 'not_found', code: 404 };
    if (isAlreadyHidden(row)) {
      return {
        ok: true,
        id,
        hide_kind: 'poll',
        hidden_at: row.hidden_at,
        hidden_by: row.hidden_by,
        already_hidden: true,
        idempotent: true,
      };
    }
    try {
      await db.prepare('UPDATE lantern_polls SET hidden_at = ?, hidden_by = ? WHERE id = ?').bind(now, by, id).run();
    } catch (e) {
      if (e && String(e.message || '').includes('no such column')) {
        return { ok: false, error: 'poll_hide_unavailable', code: 503 };
      }
      throw e;
    }
    return { ok: true, id, hide_kind: 'poll', hidden_at: now, hidden_by: by, already_hidden: false };
  }

  if (hideKind === 'mission') {
    const row = await db
      .prepare('SELECT id, status, hidden_at, hidden_by FROM lantern_mission_submissions WHERE id = ?')
      .bind(id)
      .first();
    if (!row) return { ok: false, error: 'not_found', code: 404 };
    if (isAlreadyHidden(row)) {
      return {
        ok: true,
        id,
        hide_kind: 'mission',
        hidden_at: row.hidden_at,
        hidden_by: row.hidden_by,
        already_hidden: true,
        idempotent: true,
      };
    }
    await db
      .prepare('UPDATE lantern_mission_submissions SET hidden_at = ?, hidden_by = ? WHERE id = ?')
      .bind(now, by, id)
      .run();
    return { ok: true, id, hide_kind: 'mission', hidden_at: now, hidden_by: by, already_hidden: false };
  }

  if (hideKind === 'feed') {
    const row = await db
      .prepare('SELECT id, status, hidden_at, hidden_by FROM lantern_feed_items WHERE id = ?')
      .bind(id)
      .first();
    if (!row) return { ok: false, error: 'not_found', code: 404 };
    if (isAlreadyHidden(row) || String(row.status || '').toLowerCase() === 'hidden') {
      return {
        ok: true,
        id,
        hide_kind: 'feed',
        hidden_at: row.hidden_at,
        hidden_by: row.hidden_by,
        already_hidden: true,
        idempotent: true,
      };
    }
    await db
      .prepare("UPDATE lantern_feed_items SET status = 'hidden', hidden_at = ?, hidden_by = ? WHERE id = ?")
      .bind(now, by, id)
      .run();
    return { ok: true, id, hide_kind: 'feed', hidden_at: now, hidden_by: by, already_hidden: false };
  }

  return { ok: false, error: 'unsupported_item_type', code: 400 };
}

/**
 * Restore a report-created quarantine only. Does not clear admin/author hides.
 * Feed items quarantined as status=hidden return to approved (same as existing /api/feed/restore).
 */
export async function restoreReportCreatedHide(db, hideKind, itemId) {
  const id = String(itemId || '').trim();
  if (!id) return { ok: false, error: 'missing_item_id', code: 400 };

  async function loadRow(sql) {
    return db.prepare(sql).bind(id).first();
  }

  let row = null;
  if (hideKind === 'news') {
    row = await loadRow('SELECT id, status, hidden_at, hidden_by FROM lantern_news_submissions WHERE id = ?');
  } else if (hideKind === 'poll') {
    row = await loadRow('SELECT id, hidden_at, hidden_by FROM lantern_polls WHERE id = ?');
  } else if (hideKind === 'mission') {
    row = await loadRow('SELECT id, status, hidden_at, hidden_by FROM lantern_mission_submissions WHERE id = ?');
  } else if (hideKind === 'feed') {
    row = await loadRow('SELECT id, status, hidden_at, hidden_by FROM lantern_feed_items WHERE id = ?');
  } else {
    return { ok: false, error: 'unsupported_item_type', code: 400 };
  }
  if (!row) return { ok: false, error: 'not_found', code: 404 };
  if (!isAlreadyHidden(row) && String(row.status || '').toLowerCase() !== 'hidden') {
    return { ok: true, id, already_visible: true, hide_kind: hideKind };
  }
  if (!isReportQuarantineLabel(row.hidden_by)) {
    return { ok: false, error: 'not_report_quarantine', code: 403 };
  }
  if (hideKind === 'feed') {
    await db
      .prepare("UPDATE lantern_feed_items SET status = 'approved', hidden_at = NULL, hidden_by = NULL WHERE id = ?")
      .bind(id)
      .run();
  } else if (hideKind === 'news') {
    await db.prepare('UPDATE lantern_news_submissions SET hidden_at = NULL, hidden_by = NULL WHERE id = ?').bind(id).run();
  } else if (hideKind === 'poll') {
    await db.prepare('UPDATE lantern_polls SET hidden_at = NULL, hidden_by = NULL WHERE id = ?').bind(id).run();
  } else if (hideKind === 'mission') {
    await db.prepare('UPDATE lantern_mission_submissions SET hidden_at = NULL, hidden_by = NULL WHERE id = ?').bind(id).run();
  }
  return { ok: true, id, hide_kind: hideKind, restored: true };
}

/** Clear report-created hide after a later approve, without touching admin/author hides. */
export async function clearReportHideIfPresent(db, hideKind, itemId) {
  const id = String(itemId || '').trim();
  if (!id || !db) return { ok: true, skipped: true };
  let row = null;
  if (hideKind === 'news') {
    row = await db.prepare('SELECT hidden_by FROM lantern_news_submissions WHERE id = ?').bind(id).first();
    if (row && isReportQuarantineLabel(row.hidden_by)) {
      await db.prepare('UPDATE lantern_news_submissions SET hidden_at = NULL, hidden_by = NULL WHERE id = ?').bind(id).run();
    }
  } else if (hideKind === 'poll') {
    row = await db.prepare('SELECT hidden_by FROM lantern_polls WHERE id = ?').bind(id).first();
    if (row && isReportQuarantineLabel(row.hidden_by)) {
      await db.prepare('UPDATE lantern_polls SET hidden_at = NULL, hidden_by = NULL WHERE id = ?').bind(id).run();
    }
  } else if (hideKind === 'mission') {
    row = await db.prepare('SELECT hidden_by FROM lantern_mission_submissions WHERE id = ?').bind(id).first();
    if (row && isReportQuarantineLabel(row.hidden_by)) {
      await db.prepare('UPDATE lantern_mission_submissions SET hidden_at = NULL, hidden_by = NULL WHERE id = ?').bind(id).run();
    }
  } else if (hideKind === 'feed') {
    row = await db.prepare('SELECT hidden_by FROM lantern_feed_items WHERE id = ?').bind(id).first();
    if (row && isReportQuarantineLabel(row.hidden_by)) {
      await db
        .prepare('UPDATE lantern_feed_items SET hidden_at = NULL, hidden_by = NULL WHERE id = ?')
        .bind(id)
        .run();
    }
  }
  return { ok: true };
}

/**
 * Reporter display key for lantern_content_flags.reported_by (staff-only surfaces).
 */
export function reporterIdentityFromAccount(account, pilotEconomyCharacterName) {
  if (!account) return '';
  const economy =
    typeof pilotEconomyCharacterName === 'function'
      ? String(pilotEconomyCharacterName(account) || '').trim()
      : '';
  if (economy) return economy;
  const u = account.username != null ? String(account.username).trim() : '';
  if (u) return u;
  return account.display_name != null ? String(account.display_name).trim() : '';
}
