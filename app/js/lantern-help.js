/**
 * TMS Lantern — Help Mode. Lightweight hover/focus tutorial panel.
 * Kid-friendly explanations for beta testers.
 */
(function (global) {
  var LS_KEY = 'LANTERN_HELP_MODE';
  var HELP_TEXTS = {
    explore: 'Lantern home is one continuous feed of approved posts. Use Filters to browse News, Missions, Polls, Shout-Outs, Photos, Videos, and Articles. Sort and Refresh are in the Filters panel.',
    just_in: 'Just In: the newest approved items in Spotlight style — a quick scan of what landed most recently (not the full Latest Posts list).',
    best_of_lantern: 'Announcements: official updates, staff news, and teacher-featured work shown at the top of the feed.',
    you_can_do: 'Missions & Actions: start a spotlight mission, vote in polls, and take other steps here.',
    happening: 'School News: approved reporter and staff articles, plus recent activity on Lantern.',
    teacher_picks: 'Teacher picks appear in Announcements — extra-good work teachers want everyone to notice.',
    featured_creations: 'Featured work appears in Announcements — teacher-marked standout creations.',
    latest_creations: 'Latest Posts: newest approved community posts in chronological order — not the same as Announcements.',
    lantern_news: 'Articles: school news stories. Reporter and staff pieces need teacher approval before they appear here.',
    school_activity: 'Activity: a short log of recent events on Lantern, such as posts, games, and milestones.',
    polls: 'Polls: tap a card to vote (after you pick a student in Locker → Overview). Approved polls appear here.',
    submit_approval: 'This sends your work to a teacher to check before other people can see it. You will get a message when it is approved.',
    store: 'Use nuggets in the Store to buy cool items for Locker. You earn nuggets by doing missions and finding the daily nugget.',
    daily_nugget_hunt: 'Look around Lantern to find today\'s hidden nugget. It moves to a different page each day. Click it to collect nuggets!',
    profile: 'Locker → Overview: who you are, your creations, achievements, and nugget balance. Tap Edit Profile to change your name or avatar.',
    new_post: 'Share something you made: a picture, a link, a project, or a video. It will go to a teacher for approval first.',
    edit_profile: 'Change your display name, bio, avatar, and which creation you want to feature. You can also equip items you bought in Locker → Store.',
    nugget_wallet: 'This shows how many nuggets you have. Earn them by doing missions, finding the daily nugget, and getting your work approved.',
    games: 'Play mini games here. Each game costs 1 nugget. You can earn more nuggets in the Daily Nugget Hunt.',
    culture_games: 'Culture games: handbook trivia, local history, 7 Habits, and similar activities on this row. Tap a card to play. Most games cost 1 nugget like the arcade row above.',
    news: 'Read school news and submit your own articles. Student reporters and staff can write. Articles need approval before they appear.',
    teacher: 'Teacher Tools: staff workspace for Nuggets, Overview, Review Submissions, Lantern Access, Missions, Shout-Out!, Moderation, Hallway TV, Phone App Download, and Repair App. Students do not use this page.',
    teacher_nuggets: 'Nuggets: select a TMS student to see Current Balance, Total Earned, and Total Spent, then Earn or Spend Nuggets with a required reason.',
    teacher_overview: 'Overview: quick counts and shortcuts into Review Submissions and Missions for your Teacher Tools workspaces.',
    teacher_review: 'Review Submissions: approve, reject, or return student submissions waiting for your check. Only approved items appear to students.',
    teacher_school_access: 'Lantern Access: Current Access Status, Individual Access (approve student requests), Class Access, Schoolwide Access (admin), and Device Enrollment for shared classroom computers.',
    teacher_missions: 'Missions (Teacher Tools): create and manage missions students complete in Lantern. Mission rewards follow the current Nuggets rules shown when you create or edit a mission.',
    teacher_shoutout: 'Shout-Out!: post positive recognition for a student with an optional photo, video, or link. This is not a Nugget award — it is recognition only.',
    teacher_moderation: 'Moderation: hide live posts from public view or restore hidden items. Hidden content stays listed here until you restore it.',
    teacher_hallway_tv: 'Hallway TV opens the Display board in a new tab for hallway screens. It is not in the global Lantern ▼ menu — use this Teacher Tools sidebar link.',
    teacher_phone_app: 'Phone App Download opens Lantern install guidance on the Behavior Logger origin (Add to Home Screen / Install app). It does not remember or trust this device — that stays a separate step.',
    teacher_repair_app: 'Repair App opens on the Behavior Logger origin and clears only this app\'s offline files, then reloads the current version. It does not sign you out, uninstall the PWA, or erase student/Nugget data.',
    missions: 'Missions are tasks you can complete to create, reflect, practice, and sometimes earn Nuggets. Active shows everything you can still work on (including ones you already started or need to fix); Completed shows finished missions. Tap a mission to open it and submit your work.',
    mission_spotlight: 'Missions: one highlighted task you can start today from the active mission list.',
    achievements: 'These are badges you earn when you do things like share your first post, find the daily nugget, or get a teacher pick.',
    trophy_case: 'Your trophy case shows all the achievements you can earn. Gray ones are locked. Green ones you have unlocked.',
    content_tabs: 'Filter your creations by type: All, Image, Link, Video, Web App, or Project.',
    pin_post: 'Pin a post to keep it at the top of your creations in Locker → Overview. Only you see your pinned posts there.',
    reactions: 'Like, favorite, or fire a post to show you enjoyed it. These are positive reactions only.',
    redeem_nuggets: 'Staff Earn or Spend student Nuggets in Teacher Tools → Nuggets. Students also spend Nuggets in Locker → Store on cosmetics and unlocks.',
    store_wallet: 'Your nugget totals (Available, Earned, Spent) for your signed-in account. The wallet refreshes when you open Locker → Store and when you tap Refresh balance.',
    nugget_history: 'Your personal Nugget activity — awards, purchases, and other wallet changes. Only you can see this history.',
    teacher_manual_sale: 'After selecting a student, use This Transaction: Earn or Spend, enter Nuggets and a reason, then Add Nuggets or Spend Nuggets. Dashboard values come from the TMS Nugget Ledger.',
    cosmetics: 'Buy cosmetics like frames, backgrounds, and badges in Locker → Store. Equip them in Edit Profile on Locker → Overview.',
    display_page: 'Hallway TV / Display shows approved work on a big screen. Open it from Teacher Tools → Hallway TV — it is not a global Lantern ▼ destination.',
    filter_chips: 'Tap a chip to filter what you see (when this row is on the page).',
    feed_tabs: 'On the Games page: this row jumps to Lantern, News, Missions, or stays on Games. The home feed (Lantern) has no filter row — scroll through all sections.',
    back_to_profile: 'Go back to Locker.',
    news_image: 'One media spot per article: click the box, then paste a picture, short video, or link, drag a file, or choose a file. It is not for typing — your story goes in the body above.',
    unified_media: 'This box is for photo, video, or link only. Click in it first, then paste, drag, or choose a file. Typing letters here won’t work on purpose.',
    mission_image: 'Add what the mission asks for in this one box: photo, video, or link. Click inside, then paste, drag, or choose a file from your device.',
    submission_celebration: 'After you submit news as a student, you get a short fireworks celebration, then an optional typing game. Nuggets in your school wallet usually come when a teacher approves your article.',
    school_survival: 'Mini Games: handbook and local picture activities. Tap answers to learn why; scores are not saved to your account.',
    approvals_queue: 'Items waiting for your review: news articles and avatar uploads. Use Approve, Reject, or Return. Approving can grant Nuggets (see Teacher Tools → Nuggets). Only approved items appear to students.',
    moderation: 'Moderation: hide live posts from public view or restore hidden items. Hidden content stays listed here until you restore it. Flagged items may need review.',
    rewards_panel: 'Teacher Tools → Nuggets: student Nugget dashboard and Earn/Spend transactions on the TMS ledger. Admin Nugget Adjustment is a separate Admin-only correction tool.',
    verify_page: 'Verify & Simulate: QA tools for seeing how content flows through approvals to Locker and Lantern rails. Simulation is not real authentication — use the routing matrix card for code-backed paths.',
    behavior_logger: 'Behavior Logger: log a Concern, Neutral, or Positive note for a student. Use Lantern ▼ for Teacher Tools and other Lantern pages. Help Mode explains each control when you hover.',
    behavior_student: 'Search or type a student name. Student is optional for some logs, but Positive awards need a roster student with a school ID.',
    behavior_note: 'A note is required before you can log. Do not put unnecessary private details in notes — follow your school’s record expectations.',
    behavior_concern: 'Log Concern: saves a concern note for the selected student (or without a student if your workflow allows). After save, the form clears for the next entry.',
    behavior_neutral: 'Log Neutral: saves a neutral note. After save, the form clears for the next entry.',
    behavior_positive: 'Log Positive: saves a positive note and, when a roster student with a school ID is selected, sends a Nugget reward to Lantern. After save, the form clears.',
  };

  function isHelpModeOn() {
    try {
      return localStorage.getItem(LS_KEY) === 'on';
    } catch (e) { return false; }
  }

  function setHelpMode(on) {
    try {
      localStorage.setItem(LS_KEY, on ? 'on' : 'off');
      return true;
    } catch (e) { return false; }
  }

  function getHelpText(key) {
    return HELP_TEXTS[key] || 'Hover over buttons and sections to learn what they do.';
  }

  function createHelpPanel() {
    var panel = document.createElement('div');
    panel.id = 'lanternHelpPanel';
    panel.className = 'lanternHelpPanel';
    panel.innerHTML = '<div class="lanternHelpPanelHd"><span class="lanternHelpTitle">Help</span><button type="button" class="lanternHelpClose" id="lanternHelpCloseBtn" aria-label="Close help">✕</button></div><div class="lanternHelpPanelBd"><p class="lanternHelpText" id="lanternHelpText">Turn on Help Mode and hover over things to learn what they do.</p></div>';
    return panel;
  }

  function createHelpToggle() {
    var wrap = document.createElement('div');
    wrap.className = 'lanternHelpToggleWrap';
    wrap.innerHTML = '<button type="button" class="lanternHelpToggle" id="lanternHelpToggleBtn">Help Mode: Off</button>';
    return wrap;
  }

  function positionHelpPanel() {
    var panel = document.getElementById('lanternHelpPanel');
    if (!panel) return;
    var header = document.getElementById('lanternHeader') || document.querySelector('.appHeader');
    var gap = 10;
    var bottomMargin = 16;
    var rightInset = 12;
    try {
      var cs = window.getComputedStyle(document.documentElement);
      var pad = cs.getPropertyValue('--lantern-pad-x');
      if (pad && String(pad).trim()) rightInset = parseFloat(pad) || rightInset;
    } catch (e) {}
    var top = gap;
    if (header) {
      var rect = header.getBoundingClientRect();
      if (rect && rect.bottom > 0) top = Math.ceil(rect.bottom) + gap;
    }
    panel.style.top = top + 'px';
    panel.style.right = rightInset + 'px';
    panel.style.maxHeight = Math.max(120, window.innerHeight - top - bottomMargin) + 'px';
  }

  function init() {
    if (typeof document === 'undefined' || !document.body) return;
    /* Prompt #185 — Help Mode is no longer a standard header control.
       Mount the toggle only when an explicit #lanternHelpSlot exists (none in canonical nav).
       Keep LANTERN_HELP API + glossary infrastructure; do not float a body-level toggle. */
    var slot = document.getElementById('lanternHelpSlot');
    if (!slot) {
      global.LANTERN_HELP = {
        isOn: isHelpModeOn,
        setOn: setHelpMode,
        getText: getHelpText,
        positionPanel: positionHelpPanel,
      };
      return;
    }

    var style = document.createElement('style');
    style.textContent = [
      '.lanternAppBar .lanternHelpToggleWrap,.appHeader .lanternHelpToggleWrap{ position: static !important; top: auto !important; right: auto !important; z-index: auto !important; }',
      '.lanternHelpToggleWrap{ position: fixed; top: 12px; right: 12px; z-index: 9998; }',
      '.lanternHelpToggle{ padding: 6px 10px; font-size: 18px; font-weight: 700; border: none; border-radius: 0; background: transparent; color: rgba(234,240,255,.9); cursor: pointer; transition: color .2s ease; }',
      '.lanternHelpToggle:hover{ color: #9dd4f0; }',
      '.lanternHelpToggle.on{ color: #9dd4f0; }',
      '.lanternHelpPanel{ position: fixed; top: 120px; right: 12px; width: 280px; max-width: calc(100vw - 24px); max-height: calc(100vh - 140px); overflow-y: auto; overflow-x: hidden; z-index: 9999; border: 2px solid rgba(90,167,255,.4); border-radius: 14px; background: linear-gradient(180deg, rgba(15,27,51,.98), rgba(10,18,36,.98)); box-shadow: 0 12px 32px rgba(0,0,0,.5); display: none; }',
      '.lanternHelpPanel.visible{ display: block; }',
      '.lanternHelpPanelHd{ padding: 12px 14px; border-bottom: 1px solid rgba(255,255,255,.12); display: flex; align-items: center; justify-content: space-between; }',
      '.lanternHelpTitle{ font-weight: 900; font-size: 22px; color: #eaf0ff; }',
      '.lanternHelpClose{ width: 36px; height: 36px; border-radius: 10px; border: 1px solid rgba(255,255,255,.2); background: rgba(255,255,255,.06); color: #b9c6ea; font-size: 20px; cursor: pointer; }',
      '.lanternHelpClose:hover{ background: rgba(255,255,255,.12); }',
      '.lanternHelpPanelBd{ padding: 16px; }',
      '.lanternHelpText{ margin: 0; font-size: 20px; line-height: 1.5; color: #b9c6ea; font-weight: 700; }',
      '[data-help]{ cursor: help; }',
      '[data-route-surface]{ cursor: help; }',
    ].join('\n');
    document.head.appendChild(style);

    var toggleWrap = createHelpToggle();
    slot.appendChild(toggleWrap);

    var panel = createHelpPanel();
    document.body.appendChild(panel);

    var toggleBtn = document.getElementById('lanternHelpToggleBtn');
    var closeBtn = document.getElementById('lanternHelpCloseBtn');
    var helpText = document.getElementById('lanternHelpText');

    function updateUI() {
      var on = isHelpModeOn();
      if (toggleBtn) {
        toggleBtn.textContent = 'Help Mode: ' + (on ? 'On' : 'Off');
        toggleBtn.classList.toggle('on', on);
      }
      if (panel) panel.classList.toggle('visible', on);
      if (on) positionHelpPanel();
      if (!on && helpText) {
        helpText.innerHTML = '';
        helpText.textContent = 'Turn on Help Mode and hover over things to learn what they do.';
      }
    }

    function showHelp(key) {
      if (!isHelpModeOn()) return;
      if (helpText) {
        helpText.innerHTML = '';
        helpText.textContent = getHelpText(key);
      }
      if (panel) panel.classList.add('visible');
      positionHelpPanel();
    }

    function showRouteHelpFromEl(routeEl) {
      if (!isHelpModeOn() || !helpText || !routeEl) return;
      var LRH = global.LanternRouteHelp;
      if (!LRH || !LRH.readContextFromElement || !LRH.getLanternRouteExplanation || !LRH.formatHelpHtml) return;
      var ctx = LRH.readContextFromElement(routeEl);
      if (!ctx) return;
      var ex = LRH.getLanternRouteExplanation(ctx);
      helpText.innerHTML = LRH.formatHelpHtml(ex);
      if (panel) panel.classList.add('visible');
      positionHelpPanel();
    }

    function hideHelp() {
      if (helpText) {
        helpText.innerHTML = '';
        helpText.textContent = 'Hover over buttons and sections to learn what they do.';
      }
    }

    if (toggleBtn) {
      toggleBtn.addEventListener('click', function () {
        setHelpMode(!isHelpModeOn());
        updateUI();
      });
    }
    if (closeBtn) {
      closeBtn.addEventListener('click', function () {
        setHelpMode(false);
        updateUI();
      });
    }

    window.addEventListener('resize', positionHelpPanel);
    window.addEventListener('scroll', positionHelpPanel, true);

    document.addEventListener('mouseover', function (e) {
      if (!isHelpModeOn()) return;
      var el = e.target;
      while (el && el !== document.body) {
        if (el.getAttribute && el.getAttribute('data-route-surface')) {
          showRouteHelpFromEl(el);
          return;
        }
        el = el.parentNode;
      }
      el = e.target;
      while (el && el !== document.body) {
        var key = el.getAttribute && el.getAttribute('data-help');
        if (key) {
          showHelp(key);
          return;
        }
        el = el.parentNode;
      }
      hideHelp();
    }, true);

    document.addEventListener('focusin', function (e) {
      if (!isHelpModeOn()) return;
      var el = e.target;
      while (el && el !== document.body) {
        if (el.getAttribute && el.getAttribute('data-route-surface')) {
          showRouteHelpFromEl(el);
          return;
        }
        el = el.parentNode;
      }
      el = e.target;
      while (el && el !== document.body) {
        var key = el.getAttribute && el.getAttribute('data-help');
        if (key) {
          showHelp(key);
          return;
        }
        el = el.parentNode;
      }
    }, true);

    updateUI();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  global.LANTERN_HELP = {
    isOn: isHelpModeOn,
    setOn: setHelpMode,
    getText: getHelpText,
    positionPanel: positionHelpPanel,
  };
})(typeof window !== 'undefined' ? window : self);
