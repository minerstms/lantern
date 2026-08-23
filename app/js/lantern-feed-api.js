/**
 * Lantern ONE FEED — API client (same-origin /api/feed).
 */
(function (global) {
  'use strict';

  function apiBase() {
    var a = global.LANTERN_AVATAR_API;
    return a != null && a !== '' ? String(a).replace(/\/$/, '') : '';
  }

  function url(path, query) {
    var base = apiBase();
    var u = (base || '') + path;
    if (query) {
      var qs = Object.keys(query)
        .filter(function (k) { return query[k] != null && query[k] !== ''; })
        .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(query[k]); })
        .join('&');
      if (qs) u += (u.indexOf('?') >= 0 ? '&' : '?') + qs;
    }
    return u;
  }

  function fetchJson(path, opts) {
    opts = opts || {};
    var init = {
      method: opts.method || 'GET',
      credentials: opts.credentials != null ? opts.credentials : 'include',
      headers: opts.headers || {},
    };
    if (opts.body != null) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(opts.body);
    }
    return global.fetch(url(path), init).then(function (r) {
      return r.text().then(function (t) {
        try { return JSON.parse(t || '{}'); } catch (e) { return { ok: false, error: 'invalid_json' }; }
      });
    }).catch(function () { return { ok: false, error: 'network' }; });
  }

  function viewerName() {
    try {
      var auth = global.LanternAuth || global.LanternPilotAuth;
      if (auth && typeof auth.sessionEconomyKey === 'function') {
        var k = auth.sessionEconomyKey();
        if (k) return k;
      }
      var me = global.LANTERN_PILOT_ME;
      if (me && me.economy_character_name) return String(me.economy_character_name);
      if (me && me.student_character_name) return String(me.student_character_name);
      if (me && me.username) return String(me.username);
    } catch (e) {}
    return '';
  }

  function isTeacherRole() {
    try {
      var me = global.LANTERN_PILOT_ME;
      var r = me && me.role ? String(me.role).toLowerCase() : '';
      return r === 'teacher' || r === 'staff' || r === 'admin';
    } catch (e) { return false; }
  }

  var FEED_FILTERS = [
    { id: 'all', label: 'All' },
    { id: 'news', label: 'News' },
    { id: 'mission', label: 'Missions' },
    { id: 'poll', label: 'Polls' },
    { id: 'shout_out', label: 'Shout-Outs' },
    { id: 'photo', label: 'Photos' },
    { id: 'video', label: 'Videos' },
    { id: 'article', label: 'Articles' },
  ];

  var REACTIONS = [
    { type: 'clap', label: 'Clap', icon: '👏' },
    { type: 'star', label: 'Star', icon: '⭐' },
    { type: 'celebrate', label: 'Celebrate', icon: '🎉' },
    { type: 'heart', label: 'Heart', icon: '❤️' },
    { type: 'fire', label: 'Fire', icon: '🔥' },
    { type: 'lightbulb', label: 'Lightbulb', icon: '💡' },
  ];

  global.LANTERN_FEED = {
    FEED_FILTERS: FEED_FILTERS,
    REACTIONS: REACTIONS,
    viewerName: viewerName,
    isTeacherRole: isTeacherRole,
    getFeed: function (params) {
      var q = Object.assign({}, params || {});
      var vn = viewerName();
      if (vn) q.viewer = vn;
      return fetchJson('/api/feed?' + Object.keys(q).map(function (k) {
        return encodeURIComponent(k) + '=' + encodeURIComponent(q[k]);
      }).join('&'), { credentials: q.public ? 'omit' : 'include' });
    },
    getSlideshow: function (limit) {
      return fetchJson('/api/feed/slideshow?limit=' + (limit || 30));
    },
    getMine: function () { return fetchJson('/api/feed/mine'); },
    getRevision: function (id) {
      return fetchJson('/api/feed/revision/' + encodeURIComponent(id));
    },
    getLockerPersonalFeed: function (params) {
      var q = Object.assign({}, params || {});
      return fetchJson(
        '/api/locker/personal-feed?' +
          Object.keys(q)
            .map(function (k) {
              return encodeURIComponent(k) + '=' + encodeURIComponent(q[k]);
            })
            .join('&'),
        { credentials: 'include' }
      );
    },
    getReview: function (status) { return fetchJson('/api/feed/review?status=' + encodeURIComponent(status || 'submitted')); },
    create: function (body) { return fetchJson('/api/feed/create', { method: 'POST', body: body }); },
    update: function (body) { return fetchJson('/api/feed/update', { method: 'POST', body: body }); },
    submit: function (id) { return fetchJson('/api/feed/submit', { method: 'POST', body: { id: id } }); },
    approve: function (body) { return fetchJson('/api/feed/approve', { method: 'POST', body: body }); },
    reject: function (body) { return fetchJson('/api/feed/reject', { method: 'POST', body: body }); },
    returnItem: function (body) { return fetchJson('/api/feed/return', { method: 'POST', body: body }); },
    hide: function (id) { return fetchJson('/api/feed/hide', { method: 'POST', body: { id: id } }); },
    setMetadata: function (body) { return fetchJson('/api/feed/metadata', { method: 'POST', body: body }); },
    getComments: function (feedItemId) {
      return fetchJson('/api/feed/comments?feed_item_id=' + encodeURIComponent(feedItemId));
    },
    addComment: function (feedItemId, text) {
      return fetchJson('/api/feed/comments', { method: 'POST', body: { feed_item_id: feedItemId, body: text } });
    },
    toggleReaction: function (itemId, reactionType) {
      var cn = viewerName();
      if (!cn) return Promise.resolve({ ok: false, error: 'not_signed_in' });
      return fetchJson('/api/reactions/toggle', {
        method: 'POST',
        body: { item_type: 'feed', item_id: itemId, reaction_type: reactionType, character_name: cn },
      });
    },
    uploadImage: function (dataUrl, mime) {
      return fetchJson('/api/news/upload-image', {
        method: 'POST',
        body: { image: dataUrl, mime_type: mime || 'image/png' },
      });
    },
    triviaLive: function () { return fetchJson('/api/trivia/live'); },
    triviaMine: function () { return fetchJson('/api/trivia/mine'); },
    triviaReview: function () { return fetchJson('/api/trivia/review'); },
    triviaCreate: function (body) { return fetchJson('/api/trivia/create', { method: 'POST', body: body }); },
    triviaSubmit: function (id) { return fetchJson('/api/trivia/submit', { method: 'POST', body: { id: id } }); },
    triviaApprove: function (id) { return fetchJson('/api/trivia/approve', { method: 'POST', body: { id: id } }); },
    triviaReject: function (body) { return fetchJson('/api/trivia/reject', { method: 'POST', body: body }); },
  };
})(typeof window !== 'undefined' ? window : self);
