/**
 * Reusable Lantern ↔ donor-game bridge (parent / lab shell).
 *
 * Donor iframe emits gameplay events only. Lantern owns:
 *   authenticated identity, game ID, score submission, leaderboard,
 *   reward eligibility, Nugget grant logic, marquee integration.
 *
 * Donor-supplied username / account identity is ignored.
 * Donor-supplied Nugget amounts are ignored. Lantern never lets donor
 * code choose a reward amount.
 */
(function (global) {
  'use strict';

  var MESSAGE_SOURCE = 'lantern-donor-adapter';
  var MESSAGE_TYPE = 'lantern-game';
  var ALLOWED_EVENTS = {
    gameStarted: true,
    scoreChanged: true,
    gameEnded: true,
    achievement: true,
  };

  var FORBIDDEN_PAYLOAD_KEYS = [
    'username',
    'character_name',
    'characterName',
    'user_id',
    'userId',
    'account',
    'display_name',
    'nuggets',
    'nugget_amount',
    'nuggetAmount',
    'reward',
    'delta',
    'wallet',
  ];

  /** Lab prototype: do not write the TMS Nugget ledger. */
  var NUGGET_WRITES_ENABLED = false;

  function numeric(value, fallback) {
    var n = Math.floor(Number(value));
    return Number.isFinite(n) ? n : fallback;
  }

  function apiBase() {
    if (typeof global.LANTERN_ECONOMY_API !== 'undefined' && global.LANTERN_ECONOMY_API !== null && String(global.LANTERN_ECONOMY_API).trim() !== '') {
      return String(global.LANTERN_ECONOMY_API).replace(/\/$/, '');
    }
    if (typeof global.LANTERN_AVATAR_API !== 'undefined' && global.LANTERN_AVATAR_API !== null) {
      return String(global.LANTERN_AVATAR_API).replace(/\/$/, '');
    }
    return '';
  }

  /**
   * Session identity only. Never accept a donor- or client-supplied name.
   */
  function resolveSessionIdentity() {
    var auth = global.LanternAuth || global.LanternPilotAuth;
    if (auth && typeof auth.adoptedFromPilotMe === 'function') {
      var adopted = auth.adoptedFromPilotMe();
      if (adopted && adopted.name) {
        return {
          character_name: String(adopted.name).trim(),
          display_name: String(adopted.display_name || adopted.name).trim(),
        };
      }
    }
    if (auth && typeof auth.sessionEconomyKey === 'function') {
      var key = String(auth.sessionEconomyKey() || '').trim();
      if (key) return { character_name: key, display_name: key };
    }
    return null;
  }

  function sanitizeIncoming(data) {
    if (!data || data.source !== MESSAGE_SOURCE || data.type !== MESSAGE_TYPE) {
      return null;
    }
    if (!ALLOWED_EVENTS[data.event]) return null;
    var raw = data.payload && typeof data.payload === 'object' ? data.payload : {};
    var stripped = [];
    FORBIDDEN_PAYLOAD_KEYS.forEach(function (k) {
      if (Object.prototype.hasOwnProperty.call(raw, k) && raw[k] != null && raw[k] !== '') {
        stripped.push(k);
      }
    });
    var payload = {
      score: numeric(raw.score, 0),
      floors: numeric(raw.floors, 0),
      failed: numeric(raw.failed, 0),
    };
    if (raw.reason != null) payload.reason = String(raw.reason).slice(0, 80);
    if (raw.name != null) payload.name = String(raw.name).slice(0, 80);
    return {
      event: data.event,
      payload: payload,
      strippedForbiddenKeys: stripped,
    };
  }

  function isTrustedMessage(event, iframe) {
    if (!event) return false;
    if (iframe && iframe.contentWindow && event.source !== iframe.contentWindow) return false;
    try {
      if (event.origin && global.location && event.origin !== global.location.origin) return false;
    } catch (e) {}
    return true;
  }

  /**
   * POST /api/leaderboards/record using the existing Lantern API.
   * game_name comes from Lantern config, not the donor.
   * character_name comes from the session, not the donor.
   */
  function submitLeaderboardScore(opts) {
    opts = opts || {};
    var identity = resolveSessionIdentity();
    if (!identity || !identity.character_name) {
      return Promise.resolve({ ok: false, error: 'no_session_identity' });
    }
    var gameName = String(opts.gameName || '').trim();
    if (!gameName) {
      return Promise.resolve({ ok: false, error: 'missing_lantern_game_name' });
    }
    var score = numeric(opts.score, NaN);
    if (!Number.isFinite(score)) {
      return Promise.resolve({ ok: false, error: 'invalid_score' });
    }
    var ignoredDonorFields = [];
    FORBIDDEN_PAYLOAD_KEYS.forEach(function (k) {
      if (opts[k] != null && opts[k] !== '') ignoredDonorFields.push(k);
    });
    var body = {
      game_name: gameName,
      character_name: identity.character_name,
      score: score,
      score_display: String(opts.scoreDisplay || score + ' pts').slice(0, 100),
      meta: {
        source: 'lantern-game-bridge',
        game_id: String(opts.gameId || '').trim(),
        floors: numeric(opts.floors, 0),
      },
    };
    var url = apiBase() + '/api/leaderboards/record';
    if (typeof global.fetch !== 'function') {
      return Promise.resolve({ ok: false, error: 'fetch_unavailable', ignoredDonorFields: ignoredDonorFields });
    }
    return global
      .fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      .then(function (r) {
        return r.json().then(function (res) {
          return {
            ok: !!(r.ok && res && res.ok),
            id: res && res.id,
            error: res && res.error,
            httpStatus: r.status,
            ignoredDonorFields: ignoredDonorFields,
            submitted: body,
          };
        }).catch(function () {
          return { ok: false, error: 'invalid_json', ignoredDonorFields: ignoredDonorFields };
        });
      })
      .catch(function () {
        return { ok: false, error: 'network', ignoredDonorFields: ignoredDonorFields };
      });
  }

  /**
   * Prepared Nugget path — disabled in this lab prototype.
   * Existing authoritative integration (do not call from lab):
   *   charge: LanternGamesPaidStart.startPaidGame(gameName) → POST /api/economy/transact
   *           kind game_play, server delta exactly -1, identity from session
   *   reward: awardGameWinWithEconomy → kind game_win, server delta exactly +1
   *           (client delta is rejected if it is not +1)
   *   first game: completeFirstGame after a successful paid start
   *   idempotency: meta.run_id → lantern:${kind}:${run_id}
   */
  function maybeGrantQualifyingReward(opts) {
    opts = opts || {};
    var ignored = [];
    FORBIDDEN_PAYLOAD_KEYS.forEach(function (k) {
      if (opts[k] != null && opts[k] !== '') ignored.push(k);
    });
    if (!NUGGET_WRITES_ENABLED) {
      return Promise.resolve({
        ok: true,
        skipped: true,
        reason: 'nugget_writes_disabled',
        ignoredDonorFields: ignored,
      });
    }
    return Promise.resolve({
      ok: false,
      error: 'nugget_writes_not_implemented_in_lab',
      ignoredDonorFields: ignored,
    });
  }

  function attach(iframe, handlers) {
    handlers = handlers || {};
    if (!iframe) return { detach: function () {} };

    function onMessage(event) {
      if (!isTrustedMessage(event, iframe)) return;
      var incoming = sanitizeIncoming(event.data);
      if (!incoming) return;
      var fn =
        incoming.event === 'gameStarted'
          ? handlers.onGameStarted
          : incoming.event === 'scoreChanged'
            ? handlers.onScoreChanged
            : incoming.event === 'gameEnded'
              ? handlers.onGameEnded
              : incoming.event === 'achievement'
                ? handlers.onAchievement
                : null;
      if (typeof fn === 'function') {
        fn(incoming.payload, incoming);
      }
    }

    if (global.addEventListener) global.addEventListener('message', onMessage);
    return {
      detach: function () {
        if (global.removeEventListener) global.removeEventListener('message', onMessage);
      },
    };
  }

  global.LanternGameBridge = {
    MESSAGE_SOURCE: MESSAGE_SOURCE,
    MESSAGE_TYPE: MESSAGE_TYPE,
    ALLOWED_EVENTS: ALLOWED_EVENTS,
    FORBIDDEN_PAYLOAD_KEYS: FORBIDDEN_PAYLOAD_KEYS,
    NUGGET_WRITES_ENABLED: NUGGET_WRITES_ENABLED,
    sanitizeIncoming: sanitizeIncoming,
    resolveSessionIdentity: resolveSessionIdentity,
    submitLeaderboardScore: submitLeaderboardScore,
    maybeGrantQualifyingReward: maybeGrantQualifyingReward,
    attach: attach,
    isTrustedMessage: isTrustedMessage,
  };
})(typeof window !== 'undefined' ? window : globalThis);
