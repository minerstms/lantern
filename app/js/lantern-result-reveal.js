/**
 * Shared poll/reaction percentage race reveal.
 * Bars start at 0, grow together at the same percentage-point velocity,
 * and each label appears only when that bar finishes.
 * Prompt #228 — horizontal mine-cart polls + vertical spatial reaction races.
 */
(function (global) {
  'use strict';

  var MAX_MS = 3000;
  var MAX_BAR_PX = 168;
  var raceSeq = 0;

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function prefersReducedMotion() {
    try {
      return !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (e) {
      return false;
    }
  }

  function clampPct(n) {
    var v = Math.round(Number(n) || 0);
    if (v < 0) return 0;
    if (v > 100) return 100;
    return v;
  }

  function durationForPct(pct, maxPct) {
    var m = Math.max(1, maxPct);
    return Math.max(80, Math.round((pct / m) * MAX_MS));
  }

  function setFillProgress(fill, pct) {
    if (!fill) return;
    var p = clampPct(pct);
    fill.style.transform = 'scaleX(' + p / 100 + ')';
    fill.setAttribute('data-race-shown', String(p));
  }

  function mineCartSvg() {
    return (
      '<svg class="lanternMineCartSvg" viewBox="0 0 48 36" width="36" height="27" aria-hidden="true" focusable="false">' +
      '<rect x="6" y="10" width="30" height="14" rx="3" fill="#c47a22"/>' +
      '<path d="M8 12h26l-3 10H11z" fill="#f2c230"/>' +
      '<rect x="8" y="8" width="26" height="4" rx="1.5" fill="#8a4b12"/>' +
      '<circle cx="14" cy="27" r="5" fill="#2a3348"/>' +
      '<circle cx="14" cy="27" r="2.4" fill="#d8deee"/>' +
      '<circle cx="32" cy="27" r="5" fill="#2a3348"/>' +
      '<circle cx="32" cy="27" r="2.4" fill="#d8deee"/>' +
      '<path d="M36 12l8 4v6l-8 2z" fill="#7a4a16"/>' +
      '<circle cx="24" cy="16" r="3" fill="#ffe27a"/>' +
      '</svg>'
    );
  }

  function audioApi() {
    return global.LANTERN_RACE_AUDIO || null;
  }

  function beginAudio() {
    var a = audioApi();
    if (!a) return;
    if (typeof a.ensureFromGesture === 'function') a.ensureFromGesture();
    if (typeof a.startRace === 'function') a.startRace();
  }

  function progressAudio(grown, activeCount) {
    var a = audioApi();
    if (a && typeof a.setProgress === 'function') {
      a.setProgress(grown, { activeCount: activeCount });
    }
  }

  function endAudio() {
    var a = audioApi();
    if (a && typeof a.finishRace === 'function') a.finishRace();
  }

  function muteToolbarHtml() {
    var a = audioApi();
    if (a && typeof a.muteControlHtml === 'function') return a.muteControlHtml();
    return '';
  }

  function bindMute(container) {
    var a = audioApi();
    if (a && typeof a.bindMuteControl === 'function') a.bindMuteControl(container);
  }

  function isUsablyVisible(el) {
    if (!el || !el.getBoundingClientRect) return false;
    try {
      var r = el.getBoundingClientRect();
      return r.width >= 8 && r.height >= 4;
    } catch (e) {
      return false;
    }
  }

  function whenVisible(el, cb) {
    if (isUsablyVisible(el)) {
      cb();
      return;
    }
    var n = 0;
    function tick() {
      n += 1;
      if (isUsablyVisible(el) || n > 90) {
        cb();
        return;
      }
      global.requestAnimationFrame(tick);
    }
    global.requestAnimationFrame(tick);
  }

  function normalizeItems(items) {
    return (items || []).map(function (it) {
      return {
        label: String((it && it.label) || ''),
        emoji: String((it && it.emoji) || ''),
        type: String((it && (it.type || it.reaction_type)) || ''),
        percentage: clampPct(it && it.percentage),
        selected: !!(it && it.selected),
      };
    });
  }

  function maxOf(rows) {
    var maxPct = 0;
    rows.forEach(function (r) {
      if (r.percentage > maxPct) maxPct = r.percentage;
    });
    return maxPct;
  }

  /**
   * Shared race: same %-point velocity; each racer stops when its final % is reached.
   * speed = maxResultPercentage / targetRaceDuration
   * @param {{ percentage: number, setProgress?: Function, onFinish?: Function }[]} parts
   */
  function animateRace(parts, opts) {
    opts = opts || {};
    var list = (parts || []).map(function (p) {
      return {
        percentage: clampPct(p && p.percentage),
        setProgress: p && p.setProgress,
        onFinish: p && p.onFinish,
        finished: false,
      };
    });
    var maxPct = 0;
    list.forEach(function (p) {
      if (p.percentage > maxPct) maxPct = p.percentage;
    });

    function finishOne(p) {
      if (p.finished) return;
      p.finished = true;
      if (typeof p.setProgress === 'function') p.setProgress(p.percentage);
      if (typeof p.onFinish === 'function') p.onFinish();
    }

    if (prefersReducedMotion() || maxPct <= 0) {
      list.forEach(finishOne);
      if (typeof opts.onAllDone === 'function') opts.onAllDone();
      return;
    }

    list.forEach(function (p) {
      if (typeof p.setProgress === 'function') p.setProgress(0);
    });

    var t0 = 0;
    var velocity = maxPct / MAX_MS;
    function current() {
      return typeof opts.isCurrent === 'function' ? opts.isCurrent() : true;
    }
    function frame(now) {
      if (!current()) return;
      if (!t0) t0 = now;
      var elapsed = now - t0;
      var grown = elapsed * velocity;
      var allDone = true;
      var active = 0;
      list.forEach(function (p) {
        if (p.finished) return;
        if (grown >= p.percentage) {
          finishOne(p);
        } else {
          allDone = false;
          active += 1;
          if (typeof p.setProgress === 'function') p.setProgress(grown);
        }
      });
      progressAudio(grown, active);
      if (!allDone) {
        global.requestAnimationFrame(frame);
      } else {
        endAudio();
        if (typeof opts.onAllDone === 'function') opts.onAllDone();
      }
    }
    if (opts.playAudio !== false && !prefersReducedMotion()) {
      beginAudio();
    }
    global.requestAnimationFrame(function () {
      global.requestAnimationFrame(frame);
    });
  }

  /**
   * Legacy helper used by tests — scaleX fill animation with shared velocity.
   * @param {{ fill?: HTMLElement, pctEl?: HTMLElement, percentage: number, maxPct?: number, onFinish?: Function }[]} parts
   */
  function animateFills(parts, opts) {
    opts = opts || {};
    var list = (parts || []).map(function (p) {
      return {
        fill: p && p.fill,
        pctEl: p && p.pctEl,
        percentage: clampPct(p && p.percentage),
        onFinish: p && p.onFinish,
        finished: false,
      };
    });
    var maxPct = 0;
    list.forEach(function (p) {
      if (p.percentage > maxPct) maxPct = p.percentage;
      setFillProgress(p.fill, 0);
      if (p.pctEl) {
        p.pctEl.classList.add('is-pending');
        p.pctEl.setAttribute('aria-hidden', 'true');
        p.pctEl.textContent = '';
      }
    });

    function finishOne(p) {
      if (p.finished) return;
      p.finished = true;
      setFillProgress(p.fill, p.percentage);
      if (p.pctEl) {
        p.pctEl.classList.remove('is-pending');
        p.pctEl.removeAttribute('aria-hidden');
        p.pctEl.textContent = p.percentage + '%';
      }
      if (typeof p.onFinish === 'function') p.onFinish();
    }

    if (prefersReducedMotion() || maxPct <= 0) {
      list.forEach(finishOne);
      if (typeof opts.onAllDone === 'function') opts.onAllDone();
      return;
    }

    var t0 = 0;
    var velocity = maxPct / MAX_MS;
    function current() {
      return typeof opts.isCurrent === 'function' ? opts.isCurrent() : true;
    }
    function frame(now) {
      if (!current()) return;
      if (!t0) t0 = now;
      var elapsed = now - t0;
      var grown = elapsed * velocity;
      var allDone = true;
      list.forEach(function (p) {
        if (p.finished) return;
        if (grown >= p.percentage) {
          finishOne(p);
        } else {
          allDone = false;
          setFillProgress(p.fill, grown);
        }
      });
      if (!allDone) {
        global.requestAnimationFrame(frame);
      } else if (typeof opts.onAllDone === 'function') {
        opts.onAllDone();
      }
    }
    list.forEach(function (p) {
      if (p.fill) {
        try {
          void p.fill.offsetWidth;
        } catch (e) {}
      }
    });
    global.requestAnimationFrame(function () {
      global.requestAnimationFrame(frame);
    });
  }

  function attachLive(container, token) {
    var live = global.document.createElement('p');
    live.className = 'visuallyHidden';
    live.setAttribute('aria-live', 'polite');
    live.setAttribute('data-race-live', token);
    container.appendChild(live);
    return live;
  }

  function announce(live, rows) {
    if (!live) return;
    live.textContent =
      'Results: ' +
      rows
        .map(function (r) {
          return (r.emoji ? r.emoji + ' ' : '') + r.label + ' ' + r.percentage + '%';
        })
        .join(', ');
  }

  function revealPct(el, pct) {
    if (!el) return;
    el.classList.remove('is-pending');
    el.removeAttribute('aria-hidden');
    el.textContent = pct + '%';
  }

  function existingPollLanes(root) {
    if (!root || !root.querySelectorAll) return [];
    return Array.prototype.slice.call(root.querySelectorAll('.lanternPollRaceLane'));
  }

  function ensurePollTrack(lane) {
    if (!lane) return null;
    var track = lane.querySelector('.lanternPollRaceTrack');
    if (!track) {
      track = global.document.createElement('div');
      track.className = 'lanternPollRaceTrack';
      track.setAttribute('aria-hidden', 'true');
      lane.appendChild(track);
    }
    var fill = track.querySelector('[data-race-fill]');
    if (!fill) {
      fill = global.document.createElement('div');
      fill.className = 'lanternPollRaceFill';
      fill.setAttribute('data-race-fill', '');
      track.appendChild(fill);
    }
    var cart = track.querySelector('[data-race-cart]');
    if (!cart) {
      cart = global.document.createElement('div');
      cart.className = 'lanternMineCart';
      cart.setAttribute('data-race-cart', '');
      track.appendChild(cart);
    }
    if (!cart.querySelector('svg')) cart.innerHTML = mineCartSvg();
    return track;
  }

  /**
   * Paint the same option-row nodes used before tap and during the race.
   * Tracks/carts/percent slots are reserved up front so submit cannot add height.
   */
  function preparePollChoiceLanes(host, labels, opts) {
    if (!host) return null;
    opts = opts || {};
    var doc = host.ownerDocument || global.document;
    var group = host.classList && host.classList.contains('pollChoiceGroup') ? host : null;
    if (!group && host.children) {
      for (var gi = 0; gi < host.children.length; gi++) {
        if (host.children[gi].classList && host.children[gi].classList.contains('pollChoiceGroup')) {
          group = host.children[gi];
          break;
        }
      }
    }
    if (!group) {
      host.innerHTML = '';
      group = doc.createElement('div');
      host.appendChild(group);
    } else {
      group.innerHTML = '';
    }
    group.className = 'pollChoiceGroup lanternPollRace';
    group.setAttribute('role', opts.disabled ? 'list' : 'radiogroup');
    group.setAttribute('aria-label', opts.listLabel || (opts.disabled ? 'Poll results' : 'Poll choices'));
    (labels || []).forEach(function (choice, idx) {
      var lane = doc.createElement('div');
      lane.className = 'lanternPollRaceLane pollChoiceRow';
      lane.setAttribute('data-poll-choice-index', String(idx));
      lane.setAttribute('data-race-index', String(idx));
      if (opts.disabled) lane.setAttribute('role', 'listitem');
      var btn = doc.createElement('button');
      btn.type = 'button';
      btn.className = 'pollChoiceBtn';
      if (opts.disabled) {
        btn.disabled = true;
        btn.setAttribute('aria-disabled', 'true');
      } else {
        btn.setAttribute('role', 'radio');
        btn.setAttribute('aria-checked', 'false');
      }
      var text = doc.createElement('span');
      text.className = 'pollChoiceText';
      text.textContent = choice || 'Choice ' + (idx + 1);
      var meta = doc.createElement('span');
      meta.className = 'pollChoiceMeta';
      var mark = doc.createElement('em');
      mark.className = 'pollYourChoiceMark';
      mark.textContent = 'Your choice';
      var pct = doc.createElement('span');
      pct.className = 'lanternResultRacePct is-pending';
      pct.setAttribute('data-race-pct', '');
      pct.setAttribute('aria-hidden', 'true');
      meta.appendChild(mark);
      meta.appendChild(pct);
      btn.appendChild(text);
      btn.appendChild(meta);
      lane.appendChild(btn);
      ensurePollTrack(lane);
      if (typeof opts.onChoice === 'function') opts.onChoice(btn, lane, idx);
      group.appendChild(lane);
    });
    return group;
  }

  function attachPollFloatingSound(fromEl) {
    var pollAudio = audioApi();
    var modal = fromEl && fromEl.closest ? fromEl.closest('.lanternCardDetailModal') : null;
    var title = modal && modal.querySelector ? modal.querySelector('.lanternCardDetailTitle') : null;
    var pollHost = title || fromEl;
    if (pollAudio && typeof pollAudio.attachFloatingMuteToolbar === 'function') {
      pollAudio.attachFloatingMuteToolbar(pollHost, {
        extraClass: 'lanternRaceToolbar--poll',
        searchRoot: modal || fromEl,
      });
      return;
    }
    var pollTb = (modal || fromEl).querySelector && (modal || fromEl).querySelector('.lanternRaceToolbar');
    if (!pollTb) {
      pollTb = global.document.createElement('div');
      pollTb.className = 'lanternRaceToolbar lanternRaceToolbar--float lanternRaceToolbar--poll';
      pollTb.setAttribute('data-race-sound-float', '1');
      pollTb.style.position = 'absolute';
      pollTb.style.top = '0';
      pollTb.style.right = '0';
      pollTb.style.left = 'auto';
      pollTb.style.bottom = 'auto';
      pollTb.style.margin = '0';
      pollTb.innerHTML = muteToolbarHtml();
      pollHost.appendChild(pollTb);
      bindMute(pollHost);
    }
  }

  /**
   * Horizontal poll mine-cart race. Choice order is preserved.
   * Preferred path reuses the original option-row nodes in place.
   */
  function mountPollMineCartRace(container, items, opts) {
    if (!container) return;
    opts = opts || {};
    var token = 'race-' + String(++raceSeq);
    container.setAttribute('data-race-token', token);
    container.setAttribute('data-race-kind', 'poll-minecart');
    var rows = normalizeItems(items);
    var maxPct = maxOf(rows);
    var lanes = opts.reuseRows === false ? [] : existingPollLanes(container);
    if (!lanes.length) {
      preparePollChoiceLanes(container, rows.map(function (r) { return r.label; }), {
        disabled: true,
        listLabel: opts.listLabel || 'Poll results',
      });
      lanes = existingPollLanes(container);
    }
    var group = container.classList && container.classList.contains('pollChoiceGroup')
      ? container
      : container.querySelector && container.querySelector('.pollChoiceGroup');
    if (group) {
      group.classList.add('is-racing', 'lanternPollRace');
      group.setAttribute('role', 'list');
      group.setAttribute('aria-label', opts.listLabel || 'Poll results');
    }
    container.classList.add('lanternPollRaceHost');
    rows.forEach(function (r, i) {
      var lane = lanes[i];
      if (!lane) return;
      lane.classList.add('lanternPollRaceLane', 'lanternPollRaceLane--live');
      lane.setAttribute('data-race-index', String(i));
      lane.classList.toggle('lanternPollRaceLane--yours', !!r.selected);
      lane.classList.toggle('pollResultRow--yours', !!r.selected);
      var btn = lane.querySelector('.pollChoiceBtn');
      if (btn) {
        btn.disabled = true;
        btn.setAttribute('aria-disabled', 'true');
        btn.classList.toggle('is-selected', !!r.selected);
        btn.setAttribute('aria-checked', r.selected ? 'true' : 'false');
      }
      var mark = lane.querySelector('.pollYourChoiceMark');
      if (mark) mark.classList.toggle('is-on', !!r.selected);
      ensurePollTrack(lane);
    });
    if (opts.skipMuteToolbar !== true) attachPollFloatingSound(container);
    var live = attachLive(container, token);

    function stillCurrent() {
      return container.getAttribute('data-race-token') === token;
    }

    function applyHoriz(lane, pct) {
      var fill = lane && lane.querySelector('[data-race-fill]');
      var cart = lane && lane.querySelector('[data-race-cart]');
      var p = clampPct(pct);
      if (fill) {
        fill.style.width = p + '%';
        fill.setAttribute('data-race-shown', String(p));
      }
      if (cart) {
        cart.style.left = p + '%';
        cart.style.transform = 'translate(-50%, -50%)';
        cart.setAttribute('data-race-shown', String(p));
      }
    }

    function revealFinal() {
      if (!stillCurrent()) return;
      rows.forEach(function (r, i) {
        var lane = container.querySelector('[data-race-index="' + i + '"]');
        if (!lane) return;
        applyHoriz(lane, r.percentage);
        revealPct(lane.querySelector('[data-race-pct]'), r.percentage);
        lane.setAttribute(
          'aria-label',
          r.label + ' ' + r.percentage + ' percent' + (r.selected ? ', your choice' : '')
        );
      });
      announce(live, rows);
    }

    function finishRaceCallbacks() {
      announce(live, rows);
      if (typeof opts.onAllDone === 'function') opts.onAllDone();
    }

    if (prefersReducedMotion() || maxPct <= 0) {
      revealFinal();
      if (typeof opts.onAllDone === 'function') opts.onAllDone();
      return;
    }

    whenVisible(container, function () {
      if (!stillCurrent()) return;
      animateRace(
        rows.map(function (r, i) {
          var lane = container.querySelector('[data-race-index="' + i + '"]');
          return {
            percentage: r.percentage,
            setProgress: function (grown) {
              applyHoriz(lane, grown);
            },
            onFinish: function () {
              if (!lane || !stillCurrent()) return;
              revealPct(lane.querySelector('[data-race-pct]'), r.percentage);
              lane.setAttribute(
                'aria-label',
                r.label + ' ' + r.percentage + ' percent' + (r.selected ? ', your choice' : '')
              );
            },
          };
        }),
        {
          isCurrent: stillCurrent,
          playAudio: opts.playAudio !== false,
          onAllDone: function () {
            if (!stillCurrent()) return;
            finishRaceCallbacks();
          },
        }
      );
    });
  }

  /**
   * Vertical spatial race from the ACTUAL reaction icons.
   * Each icon is the horse; a bar grows up from beneath it and lifts it.
   */
  function mountReactionSpatialRace(root, items, opts) {
    if (!root) return;
    opts = opts || {};
    var token = 'race-' + String(++raceSeq);
    root.setAttribute('data-race-token', token);
    root.setAttribute('data-race-kind', 'reaction-spatial');
    var rows = normalizeItems(items);
    var maxPct = maxOf(rows);
    var choiceSelector = opts.choiceSelector || '.lanternFinalRxChoice, .lanternReactionBtn';
    var typeAttr = opts.typeAttr || 'data-rx-type';
    var buttons = root.querySelectorAll(choiceSelector);
    if (!buttons.length) return;

    var panel = root.closest('.lanternFinalRxPanel, .lanternReactionBar, .lanternCardDetailReactions') || root;
    panel.classList.add('lanternRxRaceLive');
    var modal = root.closest('.lanternCardDetailModal');
    if (modal) modal.classList.add('lanternCardDetailModal--rx-racing');

    if (opts.skipMuteToolbar !== true) {
      var aTb = audioApi();
      if (aTb && typeof aTb.attachFloatingMuteToolbar === 'function') {
        aTb.attachFloatingMuteToolbar(panel, {
          extraClass: 'lanternRaceToolbar--rx',
          mark: 'data-rx-sound-float',
        });
      } else {
        var existingTb = panel.querySelector('.lanternRaceToolbar');
        if (!existingTb) {
          existingTb = global.document.createElement('div');
          existingTb.innerHTML = muteToolbarHtml();
          panel.appendChild(existingTb);
          bindMute(panel);
        }
        existingTb.className = 'lanternRaceToolbar lanternRaceToolbar--rx';
        existingTb.setAttribute('data-rx-sound-float', '1');
        existingTb.style.position = 'absolute';
        existingTb.style.top = '0';
        existingTb.style.right = '0';
        existingTb.style.left = 'auto';
        existingTb.style.bottom = 'auto';
        existingTb.style.margin = '0';
      }
    }

    var startRects = [];
    for (var s = 0; s < buttons.length; s++) {
      var r0 = buttons[s].getBoundingClientRect();
      startRects.push({ top: r0.top, left: r0.left, width: r0.width, height: r0.height });
    }

    var byType = {};
    rows.forEach(function (r) {
      if (r.type) byType[r.type] = r;
    });

    var lanes = [];
    for (var i = 0; i < buttons.length; i++) {
      var btn = buttons[i];
      var typ = String(btn.getAttribute(typeAttr) || btn.getAttribute('data-reaction-type') || '').toLowerCase();
      var row = byType[typ] || rows[i] || { percentage: 0, selected: false, label: btn.getAttribute('aria-label') || '', emoji: '' };
      var lane = btn.closest('.lanternRxLane');
      if (!lane) {
        lane = global.document.createElement('div');
        lane.className = 'lanternRxLane';
        btn.parentNode.insertBefore(lane, btn);
        lane.appendChild(btn);
      }
      lane.classList.toggle('lanternRxLane--yours', !!row.selected);
      lane.setAttribute('data-race-index', String(i));
      lane.setAttribute('data-rx-type', typ);
      var bar = lane.querySelector('[data-race-fill]');
      if (!bar) {
        bar = global.document.createElement('div');
        bar.className = 'lanternRxRaceBar';
        bar.setAttribute('data-race-fill', '');
        bar.setAttribute('aria-hidden', 'true');
        lane.insertBefore(bar, lane.firstChild);
      }
      var pctEl = lane.querySelector('[data-race-pct]');
      if (!pctEl) {
        pctEl = global.document.createElement('span');
        pctEl.className = 'lanternRxRacePct lanternResultRacePct is-pending';
        pctEl.setAttribute('data-race-pct', '');
        pctEl.setAttribute('aria-hidden', 'true');
        lane.appendChild(pctEl);
      }
      pctEl.classList.add('is-pending');
      pctEl.textContent = '';
      bar.style.height = '0px';
      btn.style.transition = 'none';
      btn.disabled = true;
      btn.setAttribute('aria-disabled', 'true');
      lanes.push({
        btn: btn,
        bar: bar,
        pctEl: pctEl,
        lane: lane,
        row: row,
        barFromBottom: 8,
        startTop: startRects[i] ? startRects[i].top : 0,
        layoutHold: 0,
      });
    }

    var parentChoices = buttons[0] && buttons[0].closest('.lanternFinalRxChoices, .lanternReactionBar');
    if (parentChoices) {
      parentChoices.classList.add('lanternRxChoices--racing');
    }

    var overlay = root.closest('.lanternCardDetailOverlay, .lanternSurfaceShell');
    if (overlay) overlay.classList.add('lanternCardDetailOverlay--rx-racing');

    var raceStageHeight = 0;
    var scrollPad = 0;
    var stage = panel.querySelector('[data-rx-race-stage]');
    if (!stage) {
      stage = global.document.createElement('div');
      stage.className = 'lanternRxRaceStage';
      stage.setAttribute('data-rx-race-stage', '');
      stage.setAttribute('aria-hidden', 'true');
      var arena = panel.querySelector('.lanternFinalRxRaceArena');
      if (arena && parentChoices && parentChoices.parentNode === arena) {
        arena.insertBefore(stage, parentChoices);
      } else if (parentChoices && parentChoices.parentNode) {
        parentChoices.parentNode.insertBefore(stage, parentChoices);
      } else {
        var heading = panel.querySelector('.lanternFinalRxHeading');
        if (heading && heading.nextSibling) {
          panel.insertBefore(stage, heading.nextSibling);
        } else {
          panel.appendChild(stage);
        }
      }
    }
    stage.style.height = '0px';

    function findRaceScrollParent(el) {
      var n = el;
      while (n && n !== global.document.body && n !== global.document.documentElement) {
        if (
          n.id === 'lanternCardDetailOverlay' ||
          (n.classList &&
            (n.classList.contains('lanternCardDetailOverlay') || n.classList.contains('lanternSurfaceShell')))
        ) {
          return n;
        }
        n = n.parentElement;
      }
      n = el;
      while (n && n !== global.document.body && n !== global.document.documentElement) {
        try {
          var st = global.getComputedStyle ? global.getComputedStyle(n) : null;
          if (
            st &&
            (st.overflowY === 'auto' || st.overflowY === 'scroll') &&
            n.scrollHeight > n.clientHeight + 1
          ) {
            return n;
          }
        } catch (err) {}
        n = n.parentElement;
      }
      return global.document.scrollingElement || global.document.documentElement;
    }

    function ensureScrollRoom(scroller, extra) {
      if (!scroller || !(extra > 0)) return;
      var maxScroll = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
      var room = maxScroll - scroller.scrollTop;
      if (room >= extra - 1) return;
      var add = Math.ceil(extra - room);
      scrollPad += add;
      var padTarget =
        (modal && modal.querySelector('.lanternSurfaceContent')) ||
        (overlay && overlay.querySelector('.lanternSurfaceContent')) ||
        modal ||
        panel;
      if (padTarget && padTarget.style) {
        padTarget.style.paddingBottom = scrollPad + 'px';
      }
    }

    function applyStageHeight(targetH) {
      var next = Math.max(0, Math.min(MAX_BAR_PX, Math.round(targetH || 0)));
      if (next !== raceStageHeight) {
        var grew = next - raceStageHeight;
        raceStageHeight = next;
        if (stage) stage.style.height = next + 'px';
        if (grew > 0) {
          ensureScrollRoom(findRaceScrollParent(panel), grew);
        }
      }
    }

    function syncRaceStage() {
      var maxH = 0;
      for (var si = 0; si < lanes.length; si++) {
        var shownH = Number((lanes[si].bar && lanes[si].bar.getAttribute('data-race-shown')) || 0);
        var px = Math.round((clampPct(shownH) / 100) * MAX_BAR_PX);
        if (px > maxH) maxH = px;
      }
      applyStageHeight(maxH);
    }

    function captureLayoutHold(part) {
      if (!part || !part.btn) return;
      part.btn.style.transform = 'none';
      var nowTop = part.btn.getBoundingClientRect().top;
      var hold = Math.round((part.startTop || 0) - nowTop);
      part.layoutHold = isFinite(hold) ? hold : 0;
      part.btn.style.transition = 'none';
      part.btn.style.transform = 'translateY(' + part.layoutHold + 'px)';
    }
    lanes.forEach(captureLayoutHold);
    applyStageHeight(0);

    var live = root.querySelector('[data-race-live]') || attachLive(panel, token);

    function stillCurrent() {
      return root.getAttribute('data-race-token') === token;
    }

    function measureRide(part) {
      if (!part || !part.lane || !part.btn) return;
      part.btn.style.transform = 'translateY(' + (part.layoutHold || 0) + 'px)';
      var laneRect = part.lane.getBoundingClientRect();
      var btnRect = part.btn.getBoundingClientRect();
      var fromBottom = Math.round(laneRect.bottom - btnRect.bottom);
      if (!isFinite(fromBottom)) fromBottom = 0;
      part.barFromBottom = fromBottom;
      if (part.bar) part.bar.style.bottom = fromBottom + 'px';
    }

    function applyVert(part, grownPct) {
      var h = Math.round((clampPct(grownPct) / 100) * MAX_BAR_PX);
      var hold = part.layoutHold || 0;
      var y = hold - h;
      var fromBottom = part.barFromBottom != null ? part.barFromBottom : 8;
      if (part.bar) {
        part.bar.style.bottom = fromBottom + 'px';
        part.bar.style.height = h + 'px';
        part.bar.setAttribute('data-race-shown', String(clampPct(grownPct)));
      }
      if (part.btn) {
        part.btn.style.transition = 'none';
        part.btn.style.transform = 'translateY(' + y + 'px)';
      }
      syncRaceStage();
    }

    function finishVisual(part) {
      applyVert(part, part.row.percentage);
      revealPct(part.pctEl, part.row.percentage);
      part.lane.setAttribute(
        'aria-label',
        (part.row.label || part.row.emoji || 'Reaction') +
          ' ' +
          part.row.percentage +
          ' percent' +
          (part.row.selected ? ', your choice' : '')
      );
    }

    function finishRaceCallbacks() {
      announce(live, rows);
      if (typeof opts.onAllDone === 'function') opts.onAllDone();
    }

    if (prefersReducedMotion() || maxPct <= 0) {
      lanes.forEach(finishVisual);
      finishRaceCallbacks();
      return;
    }

    whenVisible(root, function () {
      if (!stillCurrent()) return;
      lanes.forEach(measureRide);
      animateRace(
        lanes.map(function (part) {
          return {
            percentage: part.row.percentage,
            setProgress: function (grown) {
              applyVert(part, grown);
            },
            onFinish: function () {
              if (!stillCurrent()) return;
              finishVisual(part);
            },
          };
        }),
        {
          isCurrent: stillCurrent,
          playAudio: opts.playAudio !== false,
          onAllDone: function () {
            if (!stillCurrent()) return;
            announce(live, rows);
          },
        }
      );
    });
  }

  /**
   * @param {HTMLElement} container
   * @param {{ label: string, percentage: number, selected?: boolean, emoji?: string }[]} items
   * @param {{ summaryHtml?: string, listLabel?: string, kind?: string }} [opts]
   */
  function mountResultRace(container, items, opts) {
    if (!container) return;
    opts = opts || {};
    if (opts.kind === 'reaction-spatial' && opts.anchorRoot) {
      mountReactionSpatialRace(opts.anchorRoot, items, opts);
      return;
    }
    if (opts.kind !== 'legacy-bars') {
      mountPollMineCartRace(container, items, opts);
      return;
    }
    var token = 'race-' + String(++raceSeq);
    container.setAttribute('data-race-token', token);
    var rows = normalizeItems(items);
    var maxPct = maxOf(rows);

    var html = '';
    if (opts.summaryHtml) html += opts.summaryHtml;
    html += '<div class="lanternResultRace" role="list" aria-label="' + esc(opts.listLabel || 'Results') + '">';
    rows.forEach(function (r, i) {
      var yours = r.selected;
      var display = (r.emoji ? r.emoji + ' ' : '') + r.label;
      html +=
        '<div class="lanternResultRaceRow' +
        (yours ? ' lanternResultRaceRow--yours pollResultRow--yours' : '') +
        '" role="listitem" data-race-index="' +
        i +
        '">' +
        '<div class="lanternResultRaceLabel pollResultLabel">' +
        '<span>' +
        esc(display) +
        (yours ? ' <em class="pollYourChoiceMark">Your choice</em>' : '') +
        '</span>' +
        '<span class="lanternResultRacePct is-pending" data-race-pct aria-hidden="true"></span>' +
        '</div>' +
        '<div class="lanternResultRaceTrack pollBarTrack" aria-hidden="true">' +
        '<div class="lanternResultRaceFill pollBarFill" data-race-fill></div>' +
        '</div>' +
        '</div>';
    });
    html += '</div>';
    container.innerHTML = html;

    var live = attachLive(container, token);

    function stillCurrent() {
      return container.getAttribute('data-race-token') === token;
    }

    function revealFinal() {
      if (!stillCurrent()) return;
      rows.forEach(function (r, i) {
        var row = container.querySelector('[data-race-index="' + i + '"]');
        if (!row) return;
        var fill = row.querySelector('[data-race-fill]');
        var pctEl = row.querySelector('[data-race-pct]');
        setFillProgress(fill, r.percentage);
        if (pctEl) {
          pctEl.classList.remove('is-pending');
          pctEl.removeAttribute('aria-hidden');
          pctEl.textContent = r.percentage + '%';
        }
        row.setAttribute(
          'aria-label',
          r.label + ' ' + r.percentage + ' percent' + (r.selected ? ', your choice' : '')
        );
      });
      announce(live, rows);
    }

    if (prefersReducedMotion() || maxPct <= 0) {
      revealFinal();
      return;
    }

    whenVisible(container, function () {
      if (!stillCurrent()) return;
      animateFills(
        rows.map(function (r, i) {
          var row = container.querySelector('[data-race-index="' + i + '"]');
          return {
            fill: row && row.querySelector('[data-race-fill]'),
            pctEl: row && row.querySelector('[data-race-pct]'),
            percentage: r.percentage,
            maxPct: maxPct,
            onFinish: function () {
              if (!row || !stillCurrent()) return;
              row.setAttribute(
                'aria-label',
                r.label + ' ' + r.percentage + ' percent' + (r.selected ? ', your choice' : '')
              );
            },
          };
        }),
        {
          token: token,
          isCurrent: stillCurrent,
          onAllDone: function () {
            if (!stillCurrent()) return;
            announce(live, rows);
          },
        }
      );
    });
  }

  global.LANTERN_RESULT_REVEAL = {
    MAX_MS: MAX_MS,
    MAX_BAR_PX: MAX_BAR_PX,
    prefersReducedMotion: prefersReducedMotion,
    durationForPct: durationForPct,
    clampPct: clampPct,
    animateFills: animateFills,
    animateRace: animateRace,
    mountResultRace: mountResultRace,
    mountPollMineCartRace: mountPollMineCartRace,
    mountReactionSpatialRace: mountReactionSpatialRace,
    preparePollChoiceLanes: preparePollChoiceLanes,
    mineCartSvg: mineCartSvg,
  };
})(typeof window !== 'undefined' ? window : self);
