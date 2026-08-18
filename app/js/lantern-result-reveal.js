/**
 * Shared poll/reaction percentage race reveal.
 * Bars start at 0, grow together at the same percentage-point velocity,
 * and each label appears only when that bar finishes.
 */
(function (global) {
  'use strict';

  var MAX_MS = 3000;

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

  /**
   * @param {HTMLElement} container
   * @param {{ label: string, percentage: number, selected?: boolean, emoji?: string }[]} items
   * @param {{ summaryHtml?: string, listLabel?: string }} [opts]
   */
  function mountResultRace(container, items, opts) {
    if (!container) return;
    opts = opts || {};
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
        '<span class="lanternResultRacePct" data-race-pct hidden aria-hidden="true">0%</span>' +
        '</div>' +
        '<div class="lanternResultRaceTrack pollBarTrack" aria-hidden="true">' +
        '<div class="lanternResultRaceFill pollBarFill" data-race-fill style="width:0%"></div>' +
        '</div>' +
        '</div>';
    });
    html += '</div>';
    container.innerHTML = html;

    var live = global.document.createElement('p');
    live.className = 'visuallyHidden';
    live.setAttribute('aria-live', 'polite');
    container.appendChild(live);

    function revealFinal() {
      rows.forEach(function (r, i) {
        var row = container.querySelector('[data-race-index="' + i + '"]');
        if (!row) return;
        var fill = row.querySelector('[data-race-fill]');
        var pctEl = row.querySelector('[data-race-pct]');
        if (fill) fill.style.width = r.percentage + '%';
        if (pctEl) {
          pctEl.hidden = false;
          pctEl.removeAttribute('aria-hidden');
          pctEl.textContent = r.percentage + '%';
        }
        row.setAttribute(
          'aria-label',
          r.label +
            ' ' +
            r.percentage +
            ' percent' +
            (r.selected ? ', your choice' : '')
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

    animateFills(
      rows.map(function (r, i) {
        var row = container.querySelector('[data-race-index="' + i + '"]');
        return {
          fill: row && row.querySelector('[data-race-fill]'),
          pctEl: row && row.querySelector('[data-race-pct]'),
          percentage: r.percentage,
          maxPct: maxPct,
          onFinish: function () {
            if (!row) return;
            row.setAttribute(
              'aria-label',
              r.label + ' ' + r.percentage + ' percent' + (r.selected ? ', your choice' : '')
            );
          },
        };
      }),
      {
        onAllDone: function () {
          live.textContent = 'Results: ' + rows.map(function (r) {
            return r.label + ' ' + r.percentage + '%';
          }).join(', ');
        },
      }
    );
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
      };
    });
    var maxPct = 0;
    list.forEach(function (p) {
      if (p.percentage > maxPct) maxPct = p.percentage;
      if (p.maxPct > maxPct) maxPct = p.maxPct;
    });
    list.forEach(function (p) {
      p.maxPct = Math.max(1, maxPct);
    });

    function finishOne(p) {
      if (p.fill) p.fill.style.width = p.percentage + '%';
      if (p.pctEl) {
        p.pctEl.hidden = false;
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
    function frame(now) {
      if (!t0) t0 = now;
      var elapsed = now - t0;
      var allDone = true;
      list.forEach(function (p) {
        var dur = durationForPct(p.percentage, p.maxPct);
        var done = elapsed >= dur;
        var shown = done ? p.percentage : Math.min(p.percentage, Math.round((elapsed / dur) * p.percentage));
        if (p.fill) p.fill.style.width = shown + '%';
        if (done) {
          if (p.pctEl && p.pctEl.hidden) finishOne(p);
        } else {
          allDone = false;
        }
      });
      if (!allDone) {
        global.requestAnimationFrame(frame);
      } else if (typeof opts.onAllDone === 'function') {
        opts.onAllDone();
      }
    }
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
