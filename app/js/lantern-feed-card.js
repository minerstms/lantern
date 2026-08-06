/**
 * Lantern ONE FEED — adapter to LanternCards contract v2 compact faces.
 * Detail/reactions/comments live in feedDetailOverlay, not on the card face.
 */
(function (global) {
  'use strict';

  function esc(s) {
    return String(s || '').replace(/[&<>"']/g, function (c) {
      return c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;';
    });
  }

  function formatDate(iso) {
    if (!iso) return '';
    try {
      var d = new Date(iso);
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    } catch (e) { return ''; }
  }

  function contentSlotHtml(item) {
    var slot = item.contentSlot || {};
    var type = item.type || '';
    if (type === 'mission' && slot.missionId) {
      return '<div class="feedDetailSlot feedDetailSlot--mission">Mission completed</div>';
    }
    if (type === 'shout_out' && slot.recipient) {
      return '<div class="feedDetailSlot feedDetailSlot--shout">For ' + esc(slot.recipient) + '</div>';
    }
    if (type === 'game_score' && slot.score) {
      return '<div class="feedDetailSlot feedDetailSlot--score">' + esc(slot.score) + '</div>';
    }
    if (type === 'leaderboard' && slot.rankings) {
      return '<div class="feedDetailSlot feedDetailSlot--leaderboard">' + esc(String(slot.rankings).slice(0, 120)) + '</div>';
    }
    if (type === 'trivia' && slot.questionPreview) {
      return '<div class="feedDetailSlot feedDetailSlot--trivia">' + esc(slot.questionPreview) + '</div>';
    }
    return '';
  }

  function reactionBarHtml(item) {
    var feed = global.LANTERN_FEED;
    if (!feed || !feed.REACTIONS) return '';
    var counts = item.reactionCounts || {};
    var mine = item.myReactions || [];
    var parts = feed.REACTIONS.map(function (r) {
      var c = counts[r.type] || 0;
      var on = mine.indexOf(r.type) >= 0 ? ' feedReactionBtn--on' : '';
      return '<button type="button" class="feedReactionBtn' + on + '" data-reaction="' + esc(r.type) + '" aria-label="' + esc(r.label) + '" title="' + esc(r.label) + '">' +
        '<span class="feedReactionIcon">' + r.icon + '</span>' +
        (c > 0 ? '<span class="feedReactionCount">' + c + '</span>' : '') +
        '</button>';
    }).join('');
    return '<div class="feedDetailReactions" data-item-id="' + esc(item.id) + '">' + parts + '</div>';
  }

  function commentsHtml(item) {
    var comments = item.teacherComments || [];
    if (!comments.length) return '';
    var rows = comments.map(function (c) {
      return '<li class="feedTeacherComment"><span class="feedTeacherCommentBadge">Teacher</span> ' +
        '<strong>' + esc(c.authorDisplayName) + '</strong>: ' + esc(c.body) + '</li>';
    }).join('');
    return '<ul class="feedTeacherComments">' + rows + '</ul>';
  }

  function openDetailOverlay(item, opts) {
    opts = opts || {};
    if (item.detailUrl) {
      global.location.href = item.detailUrl;
      return;
    }
    var detail = global.document.getElementById('feedDetailOverlay');
    if (!detail) return;
    var titleEl = detail.querySelector('.feedDetailTitle');
    var bodyEl = detail.querySelector('.feedDetailBody');
    var imgEl = detail.querySelector('.feedDetailImg');
    var slotHost = detail.querySelector('.feedDetailSlotHost');
    var reactHost = detail.querySelector('.feedDetailReactionsHost');
    var commentHost = detail.querySelector('.feedDetailCommentsHost');
    var teacherHost = detail.querySelector('.feedDetailTeacherTools');
    if (titleEl) titleEl.textContent = item.title || '';
    if (bodyEl) bodyEl.textContent = item.body || item.summary || '';
    var src = item.imageUrl || item.thumbnailUrl;
    if (imgEl) {
      if (src) { imgEl.src = src; imgEl.style.display = ''; }
      else { imgEl.removeAttribute('src'); imgEl.style.display = 'none'; }
    }
    if (slotHost) slotHost.innerHTML = contentSlotHtml(item);
    if (reactHost) {
      reactHost.innerHTML = reactionBarHtml(item);
      wireDetailReactions(reactHost, item, opts);
    }
    if (commentHost) commentHost.innerHTML = commentsHtml(item);
    if (teacherHost) {
      var isTeacher = opts.isTeacher || (global.LANTERN_FEED && global.LANTERN_FEED.isTeacherRole());
      teacherHost.innerHTML = isTeacher ? '<button type="button" class="feedAddCommentBtn">Add teacher comment</button>' : '';
      wireDetailTeacherTools(teacherHost, item, opts);
    }
    detail.hidden = false;
    var closeBtn = detail.querySelector('.feedDetailClose');
    if (closeBtn) closeBtn.focus();
  }

  function wireDetailReactions(host, item, opts) {
    var feed = global.LANTERN_FEED;
    if (!host) return;
    host.querySelectorAll('.feedReactionBtn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (!feed) return;
        var rt = btn.getAttribute('data-reaction');
        feed.toggleReaction(item.id, rt).then(function (res) {
          if (!res || !res.ok) return;
          btn.classList.toggle('feedReactionBtn--on', res.toggled === 'on');
          var countEl = btn.querySelector('.feedReactionCount');
          var n = countEl ? parseInt(countEl.textContent, 10) || 0 : 0;
          if (res.toggled === 'on') {
            if (countEl) countEl.textContent = String(n + 1);
            else btn.insertAdjacentHTML('beforeend', '<span class="feedReactionCount">1</span>');
          } else if (countEl) {
            var next = Math.max(0, n - 1);
            if (next === 0) countEl.remove();
            else countEl.textContent = String(next);
          }
        });
      });
    });
  }

  function wireDetailTeacherTools(host, item, opts) {
    var feed = global.LANTERN_FEED;
    var addComment = host && host.querySelector('.feedAddCommentBtn');
    if (addComment && feed && feed.isTeacherRole()) {
      addComment.addEventListener('click', function () {
        var text = global.prompt('Teacher comment (public):');
        if (!text || !String(text).trim()) return;
        feed.addComment(item.id, String(text).trim()).then(function (res) {
          if (res && res.ok && opts.onRefresh) opts.onRefresh();
          else if (res && res.ok) openDetailOverlay(item, opts);
        });
      });
    }
  }

  function buildCard(item, opts) {
    opts = opts || {};
    var cards = global.LanternCards;
    if (!cards || typeof cards.createStudentCard !== 'function') {
      throw new Error('[LANTERN_FEED_CARD] LanternCards required');
    }
    var model = cards.normalizeFeedItemToFaceModel ? cards.normalizeFeedItemToFaceModel(item) : {
      id: item.id,
      type: item.type,
      title: item.title,
      author: item.authorDisplayName,
      dateMeta: formatDate(item.approvedAt || item.createdAt),
      thumbnailUrl: item.thumbnailUrl,
      imageUrl: item.imageUrl,
      fallbackType: item.type,
      typeBadge: item.typeLabel || item.type,
    };
    model.reportType = 'feed_item';
    model.reportId = item.id != null ? String(item.id) : '';
    var spec = cards.compactFaceSpec(model, {
      lanternCardType: item.type || 'news',
      reportType: 'feed_item',
      reportId: model.reportId,
      classNames: 'feedExploreCard',
    });
    var el = cards.createStudentCard(spec);
    var card = el && el.classList && el.classList.contains('exploreCard') ? el : (el && el.querySelector ? el.querySelector('.exploreCard') : el);
    if (!card) return el;
    wireCard(card, item, opts);
    if (cards.applyReportControl) cards.applyReportControl(card);
    return el.classList && el.classList.contains('exploreCardOuterWrap') ? el : card;
  }

  function wireCard(el, item, opts) {
    opts = opts || {};
    var card = el.classList && el.classList.contains('exploreCard') ? el : el.querySelector('.exploreCard');
    if (!card) return;
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', 'Open: ' + (item.title || 'feed item'));
    card.classList.add('exploreCard--activatable');
    function activate(e) {
      if (e && e.target && e.target.closest('.exploreCardReportBtn')) return;
      openDetailOverlay(item, opts);
    }
    card.addEventListener('click', activate);
    card.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        activate(e);
      }
    });
  }

  global.LANTERN_FEED_CARD = {
    buildCard: buildCard,
    openDetail: openDetailOverlay,
    esc: esc,
  };
})(typeof window !== 'undefined' ? window : self);
