/**
 * Prompt #174 — Fight Song Challenge client.
 * Candidate line IDs and UI only. Server owns correctness, completion, and reward.
 * Shuffle Again never completes or awards.
 * Prompt #224 — session audio for the existing rearrange-the-lines challenge.
 */
(function (global) {
  'use strict';

  var MISSION_ID = 'perm_fight_song';
  var TITLE = 'Fight Song Challenge';
  var INSTRUCTION = 'Put the lines of the school fight song in the correct order.';
  var WRONG_MESSAGE = 'Not quite — keep working.';
  var SUCCESS_MESSAGE = 'Nice work! You put the fight song in the correct order.';
  /** Temporary canonical recording. Replace this file later without rewriting the game. */
  var AUDIO_SRC = 'assets/stand-up-and-cheer.mp3';
  var DEFAULT_VOLUME = 0.4;

  var LINES = [
    { id: 'fight_line_1', text: 'Stand up and cheer,' },
    { id: 'fight_line_2', text: 'Stand up and cheer for dear old Trinidad.' },
    { id: 'fight_line_3', text: 'For today we raise' },
    { id: 'fight_line_4', text: 'the Blue and White above the rest.' },
    { id: 'fight_line_5', text: 'Our teams are fighting,' },
    { id: 'fight_line_6', text: 'and they are bound to win this game.' },
    { id: 'fight_line_7', text: 'We’ve got the team;' },
    { id: 'fight_line_8', text: 'we’ve got the steam,' },
    { id: 'fight_line_9', text: 'for this is Trinidad High School’s day!' },
  ];

  var CANONICAL_IDS = LINES.map(function (line) {
    return line.id;
  });

  var state = {
    order: [],
    selectedId: '',
    checking: false,
    completed: false,
    alreadyCompleted: false,
    onDone: null,
    returnFocus: null,
    phase: 'closed',
  };

  var audioState = {
    el: null,
    muted: true,
    volume: DEFAULT_VOLUME,
    started: false,
    unavailable: false,
    fadeTimer: null,
  };

  function lineById(id) {
    var key = String(id || '').trim();
    for (var i = 0; i < LINES.length; i++) {
      if (LINES[i].id === key) return LINES[i];
    }
    return null;
  }

  function isCanonicalOrder(ids) {
    if (!Array.isArray(ids) || ids.length !== CANONICAL_IDS.length) return false;
    for (var i = 0; i < CANONICAL_IDS.length; i++) {
      if (String(ids[i] || '').trim() !== CANONICAL_IDS[i]) return false;
    }
    return true;
  }

  function isValidPermutation(ids) {
    if (!Array.isArray(ids) || ids.length !== CANONICAL_IDS.length) return false;
    var seen = {};
    for (var i = 0; i < ids.length; i++) {
      var id = String(ids[i] || '').trim();
      if (!id || seen[id] || !lineById(id)) return false;
      seen[id] = true;
    }
    return Object.keys(seen).length === CANONICAL_IDS.length;
  }

  function fisherYates(ids, rand) {
    var out = ids.slice();
    var rnd = typeof rand === 'function' ? rand : Math.random;
    for (var i = out.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var tmp = out[i];
      out[i] = out[j];
      out[j] = tmp;
    }
    return out;
  }

  function shuffleOrder(source, rand) {
    var base = Array.isArray(source) && source.length ? source.slice() : CANONICAL_IDS.slice();
    var ids = fisherYates(base, rand);
    for (var attempt = 0; attempt < 24 && isCanonicalOrder(ids); attempt++) {
      ids = fisherYates(CANONICAL_IDS, rand);
    }
    if (isCanonicalOrder(ids) && ids.length >= 2) {
      var last = ids.length - 1;
      var tmp = ids[last];
      ids[last] = ids[last - 1];
      ids[last - 1] = tmp;
    }
    return ids;
  }

  function moveItem(ids, index, dir) {
    var out = Array.isArray(ids) ? ids.slice() : [];
    var from = parseInt(index, 10);
    var to = from + (dir < 0 ? -1 : 1);
    if (from !== from || from < 0 || from >= out.length) return out;
    if (to < 0 || to >= out.length) return out;
    var tmp = out[from];
    out[from] = out[to];
    out[to] = tmp;
    return out;
  }

  function applyDrag(ids, fromIndex, toIndex) {
    var out = Array.isArray(ids) ? ids.slice() : [];
    var from = parseInt(fromIndex, 10);
    var to = parseInt(toIndex, 10);
    if (from !== from || to !== to) return out;
    if (from < 0 || from >= out.length || to < 0 || to >= out.length || from === to) return out;
    var item = out.splice(from, 1)[0];
    out.splice(to, 0, item);
    return out;
  }

  function apiBase() {
    if (typeof window === 'undefined') return '';
    var raw =
      typeof window.LANTERN_ECONOMY_API !== 'undefined' &&
      window.LANTERN_ECONOMY_API !== null &&
      String(window.LANTERN_ECONOMY_API).trim() !== ''
        ? window.LANTERN_ECONOMY_API
        : window.LANTERN_AVATAR_API;
    if (raw == null) return '';
    return String(raw).replace(/\/$/, '');
  }

  function checkOrder(order) {
    var base = apiBase();
    return fetch(base + '/api/missions/fight-song/check', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mission_id: MISSION_ID,
        order: Array.isArray(order) ? order.slice() : [],
      }),
    }).then(function (r) {
      return r.json().catch(function () {
        return { ok: false, error: 'bad_json' };
      });
    });
  }

  function el(id) {
    return typeof document !== 'undefined' ? document.getElementById(id) : null;
  }

  function setFeedback(text, kind) {
    var node = el('fightSongFeedback');
    if (!node) return;
    node.textContent = text || '';
    node.classList.remove('is-wrong', 'is-ok');
    if (kind === 'wrong') node.classList.add('is-wrong');
    if (kind === 'ok') node.classList.add('is-ok');
  }

  function currentOrderFromDom() {
    var list = el('fightSongList');
    if (!list) return state.order.slice();
    var pills = list.querySelectorAll('[data-fight-line-id]');
    var ids = [];
    for (var i = 0; i < pills.length; i++) {
      ids.push(String(pills[i].getAttribute('data-fight-line-id') || '').trim());
    }
    return ids.length === CANONICAL_IDS.length ? ids : state.order.slice();
  }

  function renderList() {
    var list = el('fightSongList');
    if (!list) return;
    list.innerHTML = '';
    state.order.forEach(function (id, index) {
      var line = lineById(id);
      if (!line) return;
      var pill = document.createElement('li');
      pill.className = 'fightSongPill' + (state.selectedId === id ? ' is-selected' : '');
      pill.setAttribute('data-fight-line-id', id);
      pill.setAttribute('data-fight-index', String(index));
      pill.setAttribute('draggable', 'true');
      pill.setAttribute('role', 'option');
      pill.setAttribute('aria-selected', state.selectedId === id ? 'true' : 'false');
      pill.setAttribute('tabindex', '0');
      pill.textContent = line.text;
      list.appendChild(pill);
    });
  }

  function selectId(id) {
    state.selectedId = String(id || '');
    renderList();
  }

  function moveSelected(dir) {
    if (state.completed || state.phase !== 'play') return;
    var ids = currentOrderFromDom();
    var idx = ids.indexOf(state.selectedId);
    if (idx < 0) return;
    var next = moveItem(ids, idx, dir);
    if (next.join('\0') === ids.join('\0')) return;
    state.order = next;
    renderList();
  }

  function shuffleAgain() {
    if (state.checking || state.phase !== 'play') return;
    state.completed = false;
    state.order = shuffleOrder(CANONICAL_IDS);
    state.selectedId = '';
    setFeedback('', '');
    var checkBtn = el('fightSongCheckBtn');
    if (checkBtn) {
      checkBtn.disabled = false;
      checkBtn.textContent = 'Check Order';
    }
    renderList();
  }

  function clearFadeTimer() {
    if (audioState.fadeTimer) {
      clearTimeout(audioState.fadeTimer);
      audioState.fadeTimer = null;
    }
  }

  function makeAudioStub() {
    return {
      src: '',
      muted: true,
      volume: DEFAULT_VOLUME,
      currentTime: 0,
      loop: true,
      paused: true,
      preload: 'auto',
      play: function () {
        this.paused = false;
        return Promise.resolve();
      },
      pause: function () {
        this.paused = true;
      },
      load: function () {},
      addEventListener: function () {},
      removeEventListener: function () {},
    };
  }

  function ensureAudioEl() {
    if (audioState.el) return audioState.el;
    var node = null;
    if (typeof Audio === 'function') {
      try {
        node = new Audio();
      } catch (_) {
        node = null;
      }
    }
    if (!node) node = makeAudioStub();
    node.preload = 'auto';
    node.loop = true;
    node.muted = true;
    try {
      node.volume = DEFAULT_VOLUME;
    } catch (_) {}
    if (typeof node.addEventListener === 'function') {
      node.addEventListener('error', function () {
        audioState.unavailable = true;
        syncAudioControls();
      });
    }
    audioState.el = node;
    return node;
  }

  function applyAudioSettings() {
    var node = audioState.el;
    if (!node) return;
    node.muted = !!audioState.muted;
    try {
      node.volume = audioState.volume;
    } catch (_) {}
    node.loop = true;
  }

  function syncAudioControls() {
    var muteBtn = el('fightSongMuteBtn');
    var slider = el('fightSongVolume');
    var pct = el('fightSongVolumePct');
    var hint = el('fightSongAudioHint');
    var audible = !audioState.muted && audioState.volume > 0;
    if (muteBtn) {
      muteBtn.textContent = audible ? '🔊' : '🔇';
      muteBtn.setAttribute('aria-label', audible ? 'Mute fight song' : 'Unmute fight song');
      muteBtn.setAttribute('aria-pressed', audible ? 'false' : 'true');
    }
    if (slider) slider.value = String(Math.round(audioState.volume * 100));
    if (pct) pct.textContent = String(Math.round(audioState.volume * 100)) + '%';
    if (hint) {
      hint.textContent = audioState.unavailable
        ? 'Sound unavailable — the challenge still works.'
        : 'No sound? Check your device volume.';
    }
  }

  function prepareAudio() {
    var node = ensureAudioEl();
    audioState.unavailable = false;
    audioState.started = false;
    audioState.muted = true;
    audioState.volume = DEFAULT_VOLUME;
    clearFadeTimer();
    try {
      node.src = AUDIO_SRC;
      node.loop = true;
      node.preload = 'auto';
      node.muted = true;
      node.volume = DEFAULT_VOLUME;
      node.currentTime = 0;
      if (typeof node.load === 'function') node.load();
      if (typeof node.pause === 'function') node.pause();
      node.paused = true;
    } catch (_) {
      audioState.unavailable = true;
    }
    syncAudioControls();
    return node;
  }

  function playAudioSafe() {
    var node = audioState.el;
    if (!node || typeof node.play !== 'function') return;
    try {
      var p = node.play();
      if (p && typeof p.catch === 'function') {
        p.catch(function () {
          audioState.unavailable = true;
          syncAudioControls();
        });
      }
    } catch (_) {
      audioState.unavailable = true;
      syncAudioControls();
    }
  }

  function stopAudio() {
    clearFadeTimer();
    audioState.started = false;
    var node = audioState.el;
    if (!node) return;
    try {
      if (typeof node.pause === 'function') node.pause();
      node.paused = true;
      node.currentTime = 0;
    } catch (_) {}
  }

  function fadeOutThenStop() {
    var node = audioState.el;
    if (!node || node.paused) {
      stopAudio();
      return;
    }
    clearFadeTimer();
    var startVol = node.muted ? 0 : Number(node.volume);
    if (!(startVol > 0)) {
      stopAudio();
      return;
    }
    var t0 = Date.now();
    var dur = 280;
    function step() {
      if (!audioState.el || audioState.el !== node) return;
      var t = (Date.now() - t0) / dur;
      if (t >= 1) {
        stopAudio();
        return;
      }
      try {
        node.volume = Math.max(0, startVol * (1 - t));
      } catch (_) {}
      audioState.fadeTimer = setTimeout(step, 40);
    }
    step();
  }

  function setMuted(muted) {
    audioState.muted = !!muted;
    applyAudioSettings();
    syncAudioControls();
  }

  function setVolume(pct) {
    var n = Number(pct);
    if (n !== n) return;
    if (n < 0) n = 0;
    if (n > 100) n = 100;
    audioState.volume = n / 100;
    if (n > 0) audioState.muted = false;
    applyAudioSettings();
    syncAudioControls();
  }

  function toggleMute() {
    setMuted(!audioState.muted);
  }

  function getAudioState() {
    var node = audioState.el;
    return {
      src: AUDIO_SRC,
      muted: !!audioState.muted,
      volume: audioState.volume,
      started: !!audioState.started,
      unavailable: !!audioState.unavailable,
      loop: !!(node && node.loop),
      currentTime: node && node.currentTime != null ? Number(node.currentTime) : 0,
      paused: !node || node.paused !== false,
      phase: state.phase,
    };
  }

  function setPhase(phase) {
    state.phase = phase;
    var overlay = el('fightSongChallengeOverlay');
    var preview = el('fightSongPreview');
    var play = el('fightSongPlay');
    if (preview) preview.hidden = phase !== 'preview';
    if (play) play.hidden = phase !== 'play';
    if (overlay) {
      overlay.classList.toggle('is-preview', phase === 'preview');
      overlay.classList.toggle('is-playing', phase === 'play');
    }
  }

  function closeOverlay() {
    stopAudio();
    setPhase('closed');
    var overlay = el('fightSongChallengeOverlay');
    if (overlay) {
      overlay.classList.remove('is-open');
      overlay.hidden = true;
      overlay.setAttribute('aria-hidden', 'true');
    }
    var focusBack = state.returnFocus;
    state.returnFocus = null;
    if (focusBack && typeof focusBack.focus === 'function') {
      try {
        focusBack.focus();
      } catch (_) {}
    }
  }

  function finishSuccess(res) {
    state.completed = true;
    fadeOutThenStop();
    setFeedback((res && res.message) || SUCCESS_MESSAGE, 'ok');
    var checkBtn = el('fightSongCheckBtn');
    if (checkBtn) {
      checkBtn.disabled = true;
      checkBtn.textContent = 'Completed';
    }
    if (typeof state.onDone === 'function') state.onDone(res);
  }

  function submitCheck() {
    if (state.checking || state.completed || state.phase !== 'play') return;
    var order = currentOrderFromDom();
    state.order = order;
    setFeedback('', '');
    state.checking = true;
    var checkBtn = el('fightSongCheckBtn');
    if (checkBtn) {
      checkBtn.disabled = true;
      checkBtn.textContent = 'Checking…';
    }
    checkOrder(order)
      .then(function (res) {
        state.checking = false;
        if (!res || !res.ok) {
          if (checkBtn) {
            checkBtn.disabled = false;
            checkBtn.textContent = 'Check Order';
          }
          setFeedback((res && (res.message || res.error)) || 'Could not check order. Try again.', 'wrong');
          return;
        }
        if (!res.correct) {
          if (checkBtn) {
            checkBtn.disabled = false;
            checkBtn.textContent = 'Check Order';
          }
          setFeedback(res.message || WRONG_MESSAGE, 'wrong');
          renderList();
          return;
        }
        finishSuccess(res);
      })
      .catch(function () {
        state.checking = false;
        if (checkBtn) {
          checkBtn.disabled = false;
          checkBtn.textContent = 'Check Order';
        }
        setFeedback('Could not check order. Try again.', 'wrong');
      });
  }

  function bindListEvents() {
    var list = el('fightSongList');
    if (!list || list._fightSongBound) return;
    list._fightSongBound = true;
    var dragFrom = -1;

    list.addEventListener('click', function (e) {
      var pill = e.target && e.target.closest ? e.target.closest('[data-fight-line-id]') : null;
      if (!pill || state.completed || state.phase !== 'play') return;
      selectId(pill.getAttribute('data-fight-line-id'));
    });

    list.addEventListener('keydown', function (e) {
      var pill = e.target && e.target.closest ? e.target.closest('[data-fight-line-id]') : null;
      if (!pill || state.completed || state.phase !== 'play') return;
      var id = pill.getAttribute('data-fight-line-id');
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        selectId(id);
        return;
      }
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        state.selectedId = id;
        moveSelected(e.key === 'ArrowUp' ? -1 : 1);
        var next = list.querySelector('[data-fight-line-id="' + state.selectedId + '"]');
        if (next && next.focus) next.focus();
      }
    });

    list.addEventListener('dragstart', function (e) {
      if (state.completed || state.phase !== 'play') {
        e.preventDefault();
        return;
      }
      var pill = e.target && e.target.closest ? e.target.closest('[data-fight-line-id]') : null;
      if (!pill) return;
      dragFrom = Number(pill.getAttribute('data-fight-index'));
      pill.classList.add('is-dragging');
      state.selectedId = pill.getAttribute('data-fight-line-id');
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        try {
          e.dataTransfer.setData('text/plain', state.selectedId);
        } catch (_) {}
      }
    });

    list.addEventListener('dragover', function (e) {
      if (state.completed || state.phase !== 'play') return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    });

    list.addEventListener('drop', function (e) {
      e.preventDefault();
      if (state.completed || state.phase !== 'play') return;
      var pill = e.target && e.target.closest ? e.target.closest('[data-fight-line-id]') : null;
      if (!pill) return;
      var to = Number(pill.getAttribute('data-fight-index'));
      state.order = applyDrag(currentOrderFromDom(), dragFrom, to);
      dragFrom = -1;
      renderList();
    });

    list.addEventListener('dragend', function () {
      dragFrom = -1;
      var dragging = list.querySelector('.is-dragging');
      if (dragging) dragging.classList.remove('is-dragging');
    });
  }

  function overlayInnerHtml() {
    return (
      '<div class="missionDetailPanel fightSongPanel" role="dialog" aria-modal="true" aria-labelledby="fightSongTitle">' +
      '<div class="missionDetailTopbar">' +
      '<div>' +
      '<h2 id="fightSongTitle" class="missionDetailTitle"></h2>' +
      '<p id="fightSongMeta" class="missionDetailMeta"></p>' +
      '</div>' +
      '<button type="button" id="fightSongCloseBtn" class="missionDetailClose" aria-label="Close fight song challenge">× Close</button>' +
      '</div>' +
      '<div id="fightSongPreview" class="fightSongPreview">' +
      '<p id="fightSongPreviewInstruction" class="missionDetailDesc"></p>' +
      '<div class="fightSongStartChoices">' +
      '<button type="button" class="btn good" id="fightSongStartSoundBtn">🔊 Start with Sound</button>' +
      '<button type="button" class="btn" id="fightSongStartSilentBtn">🔇 Start Silently</button>' +
      '</div>' +
      '</div>' +
      '<div id="fightSongPlay" class="fightSongPlay" hidden>' +
      '<p id="fightSongInstruction" class="missionDetailDesc"></p>' +
      '<div id="fightSongAudioBar" class="fightSongAudioBar">' +
      '<button type="button" id="fightSongMuteBtn" class="fightSongMuteBtn" aria-label="Mute fight song">🔊</button>' +
      '<input type="range" id="fightSongVolume" class="fightSongVolume" min="0" max="100" value="40" step="1" aria-label="Fight song volume">' +
      '<span id="fightSongVolumePct" class="fightSongVolumePct">40%</span>' +
      '<p id="fightSongAudioHint" class="fightSongAudioHint">No sound? Check your device volume.</p>' +
      '</div>' +
      '<ol id="fightSongList" class="fightSongList" role="listbox" aria-label="Fight song lines"></ol>' +
      '<p id="fightSongFeedback" class="fightSongFeedback" role="status" aria-live="polite"></p>' +
      '<div class="fightSongActions">' +
      '<button type="button" class="btn good" id="fightSongCheckBtn">Check Order</button>' +
      '<div class="fightSongSecondary">' +
      '<button type="button" class="btn small" id="fightSongUpBtn">Move Up</button>' +
      '<button type="button" class="btn small" id="fightSongDownBtn">Move Down</button>' +
      '<button type="button" class="btn small" id="fightSongShuffleBtn">Shuffle Again</button>' +
      '</div>' +
      '</div>' +
      '</div>' +
      '</div>'
    );
  }

  function ensureOverlay() {
    if (typeof document === 'undefined') return null;
    var overlay = el('fightSongChallengeOverlay');
    if (overlay) {
      if (!el('fightSongStartSoundBtn') || !el('fightSongPlay')) {
        overlay.innerHTML = overlayInnerHtml();
        overlay._fightSongChrome = false;
        var list = el('fightSongList');
        if (list) list._fightSongBound = false;
      }
      return overlay;
    }
    overlay = document.createElement('div');
    overlay.id = 'fightSongChallengeOverlay';
    overlay.className = 'missionDetailOverlay';
    overlay.hidden = true;
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = overlayInnerHtml();
    document.body.appendChild(overlay);
    return overlay;
  }

  function startChallenge(mode) {
    var withSound = String(mode || '') === 'sound';
    state.checking = false;
    state.completed = false;
    state.selectedId = '';
    state.order = shuffleOrder(CANONICAL_IDS);
    var checkBtn = el('fightSongCheckBtn');
    if (checkBtn) {
      checkBtn.disabled = false;
      checkBtn.textContent = 'Check Order';
    }
    setFeedback('', '');
    renderList();
    setPhase('play');
    audioState.volume = DEFAULT_VOLUME;
    audioState.muted = !withSound;
    audioState.started = true;
    var node = ensureAudioEl();
    try {
      if (!node.src || String(node.src).indexOf('stand-up-and-cheer.mp3') === -1) node.src = AUDIO_SRC;
      node.loop = true;
      node.currentTime = 0;
    } catch (_) {}
    applyAudioSettings();
    syncAudioControls();
    playAudioSafe();
    if (checkBtn && checkBtn.focus) checkBtn.focus();
  }

  function bindChrome() {
    var overlay = ensureOverlay();
    if (!overlay || overlay._fightSongChrome) return overlay;
    overlay._fightSongChrome = true;
    var closeBtn = el('fightSongCloseBtn');
    if (closeBtn) closeBtn.addEventListener('click', closeOverlay);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeOverlay();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && overlay.classList.contains('is-open')) {
        e.preventDefault();
        closeOverlay();
      }
    });
    var soundBtn = el('fightSongStartSoundBtn');
    var silentBtn = el('fightSongStartSilentBtn');
    if (soundBtn) soundBtn.addEventListener('click', function () { startChallenge('sound'); });
    if (silentBtn) silentBtn.addEventListener('click', function () { startChallenge('silent'); });
    var muteBtn = el('fightSongMuteBtn');
    var slider = el('fightSongVolume');
    var audioBar = el('fightSongAudioBar');
    if (audioBar) {
      ['pointerdown', 'touchstart', 'mousedown', 'dragstart'].forEach(function (type) {
        audioBar.addEventListener(type, function (e) {
          e.stopPropagation();
        });
      });
    }
    if (muteBtn) muteBtn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      toggleMute();
    });
    if (slider) {
      slider.addEventListener('input', function (e) {
        e.stopPropagation();
        setVolume(slider.value);
      });
      slider.addEventListener('change', function (e) {
        e.stopPropagation();
        setVolume(slider.value);
      });
    }
    var upBtn = el('fightSongUpBtn');
    var downBtn = el('fightSongDownBtn');
    var shuffleBtn = el('fightSongShuffleBtn');
    var checkBtn = el('fightSongCheckBtn');
    if (upBtn) upBtn.addEventListener('click', function () { moveSelected(-1); });
    if (downBtn) downBtn.addEventListener('click', function () { moveSelected(1); });
    if (shuffleBtn) shuffleBtn.addEventListener('click', shuffleAgain);
    if (checkBtn) checkBtn.addEventListener('click', submitCheck);
    bindListEvents();
    return overlay;
  }

  function open(opts) {
    opts = opts || {};
    bindChrome();
    var overlay = el('fightSongChallengeOverlay');
    if (!overlay) return;
    state.returnFocus = typeof document !== 'undefined' ? document.activeElement : null;
    state.onDone = typeof opts.onDone === 'function' ? opts.onDone : null;
    state.alreadyCompleted = !!opts.alreadyCompleted;
    state.checking = false;
    state.completed = false;
    state.selectedId = '';
    state.order = [];
    var title = el('fightSongTitle');
    var meta = el('fightSongMeta');
    var instruction = el('fightSongInstruction');
    var previewInstruction = el('fightSongPreviewInstruction');
    var checkBtn = el('fightSongCheckBtn');
    if (title) title.textContent = TITLE;
    if (instruction) instruction.textContent = INSTRUCTION;
    if (previewInstruction) previewInstruction.textContent = INSTRUCTION;
    if (meta) {
      var rewardN = Number(opts.rewardAmount);
      if (!Number.isFinite(rewardN) || rewardN < 0) rewardN = 1;
      var rewardCopy = rewardN > 0
        ? ('🟡 +' + rewardN + ' Nugget' + (rewardN === 1 ? '' : 's'))
        : 'No Nugget reward';
      meta.textContent = state.alreadyCompleted
        ? (rewardCopy + ' · Reward already earned (redo allowed)')
        : rewardCopy;
    }
    if (checkBtn) {
      checkBtn.disabled = false;
      checkBtn.textContent = 'Check Order';
    }
    setFeedback('', '');
    prepareAudio();
    setPhase('preview');
    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');
    overlay.classList.add('is-open');
    var soundBtn = el('fightSongStartSoundBtn');
    if (soundBtn && soundBtn.focus) soundBtn.focus();
  }

  global.LANTERN_FIGHT_SONG = {
    MISSION_ID: MISSION_ID,
    TITLE: TITLE,
    INSTRUCTION: INSTRUCTION,
    WRONG_MESSAGE: WRONG_MESSAGE,
    SUCCESS_MESSAGE: SUCCESS_MESSAGE,
    AUDIO_SRC: AUDIO_SRC,
    DEFAULT_VOLUME: DEFAULT_VOLUME,
    LINES: LINES,
    CANONICAL_IDS: CANONICAL_IDS,
    isCanonicalOrder: isCanonicalOrder,
    isValidPermutation: isValidPermutation,
    shuffleOrder: shuffleOrder,
    moveItem: moveItem,
    applyDrag: applyDrag,
    checkOrder: checkOrder,
    prepareAudio: prepareAudio,
    startChallenge: startChallenge,
    startWithSound: function () { startChallenge('sound'); },
    startSilently: function () { startChallenge('silent'); },
    setMuted: setMuted,
    setVolume: setVolume,
    stopAudio: stopAudio,
    getAudioState: getAudioState,
    open: open,
    close: closeOverlay,
  };
})(typeof window !== 'undefined' ? window : this);
