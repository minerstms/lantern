/**
 * Lantern class access — one source of truth for access state and gate UI.
 * Worker-enforced; frontend only displays and collects code. (No visible demo/simulation UI.)
 *
 * Temporary dev bypass: set window.LANTERN_DEBUG_CLASS_ACCESS = true before class-access.js runs
 * (or any time before bootstrap) to skip the gate and treat access as resolved without a class code.
 */
(function (global) {
  var STORAGE_KEY = 'lantern_class_access_token';

  /** Read at call time so the flag can be set after this file loads. */
  function isDebugClassAccessBypass() {
    try {
      var w = typeof global !== 'undefined' ? global : null;
      return !!(w && w.LANTERN_DEBUG_CLASS_ACCESS === true);
    } catch (e) {
      return false;
    }
  }

  function debugResolvedState() {
    return {
      ok: true,
      accessState: 'debug_bypass',
      tokenValid: true,
      mode: 'debug',
      message: 'LANTERN_DEBUG_CLASS_ACCESS',
    };
  }

  function getStoredToken() {
    try {
      return (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(STORAGE_KEY)) || '';
    } catch (_) {
      return '';
    }
  }

  function setStoredToken(token) {
    try {
      if (typeof sessionStorage !== 'undefined') {
        if (token) sessionStorage.setItem(STORAGE_KEY, token);
        else sessionStorage.removeItem(STORAGE_KEY);
      }
    } catch (_) {}
  }

  /**
   * Resolve current access state from Worker. Sends stored token in X-Class-Token header and optionally in query.
   * @param {string} apiBase - Worker base URL (no trailing slash)
   * @param {string} [token] - Optional token; if omitted uses stored token
   * @param {function(object)} callback - Receives { ok, mode, accessState, tokenValid, simCondition, message, expires_at }
   */
  function getAccessState(apiBase, token, callback) {
    if (typeof token === 'function') {
      callback = token;
      token = getStoredToken();
    } else if (!token) {
      token = getStoredToken();
    }
    if (typeof callback !== 'function') return;
    if (isDebugClassAccessBypass()) {
      callback(debugResolvedState());
      return;
    }
    if (!apiBase) return;
    var url = apiBase + '/api/class-access/state' + (token ? '?token=' + encodeURIComponent(token) : '');
    var headers = {};
    if (token) headers['X-Class-Token'] = token;
    fetch(url, { credentials: 'include', headers: headers })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        var state = res && res.ok ? res : { ok: false, accessState: 'live_locked_no_session', tokenValid: false };
        if (state && !state.tokenValid && (state.accessState === 'live_token_expired' || state.accessState === 'live_session_revoked')) setStoredToken('');
        callback(state);
      })
      .catch(function () {
        callback({ ok: false, accessState: 'live_locked_no_session', tokenValid: false });
      });
  }

  /**
   * Whether the user must see the gate (locked, no valid access).
   */
  function shouldShowGate(state) {
    if (!state || !state.ok) return true;
    if (state.tokenValid) return false;
    var s = (state.accessState || '').trim();
    return s === 'live_locked_no_session' || s === 'live_locked_session_available' || s === 'live_token_expired' || s === 'live_session_revoked';
  }

  /**
   * Render the access gate into container. On success calls onSuccess(token) and caller can hide gate / show content.
   * @param {HTMLElement|string} container - Element or id
   * @param {string} apiBase
   * @param {function(string)} onSuccess - Receives token
   */
  function renderGate(container, apiBase, onSuccess) {
    var el = typeof container === 'string' ? (document.getElementById(container) || document.querySelector(container)) : container;
    if (!el || !apiBase || typeof onSuccess !== 'function') return;
    el.innerHTML =
      '<div class="classAccessGate" style="max-width:420px;margin:0 auto;padding:28px 20px;text-align:center;">' +
      '<h2 class="classAccessGateTitle" style="font-weight:1000;font-size:28px;margin-bottom:8px;">Lantern Class Access</h2>' +
      '<p class="classAccessGateHint" style="color:var(--muted);font-size:22px;margin-bottom:20px;">Your teacher will write the class code on the board.</p>' +
      '<input type="text" id="classAccessCodeInput" placeholder="Enter class code" class="classAccessCodeInput" style="width:100%;padding:14px 18px;border-radius:14px;border:2px solid var(--line);background:rgba(255,255,255,.08);color:var(--ink);font-size:24px;margin-bottom:14px;text-align:center;" />' +
      '<p id="classAccessGateError" class="classAccessGateError" style="display:none;color:var(--bad);font-weight:800;font-size:22px;margin-bottom:12px;"></p>' +
      '<button type="button" id="classAccessJoinBtn" class="btn good" style="padding:14px 24px;font-size:24px;font-weight:800;">Join Class</button>' +
      '</div>';
    var input = el.querySelector('#classAccessCodeInput');
    var errEl = el.querySelector('#classAccessGateError');
    var btn = el.querySelector('#classAccessJoinBtn');
    var joinInProgress = false;
    function doJoin() {
      if (joinInProgress) return;
      var code = (input && input.value || '').trim();
      if (!code) {
        if (errEl) { errEl.textContent = 'Please enter the code.'; errEl.style.display = 'block'; }
        return;
      }
      if (errEl) errEl.style.display = 'none';
      joinInProgress = true;
      if (btn) { btn.disabled = true; btn.textContent = 'Joining…'; }
      fetch(apiBase + '/api/class-access/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code }),
      })
        .then(function (r) { return r.json(); })
        .then(function (res) {
          joinInProgress = false;
          if (btn) { btn.disabled = false; btn.textContent = 'Join Class'; }
          if (res && res.ok && res.token) {
            setStoredToken(res.token);
            onSuccess(res.token);
          } else {
            if (errEl) { errEl.textContent = (res && res.error) || 'Code not recognized. Check the board and try again.'; errEl.style.display = 'block'; }
          }
        })
        .catch(function () {
          joinInProgress = false;
          if (btn) { btn.disabled = false; btn.textContent = 'Join Class'; }
          if (errEl) { errEl.textContent = 'Something went wrong. Try again.'; errEl.style.display = 'block'; }
        });
    }
    if (btn) btn.addEventListener('click', doJoin);
    if (input) input.addEventListener('keydown', function (e) { if (e.key === 'Enter') doJoin(); });
  }

  /**
   * Reveal protected content (call when access allowed). Hides gate-style overlay.
   * @param {string|HTMLElement} contentWrap - Id or element for main content wrapper
   */
  function setContentVisible(contentWrap) {
    var node = typeof contentWrap === 'string' ? (document.getElementById(contentWrap) || document.querySelector(contentWrap)) : contentWrap;
    if (node) {
      node.style.visibility = 'visible';
      node.style.opacity = '1';
    }
  }

  /**
   * Clear legacy banner placeholder (no visible class-access status strip).
   * @param {HTMLElement|string} container - Element or id (e.g. classAccessBannerEl)
   */
  function renderBanner(container) {
    var bannerNode = typeof container === 'string' ? (document.getElementById(container) || document.querySelector(container)) : container;
    if (bannerNode) {
      bannerNode.innerHTML = '';
      bannerNode.style.display = 'none';
    }
  }

  function log() { if (isDebugClassAccessBypass() && typeof console !== 'undefined' && console.log) console.log.apply(console, ['[class-access]'].concat([].slice.call(arguments))); }

  /**
   * Single bootstrap for class access: read token, call state API, show gate or content.
   * Call once per gated page after DOM is ready. Also runs automatically when this script loads
   * on DOMContentLoaded if classAccessGateWrap exists.
   * Dispatches 'lantern-class-access-resolved' with { state, tokenValid } so pages can run refresh/init.
   */
  function bootstrapPageAccess() {
    var gateWrap = document.getElementById('classAccessGateWrap');
    if (!gateWrap) return;
    var apiBase = (typeof window !== 'undefined' && window.LANTERN_AVATAR_API) ? (window.LANTERN_AVATAR_API + '').replace(/\/$/, '') : '';
    var contentWrap = document.getElementById('classAccessContentWrap');
    if (isDebugClassAccessBypass()) {
      log('bootstrap: LANTERN_DEBUG_CLASS_ACCESS — bypass gate, treat as resolved');
      gateWrap.style.display = 'none';
      setContentVisible(contentWrap);
      renderBanner('classAccessBannerEl');
      try {
        document.dispatchEvent(new CustomEvent('lantern-class-access-resolved', { detail: { state: debugResolvedState(), tokenValid: true } }));
      } catch (e) {}
      return;
    }
    if (!apiBase) {
      log('bootstrap: no apiBase, showing content');
      setContentVisible(contentWrap);
      try { document.dispatchEvent(new CustomEvent('lantern-class-access-resolved', { detail: { state: null, tokenValid: true } })); } catch (e) {}
      return;
    }
    var token = getStoredToken();
    log('bootstrap: start', token ? 'token found' : 'no token');
    getAccessState(apiBase, function (state) {
      log('bootstrap: state received', state && state.tokenValid ? 'tokenValid' : 'show gate');
      var showGate = shouldShowGate(state);
      if (showGate) {
        gateWrap.style.display = 'flex';
        gateWrap.style.alignItems = 'center';
        gateWrap.style.justifyContent = 'center';
        if (!gateWrap.querySelector('.classAccessGate')) renderGate(gateWrap, apiBase, function () { location.reload(); });
      } else {
        gateWrap.style.display = 'none';
        setContentVisible(contentWrap);
      }
      renderBanner('classAccessBannerEl');
      try {
        document.dispatchEvent(new CustomEvent('lantern-class-access-resolved', { detail: { state: state, tokenValid: !!(state && state.tokenValid) } }));
      } catch (e) {}
    });
  }

  global.LanternClassAccess = {
    getAccessState: getAccessState,
    shouldShowGate: shouldShowGate,
    renderGate: renderGate,
    renderBanner: renderBanner,
    setContentVisible: setContentVisible,
    getStoredToken: getStoredToken,
    setStoredToken: setStoredToken,
    bootstrapPageAccess: bootstrapPageAccess,
    STORAGE_KEY: STORAGE_KEY,
  };

  (function () {
    function run() {
      if (!document.getElementById('classAccessGateWrap')) return;
      bootstrapPageAccess();
    }
    if (typeof document !== 'undefined') {
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
      else run();
    }
  })();
})(typeof window !== 'undefined' ? window : this);
