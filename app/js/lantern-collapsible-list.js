/**
 * Lantern shared management disclosure (Prompt #119 / #122 / #131 / #133 / #137).
 * OUTER: details.teacherCollapsibleList — one summary header when collapsed.
 *   Used for list panels AND short form/settings/tool cards.
 * INNER: details.lanternMgmtRecord — one compact record row; expand for actions/detail.
 * Nested panels use .teacherCollapsibleList--nested (independent of page accordion).
 * Top-level (non-nested) peers under the same parent: one open at a time.
 * On outer collapse: hide [data-collapsible-editor], close open records, emit
 * `lantern-collapsible-collapse` so page-level editors can close.
 * Prefer one open record at a time within a list.
 */
(function (global) {
  'use strict';

  function hideEditorsIn(root) {
    if (!root || !root.querySelectorAll) return;
    Array.prototype.forEach.call(root.querySelectorAll('[data-collapsible-editor]'), function (el) {
      el.style.display = 'none';
      el.setAttribute('aria-hidden', 'true');
      el.hidden = true;
    });
  }

  function closeOpenRecords(root) {
    if (!root || !root.querySelectorAll) return;
    Array.prototype.forEach.call(root.querySelectorAll('details.lanternMgmtRecord[open]'), function (rec) {
      rec.open = false;
    });
  }

  function isNestedPanel(panel) {
    return !!(panel && panel.classList && panel.classList.contains('teacherCollapsibleList--nested'));
  }

  /** Close other top-level management panels that share the same parent (accordion). */
  function closeSiblingTopLevelPanels(panel) {
    if (!panel || isNestedPanel(panel)) return;
    var parent = panel.parentNode;
    if (!parent || !parent.children) return;
    Array.prototype.forEach.call(parent.children, function (sib) {
      if (
        sib !== panel &&
        sib.tagName === 'DETAILS' &&
        sib.classList &&
        sib.classList.contains('teacherCollapsibleList') &&
        !sib.classList.contains('teacherCollapsibleList--nested') &&
        sib.open
      ) {
        sib.open = false;
      }
    });
  }

  /**
   * Wire compact record disclosures inside a list container (call after each re-render).
   * @param {ParentNode} container
   */
  function wireRecords(container) {
    if (!container || !container.querySelectorAll) return;
    Array.prototype.forEach.call(container.querySelectorAll('details.lanternMgmtRecord'), function (rec) {
      if (rec.getAttribute('data-mgmt-record-ready') === '1') return;
      rec.setAttribute('data-mgmt-record-ready', '1');
      rec.setAttribute('aria-expanded', rec.open ? 'true' : 'false');

      if (rec.hasAttribute('open') && rec.getAttribute('data-mgmt-record-default-open') !== '1') {
        rec.removeAttribute('open');
      }

      rec.addEventListener('toggle', function () {
        var isOpen = !!rec.open;
        rec.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        if (isOpen) {
          var list = rec.parentNode;
          if (list && list.querySelectorAll) {
            Array.prototype.forEach.call(list.querySelectorAll('details.lanternMgmtRecord[open]'), function (other) {
              if (other !== rec) other.open = false;
            });
          }
        } else {
          hideEditorsIn(rec);
          try {
            rec.dispatchEvent(
              new CustomEvent('lantern-mgmt-record-collapse', {
                bubbles: true,
                detail: { id: rec.id || '', key: rec.getAttribute('data-record-key') || '' },
              })
            );
          } catch (_) {}
        }
      });

      var summary = rec.querySelector(':scope > summary.lanternMgmtRecordHd');
      if (summary && !summary.hasAttribute('tabindex')) summary.setAttribute('tabindex', '0');

      function isInteractiveTarget(el) {
        return !!(el && el.closest && el.closest('button, a, input, select, textarea, label, [role=button], [data-student-action]'));
      }

      // Parent ignores interactive descendants. Do not suppress the control's own click.
      // preventDefault only on summary chrome so <details> does not toggle.
      if (summary) {
        summary.addEventListener('click', function (e) {
          if (isInteractiveTarget(e.target)) {
            e.preventDefault();
            e.stopPropagation();
          }
        });
      }

      rec.addEventListener('click', function (e) {
        if (isInteractiveTarget(e.target)) return;
      });
    });
  }

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
        hideEditorsIn(panel);
      }

      function syncExpanded() {
        var isOpen = !!panel.open;
        panel.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        if (isOpen) {
          closeSiblingTopLevelPanels(panel);
        } else {
          hideEditorsInside();
          closeOpenRecords(panel);
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

    // Wire any records already in the DOM (dynamic lists call wireRecords after render).
    wireRecords(root);
  }

  global.LanternCollapsibleList = {
    init: init,
    wireRecords: wireRecords,
    closeOpenRecords: closeOpenRecords,
    hideEditorsIn: hideEditorsIn,
    closeSiblingTopLevelPanels: closeSiblingTopLevelPanels,
  };
  /** Teacher boot alias — same initializer. */
  global.initTeacherCollapsibleLists = init;
})(typeof window !== 'undefined' ? window : self);
