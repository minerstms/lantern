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

  function accountKeyFromItem(p) {
    if (!p || typeof p !== 'object') return '';
    return String(p[CANONICAL_IDENTITY_KEY] || p.author_name || '').trim();
  }

  /**
   * Pick best resolved avatar: prefer an approved image; prefer account key (character_name) when both have images.
   */
  function mergeCanonicalAvatarForItem(map, p) {
    var kChar = String(p.character_name || '').trim();
    var kAuth = String(p.author_name || '').trim();
    var a = kChar && map[kChar] ? map[kChar] : null;
    var b = kAuth && kAuth !== kChar && map[kAuth] ? map[kAuth] : null;
    if (!a && !b) return null;
    var imgA = a && a.imageUrl && String(a.imageUrl).trim();
    var imgB = b && b.imageUrl && String(b.imageUrl).trim();
    if (imgA) return a;
    if (imgB) return b;
    return a || b;
  }

  /**
   * Mutates each item: sets _canonicalAvatar = { imageUrl, emoji } for identity-bearing rows.
   * Fetches both character_name and author_name when both differ so Worker responses keyed by
   * internal id OR public display name both resolve (Contribute rail + opened preview parity with Locker).
   */
  function attachCanonicalAvatarsToItems(items) {
    var list = Array.isArray(items) ? items : [];
    var names = [];
    list.forEach(function (p) {
      var k1 = String(p.character_name || '').trim();
      var k2 = String(p.author_name || '').trim();
      if (k1 && names.indexOf(k1) < 0) names.push(k1);
      if (k2 && names.indexOf(k2) < 0) names.push(k2);
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
    CANONICAL_IDENTITY_KEY: CANONICAL_IDENTITY_KEY,
    DEFAULT_EMOJI: DEFAULT_EMOJI
  };
})(typeof window !== 'undefined' ? window : this);
