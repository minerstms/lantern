/**
 * Lantern session helpers: GET /api/auth/me (HttpOnly cookie). Identity comes from the server, not localStorage.
 * Routes: /api/auth/login, /api/auth/me, /api/auth/logout, /api/auth/change-password (see worker/index.js).
 */
(function (global) {
  'use strict';

  /** Default: same-origin /api (Pages Function proxies to Worker). Override with absolute URL for local static dev without Functions. */
  var LANTERN_DEFAULT_AVATAR_API = '';
  if (
    global.LANTERN_AVATAR_API == null ||
    (typeof global.LANTERN_AVATAR_API === 'string' && String(global.LANTERN_AVATAR_API).trim() === '')
  ) {
    global.LANTERN_AVATAR_API = LANTERN_DEFAULT_AVATAR_API;
  }

  function apiBase() {
    var a = global.LANTERN_AVATAR_API;
    return a ? String(a).replace(/\/$/, '') : '';
  }

  function fetchMe() {
    var base = apiBase();
    var url = base ? base + '/api/auth/me' : '/api/auth/me';
    return global
      .fetch(url, { method: 'GET', credentials: 'include' })
      .then(function (r) {
        return r.json();
      })
      .catch(function () {
        return { ok: false, authenticated: false, error: 'network' };
      });
  }

  /** Sync adopted character for legacy APIs that read LANTERN_ADOPTED_CHARACTER — values come from server /me only. Uses student_character_name when set; otherwise login username (e.g. student ID). */
  function applyStudentStorageFromSession(data) {
    if (!data || data.role !== 'student') return;
    var username = data.username ? String(data.username).trim() : '';
    var scn = data.student_character_name ? String(data.student_character_name).trim() : '';
    var characterKey = String(scn || username).trim();
    if (!characterKey) return;
    try {
      global.localStorage.setItem(
        'LANTERN_ADOPTED_CHARACTER',
        JSON.stringify({
          character_id: characterKey,
          name: characterKey,
          avatar: '🌟',
        })
      );
    } catch (e) {}
  }

  function applyStudentStorageFromLoginResponse(res) {
    if (!res || res.role !== 'student') return;
    var username = res.username ? String(res.username).trim() : '';
    var scn = res.student_character_name ? String(res.student_character_name).trim() : '';
    var characterKey = String(scn || username).trim();
    if (!characterKey) return;
    try {
      global.localStorage.setItem(
        'LANTERN_ADOPTED_CHARACTER',
        JSON.stringify({
          character_id: characterKey,
          name: characterKey,
          avatar: '🌟',
        })
      );
    } catch (e) {}
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
    var mode = o.mode || 'general';
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
      if (!data || !data.ok || !data.authenticated) {
        global.location.replace(loginUrlWithReturn());
        return;
      }
      if (data.must_change_password) {
        global.location.replace('/change-password.html?return=' + encodeURIComponent(currentReturnPath()));
        return;
      }
      var r = (data.role || '').trim();
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

  var sessionApi = {
    fetchMe: fetchMe,
    applyStudentStorageFromSession: applyStudentStorageFromSession,
    applyStudentStorageFromLoginResponse: applyStudentStorageFromLoginResponse,
    loginUrlWithReturn: loginUrlWithReturn,
    guardPilotPage: guardPilotPage,
    redirectIfPasswordChangeRequired: redirectIfPasswordChangeRequired,
  };
  global.LanternAuth = sessionApi;
  global.LanternPilotAuth = sessionApi;
})(typeof window !== 'undefined' ? window : this);
