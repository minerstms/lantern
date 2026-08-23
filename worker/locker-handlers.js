/**
 * Session-scoped Locker self-service: GET /api/locker/me
 * Identity is derived from the pilot session only — client target-identity params are rejected.
 */

import {
  enrichAchievementItems,
  equippedItemsList,
  fetchAchievementRows,
  fetchCosmeticOwnershipRow,
  mergeOwnedItemIds,
  setEquippedCosmetic,
  updateAccountBio,
} from './locker-storage.js';
import { syncDerivedAchievements } from './locker-achievements.js';
import { fetchLockerProgress } from './locker-progress.js';
import { buildLockerPersonalFeed } from './locker-personal-feed.js';
import { normalizeBioFromDb, sanitizeBioInput, resolveProfileBio } from './locker-bio.js';
import { staffEconomyKey } from './economy-balance-auth.js';
import { fetchAuthoritativeEconomySnapshot } from './tms-economy-apply.js';
import { durableAccountKeyFromPilotAccount } from './durable-account-key.js';
import {
  avatarCandidatesFromPilotAccount,
  buildAvatarImageUrl,
  collectAvatarLookupCandidates,
  resolveCanonicalAvatarState,
} from './avatar-media-gate.js';
import {
  applyLockerItemAction,
  attachStateToOwnerItems,
  listLockerItemStatesForOwner,
  LockerItemStateSchemaError,
  ownerItemTypeFromSubmission,
} from './locker-item-state.js';
import { getOrCreateLockerPublicKey } from './locker-public-key.js';
import { buildLockerShowcase } from './locker-showcase.js';
import { recordEventForAccount } from './moderation-review.js';

const LOCKER_FORBIDDEN_QUERY_PARAMS = [
  'character_name',
  'username',
  'account_id',
  'student_id',
  'teacher_id',
  'author_name',
  'target',
  'simStudent',
  'public_key',
  'locker_public_key',
];

const LOCKER_FORBIDDEN_BODY_IDENTITY_KEYS = [
  'character_name',
  'username',
  'account_id',
  'student_id',
  'teacher_id',
  'economy_key',
  'economy_character_name',
  'display_name',
  'author_name',
  'target',
  'public_key',
  'locker_public_key',
];

/** Structured category: distinguishes empty real data vs unsupported storage. */
function lockerCategory(available, reason, items, extra) {
  const out = {
    available: !!available,
    reason: available ? null : reason || 'unavailable',
    items: Array.isArray(items) ? items : [],
  };
  if (extra && typeof extra === 'object') {
    Object.assign(out, extra);
  }
  return out;
}

function lockerRejectIdentityParams(url) {
  for (const key of LOCKER_FORBIDDEN_QUERY_PARAMS) {
    const val = url.searchParams.get(key);
    if (val != null && String(val).trim() !== '') {
      return key;
    }
  }
  return null;
}

function lockerRejectBodyIdentityKeys(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  for (const key of LOCKER_FORBIDDEN_BODY_IDENTITY_KEYS) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      const val = body[key];
      if (val != null && String(val).trim() !== '') return key;
    }
  }
  return null;
}

function parseTxMeta(metaJson) {
  if (!metaJson) return {};
  try {
    return JSON.parse(metaJson);
  } catch (_) {
    return {};
  }
}

function parseCosmeticNote(note) {
  const n = String(note || '').trim();
  if (!n) return { item_name: null, item_id: null };
  const m = n.match(/^(.+?)\s+purchase$/i);
  if (m) return { item_name: m[1].trim(), item_id: null };
  return { item_name: n, item_id: null };
}

function slugFromCosmeticName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

function resolveEconomyKey(account) {
  const role = String(account.role || '').trim().toLowerCase();
  if (role === 'student') {
    return account._economy_character_name || account.student_character_name || account.username || null;
  }
  if (role === 'teacher' || role === 'admin') {
    return staffEconomyKey(account) || null;
  }
  return null;
}

export { resolveEconomyKey };

async function requireLockerSession(request, env, deps) {
  const getPilotAccountFromRequest = deps.getPilotAccountFromRequest;
  const pilotEconomyCharacterName = deps.pilotEconomyCharacterName;
  const pilotAccountRequiresChangePassword = deps.pilotAccountRequiresChangePassword;

  const account = await getPilotAccountFromRequest(request, env);
  if (!account) {
    return { error: { ok: false, error: 'not_authenticated', authenticated: false }, status: 401 };
  }
  if (pilotAccountRequiresChangePassword(account)) {
    return {
      error: {
        ok: false,
        error: 'must_change_password',
        redirect: '/change-password.html',
        authenticated: true,
      },
      status: 403,
    };
  }
  account._economy_character_name =
    String(account.role || '').trim().toLowerCase() === 'student'
      ? pilotEconomyCharacterName(account) || null
      : null;
  const economyKey = resolveEconomyKey(account);
  return { account, economyKey };
}

