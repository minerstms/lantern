/**
 * Prompt #145/#146/#152/#153/#163 — Canonical Lantern ▼ menu contract.
 * Mirrored in TMS public/lantern-staff-nav.js — keep labels/order/ids/routes identical.
 * Explore Lantern ▼ is source of truth. Display Board / Hallway TV / Store stay out.
 * Prompt #251/#253 — STAFF is Teacher Tools + Behavior Logger only.
 * Teacher Dashboard is retired as a canonical navigation destination.
 * Privileged items use TMS capabilities only (REPORT_MAKER / BEHAVIOR_ADMIN /
 * SYSTEM_ADMIN). role===admin does not grant Reports, Behavior Administration,
 * or System. Fail closed: unknown/student role never receives staff or admin links.
 */
(function (global) {
  'use strict';

  var LANTERN_ORIGIN = 'https://tmslantern.org';
  var TMS_ORIGIN = 'https://log.tmslantern.org';

  /** Shared text inset: trigger "Lantern" and dropdown item text share this left padding. */
  var MENU_TEXT_INSET = '14px';

  /** Exact NAVIGATION order. Brand link already goes home — no redundant Lantern row. */
  var NAVIGATION_ITEMS = [
    { id: 'locker', dataPage: 'locker', label: 'Locker', path: '/locker.html' },
    { id: 'create', dataPage: 'create', label: 'Create', path: '/contribute.html', currentKeys: ['contribute', 'create'] },
    { id: 'media_library', dataPage: 'media_library', label: 'Media Library', externalHref: 'https://miners-yearbook.pages.dev/' },
    { id: 'play', dataPage: 'play', label: 'Play', path: '/games.html', currentKeys: ['games', 'play'] },
    { id: 'missions', dataPage: 'missions', label: 'Missions', path: '/missions.html' },
  ];

  /** Exact STAFF order — Teacher Tools, Behavior Logger. No Teacher Dashboard. */
  var STAFF_NAV_ITEMS = [
    { id: 'teacher', dataPage: 'teacher', label: 'Teacher Tools' },
    { id: 'behavior', dataPage: 'behavior', label: 'Behavior Logger' },
  ];

  /** Privileged tools — TMS capabilities only. SYSTEM_ADMIN does not imply Reports. */
  var PRIVILEGED_NAV_ITEMS = [
    {
      id: 'reports',
      dataPage: 'reports',
      label: 'Reports',
      path: 'admin.html#reports',
      canShow: function (caps) {
        return !!(caps && caps.report_maker);
      },
    },
    {
      id: 'behaviorAdmin',
      dataPage: 'behavior-admin',
      label: 'Behavior Administration',
      path: 'admin.html#behavior',
      canShow: function (caps) {
        return !!(caps && caps.behavior_admin);
      },
    },
    {
      id: 'system',
      dataPage: 'system',
      label: 'System',
      path: '/admin#system',
      canShow: function (caps) {
        return !!(caps && caps.system_admin);
      },
    },
  ];

  function behaviorAuthorizeHref() {
    var ret = TMS_ORIGIN + '/index.html?intent=remember';
    return '/api/auth/tms-device-authorize?return=' + encodeURIComponent(ret);
  }

  function normalizeRole(role) {
    return String(role || '').trim().toLowerCase();
  }

  function isStaffRole(role) {
    var r = normalizeRole(role);
    return r === 'teacher' || r === 'admin' || r === 'staff';
  }

  /**
   * STAFF section: Lantern staff roles, or TMS pages (staff-authenticated) unless role is student.
   * Students and unknown Lantern roles fail closed.
   */
  function shouldShowStaffSection(role, ctx) {
    if (normalizeRole(role) === 'student') return false;
    if (isStaffRole(role)) return true;
    return ctx === 'tms' && !normalizeRole(role);
  }

  function canShowStaffItem(item, role) {
    if (!item) return false;
    if (item.adminOnly) return normalizeRole(role) === 'admin';
    return true;
  }

  function visibleStaffItems(role) {
    return STAFF_NAV_ITEMS.filter(function (item) {
      return canShowStaffItem(item, role);
    });
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
        if (NAVIGATION_ITEMS[i].externalHref) return NAVIGATION_ITEMS[i].externalHref;
        return ctx === 'tms' ? LANTERN_ORIGIN + NAVIGATION_ITEMS[i].path : NAVIGATION_ITEMS[i].path.replace(/^\//, '');
      }
    }
    if (id === 'lantern') {
      return ctx === 'tms' ? LANTERN_ORIGIN + '/explore.html' : 'explore.html';
    }
    if (id === 'teacher') {
      return ctx === 'tms' ? LANTERN_ORIGIN + '/teacher' : '/teacher.html';
    }
    if (id === 'behavior') {
      return ctx === 'tms' ? 'index.html' : behaviorAuthorizeHref();
    }
    if (id === 'admin') {
      return ctx === 'tms' ? LANTERN_ORIGIN + '/admin' : '/admin';
    }
    if (id === 'system') {
      return ctx === 'tms' ? LANTERN_ORIGIN + '/admin#system' : '/admin#system';
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
   * @param {string} [role]
   */
  function buildStaffSectionLinksHtml(current, ctx, role) {
    ctx = ctx || 'lantern';
    current = String(current || '');
    return visibleStaffItems(role).map(function (item) {
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

  function visiblePrivilegedItems(caps, role) {
    if (normalizeRole(role) === 'student') return [];
    if (normalizeRole(role) && !isStaffRole(role)) return [];
    caps = normalizeCaps(caps);
    return PRIVILEGED_NAV_ITEMS.filter(function (item) {
      return item.canShow(caps, role);
    });
  }

  function buildPrivilegedSectionHtml(current, ctx, caps, role) {
    ctx = ctx || 'lantern';
    current = String(current || '');
    var items = visiblePrivilegedItems(caps, role);
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
   * Canonical dropdown body (NAVIGATION + STAFF when authorized + ADMIN / TOOLS when authorized).
   * Fail closed: omit STAFF and privileged unless role/caps confirm them.
   * @param {string} current
   * @param {'lantern'|'tms'} ctx
   * @param {object|null} [caps] TMS capabilities (report_maker, system_admin, …)
   * @param {string} [role] Lantern pilot role
   */
  function buildMenuSectionsHtml(current, ctx, caps, role) {
    ctx = ctx || 'lantern';
    var staffHtml = '';
    if (shouldShowStaffSection(role, ctx)) {
      staffHtml =
        '<div class="lanternAppBarDropdownSection"><div class="lanternAppBarDropdownGroupLabel">STAFF</div>' +
        buildStaffSectionLinksHtml(current, ctx, role) +
        '</div>';
    }
    return (
      '<div class="lanternAppBarDropdownSection"><div class="lanternAppBarDropdownGroupLabel">NAVIGATION</div>' +
      buildNavigationSectionLinksHtml(current, ctx) +
      '</div>' +
      staffHtml +
      buildPrivilegedSectionHtml(current, ctx, caps, role)
    );
  }

  function labelsInOrder() {
    return STAFF_NAV_ITEMS.filter(function (i) {
      return !i.adminOnly;
    }).map(function (i) {
      return i.label;
    });
  }

  function staffLabelsInOrder(role) {
    return visibleStaffItems(role).map(function (i) {
      return i.label;
    });
  }

  function navigationLabelsInOrder() {
    return NAVIGATION_ITEMS.map(function (i) {
      return i.label;
    });
  }

  function privilegedLabelsInOrder(caps, role) {
    return visiblePrivilegedItems(caps, role).map(function (i) {
      return i.label;
    });
  }

  /** Visible menuitem labels in canonical order (no section headers / logout). */
  function canonicalVisibleLabels(role, caps, ctx) {
    var labels = navigationLabelsInOrder().slice();
    if (shouldShowStaffSection(role, ctx || 'lantern')) {
      labels = labels.concat(staffLabelsInOrder(role));
    }
    return labels.concat(privilegedLabelsInOrder(caps, role));
  }

  function fullMenuLabelsInOrder(role, caps) {
    return canonicalVisibleLabels(role, caps);
  }

  global.LanternStaffNav = {
    LANTERN_ORIGIN: LANTERN_ORIGIN,
    TMS_ORIGIN: TMS_ORIGIN,
    MENU_TEXT_INSET: MENU_TEXT_INSET,
    NAVIGATION_ITEMS: NAVIGATION_ITEMS,
    ITEMS: STAFF_NAV_ITEMS,
    PRIVILEGED_NAV_ITEMS: PRIVILEGED_NAV_ITEMS,
    labelsInOrder: labelsInOrder,
    staffLabelsInOrder: staffLabelsInOrder,
    navigationLabelsInOrder: navigationLabelsInOrder,
    fullMenuLabelsInOrder: fullMenuLabelsInOrder,
    privilegedLabelsInOrder: privilegedLabelsInOrder,
    canonicalVisibleLabels: canonicalVisibleLabels,
    isStaffRole: isStaffRole,
    shouldShowStaffSection: shouldShowStaffSection,
    canShowStaffItem: canShowStaffItem,
    hrefFor: hrefFor,
    behaviorAuthorizeHref: behaviorAuthorizeHref,
    buildNavigationSectionLinksHtml: buildNavigationSectionLinksHtml,
    buildStaffSectionLinksHtml: buildStaffSectionLinksHtml,
    buildPrivilegedSectionHtml: buildPrivilegedSectionHtml,
    buildMenuSectionsHtml: buildMenuSectionsHtml,
  };
})(typeof window !== 'undefined' ? window : self);
