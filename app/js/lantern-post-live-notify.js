/**
 * TMS Lantern — shared “Your post is live” toast when My Creations items go pending → approved/accepted.
 * Single localStorage map (LANTERN_CREATION_STATUS_LAST_V1) for Locker + Explore so transitions aren’t double-toasted.
 */
(function (global) {
  'use strict';

  var LS_CREATION_STATUS_LAST = 'LANTERN_CREATION_STATUS_LAST_V1';
  var LS_ADOPTED = 'LANTERN_ADOPTED_CHARACTER';

  function esc(s) {
    return String(s || '').replace(/[&<>"']/g, function (c) {
      return c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;';
    });
  }

  function rawMyCreationStatus(st) {
    return String(st || '').trim().toLowerCase();
  }

  function getAdoptedFromStorage() {
    try {
      var raw = localStorage.getItem(LS_ADOPTED);
      if (!raw) return null;
      var obj = JSON.parse(raw);
      if (!obj || !obj.name) return null;
      if (obj.isTest && obj.expires_at && new Date(obj.expires_at) <= new Date()) {
        try {
          localStorage.removeItem(LS_ADOPTED);
        } catch (e) {}
        return null;
      }
      return obj;
    } catch (e) {
      return null;
    }
  }

  function readCreationStatusStore() {
    try {
      var raw = localStorage.getItem(LS_CREATION_STATUS_LAST);
      if (!raw) return {};
      var o = JSON.parse(raw);
      return o && typeof o === 'object' ? o : {};
    } catch (e) {
      return {};
    }
  }

  function writeCreationStatusStore(all) {
    try {
      localStorage.setItem(LS_CREATION_STATUS_LAST, JSON.stringify(all));
    } catch (e) {}
  }

  function pollContributionChoicesPlain(item) {
    var ch = item && item.choices;
    if (!ch) return '';
    if (typeof ch === 'string') return ch;
    if (!Array.isArray(ch)) return '';
    return ch
      .map(function (c) {
        if (typeof c === 'string') return c;
        if (c && typeof c === 'object') return String(c.label || c.text || c.value || '').trim();
        return '';
      })
      .filter(Boolean)
      .join(' ');
  }

  function missionSubmissionPreviewText(s) {
    var t = (s.submission_type || '').trim();
    var c = String(s.submission_content || '').trim();
    if (t === 'text' && c) {
      try {
        var o = JSON.parse(c);
        if (o && typeof o === 'object') return String(o.text || o.body || o.caption || '').trim().slice(0, 240);
      } catch (e) {}
    }
    if (c && t !== 'image_url' && t !== 'video') return c.slice(0, 240);
    return '';
  }

  function normalizePollContributionItem(raw) {
    var item = raw || {};
    return {
      contentType: 'poll_contribution',
      canonicalId: 'poll_contribution:' + String(item.id || ''),
      status: item.status || '',
      raw: item,
    };
  }

  function normalizeMissionSubmissionItem(raw) {
    var s = raw || {};
    return {
      contentType: 'mission_submission',
      canonicalId: 'mission_submission:' + String(s.id || ''),
      status: s.status || '',
      raw: s,
    };
  }

  function normalizeNewsSubmissionItem(raw) {
    var n = raw || {};
    return {
      contentType: 'news_submission',
      canonicalId: 'news_submission:' + String(n.id || ''),
      status: n.status || '',
      raw: n,
    };
  }

  /**
   * Same three endpoints as profile fetchMyCreationsBundle (character + news author resolution).
   * @param {string} apiBase
   * @param {{ character_id?: string, name?: string } | null} [adoptedOpt] — if omitted, uses Locker adopted from storage (Explore).
   */
  function fetchPostLiveBundle(apiBase, adoptedOpt) {
    var adopted = adoptedOpt != null ? adoptedOpt : getAdoptedFromStorage();
    var characterNameForApi = adopted && String(adopted.character_id || adopted.name || '').trim();
    var newsAuthorMine = adopted && String(adopted.name || adopted.character_id || '').trim();
    if (!apiBase || !characterNameForApi) return Promise.resolve([]);

    var urlPoll = apiBase + '/api/polls/contributions?character_name=' + encodeURIComponent(characterNameForApi);
    var urlMiss = apiBase + '/api/missions/submissions/character?character_name=' + encodeURIComponent(characterNameForApi);
    var urlNews = apiBase + '/api/news/mine?author_name=' + encodeURIComponent(newsAuthorMine);

    var pPoll = fetch(urlPoll)
      .then(function (r) {
        return r.json();
      })
      .then(function (res) {
        return (res && res.contributions) || [];
      })
      .catch(function () {
        return [];
      });
    var pMiss = fetch(urlMiss)
      .then(function (r) {
        return r.json();
      })
      .then(function (res) {
        return res && res.ok && res.submissions ? res.submissions : [];
      })
      .catch(function () {
        return [];
      });
    var pNews = fetch(urlNews)
      .then(function (r) {
        return r.json();
      })
      .then(function (res) {
        return res && res.ok && res.news ? res.news : [];
      })
      .catch(function () {
        return [];
      });

    return Promise.all([pPoll, pMiss, pNews]).then(function (arr) {
      var out = [];
      (arr[0] || []).forEach(function (item) {
        if (item && item.id) out.push(normalizePollContributionItem(item));
      });
      (arr[1] || []).forEach(function (s) {
        if (s && s.id) out.push(normalizeMissionSubmissionItem(s));
      });
      (arr[2] || []).forEach(function (n) {
        if (n && n.id) out.push(normalizeNewsSubmissionItem(n));
      });
      return out;
    });
  }

  /**
   * @param {Array<{ canonicalId: string, status: string }>} list
   * @param {HTMLElement | null} toastEl
   * @param {string} [studentKey] — required for Locker verify / pilot paths; if omitted, derived from storage adopted only
   */
  function notifyFromBundle(list, toastEl, studentKey) {
    if (!list || !list.length) return;
    var elToast = toastEl || (typeof document !== 'undefined' ? document.getElementById('toast') : null);
    if (!elToast) return;

    var sk = (studentKey != null && String(studentKey).trim() !== '' ? String(studentKey).trim() : '') || '';
    if (!sk) {
      var a = getAdoptedFromStorage();
      if (!a) return;
      sk = String(a.character_id || a.name || '').trim();
    }
    if (!sk) return;

    var all = readCreationStatusStore();
    var bucket = all[sk] && typeof all[sk] === 'object' ? all[sk] : {};
    var transitions = [];
    var i;
    for (i = 0; i < list.length; i++) {
      var entry = list[i];
      if (!entry || !entry.canonicalId) continue;
      var curr = rawMyCreationStatus(entry.status);
      var prevRaw = bucket[entry.canonicalId];
      var prev = prevRaw != null && prevRaw !== undefined ? String(prevRaw).trim().toLowerCase() : '';
      if (prev === 'pending' && (curr === 'approved' || curr === 'accepted')) {
        transitions.push(entry);
      }
    }
    for (i = 0; i < list.length; i++) {
      var e = list[i];
      if (e && e.canonicalId) {
        bucket[e.canonicalId] = rawMyCreationStatus(e.status);
      }
    }
    all[sk] = bucket;
    writeCreationStatusStore(all);
    if (!transitions.length) return;

    var title = transitions.length === 1 ? 'Your post is live' : 'Your posts are live';
    var sub = 'Nice work — everyone can see it now.';
    elToast.classList.add('toast--postLive');
    elToast.innerHTML =
      '<div class="toastPostLiveInner"><div class="toastPostLiveTitle">' +
      esc(title) +
      '</div><div class="toastPostLiveSub">' +
      esc(sub) +
      '</div></div>';
    elToast.style.display = 'block';
    clearTimeout(elToast._lanternPostLiveT);
    elToast._lanternPostLiveT = setTimeout(function () {
      elToast.style.display = 'none';
      elToast.classList.remove('toast--postLive');
      elToast.innerHTML = '';
    }, 4200);
  }

  /**
   * Explore / Home: fetch same bundle as Locker, then apply shared transition logic.
   */
  function fetchAndMaybeNotify(apiBase, toastEl) {
    if (!apiBase) return Promise.resolve();
    return fetchPostLiveBundle(apiBase, null).then(function (list) {
      notifyFromBundle(list, toastEl, null);
    });
  }

  global.LanternPostLiveNotify = {
    LS_CREATION_STATUS_LAST: LS_CREATION_STATUS_LAST,
    notifyFromBundle: notifyFromBundle,
    fetchPostLiveBundle: fetchPostLiveBundle,
    fetchAndMaybeNotify: fetchAndMaybeNotify,
  };
})(typeof window !== 'undefined' ? window : this);