async function fetchCosmeticSpendRows(db, characterName) {
  if (!characterName) return [];
  const rows = await db
    .prepare(
      "SELECT id, character_name, delta, kind, source, note, created_at, meta_json FROM lantern_transactions WHERE character_name = ? AND kind = 'cosmetic' AND delta < 0 ORDER BY created_at DESC LIMIT 200"
    )
    .bind(characterName)
    .all();
  return (rows.results || []).map((r) => ({
    id: r.id,
    character_name: r.character_name,
    delta: r.delta,
    kind: r.kind || '',
    source: r.source || '',
    note: r.note || '',
    created_at: r.created_at,
    meta: parseTxMeta(r.meta_json),
  }));
}

function mapTmsHistoryToWalletTransactions(characterName, recentHistory) {
  return (recentHistory || []).map((h, idx) => ({
    id: 'tms-' + idx + '-' + String(h.timestamp || ''),
    character_name: characterName,
    delta: h.type === 'redeemed' ? -Math.abs(Number(h.amount) || 0) : Math.abs(Number(h.amount) || 0),
    kind: h.type === 'redeemed' ? 'tms_redeem' : 'tms_earn',
    source: 'TMS_NUGGETS',
    note: h.note || h.teacher_name || '',
    created_at: h.timestamp,
    meta: {},
  }));
}

// Prompt #96: the wallet balance/history shown in the Locker is the same one authoritative TMS
// Nuggets ledger the Teacher Nuggets panel and Store/Locker balance already use -- not a second,
// Lantern-only copy. Falls back to the legacy local wallet/transactions only for accounts that do
// not resolve to a real TMS student (demo/persona characters, local dev/test fixtures).
async function fetchWalletBundle(db, characterName, env) {
  if (!characterName) {
    return lockerCategory(false, 'account_link_missing', [], { balance: null, earned: null, spent: null, transactions: [] });
  }
  if (env) {
    const snap = await fetchAuthoritativeEconomySnapshot(env, db, characterName);
    if (snap && snap.ok && snap.available != null) {
      const transactions = mapTmsHistoryToWalletTransactions(characterName, snap.history);
      return lockerCategory(true, null, transactions, {
        balance: snap.available,
        earned: snap.earned,
        spent: snap.spent,
        transactions,
      });
    }
    return lockerCategory(false, (snap && snap.error) || 'unavailable', [], {
      balance: null,
      earned: null,
      spent: null,
      transactions: [],
    });
  }
  return lockerCategory(false, 'unavailable', [], { balance: null, earned: null, spent: null, transactions: [] });
}

async function fetchAvatarProfile(db, origin, account, fallbackKey) {
  const durableKey = durableAccountKeyFromPilotAccount(account) || String(fallbackKey || '').trim();
  const candidates = collectAvatarLookupCandidates(
    durableKey,
    fallbackKey,
    ...avatarCandidatesFromPilotAccount(account)
  );
  if (!candidates.length) {
    return {
      available: false,
      reason: 'account_link_missing',
      legacy_avatar_bio: null,
      avatar: null,
      avatar_pending: null,
    };
  }
  const resolved = await resolveCanonicalAvatarState(db, durableKey || candidates[0], {
    candidates,
    includePending: true,
  });
  const stamp = resolved.profile && resolved.profile.updated_at
    ? resolved.profile.updated_at
    : (resolved.approved && (resolved.approved.approved_at || resolved.approved.created_at)) || '';
  const activeImage = resolved.publicImageKey
    ? buildAvatarImageUrl(origin, resolved.publicImageKey, stamp)
    : null;
  const pending = resolved.pending;
  const pendingImage = pending ? buildAvatarImageUrl(origin, pending.image_key, pending.created_at) : null;
  return {
    available: true,
    reason: null,
    legacy_avatar_bio: normalizeBioFromDb(resolved.profile ? resolved.profile.bio : null),
    avatar: activeImage,
    avatar_pending: pending
      ? {
          id: pending.id,
          image: pendingImage,
          created_at: pending.created_at,
        }
      : null,
  };
}

