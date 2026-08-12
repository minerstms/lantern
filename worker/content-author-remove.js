/**
 * Prompt #226 — author "Remove from Lantern" soft-hide + pending withdraw.
 *
 * Reuses existing hidden_at / hidden_by visibility fields (no second flag, no hard delete).
 * Author removals are labeled hidden_by = "author:<username>" so admin lists can distinguish
 * them from moderator hides. Restore clears hidden_* via existing admin restore endpoints.
 *
 * Does NOT reverse Nuggets, missions, votes, reactions, People rows, or R2 media.
 */
import { identityKeysForAccount } from './locker-personal-feed.js';
import { staffEconomyKey } from './economy-balance-auth.js';
import { staffMissionSubmitterKey } from './missions-auth.js';

export const AUTHOR_REMOVE_PREFIX = 'author:';

export function authorRemoveAuditLabel(account) {
  const u = account && account.username != null ? String(account.username).trim() : '';
  return AUTHOR_REMOVE_PREFIX + (u || 'unknown');
}

export function isAuthorRemovalLabel(hiddenBy) {
  return String(hiddenBy || '')
    .trim()
    .toLowerCase()
    .startsWith(AUTHOR_REMOVE_PREFIX);
}

export function removalStatusLabel(hiddenBy) {
  if (isAuthorRemovalLabel(hiddenBy)) return 'Removed by author';
  const who = String(hiddenBy || '').trim();
  return who ? 'Hidden by ' + who : 'Hidden';
}

/**
 * Multi-key ownership set for content authored under varying student/staff storage conventions.
 */
export function ownershipKeysForAccount(account, pilotEconomyCharacterName) {
  const economy =
    typeof pilotEconomyCharacterName === 'function' ? pilotEconomyCharacterName(account) : String(pilotEconomyCharacterName || '').trim();
  const keys = identityKeysForAccount(account, economy);
  const add = (v) => {
    const s = v != null ? String(v).trim() : '';
    if (s) keys.add(s.toLowerCase());
  };
  if (account) {
    add(account.display_name);
    add(account.first_name && account.last_name ? String(account.first_name).trim() + ' ' + String(account.last_name).trim() : '');
    const staffKey = staffEconomyKey(account);
    add(staffKey);
    try {
      add(staffMissionSubmitterKey(account));
    } catch (_) {}
  }
  return keys;
}

function matchesAny(value, keys) {
  const s = value != null ? String(value).trim().toLowerCase() : '';
  return !!(s && keys.has(s));
}

export function accountOwnsNewsRow(account, row, pilotEconomyCharacterName) {
  if (!account || !row) return false;
  const keys = ownershipKeysForAccount(account, pilotEconomyCharacterName);
  return matchesAny(row.actor_id, keys) || matchesAny(row.author_name, keys);
}

export function accountOwnsPollRow(account, row, pilotEconomyCharacterName) {
  if (!account || !row) return false;
  const keys = ownershipKeysForAccount(account, pilotEconomyCharacterName);
  return matchesAny(row.character_name, keys) || matchesAny(row.created_by_character, keys);
}

export function accountOwnsMissionSubmission(account, row, pilotEconomyCharacterName) {
  if (!account || !row) return false;
  const keys = ownershipKeysForAccount(account, pilotEconomyCharacterName);
  return matchesAny(row.character_name, keys);
}

export function accountOwnsFeedItem(account, row, pilotEconomyCharacterName, authorKeyFromAccount) {
  if (!account || !row) return false;
  const username = String(account.username || '').trim();
  if (username && String(row.author_id || '').trim() === username) return true;
  const authorKey =
    typeof authorKeyFromAccount === 'function' ? authorKeyFromAccount(account, pilotEconomyCharacterName) : '';
  if (authorKey && String(row.author_display_name || '').trim() === String(authorKey).trim()) return true;
  const keys = ownershipKeysForAccount(account, pilotEconomyCharacterName);
  return matchesAny(row.author_id, keys) || matchesAny(row.author_display_name, keys);
}

function isAlreadyHidden(row) {
  return !!(row && row.hidden_at != null && String(row.hidden_at).trim() !== '');
}

/**
 * Soft-remove published content. Idempotent if already hidden.
 */
