/**
 * Lantern — code-backed route explanations for Help Mode.
 * Explanations follow real pipelines in index.html, explore.html, lantern-cards.js, worker recognition merge, etc.
 */
(function (global) {
  function esc(s) {
    return String(s || '').replace(/[&<>"']/g, function (c) {
      return c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;';
    });
  }

  /**
   * @param {Object} ctx - { surface, pipeline?, detail?, flags? }
   * @returns {{ what: string, approval: string, whyHere: string, whereElse: string|null, summary: string }}
   */
  function getLanternRouteExplanation(ctx) {
    ctx = ctx || {};
    var surface = String(ctx.surface || '').trim();
    var pipeline = String(ctx.pipeline || '').trim();
    var detail = String(ctx.detail || '').trim();
    var flags = ctx.flags && typeof ctx.flags === 'object' ? ctx.flags : {};

    var unk = {
      what: 'Something in Lantern.',
      approval: 'We could not tell from the app data on this card.',
      whyHere: 'This item is on this page, but its exact route was not labeled for Help Mode.',
      whereElse: null,
      summary: 'We are not sure how this item is routed. Ask a teacher or check the Verify page System Flow.'
    };

    if (!surface) return unk;

    if (global.LanternContentRouting && global.LanternContentRouting.routingFactForItemType && detail === 'routing_matrix_hint') {
      var fact = global.LanternContentRouting.routingFactForItemType(pipeline);
      if (fact) {
        return {
          what: 'Routing reference.',
          approval: 'See matrix row.',
          whyHere: fact,
          whereElse: 'Verify page → Routing matrix; console: LanternContentRouting.logVerifySummary()',
          summary: fact.slice(0, 120) + (fact.length > 120 ? '…' : '')
        };
      }
    }

    if (surface === 'spotlight') {
      if (pipeline === 'empty') {
        return {
          what: 'An empty Spotlight slot.',
          approval: 'Nothing to approve here yet.',
          whyHere: 'You do not have spotlight items yet. They appear when you get recognition, a peer shout-out (after approval), or certain teacher picks logged to your history.',
          whereElse: 'Peer shout-outs also need the Recognizing line to match your character name.',
          summary: 'Spotlight is empty until recognition, approved shout-outs, or history spotlight events show up for you.'
        };
      }
      if (pipeline === 'peer_shoutout') {
        return {
          what: 'A peer shout-out about you.',
          approval: 'Yes. A teacher had to approve the shout-out as school news before it could count for Spotlight.',
          whyHere: 'The app matched the shout-out to your Locker display name and merged it into the same list as teacher recognition (code: approved news + recognition list API).',
          whereElse: 'Approved shout-outs can also appear as school news elsewhere; activity may log when news is published.',
          summary: 'This is an approved student shout-out that names you. It is here because a teacher approved it and your name matched.'
        };
      }
      if (pipeline === 'teacher_recognition') {
        return {
          what: 'Teacher recognition written for you.',
          approval: 'No separate approval queue. Teachers add these directly; they show up right away in the recognition list.',
          whyHere: 'Your teacher (or staff) saved this in the recognition system for your character name.',
          whereElse: 'Same rows can feed hallway-style displays that read the recognition API.',
          summary: 'A teacher typed this recognition for you. It did not go through the news approval queue.'
        };
      }
      if (pipeline === 'teacher_pick_recognition') {
        return {
          what: 'Teacher Pick saved as a recognition row for Spotlight.',
          approval: 'The creation was already approved; Teacher Pick is an extra teacher action.',
          whyHere: 'When the API is enabled, Teacher Pick also creates a row in the recognition list so Spotlight matches other recognition items.',
          whereElse: 'The same creation stays in Explore Announcements and Latest Posts while it is still recent.',
          summary: 'This Spotlight card is tied to Teacher Pick on your work. The post itself still lives in Explore rails.'
        };
      }
      if (pipeline === 'history_spotlight') {
        return {
          what: 'A highlight from your Lantern history (like a pick, feature, or praise).',
          approval: 'Usually yes for the underlying post, and a teacher action (pick/feature/praise) added this note.',
          whyHere: 'The app only shows history lines tagged as spotlight-style (curation or special notes) in your Spotlight rail.',
          whereElse: 'The original post may also appear on Explore if it is public; picks/features also appear in Announcements.',
          summary: 'This card comes from your account history when something was marked as a spotlight moment.'
        };
      }
      if (pipeline === 'teacher_spotlight_badge') {
        return {
          what: 'The Teacher Spotlight achievement card.',
          approval: 'No. Unlocking uses the achievement rules in the app (system checks), not the news queue.',
          whyHere: 'You unlocked the teacher_spotlight achievement, so the app shows this celebratory card in Spotlight.',
          whereElse: 'The Achievements rail lists all badges; this one is duplicated as a spotlight moment.',
          summary: 'You earned the Teacher Spotlight badge, so this special card appears in Your Wins.'
        };
      }
    }

    if (surface === 'achievements') {
      if (pipeline === 'placeholder') {
        return {
          what: 'A placeholder while achievements load (or none yet).',
          approval: 'N/A',
          whyHere: 'The app has not loaded badges yet or you have no unlocks to list.',
          whereElse: null,
          summary: 'Wait for data to load, or keep using Lantern to unlock achievements.'
        };
      }
      return {
        what: 'An achievement badge row.',
        approval: 'No teacher clicks each badge. The app turns a badge on when its rule is met (missions, posts, picks, etc.).',
        whyHere: 'Achievements are loaded for your character from the same list the app uses everywhere (ACHIEVEMENT_DEFS + what you unlocked).',
        whereElse: flags.unlocked ? 'Unlocked badges may also create activity log lines.' : null,
        summary: (flags.unlocked ? 'You unlocked this badge.' : 'You have not unlocked this badge yet.') + ' The app decides using stored progress, not a separate approval per badge.'
      };
    }

    if (surface === 'around_school') {
      var et = detail || 'event';
      var approvalLine = 'Most lines are system logs. News-related lines mean a teacher already approved that news if it says published. Mission lines mean a teacher already acted if it says approved.';
      if (et.indexOf('news_submitted') >= 0 || et === 'news_submitted') {
        approvalLine = 'Submitted news still needs teacher approval before it is public news; this line is just the submit event.';
      }
      if (et.indexOf('post_created') >= 0) {
        approvalLine = 'The post still needed teacher approval to be public; this log is from when it was created.';
      }
      return {
        what: 'One line from the school activity log (event type: ' + esc(et) + ').',
        approval: approvalLine,
        whyHere: 'The app reads the last activity events from the same store used for the ticker (getActivityEvents) and maps them into cards on Locker → Overview.',
        whereElse: 'Similar events can appear in Explore School News under Activity.',
        summary: 'This is a recorded school activity event. It is here so you can see what happened recently around Lantern.'
      };
    }

    if (surface === 'discovery') {
      if (pipeline === 'curated_spotlight') {
        return {
          what: 'A creation chosen for the Community / discovery strip.',
          approval: 'Yes. Items are approved student work; this one is flagged spotlight in the discovery feed data.',
          whyHere: 'getDiscoveryFeed picked this entry for your Locker → Overview discovery scroller.',
          whereElse: 'The same post may appear on Explore if it is in the public feed.',
          summary: 'This is spotlighted approved work picked for discovery on your profile.'
        };
      }
      return {
        what: 'A creation listed in your Community / discovery feed.',
        approval: 'Yes. Discovery only lists approved creations from the app feed data.',
        whyHere: 'The app loads getDiscoveryFeed and renders each item as an Explore-style card here.',
        whereElse: 'Explore Latest Posts can show the same post if it is in the shared feed.',
        summary: 'This is approved work the app included in the curated discovery list for you.'
      };
    }

    if (surface === 'my_creations') {
      if (pipeline === 'approved_mission_submission') {
        return {
          what: 'A teacher mission you finished and the teacher approved.',
          approval: 'Yes. Your teacher approved this mission submission.',
          whyHere: 'The app merges approved mission items with your creations and shows them in this horizontal strip.',
          whereElse: 'Mission detail lives under your content area when you scroll.',
          summary: 'This shortcut is an approved mission turn-in. It is here so you can jump to it in Locker → Overview.'
        };
      }
      return {
        what: 'One of your profile posts (creation).',
        approval: 'Yes. Posts only show on your profile after teacher approval in the normal post flow.',
        whyHere: 'The app lists your own approved posts (and missions) in this strip.',
        whereElse: 'If picked or featured, the same post can appear on Explore for everyone.',
        summary: 'This is your own approved post. Teachers approved it before it showed in Locker → Overview.'
      };
    }

    if (surface === 'explore_best') {
      var pick = flags.teacher_pick;
      var feat = flags.teacher_featured;
      return {
        what: pick ? 'A Teacher Pick' : (feat ? 'Featured creation' : 'Announcements rail item'),
        approval: 'The post was already approved. A teacher then marked it pick or feature.',
        whyHere: 'Explore only puts teacher_pick or teacher_featured posts in Announcements (code filters the feed).',
        whereElse: 'The same post can also appear in Latest Posts below.',
        summary: pick ? 'A teacher marked this as a pick after it was approved.' : 'A teacher featured this standout work after approval.'
      };
    }

    if (surface === 'explore_new') {
      return {
        what: 'An approved creation, newest first.',
        approval: 'Yes. Only approved posts enter the explore feed used here.',
        whyHere: 'Explore sorts the shared feed by date and shows it in the Latest Posts rail.',
        whereElse: 'If it gets a pick or feature, it can also show in Announcements.',
        summary: 'This is public approved work, shown because it is recent in Latest Posts.'
      };
    }

    if (surface === 'explore_happening_news') {
      return {
        what: 'A school news article.',
        approval: 'Yes for student reporters. Teachers/staff news may publish faster depending on setup, but student paths use approval.',
        whyHere: 'School News loads approved news (API or local) and shows each article as a card.',
        whereElse: 'News page and hallway display can show the same approved articles.',
        summary: 'This article is in School News because it is approved school news.'
      };
    }

    if (surface === 'explore_activity') {
      return {
        what: 'A school activity blurb (same log as Locker → Overview Around school, shorter card).',
        approval: 'It is a log line, not a post. Some events refer to things that already went through approval.',
        whyHere: 'Explore maps getActivityEvents into compact activity cards under School News.',
        whereElse: 'Locker → Overview (Around school) uses the same event types with full Explore-style cards.',
        summary: 'This text comes from the activity event log (type: ' + esc(detail || 'unknown') + ').'
      };
    }

    if (surface === 'explore_poll') {
      return {
        what: 'An active poll.',
        approval: 'Yes. A student (or staff) submitted it on Contribute and a teacher approved it before it went live.',
        whyHere: 'Explore loads approved polls from the polls API and lists them here.',
        whereElse: null,
        summary: 'This poll is here so students can vote; it is part of Explore Missions & Actions.'
      };
    }

    if (surface === 'explore_mission_spotlight') {
      return {
        what: 'A mission your teacher published for students.',
        approval: 'Teachers create missions; students do not approve them.',
        whyHere: 'Explore picks one active mission from the missions API to feature as “Try this.”',
        whereElse: 'Missions page lists all active missions for you.',
        summary: 'This mission card is here as today’s highlighted task from the active mission list.'
      };
    }

    if (surface === 'games_leaderboard') {
      return {
        what: 'Weekly arcade game scores.',
        approval: 'No teacher approval. Scores are saved when you play and hit the leaderboard API.',
        whyHere: 'Games page fetches /api/leaderboards for each arcade game and shows top names.',
        whereElse: 'Only on Games (and any page that embeds the same summary).',
        summary: 'These are game scores for this week, not classroom grades.'
      };
    }

    return unk;
  }

  function tagElement(el, rh) {
    if (!el || !rh || !rh.surface) return;
    el.setAttribute('data-route-surface', String(rh.surface));
    if (rh.pipeline) el.setAttribute('data-route-pipeline', String(rh.pipeline));
    if (rh.detail != null && String(rh.detail).trim() !== '') el.setAttribute('data-route-detail', String(rh.detail).slice(0, 120));
    if (rh.flags && typeof rh.flags === 'object') {
      try {
        el.setAttribute('data-route-flags', JSON.stringify(rh.flags));
      } catch (e) {}
    }
  }

  function readContextFromElement(el) {
    if (!el || !el.getAttribute) return null;
    var s = el.getAttribute('data-route-surface');
    if (!s) return null;
    var flags = {};
    try {
      flags = JSON.parse(el.getAttribute('data-route-flags') || '{}') || {};
    } catch (e) {}
    return {
      surface: s,
      pipeline: el.getAttribute('data-route-pipeline') || '',
      detail: el.getAttribute('data-route-detail') || '',
      flags: flags
    };
  }

  function formatHelpHtml(ex) {
    if (!ex) return '';
    return (
      '<strong style="color:#eaf0ff;">What is this?</strong><br><span style="color:#b9c6ea;">' +
      esc(ex.what) +
      '</span><br><br><strong style="color:#eaf0ff;">Did a teacher need to approve it?</strong><br><span style="color:#b9c6ea;">' +
      esc(ex.approval) +
      '</span><br><br><strong style="color:#eaf0ff;">Why is it showing here?</strong><br><span style="color:#b9c6ea;">' +
      esc(ex.whyHere) +
      '</span>' +
      (ex.whereElse
        ? '<br><br><strong style="color:#eaf0ff;">Where else can it appear?</strong><br><span style="color:#b9c6ea;">' + esc(ex.whereElse) + '</span>'
        : '')
    );
  }

  global.LanternRouteHelp = {
    getLanternRouteExplanation: getLanternRouteExplanation,
    tagElement: tagElement,
    readContextFromElement: readContextFromElement,
    formatHelpHtml: formatHelpHtml
  };
})(typeof window !== 'undefined' ? window : self);
