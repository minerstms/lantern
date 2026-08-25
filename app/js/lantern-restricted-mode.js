/**
 * Restricted Access / Demo Mode (#262C) — locked overlay + shared copy.
 * Does not expose allowlist, admin identity, or internal reason codes.
 */
(function (global) {
  var TITLE = 'Lantern is temporarily unavailable.';
  var BODY = 'Access is currently limited by school staff.\nPlease try again later.';

  function viewFrom(payload) {
    var rm = (payload && (payload.restricted_mode || payload.restrictedMode)) || null;
    if (!rm) return { active: false, allowed: true };
    return { active: !!rm.active, allowed: !!rm.allowed };
  }

  function isLocked(payload) {
    if (payload && payload.error === 'restricted_mode_locked') return true;
    if (payload && payload.accessState === 'restricted_mode_locked') return true;
    var v = viewFrom(payload);
    return !!(v.active && !v.allowed);
  }

  function lockedHtml() {
    return (
      '<div class="lanternRestrictedUnavailable" style="max-width:420px;margin:0 auto;padding:28px 20px;text-align:center;">' +
      '<h2 style="font-weight:1000;font-size:28px;margin:0 0 12px;line-height:1.3;">' + TITLE + '</h2>' +
      '<p style="color:var(--muted,#b9c6ea);font-size:22px;margin:0;line-height:1.45;white-space:pre-line;">' + BODY + '</p>' +
      '</div>'
    );
  }

  function ensureOverlay() {
    var el = document.getElementById('lanternRestrictedOverlay');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'lanternRestrictedOverlay';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', TITLE);
    el.style.cssText = 'display:none;position:fixed;inset:0;z-index:10050;background:#0b1220;overflow:auto;padding:24px;align-items:center;justify-content:center;';
    el.innerHTML = lockedHtml();
    document.body.appendChild(el);
    return el;
  }

  function showLockedOverlay() {
    var el = ensureOverlay();
    el.style.display = 'flex';
  }

  function hideLockedOverlay() {
    var el = document.getElementById('lanternRestrictedOverlay');
    if (el) el.style.display = 'none';
  }

  function apply(payload) {
    if (isLocked(payload)) showLockedOverlay();
    else hideLockedOverlay();
    return viewFrom(payload);
  }

  global.LanternRestrictedMode = {
    viewFrom: viewFrom,
    isLocked: isLocked,
    lockedHtml: lockedHtml,
    apply: apply,
    showLockedOverlay: showLockedOverlay,
    hideLockedOverlay: hideLockedOverlay,
  };
})(typeof window !== 'undefined' ? window : this);