export async function authorRemovePublishedContent(db, opts) {
  const itemType = String((opts && opts.itemType) || '')
    .trim()
    .toLowerCase();
  const itemId = String((opts && opts.itemId) || '').trim();
  const account = opts && opts.account;
  const pilotEconomyCharacterName = opts && opts.pilotEconomyCharacterName;
  const authorKeyFromAccount = opts && opts.authorKeyFromAccount;
  const now = (opts && opts.now) || new Date().toISOString();
  const audit = authorRemoveAuditLabel(account);

  if (!itemId) return { ok: false, error: 'missing_id', code: 400 };
  if (!account) return { ok: false, error: 'not_authenticated', code: 401 };

  if (itemType === 'news') {
    const row = await db
      .prepare('SELECT id, status, actor_id, author_name, author_type, hidden_at, hidden_by FROM lantern_news_submissions WHERE id = ?')
      .bind(itemId)
      .first();
    if (!row) return { ok: false, error: 'not_found', code: 404 };
    if (!accountOwnsNewsRow(account, row, pilotEconomyCharacterName)) {
      return { ok: false, error: 'forbidden', code: 403 };
    }
    const st = String(row.status || '').trim().toLowerCase();
    if (st !== 'approved') return { ok: false, error: 'not_published', code: 400 };
    if (isAlreadyHidden(row)) {
      return {
        ok: true,
        idempotent: true,
        already_removed: true,
        id: itemId,
        item_type: 'news',
        hidden_at: row.hidden_at,
        hidden_by: row.hidden_by,
        removal_label: removalStatusLabel(row.hidden_by),
      };
    }
    await db.prepare('UPDATE lantern_news_submissions SET hidden_at = ?, hidden_by = ? WHERE id = ?').bind(now, audit, itemId).run();
    return { ok: true, id: itemId, item_type: 'news', hidden_at: now, hidden_by: audit, removal_label: 'Removed by author' };
  }

  if (itemType === 'poll') {
    const row = await db
      .prepare(
        'SELECT id, character_name, created_by_character, approved_at, hidden_at, hidden_by FROM lantern_polls WHERE id = ?'
      )
      .bind(itemId)
      .first();
    if (!row) return { ok: false, error: 'not_found', code: 404 };
    if (!accountOwnsPollRow(account, row, pilotEconomyCharacterName)) {
      return { ok: false, error: 'forbidden', code: 403 };
    }
    if (!row.approved_at) return { ok: false, error: 'not_published', code: 400 };
    if (isAlreadyHidden(row)) {
      return {
        ok: true,
        idempotent: true,
        already_removed: true,
        id: itemId,
        item_type: 'poll',
        hidden_at: row.hidden_at,
        hidden_by: row.hidden_by,
        removal_label: removalStatusLabel(row.hidden_by),
      };
    }
    await db.prepare('UPDATE lantern_polls SET hidden_at = ?, hidden_by = ? WHERE id = ?').bind(now, audit, itemId).run();
    return { ok: true, id: itemId, item_type: 'poll', hidden_at: now, hidden_by: audit, removal_label: 'Removed by author' };
  }

  if (itemType === 'mission') {
    const row = await db
      .prepare(
        'SELECT id, mission_id, character_name, status, hidden_at, hidden_by FROM lantern_mission_submissions WHERE id = ?'
      )
      .bind(itemId)
      .first();
    if (!row) return { ok: false, error: 'not_found', code: 404 };
    if (!accountOwnsMissionSubmission(account, row, pilotEconomyCharacterName)) {
      return { ok: false, error: 'forbidden', code: 403 };
    }
    const st = String(row.status || '').trim().toLowerCase();
    if (st !== 'accepted') return { ok: false, error: 'not_published', code: 400 };
    if (isAlreadyHidden(row)) {
      return {
        ok: true,
        idempotent: true,
        already_removed: true,
        id: itemId,
        item_type: 'mission',
        hidden_at: row.hidden_at,
        hidden_by: row.hidden_by,
        removal_label: removalStatusLabel(row.hidden_by),
      };
    }
    // Feed visibility only — does not touch mission completions / rewards.
    await db.prepare('UPDATE lantern_mission_submissions SET hidden_at = ?, hidden_by = ? WHERE id = ?').bind(now, audit, itemId).run();
    return { ok: true, id: itemId, item_type: 'mission', hidden_at: now, hidden_by: audit, removal_label: 'Removed by author' };
  }

  if (itemType === 'feed') {
    const row = await db
      .prepare(
        'SELECT id, type, author_id, author_display_name, status, hidden_at, hidden_by FROM lantern_feed_items WHERE id = ?'
      )
      .bind(itemId)
      .first();
    if (!row) return { ok: false, error: 'not_found', code: 404 };
    if (!accountOwnsFeedItem(account, row, pilotEconomyCharacterName, authorKeyFromAccount)) {
      return { ok: false, error: 'forbidden', code: 403 };
    }
    const st = String(row.status || '').trim().toLowerCase();
    if (st !== 'approved') return { ok: false, error: 'not_published', code: 400 };
    if (isAlreadyHidden(row) || st === 'hidden') {
      return {
        ok: true,
        idempotent: true,
        already_removed: true,
        id: itemId,
        item_type: 'feed',
        hidden_at: row.hidden_at,
        hidden_by: row.hidden_by,
        removal_label: removalStatusLabel(row.hidden_by),
      };
    }
    await db
      .prepare("UPDATE lantern_feed_items SET status = 'hidden', hidden_at = ?, hidden_by = ? WHERE id = ?")
      .bind(now, audit, itemId)
      .run();
    return { ok: true, id: itemId, item_type: 'feed', hidden_at: now, hidden_by: audit, removal_label: 'Removed by author' };
  }

  return { ok: false, error: 'unsupported_item_type', code: 400 };
}

