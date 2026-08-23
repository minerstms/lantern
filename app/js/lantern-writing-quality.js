/**
 * Prompt #257C — shared Writing & Submission Quality client.
 * Settings loader, field guards, polish evaluator, pre-submit modal.
 */
(function (global) {
  var API = (global.LANTERN_AVATAR_API != null ? global.LANTERN_AVATAR_API : '') || '';
  var cache = null;
  var loadPromise = null;

  var DEFAULTS = {
    enabled: true,
    block_paste: true,
    block_drag_drop: true,
    preserve_spellcheck: true,
    preserve_single_word_suggestions: true,
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
    gud: 'good',
    alot: 'a lot',
    dont: "don't",
    cant: "can't",
    wont: "won't",
  };

  function mergeSettings(partial) {
    var base = JSON.parse(JSON.stringify(DEFAULTS));
    if (!partial || typeof partial !== 'object') return base;
    Object.keys(DEFAULTS).forEach(function (k) {
      if (k === 'categories' || k === 'quality_floor') return;
      if (partial[k] != null) base[k] = !!partial[k];
    });
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
    setTimeout(function () { if (el.parentNode) el.remove(); }, 2800);
  }

  function suggestion(id, category, message, detail) {
    return { id: id, category: category, message: message, detail: detail || '' };
  }

  function evaluatePolish(text, settings) {
    settings = settings || getSettings();
    var out = [];
    if (!settings.enabled) return out;
    var raw = String(text || '');
    var trimmed = raw.trim();
    if (!trimmed) return out;

    var minLen = settings.quality_floor.min_text_length || 0;
    if (trimmed.length < minLen) return out;

    var cats = settings.categories || {};
    var floor = settings.quality_floor || {};

    if (cats.spelling) {
      var words = trimmed.toLowerCase().match(/[a-z']+/g) || [];
      var seenSpell = {};
      words.forEach(function (w) {
        if (seenSpell[w]) return;
        seenSpell[w] = true;
        if (COMMON_MISSPELLINGS[w]) {
          out.push(suggestion('spell_' + w, 'spelling', 'Spelling: "' + w + '" → "' + COMMON_MISSPELLINGS[w] + '"'));
        }
      });
    }

    if (cats.repeated_spaces && /\s{2,}/.test(raw)) {
      out.push(suggestion('rep_space', 'repeated_spaces', 'Extra spaces: try using one space between words.'));
    }

    if (cats.repeated_punctuation) {
      var repPunctTh = floor.repeated_punctuation_threshold || 3;
      var repPunctRe = new RegExp('[!?.,;:]{2,' + repPunctTh + ',}');
      if (repPunctRe.test(trimmed)) {
        out.push(suggestion('rep_punct', 'repeated_punctuation', 'Repeated punctuation: one mark is usually enough.'));
      }
    }

    if (cats.duplicate_words) {
      if (/\b(\w+)\s+\1\b/i.test(trimmed)) {
        out.push(suggestion('dup_word', 'duplicate_words', 'Duplicate word: you may have typed the same word twice in a row.'));
      }
    }

    if (cats.lowercase_i) {
      if (/(^|[.!?]\s+|\s+)i(\s+|[.!?,]|$)/.test(trimmed)) {
        out.push(suggestion('lower_i', 'lowercase_i', 'Capitalization: the word "I" is usually capitalized when you mean yourself.'));
      }
    }

    if (cats.capitalization) {
      var sentences = trimmed.split(/(?<=[.!?])\s+/);
      sentences.forEach(function (sent, idx) {
        var s = sent.trim();
        if (s.length < 3) return;
        if (/^[a-z]/.test(s)) {
          out.push(suggestion('cap_' + idx, 'capitalization', 'Capitalization: this sentence may need a capital letter at the start.'));
        }
      });
      if (/^[a-z]/.test(trimmed) && out.every(function (x) { return x.category !== 'capitalization'; })) {
        out.push(suggestion('cap_start', 'capitalization', 'Capitalization: this sentence may need a capital letter at the start.'));
      }
    }

    if (cats.ending_punctuation) {
      var ends = trimmed.slice(-1);
      if (trimmed.length >= 20 && !/[.!?]/.test(ends) && /[a-zA-Z0-9)]$/.test(trimmed)) {
        out.push(suggestion('end_punct', 'ending_punctuation', 'Punctuation: this sentence may need punctuation at the end.'));
      }
    }

    if (cats.excessive_caps) {
      var letters = trimmed.match(/[a-zA-Z]/g) || [];
      var caps = trimmed.match(/[A-Z]/g) || [];
      if (letters.length >= 8) {
        var ratio = (caps.length / letters.length) * 100;
        var maxRatio = floor.max_caps_ratio_percent || 40;
        if (ratio >= maxRatio) {
          out.push(suggestion('ex_caps', 'excessive_caps', 'ALL CAPS: try using normal capitalization so your message is easier to read.'));
        }
      }
    }

    if (cats.low_effort && floor.enabled) {
      var charTh = floor.repeated_char_threshold || 5;
      var charRe = new RegExp('(.)\\1{' + (charTh - 1) + ',}');
      if (charRe.test(trimmed)) {
        out.push(suggestion('low_rep_char', 'low_effort', 'This response may need a little more polish before sharing.'));
      } else if (/^(ha+|lol+|idk|asdf|qwerty|test|ok+|k+|yes+|no+)[\s.!?]*$/i.test(trimmed)) {
        out.push(suggestion('low_pattern', 'low_effort', 'This response may need a little more polish before sharing.'));
      } else if (countWords(trimmed) < 3 && trimmed.length >= minLen) {
        out.push(suggestion('low_short', 'low_effort', 'This response may need a little more polish before sharing.'));
      }
    }

    return out;
  }

  function failsQualityFloor(text, settings) {
    settings = settings || getSettings();
    if (!settings.enabled || !settings.quality_floor.enabled) return false;
    var low = evaluatePolish(text, settings).filter(function (s) { return s.category === 'low_effort'; });
    return low.length > 0;
  }

  function attachField(textarea, opts) {
    opts = opts || {};
    if (!textarea) return { destroy: function () {}, getWordCount: countWords };
    var handlers = [];
    var destroyed = false;
    var lastValue = textarea.value || '';
    var composing = false;

    function bind(type, fn) {
      textarea.addEventListener(type, fn);
      handlers.push({ type: type, fn: fn });
    }

    function applyAttrs(settings) {
      if (!textarea || textarea.tagName !== 'TEXTAREA') return;
      if (settings.preserve_spellcheck) {
        textarea.setAttribute('spellcheck', 'true');
        textarea.setAttribute('lang', textarea.getAttribute('lang') || 'en');
      } else {
        textarea.removeAttribute('spellcheck');
      }
      if (settings.preserve_single_word_suggestions) {
        textarea.removeAttribute('autocomplete');
        textarea.removeAttribute('autocorrect');
      }
    }

    function updateWordCount() {
      if (typeof opts.onWordCount === 'function') {
        opts.onWordCount(countWords(textarea.value), opts.minWords || 0);
      }
    }

    function onPaste(e) {
      var settings = getSettings();
      if (!settings.enabled || !settings.block_paste) return;
      e.preventDefault();
      showToast('Type your own words here — pasting is turned off.');
    }

    function onDrop(e) {
      var settings = getSettings();
      if (!settings.enabled || !settings.block_drag_drop) return;
      e.preventDefault();
      e.stopPropagation();
      showToast('Type your own words here — drag and drop is turned off.');
    }

    function onDragOver(e) {
      var settings = getSettings();
      if (!settings.enabled || !settings.block_drag_drop) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'none';
    }

    function onInput() {
      if (composing) return;
      var settings = getSettings();
      var val = textarea.value;
      if (settings.enabled && settings.block_paste) {
        var added = val.length - lastValue.length;
        if (added >= 12) {
          textarea.value = lastValue;
          textarea.setSelectionRange(lastValue.length, lastValue.length);
          showToast('Type your own words here — large paste-like insertions are blocked.');
          updateWordCount();
          return;
        }
      }
      lastValue = val;
      updateWordCount();
    }

    bind('paste', onPaste);
    bind('drop', onDrop);
    bind('dragover', onDragOver);
    bind('dragenter', onDragOver);
    bind('input', onInput);
    bind('compositionstart', function () { composing = true; });
    bind('compositionend', function () {
      composing = false;
      lastValue = textarea.value;
      updateWordCount();
    });

    loadSettings().then(applyAttrs);
    updateWordCount();

    return {
      getWordCount: function () { return countWords(textarea.value); },
      refresh: function () { return loadSettings(true).then(applyAttrs); },
      destroy: function () {
        if (destroyed) return;
        destroyed = true;
        handlers.forEach(function (h) { textarea.removeEventListener(h.type, h.fn); });
      },
    };
  }

  function showPolishModal(options) {
    options = options || {};
    var suggestions = options.suggestions || [];
    var settings = options.settings || getSettings();
    var allowAnyway = settings.allow_submit_anyway !== false;
    var showCount = settings.show_suggestion_count !== false;
    var count = suggestions.length;

    return new Promise(function (resolve) {
      var overlay = document.createElement('div');
      overlay.className = 'lwqOverlay';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');

      var title = count === 0 ? 'Ready to share!' : 'Almost ready!';
      var lead =
        count === 0
          ? (showCount ? 'Submit with 0 suggestions.' : 'Your writing looks ready to share.')
          : (showCount
            ? 'Lantern found ' + count + ' thing' + (count === 1 ? '' : 's') + ' worth checking before you share.'
            : 'Lantern found a few things worth checking before you share.');

      var listHtml = '';
      if (count > 0) {
        listHtml = '<ul class="lwqList">';
        suggestions.slice(0, 12).forEach(function (s) {
          listHtml += '<li><strong>' + escHtml(s.category.replace(/_/g, ' ')) + '</strong>' + escHtml(s.message) + '</li>';
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

      if (count === 0) {
        var submitBtn = document.createElement('button');
        submitBtn.type = 'button';
        submitBtn.className = 'lwqPrimary';
        submitBtn.textContent = 'Submit';
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
          anywayBtn.textContent = 'Submit anyway';
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
        if (e.target === overlay) close({ action: 'back', suggestionCount: count, submittedWithSuggestions: count });
      });
    });
  }

  /**
   * Run polish gate before submit. Calls proceed(meta) when allowed to continue.
   * Returns false immediately when blocked; true when proceeding sync or async started.
   */
  function runBeforeSubmit(text, proceed, opts) {
    opts = opts || {};
    var settings = opts.settings || getSettings();
    if (!settings.enabled || opts.skip) {
      proceed({ polishCheckCompleted: false, suggestionCount: 0, submittedWithSuggestions: 0 });
      return true;
    }

    if (settings.quality_floor.enabled && failsQualityFloor(text, settings)) {
      if (!settings.allow_submit_anyway) {
        showToast('Add a little more detail before submitting.');
        return false;
      }
    }

    if (!settings.require_pre_submit_check) {
      var suggestions = evaluatePolish(text, settings);
      proceed({
        polishCheckCompleted: true,
        suggestionCount: suggestions.length,
        submittedWithSuggestions: suggestions.length,
      });
      return true;
    }

    var suggestions = evaluatePolish(text, settings);
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
        });
      }
    });
    return true;
  }

  function wrapSubmitHandler(getText, submitFn, opts) {
    return function () {
      var args = arguments;
      loadSettings().then(function (settings) {
        if (!settings.enabled || (opts && opts.skip && opts.skip())) {
          submitFn.apply(null, args);
          return;
        }
        var text = typeof getText === 'function' ? getText() : '';
        runBeforeSubmit(text, function (meta) {
          submitFn.apply(null, args.concat ? [meta] : args);
        }, Object.assign({}, opts || {}, { settings: settings, focusEl: opts && opts.focusEl }));
      });
    };
  }

  global.LanternWritingQuality = {
    loadSettings: loadSettings,
    getSettings: getSettings,
    attachField: attachField,
    evaluatePolish: evaluatePolish,
    runBeforeSubmit: runBeforeSubmit,
    wrapSubmitHandler: wrapSubmitHandler,
    showPolishModal: showPolishModal,
    countWords: countWords,
    DEFAULTS: DEFAULTS,
  };
})(typeof window !== 'undefined' ? window : self);
