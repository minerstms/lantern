/**
 * TMS Lantern — ONE ticker: same data pipeline and render as Display.
 * No activity feed, games, or news-specific ticker paths.
 */
(function (global) {
  var TICKER_INIT_DONE = false;
  /* One full loop scrolls translateX 0 → -50% (one duplicated strip). Higher = calmer/readable. */
  var TICKER_SCROLL_DURATION_S = 360;
  var DISPLAY_LEADERBOARD_GAMES = ['Avatar Match', 'Handbook Trivia', 'Local History Trivia', 'Reaction Tap', 'Nugget Click Rush', 'Nugget Hunt'];

  var FALLBACK_TICKER_ITEM = {
    icon: '✨',
    text: '<span class="lanternTickerText">TMS Lantern — News · Spotlights · Community</span>',
    avatarUrl: '',
    avatarEmoji: ''
  };

  function esc(s) {
    return String(s || '').replace(/[&<>"']/g, function (c) {
      return c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;';
    });
  }

  function defaultApiBase() {
    if (typeof global.LANTERN_AVATAR_API !== 'undefined' && String(global.LANTERN_AVATAR_API).trim()) {
      return String(global.LANTERN_AVATAR_API).replace(/\/$/, '');
    }
    return '';
  }

  function callGetDisplaySlides(createRun) {
    var run = createRun ? createRun() : null;
    if (!run || typeof run.getDisplaySlides !== 'function') return Promise.resolve({ ok: false, slides: [] });
    return new Promise(function (resolve) {
      run
        .withSuccessHandler(function (r) {
          resolve(r || { ok: false, slides: [] });
        })
        .withFailureHandler(function () {
          resolve({ ok: false, slides: [] });
        })
        .getDisplaySlides();
    });
  }

  function fetchWorkerLeaderboardForDisplay(base) {
    if (!base) return Promise.resolve([]);
    return Promise.all(
      DISPLAY_LEADERBOARD_GAMES.map(function (gameName) {
        return fetch(base + '/api/leaderboards?period=weekly&game_name=' + encodeURIComponent(gameName) + '&limit=8')
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
    });
    (recognitionList || []).forEach(function (r) {
      if (r.character_name) addName(r.character_name);
    });
    (newsList || []).forEach(function (n) {
      var an = String(n.author_name || (n.meta && n.meta.character_name) || '').trim();
      if (an) addName(an, n.meta && n.meta.avatar);
    });
    if (req.length === 0) return Promise.resolve();
    return LA.getCanonicalAvatarMap(req).then(function (map) {
      (slides || []).forEach(function (s) {
        s.meta = s.meta || {};
        var cn = String(s.meta.character_name || '').trim();
        if (cn && map[cn]) s.meta._canonicalAvatar = map[cn];
      });
      (recognitionList || []).forEach(function (r) {
        var cn = String(r.character_name || '').trim();
        if (cn && map[cn]) r._canonicalAvatar = map[cn];
      });
      (newsList || []).forEach(function (n) {
        n.meta = n.meta || {};
        var an = String(n.author_name || n.meta.character_name || '').trim();
        if (an && map[an]) n.meta._canonicalAvatar = map[an];
      });
    });
  }

  function buildDisplayTickerItems(recognitionList, heroCandidates, newsList) {
    var toB = typeof global.LANTERN_BROADCAST !== 'undefined' && global.LANTERN_BROADCAST.toBroadcastItem ? global.LANTERN_BROADCAST.toBroadcastItem : null;
    var items = [];
    if (toB) {
      (recognitionList || []).forEach(function (r) {
        var b = toB(r, 'recognition');
        items.push({
          icon: b.icon,
          text: '<span class="lanternTickerText">' + esc(b.title) + '</span>' + (b.text ? ' — ' + esc(b.text) : ''),
          avatarUrl: b.avatarUrl || '',
          avatarEmoji: b.avatarEmoji || ''
        });
      });
      (heroCandidates || []).forEach(function (s) {
        var b = toB(s, 'slide');
        items.push({
          icon: b.icon,
          text: '<span class="lanternTickerText">' + esc(b.title) + '</span>',
          avatarUrl: b.avatarUrl || '',
          avatarEmoji: b.avatarEmoji || ''
        });
      });
      (newsList || []).forEach(function (n) {
        var b = toB(n, 'news');
        items.push({
          icon: b.icon,
          text: '<span class="lanternTickerText">' + esc(b.title) + '</span>',
          avatarUrl: b.avatarUrl || '',
          avatarEmoji: b.avatarEmoji || ''
        });
      });
    } else {
      (recognitionList || []).forEach(function (r) {
        var n = String(r.character_name || '').trim() || 'Student';
        var m = String(r.message || '').trim().slice(0, 36);
        if ((r.message || '').length > 36) m += '…';
        var urlFb = r._canonicalAvatar && r._canonicalAvatar.imageUrl ? String(r._canonicalAvatar.imageUrl).trim() : '';
        var emFb = !urlFb && r._canonicalAvatar && r._canonicalAvatar.emoji ? String(r._canonicalAvatar.emoji).trim() : '';
        items.push({ icon: '⭐', text: '<span class="lanternTickerText">' + esc(n) + '</span> — ' + esc(m), avatarUrl: urlFb, avatarEmoji: emFb });
      });
      (heroCandidates || []).forEach(function (s) {
        var title = String(s.title || '').trim().slice(0, 40);
        if ((s.title || '').length > 40) title += '…';
        var urlFb = s.meta && s.meta._canonicalAvatar && s.meta._canonicalAvatar.imageUrl ? String(s.meta._canonicalAvatar.imageUrl).trim() : '';
        var emFb = !urlFb && s.meta && s.meta._canonicalAvatar && s.meta._canonicalAvatar.emoji ? String(s.meta._canonicalAvatar.emoji).trim() : '';
        items.push({ icon: '🏆', text: '<span class="lanternTickerText">' + esc(title) + '</span>', avatarUrl: urlFb, avatarEmoji: emFb });
      });
      (newsList || []).forEach(function (n) {
        var t = String(n.title || '').trim().slice(0, 42);
        if ((n.title || '').length > 42) t += '…';
        var meta = n.meta || {};
        var urlFb = meta._canonicalAvatar && meta._canonicalAvatar.imageUrl ? String(meta._canonicalAvatar.imageUrl).trim() : '';
        var emFb = !urlFb && meta._canonicalAvatar && meta._canonicalAvatar.emoji ? String(meta._canonicalAvatar.emoji).trim() : '';
        items.push({ icon: '📰', text: '<span class="lanternTickerText">' + esc(t) + '</span>', avatarUrl: urlFb, avatarEmoji: emFb });
      });
    }
    if (items.length === 0) items.push(FALLBACK_TICKER_ITEM);
    return items;
  }

  function itemToHtml(it) {
    var avatar = '';
    if (it.avatarUrl && String(it.avatarUrl).trim()) {
      avatar =
        '<img src="' + esc(it.avatarUrl) + '" alt="" class="lanternTickerItemAvatar" onerror="this.style.display=\'none\'">';
    } else if (it.avatarEmoji && String(it.avatarEmoji).trim()) {
      avatar =
        '<span class="lanternTickerItemAvatar lanternTickerItemAvatar--emoji" aria-hidden="true">' +
        esc(String(it.avatarEmoji).trim()) +
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
    if (track) track.style.animationDuration = TICKER_SCROLL_DURATION_S + 's';
    requestAnimationFrame(function () {
      if (!track) return;
      var c = track.querySelectorAll('.lanternTickerCopy');
      if (c.length >= 1 && c[0].scrollWidth) track.style.width = 2 * c[0].scrollWidth + 'px';
    });
  }

  function renderUnifiedFromState(slides, recognitionList, newsList) {
    var heroCandidates = getHeroCandidates(slides || []);
    var items = buildDisplayTickerItems(recognitionList || [], heroCandidates, newsList || []);
    render('lanternTicker', items);
  }

  function fetchDisplayTickerState(createRun, apiBase) {
    var base = apiBase || defaultApiBase();
    return Promise.all([
      callGetDisplaySlides(createRun),
      fetch(base + '/api/recognition/list?limit=50')
        .then(function (r) {
          return r.json();
        })
        .then(function (recRes) {
          return recRes && recRes.ok && recRes.recognition ? recRes.recognition : [];
        })
        .catch(function () {
          return [];
        }),
      fetch(base + '/api/news/approved')
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
        var res = results[0];
        var recognitionList = results[1] || [];
        var newsList = results[2] || [];
        var slides = (res && res.slides) || [];
        recognitionList.forEach(function (r) {
          var msg = String(r.message || '').trim().slice(0, 250);
          if ((r.message || '').length > 250) msg += '…';
          slides.push({
            type: 'teacher_recognition',
            title: String(r.character_name || '').trim() || 'Recognition',
            subtitle: msg || (r.created_by_teacher_name ? 'From ' + r.created_by_teacher_name : ''),
            meta: { character_name: String(r.character_name || '').trim(), avatar: '⭐' },
            created_at: r.created_at || ''
          });
        });
        return fetchWorkerLeaderboardForDisplay(base).then(function (weeklyEntries) {
          if (weeklyEntries && weeklyEntries.length > 0) {
            var arcade = slides.find(function (s) {
              return s.type === 'arcade_leader';
            });
            if (arcade) {
              arcade.meta = arcade.meta || {};
              arcade.meta.weekly = weeklyEntries;
            } else {
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
          }
          return enrichTickerPayloadCanonical(slides, recognitionList, newsList).then(function () {
            if (slides.length === 0) {
              slides = [
                {
                  type: 'fallback',
                  title: 'TMS Lantern',
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
              title: 'TMS Lantern',
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
    fetchDisplayTickerState(createRun, defaultApiBase()).then(function (state) {
      renderUnifiedFromState(state.slides, state.recognitionList, state.newsList);
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
    TICKER_SCROLL_DURATION_S: TICKER_SCROLL_DURATION_S
  };
})(typeof window !== 'undefined' ? window : this);
