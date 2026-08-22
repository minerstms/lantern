/**
 * Prompt #251B — Locker Overview Needs Revision section.
 * Students never see report identity, report reasons, or "you were reported."
 */
(function (global) {
  'use strict';

  function esc(s) {
    return String(s || '').replace(/[&<>"']/g, function (c) {
      return c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;';
    });
  }

  function apiBase() {
    if (typeof global.LANTERN_AVATAR_API === 'undefined' || global.LANTERN_AVATAR_API === null) return null;
    return String(global.LANTERN_AVATAR_API).replace(/\/$/, '');
  }

  function typeLabel(t) {
    if (t === 'poll_contribution') return 'Poll';
    if (t === 'mission_submission') return 'Mission';
    if (t === 'news_submission' || t === 'news') return 'News / Shout-Out!';
    if (t === 'feed_item') return 'Create post';
    return 'Submission';
  }

  function formatWhen(iso) {
    if (!iso) return '';
    try {
      var d = new Date(iso);
      return isNaN(d.getTime()) ? '' : d.toLocaleString();
    } catch (_) {
      return '';
    }
  }

  function thumbFor(item) {
    var r = item.raw || item;
    var key = r.image_r2_key || r.full_image_r2_key || '';
    if (key) return '/api/news/image?key=' + encodeURIComponent(key);
    if (r.image_url) return String(r.image_url);
    return '';
  }

  function feedbackFor(item) {
    var r = item.raw || item;
    return (
      (r.decision_note && String(r.decision_note).trim()) ||
      (r.returned_reason && String(r.returned_reason).trim()) ||
      (r.private_feedback && String(r.private_feedback).trim()) ||
      (item.decisionNote && String(item.decisionNote).trim()) ||
      (item.latestReturnNote && String(item.latestReturnNote).trim()) ||
      ''
    );
  }

  function returnedAtFor(item) {
    var r = item.raw || item;
    return r.returned_at || r.reviewed_at || item.returnedAt || '';
  }

  function openNewsRevise(raw) {
    try {
      sessionStorage.setItem(
        'LANTERN_NEWS_ARTICLE_RESUBMIT',
        JSON.stringify({
          id: raw.id,
          title: raw.title || '',
          body: raw.body || '',
          category: raw.category || '',
        })
      );
    } catch (_) {}
    global.location.href = 'contribute.html?type=post';
  }

  function openPollRevise(raw) {
    global.location.href = 'contribute.html?type=poll&resubmit=' + encodeURIComponent(raw.id);
  }

  function openMissionRevise(raw) {
    try {
      sessionStorage.setItem(
        'LANTERN_MISSION_RESUBMIT',
        JSON.stringify({
          id: raw.id,
          mission_id: raw.mission_id || '',
          submission_content: raw.submission_content || '',
          returned_reason: raw.returned_reason || '',
        })
      );
    } catch (_) {}
    var q = 'missions.html?revise=' + encodeURIComponent(raw.id);
    if (raw.mission_id) q += '&mission=' + encodeURIComponent(raw.mission_id);
    global.location.href = q;
  }

  function openFeedRevise(raw) {
    try {
      sessionStorage.setItem(
        'LANTERN_FEED_RESUBMIT',
        JSON.stringify({
          id: raw.id,
          type: raw.type || 'article',
          title: raw.title || '',
          body: raw.body || raw.summary || '',
          image_r2_key: raw.image_r2_key || '',
          private_feedback: raw.private_feedback || '',
        })
      );
    } catch (_) {}
    global.location.href = 'create.html?resubmit=' + encodeURIComponent(raw.id);
  }

  function cardHtml(item) {
    var raw = item.raw || item;
    var thumb = thumbFor(item);
    var note = feedbackFor(item);
    var when = formatWhen(returnedAtFor(item));
    var submitted = formatWhen(item.createdAt || raw.created_at);
    var preview = item.previewText || raw.body || raw.submission_content || raw.question || '';
    var longFeedback = note && String(note).length > 180;
    var shownNote = longFeedback ? String(note).slice(0, 180) + '…' : note;
    return (
      '<article class="lockerNeedsCard" data-revision-type="' +
      esc(item.contentType) +
      '" data-revision-id="' +
      esc(raw.id) +
      '">' +
      '<div class="lockerNeedsCardMain">' +
      '<div class="lockerNeedsCardMedia">' +
      (thumb
        ? '<img src="' + esc(thumb) + '" alt="" loading="lazy">'
        : '<div class="lockerNeedsCardFallback" aria-hidden="true">📝</div>') +
      '</div>' +
      '<p class="lockerNeedsCardType">' +
      esc(typeLabel(item.contentType)) +
      '</p>' +
      '<h3 class="lockerNeedsCardTitle">' +
      esc(item.title || 'Untitled') +
      '</h3>' +
      (submitted ? '<p class="lockerNeedsCardMeta">Submitted ' + esc(submitted) + '</p>' : '') +
      (when ? '<p class="lockerNeedsCardMeta">Returned ' + esc(when) + '</p>' : '') +
      '</div>' +
      '<div class="lockerNeedsCardAside">' +
      '<p class="lockerNeedsCardStatus">Returned for Revision</p>' +
      (note
        ? '<div class="lockerNeedsCardFeedback" data-full-feedback="' +
          esc(note) +
          '"><strong>Teacher feedback:</strong> <span class="lockerNeedsCardFeedbackText">' +
          esc(shownNote) +
          '</span>' +
          (longFeedback
            ? ' <button type="button" class="lockerNeedsShowMore">Show more</button>'
            : '') +
          '</div>'
        : '<div class="lockerNeedsCardFeedback">Please revise and resubmit.</div>') +
      (preview
        ? '<p class="lockerNeedsCardPreview lockerNeedsCardPreview--clamp">' + esc(String(preview).slice(0, 140)) + (String(preview).length > 140 ? '…' : '') + '</p>'
        : '') +
      '<div class="lockerNeedsCardActions">' +
      '<button type="button" class="btn primary lockerNeedsReviseBtn">Revise &amp; Resubmit</button>' +
      '<button type="button" class="btn lockerNeedsArchiveBtn">Archive for Later</button>' +
      '</div>' +
      '</div></article>'
    );
  }

  function itemTypeForState(item) {
    var t = item.contentType;
    if (t === 'news_submission' || t === 'news') return 'news';
    if (t === 'poll_contribution') return 'poll_contribution';
    if (t === 'mission_submission') return 'mission_submission';
    return 'feed_item';
  }

  function wireCards(root, items) {
    Array.prototype.forEach.call(root.querySelectorAll('.lockerNeedsShowMore'), function (btn) {
      btn.addEventListener('click', function () {
        var box = btn.closest('.lockerNeedsCardFeedback');
        if (!box) return;
        var text = box.querySelector('.lockerNeedsCardFeedbackText');
        if (text) text.textContent = box.getAttribute('data-full-feedback') || text.textContent;
        btn.remove();
      });
    });
    Array.prototype.forEach.call(root.querySelectorAll('.lockerNeedsReviseBtn'), function (btn) {
      btn.addEventListener('click', function () {
        var art = btn.closest('.lockerNeedsCard');
        if (!art) return;
        var id = art.getAttribute('data-revision-id');
        var item = items.filter(function (it) {
          return String((it.raw && it.raw.id) || '') === String(id);
        })[0];
        if (!item) return;
        var t = item.contentType;
        if (t === 'news_submission' || t === 'news') openNewsRevise(item.raw);
        else if (t === 'poll_contribution') openPollRevise(item.raw);
        else if (t === 'mission_submission') openMissionRevise(item.raw);
        else if (t === 'feed_item') openFeedRevise(item.raw);
      });
    });
    Array.prototype.forEach.call(root.querySelectorAll('.lockerNeedsArchiveBtn'), function (btn) {
      btn.addEventListener('click', function () {
        var art = btn.closest('.lockerNeedsCard');
        if (!art) return;
        var id = art.getAttribute('data-revision-id');
        var item = items.filter(function (it) {
          return String((it.raw && it.raw.id) || '') === String(id);
        })[0];
        if (!item || !global.LanternLockerOrg || typeof global.LanternLockerOrg.runAction !== 'function') return;
        global.LanternLockerOrg.runAction('archive', itemTypeForState(item), id, 'returned');
      });
    });
  }

  function enrichFromHistory(items) {
    var base = apiBase();
    if (!base) return Promise.resolve(items);
    var jobs = items.map(function (it) {
      if (feedbackFor(it)) return Promise.resolve(it);
      var type = it.contentType === 'news_submission' ? 'news' : it.contentType;
      return fetch(
        base +
          '/api/moderation/history?item_type=' +
          encodeURIComponent(type) +
          '&item_id=' +
          encodeURIComponent(it.raw.id),
        { credentials: 'include' }
      )
        .then(function (r) {
          return r.json();
        })
        .then(function (res) {
          if (res && res.latest_return && res.latest_return.note) {
            it.latestReturnNote = res.latest_return.note;
            it.returnedAt = res.latest_return.created_at;
          }
          return it;
        })
        .catch(function () {
          return it;
        });
    });
    return Promise.all(jobs);
  }

  function loadFeedReturned() {
    var feed = global.LANTERN_FEED;
    if (!feed || typeof feed.getMine !== 'function') return Promise.resolve([]);
    return feed.getMine().then(function (res) {
      var rows = (res && res.items) || [];
      return rows
        .filter(function (r) {
          return String(r.status || '').toLowerCase() === 'returned';
        })
        .map(function (r) {
          return {
            contentType: 'feed_item',
            status: 'returned',
            title: r.title || r.typeLabel || 'Post',
            previewText: r.body || r.summary || '',
            decisionNote: r.privateFeedback || r.private_feedback || '',
            createdAt: r.createdAt || r.created_at || '',
            raw: r,
          };
        });
    }).catch(function () {
      return [];
    });
  }

  function render(items) {
    var host = document.getElementById('profileNeedsAttention');
    var list = document.getElementById('lockerNeedsRevisionList');
    var empty = document.getElementById('lockerNeedsRevisionEmpty');
    var countEl = document.getElementById('lockerNeedsRevisionCount');
    if (!host || !list) return;
    var returned = (items || []).filter(function (it) {
      if (String(it.status || '').toLowerCase() !== 'returned') return false;
      if (it.owner_archived_at || (it.raw && it.raw.owner_archived_at)) return false;
      return true;
    });
    if (countEl) {
      countEl.textContent = returned.length ? String(returned.length) : '';
      countEl.hidden = returned.length === 0;
    }
    if (!returned.length) {
      host.classList.remove('is-active');
      host.setAttribute('data-empty', '1');
      list.innerHTML = '';
      if (empty) {
        empty.hidden = false;
        empty.textContent = 'No revisions needed';
      }
      return;
    }
    host.classList.add('is-active');
    host.removeAttribute('data-empty');
    if (empty) empty.hidden = true;
    list.innerHTML = returned.map(cardHtml).join('');
    wireCards(list, returned);
  }

  function fromLockerMe() {
    var locker = global.LANTERN_LOCKER_ME;
    var items = [];
    if (locker && locker.ok && locker.submissions && global.LanternLockerMe && typeof global.LanternLockerMe.lockerCategoryItems === 'function') {
      global.LanternLockerMe.lockerCategoryItems(locker.submissions).forEach(function (item) {
        if (!item || !item.id) return;
        var status = String(item.status || '').toLowerCase();
        if (status !== 'returned') return;
        if (item.owner_archived_at) return;
        if (item.type === 'poll_contribution') {
          items.push({
            contentType: 'poll_contribution',
            status: status,
            title: item.question || 'Poll',
            previewText: '',
            decisionNote: item.decision_note || '',
            createdAt: item.created_at || '',
            owner_archived_at: item.owner_archived_at || null,
            raw: item,
          });
        } else if (item.type === 'mission_submission') {
          items.push({
            contentType: 'mission_submission',
            status: status,
            title: item.mission_title || 'Mission',
            previewText: item.submission_content || '',
            decisionNote: item.returned_reason || '',
            createdAt: item.created_at || '',
            returnedAt: item.returned_at || '',
            owner_archived_at: item.owner_archived_at || null,
            raw: item,
          });
        } else if (item.type === 'news_submission') {
          items.push({
            contentType: 'news_submission',
            status: status,
            title: item.title || 'News',
            previewText: item.body || '',
            decisionNote: item.decision_note || '',
            createdAt: item.created_at || '',
            owner_archived_at: item.owner_archived_at || null,
            raw: item,
          });
        } else if (item.type === 'feed_item') {
          items.push({
            contentType: 'feed_item',
            status: status,
            title: item.title || 'Post',
            previewText: item.body || '',
            decisionNote: item.decision_note || '',
            createdAt: item.created_at || '',
            owner_archived_at: item.owner_archived_at || null,
            raw: item,
          });
        }
      });
    }
    return Promise.resolve(items);
  }

  function load() {
    var bundleP = fromLockerMe();
    return Promise.all([bundleP, loadFeedReturned()]).then(function (arr) {
      var fromMe = arr[0] || [];
      var seen = {};
      fromMe.forEach(function (it) {
        if (it && it.raw && it.raw.id) seen[String(it.raw.id)] = true;
      });
      var extras = (arr[1] || []).filter(function (it) {
        return it && it.raw && !seen[String(it.raw.id)];
      });
      var items = fromMe.concat(extras);
      return enrichFromHistory(items).then(function (enriched) {
        render(enriched);
        return enriched;
      });
    });
  }

  function focusSection() {
    var host = document.getElementById('profileNeedsAttention');
    if (!host) return;
    try {
      host.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (host.focus) {
        host.setAttribute('tabindex', '-1');
        host.focus({ preventScroll: true });
      }
    } catch (_) {}
  }

  global.LanternLockerRevision = {
    load: load,
    render: render,
    focusSection: focusSection,
    openNewsRevise: openNewsRevise,
    openPollRevise: openPollRevise,
    openMissionRevise: openMissionRevise,
    openFeedRevise: openFeedRevise,
  };

  function boot() {
    if (!document.getElementById('profileNeedsAttention')) return;
    var tries = 0;
    function tick() {
      if (global.LANTERN_LOCKER_ME && global.LANTERN_LOCKER_ME.ok) {
        load().then(function () {
          if ((global.location.hash || '') === '#profileNeedsAttention') focusSection();
        });
        return;
      }
      tries += 1;
      if (tries < 40) setTimeout(tick, 150);
    }
    tick();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof window !== 'undefined' ? window : self);