async function fetchNewsSubmissions(db, origin, authorNames) {
  const names = [...new Set((authorNames || []).map((n) => String(n || '').trim()).filter(Boolean))];
  if (!names.length) return [];
  const placeholders = names.map(() => '?').join(',');
  const rows = await db
    .prepare(
      `SELECT id, title, body, actor_id, author_name, author_type, image_r2_key, full_image_r2_key, video_r2_key, link_url, category, status, created_at, reviewed_at, decision_note FROM lantern_news_submissions WHERE author_name IN (${placeholders}) ORDER BY created_at DESC`
    )
    .bind(...names)
    .all();
  return (rows.results || []).map((r) => ({
    type: 'news_submission',
    id: r.id,
    title: r.title,
    body: r.body,
    category: r.category != null && String(r.category).trim() !== '' ? String(r.category).trim() : null,
    author_name: r.author_name,
    author_type: r.author_type,
    status: r.status,
    created_at: r.created_at,
    reviewed_at: r.reviewed_at,
    decision_note: r.decision_note,
    image_url: r.image_r2_key ? origin + '/api/news/image?key=' + encodeURIComponent(r.image_r2_key) : null,
    full_image_url:
      r.full_image_r2_key && String(r.full_image_r2_key).trim()
        ? origin + '/api/news/image?key=' + encodeURIComponent(r.full_image_r2_key)
        : null,
    video_url: r.video_r2_key ? origin + '/api/news/video?key=' + encodeURIComponent(r.video_r2_key) : null,
    link_url:
      r.link_url && /^https?:\/\//i.test(String(r.link_url).trim())
        ? String(r.link_url).trim().slice(0, 2000)
        : null,
  }));
}

async function fetchMissionSubmissions(db, characterName) {
  if (!characterName) return [];
  const subRows = await db
    .prepare(
      'SELECT id, mission_id, character_name, submission_type, submission_content, status, created_at, reviewed_at, reviewed_by, returned_reason, returned_at FROM lantern_mission_submissions WHERE character_name = ? ORDER BY created_at DESC'
    )
    .bind(characterName)
    .all();
  const missionIds = [...new Set((subRows.results || []).map((s) => s.mission_id))];
  let byMission = {};
  if (missionIds.length > 0) {
    const placeholders = missionIds.map(() => '?').join(',');
    const mRows = await db
      .prepare(
        'SELECT id, title, reward_amount, teacher_id, teacher_name FROM lantern_missions WHERE id IN (' +
          placeholders +
          ')'
      )
      .bind(...missionIds)
      .all();
    (mRows.results || []).forEach((m) => {
      byMission[m.id] = {
        title: m.title,
        reward_amount: m.reward_amount,
        teacher_id: m.teacher_id || '',
        teacher_name: m.teacher_name || 'Teacher',
      };
    });
  }
  return (subRows.results || []).map((s) => {
    const m = byMission[s.mission_id] || {};
    let image_url = null;
    if (s.submission_type === 'image_url' && s.submission_content) {
      image_url = String(s.submission_content).trim().slice(0, 1000);
    } else if (s.submission_type === 'text' && s.submission_content) {
      try {
        const parsed =
          typeof s.submission_content === 'string' ? JSON.parse(s.submission_content) : s.submission_content;
        if (parsed.image_url || parsed.image)
          image_url = String(parsed.image_url || parsed.image || '')
            .trim()
            .slice(0, 1000);
      } catch (_) {}
    }
    const isVideo = (s.submission_type || '') === 'video';
    const video_url =
      isVideo && s.submission_content ? String(s.submission_content).trim().slice(0, 2000) : undefined;
    return {
      type: 'mission_submission',
      id: s.id,
      mission_id: s.mission_id,
      character_name: s.character_name,
      submission_type: s.submission_type,
      submission_content: s.submission_content || '',
      status: s.status,
      created_at: s.created_at,
      reviewed_at: s.reviewed_at || null,
      reviewed_by: s.reviewed_by || '',
      returned_reason:
        s.returned_reason && String(s.returned_reason).trim() ? String(s.returned_reason).trim() : null,
      returned_at: s.returned_at || null,
      mission_title: m.title || '',
      mission_reward: m.reward_amount != null ? m.reward_amount : 1,
      created_by_teacher_name: m.teacher_name || 'Teacher',
      image_url: image_url || undefined,
      video_url: video_url || undefined,
    };
  });
}

