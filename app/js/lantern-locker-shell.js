/**

 * Locker shared shell: profile header + shared Explore engine bootstrap.

 */

(function (global) {

  'use strict';



  var lockerFeedController = null;

  var BIO_MAX = 180;



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



  function bindBioEditor(aboutSection, locker) {

    if (!aboutSection || !locker || !locker.ok) return;



    var bio = currentBio(locker);

    var bioEl = aboutSection.querySelector('.lockerHeaderBio');

    var editBtn = aboutSection.querySelector('.lockerHeaderBioEditBtn');

    var editor = aboutSection.querySelector('.lockerHeaderBioEditor');

    if (!bioEl || !editBtn || !editor) return;



    function closeEditor(revertValue) {

      editor.hidden = true;

      editBtn.hidden = false;

      bioEl.hidden = false;

      renderBioDisplay(bioEl, revertValue != null ? revertValue : bio);

      editBtn.textContent = bio ? 'Edit' : 'Add Bio';

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



    editBtn.textContent = bio ? 'Edit' : 'Add Bio';

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

      '<button type="button" class="lockerHeaderBioEditBtn">' +

      (bio ? 'Edit' : 'Add Bio') +

      '</button>' +

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

    getFeedController: function () {

      return lockerFeedController;

    },

  };

})(typeof window !== 'undefined' ? window : this);

