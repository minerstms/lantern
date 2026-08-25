/**
 * Prompt #259 — server-authoritative Locker public-safe activity stats.
 */
import { identityKeysForAccount } from './locker-personal-feed.js';

function trimStr(v) {
  return v == null ? '' : String(v).trim();
}

function authorNamesForAccount(account, economyKey) {
  const role = String(account && account.role ? account.role : '')
    .trim()
    .toLowerCase();
  const displayName =
    account && account.display_name != null && trimStr(account.display_name)
      ? trimStr(account.display_name)
      : trimStr(account && account.username);
  const username = trimStr(account && account.username);
  const studentCharacter = trimStr(account && account.student_character_name);
  if (role === 'student') {
    return [...new Set([displayName, username, economyKey, studentCharacter].filter(Boolean))];
  }
  return [...new Set([displayName, username, 'Teacher', 'Staff', 'Admin'].filter(Boolean))];
}

/**
 * Published student creations on Explore (not mission completion rows).
 * Includes: approved news, approved polls, approved generic feed_items.
 */
export async function countCreationsShared(db, account, economyKey) {
  if (!db || !economyKey) return 0;
  const authorNames = authorNamesForAccount(account, economyKey);
  const identityKeys = identityKeysForAccount(account, economyKey);
  let total = 0;

  if (authorNames.length) {
    const ph = authorNames.map(() => '?').join(',');
    try {
      const news = await db
        .prepare(
          `SELECT COUNT(*) AS c FROM lantern_news_submissions WHERE author_name IN (${ph}) AND LOWER(TRIM(status)) = 'approved'`
        )
        .bind(...authorNames)
        .first();
      total += news && news.c != null ? Number(news.c) || 0 : 0;
    } catch (_) {}
  }

  try {
    const polls = await db
      .prepare(
        "SELECT COUNT(*) AS c FROM lantern_polls WHERE character_name = ? AND approved_at IS NOT NULL AND TRIM(approved_at) != '' AND (hidden_at IS NULL OR hidden_at = '')"
      )
      .bind(economyKey)
      .first();
    total += polls && polls.c != null ? Number(polls.c) || 0 : 0;
  } catch (_) {}

  const keys = [...identityKeys];
  if (keys.length) {
    const ph = keys.map(() => '?').join(',');
    try {
      const feed = await db
        .prepare(
          `SELECT COUNT(*) AS c FROM lantern_feed_items WHERE LOWER(TRIM(status)) = 'approved' AND (author_id IN (${ph}) OR author_display_name IN (${ph})) AND (hidden_at IS NULL OR hidden_at = '')`
        )
        .bind(...keys, ...keys)
        .first();
      total += feed && feed.c != null ? Number(feed.c) || 0 : 0;
    } catch (_) {}
  }

  return total;
}

/** Authoritative completed game plays (including zero-debit sponsored/free runs). */
export async function countGamesPlayed(db, economyKey) {
  if (!db || !economyKey) return 0;
  try {
    const row = await db
      .prepare("SELECT COUNT(*) AS c FROM lantern_transactions WHERE character_name = ? AND kind = 'game_play'")
      .bind(economyKey)
      .first();
    return row && row.c != null ? Number(row.c) || 0 : 0;
  } catch (_) {
    return 0;
  }
}

/** Finalized reactions submitted by this account (one row per feed item; retries deduped). */
export async function countReactionsGiven(db, username) {
  const user = trimStr(username);
  if (!db || !user) return 0;
  try {
    const row = await db
      .prepare(
        'SELECT COUNT(*) AS c FROM lantern_final_reaction_responses WHERE lower(trim(reactor_username)) = lower(trim(?))'
      )
      .bind(user)
      .first();
    return row && row.c != null ? Number(row.c) || 0 : 0;
  } catch (_) {
    return 0;
  }
}

export async function fetchLockerLanternStats(db, account, economyKey) {
  const username = trimStr(account && account.username);
  if (!db || !economyKey || !username) {
    return {
      available: false,
      creations_shared: 0,
      games_played: 0,
      reactions_given: 0,
    };
  }
  const [creations_shared, games_played, reactions_given] = await Promise.all([
    countCreationsShared(db, account, economyKey),
    countGamesPlayed(db, economyKey),
    countReactionsGiven(db, username),
  ]);
  return {
    available: true,
    creations_shared,
    games_played,
    reactions_given,
  };
}

export const LOCKER_STATS_CONTENT_TYPES = ['approved_news', 'approved_poll', 'approved_feed_item'];
