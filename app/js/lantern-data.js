/**
 * TMS Lantern — default characters, catalog, missions.
 * Fictional data only. No real student or production data.
 */
(function (global) {
  var DEFAULT_CHARACTERS = [
    { character_id: 'char1', name: 'Alex Adventure', avatar: '🌟', balance: 10, owned: [] },
    { character_id: 'char2', name: 'Sam Star', avatar: '⭐', balance: 5, owned: [] },
    { character_id: 'char3', name: 'Jordan Joy', avatar: '✨', balance: 15, owned: [] },
    { character_id: 'char4', name: 'Casey Cool', avatar: '🎯', balance: 0, owned: [] },
    { character_id: 'char5', name: 'Riley Rise', avatar: '🚀', balance: 8, owned: [] },
  ];

  var DEFAULT_CATALOG = [
    { item_id: 'pencil', item_name: 'Pencil', cost: 5, stock: 100 },
    { item_id: 'eraser', item_name: 'Eraser', cost: 3, stock: 50 },
    { item_id: 'sticker', item_name: 'Sticker Pack', cost: 8, stock: 30 },
    { item_id: 'bookmark', item_name: 'Bookmark', cost: 2, stock: 80 },
    { item_id: 'notebook', item_name: 'Mini Notebook', cost: 12, stock: 25 },
    { item_id: 'glue_stick', item_name: 'Glue Stick', cost: 4, stock: 60 },
    { item_id: 'ruler', item_name: 'Ruler', cost: 3, stock: 70 },
    { item_id: 'highlighter', item_name: 'Highlighter', cost: 6, stock: 45 },
    { item_id: 'markers', item_name: 'Marker Set', cost: 10, stock: 35 },
    { item_id: 'index_cards', item_name: 'Index Cards', cost: 2, stock: 120 },
    { item_id: 'folder', item_name: 'Color Folder', cost: 4, stock: 90 },
    { item_id: 'scissors', item_name: 'Safety Scissors', cost: 7, stock: 40 },
    { item_id: 'tape', item_name: 'Tape Roll', cost: 5, stock: 55 },
    { item_id: 'sticky_notes', item_name: 'Sticky Notes', cost: 6, stock: 50 },
    { item_id: 'graph_paper', item_name: 'Graph Paper Pad', cost: 5, stock: 65 },
    { item_id: 'pencil_case', item_name: 'Pencil Case', cost: 9, stock: 30 },
    { item_id: 'water_bottle', item_name: 'Reusable Bottle', cost: 14, stock: 22 },
    { item_id: 'lanyard', item_name: 'School Lanyard', cost: 11, stock: 28 },
    { item_id: 'hoodie_coupon', item_name: 'Spirit Store Coupon', cost: 18, stock: 15 },
    { item_id: 'donation_pin', item_name: 'Kindness Pin Pack', cost: 22, stock: 12 },
  ];

  var DEFAULT_COSMETICS = [
    /* Profile Frames */
    { id: 'frame_silver', name: 'Silver Frame', category: 'frame', cost: 2, rarity: 'common', icon: '⬜' },
    { id: 'frame_gold', name: 'Gold Frame', category: 'frame', cost: 5, rarity: 'rare', icon: '🟨' },
    { id: 'frame_rainbow', name: 'Rainbow Frame', category: 'frame', cost: 10, rarity: 'epic', icon: '🌈' },
    { id: 'frame_legend', name: 'Lantern Legend', category: 'frame', cost: 18, rarity: 'legendary', icon: '🏆' },
    { id: 'frame_blue', name: 'Blue Ribbon Frame', category: 'frame', cost: 3, rarity: 'common', icon: '🔵' },
    { id: 'frame_green', name: 'Green Laurel', category: 'frame', cost: 4, rarity: 'uncommon', icon: '🌿' },
    { id: 'frame_school', name: 'School Spirit', category: 'frame', cost: 6, rarity: 'rare', icon: '📚' },
    { id: 'frame_champion', name: 'Champion Frame', category: 'frame', cost: 14, rarity: 'epic', icon: '🥇' },
    /* Secret / unlock-only frames */
    { id: 'frame_nugget_seeker', name: 'Nugget Seeker', category: 'frame', cost: 0, rarity: 'rare', icon: '🪙', purchasable: false },
    { id: 'frame_hallway_hero', name: 'Hallway Hero', category: 'frame', cost: 0, rarity: 'epic', icon: '📺', purchasable: false },
    /* Page backgrounds (full-page background; separate from profile theme) */
    { id: 'bg_stars', name: 'Starry Sky', category: 'background', cost: 3, rarity: 'common', icon: '🌌' },
    { id: 'bg_sunset', name: 'Sunset Glow', category: 'background', cost: 5, rarity: 'uncommon', icon: '🌅' },
    { id: 'bg_aurora', name: 'Aurora', category: 'background', cost: 8, rarity: 'rare', icon: '🌈' },
    { id: 'bg_galaxy', name: 'Galaxy', category: 'background', cost: 12, rarity: 'epic', icon: '🌠' },
    { id: 'bg_classroom', name: 'Classroom Warm', category: 'background', cost: 2, rarity: 'common', icon: '📖' },
    { id: 'bg_ocean', name: 'Ocean Deep', category: 'background', cost: 5, rarity: 'uncommon', icon: '🌊' },
    { id: 'bg_forest', name: 'Forest Path', category: 'background', cost: 6, rarity: 'uncommon', icon: '🌲' },
    { id: 'bg_midnight', name: 'Midnight Blue', category: 'background', cost: 10, rarity: 'rare', icon: '🌙' },
    { id: 'bg_arcade', name: 'Arcade Glow', category: 'background', cost: 9, rarity: 'rare', icon: '🎮' },
    /* Secret backgrounds */
    { id: 'bg_hidden_lantern', name: 'Hidden Lantern', category: 'background', cost: 0, rarity: 'epic', icon: '🔦', purchasable: false },
    { id: 'bg_newsroom', name: 'Newsroom Spotlight', category: 'background', cost: 0, rarity: 'rare', icon: '📰', purchasable: false },
    /* Badges */
    { id: 'badge_star', name: 'Star Badge', category: 'badge', cost: 2, rarity: 'common', icon: '⭐' },
    { id: 'badge_flame', name: 'Flame Badge', category: 'badge', cost: 4, rarity: 'uncommon', icon: '🔥' },
    { id: 'badge_crown', name: 'Crown Badge', category: 'badge', cost: 6, rarity: 'rare', icon: '👑' },
    { id: 'badge_diamond', name: 'Diamond Badge', category: 'badge', cost: 10, rarity: 'epic', icon: '💎' },
    { id: 'badge_book', name: 'Bookworm', category: 'badge', cost: 2, rarity: 'common', icon: '📚' },
    { id: 'badge_lightning', name: 'Speed Star', category: 'badge', cost: 5, rarity: 'uncommon', icon: '⚡' },
    { id: 'badge_heart', name: 'Kindness', category: 'badge', cost: 4, rarity: 'uncommon', icon: '💝' },
    { id: 'badge_trophy', name: 'Achiever', category: 'badge', cost: 8, rarity: 'rare', icon: '🏅' },
    { id: 'badge_artist', name: 'Creator', category: 'badge', cost: 7, rarity: 'rare', icon: '🎨' },
    /* Secret badge */
    { id: 'badge_secret_finder', name: 'Secret Finder', category: 'badge', cost: 0, rarity: 'epic', icon: '🔐', purchasable: false },
    /* Accessories */
    { id: 'acc_hat', name: 'Top Hat', category: 'accessory', cost: 4, rarity: 'uncommon', icon: '🎩' },
    { id: 'acc_glasses', name: 'Glasses', category: 'accessory', cost: 3, rarity: 'common', icon: '👓' },
    { id: 'acc_sparkle', name: 'Sparkle', category: 'accessory', cost: 5, rarity: 'uncommon', icon: '✨' },
    { id: 'acc_cap', name: 'Graduation Cap', category: 'accessory', cost: 8, rarity: 'rare', icon: '🎓' },
    { id: 'acc_headphones', name: 'Headphones', category: 'accessory', cost: 3, rarity: 'common', icon: '🎧' },
    { id: 'acc_bow', name: 'Bow', category: 'accessory', cost: 4, rarity: 'uncommon', icon: '🎀' },
    { id: 'acc_medal', name: 'Medal', category: 'accessory', cost: 6, rarity: 'rare', icon: '🎖️' },
    /* Decorations */
    { id: 'dec_ribbon', name: 'Ribbon', category: 'decoration', cost: 3, rarity: 'common', icon: '🎀' },
    { id: 'dec_border', name: 'Star Border', category: 'decoration', cost: 6, rarity: 'rare', icon: '🌟' },
    { id: 'dec_hearts', name: 'Hearts', category: 'decoration', cost: 4, rarity: 'uncommon', icon: '💕' },
    { id: 'dec_confetti', name: 'Confetti', category: 'decoration', cost: 3, rarity: 'common', icon: '🎉' },
    { id: 'dec_sparkles', name: 'Sparkles', category: 'decoration', cost: 5, rarity: 'uncommon', icon: '✨' },
    { id: 'dec_gold_star', name: 'Gold Star', category: 'decoration', cost: 7, rarity: 'rare', icon: '⭐' },
    /* Secret decoration */
    { id: 'dec_lantern_glow', name: 'Lantern Glow', category: 'decoration', cost: 0, rarity: 'rare', icon: '🪔', purchasable: false },
    /* Card themes: equipping an accent sets the profile theme. Names match the five supported themes (Profile Studio theme picker). */
    { id: 'accent_gold', name: 'Classic Lantern', category: 'accent', cost: 4, rarity: 'uncommon', icon: '🪙' },
    { id: 'accent_sunset', name: 'Sunset Gold', category: 'accent', cost: 5, rarity: 'uncommon', icon: '🌅' },
    { id: 'accent_blue', name: 'Midnight Blue', category: 'accent', cost: 3, rarity: 'common', icon: '💙' },
    { id: 'accent_green', name: 'Forest Green', category: 'accent', cost: 5, rarity: 'uncommon', icon: '💚' },
    { id: 'accent_arcade', name: 'Cosmic Violet', category: 'accent', cost: 8, rarity: 'rare', icon: '💜' },
    /* Non-theme accents (map to Classic when equipped; visual style only) */
    { id: 'accent_rainbow', name: 'Rainbow', category: 'accent', cost: 7, rarity: 'rare', icon: '🌈' },
    { id: 'accent_glow', name: 'Glow', category: 'accent', cost: 9, rarity: 'epic', icon: '✨' },
    { id: 'accent_silver', name: 'Silver', category: 'accent', cost: 2, rarity: 'common', icon: '◻️' },
  ];

  var LS_KEYS = {
    CHARACTERS: 'LANTERN_CHARACTERS',
    CATALOG: 'LANTERN_CATALOG',
    ACTIVITY: 'LANTERN_ACTIVITY',
    PURCHASES: 'LANTERN_PURCHASES',
    ADOPTED: 'LANTERN_ADOPTED_CHARACTER',
    PENDING_SUBMISSIONS: 'LANTERN_PENDING_SUBMISSIONS',
    TEACHER_ID: 'LANTERN_TEACHER_ID',
    POSTS: 'LANTERN_POSTS',
    PROFILES: 'LANTERN_PROFILES',
    MISSIONS_PROGRESS: 'LANTERN_MISSIONS_PROGRESS',
    ACHIEVEMENTS: 'LANTERN_ACHIEVEMENTS',
    POST_REACTIONS: 'LANTERN_POST_REACTIONS',
    POST_COMMENTS: 'LANTERN_POST_COMMENTS',
    COSMETIC_OWNERSHIP: 'LANTERN_COSMETIC_OWNERSHIP',
    POST_CURATIONS: 'LANTERN_POST_CURATIONS',
    THANKS: 'LANTERN_THANKS',
    GRADE_REFLECTIONS: 'LANTERN_GRADE_REFLECTIONS',
    STAFF: 'LANTERN_STAFF',
    ACTIVITY_EVENTS: 'LANTERN_ACTIVITY_EVENTS',
    CONCERNS: 'LANTERN_CONCERNS',
    TEACHER_MISSIONS: 'LANTERN_TEACHER_MISSIONS',
    MISSION_SUBMISSIONS: 'LANTERN_MISSION_SUBMISSIONS',
    NEWS: 'LANTERN_NEWS',
    NUGGET_HUNT: 'LANTERN_NUGGET_HUNT',
    HIDDEN_UNLOCKS: 'LANTERN_HIDDEN_UNLOCKS',
    HIDDEN_NUGGET_CLAIMS: 'LANTERN_HIDDEN_NUGGET_CLAIMS',
    CURRENT_ROLE: 'LANTERN_CURRENT_ROLE',
    MODE: 'LANTERN_MODE',
    GAME_RESULTS: 'LANTERN_GAME_RESULTS',
    AVATAR_SUBMISSIONS: 'LANTERN_AVATAR_SUBMISSIONS',
  };

  var DEFAULT_STAFF = [
    { staff_id: 'staff1', staff_name: 'Ms. Rivera', staff_role: 'Math Teacher', staff_designation: 'teacher', review_surface: 'teacher' },
    { staff_id: 'staff2', staff_name: 'Mr. Chen', staff_role: 'Science Teacher', staff_designation: 'teacher', review_surface: 'teacher' },
    { staff_id: 'staff3', staff_name: 'Ms. Park', staff_role: 'Counselor', staff_designation: 'staff', review_surface: 'staff' },
    { staff_id: 'staff4', staff_name: 'Mr. Davis', staff_role: 'Office Assistant', staff_designation: 'staff', review_surface: 'staff' },
    { staff_id: 'staff5', staff_name: 'Ms. Foster', staff_role: 'Librarian', staff_designation: 'staff', review_surface: 'staff' },
  ];

  function getFromLS(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (e) { return fallback; }
  }

  function setToLS(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) {}
  }

  function ensureCharacters() {
    var chars = getFromLS(LS_KEYS.CHARACTERS, null);
    if (!chars || !Array.isArray(chars) || chars.length === 0) {
      chars = JSON.parse(JSON.stringify(DEFAULT_CHARACTERS));
      setToLS(LS_KEYS.CHARACTERS, chars);
    }
    return chars;
  }

  function ensureCatalog() {
    var cat = getFromLS(LS_KEYS.CATALOG, null);
    if (!cat || !Array.isArray(cat) || cat.length === 0) {
      cat = JSON.parse(JSON.stringify(DEFAULT_CATALOG));
      setToLS(LS_KEYS.CATALOG, cat);
    }
    return cat;
  }

  function getCosmetics() {
    return JSON.parse(JSON.stringify(DEFAULT_COSMETICS));
  }

  function getCosmeticOwnership() {
    var raw = getFromLS(LS_KEYS.COSMETIC_OWNERSHIP, null);
    if (!raw || typeof raw !== 'object') return {};
    return raw;
  }

  function setCosmeticOwnership(val) {
    setToLS(LS_KEYS.COSMETIC_OWNERSHIP, val);
  }

  function ensureStaff() {
    var raw = getFromLS(LS_KEYS.STAFF, null);
    if (!raw || !Array.isArray(raw) || raw.length === 0) {
      raw = JSON.parse(JSON.stringify(DEFAULT_STAFF));
      setToLS(LS_KEYS.STAFF, raw);
    }
    return raw;
  }

  function getStaff() {
    ensureStaff();
    return getFromLS(LS_KEYS.STAFF, []).slice();
  }

  function getCurrentRole() {
    var v = (getFromLS(LS_KEYS.CURRENT_ROLE, '') || '').trim().toLowerCase();
    if (['student', 'teacher', 'staff', 'admin'].indexOf(v) >= 0) return v;
    return 'student';
  }

  function setCurrentRole(role) {
    var v = String(role || 'student').trim().toLowerCase();
    if (['student', 'teacher', 'staff', 'admin'].indexOf(v) < 0) v = 'student';
    setToLS(LS_KEYS.CURRENT_ROLE, v);
    return v;
  }

  function resetAllLanternData() {
    try {
      var keys = [
        LS_KEYS.CHARACTERS,
        LS_KEYS.CATALOG,
        LS_KEYS.ACTIVITY,
        LS_KEYS.PURCHASES,
        LS_KEYS.ADOPTED,
        LS_KEYS.PENDING_SUBMISSIONS,
        LS_KEYS.TEACHER_ID,
        LS_KEYS.POSTS,
        LS_KEYS.PROFILES,
        LS_KEYS.MISSIONS_PROGRESS,
        LS_KEYS.ACHIEVEMENTS,
        LS_KEYS.POST_REACTIONS,
        LS_KEYS.POST_COMMENTS,
        LS_KEYS.COSMETIC_OWNERSHIP,
        LS_KEYS.POST_CURATIONS,
        LS_KEYS.THANKS,
        LS_KEYS.GRADE_REFLECTIONS,
        LS_KEYS.STAFF,
        LS_KEYS.ACTIVITY_EVENTS,
        LS_KEYS.CONCERNS,
        LS_KEYS.TEACHER_MISSIONS,
        LS_KEYS.MISSION_SUBMISSIONS,
        LS_KEYS.NEWS,
        LS_KEYS.NUGGET_HUNT,
        LS_KEYS.HIDDEN_UNLOCKS,
        LS_KEYS.HIDDEN_NUGGET_CLAIMS,
        LS_KEYS.CURRENT_ROLE,
      ];
      keys.forEach(function (k) {
        try { if (typeof localStorage !== 'undefined' && localStorage.removeItem) localStorage.removeItem(k); } catch (e) {}
      });
      return true;
    } catch (e) { return false; }
  }

  function seedDemoContent() {
    try {
      ensureCharacters();
      ensureCatalog();
      var chars = getFromLS(LS_KEYS.CHARACTERS, []);
      var posts = Array.isArray(getFromLS(LS_KEYS.POSTS, [])) ? getFromLS(LS_KEYS.POSTS, []) : [];
      var activity = Array.isArray(getFromLS(LS_KEYS.ACTIVITY, [])) ? getFromLS(LS_KEYS.ACTIVITY, []) : [];
      var names = chars.slice(0, 3).map(function (c) { return (c && c.name) ? String(c.name).trim() : ''; }).filter(Boolean);
      if (names.length === 0) return { ok: false, error: 'No characters' };
      var added = 0;
      var now = new Date().toISOString();
      if (posts.length < 3) {
        var newPosts = [
          { id: 'demo_post_1', character_name: names[0], type: 'link', title: 'Cool project I built', caption: 'Check it out!', url: 'https://example.com', created_at: now, pinned: true },
          { id: 'demo_post_2', character_name: names[0], type: 'image', title: 'My artwork', caption: '', url: 'https://picsum.photos/400/300', created_at: now, pinned: false },
          { id: 'demo_post_3', character_name: names[1] || names[0], type: 'project', title: 'Science fair entry', caption: 'Won 2nd place', url: 'https://example.com/project', created_at: now, pinned: false },
          { id: 'demo_post_4', character_name: names[2] || names[0], type: 'link', title: 'Favorite resource', caption: 'Helpful for learning', url: 'https://example.com/learn', created_at: now, pinned: false },
        ];
        newPosts.forEach(function (p) {
          if (!posts.some(function (x) { return x && x.id === p.id; })) { posts.push(p); added++; }
        });
        setToLS(LS_KEYS.POSTS, posts);
      }
      if (activity.length < 5) {
        var newActivity = [
          { timestamp: now, character_name: names[0], nugget_delta: 5, kind: 'POSITIVE', source: 'MISSION', note_text: 'Daily Check-In' },
          { timestamp: now, character_name: names[0], nugget_delta: 3, kind: 'POSITIVE', source: 'APPROVAL', note_text: '' },
          { timestamp: now, character_name: names[0], nugget_delta: 0, kind: 'POSITIVE', source: 'CURATION', note_text: 'Spotlighted post: Cool project I built' },
        ];
        newActivity.forEach(function (a) {
          if (activity.length < 8) { activity.push(a); added++; }
        });
        setToLS(LS_KEYS.ACTIVITY, activity);
      }
      return { ok: true, added: added };
    } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
  }

  function seedFullDemoContent() {
    return seedDemoWorld();
  }

  function seedDemoWorld() {
    try {
      ensureCharacters();
      ensureCatalog();
      setToLS(LS_KEYS.CATALOG, JSON.parse(JSON.stringify(DEFAULT_CATALOG)));
      ensureStaff();
      var chars = getFromLS(LS_KEYS.CHARACTERS, []);
      var staff = getFromLS(LS_KEYS.STAFF, []);
      if (!staff || staff.length === 0) staff = JSON.parse(JSON.stringify(DEFAULT_STAFF));
      var names = chars.map(function (c) { return (c && c.name) ? String(c.name).trim() : ''; }).filter(Boolean);
      if (names.length === 0) return { ok: false, error: 'No characters' };
      var staffNames = staff.map(function (s) { return (s && s.staff_name) ? String(s.staff_name).trim() : ''; }).filter(Boolean);
      var now = new Date().toISOString();
      var base = 'https://picsum.photos/';
      var img = function (w, h, seed) { return base + (seed ? 'seed/' + seed + '/' : '') + w + '/' + h; };
      var ts = function (offsetMin) {
        var d = new Date();
        d.setMinutes(d.getMinutes() - (offsetMin || 0));
        return d.toISOString();
      };

      var charIds = chars.slice(0, 5).map(function (c) { return (c && c.character_id) ? c.character_id : 'char1'; });
      var n = function (i) { return names[i % names.length]; };
      var cid = function (i) { return charIds[i % charIds.length]; };

      var postTemplates = [
        { type: 'image', title: 'Sunset over the lake', caption: 'Took this last weekend. The colors were amazing.', url: img(600, 400, 'sunset') },
        { type: 'project', title: 'Robotics Club Build', caption: 'Our team\'s first prototype. We built it from scratch over six weeks.', url: 'https://example.com/robotics' },
        { type: 'image', title: 'Art class final piece', caption: 'Mixed media collage. I used paint, magazine cutouts, and fabric.', url: img(500, 350, 'art') },
        { type: 'link', title: 'Coding tutorial I used', caption: 'Really helped with my project. Great for beginners learning JavaScript.', url: 'https://example.com/code' },
        { type: 'video', title: 'Science experiment timelapse', caption: 'Chemical reaction demo. The color change took about 2 minutes in real time.', url: 'https://example.com/video', preview_src: img(640, 360, 'chem') },
        { type: 'webapp', title: 'Quiz game I made', caption: 'Test your math facts! Click Play to start. Good for practicing multiplication.', url: 'https://example.com/quiz' },
        { type: 'image', title: 'Field trip photos', caption: 'Museum visit. We saw ancient artifacts and learned about history.', url: img(800, 500, 'museum') },
        { type: 'project', title: 'History documentary', caption: 'Local history project. I interviewed three community members.', url: 'https://example.com/doc' },
        { type: 'image', title: 'Bake sale success', caption: 'Raised funds for the club! We made over $200 for new supplies.', url: img(400, 300, 'bake') },
        { type: 'link', title: 'Study playlist', caption: 'Music that helps me focus. Instrumental only, no lyrics.', url: 'https://example.com/playlist' },
        { type: 'image', title: 'Garden project progress', caption: 'Our class garden is growing. Tomatoes and basil are coming in.', url: img(600, 450, 'garden') },
        { type: 'project', title: 'Book report website', caption: 'I made a website about my favorite book. It has character profiles and a summary.', url: 'https://example.com/book' },
        { type: 'webapp', title: 'Flashcard app', caption: 'Study tool for vocabulary. Add your own words and quiz yourself.', url: 'https://example.com/flashcards' },
        { type: 'image', title: 'Sports day highlights', caption: 'Track and field day. I ran the 100 meter dash.', url: img(700, 400, 'sports') },
        { type: 'link', title: 'Science fair resources', caption: 'Helpful links for anyone doing a science fair project this year.', url: 'https://example.com/science' },
        { type: 'image', title: 'Pottery from art class', caption: 'My first ceramic bowl. It took three weeks to make and fire.', url: img(500, 500, 'pottery') },
        { type: 'project', title: 'Community service project', caption: 'We organized a park cleanup. Twenty students volunteered.', url: 'https://example.com/cleanup' },
        { type: 'video', title: 'Stop motion animation', caption: 'Short film I made for media class. Each frame took about 5 seconds.', url: 'https://example.com/stopmotion', preview_src: img(640, 360, 'film') },
        { type: 'image', title: 'Chess club tournament', caption: 'We hosted a tournament. Twelve players competed.', url: img(550, 380, 'chess') },
        { type: 'webapp', title: 'Periodic table quiz', caption: 'Test your knowledge of the elements. Includes hints.', url: 'https://example.com/periodic' },
        { type: 'link', title: 'Writing tips blog', caption: 'Great advice for improving essays. I used it for my last paper.', url: 'https://example.com/writing' },
        { type: 'image', title: 'Drama club rehearsal', caption: 'Getting ready for the spring play. Costumes are almost done.', url: img(650, 430, 'drama') },
        { type: 'project', title: 'Math visualization', caption: 'Interactive graphs showing how equations work. Built with a coding library.', url: 'https://example.com/mathviz' },
        { type: 'image', title: 'Bird feeder project', caption: 'We built bird feeders in science. Now we are tracking which birds visit.', url: img(480, 360, 'birds') },
        { type: 'link', title: 'Geography quiz site', caption: 'Practice identifying countries and capitals. Has different difficulty levels.', url: 'https://example.com/geo' },
        { type: 'webapp', title: 'Timer for presentations', caption: 'Simple timer for practice talks. Shows green, yellow, red as time runs out.', url: 'https://example.com/timer' },
        { type: 'image', title: 'Library reading nook', caption: 'Our class helped redesign the reading corner. So cozy now.', url: img(600, 400, 'library') },
        { type: 'project', title: 'Weather station data', caption: 'We set up a weather station and charted two weeks of data.', url: 'https://example.com/weather' },
        { type: 'video', title: 'Cooking demo', caption: 'How to make healthy snacks. I filmed this for our nutrition unit.', url: 'https://example.com/cooking', preview_src: img(640, 360, 'cook') },
        { type: 'image', title: 'Mural progress', caption: 'The hallway mural is halfway done. Art club meets every Thursday.', url: img(800, 400, 'mural') },
        { type: 'link', title: 'Music theory lessons', caption: 'Free lessons for learning to read music. Really clear explanations.', url: 'https://example.com/music' },
        { type: 'image', title: 'Solar system model', caption: 'Our scale model of the solar system. Pluto is way out in the hall.', url: img(700, 350, 'solar') },
        { type: 'project', title: 'Ecosystem diorama', caption: 'Rainforest ecosystem in a box. Each layer has different plants and animals.', url: 'https://example.com/ecosystem' },
        { type: 'webapp', title: 'Spelling practice', caption: 'Type the word you hear. Good for studying for spelling tests.', url: 'https://example.com/spelling' },
        { type: 'image', title: 'First robotics competition', caption: 'Our team at regionals. We made it to the quarterfinals.', url: img(640, 480, 'robotics') },
        { type: 'link', title: 'Civics resources', caption: 'Links about how government works. Used for our debate prep.', url: 'https://example.com/civics' },
        { type: 'image', title: 'Poetry slam poster', caption: 'Poster I designed for the poetry slam. It is next month.', url: img(400, 600, 'poster') },
        { type: 'project', title: 'Historical timeline', caption: 'Interactive timeline of the Civil War. Click events for more info.', url: 'https://example.com/timeline' },
        { type: 'video', title: 'Interview with a vet', caption: 'Our class interviewed a local veterinarian. She shared great career advice.', url: 'https://example.com/interview', preview_src: img(640, 360, 'interview') },
        { type: 'image', title: 'Recycling drive results', caption: 'We collected 500 pounds of paper. The green team is proud.', url: img(550, 400, 'recycle') },
        { type: 'webapp', title: 'Fraction calculator', caption: 'Visual fraction calculator. Shows the answer as a picture.', url: 'https://example.com/fractions' },
        { type: 'link', title: 'Coding for kids', caption: 'Where I learned to code. Starts with blocks, then real code.', url: 'https://example.com/coding' },
        { type: 'image', title: 'Dance recital', caption: 'Spring dance recital. Our routine was to a pop song.', url: img(600, 450, 'dance') },
        { type: 'project', title: 'Animal research project', caption: 'I studied wolves. Made a website with facts and photos.', url: 'https://example.com/wolves' },
        { type: 'image', title: 'Craft fair booth', caption: 'Our art club sold handmade cards. We raised money for supplies.', url: img(500, 380, 'crafts') },
        { type: 'link', title: 'Virtual museum tours', caption: 'You can tour famous museums online. I visited the Louvre.', url: 'https://example.com/museums' },
        { type: 'webapp', title: 'Random story starter', caption: 'Click to get a random first sentence for creative writing.', url: 'https://example.com/story' },
        { type: 'image', title: 'Science lab setup', caption: 'Our lab for the chemistry experiment. Safety first.', url: img(650, 420, 'lab') },
        { type: 'project', title: 'Map of our town', caption: 'I mapped local landmarks and wrote about the history of each.', url: 'https://example.com/map' },
        { type: 'image', title: 'Hallway high-five board', caption: 'Someone left a nice note. Made me smile.', url: img(520, 380, 'hallway') },
        { type: 'link', title: 'Lo-fi beats', caption: 'Helps me focus when I read.', url: 'https://example.com/lofi' },
        { type: 'image', title: 'Lunch sketch', caption: 'Quick doodle on a napkin. Not fancy but fun.', url: img(450, 450, 'sketch') },
        { type: 'project', title: 'Tiny podcast clip', caption: 'Recorded 30 seconds about our club.', url: 'https://example.com/podclip' },
        { type: 'image', title: 'Locker glow-up', caption: 'Added magnets. Looks cleaner.', url: img(500, 400, 'locker') },
        { type: 'link', title: 'Free icons site', caption: 'Used this for my slide deck.', url: 'https://example.com/icons' },
        { type: 'image', title: 'Morning bus window', caption: 'Foggy glass + sunrise. Kinda pretty.', url: img(600, 400, 'bus') },
      ];

      var posts = [];
      var curations = {};
      for (var i = 0; i < 60; i++) {
        var t = postTemplates[i % postTemplates.length];
        var pid = 'dp' + (i + 1);
        var approved = i < 52;
        var rejected = i >= 56;
        var returned = i === 55;
        var authorIdx = i % 5;
        posts.push({
          id: pid,
          character_name: n(authorIdx),
          actor_id: cid(authorIdx),
          actor_name: n(authorIdx),
          actor_type: 'student',
          type: t.type,
          title: t.title,
          caption: t.caption,
          url: t.url,
          preview_src: t.preview_src || null,
          created_at: ts(i * 12),
          pinned: i === 0,
          approved: approved,
          rejected: rejected,
          returned: returned,
          moderation_status: approved ? 'approved' : (rejected ? 'rejected' : (returned ? 'returned' : 'pending')),
          visibility: 'school_community',
          feature_eligible: true,
        });
        if (approved && (i < 15 || i % 5 === 0)) {
          curations[pid] = { teacher_pick: i % 3 === 0, teacher_featured: i % 4 === 0, spotlighted: i < 3 };
        }
      }
      setToLS(LS_KEYS.POSTS, posts);
      setToLS(LS_KEYS.POST_CURATIONS, curations);

      var profiles = {};
      var bios = ['Love coding and robotics!', 'Artist and creator.', 'Science enthusiast. Always experimenting.', 'Reader and writer. History buff.', 'Math and music. Problem solver.'];
      names.forEach(function (nm, i) {
        profiles[nm] = {
          display_name: nm,
          bio: bios[i] || 'Student at TMS.',
          avatar: chars[i] && chars[i].avatar ? chars[i].avatar : '🌟',
          frame: 'none',
          theme: 'default',
          featured_post_id: 'dp' + (i * 10 + 1),
        };
      });
      setToLS(LS_KEYS.PROFILES, profiles);

      var activity = [];
      for (var a = 0; a < 25; a++) {
        activity.push({
          timestamp: ts(a * 30),
          character_name: n(a % 5),
          nugget_delta: [5, 3, 0, 5, 5, 3, 2, 5, 10][a % 9],
          kind: 'POSITIVE',
          source: ['MISSION', 'APPROVAL', 'CURATION', 'MISSION', 'MISSION', 'APPROVAL', 'MISSION', 'MISSION', 'MISSION'][a % 9],
          note_text: ['Daily Check-In', 'Post approved', 'Spotlighted', 'Hidden Nugget', 'Daily Nugget Hunt', 'Post approved', 'Teacher mission', 'Daily Nugget Hunt', 'First game'][a % 9],
        });
      }
      setToLS(LS_KEYS.ACTIVITY, activity);

      var todayDate = new Date().toISOString().slice(0, 10);
      var events = [];
      var evId = 1;
      for (var e = 0; e < 60; e++) {
        var ei = e % 10;
        var types = ['post_created', 'post_approved', 'teacher_pick', 'thanks_submitted', 'grade_reflection_submitted', 'mission_submitted', 'mission_approved', 'news_submitted', 'news_published', 'daily_nugget_found'];
        var objTypes = ['post', 'post', 'post', 'thanks', 'grade_reflection', 'teacher_mission', 'teacher_mission', 'news_article', 'news_article', 'daily_hunt'];
        events.push({
          id: 'ev' + evId++,
          actor_id: ei < 2 ? n(e % 5) : (ei >= 4 && ei <= 6 ? 'teacher' : n(e % 5)),
          actor_name: ei < 2 ? n(e % 5) : (ei >= 4 && ei <= 6 ? 'Teacher' : n(e % 5)),
          actor_type: ei >= 4 && ei <= 6 ? 'teacher' : 'student',
          object_type: objTypes[ei],
          object_id: 'dp' + (e % 45 + 1),
          event_type: types[ei],
          created_at: ts(e * 8),
          meta: { title: 'Demo post', nuggets: 1, rarity: 'normal' },
        });
      }
      for (var sd = 0; sd < 14; sd++) {
        var d = new Date();
        d.setDate(d.getDate() - sd);
        var dateStr = d.getFullYear() + '-' + (d.getMonth() + 1 < 10 ? '0' : '') + (d.getMonth() + 1) + '-' + (d.getDate() < 10 ? '0' : '') + d.getDate();
        events.push({ id: 'ev' + evId++, actor_id: n(sd % 3), actor_name: n(sd % 3), actor_type: 'student', object_type: 'daily_hunt', object_id: dateStr, event_type: 'daily_nugget_found', created_at: ts(sd * 20), meta: { nuggets: 1, rarity: 'normal' } });
      }
      setToLS(LS_KEYS.ACTIVITY_EVENTS, events);

      var newsTemplates = [
        { title: 'Club Fair Success', body: 'Last week\'s club fair was a huge hit! Over 200 students signed up for new clubs. The robotics demo was especially popular. The chess club had a simultaneous exhibition. The art club sold handmade cards. Thanks to everyone who helped organize. We cannot wait for next year.', category: 'School News' },
        { title: 'Basketball Season Update', body: 'The team is 3-1 so far. Our last game was a close one, winning by two points in the final seconds. Next game is Friday at 4 PM in the gym. Come support the team! Captain Jordan has been leading in scoring. The defense has improved a lot since the start of the season.', category: 'Sports' },
        { title: 'Library Hours Extended', body: 'The library will now be open until 6 PM on weekdays for study time. Students can use the computers, check out books, or work on group projects. Ms. Foster will be available for help. Bring your student ID. Quiet study zones are in the back. We hope this helps everyone prepare for tests.', category: 'Announcements' },
        { title: 'Art Show Preview', body: 'The annual art show is coming up on April 15th in the main hallway. Submit your work by next Friday to the art room. All mediums are welcome: painting, sculpture, photography, digital art. A panel of teachers will select pieces for display. Winners get their work in the yearbook. Do not miss this chance to shine!', category: 'Events' },
        { title: 'Science Fair Winners', body: 'Congratulations to our science fair winners! First place went to Alex for the robotics project. Second place was Sam\'s chemistry experiment. Third place was Jordan\'s ecosystem model. All projects will go to the regional fair. Thank you to the judges and everyone who participated. Science rocks!', category: 'School News' },
        { title: 'Soccer Tryouts', body: 'Soccer tryouts are next Monday and Wednesday after school. Bring cleats and water. Coach Davis will run drills and scrimmages. Everyone is welcome to try out. The season starts in two weeks. We need players for both JV and varsity. See you on the field!', category: 'Sports' },
        { title: 'Drama Club Auditions', body: 'Auditions for the spring play are next week. Sign up outside the drama room. We need actors, stage crew, and tech help. No experience needed. The play is a comedy. Rehearsals start in March. Performances are in May. Join us for a fun semester!', category: 'Clubs' },
        { title: 'New Recycling Program', body: 'The green team is starting a new recycling program. Blue bins are in every classroom. We collect paper, plastic bottles, and aluminum cans. The program runs all year. Prizes for the class that recycles the most each month. Let us keep our school green!', category: 'Announcements' },
        { title: 'Student Spotlight: Riley', body: 'This month we spotlight Riley Rise, who built a weather station for the science fair. Riley coded the data display and built the hardware. The project won second place at regionals. Riley also plays in the band and helps with the school garden. Way to go, Riley!', category: 'Student Spotlight' },
        { title: 'Math Olympiad Results', body: 'Our math team competed at the regional Olympiad. We placed third overall. Alex solved the most problems. Sam got a perfect score on the geometry section. The team practiced every Tuesday. Thank you to Mr. Chen for coaching. Next stop: state competition!', category: 'School News' },
        { title: 'Book Club Picks', body: 'The book club has chosen our next three reads. March: a mystery novel. April: a science fiction classic. May: a memoir. Meetings are every other Thursday in the library. New members welcome. We discuss, snack, and have fun. Sign up with Ms. Foster.', category: 'Clubs' },
        { title: 'Spring Concert Date', body: 'Mark your calendars! The spring concert is May 10th at 7 PM. Band, choir, and orchestra will perform. Tickets are free for students. Families are welcome. The program includes classical and modern pieces. We have been rehearsing since January. Do not miss it!', category: 'Events' },
        { title: 'Homework Help Hours', body: 'Need help with homework? Teachers offer help hours Tuesday and Thursday after school. Math in room 204. Science in the lab. English in the library. Just show up. No sign up needed. Bring your questions. We are here to help you succeed.', category: 'Announcements' },
        { title: 'Chess Tournament', body: 'The chess club hosted a tournament last Saturday. Twelve players competed. Casey won first place. The tournament ran for three hours. Snacks were provided. Thanks to everyone who played. Our next tournament is in April. New players always welcome.', category: 'Clubs' },
        { title: 'Field Day Schedule', body: 'Field day is June 5th. Events include relay races, tug of war, and a water balloon toss. Sign up with your homeroom teacher. We need volunteers to help run stations. Bring sunscreen and water. It is going to be a blast!', category: 'Events' },
        { title: 'Poetry Slam', body: 'The poetry slam is next month. Sign up to perform an original poem. Three minutes max. Judges will score on content and delivery. Prizes for top three. Everyone who performs gets a certificate. Write from the heart. We cannot wait to hear you!', category: 'Student Spotlight' },
        { title: 'Tech Club Demo', body: 'The tech club demonstrated their projects at the club fair. They showed a robot that follows a line, a weather app, and a game. New members can join any time. Meetings are Fridays in the computer lab. Learn to code, build, and create!', category: 'Clubs' },
        { title: 'Cafeteria Menu Update', body: 'The cafeteria is adding new healthy options. Starting next week: veggie wraps, fruit cups, and yogurt parfaits. The popular pizza will still be available. Feedback from the student survey helped shape the menu. Enjoy!', category: 'Announcements' },
      ];

      var news = [];
      for (var ni = 0; ni < newsTemplates.length; ni++) {
        var nt = newsTemplates[ni];
        var authorType = ni < 2 ? 'student' : (ni === 2 || ni === 7 || ni === 12 || ni === 17 ? 'staff' : 'student');
        var authorName = authorType === 'staff' ? (staffNames[ni % staffNames.length] || 'Staff') : n(ni % 5);
        var actorId = authorType === 'staff' ? 'staff_demo' : cid(ni % 5);
        news.push({
          id: 'n' + (ni + 1),
          title: nt.title,
          body: nt.body,
          category: nt.category,
          author_name: authorName,
          author_type: authorType,
          actor_id: actorId,
          actor_name: authorName,
          actor_type: authorType,
          status: ni < 16 ? 'approved' : (ni === 16 ? 'pending' : 'returned'),
          moderation_status: ni < 16 ? 'approved' : (ni === 16 ? 'pending' : 'returned'),
          visibility: 'school_community',
          created_at: ts(ni * 15),
          approved_at: ni < 16 ? ts(ni * 15) : null,
          approved_by: ni < 16 ? 'Teacher' : null,
          feature_eligible: true,
          returned_reason: ni === 17 ? 'Please add the date and time for the new menu options.' : '',
          returned_at: ni === 17 ? now : null,
          returned_by: ni === 17 ? 'Staff' : null,
        });
      }
      setToLS(LS_KEYS.NEWS, news);

      var thanks = [
        { id: 't1', character_name: n(1), actor_id: cid(1), actor_name: n(1), actor_type: 'student', staff_id: staff[0].staff_id, staff_name: staffNames[0], staff_designation: 'teacher', text: 'Thank you so much for helping me understand algebra. Your patience and clear explanations made a huge difference. I finally get quadratic equations now!', word_count: 35, nugget_tier: 1, created_at: now, status: 'pending', moderation_status: 'pending', visibility: 'teacher_only', accepted_at: null, accepted_by: null, nugget_awarded: false },
        { id: 't2', character_name: n(0), actor_id: cid(0), actor_name: n(0), actor_type: 'student', staff_id: staff[1].staff_id, staff_name: staffNames[1], staff_designation: 'teacher', text: 'Thank you for the amazing science project feedback. Your feedback helped me improve my hypothesis and the lab results were so much better. I really appreciate your support!', word_count: 38, nugget_tier: 1, created_at: now, status: 'accepted', moderation_status: 'approved', visibility: 'teacher_only', accepted_at: now, accepted_by: 'Teacher', nugget_awarded: true },
        { id: 't3', character_name: n(2), actor_id: cid(2), actor_name: n(2), actor_type: 'student', staff_id: staff[2].staff_id, staff_name: staffNames[2], staff_designation: 'staff', text: 'Thank you for the counseling session. It really helped me think through my options for next year. I feel more confident about my choices now.', word_count: 32, nugget_tier: 1, created_at: now, status: 'accepted', moderation_status: 'approved', visibility: 'teacher_only', accepted_at: now, accepted_by: 'Staff', nugget_awarded: true },
      ];
      setToLS(LS_KEYS.THANKS, thanks);

      var gradeReflections = [
        { id: 'gr1', character_name: n(2), actor_id: cid(2), actor_name: n(2), actor_type: 'student', reflection_text: 'I did better on my last math test. I studied more and asked for help when I needed it. I want to keep improving and maybe try a harder problem set next time.', word_count: 45, nugget_tier: 1, created_at: now, status: 'pending', moderation_status: 'pending', visibility: 'teacher_only', accepted_at: null, accepted_by: null, nugget_awarded: false },
        { id: 'gr2', character_name: n(0), actor_id: cid(0), actor_name: n(0), actor_type: 'student', reflection_text: 'My science grade improved because I focused on the lab reports. I learned that writing clearly about what I observed really helps my understanding. I will keep doing that.', word_count: 42, nugget_tier: 1, created_at: now, status: 'accepted', moderation_status: 'approved', visibility: 'teacher_only', accepted_at: now, accepted_by: 'Teacher', nugget_awarded: true },
        { id: 'gr3', character_name: n(1), actor_id: cid(1), actor_name: n(1), actor_type: 'student', reflection_text: 'I struggled with the history essay at first. I learned that outlining helps. I will try that for the next one and ask for feedback earlier.', word_count: 38, nugget_tier: 1, created_at: now, status: 'accepted', moderation_status: 'approved', visibility: 'teacher_only', accepted_at: now, accepted_by: 'Teacher', nugget_awarded: true },
      ];
      setToLS(LS_KEYS.GRADE_REFLECTIONS, gradeReflections);

      var teacherMissions = [
        { id: 'tm1', title: 'Read a chapter', description: 'Read one chapter from your book. Write 2–3 sentences on what stuck with you.', reward_amount: 3, submission_type: 'text', created_by_teacher_id: 'teacher', created_by_teacher_name: 'Teacher', actor_id: 'teacher_demo', actor_name: 'Teacher', actor_type: 'teacher', due_date: null, active: true, created_at: now, audience: 'school_mission', featured: true, site_eligible: false },
        { id: 'tm2', title: 'Share a link', description: 'Find one helpful link and paste it. Add one line on why it helps.', reward_amount: 2, submission_type: 'link', created_by_teacher_id: 'teacher', created_by_teacher_name: 'Teacher', actor_id: 'teacher_demo', actor_name: 'Teacher', actor_type: 'teacher', due_date: null, active: true, created_at: now, audience: 'school_mission', featured: false, site_eligible: false },
        { id: 'tm3', title: 'This week in one breath', description: 'Write 3 short sentences about something you figured out this week.', reward_amount: 2, submission_type: 'text', created_by_teacher_id: 'teacher', created_by_teacher_name: 'Teacher', actor_id: 'teacher_demo', actor_name: 'Teacher', actor_type: 'teacher', due_date: null, active: true, created_at: now, audience: 'school_mission', featured: false, site_eligible: false },
        { id: 'tm4', title: 'Old mission (paused)', description: 'Inactive demo mission.', reward_amount: 1, submission_type: 'confirmation', created_by_teacher_id: 'teacher', created_by_teacher_name: 'Teacher', actor_id: 'teacher_demo', actor_name: 'Teacher', actor_type: 'teacher', due_date: null, active: false, created_at: now, audience: 'school_mission', featured: false, site_eligible: false },
        { id: 'tm5', title: 'Doodle something kind', description: 'Make a small doodle on paper. Snap a photo or describe it in one sentence.', reward_amount: 2, submission_type: 'text', created_by_teacher_id: 'teacher', created_by_teacher_name: 'Teacher', actor_id: 'teacher_demo', actor_name: 'Teacher', actor_type: 'teacher', due_date: null, active: true, created_at: now, audience: 'school_mission', featured: true, site_eligible: false },
        { id: 'tm6', title: 'Share a study trick', description: 'Paste a link to any free tool or page that helps you study.', reward_amount: 3, submission_type: 'link', created_by_teacher_id: 'teacher', created_by_teacher_name: 'Teacher', actor_id: 'teacher_demo', actor_name: 'Teacher', actor_type: 'teacher', due_date: null, active: true, created_at: now, audience: 'school_mission', featured: false, site_eligible: false },
        { id: 'tm7', title: 'Quiet thank-you', description: 'Thank someone without naming private stuff. Keep it short and real.', reward_amount: 4, submission_type: 'text', created_by_teacher_id: 'teacher', created_by_teacher_name: 'Teacher', actor_id: 'teacher_demo', actor_name: 'Teacher', actor_type: 'teacher', due_date: null, active: true, created_at: now, audience: 'school_mission', featured: false, site_eligible: false },
        { id: 'tm8', title: '60-second tidy', description: 'Straighten your desk or bag. Tap done when you tried.', reward_amount: 1, submission_type: 'confirmation', created_by_teacher_id: 'teacher', created_by_teacher_name: 'Teacher', actor_id: 'teacher_demo', actor_name: 'Teacher', actor_type: 'teacher', due_date: null, active: true, created_at: now, audience: 'school_mission', featured: false, site_eligible: false },
        { id: 'tm9', title: 'Poster rough draft', description: 'Sketch a poster idea for a club or event. Photo URL or short description.', reward_amount: 6, submission_type: 'image_url', created_by_teacher_id: 'teacher', created_by_teacher_name: 'Teacher', actor_id: 'teacher_demo', actor_name: 'Teacher', actor_type: 'teacher', due_date: null, active: true, created_at: now, audience: 'school_mission', featured: true, site_eligible: false },
        { id: 'tm10', title: 'Help someone find a book', description: 'Tell how you helped a peer find something good to read.', reward_amount: 3, submission_type: 'text', created_by_teacher_id: 'teacher', created_by_teacher_name: 'Teacher', actor_id: 'teacher_demo', actor_name: 'Teacher', actor_type: 'teacher', due_date: null, active: true, created_at: now, audience: 'school_mission', featured: false, site_eligible: false },
        { id: 'tm11', title: 'Fun fact Friday', description: 'Share one weird fact and a link if you have one.', reward_amount: 2, submission_type: 'link', created_by_teacher_id: 'teacher', created_by_teacher_name: 'Teacher', actor_id: 'teacher_demo', actor_name: 'Teacher', actor_type: 'teacher', due_date: null, active: true, created_at: now, audience: 'school_mission', featured: false, site_eligible: false },
        { id: 'tm12', title: 'Hallway high-five', description: 'Give a real high-five or wave to someone. Optional one-line note.', reward_amount: 1, submission_type: 'confirmation', created_by_teacher_id: 'teacher', created_by_teacher_name: 'Teacher', actor_id: 'teacher_demo', actor_name: 'Teacher', actor_type: 'teacher', due_date: null, active: true, created_at: now, audience: 'school_mission', featured: false, site_eligible: false },
        { id: 'tm13', title: 'Six-word story', description: 'Write a six-word story. That is it.', reward_amount: 2, submission_type: 'text', created_by_teacher_id: 'teacher', created_by_teacher_name: 'Teacher', actor_id: 'teacher_demo', actor_name: 'Teacher', actor_type: 'teacher', due_date: null, active: true, created_at: now, audience: 'school_mission', featured: false, site_eligible: false },
        { id: 'tm14', title: '10-second hype clip', description: 'Record a tiny pep talk for your class. Paste the link.', reward_amount: 8, submission_type: 'video', created_by_teacher_id: 'teacher', created_by_teacher_name: 'Teacher', actor_id: 'teacher_demo', actor_name: 'Teacher', actor_type: 'teacher', due_date: null, active: true, created_at: now, audience: 'school_mission', featured: true, site_eligible: false },
        { id: 'tm15', title: 'Free learning corner', description: 'Share a free site or video that teaches something cool.', reward_amount: 3, submission_type: 'link', created_by_teacher_id: 'teacher', created_by_teacher_name: 'Teacher', actor_id: 'teacher_demo', actor_name: 'Teacher', actor_type: 'teacher', due_date: null, active: true, created_at: now, audience: 'school_mission', featured: false, site_eligible: false },
        { id: 'tm16', title: 'One shared space', description: 'Pick one shared spot and leave it nicer than you found it.', reward_amount: 2, submission_type: 'confirmation', created_by_teacher_id: 'teacher', created_by_teacher_name: 'Teacher', actor_id: 'teacher_demo', actor_name: 'Teacher', actor_type: 'teacher', due_date: null, active: true, created_at: now, audience: 'school_mission', featured: false, site_eligible: false },
        { id: 'tm17', title: 'Welcome mode', description: 'Write one sentence welcoming someone new. No names needed.', reward_amount: 5, submission_type: 'text', created_by_teacher_id: 'teacher', created_by_teacher_name: 'Teacher', actor_id: 'teacher_demo', actor_name: 'Teacher', actor_type: 'teacher', due_date: null, active: true, created_at: now, audience: 'school_mission', featured: true, site_eligible: false },
        { id: 'tm18', title: 'Team photo (safe)', description: 'Share a URL to a group photo where everyone is okay with it.', reward_amount: 7, submission_type: 'image_url', created_by_teacher_id: 'teacher', created_by_teacher_name: 'Teacher', actor_id: 'teacher_demo', actor_name: 'Teacher', actor_type: 'teacher', due_date: null, active: true, created_at: now, audience: 'school_mission', featured: false, site_eligible: false },
        { id: 'tm19', title: 'One goal, one line', description: 'State one small goal for tomorrow in a single line.', reward_amount: 2, submission_type: 'text', created_by_teacher_id: 'teacher', created_by_teacher_name: 'Teacher', actor_id: 'teacher_demo', actor_name: 'Teacher', actor_type: 'teacher', due_date: null, active: true, created_at: now, audience: 'school_mission', featured: false, site_eligible: false },
        { id: 'tm20', title: 'Playlist swap', description: 'Paste a playlist or song link that lifts the mood.', reward_amount: 4, submission_type: 'link', created_by_teacher_id: 'teacher', created_by_teacher_name: 'Teacher', actor_id: 'teacher_demo', actor_name: 'Teacher', actor_type: 'teacher', due_date: null, active: true, created_at: now, audience: 'school_mission', featured: false, site_eligible: false },
      ];
      setToLS(LS_KEYS.TEACHER_MISSIONS, teacherMissions);

      var missionSubmissions = [
        { id: 'ms1', mission_id: 'tm1', character_name: n(0), actor_id: cid(0), actor_name: n(0), actor_type: 'student', submission_type: 'text', submission_content: 'The chapter was about the water cycle. Evaporation and condensation finally clicked.', status: 'accepted', moderation_status: 'approved', visibility: 'teacher_only', returned_reason: '', returned_at: null, returned_by: null, created_at: now },
        { id: 'ms2', mission_id: 'tm2', character_name: n(1), actor_id: cid(1), actor_name: n(1), actor_type: 'student', submission_type: 'link', submission_content: 'https://example.com/khan', status: 'pending', moderation_status: 'pending', visibility: 'teacher_only', returned_reason: '', returned_at: null, returned_by: null, created_at: now },
        { id: 'ms3', mission_id: 'tm3', character_name: n(2), actor_id: cid(2), actor_name: n(2), actor_type: 'student', submission_type: 'text', submission_content: 'I practiced fractions and used visual models. Want to try multiplying next.', status: 'accepted', moderation_status: 'approved', visibility: 'teacher_only', returned_reason: '', returned_at: null, returned_by: null, created_at: now },
        { id: 'ms4', mission_id: 'tm5', character_name: n(3), actor_id: cid(3), actor_name: n(3), actor_type: 'student', submission_type: 'text', submission_content: 'Drew a tiny sun with a smile. Sounds silly but it helped.', status: 'pending', moderation_status: 'pending', visibility: 'teacher_only', returned_reason: '', returned_at: null, returned_by: null, created_at: now },
        { id: 'ms5', mission_id: 'tm6', character_name: n(4), actor_id: cid(4), actor_name: n(4), actor_type: 'student', submission_type: 'link', submission_content: 'https://example.com/flashcards', status: 'accepted', moderation_status: 'approved', visibility: 'teacher_only', returned_reason: '', returned_at: null, returned_by: null, created_at: now },
        { id: 'ms6', mission_id: 'tm8', character_name: n(0), actor_id: cid(0), actor_name: n(0), actor_type: 'student', submission_type: 'confirmation', submission_content: 'Done', status: 'accepted', moderation_status: 'approved', visibility: 'teacher_only', returned_reason: '', returned_at: null, returned_by: null, created_at: now },
        { id: 'ms7', mission_id: 'tm11', character_name: n(1), actor_id: cid(1), actor_name: n(1), actor_type: 'student', submission_type: 'link', submission_content: 'https://example.com/space', status: 'pending', moderation_status: 'pending', visibility: 'teacher_only', returned_reason: '', returned_at: null, returned_by: null, created_at: now },
        { id: 'ms8', mission_id: 'tm13', character_name: n(2), actor_id: cid(2), actor_name: n(2), actor_type: 'student', submission_type: 'text', submission_content: 'Bell rang. Still smiled. Worth it.', status: 'accepted', moderation_status: 'approved', visibility: 'teacher_only', returned_reason: '', returned_at: null, returned_by: null, created_at: now },
        { id: 'ms9', mission_id: 'tm15', character_name: n(3), actor_id: cid(3), actor_name: n(3), actor_type: 'student', submission_type: 'link', submission_content: 'https://example.com/science', status: 'accepted', moderation_status: 'approved', visibility: 'teacher_only', returned_reason: '', returned_at: null, returned_by: null, created_at: now },
        { id: 'ms10', mission_id: 'tm19', character_name: n(4), actor_id: cid(4), actor_name: n(4), actor_type: 'student', submission_type: 'text', submission_content: 'Tomorrow: ask one question in class.', status: 'pending', moderation_status: 'pending', visibility: 'teacher_only', returned_reason: '', returned_at: null, returned_by: null, created_at: now },
        { id: 'ms11', mission_id: 'tm9', character_name: n(0), actor_id: cid(0), actor_name: n(0), actor_type: 'student', submission_type: 'image_url', submission_content: 'https://picsum.photos/seed/poster/520/360', status: 'pending', moderation_status: 'pending', visibility: 'teacher_only', returned_reason: '', returned_at: null, returned_by: null, created_at: now },
        { id: 'ms12', mission_id: 'tm14', character_name: n(1), actor_id: cid(1), actor_name: n(1), actor_type: 'student', submission_type: 'video', submission_content: 'https://example.com/peptalk', status: 'accepted', moderation_status: 'approved', visibility: 'teacher_only', returned_reason: '', returned_at: null, returned_by: null, created_at: now },
      ];
      setToLS(LS_KEYS.MISSION_SUBMISSIONS, missionSubmissions);

      var pendingSubmissions = [
        { id: 'ps1', character_name: n(0), submission_type: 'mission', note: 'Daily check-in claimed', created_at: now },
        { id: 'ps2', character_name: n(1), submission_type: 'link', note: 'Shared a coding resource', created_at: now },
      ];
      setToLS(LS_KEYS.PENDING_SUBMISSIONS, pendingSubmissions);

      var concerns = [
        { id: 'c1', subject_type: 'grade_reflection', subject_id: 'gr3', character_name: n(1), recorded_by: 'Teacher', recorded_at: now, note: 'Wanted to follow up on essay difficulty.' },
      ];
      setToLS(LS_KEYS.CONCERNS, concerns);

      var missionsProgress = {};
      names.forEach(function (nm, i) {
        missionsProgress[nm] = {
          daily_checkin_last: i < 3 ? new Date().toISOString().slice(0, 10) : '',
          hidden_nugget: i === 1,
          first_game: i !== 2,
        };
      });
      setToLS(LS_KEYS.MISSIONS_PROGRESS, missionsProgress);

      var purchases = [
        { timestamp: now, character_name: n(0), item_id: 'pencil', item_name: 'Pencil', qty: 2, total_cost: 10, note: '' },
        { timestamp: now, character_name: n(1), item_id: 'sticker', item_name: 'Sticker Pack', qty: 1, total_cost: 8, note: '' },
        { timestamp: now, character_name: n(0), item_id: 'bg_stars', item_name: 'Starry Sky', qty: 1, total_cost: 3, note: 'Cosmetic' },
      ];
      setToLS(LS_KEYS.PURCHASES, purchases);

      var achievements = {};
      var achIds = ['first_post', 'first_game', 'first_purchase', 'daily_checkin', 'hidden_nugget', 'teacher_spotlight', 'ten_nuggets', 'five_posts', 'thank_you_writer', 'news_reporter', '7_day_nugget_streak', 'daily_nugget_finder', 'teacher_mission_finisher', 'featured_creator', 'teacher_pick', 'kindness_writer', 'creative_builder'];
      names.forEach(function (nm, i) {
        achievements[nm] = {};
        for (var ai = 0; ai <= i + 5 && ai < achIds.length; ai++) {
          achievements[nm][achIds[ai]] = ts(ai * 100);
        }
      });
      setToLS(LS_KEYS.ACHIEVEMENTS, achievements);

      return { ok: true, added: 'full' };
    } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
  }

  function getMode() {
    var m = (getFromLS(LS_KEYS.MODE, '') || '').trim().toLowerCase();
    if (m === 'minimal') return 'minimal';
    return 'seeded';
  }

  function setMode(mode) {
    var m = String(mode || 'seeded').trim().toLowerCase();
    if (m !== 'minimal') m = 'seeded';
    setToLS(LS_KEYS.MODE, m);
    return m;
  }

  function ensureStartupMode() {
    var mode = getFromLS(LS_KEYS.MODE, null);
    if (mode === null || mode === '') {
      setToLS(LS_KEYS.MODE, 'seeded');
      mode = 'seeded';
    }
    if (mode === 'minimal') return;
    try {
      const posts = JSON.parse(localStorage.getItem('LANTERN_POSTS') || '[]');
      if (!posts || posts.length < 5) {
        seedDemoWorld();
      }
    } catch (e) {
      seedDemoWorld();
    }
  }

  function clearDemoWorld() {
    try {
      var keysToClear = [
        LS_KEYS.POSTS,
        LS_KEYS.POST_CURATIONS,
        LS_KEYS.PROFILES,
        LS_KEYS.ACTIVITY,
        LS_KEYS.ACTIVITY_EVENTS,
        LS_KEYS.THANKS,
        LS_KEYS.GRADE_REFLECTIONS,
        LS_KEYS.NEWS,
        LS_KEYS.TEACHER_MISSIONS,
        LS_KEYS.MISSION_SUBMISSIONS,
        LS_KEYS.PENDING_SUBMISSIONS,
        LS_KEYS.CONCERNS,
        LS_KEYS.MISSIONS_PROGRESS,
        LS_KEYS.PURCHASES,
        LS_KEYS.ACHIEVEMENTS,
      ];
      keysToClear.forEach(function (k) {
        try { if (typeof localStorage !== 'undefined' && localStorage.removeItem) localStorage.removeItem(k); } catch (e) {}
      });
      ensureCharacters();
      ensureCatalog();
      ensureStaff();
      return { ok: true };
    } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
  }

  global.LANTERN_DATA = {
    DEFAULT_CHARACTERS: DEFAULT_CHARACTERS,
    DEFAULT_CATALOG: DEFAULT_CATALOG,
    DEFAULT_COSMETICS: DEFAULT_COSMETICS,
    LS_KEYS: LS_KEYS,
    getFromLS: getFromLS,
    setToLS: setToLS,
    ensureCharacters: ensureCharacters,
    ensureCatalog: ensureCatalog,
    getCosmetics: getCosmetics,
    getCosmeticOwnership: getCosmeticOwnership,
    setCosmeticOwnership: setCosmeticOwnership,
    ensureStaff: ensureStaff,
    getStaff: getStaff,
    getCurrentRole: getCurrentRole,
    setCurrentRole: setCurrentRole,
    DEFAULT_STAFF: DEFAULT_STAFF,
    resetAllLanternData: resetAllLanternData,
    seedDemoContent: seedDemoContent,
    seedFullDemoContent: seedFullDemoContent,
    seedDemoWorld: seedDemoWorld,
    clearDemoWorld: clearDemoWorld,
    getMode: getMode,
    setMode: setMode,
    ensureStartupMode: ensureStartupMode,
  };
})(typeof window !== 'undefined' ? window : self);
