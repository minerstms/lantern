/**
 * Lantern shared collapsible LIST PANEL (Prompt #119 / #122 / #131).
 * Opt-in class: teacherCollapsibleList (established Teacher name; reused on Admin).
 * Collapsed = one summary header row. Expanded = body with internal scroll.
 * On collapse: hide editors marked [data-collapsible-editor] inside the panel, and emit
 * `lantern-collapsible-collapse` so page-level editors (outside the panel) can close.
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

      function hideEditorsInside() {
        Array.prototype.forEach.call(panel.querySelectorAll('[data-collapsible-editor]'), function (el) {
          el.style.display = 'none';
          el.setAttribute('aria-hidden', 'true');
          el.hidden = true;
        });
      }

      function syncExpanded() {
        var isOpen = !!panel.open;
        panel.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        if (!isOpen) {
          hideEditorsInside();
          try {
            panel.dispatchEvent(
              new CustomEvent('lantern-collapsible-collapse', {
                bubbles: true,
                detail: { id: panel.id || '' },
              })
            );
          } catch (_) {}
        }
      }

      // Default safe collapsed: never leave `open` from stale markup/state on init.
      if (panel.hasAttribute('open') && panel.getAttribute('data-collapsible-default-open') !== '1') {
        panel.removeAttribute('open');
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
