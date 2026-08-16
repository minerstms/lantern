/**
 * Lantern — ONE ticker: same data pipeline and render as Display.
 * No activity feed, games, or news-specific ticker paths.
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
  var DISPLAY_LEADERBOARD_GAMES = ['Avatar Match', 'Lantern Live Trivia', 'Handbook Trivia', 'Local History Trivia', 'Reaction Tap', 'Nugget Click Rush', 'Memory Match', 'Nugget Hunt'];

  var FALLBACK_TICKER_ITEM = {
    icon: '✨',
    text: '<span class="lanternTickerText">Lantern — News · Spotlights · Community</span>',
    avatarUrl: '',
    avatarEmoji: '',
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

  function formatTickerCopy(parts) {
    var type = String((parts && parts.type) || '').trim();
    var name = String((parts && parts.primary_name) || '').trim();
    var object = String((parts && parts.object_title) || '').trim();
    var label = String((parts && parts.label) || '').trim() || tickerTypeLabel(type) || 'Lantern';
    if (object && name && object === name) return label + ' — ' + name;
    if (label && object && name) return label + ': ' + object + ' — ' + name;
    if (label && object) return label + ': ' + object;
    if (label && name) return label + ' — ' + name;
    return String((parts && parts.fallback) || '').trim() || label || 'Lantern';
  }

  function parseCompactTickerCopy(publicText) {
    var full = String(publicText || '').trim();
    var withAuthor = full.match(/^([^:]+):\s*(.*?)\s+[—–]\s+(.+)$/);
    if (withAuthor) {
      return { typeLabel: String(withAuthor[1] || '').trim(), subject: String(withAuthor[2] || '').trim(), author: String(withAuthor[3] || '').trim() };
    }
    var typeAuthor = full.match(/^([^:]+)\s+[—–]\s+(.+)$/);
    if (typeAuthor && typeAuthor[1].indexOf(':') === -1) {
      return { typeLabel: String(typeAuthor[1] || '').trim(), subject: '', author: String(typeAuthor[2] || '').trim() };
    }
    var typeSubject = full.match(/^([^:]+):\s*(.+)$/);
    if (typeSubject) {
      return { typeLabel: String(typeSubject[1] || '').trim(), subject: String(typeSubject[2] || '').trim(), author: '' };
    }
    return { typeLabel: '', subject: '', author: '' };
  }

  function tickerNameAndRest(publicText, primaryName) {
    var parsed = parseCompactTickerCopy(publicText);
    var name = String(primaryName || '').trim() || parsed.author;
    if (parsed.typeLabel) {
      return { name: name, rest: parsed.subject ? parsed.typeLabel + ': ' + parsed.subject : parsed.typeLabel };
    }
    var full = String(publicText || '').trim();
    if (name && full.indexOf(name) === 0) {
      return { name: name, rest: full.slice(name.length) };
    }
    return { name: '', rest: full };
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
      if (m.author_avatar_key) addName(m.author_avatar_key);
      if (m.actor_id) addName(m.actor_id);
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
        var hit = pick([s.meta.author_avatar_key, s.meta.actor_id]);
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

  /**
   * Prompt #111 / #125 — ONE marquee source: unified Worker-backed slides only.
   * Recognition + approved news are merged into `slides` once in fetchDisplayTickerState.
   * LANTERN_API.getDisplaySlides (localStorage seed/demo world) is intentionally NOT a source.
   * Accepts either full slides or a pre-filtered hero list; getHeroCandidates filters either way.
   */
  function slideToTickerItem(s) {
    var type = String((s && s.type) || '');
    var titleRaw = String((s && s.title) || '').trim();
    var subtitle = String((s && s.subtitle) || '').trim();
    var meta = (s && s.meta) || {};
    var urlFb = meta._canonicalAvatar && meta._canonicalAvatar.imageUrl ? String(meta._canonicalAvatar.imageUrl).trim() : '';
    var emFb = '';
    var marqueeType = String(meta.marquee_type || '').trim();
    var canonicalIcon = String(meta.ticker_icon || '').trim() || tickerIconForType(marqueeType);

    /* Prompt #252 — compact Type: Subject — Author. Do not narrate sentences. */
    if (marqueeType) {
      var parsed = parseCompactTickerCopy(titleRaw);
      var typeLabel = String(meta.ticker_type_label || '').trim() || parsed.typeLabel || tickerTypeLabel(marqueeType);
      var subject = String(meta.object_title || '').trim() || parsed.subject;
      var author = String(meta.public_display_name || '').trim() || parsed.author;
      if (subject && author && subject === author) subject = '';
      var full = formatTickerCopy({
        type: marqueeType,
        primary_name: author,
        object_title: subject,
        label: typeLabel
      });
      var rest = typeLabel && subject ? typeLabel + ': ' + subject : typeLabel;
      return {
        icon: canonicalIcon || '✨',
        text: '<span class="lanternTickerText">' + esc(full) + '</span>',
        typeLabel: typeLabel,
        subject: subject,
        author: author,
        primaryName: author,
        rest: rest,
        ariaLabel: full,
        href: safeTickerHref(meta.destination),
        avatarUrl: urlFb,
        avatarEmoji: emFb,
        hasPerson: true,
        system: false
      };
    }

    var icon =
      type === 'teacher_recognition'
        ? '⭐'
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
                if (global.LanternCards && typeof global.LanternCards.contentTypeTickerIcon === 'function') {
                  return global.LanternCards.contentTypeTickerIcon(slideType) || '📰';
                }
                if (slideType === 'shout_out' || slideType === 'shoutout') return '📣';
                if (slideType === 'poll') return '📊';
                return '📰';
              })()
            : '✨';

    if (type === 'teacher_recognition') {
      var name = titleRaw || 'Student';
      var msg = subtitle.slice(0, 36);
      if (subtitle.length > 36) msg += '…';
      return {
        icon: icon,
        text: '<span class="lanternTickerText">' + esc(name) + '</span>' + (msg ? ' — ' + esc(msg) : ''),
        avatarUrl: urlFb,
        avatarEmoji: emFb
      };
    }

    var title = titleRaw.slice(0, type === 'student_news' ? 42 : 40);
    if (titleRaw.length > (type === 'student_news' ? 42 : 40)) title += '…';

    /* Community-highlight slides (e.g. nugget_milestone) must always name the student they
       describe — a bare "25 Nuggets" line is indistinguishable from the viewer's own wallet
       balance shown elsewhere on the same page. This ticker is a school-wide celebration feed,
       never the authenticated viewer's balance; LanternWallet.fetchMyBalance() is the only
       authoritative wallet source. */
    if (type === 'nugget_milestone' || type === 'achievement' || type === 'thank_you_highlight') {
      var attributed = subtitle ? esc(subtitle) + ' — ' + esc(title) : esc(title);
      return {
        icon: icon,
        text: '<span class="lanternTickerText">' + attributed + '</span>',
        avatarUrl: urlFb,
        avatarEmoji: emFb
      };
    }

    if (type === 'student_news') {
      return {
        icon: icon,
        text: '<span class="lanternTickerText">' + esc(title) + '</span>',
        avatarUrl: urlFb,
        avatarEmoji: emFb
      };
    }

    var line = subtitle ? esc(subtitle) + ' — ' + esc(title) : esc(title);
    return {
      icon: icon,
      text: '<span class="lanternTickerText">' + line + '</span>',
      avatarUrl: urlFb,
      avatarEmoji: emFb
    };
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
    if (global.LanternCards && typeof global.LanternCards.getDefaultAvatarImageUrl === 'function') {
      var cardFb = String(global.LanternCards.getDefaultAvatarImageUrl() || '').trim();
      if (cardFb) return cardFb;
    }
    if (global.LanternAvatar && typeof global.LanternAvatar.svgDefaultAvatarDataUri === 'function') {
      var av = String(global.LanternAvatar.svgDefaultAvatarDataUri() || '').trim();
      if (av) return av;
    }
    return lastResortSilhouetteDataUri();
  }

  function itemToHtml(it) {
    // Prompt #217/#161/#167 — person chip is the current approved avatar, else #149 placeholder.
    // System/empty-ticker fallback has no human actor — do not invent a silhouette.
    var isSystem = !!(it && it.system);
    var hasPerson = !isSystem && (!it || it.hasPerson !== false);
    var approved = it && it.avatarUrl && String(it.avatarUrl).trim() ? String(it.avatarUrl).trim() : '';
    var fb = canonicalPersonFallbackUrl();
    var src = hasPerson ? approved || fb : '';
    var avatar = '';
    if (src) {
      avatar =
        '<img src="' +
        esc(src) +
        '" alt="" class="lanternTickerItemAvatar"' +
        (fb ? ' data-lc-av-def="' + esc(fb) + '"' : '') +
        ' onerror="var el=this;var d=el.getAttribute(\'data-lc-av-def\');if(d&&el.getAttribute(\'src\')!==d){el.src=d;return;}el.style.display=\'none\';">';
    }
    var iconHtml = (it && it.icon) || '✨';
    var body = '';
    if (it && (it.typeLabel || it.subject || it.author || it.primaryName || it.rest)) {
      var typeLabel = String((it && it.typeLabel) || '').trim();
      var subject = String((it && it.subject) || '').trim();
      var author = String((it && (it.author || it.primaryName)) || '').trim();
      var typeHtml = typeLabel ? '<span class="lanternTickerItemType">' + esc(typeLabel) + ':</span>' : '';
      var subjectHtml = subject ? '<span class="lanternTickerItemSubject">' + esc(subject) + '</span>' : '';
      var sepHtml = author && (typeLabel || subject) ? '<span class="lanternTickerItemSep"> — </span>' : '';
      var nameHtml = author ? '<span class="lanternTickerItemName">' + esc(author) + '</span>' : '';
      var inner = (typeHtml ? typeHtml + (subjectHtml ? ' ' : '') : '') + subjectHtml + sepHtml + nameHtml;
      if (!inner) {
        var restHtml = it.rest ? '<span class="lanternTickerItemRest">' + esc(it.rest) + '</span>' : '';
        inner = nameHtml + restHtml;
      }
      var label = String(it.ariaLabel || formatTickerCopy({
        label: typeLabel,
        primary_name: author,
        object_title: subject
      })).trim();
      if (it.href) {
        body =
          '<a class="lanternTickerItemLink" href="' +
          esc(it.href) +
          '"' +
          (label ? ' aria-label="' + esc(label) + '"' : '') +
          '>' +
          inner +
          '</a>';
      } else {
        body = '<span class="lanternTickerItemText">' + inner + '</span>';
      }
    } else {
      var text = it && it.text != null && it.text !== '' ? it.text : '';
      body = '<span class="lanternTickerItemText">' + text + '</span>';
    }
    return (
      '<span class="lanternTickerItem"><span class="lanternTickerItemIcon">' +
      iconHtml +
      '</span>' +
      avatar +
      body +
      '</span>'
    );
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

  function render(containerId, items) {
    var container = document.getElementById(containerId);
    if (!container) return;
    if (!items || !items.length) items = [FALLBACK_TICKER_ITEM];
    var itemHtml = items.map(itemToHtml).join('');
    var copyHtml = '<div class="lanternTickerCopy">' + itemHtml + '</div>';
    var bar = container.querySelector('.lanternTicker');
    var track = container.querySelector('.lanternTickerTrack');
    if (!bar || !track) {
      container.innerHTML =
        '<div class="lanternTicker"><div class="lanternTickerWrap"><div class="lanternTickerTrack">' +
        copyHtml +
        copyHtml +
        '</div></div></div>';
      bar = container.querySelector('.lanternTicker');
      track = container.querySelector('.lanternTickerTrack');
    } else {
      track.innerHTML = copyHtml + copyHtml;
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
    looksLikeSystemLogTickerCopy: looksLikeSystemLogTickerCopy,
    safeTickerHref: safeTickerHref
  };

  global.LanternTicker = {
    render: render,
    fetchDisplayTickerState: fetchDisplayTickerState,
    renderUnifiedFromState: renderUnifiedFromState,
    buildDisplayTickerItems: buildDisplayTickerItems,
    getHeroCandidates: getHeroCandidates,
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