async function fetchPollContributions(db, characterName) {
  if (!characterName) return [];
  let rows;
  try {
    rows = await db
      .prepare(
        'SELECT id, character_name, question, choices_json, image_url, fallback_key, status, decision_note, reviewed_at, created_at FROM lantern_poll_contributions WHERE character_name = ? ORDER BY created_at DESC LIMIT 100'
      )
      .bind(characterName)
      .all();
  } catch (_) {
    return [];
  }
  return (rows.results || []).map((r) => {
    let choices = [];
    try {
      choices = JSON.parse(r.choices_json || '[]');
    } catch (_) {}
    return {
      type: 'poll_contribution',
      id: r.id,
      character_name: r.character_name,
      question: r.question || '',
      choices,
      image_url: r.image_url || null,
      fallback_key: r.fallback_key || null,
      status: r.status || '',
      decision_note: r.decision_note || null,
      reviewed_at: r.reviewed_at || null,
      created_at: r.created_at || '',
    };
  });
}

async function fetchOwnerFeedItems(db, identityKeys) {
  const keys = [...new Set((identityKeys || []).map((k) => String(k || '').trim()).filter(Boolean))];
  if (!keys.length || !db) return [];
  const ph = keys.map(() => '?').join(',');
  try {
    const rows = await db
      .prepare(
        `SELECT id, type, title, body, summary, author_id, author_display_name, status, created_at, private_feedback, image_r2_key, hidden_at
         FROM lantern_feed_items
         WHERE author_display_name IN (${ph}) OR author_id IN (${ph})
         ORDER BY created_at DESC LIMIT 100`
      )
      .bind(...keys, ...keys)
      .all();
    return (rows.results || []).map((r) => ({
      type: 'feed_item',
      id: r.id,
      title: r.title || '',
      body: r.body || r.summary || '',
      status: r.status || '',
      created_at: r.created_at || '',
      decision_note: r.private_feedback || null,
      hidden_at: r.hidden_at || null,
      image_r2_key: r.image_r2_key || null,
    }));
  } catch (_) {
    return [];
  }
}

async function fetchRecognitions(db, origin, characterName, limit) {
  if (!characterName) return [];
  const fetchCap = Math.min(100, (limit || 50) + 40);
  const rows = await db
    .prepare(
      'SELECT id, character_name, message, category, created_at, created_by_teacher_id, created_by_teacher_name FROM lantern_teacher_recognition WHERE character_name = ? ORDER BY created_at DESC LIMIT ?'
    )
    .bind(characterName, fetchCap)
    .all();
  const profiles = await db.prepare('SELECT character_name, current_avatar_key FROM lantern_avatar_profiles').all();
  const avatarByChar = {};
  (profiles.results || []).forEach((p) => {
    if (p.character_name && p.current_avatar_key) avatarByChar[p.character_name] = p.current_avatar_key;
  });
  let list = (rows.results || []).map((r) => {
    const key = avatarByChar[r.character_name];
    return {
      id: r.id,
      character_name: r.character_name,
      message: r.message,
      category: r.category || '',
      created_at: r.created_at,
      created_by_teacher_name: r.created_by_teacher_name || '',
      avatar_image: key ? origin + '/api/avatar/image?key=' + encodeURIComponent(key) : null,
    };
  });
  list.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  return list.slice(0, limit || 50);
}

/** Derive owned cosmetic/store items from D1 spend transactions (kind=cosmetic, delta<0). */
function deriveOwnedItemsFromTransactions(rows) {
  const byKey = new Map();
  for (const r of rows || []) {
    if (String(r.kind || '') !== 'cosmetic') continue;
    if (Number(r.delta) >= 0) continue;
    const meta = r.meta || parseTxMeta(r.meta_json);
    const parsed = parseCosmeticNote(r.note);
    const itemId =
      (meta.cosmetic_id && String(meta.cosmetic_id).trim()) ||
      (meta.item_id && String(meta.item_id).trim()) ||
      (parsed.item_name ? slugFromCosmeticName(parsed.item_name) : null);
    const itemName =
      (meta.item_name && String(meta.item_name).trim()) ||
      parsed.item_name ||
      String(r.note || '').trim() ||
      'Cosmetic';
    const key = itemId || 'note:' + itemName.toLowerCase();
    byKey.set(key, {
      item_id: itemId,
      item_name: itemName,
      cost: Math.abs(Number(r.delta) || 0),
      purchased_at: r.created_at,
      transaction_id: r.id,
      source: 'lantern_transactions',
    });
  }
  return [...byKey.values()];
}

