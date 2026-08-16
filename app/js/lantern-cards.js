/**
 * Lantern canonical card system — single rail layout only (media, title, identity, meta). See docs/LANTERN_SYSTEM_CONTEXT.md §10 (archived: docs/archive/CARD_SYSTEM.md).
 * Depends: LANTERN_AVATAR_API (optional), LanternMedia (optional).
 */
(function (global) {
  'use strict';

  var TYPE_ICONS = {
    image: '📷',
    link: '🔗',
    video: '🎬',
    webapp: '📱',
    project: '📂',
    poll: '📊',
    teach: '🧠',
    create: '🛠',
    news: '📰',
    shoutout: '📣',
    shout_out: '📣',
    article: '📰',
    photo: '📰'
  };
  /** Top-right / legacy type badges: icon + short label. */
  /** Prompt #118 — shoutout display name is "Shout-Out!" (value key stays shoutout). */
  var SHOUT_OUT_DISPLAY_NAME = 'Shout-Out!';
  var TYPE_BADGES = {
    poll: '📊 Poll',
    teach: '🧠 Teach',
    create: '🛠 Create',
    news: '📰 News',
    shoutout: '📣 ' + SHOUT_OUT_DISPLAY_NAME,
    shout_out: '📣 ' + SHOUT_OUT_DISPLAY_NAME,
    image: '📷 Image',
    video: '🎬 Video',
    link: '🔗 Link',
    project: '📂 Project',
    webapp: '📱 App',
    article: '📰 News',
    photo: '📰 News'
  };

  /**
   * Prompt #222 — ULHC content-type icon badge (icon-only; aria-label for a11y).
   * Locked vocabulary: Shout-Out 📣 · News 📰 · Poll 📊.
   * Mission/game/achievement keep existing distinct treatment (no invented icons here).
   */
  function resolveUlhcTypeBadge(modelOrType) {
    var type = '';
    if (modelOrType && typeof modelOrType === 'object') {
      type = String(modelOrType.type || modelOrType.fallbackType || '').toLowerCase();
    } else {
      type = String(modelOrType || '').toLowerCase();
    }
    if (type === 'shoutout' || type === 'shout_out' || type === 'shout-out' || type === 'recognition') {
      return { icon: '📣', label: 'Shout-Out' };
    }
    if (type === 'poll') return { icon: '📊', label: 'Poll' };
    if (type === 'news' || type === 'article' || type === 'photo' || type === 'video' || type === 'image') {
      return { icon: '📰', label: 'News' };
    }
    return null;
  }

  function contentTypeTickerIcon(type) {
    var b = resolveUlhcTypeBadge(type);
    return b ? b.icon : '';
  }

  var CARD_MODE = { RAIL: 'rail', OPENED: 'opened', DETAIL: 'detail' };
  /** Contract v2 — fixed 280px 16:9 landscape canonical face. */
  var CANONICAL_SHELL_CLASS = 'exploreCard exploreCard--rail lanternCanonicalCard lcCardHardLayout';
  /** @deprecated v1 alias — use CANONICAL_SHELL_CLASS */
  var HARD_RAIL_SHELL_CLASS = CANONICAL_SHELL_CLASS;
  /** Factory stamp — must match LanternCanonicalEnforce.FACTORY_EXPECTED */
  var CARD_FACTORY = 'LanternCards';
  var CARD_CONTRACT_VERSION = '2';

  var IMAGE_LIKE_TYPES = { image: 1, photo: 1 };
  var IMAGE_URL_RE = /\.(jpg|jpeg|png|gif|webp|svg|avif|bmp)(\?|#|$)/i;

  function looksLikeImageUrl(url) {
    var u = String(url || '').trim();
    if (!u) return false;
    if (IMAGE_URL_RE.test(u)) return true;
    if (/\/api\/media\/image/i.test(u)) return true;
    if (u.indexOf('data:image/') === 0) return true;
    return false;
  }

  /**
   * Safe card-face image resolver — never treats generic item.url as image unless type or URL validates.
   */
  function resolveCardFaceImageUrl(p) {
    p = p || {};
    var type = String(p.type || p.fallbackType || '').toLowerCase();
    var order = ['thumbnailUrl', 'thumbnail_url', 'thumbnail', 'preview_src', 'preview_url', 'previewImage', 'imageUrl', 'image_url', 'image'];
    var i;
    for (i = 0; i < order.length; i++) {
      var v = String(p[order[i]] || '').trim();
      if (v) return v;
    }
    var full = String(p.full_image_url || '').trim();
    if (full) return full;
    var url = String(p.url || '').trim();
    if (url && (IMAGE_LIKE_TYPES[type] || looksLikeImageUrl(url))) return url;
    return '';
  }

  function resolveCardFaceImageUrlWithFallbacks(p) {
    var primary = resolveCardFaceImageUrl(p);
    if (primary) return primary;
    var type = String((p && (p.fallbackType || p.type)) || '').toLowerCase();
    if (type === 'mission') {
      return missionCoverFallbackUrl((p && (p.missionId || p.mission_id || p.id)) || '');
    }
    var topicUrl = getTopicLibraryImageUrl(p);
    if (topicUrl) return topicUrl;
    return getDefaultImageUrl(p.fallbackType || p.type || 'creation');
  }

  function truncateCanonicalTitle(s) {
    /* Prompt #158 — Explore overlay headline is exactly one line (CSS ellipsis). */
    return truncateRailTitleTwoLines(s, 64);
  }

  /**
   * Prompt #158 — Compact author for Explore card overlay line 2: "First L."
   * No student IDs, usernames-as-ids, roles, or fabricated initials.
   */
  function formatCompactAuthor(displayName) {
    var s = String(displayName || '').replace(/\s+/g, ' ').trim();
    if (!s) return '';
    if (/^\d{3,}$/.test(s)) return '';
    s = s
      .replace(/\s*[·•|]\s*\d{3,}\s*$/g, '')
      .replace(/\s+\d{6,}\s*$/g, '')
      .replace(/\s*\(\d{3,}\)\s*$/g, '')
      .trim();
    if (!s) return '';
    var lower = s.toLowerCase();
    if (lower === 'unknown' || lower === 'anonymous' || lower === 'poll' || lower === 'staff') {
      if (lower === 'staff') return 'Staff';
      if (lower === 'anonymous') return 'Anonymous';
      return lower === 'poll' ? '' : s;
    }
    var parts = s.split(' ').filter(Boolean);
    if (!parts.length) return '';
    if (parts.length === 1) return parts[0];
    var first = parts[0];
    var last = parts[parts.length - 1];
    var ch = last.charAt(0);
    if (!/[A-Za-z]/.test(ch)) return first;
    return first + ' ' + ch.toUpperCase() + '.';
  }

  /**
   * Prompt #220 — Explore/public author label.
   * Staff with honorific public label → use as-is (Mr. Radle).
   * Staff without → keep full safe name (do not First L.).
   * Students → First L.
   */
  function formatExploreAuthorLabel(model) {
    model = model || {};
    var publicLabel = String(model.authorPublicLabel || model.author_public_label || '').trim();
    if (publicLabel) return publicLabel;
    var role = String(model.authorRole || model.author_role || model.authorType || model.author_type || '').trim().toLowerCase();
    var raw = String(model.author || model.authorDisplayName || '').trim();
    if (/^(Mr\.|Miss|Ms\.|Mrs\.|SRO)\s+\S/i.test(raw)) return raw;
    if (role === 'teacher' || role === 'admin' || role === 'staff') return raw;
    return formatCompactAuthor(raw);
  }

  /** Prompt #158 — Compact date M/D/YY (no leading zeros, no time). */
  function formatCompactDate(isoOrDate) {
    if (isoOrDate == null || isoOrDate === '') return '';
    try {
      var d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
      if (isNaN(d.getTime())) return '';
      var yy = String(d.getFullYear());
      yy = yy.length >= 2 ? yy.slice(-2) : yy;
      return (d.getMonth() + 1) + '/' + d.getDate() + '/' + yy;
    } catch (e) {
      return '';
    }
  }

  var EXPLORE_DESC_JUNK = {
    mission: 1,
    'mission submission': 1,
    'mission completed': 1,
    'photo submission': 1,
    photo: 1,
    photos: 1,
    post: 1,
    news: 1,
    poll: 1,
    'shout-out': 1,
    'shout-out!': 1,
    'tap to vote': 1,
    article: 1,
    video: 1,
    videos: 1,
  };

  /**
   * Prompt #158 — Description preview for overlay line 2 (CSS truncates).
   * Omits empty/junk content-type placeholders; does not invent copy.
   */
  function getExploreDescriptionPreview(item) {
    item = item || {};
    var raw = String(item.summary != null ? item.summary : (item.body != null ? item.body : (item.description || '')))
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!raw) return '';
    var key = raw.toLowerCase();
    if (EXPLORE_DESC_JUNK[key]) return '';
    if (/^(mission|photo|post|news|poll|article|video)s?$/i.test(raw)) return '';
    var title = String(item.title || '').replace(/\s+/g, ' ').trim();
    if (title && raw === title) return '';
    return raw;
  }

  /**
   * Prompt #217 — Shout-Out compact card meta shows the recognized party only
   * (no literal "Recognizing:" / "For " field label). Author ≠ recognized party.
   * Prefer contentSlot.recipient; else parse body/summary. Omit when missing.
   */
  function shoutOutRecognizedPartyLabel(item) {
    item = item || {};
    var slot = item.contentSlot || {};
    var fromSlot = String(slot.recipient || slot.recognition_label || slot.recognized || '').trim();
    if (fromSlot && !/^(undefined|null)$/i.test(fromSlot)) {
      return fromSlot.replace(/^(Recognizing|For)\s*:\s*/i, '').replace(/^For\s+/i, '').trim();
    }
    var blob = String(item.body != null ? item.body : (item.summary != null ? item.summary : (item.description || '')));
    var m = blob.match(/Recognizing:\s*([^\n\r]+)/i);
    if (m && m[1]) {
      var party = String(m[1]).replace(/\s+/g, ' ').trim();
      if (party && !/^(undefined|null)$/i.test(party)) return party;
    }
    var forM = blob.match(/^\s*For\s+([^\n\r]+)/i);
    if (forM && forM[1]) {
      var forParty = String(forM[1]).replace(/\s+/g, ' ').trim();
      if (forParty && !/^(undefined|null)$/i.test(forParty)) return forParty;
    }
    return '';
  }

  /** Prompt #222 — Shout-Out Row 3: recognized party — message preview (no "Recognizing:" prefix). */
  function shoutOutCompactRow3Preview(item) {
    item = item || {};
    var party = shoutOutRecognizedPartyLabel(item);
    var blob = String(item.body != null ? item.body : (item.summary != null ? item.summary : (item.description || '')));
    var msgBlob = blob
      .replace(/Recognizing:\s*[^\n\r]+/gi, ' ')
      .replace(/^\s*For\s+[^\n\r]+/i, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    var msg = getExploreDescriptionPreview({
      title: item.title,
      summary: msgBlob,
      body: msgBlob,
      description: msgBlob,
      type: item.type,
    });
    if (party && msg) return party + ' — ' + msg;
    if (party) return party;
    return msg || '';
  }

  function buildCanonicalImageOnErrorHandler() {
    return 'var el=this;var t=el.getAttribute(\'data-lc-t\');var u=el.getAttribute(\'data-lc-u\');if(el.dataset.lc!==\'1\'){el.dataset.lc=\'1\';el.src=t;return;}el.onerror=null;el.src=u;';
  }

  /**
   * ONE compact production card-face compositor (contract v2).
   * Prompt #222 — canonical 3-row overlay: headline · author+date · context/preview + ULHC type icon.
   * Prompt #225 — one author avatar spans Rows 2+3 (meta grid); headline stays full-width Row 1.
   * @param {object} model — normalized face fields
   * @param {object} shellOpts — report/nav/class attrs
   */
  function buildCanonicalCardFaceHtml(model, shellOpts) {
    model = model || {};
    shellOpts = shellOpts || {};
    var fbType = model.fallbackType || model.type || 'creation';
    // Mission cards: if a REAL image URL was set but fails to actually load at runtime (e.g. a
    // stale/broken reference), gracefully recover to built-in / official Mission cover art rather than
    // a generic gradient placeholder — presentation only, never asserted as the real photo, and
    // never used by Teacher Review (which has its own separate, truthful media handling).
    var typeSvg = fbType === 'mission'
      ? missionCoverFallbackUrl(model.missionId || model.mission_id || model.id)
      : svgTypeFallbackDataUri(fbType);
    var uniSvg = svgUniversalLanternDataUri();
    var faceUrl = resolveCardFaceImageUrl(model);
    var remoteUrl = faceUrl || resolveCardFaceImageUrlWithFallbacks(model);
    var title = esc(truncateCanonicalTitle(model.title || 'Untitled'));
    var exploreOverlay = model.exploreOverlay === true;
    var authorRaw = String(model.author || '').trim();
    var author = exploreOverlay ? formatExploreAuthorLabel(model) : authorRaw;
    var dateMeta = '';
    if (exploreOverlay) {
      dateMeta = formatCompactDate(model.dateIso || model.approvedAt || model.createdAt || model.approved_at || model.created_at)
        || formatCompactDate(model.dateMeta)
        || String(model.dateMeta || '').trim();
      /* Never keep long locale dates or type labels on explore overlay date slot */
      if (/mission|poll|photo|news|choice/i.test(dateMeta) && !/^\d{1,2}\/\d{1,2}\/\d{2}$/.test(dateMeta)) {
        dateMeta = formatCompactDate(model.dateIso || model.approvedAt || model.createdAt) || '';
      }
    } else {
      dateMeta = String(model.dateMeta || '').trim();
    }
    var desc = exploreOverlay ? String(model.descriptionPreview || '').replace(/\s+/g, ' ').trim() : '';
    var avatarHtml = '';
    if (exploreOverlay) {
      avatarHtml = buildExploreAuthorAvatarHtml({
        character_name: model.character_name || model.authorAvatarKey,
        authorAvatarKey: model.authorAvatarKey,
        author_name: model.author_name || authorRaw,
        _canonicalAvatar: model._canonicalAvatar,
        frame: model.frame,
        identitySize: 'md',
      });
    }
    var metaParts = [];
    if (author) metaParts.push('<span class="lanternCanonicalCardAuthor">' + esc(author) + '</span>');
    if (dateMeta) {
      if (metaParts.length) metaParts.push('<span class="lanternCanonicalCardMetaSeparator" aria-hidden="true">·</span>');
      metaParts.push('<span class="lanternCanonicalCardDate">' + esc(dateMeta) + '</span>');
    }
    var metaLine = metaParts.length
      ? '<div class="lanternCanonicalCardMeta lanternCanonicalCardMetaRow">' + metaParts.join('') + '</div>'
      : '';
    var descLine = desc
      ? '<div class="lanternCanonicalCardDesc lanternCanonicalCardDescRow">' + esc(desc) + '</div>'
      : '';
    var badgeLayer = '';
    var ulhc = exploreOverlay ? resolveUlhcTypeBadge(model) : null;
    if (ulhc) {
      badgeLayer +=
        '<span class="lanternCanonicalCardTypeBadge" role="img" aria-label="' +
        esc(ulhc.label) +
        '" title="' +
        esc(ulhc.label) +
        '">' +
        ulhc.icon +
        '</span>';
    } else if (model.typeBadge) {
      badgeLayer += '<span class="lanternCanonicalCardTypeBadge">' + esc(String(model.typeBadge)) + '</span>';
    }
    if (model.stateBadge) {
      badgeLayer += '<span class="lanternCanonicalCardStateBadge">' + esc(String(model.stateBadge)) + '</span>';
    }
    var imgBlock = '<img class="lanternCanonicalCardImage" src="' + esc(remoteUrl) + '" alt="" loading="lazy" decoding="async" data-lc-t="' + esc(typeSvg) + '" data-lc-u="' + esc(uniSvg) + '" onerror="' + buildCanonicalImageOnErrorHandler() + '">';
    var fallbackBlock = '<div class="lanternCanonicalCardFallback" hidden style="background:linear-gradient(135deg,' + svgSpecForContentType(fbType).a + ',' + svgSpecForContentType(fbType).b + ');" aria-hidden="true"></div>';
    var captionInner = '<h3 class="lanternCanonicalCardTitle">' + title + '</h3>';
    if (exploreOverlay && (avatarHtml || metaLine || descLine)) {
      /* Prompt #225 — avatar column spans Rows 2+3; text column holds author/date + context. */
      captionInner +=
        '<div class="lanternCanonicalCardMetaGrid' +
        (avatarHtml ? '' : ' lanternCanonicalCardMetaGrid--noAvatar') +
        '">' +
        (avatarHtml || '') +
        metaLine +
        descLine +
        '</div>';
    } else {
      if (metaLine) captionInner += metaLine;
      if (descLine) captionInner += descLine;
    }
    var inner =
      '<div class="lanternCanonicalCardFrame">' +
        imgBlock +
        fallbackBlock +
        '<div class="lanternCanonicalCardOverlay" aria-hidden="true">' +
          '<div class="lanternCanonicalCardGradient"></div>' +
          '<div class="lanternCanonicalCardCaption">' +
            captionInner +
          '</div>' +
        '</div>' +
        (badgeLayer ? '<div class="lanternCanonicalCardBadgeLayer">' + badgeLayer + '</div>' : '') +
      '</div>';
    return inner;
  }

  function compactFaceSpec(model, shell) {
    return { kind: 'rail', canonicalModel: model, shell: shell || {} };
  }

  function normalizeFeedItemToFaceModel(item) {
    item = item || {};
    var type = String(item.type || 'news').toLowerCase();
    var iso = item.approvedAt || item.createdAt || item.created_at || item.approved_at || null;
    var authorRaw = String(
      item.authorPublicLabel || item.author_public_label || item.authorDisplayName || item.display_name || item.author_name || item.character_name || ''
    ).trim();
    var slot = item.contentSlot || {};
    var avatarAccountKey = String(
      item.authorAvatarKey || item.author_avatar_key || item.authorId || item.author_id || item.actor_id || item.character_name || ''
    ).trim();
    if (global.LanternAvatar && typeof global.LanternAvatar.normalizeAvatarAccountKey === 'function') {
      avatarAccountKey = global.LanternAvatar.normalizeAvatarAccountKey(avatarAccountKey);
    }
    var isGameAchievement =
      type === 'game_score' || type === 'achievement' || type === 'leaderboard' ||
      !!slot.gameAchievement;

    // Prompt #210 — game achievement/score cards ALWAYS use canonical game artwork (not mission/generic).
    var gameArtUrl = '';
    if (isGameAchievement && global.LANTERN_GAME_CATALOG && typeof global.LANTERN_GAME_CATALOG.artworkUrl === 'function') {
      gameArtUrl = global.LANTERN_GAME_CATALOG.artworkUrl(slot.gameId || slot.game_id || slot.gameName || slot.game_name || item.title) || '';
    }
    if (isGameAchievement && !gameArtUrl && (slot.gameArtworkUrl || slot.imageUrl || item.imageUrl)) {
      gameArtUrl = String(slot.gameArtworkUrl || slot.imageUrl || item.imageUrl || '').trim();
    }

    var headline = String(slot.headline || item.title || 'Achievement').trim();
    var scoreLine = '';
    if (isGameAchievement) {
      scoreLine = String(slot.scoreDisplay || slot.score || slot.result || slot.achievement || item.summary || item.body || '').trim();
    }

    var isShout =
      type === 'shoutout' || type === 'shout_out' || type === 'shout-out' || type === 'recognition';
    var desc = isGameAchievement
      ? scoreLine
      : (type === 'poll'
        ? 'Tap to vote'
        : (isShout
          ? shoutOutCompactRow3Preview(item)
          : getExploreDescriptionPreview({
              title: item.title,
              summary: item.summary,
              body: item.body,
              description: item.description,
              type: item.type,
            })));

    var missionId = String(
      slot.missionId || slot.mission_id || item.missionId || item.mission_id || ''
    ).trim();
    var missionImageUrl = isGameAchievement
      ? (gameArtUrl || item.imageUrl || item.image_url)
      : (item.imageUrl || item.image_url);
    var missionThumb = isGameAchievement ? (gameArtUrl || item.thumbnailUrl) : item.thumbnailUrl;
    if (!isGameAchievement && type === 'mission' && !resolveCardFaceImageUrl({
      imageUrl: missionImageUrl,
      thumbnailUrl: missionThumb,
      type: 'mission',
    })) {
      var builtInCover = builtInMissionCoverUrl(missionId);
      if (builtInCover) {
        missionImageUrl = builtInCover;
        missionThumb = builtInCover;
      }
    }

    return {
      id: item.id,
      missionId: missionId || undefined,
      type: item.type || 'news',
      title: isGameAchievement ? headline : (item.title || 'Untitled'),
      author: authorRaw,
      authorPublicLabel: String(item.authorPublicLabel || item.author_public_label || '').trim(),
      authorRole: String(item.authorRole || item.author_role || item.authorType || item.author_type || '').trim(),
      character_name: avatarAccountKey,
      author_name: String(item.author_name || item.authorDisplayName || authorRaw || '').trim(),
      authorAvatarKey: avatarAccountKey,
      authorId: item.authorId || item.author_id || item.actor_id || null,
      _canonicalAvatar: item._canonicalAvatar,
      dateIso: iso,
      dateMeta: formatCompactDate(iso),
      descriptionPreview: desc,
      exploreOverlay: true,
      gameAchievementOverlay: !!isGameAchievement,
      thumbnailUrl: missionThumb,
      imageUrl: missionImageUrl,
      url: item.url,
      fallbackType: isGameAchievement ? 'create' : (item.type || 'news'),
      /* Prompt #222 — ULHC type icon resolved in buildCanonicalCardFaceHtml via resolveUlhcTypeBadge. */
      typeBadge: '',
      stateBadge: '',
      reportType: item.type === 'poll' ? 'poll' : item.type === 'mission' ? 'mission_submission' : item.type === 'news' || item.type === 'shoutout' ? 'news' : 'feed_item',
      reportId: item.id != null ? String(item.id) : '',
    };
  }

  function applyFactoryStampToCardElement(cardEl) {
    if (!cardEl || !cardEl.setAttribute) return;
    cardEl.setAttribute('data-lantern-card-factory', CARD_FACTORY);
    cardEl.setAttribute('data-lantern-card-contract-version', CARD_CONTRACT_VERSION);
  }

  var TOPIC_TO_LIBRARY = [
    { keywords: ['robot', 'robotics', 'engineering', 'build', 'machine'], category: 'robotics' },
    { keywords: ['code', 'coding', 'programming', 'script', 'developer'], category: 'coding' },
    { keywords: ['ai', 'artificial intelligence', 'machine learning', 'neural'], category: 'ai' },
    { keywords: ['art', 'design', 'drawing', 'paint', 'creative'], category: 'art' },
    { keywords: ['school', 'student', 'class', 'community', 'news', 'report', 'life'], category: 'school-life' },
    { keywords: ['abstract', 'idea', 'think'], category: 'abstract' }
  ];
  var LIBRARY_IMAGE_COUNTS = { robotics: 3, coding: 3, ai: 3, engineering: 3, art: 3, 'school-life': 3, abstract: 3 };

  function stripHtmlToText(html) {
    return String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  /** Strip layout-affecting shell tokens; semantic classes (pollCard, gamesHubPlayCard, …) remain. */
  function mergeShellExtras(opts) {
    opts = opts || {};
    var raw = String(opts.classNames || '').trim();
    if (!raw) return '';
    return raw.split(/\s+/).filter(Boolean).filter(function (t) {
      if (/^type-/i.test(t)) return false;
      if (t === 'exploreCard--size-wide' || t === 'exploreCard--size-compact' || t === 'exploreCard--size-rail') return false;
      if (t === 'hero' || t === 'compact' || t === 'medium') return false;
      return true;
    }).join(' ');
  }

  function apiBase() {
    return (typeof global !== 'undefined' && typeof global.LANTERN_AVATAR_API !== 'undefined' && global.LANTERN_AVATAR_API !== null) ? String(global.LANTERN_AVATAR_API).replace(/\/$/, '') : null;
  }

  function esc(s) {
    return String(s || '').replace(/[&<>"']/g, function (c) {
      return c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;';
    });
  }

  function truncateMeta(s, max) {
    var t = String(s || '').replace(/\s+/g, ' ').trim();
    if (t.length <= (max || 76)) return t;
    return t.slice(0, (max || 76) - 1) + '…';
  }

  /** Rail title row: keep within two typographic lines (inspectRailContract TITLE_EXCEEDS_TWO_LINES); line-clamp scrollHeight can lie in WebKit. */
  function truncateRailTitleTwoLines(s, maxLen) {
    var t = String(s || '').replace(/\s+/g, ' ').trim();
    var max = maxLen != null ? maxLen : 36;
    if (t.length <= max) return t;
    return t.slice(0, max - 1) + '\u2026';
  }

  /** Rail identity helper — author display string for overlay meta (compact v2 faces). */
  function railIdentityFirstName(displayName) {
    var s = String(displayName || '').replace(/\s+/g, ' ').trim();
    if (!s) return 'Anonymous';
    var i = s.indexOf(' ');
    if (i === -1) return s;
    return s.slice(0, i);
  }

  /**
   * Bottom-right report control on every .exploreCard root. data-report-type / data-report-id on the card.
   * Empty id → button visible but disabled (Pass 1: API only supports subset of types).
   */
  function applyReportControl(cardEl) {
    if (!cardEl || !cardEl.classList || !cardEl.classList.contains('exploreCard')) return;
    if (cardEl.querySelector(':scope > .exploreCardReportBtn')) return;
    var rid = (cardEl.getAttribute('data-report-id') || '').trim();
    var disabled = !rid;
    var btn = global.document.createElement('button');
    btn.type = 'button';
    btn.className = 'exploreCardReportBtn';
    btn.setAttribute('aria-label', disabled ? 'Report unavailable for this item' : 'Report');
    if (disabled) btn.setAttribute('aria-disabled', 'true');
    btn.innerHTML = '<span class="exploreCardReportBtnIcon" aria-hidden="true">\u2691</span>';
    if (disabled) btn.disabled = true;
    if (disabled) cardEl.classList.add('exploreCard--reportDisabled');
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (btn.disabled) return;
      if (global.LanternCardUI && typeof global.LanternCardUI.openReportModal === 'function') {
        global.LanternCardUI.openReportModal({
          reportType: cardEl.getAttribute('data-report-type') || '',
          reportId: cardEl.getAttribute('data-report-id') || ''
        });
      }
    });
    btn.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    cardEl.appendChild(btn);
  }

  /** Sibling report button for game link wraps (button must not be inside <a>). */
  function applyReportControlToOuterWrap(wrapEl) {
    if (!wrapEl || !wrapEl.classList || !wrapEl.classList.contains('exploreCardOuterWrap')) return;
    if (wrapEl.querySelector(':scope > .exploreCardReportBtn')) return;
    var a = wrapEl.querySelector('a.exploreCard');
    if (!a) return;
    var rid = (a.getAttribute('data-report-id') || '').trim();
    var disabled = !rid;
    var btn = global.document.createElement('button');
    btn.type = 'button';
    btn.className = 'exploreCardReportBtn';
    btn.setAttribute('aria-label', disabled ? 'Report unavailable for this item' : 'Report');
    if (disabled) btn.setAttribute('aria-disabled', 'true');
    btn.innerHTML = '<span class="exploreCardReportBtnIcon" aria-hidden="true">\u2691</span>';
    if (disabled) btn.disabled = true;
    if (disabled) wrapEl.classList.add('exploreCardOuterWrap--reportDisabled');
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (btn.disabled) return;
      if (global.LanternCardUI && typeof global.LanternCardUI.openReportModal === 'function') {
        global.LanternCardUI.openReportModal({
          reportType: a.getAttribute('data-report-type') || '',
          reportId: a.getAttribute('data-report-id') || ''
        });
      }
    });
    btn.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    wrapEl.appendChild(btn);
  }

  function enhanceReportControlsIn(rootEl) {
    if (!rootEl || !rootEl.querySelectorAll) return;
    rootEl.querySelectorAll('.exploreCardOuterWrap').forEach(function (w) { applyReportControlToOuterWrap(w); });
    rootEl.querySelectorAll('.exploreCard').forEach(function (card) {
      if (card.closest('.exploreCardOuterWrap') && card.tagName && String(card.tagName).toLowerCase() === 'a') return;
      applyReportControl(card);
    });
    try {
      if (global.LanternCanonicalEnforce && typeof global.LanternCanonicalEnforce.scanAllExploreCards === 'function') {
        var doc = rootEl && rootEl.ownerDocument ? rootEl.ownerDocument : global.document;
        if (global.requestAnimationFrame) {
          global.requestAnimationFrame(function () { global.LanternCanonicalEnforce.scanAllExploreCards(doc); });
        } else {
          global.LanternCanonicalEnforce.scanAllExploreCards(doc);
        }
      }
    } catch (err) {
      if (global.console && global.console.warn) global.console.warn('[LanternCards] canonical counterfeit scan skipped', err);
    }
  }

  /**
   * Prompt #76 — official Mission card cover art (approved, static asset; never regenerate/edit).
   * ONE canonical constant so the path is never scattered across missions.html/teacher.html/Explore.
   * REAL MEDIA ALWAYS WINS: this is consulted only by the fallback tier, after resolveCardFaceImageUrl
   * (real image/thumbnail) has already been checked and came back empty. Relative path (no leading
   * slash) matches the existing app/assets/icons/*.png convention used across the app.
   */
  var MISSION_FALLBACK_COVER_URL = 'assets/mission-card.png';

  /**
   * Prompt #11/#15 — built-in / standard mission artwork by stable mission id.
   * Priority (unchanged): submission media → teacher Mission Card Image → built-in map → generic mission-card.
   * No Reaction Tap mission exists; reaction-tap-card.png remains game catalog art only.
   */
  var BUILT_IN_MISSION_COVER_BY_ID = {
    perm_create_something: 'assets/create-something.png',
    perm_daily_checkin: 'assets/daily-check-in.png',
    tmission_1773760134919_yy72fc: 'assets/interview-family.png',
    perm_first_game: 'assets/first-game-played.png',
    tmission_1773676581540_qzl0kx: 'assets/first-photo.png',
    perm_show_something_cool: 'assets/something-cool.png',
    tmission_1773763739628_hhzqrr: 'assets/stem-today.png',
    perm_teach_us_something: 'assets/teach-us.png',
    quick_hidden_nugget: 'assets/hidden-nugget.png',
    perm_create_a_poll: 'assets/make-poll.png',
    perm_explain_something: 'assets/explain-something.png',
    perm_grade_reflection: 'assets/grade-reflection.png',
    tmission_1773626540637_abm6oh: 'assets/help-someone.png',
    tmission_1773860977399_p9ilb3: 'assets/random-kindness.png',
    perm_report_good_news: 'assets/good-news.png',
    perm_thank_you: 'assets/thank-you-letter.png',
    perm_shoutout_someone: 'assets/shout-out-card.png',
    perm_handbook_trivia: 'assets/handbook-triva-card.png',
    perm_local_history_trivia: 'assets/history-trivia-card.png',
    perm_srp_safety: 'assets/srp-safety.png',
    perm_seven_habits: 'assets/lantern-trivia-card.png',
    perm_fight_song: 'assets/fight-song.png',
  };

  function builtInMissionCoverUrl(missionId) {
    var id = String(missionId || '').trim();
    if (!id) return '';
    return BUILT_IN_MISSION_COVER_BY_ID[id] || '';
  }

  /** Fallback cover for a mission face: specific built-in art when known, else generic mission-card. */
  function missionCoverFallbackUrl(missionId) {
    return builtInMissionCoverUrl(missionId) || MISSION_FALLBACK_COVER_URL;
  }

  function getDefaultImageKey(type) {
    var t = (type || '').toLowerCase();
    if (t === 'poll') return 'default/default_poll.png';
    if (t === 'news') return 'default/default_news.png';
    if (t === 'creation' || t === 'create') return 'default/default_creation.png';
    if (t === 'explain') return 'default/default_explain.png';
    if (t === 'shoutout' || t === 'shout_out' || t === 'shout-out' || t === 'recognition') return 'default/default_shoutout.png';
    return 'default/default_creation.png';
  }

  function getDefaultImageUrl(type) {
    var b = apiBase();
    return b ? b + '/api/media/image?key=' + encodeURIComponent(getDefaultImageKey(type || 'creation')) : '';
  }

  function getDefaultAvatarImageKey() {
    return 'default/default_avatar.png';
  }

  /** Inline SVG when Worker media is unavailable — never blank. */
  function svgDefaultAvatarDataUri() {
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#2a3a52"/><circle cx="32" cy="26" r="12" fill="rgba(255,255,255,.35)"/><ellipse cx="32" cy="52" rx="18" ry="14" fill="rgba(255,255,255,.38)"/></svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  /** Canonical default author avatar for cards — always resolves to a URL or data URI. */
  function getDefaultAvatarImageUrl() {
    var b = apiBase();
    return b ? b + '/api/media/image?key=' + encodeURIComponent(getDefaultAvatarImageKey()) : svgDefaultAvatarDataUri();
  }

  /** Row-3 parity: legacy emoji `avatar` → single data-URI img (same node shape as photo URLs). */
  function emojiAvatarSvgDataUri(emoji) {
    var e = String(emoji != null ? emoji : '').trim().slice(0, 12);
    if (!e) return '';
    if (/^https?:\/\//i.test(e) || e.indexOf('data:') === 0 || (e.charAt(0) === '/' && e.length > 1)) return '';
    var safe = e.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#2a3a52"/><text x="32" y="40" text-anchor="middle" font-size="26" font-family="Segoe UI Emoji,Apple Color Emoji,Noto Color Emoji,system-ui,sans-serif">' + safe + '</text></svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  function accountKeyFromCardModel(p) {
    p = p || {};
    if (global.LanternAvatar && typeof global.LanternAvatar.accountKeyFromItem === 'function') {
      return global.LanternAvatar.accountKeyFromItem(p);
    }
    return String(p.authorAvatarKey || p.author_avatar_key || p.authorId || p.character_name || '').trim();
  }

  /**
   * Row-3 avatar chip: identity rows MUST use LanternAvatar — pre-resolve `_canonicalAvatar` on the model
   * (see LanternAvatar.attachCanonicalAvatarsToItems). Do not pass custom_avatar / avatar_image / URL fields here.
   * Non-account rails (games, missions label) omit character_name and use decorative emoji only.
   * Prompt #149 — approved image or ONE canonical placeholder. No sun/initials/Anonymous icon mix.
   */
  function buildExploreAuthorAvatarHtml(p) {
    p = p || {};
    var def = getDefaultAvatarImageUrl();
    var svgFb = svgDefaultAvatarDataUri();
    var frameVal = String(p.frame || 'none').trim().replace(/_/g, '-').replace(/[^a-z0-9-]/gi, '') || 'none';
    var size = String(p.identitySize || p.avatarSize || 'md').trim().toLowerCase();
    if (size !== 'xs' && size !== 'sm' && size !== 'lg') size = 'md';
    var ak = accountKeyFromCardModel(p);
    if (ak && !p._canonicalAvatar && global.LANTERN_AVATAR_STRICT_IDENTITY && global.console && global.console.warn) {
      global.console.warn('[LanternCards] Identity chip missing _canonicalAvatar — call LanternAvatar.attachCanonicalAvatarsToItems first:', ak);
    }
    var primary = '';
    if (p._canonicalAvatar && typeof p._canonicalAvatar === 'object') {
      primary = (p._canonicalAvatar.imageUrl && String(p._canonicalAvatar.imageUrl).trim()) ? String(p._canonicalAvatar.imageUrl).trim() : '';
    }
    var src = primary || def;
    return '<span class="identity-chip frame-' + frameVal + '" data-identity-size="' + size + '">' +
      '<img class="exploreCardAvatarImg" src="' + esc(src) + '" alt="" data-lc-av-def="' + esc(def) + '" data-lc-av-svg="' + esc(svgFb) + '" ' +
      'onerror="var el=this;var d=el.getAttribute(\'data-lc-av-def\');var s=el.getAttribute(\'data-lc-av-svg\');if(el.dataset.lc===\'1\'){el.onerror=null;el.src=s;return;}el.dataset.lc=\'1\';el.src=d||s;">' +
      '</span>';
  }

  function getTopicLibraryKey(title, description, question) {
    var text = ((title || '') + ' ' + (description || '') + ' ' + (question || '')).toLowerCase();
    if (!text.trim()) return null;
    for (var i = 0; i < TOPIC_TO_LIBRARY.length; i++) {
      var row = TOPIC_TO_LIBRARY[i];
      for (var j = 0; j < row.keywords.length; j++) {
        if (text.indexOf(row.keywords[j]) !== -1) {
          var cat = row.category;
          var n = LIBRARY_IMAGE_COUNTS[cat] || 3;
          var hash = 0;
          for (var k = 0; k < text.length; k++) hash = ((hash << 5) - hash) + text.charCodeAt(k) | 0;
          var idx = (Math.abs(hash) % n) + 1;
          var name = cat === 'school-life' ? 'school-life' : cat;
          return 'library/' + cat + '/' + name + '_' + idx + '.png';
        }
      }
    }
    return null;
  }

  function getTopicLibraryImageUrl(p) {
    var key = getTopicLibraryKey(p.title, p.description, p.question);
    var b = apiBase();
    return key && b ? b + '/api/media/image?key=' + encodeURIComponent(key) : '';
  }

  function getCardImageUrl(p) {
    var resolved = resolveCardFaceImageUrl(p);
    if (resolved) return resolved;
    var type = String((p && (p.fallbackType || p.type || p.mission_type)) || '').toLowerCase();
    if (type === 'mission') {
      return missionCoverFallbackUrl((p && (p.missionId || p.mission_id || p.id)) || '');
    }
    var topicUrl = getTopicLibraryImageUrl(p);
    if (topicUrl) return topicUrl;
    return getDefaultImageUrl(p.fallbackType || p.type || p.mission_type || 'creation');
  }

  function svgSpecForContentType(type) {
    var t = (type || '').toLowerCase();
    if (t === 'news') return { a: '#3a4f6e', b: '#1c2838', label: 'News' };
    if (t === 'shoutout' || t === 'shout_out' || t === 'shout-out' || t === 'recognition') return { a: '#5a4535', b: '#302418', label: 'Shout-Out!' };
    if (t === 'poll') return { a: '#4a3a5c', b: '#261d32', label: 'Poll' };
    if (t === 'teach' || t === 'explain') return { a: '#2a4d45', b: '#182a24', label: 'Learn' };
    if (t === 'activity' || t === 'mission' || t === 'school') return { a: '#3d4f36', b: '#222818', label: 'School' };
    if (t === 'spotlight') return { a: '#5a4535', b: '#302418', label: 'Spotlight' };
    if (t === 'create' || t === 'image' || t === 'video' || t === 'link' || t === 'project' || t === 'webapp' || t === 'creation') return { a: '#2a4f5c', b: '#182830', label: 'Create' };
    return { a: '#2c3a4f', b: '#161d28', label: 'Lantern' };
  }

  function svgTypeFallbackDataUri(type) {
    var s = svgSpecForContentType(type);
    var lab = String(s.label || 'Lantern').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="' + s.a + '"/><stop offset="100%" stop-color="' + s.b + '"/></linearGradient></defs><rect width="640" height="360" fill="url(#g)"/><text x="320" y="185" text-anchor="middle" fill="rgba(255,255,255,.38)" font-size="21" font-family="system-ui,sans-serif">' + lab + '</text></svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  function svgUniversalLanternDataUri() {
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360"><defs><linearGradient id="u" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#1a2d48"/><stop offset="50%" stop-color="#2a2440"/><stop offset="100%" stop-color="#1a3830"/></linearGradient></defs><rect width="640" height="360" fill="url(#u)"/><circle cx="320" cy="165" r="34" fill="none" stroke="rgba(242,194,48,.45)" stroke-width="3"/><text x="320" y="228" text-anchor="middle" fill="rgba(255,255,255,.48)" font-size="24" font-weight="700" font-family="system-ui,sans-serif">Lantern</text></svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  function buildGuaranteedExploreImageHtml(contentType, primaryUrl) {
    var typeSvg = svgTypeFallbackDataUri(contentType);
    var uniSvg = svgUniversalLanternDataUri();
    var def = getDefaultImageUrl(contentType);
    var remote = String(primaryUrl || '').trim() || String(def || '').trim() || typeSvg;
    return '<img class="lcCardImg" src="' + esc(remote) + '" alt="" data-lc-t="' + esc(typeSvg) + '" data-lc-u="' + esc(uniSvg) + '" onerror="var el=this;var t=el.getAttribute(\'data-lc-t\');var u=el.getAttribute(\'data-lc-u\');if(el.dataset.lc!==\'1\'){el.dataset.lc=\'1\';el.src=t;}else{el.src=u;}">';
  }

  /** Canonical card stamp for rail shells — opts.lanternCardType overrides class inference. */
  function inferLanternCardTypeFromOpts(opts, classNames) {
    opts = opts || {};
    if (opts.lanternCardType != null && String(opts.lanternCardType).trim() !== '') {
      return String(opts.lanternCardType).trim();
    }
    var s = String(classNames || '');
    if (/\bmissionSpotlightCard\b/.test(s)) return 'mission';
    if (/\bpollCard\b/.test(s)) return 'poll';
    if (/\bgamesHubPlayCard\b/.test(s)) return 'game_hub';
    if (/\bgameHighlightCard\b/.test(s)) return 'game_highlight';
    if (/\bexploreCard--activityPulse\b/.test(s)) return 'activity';
    if (/\bexploreCard--gamesLbSummary\b/.test(s)) return 'games_leaderboard';
    if (/\bexploreCardProfileRail\b/.test(s)) return 'profile_rail';
    if (/\bexploreCard--cosmeticRail\b/.test(s)) return 'cosmetic';
    if (/\bexploreCard--leaderboardChip\b/.test(s)) return 'leaderboard_chip';
    if (/\bexploreCard--displayNewsTile\b/.test(s)) return 'display_news';
    if (/\brailStressVerifyFake\b/.test(s)) return 'verify_stress_creation';
    var m = s.match(/\btype-([a-z0-9_-]+)\b/i);
    if (m) return m[1];
    return 'rail';
  }

  /**
   * THE single student-facing compact card markup grammar (contract v2).
   * kind === 'detail' produces moderation/detail previews excluded from compact-face enforcement.
   */
  function studentFacingCardHtml(spec) {
    spec = spec || {};
    var kind = spec.kind;

    if (kind === 'detail') {
      var detHtml = spec.detailHtml != null ? String(spec.detailHtml) : '';
      return '<div class="lanternDetailSurface" data-lantern-card-surface="detail">' + detHtml + '</div>';
    }

    if (kind === 'rail') {
      var model = spec.canonicalModel || {};
      var opts = spec.shell || {};
      var innerHtml = buildCanonicalCardFaceHtml(model, opts);
      var extraR = mergeShellExtras(opts);
      var shellClass = (CANONICAL_SHELL_CLASS + (extraR ? ' ' + extraR : '')).replace(/\s+/g, ' ').trim();
      var ct = inferLanternCardTypeFromOpts(opts, shellClass);
      if (model.type && !opts.lanternCardType) ct = String(model.type);
      var dataAttrs = opts.dataAttrs || {};
      var partsD = [];
      for (var k in dataAttrs) {
        if (dataAttrs.hasOwnProperty(k) && dataAttrs[k] !== '') {
          partsD.push(' data-' + k.replace(/([A-Z])/g, '-$1').toLowerCase().replace(/^-/, '') + '="' + esc(String(dataAttrs[k])) + '"');
        }
      }
      var dataStr = partsD.join('');
      var rt = opts.reportType != null ? esc(String(opts.reportType)) : (model.reportType != null ? esc(String(model.reportType)) : '');
      var rid = opts.reportId != null ? esc(String(opts.reportId)) : (model.reportId != null ? esc(String(model.reportId)) : (model.id != null ? esc(String(model.id)) : ''));
      var reportData = ' data-report-type="' + rt + '" data-report-id="' + rid + '"';
      var canonicalStamp = ' data-lantern-card="true" data-lantern-brand="lantern" data-lantern-card-factory="' + CARD_FACTORY + '" data-lantern-card-contract-version="' + CARD_CONTRACT_VERSION + '" data-lantern-card-type="' + esc(ct) + '" data-lantern-card-surface="face"';
      var a11y = '';
      if (opts.role) a11y += ' role="' + esc(String(opts.role)) + '"';
      if (opts.tabIndex != null && opts.tabIndex !== '') a11y += ' tabindex="' + esc(String(opts.tabIndex)) + '"';
      if (opts.ariaLabel) a11y += ' aria-label="' + esc(String(opts.ariaLabel)) + '"';
      var navHref = opts.navHref != null ? String(opts.navHref).trim() : '';
      if (navHref) {
        return '<div class="exploreCardOuterWrap" data-lantern-card-wrap="true">' +
          '<a href="' + esc(navHref) + '" class="' + shellClass + '"' + canonicalStamp + dataStr + reportData + a11y + '>' + innerHtml + '</a></div>';
      }
      return '<div class="' + shellClass + '"' + canonicalStamp + dataStr + reportData + a11y + '>' + innerHtml + '</div>';
    }

    throw new Error('[LanternCards] studentFacingCardHtml: unknown kind "' + kind + '"');
  }

  /** Data-only spec for feed posts; DOM via createStudentCard(specFeedPostRail(p, options)) + wireFeedPostCard. */
  function specFeedPostRail(p, options) {
    p = p || {};
    options = options || {};
    var parts = buildFeedPostParts(p, Object.assign({}, options, { mode: CARD_MODE.RAIL }));
    var pid = String(p.id || '').trim();
    var rType = 'feed_post';
    var rId = pid;
    if (pid.indexOf('mission_') === 0) {
      rType = 'mission_submission';
      rId = pid.replace(/^mission_/, '');
    } else if (pid.indexOf('news_') === 0) {
      rType = 'news';
      rId = pid.replace(/^news_/, '');
    } else if (pid.indexOf('learning_') === 0) {
      rType = 'learning';
      rId = pid.replace(/^learning_/, '') || pid;
    }
    var extraFeed = mergeShellExtras({ classNames: options.extraClass || '' });
    var spec = compactFaceSpec(parts.model, {
      classNames: extraFeed,
      reportType: rType,
      reportId: rId,
      lanternCardType: String((p && p.type) ? p.type : 'link'),
      dataAttrs: options.dataAttrs
    });
    spec._feedPostWire = { p: p, options: options, parts: parts };
    return spec;
  }

  /** Apply feed-post behaviors after createStudentCard(specFeedPostRail(...)). */
  function wireFeedPostCard(card, wire) {
    if (!card || !wire) return card;
    var p = wire.p || {};
    var options = wire.options || {};
    var parts = wire.parts || buildFeedPostParts(p, Object.assign({}, options, { mode: CARD_MODE.RAIL }));
    applyReportControl(card);
    var linkUrl = (options.openUrlOverride !== undefined ? options.openUrlOverride : (p.url || '').trim());
    var openUrl = linkUrl || (parts.isMissionCard ? 'missions.html' : '');
    if (options.noNavigate) openUrl = '';
    if (typeof options.onCardActivate === 'function') {
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-label', 'View: ' + (p.title || 'item'));
      card.classList.add('exploreCard--activatable');
      card.addEventListener('click', function (e) {
        if (e.target.closest('.exploreCardReportBtn')) return;
        if (e.target.closest('a[href]')) return;
        options.onCardActivate(p, card, e);
      });
      card.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          options.onCardActivate(p, card, e);
        }
      });
    }
    if (openUrl && typeof options.onCardActivate !== 'function') {
      card.setAttribute('role', 'link');
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-label', 'Open: ' + (p.title || 'creation'));
      card.addEventListener('click', function (e) {
        if (e.target.closest('.exploreCardReportBtn')) return;
        if (e.target.closest('a[href]')) return;
        e.preventDefault();
        if (openUrl.indexOf('http') === 0) global.open(openUrl, '_blank', 'noopener');
        else global.location.href = openUrl;
      });
      card.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (openUrl.indexOf('http') === 0) global.open(openUrl, '_blank', 'noopener');
          else global.location.href = openUrl;
        }
      });
    }
    var rh = options.routeHelp || p.lantern_route;
    if (rh && global.LanternRouteHelp && global.LanternRouteHelp.tagElement) {
      global.LanternRouteHelp.tagElement(card, rh);
    }
    return card;
  }

  function materializeFeedPostCard(p, options) {
    options = options || {};
    if (options.cardPreview !== undefined && options.mode === undefined) {
      throw new Error('[LanternCards] cardPreview is removed. Pass mode: LanternCards.CARD_MODE.RAIL. See docs/LANTERN_SYSTEM_CONTEXT.md §10');
    }
    var spec = specFeedPostRail(p, options);
    var wire = spec._feedPostWire;
    delete spec._feedPostWire;
    var card = createStudentCard(spec);
    if (!card) return null;
    return wireFeedPostCard(card, wire);
  }

  function createStudentCard(spec) {
    spec = spec || {};
    var clean = {};
    for (var ck in spec) {
      if (spec.hasOwnProperty(ck) && ck !== '_feedPostWire') clean[ck] = spec[ck];
    }
    var html = studentFacingCardHtml(clean);
    var w = global.document.createElement('div');
    w.innerHTML = String(html || '').trim();
    var el = w.firstElementChild;
    if (el && el.classList && el.classList.contains('exploreCard')) {
      applyFactoryStampToCardElement(el);
    } else if (el && el.querySelector) {
      var card = el.querySelector('.exploreCard');
      if (card) applyFactoryStampToCardElement(card);
    }
    return el;
  }

  function createCanonicalCardFace(model, shellOpts) {
    return createStudentCard(compactFaceSpec(model, shellOpts || {}));
  }

  /** Shallow merge — preview/thumbnail first for card faces; full_image_url last (detail views may prefer full). */
  function normalizeNewsMediaItemForExplore(n) {
    if (!n || typeof n !== 'object') return {};
    var out = {};
    for (var k in n) {
      if (Object.prototype.hasOwnProperty.call(n, k)) out[k] = n[k];
    }
    var thumb = String(out.preview_url || out.thumbnail_url || out.thumbnail || '').trim();
    if (thumb) out.image_url = thumb;
    else {
      var img = String(out.image_url || out.image || '').trim();
      if (!img) {
        var full = String(out.full_image_url || '').trim();
        if (full) out.image_url = full;
      }
    }
    return out;
  }

  function buildNewsCardVisualBlockFromItem(n, eFn, options) {
    options = options || {};
    var e = eFn || esc;
    var mediaItem = normalizeNewsMediaItemForExplore(n);
    var typeFb = svgTypeFallbackDataUri('news');
    var uniFb = svgUniversalLanternDataUri();
    var media = global.LanternMedia && global.LanternMedia.renderMedia ? global.LanternMedia.renderMedia(mediaItem, { esc: e, variant: 'explore', exploreTypeFallback: typeFb, exploreUniversalFallback: uniFb }) : { mediaBlock: '' };
    var inner = (media && media.mediaBlock) ? String(media.mediaBlock).trim() : '';
    var visualClass = 'exploreCardVisual' + (options.exploreNewsExploreRail ? ' exploreCardVisual--newsExploreRail' : '');
    var badge = '<span class="exploreCardTypeBadge">' + TYPE_BADGES.news + '</span>';
    if (inner) return '<div class="' + visualClass + '">' + badge + inner + '</div>';
    var fallbackImg = String(mediaItem.image_url || mediaItem.preview_url || mediaItem.full_image_url || '').trim() || getDefaultImageUrl('news');
    return '<div class="' + visualClass + '">' + badge + buildGuaranteedExploreImageHtml('news', fallbackImg) + '</div>';
  }

  function buildFeedPostParts(p, options) {
    options = options || {};
    var isMissionCard = (p.id && String(p.id).indexOf('mission_') === 0);
    var authorRaw = String(p.display_name || p.character_name || p.author_name || '').trim() || 'Anonymous';
    var iso = p.approved_at || p.created_at || '';
    var desc = getExploreDescriptionPreview({
      title: p.title,
      summary: p.summary || p.card_meta || '',
      body: p.body || p.caption || '',
      type: p.type,
    });
    var stateBadge = p.teacher_pick ? '🏆' : (p.teacher_featured ? '🌟' : '');
    var model = {
      id: p.id,
      type: p.type || 'link',
      title: p.title || 'Untitled',
      author: authorRaw,
      character_name: String(p.character_name || authorRaw || '').trim(),
      author_name: String(p.author_name || authorRaw || '').trim(),
      _canonicalAvatar: p._canonicalAvatar,
      dateIso: iso,
      dateMeta: formatCompactDate(iso),
      descriptionPreview: desc,
      exploreOverlay: true,
      thumbnailUrl: resolveCardFaceImageUrl(p),
      imageUrl: String(p.image_url || p.imageUrl || '').trim(),
      url: String(p.url || '').trim(),
      video_url: p.video_url,
      link_url: p.link_url,
      fallbackType: p.type || 'link',
      typeBadge: TYPE_BADGES[p.type] || '',
      stateBadge: stateBadge,
    };
    return { model: model, isMissionCard: isMissionCard };
  }

  function specNewsRailCard(n, escFn, authorLabelText, isActive) {
    var iso = n.approved_at || n.created_at || '';
    var mediaItem = normalizeNewsMediaItemForExplore(n);
    var displayNm = String((n.author_public_label || n.authorPublicLabel || n.author_name || '').trim() || authorLabelText || '');
    var avatarKey = String(n.author_avatar_key || n.authorAvatarKey || n.character_name || n.actor_id || '').trim();
    if (global.LanternAvatar && typeof global.LanternAvatar.normalizeAvatarAccountKey === 'function') {
      avatarKey = global.LanternAvatar.normalizeAvatarAccountKey(avatarKey);
    }
    var desc = getExploreDescriptionPreview({
      title: n.title,
      summary: n.summary || '',
      body: n.body || '',
      type: 'news',
    });
    return compactFaceSpec({
      id: n.id,
      type: String(n.type || '').toLowerCase() === 'shout_out' || String(n.type || '').toLowerCase() === 'shoutout' ? 'shout_out' : 'news',
      title: n.title || 'Untitled',
      author: displayNm,
      authorPublicLabel: String(n.author_public_label || n.authorPublicLabel || '').trim(),
      authorRole: String(n.author_type || n.authorRole || '').trim(),
      character_name: avatarKey,
      authorAvatarKey: avatarKey,
      author_name: displayNm,
      _canonicalAvatar: n._canonicalAvatar,
      dateIso: iso,
      dateMeta: formatCompactDate(iso),
      descriptionPreview: desc,
      exploreOverlay: true,
      thumbnailUrl: resolveCardFaceImageUrl(Object.assign({}, mediaItem, { type: 'news' })),
      imageUrl: mediaItem.image_url,
      fallbackType: 'news',
      typeBadge: TYPE_BADGES.news,
    }, {
      classNames: 'exploreCard--previewRail exploreCard--newsExploreRail' + (isActive ? ' studioScrollerCardActive' : ''),
      lanternCardType: 'news',
      dataAttrs: { 'route-surface': 'explore_happening_news', 'route-pipeline': 'approved_news' },
      reportType: 'news',
      reportId: (n && n.id != null) ? String(n.id) : ''
    });
  }

  /** Studio / moderation news preview — detail surface, not compact face. */
  function specOpenedNews(opts) {
    opts = opts || {};
    var eFn = opts.esc || esc;
    var bodySnippet = truncateMeta(stripHtmlToText(opts.bodyHtml), 120);
    var detHtml = '<div class="lanternDetailPreview">' +
      '<h3 class="lanternDetailPreviewTitle">' + eFn(opts.title || 'Untitled') + '</h3>' +
      (opts.featuredMediaHtml ? '<div class="lanternDetailPreviewMedia">' + opts.featuredMediaHtml + '</div>' : '') +
      '<p class="lanternDetailPreviewBody">' + eFn(bodySnippet) + '</p>' +
      '<p class="lanternDetailPreviewMeta">' + eFn([opts.category, opts.dateStr, opts.badgeText].filter(Boolean).join(' · ')) + '</p>' +
      '</div>';
    return { kind: 'detail', detailHtml: detHtml };
  }

  function specPollRailCard(poll, options) {
    options = options || {};
    var p = poll || {};
    var iso = p.approved_at || p.created_at || '';
    var pollAuthorRaw = String((p.author_public_label || p.authorPublicLabel || p.author_name || p.display_name || '').trim());
    if (pollAuthorRaw.toLowerCase() === 'poll') pollAuthorRaw = '';
    var pollAvatarKey = String(p.author_avatar_key || p.authorAvatarKey || p.character_name || '').trim();
    if (global.LanternAvatar && typeof global.LanternAvatar.normalizeAvatarAccountKey === 'function') {
      pollAvatarKey = global.LanternAvatar.normalizeAvatarAccountKey(pollAvatarKey);
    }
    if (pollAvatarKey.toLowerCase() === 'poll') pollAvatarKey = '';
    // Prompt #215 — compact rail/card: question + art only; do not flatten choices into description.
    var desc = getExploreDescriptionPreview({
      title: p.question || 'Poll',
      summary: (p.card_meta && String(p.card_meta).trim()) || '',
      body: '',
      type: 'poll',
    });
    var activeCls = options.isActive ? ' studioScrollerCardActive' : '';
    return compactFaceSpec({
      id: p.id,
      type: 'poll',
      title: p.question || 'Poll',
      author: pollAuthorRaw,
      authorPublicLabel: String(p.author_public_label || p.authorPublicLabel || '').trim(),
      authorRole: String(p.author_type || p.authorRole || '').trim(),
      character_name: pollAvatarKey,
      authorAvatarKey: pollAvatarKey,
      author_name: pollAuthorRaw,
      _canonicalAvatar: p._canonicalAvatar,
      dateIso: iso,
      dateMeta: formatCompactDate(iso),
      descriptionPreview: desc,
      exploreOverlay: true,
      thumbnailUrl: resolveCardFaceImageUrl({ question: p.question, title: p.question, image_url: p.image_url, type: 'poll' }),
      image_url: p.image_url,
      fallbackType: 'poll',
      typeBadge: TYPE_BADGES.poll,
    }, {
      classNames: 'pollCard' + activeCls,
      lanternCardType: 'poll',
      reportType: 'poll',
      reportId: (p && p.id != null) ? String(p.id) : ''
    });
  }

  /** Poll “opened” simulator — same structure/classes as explore poll modal (preview only). */
  function buildPollDraftOpenedPreviewHtml(poll, escFn) {
    var e = escFn || esc;
    var p = poll || {};
    var fk = String(p.fallback_key || 'poll').trim();
    var typeForDefault = fk === 'news' ? 'news' : fk === 'creation' ? 'creation' : fk === 'generic' ? 'creation' : (fk === 'shoutout' || fk === 'shout_out' || fk === 'shout-out') ? 'shoutout' : fk === 'explain' ? 'explain' : 'poll';
    var imgUrl = String(p.image_url || '').trim();
    if (!imgUrl) imgUrl = getDefaultImageUrl(typeForDefault);
    var q = e(p.question || '');
    var choices = p.choices || [];
    var html = '<div class="pollModal pollModal--studioPreview">';
    html += '<div class="pollModalImageWrap"><img class="pollModalImage" src="' + e(imgUrl) + '" alt="" /></div>';
    html += '<div class="pollModalQuestion">' + q + '</div><div class="pollModalChoices">';
    for (var i = 0; i < choices.length; i++) {
      html += '<button type="button" class="pollChoiceBtn" disabled tabindex="-1">' + e(choices[i]) + '</button>';
    }
    html += '</div><p class="pollStudioOpenedHint">After approval, votes and nuggets work like on Lantern.</p></div>';
    return html;
  }

  function wirePollRailCard(card, poll, options) {
    if (!card) return null;
    options = options || {};
    var p = poll || {};
    var isReturned = !!options.isReturned || (String(p.card_meta || '').indexOf('Returned to revise') === 0) || !!(options.returnedMeta && String(options.returnedMeta).trim());
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', isReturned ? 'Revise and resubmit poll: ' + (p.question || '') : 'Open poll: ' + (p.question || ''));
    card.classList.add('exploreCard--activatable');
    applyReportControl(card);
    card.addEventListener('click', function (e) {
      if (e.target.closest('.exploreCardReportBtn')) return;
      if (typeof options.onActivate === 'function') options.onActivate(p);
    });
    card.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (e.target.closest('.exploreCardReportBtn')) return;
        if (typeof options.onActivate === 'function') options.onActivate(p);
      }
    });
    if (global.LanternRouteHelp && global.LanternRouteHelp.tagElement) {
      global.LanternRouteHelp.tagElement(card, { surface: 'explore_poll' });
    }
    return card;
  }

  function materializePollRailCard(poll, options) {
    var card = createStudentCard(specPollRailCard(poll, options || {}));
    return wirePollRailCard(card, poll, options || {});
  }

  function specMissionSpotlightRail(mission) {
    var m = mission || {};
    var mid = (m && m.id != null) ? String(m.id) : '';
    return compactFaceSpec({
      id: m.id,
      type: 'mission',
      title: m.title || 'Mission',
      author: 'Missions',
      dateMeta: '+1 Nugget · Quick mission',
      thumbnailUrl: resolveCardFaceImageUrl({ title: m.title, description: m.description, image_url: m.image_url, image: m.image, type: 'mission' }),
      image_url: m.image_url,
      fallbackType: 'mission',
      typeBadge: TYPE_BADGES.create,
    }, {
      classNames: 'missionSpotlightCard',
      lanternCardType: 'mission',
      // Prompt #117 — catalog mission cards are not user posts; do not expose Report.
      reportType: '',
      reportId: ''
    });
  }

  function wireMissionSpotlightRail(card, mission, options) {
    if (!card) return null;
    options = options || {};
    var m = mission || {};
    applyReportControl(card);
    if (options.studioActivate) {
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      var onAct = typeof options.onActivate === 'function' ? options.onActivate : null;
      card.addEventListener('click', function (e) {
        if (e.target.closest('.exploreCardReportBtn')) return;
        e.preventDefault();
        if (onAct) onAct(m, card, e);
      });
      card.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (e.target.closest('.exploreCardReportBtn')) return;
          if (onAct) onAct(m, card, e);
        }
      });
      if (global.LanternRouteHelp && global.LanternRouteHelp.tagElement) {
        global.LanternRouteHelp.tagElement(card, { surface: 'contribute_mission_rail', pipeline: 'studio_mission_select' });
      }
    } else {
      card.setAttribute('role', 'link');
      card.setAttribute('tabindex', '0');
      card.addEventListener('click', function (e) {
        if (e.target.closest('.exploreCardReportBtn')) return;
        global.location.href = 'missions.html';
      });
      card.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (e.target.closest('.exploreCardReportBtn')) return;
          global.location.href = 'missions.html';
        }
      });
      if (global.LanternRouteHelp && global.LanternRouteHelp.tagElement) {
        global.LanternRouteHelp.tagElement(card, { surface: 'explore_mission_spotlight', pipeline: 'active_mission' });
      }
    }
    return card;
  }

  function materializeMissionSpotlightRail(mission, options) {
    var card = createStudentCard(specMissionSpotlightRail(mission || {}));
    return wireMissionSpotlightRail(card, mission, options || {});
  }

  /** Studio / moderation mission submission preview — detail surface. */
  function specOpenedMissionDraft(missionTitle, type, imageUrl, videoUrl, linkUrl, contentText, emptyPlaceholder) {
    var e2 = esc;
    var mt = e2(String(missionTitle || 'Mission'));
    var draftType = type || 'create';
    var isEmpty = !String(contentText || '').trim() && !String(imageUrl || '').trim() && !String(videoUrl || '').trim() && !String(linkUrl || '').trim();
    var metaPh = truncateMeta(String(emptyPlaceholder || 'Add your response — preview updates here.').replace(/\s+/g, ' ').trim(), 120) || '';
    var bodySnippet = isEmpty ? metaPh : truncateMeta(String(contentText || '').replace(/\s+/g, ' ').trim(), 200);
    var imgSrc = String(imageUrl || '').trim() || getDefaultImageUrl(draftType);
    var detHtml = '<div class="lanternDetailPreview">' +
      '<h3 class="lanternDetailPreviewTitle">' + mt + '</h3>' +
      '<div class="lanternDetailPreviewMedia"><img src="' + e2(imgSrc) + '" alt="" /></div>' +
      '<p class="lanternDetailPreviewBody">' + e2(bodySnippet) + '</p>' +
      '</div>';
    return { kind: 'detail', detailHtml: detHtml };
  }

  function specIconRailCard(o) {
    o = o || {};
    var muted = o.muted ? ' exploreCardMuted' : '';
    var metaParts = [o.caption || '', o.meta || ''].filter(Boolean);
    var metaOne = truncateMeta(metaParts.join(' · '), 40) || '';
    var idLabel = o.identityLabel != null ? o.identityLabel : o.title;
    var rt = (o && o.reportType != null) ? String(o.reportType) : 'profile_rail';
    var rid = (o && o.reportId != null) ? String(o.reportId) : '';
    var da = o.dataAttrs && typeof o.dataAttrs === 'object' ? o.dataAttrs : {};
    if (o.gameName != null && String(o.gameName).trim() !== '') da.gameName = String(o.gameName);
    var shellOpts = {
      classNames: ('exploreCardProfileRail' + muted + (o.extraClass ? ' ' + String(o.extraClass) : '')).replace(/\s+/g, ' ').trim(),
      reportType: rt,
      reportId: rid,
      dataAttrs: da
    };
    if (o.role) shellOpts.role = o.role;
    if (o.tabIndex != null) shellOpts.tabIndex = o.tabIndex;
    if (o.ariaLabel) shellOpts.ariaLabel = o.ariaLabel;
    return compactFaceSpec({
      type: 'profile_rail',
      title: o.title || '',
      author: idLabel || o.title || '',
      dateMeta: metaOne,
      thumbnailUrl: o.imageUrl || '',
      fallbackType: 'create',
      typeBadge: o.typeBadge != null ? String(o.typeBadge) : '',
    }, shellOpts);
  }

  function specWeeklyPaceLinkCard(href, title, iconEmoji, metaLine, reportId) {
    var metaMerged = truncateMeta([metaLine || '', 'This week →'].filter(Boolean).join(' · '), 40) || 'This week →';
    return specLinkCard(href || 'games.html', {
      type: 'game_highlight',
      title: title || '',
      author: 'Games',
      dateMeta: metaMerged,
      fallbackType: 'create',
      typeBadge: '🌟 Weekly',
    }, 'gameHighlightCard', 'game_highlight', reportId != null ? String(reportId) : '');
  }

  function specGameHubRailCard(o) {
    o = o || {};
    var metaBits = [o.metaOne || '', o.rewardText || ''].filter(Boolean);
    var metaMerged = truncateMeta(metaBits.join(' · '), 40) || '';
    // imageUrl/fallbackType are optional so existing callers (Games hub) keep their exact prior
    // behavior (no image passed -> 'create' fallback chain). Missions passes a real submission
    // image when one exists and fallbackType:'mission' so the official cover art (Prompt #76)
    // is used only when there is truly no real photo — real media still always wins via
    // resolveCardFaceImageUrl, checked before any fallback in buildCanonicalCardFaceHtml.
    return compactFaceSpec({
      type: 'game_hub',
      title: o.title || '',
      // Prompt #81: '' (explicitly no identity label) must stay empty, not fall back to the
      // legacy 'Games' hub-identity default — only a genuinely omitted (null/undefined)
      // hubIdentityLabel still gets that default, so existing Games-hub callers are unaffected.
      author: o.hubIdentityLabel != null ? String(o.hubIdentityLabel) : 'Games',
      dateMeta: metaMerged,
      thumbnailUrl: o.imageUrl || o.thumbnailUrl || '',
      image_url: o.imageUrl || '',
      fallbackType: o.fallbackType || 'create',
      typeBadge: o.typeBadge != null ? String(o.typeBadge) : '🎮 Game',
      stateBadge: o.stateBadge ? String(o.stateBadge) : '',
    }, {
      classNames: ('gamesHubPlayCard ' + mergeShellExtras({ classNames: o.extraClass || '' })).replace(/\s+/g, ' ').trim(),
      lanternCardType: 'game_hub',
      reportType: o.reportType != null ? o.reportType : 'game_hub',
      reportId: o.reportId != null ? o.reportId : '',
      dataAttrs: o.dataAttrs || {},
      role: o.role,
      tabIndex: o.tabIndex,
      ariaLabel: o.ariaLabel
    });
  }

  /** Games page — leaderboard summary rail (scores as single meta line). */
  function specGamesLeaderboardSummaryCard(gameName, gameId, entries) {
    var e = esc;
    var summaryText = (entries && entries.length)
      ? entries.slice(0, 3).map(function (ent, i) {
        return '#' + (i + 1) + ' ' + String(ent.character_name || '') + ' · ' + String(ent.score_display != null ? ent.score_display : ent.score || '');
      }).join(' · ')
      : 'No scores yet this week.';
    return specGameHubRailCard({
      title: gameName || '',
      icon: '🏆',
      metaOne: truncateMeta(summaryText, 76),
      typeBadge: '🏆 LB',
      reportId: gameId != null ? String(gameId) : '',
      reportType: 'games_leaderboard',
      extraClass: 'exploreCard--gamesLbSummary',
      dataAttrs: { routeSurface: 'games_leaderboard', routeDetail: gameName || '' }
    });
  }

  /** Navigating rail: shell.navHref produces exploreCardOuterWrap + <a>. */
  function specLinkCard(href, model, extraClass, reportType, reportId) {
    return compactFaceSpec(model, {
      classNames: extraClass || '',
      navHref: href != null ? String(href) : '',
      reportType: reportType,
      reportId: reportId
    });
  }

  function specGameHighlightLinkCard(href, labelText, headlineText, bodyText, reportId) {
    var metaMerged = truncateMeta([headlineText || '', bodyText || ''].filter(Boolean).join(' — '), 40) || '';
    return specLinkCard(href || 'games.html', {
      type: 'game_highlight',
      title: labelText || '',
      author: 'Games',
      dateMeta: metaMerged,
      fallbackType: 'create',
      typeBadge: '🎮',
    }, 'gameHighlightCard', 'game_highlight', reportId != null ? String(reportId) : '');
  }

  function specVerifyStressLinkCard(href, titleText, metaText, reportId) {
    return specLinkCard(href || '#', {
      type: 'verify_stress',
      title: titleText || '',
      author: 'Verify',
      dateMeta: truncateMeta(metaText || '', 40),
      fallbackType: 'create',
    }, 'railStressVerifyFake', 'verify_stress_creation', reportId != null ? String(reportId) : '');
  }

  function specCosmeticRailCard(o) {
    o = o || {};
    var rLab = (o.rarityLabel && String(o.rarityLabel).trim()) ? String(o.rarityLabel).trim() : '';
    var sub = (o.subline && String(o.subline).trim()) ? String(o.subline).trim() : '';
    var priceTxt = o.priceBandHtml ? stripHtmlToText(String(o.priceBandHtml)) : '';
    var footTxt = o.footerHtml ? stripHtmlToText(String(o.footerHtml)) : '';
    var metaCombined = truncateMeta([rLab, sub, priceTxt, footTxt].filter(Boolean).join(' · '), 40) || '';
    var rar = String(o.rarityKey || 'common').toLowerCase();
    if (['common', 'uncommon', 'rare', 'epic', 'legendary'].indexOf(rar) < 0) rar = 'common';
    var state = [];
    if (o.stateEquipped) state.push('exploreCard--cosmeticEquipped');
    if (o.stateOwned && !o.stateEquipped) state.push('exploreCard--cosmeticOwned');
    if (o.stateLocked) state.push('exploreCard--cosmeticLocked');
    if (o.stateNeed) state.push('exploreCard--cosmeticNeed');
    if (o.featured) state.push('exploreCard--cosmeticFeatured');
    if (o.future) state.push('exploreCard--cosmeticFuture');
    if (o.placeholder) state.push('exploreCard--cosmeticPlaceholder');
    var xcls = ('exploreCard--cosmeticRail exploreCard--cosmeticRarity-' + rar + ' ' + state.join(' ') + ' ' + (o.extraClass || '')).replace(/\s+/g, ' ').trim();
    return compactFaceSpec({
      type: 'cosmetic',
      title: o.title || '',
      author: o.identityLabel || 'Store',
      dateMeta: metaCombined,
      thumbnailUrl: o.imageUrl || '',
      fallbackType: 'create',
      typeBadge: o.spotlight ? 'Spotlight' : '',
      stateBadge: o.icon != null ? String(o.icon) : '✨',
    }, {
      classNames: xcls,
      lanternCardType: 'cosmetic',
      reportType: o.reportType != null ? o.reportType : 'cosmetic',
      reportId: o.reportId != null ? String(o.reportId) : '',
      dataAttrs: o.dataAttrs || {},
      role: o.role,
      tabIndex: o.tabIndex,
      ariaLabel: o.ariaLabel
    });
  }

  function specLeaderboardChipRailCard(rank, name, availText, rowIndex) {
    return compactFaceSpec({
      type: 'leaderboard_chip',
      title: '#' + String(rank) + ' ' + (name || ''),
      author: 'Leaderboard',
      dateMeta: truncateMeta(availText || '', 40),
      fallbackType: 'create',
      typeBadge: '🏅',
    }, {
      classNames: 'exploreCard--leaderboardChip',
      lanternCardType: 'leaderboard_chip',
      reportType: 'store_leaderboard_chip',
      reportId: String(rowIndex),
      dataAttrs: { 'lb-row': String(rowIndex) },
      role: 'button',
      tabIndex: '0',
      ariaLabel: 'Rank ' + rank + ' ' + String(name || '').slice(0, 80)
    });
  }

  function specDisplayNewsSpotlightCard(id, category, title, bodySnippet) {
    var cat = String(category || 'News');
    var metaMerged = truncateMeta([cat, String(bodySnippet || '').replace(/\s+/g, ' ').trim()].filter(Boolean).join(' · '), 40) || cat;
    return compactFaceSpec({
      type: 'display_news',
      title: title || '',
      author: cat,
      dateMeta: metaMerged,
      fallbackType: 'news',
      typeBadge: '📰',
    }, {
      classNames: 'exploreCard--displayNewsTile',
      lanternCardType: 'display_news',
      reportType: 'display_news',
      reportId: String(id || ''),
      dataAttrs: { 'reaction-item-type': 'news', 'reaction-item-id': String(id || '') }
    });
  }

  function specActivityPulseCard(iconChar, lineText, timeStr, eventType, reportIdOpt) {
    var metaOne = truncateMeta((timeStr ? String(timeStr).trim() + ' · ' : '') + (lineText || ''), 40) || '';
    var rid = reportIdOpt != null ? String(reportIdOpt) : '';
    return compactFaceSpec({
      type: 'activity',
      title: truncateMeta(String(lineText || 'Activity'), 48),
      author: 'Activity',
      dateMeta: metaOne,
      fallbackType: 'activity',
      stateBadge: iconChar || '✨',
    }, {
      classNames: 'exploreCard--activityPulse',
      dataAttrs: { 'route-surface': 'explore_activity', 'route-detail': String(eventType || '').slice(0, 100) },
      reportType: 'activity',
      reportId: rid
    });
  }

  function postToRailModel(p, identity) {
    identity = identity || {};
    var c = p.curation || {};
    var st = '';
    if (p.rejected) st = 'Rejected';
    else if (p.returned) st = 'Returned';
    else if (p.approved === false && !p.rejected && !p.returned) st = 'Pending';
    var time = '';
    try {
      var dt = new Date(p.created_at || '');
      if (!isNaN(dt.getTime())) time = dt.toLocaleDateString() + ' ' + dt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    } catch (e) {}
    var meta = [st, time].filter(Boolean).join(' · ') || time || 'Your post';
    var dn = identity.display_name || '';
    var typ = p.type || 'link';
    var imgUrl = typ === 'image' ? String(p.url || '').trim() : String(p.image_url || '').trim();
    var vidUrl = typ === 'video' ? String(p.url || '').trim() : String(p.video_url || '').trim();
    var lnkUrl = (typ === 'link' || typ === 'webapp' || typ === 'project') ? String(p.url || '').trim() : String(p.link_url || '').trim();
    var avEm = (identity.avatar != null && String(identity.avatar).trim()) ? String(identity.avatar).trim()
      : (String(p.avatar != null ? p.avatar : '').trim() || '🌟');
    var cn = String(identity.character_name || identity.display_name || p.character_name || dn || '').trim();
    return {
      id: p.id,
      type: typ,
      title: (p.title || 'Untitled') + (p.pinned ? ' 📌' : ''),
      display_name: dn,
      character_name: cn,
      avatar: avEm,
      frame: identity.frame || p.frame || 'none',
      url: String(p.url || '').trim(),
      image_url: imgUrl,
      video_url: vidUrl,
      link_url: lnkUrl,
      preview_src: p.preview_src,
      thumbnail: p.thumbnail,
      image: p.image,
      created_at: p.created_at,
      teacher_pick: !!c.teacher_pick,
      teacher_featured: !!c.teacher_featured,
      card_meta: meta
    };
  }

  global.LanternCards = {
    CARD_MODE: CARD_MODE,
    CARD_FACTORY: CARD_FACTORY,
    CARD_CONTRACT_VERSION: CARD_CONTRACT_VERSION,
    esc: esc,
    railIdentityFirstName: railIdentityFirstName,
    formatCompactAuthor: formatCompactAuthor,
    formatExploreAuthorLabel: formatExploreAuthorLabel,
    formatCompactDate: formatCompactDate,
    getExploreDescriptionPreview: getExploreDescriptionPreview,
    shoutOutRecognizedPartyLabel: shoutOutRecognizedPartyLabel,
    shoutOutCompactRow3Preview: shoutOutCompactRow3Preview,
    resolveUlhcTypeBadge: resolveUlhcTypeBadge,
    contentTypeTickerIcon: contentTypeTickerIcon,
    TYPE_ICONS: TYPE_ICONS,
    TYPE_BADGES: TYPE_BADGES,
    SHOUT_OUT_DISPLAY_NAME: SHOUT_OUT_DISPLAY_NAME,
    resolveCardFaceImageUrl: resolveCardFaceImageUrl,
    resolveCardFaceImageUrlWithFallbacks: resolveCardFaceImageUrlWithFallbacks,
    buildCanonicalCardFaceHtml: buildCanonicalCardFaceHtml,
    normalizeFeedItemToFaceModel: normalizeFeedItemToFaceModel,
    compactFaceSpec: compactFaceSpec,
    createCanonicalCardFace: createCanonicalCardFace,
    getCardImageUrl: getCardImageUrl,
    getDefaultImageUrl: getDefaultImageUrl,
    MISSION_FALLBACK_COVER_URL: MISSION_FALLBACK_COVER_URL,
    BUILT_IN_MISSION_COVER_BY_ID: BUILT_IN_MISSION_COVER_BY_ID,
    builtInMissionCoverUrl: builtInMissionCoverUrl,
    missionCoverFallbackUrl: missionCoverFallbackUrl,
    getDefaultAvatarImageUrl: getDefaultAvatarImageUrl,
    svgDefaultAvatarDataUri: svgDefaultAvatarDataUri,
    buildExploreAuthorAvatarHtml: buildExploreAuthorAvatarHtml,
    accountKeyFromCardModel: accountKeyFromCardModel,
    getTypeFallbackMediaDataUri: svgTypeFallbackDataUri,
    getUniversalFallbackMediaDataUri: svgUniversalLanternDataUri,
    buildGuaranteedExploreImageHtml: buildGuaranteedExploreImageHtml,
    buildNewsCardVisualBlockFromItem: buildNewsCardVisualBlockFromItem,
    buildFeedPostParts: buildFeedPostParts,
    specFeedPostRail: specFeedPostRail,
    wireFeedPostCard: wireFeedPostCard,
    materializeFeedPostCard: materializeFeedPostCard,
    wirePollRailCard: wirePollRailCard,
    materializePollRailCard: materializePollRailCard,
    wireMissionSpotlightRail: wireMissionSpotlightRail,
    materializeMissionSpotlightRail: materializeMissionSpotlightRail,
    createStudentCard: createStudentCard,
    specNewsRailCard: specNewsRailCard,
    specPollRailCard: specPollRailCard,
    buildPollDraftOpenedPreviewHtml: buildPollDraftOpenedPreviewHtml,
    specOpenedNews: specOpenedNews,
    specOpenedMissionDraft: specOpenedMissionDraft,
    buildMissionSpotlightRailElement: materializeMissionSpotlightRail,
    buildMissionSpotlightCardElement: materializeMissionSpotlightRail,
    specMissionSpotlightRail: specMissionSpotlightRail,
    specIconRailCard: specIconRailCard,
    specWeeklyPaceLinkCard: specWeeklyPaceLinkCard,
    specGamesLeaderboardSummaryCard: specGamesLeaderboardSummaryCard,
    specGameHubRailCard: specGameHubRailCard,
    specLinkCard: specLinkCard,
    specGameHighlightLinkCard: specGameHighlightLinkCard,
    specVerifyStressLinkCard: specVerifyStressLinkCard,
    specCosmeticRailCard: specCosmeticRailCard,
    specLeaderboardChipRailCard: specLeaderboardChipRailCard,
    specDisplayNewsSpotlightCard: specDisplayNewsSpotlightCard,
    specActivityPulseCard: specActivityPulseCard,
    postToRailModel: postToRailModel,
    applyReportControl: applyReportControl,
    applyReportControlToOuterWrap: applyReportControlToOuterWrap,
    enhanceReportControlsIn: enhanceReportControlsIn
  };
})(typeof window !== 'undefined' ? window : this);
