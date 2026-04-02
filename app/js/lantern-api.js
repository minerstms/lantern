/**
 * TMS Lantern — mock API. localStorage only. No fetch, no Worker, no production data.
 */
// SCHEMA RULE:
// All field names must match docs/archive/LANTERN_SCHEMA.md (see docs/LANTERN_SYSTEM_CONTEXT.md §14)
// Do not invent or assume column names.
// Verify against D1 before using.
(function (global) {
  var DATA = global.LANTERN_DATA || {};
  var LS = DATA.LS_KEYS || {};

  function resolveActorId(characterName, actorType) {
    var type = String(actorType || 'student').trim().toLowerCase();
    var name = String(characterName || '').trim();
    if (type === 'teacher') return { actor_id: 'teacher_demo', actor_name: name || 'Teacher', actor_type: 'teacher' };
    if (type === 'staff') return { actor_id: 'staff_demo', actor_name: name || 'Staff', actor_type: 'staff' };
    if (type === 'admin') return { actor_id: 'admin_demo', actor_name: name || 'Admin', actor_type: 'admin' };
    var chars = getCharacters();
    var c = chars.find(function (x) { return String(x.name || '').trim() === name; });
    return { actor_id: c ? (c.character_id || 'char_unknown') : 'char_unknown', actor_name: name || (c && c.name) || 'Student', actor_type: 'student' };
  }

  function isModerationApproved(r) {
    if (r.moderation_status === 'approved') return true;
    if (r.approved === true) return true;
    if ((r.status || '') === 'accepted') return true;
    if ((r.status || '') === 'approved') return true;
    return false;
  }

  function isVisibilitySchoolCommunity(r) {
    var v = String(r.visibility || '').trim().replace(/\s+/g, '_');
    if (v === 'school_community') return true;
    if ((r.visibility || '').trim() === 'school community') return true;
    if (!r.visibility && (r.approved === true || r.moderation_status === 'approved')) return true;
    return false;
  }

  function getCharacters() {
    return DATA.ensureCharacters ? DATA.ensureCharacters() : [];
  }

  function getCatalog() {
    return DATA.ensureCatalog ? DATA.ensureCatalog() : [];
  }

  function getActivity() {
    return DATA.getFromLS ? DATA.getFromLS(LS.ACTIVITY, []) : [];
  }

  function getPurchases() {
    return DATA.getFromLS ? DATA.getFromLS(LS.PURCHASES, []) : [];
  }

  function getPendingSubmissions() {
    return DATA.getFromLS ? DATA.getFromLS(LS.PENDING_SUBMISSIONS, []) : [];
  }

  function getPosts() {
    return DATA.getFromLS ? DATA.getFromLS(LS.POSTS, []) : [];
  }

  function getProfiles() {
    var raw = DATA.getFromLS ? DATA.getFromLS(LS.PROFILES, {}) : {};
    return raw && typeof raw === 'object' ? raw : {};
  }

  function getAvatarSubmissions() {
    var raw = DATA.getFromLS ? DATA.getFromLS(LS.AVATAR_SUBMISSIONS, []) : [];
    return Array.isArray(raw) ? raw : [];
  }

  function getProfileForCharacter(characterName) {
    var profiles = getProfiles();
    var key = String(characterName || '').trim();
    return profiles[key] || {};
  }

  function saveProfile(characterName, updates) {
    var profiles = getProfiles();
    var key = String(characterName || '').trim();
    if (!key) return false;
    var current = profiles[key] || {};
    var merged = {
      display_name: updates.display_name !== undefined ? String(updates.display_name || '').trim() : (current.display_name || ''),
      hero_title: updates.hero_title !== undefined ? String(updates.hero_title || '').trim() : (current.hero_title || ''),
      bio: updates.bio !== undefined ? String(updates.bio || '').trim() : (current.bio || ''),
      avatar: updates.avatar !== undefined ? String(updates.avatar || '').trim() : (current.avatar || ''),
      frame: updates.frame !== undefined ? String(updates.frame || 'none').trim() : (current.frame || 'none'),
      theme: updates.theme !== undefined ? String(updates.theme || 'default').trim() : (current.theme || 'default'),
      featured_post_id: updates.featured_post_id !== undefined ? String(updates.featured_post_id || '').trim() : (current.featured_post_id || ''),
      custom_avatar: updates.custom_avatar !== undefined ? String(updates.custom_avatar || '').trim() : (current.custom_avatar || ''),
    };
    profiles[key] = merged;
    DATA.setToLS(LS.PROFILES, profiles);
    return true;
  }

  function getPostsForCharacter(characterName) {
    var posts = getPosts();
    return posts.filter(function (p) { return String(p.character_name || '').trim() === String(characterName || '').trim(); })
      .sort(function (a, b) {
        var pa = a.pinned ? 1 : 0;
        var pb = b.pinned ? 1 : 0;
        if (pa !== pb) return pb - pa;
        return (b.created_at || '').localeCompare(a.created_at || '');
      });
  }

  function createPost(characterName, type, title, caption, url, pinned) {
    var posts = getPosts();
    var id = 'post_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    var actor = resolveActorId(characterName, 'student');
    posts.push({
      id: id,
      character_name: characterName,
      actor_id: actor.actor_id,
      actor_name: actor.actor_name,
      actor_type: actor.actor_type,
      type: type || 'link',
      title: String(title || '').trim(),
      caption: String(caption || '').trim(),
      url: String(url || '').trim(),
      created_at: new Date().toISOString(),
      pinned: !!pinned,
      approved: false,
      rejected: false,
      returned: false,
      returned_reason: '',
      returned_at: null,
      moderation_status: 'pending',
      visibility: 'school_community',
      feature_eligible: true,
    });
    DATA.setToLS(LS.POSTS, posts);
    createActivityEvent({ actor_id: characterName, actor_name: characterName, actor_type: 'student', object_type: 'post', object_id: id, event_type: 'post_created', meta: { title: String(title || '').trim() } });
    return id;
  }

  function updatePost(id, updates) {
    var posts = getPosts();
    var idx = posts.findIndex(function (p) { return p.id === id; });
    if (idx < 0) return false;
    if (updates.title !== undefined) posts[idx].title = String(updates.title).trim();
    if (updates.caption !== undefined) posts[idx].caption = String(updates.caption).trim();
    if (updates.url !== undefined) posts[idx].url = String(updates.url).trim();
    if (updates.type !== undefined) posts[idx].type = updates.type;
    if (updates.pinned !== undefined) posts[idx].pinned = !!updates.pinned;
    if (updates.returned !== undefined) posts[idx].returned = !!updates.returned;
    if (updates.returned_reason !== undefined) posts[idx].returned_reason = String(updates.returned_reason || '').trim();
    if (updates.returned_at !== undefined) posts[idx].returned_at = updates.returned_at;
    DATA.setToLS(LS.POSTS, posts);
    return true;
  }

  function approvePost(id) {
    var posts = getPosts();
    var idx = posts.findIndex(function (p) { return p.id === id; });
    if (idx < 0) return { ok: false, error: 'Post not found' };
    posts[idx].approved = true;
    posts[idx].rejected = false;
    posts[idx].returned = false;
    posts[idx].returned_reason = '';
    posts[idx].returned_at = null;
    posts[idx].moderation_status = 'approved';
    DATA.setToLS(LS.POSTS, posts);
    var post = posts[idx];
    createActivityEvent({ actor_id: 'teacher', actor_name: 'Teacher', actor_type: 'teacher', object_type: 'post', object_id: id, event_type: 'post_approved', meta: { character_name: post.character_name, title: post.title } });
    return { ok: true, post: post };
  }

  function rejectPost(id) {
    var posts = getPosts();
    var idx = posts.findIndex(function (p) { return p.id === id; });
    if (idx < 0) return { ok: false, error: 'Post not found' };
    posts[idx].approved = false;
    posts[idx].rejected = true;
    posts[idx].returned = false;
    posts[idx].returned_reason = '';
    posts[idx].returned_at = null;
    posts[idx].moderation_status = 'rejected';
    DATA.setToLS(LS.POSTS, posts);
    return { ok: true, post: posts[idx] };
  }

  function returnPostForImprovements(id, reason) {
    var posts = getPosts();
    var idx = posts.findIndex(function (p) { return p.id === id; });
    if (idx < 0) return { ok: false, error: 'Post not found' };
    var r = String(reason || '').trim().slice(0, 500);
    posts[idx].approved = false;
    posts[idx].rejected = false;
    posts[idx].returned = true;
    posts[idx].returned_reason = r;
    posts[idx].returned_at = new Date().toISOString();
    posts[idx].moderation_status = 'returned';
    DATA.setToLS(LS.POSTS, posts);
    return { ok: true, post: posts[idx] };
  }

  function resubmitPostForApproval(id) {
    var posts = getPosts();
    var idx = posts.findIndex(function (p) { return p.id === id; });
    if (idx < 0) return { ok: false, error: 'Post not found' };
    posts[idx].returned = false;
    posts[idx].returned_reason = '';
    posts[idx].returned_at = null;
    posts[idx].approved = false;
    posts[idx].rejected = false;
    posts[idx].moderation_status = 'pending';
    DATA.setToLS(LS.POSTS, posts);
    return { ok: true, post: posts[idx] };
  }

  function getPendingPosts() {
    return getPosts().filter(function (p) {
      return p.approved === false && !p.rejected && !p.returned;
    }).sort(function (a, b) { return (a.created_at || '').localeCompare(b.created_at || ''); }).reverse();
  }

  function getApprovedPosts() {
    if (typeof window.LANTERN_AVATAR_API === 'undefined' || window.LANTERN_AVATAR_API === null) {
      try {
        const posts = JSON.parse(localStorage.getItem('LANTERN_POSTS') || '[]');
        if (!Array.isArray(posts)) return [];
        return posts.slice(0, 30);
      } catch (e) {
        console.error('Local seed read failed', e);
        return [];
      }
    }
    return getPosts().filter(function (p) {
      return isModerationApproved(p) && isVisibilitySchoolCommunity(p) && (p.feature_eligible !== false);
    }).sort(function (a, b) { return (b.created_at || '').localeCompare(a.created_at || ''); }).slice(0, 30);
  }

  function deletePost(id) {
    var posts = getPosts().filter(function (p) { return p.id !== id; });
    DATA.setToLS(LS.POSTS, posts);
    return true;
  }

  function togglePostPinned(id) {
    var posts = getPosts();
    var idx = posts.findIndex(function (p) { return p.id === id; });
    if (idx < 0) return false;
    posts[idx].pinned = !posts[idx].pinned;
    DATA.setToLS(LS.POSTS, posts);
    return true;
  }

  function getPostReactions() {
    var raw = DATA.getFromLS ? DATA.getFromLS(LS.POST_REACTIONS, {}) : {};
    return raw && typeof raw === 'object' ? raw : {};
  }

  function getReactionsForPost(postId, characterName) {
    var all = getPostReactions();
    var byPost = all[postId] || {};
    var byChar = byPost[characterName] || {};
    return { like: !!byChar.like, favorite: !!byChar.favorite, fire: !!byChar.fire };
  }

  function togglePostReaction(postId, characterName, reactionType) {
    var key = String(characterName || '').trim();
    if (!key || !postId) return false;
    var all = getPostReactions();
    var byPost = all[postId] || {};
    var byChar = byPost[key] || {};
    var current = !!byChar[reactionType];
    byChar[reactionType] = !current;
    byPost[key] = byChar;
    all[postId] = byPost;
    DATA.setToLS(LS.POST_REACTIONS, all);
    return !current;
  }

  function getPostComments() {
    var raw = DATA.getFromLS ? DATA.getFromLS(LS.POST_COMMENTS, []) : [];
    return Array.isArray(raw) ? raw : [];
  }

  function getCommentsForPost(postId) {
    return getPostComments().filter(function (c) { return String(c.post_id || '').trim() === String(postId || '').trim(); })
      .sort(function (a, b) { return (a.created_at || '').localeCompare(b.created_at || ''); });
  }

  function addComment(postId, characterName, text) {
    var txt = String(text || '').trim();
    if (!txt || !postId) return null;
    var key = String(characterName || '').trim();
    if (!key) return null;
    var actor = resolveActorId(key, 'student');
    var comments = getPostComments();
    var id = 'comment_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    comments.push({
      id: id,
      post_id: String(postId).trim(),
      character_name: key,
      actor_id: actor.actor_id,
      actor_name: actor.actor_name,
      actor_type: actor.actor_type,
      text: txt,
      created_at: new Date().toISOString(),
    });
    DATA.setToLS(LS.POST_COMMENTS, comments);
    return id;
  }

  function getSpotlightedCharacters() {
    var activity = getActivity();
    var set = {};
    activity.forEach(function (r) {
      if ((r.note_text || '').indexOf('Spotlight') >= 0) {
        var n = String(r.character_name || '').trim();
        if (n) set[n] = true;
      }
    });
    return Object.keys(set);
  }

  function getPostCurations() {
    var raw = DATA.getFromLS ? DATA.getFromLS(LS.POST_CURATIONS, {}) : {};
    return raw && typeof raw === 'object' ? raw : {};
  }

  function getStaff() {
    return DATA.getStaff ? DATA.getStaff() : [];
  }

  function getThanks() {
    var raw = DATA.getFromLS ? DATA.getFromLS(LS.THANKS, []) : [];
    return Array.isArray(raw) ? raw : [];
  }

  function computeNuggetTier(wordCount) {
    if (wordCount < 30) return 0;
    return Math.floor((wordCount - 30) / 50) + 1;
  }

  function submitThanks(characterName, staffId, staffName, staffDesignation, text) {
    var key = String(characterName || '').trim();
    if (!key) return { ok: false, error: 'character_name required' };
    var txt = String(text || '').trim();
    var wc = (txt.match(/\S+/g) || []).length;
    if (wc < 30) return { ok: false, error: 'Letter must be at least 30 words. You have ' + wc + '.' };
    var tier = computeNuggetTier(wc);
    var thanks = getThanks();
    var id = 'thanks_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    var actor = resolveActorId(key, 'student');
    thanks.push({
      id: id,
      character_name: key,
      actor_id: actor.actor_id,
      actor_name: actor.actor_name,
      actor_type: actor.actor_type,
      staff_id: String(staffId || '').trim(),
      staff_name: String(staffName || '').trim(),
      staff_designation: String(staffDesignation || '').trim(),
      text: txt,
      word_count: wc,
      nugget_tier: tier,
      created_at: new Date().toISOString(),
      status: 'pending',
      moderation_status: 'pending',
      visibility: 'teacher_only',
      accepted_at: null,
      accepted_by: null,
      nugget_awarded: false,
    });
    DATA.setToLS(LS.THANKS, thanks);
    createActivityEvent({ actor_id: key, actor_name: key, actor_type: 'student', object_type: 'thanks', object_id: id, event_type: 'thanks_submitted', meta: { staff_name: String(staffName || '').trim(), word_count: wc } });
    checkAndUnlockAchievements(key);
    return { ok: true, id: id, nugget_tier: tier };
  }

  function getThanksForCharacter(characterName) {
    var key = String(characterName || '').trim();
    return getThanks().filter(function (t) { return String(t.character_name || '').trim() === key; })
      .sort(function (a, b) { return (b.created_at || '').localeCompare(a.created_at || ''); });
  }

  function getThanksForDesignation(designation) {
    var d = String(designation || '').trim().toLowerCase();
    return getThanks().filter(function (t) {
      return String(t.staff_designation || '').trim().toLowerCase() === d && (t.status || 'pending') === 'pending';
    }).sort(function (a, b) { return (a.created_at || '').localeCompare(b.created_at || ''); });
  }

  function getThanksForStaff(staffId) {
    var sid = String(staffId || '').trim();
    return getThanks().filter(function (t) { return String(t.staff_id || '').trim() === sid && (t.status || 'pending') === 'pending'; })
      .sort(function (a, b) { return (a.created_at || '').localeCompare(b.created_at || ''); });
  }

  function acceptThanks(id, acceptedBy, economyBackendCharged) {
    var thanks = getThanks();
    var idx = thanks.findIndex(function (t) { return t.id === id; });
    if (idx < 0) return { ok: false, error: 'Not found' };
    var t = thanks[idx];
    if (t.nugget_awarded) return { ok: true };
    var tier = t.nugget_tier || computeNuggetTier(t.word_count || 0) || 1;
    thanks[idx].status = 'accepted';
    thanks[idx].moderation_status = 'approved';
    thanks[idx].accepted_at = new Date().toISOString();
    thanks[idx].accepted_by = String(acceptedBy || '').trim();
    thanks[idx].nugget_awarded = true;
    DATA.setToLS(LS.THANKS, thanks);
    if (!economyBackendCharged) addActivity(t.character_name, tier, 'POSITIVE', 'APPROVAL', 'Thank-you letter accepted');
    createActivityEvent({ actor_id: 'teacher', actor_name: 'Teacher', actor_type: 'teacher', object_type: 'thanks', object_id: id, event_type: 'nugget_earned', meta: { character_name: t.character_name, nuggets: tier, source: 'thank_you' } });
    checkAndUnlockAchievements(t.character_name);
    return { ok: true, nuggets: tier, character_name: t.character_name };
  }

  function rejectThanks(id) {
    var thanks = getThanks();
    var idx = thanks.findIndex(function (t) { return t.id === id; });
    if (idx < 0) return { ok: false, error: 'Not found' };
    thanks[idx].status = 'rejected';
    thanks[idx].moderation_status = 'rejected';
    thanks[idx].accepted_at = new Date().toISOString();
    thanks[idx].accepted_by = null;
    thanks[idx].nugget_awarded = false;
    thanks[idx].returned_reason = '';
    thanks[idx].returned_at = null;
    thanks[idx].returned_by = null;
    DATA.setToLS(LS.THANKS, thanks);
    return { ok: true };
  }

  function returnThanksForImprovements(id, reason, returnedBy) {
    var thanks = getThanks();
    var idx = thanks.findIndex(function (t) { return t.id === id; });
    if (idx < 0) return { ok: false, error: 'Not found' };
    var t = thanks[idx];
    if ((t.status || 'pending') !== 'pending') return { ok: false, error: 'Can only return pending submissions' };
    var r = String(reason || '').trim().slice(0, 500);
    thanks[idx].status = 'returned';
    thanks[idx].moderation_status = 'returned';
    thanks[idx].returned_reason = r;
    thanks[idx].returned_at = new Date().toISOString();
    thanks[idx].returned_by = String(returnedBy || 'Teacher').trim();
    DATA.setToLS(LS.THANKS, thanks);
    createActivityEvent({ actor_id: 'teacher', actor_name: returnedBy || 'Teacher', actor_type: 'teacher', object_type: 'thanks', object_id: id, event_type: 'thanks_returned', meta: { character_name: t.character_name, staff_name: t.staff_name } });
    return { ok: true };
  }

  function resubmitThanks(id, newText) {
    var thanks = getThanks();
    var idx = thanks.findIndex(function (t) { return t.id === id; });
    if (idx < 0) return { ok: false, error: 'Not found' };
    var t = thanks[idx];
    if ((t.status || '') !== 'returned') return { ok: false, error: 'Can only resubmit returned letters' };
    var txt = String(newText || '').trim();
    var wc = (txt.match(/\S+/g) || []).length;
    if (wc < 30) return { ok: false, error: 'Letter must be at least 30 words. You have ' + wc + '.' };
    var tier = computeNuggetTier(wc);
    thanks[idx].text = txt;
    thanks[idx].word_count = wc;
    thanks[idx].nugget_tier = tier;
    thanks[idx].status = 'pending';
    thanks[idx].moderation_status = 'pending';
    thanks[idx].returned_reason = '';
    thanks[idx].returned_at = null;
    thanks[idx].returned_by = null;
    DATA.setToLS(LS.THANKS, thanks);
    createActivityEvent({ actor_id: t.character_name, actor_name: t.character_name, actor_type: 'student', object_type: 'thanks', object_id: id, event_type: 'thanks_resubmitted', meta: { word_count: wc } });
    return { ok: true, id: id, nugget_tier: tier };
  }

  function getGradeReflections() {
    var raw = DATA.getFromLS ? DATA.getFromLS(LS.GRADE_REFLECTIONS, []) : [];
    return Array.isArray(raw) ? raw : [];
  }

  function hasGradeReflectionNuggetToday(characterName) {
    var key = String(characterName || '').trim();
    var today = todayStr();
    var refs = getGradeReflections().filter(function (r) {
      return String(r.character_name || '').trim() === key && r.nugget_awarded;
    });
    return refs.some(function (r) {
      var at = (r.accepted_at || r.created_at || '').slice(0, 10);
      return at === today;
    });
  }

  function submitGradeReflection(characterName, reflectionText) {
    var key = String(characterName || '').trim();
    if (!key) return { ok: false, error: 'character_name required' };
    var txt = String(reflectionText || '').trim();
    var wc = (txt.match(/\S+/g) || []).length;
    if (wc < 50) return { ok: false, error: 'Reflection must be at least 50 words. You have ' + wc + '.' };
    var tier = computeNuggetTier(wc);
    var actor = resolveActorId(key, 'student');
    var refs = getGradeReflections();
    var id = 'grade_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    refs.push({
      id: id,
      character_name: key,
      actor_id: actor.actor_id,
      actor_name: actor.actor_name,
      actor_type: actor.actor_type,
      reflection_text: txt,
      word_count: wc,
      nugget_tier: tier,
      created_at: new Date().toISOString(),
      status: 'pending',
      moderation_status: 'pending',
      visibility: 'teacher_only',
      accepted_at: null,
      accepted_by: null,
      nugget_awarded: false,
    });
    DATA.setToLS(LS.GRADE_REFLECTIONS, refs);
    createActivityEvent({ actor_id: key, actor_name: key, actor_type: 'student', object_type: 'grade_reflection', object_id: id, event_type: 'grade_reflection_submitted', meta: { word_count: wc } });
    return { ok: true, id: id, nugget_tier: tier };
  }

  function getGradeReflectionsForCharacter(characterName) {
    var key = String(characterName || '').trim();
    return getGradeReflections().filter(function (r) { return String(r.character_name || '').trim() === key; })
      .sort(function (a, b) { return (b.created_at || '').localeCompare(a.created_at || ''); });
  }

  function getGradeReflectionsPending() {
    return getGradeReflections().filter(function (r) { return (r.status || 'pending') === 'pending'; })
      .sort(function (a, b) { return (a.created_at || '').localeCompare(b.created_at || ''); });
  }

  function acceptGradeReflection(id, acceptedBy, economyBackendCharged) {
    var refs = getGradeReflections();
    var idx = refs.findIndex(function (r) { return r.id === id; });
    if (idx < 0) return { ok: false, error: 'Not found' };
    var r = refs[idx];
    if (r.nugget_awarded) return { ok: true };
    if (hasGradeReflectionNuggetToday(r.character_name)) {
      refs[idx].status = 'rejected';
      refs[idx].accepted_at = new Date().toISOString();
      refs[idx].accepted_by = null;
      DATA.setToLS(LS.GRADE_REFLECTIONS, refs);
      return { ok: false, error: 'Max 1 grade reflection nugget per student per day already awarded.' };
    }
    var tier = r.nugget_tier || computeNuggetTier(r.word_count || 0) || 1;
    refs[idx].status = 'accepted';
    refs[idx].moderation_status = 'approved';
    refs[idx].accepted_at = new Date().toISOString();
    refs[idx].accepted_by = String(acceptedBy || '').trim();
    refs[idx].nugget_awarded = true;
    DATA.setToLS(LS.GRADE_REFLECTIONS, refs);
    if (!economyBackendCharged) addActivity(r.character_name, tier, 'POSITIVE', 'APPROVAL', 'Grade reflection accepted');
    createActivityEvent({ actor_id: 'teacher', actor_name: 'Teacher', actor_type: 'teacher', object_type: 'grade_reflection', object_id: id, event_type: 'nugget_earned', meta: { character_name: r.character_name, nuggets: tier, source: 'grade_reflection' } });
    checkAndUnlockAchievements(r.character_name);
    return { ok: true, nuggets: tier, character_name: r.character_name };
  }

  function rejectGradeReflection(id) {
    var refs = getGradeReflections();
    var idx = refs.findIndex(function (r) { return r.id === id; });
    if (idx < 0) return { ok: false, error: 'Not found' };
    refs[idx].status = 'rejected';
    refs[idx].moderation_status = 'rejected';
    refs[idx].accepted_at = new Date().toISOString();
    refs[idx].accepted_by = null;
    refs[idx].nugget_awarded = false;
    refs[idx].returned_reason = '';
    refs[idx].returned_at = null;
    refs[idx].returned_by = null;
    DATA.setToLS(LS.GRADE_REFLECTIONS, refs);
    return { ok: true };
  }

  function returnGradeReflectionForImprovements(id, reason, returnedBy) {
    var refs = getGradeReflections();
    var idx = refs.findIndex(function (r) { return r.id === id; });
    if (idx < 0) return { ok: false, error: 'Not found' };
    var r = refs[idx];
    if ((r.status || 'pending') !== 'pending') return { ok: false, error: 'Can only return pending submissions' };
    var reasonStr = String(reason || '').trim().slice(0, 500);
    refs[idx].status = 'returned';
    refs[idx].moderation_status = 'returned';
    refs[idx].returned_reason = reasonStr;
    refs[idx].returned_at = new Date().toISOString();
    refs[idx].returned_by = String(returnedBy || 'Teacher').trim();
    DATA.setToLS(LS.GRADE_REFLECTIONS, refs);
    createActivityEvent({ actor_id: 'teacher', actor_name: returnedBy || 'Teacher', actor_type: 'teacher', object_type: 'grade_reflection', object_id: id, event_type: 'grade_reflection_returned', meta: { character_name: r.character_name } });
    return { ok: true };
  }

  function resubmitGradeReflection(id, newText) {
    var refs = getGradeReflections();
    var idx = refs.findIndex(function (r) { return r.id === id; });
    if (idx < 0) return { ok: false, error: 'Not found' };
    var r = refs[idx];
    if ((r.status || '') !== 'returned') return { ok: false, error: 'Can only resubmit returned reflections' };
    var txt = String(newText || '').trim();
    var wc = (txt.match(/\S+/g) || []).length;
    if (wc < 50) return { ok: false, error: 'Reflection must be at least 50 words. You have ' + wc + '.' };
    var tier = computeNuggetTier(wc);
    refs[idx].reflection_text = txt;
    refs[idx].word_count = wc;
    refs[idx].nugget_tier = tier;
    refs[idx].status = 'pending';
    refs[idx].moderation_status = 'pending';
    refs[idx].returned_reason = '';
    refs[idx].returned_at = null;
    refs[idx].returned_by = null;
    DATA.setToLS(LS.GRADE_REFLECTIONS, refs);
    createActivityEvent({ actor_id: r.character_name, actor_name: r.character_name, actor_type: 'student', object_type: 'grade_reflection', object_id: id, event_type: 'grade_reflection_resubmitted', meta: { word_count: wc } });
    return { ok: true, id: id, nugget_tier: tier };
  }

  function getConcerns() {
    var raw = DATA.getFromLS ? DATA.getFromLS(LS.CONCERNS, []) : [];
    return Array.isArray(raw) ? raw : [];
  }

  function createConcern(opts) {
    var concerns = getConcerns();
    var id = 'concern_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    var c = {
      id: id,
      subject_type: String(opts.subject_type || 'thanks').trim(),
      subject_id: String(opts.subject_id || '').trim(),
      character_name: String(opts.character_name || '').trim(),
      recorded_by: String(opts.recorded_by || 'Teacher').trim(),
      recorded_at: new Date().toISOString(),
      note: String(opts.note || '').trim().slice(0, 500),
    };
    concerns.push(c);
    DATA.setToLS(LS.CONCERNS, concerns);
    createActivityEvent({ actor_id: opts.recorded_by || 'teacher', actor_name: opts.recorded_by || 'Teacher', actor_type: 'teacher', object_type: 'concern', object_id: id, event_type: 'concern_logged', meta: { subject_type: c.subject_type, subject_id: c.subject_id, character_name: c.character_name } });
    return { ok: true, id: id };
  }

  function getTeacherMissions() {
    var raw = DATA.getFromLS ? DATA.getFromLS(LS.TEACHER_MISSIONS, []) : [];
    return Array.isArray(raw) ? raw : [];
  }

  function getActiveTeacherMissions() {
    return getTeacherMissions().filter(function (m) { return m.active !== false; })
      .sort(function (a, b) { return (b.created_at || '').localeCompare(a.created_at || ''); });
  }

  /** Missions visible to a student: by audience (school_mission = all; my_students = all when no roster; selected_students = target list). */
  function getActiveTeacherMissionsForCharacter(characterName) {
    var key = String(characterName || '').trim();
    var active = getTeacherMissions().filter(function (m) { return m.active !== false; });
    var visible = active.filter(function (m) {
      var aud = String(m.audience || 'school_mission').trim();
      if (aud === 'school_mission') return true;
      if (aud === 'my_students') return true;
      if (aud === 'selected_students') {
        var t = m.target_character_names;
        return Array.isArray(t) && t.indexOf(key) >= 0;
      }
      return true;
    });
    return visible.sort(function (a, b) {
      var pa = a.featured ? 1 : 0;
      var pb = b.featured ? 1 : 0;
      if (pa !== pb) return pb - pa;
      return (b.created_at || '').localeCompare(a.created_at || '');
    });
  }

  function getTeacherMissionsForTeacher(teacherId) {
    var tid = String(teacherId || 'teacher').trim();
    return getTeacherMissions().filter(function (m) { return String(m.created_by_teacher_id || 'teacher').trim() === tid; })
      .sort(function (a, b) { return (b.created_at || '').localeCompare(a.created_at || ''); });
  }

  function createTeacherMission(opts) {
    var missions = getTeacherMissions();
    var id = 'tmission_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    var teacherId = String(opts.created_by_teacher_id || 'teacher').trim();
    var teacherName = String(opts.created_by_teacher_name || 'Teacher').trim();
    var actor = resolveActorId(teacherName, 'teacher');
    var audience = ['my_students', 'selected_students', 'school_mission'].indexOf(String(opts.audience || 'school_mission').trim()) >= 0 ? String(opts.audience || 'school_mission').trim() : 'school_mission';
    var m = {
      id: id,
      title: String(opts.title || '').trim().slice(0, 200),
      description: String(opts.description || '').trim().slice(0, 1000),
      reward_amount: Math.max(1, Math.min(99, Math.floor(Number(opts.reward_amount) || 1))),
      submission_type: ['text', 'link', 'image_url', 'confirmation'].indexOf(String(opts.submission_type || 'text').trim()) >= 0 ? String(opts.submission_type || 'text').trim() : 'text',
      created_by_teacher_id: teacherId,
      created_by_teacher_name: teacherName,
      actor_id: actor.actor_id,
      actor_name: actor.actor_name,
      actor_type: actor.actor_type,
      due_date: opts.due_date ? String(opts.due_date).trim() : null,
      active: opts.active !== false,
      created_at: new Date().toISOString(),
      audience: audience,
      target_character_names: audience === 'selected_students' && Array.isArray(opts.target_character_names) ? opts.target_character_names.slice() : undefined,
      featured: !!opts.featured,
      site_eligible: !!opts.site_eligible,
      allows_text: opts.allows_text !== false,
      allows_image: !!(opts.allows_image),
      allows_video: !!(opts.allows_video),
      allows_link: !!(opts.allows_link),
      min_characters: opts.min_characters !== undefined && opts.min_characters !== null ? Math.max(0, Math.floor(Number(opts.min_characters)) || 200) : 200,
    };
    missions.push(m);
    DATA.setToLS(LS.TEACHER_MISSIONS, missions);
    createActivityEvent({ actor_id: m.created_by_teacher_id, actor_name: m.created_by_teacher_name, actor_type: 'teacher', object_type: 'teacher_mission', object_id: id, event_type: 'mission_created', meta: { title: m.title, reward_amount: m.reward_amount } });
    return { ok: true, id: id, mission: m };
  }

  function updateTeacherMission(id, updates) {
    var missions = getTeacherMissions();
    var idx = missions.findIndex(function (m) { return m.id === id; });
    if (idx < 0) return { ok: false, error: 'Not found' };
    if (updates.active !== undefined) missions[idx].active = !!updates.active;
    if (updates.title !== undefined) missions[idx].title = String(updates.title).trim().slice(0, 200);
    if (updates.description !== undefined) missions[idx].description = String(updates.description).trim().slice(0, 1000);
    if (updates.reward_amount !== undefined) missions[idx].reward_amount = Math.max(1, Math.min(99, Math.floor(Number(updates.reward_amount) || 1)));
    if (updates.featured !== undefined) missions[idx].featured = !!updates.featured;
    if (updates.site_eligible !== undefined) missions[idx].site_eligible = !!updates.site_eligible;
    if (updates.audience !== undefined) missions[idx].audience = ['my_students', 'selected_students', 'school_mission'].indexOf(String(updates.audience).trim()) >= 0 ? String(updates.audience).trim() : missions[idx].audience || 'school_mission';
    if (updates.target_character_names !== undefined) missions[idx].target_character_names = Array.isArray(updates.target_character_names) ? updates.target_character_names.slice() : undefined;
    DATA.setToLS(LS.TEACHER_MISSIONS, missions);
    return { ok: true, mission: missions[idx] };
  }

  function getMissionSubmissions() {
    var raw = DATA.getFromLS ? DATA.getFromLS(LS.MISSION_SUBMISSIONS, []) : [];
    return Array.isArray(raw) ? raw : [];
  }

  function submitMissionCompletion(missionId, characterName, submissionType, submissionContent) {
    var missions = getTeacherMissions();
    var mission = missions.find(function (m) { return m.id === missionId; });
    if (!mission) return { ok: false, error: 'Mission not found' };
    if (mission.active === false) return { ok: false, error: 'Mission is not active' };
    var key = String(characterName || '').trim();
    if (!key) return { ok: false, error: 'character_name required' };
    var type = String(submissionType || mission.submission_type || 'text').trim();
    if (['text', 'link', 'image_url', 'video', 'confirmation', 'poll', 'bug_report'].indexOf(type) < 0) type = 'text';
    var contentMax = type === 'poll' || type === 'bug_report' ? 4000 : 2000;
    var content = String(submissionContent || '').trim().slice(0, contentMax);
    if (type === 'confirmation') content = content || 'confirmed';
    var subs = getMissionSubmissions();
    var id = 'msub_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    var actor = resolveActorId(key, 'student');
    subs.push({
      id: id,
      mission_id: missionId,
      character_name: key,
      actor_id: actor.actor_id,
      actor_name: actor.actor_name,
      actor_type: actor.actor_type,
      submission_type: type,
      submission_content: content,
      status: 'pending',
      moderation_status: 'pending',
      visibility: 'teacher_only',
      created_at: new Date().toISOString(),
      returned_reason: '',
      returned_at: null,
      returned_by: null,
      accepted_at: null,
      accepted_by: null,
    });
    DATA.setToLS(LS.MISSION_SUBMISSIONS, subs);
    createActivityEvent({ actor_id: key, actor_name: key, actor_type: 'student', object_type: 'teacher_mission', object_id: missionId, event_type: 'mission_submitted', meta: { character_name: key, mission_title: mission.title, submission_id: id } });
    return { ok: true, id: id, mission: mission };
  }

  function getMissionSubmissionsForTeacher(teacherId) {
    var tid = String(teacherId || 'teacher').trim();
    var missions = getTeacherMissionsForTeacher(teacherId);
    var missionIds = missions.map(function (m) { return m.id; });
    return getMissionSubmissions().filter(function (s) { return missionIds.indexOf(s.mission_id) >= 0 && (s.status || 'pending') === 'pending'; })
      .sort(function (a, b) { return (a.created_at || '').localeCompare(b.created_at || ''); });
  }

  function getMissionSubmissionsForCharacter(characterName) {
    var key = String(characterName || '').trim();
    return getMissionSubmissions().filter(function (s) { return String(s.character_name || '').trim() === key; })
      .sort(function (a, b) { return (b.created_at || '').localeCompare(a.created_at || ''); });
  }

  function approveMissionSubmission(id, acceptedBy, economyBackendCharged) {
    var subs = getMissionSubmissions();
    var idx = subs.findIndex(function (s) { return s.id === id; });
    if (idx < 0) return { ok: false, error: 'Not found' };
    var s = subs[idx];
    var mission = getTeacherMissions().find(function (m) { return m.id === s.mission_id; });
    if (!mission) return { ok: false, error: 'Mission not found' };
    if ((s.status || 'pending') !== 'pending') return { ok: false, error: 'Can only approve pending submissions' };
    var reward = Math.max(1, Math.min(99, Number(mission.reward_amount) || 1));
    subs[idx].status = 'accepted';
    subs[idx].moderation_status = 'approved';
    subs[idx].accepted_at = new Date().toISOString();
    subs[idx].accepted_by = String(acceptedBy || 'Teacher').trim();
    subs[idx].returned_reason = '';
    subs[idx].returned_at = null;
    subs[idx].returned_by = null;
    DATA.setToLS(LS.MISSION_SUBMISSIONS, subs);
    if (!economyBackendCharged) addActivity(s.character_name, reward, 'POSITIVE', 'APPROVAL', 'Teacher mission: ' + (mission.title || 'Mission'));
    createActivityEvent({ actor_id: 'teacher', actor_name: acceptedBy || 'Teacher', actor_type: 'teacher', object_type: 'teacher_mission', object_id: s.mission_id, event_type: 'mission_approved', meta: { character_name: s.character_name, mission_title: mission.title, nuggets: reward } });
    createActivityEvent({ actor_id: 'teacher', actor_name: 'Teacher', actor_type: 'teacher', object_type: 'teacher_mission', object_id: id, event_type: 'nugget_earned', meta: { character_name: s.character_name, nuggets: reward, source: 'teacher_mission' } });
    checkAndUnlockAchievements(s.character_name);
    return { ok: true, nuggets: reward, character_name: s.character_name };
  }

  function rejectMissionSubmission(id) {
    var subs = getMissionSubmissions();
    var idx = subs.findIndex(function (s) { return s.id === id; });
    if (idx < 0) return { ok: false, error: 'Not found' };
    subs[idx].status = 'rejected';
    subs[idx].moderation_status = 'rejected';
    subs[idx].accepted_at = new Date().toISOString();
    subs[idx].accepted_by = null;
    subs[idx].returned_reason = '';
    subs[idx].returned_at = null;
    subs[idx].returned_by = null;
    DATA.setToLS(LS.MISSION_SUBMISSIONS, subs);
    createActivityEvent({ actor_id: 'teacher', actor_name: 'Teacher', actor_type: 'teacher', object_type: 'teacher_mission', object_id: subs[idx].mission_id, event_type: 'mission_rejected', meta: { character_name: subs[idx].character_name } });
    return { ok: true };
  }

  function returnMissionSubmissionForImprovements(id, reason, returnedBy) {
    var subs = getMissionSubmissions();
    var idx = subs.findIndex(function (s) { return s.id === id; });
    if (idx < 0) return { ok: false, error: 'Not found' };
    var s = subs[idx];
    if ((s.status || 'pending') !== 'pending') return { ok: false, error: 'Can only return pending submissions' };
    var r = String(reason || '').trim().slice(0, 500);
    subs[idx].status = 'returned';
    subs[idx].moderation_status = 'returned';
    subs[idx].returned_reason = r;
    subs[idx].returned_at = new Date().toISOString();
    subs[idx].returned_by = String(returnedBy || 'Teacher').trim();
    DATA.setToLS(LS.MISSION_SUBMISSIONS, subs);
    var mission = getTeacherMissions().find(function (m) { return m.id === s.mission_id; });
    createActivityEvent({ actor_id: 'teacher', actor_name: returnedBy || 'Teacher', actor_type: 'teacher', object_type: 'teacher_mission', object_id: s.mission_id, event_type: 'mission_returned', meta: { character_name: s.character_name, mission_title: mission ? mission.title : '' } });
    return { ok: true };
  }

  function resubmitMissionSubmission(id, newContent) {
    var subs = getMissionSubmissions();
    var idx = subs.findIndex(function (s) { return s.id === id; });
    if (idx < 0) return { ok: false, error: 'Not found' };
    var s = subs[idx];
    if ((s.status || '') !== 'returned') return { ok: false, error: 'Can only resubmit returned submissions' };
    var st = String(s.submission_type || '').trim();
    var contentMax = (st === 'poll' || st === 'bug_report') ? 4000 : 2000;
    var content = String(newContent || '').trim().slice(0, contentMax);
    subs[idx].submission_content = content;
    subs[idx].status = 'pending';
    subs[idx].moderation_status = 'pending';
    subs[idx].returned_reason = '';
    subs[idx].returned_at = null;
    subs[idx].returned_by = null;
    DATA.setToLS(LS.MISSION_SUBMISSIONS, subs);
    var mission = getTeacherMissions().find(function (m) { return m.id === s.mission_id; });
    createActivityEvent({ actor_id: s.character_name, actor_name: s.character_name, actor_type: 'student', object_type: 'teacher_mission', object_id: s.mission_id, event_type: 'mission_resubmitted', meta: { mission_title: mission ? mission.title : '' } });
    return { ok: true, id: id };
  }

  var NEWS_CATEGORIES = ['School News', 'Sports', 'Clubs', 'Events', 'Student Spotlight', 'Announcements'];
  var NEWS_AUTHOR_TYPES = ['student', 'teacher', 'staff', 'admin'];

  function getNews() {
    var raw = DATA.getFromLS ? DATA.getFromLS(LS.NEWS, []) : [];
    return Array.isArray(raw) ? raw : [];
  }

  function getApprovedNews() {
    return getNews().filter(function (n) { return isModerationApproved(n) && isVisibilitySchoolCommunity(n); })
      .sort(function (a, b) { return (b.approved_at || b.created_at || '').localeCompare(a.approved_at || a.created_at || ''); });
  }

  function getNewsPending() {
    return getNews().filter(function (n) { return (n.status || 'pending') === 'pending'; })
      .sort(function (a, b) { return (a.created_at || '').localeCompare(b.created_at || ''); }).reverse();
  }

  function getNewsForAuthor(authorName) {
    var key = String(authorName || '').trim();
    return getNews().filter(function (n) { return String(n.author_name || '').trim() === key; })
      .sort(function (a, b) { return (b.created_at || '').localeCompare(a.created_at || ''); });
  }

  function createNewsArticle(opts) {
    var news = getNews();
    var id = 'news_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    var cat = String(opts.category || 'School News').trim();
    if (NEWS_CATEGORIES.indexOf(cat) < 0) cat = 'School News';
    var authorType = String(opts.author_type || 'student').trim();
    if (NEWS_AUTHOR_TYPES.indexOf(authorType) < 0) authorType = 'student';
    var authorName = String(opts.author_name || '').trim() || (authorType === 'student' ? 'Student' : authorType === 'teacher' ? 'Teacher' : authorType === 'staff' ? 'Staff' : 'Admin');
    var actor = resolveActorId(authorName, authorType);
    var linkUrl = (opts.link_url && /^https?:\/\//i.test(String(opts.link_url).trim())) ? String(opts.link_url).trim().slice(0, 2000) : null;
    var article = {
      id: id,
      title: String(opts.title || '').trim().slice(0, 200),
      body: String(opts.body || '').trim().slice(0, 5000),
      category: cat,
      author_name: authorName,
      author_type: authorType,
      actor_id: actor.actor_id,
      actor_name: actor.actor_name,
      actor_type: actor.actor_type,
      status: 'pending',
      moderation_status: 'pending',
      visibility: 'school_community',
      created_at: new Date().toISOString(),
      approved_at: null,
      approved_by: null,
      feature_eligible: opts.feature_eligible !== false,
      returned_reason: '',
      returned_at: null,
      returned_by: null,
      link_url: linkUrl || undefined,
    };
    news.push(article);
    DATA.setToLS(LS.NEWS, news);
    createActivityEvent({ actor_id: authorName, actor_name: authorName, actor_type: authorType, object_type: 'news_article', object_id: id, event_type: 'news_submitted', meta: { title: article.title, category: cat } });
    return { ok: true, id: id, article: article };
  }

  function updateNewsArticle(id, updates) {
    var news = getNews();
    var idx = news.findIndex(function (n) { return n.id === id; });
    if (idx < 0) return { ok: false, error: 'Not found' };
    if (updates.title !== undefined) news[idx].title = String(updates.title).trim().slice(0, 200);
    if (updates.body !== undefined) news[idx].body = String(updates.body).trim().slice(0, 5000);
    if (updates.category !== undefined) {
      var cat = String(updates.category || 'School News').trim();
      if (NEWS_CATEGORIES.indexOf(cat) >= 0) news[idx].category = cat;
    }
    DATA.setToLS(LS.NEWS, news);
    return { ok: true, article: news[idx] };
  }

  function approveNewsArticle(id, approvedBy) {
    var news = getNews();
    var idx = news.findIndex(function (n) { return n.id === id; });
    if (idx < 0) return { ok: false, error: 'Not found' };
    var a = news[idx];
    if ((a.status || '') !== 'pending') return { ok: false, error: 'Can only approve pending articles' };
    news[idx].status = 'approved';
    news[idx].moderation_status = 'approved';
    news[idx].approved_at = new Date().toISOString();
    news[idx].approved_by = String(approvedBy || 'Teacher').trim();
    news[idx].returned_reason = '';
    news[idx].returned_at = null;
    news[idx].returned_by = null;
    DATA.setToLS(LS.NEWS, news);
    createActivityEvent({ actor_id: approvedBy || 'Teacher', actor_name: approvedBy || 'Teacher', actor_type: 'teacher', object_type: 'news_article', object_id: id, event_type: 'news_published', meta: { title: a.title, author_name: a.author_name, author_type: a.author_type } });
    if ((a.author_type || '') === 'student' && String(a.author_name || '').trim()) checkAndUnlockAchievements(String(a.author_name).trim());
    return { ok: true, article: news[idx] };
  }

  function rejectNewsArticle(id) {
    var news = getNews();
    var idx = news.findIndex(function (n) { return n.id === id; });
    if (idx < 0) return { ok: false, error: 'Not found' };
    news[idx].status = 'rejected';
    news[idx].moderation_status = 'rejected';
    news[idx].returned_reason = '';
    news[idx].returned_at = null;
    news[idx].returned_by = null;
    DATA.setToLS(LS.NEWS, news);
    return { ok: true, article: news[idx] };
  }

  function returnNewsArticleForImprovements(id, reason, returnedBy) {
    var news = getNews();
    var idx = news.findIndex(function (n) { return n.id === id; });
    if (idx < 0) return { ok: false, error: 'Not found' };
    var a = news[idx];
    if ((a.status || 'pending') !== 'pending') return { ok: false, error: 'Can only return pending articles' };
    var r = String(reason || '').trim().slice(0, 500);
    news[idx].status = 'returned';
    news[idx].moderation_status = 'returned';
    news[idx].returned_reason = r;
    news[idx].returned_at = new Date().toISOString();
    news[idx].returned_by = String(returnedBy || 'Teacher').trim();
    DATA.setToLS(LS.NEWS, news);
    createActivityEvent({ actor_id: returnedBy || 'Teacher', actor_name: returnedBy || 'Teacher', actor_type: 'teacher', object_type: 'news_article', object_id: id, event_type: 'news_returned', meta: { title: a.title, author_name: a.author_name } });
    return { ok: true, article: news[idx] };
  }

  function resubmitNewsArticle(id, newTitle, newBody) {
    var news = getNews();
    var idx = news.findIndex(function (n) { return n.id === id; });
    if (idx < 0) return { ok: false, error: 'Not found' };
    var a = news[idx];
    if ((a.status || '') !== 'returned') return { ok: false, error: 'Can only resubmit returned articles' };
    news[idx].title = String(newTitle || a.title || '').trim().slice(0, 200);
    news[idx].body = String(newBody || a.body || '').trim().slice(0, 5000);
    news[idx].status = 'pending';
    news[idx].moderation_status = 'pending';
    news[idx].returned_reason = '';
    news[idx].returned_at = null;
    news[idx].returned_by = null;
    DATA.setToLS(LS.NEWS, news);
    createActivityEvent({ actor_id: a.author_name, actor_name: a.author_name, actor_type: a.author_type || 'student', object_type: 'news_article', object_id: id, event_type: 'news_resubmitted', meta: { title: news[idx].title } });
    return { ok: true, id: id, article: news[idx] };
  }

  var HUNT_PAGES = ['index', 'explore', 'store', 'games', 'news'];
  var HUNT_PAGES_NEWS_WEIGHTED = ['index', 'explore', 'news', 'store', 'news', 'games'];
  function hashStr(s) {
    var str = String(s || '');
    var h = 0;
    for (var i = 0; i < str.length; i++) h = ((h << 5) - h) + str.charCodeAt(i) | 0;
    return Math.abs(h);
  }
  var HUNT_RARITIES = [
    { id: 'common', nuggets: 1, weight: 60 },
    { id: 'uncommon', nuggets: 2, weight: 25 },
    { id: 'rare', nuggets: 3, weight: 12 },
    { id: 'ultra_rare', nuggets: 5, weight: 3 },
  ];
  var HUNT_RARITIES_NEWS = [
    { id: 'common', nuggets: 1, weight: 45 },
    { id: 'uncommon', nuggets: 2, weight: 30 },
    { id: 'rare', nuggets: 3, weight: 18 },
    { id: 'ultra_rare', nuggets: 5, weight: 7 },
  ];
  var HUNT_RARITY_LABELS = { common: 'Common', uncommon: 'Uncommon', rare: 'Rare', ultra_rare: 'Ultra rare' };
  function getDailyHuntRarityForCharacter(characterName, page) {
    var today = todayStr();
    var key = String(characterName || '').trim();
    var seed = hashStr(key + today + 'rarity');
    var rarities = (page === 'news') ? HUNT_RARITIES_NEWS : HUNT_RARITIES;
    var totalWeight = rarities.reduce(function (s, r) { return s + r.weight; }, 0);
    var roll = (seed % 10000) / 10000;
    var rarity = rarities[0];
    for (var i = 0; i < rarities.length; i++) {
      roll -= rarities[i].weight / totalWeight;
      if (roll <= 0) { rarity = rarities[i]; break; }
    }
    return { id: rarity.id, nuggets: rarity.nuggets };
  }
  var HUNT_HINTS = {
    index: ['Creative minds gather here.', 'Your profile holds a secret.', 'Where your story begins.'],
    explore: ['Discover where discoveries live.', 'Look where the spotlight shines.', 'Where approved creations shine.'],
    store: ['Where treasures are found.', 'Look where the best deals hide.', 'Where nuggets become rewards.'],
    games: ['Look where the games begin.', 'Where fun begins.', 'Find the place where play lives.'],
    news: ['Where stories are told.', 'Find the place where news appears.', 'Where headlines live.', 'Rumor: Something shines near the news today.', 'The best finds sometimes hide where the stories are.'],
  };

  function todaySeed(dateStr) {
    var s = String(dateStr || '').trim();
    var h = 0;
    for (var i = 0; i < s.length; i++) h = ((h << 5) - h) + s.charCodeAt(i) | 0;
    return (Math.abs(h) % 10000) / 10000;
  }

  function getDailyNuggetHunt() {
    var raw = DATA.getFromLS ? DATA.getFromLS(LS.NUGGET_HUNT, null) : null;
    return raw && typeof raw === 'object' ? raw : null;
  }

  function getOrCreateDailyHunt() {
    var today = todayStr();
    var hunt = getDailyNuggetHunt();
    if (hunt && String(hunt.spawn_date || '').slice(0, 10) === today) return hunt;
    var seed = todaySeed(today);
    var weighted = HUNT_PAGES_NEWS_WEIGHTED;
    var pageIdx = Math.floor(seed * weighted.length) % weighted.length;
    var page = weighted[pageIdx];
    var zoneIdx = Math.floor(seed * 1000) % HUNT_ZONES.length;
    var zone = HUNT_ZONES[zoneIdx];
    var hints = HUNT_HINTS[page] || HUNT_HINTS.index;
    var hintIdx = Math.floor(seed * 10000) % hints.length;
    var hintText = hints[hintIdx] || hints[0];
    var rarities = page === 'news' ? HUNT_RARITIES_NEWS : HUNT_RARITIES;
    var totalWeight = rarities.reduce(function (s, r) { return s + r.weight; }, 0);
    var roll = (Math.floor(seed * 100000) % totalWeight) / totalWeight;
    var rarity = rarities[0];
    for (var i = 0; i < rarities.length; i++) {
      roll -= rarities[i].weight / totalWeight;
      if (roll <= 0) { rarity = rarities[i]; break; }
    }
    hunt = {
      spawn_date: today,
      page: page,
      x: zone.x,
      y: zone.y,
      rarity: rarity.id,
      nuggets: rarity.nuggets,
      hint_text: hintText,
      claims: {},
    };
    DATA.setToLS(LS.NUGGET_HUNT, hunt);
    return hunt;
  }

  function hasClaimedDailyHuntToday(characterName) {
    var key = String(characterName || '').trim();
    if (!key) return false;
    var hunt = getDailyNuggetHunt();
    if (!hunt || !hunt.claims) return false;
    var today = todayStr();
    return (hunt.claims[key] || '').slice(0, 10) === today;
  }

  function claimDailyNuggetHunt(characterName, economyBackendCharged) {
    var key = String(characterName || '').trim();
    if (!key) return { ok: false, error: 'character_name required' };
    var hunt = getOrCreateDailyHunt();
    var today = todayStr();
    if (String(hunt.spawn_date || '').slice(0, 10) !== today) return { ok: false, error: 'Hunt expired' };
    if (hasClaimedDailyHuntToday(key)) return { ok: false, already: true };
    var weighted = HUNT_PAGES_NEWS_WEIGHTED;
    var pageIdx = hashStr(key + today + 'page') % weighted.length;
    var huntPage = weighted[pageIdx];
    var rarityInfo = getDailyHuntRarityForCharacter(key, huntPage);
    var nuggets = rarityInfo.nuggets || 1;
    var rarity = rarityInfo.id || 'common';
    if (!hunt.claims) hunt.claims = {};
    hunt.claims[key] = new Date().toISOString();
    DATA.setToLS(LS.NUGGET_HUNT, hunt);
    if (!economyBackendCharged) addActivity(key, nuggets, 'POSITIVE', 'MISSION', 'Daily Hidden Nugget');
    createActivityEvent({ actor_id: key, actor_name: key, actor_type: 'student', object_type: 'daily_hunt', object_id: hunt.spawn_date, event_type: 'daily_nugget_found', meta: { nuggets: nuggets, rarity: rarity } });
    checkAndUnlockAchievements(key);
    var granted = { id: null };
    if (rarity === 'rare' || rarity === 'ultra_rare') {
      var ownership = getCosmeticOwnershipForCharacter(key);
      var ownedSet = {};
      (ownership.owned || []).forEach(function (id) { ownedSet[id] = true; });
      var available = SECRET_COSMETIC_IDS.filter(function (id) { return !ownedSet[id]; });
      if (available.length > 0) {
        var pickIdx = hashStr(key + today + 'cosmetic') % available.length;
        var pick = available[pickIdx];
        if (grantSecretCosmetic(key, pick)) granted.id = pick;
      }
    }
    return { ok: true, nuggets: nuggets, rarity: rarity, rarity_label: HUNT_RARITY_LABELS[rarity] || 'Common', secret_unlock: granted.id };
  }

  function getHiddenNuggetClaims() {
    var raw = DATA.getFromLS ? DATA.getFromLS(LS.HIDDEN_NUGGET_CLAIMS, {}) : {};
    return raw && typeof raw === 'object' ? raw : {};
  }

  function hasClaimedNewsBonusToday(characterName) {
    var key = String(characterName || '').trim();
    if (!key) return false;
    var today = todayStr();
    var all = getHiddenNuggetClaims();
    var byChar = all[key];
    if (!byChar || typeof byChar !== 'object') return false;
    return (byChar[today] && byChar[today].news_bonus) === true;
  }

  function claimNewsBonus(characterName, economyBackendCharged) {
    var key = String(characterName || '').trim();
    if (!key) return { ok: false, error: 'character_name required' };
    if (hasClaimedNewsBonusToday(key)) return { ok: false, already: true };
    var today = todayStr();
    var all = getHiddenNuggetClaims();
    if (!all[key]) all[key] = {};
    if (!all[key][today]) all[key][today] = {};
    all[key][today].news_bonus = true;
    DATA.setToLS(LS.HIDDEN_NUGGET_CLAIMS, all);
    var nuggets = 2;
    if (!economyBackendCharged) addActivity(key, nuggets, 'POSITIVE', 'MISSION', 'News Hidden Nugget');
    createActivityEvent({ actor_id: key, actor_name: key, actor_type: 'student', object_type: 'hidden_nugget', object_id: 'news_bonus', event_type: 'hidden_nugget_found', meta: { nuggets: nuggets, source: 'news_page' } });
    checkAndUnlockAchievements(key);
    var newsUnlockId = 'badge_secret_finder';
    var ownership = getCosmeticOwnershipForCharacter(key);
    var hasNewsUnlock = (ownership.owned || []).indexOf(newsUnlockId) >= 0;
    if (!hasNewsUnlock && grantSecretCosmetic(key, newsUnlockId)) {
      return { ok: true, nuggets: nuggets, source: 'news_bonus', secret_unlock: newsUnlockId };
    }
    return { ok: true, nuggets: nuggets, source: 'news_bonus' };
  }

  function getNewsBonusStatus(characterName) {
    var key = String(characterName || '').trim();
    var claimed = key ? hasClaimedNewsBonusToday(key) : false;
    return { available: !!key && !claimed, claimed: claimed, nuggets: 2 };
  }

  function getHiddenUnlocks(characterName) {
    var key = String(characterName || '').trim();
    if (!key) return { titles: [], stickers: [], frames: [], backgrounds: [] };
    var raw = DATA.getFromLS ? DATA.getFromLS(LS.HIDDEN_UNLOCKS, {}) : {};
    var byChar = raw[key];
    if (!byChar || typeof byChar !== 'object') return { titles: [], stickers: [], frames: [], backgrounds: [] };
    return {
      titles: Array.isArray(byChar.titles) ? byChar.titles.slice() : [],
      stickers: Array.isArray(byChar.stickers) ? byChar.stickers.slice() : [],
      frames: Array.isArray(byChar.frames) ? byChar.frames.slice() : [],
      backgrounds: Array.isArray(byChar.backgrounds) ? byChar.backgrounds.slice() : [],
    };
  }

  function grantHiddenUnlock(characterName, type, id) {
    var key = String(characterName || '').trim();
    if (!key || !type || !id) return false;
    var raw = DATA.getFromLS ? DATA.getFromLS(LS.HIDDEN_UNLOCKS, {}) : {};
    if (!raw[key]) raw[key] = { titles: [], stickers: [], frames: [], backgrounds: [] };
    var arr = raw[key][type];
    if (!Array.isArray(arr)) arr = [];
    if (arr.indexOf(id) >= 0) return true;
    arr.push(id);
    raw[key][type] = arr;
    DATA.setToLS(LS.HIDDEN_UNLOCKS, raw);
    return true;
  }

  function getDailyHuntStatus(characterName, currentPage, spotCount) {
    var key = String(characterName || '').trim();
    var today = todayStr();
    var hunt = getOrCreateDailyHunt();
    var isToday = String(hunt.spawn_date || '').slice(0, 10) === today;
    var claimed = key ? hasClaimedDailyHuntToday(key) : false;
    var huntPage = '';
    var spotIndex = 0;
    var hintText = '';
    var rarityInfo = { id: 'common', nuggets: 1 };
    if (key) {
      var weighted = HUNT_PAGES_NEWS_WEIGHTED;
      var pageIdx = hashStr(key + today + 'page') % weighted.length;
      huntPage = weighted[pageIdx];
      var hints = HUNT_HINTS[huntPage] || HUNT_HINTS.index;
      var hintIdx = hashStr(key + today + 'hint') % hints.length;
      hintText = hints[hintIdx] || hints[0];
      rarityInfo = getDailyHuntRarityForCharacter(key, huntPage);
      var n = Math.max(1, parseInt(spotCount, 10) || 0);
      spotIndex = n > 0 ? (hashStr(key + today + (currentPage || '') + n) % n) : 0;
    }
    var onThisPage = (huntPage === (currentPage || '')) && !claimed;
    var out = {
      isToday: isToday,
      claimed: claimed,
      onThisPage: onThisPage,
      page: huntPage,
      hint_text: hintText,
      rarity: rarityInfo.id,
      rarity_label: HUNT_RARITY_LABELS[rarityInfo.id] || 'Common',
      nuggets: rarityInfo.nuggets,
      spotIndex: spotIndex,
    };
    if (currentPage === 'news' && key) {
      out.news_bonus = getNewsBonusStatus(key);
    }
    return out;
  }

  function getCurationForPost(postId) {
    var all = getPostCurations();
    var c = all[String(postId || '').trim()] || {};
    return {
      spotlighted: !!c.spotlighted,
      teacher_featured: !!c.teacher_featured,
      teacher_pick: !!c.teacher_pick,
      teacher_praise: String(c.teacher_praise || '').trim(),
    };
  }

  function curatePost(postId, action, payload) {
    var postIdStr = String(postId || '').trim();
    if (!postIdStr) return { ok: false, error: 'post_id required' };
    var posts = getPosts();
    var post = posts.find(function (p) { return p.id === postIdStr; });
    if (!post) return { ok: false, error: 'Post not found' };
    if (post.approved !== true && post.approved !== undefined) return { ok: false, error: 'Only approved posts can be curated. Approve the post first.' };
    var characterName = String(post.character_name || '').trim();
    if (!characterName) return { ok: false, error: 'Post has no character' };
    var all = getPostCurations();
    var cur = all[postIdStr] || {};
    var title = (post.title || 'Untitled').trim();
    if (action === 'spotlight') {
      cur.spotlighted = !cur.spotlighted;
      addActivity(characterName, 0, 'POSITIVE', 'CURATION', cur.spotlighted ? 'Spotlighted post: ' + title : 'Un-spotlighted post: ' + title);
    } else if (action === 'feature') {
      cur.teacher_featured = !cur.teacher_featured;
      addActivity(characterName, 0, 'POSITIVE', 'CURATION', cur.teacher_featured ? 'Featured: ' + title : 'Un-featured: ' + title);
      if (cur.teacher_featured) createActivityEvent({ actor_id: 'teacher', actor_name: 'Teacher', actor_type: 'teacher', object_type: 'post', object_id: postIdStr, event_type: 'featured', meta: { character_name: characterName, title: title } });
    } else if (action === 'teacher_pick') {
      cur.teacher_pick = !cur.teacher_pick;
      addActivity(characterName, 0, 'POSITIVE', 'CURATION', cur.teacher_pick ? 'Teacher Pick: ' + title : 'Removed Teacher Pick: ' + title);
      if (cur.teacher_pick) createActivityEvent({ actor_id: 'teacher', actor_name: 'Teacher', actor_type: 'teacher', object_type: 'post', object_id: postIdStr, event_type: 'teacher_pick', meta: { character_name: characterName, title: title } });
    } else if (action === 'praise') {
      var praise = String((payload && payload.praise) || '').trim().slice(0, 200);
      cur.teacher_praise = praise;
      if (praise) addActivity(characterName, 0, 'POSITIVE', 'CURATION', 'Teacher praise: ' + title);
    } else {
      return { ok: false, error: 'Unknown action' };
    }
    all[postIdStr] = cur;
    DATA.setToLS(LS.POST_CURATIONS, all);
    checkAndUnlockAchievements(characterName);
    return { ok: true, post: post, curation: cur };
  }

  function getDiscoveryFeed(limit) {
    var cap = Math.min(50, Math.max(6, Number(limit) || 12));
    var posts = getPosts().filter(function (p) { return p.approved === true || p.approved === undefined; });
    var spotlighted = getSpotlightedCharacters();
    var curations = getPostCurations();
    var sorted = posts.slice().sort(function (a, b) { return (b.created_at || '').localeCompare(a.created_at || ''); });
    return sorted.slice(0, cap).map(function (p) {
      var c = curations[p.id] || {};
      var charSpotlighted = spotlighted.indexOf(String(p.character_name || '').trim()) >= 0;
      var postSpotlighted = !!c.spotlighted;
      return {
        id: p.id,
        character_name: p.character_name,
        type: p.type,
        title: p.title,
        caption: p.caption,
        url: p.url,
        created_at: p.created_at,
        pinned: p.pinned,
        spotlighted: charSpotlighted || postSpotlighted,
        teacher_pick: !!c.teacher_pick,
        teacher_featured: !!c.teacher_featured,
      };
    });
  }

  function getExploreFeed() {
    var posts = getApprovedPosts();
    var spotlighted = getSpotlightedCharacters();
    var curations = getPostCurations();
    var profiles = getProfiles();
    return posts.map(function (p) {
      var c = curations[p.id] || {};
      var charSpotlighted = spotlighted.indexOf(String(p.character_name || '').trim()) >= 0;
      var postSpotlighted = !!c.spotlighted;
      var prof = profiles[String(p.character_name || '').trim()] || {};
      return {
        id: p.id,
        character_name: p.character_name,
        actor_id: p.actor_id,
        actor_name: p.actor_name || p.character_name,
        actor_type: p.actor_type || 'student',
        display_name: (prof.display_name || '').trim() || p.character_name,
        type: p.type,
        title: p.title,
        caption: p.caption,
        url: p.url,
        created_at: p.created_at,
        pinned: p.pinned,
        spotlighted: charSpotlighted || postSpotlighted,
        teacher_pick: !!c.teacher_pick,
        teacher_featured: !!c.teacher_featured,
      };
    });
  }

  function getCharacterBalance(characterName) {
    var earned = getCharacterEarned(characterName);
    var spent = getCharacterSpent(characterName);
    if (earned > 0 || spent > 0) return earned - spent;
    var chars = getCharacters();
    var c = chars.find(function (x) { return String(x.name || '').trim() === String(characterName || '').trim(); });
    return c ? (Number(c.balance) || 0) : 0;
  }

  function getCharacterEarned(characterName) {
    return (getActivity() || []).reduce(function (s, r) {
      return s + (r.character_name === characterName && (Number(r.nugget_delta) || 0) > 0 ? (Number(r.nugget_delta) || 0) : 0);
    }, 0);
  }

  function getCharacterSpent(characterName) {
    return (getPurchases() || []).reduce(function (s, r) {
      return s + (r.character_name === characterName ? (Number(r.total_cost) || 0) : 0);
    }, 0);
  }

  function computeLeaderboard() {
    var chars = getCharacters();
    var activity = getActivity();
    var purchases = getPurchases();
    var byName = {};
    chars.forEach(function (c) {
      var n = String(c.name || '').trim();
      if (n) byName[n] = { character_name: n, student_name: n, earned: 0, spent: 0, available: 0 };
    });
    activity.forEach(function (r) {
      var n = String(r.character_name || '').trim();
      if (n && byName[n] !== undefined) {
        var d = Number(r.nugget_delta) || 0;
        if (d > 0) byName[n].earned += d;
      }
    });
    purchases.forEach(function (r) {
      var n = String(r.character_name || '').trim();
      if (n && byName[n] !== undefined) {
        byName[n].spent += Number(r.total_cost) || 0;
      }
    });
    Object.keys(byName).forEach(function (n) {
      byName[n].available = byName[n].earned - byName[n].spent;
    });
    return Object.values(byName).sort(function (a, b) { return (b.available || 0) - (a.available || 0); });
  }

  function submitAvatarUpload(characterName, imageData, costPerSubmit, backendOnly, economyBackendCharged) {
    var key = String(characterName || '').trim();
    if (!key) return { ok: false, error: 'character_name required' };
    var dataUrl = String(imageData || '').trim();
    if (!backendOnly && !economyBackendCharged && (!dataUrl || dataUrl.indexOf('data:image/') !== 0)) return { ok: false, error: 'Invalid image data' };
    var subs = getAvatarSubmissions();
    var alreadyPending = subs.some(function (s) { return String(s.character_name || '').trim() === key && String(s.status || 'pending') === 'pending'; });
    if (!backendOnly && !economyBackendCharged && alreadyPending) return { ok: false, error: 'You already have an avatar awaiting approval.' };
    var cost = Math.max(1, Math.floor(Number(costPerSubmit || 25)));
    if (!economyBackendCharged) {
      var balance = getCharacterBalance(key);
      if (balance < cost) return { ok: false, error: 'Not enough nuggets. Need ' + cost + ', available ' + balance };
      addPurchase(key, 'avatar_upload', 'Avatar Upload', 1, cost, 'Avatar upload');
    }
    if (backendOnly && !economyBackendCharged) return { ok: true, id: 'backend', cost: cost, available_after: getCharacterBalance(key) - cost };
    var id = 'av_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    var actor = resolveActorId(key, 'student');
    var entry = {
      id: id,
      character_name: key,
      actor_id: actor.actor_id,
      actor_name: actor.actor_name,
      actor_type: actor.actor_type,
      image_data: dataUrl,
      status: 'pending',
      created_at: new Date().toISOString(),
      accepted_at: null,
      accepted_by: null,
      rejected_at: null,
      rejected_by: null,
      rejected_reason: '',
    };
    subs.push(entry);
    DATA.setToLS(LS.AVATAR_SUBMISSIONS, subs);
    createActivityEvent({
      actor_id: actor.actor_id,
      actor_name: actor.actor_name,
      actor_type: actor.actor_type,
      object_type: 'avatar',
      object_id: id,
      event_type: 'avatar_submitted',
      meta: { character_name: key, cost: cost },
    });
    return { ok: true, id: id, cost: cost, available_after: economyBackendCharged ? getCharacterBalance(key) : (getCharacterBalance(key)) };
  }

  function getAvatarStatus(characterName) {
    var key = String(characterName || '').trim();
    if (!key) return { ok: false, status: {} };
    var subs = getAvatarSubmissions().filter(function (s) { return String(s.character_name || '').trim() === key; });
    var pending = subs.find(function (s) { return String(s.status || 'pending') === 'pending'; }) || null;
    var approved = subs.filter(function (s) { return String(s.status || '') === 'approved'; })
      .sort(function (a, b) { return (b.accepted_at || '').localeCompare(a.accepted_at || ''); })[0] || null;
    var profile = getProfileForCharacter(key);
    var activeImage = String(profile.custom_avatar || '').trim();
    if (!activeImage && approved && approved.image_data) activeImage = approved.image_data;
    return {
      ok: true,
      status: {
        has_pending: !!pending,
        pending_image: pending ? pending.image_data : '',
        pending_submitted_at: pending ? pending.created_at : null,
        has_approved: !!approved,
        active_image: activeImage || '',
      },
    };
  }

  function getPendingAvatarsForTeacher() {
    var subs = getAvatarSubmissions();
    return subs.filter(function (s) { return String(s.status || 'pending') === 'pending'; })
      .sort(function (a, b) { return (a.created_at || '').localeCompare(b.created_at || ''); });
  }

  function approveAvatarSubmission(id, acceptedByName) {
    var subs = getAvatarSubmissions();
    var idx = subs.findIndex(function (s) { return String(s.id || '') === String(id || ''); });
    if (idx < 0) return { ok: false, error: 'Not found' };
    var sub = subs[idx];
    subs[idx].status = 'approved';
    subs[idx].accepted_at = new Date().toISOString();
    subs[idx].accepted_by = String(acceptedByName || 'Teacher').trim() || 'Teacher';
    DATA.setToLS(LS.AVATAR_SUBMISSIONS, subs);
    // Persist on profile so profile can render without scanning submissions.
    var profiles = getProfiles();
    var key = String(sub.character_name || '').trim();
    var current = profiles[key] || {};
    profiles[key] = Object.assign({}, current, {
      custom_avatar: String(sub.image_data || '').trim(),
    });
    DATA.setToLS(LS.PROFILES, profiles);
    createActivityEvent({
      actor_id: 'teacher',
      actor_name: subs[idx].accepted_by,
      actor_type: 'teacher',
      object_type: 'avatar',
      object_id: sub.id,
      event_type: 'avatar_approved',
      meta: { character_name: key },
    });
    return { ok: true, character_name: key };
  }

  function rejectAvatarSubmission(id, rejectedByName, reason) {
    var subs = getAvatarSubmissions();
    var idx = subs.findIndex(function (s) { return String(s.id || '') === String(id || ''); });
    if (idx < 0) return { ok: false, error: 'Not found' };
    subs[idx].status = 'rejected';
    subs[idx].rejected_at = new Date().toISOString();
    subs[idx].rejected_by = String(rejectedByName || 'Teacher').trim() || 'Teacher';
    subs[idx].rejected_reason = String(reason || '').trim();
    DATA.setToLS(LS.AVATAR_SUBMISSIONS, subs);
    return { ok: true };
  }

  function addActivity(characterName, nuggetDelta, kind, source, note) {
    var activity = getActivity();
    activity.push({
      timestamp: new Date().toISOString(),
      character_name: characterName,
      nugget_delta: nuggetDelta,
      kind: kind || 'POSITIVE',
      source: source || 'APPROVAL',
      note_text: note || '',
    });
    DATA.setToLS(LS.ACTIVITY, activity);
  }

  function getActivityEvents() {
    var raw = DATA.getFromLS ? DATA.getFromLS(LS.ACTIVITY_EVENTS, []) : [];
    return Array.isArray(raw) ? raw : [];
  }

  function createActivityEvent(opts) {
    var events = getActivityEvents();
    var id = 'evt_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    var name = String(opts.actor_name || opts.actor_id || '').trim();
    var type = opts.actor_type || 'student';
    var resolved = resolveActorId(name, type);
    var evt = {
      id: id,
      actor_id: resolved.actor_id,
      actor_name: resolved.actor_name || name,
      actor_type: resolved.actor_type || type,
      object_type: opts.object_type || 'post',
      object_id: String(opts.object_id || '').trim(),
      event_type: opts.event_type || 'post_created',
      created_at: new Date().toISOString(),
      meta: opts.meta && typeof opts.meta === 'object' ? opts.meta : {},
    };
    events.push(evt);
    var cap = 200;
    if (events.length > cap) events = events.slice(-cap);
    DATA.setToLS(LS.ACTIVITY_EVENTS, events);
    return evt;
  }

  function addPurchase(characterName, itemId, itemName, qty, totalCost, note) {
    var purchases = getPurchases();
    purchases.push({
      timestamp: new Date().toISOString(),
      character_name: characterName,
      item_id: itemId,
      item_name: itemName,
      qty: qty,
      total_cost: totalCost,
      note: note || '',
    });
    DATA.setToLS(LS.PURCHASES, purchases);
  }

  function getCosmetics() {
    return DATA.getCosmetics ? DATA.getCosmetics() : [];
  }

  /* Phase 8 cosmetic collection model: per-character owned[] (unlimited) and equipped{} (one per category).
   * Example: owned_items = owned[], equipped_background = equipped.background, equipped_frame = equipped.frame,
   * equipped_effect = equipped.effect, equipped_title = equipped.accent, etc. Locker uses this as collection UI. */
  function getCosmeticOwnershipForCharacter(characterName) {
    var key = String(characterName || '').trim();
    if (!key) return { owned: [], equipped: {} };
    var all = DATA.getCosmeticOwnership ? DATA.getCosmeticOwnership() : {};
    var rec = all[key] || {};
    return {
      owned: Array.isArray(rec.owned) ? rec.owned.slice() : [],
      equipped: rec.equipped && typeof rec.equipped === 'object' ? Object.assign({}, rec.equipped) : {},
    };
  }

  var SECRET_COSMETIC_IDS = ['frame_nugget_seeker', 'frame_hallway_hero', 'bg_hidden_lantern', 'bg_newsroom', 'badge_secret_finder', 'dec_lantern_glow'];

  function grantSecretCosmetic(characterName, cosmeticId) {
    var key = String(characterName || '').trim();
    if (!key || !cosmeticId) return false;
    var cosmetics = getCosmetics();
    var cosmetic = cosmetics.find(function (c) { return c.id === cosmeticId; });
    if (!cosmetic || cosmetic.purchasable !== false) return false;
    var all = DATA.getCosmeticOwnership ? DATA.getCosmeticOwnership() : {};
    var rec = all[key] || { owned: [], equipped: {} };
    if (!Array.isArray(rec.owned)) rec.owned = [];
    if (rec.owned.indexOf(cosmeticId) >= 0) return true;
    rec.owned.push(cosmeticId);
    all[key] = rec;
    DATA.setCosmeticOwnership(all);
    if (cosmetic.category === 'frame') grantHiddenUnlock(characterName, 'frames', cosmeticId);
    if (cosmetic.category === 'background') grantHiddenUnlock(characterName, 'backgrounds', cosmeticId);
    return true;
  }

  function purchaseCosmetic(characterName, cosmeticId, economyBackendCharged, availableAfterFromPayload) {
    var key = String(characterName || '').trim();
    if (!key) return { ok: false, error: 'character_name required' };
    var cosmetics = getCosmetics();
    var cosmetic = cosmetics.find(function (c) { return c.id === cosmeticId; });
    if (!cosmetic) return { ok: false, error: 'Cosmetic not found' };
    if (cosmetic.purchasable === false) return { ok: false, error: 'Unlock only — find it by discovery' };
    var cost = Number(cosmetic.cost) || 0;
    if (!economyBackendCharged) {
      var balance = getCharacterBalance(characterName);
      if (balance < cost) return { ok: false, error: 'Not enough nuggets. Need ' + cost + ', available ' + balance };
    }
    var all = DATA.getCosmeticOwnership ? DATA.getCosmeticOwnership() : {};
    var rec = all[key] || { owned: [], equipped: {} };
    if (!Array.isArray(rec.owned)) rec.owned = [];
    if (rec.owned.indexOf(cosmeticId) >= 0) return { ok: false, error: 'Already owned' };
    rec.owned.push(cosmeticId);
    all[key] = rec;
    DATA.setCosmeticOwnership(all);
    if (!economyBackendCharged) addPurchase(characterName, cosmeticId, cosmetic.name || cosmeticId, 1, cost, 'Cosmetic');
    checkAndUnlockAchievements(characterName);
    var balanceAfter = economyBackendCharged && (availableAfterFromPayload != null) ? Number(availableAfterFromPayload) : getCharacterBalance(characterName);
    return { ok: true, cosmetic: cosmetic, cost: cost, available_after: balanceAfter };
  }

  function equipCosmetic(characterName, cosmeticId, category) {
    var key = String(characterName || '').trim();
    if (!key) return false;
    var all = DATA.getCosmeticOwnership ? DATA.getCosmeticOwnership() : {};
    var rec = all[key] || { owned: [], equipped: {} };
    if (!Array.isArray(rec.owned)) rec.owned = [];
    if (!rec.equipped || typeof rec.equipped !== 'object') rec.equipped = {};
    if (!cosmeticId) {
      if (category) delete rec.equipped[category];
      all[key] = rec;
      DATA.setCosmeticOwnership(all);
      return true;
    }
    if (rec.owned.indexOf(cosmeticId) < 0) return false;
    var cosmetics = getCosmetics();
    var cosmetic = cosmetics.find(function (c) { return c.id === cosmeticId; });
    if (!cosmetic || cosmetic.category !== category) return false;
    rec.equipped[category] = cosmeticId;
    all[key] = rec;
    DATA.setCosmeticOwnership(all);
    return true;
  }

  function addPendingSubmission(characterName, submissionType, note) {
    var pending = getPendingSubmissions();
    var id = 'sub_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    pending.push({
      id: id,
      character_name: characterName,
      submission_type: submissionType || 'mission',
      note: note || '',
      created_at: new Date().toISOString(),
    });
    DATA.setToLS(LS.PENDING_SUBMISSIONS, pending);
    return id;
  }

  function removePendingSubmission(id) {
    var pending = getPendingSubmissions().filter(function (p) { return p.id !== id; });
    DATA.setToLS(LS.PENDING_SUBMISSIONS, pending);
  }

  function getMissionsProgress() {
    var raw = DATA.getFromLS ? DATA.getFromLS(LS.MISSIONS_PROGRESS, {}) : {};
    return raw && typeof raw === 'object' ? raw : {};
  }

  function getMissionsForCharacter(characterName) {
    var all = getMissionsProgress();
    var key = String(characterName || '').trim();
    return all[key] || { daily_checkin_last: '', hidden_nugget: false, first_game: false };
  }

  function setMissionProgress(characterName, updates) {
    var all = getMissionsProgress();
    var key = String(characterName || '').trim();
    if (!key) return false;
    var current = all[key] || { daily_checkin_last: '', hidden_nugget: false, first_game: false };
    if (updates.daily_checkin_last !== undefined) current.daily_checkin_last = String(updates.daily_checkin_last || '');
    if (updates.hidden_nugget !== undefined) current.hidden_nugget = !!updates.hidden_nugget;
    if (updates.first_game !== undefined) current.first_game = !!updates.first_game;
    all[key] = current;
    DATA.setToLS(LS.MISSIONS_PROGRESS, all);
    return true;
  }

  function todayStr() {
    var d = new Date();
    var y = d.getFullYear();
    var m = d.getMonth() + 1;
    var day = d.getDate();
    return y + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
  }

  function claimDailyCheckIn(characterName, economyBackendCharged) {
    var m = getMissionsForCharacter(characterName);
    var today = todayStr();
    if (m.daily_checkin_last === today) return { ok: false, already: true };
    if (!economyBackendCharged) addActivity(characterName, 3, 'POSITIVE', 'MISSION', 'Daily Check-In');
    setMissionProgress(characterName, { daily_checkin_last: today });
    createActivityEvent({ actor_id: characterName, actor_name: characterName, actor_type: 'student', object_type: 'mission', object_id: 'daily_checkin', event_type: 'mission_completed', meta: { mission: 'Daily Check-In', nuggets: 3 } });
    return { ok: true, nuggets: 3 };
  }

  function completeHiddenNugget(characterName, economyBackendCharged) {
    var m = getMissionsForCharacter(characterName);
    if (m.hidden_nugget) return { ok: false, already: true };
    if (!economyBackendCharged) addActivity(characterName, 5, 'POSITIVE', 'MISSION', 'Hidden Nugget');
    setMissionProgress(characterName, { hidden_nugget: true });
    createActivityEvent({ actor_id: characterName, actor_name: characterName, actor_type: 'student', object_type: 'mission', object_id: 'hidden_nugget', event_type: 'mission_completed', meta: { mission: 'Hidden Nugget', nuggets: 5 } });
    return { ok: true, nuggets: 5 };
  }

  function completeFirstGame(characterName, economyBackendCharged) {
    var m = getMissionsForCharacter(characterName);
    if (m.first_game) return { ok: false, already: true };
    if (!economyBackendCharged) addActivity(characterName, 10, 'POSITIVE', 'MISSION', 'First Game Played');
    setMissionProgress(characterName, { first_game: true });
    createActivityEvent({ actor_id: characterName, actor_name: characterName, actor_type: 'student', object_type: 'mission', object_id: 'first_game', event_type: 'mission_completed', meta: { mission: 'First Game Played', nuggets: 10 } });
    checkAndUnlockAchievements(characterName);
    return { ok: true, nuggets: 10 };
  }

  function spendOnGame(characterName, gameName, economyBackendCharged) {
    if (!economyBackendCharged) {
      var balance = getCharacterBalance(characterName);
      if (balance < 1) return { ok: false, error: 'insufficient' };
      addPurchase(characterName, 'game_play', gameName || 'Game', 1, 1, gameName || '');
    }
    return { ok: true };
  }

  function awardGameWin(characterName, gameName, nuggets, economyBackendCharged) {
    var n = Math.max(0, Math.floor(Number(nuggets) || 0));
    if (!String(characterName || '').trim()) return { ok: false, error: 'character_name required' };
    if (n <= 0) return { ok: true, nuggets: 0 };
    if (!economyBackendCharged) addActivity(characterName, n, 'POSITIVE', 'GAME', (gameName || 'Game') + ' win');
    createActivityEvent({ actor_id: characterName, actor_name: characterName, actor_type: 'student', object_type: 'game_win', object_id: String(gameName || '').trim(), event_type: 'nugget_earned', meta: { game_name: gameName, nuggets: n } });
    checkAndUnlockAchievements(characterName);
    return { ok: true, nuggets: n };
  }

  function getGameResults() {
    var raw = DATA.getFromLS ? DATA.getFromLS(LS.GAME_RESULTS, []) : [];
    return Array.isArray(raw) ? raw : [];
  }

  function recordGameResult(characterName, gameName, meta) {
    var name = String(characterName || '').trim();
    var game = String(gameName || '').trim();
    if (!name || !game) return { ok: false, error: 'character_name and game_name required' };
    var score = Number(meta && meta.score);
    if (meta && meta.score_display === undefined && !isNaN(score)) {
      meta = Object.assign({}, meta, { score_display: String(score) });
    }
    var results = getGameResults();
    var id = 'gr_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    var rec = {
      id: id,
      character_name: name,
      game_name: game,
      score: isNaN(score) ? 0 : score,
      created_at: new Date().toISOString(),
      meta: meta && typeof meta === 'object' ? meta : {},
    };
    results.push(rec);
    var cap = 2000;
    if (results.length > cap) results = results.slice(-cap);
    DATA.setToLS(LS.GAME_RESULTS, results);
    return { ok: true, id: id };
  }

  var GAME_LOWER_BETTER = { 'Reaction Tap': true, 'Nugget Hunt': true };
  function compareGameResult(a, b, gameName) {
    var lowerBetter = GAME_LOWER_BETTER[gameName];
    var sa = Number(a.score);
    var sb = Number(b.score);
    if (lowerBetter) return sa - sb;
    return sb - sa;
  }

  function getGameLeaderboard() {
    var results = getGameResults();
    var now = new Date();
    var dayStart = function (d) {
      d = new Date(d);
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    };
    var todayStart = dayStart(now);
    var weekStart = todayStart - 7 * 24 * 60 * 60 * 1000;
    var monthStart = todayStart - 30 * 24 * 60 * 60 * 1000;
    var month = now.getMonth();
    var year = now.getFullYear();
    var schoolYearStart = (month >= 7)
      ? new Date(year, 7, 1).getTime()
      : new Date(year - 1, 7, 1).getTime();
    var limits = { daily: 5, weekly: 10, monthly: 15, schoolYear: 20 };
    function buildRanked(withinStartMs, limitPerGame) {
      var byGame = {};
      results.forEach(function (r) {
        var t = new Date(r.created_at || 0).getTime();
        if (t < withinStartMs) return;
        var game = String(r.game_name || '').trim();
        if (!game) return;
        if (!byGame[game]) byGame[game] = [];
        byGame[game].push(r);
      });
      var out = [];
      Object.keys(byGame).forEach(function (game) {
        var list = byGame[game];
        var lowerBetter = GAME_LOWER_BETTER[game];
        var byStudent = {};
        list.forEach(function (r) {
          var key = String(r.character_name || '').trim();
          if (!key) return;
          var current = byStudent[key];
          var score = Number(r.score);
          if (current === undefined) {
            byStudent[key] = r;
            return;
          }
          var currentScore = Number(current.score);
          var keepNew = lowerBetter ? score < currentScore : score > currentScore;
          if (keepNew) byStudent[key] = r;
        });
        var bestList = Object.keys(byStudent).map(function (k) { return byStudent[k]; });
        bestList.sort(function (a, b) {
          var sa = Number(a.score);
          var sb = Number(b.score);
          return lowerBetter ? sa - sb : sb - sa;
        });
        bestList.slice(0, limitPerGame).forEach(function (r, i) {
          out.push({
            game_name: game,
            character_name: r.character_name,
            score: r.score,
            score_display: (r.meta && r.meta.score_display) || String(r.score),
            rank: i + 1,
          });
        });
      });
      return out;
    }
    return {
      daily: buildRanked(todayStart, limits.daily),
      weekly: buildRanked(weekStart, limits.weekly),
      monthly: buildRanked(monthStart, limits.monthly),
      schoolYear: buildRanked(schoolYearStart, limits.schoolYear),
    };
  }

  var ACHIEVEMENT_DEFS = [
    { id: 'first_post', name: 'First Post', icon: '📝', desc: 'Create your first post' },
    { id: 'first_game', name: 'First Game Played', icon: '🎮', desc: 'Play your first game' },
    { id: 'first_purchase', name: 'First Purchase', icon: '🛒', desc: 'Make your first store purchase' },
    { id: 'daily_checkin', name: 'Daily Check-In Complete', icon: '✅', desc: 'Claim daily check-in' },
    { id: 'hidden_nugget', name: 'Hidden Nugget Found', icon: '🪙', desc: 'Find the hidden nugget' },
    { id: 'teacher_spotlight', name: 'Teacher Spotlight', icon: '⭐', desc: 'Get spotlighted by a teacher' },
    { id: 'ten_nuggets', name: '10 Nuggets Earned', icon: '💰', desc: 'Earn 10 nuggets total' },
    { id: 'five_posts', name: '5 Posts Shared', icon: '📢', desc: 'Share 5 posts' },
    { id: 'thank_you_writer', name: 'Thank You Writer', icon: '💌', desc: 'Send your first thank-you letter' },
    { id: 'news_reporter', name: 'News Reporter', icon: '📰', desc: 'Get your first article published' },
    { id: '7_day_nugget_streak', name: '7-Day Nugget Streak', icon: '🔥', desc: 'Find the daily nugget 7 days in a row' },
    { id: 'daily_nugget_finder', name: 'Daily Nugget Finder', icon: '🪙', desc: 'Find the daily nugget for the first time' },
    { id: 'teacher_mission_finisher', name: 'Teacher Mission Finisher', icon: '✅', desc: 'Complete your first teacher mission' },
    { id: 'featured_creator', name: 'Featured Creator', icon: '🌟', desc: 'Get a creation featured by a teacher' },
    { id: 'teacher_pick', name: 'Teacher Pick', icon: '🏆', desc: 'Receive a Teacher Pick on a creation' },
    { id: 'kindness_writer', name: 'Kindness Writer', icon: '💝', desc: 'Have a thank-you letter accepted' },
    { id: 'creative_builder', name: 'Creative Builder', icon: '🛠️', desc: 'Share a project or web app' },
    { id: 'consistent_contributor', name: 'Consistent Contributor', icon: '📢', desc: 'Share 10 posts' },
  ];

  function getAchievements() {
    var raw = DATA.getFromLS ? DATA.getFromLS(LS.ACHIEVEMENTS, {}) : {};
    return raw && typeof raw === 'object' ? raw : {};
  }

  function getAchievementsForCharacter(characterName) {
    var all = getAchievements();
    var key = String(characterName || '').trim();
    return all[key] || {};
  }

  function unlockAchievement(characterName, achId) {
    var key = String(characterName || '').trim();
    if (!key) return false;
    var all = getAchievements();
    var byChar = all[key] || {};
    if (byChar[achId]) return false;
    var def = ACHIEVEMENT_DEFS.find(function (d) { return d.id === achId; });
    var name = def ? def.name : achId;
    byChar[achId] = new Date().toISOString();
    all[key] = byChar;
    DATA.setToLS(LS.ACHIEVEMENTS, all);
    addActivity(characterName, 0, 'POSITIVE', 'ACHIEVEMENT', 'Achievement: ' + name);
    createActivityEvent({ actor_id: characterName, actor_name: characterName, actor_type: 'student', object_type: 'achievement', object_id: achId, event_type: 'achievement_unlocked', meta: { achievement_name: name } });
    return true;
  }

  function getDailyNuggetHuntClaimDates(characterName) {
    var key = String(characterName || '').trim();
    if (!key) return [];
    var events = getActivityEvents().filter(function (e) {
      return (e.event_type || '') === 'daily_nugget_found' && String(e.actor_id || '').trim() === key;
    });
    var dates = {};
    events.forEach(function (e) {
      var d = String(e.object_id || '').trim().slice(0, 10);
      if (d && d.length === 10) dates[d] = true;
    });
    return Object.keys(dates).sort();
  }

  function hasSevenDayNuggetStreak(characterName) {
    var dates = getDailyNuggetHuntClaimDates(characterName);
    if (dates.length < 7) return false;
    var dateSet = {};
    dates.forEach(function (d) { dateSet[d] = true; });
    for (var i = 0; i < 7; i++) {
      var d = new Date();
      d.setDate(d.getDate() - i);
      var m = d.getMonth() + 1;
      var day = d.getDate();
      var want = d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
      if (!dateSet[want]) return false;
    }
    return true;
  }

  function checkAndUnlockAchievements(characterName) {
    var key = String(characterName || '').trim();
    if (!key) return;
    var unlocked = getAchievementsForCharacter(characterName);
    var missions = getMissionsForCharacter(characterName);
    var posts = getPostsForCharacter(characterName);
    var approvedPosts = posts.filter(function (p) { return p.approved === true; });
    var purchases = getPurchases().filter(function (r) { return r.character_name === key; });
    var activity = getActivity().filter(function (r) { return r.character_name === key; });
    var earned = getCharacterEarned(characterName);
    var hasSpotlight = activity.some(function (r) { return (r.note_text || '').indexOf('Spotlight') >= 0; });
    var storePurchases = purchases.filter(function (p) { return (p.item_id || '') !== 'game_play'; });
    var thanks = getThanksForCharacter(characterName);
    var thanksAccepted = thanks.some(function (t) { return (t.status || '') === 'accepted'; });
    var news = getNewsForAuthor(characterName);
    var newsApproved = news.some(function (n) { return (n.status || '') === 'approved'; });
    var missionSubs = getMissionSubmissionsForCharacter(characterName);
    var missionAccepted = missionSubs.some(function (s) { return (s.status || '') === 'accepted'; });
    var curations = getPostCurations();
    var hasFeatured = approvedPosts.some(function (p) { return !!(curations[p.id] || {}).teacher_featured; });
    var hasTeacherPick = approvedPosts.some(function (p) { return !!(curations[p.id] || {}).teacher_pick; });
    var hasCreativeBuilder = approvedPosts.some(function (p) { return (p.type || '') === 'project' || (p.type || '') === 'webapp'; });
    var dailyHuntDates = getDailyNuggetHuntClaimDates(characterName);

    if (!unlocked.first_post && posts.length >= 1) unlockAchievement(characterName, 'first_post');
    if (!unlocked.first_game && missions.first_game) unlockAchievement(characterName, 'first_game');
    if (!unlocked.first_purchase && storePurchases.length >= 1) unlockAchievement(characterName, 'first_purchase');
    if (!unlocked.daily_checkin && missions.daily_checkin_last) unlockAchievement(characterName, 'daily_checkin');
    if (!unlocked.hidden_nugget && missions.hidden_nugget) unlockAchievement(characterName, 'hidden_nugget');
    if (!unlocked.teacher_spotlight && hasSpotlight) unlockAchievement(characterName, 'teacher_spotlight');
    if (!unlocked.ten_nuggets && earned >= 10) unlockAchievement(characterName, 'ten_nuggets');
    if (!unlocked.five_posts && approvedPosts.length >= 5) unlockAchievement(characterName, 'five_posts');
    if (!unlocked.thank_you_writer && thanks.length >= 1) unlockAchievement(characterName, 'thank_you_writer');
    if (!unlocked.news_reporter && newsApproved) unlockAchievement(characterName, 'news_reporter');
    if (!unlocked['7_day_nugget_streak'] && hasSevenDayNuggetStreak(characterName)) unlockAchievement(characterName, '7_day_nugget_streak');
    if (!unlocked.daily_nugget_finder && dailyHuntDates.length >= 1) unlockAchievement(characterName, 'daily_nugget_finder');
    if (!unlocked.teacher_mission_finisher && missionAccepted) unlockAchievement(characterName, 'teacher_mission_finisher');
    if (!unlocked.featured_creator && hasFeatured) unlockAchievement(characterName, 'featured_creator');
    if (!unlocked.teacher_pick && hasTeacherPick) unlockAchievement(characterName, 'teacher_pick');
    if (!unlocked.kindness_writer && thanksAccepted) unlockAchievement(characterName, 'kindness_writer');
    if (!unlocked.creative_builder && hasCreativeBuilder) unlockAchievement(characterName, 'creative_builder');
    if (!unlocked.consistent_contributor && approvedPosts.length >= 10) unlockAchievement(characterName, 'consistent_contributor');
  }

  function getDisplaySlides() {
    var posts = getPosts().filter(function (p) {
      return isModerationApproved(p) && isVisibilitySchoolCommunity(p) && (p.feature_eligible !== false);
    }).sort(function (a, b) { return (b.created_at || '').localeCompare(a.created_at || ''); });
    var curations = getPostCurations();
    var profiles = getProfiles();
    var chars = getCharacters();
    var news = getApprovedNews().filter(function (n) { return (n.author_type || '') === 'student'; });
    var thanks = getThanks().filter(function (t) { return (t.status || '') === 'accepted'; });
    var achievements = getAchievements();
    var leaderboard = computeLeaderboard();
    var defs = ACHIEVEMENT_DEFS;

    function displayName(name) {
      var prof = profiles[String(name || '').trim()] || {};
      var c = chars.find(function (x) { return String(x.name || '').trim() === String(name || '').trim(); });
      return (prof.display_name || '').trim() || name || (c && c.name) || 'Student';
    }

    function avatar(name) {
      var prof = profiles[String(name || '').trim()] || {};
      var c = chars.find(function (x) { return String(x.name || '').trim() === String(name || '').trim(); });
      return (prof.avatar || '').trim() || (c && c.avatar) || '🌟';
    }

    function frameFor(name) {
      var prof = profiles[String(name || '').trim()] || {};
      return (prof.frame || 'none').trim();
    }

    var teacherPicks = [];
    var featured = [];
    posts.forEach(function (p) {
      var c = curations[p.id] || {};
      if (c.teacher_pick) {
        teacherPicks.push({
          type: 'teacher_pick',
          title: (p.title || 'Untitled').trim(),
          subtitle: 'Teacher Pick · ' + displayName(p.character_name),
          image: (p.type || '') === 'image' && (p.url || '').trim() ? p.url.trim() : null,
          actor_name: displayName(p.character_name),
          meta: { post_id: p.id, character_name: (p.character_name || '').trim(), avatar: avatar(p.character_name), frame: frameFor(p.character_name) },
          created_at: p.created_at || '',
        });
      }
      if (c.teacher_featured) {
        featured.push({
          type: 'featured_creation',
          title: (p.title || 'Untitled').trim(),
          subtitle: 'Featured · ' + displayName(p.character_name),
          image: (p.type || '') === 'image' && (p.url || '').trim() ? p.url.trim() : null,
          actor_name: displayName(p.character_name),
          meta: { post_id: p.id, character_name: (p.character_name || '').trim(), avatar: avatar(p.character_name), frame: frameFor(p.character_name) },
          created_at: p.created_at || '',
        });
      }
    });

    var newsSlides = news.slice(0, 10).map(function (n) {
      return {
        type: 'student_news',
        title: (n.title || 'Untitled').trim(),
        subtitle: (n.category || 'News') + ' · ' + displayName(n.author_name),
        image: null,
        actor_name: displayName(n.author_name),
        meta: { body_preview: (n.body || '').slice(0, 100), character_name: (n.author_name || '').trim(), avatar: avatar(n.author_name), frame: frameFor(n.author_name) },
        created_at: n.approved_at || n.created_at || '',
      };
    });

    var achievementSlides = [];
    Object.keys(achievements).forEach(function (charName) {
      var byChar = achievements[charName] || {};
      Object.keys(byChar).forEach(function (achId) {
        var def = defs.find(function (d) { return d.id === achId; });
        if (def) {
          achievementSlides.push({
            type: 'achievement',
            title: def.name,
            subtitle: displayName(charName),
            image: null,
            actor_name: displayName(charName),
            meta: { icon: def.icon || '🏆', character_name: (charName || '').trim(), avatar: avatar(charName), frame: frameFor(charName) },
            created_at: byChar[achId] || '',
          });
        }
      });
    });

    var nuggetMilestones = [];
    leaderboard.filter(function (r) { return (Number(r.available) || 0) >= 10; }).slice(0, 8).forEach(function (r) {
      var bal = Number(r.available) || 0;
      nuggetMilestones.push({
        type: 'nugget_milestone',
        title: bal + ' Nuggets',
        subtitle: displayName(r.character_name),
        image: null,
        actor_name: displayName(r.character_name),
        meta: { nuggets: bal, character_name: (r.character_name || '').trim(), avatar: avatar(r.character_name), frame: frameFor(r.character_name) },
        created_at: '',
      });
    });

    var thankYouSlides = thanks.slice(0, 8).map(function (t) {
      return {
        type: 'thank_you_highlight',
        title: 'Thank You',
        subtitle: displayName(t.character_name) + ' thanked ' + (t.staff_name || 'Staff'),
        image: null,
        actor_name: displayName(t.character_name),
        meta: { character_name: (t.character_name || '').trim(), avatar: avatar(t.character_name), frame: frameFor(t.character_name) },
        created_at: t.accepted_at || t.created_at || '',
      };
    });

    var arcadeSlides = [];
    var gameLb = getGameLeaderboard();
    if ((gameLb.weekly || []).length > 0 || (gameLb.daily || []).length > 0) {
      arcadeSlides.push({
        type: 'arcade_leader',
        title: 'Arcade Leaders',
        subtitle: 'Best scores this week',
        image: null,
        actor_name: '',
        meta: { daily: gameLb.daily || [], weekly: gameLb.weekly || [], monthly: gameLb.monthly || [], schoolYear: gameLb.schoolYear || [] },
        created_at: '',
      });
    }

    var rumorSlides = [{
      type: 'nugget_rumor',
      title: 'Hidden Nugget',
      subtitle: 'There\'s a nugget hidden somewhere in Lantern today. Can you find it?',
      image: null,
      actor_name: '',
      meta: {},
      created_at: '',
    }];

    var buckets = [newsSlides, teacherPicks, featured, arcadeSlides, achievementSlides, nuggetMilestones, thankYouSlides, rumorSlides];
    var indices = buckets.map(function () { return 0; });
    var slides = [];
    var total = buckets.reduce(function (sum, b) { return sum + b.length; }, 0);
    while (slides.length < total) {
      var added = 0;
      for (var b = 0; b < buckets.length; b++) {
        if (indices[b] < buckets[b].length) {
          slides.push(buckets[b][indices[b]]);
          indices[b]++;
          added++;
        }
      }
      if (added === 0) break;
    }

    if (slides.length === 0) {
      slides.push({
        type: 'fallback',
        title: 'TMS Lantern',
        subtitle: 'Celebrating our community',
        image: null,
        actor_name: '',
        meta: {},
        created_at: '',
      });
    }

    return slides;
  }

  function runner() {
    var successFn = function () {};
    var failureFn = function (err) { if (typeof console !== 'undefined' && console.error) console.error(err); };
    var g = typeof global !== 'undefined' ? global : (typeof window !== 'undefined' ? window : self);
    var apiBase =
      typeof g.LANTERN_AVATAR_API !== 'undefined' && g.LANTERN_AVATAR_API !== null
        ? String(g.LANTERN_AVATAR_API).replace(/\/$/, '')
        : null;
    return {
      withSuccessHandler: function (f) { successFn = f; return this; },
      withFailureHandler: function (f) { failureFn = f; return this; },
      storeBootstrap: function () {
        var chars = getCharacters();
        var students = chars.map(function (c) { return { student_name: c.name, student_id: c.character_id }; });
        var catalog = getCatalog();
        var cosmetics = getCosmetics();
        var store_leaderboard = computeLeaderboard();
        Promise.resolve({ ok: true, students: students, catalog: catalog, cosmetics: cosmetics, store_leaderboard: store_leaderboard })
          .then(successFn).catch(failureFn);
      },
      storeGetBalance: function (payload) {
        var name = String((payload && payload.student_name) || '').trim();
        var earned = getCharacterEarned(name);
        var spent = getCharacterSpent(name);
        var available = getCharacterBalance(name);
        Promise.resolve({ ok: true, student_name: name, earned: earned, spent: spent, available: available })
          .then(successFn).catch(failureFn);
      },
      storeRedeem: function (payload) {
        var characterName = String((payload && payload.student_name) || '').trim();
        var itemId = String((payload && payload.item_id) || '').trim();
        var qty = Math.max(1, Math.floor(Number((payload && payload.qty) || 1)));
        var note = String((payload && payload.note) || '').trim();
        var economyBackendCharged = !!(payload && payload.economy_backend_charged);
        var catalog = getCatalog();
        var item = catalog.find(function (x) { return x.item_id === itemId; }) || (catalog[0] || { item_id: 'GENERIC', item_name: 'Reward', cost: 1 });
        var cost = Number(item.cost) || 1;
        var totalCost = cost * qty;
        if (!economyBackendCharged) {
          var available = getCharacterBalance(characterName);
          if (available < totalCost) {
            Promise.resolve({ ok: false, error: 'Not enough nuggets. Need ' + totalCost + ', available ' + available }).then(function (r) { failureFn(new Error(r.error)); }).catch(failureFn);
            return;
          }
          addPurchase(characterName, item.item_id, item.item_name, qty, totalCost, note);
        }
        checkAndUnlockAchievements(characterName);
        var availableAfter = economyBackendCharged ? (payload.available_after != null ? Number(payload.available_after) : 0) : (getCharacterBalance(characterName));
        var availableBefore = economyBackendCharged ? (availableAfter + totalCost) : (getCharacterBalance(characterName) + totalCost);
        Promise.resolve({
          ok: true,
          student_name: characterName,
          item: item,
          qty: qty,
          total_cost: totalCost,
          available_before: availableBefore,
          available_after: availableAfter,
        }).then(successFn).catch(failureFn);
      },
      submitAvatarUpload: function (payload) {
        var name = String((payload && payload.character_name) || '').trim();
        var dataUrl = String((payload && payload.image_data) || '').trim();
        var cost = Number((payload && payload.cost) || 25) || 25;
        var backendOnly = !!(payload && payload.backend_only);
        var economyBackendCharged = !!(payload && payload.economy_backend_charged);
        var result = submitAvatarUpload(name, dataUrl, cost, backendOnly, economyBackendCharged);
        Promise.resolve(result)
          .then(function (r) {
            if (r && r.ok) return successFn(r);
            failureFn(new Error(r && r.error || 'Failed'));
          })
          .catch(failureFn);
      },
      getAvatarStatus: function (payload) {
        var name = String((payload && payload.character_name) || '').trim();
        var result = getAvatarStatus(name);
        Promise.resolve(result).then(successFn).catch(failureFn);
      },
      getPendingAvatarsForTeacher: function () {
        var list = getPendingAvatarsForTeacher();
        Promise.resolve({ ok: true, avatars: list }).then(successFn).catch(failureFn);
      },
      approveAvatarSubmission: function (payload) {
        var id = String((payload && payload.id) || '').trim();
        if (!id) {
          Promise.resolve({ ok: false, error: 'id required' }).then(function (r) { failureFn(new Error(r.error)); }).catch(failureFn);
          return;
        }
        var result = approveAvatarSubmission(id, 'Teacher');
        Promise.resolve(result)
          .then(function (r) {
            if (r && r.ok) return successFn(r);
            failureFn(new Error(r && r.error || 'Failed'));
          })
          .catch(failureFn);
      },
      rejectAvatarSubmission: function (payload) {
        var id = String((payload && payload.id) || '').trim();
        var reason = String((payload && payload.reason) || '').trim();
        if (!id) {
          Promise.resolve({ ok: false, error: 'id required' }).then(function (r) { failureFn(new Error(r.error)); }).catch(failureFn);
          return;
        }
        var result = rejectAvatarSubmission(id, 'Teacher', reason);
        Promise.resolve(result)
          .then(function (r) {
            if (r && r.ok) return successFn(r);
            failureFn(new Error(r && r.error || 'Failed'));
          })
          .catch(failureFn);
      },
      storeStudentHistory: function (payload) {
        var name = String((payload && payload.student_name) || '').trim();
        checkAndUnlockAchievements(name);
        var activity = getActivity().filter(function (r) { return r.character_name === name; });
        var purchases = getPurchases().filter(function (r) { return r.character_name === name; });
        var logs = activity.map(function (r) {
          return {
            timestamp: r.timestamp,
            source: r.source || 'LOG',
            kind: r.kind || 'POSITIVE',
            teacher_name: '',
            nugget_delta: Number(r.nugget_delta) || 0,
            note_text: r.note_text || '',
          };
        });
        var redeems = purchases.map(function (r) {
          return {
            timestamp: r.timestamp,
            source: 'REDEEM',
            kind: 'REDEEM',
            teacher_name: '',
            nugget_delta: -(Number(r.total_cost) || 0),
            note_text: r.note || '',
            item_id: r.item_id || '',
            item_name: r.item_name || '',
          };
        });
        var history = logs.concat(redeems).sort(function (a, b) {
          var ta = (a.timestamp || '').toString();
          var tb = (b.timestamp || '').toString();
          return tb.localeCompare(ta);
        });
        var earned = getCharacterEarned(name);
        var spent = getCharacterSpent(name);
        var available = earned - spent;
        Promise.resolve({
          ok: true,
          history: history,
          totals: { earned: earned, spent: spent, removed: 0, available: available },
        }).then(successFn).catch(failureFn);
      },
      teacherDashboardData: function (payload) {
        var tid = String((payload && payload.teacher_id) || 'teacher').trim();
        function buildPayload(teacherMissions, missionSubmissions, workerOnly) {
          var pending = workerOnly ? [] : getPendingSubmissions();
          var chars = getCharacters();
          var students = chars.map(function (c) { return { student_name: c.name, student_id: c.character_id }; });
          var recent = getActivity().slice(-50).reverse();
          var totalsByStudent = computeLeaderboard().map(function (r) {
            return { student_name: r.character_name, total: r.available };
          });
          var pendingPosts = workerOnly ? [] : getPendingPosts();
          var approvedPosts = getApprovedPosts();
          var curations = getPostCurations();
          var pendingWithCurations = pendingPosts.map(function (p) {
            var c = curations[p.id] || {};
            return Object.assign({}, p, { curation: { spotlighted: !!c.spotlighted, teacher_featured: !!c.teacher_featured, teacher_pick: !!c.teacher_pick, teacher_praise: String(c.teacher_praise || '').trim() } });
          });
          var postsWithCurations = approvedPosts.map(function (p) {
            var c = curations[p.id] || {};
            return Object.assign({}, p, { curation: { spotlighted: !!c.spotlighted, teacher_featured: !!c.teacher_featured, teacher_pick: !!c.teacher_pick, teacher_praise: String(c.teacher_praise || '').trim() } });
          });
          var thanksLetters = workerOnly ? [] : getThanksForDesignation('teacher');
          var gradeReflections = workerOnly ? [] : getGradeReflectionsPending();
          var staffList = getStaff();
          var newsPending = workerOnly ? [] : getNewsPending();
          return {
            ok: true,
            pending: pending,
            recent: recent,
            totalsByStudent: totalsByStudent,
            pendingPosts: pendingWithCurations,
            posts: postsWithCurations,
            staff: staffList,
            thanksLetters: thanksLetters,
            gradeReflections: gradeReflections,
            teacherMissions: teacherMissions,
            missionSubmissions: missionSubmissions,
            newsPending: newsPending,
            students: students,
            group_categories: [],
            groups: [],
            recentEscalations: [],
          };
        }
        if (apiBase != null) {
          Promise.all([
            fetch(apiBase + '/api/missions/teacher?teacher_id=' + encodeURIComponent(tid)).then(function (r) { return r.json(); }).then(function (res) { return res && res.ok ? res.missions : []; }).catch(function () { return []; }),
            fetch(apiBase + '/api/missions/submissions/teacher?teacher_id=' + encodeURIComponent(tid)).then(function (r) { return r.json(); }).then(function (res) { return res && res.ok ? res.submissions : []; }).catch(function () { return []; }),
          ]).then(function (arr) {
            var teacherMissions = arr[0] || [];
            var missionSubmissions = arr[1] || [];
            successFn(buildPayload(teacherMissions, missionSubmissions, true));
          }).catch(failureFn);
          return;
        }
        var teacherMissions = getTeacherMissionsForTeacher(tid);
        var missionSubmissions = getMissionSubmissionsForTeacher(tid).map(function (s) {
          var m = teacherMissions.find(function (x) { return x.id === s.mission_id; });
          return Object.assign({}, s, { mission_title: m ? m.title : '', mission_reward: m ? m.reward_amount : 1 });
        });
        Promise.resolve(buildPayload(teacherMissions, missionSubmissions)).then(successFn).catch(failureFn);
      },
      approveSubmission: function (payload) {
        var id = String((payload && payload.submission_id) || '').trim();
        var nuggets = Math.max(0, Math.floor(Number((payload && payload.nuggets) || 1)));
        var spotlight = !!(payload && payload.spotlight);
        var economyBackendCharged = !!(payload && payload.economy_backend_charged);
        var pending = getPendingSubmissions();
        var sub = pending.find(function (p) { return p.id === id; });
        if (!sub) {
          Promise.resolve({ ok: false, error: 'Submission not found' }).then(function (r) { failureFn(new Error(r.error)); }).catch(failureFn);
          return;
        }
        removePendingSubmission(id);
        if (!economyBackendCharged) addActivity(sub.character_name, nuggets, 'POSITIVE', 'APPROVAL', spotlight ? 'Spotlight!' : '');
        createActivityEvent({ actor_id: 'teacher', actor_name: 'Teacher', actor_type: 'teacher', object_type: 'mission', object_id: id, event_type: 'nugget_earned', meta: { character_name: sub.character_name, nuggets: nuggets, source: 'approval', spotlight: spotlight } });
        checkAndUnlockAchievements(sub.character_name);
        Promise.resolve({ ok: true, character_name: sub.character_name, nuggets: nuggets, spotlight: spotlight }).then(successFn).catch(failureFn);
      },
      rejectSubmission: function (payload) {
        var id = String((payload && payload.submission_id) || '').trim();
        removePendingSubmission(id);
        Promise.resolve({ ok: true }).then(successFn).catch(failureFn);
      },
      approvePost: function (payload) {
        var id = String((payload && payload.post_id || payload && payload.id) || '').trim();
        if (!id) {
          Promise.resolve({ ok: false, error: 'post_id required' }).then(function (r) { failureFn(new Error(r.error)); }).catch(failureFn);
          return;
        }
        var result = approvePost(id);
        Promise.resolve(result).then(successFn).catch(failureFn);
      },
      rejectPost: function (payload) {
        var id = String((payload && payload.post_id || payload && payload.id) || '').trim();
        if (!id) {
          Promise.resolve({ ok: false, error: 'post_id required' }).then(function (r) { failureFn(new Error(r.error)); }).catch(failureFn);
          return;
        }
        var result = rejectPost(id);
        Promise.resolve(result).then(successFn).catch(failureFn);
      },
      returnPostForImprovements: function (payload) {
        var id = String((payload && payload.post_id || payload && payload.id) || '').trim();
        var reason = String((payload && payload.reason) || '').trim();
        if (!id) {
          Promise.resolve({ ok: false, error: 'post_id required' }).then(function (r) { failureFn(new Error(r.error)); }).catch(failureFn);
          return;
        }
        var result = returnPostForImprovements(id, reason);
        Promise.resolve(result).then(successFn).catch(failureFn);
      },
      resubmitPostForApproval: function (payload) {
        var id = String((payload && payload.post_id || payload && payload.id) || '').trim();
        if (!id) {
          Promise.resolve({ ok: false, error: 'post_id required' }).then(function (r) { failureFn(new Error(r.error)); }).catch(failureFn);
          return;
        }
        var result = resubmitPostForApproval(id);
        Promise.resolve(result).then(successFn).catch(failureFn);
      },
      curatePost: function (payload) {
        var postId = String((payload && payload.post_id) || '').trim();
        var action = String((payload && payload.action) || '').trim();
        var praise = String((payload && payload.praise) || '').trim();
        if (!postId || !action) {
          Promise.resolve({ ok: false, error: 'post_id and action required' }).then(function (r) { failureFn(new Error(r.error)); }).catch(failureFn);
          return;
        }
        var result = curatePost(postId, action, { praise: praise });
        Promise.resolve(result).then(successFn).catch(failureFn);
      },
      submitForApproval: function (payload) {
        var characterName = String((payload && payload.character_name) || '').trim();
        var submissionType = String((payload && payload.submission_type) || 'mission').trim();
        var note = String((payload && payload.note) || '').trim();
        if (!characterName) {
          Promise.resolve({ ok: false, error: 'character_name required' }).then(function (r) { failureFn(new Error(r.error)); }).catch(failureFn);
          return;
        }
        var id = addPendingSubmission(characterName, submissionType, note);
        Promise.resolve({ ok: true, id: id }).then(successFn).catch(failureFn);
      },
      getPosts: function (payload) {
        var name = String((payload && payload.character_name) || '').trim();
        var posts = getPostsForCharacter(name);
        var curations = getPostCurations();
        var enriched = posts.map(function (p) {
          var c = curations[p.id] || {};
          return Object.assign({}, p, { curation: { spotlighted: !!c.spotlighted, teacher_featured: !!c.teacher_featured, teacher_pick: !!c.teacher_pick, teacher_praise: String(c.teacher_praise || '').trim() } });
        });
        Promise.resolve({ ok: true, posts: enriched }).then(successFn).catch(failureFn);
      },
      createPost: function (payload) {
        var name = String((payload && payload.character_name) || '').trim();
        var type = String((payload && payload.type) || 'link').trim();
        var title = String((payload && payload.title) || '').trim();
        var caption = String((payload && payload.caption) || '').trim();
        var url = String((payload && payload.url) || '').trim();
        var pinned = !!(payload && payload.pinned);
        if (!name) {
          Promise.resolve({ ok: false, error: 'character_name required' }).then(function (r) { failureFn(new Error(r.error)); }).catch(failureFn);
          return;
        }
        var id = createPost(name, type, title, caption, url, pinned);
        addActivity(name, 0, 'POSITIVE', 'POST', 'Post created');
        checkAndUnlockAchievements(name);
        Promise.resolve({ ok: true, id: id }).then(successFn).catch(failureFn);
      },
      updatePost: function (payload) {
        var id = String((payload && payload.id) || '').trim();
        var updates = payload && payload.updates ? payload.updates : {};
        var ok = updatePost(id, updates);
        Promise.resolve({ ok: ok }).then(successFn).catch(failureFn);
      },
      deletePost: function (payload) {
        var id = String((payload && payload.id) || '').trim();
        deletePost(id);
        Promise.resolve({ ok: true }).then(successFn).catch(failureFn);
      },
      togglePostPinned: function (payload) {
        var id = String((payload && payload.id) || '').trim();
        var ok = togglePostPinned(id);
        Promise.resolve({ ok: ok }).then(successFn).catch(failureFn);
      },
      getProfile: function (payload) {
        var name = String((payload && payload.character_name) || '').trim();
        var profile = getProfileForCharacter(name);
        Promise.resolve({ ok: true, profile: profile }).then(successFn).catch(failureFn);
      },
      saveProfile: function (payload) {
        var name = String((payload && payload.character_name) || '').trim();
        var updates = payload && payload.updates ? payload.updates : {};
        if (!name) {
          Promise.resolve({ ok: false, error: 'character_name required' }).then(function (r) { failureFn(new Error(r.error)); }).catch(failureFn);
          return;
        }
        var ok = saveProfile(name, updates);
        Promise.resolve({ ok: ok }).then(successFn).catch(failureFn);
      },
      getMissions: function (payload) {
        var name = String((payload && payload.character_name) || '').trim();
        var m = getMissionsForCharacter(name);
        Promise.resolve({ ok: true, missions: m }).then(successFn).catch(failureFn);
      },
      claimDailyCheckIn: function (payload) {
        var name = String((payload && payload.character_name) || '').trim();
        var economyBackendCharged = !!(payload && payload.economy_backend_charged);
        if (!name) {
          Promise.resolve({ ok: false, error: 'character_name required' }).then(function (r) { failureFn(new Error(r.error)); }).catch(failureFn);
          return;
        }
        var result = claimDailyCheckIn(name, economyBackendCharged);
        if (result && result.ok) checkAndUnlockAchievements(name);
        Promise.resolve(result).then(successFn).catch(failureFn);
      },
      completeHiddenNugget: function (payload) {
        var name = String((payload && payload.character_name) || '').trim();
        var economyBackendCharged = !!(payload && payload.economy_backend_charged);
        if (!name) {
          Promise.resolve({ ok: false, error: 'character_name required' }).then(function (r) { failureFn(new Error(r.error)); }).catch(failureFn);
          return;
        }
        var result = completeHiddenNugget(name, economyBackendCharged);
        if (result && result.ok) checkAndUnlockAchievements(name);
        Promise.resolve(result).then(successFn).catch(failureFn);
      },
      completeFirstGame: function (payload) {
        var name = String((payload && payload.character_name) || '').trim();
        var economyBackendCharged = !!(payload && payload.economy_backend_charged);
        if (!name) {
          Promise.resolve({ ok: false, error: 'character_name required' }).then(function (r) { failureFn(new Error(r.error)); }).catch(failureFn);
          return;
        }
        var result = completeFirstGame(name, economyBackendCharged);
        Promise.resolve(result).then(successFn).catch(failureFn);
      },
      spendOnGame: function (payload) {
        var name = String((payload && payload.character_name) || '').trim();
        var gameName = String((payload && payload.game_name) || 'Game').trim();
        var economyBackendCharged = !!(payload && payload.economy_backend_charged);
        if (!name) {
          Promise.resolve({ ok: false, error: 'character_name required' }).then(function (r) { failureFn(new Error(r.error)); }).catch(failureFn);
          return;
        }
        var result = spendOnGame(name, gameName, economyBackendCharged);
        if (result && result.ok) checkAndUnlockAchievements(name);
        Promise.resolve(result).then(successFn).catch(failureFn);
      },
      awardGameWin: function (payload) {
        var name = String((payload && payload.character_name) || '').trim();
        var gameName = String((payload && payload.game_name) || 'Game').trim();
        var nuggets = Math.max(0, Math.floor(Number((payload && payload.nuggets) || 0)));
        var economyBackendCharged = !!(payload && payload.economy_backend_charged);
        if (!name) {
          Promise.resolve({ ok: false, error: 'character_name required' }).then(function (r) { failureFn(new Error(r.error)); }).catch(failureFn);
          return;
        }
        var result = awardGameWin(name, gameName, nuggets, economyBackendCharged);
        Promise.resolve(result).then(successFn).catch(failureFn);
      },
      getAchievements: function (payload) {
        var name = String((payload && payload.character_name) || '').trim();
        var unlocked = getAchievementsForCharacter(name);
        var defs = ACHIEVEMENT_DEFS;
        Promise.resolve({
          ok: true,
          achievements: defs.map(function (d) {
            return {
              id: d.id,
              name: d.name,
              icon: d.icon,
              desc: d.desc,
              unlocked: !!unlocked[d.id],
              unlocked_at: unlocked[d.id] || null,
            };
          }),
        }).then(successFn).catch(failureFn);
      },
      getReactionsForPost: function (payload) {
        var postId = String((payload && payload.post_id) || '').trim();
        var name = String((payload && payload.character_name) || '').trim();
        var reactions = getReactionsForPost(postId, name);
        Promise.resolve({ ok: true, reactions: reactions }).then(successFn).catch(failureFn);
      },
      getReactionsForPosts: function (payload) {
        var postIds = Array.isArray(payload && payload.post_ids) ? payload.post_ids : [];
        var name = String((payload && payload.character_name) || '').trim();
        var out = {};
        postIds.forEach(function (id) {
          out[id] = getReactionsForPost(id, name);
        });
        Promise.resolve({ ok: true, reactions: out }).then(successFn).catch(failureFn);
      },
      togglePostReaction: function (payload) {
        var postId = String((payload && payload.post_id) || '').trim();
        var name = String((payload && payload.character_name) || '').trim();
        var type = String((payload && payload.reaction_type) || 'like').trim();
        if (type !== 'like' && type !== 'favorite' && type !== 'fire') type = 'like';
        var active = togglePostReaction(postId, name, type);
        Promise.resolve({ ok: true, active: active }).then(successFn).catch(failureFn);
      },
      getCommentsForPost: function (payload) {
        var postId = String((payload && payload.post_id) || '').trim();
        var comments = getCommentsForPost(postId);
        Promise.resolve({ ok: true, comments: comments }).then(successFn).catch(failureFn);
      },
      addComment: function (payload) {
        var postId = String((payload && payload.post_id) || '').trim();
        var name = String((payload && payload.character_name) || '').trim();
        var text = String((payload && payload.text) || '').trim();
        var id = addComment(postId, name, text);
        Promise.resolve({ ok: !!id, id: id }).then(successFn).catch(failureFn);
      },
      getCosmeticOwnership: function (payload) {
        var name = String((payload && payload.character_name) || '').trim();
        var ownership = getCosmeticOwnershipForCharacter(name);
        Promise.resolve({ ok: true, owned: ownership.owned, equipped: ownership.equipped }).then(successFn).catch(failureFn);
      },
      purchaseCosmetic: function (payload) {
        var name = String((payload && payload.character_name) || '').trim();
        var cosmeticId = String((payload && payload.cosmetic_id) || '').trim();
        var economyBackendCharged = !!(payload && payload.economy_backend_charged);
        var availableAfter = payload && payload.available_after != null ? payload.available_after : undefined;
        if (!name || !cosmeticId) {
          Promise.resolve({ ok: false, error: 'character_name and cosmetic_id required' }).then(function (r) { failureFn(new Error(r.error)); }).catch(failureFn);
          return;
        }
        var result = purchaseCosmetic(name, cosmeticId, economyBackendCharged, availableAfter);
        Promise.resolve(result).then(successFn).catch(failureFn);
      },
      equipCosmetic: function (payload) {
        var name = String((payload && payload.character_name) || '').trim();
        var cosmeticId = String((payload && payload.cosmetic_id) || '').trim() || null;
        var category = String((payload && payload.category) || '').trim();
        if (!name || !category) {
          Promise.resolve({ ok: false }).then(function (r) { successFn(r); }).catch(failureFn);
          return;
        }
        var ok = equipCosmetic(name, cosmeticId, category);
        Promise.resolve({ ok: ok }).then(successFn).catch(failureFn);
      },
      getStaff: function () {
        var staff = getStaff();
        Promise.resolve({ ok: true, staff: staff }).then(successFn).catch(failureFn);
      },
      getThanksForCharacter: function (payload) {
        var name = String((payload && payload.character_name) || '').trim();
        var list = getThanksForCharacter(name);
        Promise.resolve({ ok: true, thanks: list }).then(successFn).catch(failureFn);
      },
      submitThanks: function (payload) {
        var name = String((payload && payload.character_name) || '').trim();
        var staffId = String((payload && payload.staff_id) || '').trim();
        var staffName = String((payload && payload.staff_name) || '').trim();
        var staffDesignation = String((payload && payload.staff_designation) || '').trim();
        var text = String((payload && payload.text) || '').trim();
        var result = submitThanks(name, staffId, staffName, staffDesignation, text);
        Promise.resolve(result).then(successFn).catch(failureFn);
      },
      approveThanks: function (payload) {
        var id = String((payload && payload.id) || '').trim();
        var by = String((payload && payload.accepted_by) || 'Teacher').trim();
        var economyBackendCharged = !!(payload && payload.economy_backend_charged);
        var result = acceptThanks(id, by, economyBackendCharged);
        Promise.resolve(result).then(successFn).catch(failureFn);
      },
      rejectThanks: function (payload) {
        var id = String((payload && payload.id) || '').trim();
        var result = rejectThanks(id);
        Promise.resolve(result).then(successFn).catch(failureFn);
      },
      returnThanksForImprovements: function (payload) {
        var id = String((payload && payload.id) || '').trim();
        var reason = String((payload && payload.reason) || '').trim();
        var by = String((payload && payload.returned_by) || 'Teacher').trim();
        var result = returnThanksForImprovements(id, reason, by);
        Promise.resolve(result).then(successFn).catch(failureFn);
      },
      resubmitThanks: function (payload) {
        var id = String((payload && payload.id) || '').trim();
        var text = String((payload && payload.text) || '').trim();
        var result = resubmitThanks(id, text);
        Promise.resolve(result).then(successFn).catch(failureFn);
      },
      getGradeReflectionsForCharacter: function (payload) {
        var name = String((payload && payload.character_name) || '').trim();
        var list = getGradeReflectionsForCharacter(name);
        Promise.resolve({ ok: true, reflections: list }).then(successFn).catch(failureFn);
      },
      submitGradeReflection: function (payload) {
        var name = String((payload && payload.character_name) || '').trim();
        var text = String((payload && payload.reflection_text) || '').trim();
        var result = submitGradeReflection(name, text);
        Promise.resolve(result).then(successFn).catch(failureFn);
      },
      approveGradeReflection: function (payload) {
        var id = String((payload && payload.id) || '').trim();
        var by = String((payload && payload.accepted_by) || 'Teacher').trim();
        var economyBackendCharged = !!(payload && payload.economy_backend_charged);
        var result = acceptGradeReflection(id, by, economyBackendCharged);
        Promise.resolve(result).then(successFn).catch(failureFn);
      },
      rejectGradeReflection: function (payload) {
        var id = String((payload && payload.id) || '').trim();
        var result = rejectGradeReflection(id);
        Promise.resolve(result).then(successFn).catch(failureFn);
      },
      returnGradeReflectionForImprovements: function (payload) {
        var id = String((payload && payload.id) || '').trim();
        var reason = String((payload && payload.reason) || '').trim();
        var by = String((payload && payload.returned_by) || 'Teacher').trim();
        var result = returnGradeReflectionForImprovements(id, reason, by);
        Promise.resolve(result).then(successFn).catch(failureFn);
      },
      resubmitGradeReflection: function (payload) {
        var id = String((payload && payload.id) || '').trim();
        var text = String((payload && payload.reflection_text) || '').trim();
        var result = resubmitGradeReflection(id, text);
        Promise.resolve(result).then(successFn).catch(failureFn);
      },
      createConcern: function (payload) {
        var subjectType = String((payload && payload.subject_type) || 'thanks').trim();
        var subjectId = String((payload && payload.subject_id) || '').trim();
        var characterName = String((payload && payload.character_name) || '').trim();
        var recordedBy = String((payload && payload.recorded_by) || 'Teacher').trim();
        var note = String((payload && payload.note) || '').trim();
        var result = createConcern({ subject_type: subjectType, subject_id: subjectId, character_name: characterName, recorded_by: recordedBy, note: note });
        Promise.resolve(result).then(successFn).catch(failureFn);
      },
      getThanksForStaff: function (payload) {
        var staffId = String((payload && payload.staff_id) || '').trim();
        var list = staffId ? getThanksForStaff(staffId) : getThanksForDesignation('staff');
        Promise.resolve({ ok: true, thanks: list }).then(successFn).catch(failureFn);
      },
      getDiscoveryFeed: function (payload) {
        var limit = (payload && payload.limit) !== undefined ? Number(payload.limit) : 12;
        var feed = getDiscoveryFeed(limit);
        var chars = getCharacters();
        var profiles = getProfiles();
        var out = feed.map(function (p) {
          var prof = profiles[String(p.character_name || '').trim()] || {};
          var c = chars.find(function (x) { return String(x.name || '').trim() === String(p.character_name || '').trim(); });
          return {
            id: p.id,
            character_name: p.character_name,
            display_name: (prof.display_name || '').trim() || p.character_name,
            avatar: (prof.avatar || '').trim() || (c && c.avatar) || '🌟',
            frame: (prof.frame || 'none').trim(),
            type: p.type,
            title: p.title,
            caption: p.caption,
            url: p.url,
            created_at: p.created_at,
            pinned: p.pinned,
            spotlighted: p.spotlighted,
            teacher_pick: p.teacher_pick,
            teacher_featured: p.teacher_featured,
          };
        });
        Promise.resolve({ ok: true, feed: out }).then(successFn).catch(failureFn);
      },
      getExploreFeed: function () {
        var feed = getExploreFeed();
        var chars = getCharacters();
        var profiles = getProfiles();
        var out = feed.map(function (p) {
          var prof = profiles[String(p.character_name || '').trim()] || {};
          var c = chars.find(function (x) { return String(x.name || '').trim() === String(p.character_name || '').trim(); });
          return {
            id: p.id,
            character_name: p.character_name,
            display_name: (prof.display_name || '').trim() || p.character_name,
            avatar: (prof.avatar || '').trim() || (c && c.avatar) || '🌟',
            frame: (prof.frame || 'none').trim(),
            type: p.type,
            title: p.title,
            caption: p.caption,
            url: p.url,
            created_at: p.created_at,
            pinned: p.pinned,
            spotlighted: p.spotlighted,
            teacher_pick: p.teacher_pick,
            teacher_featured: p.teacher_featured,
          };
        });
        Promise.resolve({ ok: true, feed: out }).then(successFn).catch(failureFn);
      },
      getActivityEvents: function (payload) {
        var limit = (payload && payload.limit) !== undefined ? Math.min(50, Math.max(10, Number(payload.limit))) : 30;
        var events = getActivityEvents().slice().sort(function (a, b) { return (b.created_at || '').localeCompare(a.created_at || ''); }).slice(0, limit);
        var profiles = getProfiles();
        events = events.map(function (evt) {
          var name = (evt.meta && evt.meta.character_name) || evt.actor_name || '';
          var prof = profiles[String(name).trim()] || {};
          return Object.assign({}, evt, { frame: (prof.frame || 'none').trim() });
        });
        Promise.resolve({ ok: true, events: events }).then(successFn).catch(failureFn);
      },
      recordGameResult: function (payload) {
        var name = String((payload && payload.character_name) || '').trim();
        var gameName = String((payload && payload.game_name) || '').trim();
        var meta = (payload && payload.meta && typeof payload.meta === 'object') ? payload.meta : {};
        if (!name || !gameName) {
          Promise.resolve({ ok: false, error: 'character_name and game_name required' }).then(successFn).catch(failureFn);
          return;
        }
        var result = recordGameResult(name, gameName, meta);
        Promise.resolve(result).then(successFn).catch(failureFn);
      },
      getGameLeaderboard: function () {
        var lb = getGameLeaderboard();
        Promise.resolve({ ok: true, daily: lb.daily, weekly: lb.weekly, monthly: lb.monthly, schoolYear: lb.schoolYear }).then(successFn).catch(failureFn);
      },
      getActiveTeacherMissions: function () {
        var list = getActiveTeacherMissions();
        Promise.resolve({ ok: true, missions: list }).then(successFn).catch(failureFn);
      },
      getActiveTeacherMissionsForCharacter: function (payload) {
        var name = String((payload && payload.character_name) || '').trim();
        if (apiBase != null) {
          fetch(apiBase + '/api/missions/active?character_name=' + encodeURIComponent(name)).then(function (r) { return r.json(); }).then(function (res) { return res && res.ok ? res : { ok: false, missions: [] }; }).then(successFn).catch(failureFn);
          return;
        }
        var list = getActiveTeacherMissionsForCharacter(name);
        Promise.resolve({ ok: true, missions: list }).then(successFn).catch(failureFn);
      },
      getTeacherMissionsForTeacher: function (payload) {
        var tid = String((payload && payload.teacher_id) || 'teacher').trim();
        if (apiBase != null) {
          fetch(apiBase + '/api/missions/teacher?teacher_id=' + encodeURIComponent(tid)).then(function (r) { return r.json(); }).then(function (res) { return res && res.ok ? res : { ok: false, missions: [] }; }).then(successFn).catch(failureFn);
          return;
        }
        var list = getTeacherMissionsForTeacher(tid);
        Promise.resolve({ ok: true, missions: list }).then(successFn).catch(failureFn);
      },
      createTeacherMission: function (payload) {
        if (apiBase != null) {
          var body = {
            title: (payload && payload.title) || '',
            description: (payload && payload.description) || '',
            reward_amount: (payload && payload.reward_amount) !== undefined ? payload.reward_amount : 3,
            submission_type: (payload && payload.submission_type) || 'text',
            created_by_teacher_id: (payload && payload.created_by_teacher_id) || 'teacher',
            created_by_teacher_name: (payload && payload.created_by_teacher_name) || 'Teacher',
            active: (payload && payload.active) !== false,
            audience: (payload && payload.audience) || 'school_mission',
            target_character_names: (payload && payload.target_character_names) || undefined,
            featured: !!(payload && payload.featured),
            site_eligible: !!(payload && payload.site_eligible),
            allows_text: (payload && payload.allows_text) !== false,
            allows_image: !!(payload && payload.allows_image),
            allows_video: !!(payload && payload.allows_video),
            allows_link: !!(payload && payload.allows_link),
            min_characters: (payload && payload.min_characters) !== undefined && payload.min_characters !== null ? Math.max(0, Math.floor(Number(payload.min_characters)) || 200) : 200,
          };
          fetch(apiBase + '/api/missions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(function (r) { return r.json(); }).then(successFn).catch(failureFn);
          return;
        }
        var result = createTeacherMission({
          title: (payload && payload.title) || '',
          description: (payload && payload.description) || '',
          reward_amount: (payload && payload.reward_amount) !== undefined ? payload.reward_amount : 3,
          submission_type: (payload && payload.submission_type) || 'text',
          created_by_teacher_id: (payload && payload.created_by_teacher_id) || 'teacher',
          created_by_teacher_name: (payload && payload.created_by_teacher_name) || 'Teacher',
          due_date: (payload && payload.due_date) || null,
          active: (payload && payload.active) !== false,
          audience: (payload && payload.audience) || 'school_mission',
          target_character_names: (payload && payload.target_character_names) || undefined,
          featured: !!(payload && payload.featured),
          site_eligible: !!(payload && payload.site_eligible),
          allows_text: (payload && payload.allows_text) !== false,
          allows_image: !!(payload && payload.allows_image),
          allows_video: !!(payload && payload.allows_video),
          allows_link: !!(payload && payload.allows_link),
          min_characters: (payload && payload.min_characters) !== undefined && payload.min_characters !== null ? Math.max(0, Math.floor(Number(payload.min_characters)) || 200) : 200,
        });
        Promise.resolve(result).then(successFn).catch(failureFn);
      },
      updateTeacherMission: function (payload) {
        var id = String((payload && payload.id) || '').trim();
        var updates = payload && payload.updates ? payload.updates : {};
        if (apiBase != null) {
          fetch(apiBase + '/api/missions/' + encodeURIComponent(id), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates) }).then(function (r) { return r.json(); }).then(successFn).catch(failureFn);
          return;
        }
        var result = updateTeacherMission(id, updates);
        Promise.resolve(result).then(successFn).catch(failureFn);
      },
      submitMissionCompletion: function (payload) {
        var missionId = String((payload && payload.mission_id) || '').trim();
        var characterName = String((payload && payload.character_name) || '').trim();
        var submissionType = String((payload && payload.submission_type) || 'text').trim();
        var submissionContent = String((payload && payload.submission_content) || '').trim();
        if (apiBase != null) {
          fetch(apiBase + '/api/missions/submit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mission_id: missionId, character_name: characterName, submission_type: submissionType, submission_content: submissionContent }) }).then(function (r) { return r.json(); }).then(successFn).catch(failureFn);
          return;
        }
        var result = submitMissionCompletion(missionId, characterName, submissionType, submissionContent);
        Promise.resolve(result).then(successFn).catch(failureFn);
      },
      getMissionSubmissionsForTeacher: function (payload) {
        var tid = String((payload && payload.teacher_id) || 'teacher').trim();
        if (apiBase != null) {
          fetch(apiBase + '/api/missions/submissions/teacher?teacher_id=' + encodeURIComponent(tid)).then(function (r) { return r.json(); }).then(function (res) { return res && res.ok ? res : { ok: false, submissions: [] }; }).then(successFn).catch(failureFn);
          return;
        }
        var list = getMissionSubmissionsForTeacher(tid);
        Promise.resolve({ ok: true, submissions: list }).then(successFn).catch(failureFn);
      },
      getMissionSubmissionsForCharacter: function (payload) {
        var name = String((payload && payload.character_name) || '').trim();
        if (apiBase != null) {
          fetch(apiBase + '/api/missions/submissions/character?character_name=' + encodeURIComponent(name)).then(function (r) { return r.json(); }).then(function (res) { return res && res.ok ? res : { ok: false, submissions: [] }; }).then(successFn).catch(failureFn);
          return;
        }
        var list = getMissionSubmissionsForCharacter(name);
        var missions = getTeacherMissions();
        var enriched = list.map(function (s) {
          var m = missions.find(function (x) { return x.id === s.mission_id; });
          return Object.assign({}, s, { mission_title: m ? m.title : '', mission_reward: m ? m.reward_amount : 1 });
        });
        Promise.resolve({ ok: true, submissions: enriched }).then(successFn).catch(failureFn);
      },
      approveMissionSubmission: function (payload) {
        var id = String((payload && payload.id) || '').trim();
        if (apiBase != null) {
          var body = { id: id, accepted_by: (payload && payload.accepted_by) || 'Teacher', economy_backend_charged: !!(payload && payload.economy_backend_charged) };
          if ((payload && payload.teacher_id) !== undefined) body.teacher_id = String(payload.teacher_id).trim();
          fetch(apiBase + '/api/missions/submissions/approve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(function (r) { return r.json(); }).then(successFn).catch(failureFn);
          return;
        }
        var economyBackendCharged = !!(payload && payload.economy_backend_charged);
        var result = approveMissionSubmission(id, (payload && payload.accepted_by) || 'Teacher', economyBackendCharged);
        Promise.resolve(result).then(successFn).catch(failureFn);
      },
      rejectMissionSubmission: function (payload) {
        var id = String((payload && payload.id) || '').trim();
        if (apiBase != null) {
          var body = { id: id };
          if ((payload && payload.teacher_id) !== undefined) body.teacher_id = String(payload.teacher_id).trim();
          fetch(apiBase + '/api/missions/submissions/reject', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(function (r) { return r.json(); }).then(successFn).catch(failureFn);
          return;
        }
        var result = rejectMissionSubmission(id);
        Promise.resolve(result).then(successFn).catch(failureFn);
      },
      returnMissionSubmissionForImprovements: function (payload) {
        var id = String((payload && payload.id) || '').trim();
        var reason = String((payload && payload.reason) || '').trim();
        var by = String((payload && payload.returned_by) || 'Teacher').trim();
        if (apiBase != null) {
          var body = { id: id, reason: reason, returned_by: by };
          if ((payload && payload.teacher_id) !== undefined) body.teacher_id = String(payload.teacher_id).trim();
          fetch(apiBase + '/api/missions/submissions/return', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(function (r) { return r.json(); }).then(successFn).catch(failureFn);
          return;
        }
        var result = returnMissionSubmissionForImprovements(id, reason, by);
        Promise.resolve(result).then(successFn).catch(failureFn);
      },
      resubmitMissionSubmission: function (payload) {
        var id = String((payload && payload.id) || '').trim();
        var content = String((payload && payload.submission_content) || '').trim();
        if (apiBase != null) {
          fetch(apiBase + '/api/missions/submissions/resubmit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: id, submission_content: content }) }).then(function (r) { return r.json(); }).then(successFn).catch(failureFn);
          return;
        }
        var result = resubmitMissionSubmission(id, content);
        Promise.resolve(result).then(successFn).catch(failureFn);
      },
      getNews: function () {
        var list = getNews();
        Promise.resolve({ ok: true, news: list }).then(successFn).catch(failureFn);
      },
      getApprovedNews: function () {
        if (apiBase != null) {
          fetch(apiBase + '/api/news/approved').then(function (r) { return r.json(); }).then(function (res) { return res && res.ok ? res : { ok: false, news: [] }; }).then(successFn).catch(failureFn);
          return;
        }
        var list = getApprovedNews();
        Promise.resolve({ ok: true, news: list }).then(successFn).catch(failureFn);
      },
      getDisplaySlides: function () {
        var slides = getDisplaySlides();
        Promise.resolve({ ok: true, slides: slides }).then(successFn).catch(failureFn);
      },
      getNewsPending: function () {
        var list = getNewsPending();
        Promise.resolve({ ok: true, news: list }).then(successFn).catch(failureFn);
      },
      getNewsForAuthor: function (payload) {
        var name = String((payload && payload.author_name) || '').trim();
        if (apiBase != null) {
          var q = '?author_name=' + encodeURIComponent(name);
          fetch(apiBase + '/api/news/mine' + q).then(function (r) { return r.json(); }).then(function (res) { return res && res.ok ? res : { ok: false, news: [] }; }).then(successFn).catch(failureFn);
          return;
        }
        var list = getNewsForAuthor(name);
        Promise.resolve({ ok: true, news: list }).then(successFn).catch(failureFn);
      },
      createNewsArticle: function (payload) {
        if (apiBase != null) {
          fetch(apiBase + '/api/news/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload || {}) })
            .then(function (r) { return r.json(); }).then(successFn).catch(function (e) { failureFn(e); });
          return;
        }
        var result = createNewsArticle({
          title: (payload && payload.title) || '',
          body: (payload && payload.body) || '',
          category: (payload && payload.category) || 'School News',
          author_name: (payload && payload.author_name) || '',
          author_type: (payload && payload.author_type) || 'student',
          visibility: (payload && payload.visibility) || 'school community',
          feature_eligible: (payload && payload.feature_eligible) !== false,
          image_r2_key: (payload && payload.image_r2_key) || '',
          image_file_name: (payload && payload.image_file_name) || '',
          image_mime_type: (payload && payload.image_mime_type) || '',
          image_file_size: payload && payload.image_file_size != null ? payload.image_file_size : null,
          photo_credit: (payload && payload.photo_credit) || '',
          link_url: (payload && payload.link_url) || '',
        });
        Promise.resolve(result).then(successFn).catch(failureFn);
      },
      uploadNewsImage: function (payload) {
        if (apiBase != null) {
          fetch(apiBase + '/api/news/upload-image', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: (payload && payload.image) || '', mime_type: (payload && payload.mime_type) || 'image/png', file_name: (payload && payload.file_name) || 'image.png' }) })
            .then(function (r) { return r.json().then(function (data) { return (r.ok ? data : { ok: false, error: (data && data.error) || r.statusText || 'Upload failed' }); }); })
            .then(successFn)
            .catch(function (e) { successFn({ ok: false, error: String(e && e.message || e) }); });
          return;
        }
        Promise.resolve({ ok: false, error: 'Worker API required for image upload' }).then(successFn).catch(failureFn);
      },
      uploadNewsVideo: function (payload) {
        if (apiBase != null) {
          fetch(apiBase + '/api/news/upload-video', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ video: (payload && payload.video) || '', mime_type: (payload && payload.mime_type) || 'video/mp4', file_name: (payload && payload.file_name) || 'video.mp4' }) })
            .then(function (r) { return r.json().then(function (data) { return (r.ok ? data : { ok: false, error: (data && data.error) || r.statusText || 'Upload failed' }); }); })
            .then(successFn)
            .catch(function (e) { successFn({ ok: false, error: String(e && e.message || e) }); });
          return;
        }
        Promise.resolve({ ok: false, error: 'Worker API required for video upload' }).then(successFn).catch(failureFn);
      },
      getPendingApprovals: function (payload) {
        if (apiBase != null) {
          var staffId = (payload && payload.staff_id) || '';
          var filter = (payload && payload.filter) || 'mine,unassigned';
          var typeFilter = (payload && payload.type) || '';
          var q = '?filter=' + encodeURIComponent(filter) + '&type=' + encodeURIComponent(typeFilter);
          if (staffId) q += '&staff_id=' + encodeURIComponent(staffId);
          fetch(apiBase + '/api/approvals/pending' + q).then(function (r) { return r.json(); }).then(function (res) { return res && res.ok ? res : { ok: true, pending: [] }; }).then(successFn).catch(failureFn);
          return;
        }
        Promise.resolve({ ok: true, pending: [] }).then(successFn).catch(failureFn);
      },
      getApprovalHistory: function (payload) {
        if (apiBase != null) {
          var limit = (payload && payload.limit) != null ? Math.max(1, Math.min(100, parseInt(payload.limit, 10))) : 50;
          fetch(apiBase + '/api/approvals/history?limit=' + limit).then(function (r) { return r.json(); }).then(function (res) { return res && res.ok ? res : { ok: true, history: [] }; }).then(successFn).catch(failureFn);
          return;
        }
        Promise.resolve({ ok: true, history: [] }).then(successFn).catch(failureFn);
      },
      getRecognitionForCharacter: function (payload) {
        if (apiBase != null) {
          var name = String((payload && payload.character_name) || '').trim();
          var q = '?limit=50';
          if (name) q += '&character_name=' + encodeURIComponent(name);
          fetch(apiBase + '/api/recognition/list' + q).then(function (r) { return r.json(); }).then(function (res) { return res && res.ok ? res : { ok: false, recognition: [] }; }).then(successFn).catch(failureFn);
          return;
        }
        Promise.resolve({ ok: true, recognition: [] }).then(successFn).catch(failureFn);
      },
      getRecognitionList: function (payload) {
        if (apiBase != null) {
          var limit = (payload && payload.limit) != null ? Math.max(1, Math.min(100, parseInt(payload.limit, 10))) : 50;
          fetch(apiBase + '/api/recognition/list?limit=' + limit).then(function (r) { return r.json(); }).then(function (res) { return res && res.ok ? res : { ok: false, recognition: [] }; }).then(successFn).catch(failureFn);
          return;
        }
        Promise.resolve({ ok: true, recognition: [] }).then(successFn).catch(failureFn);
      },
      createRecognition: function (payload) {
        if (apiBase != null) {
          fetch(apiBase + '/api/recognition/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload || {}) })
            .then(function (r) { return r.json(); }).then(successFn).catch(failureFn);
          return;
        }
        Promise.resolve({ ok: false, error: 'Worker API required' }).then(successFn).catch(failureFn);
      },
      approveApprovalItem: function (payload) {
        if (apiBase != null) {
          fetch(apiBase + '/api/approvals/approve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload || {}) })
            .then(function (r) { return r.json(); }).then(successFn).catch(failureFn);
          return;
        }
        Promise.resolve({ ok: false, error: 'Worker API required' }).then(successFn).catch(failureFn);
      },
      returnApprovalItem: function (payload) {
        if (apiBase != null) {
          fetch(apiBase + '/api/approvals/return', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload || {}) })
            .then(function (r) { return r.json(); }).then(successFn).catch(failureFn);
          return;
        }
        Promise.resolve({ ok: false, error: 'Worker API required' }).then(successFn).catch(failureFn);
      },
      rejectApprovalItem: function (payload) {
        if (apiBase != null) {
          fetch(apiBase + '/api/approvals/reject', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload || {}) })
            .then(function (r) { return r.json(); }).then(successFn).catch(failureFn);
          return;
        }
        Promise.resolve({ ok: false, error: 'Worker API required' }).then(successFn).catch(failureFn);
      },
      takeApprovalItem: function (payload) {
        if (apiBase != null) {
          fetch(apiBase + '/api/approvals/take', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload || {}) })
            .then(function (r) { return r.json(); }).then(successFn).catch(failureFn);
          return;
        }
        Promise.resolve({ ok: false, error: 'Worker API required' }).then(successFn).catch(failureFn);
      },
      updateNewsArticle: function (payload) {
        var id = String((payload && payload.id) || '').trim();
        var updates = payload && payload.updates ? payload.updates : {};
        var result = updateNewsArticle(id, updates);
        Promise.resolve(result).then(successFn).catch(failureFn);
      },
      approveNewsArticle: function (payload) {
        var id = String((payload && payload.id) || '').trim();
        var by = String((payload && payload.approved_by) || 'Teacher').trim();
        var result = approveNewsArticle(id, by);
        Promise.resolve(result).then(successFn).catch(failureFn);
      },
      rejectNewsArticle: function (payload) {
        var id = String((payload && payload.id) || '').trim();
        var result = rejectNewsArticle(id);
        Promise.resolve(result).then(successFn).catch(failureFn);
      },
      returnNewsArticleForImprovements: function (payload) {
        var id = String((payload && payload.id) || '').trim();
        var reason = String((payload && payload.reason) || '').trim();
        var by = String((payload && payload.returned_by) || 'Teacher').trim();
        var result = returnNewsArticleForImprovements(id, reason, by);
        Promise.resolve(result).then(successFn).catch(failureFn);
      },
      resubmitNewsArticle: function (payload) {
        if (apiBase != null) {
          fetch(apiBase + '/api/news/resubmit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload || {}) })
            .then(function (r) { return r.json(); }).then(successFn).catch(failureFn);
          return;
        }
        var id = String((payload && payload.id) || '').trim();
        var title = String((payload && payload.title) || '').trim();
        var body = String((payload && payload.body) || '').trim();
        var result = resubmitNewsArticle(id, title, body);
        Promise.resolve(result).then(successFn).catch(failureFn);
      },
      getDailyHuntStatus: function (payload) {
        var name = String((payload && payload.character_name) || '').trim();
        var page = String((payload && payload.page) || '').trim();
        var spotCount = payload && (payload.spot_count !== undefined) ? payload.spot_count : undefined;
        var status = getDailyHuntStatus(name, page, spotCount);
        Promise.resolve({ ok: true, status: status }).then(successFn).catch(failureFn);
      },
      claimDailyNuggetHunt: function (payload) {
        var name = String((payload && payload.character_name) || '').trim();
        var economyBackendCharged = !!(payload && payload.economy_backend_charged);
        var result = claimDailyNuggetHunt(name, economyBackendCharged);
        Promise.resolve(result).then(successFn).catch(failureFn);
      },
      getNewsBonusStatus: function (payload) {
        var name = String((payload && payload.character_name) || '').trim();
        var result = getNewsBonusStatus(name);
        Promise.resolve({ ok: true, news_bonus: result }).then(successFn).catch(failureFn);
      },
      claimNewsBonus: function (payload) {
        var name = String((payload && payload.character_name) || '').trim();
        var economyBackendCharged = !!(payload && payload.economy_backend_charged);
        var result = claimNewsBonus(name, economyBackendCharged);
        Promise.resolve(result).then(successFn).catch(failureFn);
      },
      getHiddenUnlocks: function (payload) {
        var name = String((payload && payload.character_name) || '').trim();
        var result = getHiddenUnlocks(name);
        Promise.resolve({ ok: true, unlocks: result }).then(successFn).catch(failureFn);
      },
    };
  }

  function createRun() { return runner(); }
  global.LANTERN_API = { run: createRun, createRun: createRun };
  global.google = global.google || {};
  global.google.script = global.google.script || {};
  global.google.script.run = createRun();
  global.MTSS_API = { run: createRun() };
  global.LANTERN_MISSIONS = {
    completeFirstGame: function () {
      try {
        var raw = (typeof localStorage !== 'undefined' && localStorage.getItem) ? localStorage.getItem('LANTERN_ADOPTED_CHARACTER') : null;
        if (!raw) return { ok: false };
        var adopted = JSON.parse(raw);
        if (!adopted || !adopted.name) return { ok: false };
        return completeFirstGame(adopted.name);
      } catch (e) { return { ok: false }; }
    },
  };
})(typeof window !== 'undefined' ? window : self);
