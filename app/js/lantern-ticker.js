/**
 * Lantern — ONE ticker: same data pipeline and render as Display.
 * No activity feed, games, or news-specific ticker paths.
 * Prompt #256 — header/ticker visual contract: docs/LANTERN_HEADER_CONTRACT.md
 */
(function (global) {
  var TICKER_INIT_DONE = false;
  /**
   * Prompt #110 — SPEED, not duration, is canonical. One full loop scrolls translateX 0 → -50%
   * (one duplicated strip); the ACTUAL animation-duration is computed per render as
   * (single-copy width in px) / (canonical px/sec), so every page that renders #lanternTicker
   * moves at the same physical rate regardless of content length, viewport width, or container
   * geometry — a shared fixed duration (the old `360s` constant) could not guarantee that.
   * Mirrors worker/lantern-settings.js MARQUEE_SPEED_DEFAULT_PX_PER_SEC — this is the one shared
   * client-side fallback used when the setting can't be loaded (network/API failure); no page
   * chooses its own fallback.
   */
  var TICKER_SPEED_FALLBACK_PX_PER_SEC = 15;
  var tickerSpeedPxPerSecond = TICKER_SPEED_FALLBACK_PX_PER_SEC;
  var tickerResizeWired = false;
  var tickerActiveTrackEl = null;
  var tickerResizeTimer = null;
  var tickerLastViewportWidth = 0;
  var DISPLAY_LEADERBOARD_GAMES = ['Avatar Match', 'Lantern Live Trivia', 'Handbook Trivia', 'Local History Trivia', 'Reaction Tap', 'Nugget Click Rush', 'Memory Match', 'Nugget Hunt', 'Stack Lab', 'Minecart Switch', 'Orbit Lock'];

  var FALLBACK_TICKER_ITEM = {
    icon: '✨',
    typeLabel: 'Lantern',
    subject: 'News · Spotlights · Community',
    author: '',
    primaryName: '',
    rest: 'Lantern',
    ariaLabel: 'Lantern — News · Spotlights · Community',
    avatarUrl: '',
    avatarEmoji: '',
    authorAvatarKey: '',
    system: true,
    hasPerson: false
  };

  var TICKER_ICONS = {
    mission_created: '🎯',
    mission_completed: '🎯',
    poll_created: '📊',
    shout_out: '📣',
    recognition: '📣',
    news: '📰',
    news_photo: '📸',
    news_good_news: '⭐',
    leaderboard_entry: '🏆'
  };

  var TICKER_TYPE_LABELS = {
    mission_created: 'Mission',
    mission_completed: 'Mission',
    poll_created: 'Poll',
    shout_out: 'Shout-Out',
    recognition: 'Shout-Out',
    news: 'Post',
    news_photo: 'Photo',
    news_good_news: 'Good News',
    leaderboard_entry: 'Leaderboard'
  };

  function tickerTypeLabel(type) {
    return TICKER_TYPE_LABELS[String(type || '').trim()] || '';
  }

  function tickerIconForType(type) {
    return TICKER_ICONS[String(type || '').trim()] || '';
  }

  function normalizeTickerWhitespace(s) {
    return String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  }

  function formatTickerCopy(parts) {
    var type = normalizeTickerWhitespace((parts && parts.type) || '');
    var name = normalizeTickerWhitespace((parts && parts.primary_name) || '');
    var object = normalizeTickerWhitespace((parts && parts.object_title) || '');
    var label = normalizeTickerWhitespace((parts && parts.label) || '') || tickerTypeLabel(type) || 'Lantern';
    if (object && name && object === name) return label + ' — ' + name;
    if (label && object && name) return label + ': ' + object + ' — ' + name;
    if (label && object) return label + ': ' + object;
    if (label && name) return label + ' — ' + name;
    return normalizeTickerWhitespace((parts && parts.fallback) || '') || label || 'Lantern';
  }

  function parseCompactTickerCopy(publicText) {
    var full = normalizeTickerWhitespace(publicText);
    var withAuthor = full.match(/^([^:]+):\s*(.*?)\s+[—–]\s+(.+)$/);
    if (withAuthor) {
      return { typeLabel: normalizeTickerWhitespace(withAuthor[1]), subject: normalizeTickerWhitespace(withAuthor[2]), author: normalizeTickerWhitespace(withAuthor[3]) };
    }
    var typeAuthor = full.match(/^([^:]+)\s+[—–]\s+(.+)$/);
    if (typeAuthor && typeAuthor[1].indexOf(':') === -1) {
      return { typeLabel: normalizeTickerWhitespace(typeAuthor[1]), subject: '', author: normalizeTickerWhitespace(typeAuthor[2]) };
    }
    var typeSubject = full.match(/^([^:]+):\s*(.+)$/);
    if (typeSubject) {
      return { typeLabel: normalizeTickerWhitespace(typeSubject[1]), subject: normalizeTickerWhitespace(typeSubject[2]), author: '' };
    }
    return { typeLabel: '', subject: '', author: '' };
  }

  function tickerNameAndRest(publicText, primaryName) {
    var parsed = parseCompactTickerCopy(publicText);
    var name = normalizeTickerWhitespace(primaryName) || parsed.author;
    if (parsed.typeLabel) {
      return { name: name, rest: parsed.subject ? parsed.typeLabel + ': ' + parsed.subject : parsed.typeLabel };
    }
    var full = normalizeTickerWhitespace(publicText);
    if (name && full.indexOf(name) === 0) {
      return { name: name, rest: full.slice(name.length) };
    }
    return { name: '', rest: full };
  }

  /**
   * Prompt #235 — avatar chip follows the item SUBJECT identity, never the viewer.
   * Shout-Out / recognition use the recognized person's durable key only (no author fallback,
   * no display-name guess). Other types use subject_avatar_key or the named author/player.
   */
  function tickerFaceLookupKeys(meta) {
    var m = meta || {};
    var subject = String(m.subject_avatar_key || '').trim();
    var author = String(m.author_avatar_key || m.actor_id || '').trim();
    var t = String(m.marquee_type || '').trim();
    if (t === 'shout_out' || t === 'recognition') return subject ? [subject] : [];
    if (subject && author && subject !== author) return [subject, author];
    if (subject) return [subject];
    if (author) return [author];
    return [];
  }

  function looksLikeSystemLogTickerCopy(text) {
    var t = String(text || '');
    return (
      /Mission Created\s*—/.test(t) ||
      /Mission Completed\s*—/.test(t) ||
      /Poll Created\s*—/.test(t) ||
      /New mission from Teacher:/.test(t) ||
      /New poll from Teacher:/.test(t) ||
      /Submission approved:/.test(t) ||
      /A student created/.test(t) ||
      /created a (mission|poll)/.test(t) ||
      /\breached the\b/.test(t) ||
      /\breached #\d+/.test(t) ||
      /got a Shout-Out from/.test(t)
    );
  }

  function safeTickerHref(href) {
    var h = String(href || '').trim();
    if (!h) return '';
    if (/^[a-z0-9][a-z0-9._-]*\.html(?:[?#][^\s]*)?$/i.test(h)) return h;
    return '';
  }

  function esc(s) {
    return String(s || '').replace(/[&<>"']/g, function (c) {
      return c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;';
    });
  }

  function defaultApiBase() {
    /* Empty string = same-origin /api (production Pages). Only null/undefined means unavailable. */
    if (typeof global.LANTERN_AVATAR_API === 'undefined' || global.LANTERN_AVATAR_API === null) {
      return '';
    }
    return String(global.LANTERN_AVATAR_API).replace(/\/$/, '');
  }

  function callGetDisplaySlides(createRun) {
    /* Prompt #125 — production marquee must NOT consume LANTERN_API.getDisplaySlides.
       That path reads browser localStorage mock/seeded demo-world content and is not an
       authoritative Worker source. Kept as a no-op stub so older callers fail closed to
       empty slides. */
    return Promise.resolve({ ok: true, slides: [] });
  }

  function fetchWorkerLeaderboardForDisplay(base) {
    /* base may be '' (same-origin). Only skip when API is truly unset (callers pass ''). */
    var prefix = base == null ? '' : String(base);
    return Promise.all(
      DISPLAY_LEADERBOARD_GAMES.map(function (gameName) {
        return fetch(prefix + '/api/leaderboards?period=weekly&game_name=' + encodeURIComponent(gameName) + '&limit=8')
          .then(function (r) {
            return r.json();
          })
          .catch(function () {
            return { ok: false, entries: [] };
          });
      })
    ).then(function (responses) {
      var weekly = [];
      responses.forEach(function (res) {
        if (res && res.ok && res.entries && res.entries.length) weekly = weekly.concat(res.entries);
      });
      return weekly;
    });
  }

  function getHeroCandidates(slides) {
    var types = ['teacher_pick', 'featured_creation', 'student_news', 'teacher_recognition', 'achievement', 'nugget_milestone', 'thank_you_highlight', 'poll', 'arcade_leader'];
    return (slides || []).filter(function (s) {
      return types.indexOf(s.type) !== -1;
    });
  }

  /**
   * One avatar per account: attach LanternAvatar._canonicalAvatar on slides.meta, recognition rows, and news.meta.
   * Uses LanternAvatar.getCanonicalAvatarMap only — never snapshot avatar_image URLs.
   * Prompt #256 — lookup durable keys only. Never guess from public_display_name.
   */
  function enrichTickerPayloadCanonical(slides, recognitionList, newsList) {
    var LA = global.LanternAvatar;
    if (!LA || typeof LA.getCanonicalAvatarMap !== 'function') return Promise.resolve();
    var req = [];
    function addName(nm, leg) {
      nm = String(nm || '').trim();
      if (!nm) return;
      var i;
      for (i = 0; i < req.length; i++) {
        if (req[i].characterName === nm) return;
      }
      var emoji = leg != null && String(leg).trim() ? String(leg).trim() : LA.getLegacyEmojiForCharacter ? LA.getLegacyEmojiForCharacter(nm) : '';
      req.push({ characterName: nm, legacyEmoji: emoji });
    }
    (slides || []).forEach(function (s) {
      var m = s.meta || {};
      tickerFaceLookupKeys(m).forEach(function (k) { addName(k); });
    });
    (recognitionList || []).forEach(function (r) {
      if (r.author_avatar_key) addName(r.author_avatar_key);
      if (r.created_by_teacher_id) addName(r.created_by_teacher_id);
    });
    (newsList || []).forEach(function (n) {
      var ak = String(n.author_avatar_key || n.actor_id || '').trim();
      if (ak) addName(ak);
    });
    if (req.length === 0) return Promise.resolve();
    return LA.getCanonicalAvatarMap(req).then(function (map) {
      function pick(keys) {
        var i;
        for (i = 0; i < keys.length; i++) {
          var k = String(keys[i] || '').trim();
          if (k && map[k] && map[k].imageUrl && String(map[k].imageUrl).trim()) return map[k];
        }
        for (i = 0; i < keys.length; i++) {
          var k2 = String(keys[i] || '').trim();
          if (k2 && map[k2]) return map[k2];
        }
        return null;
      }
      (slides || []).forEach(function (s) {
        s.meta = s.meta || {};
        var hit = pick(tickerFaceLookupKeys(s.meta));
        if (hit) s.meta._canonicalAvatar = hit;
      });
      (recognitionList || []).forEach(function (r) {
        var hit = pick([r.author_avatar_key, r.created_by_teacher_id]);
        if (hit) r._canonicalAvatar = hit;
      });
      (newsList || []).forEach(function (n) {
        n.meta = n.meta || {};
        var hit = pick([n.author_avatar_key, n.actor_id]);
        if (hit) n.meta._canonicalAvatar = hit;
      });
    });
  }

  function canonicalTickerItem(fields) {
    var typeLabel = normalizeTickerWhitespace((fields && fields.typeLabel) || '');
    var subject = normalizeTickerWhitespace((fields && fields.subject) || '');
    var author = normalizeTickerWhitespace((fields && fields.author) || '');
    if (subject && author && subject === author) subject = '';
    var aria = formatTickerCopy({
      label: typeLabel,
      primary_name: author,
      object_title: subject,
      fallback: fields && fields.ariaLabel
    });
    return {
      icon: (fields && fields.icon) || '✨',
      typeLabel: typeLabel,
      subject: subject,
      author: author,
      primaryName: author,
      rest: typeLabel && subject ? typeLabel + ': ' + subject : typeLabel,
      ariaLabel: aria,
      href: safeTickerHref(fields && fields.href),
      avatarUrl: fields && fields.avatarUrl ? String(fields.avatarUrl).trim() : '',
      avatarEmoji: '',
      authorAvatarKey: fields && fields.authorAvatarKey ? String(fields.authorAvatarKey).trim() : '',
      hasPerson: fields && fields.hasPerson === false ? false : true,
      system: !!(fields && fields.system)
    };
  }

  /**
   * Prompt #111 / #125 — ONE marquee source: unified Worker-backed slides only.
   * Recognition + approved news are merged into `slides` once in fetchDisplayTickerState.
   * LANTERN_API.getDisplaySlides (localStorage seed/demo world) is intentionally NOT a source.
   * Accepts either full slides or a pre-filtered hero list; getHeroCandidates filters either way.
   * Prompt #256 — every slide becomes the same structural item (icon + avatar + copy).
   */
  function slideToTickerItem(s) {
    var type = String((s && s.type) || '');
    var titleRaw = normalizeTickerWhitespace((s && s.title) || '');
    var subtitle = normalizeTickerWhitespace((s && s.subtitle) || '');
    var meta = (s && s.meta) || {};
    var urlFb = meta._canonicalAvatar && meta._canonicalAvatar.imageUrl ? String(meta._canonicalAvatar.imageUrl).trim() : '';
    var marqueeType = String(meta.marquee_type || '').trim();
    var canonicalIcon = String(meta.ticker_icon || '').trim() || tickerIconForType(marqueeType);
    var faceKeys = tickerFaceLookupKeys(meta);
    var authorKey = faceKeys.length ? faceKeys[0] : '';

    if (marqueeType) {
      var parsed = parseCompactTickerCopy(titleRaw);
      var typeLabel = normalizeTickerWhitespace(meta.ticker_type_label || '') || parsed.typeLabel || tickerTypeLabel(marqueeType);
      var subject = normalizeTickerWhitespace(meta.object_title || '') || parsed.subject;
      var author = normalizeTickerWhitespace(meta.public_display_name || '') || parsed.author;
      return canonicalTickerItem({
        icon: canonicalIcon || '✨',
        typeLabel: typeLabel,
        subject: subject,
        author: author,
        href: meta.destination,
        avatarUrl: urlFb,
        authorAvatarKey: authorKey,
        hasPerson: true,
        system: false
      });
    }

    var icon =
      type === 'teacher_recognition'
        ? '📣'
        : type === 'teacher_pick' || type === 'featured_creation' || type === 'achievement'
          ? '🏆'
          : type === 'student_news' || type === 'news' || type === 'shout_out' || type === 'poll'
            ? (function () {
                var slideType = type === 'student_news' ? String((s && s.contentType) || meta.content_type || meta.news_type || '').toLowerCase() : type;
                if (!slideType && type === 'student_news') {
                  var bodyPrev = String(meta.body_preview || '').trim();
                  var cat = String(meta.category || '').toLowerCase();
                  if (cat.indexOf('shout') >= 0 || /^Shout-out/i.test(bodyPrev) || /Recognizing:/i.test(bodyPrev)) {
                    slideType = 'shout_out';
                  } else if (cat.indexOf('poll') >= 0) {
                    slideType = 'poll';
                  } else {
                    slideType = 'news';
                  }
                }
                if (slideType === 'shout_out' || slideType === 'shoutout' || slideType === 'recognition') return '📣';
                if (slideType === 'poll') return '📊';
                if (slideType === 'news_photo' || slideType === 'photo') return '📸';
                if (slideType === 'news_good_news' || slideType === 'good_news') return '⭐';
                if (global.LanternCards && typeof global.LanternCards.contentTypeTickerIcon === 'function') {
                  return global.LanternCards.contentTypeTickerIcon(slideType) || '📰';
                }
                return '📰';
              })()
            : '✨';

    if (type === 'teacher_recognition') {
      return canonicalTickerItem({
        icon: icon,
        typeLabel: 'Shout-Out',
        subject: subtitle,
        author: titleRaw || 'Student',
        avatarUrl: urlFb,
        authorAvatarKey: authorKey,
        href: meta.destination
      });
    }

    if (type === 'nugget_milestone' || type === 'achievement' || type === 'thank_you_highlight') {
      return canonicalTickerItem({
        icon: icon,
        typeLabel: type === 'thank_you_highlight' ? 'Shout-Out' : 'Good News',
        subject: titleRaw,
        author: subtitle,
        avatarUrl: urlFb,
        authorAvatarKey: authorKey,
        href: meta.destination
      });
    }

    if (type === 'student_news') {
      var newsKind = String((s && s.contentType) || meta.content_type || meta.news_type || 'news').toLowerCase();
      var newsLabel =
        newsKind === 'shout_out' || newsKind === 'shoutout' || newsKind === 'recognition'
          ? 'Shout-Out'
          : newsKind === 'poll'
            ? 'Poll'
            : newsKind === 'news_photo' || newsKind === 'photo'
              ? 'Photo'
              : newsKind === 'news_good_news' || newsKind === 'good_news'
                ? 'Good News'
                : 'Post';
      return canonicalTickerItem({
        icon: icon,
        typeLabel: newsLabel,
        subject: titleRaw,
        author: normalizeTickerWhitespace(meta.public_display_name || ''),
        avatarUrl: urlFb,
        authorAvatarKey: authorKey,
        href: meta.destination
      });
    }

    return canonicalTickerItem({
      icon: icon || '✨',
      typeLabel: tickerTypeLabel(type) || 'Lantern',
      subject: titleRaw,
      author: subtitle || normalizeTickerWhitespace(meta.public_display_name || ''),
      avatarUrl: urlFb,
      authorAvatarKey: authorKey,
      href: meta.destination
    });
  }

  function buildDisplayTickerItems(slides) {
    var items = [];
    getHeroCandidates(slides || []).forEach(function (s) {
      items.push(slideToTickerItem(s));
    });
    if (items.length === 0) items.push(FALLBACK_TICKER_ITEM);
    return items;
  }

  function lastResortSilhouetteDataUri() {
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#2a3a52"/><circle cx="32" cy="26" r="12" fill="rgba(255,255,255,.35)"/><ellipse cx="32" cy="52" rx="18" ry="14" fill="rgba(255,255,255,.38)"/></svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  function canonicalPersonFallbackUrl() {
    /* Prompt #239 — static T fallback. Prompt #256 — never an R2/media URL that can 403. */
    if (global.LanternAvatar && typeof global.LanternAvatar.canonicalFallbackAvatarUrl === 'function') {
      var av = String(global.LanternAvatar.canonicalFallbackAvatarUrl() || '').trim();
      if (av) return av;
    }
    if (global.LanternCards && typeof global.LanternCards.getDefaultAvatarImageUrl === 'function') {
      var card = String(global.LanternCards.getDefaultAvatarImageUrl() || '').trim();
      if (card && card.indexOf('/api/media/') < 0) return card;
    }
    return '/assets/fallback-avatar.png';
  }

  function tickerAvatarHtml(it) {
    var approved = it && it.avatarUrl && String(it.avatarUrl).trim() ? String(it.avatarUrl).trim() : '';
    var fb = canonicalPersonFallbackUrl();
    var src = approved || fb;
    var key = it && it.authorAvatarKey ? String(it.authorAvatarKey).trim() : '';
    return (
      '<span class="lanternTickerAvatar" data-ticker-avatar="1"' +
      (key ? ' data-ticker-avatar-key="' + esc(key) + '"' : '') +
      ' aria-hidden="true">' +
      '<img src="' +
      esc(src) +
      '" alt="" class="lanternTickerItemAvatar"' +
      (fb ? ' data-lc-av-def="' + esc(fb) + '"' : '') +
      ' onerror="var el=this;var d=el.getAttribute(\'data-lc-av-def\');if(d&&el.getAttribute(\'src\')!==d){el.src=d;}el.style.display=\'\';">' +
      '</span>'
    );
  }

  function tickerCopyInnerHtml(it) {
    var typeLabel = normalizeTickerWhitespace((it && it.typeLabel) || '');
    var subject = normalizeTickerWhitespace((it && it.subject) || '');
    var author = normalizeTickerWhitespace((it && (it.author || it.primaryName)) || '');
    var parts = [];
    if (typeLabel) {
      parts.push(
        '<span class="lanternTickerItemLead"><span class="lanternTickerItemType">' +
          esc(typeLabel) +
          '</span><span class="lanternTickerItemColon">:</span></span>'
      );
    }
    if (subject) parts.push('<span class="lanternTickerItemSubject">' + esc(subject) + '</span>');
    if (author && (typeLabel || subject)) parts.push('<span class="lanternTickerItemDash" aria-hidden="true">—</span>');
    if (author) parts.push('<span class="lanternTickerItemAuthor lanternTickerItemName">' + esc(author) + '</span>');
    if (parts.length) return parts.join('');
    var rest = normalizeTickerWhitespace((it && it.rest) || '');
    if (rest) return '<span class="lanternTickerItemRest">' + esc(rest) + '</span>';
    return '<span class="lanternTickerItemRest">Lantern</span>';
  }

  function itemToHtml(it) {
    var avatar = tickerAvatarHtml(it);
    var iconHtml = (it && it.icon) || '✨';
    var label = String(
      (it && it.ariaLabel) ||
        formatTickerCopy({
          label: (it && it.typeLabel) || '',
          primary_name: (it && (it.author || it.primaryName)) || '',
          object_title: (it && it.subject) || ''
        })
    ).trim();
    var inner = tickerCopyInnerHtml(it);
    var body;
    if (it && it.href) {
      body =
        '<a class="lanternTickerItemLink lanternTickerItemCopy" href="' +
        esc(it.href) +
        '"' +
        (label ? ' aria-label="' + esc(label) + '"' : '') +
        '>' +
        inner +
        '</a>';
    } else {
      body = '<span class="lanternTickerItemText lanternTickerItemCopy">' + inner + '</span>';
    }
    return (
      '<span class="lanternTickerItem">' +
      '<span class="lanternTickerItemIcon" aria-hidden="true">' +
      iconHtml +
      '</span>' +
      avatar +
      body +
      '</span>'
    );
  }

  /**
   * Prompt #256 — if avatar hydration stays async after render, update EVERY cloned copy.
   * Never target a single getElementById / querySelector match.
   */
  function applyResolvedAvatarToAllCopies(root, authorKey, src) {
    if (!root || !authorKey || !src) return 0;
    var key = String(authorKey).trim();
    var url = String(src).trim();
    if (!key || !url) return 0;
    var slots = root.querySelectorAll('[data-ticker-avatar-key]');
    var n = 0;
    var i;
    for (i = 0; i < slots.length; i++) {
      if (slots[i].getAttribute('data-ticker-avatar-key') !== key) continue;
      var img = slots[i].querySelector('img.lanternTickerItemAvatar');
      if (!img) continue;
      img.src = url;
      n += 1;
    }
    return n;
  }

  /**
   * Pure — distance (one copy's width, since one full loop is 0 → -50% of a 2x-width track,
   * i.e. exactly one copy width of travel) ÷ canonical px/sec = seconds. Exported for tests.
   * Guards: non-positive/unmeasured width keeps the ticker static-ish (1s, effectively no
   * meaningful scroll) rather than dividing by zero or producing NaN/negative durations; a
   * non-positive speed falls back to the shared constant rather than silently freezing forever.
   */
  function computeTickerDurationSeconds(widthPx, speedPxPerSec) {
    var speed = speedPxPerSec > 0 ? speedPxPerSec : TICKER_SPEED_FALLBACK_PX_PER_SEC;
    var width = widthPx > 0 ? widthPx : 0;
    if (width <= 0) return 1;
    var seconds = width / speed;
    return seconds > 0.5 ? seconds : 0.5;
  }

  /** Measures the live single-copy width and applies width/duration using the canonical speed. */
  function applyTickerDuration(track) {
    if (!track) return;
    var c = track.querySelectorAll('.lanternTickerCopy');
    if (!c.length || !c[0].scrollWidth) return;
    var singleWidth = c[0].scrollWidth;
    track.style.width = 2 * singleWidth + 'px';
    track.style.animationDuration = computeTickerDurationSeconds(singleWidth, tickerSpeedPxPerSecond) + 's';
  }

  function scheduleTickerResizeRecalc() {
    if (tickerResizeTimer) clearTimeout(tickerResizeTimer);
    tickerResizeTimer = setTimeout(function () {
      tickerResizeTimer = null;
      if (window.innerWidth === tickerLastViewportWidth) return;
      tickerLastViewportWidth = window.innerWidth;
      if (tickerActiveTrackEl && document.body.contains(tickerActiveTrackEl)) {
        applyTickerDuration(tickerActiveTrackEl);
      }
    }, 200);
  }

  /** Registered once per page load (guarded) so repeated render() calls never stack listeners. */
  function wireTickerResizeOnce() {
    if (tickerResizeWired) return;
    tickerResizeWired = true;
    tickerLastViewportWidth = window.innerWidth;
    window.addEventListener('resize', scheduleTickerResizeRecalc);
  }

  function fetchTickerSpeed(apiBase) {
    var base = apiBase || defaultApiBase();
    return fetch(base + '/api/settings/marquee-speed')
      .then(function (r) {
        return r.json();
      })
      .then(function (res) {
        var n = res && res.ok ? Number(res.px_per_second) : NaN;
        if (isFinite(n) && n > 0) tickerSpeedPxPerSecond = n;
      })
      .catch(function () {
        // Network/API failure — keep the one shared fallback constant; never per-page guessing.
      });
  }

  function renderTickerCopiesHtml(itemHtml) {
    return (
      '<div class="lanternTickerCopy" data-ticker-copy="primary">' +
      itemHtml +
      '</div>' +
      '<div class="lanternTickerCopy" data-ticker-copy="clone" aria-hidden="true" inert>' +
      itemHtml +
      '</div>'
    );
  }

  function render(containerId, items) {
    var container = document.getElementById(containerId);
    if (!container) return;
    if (!items || !items.length) items = [FALLBACK_TICKER_ITEM];
    var itemHtml = items.map(itemToHtml).join('');
    var copiesHtml = renderTickerCopiesHtml(itemHtml);
    var bar = container.querySelector('.lanternTicker');
    var track = container.querySelector('.lanternTickerTrack');
    if (!bar || !track) {
      container.innerHTML =
        '<div class="lanternTicker"><div class="lanternTickerWrap"><div class="lanternTickerTrack">' +
        copiesHtml +
        '</div></div></div>';
      bar = container.querySelector('.lanternTicker');
      track = container.querySelector('.lanternTickerTrack');
    } else {
      track.innerHTML = copiesHtml;
    }
    if (bar) bar.style.display = '';
    container.style.display = '';
    tickerActiveTrackEl = track;
    wireTickerResizeOnce();
    requestAnimationFrame(function () {
      applyTickerDuration(track);
    });
  }

  function renderUnifiedFromState(slides) {
    /* Prompt #111: marquee DOM is fed only from the unified slides array. recognitionList /
       newsList remain available on the lantern-ticker-display-data event for Display's page
       rotator — they are not a second marquee source. */
    var items = buildDisplayTickerItems(slides || []);
    render('lanternTicker', items);
  }

  function fetchDisplayTickerState(createRun, apiBase) {
    var base = apiBase || defaultApiBase();
    /* Prompt #111/#125/#137/#146 — ONE marquee source: Worker /api/marquee/events.
       Fail closed: if that endpoint is unavailable or not ok, show no community content.
       Do NOT fall back to /api/recognition/list or /api/news/approved (those can diverge
       from canonical eligibility). LANTERN_API.getDisplaySlides is not a source. */
    void createRun;
    var forDisplay =
      (typeof document !== 'undefined' &&
        document.body &&
        document.body.classList &&
        document.body.classList.contains('page-marquee-only')) ||
      (typeof location !== 'undefined' && /\/display\.html/i.test(String(location.pathname || '')));
    var marqueeUrl = base + '/api/marquee/events?limit=40' + (forDisplay ? '&for_display=1' : '');

    function emptySafeState() {
      return {
        slides: [
          {
            type: 'fallback',
            title: 'Lantern',
            subtitle: 'Celebrating our community',
            image: null,
            actor_name: '',
            meta: {},
            created_at: ''
          }
        ],
        recognitionList: [],
        newsList: []
      };
    }

    return fetch(marqueeUrl, { credentials: 'include', cache: 'no-store' })
      .then(function (r) {
        return r.json();
      })
      .then(function (mr) {
        if (!mr || mr.ok !== true) return emptySafeState();
        var slides = mr.slides && mr.slides.length ? mr.slides : [];
        if (!slides.length) return emptySafeState();
        return enrichTickerPayloadCanonical(slides, [], []).then(function () {
          return { slides: slides, recognitionList: [], newsList: [] };
        });
      })
      .catch(function () {
        return emptySafeState();
      });
  }

  function init() {
    if (TICKER_INIT_DONE) return;
    if (!document.getElementById('lanternTicker')) return;
    TICKER_INIT_DONE = true;
    var createRun = global.LANTERN_API && global.LANTERN_API.createRun ? global.LANTERN_API.createRun : null;
    var base = defaultApiBase();
    // Load the canonical speed alongside content so the very first render already uses it
    // (rather than fallback → re-render once the setting arrives).
    Promise.all([fetchDisplayTickerState(createRun, base), fetchTickerSpeed(base)]).then(function (results) {
      var state = results[0];
      renderUnifiedFromState(state.slides);
      try {
        document.dispatchEvent(
          new CustomEvent('lantern-ticker-display-data', {
            detail: {
              slides: state.slides,
              recognitionList: state.recognitionList,
              newsList: state.newsList
            }
          })
        );
      } catch (e) {}
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  global.LanternTickerContract = {
    TICKER_ICONS: TICKER_ICONS,
    TICKER_TYPE_LABELS: TICKER_TYPE_LABELS,
    tickerIconForType: tickerIconForType,
    tickerTypeLabel: tickerTypeLabel,
    formatTickerCopy: formatTickerCopy,
    parseCompactTickerCopy: parseCompactTickerCopy,
    tickerNameAndRest: tickerNameAndRest,
    tickerFaceLookupKeys: tickerFaceLookupKeys,
    looksLikeSystemLogTickerCopy: looksLikeSystemLogTickerCopy,
    safeTickerHref: safeTickerHref,
    normalizeTickerWhitespace: normalizeTickerWhitespace
  };

  global.LanternTicker = {
    render: render,
    fetchDisplayTickerState: fetchDisplayTickerState,
    renderUnifiedFromState: renderUnifiedFromState,
    buildDisplayTickerItems: buildDisplayTickerItems,
    getHeroCandidates: getHeroCandidates,
    itemToHtml: itemToHtml,
    tickerAvatarHtml: tickerAvatarHtml,
    applyResolvedAvatarToAllCopies: applyResolvedAvatarToAllCopies,
    canonicalPersonFallbackUrl: canonicalPersonFallbackUrl,
    normalizeTickerWhitespace: normalizeTickerWhitespace,
    FALLBACK_TICKER_ITEM: FALLBACK_TICKER_ITEM,
    computeTickerDurationSeconds: computeTickerDurationSeconds,
    applyTickerDuration: applyTickerDuration,
    fetchTickerSpeed: fetchTickerSpeed,
    TICKER_SPEED_FALLBACK_PX_PER_SEC: TICKER_SPEED_FALLBACK_PX_PER_SEC,
    getTickerSpeedPxPerSecond: function () {
      return tickerSpeedPxPerSecond;
    },
    /**
     * Public: overrides the in-memory speed and immediately re-applies it to the currently
     * rendered track (if any) — used by the Admin marquee editor for instant slider preview
     * without waiting on a save round-trip. Does not persist anything by itself.
     */
    setTickerSpeedPxPerSecond: function (v) {
      var n = Number(v);
      if (!isFinite(n) || n <= 0) return;
      tickerSpeedPxPerSecond = n;
      if (tickerActiveTrackEl && document.body.contains(tickerActiveTrackEl)) {
        applyTickerDuration(tickerActiveTrackEl);
      }
    }
  };
})(typeof window !== 'undefined' ? window : this);
