/**
 * Lantern shared management-list (Prompt #119 / #122 / #131 / #133).
 * OUTER: details.teacherCollapsibleList — one summary header when collapsed.
 * INNER: details.lanternMgmtRecord — one compact record row; expand for actions/detail.
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
      if (summary) {
        Array.prototype.forEach.call(summary.querySelectorAll('button, a, input, select, textarea'), function (ctrl) {
          ctrl.addEventListener('click', function (e) {
            e.stopPropagation();
          });
        });
      }

      // Action buttons live in the body — stop them from bubbling oddly; details only toggles via summary.
      var body = rec.querySelector(':scope > .lanternMgmtRecordBd');
      if (body) {
        body.addEventListener('click', function (e) {
          if (e.target && e.target.closest && e.target.closest('button, a, input, select, textarea, label')) {
            e.stopPropagation();
          }
        });
      }
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
        if (!isOpen) {
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
  };
  /** Teacher boot alias — same initializer. */
  global.initTeacherCollapsibleLists = init;
})(typeof window !== 'undefined' ? window : self);
