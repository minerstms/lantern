/**
 * Prompt #258 — Lantern Writing Integrity + Polish Check (shared client).
 * Settings loader, field profiles, authorship guards, soft polish, hard quality floor.
 */
(function (global) {
  var API = (global.LANTERN_AVATAR_API != null ? global.LANTERN_AVATAR_API : '') || '';
  var cache = null;
  var loadPromise = null;

  var FIELD_PROFILES = {
    LONG_FORM: 'LONG_FORM',
    SHORT_FORM: 'SHORT_FORM',
  };

  var BROWSER_LIMITATION =
    'Lantern blocks paste and drag/drop text using browser events (paste, drop, beforeinput). ' +
    'Some browsers cannot reliably detect every text-import path. Lantern never blocks IME, composition, ' +
    'dictation, or ordinary typing — and does not use character-burst heuristics that could false-block accessibility input.';

  var DEFAULTS = {
    enabled: true,
    block_paste: true,
    block_drag_drop: true,
    preserve_spellcheck: true,
    limit_phrase_suggestions: true,
    require_pre_submit_check: true,
    allow_submit_anyway: true,
    show_suggestion_count: true,
    categories: {
      spelling: true,
      capitalization: true,
      ending_punctuation: true,
      repeated_punctuation: true,
      repeated_spaces: true,
      duplicate_words: true,
      lowercase_i: true,
      excessive_caps: true,
      low_effort: true,
    },
    quality_floor: {
      enabled: true,
      repeated_char_threshold: 5,
      repeated_punctuation_threshold: 3,
      max_caps_ratio_percent: 40,
      min_text_length: 12,
    },
  };

  /** High-confidence mechanical typos only — not comprehensive spellcheck. */
  var COMMON_MISSPELLINGS = {
    becuase: 'because',
    becasue: 'because',
    recieve: 'receive',
    recieved: 'received',
    seperate: 'separate',
    definately: 'definitely',
    definetly: 'definitely',
    occured: 'occurred',
    occurence: 'occurrence',
    untill: 'until',
    wich: 'which',
    teh: 'the',
    adn: 'and',
    thier: 'their',
    freind: 'friend',
    beleive: 'believe',
    writting: 'writing',
    alot: 'a lot',
  };

  function mergeSettings(partial) {
    var base = JSON.parse(JSON.stringify(DEFAULTS));
    if (!partial || typeof partial !== 'object') return base;
    Object.keys(DEFAULTS).forEach(function (k) {
      if (k === 'categories' || k === 'quality_floor') return;
      if (partial[k] != null) base[k] = !!partial[k];
    });
    if (partial.preserve_single_word_suggestions != null && partial.limit_phrase_suggestions == null) {
      base.limit_phrase_suggestions = !!partial.preserve_single_word_suggestions;
    }
    if (partial.categories) {
      Object.keys(base.categories).forEach(function (k) {
        if (partial.categories[k] != null) base.categories[k] = !!partial.categories[k];
      });
    }
    if (partial.quality_floor) {
      Object.keys(base.quality_floor).forEach(function (k) {
        if (partial.quality_floor[k] != null) {
          if (k === 'enabled') base.quality_floor[k] = !!partial.quality_floor[k];
          else base.quality_floor[k] = Number(partial.quality_floor[k]) || base.quality_floor[k];
        }
      });
    }
    return base;
  }

  function getSettings() {
    return mergeSettings(cache && cache.settings);
  }

  function loadSettings(force) {
    if (!force && cache) return Promise.resolve(getSettings());
    if (!force && loadPromise) return loadPromise.then(getSettings);
    loadPromise = fetch(API + '/api/settings/writing-quality', { credentials: 'include' })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (res && res.ok && res.settings) cache = res;
        else cache = { settings: DEFAULTS };
        return getSettings();
      })
      .catch(function () {
        cache = { settings: DEFAULTS };
        return getSettings();
      });
    return loadPromise;
  }

  function countWords(text) {
    if (!text || typeof text !== 'string') return 0;
    var t = text.trim();
    if (!t) return 0;
    return t.split(/\s+/).filter(Boolean).length;
  }

  function escHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function showToast(msg) {
    var existing = document.querySelector('.lwqToast');
    if (existing) existing.remove();
    var el = document.createElement('div');
    el.className = 'lwqToast';
    el.setAttribute('role', 'status');
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(function () { if (el.parentNode) el.remove(); }, 3200);
  }

  function normalizeProfile(profile) {
    return profile === FIELD_PROFILES.SHORT_FORM ? FIELD_PROFILES.SHORT_FORM : FIELD_PROFILES.LONG_FORM;
  }

  function suggestion(id, category, message, severity) {
    return { id: id, category: category, message: message, severity: severity || 'soft' };
  }

  function isPublishableInput(el) {
    if (!el) return false;
    var tag = (el.tagName || '').toUpperCase();
    return tag === 'TEXTAREA' || (tag === 'INPUT' && (el.type === 'text' || el.type === 'search' || !el.type));
  }

  function applyAuthorshipAttrs(el, settings, profile) {
    if (!isPublishableInput(el)) return;
    settings = settings || getSettings();
    profile = normalizeProfile(profile);
    if (settings.preserve_spellcheck) {
      el.setAttribute('spellcheck', 'true');
      el.setAttribute('lang', el.getAttribute('lang') || 'en');
    } else {
      el.setAttribute('spellcheck', 'false');
    }
    el.setAttribute('autocomplete', 'off');
    if (settings.limit_phrase_suggestions) {
      el.setAttribute('writingsuggestions', 'false');
    } else {
      el.removeAttribute('writingsuggestions');
    }
    if (profile === FIELD_PROFILES.SHORT_FORM) {
      el.setAttribute('autocapitalize', 'words');
    } else {
      el.setAttribute('autocapitalize', 'sentences');
    }
  }

  function evaluateQualityFloor(text, settings) {
    settings = settings || getSettings();
    if (!settings.enabled || !settings.quality_floor || !settings.quality_floor.enabled) {
      return { failed: false, reasons: [] };
    }
    if (settings.categories && settings.categories.low_effort === false) {
      return { failed: false, reasons: [] };
    }
    var trimmed = String(text || '').trim();
    if (!trimmed) return { failed: false, reasons: [] };
    var minLen = settings.quality_floor.min_text_length || 0;
    if (trimmed.length < minLen) return { failed: false, reasons: [] };

    var floor = settings.quality_floor;
    var reasons = [];
    var charTh = floor.repeated_char_threshold || 5;
    var charRe = new RegExp('(.)\\1{' + (charTh - 1) + ',}');
    if (charRe.test(trimmed)) {
      reasons.push('This needs a little more work before it\'s ready to share.');
    }
    var punctTh = floor.repeated_punctuation_threshold || 3;
    var hardPunctRe = new RegExp('[!?.,;:]{' + punctTh + ',}');
    if (hardPunctRe.test(trimmed)) {
      reasons.push('This needs a little more work before it\'s ready to share.');
    }
    if (/^(asdf|qwerty|zxcv|wasd|hjkl|yuio|dfgh|cvbn)+$/i.test(trimmed)) {
      reasons.push('This needs a little more work before it\'s ready to share.');
    } else if (/^[a-z]{8,}$/i.test(trimmed) && !/\s/.test(trimmed)) {
      var uniq = {};
      for (var ci = 0; ci < trimmed.length; ci++) uniq[trimmed.charAt(ci).toLowerCase()] = 1;
      if (Object.keys(uniq).length <= 4) {
        reasons.push('This needs a little more work before it\'s ready to share.');
      }
    }
    if (/^[!?.,;:]+$/.test(trimmed)) {
      reasons.push('This needs a little more work before it\'s ready to share.');
    }
    return { failed: reasons.length > 0, reasons: reasons };
  }

  function evaluatePolish(text, settings, profile) {
    settings = settings || getSettings();
    profile = normalizeProfile(profile);
    var out = [];
    if (!settings.enabled) return out;
    var raw = String(text || '');
    var trimmed = raw.trim();
    if (!trimmed) return out;

    var minLen = settings.quality_floor.min_text_length || 0;
    if (trimmed.length < minLen) return out;

    var cats = settings.categories || {};
    var floor = settings.quality_floor || {};
    var isLong = profile === FIELD_PROFILES.LONG_FORM;

    if (cats.spelling) {
      var words = trimmed.toLowerCase().match(/[a-z']+/g) || [];
      var seenSpell = {};
      words.forEach(function (w) {
        if (seenSpell[w] || w.length < 3) return;
        seenSpell[w] = true;
        if (COMMON_MISSPELLINGS[w]) {
          out.push(suggestion('spell_' + w, 'spelling', 'Possible spelling: "' + w + '" → "' + COMMON_MISSPELLINGS[w] + '"'));
        }
      });
    }

    if (cats.repeated_spaces && /\s{2,}/.test(raw)) {
      out.push(suggestion('rep_space', 'repeated_spaces', 'Extra spaces: try using one space between words.'));
    }

    if (cats.repeated_punctuation) {
      var softPunctTh = Math.max(2, (floor.repeated_punctuation_threshold || 3) - 1);
      var softPunctRe = new RegExp('[!?.,;:]{' + softPunctTh + ',}');
      if (softPunctRe.test(trimmed) && !evaluateQualityFloor(trimmed, settings).failed) {
        out.push(suggestion('rep_punct', 'repeated_punctuation', 'Repeated punctuation: one mark is usually enough.'));
      }
    }

    if (cats.duplicate_words && /\b(\w+)\s+\1\b/i.test(trimmed)) {
      out.push(suggestion('dup_word', 'duplicate_words', 'Duplicate word: you may have typed the same word twice in a row.'));
    }

    if (cats.lowercase_i && isLong) {
      if (/(^|[.!?]\s+|\s+)i(\s+|[.!?,]|$)/.test(trimmed)) {
        out.push(suggestion('lower_i', 'lowercase_i', 'Capitalization: the word "I" is usually capitalized when you mean yourself.'));
      }
    }

    if (cats.capitalization) {
      if (/^[a-z]/.test(trimmed)) {
        out.push(suggestion('cap_start', 'capitalization', 'Capitalization: this may need a capital letter at the start.'));
      } else if (isLong) {
        var sentences = trimmed.split(/(?<=[.!?])\s+/);
        sentences.forEach(function (sent, idx) {
          var s = sent.trim();
          if (s.length < 3 || idx === 0) return;
          if (/^[a-z]/.test(s)) {
            out.push(suggestion('cap_' + idx, 'capitalization', 'Capitalization: this sentence may need a capital letter at the start.'));
          }
        });
      }
    }

    if (cats.ending_punctuation && isLong) {
      var ends = trimmed.slice(-1);
      if (countWords(trimmed) >= 4 && trimmed.length >= 20 && !/[.!?]/.test(ends) && /[a-zA-Z0-9)]$/.test(trimmed)) {
        out.push(suggestion('end_punct', 'ending_punctuation', 'Punctuation: this sentence may need punctuation at the end.'));
      }
    }

    if (cats.excessive_caps) {
      var letters = trimmed.match(/[a-zA-Z]/g) || [];
      var caps = trimmed.match(/[A-Z]/g) || [];
      var minLetters = isLong ? 8 : 5;
      if (letters.length >= minLetters) {
        var ratio = (caps.length / letters.length) * 100;
        var maxRatio = floor.max_caps_ratio_percent || 40;
        if (ratio >= maxRatio) {
          out.push(suggestion('ex_caps', 'excessive_caps', 'ALL CAPS: try using normal capitalization so your message is easier to read.'));
        }
      }
    }

    return out;
  }

  function evaluateFields(fields, settings) {
    settings = settings || getSettings();
    var soft = [];
    var hard = { failed: false, reasons: [] };
    var seenHard = {};
    (fields || []).forEach(function (field) {
      var text = String((field && field.text) || '').trim();
      if (!text) return;
      var profile = normalizeProfile(field && field.profile);
      var label = (field && field.label) || '';
      var prefix = label ? (label + ': ') : '';

      var floor = evaluateQualityFloor(text, settings);
      if (floor.failed) {
        hard.failed = true;
        floor.reasons.forEach(function (r) {
          if (!seenHard[r]) {
            seenHard[r] = true;
            hard.reasons.push(prefix + r);
          }
        });
      }

      evaluatePolish(text, settings, profile).forEach(function (s) {
        soft.push(Object.assign({}, s, {
          message: prefix + s.message,
          fieldLabel: label,
        }));
      });
    });
    return { soft: soft, hard: hard };
  }

  function blockImportedText(settings) {
    settings = settings || getSettings();
    return !!(settings.enabled && (settings.block_paste || settings.block_drag_drop));
  }

  function attachField(el, opts) {
    opts = opts || {};
    if (!isPublishableInput(el)) return { destroy: function () {}, getWordCount: countWords, refresh: function () { return Promise.resolve(); } };
    var handlers = [];
    var destroyed = false;
    var composing = false;
    var profile = normalizeProfile(opts.profile);

    function bind(type, fn, capture) {
      el.addEventListener(type, fn, !!capture);
      handlers.push({ type: type, fn: fn, capture: !!capture });
    }

    function updateWordCount() {
      if (typeof opts.onWordCount === 'function') {
        opts.onWordCount(countWords(el.value), opts.minWords || 0);
      }
    }

    function rejectImport(sourceLabel) {
      showToast('Type your own words here — ' + sourceLabel + ' is turned off.');
    }

    function onPaste(e) {
      var settings = getSettings();
      if (!settings.enabled || !settings.block_paste) return;
      e.preventDefault();
      rejectImport('pasting');
    }

    function onBeforeInput(e) {
      var settings = getSettings();
      if (!settings.enabled || composing) return;
      var it = e.inputType || '';
      if (it === 'insertFromPaste' && settings.block_paste) {
        e.preventDefault();
        rejectImport('pasting');
        return;
      }
      if ((it === 'insertFromDrop' || it === 'insertFromYank') && settings.block_drag_drop) {
        e.preventDefault();
        rejectImport('drag and drop');
      }
    }

    function onDrop(e) {
      var settings = getSettings();
      if (!settings.enabled || !settings.block_drag_drop) return;
      e.preventDefault();
      e.stopPropagation();
      rejectImport('drag and drop');
    }

    function onDragOver(e) {
      var settings = getSettings();
      if (!settings.enabled || !settings.block_drag_drop) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'none';
    }

    function onInput() {
      if (composing) return;
      updateWordCount();
    }

    bind('paste', onPaste);
    bind('beforeinput', onBeforeInput);
    bind('drop', onDrop);
    bind('dragover', onDragOver);
    bind('dragenter', onDragOver);
    bind('input', onInput);
    bind('compositionstart', function () { composing = true; });
    bind('compositionend', function () {
      composing = false;
      updateWordCount();
    });

    loadSettings().then(function (settings) {
      applyAuthorshipAttrs(el, settings, profile);
    });
    updateWordCount();

    return {
      getWordCount: function () { return countWords(el.value); },
      refresh: function () {
        return loadSettings(true).then(function (settings) {
          applyAuthorshipAttrs(el, settings, profile);
        });
      },
      destroy: function () {
        if (destroyed) return;
        destroyed = true;
        handlers.forEach(function (h) {
          el.removeEventListener(h.type, h.fn, h.capture);
        });
      },
    };
  }

  function attachFields(fieldDefs) {
    var handles = [];
    (fieldDefs || []).forEach(function (def) {
      if (!def) return;
      var node = typeof def.el === 'string' ? document.querySelector(def.el) : def.el;
      if (!node) return;
      handles.push(attachField(node, { profile: def.profile, minWords: def.minWords, onWordCount: def.onWordCount }));
    });
    return handles;
  }

  function attachPollChoiceContainer(container) {
    if (!container || !container.querySelectorAll) return;
    container.querySelectorAll('.pollOptInput').forEach(function (inp) {
      if (inp._lwqAttached) return;
      inp._lwqAttached = true;
      attachField(inp, { profile: FIELD_PROFILES.SHORT_FORM });
    });
  }

  function showPolishModal(options) {
    options = options || {};
    var suggestions = options.suggestions || [];
    var settings = options.settings || getSettings();
    var hardFloor = options.hardFloor || null;
    var allowAnyway = settings.allow_submit_anyway !== false && !hardFloor;
    var showCount = settings.show_suggestion_count !== false;
    var count = suggestions.length;

    return new Promise(function (resolve) {
      var overlay = document.createElement('div');
      overlay.className = 'lwqOverlay';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');

      var title;
      var lead;
      if (hardFloor) {
        title = 'Almost ready!';
        lead = (hardFloor.reasons && hardFloor.reasons[0]) || 'This needs a little more work before it\'s ready to share.';
      } else if (count === 0) {
        title = 'Ready to share!';
        lead = showCount ? 'No suggestions right now.' : 'Your writing looks ready to share.';
      } else {
        title = 'Almost ready!';
        lead = showCount
          ? ('Lantern found ' + count + ' thing' + (count === 1 ? '' : 's') + ' worth checking before you share.')
          : 'Lantern found a few things worth checking before you share.';
      }

      var listHtml = '';
      if (!hardFloor && count > 0) {
        listHtml = '<ul class="lwqList">';
        suggestions.slice(0, 12).forEach(function (s) {
          listHtml += '<li><strong>' + escHtml(String(s.category || '').replace(/_/g, ' ')) + '</strong>' + escHtml(s.message) + '</li>';
        });
        if (suggestions.length > 12) {
          listHtml += '<li>…and ' + (suggestions.length - 12) + ' more</li>';
        }
        listHtml += '</ul>';
      }

      var card = document.createElement('div');
      card.className = 'lwqCard';
      card.innerHTML =
        '<h2 class="lwqTitle">' + escHtml(title) + '</h2>' +
        '<p class="lwqLead">' + escHtml(lead) + '</p>' +
        listHtml +
        '<div class="lwqActions"></div>';
      overlay.appendChild(card);
      document.body.appendChild(overlay);

      var actions = card.querySelector('.lwqActions');

      function close(result) {
        overlay.remove();
        resolve(result);
      }

      if (hardFloor) {
        var editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'lwqPrimary';
        editBtn.textContent = 'Keep editing';
        editBtn.addEventListener('click', function () {
          close({ action: 'back', hardFloor: true });
        });
        actions.appendChild(editBtn);
      } else if (count === 0) {
        var submitBtn = document.createElement('button');
        submitBtn.type = 'button';
        submitBtn.className = 'lwqPrimary';
        submitBtn.textContent = showCount ? 'Submit · 0 suggestions' : 'Submit';
        submitBtn.addEventListener('click', function () {
          close({ action: 'submit', suggestionCount: 0, submittedWithSuggestions: 0 });
        });
        actions.appendChild(submitBtn);
      } else {
        var reviewBtn = document.createElement('button');
        reviewBtn.type = 'button';
        reviewBtn.className = 'lwqPrimary';
        reviewBtn.textContent = 'Review suggestions';
        reviewBtn.addEventListener('click', function () {
          close({ action: 'review', suggestionCount: count, submittedWithSuggestions: count });
        });
        actions.appendChild(reviewBtn);

        if (allowAnyway) {
          var anywayBtn = document.createElement('button');
          anywayBtn.type = 'button';
          anywayBtn.textContent = showCount ? ('Submit · ' + count + ' suggestion' + (count === 1 ? '' : 's') + ' remain') : 'Submit anyway';
          anywayBtn.addEventListener('click', function () {
            close({ action: 'submit', suggestionCount: count, submittedWithSuggestions: count });
          });
          actions.appendChild(anywayBtn);
        }

        var backBtn = document.createElement('button');
        backBtn.type = 'button';
        backBtn.className = 'lwqGhost';
        backBtn.textContent = 'Keep editing';
        backBtn.addEventListener('click', function () {
          close({ action: 'back', suggestionCount: count, submittedWithSuggestions: count });
        });
        actions.appendChild(backBtn);
      }

      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) close({ action: 'back', suggestionCount: count, hardFloor: !!hardFloor });
      });
    });
  }

  function runBeforeSubmitFields(fields, proceed, opts) {
    opts = opts || {};
    var settings = opts.settings || getSettings();
    if (!settings.enabled || opts.skip) {
      proceed({ polishCheckCompleted: false, suggestionCount: 0, submittedWithSuggestions: 0, hardFloorBlocked: false });
      return true;
    }

    var evaluated = evaluateFields(fields, settings);
    if (evaluated.hard.failed) {
      if (!settings.require_pre_submit_check) {
        showToast('This needs a little more work before it\'s ready to share.');
        return false;
      }
      showPolishModal({ hardFloor: evaluated.hard, settings: settings }).then(function (result) {
        if (result && result.action === 'review' && opts.focusEl) {
          try { opts.focusEl.focus(); } catch (_e) { /* ignore */ }
        }
      });
      return false;
    }

    var suggestions = evaluated.soft;
    if (!settings.require_pre_submit_check) {
      proceed({
        polishCheckCompleted: true,
        suggestionCount: suggestions.length,
        submittedWithSuggestions: suggestions.length,
        hardFloorBlocked: false,
      });
      return true;
    }

    showPolishModal({ suggestions: suggestions, settings: settings }).then(function (result) {
      if (!result || result.action === 'back' || result.action === 'review') {
        if (result && result.action === 'review' && opts.focusEl) {
          try { opts.focusEl.focus(); } catch (_e) { /* ignore */ }
        }
        return;
      }
      if (result.action === 'submit') {
        proceed({
          polishCheckCompleted: true,
          suggestionCount: result.suggestionCount || 0,
          submittedWithSuggestions: result.submittedWithSuggestions || 0,
          hardFloorBlocked: false,
        });
      }
    });
    return true;
  }

  function runBeforeSubmit(text, proceed, opts) {
    opts = opts || {};
    return runBeforeSubmitFields([
      { text: text, profile: opts.profile || FIELD_PROFILES.LONG_FORM, label: opts.label || '' },
    ], proceed, opts);
  }

  global.LanternWritingQuality = {
    FIELD_PROFILES: FIELD_PROFILES,
    BROWSER_LIMITATION: BROWSER_LIMITATION,
    loadSettings: loadSettings,
    getSettings: getSettings,
    attachField: attachField,
    attachFields: attachFields,
    attachPollChoiceContainer: attachPollChoiceContainer,
    applyAuthorshipAttrs: applyAuthorshipAttrs,
    evaluatePolish: evaluatePolish,
    evaluateQualityFloor: evaluateQualityFloor,
    evaluateFields: evaluateFields,
    runBeforeSubmit: runBeforeSubmit,
    runBeforeSubmitFields: runBeforeSubmitFields,
    showPolishModal: showPolishModal,
    countWords: countWords,
    DEFAULTS: DEFAULTS,
  };
})(typeof window !== 'undefined' ? window : self);
