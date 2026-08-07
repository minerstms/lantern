/**
 * Server-authoritative achievement awards. Never trust client achievement_id claims.
 */

import { unlockAchievement } from './locker-storage.js';

/** Achievements with no trustworthy server event yet (remain locked). */
export const ACHIEVEMENTS_NOT_YET_WIRED = [
  'thank_you_writer',
  'kindness_writer',
  'featured_creator',
  'teacher_pick',
  'creative_builder',
];

async function safeUnlock(db, characterName, achievementId, source, meta) {
  try {
    return await unlockAchievement(db, characterName, achievementId, source, meta || {});
  } catch (_) {
    return { ok: false, error: 'unlock_failed' };
  }
}

export async function awardAchievementsForCosmeticPurchase(db, characterName, txId, cosmeticId) {
  await safeUnlock(db, characterName, 'first_purchase', 'economy_cosmetic_purchase', {
    transaction_id: txId,
    cosmetic_id: cosmeticId || null,
  });
}

export async function awardAchievementsForEconomyTransact(db, characterName, kind, txId, note) {
  const k = String(kind || '').trim();
  const meta = { transaction_id: txId };
  if (k === 'daily_checkin') {
    await safeUnlock(db, characterName, 'daily_checkin', 'economy_transact', meta);
  } else if (k === 'hidden_nugget') {
    await safeUnlock(db, characterName, 'hidden_nugget', 'economy_transact', meta);
  } else if (k === 'daily_hunt') {
    await safeUnlock(db, characterName, 'daily_nugget_finder', 'economy_transact', meta);
    await syncSevenDayNuggetStreak(db, characterName);
  } else if (k === 'first_game') {
    await safeUnlock(db, characterName, 'first_game', 'economy_transact', meta);
  } else if (k === 'approval' && String(note || '').toLowerCase().includes('spotlight')) {
    await safeUnlock(db, characterName, 'teacher_spotlight', 'economy_transact', meta);
  }
}

export async function awardAchievementsAfterPositiveCredit(db, characterName, txId, delta) {
  if (Number(delta) <= 0) return;
  try {
    const sums = await db
      .prepare(
        'SELECT SUM(CASE WHEN delta > 0 THEN delta ELSE 0 END) AS earned FROM lantern_transactions WHERE character_name = ?'
      )
      .bind(characterName)
      .first();
    const earned = sums && sums.earned != null ? Number(sums.earned) || 0 : 0;
    if (earned >= 10) {
      await safeUnlock(db, characterName, 'ten_nuggets', 'd1_derived', {
        earned_total: earned,
        transaction_id: txId,
      });
    }
  } catch (_) {}
}

export async function awardAchievementsForNewsCreate(db, authorName, authorType, newsId) {
  const name = String(authorName || '').trim();
  if (!name) return;
  if (String(authorType || '').trim().toLowerCase() === 'student') {
    await safeUnlock(db, name, 'first_post', 'news_create', { news_id: newsId });
  }
}

export async function awardAchievementsForNewsApproved(db, authorName, newsId) {
  const name = String(authorName || '').trim();
  if (!name) return;
  await safeUnlock(db, name, 'news_reporter', 'news_approved', { news_id: newsId });
}

export async function awardAchievementsForMissionSubmit(db, characterName, submissionId) {
  const name = String(characterName || '').trim();
  if (!name) return;
  await safeUnlock(db, name, 'first_post', 'mission_submit', { submission_id: submissionId });
}

export async function awardAchievementsForMissionAccepted(db, characterName, submissionId) {
  const name = String(characterName || '').trim();
  if (!name) return;
  await safeUnlock(db, name, 'teacher_mission_finisher', 'mission_accepted', { submission_id: submissionId });
}

export async function awardAchievementsForPollContribute(db, characterName, contribId) {
  const name = String(characterName || '').trim();
  if (!name) return;
  await safeUnlock(db, name, 'first_post', 'poll_contribute', { contribution_id: contribId });
}

export async function awardAchievementsForRecognition(db, characterName, category, message, recId) {
  const name = String(characterName || '').trim();
  if (!name) return;
  const cat = String(category || '').toLowerCase();
  const msg = String(message || '').toLowerCase();
  if (cat.includes('spotlight') || msg.includes('spotlight')) {
    await safeUnlock(db, name, 'teacher_spotlight', 'recognition_create', { recognition_id: recId });
  }
}

async function syncSevenDayNuggetStreak(db, characterName) {
  const rows = await db
    .prepare(
      "SELECT created_at FROM lantern_transactions WHERE character_name = ? AND kind = 'daily_hunt' AND delta > 0 ORDER BY created_at DESC LIMIT 30"
    )
    .bind(characterName)
    .all();
  const dateSet = new Set();
  for (const r of rows.results || []) {
    const d = String(r.created_at || '').slice(0, 10);
    if (d.length === 10) dateSet.add(d);
  }
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    const want = d.toISOString().slice(0, 10);
    if (!dateSet.has(want)) return;
  }
  await safeUnlock(db, characterName, '7_day_nugget_streak', 'd1_derived', {});
}

async function countApprovedCreations(db, characterName) {
  let approvedNews = 0;
  try {
    const news = await db
      .prepare(
        "SELECT COUNT(*) AS c FROM lantern_news_submissions WHERE author_name = ? AND LOWER(TRIM(status)) = 'approved'"
      )
      .bind(characterName)
      .first();
    approvedNews = news && news.c != null ? Number(news.c) || 0 : 0;
  } catch (_) {}
  let acceptedMissions = 0;
  try {
    const ms = await db
      .prepare(
        "SELECT COUNT(*) AS c FROM lantern_mission_submissions WHERE character_name = ? AND LOWER(TRIM(status)) = 'accepted'"
      )
      .bind(characterName)
      .first();
    acceptedMissions = ms && ms.c != null ? Number(ms.c) || 0 : 0;
  } catch (_) {}
  return approvedNews + acceptedMissions;
}

/**
 * Idempotent D1-derived thresholds (safe to call from GET /api/locker/me).
 */
export async function syncDerivedAchievements(db, characterName) {
  const name = String(characterName || '').trim();
  if (!name || !db) return;

  const sums = await db
    .prepare(
      'SELECT SUM(CASE WHEN delta > 0 THEN delta ELSE 0 END) AS earned FROM lantern_transactions WHERE character_name = ?'
    )
    .bind(name)
    .first();
  const earned = sums && sums.earned != null ? Number(sums.earned) || 0 : 0;
  if (earned >= 10) {
    await safeUnlock(db, name, 'ten_nuggets', 'd1_derived', { earned_total: earned });
  }

  const approvedCount = await countApprovedCreations(db, name);
  if (approvedCount >= 5) {
    await safeUnlock(db, name, 'five_posts', 'd1_derived', { approved_count: approvedCount });
  }
  if (approvedCount >= 10) {
    await safeUnlock(db, name, 'consistent_contributor', 'd1_derived', { approved_count: approvedCount });
  }

  await syncSevenDayNuggetStreak(db, name);
}
