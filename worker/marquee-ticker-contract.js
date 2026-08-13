/**
 * Prompt #167 — canonical Lantern ticker contract (copy, icons, destinations).
 * Presentation only. Does not change which events qualify for the marquee.
 */
import { resolveRegisteredLeaderboardGame } from './lantern-game-catalog.js';

export const TICKER_ICONS = Object.freeze({
  mission_created: '🎯',
  mission_completed: '🎯',
  poll_created: '📊',
  shout_out: '⭐',
  recognition: '⭐',
  news: '📰',
  leaderboard_entry: '🏆',
});

export const TICKER_PRIMARY_ROLE = Object.freeze({
  mission_created: 'creator',
  mission_completed: 'completer',
  poll_created: 'creator',
  shout_out: 'recipient',
  recognition: 'recipient',
  news: 'author',
  leaderboard_entry: 'player',
});

function trimStr(v) {
  return v == null ? '' : String(v).trim();
}

export function tickerIconForType(type) {
  return TICKER_ICONS[String(type || '').trim()] || '';
}

export function tickerPrimaryRoleForType(type) {
  return TICKER_PRIMARY_ROLE[String(type || '').trim()] || '';
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
 * Canonical public sentence. Name and object are already-resolved display strings.
 */
export function formatTickerCopy(parts) {
  const type = trimStr(parts && parts.type);
  const name = trimStr(parts && parts.primary_name);
  const object = trimStr(parts && parts.object_title);
  const secondary = trimStr(parts && parts.secondary_name);
  const rank = parts && parts.rank != null && String(parts.rank).trim() !== '' ? String(parts.rank).trim() : '';

  if (type === 'mission_created') {
    if (name && object) return name + ' created a mission: ' + object;
    if (name) return name + ' created a mission';
    return object ? 'A new mission: ' + object : 'A new mission';
  }
  if (type === 'mission_completed') {
    if (name && object) return name + ' completed ' + object;
    if (name) return name + ' completed a mission';
    return object ? 'Someone completed ' + object : 'Mission completed';
  }
  if (type === 'poll_created') {
    if (name && object) return name + ' created a poll: ' + object;
    if (name) return name + ' created a poll';
    return object ? 'A new poll: ' + object : 'A new poll';
  }
  if (type === 'shout_out' || type === 'recognition') {
    if (name && secondary) return name + ' got a Shout-Out from ' + secondary;
    if (name) return name + ' got a Shout-Out';
    return 'Shout-Out';
  }
  if (type === 'news') {
    if (name && object) return name + ' posted: ' + object;
    if (name) return name + ' posted';
    return object ? 'Posted: ' + object : 'News';
  }
  if (type === 'leaderboard_entry') {
    if (name && rank && object) return name + ' reached #' + rank + ' in ' + object;
    if (name && object) return name + ' reached the ' + object + ' leaderboard';
    if (name) return name + ' reached a leaderboard';
    return object ? 'New ' + object + ' leaderboard entry' : 'Leaderboard update';
  }
  return trimStr(parts && parts.fallback) || 'Lantern update';
}

export function tickerNameAndRest(publicText, primaryName) {
  const full = trimStr(publicText);
  const name = trimStr(primaryName);
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
    /Submission approved:/.test(t)
  );
}
