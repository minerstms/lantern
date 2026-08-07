/**
 * Contribute Studio — draft adapters for production preview renderers.
 * Maps in-progress form state to the data contracts expected by LanternCards / LanternCardUI.
 * Preview-only: no IDs are persisted and no network writes occur.
 */
(function (global) {
  'use strict';

  var PREVIEW_DRAFT_ID = 'preview-draft';

  function composeShoutoutSubmitBody(reasonKey, recipient, messageRaw, shoutLabels) {
    var labels = shoutLabels || {};
    var rk = String(reasonKey || '').trim();
    var rl = labels[rk] || 'Shout-out';
    var rec = String(recipient || '').trim();
    var bodyRaw = String(messageRaw || '').trim();
    return 'Shout-out (' + rl + ')\n\nRecognizing: ' + rec + '\n\n' + bodyRaw;
  }

  function composeShoutoutTitle(recipient, titleRaw) {
    var rec = String(recipient || '').trim();
    var title = String(titleRaw || '').trim();
    if (title) return title;
    if (rec) return 'Shout-out: ' + rec;
    return 'Shout-out';
  }

  /**
   * News / post / shout-out draft for specNewsRailCard + fillNewsDetailModal.
   * @param {object} o
   */
  function buildNewsDraft(o) {
    o = o || {};
    var ct = String(o.contributeType || 'post').trim();
    var titleRaw = String(o.title || '').trim();
    var bodyRaw = String(o.body || '').trim();
    var category = ct === 'shoutout'
      ? 'Student Spotlight'
      : String(o.category || 'School News').trim();
    var authorType = String(o.authorType || 'student').trim();
    var nowIso = new Date().toISOString();
    var headline = titleRaw;
    var body = bodyRaw;

    if (ct === 'shoutout') {
      body = composeShoutoutSubmitBody(o.shoutReason, o.shoutRecipient, bodyRaw, o.shoutLabels);
      headline = composeShoutoutTitle(o.shoutRecipient, titleRaw);
    } else if (!headline) {
      headline = '';
    }

    return {
      id: PREVIEW_DRAFT_ID,
      title: headline || (ct === 'shoutout' ? 'Shout-out' : 'Headline…'),
      body: body,
      category: category,
      author_name: String(o.authorName || '').trim(),
      character_name: String(o.characterName || '').trim(),
      author_type: authorType,
      created_at: nowIso,
      approved_at: nowIso,
      image_url: String(o.imageUrl || '').trim(),
      video_url: String(o.videoUrl || '').trim(),
      link_url: String(o.linkUrl || '').trim(),
      photo_credit: String(o.photoCredit || '').trim(),
      _previewOnly: true,
    };
  }

  function buildPollDraft(o) {
    o = o || {};
    var choices = Array.isArray(o.choices) ? o.choices.filter(Boolean) : [];
    return {
      id: o.id || PREVIEW_DRAFT_ID,
      question: String(o.question || '').trim() || 'Your question',
      choices: choices.length ? choices : ['Choice 1', 'Choice 2', 'Choice 3'],
      image_url: String(o.imageUrl || '').trim(),
      fallback_key: String(o.fallbackKey || 'poll').trim(),
      character_name: String(o.characterName || '').trim(),
      author_name: String(o.authorName || '').trim(),
      created_at: new Date().toISOString(),
      _previewOnly: true,
    };
  }

  function buildProfilePostDraft(o) {
    o = o || {};
    var pType = String(o.postType || 'link').trim();
    var pUrl = String(o.url || '').trim();
    var isImgUrl = /\.(png|jpe?g|webp|gif)([\?#]|$)/i.test(pUrl) || /\/api\/(media\/image|news\/image)\?/i.test(pUrl);
    var nowIso = new Date().toISOString();
    return {
      id: 'preview-profile',
      title: String(o.title || '').trim() || 'Profile post',
      body: String(o.caption || '').trim(),
      category: 'Student Spotlight',
      author_name: String(o.authorName || '').trim(),
      character_name: String(o.characterName || '').trim(),
      author_type: 'student',
      created_at: nowIso,
      approved_at: nowIso,
      image_url: (pType === 'image' && pUrl && isImgUrl) ? pUrl : '',
      video_url: (pType === 'video' && pUrl) ? pUrl : '',
      link_url: (pType !== 'image' || !isImgUrl) ? pUrl : '',
      photo_credit: '',
      _previewOnly: true,
    };
  }

  function buildMissionPostDraft(o) {
    o = o || {};
    var mImg = String(o.imageUrl || '').trim();
    var mVid = String(o.videoUrl || '').trim();
    var mLink = String(o.linkUrl || '').trim();
    var mDraftType = 'create';
    if (mImg) mDraftType = 'image';
    else if (mVid) mDraftType = 'video';
    else if (mLink) mDraftType = 'link';
    return {
      id: o.id || 'preview-mission',
      title: String(o.title || '').trim() || 'Mission',
      caption: String(o.caption || '').trim(),
      type: mDraftType,
      created_at: new Date().toISOString(),
      display_name: String(o.displayName || '').trim(),
      character_name: String(o.characterName || '').trim(),
      image_url: mImg,
      video_url: mVid,
      link_url: mLink,
      url: mDraftType === 'link' ? mLink : (mDraftType === 'image' ? mImg : ''),
      _previewOnly: true,
    };
  }

  function isPreviewId(id) {
    var s = String(id || '');
    return s.indexOf('preview') === 0;
  }

  global.LanternStudioDraft = {
    PREVIEW_DRAFT_ID: PREVIEW_DRAFT_ID,
    composeShoutoutSubmitBody: composeShoutoutSubmitBody,
    composeShoutoutTitle: composeShoutoutTitle,
    buildNewsDraft: buildNewsDraft,
    buildPollDraft: buildPollDraft,
    buildProfilePostDraft: buildProfilePostDraft,
    buildMissionPostDraft: buildMissionPostDraft,
    isPreviewId: isPreviewId,
  };
})(typeof window !== 'undefined' ? window : this);
