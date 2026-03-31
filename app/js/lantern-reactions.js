/**
 * TMS Lantern — Student reactions (icons only, no comments).
 * Only for approved public content. System-controlled vocabulary.
 * FERPA: reactions allowed only on content already approved for community visibility.
 *
 * Display rule (locked): Explore shows emoji + percentage distribution only — never raw totals,
 * per-type counts, or count tooltips. Counts from the API are used only inside this module to
 * compute percents before any DOM update.
 */
(function (global) {
  var REACTION_VOCAB = [
    { type: 'heart',   emoji: '❤️',  label: 'Heart' },
    { type: 'star',    emoji: '⭐',  label: 'Star' },
    { type: 'lightbulb', emoji: '💡', label: 'Lightbulb' },
    { type: 'teamwork', emoji: '🤝',  label: 'Teamwork' },
    { type: 'thumbsup', emoji: '👍',  label: 'Thumbs Up' },
    { type: 'creative', emoji: '🎨', label: 'Creative' },
    { type: 'fire',    emoji: '🔥',  label: 'Fire' }
  ];

  var DEFAULT_STYLE = 'classic';
  function getReactionStyle(meaning, styleKey) {
    styleKey = styleKey || DEFAULT_STYLE;
    return { meaning: meaning, style: styleKey };
  }

  function esc(s) {
    return String(s || '').replace(/[&<>"']/g, function (c) { return c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;'; });
  }

  function getApiBase() {
    var g = typeof global !== 'undefined' ? global : (typeof window !== 'undefined' ? window : self);
    var base = (g.LANTERN_AVATAR_API && String(g.LANTERN_AVATAR_API).trim()) ? String(g.LANTERN_AVATAR_API).replace(/\/$/, '') : '';
    return base;
  }

  function addReaction(itemType, itemId, reactionType, characterName) {
    var apiBase = getApiBase();
    if (!apiBase) return Promise.resolve({ ok: false, error: 'No API' });
    return fetch(apiBase + '/api/reactions/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_type: itemType, item_id: itemId, reaction_type: reactionType, character_name: characterName })
    }).then(function (r) { return r.json(); }).catch(function () { return { ok: false }; });
  }

  function getCounts(itemType, itemIds) {
    var apiBase = getApiBase();
    if (!apiBase || !itemIds || itemIds.length === 0) return Promise.resolve({ ok: true, counts: {} });
    var q = 'item_type=' + encodeURIComponent(itemType) + '&item_ids=' + itemIds.map(function (id) { return encodeURIComponent(id); }).join(',');
    return fetch(apiBase + '/api/reactions/counts?' + q).then(function (r) { return r.json(); }).then(function (res) { return res && res.ok ? res : { ok: false, counts: {} }; }).catch(function () { return { ok: true, counts: {} }; });
  }

  function getMine(itemType, itemIds, characterName) {
    var apiBase = getApiBase();
    if (!apiBase || !itemIds || itemIds.length === 0) return Promise.resolve({ ok: true, mine: {} });
    var q = 'item_type=' + encodeURIComponent(itemType) + '&item_ids=' + itemIds.map(function (id) { return encodeURIComponent(id); }).join(',') + (characterName ? '&character_name=' + encodeURIComponent(characterName) : '');
    return fetch(apiBase + '/api/reactions/mine?' + q).then(function (r) { return r.json(); }).then(function (res) { return res && res.ok ? res : { ok: false, mine: {} }; }).catch(function () { return { ok: true, mine: {} }; });
  }

  function getPraisePreferences(characterName) {
    var apiBase = getApiBase();
    if (!apiBase || !characterName) return Promise.resolve({ ok: true, reaction_types: [] });
    return fetch(apiBase + '/api/reactions/praise-preferences?character_name=' + encodeURIComponent(characterName)).then(function (r) { return r.json(); }).then(function (res) { return res && res.ok ? res : { ok: false, reaction_types: [] }; }).catch(function () { return { ok: true, reaction_types: [] }; });
  }

  function setPraisePreferences(characterName, reactionTypes) {
    var apiBase = getApiBase();
    if (!apiBase || !characterName) return Promise.resolve({ ok: false });
    return fetch(apiBase + '/api/reactions/praise-preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ character_name: characterName, reaction_types: reactionTypes || [] })
    }).then(function (r) { return r.json(); }).catch(function () { return { ok: false }; });
  }

  function getBreakdown(itemType, itemId, viewerCharacterName, viewerIsTeacher) {
    var apiBase = getApiBase();
    if (!apiBase || !itemType || !itemId) return Promise.resolve({ ok: false });
    var q = 'item_type=' + encodeURIComponent(itemType) + '&item_id=' + encodeURIComponent(itemId);
    if (viewerCharacterName) q += '&viewer_character_name=' + encodeURIComponent(viewerCharacterName);
    if (viewerIsTeacher) q += '&viewer_is_teacher=true';
    return fetch(apiBase + '/api/reactions/breakdown?' + q).then(function (r) { return r.json(); }).catch(function () { return { ok: false }; });
  }

  function getNeedEncouragement(itemType, limit, excludeItemIds) {
    var apiBase = getApiBase();
    if (!apiBase) return Promise.resolve({ ok: true, items: [] });
    var q = 'item_type=' + encodeURIComponent(itemType || 'news') + '&limit=' + (limit || 10);
    if (excludeItemIds && excludeItemIds.length) q += '&exclude_item_ids=' + excludeItemIds.map(function (id) { return encodeURIComponent(id); }).join(',');
    return fetch(apiBase + '/api/reactions/need-encouragement?' + q).then(function (r) { return r.json(); }).then(function (res) { return res && res.ok ? res : { ok: false, items: [] }; }).catch(function () { return { ok: true, items: [] }; });
  }

  function getSummary(itemType, itemId) {
    var apiBase = getApiBase();
    if (!apiBase || !itemType || !itemId) return Promise.resolve({ ok: false, top: [] });
    return fetch(apiBase + '/api/reactions/summary?item_type=' + encodeURIComponent(itemType) + '&item_id=' + encodeURIComponent(itemId)).then(function (r) { return r.json(); }).catch(function () { return { ok: false, top: [] }; });
  }

  var FEATURE_FLAGS = {
    ENABLE_EARLY_ENCOURAGER_REWARD: false,
    ENABLE_REACTION_BREAKDOWN: false,
    ENABLE_INCLUSION_BOOST: false,
    setFlagsFromServer: function (res) {
      if (res && res.ok) {
        if (res.ENABLE_EARLY_ENCOURAGER_REWARD === true) this.ENABLE_EARLY_ENCOURAGER_REWARD = true;
        if (res.ENABLE_REACTION_BREAKDOWN === true) this.ENABLE_REACTION_BREAKDOWN = true;
        if (res.ENABLE_INCLUSION_BOOST === true) this.ENABLE_INCLUSION_BOOST = true;
      }
    }
  };
  if (global.LANTERN_FEATURE_FLAGS == null) global.LANTERN_FEATURE_FLAGS = FEATURE_FLAGS;

  function getFeatureFlags() {
    var apiBase = getApiBase();
    if (!apiBase) return Promise.resolve({ ok: false });
    return fetch(apiBase + '/api/reactions/feature-flags').then(function (r) { return r.json(); }).then(function (res) {
      if (res && res.ok && global.LANTERN_FEATURE_FLAGS && global.LANTERN_FEATURE_FLAGS.setFlagsFromServer) {
        global.LANTERN_FEATURE_FLAGS.setFlagsFromServer(res);
      }
      return res;
    }).catch(function () { return { ok: false }; });
  }

  var REACTION_TYPE_LABELS = { heart: 'Appreciation', star: 'Quality', lightbulb: 'Ideas', teamwork: 'Teamwork', thumbsup: 'Thumbs Up', creative: 'Creativity', fire: 'Awesome' };
  function formatPraiseSummary(top) {
    if (!top || !top.length) return '';
    return top.slice(0, 4).map(function (t) { return (REACTION_TYPE_LABELS[t.type] || t.type) + ' ' + (REACTION_VOCAB.find(function (r) { return r.type === t.type; }) ? REACTION_VOCAB.find(function (r) { return r.type === t.type; }).emoji : ''); }).join(' · ');
  }

  /**
   * Raw counts stay internal — never pass counts to DOM. Returns whole-number percents per type (same vocab order).
   */
  function reactionPercentsFromCounts(itemCounts, vocab) {
    itemCounts = itemCounts || {};
    vocab = vocab || [];
    var total = 0;
    for (var i = 0; i < vocab.length; i++) {
      total += itemCounts[vocab[i].type] || 0;
    }
    var percents = {};
    if (total <= 0) {
      for (var j = 0; j < vocab.length; j++) {
        percents[vocab[j].type] = 0;
      }
      return { total: 0, percents: percents };
    }
    for (var k = 0; k < vocab.length; k++) {
      var typ = vocab[k].type;
      var c = itemCounts[typ] || 0;
      percents[typ] = Math.round((c / total) * 100);
    }
    return { total: total, percents: percents };
  }

  function playCelebration(buttonEl, emoji) {
    if (!buttonEl) return;
    buttonEl.classList.add('lanternReactionPulse');
    var burst = document.createElement('span');
    burst.className = 'lanternReactionBurst';
    burst.setAttribute('aria-hidden', 'true');
    burst.textContent = emoji;
    buttonEl.appendChild(burst);
    setTimeout(function () { burst.remove(); }, 600);
    setTimeout(function () { buttonEl.classList.remove('lanternReactionPulse'); }, 400);
  }

  /**
   * display_mode: 'percentages' (Explore — emoji + % only) | 'types_only' (Contribute — types only, no %).
   * opts.counts is raw API shape; only derived percents are written to the DOM.
   */
  function renderReactionBar(opts) {
    var container = opts.container;
    var itemType = opts.item_type;
    var itemId = opts.item_id;
    var counts = opts.counts || {};
    var myReactions = opts.my_reactions || [];
    var characterName = opts.character_name || '';
    var onReact = opts.on_react || function () {};
    var preferredTypes = opts.preferred_types;
    var displayMode = opts.display_mode || 'percentages';
    if (!container || !itemType || !itemId) return;
    var itemCounts = counts[itemId] || {};
    var mySet = {};
    (myReactions || []).forEach(function (t) { mySet[t] = true; });
    var vocab = REACTION_VOCAB;
    if (preferredTypes && Array.isArray(preferredTypes) && preferredTypes.length > 0) {
      var set = {};
      preferredTypes.forEach(function (t) { set[String(t).toLowerCase()] = true; });
      vocab = REACTION_VOCAB.filter(function (r) { return set[r.type]; });
    }
    var wrap = document.createElement('div');
    wrap.className = 'lanternReactionBar';
    wrap.setAttribute('data-item-type', itemType);
    wrap.setAttribute('data-item-id', itemId);
    wrap.setAttribute('data-display-mode', displayMode);

    if (displayMode === 'types_only') {
      if (!vocab.length) {
        var onlyHint = document.createElement('p');
        onlyHint.className = 'lanternReactionEmpty';
        onlyHint.textContent = 'Reactions will appear here after approval.';
        container.appendChild(onlyHint);
        return;
      }
      vocab.forEach(function (r) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'lanternReactionBtn lanternReactionBtn--typesOnly';
        btn.setAttribute('data-reaction-type', r.type);
        btn.setAttribute('data-reaction-emoji', r.emoji);
        btn.setAttribute('aria-label', r.label);
        btn.textContent = r.emoji;
        btn.disabled = true;
        btn.setAttribute('aria-disabled', 'true');
        wrap.appendChild(btn);
      });
      if (opts.contribute_hint !== false) {
        var hint = document.createElement('p');
        hint.className = 'lanternReactionContributeHint';
        hint.textContent = 'Reactions will appear here after approval.';
        container.appendChild(wrap);
        container.appendChild(hint);
        return;
      }
      container.appendChild(wrap);
      return;
    }

    var computed = reactionPercentsFromCounts(itemCounts, vocab);
    if (computed.total <= 0) {
      var status = document.createElement('p');
      status.className = 'lanternReactionStatus';
      status.textContent = 'Community response is still taking shape.';
      container.appendChild(status);
    }

    vocab.forEach(function (r) {
      var pct = computed.percents[r.type] != null ? computed.percents[r.type] : 0;
      var isMine = !!mySet[r.type];
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'lanternReactionBtn' + (isMine ? ' is-mine' : '');
      btn.setAttribute('data-reaction-type', r.type);
      btn.setAttribute('data-reaction-emoji', r.emoji);
      btn.setAttribute('aria-label', r.label + ', ' + pct + ' percent');
      btn.textContent = r.emoji;
      var span = document.createElement('span');
      span.className = 'lanternReactionPct';
      span.textContent = pct + '%';
      btn.appendChild(span);
      if (characterName && !isMine) {
        btn.addEventListener('click', function () {
          if (btn.disabled) return;
          onReact(r.type, r.emoji, btn);
        });
      } else {
        btn.disabled = true;
        btn.setAttribute('aria-disabled', 'true');
      }
      wrap.appendChild(btn);
    });
    container.appendChild(wrap);
  }

  global.LANTERN_REACTIONS = {
    REACTION_VOCAB: REACTION_VOCAB,
    DEFAULT_STYLE: DEFAULT_STYLE,
    getReactionStyle: getReactionStyle,
    getApiBase: getApiBase,
    addReaction: addReaction,
    getCounts: getCounts,
    getMine: getMine,
    getPraisePreferences: getPraisePreferences,
    setPraisePreferences: setPraisePreferences,
    getBreakdown: getBreakdown,
    getNeedEncouragement: getNeedEncouragement,
    getSummary: getSummary,
    getFeatureFlags: getFeatureFlags,
    formatPraiseSummary: formatPraiseSummary,
    REACTION_TYPE_LABELS: REACTION_TYPE_LABELS,
    playCelebration: playCelebration,
    renderReactionBar: renderReactionBar,
    reactionPercentsFromCounts: reactionPercentsFromCounts,
    esc: esc,
    FEATURE_FLAGS: FEATURE_FLAGS
  };
})(typeof window !== 'undefined' ? window : this);