function derivePurchaseHistoryFromTransactions(rows) {
  return (rows || [])
    .filter((r) => String(r.kind || '') === 'cosmetic' && Number(r.delta) < 0)
    .map((r) => {
      const meta = r.meta || parseTxMeta(r.meta_json);
      const parsed = parseCosmeticNote(r.note);
      return {
        id: r.id,
        item_id:
          (meta.cosmetic_id && String(meta.cosmetic_id).trim()) ||
          (meta.item_id && String(meta.item_id).trim()) ||
          (parsed.item_name ? slugFromCosmeticName(parsed.item_name) : null),
        item_name:
          (meta.item_name && String(meta.item_name).trim()) ||
          parsed.item_name ||
          String(r.note || '').trim() ||
          'Cosmetic',
        cost: Math.abs(Number(r.delta) || 0),
        purchased_at: r.created_at,
        note: r.note || '',
      };
    });
}

/**
 * Build the authenticated Locker payload for one pilot account row.
 */
export async function buildLockerMeResponse(account, env, origin) {
  const db = env.DB;
  const role = String(account.role || '').trim().toLowerCase();
  const username = String(account.username || '').trim();
  const displayName =
    account.display_name != null && String(account.display_name).trim()
      ? String(account.display_name).trim()
      : username;
  const studentCharacterName =
    account.student_character_name != null && String(account.student_character_name).trim()
      ? String(account.student_character_name).trim()
      : null;
  const teacherId =
    account.teacher_id != null && String(account.teacher_id).trim() ? String(account.teacher_id).trim() : null;
  const mtssStudentId =
    account.mtss_student_id != null && String(account.mtss_student_id).trim()
      ? String(account.mtss_student_id).trim()
      : null;

  const economyCharacterName = role === 'student' ? account._economy_character_name || null : null;
  const economyKey = resolveEconomyKey(account);
  const submissionKey = role === 'student' ? economyKey : null;
  const avatarKey = durableAccountKeyFromPilotAccount(account) || economyKey;

  const newsAuthorNames =
    role === 'student'
      ? [displayName, username, economyCharacterName, studentCharacterName].filter(Boolean)
      : [displayName, username, 'Teacher', 'Staff', 'Admin'].filter(Boolean);

  if (economyKey) {
    try {
      await syncDerivedAchievements(db, economyKey);
    } catch (_) {}
  }

  const [profileRaw, accountBioRow, walletBundle, cosmeticSpendRows, news, missions, polls, feedItems, recognitions, achievementRows, cosmeticRow, lockerStateRows, lockerPublicKey] =
    await Promise.all([
    fetchAvatarProfile(db, origin, account, avatarKey),
    db.prepare('SELECT bio FROM lantern_pilot_accounts WHERE username = ?').bind(username).first(),
    economyKey
      ? fetchWalletBundle(db, economyKey, env)
      : lockerCategory(false, role === 'student' ? 'account_link_missing' : 'not_applicable_for_role', [], {
          balance: null,
          earned: null,
          spent: null,
          transactions: [],
        }),
    economyKey ? fetchCosmeticSpendRows(db, economyKey) : Promise.resolve([]),
    fetchNewsSubmissions(db, origin, newsAuthorNames),
    fetchMissionSubmissions(db, submissionKey),
    fetchPollContributions(db, submissionKey),
    role === 'student' ? fetchOwnerFeedItems(db, newsAuthorNames.concat(economyKey || [])) : Promise.resolve([]),
    role === 'student' && submissionKey
      ? fetchRecognitions(db, origin, submissionKey, 50)
      : Promise.resolve([]),
    economyKey ? fetchAchievementRows(db, economyKey) : Promise.resolve([]),
    economyKey ? fetchCosmeticOwnershipRow(db, economyKey) : Promise.resolve({ owned: [], equipped: {} }),
    economyKey ? listLockerItemStatesForOwner(db, economyKey) : Promise.resolve([]),
    role === 'student' && avatarKey ? getOrCreateLockerPublicKey(db, avatarKey) : Promise.resolve(''),
  ]);

  const profile = {
    ...profileRaw,
    bio: resolveProfileBio(accountBioRow ? accountBioRow.bio : null, profileRaw.legacy_avatar_bio),
  };
  delete profile.legacy_avatar_bio;

  const submissions = attachStateToOwnerItems(
    [...polls, ...missions, ...news, ...feedItems],
    lockerStateRows,
    ownerItemTypeFromSubmission
  );
  const txRows = walletBundle.transactions || [];

  const ownedItems = economyKey ? deriveOwnedItemsFromTransactions(cosmeticSpendRows) : [];
  const purchaseItems = economyKey ? derivePurchaseHistoryFromTransactions(cosmeticSpendRows) : [];
  const tableOwnedIds = economyKey ? mergeOwnedItemIds(cosmeticRow.owned, ownedItems) : [];
  const ownedItemsMerged = tableOwnedIds.map((itemId) => {
    const fromTx = ownedItems.find((o) => o.item_id === itemId);
    return (
      fromTx || {
        item_id: itemId,
        item_name: itemId,
        cost: null,
        purchased_at: cosmeticRow.updated_at || null,
        transaction_id: null,
        source: 'lantern_cosmetic_ownership',
      }
    );
  });
  const equippedMap = cosmeticRow.equipped || {};
  const equippedList = equippedItemsList(equippedMap);

  const submissionsCategory =
    role === 'student' || role === 'teacher' || role === 'admin'
      ? lockerCategory(true, null, submissions)
      : lockerCategory(false, 'unsupported_role', []);

  const walletCategory = {
    available: walletBundle.available,
    reason: walletBundle.reason,
    balance: walletBundle.balance != null ? walletBundle.balance : null,
    earned: walletBundle.earned != null ? walletBundle.earned : null,
    spent: walletBundle.spent != null ? walletBundle.spent : null,
    transactions: walletBundle.transactions || [],
  };

  const purchasesCategory = economyKey
    ? lockerCategory(true, null, purchaseItems)
    : lockerCategory(false, role === 'teacher' || role === 'admin' ? 'no_economy_key_for_role' : 'account_link_missing', []);

  const ownedItemsCategory = economyKey
    ? lockerCategory(true, null, ownedItemsMerged, {
        derivation: 'lantern_cosmetic_ownership_and_transactions',
        owned_ids: tableOwnedIds,
        note: 'Owned IDs merge D1 inventory with cosmetic spend transactions.',
      })
    : lockerCategory(false, role === 'teacher' || role === 'admin' ? 'no_economy_key_for_role' : 'account_link_missing', []);

  const equippedItemsCategory = economyKey
    ? lockerCategory(true, null, equippedList, {
        derivation: 'lantern_cosmetic_ownership',
        equipped: equippedMap,
      })
    : lockerCategory(false, role === 'teacher' || role === 'admin' ? 'no_economy_key_for_role' : 'account_link_missing', [], {
        equipped: {},
      });

  const achievementItems = economyKey ? enrichAchievementItems(achievementRows) : [];
  const achievementsCategory = economyKey
    ? lockerCategory(true, null, achievementItems, {
        required_for_pilot: true,
        unlocked_count: achievementItems.filter((a) => a.unlocked).length,
      })
    : lockerCategory(false, role === 'teacher' || role === 'admin' ? 'no_economy_key_for_role' : 'account_link_missing', [], {
        required_for_pilot: true,
      });

  const recognitionsCategory =
    role === 'student' && submissionKey
      ? lockerCategory(true, null, recognitions)
      : lockerCategory(
          false,
          role === 'teacher' || role === 'admin' ? 'not_applicable_for_role' : 'account_link_missing',
          []
        );

  const progress = await fetchLockerProgress(db, economyKey, submissionKey, env);

  return {
    ok: true,
    account: {
      username,
      display_name: displayName,
      role,
    },
    identity: {
      student_character_name: role === 'student' ? studentCharacterName : null,
      teacher_id: role === 'teacher' || role === 'admin' ? teacherId : null,
      mtss_student_id: role === 'student' ? mtssStudentId : null,
      economy_character_name: economyCharacterName,
      economy_key: economyKey,
    },
    profile,
    submissions: submissionsCategory,
    wallet: walletCategory,
    purchases: purchasesCategory,
    owned_items: ownedItemsCategory,
    equipped_items: equippedItemsCategory,
    achievements: achievementsCategory,
    recognitions: recognitionsCategory,
    progress,
    locker_public_key: role === 'student' ? lockerPublicKey || null : null,
    locker_item_state: lockerCategory(true, null, lockerStateRows || [], {
      featured_count: (lockerStateRows || []).filter((s) => s && s.featured).length,
      archived_count: (lockerStateRows || []).filter((s) => s && s.owner_archived_at).length,
    }),
  };
}