/**
 * Withdraw pending (not yet published) student submissions. Preserves rows; no reward path.
 */
export async function authorWithdrawPendingContent(db, opts) {
  const itemType = String((opts && opts.itemType) || '')
    .trim()
    .toLowerCase();
  const itemId = String((opts && opts.itemId) || '').trim();
  const account = opts && opts.account;
  const pilotEconomyCharacterName = opts && opts.pilotEconomyCharacterName;
  const authorKeyFromAccount = opts && opts.authorKeyFromAccount;
  const now = (opts && opts.now) || new Date().toISOString();
  const audit = authorRemoveAuditLabel(account);

  if (!itemId) return { ok: false, error: 'missing_id', code: 400 };
  if (!account) return { ok: false, error: 'not_authenticated', code: 401 };

  if (itemType === 'news') {
    const row = await db
      .prepare('SELECT id, status, actor_id, author_name FROM lantern_news_submissions WHERE id = ?')
      .bind(itemId)
      .first();
    if (!row) return { ok: false, error: 'not_found', code: 404 };
    if (!accountOwnsNewsRow(account, row, pilotEconomyCharacterName)) {
      return { ok: false, error: 'forbidden', code: 403 };
    }
    const st = String(row.status || '').trim().toLowerCase();
    if (st === 'withdrawn') {
      return { ok: true, idempotent: true, already_withdrawn: true, id: itemId, item_type: 'news', status: 'withdrawn' };
    }
    if (st === 'approved') return { ok: false, error: 'already_published_use_remove', code: 400 };
    if (st !== 'pending' && st !== 'returned') {
      return { ok: false, error: 'not_withdrawable', code: 400 };
    }
    await db
      .prepare(
        'UPDATE lantern_news_submissions SET status = ?, reviewed_at = ?, reviewed_by_staff_name = ?, decision_note = ? WHERE id = ?'
      )
      .bind('withdrawn', now, audit, 'Withdrawn by author', itemId)
      .run();
    try {
      await db
        .prepare(
          "UPDATE lantern_approvals SET status = ?, reviewed_at = ?, reviewed_by_staff_name = ?, decision_note = ? WHERE item_type = 'news' AND item_id = ? AND status = 'pending'"
        )
        .bind('withdrawn', now, audit, 'Withdrawn by author', itemId)
        .run();
    } catch (_) {}
    return { ok: true, id: itemId, item_type: 'news', status: 'withdrawn' };
  }

  if (itemType === 'poll_contribution' || itemType === 'poll') {
    const row = await db
      .prepare('SELECT id, character_name, status FROM lantern_poll_contributions WHERE id = ?')
      .bind(itemId)
      .first();
    if (!row) return { ok: false, error: 'not_found', code: 404 };
    if (!accountOwnsPollRow(account, row, pilotEconomyCharacterName)) {
      return { ok: false, error: 'forbidden', code: 403 };
    }
    const st = String(row.status || '').trim().toLowerCase();
    if (st === 'withdrawn') {
      return { ok: true, idempotent: true, already_withdrawn: true, id: itemId, item_type: 'poll_contribution', status: 'withdrawn' };
    }
    if (st === 'approved') return { ok: false, error: 'already_published_use_remove', code: 400 };
    if (st !== 'pending' && st !== 'returned') {
      return { ok: false, error: 'not_withdrawable', code: 400 };
    }
    try {
      await db
        .prepare('UPDATE lantern_poll_contributions SET status = ?, reviewed_at = ?, reviewed_by = ?, decision_note = ? WHERE id = ?')
        .bind('withdrawn', now, audit, 'Withdrawn by author', itemId)
        .run();
    } catch (_) {
      await db.prepare('UPDATE lantern_poll_contributions SET status = ? WHERE id = ?').bind('withdrawn', itemId).run();
    }
    try {
      await db
        .prepare(
          "UPDATE lantern_approvals SET status = ?, reviewed_at = ?, reviewed_by_staff_name = ?, decision_note = ? WHERE item_type = 'poll_contribution' AND item_id = ? AND status = 'pending'"
        )
        .bind('withdrawn', now, audit, 'Withdrawn by author', itemId)
        .run();
    } catch (_) {}
    return { ok: true, id: itemId, item_type: 'poll_contribution', status: 'withdrawn' };
  }

  if (itemType === 'feed') {
    const row = await db
      .prepare('SELECT id, author_id, author_display_name, status, hidden_at FROM lantern_feed_items WHERE id = ?')
      .bind(itemId)
      .first();
    if (!row) return { ok: false, error: 'not_found', code: 404 };
    if (!accountOwnsFeedItem(account, row, pilotEconomyCharacterName, authorKeyFromAccount)) {
      return { ok: false, error: 'forbidden', code: 403 };
    }
    const st = String(row.status || '').trim().toLowerCase();
    if (st === 'withdrawn' || st === 'draft') {
      if (st === 'withdrawn') {
        return { ok: true, idempotent: true, already_withdrawn: true, id: itemId, item_type: 'feed', status: 'withdrawn' };
      }
    }
    if (st === 'approved' || st === 'hidden') return { ok: false, error: 'already_published_use_remove', code: 400 };
    if (st !== 'draft' && st !== 'submitted' && st !== 'rejected') {
      return { ok: false, error: 'not_withdrawable', code: 400 };
    }
    await db
      .prepare("UPDATE lantern_feed_items SET status = 'withdrawn', private_feedback = ? WHERE id = ?")
      .bind('Withdrawn by author', itemId)
      .run();
    return { ok: true, id: itemId, item_type: 'feed', status: 'withdrawn' };
  }

  return { ok: false, error: 'unsupported_item_type', code: 400 };
}

