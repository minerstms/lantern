/**
 * Shared poll/reaction percentage race reveal.
 * Bars start at 0, grow together at the same percentage-point velocity,
 * and each label appears only when that bar finishes.
 */
(function (global) {
  'use strict';

  var MAX_MS = 3000;
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

  /**
   * @param {HTMLElement} container
   * @param {{ label: string, percentage: number, selected?: boolean, emoji?: string }[]} items
   * @param {{ summaryHtml?: string, listLabel?: string }} [opts]
   */
  function mountResultRace(container, items, opts) {
    if (!container) return;
    opts = opts || {};
    var token = 'race-' + String(++raceSeq);
    container.setAttribute('data-race-token', token);
    var rows = (items || []).map(function (it) {
      return {
        label: String((it && it.label) || ''),
        emoji: String((it && it.emoji) || ''),
        percentage: clampPct(it && it.percentage),
        selected: !!(it && it.selected),
      };
    });
    var maxPct = 0;
    rows.forEach(function (r) {
      if (r.percentage > maxPct) maxPct = r.percentage;
    });

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

    var live = global.document.createElement('p');
    live.className = 'visuallyHidden';
    live.setAttribute('aria-live', 'polite');
    container.appendChild(live);

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
      live.textContent = 'Results: ' + rows.map(function (r) {
        return r.label + ' ' + r.percentage + '%';
      }).join(', ');
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
            live.textContent = 'Results: ' + rows.map(function (r) {
              return r.label + ' ' + r.percentage + '%';
            }).join(', ');
          },
        }
      );
    });
  }

  /**
   * Shared race: same %-point velocity; each fill stops and reveals its % when done.
   * @param {{ fill?: HTMLElement, pctEl?: HTMLElement, percentage: number, maxPct?: number, onFinish?: Function }[]} parts
   */
  function animateFills(parts, opts) {
    opts = opts || {};
    var list = (parts || []).map(function (p) {
      return {
        fill: p && p.fill,
        pctEl: p && p.pctEl,
        percentage: clampPct(p && p.percentage),
        maxPct: Math.max(1, Number(p && p.maxPct) || 0),
        onFinish: p && p.onFinish,
        finished: false,
      };
    });
    var maxPct = 0;
    list.forEach(function (p) {
      if (p.percentage > maxPct) maxPct = p.percentage;
      if (p.maxPct > maxPct) maxPct = p.maxPct;
    });
    list.forEach(function (p) {
      p.maxPct = Math.max(1, maxPct);
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

  global.LANTERN_RESULT_REVEAL = {
    MAX_MS: MAX_MS,
    prefersReducedMotion: prefersReducedMotion,
    durationForPct: durationForPct,
    clampPct: clampPct,
    animateFills: animateFills,
    mountResultRace: mountResultRace,
  };
})(typeof window !== 'undefined' ? window : self);
