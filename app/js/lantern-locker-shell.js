/**
 * Locker shared shell: profile header + shared Explore engine bootstrap.
 * Prompt #161: Locker Options ▾ replaces About Edit + large Overview/Items/Store tabs.
 */
(function (global) {
  'use strict';

  var lockerFeedController = null;
  var BIO_MAX = 180;
  var aboutBioOpenEditor = null;
  var lockerOptionsDocBound = false;

  function el(id) {
    return global.document.getElementById(id);
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function currentBio(locker) {
    var profile = (locker && locker.profile) || {};
    return profile.bio != null && String(profile.bio).trim() ? String(profile.bio).trim() : '';
  }

  function setLockerBio(bio) {
    if (!global.LANTERN_LOCKER_ME || !global.LANTERN_LOCKER_ME.ok) return;
    if (!global.LANTERN_LOCKER_ME.profile) global.LANTERN_LOCKER_ME.profile = {};
    global.LANTERN_LOCKER_ME.profile.bio = bio || null;
  }

  function renderBioDisplay(bioEl, bio) {
    if (!bioEl) return;
    bioEl.textContent = '';
    if (bio) {
      bioEl.textContent = bio;
      bioEl.classList.remove('lockerHeaderBio--empty');
    } else {
      var empty = global.document.createElement('span');
      empty.className = 'lockerHeaderBioEmpty';
      empty.textContent = 'Add a short bio.';
      bioEl.appendChild(empty);
      bioEl.classList.add('lockerHeaderBio--empty');
    }
  }

  function closeLockerOptionsMenu(root) {
    var host = root || global.document.getElementById('lockerProfileHeader');
    if (!host) return;
    var wrap = host.querySelector('[data-locker-options]');
    if (!wrap) return;
    var trigger = wrap.querySelector('.lockerOptionsTrigger');
    var menu = wrap.querySelector('.lockerOptionsMenu');
    if (menu) menu.hidden = true;
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
  }

  function setActiveLockerOption(tab) {
    var host = el('lockerProfileHeader');
    if (!host) return;
    var items = host.querySelectorAll('.lockerOptionsItem[data-locker-tab]');
    for (var i = 0; i < items.length; i++) {
      var btn = items[i];
      var t = btn.getAttribute('data-locker-tab');
      var isCurrent = t === tab;
      btn.setAttribute('aria-current', isCurrent ? 'page' : 'false');
      if (isCurrent) btn.classList.add('is-current');
      else btn.classList.remove('is-current');
    }
  }

  function bindLockerOptionsUi(host) {
    if (!host) return;
    var wrap = host.querySelector('[data-locker-options]');
    if (!wrap) return;
    var trigger = wrap.querySelector('.lockerOptionsTrigger');
    var menu = wrap.querySelector('.lockerOptionsMenu');
    if (!trigger || !menu) return;

    trigger.onclick = function (e) {
      e.preventDefault();
      e.stopPropagation();
      var open = menu.hidden;
      if (open) {
        menu.hidden = false;
        trigger.setAttribute('aria-expanded', 'true');
      } else {
        closeLockerOptionsMenu(host);
      }
    };

    if (!lockerOptionsDocBound) {
      lockerOptionsDocBound = true;
      global.document.addEventListener('click', function (e) {
        var opts = global.document.querySelector('[data-locker-options]');
        if (!opts) return;
        if (opts.contains(e.target)) return;
        closeLockerOptionsMenu();
      });
      global.document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') closeLockerOptionsMenu();
      });
    }
  }

  function bindBioEditor(aboutSection, locker) {
    if (!aboutSection || !locker || !locker.ok) return;
    var bio = currentBio(locker);
    var bioEl = aboutSection.querySelector('.lockerHeaderBio');
    var editBtn = aboutSection.querySelector('.lockerHeaderBioEditBtn');
    var editor = aboutSection.querySelector('.lockerHeaderBioEditor');
    if (!bioEl || !editBtn || !editor) return;

    function closeEditor(revertValue) {
      editor.hidden = true;
      editBtn.hidden = true;
      bioEl.hidden = false;
      renderBioDisplay(bioEl, revertValue != null ? revertValue : bio);
    }

    function openEditor() {
      bio = currentBio(locker);
      editBtn.hidden = true;
      bioEl.hidden = true;
      editor.hidden = false;
      var textarea = editor.querySelector('.lockerHeaderBioTextarea');
      var countEl = editor.querySelector('.lockerHeaderBioCount');
      var errEl = editor.querySelector('.lockerHeaderBioError');
      if (!textarea) return;
      textarea.value = bio;
      if (errEl) {
        errEl.textContent = '';
        errEl.hidden = true;
      }
      function syncCount() {
        var len = textarea.value.length;
        if (countEl) countEl.textContent = len + ' / ' + BIO_MAX;
      }
      syncCount();
      textarea.oninput = syncCount;
      textarea.focus();
    }

    aboutBioOpenEditor = openEditor;
    editBtn.hidden = true;
    editBtn.setAttribute('aria-hidden', 'true');
    editBtn.tabIndex = -1;
    editBtn.onclick = openEditor;

    var cancelBtn = editor.querySelector('.lockerHeaderBioCancelBtn');
    var saveBtn = editor.querySelector('.lockerHeaderBioSaveBtn');
    var textarea = editor.querySelector('.lockerHeaderBioTextarea');
    if (cancelBtn) {
      cancelBtn.onclick = function () {
        closeEditor(bio);
      };
    }
    if (saveBtn && textarea) {
      saveBtn.onclick = function () {
        var errEl = editor.querySelector('.lockerHeaderBioError');
        var value = textarea.value;
        if (value.length > BIO_MAX) {
          if (errEl) {
            errEl.textContent = 'Bio must be ' + BIO_MAX + ' characters or fewer.';
            errEl.hidden = false;
          }
          return;
        }
        saveBtn.disabled = true;
        if (errEl) {
          errEl.textContent = '';
          errEl.hidden = true;
        }
        var api = global.LanternLockerMe;
        if (!api || typeof api.callUpdateBio !== 'function') {
          saveBtn.disabled = false;
          if (errEl) {
            errEl.textContent = 'Could not save bio.';
            errEl.hidden = false;
          }
          return;
        }
        api.callUpdateBio(value).then(function (res) {
          saveBtn.disabled = false;
          if (!res || !res.ok) {
            if (errEl) {
              errEl.textContent =
                (res && res.error === 'bio_too_long'
                  ? 'Bio must be ' + BIO_MAX + ' characters or fewer.'
                  : null) || 'Could not save bio.';
              errEl.hidden = false;
            }
            return;
          }
          var nextBio =
            res.profile && res.profile.bio != null && String(res.profile.bio).trim()
              ? String(res.profile.bio).trim()
              : '';
          setLockerBio(nextBio || null);
          bio = nextBio;
          closeEditor(bio);
        });
      };
    }
  }

  function lockerOptionsMenuHtml() {
    return (
      '<div class="lockerOptions" data-locker-options>' +
      '<button type="button" class="lockerOptionsTrigger" id="lockerOptionsTrigger" aria-haspopup="menu" aria-expanded="false" aria-controls="lockerOptionsMenu">' +
      'Locker Options <span class="lockerOptionsChevron" aria-hidden="true">▾</span>' +
      '</button>' +
      '<div class="lockerOptionsMenu" id="lockerOptionsMenu" role="menu" hidden>' +
      '<button type="button" role="menuitem" class="lockerOptionsItem" data-locker-action="tab" data-locker-tab="overview">Overview</button>' +
      '<button type="button" role="menuitem" class="lockerOptionsItem" data-locker-action="tab" data-locker-tab="items">Items</button>' +
      '<button type="button" role="menuitem" class="lockerOptionsItem" data-locker-action="tab" data-locker-tab="store">Store</button>' +
      '<button type="button" role="menuitem" class="lockerOptionsItem" data-locker-action="edit-profile" data-help="edit_profile">Edit Profile</button>' +
      '<button type="button" role="menuitem" class="lockerOptionsItem" data-locker-action="edit-about">Edit About</button>' +
      '</div>' +
      '</div>'
    );
  }

  function renderProfileHeader(locker) {
    var host = el('lockerProfileHeader');
    if (!host || !locker || !locker.ok) return;
    var account = locker.account || {};
    var profile = locker.profile || {};
    var progress = locker.progress || {};
    var displayName =
      account.display_name != null && String(account.display_name).trim()
        ? String(account.display_name).trim()
        : account.username || '';
    var avatarUrl = profile.avatar || '';
    var bio = currentBio(locker);
    var milestone = progress.next_milestone || {};
    var missions = progress.missions_completed != null ? progress.missions_completed : '—';
    var earned = progress.nuggets_earned_lifetime != null ? progress.nuggets_earned_lifetime : '—';
    var milestoneLabel = milestone.label || '—';
    var milestonePct = milestone.progress != null ? milestone.progress : 0;
    host.innerHTML =
      '<div class="lockerHeaderGrid">' +
      '<section class="lockerHeaderProgress" aria-labelledby="lockerHeaderProgressTitle">' +
      '<h2 id="lockerHeaderProgressTitle" class="lockerHeaderTitle">Progress</h2>' +
      '<div class="lockerHeaderMetric"><span class="lockerHeaderMetricLabel">Missions Completed</span><span class="lockerHeaderMetricValue">' +
      escapeHtml(missions) +
      '</span></div>' +
      '<div class="lockerHeaderMetric"><span class="lockerHeaderMetricLabel">Nuggets Earned</span><span class="lockerHeaderMetricValue">' +
      escapeHtml(earned) +
      '</span></div>' +
      '<div class="lockerHeaderMetric"><span class="lockerHeaderMetricLabel">Next Milestone</span><span class="lockerHeaderMetricValue">' +
      escapeHtml(milestoneLabel) +
      '</span></div>' +
      '<div class="lockerHeaderProgressBar" role="progressbar" aria-valuenow="' +
      milestonePct +
      '" aria-valuemin="0" aria-valuemax="100"><div class="lockerHeaderProgressFill" style="width:' +
      milestonePct +
      '%"></div></div>' +
      '</section>' +
      '<section class="lockerHeaderIdentity" aria-label="Profile">' +
      '<div class="lockerHeaderAvatarWrap">' +
      (avatarUrl
        ? '<img class="lockerHeaderAvatar" src="' + escapeHtml(avatarUrl) + '" alt="">'
        : '<div class="lockerHeaderAvatar lockerHeaderAvatar--placeholder" aria-hidden="true">🌟</div>') +
      '<div class="lockerHeaderAvatarFrame" data-surface-frame-host></div>' +
      '</div>' +
      '<div class="lockerHeaderName">' +
      escapeHtml(displayName) +
      '</div>' +
      '</section>' +
      '<section class="lockerHeaderAbout" aria-labelledby="lockerHeaderAboutTitle">' +
      '<div class="lockerHeaderAboutHd">' +
      '<h2 id="lockerHeaderAboutTitle" class="lockerHeaderTitle">About ' +
      escapeHtml(displayName) +
      '</h2>' +
      lockerOptionsMenuHtml() +
      '<button type="button" class="lockerHeaderBioEditBtn" hidden aria-hidden="true" tabindex="-1">Edit About</button>' +
      '</div>' +
      '<p class="lockerHeaderBio"></p>' +
      '<div class="lockerHeaderBioEditor" hidden>' +
      '<label class="lockerHeaderBioLabel" for="lockerHeaderBioTextarea">Short bio</label>' +
      '<textarea id="lockerHeaderBioTextarea" class="lockerHeaderBioTextarea" maxlength="' +
      BIO_MAX +
      '" rows="3" aria-describedby="lockerHeaderBioHint lockerHeaderBioCount"></textarea>' +
      '<p id="lockerHeaderBioHint" class="lockerHeaderBioHint">Keep it short — don\u2019t include private contact information.</p>' +
      '<p id="lockerHeaderBioCount" class="lockerHeaderBioCount">0 / ' +
      BIO_MAX +
      '</p>' +
      '<p class="lockerHeaderBioError" hidden role="alert"></p>' +
      '<div class="lockerHeaderBioActions">' +
      '<button type="button" class="lockerHeaderBioSaveBtn feedToolbarBtn">Save</button>' +
      '<button type="button" class="lockerHeaderBioCancelBtn feedToolbarBtn">Cancel</button>' +
      '</div>' +
      '</div>' +
      '</section>' +
      '</div>';
    var aboutSection = host.querySelector('.lockerHeaderAbout');
    renderBioDisplay(host.querySelector('.lockerHeaderBio'), bio);
    bindBioEditor(aboutSection, locker);
    bindLockerOptionsUi(host);
    try {
      var hash = String((global.location && global.location.hash) || '');
      var tab = 'overview';
      if (hash === '#items') tab = 'items';
      else if (hash === '#store') tab = 'store';
      setActiveLockerOption(tab);
    } catch (e) {}
  }

  function openAboutBioEditor() {
    if (typeof aboutBioOpenEditor === 'function') {
      aboutBioOpenEditor();
      return true;
    }
    var btn = global.document.querySelector('.lockerHeaderBioEditBtn');
    if (btn) {
      btn.click();
      return true;
    }
    return false;
  }

  function initLockerFeed() {
    if (!global.LANTERN_FEED_EXPLORE || typeof global.LANTERN_FEED_EXPLORE.createController !== 'function') return;
    if (lockerFeedController) return;
    lockerFeedController = global.LANTERN_FEED_EXPLORE.createController({
      context: 'locker',
      surfaceSelector: '.lanternLockerSurface',
    });
    lockerFeedController.init();
  }

  function bootLockerShell(locker) {
    if (global.document.body) global.document.body.classList.add('lockerShell--sharedFeed');
    renderProfileHeader(locker);
    if (global.LANTERN_SURFACE_THEME) {
      var surface = global.document.querySelector('.lanternLockerSurface');
      var equipped =
        locker && locker.equipped_items && locker.equipped_items.equipped
          ? locker.equipped_items.equipped
          : {};
      if (surface) global.LANTERN_SURFACE_THEME.applyLockerTheme(surface, equipped);
    }
    initLockerFeed();
  }

  function refreshProfileHeader() {
    var locker = global.LANTERN_LOCKER_ME && global.LANTERN_LOCKER_ME.ok ? global.LANTERN_LOCKER_ME : null;
    if (locker) renderProfileHeader(locker);
  }

  global.LANTERN_LOCKER_SHELL = {
    boot: bootLockerShell,
    renderProfileHeader: renderProfileHeader,
    refreshProfileHeader: refreshProfileHeader,
    openAboutBioEditor: openAboutBioEditor,
    setActiveLockerOption: setActiveLockerOption,
    closeLockerOptionsMenu: closeLockerOptionsMenu,
    getFeedController: function () {
      return lockerFeedController;
    },
  };
})(typeof window !== 'undefined' ? window : this);
