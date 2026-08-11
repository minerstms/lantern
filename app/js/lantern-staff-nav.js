/**
 * Prompt #145/#146/#152/#153 — Canonical Lantern ▼ menu contract (NAVIGATION + STAFF + privileged tools).
 * Mirrored in TMS public/lantern-staff-nav.js — keep labels/order/ids/routes identical.
 * Explore Lantern ▼ is source of truth. Display Board / Hallway TV stay out of the GLOBAL dropdown.
 * Reports/System appear only when caps are provided and allow (#153); Explore omits them by default.
 */
(function (global) {
  'use strict';

  var LANTERN_ORIGIN = 'https://tmslantern.org';
  var TMS_ORIGIN = 'https://log.tmslantern.org';

  /** Shared text inset: trigger "Lantern" and dropdown item text share this left padding. */
  var MENU_TEXT_INSET = '14px';

  /** Exact NAVIGATION order (Explore canonical). */
  var NAVIGATION_ITEMS = [
    { id: 'locker', dataPage: 'locker', label: 'Locker', path: '/locker.html' },
    { id: 'create', dataPage: 'create', label: 'Create', path: '/contribute.html', currentKeys: ['contribute', 'create'] },
    { id: 'play', dataPage: 'play', label: 'Play', path: '/games.html', currentKeys: ['games', 'play'] },
    { id: 'missions', dataPage: 'missions', label: 'Missions', path: '/missions.html' },
  ];

  /** Exact STAFF order for Prompt #146 (no Display Board). */
  var STAFF_NAV_ITEMS = [
    { id: 'teacher', dataPage: 'teacher', label: 'Teacher Tools' },
    { id: 'behavior', dataPage: 'behavior', label: 'Behavior Logger' },
  ];

  /** Privileged TMS tools — capability-gated (same rules as TMS device-auth applyCapabilityNav). */
  var PRIVILEGED_NAV_ITEMS = [
    {
      id: 'reports',
      dataPage: 'reports',
      label: 'Reports',
      path: 'admin.html#reports',
      canShow: function (caps) {
        return !!(caps && (caps.report_maker || caps.behavior_admin));
      },
    },
    {
      id: 'system',
      dataPage: 'system',
      label: 'System',
      path: 'admin.html#system',
      canShow: function (caps) {
        return !!(caps && caps.system_admin);
      },
    },
  ];

  function behaviorAuthorizeHref() {
    var ret = TMS_ORIGIN + '/index.html?intent=remember';
    return '/api/auth/tms-device-authorize?return=' + encodeURIComponent(ret);
  }

  /**
   * @param {string} id
   * @param {'lantern'|'tms'} ctx
   */
  function hrefFor(id, ctx) {
    ctx = ctx || 'lantern';
    var i;
    for (i = 0; i < NAVIGATION_ITEMS.length; i++) {
      if (NAVIGATION_ITEMS[i].id === id) {
        return ctx === 'tms' ? LANTERN_ORIGIN + NAVIGATION_ITEMS[i].path : NAVIGATION_ITEMS[i].path.replace(/^\//, '');
      }
    }
    if (id === 'teacher') {
      return ctx === 'tms' ? '#' : '/teacher.html';
    }
    if (id === 'behavior') {
      return ctx === 'tms' ? 'index.html' : behaviorAuthorizeHref();
    }
    for (i = 0; i < PRIVILEGED_NAV_ITEMS.length; i++) {
      if (PRIVILEGED_NAV_ITEMS[i].id === id) {
        var p = PRIVILEGED_NAV_ITEMS[i].path;
        return ctx === 'tms' ? p : TMS_ORIGIN + '/' + p;
      }
    }
    return '#';
  }

  function isCurrentNavItem(item, current) {
    current = String(current || '');
    if (current === item.dataPage || current === item.id) return true;
    var keys = item.currentKeys || [];
    for (var i = 0; i < keys.length; i++) {
      if (keys[i] === current) return true;
    }
    return false;
  }

  function normalizeCaps(caps) {
    return caps && typeof caps === 'object' ? caps : null;
  }

  function buildNavigationSectionLinksHtml(current, ctx) {
    ctx = ctx || 'lantern';
    return NAVIGATION_ITEMS.map(function (item) {
      var href = hrefFor(item.id, ctx);
      var active = isCurrentNavItem(item, current);
      var label = item.label;
      if (item.id === 'missions' && ctx === 'lantern') {
        label =
          'Missions <span id="lanternNavMissionsBadge" class="lanternNavBadge">0</span>';
      }
      return (
        '<a href="' +
        href +
        '" role="menuitem" class="lanternAppBarDropdownLink' +
        (active ? ' is-active' : '') +
        '" data-page="' +
        item.dataPage +
        '">' +
        label +
        '</a>'
      );
    }).join('');
  }

  /**
   * STAFF section link markup (no wrapping section).
   * @param {string} current page key (teacher|behavior|…)
   * @param {'lantern'|'tms'} ctx
   */
  function buildStaffSectionLinksHtml(current, ctx) {
    ctx = ctx || 'lantern';
    current = String(current || '');
    return STAFF_NAV_ITEMS.map(function (item) {
      var href = hrefFor(item.id, ctx);
      var active = current === item.dataPage || current === item.id;
      var attrs = '';
      if (item.id === 'teacher' && ctx === 'tms') attrs += ' data-lantern-teacher-handoff="1"';
      if (item.id === 'behavior' && ctx === 'lantern') attrs += ' data-lantern-behavior-nav="1"';
      return (
        '<a href="' +
        href +
        '" role="menuitem" class="lanternAppBarDropdownLink' +
        (active ? ' is-active' : '') +
        '" data-page="' +
        item.dataPage +
        '"' +
        attrs +
        '>' +
        item.label +
        '</a>'
      );
    }).join('');
  }

  function visiblePrivilegedItems(caps) {
    caps = normalizeCaps(caps);
    return PRIVILEGED_NAV_ITEMS.filter(function (item) {
      return item.canShow(caps);
    });
  }

  function buildPrivilegedSectionHtml(current, ctx, caps) {
    ctx = ctx || 'lantern';
    current = String(current || '');
    var items = visiblePrivilegedItems(caps);
    if (!items.length) return '';
    var links = items
      .map(function (item) {
        var href = hrefFor(item.id, ctx);
        var active = current === item.dataPage || current === item.id;
        return (
          '<a href="' +
          href +
          '" role="menuitem" class="lanternAppBarDropdownLink' +
          (active ? ' is-active' : '') +
          '" data-page="' +
          item.dataPage +
          '" data-privileged-nav="' +
          item.id +
          '">' +
          item.label +
          '</a>'
        );
      })
      .join('');
    return (
      '<div class="lanternAppBarDropdownSection lanternAppBarDropdownSection--tools" id="lanternAppBarPrivilegedSection">' +
      '<div class="lanternAppBarDropdownGroupLabel">ADMIN / TOOLS</div>' +
      links +
      '</div>'
    );
  }

  /**
   * Full Explore-canonical dropdown body sections (NAVIGATION + STAFF [+ privileged when caps]).
   * Caller may wrap with outer dropdown shell + logout section.
   * @param {string} current
   * @param {'lantern'|'tms'} ctx
   * @param {object|null} [caps] optional TMS capabilities — omit/null hides Reports/System
   */
  function buildMenuSectionsHtml(current, ctx, caps) {
    ctx = ctx || 'lantern';
    return (
      '<div class="lanternAppBarDropdownSection"><div class="lanternAppBarDropdownGroupLabel">NAVIGATION</div>' +
      buildNavigationSectionLinksHtml(current, ctx) +
      '</div>' +
      '<div class="lanternAppBarDropdownSection"><div class="lanternAppBarDropdownGroupLabel">STAFF</div>' +
      buildStaffSectionLinksHtml(current, ctx) +
      '</div>' +
      buildPrivilegedSectionHtml(current, ctx, caps)
    );
  }

  function labelsInOrder() {
    return STAFF_NAV_ITEMS.map(function (i) {
      return i.label;
    });
  }

  function navigationLabelsInOrder() {
    return NAVIGATION_ITEMS.map(function (i) {
      return i.label;
    });
  }

  /** Full menu label order for regression (no section headers / logout / privileged). */
  function fullMenuLabelsInOrder() {
    return navigationLabelsInOrder().concat(labelsInOrder());
  }

  function privilegedLabelsInOrder(caps) {
    return visiblePrivilegedItems(caps).map(function (i) {
      return i.label;
    });
  }

  global.LanternStaffNav = {
    LANTERN_ORIGIN: LANTERN_ORIGIN,
    TMS_ORIGIN: TMS_ORIGIN,
    MENU_TEXT_INSET: MENU_TEXT_INSET,
    NAVIGATION_ITEMS: NAVIGATION_ITEMS,
    ITEMS: STAFF_NAV_ITEMS,
    PRIVILEGED_NAV_ITEMS: PRIVILEGED_NAV_ITEMS,
    labelsInOrder: labelsInOrder,
    navigationLabelsInOrder: navigationLabelsInOrder,
    fullMenuLabelsInOrder: fullMenuLabelsInOrder,
    privilegedLabelsInOrder: privilegedLabelsInOrder,
    hrefFor: hrefFor,
    behaviorAuthorizeHref: behaviorAuthorizeHref,
    buildNavigationSectionLinksHtml: buildNavigationSectionLinksHtml,
    buildStaffSectionLinksHtml: buildStaffSectionLinksHtml,
    buildPrivilegedSectionHtml: buildPrivilegedSectionHtml,
    buildMenuSectionsHtml: buildMenuSectionsHtml,
  };
})(typeof window !== 'undefined' ? window : self);