/**
 * Resolve feed-facing item ids (news:uuid / mission:id / poll id / raw feed id) to remove args.
 */
export function parseContentRemoveTarget(rawType, rawId) {
  let itemType = String(rawType || '')
    .trim()
    .toLowerCase();
  let itemId = String(rawId || '').trim();
  if (!itemId) return { itemType: '', itemId: '' };

  if (itemId.startsWith('news:')) {
    return { itemType: 'news', itemId: itemId.slice(5) };
  }
  if (itemId.startsWith('mission:')) {
    return { itemType: 'mission', itemId: itemId.slice(8) };
  }
  if (itemId.startsWith('poll:')) {
    return { itemType: 'poll', itemId: itemId.slice(5) };
  }
  if (itemType === 'shout_out' || itemType === 'photo' || itemType === 'video' || itemType === 'article' || itemType === 'news') {
    // Explore cards often use news-backed ids without prefix when type is news/shout_out.
    if (itemId.startsWith('news-') || itemId.indexOf('news') === 0) {
      return { itemType: 'news', itemId };
    }
  }
  if (itemType === 'poll') return { itemType: 'poll', itemId };
  if (itemType === 'mission') return { itemType: 'mission', itemId };
  if (itemType === 'feed' || itemType === 'game_score' || itemType === 'achievement') {
    return { itemType: 'feed', itemId };
  }
  if (!itemType && itemId) {
    if (itemId.startsWith('news-')) return { itemType: 'news', itemId };
    return { itemType: 'feed', itemId };
  }
  return { itemType, itemId };
}
