/**
 * Prompt #252A — authenticated peer-safe Locker showcase.
 * Server-side filter only. Never returns private workflow rows.
 */

import { collectApprovedFeed } from './feed-handlers.js';
import { identityKeysForAccount, lockerPersonalFeedTest } from './locker-personal-feed.js';
import { fetchCosmeticOwnershipRow } from './locker-storage.js';
import { durableAccountKeyFromPilotAccount } from './durable-account-key.js';
import {
  avatarCandidatesFromPilotAccount,
  buildAvatarImageUrl,
  collectAvatarLookupCandidates,
  resolveCanonicalAvatarState,
} from './avatar-media-gate.js';
import {
  archivedRefSet,
  isOwnerArchivedRef,
  listArchivedLockerRefs,
  listLockerItemStatesForOwner,
  normalizeLockerItemRef,
} from './locker-item-state.js';
import { resolveLockerPublicKey } from './locker-public-key.js';

function trimStr(v) {
  return v == null ? '' : String(v).trim();
}

function feedItemType(item) {
  const t = trimStr(item && item.type).toLowerCase();
  if (t === 'news' || t === 'shout_out' || t === 'shoutout') return 'news';
  if (t === 'mission') return 'mission_submission';
  if (t === 'poll') return 'poll';
  return 'feed_item';
}

function publicShowcaseItem(item, featured, featuredSort) {
  return {
    id: item.id,
    source: item.source || null,
    type: item.type,
    typeLabel: item.typeLabel || null,
    title: item.title || '',
    body: item.body || '',
    summary: item.summary || '',
    authorDisplayName: item.authorDisplayName || item.author_public_label || null,
    authorPublicLabel: item.authorPublicLabel || item.author_public_label || null,
    authorRole: 'student',
    lockerPublicKey: item.lockerPublicKey || null,
    createdAt: item.createdAt || null,
    approvedAt: item.approvedAt || null,
    thumbnailUrl: item.thumbnailUrl || null,
    imageUrl: item.imageUrl || null,
    fullImageUrl: item.fullImageUrl || null,
    videoUrl: item.videoUrl || null,
    tags: item.tags || [],
    contentSlot: item.contentSlot || {},
    featured: featured ? 1 : 0,
    featured_sort: featured ? featuredSort : null,
  };
}

async function approvedAvatarUrl(db, origin, account, durableKey) {
  const candidates = collectAvatarLookupCandidates(
    durableKey,
    ...avatarCandidatesFromPilotAccount(account)
  );
  const resolved = await resolveCanonicalAvatarState(db, durableKey, {
    candidates,
    includePending: false,
  });
  const stamp =
    (resolved.profile && resolved.profile.updated_at) ||
    (resolved.approved && (resolved.approved.approved_at || resolved.approved.created_at)) ||
    '';
  if (!resolved.publicImageKey) return null;
  return buildAvatarImageUrl(origin, resolved.publicImageKey, stamp);
}

export async function buildLockerShowcase(db, origin, publicKey, viewerAccount, viewerEconomyKey) {
  const hit = await resolveLockerPublicKey(db, publicKey);
  if (!hit || !hit.account) return { ok: false, error: 'not_found', status: 404 };

  const account = hit.account;
  const durable = hit.durable;
  const economyKey = durable || durableAccountKeyFromPilotAccount(account);
  const identityKeys = identityKeysForAccount(account, economyKey);
  const username = trimStr(account.username);

  const viewerKeys = viewerAccount
    ? identityKeysForAccount(viewerAccount, viewerEconomyKey)
    : new Set();
  let viewerIsOwner = false;
  viewerKeys.forEach((k) => {
    if (identityKeys.has(k)) viewerIsOwner = true;
  });

  const [feed, stateRows, archivedRows, cosmeticRow, avatarUrl] = await Promise.all([
    collectApprovedFeed(db, origin, { limit: 300 }),
    listLockerItemStatesForOwner(db, economyKey),
    listArchivedLockerRefs(db, [economyKey, ...Array.from(identityKeys)]),
    fetchCosmeticOwnershipRow(db, economyKey),
    approvedAvatarUrl(db, origin, account, durable),
  ]);

  const archived = archivedRefSet(archivedRows);
  const featuredMap = Object.create(null);
  (stateRows || []).forEach((s) => {
    if (s.featured) featuredMap[s.item_type + ':' + s.item_id] = s.featured_sort;
  });

  const authored = (feed || []).filter((it) =>
    lockerPersonalFeedTest.isSubmittedByIdentity(it, identityKeys, username)
  );

  const visible = [];
  authored.forEach((it) => {
    const ref = normalizeLockerItemRef(feedItemType(it), it.id);
    if (isOwnerArchivedRef(archived, ref.item_type, ref.item_id)) return;
    const fk = ref.item_type + ':' + ref.item_id;
    const featuredSort = featuredMap[fk];
    const featured = featuredSort != null || featuredMap[fk] === 0;
    const isFeatured = Object.prototype.hasOwnProperty.call(featuredMap, fk);
    visible.push(publicShowcaseItem(it, isFeatured, isFeatured ? featuredSort : null));
  });

  visible.sort((a, b) => {
    if (a.featured && !b.featured) return -1;
    if (!a.featured && b.featured) return 1;
    if (a.featured && b.featured) {
      const as = a.featured_sort == null ? 999 : a.featured_sort;
      const bs = b.featured_sort == null ? 999 : b.featured_sort;
      if (as !== bs) return as - bs;
    }
    return String(b.approvedAt || b.createdAt || '').localeCompare(String(a.approvedAt || a.createdAt || ''));
  });

  const equipped = cosmeticRow && cosmeticRow.equipped && typeof cosmeticRow.equipped === 'object' ? cosmeticRow.equipped : {};
  const displayName = trimStr(account.display_name) || trimStr(account.student_character_name) || 'Student';

  return {
    ok: true,
    viewer_is_owner: viewerIsOwner,
    locker_public_key: hit.publicKey || null,
    identity: {
      display_name: displayName,
      role: 'student',
    },
    profile: {
      avatar: avatarUrl,
    },
    equipped: equipped,
    featured: visible.filter((it) => it.featured),
    items: visible,
    empty: visible.length === 0,
    empty_message: 'Nothing on display yet.',
  };
}

export function showcaseFeedItemType(item) {
  return feedItemType(item);
}
