/**
 * Lantern — canonical avatar resolution.
 * Single source of truth for student visual identity:
 * (a) approved uploaded avatar image (from Worker GET /api/avatar/status → active_image)
 * (b) legacy icon/emoji (passed as legacyEmoji only — never overrides active_image)
 * (c) default placeholder emoji
 *
 * IDENTITY-BEARING SURFACES: Do not read custom_avatar, avatar_image, author_avatar_url, etc.
 * for rendering. Use getCanonicalAvatar(character_name) or attachCanonicalAvatarsToItems().
 * The account key is character_name (same query param as /api/avatar/status).
 * Prompt #218 — prefer immutable authorAvatarKey / authorId (e.g. rick.radle), not display labels.
 * Prompt #221 — LANTERN_AVATAR_API === '' means same-origin /api (Pages proxy), NOT "API off".
 */
(function (global) {
  var DEFAULT_EMOJI = '🌟';

  /** Prompt #239 — one static T-logo fallback. Not an R2/Web Admin avatar. */
  var CANONICAL_FALLBACK_AVATAR_PATH = '/assets/fallback-avatar.png';

  function canonicalFallbackAvatarUrl() {
    return CANONICAL_FALLBACK_AVATAR_PATH;
  }

  /** Last-resort inline SVG if the static asset fails to load. */
  function svgDefaultAvatarDataUri() {
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#2a3a52"/><circle cx="32" cy="26" r="12" fill="rgba(255,255,255,.35)"/><ellipse cx="32" cy="52" rx="18" ry="14" fill="rgba(255,255,255,.38)"/></svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  /** Single canonical identity key for avatar resolution (Worker + cards + profile). */
  var CANONICAL_IDENTITY_KEY = 'character_name';

  /* Absolute Worker media URLs → same-origin /api paths (matches lantern-media.js). */
  var LANTERN_WORKER_MEDIA_RE = /^https?:\/\/lantern-api\.mrradle\.workers\.dev(\/api\/[^\s]*)$/i;

  /**
   * API prefix for /api/*.
   * - null → API not configured (skip fetch)
   * - '' → same-origin Pages proxy (production)
   * - 'https://…' → absolute Worker base
   */
  function getAvatarApiBase() {
    if (typeof global === 'undefined' || typeof global.LANTERN_AVATAR_API === 'undefined' || global.LANTERN_AVATAR_API === null) {
      return null;
    }
    return String(global.LANTERN_AVATAR_API).replace(/\/$/, '');
  }

  function toSameOriginAvatarUrl(url) {
    var s = String(url || '').trim();
    if (!s) return s;
    var m = s.match(LANTERN_WORKER_MEDIA_RE);
    return m ? m[1] : s;
  }

  /**
   * Resolve canonical avatar for a character.
   * @param {string} characterName - Durable account key (username / student economy id), not "Rick R."
   * @param {string} [legacyEmoji] - Fallback emoji when no approved image
   * @returns {Promise<{ imageUrl: string|null, emoji: string }>}
   */
  function getCanonicalAvatar(characterName, legacyEmoji) {
    var name = normalizeAvatarAccountKey(characterName);
    var emoji = String(legacyEmoji || '').trim() || DEFAULT_EMOJI;
    var base = getAvatarApiBase();
    if (base === null || !name) {
      return Promise.resolve({ imageUrl: null, emoji: emoji });
    }
    var url = base + '/api/avatar/status?character_name=' + encodeURIComponent(name);
    return fetch(url, { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data || data.ok === false) return { imageUrl: null, emoji: emoji };
        var st = data.status || {};
        var raw = st.active_image != null ? String(st.active_image).trim() : '';
        if (!raw || raw === 'null' || raw === 'undefined') return { imageUrl: null, emoji: emoji };
        return { imageUrl: toSameOriginAvatarUrl(raw), emoji: emoji };
      })
      .catch(function () { return { imageUrl: null, emoji: emoji }; });
  }

  /**
   * Resolve avatars for multiple characters (e.g. for feed or picker). Returns a map characterName -> { imageUrl, emoji }.
   * @param {Array<{ characterName: string, legacyEmoji?: string }>} items
   * @returns {Promise<Object<string, { imageUrl: string|null, emoji: string }>>}
   */
  function getCanonicalAvatarMap(items) {
    var map = {};
    var list = Array.isArray(items) ? items : [];
    var promises = list.map(function (item) {
      var name = String((item && item.characterName) || '').trim();
      var legacy = (item && item.legacyEmoji) ? String(item.legacyEmoji).trim() : '';
      return getCanonicalAvatar(name, legacy || undefined).then(function (r) {
        if (name) map[name] = r;
        return r;
      });
    });
    return Promise.all(promises).then(function () { return map; });
  }

  /**
   * Legacy emoji from local LANTERN_DATA profile/character rows — input to getCanonicalAvatar only.
   * Never use as a direct render URL.
   */
  function getLegacyEmojiForCharacter(characterName) {
    var name = String(characterName || '').trim();
    if (!name) return DEFAULT_EMOJI;
    try {
      var LD = global.LANTERN_DATA;
      if (LD && typeof LD.getProfiles === 'function') {
        var prof = LD.getProfiles()[name] || {};
        var em = String(prof.avatar || '').trim();
        if (em) return em;
      }
      if (LD && typeof LD.getCharacters === 'function') {
        var chars = LD.getCharacters() || [];
        var i;
        for (i = 0; i < chars.length; i++) {
          if (String(chars[i].name || '').trim() === name) {
            return String(chars[i].avatar || '').trim() || DEFAULT_EMOJI;
          }
        }
        for (i = 0; i < chars.length; i++) {
          if (String(chars[i].character_id || '').trim() === name) {
            return String(chars[i].avatar || '').trim() || DEFAULT_EMOJI;
          }
        }
      }
    } catch (e) {}
    return DEFAULT_EMOJI;
  }

  /** Strip staff: prefix so avatar profiles (username PK) resolve. */
  function normalizeAvatarAccountKey(raw) {
    var s = String(raw || '').trim();
    if (!s) return '';
    var low = s.toLowerCase();
    if (low.indexOf('staff_id:') === 0) return '';
    if (low.indexOf('staff:') === 0) return s.slice(6).trim();
    return s;
  }

  /** Prompt #218/#221/#149 — durable Locker avatar key first; never prefer display labels. */
  function avatarLookupKeysFromItem(p) {
    if (!p || typeof p !== 'object') return [];
    var keys = [];
    function push(v) {
      var s = normalizeAvatarAccountKey(v);
      if (!s) return;
      if (keys.indexOf(s) < 0) keys.push(s);
    }
    push(p.authorAvatarKey);
    push(p.author_avatar_key);
    push(p.authorId);
    push(p.author_id);
    push(p.actor_id);
    push(p[CANONICAL_IDENTITY_KEY]);
    return keys;
  }

  function accountKeyFromItem(p) {
    var keys = avatarLookupKeysFromItem(p);
    return keys.length ? keys[0] : '';
  }

  /**
   * Pick best resolved avatar: prefer an approved image; prefer durable account key when both have images.
   */
  function mergeCanonicalAvatarForItem(map, p) {
    var keys = avatarLookupKeysFromItem(p);
    var bestImg = null;
    var bestAny = null;
    var i;
    for (i = 0; i < keys.length; i++) {
      var hit = map[keys[i]];
      if (!hit) continue;
      if (!bestAny) bestAny = hit;
      if (hit.imageUrl && String(hit.imageUrl).trim()) {
        bestImg = hit;
        break;
      }
    }
    return bestImg || bestAny || null;
  }

  /**
   * Mutates each item: sets _canonicalAvatar = { imageUrl, emoji } for identity-bearing rows.
   * Prompt #218/#221 — fetch authorAvatarKey / authorId before display-name aliases.
   */
  function attachCanonicalAvatarsToItems(items) {
    var list = Array.isArray(items) ? items : [];
    var names = [];
    list.forEach(function (p) {
      avatarLookupKeysFromItem(p).forEach(function (k) {
        if (names.indexOf(k) < 0) names.push(k);
      });
    });
    var req = names.map(function (n) {
      return { characterName: n, legacyEmoji: getLegacyEmojiForCharacter(n) };
    });
    return getCanonicalAvatarMap(req).then(function (map) {
      list.forEach(function (p) {
        var resolved = mergeCanonicalAvatarForItem(map, p);
        if (resolved) p._canonicalAvatar = resolved;
      });
      return list;
    });
  }

  global.LanternAvatar = {
    getCanonicalAvatar: getCanonicalAvatar,
    getCanonicalAvatarMap: getCanonicalAvatarMap,
    getLegacyEmojiForCharacter: getLegacyEmojiForCharacter,
    attachCanonicalAvatarsToItems: attachCanonicalAvatarsToItems,
    accountKeyFromItem: accountKeyFromItem,
    avatarLookupKeysFromItem: avatarLookupKeysFromItem,
    normalizeAvatarAccountKey: normalizeAvatarAccountKey,
    getAvatarApiBase: getAvatarApiBase,
    toSameOriginAvatarUrl: toSameOriginAvatarUrl,
    svgDefaultAvatarDataUri: svgDefaultAvatarDataUri,
    canonicalFallbackAvatarUrl: canonicalFallbackAvatarUrl,
    CANONICAL_FALLBACK_AVATAR_PATH: CANONICAL_FALLBACK_AVATAR_PATH,
    CANONICAL_IDENTITY_KEY: CANONICAL_IDENTITY_KEY,
    DEFAULT_EMOJI: DEFAULT_EMOJI
  };
})(typeof window !== 'undefined' ? window : this);
