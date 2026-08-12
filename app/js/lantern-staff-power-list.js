/**
 * Prompt #121 — Staff roster helpers for the shared Power Scroller.
 * Pure mapping/sort/filter contracts; Admin supplies live account/BL actions.
 */
(function (global) {
  'use strict';

  function esc(s) {
    return global.LanternPowerList && global.LanternPowerList.esc
      ? global.LanternPowerList.esc(s)
      : String(s == null ? '' : s)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');
  }

  /**
   * @param {object} u raw staff user
   * @param {object} meta computed labels from Admin
   */
  function toStaffItem(u, meta) {
    meta = meta || {};
    var active = !(u.is_active === 0 || u.is_active === '0');
    var firstName = meta.firstName != null ? String(meta.firstName) : '';
    var lastName = meta.lastName != null ? String(meta.lastName) : '';
    var displayName =
      meta.displayName != null && String(meta.displayName).trim()
        ? String(meta.displayName).trim()
        : [firstName, lastName].filter(Boolean).join(' ') || String(u.username || '');
    var blLinked = !!meta.blLinked;
    var statusKey = !active
      ? 'archived'
      : meta.needsName
        ? 'needs_name'
        : meta.needsTitle
          ? 'needs_title'
          : 'active';
    var statusLabel =
      meta.statusLabel ||
      (!active ? 'Archived' : meta.needsName ? 'Needs Name Setup' : meta.needsTitle ? 'Needs Title' : 'Active');
    return {
      id: String(u.username || ''),
      username: String(u.username || ''),
      user: u,
      firstName: firstName,
      lastName: lastName,
      displayName: displayName,
      email: u.email != null ? String(u.email) : '',
      honorific: u.honorific != null ? String(u.honorific) : '',
      role: String(u.role || '').toLowerCase(),
      roleLabel: meta.roleLabel || String(u.role || ''),
      active: active,
      blLinked: blLinked,
      blLabel: meta.blLabel || (blLinked ? 'Linked' : 'Needs Link'),
      blClass: meta.blClass || '',
      statusKey: statusKey,
      statusLabel: statusLabel,
      statusRank: statusKey === 'archived' ? 2 : statusKey === 'active' ? 0 : 1,
      blRank: blLinked ? 1 : 0,
    };
  }

  function getSortValue(item, key) {
    if (key === 'name') return String(item.lastName || '').toLowerCase() + '\u0000' + String(item.firstName || '').toLowerCase();
    if (key === 'username') return item.username || '';
    if (key === 'role') return item.roleLabel || item.role || '';
    if (key === 'bl') return item.blRank;
    if (key === 'status') return item.statusRank;
    return item.id;
  }

  function getSearchText(item) {
    return [
      item.displayName,
      item.firstName,
      item.lastName,
      item.username,
      item.email,
      item.honorific,
      item.roleLabel,
      item.blLabel,
      item.statusLabel,
    ].join(' ');
  }

  function matchFilter(item, filterId, value) {
    if (filterId === 'status') {
      if (value === 'active') return !!item.active;
      if (value === 'archived') return !item.active;
      return true;
    }
    if (filterId === 'link') {
      if (value === 'linked') return !!item.blLinked;
      if (value === 'needs_link') return !!item.active && !item.blLinked;
      return true;
    }
    if (filterId === 'role') {
      return String(item.role || '') === String(value || '');
    }
    return true;
  }

  function getStatus(item) {
    if (item.statusKey === 'archived') return { label: item.statusLabel || 'Archived', tone: 'hidden' };
    if (item.statusKey === 'needs_name' || item.statusKey === 'needs_title') {
      return { label: item.statusLabel, tone: 'reported' };
    }
    return { label: item.statusLabel || 'Active', tone: 'live' };
  }

  function getCellHtml(item, key) {
    if (key === 'name') return esc(item.displayName || item.username || '—');
    if (key === 'username') return esc(item.username || '—');
    if (key === 'role') return esc(item.roleLabel || item.role || '—');
    if (key === 'bl') {
      var cls = item.blClass ? ' ' + item.blClass : '';
      return '<span class="lanternPowerListBl' + cls + '">' + esc(item.blLabel || '—') + '</span>';
    }
    return '';
  }

  global.LanternStaffPowerList = {
    toStaffItem: toStaffItem,
    getSortValue: getSortValue,
    getSearchText: getSearchText,
    matchFilter: matchFilter,
    getStatus: getStatus,
    getCellHtml: getCellHtml,
    esc: esc,
  };
})(typeof window !== 'undefined' ? window : globalThis);
