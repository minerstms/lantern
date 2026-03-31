/**
 * THE single student-facing horizontal rail / thumbscroll implementation for Lantern.
 * — `mountStudentScroller(host, options)` applies canonical class + data-* on an **existing** host only (caller creates the element).
 * — Static HTML uses data-lantern-rail-host; enforcement calls __upgradeRailHostsBeforeEnforce.
 * CSS: `.wrap.lanternContent .lanternScroller` in lantern-cards.css; tokens `--lantern-rail-*` in lantern-header.css.
 * See docs/LANTERN_SYSTEM_CONTEXT.md §11 and docs/ui/LANTERN_RAIL_OPEN_FULLSCREEN_SYSTEM.md §1.
 */
(function (global) {
  'use strict';

  function prepareLanternScroller(el, options) {
    if (!el || !el.classList) return null;
    options = options || {};
    var extra = String(options.extraClass || '').trim();
    var base = 'lanternScroller';
    el.className = (base + (extra ? ' ' + extra : '')).replace(/\s+/g, ' ').trim();
    el.setAttribute('data-lantern-rail', 'true');
    el.setAttribute('data-lantern-thumbscroll', 'true');
    el.setAttribute('data-lantern-brand', 'lantern');
    var al = options.ariaLabel;
    if (al != null && String(al).trim() !== '') {
      el.setAttribute('aria-label', String(al));
    }
    return el;
  }

  /**
   * @param {HTMLElement} hostElement — required; caller must create the node (no null-host factory path).
   */
  function mountStudentScroller(hostElement, options) {
    if (!hostElement || hostElement.nodeType !== 1) return null;
    return prepareLanternScroller(hostElement, options || {});
  }

  function upgradeRailHostsInDocument(doc) {
    var d = doc || global.document;
    if (!d.querySelectorAll) return;
    var nodes = d.querySelectorAll('[data-lantern-rail-host]');
    var i;
    for (i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var aria = el.getAttribute('data-scroller-aria-label');
      var xcls = el.getAttribute('data-scroller-class') || '';
      mountStudentScroller(el, { ariaLabel: aria != null ? aria : '', extraClass: xcls });
      el.removeAttribute('data-lantern-rail-host');
      el.removeAttribute('data-scroller-aria-label');
      el.removeAttribute('data-scroller-class');
    }
  }

  global.LanternScroller = {
    mountStudentScroller: mountStudentScroller,
    __upgradeRailHostsBeforeEnforce: upgradeRailHostsInDocument
  };
})(typeof window !== 'undefined' ? window : this);
