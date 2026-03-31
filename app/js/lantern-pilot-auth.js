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

  /** Sync adopted character for legacy APIs that read LANTERN_ADOPTED_CHARACTER — values come from server /me only. */
  function applyStudentStorageFromSession(data) {
    if (!data || data.role !== 'student') return;
    var scn = data.student_character_name ? String(data.student_character_name).trim() : '';
    if (!scn) return;
    try {
      global.localStorage.setItem(
        'LANTERN_ADOPTED_CHARACTER',
        JSON.stringify({
          character_id: scn,
          name: scn,
          avatar: '🌟',
        })
      );
    } catch (e) {}
  }

  function applyStudentStorageFromLoginResponse(res) {
    if (!res || res.role !== 'student') return;
    var scn = res.student_character_name ? String(res.student_character_name).trim() : '';
    if (!scn) return;
    try {
      global.localStorage.setItem(
        'LANTERN_ADOPTED_CHARACTER',
        JSON.stringify({
          character_id: scn,
          name: scn,
          avatar: '🌟',
        })
      );
    } catch (e) {}
  }

  function loginUrlWithReturn() {
    var ret =
      global.location.pathname + global.location.search + (global.location.hash || '');
    return '/login?return=' + encodeURIComponent(ret);
  }

  var sessionApi = {
    fetchMe: fetchMe,
    applyStudentStorageFromSession: applyStudentStorageFromSession,
    applyStudentStorageFromLoginResponse: applyStudentStorageFromLoginResponse,
    loginUrlWithReturn: loginUrlWithReturn,
  };
  global.LanternAuth = sessionApi;
  global.LanternPilotAuth = sessionApi;
})(typeof window !== 'undefined' ? window : this);
