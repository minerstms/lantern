/**
 * TMS Lantern — Shared broadcast-feed shaping (frontend only).
 * Normalizes positive/public-safe content into a single item shape for ticker, display hero, grids, recognition.
 * Avatar URLs for identity rows come only from meta._canonicalAvatar (LanternAvatar + Worker), never snapshot fields.
 */
(function (global) {
  function trim(s) { return String(s || '').trim(); }

  /**
   * Normalize a raw item from recognition, slide, news, or activity into broadcast shape.
   * @param {object} raw - Raw item (recognition, slide, news, or activity event)
   * @param {string} source - One of: 'recognition', 'slide', 'news', 'activity'
   * @returns {object} { type, icon, avatarUrl, title, text, subtitle, imageUrl, timestamp, priority }
   */
  function toBroadcastItem(raw, source) {
    var out = {
      type: '',
      icon: '✨',
      avatarUrl: '',
      avatarEmoji: '',
      title: '',
      text: '',
      subtitle: '',
      imageUrl: '',
      timestamp: '',
      priority: 0
    };
    if (!raw || typeof raw !== 'object') return out;

    if (source === 'recognition') {
      out.type = 'recognition';
      out.icon = '⭐';
      out.avatarUrl = (raw._canonicalAvatar && trim(raw._canonicalAvatar.imageUrl)) || '';
      if (!out.avatarUrl && raw._canonicalAvatar && trim(raw._canonicalAvatar.emoji)) {
        out.avatarEmoji = trim(raw._canonicalAvatar.emoji);
      }
      out.title = trim(raw.character_name) || 'Student';
      out.text = trim(raw.message || '').slice(0, 36);
      if (trim(raw.message).length > 36) out.text += '…';
      out.timestamp = raw.created_at || '';
      out.priority = 1;
      return out;
    }

    if (source === 'slide') {
      out.type = raw.type || 'slide';
      out.icon = (raw.type === 'teacher_pick' || raw.type === 'teacher_recognition') ? '🏆' : (raw.type === 'student_news' ? '📰' : '✨');
      out.avatarUrl = (raw.meta && raw.meta._canonicalAvatar && trim(raw.meta._canonicalAvatar.imageUrl)) ? trim(raw.meta._canonicalAvatar.imageUrl) : '';
      if (!out.avatarUrl && raw.meta && raw.meta._canonicalAvatar && trim(raw.meta._canonicalAvatar.emoji)) {
        out.avatarEmoji = trim(raw.meta._canonicalAvatar.emoji);
      }
      out.title = trim(raw.title || '').slice(0, 40);
      if (trim(raw.title).length > 40) out.title += '…';
      out.subtitle = trim(raw.subtitle || '');
      out.imageUrl = trim(raw.image || '');
      out.timestamp = raw.created_at || '';
      out.priority = 2;
      return out;
    }

    if (source === 'news') {
      out.type = 'news';
      out.icon = '📰';
      var nMeta = raw.meta || {};
      var nCanon = nMeta._canonicalAvatar;
      out.avatarUrl = (nCanon && trim(nCanon.imageUrl)) ? trim(nCanon.imageUrl) : '';
      if (!out.avatarUrl && nCanon && trim(nCanon.emoji)) out.avatarEmoji = trim(nCanon.emoji);
      out.title = trim(raw.title || '').slice(0, 42);
      if (trim(raw.title).length > 42) out.title += '…';
      out.text = trim(raw.body || '');
      out.timestamp = raw.approved_at || raw.created_at || '';
      out.priority = 1;
      return out;
    }

    if (source === 'activity') {
      out.type = raw.event_type || 'activity';
      out.avatarUrl = (raw.meta && raw.meta._canonicalAvatar && trim(raw.meta._canonicalAvatar.imageUrl)) ? trim(raw.meta._canonicalAvatar.imageUrl) : '';
      if (!out.avatarUrl && raw.meta && raw.meta._canonicalAvatar && trim(raw.meta._canonicalAvatar.emoji)) {
        out.avatarEmoji = trim(raw.meta._canonicalAvatar.emoji);
      }
      out.title = trim(raw.actor_name || '');
      out.text = raw.labelText || raw.text || '';
      out.timestamp = raw.created_at || '';
      out.priority = 0;
      if (raw.icon) out.icon = raw.icon;
      return out;
    }

    return out;
  }

  /**
   * Build ticker-line item from a broadcast item: { icon, text, avatarUrl } for use in ticker HTML.
   */
  function broadcastToTickerLine(b) {
    var text = b.title;
    if (b.text) text += (text ? ' — ' : '') + b.text;
    if (b.subtitle && !b.text) text += (text ? ' · ' : '') + b.subtitle;
    return { icon: b.icon || '✨', text: text, avatarUrl: b.avatarUrl || '', avatarEmoji: b.avatarEmoji || '' };
  }

  global.LANTERN_BROADCAST = {
    toBroadcastItem: toBroadcastItem,
    broadcastToTickerLine: broadcastToTickerLine
  };
})(typeof window !== 'undefined' ? window : self);
