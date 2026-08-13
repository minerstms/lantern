/**
 * Lantern session helpers: GET /api/auth/me (HttpOnly cookie). Identity comes from the server, not localStorage.
 * Routes: /api/auth/login, /api/auth/me, /api/auth/logout, /api/auth/change-password (see worker/index.js).
 */
(function (global) {
  'use strict';

  /** Default: same-origin /api on Pages (session cookie is first-party). Set a Worker URL only for explicit cross-origin dev. */
  var LANTERN_DEFAULT_AVATAR_API = '';
  if (global.LANTERN_AVATAR_API == null) {
    global.LANTERN_AVATAR_API = LANTERN_DEFAULT_AVATAR_API;
  }

  function apiBase() {
    var a = global.LANTERN_AVATAR_API;
    return a ? String(a).replace(/\/$/, '') : '';
  }

  function getCachedPilotMe() {
    try {
      return global.LANTERN_PILOT_ME && global.LANTERN_PILOT_ME.ok ? global.LANTERN_PILOT_ME : null;
    } catch (e) {
      return null;
    }
  }

  function fetchMe() {
    var base = apiBase();
    var url = base ? base + '/api/auth/me' : '/api/auth/me';
    return global
      .fetch(url, { method: 'GET', credentials: 'include', cache: 'no-store' })
      .then(function (r) {
        return r.text().then(function (t) {
          try {
            return t ? JSON.parse(t) : { ok: false, authenticated: false, error: 'empty' };
          } catch (e) {
            return { ok: false, authenticated: false, error: 'invalid_json', httpStatus: r.status };
          }
        });
      })
      .catch(function () {
        return { ok: false, authenticated: false, error: 'network' };
      });
  }

  /** Match worker /me role strings regardless of casing (e.g. legacy rows vs new inserts). */
  function normalizeRole(r) {
    return String(r || '').trim().toLowerCase();
  }

  /** Path-only: /explore or /explore.html (student home), with optional query/hash ignored. */
  function isGenericExplorePath(pathOrUrl) {
    var pathOnly = String(pathOrUrl || '').split('?')[0].split('#')[0];
    var p = pathOnly.replace(/\/$/, '') || '/';
    return p === '/explore' || p === '/explore.html';
  }

  /** Default app entry after login/password when no specific return is desired. */
  function defaultRoleHomePath(role) {
    var r = normalizeRole(role);
    if (r === 'admin') return '/admin.html';
    if (r === 'teacher') return '/teacher.html';
    return '/explore.html';
  }

  /**
   * After POST /api/auth/logout succeeds: clear client-only keys so Locker/verify UI cannot show a prior user.
   * Pair with navigation to login; does not clear sessionStorage lantern_return_to (login flow sets that next).
   */
  function clearClientIdentityCaches() {
    try {
      if (global.LanternRememberDevice && typeof global.LanternRememberDevice.clearOnLogout === 'function') {
        global.LanternRememberDevice.clearOnLogout();
      }
    } catch (eRem) {}
    try {
      global.localStorage.removeItem('LANTERN_ADOPTED_CHARACTER');
    } catch (e) {}
    try {
      global.localStorage.removeItem('LANTERN_VERIFY_TEACHER_ID');
      global.localStorage.removeItem('LANTERN_VERIFY_NAME');
      global.localStorage.removeItem('LANTERN_VERIFY_CHARACTER_NAME');
    } catch (e2) {}
    try {
      delete global.LANTERN_PILOT_ME;
    } catch (e3) {}
  }

  /** Sync session cache only — do not write LANTERN_ADOPTED_CHARACTER (production identity is server session). */
  function applyStudentStorageFromSession(data) {
    cachePilotMe(data);
  }

  function applyStudentStorageFromLoginResponse(res) {
    cachePilotMe(res);
  }

  function cachePilotMe(data) {
    if (!data || !data.ok) return;
    try {
      global.LANTERN_PILOT_ME = {
        ok: true,
        username: data.username,
        display_name: data.display_name,
        first_name: data.first_name != null ? data.first_name : null,
        last_name: data.last_name != null ? data.last_name : null,
        honorific: data.honorific != null ? data.honorific : null,
        public_display_name: data.public_display_name != null ? data.public_display_name : null,
        public_display_label: data.public_display_label != null ? data.public_display_label : null,
        public_staff_label: data.public_staff_label != null ? data.public_staff_label : null,
        role: data.role,
        student_character_name: data.student_character_name || null,
        teacher_id: data.teacher_id || null,
        mtss_student_id: data.mtss_student_id || null,
        economy_character_name: data.economy_character_name || null,
        must_change_password: data.must_change_password,
        authenticated: data.authenticated !== false,
      };
    } catch (e) {}
  }

  function sessionEconomyKey(me) {
    me = me || (global.LANTERN_PILOT_ME && global.LANTERN_PILOT_ME.ok ? global.LANTERN_PILOT_ME : null);
    if (!me) return '';
    var role = normalizeRole(me.role);
    if (role === 'teacher' || role === 'admin') {
      return me.teacher_id ? String(me.teacher_id).trim() : (me.username ? String(me.username).trim() : '');
    }
    if (role === 'student') {
      return String(me.economy_character_name || me.student_character_name || me.username || '').trim();
    }
    return '';
  }

  function adoptedFromPilotMe() {
    var me = getCachedPilotMe();
    if (!me) return null;
    var key = sessionEconomyKey(me);
    if (!key) return null;
    return {
      character_id: key,
      name: key,
      display_name: me.display_name || me.username || key,
      public_display_name: me.public_display_name || me.public_display_label || '',
      public_display_label: me.public_display_label || me.public_display_name || '',
      student_character_name: me.student_character_name || '',
      username: me.username || '',
      role: me.role || '',
      avatar: '🌟',
    };
  }

  /**
   * Prompt #147 — ordinary human-facing identity is public_display_name.
   * Wallet/API keys (name / character_id) stay the economy key.
   */
  function studentFriendlyDisplayNameFromAdopted(a) {
    if (!a || typeof a !== 'object') return '';
    var pdn = a.public_display_label != null && String(a.public_display_label).trim() ? String(a.public_display_label).trim() : '';
    if (pdn) return pdn;
    pdn = a.public_display_name != null && String(a.public_display_name).trim() ? String(a.public_display_name).trim() : '';
    if (pdn) return pdn;
    var me = getCachedPilotMe();
    if (me) {
      pdn = me.public_display_label != null && String(me.public_display_label).trim() ? String(me.public_display_label).trim() : '';
      if (pdn) return pdn;
      pdn = me.public_display_name != null && String(me.public_display_name).trim() ? String(me.public_display_name).trim() : '';
      if (pdn) return pdn;
    }
    var dn = a.display_name != null && String(a.display_name).trim() ? String(a.display_name).trim() : '';
    if (dn) return dn;
    var scn = a.student_character_name != null && String(a.student_character_name).trim() ? String(a.student_character_name).trim() : '';
    if (scn) return scn;
    var un = a.username != null && String(a.username).trim() ? String(a.username).trim() : '';
    if (un) return un;
    return a.name != null && String(a.name).trim() ? String(a.name).trim() : '';
  }

  /**
   * Defensive: Cloudflare Pages may expose extensionless paths (/locker) after pretty-URL redirects.
   * Map known routes to real .html files so ?return= matches app expectations.
   */
  function normalizeExtensionlessHtmlPath(pathname) {
    var orig = String(pathname || '');
    var p = orig;
    if (p.length > 1 && p.charAt(p.length - 1) === '/') {
      p = p.slice(0, -1);
    }
    var map = {
      '/locker': '/locker.html',
      '/login': '/login.html',
      '/admin': '/admin.html',
      '/teacher': '/teacher.html',
      '/explore': '/explore.html',
      '/games': '/games.html',
      '/game-lab/tower': '/game-lab/tower.html',
      '/missions': '/missions.html',
      '/store': '/store.html',
      '/change-password': '/change-password.html',
    };
    return map[p] || orig;
  }

  /** Path + query + hash for the current document URL (hash from full href). */
  function currentReturnPath() {
    var loc = global.location;
    try {
      var u = new URL(loc.href);
      var path = normalizeExtensionlessHtmlPath(u.pathname);
      return path + u.search + u.hash;
    } catch (e) {
      var path2 = normalizeExtensionlessHtmlPath(loc.pathname);
      return path2 + loc.search + (loc.hash || '');
    }
  }

  function loginUrlWithReturn() {
    try {
      var u = new URL(global.location.href);
      var p = String(u.pathname || '').replace(/\/$/, '') || '/';
      if (p === '/login' || p === '/login.html') {
        return '/login.html' + (u.search || '') + (u.hash || '');
      }
    } catch (e) {}
    var ret = currentReturnPath();
    try {
      global.sessionStorage.setItem('lantern_return_to', ret);
    } catch (e) {}
    return '/login.html?return=' + encodeURIComponent(ret);
  }

  /**
   * Role-based page guard: unauthenticated -> login.html; must_change_password -> change-password.html.
   * mode 'general': student, teacher, or admin.
   * mode 'teacher': teacher or admin (student -> explore.html).
   * mode 'admin': admin only (student -> explore.html, teacher -> teacher.html).
   * @param {{ mode?: 'general'|'admin'|'teacher', pendingHtmlClass?: string }} opts
   * @param {function(object): void} [onAllowed] - receives /me JSON when access is allowed
   */
  function guardPilotPage(opts, onAllowed) {
    var o = opts || {};
    var mode = String(o.mode || 'general').trim().toLowerCase();
    if (mode !== 'general' && mode !== 'teacher' && mode !== 'admin') {
      mode = 'general';
    }
    var pendingClass = o.pendingHtmlClass || 'lantern-pilot-auth-pending';
    try {
      var pathOnly = String(global.location.pathname || '').replace(/\/$/, '') || '/';
      if (pathOnly === '/login' || pathOnly === '/login.html') {
        try {
          global.document.documentElement.classList.remove(pendingClass);
        } catch (e) {}
        return Promise.resolve();
      }
    } catch (e) {}
    return fetchMe().then(function (data) {
      if (data && data.error === 'network') {
        try {
          global.document.documentElement.classList.remove(pendingClass);
        } catch (eNet) {}
        return;
      }
      if (!data || !data.ok || !data.authenticated) {
        global.location.replace(loginUrlWithReturn());
        return;
      }
      cachePilotMe(data);
      if (data.must_change_password) {
        global.location.replace('/change-password.html?return=' + encodeURIComponent(currentReturnPath()));
        return;
      }
      var r = normalizeRole(data.role);
      if (mode === 'admin') {
        if (r === 'student') {
          global.location.replace('/explore.html');
          return;
        }
        if (r === 'teacher') {
          global.location.replace('/teacher.html');
          return;
        }
        if (r !== 'admin') {
          global.location.replace(loginUrlWithReturn());
          return;
        }
      } else if (mode === 'teacher') {
        if (r === 'student') {
          global.location.replace('/explore.html');
          return;
        }
        if (r !== 'teacher' && r !== 'admin') {
          global.location.replace(loginUrlWithReturn());
          return;
        }
      } else {
        if (r !== 'student' && r !== 'teacher' && r !== 'admin') {
          global.location.replace(loginUrlWithReturn());
          return;
        }
      }
      if (typeof onAllowed === 'function') {
        try {
          onAllowed(data);
        } catch (e) {}
      }
      try {
        global.document.documentElement.classList.remove(pendingClass);
      } catch (e2) {}
    }).catch(function () {
      try {
        global.document.documentElement.classList.remove(pendingClass);
      } catch (eCatch) {}
    });
  }

  /** After POST /api/auth/login succeeds: confirm HttpOnly session before navigation. */
  function confirmSessionAfterLogin() {
    return fetchMe().then(function (me) {
      if (!me || me.ok !== true || me.authenticated !== true) {
        return { ok: false, error: 'session_not_confirmed', me: me || null };
      }
      cachePilotMe(me);
      return { ok: true, me: me };
    });
  }

  /** If the worker returned 403 must_change_password (e.g. admin API while temp password is active), go to password screen. */
  function redirectIfPasswordChangeRequired(res, jsonBody) {
    if (
      res &&
      res.status === 403 &&
      jsonBody &&
      jsonBody.error === 'must_change_password'
    ) {
      var loc =
        jsonBody.redirect && String(jsonBody.redirect).indexOf('/') === 0
          ? String(jsonBody.redirect)
          : '/change-password.html';
      if (loc === '/change-password') loc = '/change-password.html';
      var ret = currentReturnPath();
      if (loc.indexOf('change-password') !== -1 && ret && ret.indexOf('change-password') === -1) {
        loc = loc + (loc.indexOf('?') === -1 ? '?' : '&') + 'return=' + encodeURIComponent(ret);
      }
      global.location.replace(loc);
      return true;
    }
    return false;
  }

  /**
   * POST /api/auth/logout — clear HttpOnly session cookie, then redirect caller to login.
   * @returns {Promise<{ ok: boolean, status?: number, error?: string }>}
   */
  function performLogout() {
    var base = apiBase();
    var url = base ? base + '/api/auth/logout' : '/api/auth/logout';
    return global
      .fetch(url, { method: 'POST', credentials: 'include', cache: 'no-store' })
      .then(function (r) {
        return r.text().then(function (t) {
          var body;
          try {
            body = t ? JSON.parse(t) : {};
          } catch (e) {
            body = {};
          }
          return { ok: !!(r.ok && body && body.ok), status: r.status, body: body };
        });
      })
      .then(function (res) {
        if (res.ok) {
          clearClientIdentityCaches();
          global.location.replace('/login.html');
        }
        return res;
      })
      .catch(function () {
        return { ok: false, error: 'network' };
      });
  }

  var sessionApi = {
    fetchMe: fetchMe,
    normalizeRole: normalizeRole,
    isGenericExplorePath: isGenericExplorePath,
    defaultRoleHomePath: defaultRoleHomePath,
    clearClientIdentityCaches: clearClientIdentityCaches,
    performLogout: performLogout,
    cachePilotMe: cachePilotMe,
    sessionEconomyKey: sessionEconomyKey,
    getCachedPilotMe: getCachedPilotMe,
    adoptedFromPilotMe: adoptedFromPilotMe,
    applyStudentStorageFromSession: applyStudentStorageFromSession,
    applyStudentStorageFromLoginResponse: applyStudentStorageFromLoginResponse,
    studentFriendlyDisplayNameFromAdopted: studentFriendlyDisplayNameFromAdopted,
    loginUrlWithReturn: loginUrlWithReturn,
    guardPilotPage: guardPilotPage,
    confirmSessionAfterLogin: confirmSessionAfterLogin,
    redirectIfPasswordChangeRequired: redirectIfPasswordChangeRequired,
  };
  global.LanternAuth = sessionApi;
  global.LanternPilotAuth = sessionApi;
})(typeof window !== 'undefined' ? window : this);
