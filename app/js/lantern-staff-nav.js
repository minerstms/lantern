/**
 * Prompt #145 / #146 — Canonical STAFF navigation contract (labels + order + routes).
 * Mirrored in TMS public/lantern-staff-nav.js — keep labels/order/ids identical.
 * Navigation terminology only; does not change auth roles or capabilities.
 *   Prompt #146: Display Board removed from global dropdown (use Teacher sidebar Hallway TV instead).
 */
(function (global) {
  'use strict';

  var LANTERN_ORIGIN = 'https://lantern-42i.pages.dev';
  var TMS_ORIGIN = 'https://tmsnuggets.pages.dev';

  /** Exact STAFF order for Prompt #146. */
  var STAFF_NAV_ITEMS = [
    { id: 'teacher', dataPage: 'teacher', label: 'Teacher Tools' },
    { id: 'behavior', dataPage: 'behavior', label: 'Behavior Logger' },
  ];

  function behaviorAuthorizeHref() {
    var ret = TMS_ORIGIN + '/index.html?intent=remember';
    return '/api/auth/tms-device-authorize?return=' + encodeURIComponent(ret);
  }

  /**
   * @param {'lantern'|'tms'} ctx
   * @param {string} id
   */
  function hrefFor(id, ctx) {
    ctx = ctx || 'lantern';
    if (id === 'teacher') {
      return ctx === 'tms' ? '#' : '/teacher.html';
    }
    if (id === 'behavior') {
      return ctx === 'tms' ? 'index.html' : behaviorAuthorizeHref();
    }
    return '#';
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

  function labelsInOrder() {
    return STAFF_NAV_ITEMS.map(function (i) {
      return i.label;
    });
  }

  global.LanternStaffNav = {
    LANTERN_ORIGIN: LANTERN_ORIGIN,
    TMS_ORIGIN: TMS_ORIGIN,
    ITEMS: STAFF_NAV_ITEMS,
    labelsInOrder: labelsInOrder,
    hrefFor: hrefFor,
    behaviorAuthorizeHref: behaviorAuthorizeHref,
    buildStaffSectionLinksHtml: buildStaffSectionLinksHtml,
  };
})(typeof window !== 'undefined' ? window : self);
