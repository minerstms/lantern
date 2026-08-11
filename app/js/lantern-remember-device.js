/**
 * Prompt #140 — Remember this device? modal for linked Lantern staff.
 * Does not store passwords. Does not use /device-pairing for personal staff trust.
 */
(function (global) {
  var SS_DECLINED = 'lantern_remember_device_declined';
  var LS_REMEMBERED_HINT = 'lantern_tms_device_remembered_v1';
  var TMS_BEHAVIOR =
    'https://log.tmslantern.org/index.html';
  var AUTHORIZE = '/api/auth/tms-device-authorize';

  function apiBase() {
    if (typeof global.LANTERN_AVATAR_API !== 'undefined' && global.LANTERN_AVATAR_API !== null) {
      return String(global.LANTERN_AVATAR_API).replace(/\/$/, '');
    }
    return '';
  }

  function normalizeRole(role) {
    return String(role || '')
      .trim()
      .toLowerCase();
  }

  function isStaffRole(role) {
    var r = normalizeRole(role);
    return r === 'teacher' || r === 'admin';
  }

  function hasDeclinedThisSession() {
    try {
      return global.sessionStorage.getItem(SS_DECLINED) === '1';
    } catch (e) {
      return false;
    }
  }

  function setDeclinedThisSession() {
    try {
      global.sessionStorage.setItem(SS_DECLINED, '1');
    } catch (e) {}
  }

  function hasRememberedHint() {
    try {
      return global.localStorage.getItem(LS_REMEMBERED_HINT) === '1';
    } catch (e) {
      return false;
    }
  }

  function setRememberedHint() {
    try {
      global.localStorage.setItem(LS_REMEMBERED_HINT, '1');
    } catch (e) {}
  }

  function clearRememberedHint() {
    try {
      global.localStorage.removeItem(LS_REMEMBERED_HINT);
    } catch (e) {}
  }

  /** Mark hint when returning from TMS after Yes. */
  function absorbDeviceRememberedQuery() {
    try {
      var u = new URL(global.location.href);
      if (u.searchParams.get('device_remembered') === '1') {
        setRememberedHint();
        u.searchParams.delete('device_remembered');
        var next = u.pathname + (u.search ? u.search : '') + (u.hash || '');
        global.history.replaceState({}, '', next);
      }
    } catch (e) {}
  }

  function fetchTmsLinkStatus() {
    var base = apiBase();
    var url = (base ? base : '') + '/api/auth/tms-link-status';
    return global
      .fetch(url, { method: 'GET', credentials: 'include', cache: 'no-store' })
      .then(function (r) {
        return r.json().then(function (b) {
          return { status: r.status, body: b || {} };
        });
      })
      .catch(function () {
        return { status: 0, body: { ok: false } };
      });
  }

  function ensureModal() {
    var existing = global.document.getElementById('lanternRememberDeviceModal');
    if (existing) return existing;
    var wrap = global.document.createElement('div');
    wrap.id = 'lanternRememberDeviceModal';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.setAttribute('aria-labelledby', 'lanternRememberDeviceTitle');
    wrap.style.cssText =
      'display:none;position:fixed;inset:0;z-index:10050;background:rgba(0,0,0,.55);align-items:center;justify-content:center;padding:18px;';
    wrap.innerHTML =
      '<div style="max-width:460px;width:100%;background:#0b1220;color:#eaf0ff;border:1px solid rgba(255,255,255,.14);border-radius:18px;padding:22px 20px 18px;box-shadow:0 18px 50px rgba(0,0,0,.45);">' +
      '<h2 id="lanternRememberDeviceTitle" style="margin:0 0 12px;font-size:28px;font-weight:900;">Remember this device?</h2>' +
      '<p style="margin:0 0 10px;font-size:22px;line-height:1.45;color:#b9c6ea;">Stay signed in on this device so you can open Lantern and Behavior Logger without verifying again.</p>' +
      '<p style="margin:0 0 18px;font-size:18px;line-height:1.4;color:#b9c6ea;opacity:.9;">Only choose Yes on a device you regularly use.</p>' +
      '<p id="lanternRememberDeviceMsg" style="display:none;margin:0 0 12px;font-size:18px;color:#ffcc66;"></p>' +
      '<button type="button" id="lanternRememberDeviceYes" style="width:100%;margin-bottom:10px;padding:14px 16px;border-radius:14px;border:1px solid rgba(90,167,255,.55);background:rgba(90,167,255,.28);color:#eaf0ff;font-size:24px;font-weight:800;cursor:pointer;">Yes, remember this device</button>' +
      '<button type="button" id="lanternRememberDeviceNo" style="width:100%;padding:12px 16px;border-radius:14px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:#eaf0ff;font-size:22px;font-weight:800;cursor:pointer;">Not now</button>' +
      '</div>';
    global.document.body.appendChild(wrap);
    return wrap;
  }

  function hideModal() {
    var el = global.document.getElementById('lanternRememberDeviceModal');
    if (el) el.style.display = 'none';
  }

  function buildAuthorizeUrl(intent, lanternReturn) {
    var ret =
      TMS_BEHAVIOR +
      '?intent=' +
      encodeURIComponent(intent || 'remember') +
      '&lantern_return=' +
      encodeURIComponent(lanternReturn || '/teacher.html');
    return AUTHORIZE + '?return=' + encodeURIComponent(ret);
  }

  function showModal(opts) {
    var o = opts || {};
    var dest = o.destination || '/teacher.html';
    var modal = ensureModal();
    var msg = global.document.getElementById('lanternRememberDeviceMsg');
    if (msg) {
      msg.style.display = 'none';
      msg.textContent = '';
    }
    modal.style.display = 'flex';
    var yes = global.document.getElementById('lanternRememberDeviceYes');
    var no = global.document.getElementById('lanternRememberDeviceNo');
    function onYes() {
      hideModal();
      global.location.assign(buildAuthorizeUrl('remember', dest));
    }
    function onNo() {
      setDeclinedThisSession();
      hideModal();
      if (typeof o.onNotNow === 'function') o.onNotNow();
      else if (o.navigateOnNotNow !== false) global.location.replace(dest);
    }
    if (yes) {
      yes.onclick = onYes;
    }
    if (no) {
      no.onclick = onNo;
    }
  }

  /**
   * After successful staff auth (password change satisfied): send linked staff through TMS
   * Install → Remember onboarding (Prompt #141 / #140). Does not show Lantern Remember alone
   * so Install can resolve first on the TMS origin.
   * @returns {Promise<boolean>} true if navigated away (caller should not navigate)
   */
  function maybeOfferRememberDevice(me, destination) {
    absorbDeviceRememberedQuery();
    var dest = destination || '/teacher.html';
    if (!me || !isStaffRole(me.role)) return Promise.resolve(false);
    if (me.must_change_password) return Promise.resolve(false);
    if (hasDeclinedThisSession()) return Promise.resolve(false);
    if (hasRememberedHint()) return Promise.resolve(false);

    return fetchTmsLinkStatus().then(function (res) {
      var body = res.body || {};
      if (!body.ok || !body.linked) {
        return false;
      }
      // Linked staff: TMS-side Install (if offerable) then Remember — not /device-pairing.
      global.location.assign(buildAuthorizeUrl('onboard', dest));
      return true;
    });
  }

  /** Behavior nav: trusted hint → authorize; else onboard (install then remember) or session. */
  function handleBehaviorNavClick(ev) {
    if (ev) {
      ev.preventDefault();
      ev.stopPropagation();
    }
    absorbDeviceRememberedQuery();
    if (hasRememberedHint()) {
      global.location.assign(buildAuthorizeUrl('remember', '/teacher.html'));
      return;
    }
    if (hasDeclinedThisSession()) {
      global.location.assign(buildAuthorizeUrl('session', '/teacher.html'));
      return;
    }
    fetchTmsLinkStatus().then(function (res) {
      var body = res.body || {};
      if (!body.ok) {
        global.location.assign('/teacher.html');
        return;
      }
      if (!body.linked) {
        global.alert(
          'Your Lantern account is not yet linked to Behavior Logger. Contact an administrator.'
        );
        return;
      }
      if (body.role && !isStaffRole(body.role) && body.role === 'student') {
        global.alert('Staff access required.');
        return;
      }
      global.location.assign(buildAuthorizeUrl('onboard', '/teacher.html'));
    });
  }

  function clearOnLogout() {
    clearRememberedHint();
    try {
      global.sessionStorage.removeItem(SS_DECLINED);
    } catch (e) {}
  }

  global.LanternRememberDevice = {
    maybeOfferRememberDevice: maybeOfferRememberDevice,
    handleBehaviorNavClick: handleBehaviorNavClick,
    absorbDeviceRememberedQuery: absorbDeviceRememberedQuery,
    setRememberedHint: setRememberedHint,
    clearOnLogout: clearOnLogout,
    buildAuthorizeUrl: buildAuthorizeUrl,
    hasRememberedHint: hasRememberedHint,
    hasDeclinedThisSession: hasDeclinedThisSession,
  };
})(typeof window !== 'undefined' ? window : this);
