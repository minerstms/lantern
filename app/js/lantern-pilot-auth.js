/**
 * Server session: GET /api/auth/me (HttpOnly cookie). Identity is not defined by localStorage.
 * @see lantern-worker — /api/auth/login, /api/auth/me, /api/auth/logout
 */
(function (global) {
  'use strict';

  function apiBase() {
    var a = global.LANTERN_AVATAR_API;
    return a ? String(a).replace(/\/$/, '') : '';
  }

  function fetchMe() {
    var base = apiBase();
    if (!base) return Promise.resolve({ ok: false, authenticated: false, error: 'no_api' });
    return global
      .fetch(base + '/api/auth/me', { method: 'GET', credentials: 'include' })
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

  function loginUrlWithReturn() {
    var ret =
      global.location.pathname + global.location.search + (global.location.hash || '');
    return '/login.html?return=' + encodeURIComponent(ret);
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
      var ret =
        global.location.pathname + global.location.search + (global.location.hash || '');
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
    redirectIfPasswordChangeRequired: redirectIfPasswordChangeRequired,
  };
  global.LanternAuth = sessionApi;
  global.LanternPilotAuth = sessionApi;
})(typeof window !== 'undefined' ? window : this);
