/**
 * Lantern shared collapsible LIST PANEL (Prompt #119 / #122).
 * Opt-in class: teacherCollapsibleList (established Teacher name; reused on Admin).
 * Collapsed = one summary header row. Expanded = body with internal scroll.
 */
(function (global) {
  'use strict';

  /**
   * @param {ParentNode} [root]
   */
  function init(root) {
    root = root || (typeof document !== 'undefined' ? document : null);
    if (!root || !root.querySelectorAll) return;
    Array.prototype.forEach.call(root.querySelectorAll('details.teacherCollapsibleList'), function (panel) {
      if (panel.getAttribute('data-collapsible-list-ready') === '1') return;
      panel.setAttribute('data-collapsible-list-ready', '1');
      function syncExpanded() {
        panel.setAttribute('aria-expanded', panel.open ? 'true' : 'false');
      }
      syncExpanded();
      panel.addEventListener('toggle', syncExpanded);
      var summary = panel.querySelector(':scope > summary.teacherCollapsibleListHd');
      if (!summary) return;
      if (!summary.hasAttribute('tabindex')) summary.setAttribute('tabindex', '0');
      Array.prototype.forEach.call(summary.querySelectorAll('button, a, input, select, textarea'), function (ctrl) {
        ctrl.addEventListener('click', function (e) {
          e.stopPropagation();
        });
      });
    });
  }

  global.LanternCollapsibleList = { init: init };
  /** Teacher boot alias — same initializer. */
  global.initTeacherCollapsibleLists = init;
})(typeof window !== 'undefined' ? window : self);
