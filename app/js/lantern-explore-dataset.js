/**
 * TMS Lantern — Explore unified dataset (normalization only).
 * Hybrid model: sectioned UI unchanged; single taxonomy + shape for future rail consumption.
 * Does not render; does not replace refresh() until wired explicitly.
 */
(function (global) {
  'use strict';

  /** Canonical content kinds for Explore public surface. */
  var CONTENT_KIND = {
    POST: 'post',
    NEWS: 'news',
    MISSION_SUBMISSION: 'mission_submission',
    POLL: 'poll',
    ACTIVITY_EVENT: 'activity_event',
    LEARNING_LINK: 'learning_link',
  };

  /** API / origin labels (where raw rows came from). */
  var SOURCE = {
    POSTS: 'posts',
    NEWS: 'news',
    MISSIONS_APPROVED: 'missions_approved',
    POLLS: 'polls',
    ACTIVITY: 'activity',
    LEARNING: 'learning',
  };

  /**
   * Same entries as explore.html Mini Games rail (learning_link only).
   * Kept in sync for dataset completeness until a shared constant exists.
   */
  var LEARNING_LINK_SEEDS = [
    { id: 'mini_games_hub', title: 'Games hub', description: 'Arcade, trivia, and weekly scores.', href: 'games.html' },
    { id: 'learning_school_survival', title: 'School Survival', description: 'Handbook scenarios — tap answers, see why. TMS Edition.', href: 'school-survival.html' },
    { id: 'learning_trinidad_co', title: 'Know Your Town', description: 'Trinidad, CO — picture clues, name the place.', href: 'school-survival.html?pack=trinidad-co' },
    { id: 'mini_games_avatar', title: 'Avatar Match', description: 'Match pairs and climb the board.', href: 'games.html' },
    { id: 'mini_games_trivia', title: 'Handbook Trivia', description: 'Quick quiz from the handbook.', href: 'games.html' },
    { id: 'mini_games_history', title: 'Local History Trivia', description: 'Town trivia — picture clues.', href: 'games.html' },
    { id: 'mini_games_reaction', title: 'Reaction Tap', description: 'Fast taps — lowest time wins.', href: 'games.html' },
    { id: 'mini_games_clickrush', title: 'Nugget Click Rush', description: 'Click streak challenge.', href: 'games.html' },
  ];

  function str(v) {
    return v == null ? '' : String(v).trim();
  }

  /**
   * Stable global dedupe key: kind + raw primary id (no collisions across kinds).
   */
  function computeDedupeKey(kind, rawId) {
    if (!kind) return '';
    var id = str(rawId);
    if (!id) return '';
    return kind + ':' + id;
  }

  /**
   * Normalize one raw row into the Explore contract.
   * @param {*} rawItem - shape depends on source
   * @param {string} source - SOURCE.* value
   * @returns {NormalizedExploreItem|null}
   */
  function normalizeExploreItem(rawItem, source) {
    if (!rawItem || typeof rawItem !== 'object') return null;

    if (source === SOURCE.POSTS) {
      var pid = str(rawItem.id);
      if (!pid) return null;
      var kind = CONTENT_KIND.POST;
      return {
        id: computeDedupeKey(kind, pid),
        kind: kind,
        created_at: str(rawItem.created_at),
        author_name: str(rawItem.display_name) || str(rawItem.character_name) || str(rawItem.actor_name),
        author_type: str(rawItem.actor_type) || 'student',
        image_url: str(rawItem.image_url),
        video_url: str(rawItem.video_url),
        link_url: str(rawItem.link_url),
        url: str(rawItem.url),
        source: SOURCE.POSTS,
        dedupe_key: computeDedupeKey(kind, pid),
        raw: rawItem,
      };
    }

    if (source === SOURCE.NEWS) {
      var nid = str(rawItem.id);
      if (!nid) return null;
      var nkind = CONTENT_KIND.NEWS;
      return {
        id: computeDedupeKey(nkind, nid),
        kind: nkind,
        created_at: str(rawItem.approved_at) || str(rawItem.created_at) || str(rawItem.updated_at),
        author_name: str(rawItem.author_name),
        author_type: str(rawItem.author_type) || 'student',
        image_url: str(rawItem.image_url),
        video_url: str(rawItem.video_url),
        link_url: str(rawItem.link_url),
        url: str(rawItem.link_url) || '',
        source: SOURCE.NEWS,
        dedupe_key: computeDedupeKey(nkind, nid),
        raw: rawItem,
      };
    }

    if (source === SOURCE.MISSIONS_APPROVED) {
      var sid = str(rawItem.id);
      if (!sid) return null;
      var mkind = CONTENT_KIND.MISSION_SUBMISSION;
      var imgUrl =
        str(rawItem.image_url) ||
        (str(rawItem.submission_type) === 'image_url' && str(rawItem.submission_content) ? str(rawItem.submission_content) : '');
      var vidUrl =
        str(rawItem.video_url) ||
        (str(rawItem.submission_type) === 'video' && str(rawItem.submission_content) ? str(rawItem.submission_content) : '');
      var linkFromContent =
        str(rawItem.submission_type) === 'link' && /^https?:\/\//i.test(str(rawItem.submission_content))
          ? str(rawItem.submission_content).slice(0, 2000)
          : '';
      return {
        id: computeDedupeKey(mkind, sid),
        kind: mkind,
        created_at: str(rawItem.reviewed_at) || str(rawItem.created_at),
        author_name: str(rawItem.character_name),
        author_type: 'student',
        image_url: imgUrl,
        video_url: vidUrl,
        link_url: linkFromContent,
        url: imgUrl || vidUrl || linkFromContent,
        source: SOURCE.MISSIONS_APPROVED,
        dedupe_key: computeDedupeKey(mkind, sid),
        raw: rawItem,
      };
    }

    if (source === SOURCE.POLLS) {
      var pollId = str(rawItem.id);
      if (!pollId) return null;
      var pkind = CONTENT_KIND.POLL;
      return {
        id: computeDedupeKey(pkind, pollId),
        kind: pkind,
        created_at: str(rawItem.created_at) || str(rawItem.updated_at),
        author_name: str(rawItem.created_by_name) || str(rawItem.teacher_name) || '',
        author_type: str(rawItem.created_by_type) || 'teacher',
        image_url: str(rawItem.image_url),
        video_url: '',
        link_url: '',
        url: '',
        source: SOURCE.POLLS,
        dedupe_key: computeDedupeKey(pkind, pollId),
        raw: rawItem,
      };
    }

    if (source === SOURCE.ACTIVITY) {
      var eid = rawItem.id != null ? str(rawItem.id) : rawItem.event_id != null ? str(rawItem.event_id) : '';
      if (!eid) return null;
      var ekind = CONTENT_KIND.ACTIVITY_EVENT;
      return {
        id: computeDedupeKey(ekind, eid),
        kind: ekind,
        created_at: str(rawItem.created_at) || str(rawItem.timestamp),
        author_name: str(rawItem.actor_name),
        author_type: str(rawItem.actor_type) || 'student',
        image_url: '',
        video_url: '',
        link_url: '',
        url: '',
        source: SOURCE.ACTIVITY,
        dedupe_key: computeDedupeKey(ekind, eid),
        raw: rawItem,
      };
    }

    if (source === SOURCE.LEARNING) {
      var lid = str(rawItem.id);
      if (!lid) return null;
      var lkind = CONTENT_KIND.LEARNING_LINK;
      var href = str(rawItem.href);
      return {
        id: computeDedupeKey(lkind, lid),
        kind: lkind,
        created_at: '2000-01-01T00:00:00.000Z',
        author_name: '',
        author_type: 'system',
        image_url: '',
        video_url: '',
        link_url: href,
        url: href,
        source: SOURCE.LEARNING,
        dedupe_key: computeDedupeKey(lkind, lid),
        raw: rawItem,
      };
    }

    return null;
  }

  function createRunSafe() {
    return global.LANTERN_API && typeof global.LANTERN_API.createRun === 'function' ? global.LANTERN_API.createRun() : null;
  }

  function callGetExploreFeed() {
    var run = createRunSafe();
    if (!run) return Promise.resolve({ ok: false, feed: [] });
    return new Promise(function (resolve) {
      run
        .withSuccessHandler(function (r) {
          resolve(r || { ok: false, feed: [] });
        })
        .withFailureHandler(function () {
          resolve({ ok: false, feed: [] });
        })
        .getExploreFeed();
    });
  }

  function callGetApprovedNews() {
    var base = apiBase();
    if (base !== null) {
      return fetch(base + '/api/news/approved', { credentials: 'include' })
        .then(function (r) {
          return r.json();
        })
        .then(function (data) {
          console.log('NEWS DATA:', data);
          var news = (data && data.news) || [];
          return { ok: !!(data && data.ok), news: news };
        })
        .catch(function () {
          return { ok: false, news: [] };
        });
    }
    var run = createRunSafe();
    if (!run) return Promise.resolve({ ok: false, news: [] });
    return new Promise(function (resolve) {
      run
        .withSuccessHandler(function (data) {
          console.log('NEWS DATA:', data);
          var news = (data && data.news) || [];
          resolve({ ok: !!(data && data.ok), news: news });
        })
        .withFailureHandler(function () {
          resolve({ ok: false, news: [] });
        })
        .getApprovedNews();
    });
  }

  function callGetActivityEvents(limit) {
    var run = createRunSafe();
    if (!run) return Promise.resolve({ ok: false, events: [] });
    return new Promise(function (resolve) {
      run
        .withSuccessHandler(function (r) {
          resolve(r || { ok: false, events: [] });
        })
        .withFailureHandler(function () {
          resolve({ ok: false, events: [] });
        })
        .getActivityEvents({ limit: limit || 40 });
    });
  }

  function approvedNewsPromise() {
    if (global.LANTERN_REACTIONS && typeof global.LANTERN_REACTIONS.getFeatureFlags === 'function') {
      return global.LANTERN_REACTIONS.getFeatureFlags().then(function () {
        return callGetApprovedNews();
      });
    }
    return callGetApprovedNews();
  }

  function apiBase() {
    if (typeof global.LANTERN_AVATAR_API === 'undefined' || global.LANTERN_AVATAR_API === null) return null;
    return String(global.LANTERN_AVATAR_API).replace(/\/$/, '');
  }

  function fetchApprovedMissionSubmissions(limit) {
    var base = apiBase();
    if (base === null) return Promise.resolve([]);
    return fetch(base + '/api/missions/submissions/approved?limit=' + encodeURIComponent(String(limit || 30)))
      .then(function (r) {
        return r.json();
      })
      .then(function (res) {
        if (res && Array.isArray(res.submissions)) return res.submissions;
        if (res && res.submissions) return res.submissions;
        return [];
      })
      .catch(function () {
        return [];
      });
  }

  function fetchPollsList() {
    var base = apiBase();
    if (base === null) return Promise.resolve([]);
    return fetch(base + '/api/polls')
      .then(function (r) {
        return r.json();
      })
      .then(function (res) {
        return res && res.ok && res.polls ? res.polls : [];
      })
      .catch(function () {
        return [];
      });
  }

  /**
   * Fetch all Explore sources (same endpoints as explore.html refresh), normalize, dedupe.
   * @param {Object} [opts]
   * @param {number} [opts.missionLimit=30]
   * @param {number} [opts.activityLimit=12]
   * @returns {Promise<ExploreDatasetResult>}
   */
  function buildExploreDataset(opts) {
    opts = opts || {};
    var missionLimit = opts.missionLimit != null ? opts.missionLimit : 30;
    var activityLimit = opts.activityLimit != null ? opts.activityLimit : 12;

    return Promise.all([
      callGetExploreFeed(),
      fetchApprovedMissionSubmissions(missionLimit),
      approvedNewsPromise(),
      callGetActivityEvents(activityLimit),
      fetchPollsList(),
    ]).then(function (arr) {
      var exploreRes = arr[0] || {};
      var submissions = arr[1] || [];
      var newsRes = arr[2] || {};
      var activityRes = arr[3] || {};
      var polls = arr[4] || [];

      var postsFeed = (exploreRes && exploreRes.feed) || [];
      var newsList = (newsRes && newsRes.news) || [];
      var events = (activityRes && activityRes.events) || [];

      var bucket = [];

      postsFeed.forEach(function (p) {
        var n = normalizeExploreItem(p, SOURCE.POSTS);
        if (n) bucket.push(n);
      });
      submissions.forEach(function (s) {
        var m = normalizeExploreItem(s, SOURCE.MISSIONS_APPROVED);
        if (m) bucket.push(m);
      });
      newsList.forEach(function (article) {
        var nw = normalizeExploreItem(article, SOURCE.NEWS);
        if (nw) bucket.push(nw);
      });
      polls.forEach(function (poll) {
        var pl = normalizeExploreItem(poll, SOURCE.POLLS);
        if (pl) bucket.push(pl);
      });
      events.forEach(function (evt) {
        var ev = normalizeExploreItem(evt, SOURCE.ACTIVITY);
        if (ev) bucket.push(ev);
      });
      LEARNING_LINK_SEEDS.forEach(function (seed) {
        var lr = normalizeExploreItem(seed, SOURCE.LEARNING);
        if (lr) bucket.push(lr);
      });

      var seen = Object.create(null);
      var items = [];
      var duplicatesDropped = 0;
      bucket.forEach(function (item) {
        var key = item.dedupe_key || item.id;
        if (!key) return;
        if (seen[key]) {
          duplicatesDropped++;
          return;
        }
        seen[key] = true;
        items.push(item);
      });

      var byKind = Object.create(null);
      Object.keys(CONTENT_KIND).forEach(function (k) {
        byKind[CONTENT_KIND[k]] = [];
      });
      items.forEach(function (it) {
        if (byKind[it.kind]) byKind[it.kind].push(it);
      });

      return {
        items: items,
        byKind: byKind,
        dedupe_keys: Object.keys(seen),
        duplicates_dropped: duplicatesDropped,
        meta: {
          posts_feed_count: postsFeed.length,
          missions_approved_count: submissions.length,
          news_count: newsList.length,
          polls_count: polls.length,
          activity_count: events.length,
          learning_count: LEARNING_LINK_SEEDS.length,
        },
      };
    });
  }

  /**
   * @typedef {Object} NormalizedExploreItem
   * @property {string} id - Globally unique id (kind:rawId)
   * @property {string} kind - CONTENT_KIND value
   * @property {string} created_at - ISO or best-effort sort key
   * @property {string} author_name
   * @property {string} author_type
   * @property {string} image_url
   * @property {string} video_url
   * @property {string} link_url
   * @property {string} url - primary URL fallback (posts / missions / learning)
   * @property {string} source - SOURCE.* origin
   * @property {string} dedupe_key - same as id when raw id present
   * @property {Object} raw - original row for current renderers
   */

  /**
   * @typedef {Object} ExploreDatasetResult
   * @property {NormalizedExploreItem[]} items
   * @property {Object.<string, NormalizedExploreItem[]>} byKind
   * @property {string[]} dedupe_keys
   * @property {number} duplicates_dropped
   * @property {Object} meta
   */

  global.LANTERN_EXPLORE_DATASET = {
    CONTENT_KIND: CONTENT_KIND,
    SOURCE: SOURCE,
    computeDedupeKey: computeDedupeKey,
    normalizeExploreItem: normalizeExploreItem,
    buildExploreDataset: buildExploreDataset,
  };
})(typeof window !== 'undefined' ? window : this);
