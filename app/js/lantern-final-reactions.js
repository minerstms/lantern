/**
 * Lantern — immutable finalized feed reactions (five positive choices, lock-in once).
 * Prompt #222 — no permanent Lock In; compact confirmation after selecting a reaction.
 */
(function (global) {
  'use strict';

  var FINAL_VOCAB = [
    { type: 'heart', emoji: '❤️', label: 'Love' },
    { type: 'star', emoji: '⭐', label: 'Star' },
    { type: 'lightbulb', emoji: '💡', label: 'Idea' },
    { type: 'teamwork', emoji: '🤝', label: 'Handshake' },
    { type: 'fire', emoji: '🔥', label: 'Fire' }
  ];

  var LOCKED_NOTICE_MS = 3200;

  function esc(s) {
    return String(s || '').replace(/[&<>"']/g, function (c) {
      return c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;';
    });
  }

  function getApiBase() {
    if (typeof global.LANTERN_AVATAR_API === 'undefined' || global.LANTERN_AVATAR_API === null) return null;
    return String(global.LANTERN_AVATAR_API).replace(/\/$/, '');
  }

  function emojiForType(t) {
    for (var i = 0; i < FINAL_VOCAB.length; i++) {
      if (FINAL_VOCAB[i].type === t) return FINAL_VOCAB[i].emoji;
    }
    return '';
  }

  function getFinalizedStatus(itemType, itemId) {
    var apiBase = getApiBase();
    if (apiBase === null || !itemType || !itemId) return Promise.resolve({ ok: false });
    var q = 'item_type=' + encodeURIComponent(itemType) + '&item_id=' + encodeURIComponent(itemId);
    return fetch(apiBase + '/api/reactions/finalized-status?' + q, { credentials: 'include' })
      .then(function (r) { return r.json(); })
      .catch(function () { return { ok: false }; });
  }

  function finalizeReaction(itemType, itemId, reactionType) {
    var apiBase = getApiBase();
    if (apiBase === null) return Promise.resolve({ ok: false, error: 'No API' });
    return fetch(apiBase + '/api/reactions/finalize', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_type: itemType, item_id: itemId, reaction_type: reactionType })
    }).then(function (r) { return r.json(); }).catch(function () { return { ok: false }; });
  }

  function isAuthenticatedViewer() {
    try {
      var me = global.LANTERN_PILOT_ME;
      if (me && me.ok && me.authenticated !== false) return true;
      var auth = global.LanternPilotAuth || global.LanternAuth;
      if (auth && typeof auth.getCachedPilotMe === 'function') {
        var cached = auth.getCachedPilotMe();
        return !!(cached && cached.ok && cached.authenticated !== false);
      }
    } catch (e) {}
    return false;
  }

  function percentageByType(results) {
    var map = {};
    (results || []).forEach(function (r) {
      map[r.reaction_type] = r.percentage;
    });
    return map;
  }

  function renderResultsHtml(results) {
    var pctMap = percentageByType(results);
    var html = '<div class="lanternFinalRxResults" role="list">';
    FINAL_VOCAB.forEach(function (v) {
      var pct = pctMap[v.type] != null ? pctMap[v.type] : 0;
      html += '<div class="lanternFinalRxResultCell" role="listitem">' +
        esc(v.emoji) + ' ' + esc(String(pct)) + '%</div>';
    });
    html += '</div>';
    return html;
  }

  function showLockedChangeNotice(panel) {
    if (!panel) return;
    var existing = panel.querySelector('.lanternFinalRxLockedNotice');
    if (existing) {
      existing.classList.add('lanternFinalRxLockedNotice--show');
      if (existing._hideTimer) clearTimeout(existing._hideTimer);
      existing._hideTimer = setTimeout(function () {
        existing.classList.remove('lanternFinalRxLockedNotice--show');
      }, LOCKED_NOTICE_MS);
      return;
    }
    var notice = global.document.createElement('div');
    notice.className = 'lanternFinalRxLockedNotice';
    notice.setAttribute('role', 'status');
    notice.innerHTML =
      '<p class="lanternFinalRxLockedNoticeTitle">Response Locked</p>' +
      '<p class="lanternFinalRxLockedNoticeSub">Your response can\u2019t be changed after you lock it in.</p>';
    panel.appendChild(notice);
    global.requestAnimationFrame(function () {
      notice.classList.add('lanternFinalRxLockedNotice--show');
    });
    notice._hideTimer = setTimeout(function () {
      notice.classList.remove('lanternFinalRxLockedNotice--show');
    }, LOCKED_NOTICE_MS);
  }

  function wireLockedChoiceAttempts(panel, lockedType) {
    if (!panel) return;
    panel.querySelectorAll('.lanternFinalRxChoice[data-locked="true"]').forEach(function (btn) {
      function onAttempt(e) {
        if (e && e.preventDefault) e.preventDefault();
        showLockedChangeNotice(panel);
      }
      btn.addEventListener('click', onAttempt);
      btn.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onAttempt(e);
        }
      });
    });
  }

  function confirmPopoverHtml() {
    return (
      '<div class="lanternFinalRxConfirm" hidden role="dialog" aria-label="Confirm reaction">' +
        '<div class="lanternFinalRxConfirmActions">' +
          '<button type="button" class="lanternFinalRxConfirmOk">Lock it in!</button>' +
          '<button type="button" class="lanternFinalRxConfirmCancel">Choose another.</button>' +
        '</div>' +
      '</div>'
    );
  }

  function renderPreviewPanel(container) {
    var draft = null;
    var html = '<div class="lanternFinalRxPanel lanternFinalRxPanel--draft lanternFinalRxPanel--preview" data-final-rx-preview="1">';
    html += '<h3 class="lanternFinalRxHeading">Leave a reaction!</h3>';
    html += '<div class="lanternFinalRxChoices" data-final-rx-choices="1">';
    FINAL_VOCAB.forEach(function (v) {
      html += '<button type="button" class="lanternFinalRxChoice" data-rx-type="' + esc(v.type) + '" aria-label="' + esc(v.label) + '" aria-pressed="false">' + v.emoji + '</button>';
    });
    html += '</div>';
    html += confirmPopoverHtml();
    html += '</div>';
    container.innerHTML = html;
    var panel = container.querySelector('.lanternFinalRxPanel');
    var choiceBtns = container.querySelectorAll('.lanternFinalRxChoice');
    var confirmBox = container.querySelector('.lanternFinalRxConfirm');
    var confirmOk = container.querySelector('.lanternFinalRxConfirmOk');
    var confirmCancel = container.querySelector('.lanternFinalRxConfirmCancel');

    function syncDraftUi() {
      choiceBtns.forEach(function (btn) {
        var t = btn.getAttribute('data-rx-type');
        var on = t === draft;
        btn.classList.toggle('lanternFinalRxChoice--on', on);
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      if (confirmBox) confirmBox.hidden = !draft;
    }

    choiceBtns.forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        var t = btn.getAttribute('data-rx-type');
        draft = t;
        syncDraftUi();
      });
    });
    if (confirmCancel) {
      confirmCancel.addEventListener('click', function (e) {
        e.preventDefault();
        draft = null;
        syncDraftUi();
      });
    }
    if (confirmOk) {
      confirmOk.addEventListener('click', function (e) {
        e.preventDefault();
      });
    }
    if (panel) {
      panel.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && draft) {
          draft = null;
          syncDraftUi();
        }
      });
    }
    syncDraftUi();
  }

  /**
   * Mount finalized-reaction UI into container.
   * opts: { item_type, item_id, onFinalized }
   */
  function mountFinalReactionPanel(container, opts) {
    if (!container) return;
    opts = opts || {};
    if (opts.mode === 'preview') {
      renderPreviewPanel(container);
      return;
    }
    var itemType = String(opts.item_type || 'feed').trim();
    var itemId = String(opts.item_id || '').trim();
    if (!itemId) {
      container.innerHTML = '';
      return;
    }
    container.innerHTML = '<p class="lanternFinalRxLoading">Loading reactions…</p>';

    getFinalizedStatus(itemType, itemId).then(function (status) {
      if (!status || !status.ok) {
        container.innerHTML = '<p class="lanternFinalRxHint">Sign in to share how this made you feel.</p>';
        return;
      }

      if (status.finalized) {
        renderLocked(container, status);
        return;
      }

      renderDraft(container, itemType, itemId, opts);
    });
  }

  function renderLocked(container, status) {
    var rt = status.reaction_type;
    var em = emojiForType(rt);
    var html = '<div class="lanternFinalRxPanel lanternFinalRxPanel--locked">';
    html += '<h3 class="lanternFinalRxHeading">Leave a reaction!</h3>';
    html += '<div class="lanternFinalRxChoices lanternFinalRxChoices--locked">';
    FINAL_VOCAB.forEach(function (v) {
      var on = v.type === rt ? ' lanternFinalRxChoice--locked-on' : '';
      html += '<button type="button" class="lanternFinalRxChoice' + on + '" data-locked="true" data-rx-type="' + esc(v.type) + '" aria-disabled="true" aria-label="' + esc(v.label) + '">' + v.emoji + '</button>';
    });
    html += '</div>';
    if (status.results && status.results.length) {
      html += renderResultsHtml(status.results);
    }
    if (rt) {
      html += '<p class="lanternFinalRxYour">Your response: ' + esc(em) + '</p>';
    }
    html += '</div>';
    container.innerHTML = html;
    var panel = container.querySelector('.lanternFinalRxPanel');
    wireLockedChoiceAttempts(panel, rt);
  }

  function renderDraft(container, itemType, itemId, opts) {
    var draft = null;
    var submitting = false;
    var html = '<div class="lanternFinalRxPanel lanternFinalRxPanel--draft">';
    html += '<h3 class="lanternFinalRxHeading">Leave a reaction!</h3>';
    html += '<div class="lanternFinalRxChoices" data-final-rx-choices="1">';
    FINAL_VOCAB.forEach(function (v) {
      html += '<button type="button" class="lanternFinalRxChoice" data-rx-type="' + esc(v.type) + '" aria-label="' + esc(v.label) + '" aria-pressed="false">' + v.emoji + '</button>';
    });
    html += '</div>';
    html += confirmPopoverHtml();
    html += '</div>';
    container.innerHTML = html;

    var panel = container.querySelector('.lanternFinalRxPanel');
    var choiceBtns = container.querySelectorAll('.lanternFinalRxChoice');
    var confirmBox = container.querySelector('.lanternFinalRxConfirm');
    var confirmOk = container.querySelector('.lanternFinalRxConfirmOk');
    var confirmCancel = container.querySelector('.lanternFinalRxConfirmCancel');

    function clearError() {
      var errEl = container.querySelector('.lanternFinalRxError');
      if (errEl) errEl.remove();
    }

    function showError(msg) {
      clearError();
      var errEl = global.document.createElement('p');
      errEl.className = 'lanternFinalRxError';
      errEl.setAttribute('role', 'alert');
      errEl.textContent = msg || 'Could not lock in response.';
      var host = container.querySelector('.lanternFinalRxPanel') || container;
      host.appendChild(errEl);
    }

    function syncDraftUi() {
      choiceBtns.forEach(function (btn) {
        var t = btn.getAttribute('data-rx-type');
        var on = t === draft;
        btn.classList.toggle('lanternFinalRxChoice--on', on);
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        btn.disabled = !!submitting;
      });
      if (confirmBox) confirmBox.hidden = !draft || submitting;
      if (confirmOk) confirmOk.disabled = !draft || submitting;
      if (confirmCancel) confirmCancel.disabled = submitting;
    }

    function clearTentative() {
      draft = null;
      syncDraftUi();
    }

    choiceBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (submitting) return;
        clearError();
        var t = btn.getAttribute('data-rx-type');
        // Prompt #222 — selecting a reaction opens/keeps confirmation; switching updates tentative choice.
        draft = t;
        syncDraftUi();
      });
    });

    if (confirmCancel) {
      confirmCancel.addEventListener('click', function () {
        if (submitting) return;
        clearError();
        clearTentative();
      });
    }

    if (confirmOk) {
      confirmOk.addEventListener('click', function () {
        if (!draft || submitting) return;
        clearError();
        submitting = true;
        syncDraftUi();
        var chosen = draft;
        finalizeReaction(itemType, itemId, chosen).then(function (res) {
          submitting = false;
          if (res && res.ok && res.finalized) {
            if (typeof opts.onFinalized === 'function') opts.onFinalized(res);
            renderLocked(container, res);
            return;
          }
          if (res && res.error === 'reaction_already_finalized') {
            getFinalizedStatus(itemType, itemId).then(function (st) {
              if (st && st.ok) renderLocked(container, st);
            });
            return;
          }
          // Failure: do not lock, do not reveal percentages, restore interactive state.
          draft = chosen;
          syncDraftUi();
          var errMsg = (res && res.error) ? String(res.error) : 'Could not lock in response.';
          showError(errMsg);
        });
      });
    }

    if (panel) {
      panel.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && draft && !submitting) {
          clearTentative();
        }
      });
    }

    syncDraftUi();
  }

  global.LANTERN_FINAL_REACTIONS = {
    VOCAB: FINAL_VOCAB,
    getFinalizedStatus: getFinalizedStatus,
    finalizeReaction: finalizeReaction,
    mountFinalReactionPanel: mountFinalReactionPanel,
    emojiForType: emojiForType,
    isAuthenticatedViewer: isAuthenticatedViewer,
    renderResultsHtml: renderResultsHtml,
    showLockedChangeNotice: showLockedChangeNotice
  };
})(typeof window !== 'undefined' ? window : self);
