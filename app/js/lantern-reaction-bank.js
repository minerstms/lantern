/**
 * Reaction picker architecture + canonical order.
 * Prompt #228 — does NOT invent a reconciled 20-option bank.
 *
 * PRODUCT DECISION BLOCKER: the planning 20-list omits ❤️ ⭐ 🔥, which are
 * part of the live default five. This module preserves DEFAULT_FIVE and
 * implements picker layout/canonical sort only.
 */
(function (global) {
  'use strict';

  var MAX_SELECTED = 5;
  var GRID_ROWS = 4;
  var GRID_COLS = 5;

  /** Live canonical default five — do not replace silently. */
  var DEFAULT_FIVE = [
    { type: 'heart', emoji: '❤️', label: 'Love' },
    { type: 'star', emoji: '⭐', label: 'Star' },
    { type: 'lightbulb', emoji: '💡', label: 'Idea' },
    { type: 'teamwork', emoji: '🤝', label: 'Handshake' },
    { type: 'fire', emoji: '🔥', label: 'Fire' },
  ];

  /**
   * Planning-only 20-option list. NOT live. NOT a reconciled bank.
   * Documented so Create can show architecture without guessing membership.
   */
  var PLANNING_TWENTY_UNRESOLVED = [
    { type: 'feel_good', emoji: '😊', label: 'Feel-good' },
    { type: 'wow', emoji: '🤩', label: 'Wow' },
    { type: 'cool', emoji: '😎', label: 'Cool' },
    { type: 'mind_blown', emoji: '🤯', label: 'Mind blown' },
    { type: 'mic_drop', emoji: '🎤', label: 'Mic drop' },
    { type: 'makes_me_think', emoji: '🤔', label: 'Makes me think' },
    { type: 'thought_provoking', emoji: '💭', label: 'Thought-provoking' },
    { type: 'great_idea', emoji: '💡', label: 'Great idea' },
    { type: 'smart', emoji: '🧠', label: 'Smart / clever' },
    { type: 'artistic', emoji: '🎨', label: 'Artistic' },
    { type: 'great_image', emoji: '📸', label: 'Great image' },
    { type: 'musical', emoji: '🎶', label: 'Musical vibe' },
    { type: 'polished', emoji: '💎', label: 'Polished' },
    { type: 'strong_work', emoji: '💪', label: 'Strong work' },
    { type: 'respect', emoji: '🤝', label: 'Respect' },
    { type: 'well_done', emoji: '👏', label: 'Well done' },
    { type: 'support', emoji: '🫶', label: 'Support' },
    { type: 'inspiring', emoji: '🦋', label: 'Inspiring' },
    { type: 'celebrate', emoji: '🙌', label: 'Celebrate' },
    { type: 'nailed_it', emoji: '✅', label: 'Nailed it' },
  ];

  var BANK_STATUS = 'unresolved_membership';
  var BANK_BLOCKER =
    'PRODUCT DECISION BLOCKER: planning 20-list does not include ❤️ ⭐ 🔥 from the live default five. Do not expand past 20 or replace defaults until product reconciles membership.';

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function typeIndex(type) {
    var t = String(type || '').toLowerCase();
    for (var i = 0; i < DEFAULT_FIVE.length; i++) {
      if (DEFAULT_FIVE[i].type === t) return i;
    }
    return 1000 + t.charCodeAt(0);
  }

  function entryForType(type) {
    var t = String(type || '').toLowerCase();
    for (var i = 0; i < DEFAULT_FIVE.length; i++) {
      if (DEFAULT_FIVE[i].type === t) return DEFAULT_FIVE[i];
    }
    return null;
  }

  /**
   * Published / displayed reaction order is ALWAYS system canonical order.
   * Click-selection sequence is discarded.
   */
  function canonicalSort(types) {
    var seen = {};
    var list = [];
    (types || []).forEach(function (t) {
      var key = String(t || '').toLowerCase();
      if (!key || seen[key]) return;
      if (!entryForType(key)) return;
      seen[key] = true;
      list.push(key);
    });
    list.sort(function (a, b) {
      return typeIndex(a) - typeIndex(b);
    });
    return list;
  }

  function clampSelection(types) {
    return canonicalSort(types).slice(0, MAX_SELECTED);
  }

  function mountPicker(container, opts) {
    if (!container) return null;
    opts = opts || {};
    var selected = clampSelection(opts.selectedTypes && opts.selectedTypes.length ? opts.selectedTypes : DEFAULT_FIVE.map(function (v) { return v.type; }));
    var collapsed = opts.collapsed !== false;
    var html = '<div class="lanternRxPicker" data-rx-picker="1">';
    html += '<button type="button" class="lanternRxPickerToggle" data-rx-picker-toggle="1" aria-expanded="' + (collapsed ? 'false' : 'true') + '">';
    html += 'Reactions students can use';
    html += '</button>';
    html += '<div class="lanternRxPickerBody"' + (collapsed ? ' hidden' : '') + '>';
    html += '<p class="lanternRxPickerCount" data-rx-picker-count="1"></p>';
    html += '<p class="lanternRxPickerNote">Up to 5. Order is set by Lantern, not by tap sequence. Custom emoji and custom labels are not allowed.</p>';
    html += '<p class="lanternRxPickerBlocker" role="note">' + esc(BANK_BLOCKER) + '</p>';
    html += '<div class="lanternRxPickerGrid" role="group" aria-label="Reaction bank" style="grid-template-rows: repeat(' + GRID_ROWS + ', minmax(52px, auto)); grid-template-columns: repeat(' + GRID_COLS + ', minmax(0, 1fr));">';
    var cells = GRID_ROWS * GRID_COLS;
    for (var i = 0; i < cells; i++) {
      var known = DEFAULT_FIVE[i];
      if (known) {
        html +=
          '<button type="button" class="lanternRxPickerCell" data-rx-type="' +
          esc(known.type) +
          '" aria-pressed="false" aria-label="' +
          esc(known.label) +
          '"><span aria-hidden="true">' +
          known.emoji +
          '</span></button>';
      } else {
        html +=
          '<button type="button" class="lanternRxPickerCell lanternRxPickerCell--pending" disabled aria-disabled="true" aria-label="Reaction option reserved until bank membership is decided">';
        html += '<span aria-hidden="true">·</span></button>';
      }
    }
    html += '</div></div></div>';
    container.innerHTML = html;

    var root = container.querySelector('[data-rx-picker]');
    var toggle = container.querySelector('[data-rx-picker-toggle]');
    var body = container.querySelector('.lanternRxPickerBody');
    var countEl = container.querySelector('[data-rx-picker-count]');
    var cellsEls = container.querySelectorAll('.lanternRxPickerCell[data-rx-type]');

    function sync() {
      selected = clampSelection(selected);
      cellsEls.forEach(function (btn) {
        var on = selected.indexOf(btn.getAttribute('data-rx-type')) !== -1;
        btn.classList.toggle('is-selected', on);
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      if (countEl) countEl.textContent = selected.length + ' of ' + MAX_SELECTED + ' selected';
      if (typeof opts.onChange === 'function') opts.onChange(selected.slice());
    }

    if (toggle && body) {
      toggle.addEventListener('click', function () {
        var open = body.hasAttribute('hidden');
        if (open) body.removeAttribute('hidden');
        else body.setAttribute('hidden', '');
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
    }

    cellsEls.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var t = btn.getAttribute('data-rx-type');
        var idx = selected.indexOf(t);
        if (idx !== -1) {
          selected.splice(idx, 1);
        } else if (selected.length < MAX_SELECTED) {
          selected.push(t);
        }
        sync();
      });
    });

    sync();
    return {
      getSelected: function () {
        return clampSelection(selected);
      },
      setSelected: function (types) {
        selected = clampSelection(types);
        sync();
      },
      root: root,
    };
  }

  global.LANTERN_REACTION_BANK = {
    MAX_SELECTED: MAX_SELECTED,
    GRID_ROWS: GRID_ROWS,
    GRID_COLS: GRID_COLS,
    DEFAULT_FIVE: DEFAULT_FIVE,
    PLANNING_TWENTY_UNRESOLVED: PLANNING_TWENTY_UNRESOLVED,
    BANK_STATUS: BANK_STATUS,
    BANK_BLOCKER: BANK_BLOCKER,
    canonicalSort: canonicalSort,
    clampSelection: clampSelection,
    entryForType: entryForType,
    mountPicker: mountPicker,
  };
})(typeof window !== 'undefined' ? window : self);
