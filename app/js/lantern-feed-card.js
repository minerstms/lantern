/**
 * Lantern ONE FEED — single card shell contract.
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
      return '<div class="feedCardSlot feedCardSlot--mission">Mission completed</div>';
    }
    if (type === 'shout_out' && slot.recipient) {
      return '<div class="feedCardSlot feedCardSlot--shout">For ' + esc(slot.recipient) + '</div>';
    }
    if (type === 'game_score' && slot.score) {
      return '<div class="feedCardSlot feedCardSlot--score">' + esc(slot.score) + '</div>';
    }
    if (type === 'leaderboard' && slot.rankings) {
      return '<div class="feedCardSlot feedCardSlot--leaderboard">' + esc(String(slot.rankings).slice(0, 120)) + '</div>';
    }
    if (type === 'trivia' && slot.questionPreview) {
      return '<div class="feedCardSlot feedCardSlot--trivia">' + esc(slot.questionPreview) + '</div>';
    }
    return '';
  }

  function reactionBarHtml(item, isTeacher) {
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
    return '<div class="feedCardReactions" data-item-id="' + esc(item.id) + '">' + parts + '</div>';
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

  function buildCard(item, opts) {
    opts = opts || {};
    var isTeacher = opts.isTeacher || (global.LANTERN_FEED && global.LANTERN_FEED.isTeacherRole());
    var img = item.thumbnailUrl || item.imageUrl;
    var imgBlock = img
      ? '<div class="feedCardMedia"><img src="' + esc(img) + '" alt="" loading="lazy"></div>'
      : '';
    var el = document.createElement('article');
    el.className = 'feedCard';
    el.setAttribute('data-feed-id', item.id);
    el.setAttribute('data-feed-type', item.type || '');
    el.innerHTML =
      '<div class="feedCardInner">' +
        '<div class="feedCardTag">' + esc(item.typeLabel || item.type || 'Item') + '</div>' +
        imgBlock +
        '<h3 class="feedCardTitle">' + esc(item.title) + '</h3>' +
        contentSlotHtml(item) +
        '<p class="feedCardSummary">' + esc(item.summary || item.body || '') + '</p>' +
        '<div class="feedCardMeta">' +
          '<span class="feedCardAuthor">' + esc(item.authorDisplayName) + '</span>' +
          '<span class="feedCardDate">' + esc(formatDate(item.approvedAt || item.createdAt)) + '</span>' +
        '</div>' +
        reactionBarHtml(item, isTeacher) +
        commentsHtml(item) +
        (isTeacher ? '<div class="feedCardTeacherTools"><button type="button" class="feedAddCommentBtn">Add teacher comment</button></div>' : '') +
        '<button type="button" class="feedCardOpenBtn">Open</button>' +
      '</div>';
    wireCard(el, item, opts);
    return el;
  }

  function wireCard(el, item, opts) {
    var feed = global.LANTERN_FEED;
    el.querySelectorAll('.feedReactionBtn').forEach(function (btn) {
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
    var openBtn = el.querySelector('.feedCardOpenBtn');
    if (openBtn) {
      openBtn.addEventListener('click', function () {
        if (item.detailUrl) {
          global.location.href = item.detailUrl;
          return;
        }
        var detail = global.document.getElementById('feedDetailOverlay');
        if (detail) {
          detail.querySelector('.feedDetailTitle').textContent = item.title || '';
          detail.querySelector('.feedDetailBody').textContent = item.body || item.summary || '';
          var imgEl = detail.querySelector('.feedDetailImg');
          var src = item.imageUrl || item.thumbnailUrl;
          if (imgEl) {
            if (src) { imgEl.src = src; imgEl.style.display = ''; }
            else { imgEl.removeAttribute('src'); imgEl.style.display = 'none'; }
          }
          detail.hidden = false;
        }
      });
    }
    var addComment = el.querySelector('.feedAddCommentBtn');
    if (addComment && feed && feed.isTeacherRole()) {
      addComment.addEventListener('click', function () {
        var text = global.prompt('Teacher comment (public):');
        if (!text || !String(text).trim()) return;
        feed.addComment(item.id, String(text).trim()).then(function (res) {
          if (res && res.ok && opts.onRefresh) opts.onRefresh();
        });
      });
    }
  }

  global.LANTERN_FEED_CARD = {
    buildCard: buildCard,
    esc: esc,
  };
})(typeof window !== 'undefined' ? window : self);
