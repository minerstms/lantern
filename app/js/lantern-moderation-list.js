/**
 * Prompt #119 — Teacher Moderation Power Scroller wiring.
 * Unifies live / hidden / flagged into one searchable list.
 * Hide/restore still use existing #117 routes; no new semantics.
 */
(function (global) {
  'use strict';

  function esc(s) {
    return global.LanternPowerList && global.LanternPowerList.esc
      ? global.LanternPowerList.esc(s)
      : String(s == null ? '' : s)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');
  }

  function isShoutOutNews(n) {
    if (!n) return false;
    var cat = String(n.category || '')
      .trim()
      .toLowerCase();
    if (cat === 'student spotlight') return true;
    var body = String(n.body || '');
    var title = String(n.title || '').trim();
    if (/^Shout-out\b/i.test(body.trim())) return true;
    if (/Recognizing:\s*/i.test(body)) return true;
    if (/^Shout-out:\s*/i.test(title)) return true;
    return false;
  }

  function typeKeyFromFlag(itemType) {
    var t = String(itemType || '')
      .toLowerCase()
      .trim();
    if (t === 'shoutout' || t === 'shout_out') return 'shoutout';
    if (t === 'news') return 'news';
    if (t === 'poll' || t === 'polls') return 'poll';
    if (t === 'mission' || t === 'mission_submission') return 'mission';
    if (t === 'feed' || t === 'feed_item') return 'feed';
    return t || 'news';
  }

  function typeLabel(key) {
    if (key === 'shoutout') return 'Shout-Out';
    if (key === 'news') return 'News';
    if (key === 'poll') return 'Poll';
    if (key === 'mission') return 'Mission';
    if (key === 'feed') return 'Feed';
    return key ? key.charAt(0).toUpperCase() + key.slice(1) : 'Item';
  }

  function contentKey(typeKey, id) {
    return String(typeKey) + ':' + String(id);
  }

  function parseDateMs(iso) {
    if (!iso) return 0;
    var t = Date.parse(String(iso));
    return isFinite(t) ? t : 0;
  }

  function formatShortDate(iso) {
    if (!iso) return '—';
    try {
      var d = new Date(iso);
      if (isNaN(d.getTime())) return '—';
      var m = d.getMonth() + 1;
      var day = d.getDate();
      var y = String(d.getFullYear()).slice(-2);
      return m + '/' + day + '/' + y;
    } catch (e) {
      return '—';
    }
  }

  function statusTone(statusKey) {
    if (statusKey === 'quarantine') return 'quarantine';
    if (statusKey === 'reported') return 'reported';
    if (statusKey === 'hidden') return 'hidden';
    return 'live';
  }

  function statusLabel(statusKey, flagLabel) {
    if (statusKey === 'quarantine') {
      return flagLabel || 'REPORTED — HIDDEN PENDING REVIEW';
    }
    if (statusKey === 'reported') return flagLabel || 'Reported';
    if (statusKey === 'hidden') return 'Hidden';
    return 'Live';
  }

  function restoreUrl(apiBase, typeKey) {
    if (typeKey === 'news' || typeKey === 'shoutout') return apiBase + '/api/news/restore';
    if (typeKey === 'poll') return apiBase + '/api/polls/restore';
    if (typeKey === 'mission') return apiBase + '/api/missions/submissions/restore';
    if (typeKey === 'feed') return apiBase + '/api/feed/restore';
    return '';
  }

  function hideUrl(apiBase, typeKey) {
    if (typeKey === 'news' || typeKey === 'shoutout') return apiBase + '/api/news/hide';
    if (typeKey === 'poll') return apiBase + '/api/polls/hide';
    if (typeKey === 'mission') return apiBase + '/api/missions/submissions/hide';
    if (typeKey === 'feed') return apiBase + '/api/feed/hide';
    return '';
  }

  /**
   * Build unified moderation rows from loaded API payloads.
   * @param {object} payload
   */
  function buildModerationItems(payload) {
    payload = payload || {};
    var map = Object.create(null);

    function ensure(typeKey, id) {
      var k = contentKey(typeKey, id);
      if (!map[k]) {
        map[k] = {
          id: k,
          contentId: String(id),
          typeKey: typeKey,
          typeLabel: typeLabel(typeKey),
          title: '',
          author: '',
          body: '',
          dateIso: '',
          dateMs: 0,
          dateLabel: '—',
          statusKey: 'live',
          statusLabel: 'Live',
          reason: '',
          reportedBy: '',
          reportedAt: '',
          hiddenAt: '',
          hiddenBy: '',
          flagId: '',
          quarantinePending: false,
          full: null,
        };
      }
      return map[k];
    }

    function applyContent(row, typeKey, title, author, body, dateIso, full) {
      var it = ensure(typeKey, row.id);
      it.title = title || it.title || 'Untitled';
      it.author = author || it.author || '';
      it.body = body || it.body || '';
      if (dateIso) {
        it.dateIso = dateIso;
        it.dateMs = parseDateMs(dateIso);
        it.dateLabel = formatShortDate(dateIso);
      }
      it.full = full || row;
      return it;
    }

    (payload.liveNews || []).forEach(function (n) {
      var tk = isShoutOutNews(n) ? 'shoutout' : 'news';
      applyContent(
        n,
        tk,
        n.title || 'Untitled',
        n.author_name || '',
        n.body || '',
        n.reviewed_at || n.created_at || '',
        n
      );
    });

    (payload.liveMissions || []).forEach(function (s) {
      applyContent(
        s,
        'mission',
        (s.mission_title || 'Mission') + (s.character_name ? ' — ' + s.character_name : ''),
        s.character_name || '',
        s.submission_content || s.caption || '',
        s.reviewed_at || s.approved_at || s.created_at || '',
        s
      );
    });

    (payload.livePolls || []).forEach(function (p) {
      applyContent(
        p,
        'poll',
        p.question || 'Poll',
        p.character_name || '',
        p.question || '',
        p.approved_at || p.created_at || '',
        p
      );
    });

    (payload.hiddenNews || []).forEach(function (n) {
      var tk = isShoutOutNews(n) ? 'shoutout' : 'news';
      var it = applyContent(
        n,
        tk,
        n.title || 'Untitled',
        n.author_name || '',
        n.body || '',
        n.hidden_at || n.reviewed_at || n.created_at || '',
        n
      );
      it.hiddenAt = n.hidden_at || '';
      it.hiddenBy = n.hidden_by || '';
      if (it.statusKey === 'live') {
        it.statusKey = 'hidden';
        it.statusLabel = 'Hidden';
      }
    });

    (payload.hiddenMissions || []).forEach(function (s) {
      var it = applyContent(
        s,
        'mission',
        (s.mission_title || 'Mission') + (s.character_name ? ' — ' + s.character_name : ''),
        s.character_name || '',
        s.submission_content || s.caption || '',
        s.hidden_at || s.reviewed_at || s.created_at || '',
        s
      );
      it.hiddenAt = s.hidden_at || '';
      it.hiddenBy = s.hidden_by || '';
      if (it.statusKey === 'live') {
        it.statusKey = 'hidden';
        it.statusLabel = 'Hidden';
      }
    });

    (payload.hiddenPolls || []).forEach(function (p) {
      var it = applyContent(
        p,
        'poll',
        p.question || 'Poll',
        p.character_name || '',
        p.question || '',
        p.hidden_at || p.approved_at || p.created_at || '',
        p
      );
      it.hiddenAt = p.hidden_at || '';
      it.hiddenBy = p.hidden_by || '';
      if (it.statusKey === 'live') {
        it.statusKey = 'hidden';
        it.statusLabel = 'Hidden';
      }
    });

    (payload.flags || []).forEach(function (f) {
      var tk = typeKeyFromFlag(f.item_type);
      var id = f.item_id;
      if (!id) return;
      var resolved = !!(f.resolved_at && String(f.resolved_at).trim());
      var it = ensure(tk, id);
      it.flagId = f.id || it.flagId;
      it.reason = f.reason || it.reason || '';
      it.reportedBy = f.reported_by || it.reportedBy || '';
      it.reportedAt = f.created_at || it.reportedAt || '';
      if (!it.title) it.title = typeLabel(tk) + ' #' + String(id).slice(0, 10);
      if (!it.dateIso && f.created_at) {
        it.dateIso = f.created_at;
        it.dateMs = parseDateMs(f.created_at);
        it.dateLabel = formatShortDate(f.created_at);
      }
      if (f.hidden_at) {
        it.hiddenAt = f.hidden_at;
        it.hiddenBy = f.hidden_by || it.hiddenBy;
      }
      if (resolved) {
        it.quarantinePending = false;
        if (it.statusKey === 'quarantine' || it.statusKey === 'reported') {
          it.statusKey = it.hiddenAt ? 'hidden' : 'live';
          it.statusLabel = it.hiddenAt ? 'Hidden' : 'Live';
          if (f.resolution) {
            it.statusLabel = 'Resolved (' + String(f.resolution) + ')';
            it.statusKey = 'resolved';
          }
        }
        return;
      }
      var pending = !!(f.quarantine_pending || f.report_quarantine);
      it.quarantinePending = pending || it.quarantinePending;
      if (pending || (f.status_label && /HIDDEN PENDING REVIEW/i.test(String(f.status_label)))) {
        it.statusKey = 'quarantine';
        it.statusLabel = f.status_label || 'REPORTED — HIDDEN PENDING REVIEW';
      } else if (it.hiddenAt) {
        it.statusKey = 'hidden';
        it.statusLabel = 'Hidden';
      } else {
        it.statusKey = 'reported';
        it.statusLabel = f.status_label || 'Reported';
      }
    });

    return Object.keys(map).map(function (k) {
      return map[k];
    });
  }

  /**
   * @param {object} opts
   * @param {HTMLElement} opts.mount
   * @param {string} opts.apiBase
   * @param {function(): string} opts.getStaffName
   * @param {function(): boolean} opts.isAdmin
   * @param {function(string): void} [opts.toast]
   * @param {function(string,string,string,string,object): void} [opts.debugLog]
   */
  function mount(opts) {
    opts = opts || {};
    var Power = global.LanternPowerList;
    if (!Power || typeof Power.create !== 'function') {
      throw new Error('LanternModerationList requires LanternPowerList');
    }
    var toast = opts.toast || function () {};
    var debugLog = opts.debugLog || function () {};
    var list = null;

    function postAction(url, body) {
      return fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {}),
      })
        .then(function (r) {
          return r.json();
        })
        .catch(function () {
          return { ok: false, error: 'network' };
        });
    }

    list = Power.create({
      mount: opts.mount,
      className: 'lanternPowerList--moderation',
      searchPlaceholder: 'Search moderation…',
      emptyMessage: 'No moderation items match.',
      defaultSort: { key: 'date', dir: 'desc' },
      columns: [
        { key: 'type', label: 'Type', sortable: true },
        { key: 'title', label: 'Title', sortable: true },
        { key: 'author', label: 'Author', sortable: true },
        { key: 'date', label: 'Date', sortable: true },
        { key: 'status', label: 'Status', sortable: true },
      ],
      filters: [
        {
          id: 'status',
          label: 'Status',
          options: [
            { value: 'all', label: 'All statuses' },
            { value: 'reported', label: 'Unresolved reported' },
            { value: 'resolved', label: 'Resolved' },
            { value: 'hidden', label: 'Hidden' },
            { value: 'live', label: 'Live' },
          ],
        },
        {
          id: 'type',
          label: 'Type',
          options: [
            { value: 'all', label: 'All types' },
            { value: 'news', label: 'News' },
            { value: 'shoutout', label: 'Shout-Out' },
            { value: 'poll', label: 'Poll' },
            { value: 'mission', label: 'Mission' },
            { value: 'feed', label: 'Feed' },
          ],
        },
      ],
      getRowId: function (item) {
        return item.id;
      },
      getSortValue: function (item, key) {
        if (key === 'date') return item.dateMs || 0;
        if (key === 'type') return item.typeLabel || '';
        if (key === 'title') return item.title || '';
        if (key === 'author') return item.author || '';
        if (key === 'status') return item.statusLabel || '';
        return item.id;
      },
      getSearchText: function (item) {
        return [
          item.title,
          item.author,
          item.typeLabel,
          item.typeKey,
          item.body,
          item.reason,
          item.statusLabel,
          item.contentId,
        ].join(' ');
      },
      matchFilter: function (item, filterId, value) {
        if (filterId === 'status') {
          if (value === 'live') return item.statusKey === 'live';
          if (value === 'hidden') return item.statusKey === 'hidden';
          if (value === 'resolved') return item.statusKey === 'resolved';
          if (value === 'reported') return item.statusKey === 'reported' || item.statusKey === 'quarantine';
          return true;
        }
        if (filterId === 'type') return item.typeKey === value;
        return true;
      },
      getCellHtml: function (item, key) {
        if (key === 'type') return esc(item.typeLabel);
        if (key === 'title') return esc(item.title || 'Untitled');
        if (key === 'author') return esc(item.author || '—');
        if (key === 'date') return esc(item.dateLabel || '—');
        return '';
      },
      getStatus: function (item) {
        return {
          label: item.statusLabel || statusLabel(item.statusKey),
          tone: statusTone(item.statusKey),
        };
      },
      renderExpanded: function (item, detail) {
        var preview = document.createElement('p');
        preview.className = 'lanternPowerListDetailPreview';
        var text = String(item.body || item.title || '').trim();
        preview.textContent = text ? text.slice(0, 800) + (text.length > 800 ? '…' : '') : '(No preview text)';
        detail.appendChild(preview);

        var meta = document.createElement('p');
        meta.className = 'lanternPowerListDetailMeta';
        var bits = [
          'Type: ' + (item.typeLabel || ''),
          'ID: ' + (item.contentId || ''),
          'Status: ' + (item.statusLabel || ''),
        ];
        if (item.reason) bits.push('Report reason: ' + item.reason);
        if (item.reportedAt) bits.push('Reported: ' + formatShortDate(item.reportedAt));
        if (opts.isAdmin && opts.isAdmin() && item.reportedBy) {
          bits.push('Reporter: ' + item.reportedBy);
        }
        if (item.hiddenAt) bits.push('Hidden: ' + formatShortDate(item.hiddenAt));
        if (item.hiddenBy && opts.isAdmin && opts.isAdmin()) bits.push('Hidden by: ' + item.hiddenBy);
        meta.textContent = bits.join(' · ');
        detail.appendChild(meta);

        var actions = document.createElement('div');
        actions.className = 'lanternPowerListActions';
        detail.appendChild(actions);

        if (!(opts.isAdmin && opts.isAdmin())) {
          var note = document.createElement('p');
          note.className = 'lanternPowerListDetailMeta';
          note.textContent = 'Hide and restore require Admin.';
          detail.appendChild(note);
          return;
        }

        var staffName = (opts.getStaffName && opts.getStaffName()) || 'Teacher';
        var api = opts.apiBase || '';

        function addBtn(label, className, onClick) {
          var b = document.createElement('button');
          b.type = 'button';
          b.className = className;
          b.textContent = label;
          b.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            onClick(b);
          });
          actions.appendChild(b);
        }

        if (item.statusKey === 'live' || item.statusKey === 'reported') {
          addBtn('Hide', 'btn bad small', function (btn) {
            var url = hideUrl(api, item.typeKey);
            if (!url) {
              toast('Hide unavailable for this type');
              return;
            }
            btn.disabled = true;
            postAction(url, { id: item.contentId, hidden_by: staffName }).then(function (res) {
              btn.disabled = false;
              debugLog('hide', url, item.contentId, item.typeKey, res);
              if (res.ok) {
                toast('Removed from view');
                if (typeof opts.onChanged === 'function') opts.onChanged();
              } else toast(res.error || 'Failed');
            });
          });
        }

        if (item.statusKey === 'hidden' || item.statusKey === 'quarantine') {
          addBtn('Restore', 'btn good small', function (btn) {
            var url = restoreUrl(api, item.typeKey);
            if (!url) {
              toast('Restore unavailable for this type');
              return;
            }
            btn.disabled = true;
            postAction(url, { id: item.contentId }).then(function (res) {
              btn.disabled = false;
              debugLog('restore', url, item.contentId, item.typeKey, res);
              if (res.ok) {
                toast(item.statusKey === 'quarantine' ? 'Restored to Explore' : 'Restored');
                if (typeof opts.onChanged === 'function') opts.onChanged();
              } else toast(res.error || 'Failed');
            });
          });
        }

        if (item.statusKey === 'quarantine') {
          // Keep Hidden: re-assert hide with staff audit (existing flagged-panel behavior).
          addBtn('Keep Hidden', 'btn small', function (btn) {
            var url = hideUrl(api, item.typeKey);
            if (!url) {
              toast('Hide unavailable for this type');
              return;
            }
            btn.disabled = true;
            postAction(url, { id: item.contentId, hidden_by: staffName }).then(function (res) {
              btn.disabled = false;
              debugLog('keep_hidden', url, item.contentId, item.typeKey, res);
              if (res.ok) {
                toast('Removed from view');
                if (typeof opts.onChanged === 'function') opts.onChanged();
              } else toast(res.error || 'Failed');
            });
          });
        }
      },
    });

    return {
      setFromPayload: function (payload) {
        list.setItems(buildModerationItems(payload));
      },
      getList: function () {
        return list;
      },
      buildModerationItems: buildModerationItems,
    };
  }

  global.LanternModerationList = {
    mount: mount,
    buildModerationItems: buildModerationItems,
    isShoutOutNews: isShoutOutNews,
    typeKeyFromFlag: typeKeyFromFlag,
    restoreUrl: restoreUrl,
    hideUrl: hideUrl,
  };
})(typeof window !== 'undefined' ? window : globalThis);
