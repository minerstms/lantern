/**
 * Lantern — immutable finalized feed reactions (five positive choices).
 * Prompt #228 — tap submits immediately; no Lock In; spatial vertical race.
 */
(function (global) {
  'use strict';

  var BANK = global.LANTERN_REACTION_BANK;
  var FINAL_VOCAB = BANK && BANK.DEFAULT_FIVE
    ? BANK.DEFAULT_FIVE
    : [
        { type: 'heart', emoji: '❤️', label: 'Love' },
        { type: 'star', emoji: '⭐', label: 'Star' },
        { type: 'lightbulb', emoji: '💡', label: 'Idea' },
        { type: 'teamwork', emoji: '🤝', label: 'Handshake' },
        { type: 'fire', emoji: '🔥', label: 'Fire' },
      ];

  var LOCKED_NOTICE_MS = 3200;

  function esc(s) {
    return String(s || '').replace(/[&<>"']/g, function (c) {
      return c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;';
    });
  }

  function orderedVocab(types) {
    var source = FINAL_VOCAB;
    if (BANK && typeof BANK.canonicalSort === 'function' && types && types.length) {
      return BANK.canonicalSort(types)
        .map(function (t) {
          return BANK.entryForType(t);
        })
        .filter(Boolean);
    }
    return source;
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

  function renderResultsHtml(results, selectedType) {
    var pctMap = percentageByType(results);
    var html = '<div class="lanternFinalRxResults" role="list">';
    FINAL_VOCAB.forEach(function (v) {
      var yours = selectedType && v.type === selectedType;
      html += '<div class="lanternFinalRxResultCell' + (yours ? ' lanternFinalRxResultCell--yours' : '') + '" role="listitem">' +
        esc(v.emoji) + (yours ? ' <em class="pollYourChoiceMark">Your choice</em>' : '') + '</div>';
    });
    html += '</div>';
    return html;
  }

  function reactionResultItems(results, selectedType) {
    var pctMap = percentageByType(results);
    return FINAL_VOCAB.map(function (v) {
      return {
        label: v.label,
        emoji: v.emoji,
        type: v.type,
        percentage: pctMap[v.type] != null ? pctMap[v.type] : 0,
        selected: !!(selectedType && v.type === selectedType),
      };
    });
  }

  function revealReactionResults(host, results, selectedType, anchorRoot) {
    var items = reactionResultItems(results, selectedType);
    var api = global.LANTERN_RESULT_REVEAL;
    var root = anchorRoot || host;
    if (api && typeof api.mountReactionSpatialRace === 'function' && root) {
      api.mountReactionSpatialRace(root, items, {
        choiceSelector: '.lanternFinalRxChoice',
        typeAttr: 'data-rx-type',
      });
      return;
    }
    if (host && api && typeof api.mountResultRace === 'function') {
      api.mountResultRace(host, items, { listLabel: 'Reaction results' });
      return;
    }
    if (host) host.innerHTML = renderResultsHtml(results, selectedType);
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
      '<p class="lanternFinalRxLockedNoticeTitle">Response saved</p>' +
      '<p class="lanternFinalRxLockedNoticeSub">Your response can\u2019t be changed after you choose.</p>';
    panel.appendChild(notice);
    global.requestAnimationFrame(function () {
      notice.classList.add('lanternFinalRxLockedNotice--show');
    });
    notice._hideTimer = setTimeout(function () {
      notice.classList.remove('lanternFinalRxLockedNotice--show');
    }, LOCKED_NOTICE_MS);
  }

  function wireLockedChoiceAttempts(panel) {
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

  function choicesHtml(vocab, extraClass) {
    var html = '<div class="lanternFinalRxRaceArena"><div class="lanternFinalRxChoices" data-final-rx-choices="1" style="grid-template-columns:repeat(' + vocab.length + ',minmax(0,1fr))">';
    vocab.forEach(function (v) {
      html +=
        '<div class="lanternRxLane">' +
        '<div class="lanternRxRaceBar" data-race-fill aria-hidden="true"></div>' +
        '<button type="button" class="lanternFinalRxChoice' +
        (extraClass || '') +
        '" data-rx-type="' +
        esc(v.type) +
        '" aria-label="' +
        esc(v.label) +
        '" aria-pressed="false">' +
        v.emoji +
        '</button>' +
        '<span class="lanternRxRacePct lanternResultRacePct is-pending" data-race-pct aria-hidden="true"></span>' +
        '</div>';
    });
    html += '</div></div>';
    return html;
  }

  function renderPreviewPanel(container) {
    var selected = null;
    var vocab = orderedVocab();
    var html = '<div class="lanternFinalRxPanel lanternFinalRxPanel--draft lanternFinalRxPanel--preview" data-final-rx-preview="1">';
    html += '<h3 class="lanternFinalRxHeading">Leave a reaction!</h3>';
    html += choicesHtml(vocab, '');
    html += '</div>';
    container.innerHTML = html;
    var choiceBtns = container.querySelectorAll('.lanternFinalRxChoice');

    function sync() {
      choiceBtns.forEach(function (btn) {
        var on = btn.getAttribute('data-rx-type') === selected;
        btn.classList.toggle('lanternFinalRxChoice--on', on);
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    }

    choiceBtns.forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        selected = btn.getAttribute('data-rx-type');
        sync();
      });
    });
    sync();
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

  function lockExistingDraft(container, status) {
    var panel = container.querySelector('.lanternFinalRxPanel');
    if (!panel) {
      renderLocked(container, status);
      return;
    }
    var rt = status.reaction_type;
    panel.classList.add('lanternFinalRxPanel--locked');
    panel.classList.remove('lanternFinalRxPanel--draft');
    container.querySelectorAll('.lanternFinalRxChoice').forEach(function (btn) {
      var t = btn.getAttribute('data-rx-type');
      btn.setAttribute('data-locked', 'true');
      btn.setAttribute('aria-disabled', 'true');
      btn.disabled = true;
      if (t === rt) {
        btn.classList.add('lanternFinalRxChoice--locked-on', 'lanternFinalRxChoice--on');
        var lane = btn.closest('.lanternRxLane');
        if (lane) lane.classList.add('lanternRxLane--yours');
      }
    });
    if (rt && !panel.querySelector('.lanternFinalRxYour')) {
      var yours = global.document.createElement('p');
      yours.className = 'lanternFinalRxYour';
      yours.textContent = 'Your response: ' + emojiForType(rt);
      panel.appendChild(yours);
    }
    if (status.results && status.results.length) {
      revealReactionResults(null, status.results, rt, panel);
    }
    wireLockedChoiceAttempts(panel);
  }

  function renderLocked(container, status) {
    var rt = status.reaction_type;
    var em = emojiForType(rt);
    var vocab = orderedVocab();
    var html = '<div class="lanternFinalRxPanel lanternFinalRxPanel--locked">';
    html += '<h3 class="lanternFinalRxHeading">Leave a reaction!</h3>';
    html += choicesHtml(vocab, '');
    if (rt) {
      html += '<p class="lanternFinalRxYour">Your response: ' + esc(em) + '</p>';
    }
    html += '</div>';
    container.innerHTML = html;
    var panel = container.querySelector('.lanternFinalRxPanel');
    container.querySelectorAll('.lanternFinalRxChoice').forEach(function (btn) {
      var t = btn.getAttribute('data-rx-type');
      btn.setAttribute('data-locked', 'true');
      btn.setAttribute('aria-disabled', 'true');
      btn.disabled = true;
      if (t === rt) {
        btn.classList.add('lanternFinalRxChoice--locked-on', 'lanternFinalRxChoice--on');
        var lane = btn.closest('.lanternRxLane');
        if (lane) lane.classList.add('lanternRxLane--yours');
      }
    });
    if (status.results && status.results.length) {
      revealReactionResults(null, status.results, rt, panel || container);
    }
    wireLockedChoiceAttempts(panel);
  }

  function renderDraft(container, itemType, itemId, opts) {
    var submitting = false;
    var vocab = orderedVocab();
    var html = '<div class="lanternFinalRxPanel lanternFinalRxPanel--draft">';
    html += '<h3 class="lanternFinalRxHeading">Leave a reaction!</h3>';
    html += choicesHtml(vocab, '');
    html += '</div>';
    container.innerHTML = html;

    var panel = container.querySelector('.lanternFinalRxPanel');
    var choiceBtns = container.querySelectorAll('.lanternFinalRxChoice');

    function clearError() {
      var errEl = container.querySelector('.lanternFinalRxError');
      if (errEl) errEl.remove();
    }

    function showError(msg) {
      clearError();
      var errEl = global.document.createElement('p');
      errEl.className = 'lanternFinalRxError';
      errEl.setAttribute('role', 'alert');
      errEl.textContent = msg || 'Could not save response.';
      var host = container.querySelector('.lanternFinalRxPanel') || container;
      host.appendChild(errEl);
    }

    function setBusy(on, chosen) {
      submitting = !!on;
      choiceBtns.forEach(function (btn) {
        var t = btn.getAttribute('data-rx-type');
        btn.disabled = !!on;
        btn.classList.toggle('lanternFinalRxChoice--on', !!(chosen && t === chosen));
        btn.setAttribute('aria-pressed', chosen && t === chosen ? 'true' : 'false');
      });
    }

    function armAudio() {
      var a = global.LANTERN_RACE_AUDIO;
      if (a && typeof a.ensureFromGesture === 'function') a.ensureFromGesture();
    }

    function submitChoice(chosen) {
      if (!chosen || submitting) return;
      clearError();
      armAudio();
      setBusy(true, chosen);
      finalizeReaction(itemType, itemId, chosen).then(function (res) {
        if (res && res.ok && res.finalized) {
          if (typeof opts.onFinalized === 'function') opts.onFinalized(res);
          lockExistingDraft(container, res);
          return;
        }
        if (res && res.error === 'reaction_already_finalized') {
          getFinalizedStatus(itemType, itemId).then(function (st) {
            if (st && st.ok) renderLocked(container, st);
          });
          return;
        }
        setBusy(false, null);
        var errMsg = res && res.error ? String(res.error) : 'Could not save response.';
        showError(errMsg);
      });
    }

    choiceBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (submitting) return;
        submitChoice(btn.getAttribute('data-rx-type'));
      });
    });
  }

  global.LANTERN_FINAL_REACTIONS = {
    VOCAB: FINAL_VOCAB,
    getFinalizedStatus: getFinalizedStatus,
    finalizeReaction: finalizeReaction,
    mountFinalReactionPanel: mountFinalReactionPanel,
    emojiForType: emojiForType,
    isAuthenticatedViewer: isAuthenticatedViewer,
    renderResultsHtml: renderResultsHtml,
    showLockedChangeNotice: showLockedChangeNotice,
    revealReactionResults: revealReactionResults
  };
})(typeof window !== 'undefined' ? window : self);
