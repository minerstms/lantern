/**
 * Authenticated Locker session: GET /api/locker/me (credentials: include).
 * The browser never chooses whose Locker is displayed.
 */
(function (global) {
  'use strict';

  function apiBase() {
    var a = global.LANTERN_AVATAR_API;
    return a != null && String(a).trim() !== '' ? String(a).replace(/\/$/, '') : '';
  }

  function lockerMeUrl() {
    var base = apiBase();
    return base ? base + '/api/locker/me' : '/api/locker/me';
  }

  function currentReturnPath() {
    var auth = global.LanternAuth || global.LanternPilotAuth;
    if (auth && typeof auth.currentReturnPath === 'function') {
      return auth.currentReturnPath();
    }
    try {
      return global.location.pathname + global.location.search + (global.location.hash || '');
    } catch (e) {
      return '/locker.html';
    }
  }

  function loginUrlWithReturn() {
    var auth = global.LanternAuth || global.LanternPilotAuth;
    if (auth && typeof auth.loginUrlWithReturn === 'function') {
      return auth.loginUrlWithReturn();
    }
    return '/login.html?return=' + encodeURIComponent(currentReturnPath());
  }

  function redirectIfPasswordChangeRequired(res, jsonBody) {
    var auth = global.LanternAuth || global.LanternPilotAuth;
    if (auth && typeof auth.redirectIfPasswordChangeRequired === 'function') {
      return auth.redirectIfPasswordChangeRequired(res, jsonBody);
    }
    if (res && res.status === 403 && jsonBody && jsonBody.error === 'must_change_password') {
      global.location.replace(
        '/change-password.html?return=' + encodeURIComponent(currentReturnPath())
      );
      return true;
    }
    return false;
  }

  var loadPromise = null;

  function fetchLockerMe() {
    if (loadPromise) return loadPromise;
    loadPromise = global
      .fetch(lockerMeUrl(), { method: 'GET', credentials: 'include', cache: 'no-store' })
      .then(function (res) {
        return res.text().then(function (t) {
          var body;
          try {
            body = t ? JSON.parse(t) : { ok: false, error: 'empty' };
          } catch (e) {
            body = { ok: false, error: 'invalid_json', httpStatus: res.status };
          }
          if (redirectIfPasswordChangeRequired(res, body)) {
            return { ok: false, error: 'must_change_password', redirecting: true };
          }
          if (!res.ok || !body || !body.ok) {
            if (res.status === 401 || (body && body.error === 'not_authenticated')) {
              global.location.replace(loginUrlWithReturn());
              return { ok: false, error: 'not_authenticated', redirecting: true };
            }
            loadPromise = null;
            return body || { ok: false, error: 'locker_me_failed', httpStatus: res.status };
          }
          global.LANTERN_LOCKER_ME = body;
          return body;
        });
      })
      .catch(function () {
        loadPromise = null;
        return { ok: false, error: 'network' };
      });
    return loadPromise;
  }

  function getLockerMe() {
    return global.LANTERN_LOCKER_ME && global.LANTERN_LOCKER_ME.ok ? global.LANTERN_LOCKER_ME : null;
  }

  function lockerCategoryItems(cat) {
    if (!cat) return [];
    if (Array.isArray(cat)) return cat;
    return Array.isArray(cat.items) ? cat.items : [];
  }

  function lockerCategoryAvailable(cat) {
    if (!cat) return false;
    if (Array.isArray(cat)) return true;
    return cat.available !== false;
  }

  function lockerCategoryReason(cat) {
    if (!cat || Array.isArray(cat)) return null;
    return cat.reason != null ? cat.reason : null;
  }

  function economyKeyFromLocker(locker) {
    if (!locker || !locker.ok) return '';
    var id = locker.identity || {};
    if (id.economy_key != null && String(id.economy_key).trim()) return String(id.economy_key).trim();
    var acct = locker.account || {};
    var role = String(acct.role || '').trim().toLowerCase();
    if (role === 'teacher' || role === 'admin') {
      return '';
    }
    return String(id.economy_character_name || id.student_character_name || acct.username || '').trim();
  }

  function displayNameFromLocker(locker) {
    if (!locker || !locker.ok) return '';
    var acct = locker.account || {};
    var dn = acct.display_name != null ? String(acct.display_name).trim() : '';
    if (dn) return dn;
    var id = locker.identity || {};
    var scn = id.student_character_name != null ? String(id.student_character_name).trim() : '';
    if (scn) return scn;
    return acct.username != null ? String(acct.username).trim() : '';
  }

  function adoptedFromLocker(locker) {
    if (!locker || !locker.ok) return null;
    var acct = locker.account || {};
    var id = locker.identity || {};
    var role = String(acct.role || '').trim().toLowerCase();
    var displayName = displayNameFromLocker(locker);
    if (role === 'teacher' || role === 'admin') {
      var teacherKey = economyKeyFromLocker(locker) || acct.username;
      return {
        character_id: teacherKey,
        name: teacherKey,
        display_name: displayName,
        username: acct.username,
        role: role,
        teacher_id: id.teacher_id || null,
        avatar: '🌟',
      };
    }
    var walletKey = economyKeyFromLocker(locker);
    if (!walletKey) return null;
    return {
      character_id: walletKey,
      name: walletKey,
      display_name: displayName,
      student_character_name: id.student_character_name || '',
      username: acct.username || '',
      role: role,
      avatar: '🌟',
    };
  }

  function invalidateLockerMe() {
    loadPromise = null;
    try {
      delete global.LANTERN_LOCKER_ME;
    } catch (e) {
      global.LANTERN_LOCKER_ME = null;
    }
  }

  function lockerApiBase() {
    return apiBase();
  }

  function callUpdateBio(bioText) {
    var base = lockerApiBase();
    var url = (base || '') + '/api/locker/me/bio';
    return global
      .fetch(url, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bio: bioText == null ? '' : String(bioText) }),
      })
      .then(function (res) {
        return res.json().then(function (body) {
          if (redirectIfPasswordChangeRequired(res, body)) {
            return { ok: false, error: 'must_change_password', redirecting: true };
          }
          if (!res.ok || !body || !body.ok) {
            return body || { ok: false, error: 'bio_update_failed' };
          }
          if (global.LANTERN_LOCKER_ME && global.LANTERN_LOCKER_ME.ok) {
            if (!global.LANTERN_LOCKER_ME.profile) global.LANTERN_LOCKER_ME.profile = {};
            global.LANTERN_LOCKER_ME.profile.bio =
              body.profile && body.profile.bio != null && String(body.profile.bio).trim()
                ? String(body.profile.bio).trim()
                : null;
          }
          return body;
        });
      })
      .catch(function () {
        return { ok: false, error: 'network' };
      });
  }

  function callEquipCosmetic(category, cosmeticId) {
    var base = lockerApiBase();
    var url = (base || '') + '/api/locker/cosmetics/equip';
    return global
      .fetch(url, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: category || '', cosmetic_id: cosmeticId || '' }),
      })
      .then(function (res) {
        return res.json().then(function (body) {
          if (!res.ok || !body || !body.ok) {
            return body || { ok: false, error: 'equip_failed' };
          }
          invalidateLockerMe();
          return fetchLockerMe().then(function () {
            return body;
          });
        });
      })
      .catch(function () {
        return { ok: false, error: 'network' };
      });
  }

  function callUnlockAchievement(achievementId, source, meta) {
    return Promise.resolve({ ok: false, error: 'achievement_unlock_client_forbidden' });
  }

  function callItemState(action, itemType, itemId) {
    var base = lockerApiBase();
    var url = (base || '') + '/api/locker/item-state';
    return global
      .fetch(url, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: action || '',
          item_type: itemType || '',
          item_id: itemId || '',
        }),
      })
      .then(function (res) {
        return res.json().then(function (body) {
          if (redirectIfPasswordChangeRequired(res, body)) {
            return { ok: false, error: 'must_change_password', redirecting: true };
          }
          if (!res.ok || !body || !body.ok) {
            return body || { ok: false, error: 'item_state_failed', httpStatus: res.status };
          }
          invalidateLockerMe();
          return fetchLockerMe().then(function () {
            return body;
          });
        });
      })
      .catch(function () {
        return { ok: false, error: 'network' };
      });
  }

  function fetchLockerShowcase(publicKey) {
    var key = String(publicKey || '').trim();
    if (!key) return Promise.resolve({ ok: false, error: 'missing_key' });
    var base = lockerApiBase();
    var url = (base || '') + '/api/locker/showcase/' + encodeURIComponent(key);
    return global
      .fetch(url, { method: 'GET', credentials: 'include', cache: 'no-store' })
      .then(function (res) {
        return res.text().then(function (t) {
          var body;
          try {
            body = t ? JSON.parse(t) : { ok: false, error: 'empty' };
          } catch (e) {
            body = { ok: false, error: 'invalid_json', httpStatus: res.status };
          }
          if (redirectIfPasswordChangeRequired(res, body)) {
            return { ok: false, error: 'must_change_password', redirecting: true };
          }
          if (res.status === 401 || (body && body.error === 'not_authenticated')) {
            global.location.replace(loginUrlWithReturn());
            return { ok: false, error: 'not_authenticated', redirecting: true };
          }
          if (!res.ok || !body || !body.ok) {
            return body || { ok: false, error: 'showcase_failed', httpStatus: res.status };
          }
          return body;
        });
      })
      .catch(function () {
        return { ok: false, error: 'network' };
      });
  }

  global.LanternLockerMe = {
    fetchLockerMe: fetchLockerMe,
    invalidateLockerMe: invalidateLockerMe,
    callEquipCosmetic: callEquipCosmetic,
    callUpdateBio: callUpdateBio,
    callItemState: callItemState,
    fetchLockerShowcase: fetchLockerShowcase,
    getLockerMe: getLockerMe,
    lockerCategoryItems: lockerCategoryItems,
    lockerCategoryAvailable: lockerCategoryAvailable,
    lockerCategoryReason: lockerCategoryReason,
    economyKeyFromLocker: economyKeyFromLocker,
    displayNameFromLocker: displayNameFromLocker,
    adoptedFromLocker: adoptedFromLocker,
  };
})(typeof window !== 'undefined' ? window : this);
