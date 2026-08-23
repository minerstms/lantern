/**
 * Prompt #257B — authoritative game play economy (display + entitlement hints).
 */
(function (global) {
  'use strict';

  var cache = null;
  var entitlements = Object.create(null);
  var loadPromise = null;

  function apiBase() {
    if (typeof global.LANTERN_AVATAR_API === 'undefined' || global.LANTERN_AVATAR_API === null) return '';
    return String(global.LANTERN_AVATAR_API).replace(/\/$/, '');
  }

  function defaultResolved() {
    return {
      free: false,
      playsPerNugget: 1,
      nuggetDebit: 1,
      copy: {
        card_meta: '1 Nugget = 1 Play',
        pregame_cost: '1 Nugget = 1 Play',
        play_action: 'Play for 1 Nugget',
        insufficient: 'You need 1 Nugget to play.',
      },
    };
  }

  function gameRow(idOrName) {
    if (!cache || !cache.games) return null;
    var key = String(idOrName || '').trim();
    if (!key) return null;
    for (var i = 0; i < cache.games.length; i++) {
      var g = cache.games[i];
      if (g.id === key || g.name === key) return g;
    }
    return null;
  }

  function resolvedFor(idOrName) {
    var row = gameRow(idOrName);
    if (!row) return defaultResolved();
    return {
      free: !!row.free,
      playsPerNugget: row.playsPerNugget || 1,
      nuggetDebit: row.nuggetDebit != null ? row.nuggetDebit : row.free ? 0 : 1,
      copy: row.copy || defaultResolved().copy,
      override_mode: row.override_mode,
      effective_mode: row.effective_mode,
    };
  }

  function entitlementFor(idOrName) {
    var row = gameRow(idOrName);
    if (!row) return null;
    return entitlements[row.id] || null;
  }

  function hasRemainingEntitlement(idOrName) {
    var ent = entitlementFor(idOrName);
    return !!(ent && ent.plays_remaining > 0);
  }

  function nuggetDebitRequired(idOrName) {
    var r = resolvedFor(idOrName);
    if (r.free) return 0;
    if (hasRemainingEntitlement(idOrName)) return 0;
    return 1;
  }

  function formatCardMeta(idOrName) {
    var ent = entitlementFor(idOrName);
    if (ent && ent.plays_remaining > 0) {
      return 'Play — ' + (ent.plays_used + 1) + ' of ' + ent.plays_total + ' Plays';
    }
    return resolvedFor(idOrName).copy.card_meta;
  }

  function formatPregameCost(idOrName) {
    var ent = entitlementFor(idOrName);
    if (ent && ent.plays_remaining > 0) {
      return 'Play — ' + (ent.plays_used + 1) + ' of ' + ent.plays_total + ' Plays';
    }
    return resolvedFor(idOrName).copy.pregame_cost;
  }

  function formatPlayAction(idOrName) {
    var ent = entitlementFor(idOrName);
    if (ent && ent.plays_remaining > 0) {
      return 'Play — ' + (ent.plays_used + 1) + ' of ' + ent.plays_total + ' Plays';
    }
    return resolvedFor(idOrName).copy.play_action;
  }

  function formatInsufficient(idOrName) {
    return resolvedFor(idOrName).copy.insufficient;
  }

  function load(force) {
    if (loadPromise && !force) return loadPromise;
    var base = apiBase();
    var url = (base || '') + '/api/settings/nugget-economy';
    loadPromise = fetch(url, { credentials: 'include' })
      .then(function (r) {
        return r.json();
      })
      .then(function (res) {
        if (res && res.ok && res.game_economy) {
          cache = res.game_economy;
          entitlements = res.play_entitlements || Object.create(null);
        }
        return res;
      })
      .catch(function () {
        return null;
      })
      .finally(function () {
        loadPromise = null;
      });
    return loadPromise;
  }

  function applyTransactResult(gameIdOrName, transactRes) {
    if (!transactRes || !transactRes.ok) return;
    var row = gameRow(gameIdOrName);
    if (!row) return;
    var meta = transactRes.meta || (transactRes.bundle ? null : null);
    if (transactRes.bundle) {
      entitlements[row.id] = {
        bundle_id: transactRes.bundle.bundle_id,
        plays_total: transactRes.bundle.plays_total,
        plays_used: transactRes.bundle.plays_used != null ? transactRes.bundle.plays_used : 0,
        plays_remaining: transactRes.bundle.plays_remaining,
      };
    } else if (meta && meta.bundle_id && meta.bundle_plays_total) {
      var used = meta.bundle_play_index || 1;
      var total = meta.bundle_plays_total;
      entitlements[row.id] = {
        bundle_id: meta.bundle_id,
        plays_total: total,
        plays_used: used,
        plays_remaining: Math.max(0, total - used),
      };
    }
  }

  global.LanternGameEconomy = {
    load: load,
    resolvedFor: resolvedFor,
    entitlementFor: entitlementFor,
    hasRemainingEntitlement: hasRemainingEntitlement,
    nuggetDebitRequired: nuggetDebitRequired,
    formatCardMeta: formatCardMeta,
    formatPregameCost: formatPregameCost,
    formatPlayAction: formatPlayAction,
    formatInsufficient: formatInsufficient,
    applyTransactResult: applyTransactResult,
    getCache: function () {
      return cache;
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
