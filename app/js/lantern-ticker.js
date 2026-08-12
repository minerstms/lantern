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
  var DISPLAY_LEADERBOARD_GAMES = ['Avatar Match', 'Handbook Trivia', 'Local History Trivia', 'Reaction Tap', 'Nugget Click Rush', 'Nugget Hunt'];

  var FALLBACK_TICKER_ITEM = {
    icon: '✨',
    text: '<span class="lanternTickerText">Lantern — News · Spotlights · Community</span>',
    avatarUrl: '',
    avatarEmoji: ''
  };

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
    var types = ['teacher_pick', 'featured_creation', 'student_news', 'teacher_recognition', 'achievement', 'nugget_milestone', 'thank_you_highlight'];
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
      if (m.character_name) addName(m.character_name, m.avatar);
      if (m.author_avatar_key) addName(m.author_avatar_key, m.avatar);
      if (m.actor_id) addName(m.actor_id, m.avatar);
    });
    (recognitionList || []).forEach(function (r) {
      if (r.character_name) addName(r.character_name);
      if (r.created_by_teacher_id) addName(r.created_by_teacher_id);
    });
    (newsList || []).forEach(function (n) {
      var ak = String(n.author_avatar_key || n.actor_id || n.author_name || (n.meta && n.meta.character_name) || '').trim();
      if (ak) addName(ak, n.meta && n.meta.avatar);
      if (n.author_name) addName(n.author_name, n.meta && n.meta.avatar);
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
        var hit = pick([s.meta.author_avatar_key, s.meta.actor_id, s.meta.character_name]);
        if (hit) s.meta._canonicalAvatar = hit;
      });
      (recognitionList || []).forEach(function (r) {
        var hit = pick([r.created_by_teacher_id, r.character_name]);
        if (hit) r._canonicalAvatar = hit;
      });
      (newsList || []).forEach(function (n) {
        n.meta = n.meta || {};
        var hit = pick([n.author_avatar_key, n.actor_id, n.author_name, n.meta.character_name]);
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
    var emFb = !urlFb && meta._canonicalAvatar && meta._canonicalAvatar.emoji ? String(meta._canonicalAvatar.emoji).trim() : '';
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

  function itemToHtml(it) {
    // Prompt #217 — second icon is always the content author avatar (real image or neutral fallback).
    var avatar = '';
    if (it.avatarUrl && String(it.avatarUrl).trim()) {
      avatar =
        '<img src="' + esc(it.avatarUrl) + '" alt="" class="lanternTickerItemAvatar" onerror="this.style.display=\'none\';this.nextElementSibling&&(this.nextElementSibling.style.display=\'inline-flex\')">' +
        '<span class="lanternTickerItemAvatar lanternTickerItemAvatar--emoji" aria-hidden="true" style="display:none">🌟</span>';
    } else {
      var em = (it.avatarEmoji && String(it.avatarEmoji).trim()) ? String(it.avatarEmoji).trim() : '🌟';
      avatar =
        '<span class="lanternTickerItemAvatar lanternTickerItemAvatar--emoji" aria-hidden="true">' +
        esc(em) +
        '</span>';
    }
    var iconHtml = it.icon || '✨';
    var text = it.text != null && it.text !== '' ? it.text : '';
    return (
      '<span class="lanternTickerItem"><span class="lanternTickerItemIcon">' +
      iconHtml +
      '</span>' +
      avatar +
      '<span class="lanternTickerItemText">' +
      text +
      '</span></span>'
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
    /* Prompt #125 — ONE authoritative production collection:
       Worker /api/recognition/list + /api/news/approved (demo-persona-guard already applied
       server-side) + optional arcade leaderboard meta. Do not merge LANTERN_API localStorage
       slides (seedDemoWorld / demo personas). createRun is retained for call-signature
       compatibility but is not used as a content source. */
    void createRun;
    var forDisplay =
      (typeof document !== 'undefined' &&
        document.body &&
        document.body.classList &&
        document.body.classList.contains('page-marquee-only')) ||
      (typeof location !== 'undefined' && /\/display\.html/i.test(String(location.pathname || '')));
    var recognitionUrl = base + '/api/recognition/list?limit=50' + (forDisplay ? '&for_display=1' : '');
    var newsUrl = base + '/api/news/approved' + (forDisplay ? '?for_display=1' : '');
    return Promise.all([
      fetch(recognitionUrl)
        .then(function (r) {
          return r.json();
        })
        .then(function (recRes) {
          return recRes && recRes.ok && recRes.recognition ? recRes.recognition : [];
        })
        .catch(function () {
          return [];
        }),
      fetch(newsUrl)
        .then(function (r) {
          return r.json();
        })
        .then(function (nr) {
          return nr && nr.ok && nr.news ? nr.news : [];
        })
        .catch(function () {
          return [];
        })
    ])
      .then(function (results) {
        var recognitionList = results[0] || [];
        var newsList = results[1] || [];
        var slides = [];
        /* Merge recognition + news INTO slides once — the single authoritative marquee source. */
        var seenRec = {};
        recognitionList.forEach(function (r) {
          var msg = String(r.message || '').trim().slice(0, 250);
          if ((r.message || '').length > 250) msg += '…';
          var title = String(r.character_name || '').trim() || 'Recognition';
          var subtitle = msg || (r.created_by_teacher_name ? 'From ' + r.created_by_teacher_name : '');
          var key = title.toLowerCase() + '\n' + subtitle.toLowerCase();
          if (seenRec[key]) return;
          seenRec[key] = true;
          slides.push({
            type: 'teacher_recognition',
            title: title,
            subtitle: subtitle,
            meta: { character_name: String(r.character_name || '').trim(), avatar: '⭐' },
            created_at: r.created_at || ''
          });
        });
        var seenNews = {};
        newsList.forEach(function (n) {
          var t = String(n.title || '').trim();
          if (!t || seenNews[t.toLowerCase()]) return;
          seenNews[t.toLowerCase()] = true;
          var author = String(n.author_public_label || n.author_name || (n.meta && n.meta.character_name) || '').trim();
          if (author && !n.author_public_label && global.LanternCards && typeof global.LanternCards.formatExploreAuthorLabel === 'function') {
            author = global.LanternCards.formatExploreAuthorLabel({
              author: author,
              authorRole: n.author_type || n.author_role || ''
            }) || author;
          }
          var avatarKey = String(n.author_avatar_key || n.actor_id || '').trim();
          if (!avatarKey) avatarKey = String(n.author_name || '').trim();
          var newsType = 'news';
          var cat = String(n.category || '').toLowerCase();
          var bodyPrev = String(n.body || '').slice(0, 120);
          if (cat.indexOf('shout') >= 0 || /^Shout-out/i.test(bodyPrev) || /Recognizing:/i.test(bodyPrev)) {
            newsType = 'shout_out';
          }
          slides.push({
            type: 'student_news',
            contentType: newsType,
            title: t,
            subtitle: author ? ((newsType === 'shout_out' ? 'Shout-Out' : 'News') + ' · ' + author) : (newsType === 'shout_out' ? 'Shout-Out' : 'News'),
            image: null,
            actor_name: author,
            meta: {
              character_name: avatarKey,
              actor_id: n.actor_id || null,
              author_avatar_key: avatarKey || null,
              content_type: newsType,
              category: n.category || '',
              avatar: (n.meta && n.meta.avatar) || (newsType === 'shout_out' ? '📣' : '📰'),
              body_preview: bodyPrev
            },
            created_at: n.approved_at || n.created_at || ''
          });
        });
        return fetchWorkerLeaderboardForDisplay(base).then(function (weeklyEntries) {
          if (weeklyEntries && weeklyEntries.length > 0) {
            slides.push({
              type: 'arcade_leader',
              title: 'Arcade Leaders',
              subtitle: 'Best scores this week',
              image: null,
              actor_name: '',
              meta: { daily: [], weekly: weeklyEntries, monthly: [], schoolYear: [] },
              created_at: ''
            });
          }
          return enrichTickerPayloadCanonical(slides, recognitionList, newsList).then(function () {
            if (slides.length === 0) {
              slides = [
                {
                  type: 'fallback',
                  title: 'Lantern',
                  subtitle: 'Celebrating our community',
                  image: null,
                  actor_name: '',
                  meta: {},
                  created_at: ''
                }
              ];
            }
            return { slides: slides, recognitionList: recognitionList, newsList: newsList };
          });
        });
      })
      .catch(function () {
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
