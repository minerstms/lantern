/**
 * Prompt #252A — Locker organization (Feature / Archive) + peer showcase mode.
 */
(function (global) {
  'use strict';

  function esc(s) {
    return String(s || '').replace(/[&<>"']/g, function (c) {
      return c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;';
    });
  }

  function viewKeyFromLocation() {
    try {
      var q = new URLSearchParams(global.location.search || '');
      return String(q.get('view') || '').trim().toLowerCase();
    } catch (_) {
      return '';
    }
  }

  function lockerHref(publicKey) {
    var key = String(publicKey || '').trim();
    if (!key) return '';
    return 'locker.html?view=' + encodeURIComponent(key);
  }

  function itemTypeFromFeed(item) {
    var t = String((item && (item.item_type || item.type)) || '').toLowerCase();
    if (t === 'news' || t === 'news_submission' || t === 'shout_out' || t === 'shoutout') return 'news';
    if (t === 'mission' || t === 'mission_submission') return 'mission_submission';
    if (t === 'poll_contribution') return 'poll_contribution';
    if (t === 'poll') return 'poll';
    return 'feed_item';
  }

  function rawId(item) {
    return String((item && (item.raw && item.raw.id)) || (item && item.id) || '').trim();
  }

  function confirmArchive(kind) {
    if (kind === 'returned') {
      return global.confirm(
        'Archive for Later?\n\nThis will remove the item from Needs Revision.\nIt will not be resubmitted.\nYou can reopen it later from Archived.'
      );
    }
    return global.confirm(
      'Archive from My Locker?\n\nRemoves this from your Locker showcase. It does not delete the post.'
    );
  }

  function refreshAfterChange() {
    if (global.LanternActionCounts && typeof global.LanternActionCounts.refresh === 'function') {
      global.LanternActionCounts.refresh();
    }
    if (global.LANTERN_LOCKER_SHELL && typeof global.LANTERN_LOCKER_SHELL.getFeedController === 'function') {
      var ctrl = global.LANTERN_LOCKER_SHELL.getFeedController();
      if (ctrl && typeof ctrl.refresh === 'function') ctrl.refresh();
    }
    if (global.LanternLockerRevision && typeof global.LanternLockerRevision.load === 'function') {
      global.LanternLockerRevision.load();
    }
    renderArchived();
    renderFeaturedRail();
  }

  function runAction(action, itemType, itemId, confirmKind) {
    if ((action === 'archive' && confirmKind) && !confirmArchive(confirmKind)) return Promise.resolve(null);
    if (!global.LanternLockerMe || typeof global.LanternLockerMe.callItemState !== 'function') {
      return Promise.resolve({ ok: false, error: 'unavailable' });
    }
    return global.LanternLockerMe.callItemState(action, itemType, itemId).then(function (res) {
      if (res && res.ok) refreshAfterChange();
      return res;
    });
  }

  function typeLabel(t) {
    if (t === 'poll_contribution' || t === 'poll') return 'Poll';
    if (t === 'mission_submission' || t === 'mission') return 'Mission';
    if (t === 'news' || t === 'news_submission') return 'News / Shout-Out!';
    if (t === 'feed_item') return 'Create post';
    return 'Item';
  }

  function statusLabel(item) {
    var st = String(item.status || '').toLowerCase();
    var from = String(item.owner_archived_from || '').toLowerCase();
    if (from === 'returned' || st === 'returned') return 'Returned — Archived for Later';
    if (from === 'rejected' || st === 'rejected') return 'Rejected — Archived';
    return 'Approved — Archived from Locker';
  }

  function archivedItemsFromLocker(locker) {
    if (!locker || !locker.ok || !global.LanternLockerMe) return [];
    var rows = global.LanternLockerMe.lockerCategoryItems(locker.submissions);
    return rows.filter(function (it) {
      return it && it.owner_archived_at;
    });
  }

  function featuredItemsFromLocker(locker) {
    if (!locker || !locker.ok || !global.LanternLockerMe) return [];
    var rows = global.LanternLockerMe.lockerCategoryItems(locker.submissions);
    return rows
      .filter(function (it) {
        return it && it.featured && !it.owner_archived_at && String(it.status || '').toLowerCase() !== 'returned';
      })
      .sort(function (a, b) {
        return (Number(a.featured_sort) || 0) - (Number(b.featured_sort) || 0);
      });
  }

  function renderFeaturedRail() {
    var host = document.getElementById('lockerFeaturedRail');
    if (!host) return;
    if (document.body.classList.contains('lockerShell--peer')) {
      return;
    }
    var locker = global.LANTERN_LOCKER_ME && global.LANTERN_LOCKER_ME.ok ? global.LANTERN_LOCKER_ME : null;
    var items = featuredItemsFromLocker(locker);
    if (!items.length) {
      host.hidden = true;
      host.innerHTML = '';
      return;
    }
    host.hidden = false;
    host.innerHTML =
      '<h2 class="lockerFeaturedHd">Featured</h2>' +
      items
        .map(function (it) {
          return (
            '<article class="lockerOrgCard">' +
            '<p class="lockerOrgType">' +
            esc(typeLabel(it.type)) +
            '</p>' +
            '<h3 class="lockerOrgTitle">' +
            esc(it.title || it.question || it.mission_title || 'Untitled') +
            '</h3>' +
            '<div class="lockerOrgActions">' +
            '<button type="button" class="btn lockerOrgBtn" data-org-action="unfeature" data-item-type="' +
            esc(itemTypeFromFeed(it)) +
            '" data-item-id="' +
            esc(it.id) +
            '">Remove from Featured</button>' +
            '</div></article>'
          );
        })
        .join('');
    wireOrgButtons(host);
  }

  function renderArchived() {
    var host = document.getElementById('lockerArchived');
    var list = document.getElementById('lockerArchivedList');
    var empty = document.getElementById('lockerArchivedEmpty');
    if (!host || !list) return;
    if (document.body.classList.contains('lockerShell--peer')) {
      host.hidden = true;
      return;
    }
    var locker = global.LANTERN_LOCKER_ME && global.LANTERN_LOCKER_ME.ok ? global.LANTERN_LOCKER_ME : null;
    var items = archivedItemsFromLocker(locker);
    if (!items.length) {
      list.innerHTML = '';
      if (empty) {
        empty.hidden = false;
        empty.textContent = 'Nothing archived yet.';
      }
      return;
    }
    if (empty) empty.hidden = true;
    list.innerHTML = items
      .map(function (it) {
        var t = itemTypeFromFeed(it);
        var from = String(it.owner_archived_from || '').toLowerCase();
        var action =
          from === 'returned' || String(it.status || '').toLowerCase() === 'returned'
            ? 'reopen_revision'
            : 'restore';
        var actionLabel = action === 'reopen_revision' ? 'Reopen & Revise' : 'Restore to My Locker';
        return (
          '<article class="lockerOrgCard lockerOrgCard--archived">' +
          '<p class="lockerOrgType">' +
          esc(typeLabel(t)) +
          '</p>' +
          '<h3 class="lockerOrgTitle">' +
          esc(it.title || it.question || it.mission_title || 'Untitled') +
          '</h3>' +
          '<p class="lockerOrgStatus">' +
          esc(statusLabel(it)) +
          '</p>' +
          '<div class="lockerOrgActions">' +
          '<button type="button" class="btn primary lockerOrgBtn" data-org-action="' +
          esc(action) +
          '" data-item-type="' +
          esc(t) +
          '" data-item-id="' +
          esc(it.id) +
          '">' +
          esc(actionLabel) +
          '</button>' +
          '</div></article>'
        );
      })
      .join('');
    wireOrgButtons(list);
  }

  function wireOrgButtons(root) {
    if (!root) return;
    Array.prototype.forEach.call(root.querySelectorAll('.lockerOrgBtn'), function (btn) {
      btn.addEventListener('click', function () {
        runAction(btn.getAttribute('data-org-action'), btn.getAttribute('data-item-type'), btn.getAttribute('data-item-id'));
      });
    });
  }

  function ownerActionBarHtml(item) {
    if (!item || item.owner_archived_at) return '';
    var st = String(item.status || 'approved').toLowerCase();
    if (st !== 'approved' && st !== 'accepted') return '';
    if (item.lockerOwned !== true && !item.featured) return '';
    var t = itemTypeFromFeed(item);
    var featured = !!item.featured;
    return (
      '<div class="lockerOwnerActions" data-locker-owner-actions>' +
      (featured
        ? '<button type="button" class="btn lockerOrgBtn" data-org-action="unfeature" data-item-type="' +
          esc(t) +
          '" data-item-id="' +
          esc(rawId(item)) +
          '">Remove from Featured</button>'
        : '<button type="button" class="btn lockerOrgBtn" data-org-action="feature" data-item-type="' +
          esc(t) +
          '" data-item-id="' +
          esc(rawId(item)) +
          '">Feature in My Locker</button>') +
      '<button type="button" class="btn lockerOrgBtn" data-org-action="archive" data-confirm="approved" data-item-type="' +
      esc(t) +
      '" data-item-id="' +
      esc(rawId(item)) +
      '">Archive from My Locker</button>' +
      '</div>'
    );
  }

  function bindOwnerActions(root, item) {
    if (!root) return;
    Array.prototype.forEach.call(root.querySelectorAll('[data-org-action]'), function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var confirmKind = btn.getAttribute('data-confirm') || '';
        runAction(btn.getAttribute('data-org-action'), btn.getAttribute('data-item-type'), btn.getAttribute('data-item-id'), confirmKind);
      });
    });
  }

  function isEligibleStudentAuthor(item) {
    if (!item || !item.lockerPublicKey) return false;
    var role = String(item.authorRole || item.author_role || item.author_type || 'student').toLowerCase();
    if (role && role !== 'student') return false;
    return true;
  }

  function bindAuthorLockerLink(card, item) {
    if (!card || !isEligibleStudentAuthor(item)) return;
    var href = lockerHref(item.lockerPublicKey);
    if (!href) return;
    var chip = card.querySelector('.identity-chip, .exploreCardIdentity, .exploreAuthor, .lanternCanonicalCardAuthor');
    if (!chip) return;
    var wrap = chip.closest('.exploreCardIdentity') || chip.parentElement || chip;
    wrap.classList.add('lockerAuthorLinkWrap');
    wrap.setAttribute('data-locker-public-key', item.lockerPublicKey);
    wrap.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      global.location.href = href;
    });
    wrap.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        global.location.href = href;
      }
    });
    if (!wrap.getAttribute('role')) wrap.setAttribute('role', 'link');
    wrap.setAttribute('tabindex', '0');
    wrap.setAttribute('aria-label', 'Open Locker');
  }

  function applyPeerMode(showcase) {
    var body = document.body;
    body.classList.add('lockerShell--peer');
    body.classList.remove('lockerShell--owner');
    var nr = document.getElementById('profileNeedsAttention');
    if (nr) nr.hidden = true;
    var archived = document.getElementById('lockerArchived');
    if (archived) archived.hidden = true;
    var items = document.getElementById('lockerPanelItems');
    if (items) items.hidden = true;
    var store = document.getElementById('lockerPanelStore');
    if (store) store.hidden = true;
    var filters = document.getElementById('lockerRelationshipSection');
    if (filters) filters.hidden = true;
    var edit = document.getElementById('editProfileBtn');
    if (edit) {
      edit.hidden = true;
      edit.setAttribute('aria-hidden', 'true');
    }
    var title = document.querySelector('.feedPageTitle');
    if (title) title.textContent = (showcase.identity && showcase.identity.display_name ? showcase.identity.display_name : 'Student') + "'s Locker";
    var empty = document.getElementById('feedEmpty');
    if (empty) empty.textContent = showcase.empty_message || 'Nothing on display yet.';
    renderPeerHeader(showcase);
    renderPeerGrid(showcase);
    if (global.LANTERN_SURFACE_THEME) {
      var surface = document.querySelector('.lanternLockerSurface');
      if (surface) global.LANTERN_SURFACE_THEME.applyLockerTheme(surface, showcase.equipped || {});
    }
  }

  function renderPeerHeader(showcase) {
    var host = document.getElementById('lockerProfileHeader');
    if (!host) return;
    var name = (showcase.identity && showcase.identity.display_name) || 'Student';
    var avatar = (showcase.profile && showcase.profile.avatar) || '';
    var fb =
      global.LanternAvatar && global.LanternAvatar.canonicalFallbackAvatarUrl
        ? global.LanternAvatar.canonicalFallbackAvatarUrl()
        : '/assets/fallback-avatar.png';
    host.innerHTML =
      '<div class="lockerHeaderGrid lockerHeaderGrid--peer">' +
      '<section class="lockerHeaderIdentity" aria-label="Profile">' +
      '<div class="lockerHeaderAvatarWrap">' +
      '<img class="lockerHeaderAvatar" src="' +
      esc(avatar || fb) +
      '" alt="' +
      esc(name) +
      '">' +
      '<div class="lockerHeaderAvatarFrame" data-surface-frame-host></div>' +
      '</div>' +
      '<div class="lockerHeaderName">' +
      esc(name) +
      '</div>' +
      '</section>' +
      '</div>';
  }

  function renderPeerGrid(showcase) {
    var grid = document.getElementById('feedGrid');
    var empty = document.getElementById('feedEmpty');
    var featuredHost = document.getElementById('lockerFeaturedRail');
    if (!grid) return;
    var items = (showcase && showcase.items) || [];
    if (featuredHost) {
      var featured = items.filter(function (it) {
        return it.featured;
      });
      if (featured.length) {
        featuredHost.hidden = false;
        featuredHost.innerHTML = '<h2 class="lockerFeaturedHd">Featured</h2>';
      } else {
        featuredHost.hidden = true;
        featuredHost.innerHTML = '';
      }
    }
    grid.innerHTML = '';
    if (!items.length) {
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;
    var cardApi = global.LANTERN_FEED_CARD;
    if (!cardApi) return;
    items.forEach(function (item) {
      grid.appendChild(cardApi.buildCard(item, { peerLocker: true }));
    });
  }

  function bootOwnerOrg() {
    document.body.classList.add('lockerShell--owner');
    renderFeaturedRail();
    renderArchived();
    var hash = String((global.location && global.location.hash) || '');
    if (hash === '#archived') {
      var host = document.getElementById('lockerArchived');
      if (host && host.scrollIntoView) host.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function boot() {
    var view = viewKeyFromLocation();
    if (!view) {
      bootOwnerOrg();
      return;
    }
    if (!global.LanternLockerMe || typeof global.LanternLockerMe.fetchLockerShowcase !== 'function') {
      bootOwnerOrg();
      return;
    }
    global.LanternLockerMe.fetchLockerShowcase(view).then(function (res) {
      if (!res || !res.ok) {
        var empty = document.getElementById('feedEmpty');
        if (empty) {
          empty.hidden = false;
          empty.textContent = 'This Locker is not available.';
        }
        return;
      }
      if (res.viewer_is_owner) {
        bootOwnerOrg();
        return;
      }
      applyPeerMode(res);
    });
  }

  global.LanternLockerOrg = {
    boot: boot,
    lockerHref: lockerHref,
    bindAuthorLockerLink: bindAuthorLockerLink,
    ownerActionBarHtml: ownerActionBarHtml,
    bindOwnerActions: bindOwnerActions,
    runAction: runAction,
    itemTypeFromFeed: itemTypeFromFeed,
    viewKeyFromLocation: viewKeyFromLocation,
    renderArchived: renderArchived,
    renderFeaturedRail: renderFeaturedRail,
    isEligibleStudentAuthor: isEligibleStudentAuthor,
  };
})(typeof window !== 'undefined' ? window : self);