export async function handleLockerRoutes(request, url, path, env, cors, deps) {
  const jsonResponse = deps.jsonResponse;
  const db = env.DB;

  if (request.method === 'GET' && path === '/api/locker/me') {
    const rejectedParam = lockerRejectIdentityParams(url);
    if (rejectedParam) {
      return jsonResponse({ ok: false, error: 'identity_params_not_allowed', param: rejectedParam }, 400, cors);
    }

    const session = await requireLockerSession(request, env, deps);
    if (session.error) return jsonResponse(session.error, session.status, cors);

    const origin = url.origin || '';
    const body = await buildLockerMeResponse(session.account, env, origin);
    return jsonResponse(body, 200, cors);
  }

  if (request.method === 'GET' && path === '/api/locker/personal-feed') {
    const rejectedParam = lockerRejectIdentityParams(url);
    if (rejectedParam) {
      return jsonResponse({ ok: false, error: 'identity_params_not_allowed', param: rejectedParam }, 400, cors);
    }
    const session = await requireLockerSession(request, env, deps);
    if (session.error) return jsonResponse(session.error, session.status, cors);
    if (!session.economyKey) {
      return jsonResponse({ ok: false, error: 'account_link_missing' }, 400, cors);
    }
    const origin = url.origin || '';
    const params = Object.fromEntries(url.searchParams.entries());
    const body = await buildLockerPersonalFeed(db, origin, session.account, session.economyKey, params);
    return jsonResponse(body, 200, cors);
  }

  if (request.method === 'PATCH' && path === '/api/locker/cosmetics/equip') {
    const rejectedParam = lockerRejectIdentityParams(url);
    if (rejectedParam) {
      return jsonResponse({ ok: false, error: 'identity_params_not_allowed', param: rejectedParam }, 400, cors);
    }
    const session = await requireLockerSession(request, env, deps);
    if (session.error) return jsonResponse(session.error, session.status, cors);
    if (!session.economyKey) {
      return jsonResponse({ ok: false, error: 'account_link_missing' }, 400, cors);
    }
    let body;
    try {
      body = JSON.parse(await request.text() || '{}');
    } catch (_) {
      return jsonResponse({ ok: false, error: 'invalid_json' }, 400, cors);
    }
    const category = String(body.category || '').trim();
    const cosmeticId = body.cosmetic_id != null ? String(body.cosmetic_id).trim() : '';
    if (!category) return jsonResponse({ ok: false, error: 'missing_category' }, 400, cors);
    const result = await setEquippedCosmetic(db, session.economyKey, category, cosmeticId || null);
    if (!result.ok) return jsonResponse(result, 400, cors);
    return jsonResponse({ ok: true, equipped: result.equipped }, 200, cors);
  }

  if (request.method === 'PATCH' && path === '/api/locker/me/bio') {
    const rejectedParam = lockerRejectIdentityParams(url);
    if (rejectedParam) {
      return jsonResponse({ ok: false, error: 'identity_params_not_allowed', param: rejectedParam }, 400, cors);
    }
    const session = await requireLockerSession(request, env, deps);
    if (session.error) return jsonResponse(session.error, session.status, cors);
    if (!session.economyKey) {
      return jsonResponse({ ok: false, error: 'account_link_missing' }, 400, cors);
    }
    let body;
    try {
      body = JSON.parse((await request.text()) || '{}');
    } catch (_) {
      return jsonResponse({ ok: false, error: 'invalid_json' }, 400, cors);
    }
    const rejectedBodyKey = lockerRejectBodyIdentityKeys(body);
    if (rejectedBodyKey) {
      return jsonResponse({ ok: false, error: 'identity_params_not_allowed', param: rejectedBodyKey }, 400, cors);
    }
    if (!Object.prototype.hasOwnProperty.call(body, 'bio')) {
      return jsonResponse({ ok: false, error: 'missing_bio' }, 400, cors);
    }
    const sanitized = sanitizeBioInput(body.bio);
    if (!sanitized.ok) return jsonResponse(sanitized, 400, cors);
    let result;
    try {
      result = await updateAccountBio(db, session.account.username, sanitized.bio);
    } catch (err) {
      console.error('[locker] bio save failed', err);
      return jsonResponse({ ok: false, error: 'bio_update_failed' }, 500, cors);
    }
    if (!result.ok) return jsonResponse(result, 400, cors);
    return jsonResponse(
      {
        ok: true,
        profile: {
          bio: result.bio,
          updated_at: result.updated_at,
        },
      },
      200,
      cors
    );
  }

  if (request.method === 'GET' && path === '/api/locker/me/wallet/transactions') {
    const rejectedParam = lockerRejectIdentityParams(url);
    if (rejectedParam) {
      return jsonResponse({ ok: false, error: 'identity_params_not_allowed', param: rejectedParam }, 400, cors);
    }
    const session = await requireLockerSession(request, env, deps);
    if (session.error) return jsonResponse(session.error, session.status, cors);
    if (!session.economyKey) {
      return jsonResponse({ ok: false, error: 'account_link_missing' }, 400, cors);
    }
    const offsetRaw = parseInt(url.searchParams.get('offset') || '0', 10);
    const limitRaw = parseInt(url.searchParams.get('limit') || '25', 10);
    const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0;
    const limit = Number.isFinite(limitRaw) ? Math.min(50, Math.max(1, limitRaw)) : 25;
    const recent = await db
      .prepare(
        'SELECT id, character_name, delta, kind, source, note, created_at, meta_json FROM lantern_transactions WHERE character_name = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
      )
      .bind(session.economyKey, limit + 1, offset)
      .all();
    const rawRows = recent.results || [];
    const hasMore = rawRows.length > limit;
    const transactions = rawRows.slice(0, limit).map((r) => ({
      id: r.id,
      character_name: r.character_name,
      delta: r.delta,
      kind: r.kind || '',
      source: r.source || '',
      note: r.note || '',
      created_at: r.created_at,
      meta: parseTxMeta(r.meta_json),
    }));
    return jsonResponse({ ok: true, transactions, has_more: hasMore, offset, limit }, 200, cors);
  }

  if (request.method === 'PATCH' && path === '/api/locker/item-state') {
    const rejectedParam = lockerRejectIdentityParams(url);
    if (rejectedParam) {
      return jsonResponse({ ok: false, error: 'identity_params_not_allowed', param: rejectedParam }, 400, cors);
    }
    const session = await requireLockerSession(request, env, deps);
    if (session.error) return jsonResponse(session.error, session.status, cors);
    if (!session.economyKey) {
      return jsonResponse({ ok: false, error: 'account_link_missing' }, 400, cors);
    }
    let body;
    try {
      body = JSON.parse((await request.text()) || '{}');
    } catch (_) {
      return jsonResponse({ ok: false, error: 'invalid_json' }, 400, cors);
    }
    const rejectedBodyKey = lockerRejectBodyIdentityKeys(body);
    if (rejectedBodyKey) {
      return jsonResponse({ ok: false, error: 'identity_params_not_allowed', param: rejectedBodyKey }, 400, cors);
    }
    let result;
    try {
      result = await applyLockerItemAction(db, session.account, session.economyKey, body, {
        pilotEconomyCharacterName: deps.pilotEconomyCharacterName,
        durableAccountKeyFromPilotAccount,
      });
    } catch (err) {
      if (err instanceof LockerItemStateSchemaError || (err && err.error === 'locker_item_state_schema_required')) {
        return jsonResponse({ ok: false, error: 'locker_item_state_schema_required' }, 503, cors);
      }
      throw err;
    }
    if (!result.ok) return jsonResponse(result, result.status || 400, cors);
    const histAction = String((body && body.action) || '').trim().toLowerCase();
    if (histAction === 'archive' || histAction === 'reopen_revision') {
      try {
        await recordEventForAccount(db, session.account, {
          itemType: result.item_type,
          itemId: result.item_id,
          eventType: histAction === 'archive' ? 'owner_archived' : 'owner_reopened',
          note:
            histAction === 'reopen_revision'
              ? 'Reopened for Revision'
              : result.archive_kind === 'archive_for_later'
                ? 'Archived for Later'
                : 'Archived from My Locker',
        });
      } catch (_) {}
    }
    return jsonResponse(result, 200, cors);
  }

  if (request.method === 'GET' && path.startsWith('/api/locker/showcase/')) {
    const rejectedParam = lockerRejectIdentityParams(url);
    if (rejectedParam) {
      return jsonResponse({ ok: false, error: 'identity_params_not_allowed', param: rejectedParam }, 400, cors);
    }
    const session = await requireLockerSession(request, env, deps);
    if (session.error) return jsonResponse(session.error, session.status, cors);
    const publicKey = decodeURIComponent(path.slice('/api/locker/showcase/'.length).split('/')[0] || '');
    const origin = url.origin || '';
    const showcase = await buildLockerShowcase(db, origin, publicKey, session.account, session.economyKey);
    if (!showcase.ok) return jsonResponse(showcase, showcase.status || 404, cors);
    return jsonResponse(showcase, 200, cors);
  }

  if (request.method === 'POST' && path === '/api/locker/achievements/unlock') {
    return jsonResponse(
      {
        ok: false,
        error: 'achievement_unlock_client_forbidden',
        message: 'Achievements are awarded only by verified server events.',
      },
      410,
      cors
    );
  }

  return jsonResponse({ ok: false, error: 'Method or path not allowed' }, 405, cors);
}
