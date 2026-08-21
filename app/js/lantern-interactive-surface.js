/**
 * Prompt #245 — Universal interactive surface helpers.
 * Page-behind lock / unlock only. Does not write scrollTop during play,
 * does not lock wheel/touch on the active surface, and does not snap scroll.
 */
(function (global) {
  'use strict';

  var LOCK_CLASS = 'lantern-interactive-surface-page-lock';
  var lockCount = 0;
  var scrollY = 0;

  function docBody() {
    return global.document && global.document.body ? global.document.body : null;
  }

  function readScrollY() {
    if (typeof global.scrollY === 'number') return global.scrollY;
    var html = global.document && global.document.documentElement;
    return (html && html.scrollTop) || 0;
  }

  function lockPage() {
    var body = docBody();
    if (!body) return;
    if (lockCount === 0) {
      scrollY = readScrollY();
      body.classList.add(LOCK_CLASS);
      body.style.top = '-' + scrollY + 'px';
    }
    lockCount += 1;
  }

  function unlockPage() {
    var body = docBody();
    if (!body || lockCount === 0) return;
    lockCount -= 1;
    if (lockCount > 0) return;
    body.classList.remove(LOCK_CLASS);
    body.style.top = '';
    if (typeof global.scrollTo === 'function') global.scrollTo(0, scrollY);
  }

  function markOwner(el) {
    if (el && el.classList) el.classList.add('lanternInteractiveSurface');
    return el;
  }

  function markContent(el) {
    if (el && el.classList) el.classList.add('lanternInteractiveSurfaceContent');
    return el;
  }

  global.LanternInteractiveSurface = {
    lockPage: lockPage,
    unlockPage: unlockPage,
    isLocked: function () {
      return lockCount > 0;
    },
    markOwner: markOwner,
    markContent: markContent,
    LOCK_CLASS: LOCK_CLASS,
  };
})(typeof window !== 'undefined' ? window : globalThis);
