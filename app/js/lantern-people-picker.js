/**
 * Prompt #190 — Shared searchable People picker (students + staff).
 * Selection tokens only; never display IDs/emails in the UI.
 */
(function (global) {
  var STYLE_ID = 'lantern-people-picker-styles';
  var MAX_TAGS = 40;
  var DEBOUNCE_MS = 220;

  function injectStyles() {
    if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      '.lanternPeoplePicker{position:relative;width:100%;max-width:100%;}',
      '.lanternPeoplePickerLabel{display:block;font-weight:800;font-size:22px;margin:0 0 8px;}',
      '.lanternPeopleChips{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 10px;min-height:0;}',
      '.lanternPeopleChip{display:inline-flex;align-items:center;gap:8px;max-width:100%;',
      'padding:8px 12px;border-radius:999px;border:1px solid rgba(255,255,255,.18);',
      'background:rgba(90,167,255,.16);color:var(--ink,#eaf0ff);font-size:22px;font-weight:800;line-height:1.2;}',
      '.lanternPeopleChipLabel{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:14em;}',
      '.lanternPeopleChipRemove{appearance:none;border:0;background:transparent;color:inherit;cursor:pointer;',
      'font-size:22px;font-weight:900;line-height:1;padding:0 2px;min-width:28px;min-height:28px;}',
      '.lanternPeopleSearch{width:100%;box-sizing:border-box;font-size:22px;font-weight:700;',
      'padding:12px 14px;border-radius:12px;border:1px solid rgba(255,255,255,.18);',
      'background:rgba(0,0,0,.22);color:var(--ink,#eaf0ff);font-family:inherit;}',
      '.lanternPeopleSearch:focus{outline:none;border-color:rgba(90,167,255,.65);',
      'box-shadow:0 0 0 3px rgba(90,167,255,.28);}',
      '.lanternPeopleResults{position:absolute;left:0;right:0;z-index:40;margin-top:6px;',
      'max-height:min(48vh,320px);overflow:auto;-webkit-overflow-scrolling:touch;',
      'border:1px solid rgba(255,255,255,.16);border-radius:14px;background:#0f1b33;',
      'box-shadow:0 16px 40px rgba(0,0,0,.45);}',
      '.lanternPeopleResults[hidden]{display:none !important;}',
      '.lanternPeopleGroup{padding:10px 12px 4px;font-size:18px;font-weight:900;letter-spacing:.04em;',
      'text-transform:uppercase;color:var(--muted,#b9c6ea);}',
      '.lanternPeopleRow{display:block;width:100%;text-align:left;appearance:none;border:0;',
      'background:transparent;color:var(--ink,#eaf0ff);font:inherit;font-size:22px;font-weight:800;',
      'padding:14px 14px;cursor:pointer;min-height:48px;}',
      '.lanternPeopleRow:hover,.lanternPeopleRow:focus{background:rgba(90,167,255,.18);outline:none;}',
      '.lanternPeopleEmpty{padding:14px;font-size:20px;font-weight:700;color:var(--muted,#b9c6ea);}',
      '.lanternPeopleStatus{margin-top:8px;font-size:18px;font-weight:700;color:var(--muted,#b9c6ea);min-height:1.2em;}'
    ].join('');
    (document.head || document.documentElement).appendChild(s);
  }

  function esc(s) {
    return String(s || '').replace(/[&<>"']/g, function (c) {
      return c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;';
    });
  }

  function apiBase() {
    if (typeof global.LANTERN_AVATAR_API === 'string') return global.LANTERN_AVATAR_API;
    return '';
  }

  /**
   * @param {HTMLElement} container
   * @param {Object} opt
   * @param {string} [opt.label]
   * @param {string} [opt.placeholder]
   * @param {number} [opt.max]
   * @param {'recognized'|'tagged'} [opt.relationship]
   * @param {boolean} [opt.required]
   * @param {boolean} [opt.allowFreeText] — Prompt #213: typed label OK without selecting a person
   * @param {number} [opt.freeTextMax] — max length for free-text recognition (default 100)
   * @param {function} [opt.onChange]
   */
  function mount(container, opt) {
    if (!container) return null;
    injectStyles();
    opt = opt || {};
    var max = opt.max != null ? Math.max(1, Number(opt.max) || 1) : MAX_TAGS;
    var relationship = opt.relationship === 'recognized' ? 'recognized' : 'tagged';
    var allowFreeText = !!opt.allowFreeText;
    var freeTextMax = opt.freeTextMax != null ? Math.max(1, Number(opt.freeTextMax) || 100) : 100;
    var selected = [];
    var debounceTimer = null;
    var reqSeq = 0;
    var open = false;

    container.innerHTML = '';
    var root = document.createElement('div');
    root.className = 'lanternPeoplePicker';
    var defaultPh = allowFreeText
      ? 'Search a person or type a group name…'
      : 'Search students or staff...';
    root.innerHTML =
      '<label class="lanternPeoplePickerLabel" for="' + esc((opt.inputId || 'lanternPeopleSearch') ) + '">' +
      esc(opt.label || (relationship === 'recognized' ? 'Recognizing' : 'People')) +
      '</label>' +
      '<div class="lanternPeopleChips" hidden></div>' +
      '<input type="search" class="lanternPeopleSearch" id="' + esc(opt.inputId || 'lanternPeopleSearch') +
      '" placeholder="' + esc(opt.placeholder || defaultPh) +
      '" autocomplete="off" enterkeyhint="search" maxlength="' + (allowFreeText ? freeTextMax : 200) + '" />' +
      '<div class="lanternPeopleResults" hidden role="listbox" aria-label="People search results"></div>' +
      '<div class="lanternPeopleStatus" aria-live="polite"></div>';
    container.appendChild(root);

    var chipsEl = root.querySelector('.lanternPeopleChips');
    var input = root.querySelector('.lanternPeopleSearch');
    var resultsEl = root.querySelector('.lanternPeopleResults');
    var statusEl = root.querySelector('.lanternPeopleStatus');

    function notify() {
      if (typeof opt.onChange === 'function') opt.onChange(getPeoplePayload(), getRecognitionState());
    }

    function getPeoplePayload() {
      return selected.map(function (p) {
        return { token: p.token, relationship: relationship };
      });
    }

    function getSelected() {
      return selected.slice();
    }

    function typedLabel() {
      return String(input && input.value || '').trim().slice(0, freeTextMax);
    }

    /** Prompt #213 — person selection OR free-text recognition label. */
    function getRecognitionState() {
      if (selected.length && selected[0] && selected[0].token) {
        return {
          mode: 'person',
          label: String(selected[0].label || '').trim().slice(0, freeTextMax),
          people: getPeoplePayload(),
        };
      }
      var label = typedLabel();
      if (allowFreeText && label) {
        return { mode: 'custom', label: label, people: [] };
      }
      return { mode: 'empty', label: '', people: [] };
    }

    function getRecognitionLabel() {
      return getRecognitionState().label;
    }

    function clear() {
      selected = [];
      renderChips();
      input.value = '';
      hideResults();
      if (statusEl) statusEl.textContent = '';
      notify();
    }

    function renderChips() {
      if (!selected.length) {
        chipsEl.hidden = true;
        chipsEl.innerHTML = '';
        return;
      }
      chipsEl.hidden = false;
      chipsEl.innerHTML = selected
        .map(function (p, i) {
          return (
            '<span class="lanternPeopleChip" data-i="' +
            i +
            '"><span class="lanternPeopleChipLabel">' +
            esc(p.label) +
            '</span><button type="button" class="lanternPeopleChipRemove" data-remove="' +
            i +
            '" aria-label="Remove ' +
            esc(p.label) +
            '">×</button></span>'
          );
        })
        .join('');
    }

    function hideResults() {
      open = false;
      resultsEl.hidden = true;
      resultsEl.innerHTML = '';
    }

    function updateFreeTextStatus() {
      if (!allowFreeText || !statusEl) return;
      if (selected.length) {
        statusEl.textContent = '';
        return;
      }
      var label = typedLabel();
      if (label) {
        statusEl.textContent = 'Will recognize “' + label + '” as typed text (not linked to a People profile).';
      } else {
        statusEl.textContent = '';
      }
    }

    function addPerson(person) {
      if (!person || !person.token) return;
      if (selected.some(function (s) { return s.token === person.token; })) return;
      if (max === 1) selected = [person];
      else if (selected.length >= max) {
        if (statusEl) statusEl.textContent = 'Maximum ' + max + ' people.';
        return;
      } else selected.push(person);
      renderChips();
      input.value = '';
      hideResults();
      if (statusEl) statusEl.textContent = '';
      notify();
    }

    function removeAt(i) {
      selected.splice(i, 1);
      renderChips();
      notify();
    }

    chipsEl.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest ? e.target.closest('[data-remove]') : null;
      if (!btn) return;
      removeAt(Number(btn.getAttribute('data-remove')));
    });

    function renderResults(students, staff) {
      var html = '';
      if (students && students.length) {
        html += '<div class="lanternPeopleGroup">Students</div>';
        students.forEach(function (p) {
          html +=
            '<button type="button" class="lanternPeopleRow" data-token="' +
            esc(p.token) +
            '" data-label="' +
            esc(p.label) +
            '" data-kind="student">' +
            esc(p.label) +
            '</button>';
        });
      }
      if (staff && staff.length) {
        html += '<div class="lanternPeopleGroup">Staff</div>';
        staff.forEach(function (p) {
          html +=
            '<button type="button" class="lanternPeopleRow" data-token="' +
            esc(p.token) +
            '" data-label="' +
            esc(p.label) +
            '" data-kind="staff">' +
            esc(p.label) +
            '</button>';
        });
      }
      if (!html) {
        html = allowFreeText
          ? '<div class="lanternPeopleEmpty">No person matches — you can still submit the typed name/group.</div>'
          : '<div class="lanternPeopleEmpty">No matches</div>';
      }
      resultsEl.innerHTML = html;
      resultsEl.hidden = false;
      open = true;
    }

    resultsEl.addEventListener('click', function (e) {
      var row = e.target && e.target.closest ? e.target.closest('.lanternPeopleRow') : null;
      if (!row) return;
      addPerson({
        token: row.getAttribute('data-token'),
        label: row.getAttribute('data-label'),
        person_kind: row.getAttribute('data-kind'),
      });
    });

    function search(q) {
      var query = String(q || '').trim();
      if (query.length < 1) {
        hideResults();
        updateFreeTextStatus();
        return;
      }
      var seq = ++reqSeq;
      if (statusEl) statusEl.textContent = 'Searching…';
      var url = apiBase() + '/api/people/search?q=' + encodeURIComponent(query) + '&limit=20';
      if (opt.staffOnly || opt.kind === 'staff') url += '&kind=staff';
      fetch(url, { credentials: 'include' })
        .then(function (r) {
          return r.json().catch(function () {
            return { ok: false };
          });
        })
        .then(function (data) {
          if (seq !== reqSeq) return;
          if (!data || !data.ok) {
            if (statusEl) statusEl.textContent = (data && data.error) || 'Search failed';
            hideResults();
            return;
          }
          if (statusEl) statusEl.textContent = '';
          var students = opt.staffOnly || opt.kind === 'staff' ? [] : data.students || [];
          var staff = data.staff || [];
          if (opt.tmsStaffOnly) {
            staff = staff.filter(function (p) {
              return p && String(p.token || '').indexOf('staff_tms:') === 0;
            });
          }
          renderResults(students, staff);
          updateFreeTextStatus();
        })
        .catch(function () {
          if (seq !== reqSeq) return;
          if (statusEl) statusEl.textContent = 'Search failed';
          hideResults();
        });
    }

    input.addEventListener('input', function () {
      var v = input.value;
      // Prompt #213 — editing typed text after a person chip clears the stale canonical selection.
      if (selected.length && allowFreeText) {
        var selLabel = String(selected[0].label || '').trim();
        var cur = String(v || '').trim();
        if (cur !== selLabel) {
          selected = [];
          renderChips();
        }
      } else if (selected.length && max === 1 && relationship === 'recognized') {
        var selLabel2 = String(selected[0].label || '').trim();
        var cur2 = String(v || '').trim();
        if (cur2 && cur2 !== selLabel2) {
          selected = [];
          renderChips();
        }
      }
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(function () {
        search(v);
        updateFreeTextStatus();
        notify();
      }, DEBOUNCE_MS);
    });

    input.addEventListener('focus', function () {
      if (String(input.value || '').trim()) search(input.value);
    });

    document.addEventListener('click', function (e) {
      if (!open) return;
      if (root.contains(e.target)) return;
      hideResults();
    });

    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        hideResults();
        input.blur();
      }
    });

    function setPeople(list, flags) {
      selected = [];
      (Array.isArray(list) ? list : []).forEach(function (p) {
        if (!p) return;
        var token = p.token || '';
        var label = p.label || p.display_label || '';
        if (!token && p.person_kind && p.person_key) {
          if (p.person_kind === 'student') token = 'student:' + p.person_key;
          else if (String(p.person_key).indexOf('lantern_staff:') === 0) token = 'staff_lantern:' + String(p.person_key).slice('lantern_staff:'.length);
          else token = 'staff_tms:' + p.person_key;
        }
        if (!token) return;
        selected.push({ token: token, label: label || token, kind: p.person_kind || p.kind || '' });
      });
      if (selected.length > max) selected = selected.slice(0, max);
      renderChips();
      if (input) input.value = '';
      if (!(flags && flags.silent)) notify();
    }

    function setRecognitionLabel(label, flags) {
      selected = [];
      renderChips();
      if (input) input.value = String(label || '').trim().slice(0, freeTextMax);
      updateFreeTextStatus();
      if (!(flags && flags.silent)) notify();
    }

    return {
      getPeoplePayload: getPeoplePayload,
      getSelected: getSelected,
      getRecognitionState: getRecognitionState,
      getRecognitionLabel: getRecognitionLabel,
      setPeople: setPeople,
      setRecognitionLabel: setRecognitionLabel,
      clear: clear,
      setMax: function (n) {
        max = Math.max(1, Number(n) || 1);
        if (selected.length > max) {
          selected = selected.slice(0, max);
          renderChips();
          notify();
        }
      },
      destroy: function () {
        clearTimeout(debounceTimer);
        container.innerHTML = '';
      },
    };
  }

  global.LanternPeoplePicker = {
    mount: mount,
    MAX_TAGS: MAX_TAGS,
    RECOGNITION_LABEL_MAX: 100,
  };
})(typeof window !== 'undefined' ? window : globalThis);
