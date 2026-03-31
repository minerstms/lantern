/**
 * Fail-closed route guard: student-facing canonical surfaces require lantern-canonical-enforce.js.
 * Load this script first in <body> on protected routes. No silent continuation if enforcement is missing.
 */
(function (global) {
  'use strict';

  global.__LANTERN_CANONICAL_STUDENT_ROUTE = 1;
  global.__lanternCancerReport = global.__lanternCancerReport || [];

  var FATAL_ID = 'lanternCanonicalKillSwitchFatal';

  function escHtml(s) {
    return String(s || '').replace(/[&<>"']/g, function (c) {
      return c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;';
    });
  }

  function showKillSwitchOverlay(message) {
    var doc = global.document;
    if (!doc || !doc.body || doc.getElementById(FATAL_ID)) return;
    var ov = doc.createElement('div');
    ov.id = FATAL_ID;
    ov.setAttribute('role', 'alert');
    ov.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#0a0505;color:#f8f4f0;padding:28px;font-size:22px;line-height:1.45;overflow:auto;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;box-sizing:border-box;';
    ov.innerHTML =
      '<h1 style="margin:0 0 18px;font-size:30px;font-weight:900;color:#ff4444;">Lantern Canonical Failure</h1>' +
      '<p style="margin:0 0 16px;opacity:.95;">This route cannot run without canonical enforcement. Execution has been aborted.</p>' +
      '<pre style="white-space:pre-wrap;word-break:break-word;background:rgba(0,0,0,.5);padding:18px;border-radius:14px;border:1px solid rgba(255,255,255,.12);margin:0;">' +
      escHtml(message) + '</pre>';
    doc.body.appendChild(ov);
    doc.body.style.overflow = 'hidden';
    try {
      doc.documentElement.style.overflow = 'hidden';
    } catch (e) {}
  }

  /**
   * Hard stop: fatal overlay + throw. Use when LanternCards factory or required DOM is missing on a canonical route.
   */
  function lanternCanonicalFailClosed(reason) {
    var msg = '[LanternKillSwitch] ' + String(reason || 'Canonical surface cannot render.');
    showKillSwitchOverlay(msg);
    var err = new Error(msg);
    err.name = 'LanternKillSwitchError';
    throw err;
  }

  global.LanternCanonicalFailClosed = lanternCanonicalFailClosed;

  function verifyEnforcementPresent() {
    if (global.__lanternCanonicalEnforcementLoaded !== true ||
      !global.LanternCanonicalEnforce ||
      typeof global.LanternCanonicalEnforce.validateZones !== 'function') {
      lanternCanonicalFailClosed(
        'Canonical enforcement not installed. This route must include js/lantern-canonical-enforce.js after lantern-cards.js.'
      );
    }
  }

  function onReady() {
    verifyEnforcementPresent();
  }

  if (global.document) {
    if (global.document.readyState === 'loading') {
      global.document.addEventListener('DOMContentLoaded', onReady);
    } else {
      global.setTimeout(onReady, 0);
    }
    global.addEventListener('load', function () {
      verifyEnforcementPresent();
    });
  }
})(typeof window !== 'undefined' ? window : this);
