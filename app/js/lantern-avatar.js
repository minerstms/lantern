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
 */
(function (global) {
  var DEFAULT_EMOJI = '🌟';

  /** Single canonical identity key for avatar resolution (Worker + cards + profile). */
  var CANONICAL_IDENTITY_KEY = 'character_name';

  function getAvatarApiBase() {
    var base = (typeof global !== 'undefined' && global.LANTERN_AVATAR_API) ? String(global.LANTERN_AVATAR_API || '').trim() : '';
    return base ? base.replace(/\/$/, '') : '';
  }

  /**
   * Resolve canonical avatar for a character.
   * @param {string} characterName - Character identifier (e.g. display name or character_name from verify).
   * @param {string} [legacyEmoji] - Fallback emoji when no approved image (e.g. from profile.avatar or data-avatar).
   * @returns {Promise<{ imageUrl: string|null, emoji: string }>} imageUrl when approved avatar exists, else null; emoji for fallback display.
   */
  function getCanonicalAvatar(characterName, legacyEmoji) {
    var name = String(characterName || '').trim();
    var emoji = String(legacyEmoji || '').trim() || DEFAULT_EMOJI;
    var base = getAvatarApiBase();
    if (!base || !name) {
      return Promise.resolve({ imageUrl: null, emoji: emoji });
    }
    var url = base + '/api/avatar/status?character_name=' + encodeURIComponent(name);
    return fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data || data.ok === false) return { imageUrl: null, emoji: emoji };
        var st = data.status || {};
        var raw = st.active_image != null ? String(st.active_image).trim() : '';
        if (!raw || raw === 'null' || raw === 'undefined') return { imageUrl: null, emoji: emoji };
        return { imageUrl: raw, emoji: emoji };
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

  /** Prompt #218 — durable Locker avatar key first; never prefer "Rick R." / display labels. */
  function avatarLookupKeysFromItem(p) {
    if (!p || typeof p !== 'object') return [];
    var keys = [];
    function push(v) {
      var s = String(v || '').trim();
      if (!s) return;
      if (keys.indexOf(s) < 0) keys.push(s);
    }
    push(p.authorAvatarKey);
    push(p.author_avatar_key);
    push(p.authorId);
    push(p.author_id);
    push(p.actor_id);
    push(p[CANONICAL_IDENTITY_KEY]);
    push(p.author_name);
    push(p.authorDisplayName);
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
   * Prompt #218 — fetch authorAvatarKey / authorId before display-name aliases.
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
    CANONICAL_IDENTITY_KEY: CANONICAL_IDENTITY_KEY,
    DEFAULT_EMOJI: DEFAULT_EMOJI
  };
})(typeof window !== 'undefined' ? window : this);
