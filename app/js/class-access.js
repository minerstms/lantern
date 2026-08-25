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
    if (apiBase === null) return;
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
  function isRestrictedModeLocked(state) {
    if (!state) return false;
    if (state.accessState === 'restricted_mode_locked' || state.error === 'restricted_mode_locked') return true;
    var rm = state.restrictedMode || state.restricted_mode;
    return !!(rm && rm.active && !rm.allowed);
  }

  function shouldShowGate(state) {
    if (isRestrictedModeLocked(state)) return true;
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
    var ACCESS_REQUEST_POLL_MS = 5000;
    var ACCESS_STATE_POLL_MS = 5000;

    function isAuthenticatedStudent() {
      try {
        var me = global.LANTERN_PILOT_ME;
        if (me && me.ok && String(me.role || '').trim().toLowerCase() === 'student') return true;
        if (global.LanternPilotAuth && typeof global.LanternPilotAuth.getCachedPilotMe === 'function') {
          me = global.LanternPilotAuth.getCachedPilotMe();
          if (me && String(me.role || '').trim().toLowerCase() === 'student') return true;
        }
      } catch (e) {}
      return false;
    }

  function renderGate(container, apiBase, onSuccess) {
    var el = typeof container === 'string' ? (document.getElementById(container) || document.querySelector(container)) : container;
    if (!el || apiBase === null || typeof onSuccess !== 'function') return;
    el.innerHTML =
      '<div class="classAccessGate" style="max-width:420px;margin:0 auto;padding:28px 20px;text-align:center;">' +
      '<h2 class="classAccessGateTitle" style="font-weight:1000;font-size:28px;margin-bottom:8px;">Lantern Class Access</h2>' +
      '<p class="classAccessGateHint" style="color:var(--muted);font-size:22px;margin-bottom:20px;">Your teacher will write the class code on the board.</p>' +
      '<input type="text" id="classAccessCodeInput" placeholder="Enter class code" class="classAccessCodeInput" style="width:100%;padding:14px 18px;border-radius:14px;border:2px solid var(--line);background:rgba(255,255,255,.08);color:var(--ink);font-size:24px;margin-bottom:14px;text-align:center;" />' +
      '<p id="classAccessGateError" class="classAccessGateError" style="display:none;color:var(--bad);font-weight:800;font-size:22px;margin-bottom:12px;"></p>' +
      '<button type="button" id="classAccessJoinBtn" class="btn good" style="padding:14px 24px;font-size:24px;font-weight:800;">Join Class</button>' +
      '<p style="color:var(--muted);font-size:22px;margin:18px 0 10px;">— or —</p>' +
      '<div id="classAccessRequestIdle">' +
      '<p style="color:var(--muted);font-size:22px;margin-bottom:14px;">Lantern access is currently closed.</p>' +
      '<button type="button" id="classAccessRequestBtn" class="btn" style="padding:14px 24px;font-size:24px;font-weight:800;">Request Access</button>' +
      '</div>' +
      '<div id="classAccessRequestNamePanel" style="display:none;">' +
      '<input type="text" id="classAccessRequestNameInput" placeholder="Enter your name" class="classAccessCodeInput" style="width:100%;padding:14px 18px;border-radius:14px;border:2px solid var(--line);background:rgba(255,255,255,.08);color:var(--ink);font-size:24px;margin-bottom:14px;text-align:center;" />' +
      '<button type="button" id="classAccessRequestSendBtn" class="btn" style="padding:14px 24px;font-size:24px;font-weight:800;">Send Request</button>' +
      '</div>' +
      '<div id="classAccessRequestWaitingPanel" style="display:none;">' +
      '<p style="font-size:22px;margin-bottom:6px;">Access requested.</p>' +
      '<p style="color:var(--muted);font-size:22px;margin-bottom:10px;">Your teacher can approve this browser.</p>' +
      '<p id="classAccessRequestPhrase" style="font-weight:1000;font-size:24px;letter-spacing:1px;margin-bottom:14px;"></p>' +
      '<p id="classAccessRequestWaitingMsg" style="color:var(--muted);font-size:22px;">Waiting for approval…</p>' +
      '</div>' +
      '<p id="classAccessRequestError" style="display:none;color:var(--bad);font-weight:800;font-size:22px;margin-top:12px;"></p>' +
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

    // --- Request Access (Phase #31: individual student request -> teacher approval) ---
    var idlePanel = el.querySelector('#classAccessRequestIdle');
    var namePanel = el.querySelector('#classAccessRequestNamePanel');
    var waitingPanel = el.querySelector('#classAccessRequestWaitingPanel');
    var reqErrEl = el.querySelector('#classAccessRequestError');
    var reqBtn = el.querySelector('#classAccessRequestBtn');
    var nameInput = el.querySelector('#classAccessRequestNameInput');
    var sendBtn = el.querySelector('#classAccessRequestSendBtn');
    var phraseEl = el.querySelector('#classAccessRequestPhrase');
    var waitingMsgEl = el.querySelector('#classAccessRequestWaitingMsg');
    var pollTimer = null;
    var requestInProgress = false;

    function showPanel(which) {
      if (idlePanel) idlePanel.style.display = which === 'idle' ? 'block' : 'none';
      if (namePanel) namePanel.style.display = which === 'name' ? 'block' : 'none';
      if (waitingPanel) waitingPanel.style.display = which === 'waiting' ? 'block' : 'none';
    }

    function showRequestError(message) {
      if (reqErrEl) { reqErrEl.textContent = message; reqErrEl.style.display = 'block'; }
    }

    function stopPolling() {
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    }

    function startPolling() {
      stopPolling();
      pollTimer = setInterval(pollStatus, ACCESS_REQUEST_POLL_MS);
    }

    function pollStatus() {
      if (document.visibilityState && document.visibilityState !== 'visible') return;
      fetch(apiBase + '/api/class-access/request/status', { credentials: 'include' })
        .then(function (r) { return r.json(); })
        .then(function (res) {
          var status = res && res.status;
          if (status === 'approved') {
            stopPolling();
            if (waitingMsgEl) waitingMsgEl.textContent = 'Approved! Loading…';
            onSuccess();
          } else if (status === 'denied' || status === 'expired' || status === 'revoked') {
            stopPolling();
            showPanel('idle');
            showRequestError(
              status === 'denied' ? 'Your teacher denied this request. You can request again.' :
              status === 'revoked' ? 'Your access was ended. You can request again.' :
              'That request expired. You can request again.'
            );
          }
        })
        .catch(function () {});
    }

    function sendRequest(proposedName) {
      if (requestInProgress) return;
      requestInProgress = true;
      if (reqErrEl) reqErrEl.style.display = 'none';
      var payload = {};
      if (proposedName) payload.proposed_name = proposedName;
      fetch(apiBase + '/api/class-access/request', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
        .then(function (r) { return r.json().then(function (body) { return { status: r.status, body: body }; }); })
        .then(function (result) {
          requestInProgress = false;
          var res = result.body;
          if (res && res.ok && res.requestPhrase) {
            if (phraseEl) {
              phraseEl.textContent = res.requestPhrase;
              phraseEl.style.display = 'block';
            }
            if (waitingMsgEl) waitingMsgEl.textContent = 'Waiting for approval…';
            showPanel('waiting');
            startPolling();
            return;
          }
          if (res && res.error === 'Missing proposed_name') {
            showPanel('name');
            return;
          }
          if (result.status === 429) {
            showPanel('idle');
            showRequestError('Too many requests right now. Please wait a bit and try again.');
            return;
          }
          showPanel('idle');
          showRequestError((res && res.error) || 'Something went wrong. Try again.');
        })
        .catch(function () {
          requestInProgress = false;
          showPanel('idle');
          showRequestError('Something went wrong. Try again.');
        });
    }

    if (reqBtn) reqBtn.addEventListener('click', function () { sendRequest(null); });
    if (!isAuthenticatedStudent()) {
      if (idlePanel) idlePanel.style.display = 'none';
    }
    if (sendBtn) {
      sendBtn.addEventListener('click', function () {
        var name = (nameInput && nameInput.value || '').trim();
        if (!name) {
          showRequestError('Please enter your name.');
          return;
        }
        sendRequest(name);
      });
    }
    if (nameInput) nameInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') { if (sendBtn) sendBtn.click(); } });
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
    var apiBase = (typeof window !== 'undefined' && typeof window.LANTERN_AVATAR_API !== 'undefined' && window.LANTERN_AVATAR_API !== null) ? String(window.LANTERN_AVATAR_API).replace(/\/$/, '') : null;
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
    if (apiBase === null) {
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
        if (isRestrictedModeLocked(state)) {
          var restrictedHtml = (global.LanternRestrictedMode && typeof global.LanternRestrictedMode.lockedHtml === 'function')
            ? global.LanternRestrictedMode.lockedHtml()
            : '<div class="lanternRestrictedUnavailable" style="max-width:420px;margin:0 auto;padding:28px 20px;text-align:center;"><h2 style="font-weight:1000;font-size:28px;margin:0 0 12px;">Lantern is temporarily unavailable.</h2><p style="color:var(--muted);font-size:22px;margin:0;">Access is currently limited by school staff.<br>Please try again later.</p></div>';
          gateWrap.innerHTML = restrictedHtml;
        } else if (!gateWrap.querySelector('.classAccessGate')) {
          renderGate(gateWrap, apiBase, function () { location.reload(); });
        }
        if (isAuthenticatedStudent() && !gateWrap._lanternAccessStatePoll) {
          gateWrap._lanternAccessStatePoll = setInterval(function () {
            if (document.visibilityState && document.visibilityState !== 'visible') return;
            getAccessState(apiBase, function (next) {
              if (next && next.tokenValid) {
                if (gateWrap._lanternAccessStatePoll) {
                  clearInterval(gateWrap._lanternAccessStatePoll);
                  gateWrap._lanternAccessStatePoll = null;
                }
                location.reload();
              }
            });
          }, ACCESS_STATE_POLL_MS);
        }
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
