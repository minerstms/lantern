/**
 * Prompt #167 / #252 — canonical Lantern ticker contract (copy, icons, destinations).
 * Presentation only. Does not change which events qualify for the marquee.
 */
import { resolveRegisteredLeaderboardGame } from './lantern-game-catalog.js';

export const TICKER_ICONS = Object.freeze({
  mission_created: '🎯',
  mission_completed: '🎯',
  poll_created: '📊',
  shout_out: '📣',
  recognition: '📣',
  news: '📰',
  news_photo: '📸',
  news_good_news: '⭐',
  leaderboard_entry: '🏆',
});

export const TICKER_TYPE_LABELS = Object.freeze({
  mission_created: 'Mission',
  mission_completed: 'Mission',
  poll_created: 'Poll',
  shout_out: 'Shout-Out',
  recognition: 'Shout-Out',
  news: 'Post',
  news_photo: 'Photo',
  news_good_news: 'Good News',
  leaderboard_entry: 'Leaderboard',
});

export const TICKER_PRIMARY_ROLE = Object.freeze({
  mission_created: 'creator',
  mission_completed: 'completer',
  poll_created: 'creator',
  shout_out: 'author',
  recognition: 'author',
  news: 'author',
  leaderboard_entry: 'player',
});

function trimStr(v) {
  return v == null ? '' : String(v).trim();
}

export function tickerTypeLabel(type) {
  return TICKER_TYPE_LABELS[String(type || '').trim()] || '';
}

export function tickerIconForType(type) {
  return TICKER_ICONS[String(type || '').trim()] || '';
}

export function tickerPrimaryRoleForType(type) {
  return TICKER_PRIMARY_ROLE[String(type || '').trim()] || '';
}

export function tickerNewsKind(category) {
  const c = String(category || '').trim().toLowerCase();
  if (/photo|picture|image/.test(c)) return 'news_photo';
  if (/good[_\s-]?news/.test(c)) return 'news_good_news';
  return 'news';
}

export function tickerDestinationForEvent(type, extra) {
  const t = String(type || '').trim();
  if (t === 'mission_created' || t === 'mission_completed') return 'missions.html';
  if (t === 'poll_created' || t === 'shout_out' || t === 'recognition' || t === 'news') return 'explore.html';
  if (t === 'leaderboard_entry') {
    const game = trimStr(extra && (extra.game_name || extra.object_title));
    const g = game ? resolveRegisteredLeaderboardGame(game) : null;
    if (g && g.id) return 'games.html?game=' + encodeURIComponent(g.id);
    return 'games.html';
  }
  return '';
}

/**
 * Compact public ticker line: Type: Subject — Author
 * Name and object are already-resolved display strings.
 */
export function formatTickerCopy(parts) {
  const type = trimStr(parts && parts.type);
  const name = trimStr(parts && parts.primary_name);
  const object = trimStr(parts && parts.object_title);
  const label = trimStr(parts && parts.label) || tickerTypeLabel(type) || 'Lantern';
  if (object && name && object === name) {
    return label + ' — ' + name;
  }
  if (label && object && name) return label + ': ' + object + ' — ' + name;
  if (label && object) return label + ': ' + object;
  if (label && name) return label + ' — ' + name;
  return trimStr(parts && parts.fallback) || label || 'Lantern';
}

export function parseCompactTickerCopy(publicText) {
  const full = trimStr(publicText);
  const withAuthor = full.match(/^([^:]+):\s*(.*?)\s+[—–]\s+(.+)$/);
  if (withAuthor) {
    return { typeLabel: trimStr(withAuthor[1]), subject: trimStr(withAuthor[2]), author: trimStr(withAuthor[3]) };
  }
  const typeAuthor = full.match(/^([^:]+)\s+[—–]\s+(.+)$/);
  if (typeAuthor && !/:/.test(typeAuthor[1])) {
    return { typeLabel: trimStr(typeAuthor[1]), subject: '', author: trimStr(typeAuthor[2]) };
  }
  const typeSubject = full.match(/^([^:]+):\s*(.+)$/);
  if (typeSubject) {
    return { typeLabel: trimStr(typeSubject[1]), subject: trimStr(typeSubject[2]), author: '' };
  }
  return { typeLabel: '', subject: '', author: '' };
}

export function tickerNameAndRest(publicText, primaryName) {
  const parsed = parseCompactTickerCopy(publicText);
  const name = trimStr(primaryName) || parsed.author;
  if (parsed.typeLabel) {
    const rest = parsed.subject ? parsed.typeLabel + ': ' + parsed.subject : parsed.typeLabel;
    return { name, rest };
  }
  const full = trimStr(publicText);
  if (name && full.indexOf(name) === 0) {
    return { name, rest: full.slice(name.length) };
  }
  return { name: '', rest: full };
}

export function looksLikeSystemLogTickerCopy(text) {
  const t = String(text || '');
  return (
    /Mission Created\s*—/.test(t) ||
    /Mission Completed\s*—/.test(t) ||
    /Poll Created\s*—/.test(t) ||
    /New mission from Teacher:/.test(t) ||
    /New poll from Teacher:/.test(t) ||
    /Submission approved:/.test(t) ||
    /A student created/.test(t) ||
    /created a (mission|poll)/.test(t) ||
    /\breached the\b/.test(t) ||
    /\breached #\d+/.test(t) ||
    /got a Shout-Out from/.test(t)
  );
}
