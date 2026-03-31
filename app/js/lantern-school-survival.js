/**
 * TMS Lantern — School Survival: TMS Edition
 * Teaching mini-game shell (image-ready packs, session streak, no backend).
 */
(function (global) {
  var TMS_SCHOOL_SURVIVAL_QUESTIONS = [
    {
      id: 'planner_hall_1',
      category: 'Hall Pass',
      style_mode: 'scene',
      prompt: 'You’re in the hallway during class, but your planner isn’t filled out. What’s the best move?',
      choices: [
        'Keep walking and hope nobody notices',
        'Go back and get your planner filled out by a teacher',
        'Say you forgot and keep going anyway',
        'Hide in the bathroom until the bell',
      ],
      correctIndex: 1,
      explanation: 'If you’re out of class, you need your planner filled out and initialed. That shows you have permission to be in the hall.',
      wrongWhy: 'Walking around without a completed planner can lead to detention.',
      tip: 'Planner first, hallway second.',
    },
    {
      id: 'phone_1',
      category: 'Cell Phones',
      style_mode: 'photo',
      prompt: 'Your phone buzzes during class and you really want to check it. What should you do?',
      choices: [
        'Check it fast under your desk',
        'Wait and keep your phone put away',
        'Ask your friend what the message says',
        'Use it only if the teacher is helping someone else',
      ],
      correctIndex: 1,
      explanation: 'Phones aren’t supposed to be used during the school day. The smart move is to leave it put away.',
      wrongWhy: 'Using it anyway can get it taken and bring school consequences.',
      tip: 'If it can wait, wait.',
    },
    {
      id: 'absence_1',
      category: 'Attendance',
      prompt: 'You miss school for the day. What needs to happen so the school knows what’s going on?',
      choices: [
        'Nothing, they will figure it out',
        'A parent or guardian should call or send a note',
        'Tell a friend to tell a teacher',
        'Just explain it next week',
      ],
      correctIndex: 1,
      explanation: 'The school needs a note or a call from a parent or guardian to acknowledge the absence.',
      wrongWhy: 'If the school doesn’t get proper notice, the absence can become a bigger problem.',
      tip: 'Missed school = parent contact.',
    },
    {
      id: 'truancy_1',
      category: 'Attendance',
      prompt: 'You leave school during the day without permission. What is that called?',
      choices: ['A free period', 'A normal early checkout', 'Truancy', 'A reset'],
      correctIndex: 2,
      explanation: 'Leaving school or being absent without permission is considered truancy.',
      wrongWhy: 'It’s not just “being out for a bit” if you don’t have permission.',
      tip: 'Always get permission first.',
    },
    {
      id: 'tardy_1',
      category: 'Tardies',
      prompt: 'You’re late because your locker is giving you trouble. What should you do?',
      choices: [
        'Keep working on the locker until you’re done',
        'Go to class right away and explain the problem to your teacher',
        'Skip class because you’re already late',
        'Wait for a friend to help and show up whenever',
      ],
      correctIndex: 1,
      explanation: 'If your locker is the problem, report to class first, tell the teacher, and ask for permission to be late.',
      wrongWhy: 'Standing around longer usually makes the problem worse.',
      tip: 'Go to class first. Explain second.',
    },
    {
      id: 'backpack_1',
      category: 'Classroom Rules',
      prompt: 'You walk into class with your backpack and purse. What should happen next?',
      choices: [
        'Keep them by your desk',
        'Put them in your assigned locker',
        'Leave them in the hallway',
        'Set them by the teacher desk',
      ],
      correctIndex: 1,
      explanation: 'Backpacks and purses are supposed to be kept in assigned lockers, not in classrooms.',
      wrongWhy: 'They’re not meant to stay in class with you.',
      tip: 'Locker = backpack home base.',
    },
    {
      id: 'bullying_1',
      category: 'Safety',
      prompt: 'You see someone getting bullied. What’s the best move?',
      choices: [
        'Ignore it and stay out of it',
        'Join in so you don’t get picked on',
        'Tell an adult or report it',
        'Record it on your phone',
      ],
      correctIndex: 2,
      explanation: 'Bullying should be reported. Telling an adult helps protect people and gets the problem handled.',
      wrongWhy: 'Ignoring, recording, or joining in doesn’t help the person being targeted.',
      tip: 'Be a helper, not a watcher.',
    },
    {
      id: 'safe2tell_1',
      category: 'Safety',
      prompt: 'You know about something dangerous, but you’re nervous to say it out loud. What is one safe option?',
      choices: [
        'Keep it to yourself forever',
        'Post about it online',
        'Use Safe2Tell or tell a trusted adult',
        'Wait until someone else handles it',
      ],
      correctIndex: 2,
      explanation: 'Safe2Tell exists so students can report serious safety concerns, and telling a trusted adult is also a strong move.',
      wrongWhy: 'Waiting can let a dangerous problem get worse.',
      tip: 'Speak up when safety is on the line.',
    },
    {
      id: 'makeup_work_1',
      category: 'Schoolwork',
      prompt: 'You miss school for a day. What should you do about your work?',
      choices: [
        'Ignore it because you were absent',
        'Make up the work after you return',
        'Only do the easiest part',
        'Wait until the quarter ends',
      ],
      correctIndex: 1,
      explanation: 'Students are expected to make up missed work. A common rule is one day allowed for each day missed.',
      wrongWhy: 'Missed work doesn’t disappear just because you were absent.',
      tip: 'Missed class = make-up plan.',
    },
    {
      id: 'pe_excuse_1',
      category: 'PE',
      prompt: 'You need to be excused from PE for the day. What should you have?',
      choices: [
        'Nothing, just tell a friend',
        'A note from home and office approval',
        'A text on your phone',
        'A guess that the teacher will understand',
      ],
      correctIndex: 1,
      explanation: 'To be excused from PE, a written note from home and office approval are needed. Longer excuses may need a doctor note.',
      wrongWhy: 'Just saying it is usually not enough.',
      tip: 'Bring the note before class.',
    },
    {
      id: 'food_drink_1',
      category: 'Classroom Rules',
      style_mode: 'diagram',
      prompt: 'You bring snacks and a sports drink into class. What is usually allowed?',
      choices: [
        'Any food and any drink',
        'Only water in a clear bottle',
        'Only chips if you stay quiet',
        'Only candy if you share',
      ],
      correctIndex: 1,
      explanation: 'Food and drinks aren’t allowed in classrooms, but water in a clear bottle is allowed.',
      wrongWhy: 'Classrooms aren’t snack zones.',
      tip: 'Water wins.',
    },
    {
      id: 'locker_1',
      category: 'Lockers',
      prompt: 'A friend asks for your locker combination. What should you do?',
      choices: [
        'Share it if they promise not to tell',
        'Share it only with your best friend',
        'Do not give it out',
        'Tape it on the locker so you don’t forget',
      ],
      correctIndex: 2,
      explanation: 'Locker combinations aren’t supposed to be given to other students.',
      wrongWhy: 'You’re responsible for what’s in your locker.',
      tip: 'Your combo stays yours.',
    },
    {
      id: 'electronics_1',
      category: 'Electronics',
      prompt: 'You want to bring earbuds and extra electronics to school just in case. What’s the safest answer?',
      choices: [
        'Bring them all every day',
        'Bring only the expensive stuff',
        'Do not bring electronics that aren’t allowed',
        'Hide them in your backpack',
      ],
      correctIndex: 2,
      explanation: 'Personal electronics like cell phones, earbuds, and similar devices aren’t allowed at school under the handbook rules.',
      wrongWhy: 'Bringing them can lead to them being taken and can cause extra problems.',
      tip: 'If it’s not allowed, leave it home.',
    },
    {
      id: 'detention_1',
      category: 'Consequences',
      prompt: 'You get assigned after-school detention. What should happen right away?',
      choices: [
        'Pretend it didn’t happen',
        'Call home to let your parent or guardian know',
        'Skip it and hope for the best',
        'Ask a friend to sign for you',
      ],
      correctIndex: 1,
      explanation: 'Students assigned after-school detention are supposed to call home and notify their parents.',
      wrongWhy: 'Ignoring it usually turns one problem into a bigger one.',
      tip: 'Handle it early.',
    },
    {
      id: 'bus_1',
      category: 'Transportation',
      prompt: 'You’re riding the bus after school. What’s the basic expectation?',
      choices: [
        'Do whatever your friends are doing',
        'Use common sense and follow bus rules',
        'Stand up whenever you want',
        'Argue with the driver if you disagree',
      ],
      correctIndex: 1,
      explanation: 'Students are expected to follow bus rules, common sense, and courtesy.',
      wrongWhy: 'The bus is still part of school expectations.',
      tip: 'Safe, calm, respectful.',
    },
    {
      id: 'athletics_1',
      category: 'Activities',
      style_mode: 'history',
      prompt: 'You want to play in sports or activities. Which idea matters most?',
      choices: [
        'Athletes come first, students second',
        'Students are students first and athletes second',
        'Grades don’t matter if you play well',
        'Attendance doesn’t matter on game days',
      ],
      correctIndex: 1,
      explanation: 'The handbook makes it clear that students in activities are students first and athletes second.',
      wrongWhy: 'Schoolwork, attendance, and citizenship still matter.',
      tip: 'Student first. Athlete second.',
    },
    {
      id: 'eligibility_1',
      category: 'Activities',
      prompt: 'A student has more than one F. What happens to activity eligibility?',
      choices: [
        'Nothing changes',
        'The student may be ineligible',
        'They automatically become captain',
        'Only attendance matters',
      ],
      correctIndex: 1,
      explanation: 'A student with more than one F can be denied participation due to ineligibility.',
      wrongWhy: 'Eligibility is tied to school performance too, not just showing up.',
      tip: 'Grades can affect game time.',
    },
    {
      id: 'attendance_perfect_1',
      category: 'Attendance',
      prompt: 'You want perfect attendance for the quarter. Can you miss lots of class periods and still get it?',
      choices: [
        'Yes, as many as you want',
        'Yes, if you have a good excuse',
        'No, you can’t miss more than the allowed amount',
        'Only tardies matter',
      ],
      correctIndex: 2,
      explanation: 'Perfect attendance has limits. A student can’t miss more than two periods during a month to qualify for quarterly perfect attendance.',
      wrongWhy: 'Perfect attendance has to actually be close to perfect.',
      tip: 'Being there matters.',
    },
    {
      id: 'counselor_1',
      category: 'Support',
      prompt: 'You need help with a problem at school and want to talk to the counselor. What’s a smart move?',
      choices: [
        'Never ask for help',
        'Make an appointment in advance',
        'Walk out of class without telling anyone',
        'Wait until the problem gets huge',
      ],
      correctIndex: 1,
      explanation: 'Students should usually make an appointment in advance if they want to meet with the counselor.',
      wrongWhy: 'Planning ahead helps you get support the right way.',
      tip: 'Ask early, not late.',
    },
    {
      id: 'cheating_1',
      category: 'Academic Honesty',
      prompt: 'Your friend offers to let you copy their work. What should you do?',
      choices: [
        'Copy it because it saves time',
        'Copy only a little',
        'Do your own work',
        'Trade papers and hope nobody notices',
      ],
      correctIndex: 2,
      explanation: 'Cheating and copying another person’s academic work aren’t allowed.',
      wrongWhy: 'Copying can lead to a zero and more consequences.',
      tip: 'Your work should be your work.',
    },
  ];

  /**
   * Trinidad, Colorado — Know Your Town pilot (5 image-backed rounds).
   * SWAP-IN (content author): Drop real photos as:
   *   assets/know-your-town/trinidad-co-01.jpg … trinidad-co-05.jpg
   * Then edit each object below: image_alt, prompt, choices, correctIndex,
   * explanation, wrongWhy, and tip so they match your photos.
   */
  var TRINIDAD_CO_PILOT_QUESTIONS = [
    {
      id: 'trinidad_co_01',
      category: 'Trinidad, CO',
      style_mode: 'photo',
      image_url: 'assets/know-your-town/trinidad-co-01.jpg',
      image_alt: 'Photo clue: a place in or near Trinidad, Colorado — round 1.',
      prompt: 'This picture was taken in or near Trinidad, Colorado. What place is it?',
      choices: [
        'Trinidad Lake State Park',
        'Main Street downtown',
        'Baca House Museum',
        'Louden-Henritze Archaeology Museum',
      ],
      correctIndex: 0,
      explanation:
        'Trinidad Lake State Park is the big recreation area by the lake west of town — boating, trails, and classic “lake and mountains” views.',
      wrongWhy: 'The other picks are downtown or museum spots; they look and feel different from the lake park.',
      tip: 'Water, docks, or big open lake views usually mean the state park.',
    },
    {
      id: 'trinidad_co_02',
      category: 'Trinidad, CO',
      style_mode: 'photo',
      image_url: 'assets/know-your-town/trinidad-co-02.jpg',
      image_alt: 'Photo clue: a place in or near Trinidad, Colorado — round 2.',
      prompt: 'Where was this picture taken? Pick the Trinidad-area place that fits best.',
      choices: [
        "Simpson's Rest (overlook)",
        'Central Park',
        'Fishers Peak State Park trailhead',
        'A Santa Fe Trail historic spot',
      ],
      correctIndex: 0,
      explanation:
        "Simpson's Rest is the famous bluff overlook above town — big views down over Trinidad and the valley.",
      wrongWhy: 'Central Park is flatter and in town; trailheads and trail markers look different from the classic overlook.',
      tip: 'High-up view of the whole town? Think Simpson’s Rest.',
    },
    {
      id: 'trinidad_co_03',
      category: 'Trinidad, CO',
      style_mode: 'photo',
      image_url: 'assets/know-your-town/trinidad-co-03.jpg',
      image_alt: 'Photo clue: a place in or near Trinidad, Colorado — round 3.',
      prompt: 'What building or landmark in Trinidad, Colorado is this?',
      choices: [
        'Trinidad History Museum (Bloom Mansion area)',
        'Baca House Museum',
        'A typical Main Street shop row',
        'The public library building',
      ],
      correctIndex: 0,
      explanation:
        'The Bloom Mansion and related campus are a centerpiece of local history — Victorian style and museum exhibits.',
      wrongWhy: 'Baca House, random storefronts, and the library each have a different look and story.',
      tip: 'Fancy historic house or museum grounds? Bloom area is a strong guess.',
    },
    {
      id: 'trinidad_co_04',
      category: 'Trinidad, CO',
      style_mode: 'photo',
      image_url: 'assets/know-your-town/trinidad-co-04.jpg',
      image_alt: 'Photo clue: a place in or near Trinidad, Colorado — round 4.',
      prompt: 'Name this Trinidad, Colorado spot from the picture.',
      choices: [
        'Louden-Henritze Archaeology Museum',
        'Trinidad Lake marina area',
        'Historic railroad / depot zone',
        'Corazón de Trinidad event space',
      ],
      correctIndex: 0,
      explanation:
        'The archaeology museum focuses on regional history and artifacts — its exhibits and building cues are distinct.',
      wrongWhy: 'The marina, depot district, and Corazón venues don’t match that museum’s role or look.',
      tip: 'Indoor exhibits and “ancient history” vibes point here.',
    },
    {
      id: 'trinidad_co_05',
      category: 'Trinidad, CO',
      style_mode: 'photo',
      image_url: 'assets/know-your-town/trinidad-co-05.jpg',
      image_alt: 'Photo clue: a place in or near Trinidad, Colorado — round 5.',
      prompt: 'Which Trinidad place matches this photo?',
      choices: [
        'Central Park (town park)',
        'Lake overlook / picnic spots',
        'Commercial block on Main',
        'Museum campus gardens',
      ],
      correctIndex: 0,
      explanation:
        'Central Park is Trinidad’s main in-town green space — playgrounds, events, and easy walks right in the city.',
      wrongWhy: 'Lake overlooks, long retail blocks, and museum grounds each give different visual clues.',
      tip: 'Flat town park with playgrounds or bandstand energy? Central Park.',
    },
  ];

  var MODE_LABELS = { photo: 'Photo', scene: 'Scene', diagram: 'Diagram', history: 'History' };

  var PHRASES_OK = [
    'Nice — you saw it.',
    'Good eye.',
    'Yep — that fits.',
    'That’s the move.',
    'Good catch.',
  ];
  var PHRASES_MISS = [
    'Close — look again.',
    'Not quite — here’s the move.',
    'Almost — check the clue.',
    'Good try — here’s what matters.',
  ];

  function esc(s) {
    return String(s || '').replace(/[&<>"']/g, function (c) {
      return c === '&'
        ? '&amp;'
        : c === '<'
          ? '&lt;'
          : c === '>'
            ? '&gt;'
            : c === '"'
              ? '&quot;'
              : '&#39;';
    });
  }

  /** Allow https URLs, protocol-relative //, and same-page relative paths. Block javascript: and data: for simplicity. */
  function resolveImageSrc(url) {
    var s = String(url || '').trim();
    if (!s) return '';
    if (/^\s*javascript:/i.test(s)) return '';
    if (/^\s*data:/i.test(s)) return '';
    if (/^https?:\/\//i.test(s)) return s;
    if (/^\/\//.test(s)) return 'https:' + s;
    return s;
  }

  function normalizeQuestion(q) {
    var mode = String(q.style_mode || 'scene').toLowerCase();
    if (!MODE_LABELS[mode]) mode = 'scene';
    var rawImg = (q.image_url && String(q.image_url).trim()) || '';
    return {
      id: q.id,
      category: q.category,
      prompt: q.prompt,
      choices: q.choices,
      correctIndex: q.correctIndex,
      explanation: q.explanation,
      wrongWhy: q.wrongWhy,
      tip: q.tip,
      image_url: rawImg,
      image_src: resolveImageSrc(rawImg),
      image_alt: (q.image_alt && String(q.image_alt).trim()) || '',
      style_mode: mode,
      extra_note: (q.extra_note && String(q.extra_note).trim()) || '',
    };
  }

  function pickPhrase(arr, seed) {
    return arr[Math.abs(seed) % arr.length];
  }

  function energyTier(streak) {
    if (streak <= 0) return 0;
    if (streak === 1) return 1;
    if (streak === 2) return 2;
    if (streak === 3) return 3;
    return 4;
  }

  function burstSparkles(host, count, streak) {
    if (!host) return;
    var n = Math.min(14, Math.max(4, count + Math.floor(streak / 2)));
    for (var i = 0; i < n; i++) {
      var sp = document.createElement('span');
      sp.className = 'ss-spark';
      sp.setAttribute('aria-hidden', 'true');
      sp.style.left = 15 + Math.random() * 70 + '%';
      sp.style.top = 20 + Math.random() * 60 + '%';
      sp.style.animationDelay = Math.random() * 0.15 + 's';
      host.appendChild(sp);
      setTimeout(function (el) {
        return function () {
          if (el.parentNode) el.parentNode.removeChild(el);
        };
      }(sp), 650);
    }
  }

  function injectStyles() {
    if (document.getElementById('lanternSchoolSurvivalStyles')) return;
    var s = document.createElement('style');
    s.id = 'lanternSchoolSurvivalStyles';
    s.textContent = [
      '.ss-game-shell{max-width:680px;margin:var(--lantern-space-sm) auto 0;padding:var(--lantern-space-md) 5px var(--lantern-space-sm);border-radius:22px;transition:box-shadow .45s ease,background .45s ease;background:linear-gradient(145deg,rgba(15,59,134,.25),rgba(15,39,68,.4));}',
      '.ss-game-shell.ss-e0{box-shadow:0 0 0 1px rgba(255,255,255,.08),0 8px 32px rgba(0,0,0,.25);}',
      '.ss-game-shell.ss-e1{box-shadow:0 0 24px rgba(90,167,255,.12),0 8px 32px rgba(0,0,0,.2);}',
      '.ss-game-shell.ss-e2{box-shadow:0 0 32px rgba(90,167,255,.2),0 8px 36px rgba(0,0,0,.22);}',
      '.ss-game-shell.ss-e3{box-shadow:0 0 40px rgba(56,208,124,.15),0 0 28px rgba(90,167,255,.18);}',
      '.ss-game-shell.ss-e4{box-shadow:0 0 48px rgba(135,206,235,.2),0 0 36px rgba(15,59,134,.35);}',
      '.ss-game-shell.ss-settle{animation:ssSettle .7s ease;}@keyframes ssSettle{0%{filter:brightness(1.05)}100%{filter:brightness(1)}}',
      '.ss-card-inner{background:linear-gradient(180deg,rgba(15,27,51,.98),rgba(10,18,36,.97));border-radius:19px;overflow:hidden;border:1px solid rgba(255,255,255,.1);}',
      '.ss-topbar{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:var(--lantern-space-sm);padding:var(--lantern-space-md) 18px calc(var(--lantern-space-md) - 1px);border-bottom:1px solid rgba(255,255,255,.08);}',
      '.ss-soft{font-size:20px;color:#8899bb;font-weight:700;}',
      '.ss-streak-pill{font-size:20px;font-weight:800;color:#b9c6ea;padding:8px 14px;border-radius:999px;background:rgba(90,167,255,.1);border:1px solid rgba(90,167,255,.2);}',
      '.ss-streak-pill.ss-hot{color:#9dd4f0;border-color:rgba(135,206,235,.35);background:rgba(15,59,134,.25);}',
      '.ss-banner{font-size:21px;font-weight:800;color:#a8b8e0;text-align:center;padding:var(--lantern-space-md) var(--lantern-space-md) var(--lantern-space-sm);line-height:1.4;background:rgba(90,167,255,.06);}',
      '.ss-hero{position:relative;min-height:160px;aspect-ratio:16/10;max-height:280px;background:linear-gradient(160deg,rgba(15,59,134,.45),rgba(10,24,48,.9));display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:0;overflow:hidden;}',
      '.ss-hero.has-img{min-height:200px;max-height:320px;aspect-ratio:16/10;}',
      '@media(min-width:480px){.ss-hero.has-img{min-height:220px;max-height:340px;}}',
      '.ss-hero img.ss-hero-img{width:100%;height:100%;object-fit:cover;position:absolute;inset:0;display:block;}',
      '.ss-hero img.ss-hero-img.ss-img-hidden{visibility:hidden;pointer-events:none;}',
      '.ss-hero-fallback{position:absolute;inset:0;display:none;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:20px;background:linear-gradient(160deg,rgba(25,55,100,.92),rgba(12,22,42,.96));z-index:2;}',
      '.ss-hero.ss-hero-broken .ss-hero-fallback{display:flex;}',
      '.ss-hero-fallback p{margin:0;font-size:22px;font-weight:800;color:#c8d4f0;line-height:1.35;max-width:90%;}',
      '.ss-hero-fallback .ss-fallback-hint{margin-top:10px;font-size:20px;color:#9aaecf;font-weight:700;}',
      '.ss-hero.has-img .ss-hero-fg{position:absolute;bottom:0;left:0;right:0;z-index:1;padding:10px 14px 12px;background:linear-gradient(transparent,rgba(0,0,0,.65));text-shadow:0 1px 8px rgba(0,0,0,.8);}',
      '.ss-hero.has-img .ss-hero-mode{font-size:16px;}',
      '.ss-hero.has-img .ss-hero-cat{font-size:22px;}',
      '.ss-hero-mode{font-size:18px;font-weight:900;letter-spacing:.06em;text-transform:uppercase;color:rgba(157,212,240,.85);}',
      '.ss-hero-cat{font-size:26px;font-weight:1000;color:#eaf0ff;text-align:center;line-height:1.2;max-width:90%;}',
      '.ss-hero.ss-mode-photo{background:linear-gradient(145deg,#1a3050,#0f1b33);}',
      '.ss-hero.ss-mode-scene{background:linear-gradient(160deg,rgba(46,105,214,.35),#0a1428);}',
      '.ss-hero.ss-mode-diagram{background:linear-gradient(160deg,rgba(56,208,124,.2),#0d1829);}',
      '.ss-hero.ss-mode-history{background:linear-gradient(160deg,rgba(183,148,246,.22),#121a2e);}',
      '.ss-hero-noimg-fg{padding:20px 16px;}',
      '.ss-hero-soft{margin-top:12px;font-size:22px;font-weight:800;color:#9aaecf;text-align:center;line-height:1.35;max-width:94%;}',
      '.ss-body{padding:var(--lantern-space-lg) var(--lantern-space-md) var(--lantern-space-xl);}',
      '.ss-body.ss-image-first .ss-prompt{margin-top:var(--lantern-space-sm);}',
      '.ss-prompt{font-size:clamp(24px,5vw,32px);font-weight:900;line-height:1.22;margin-top:var(--lantern-space-sm);margin-bottom:var(--lantern-space-lg);color:#eaf0ff;}',
      '.ss-choices{display:flex;flex-direction:column;gap:var(--lantern-space-md);}',
      '.ss-choice-btn{text-align:left;padding:18px 20px;border-radius:16px;border:2px solid rgba(255,255,255,.14);background:rgba(0,0,0,.28);color:#eaf0ff;font-size:clamp(22px,4.2vw,26px);font-weight:800;cursor:pointer;font-family:inherit;line-height:1.32;min-height:56px;transition:border-color .18s,background .18s,transform .1s;}',
      '.ss-choice-btn:active:not(:disabled){transform:scale(.99);}',
      '.ss-choice-btn:hover:not(:disabled){border-color:rgba(90,167,255,.45);background:rgba(90,167,255,.08);}',
      '.ss-choice-btn:disabled{cursor:default;}',
      '.ss-choice-btn.ss-picked-wrong{border-color:rgba(255,204,102,.45);background:rgba(255,204,102,.08);}',
      '.ss-choice-btn.ss-correct{border-color:rgba(56,208,124,.55);background:rgba(56,208,124,.12);}',
      '.ss-teach-wrap{margin-top:var(--lantern-space-lg);}',
      '.ss-teach-box{padding:var(--lantern-space-lg);border-radius:18px;border:1px solid rgba(255,255,255,.12);background:linear-gradient(185deg,rgba(255,255,255,.09),rgba(255,255,255,.03));}',
      '.ss-feedback-top{font-size:26px;font-weight:1000;margin-bottom:var(--lantern-space-md);line-height:1.25;}',
      '.ss-feedback-top.ok{color:#6ee7a8;}',
      '.ss-feedback-top.hmm{color:#9dd4f0;}',
      '.ss-teach-sec{margin-bottom:var(--lantern-space-md);}',
      '.ss-teach-label{font-size:18px;font-weight:900;color:#7a8fb8;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px;}',
      '.ss-teach-text{font-size:22px;line-height:1.48;color:#c8d4f0;}',
      '.ss-tip-box{margin-top:var(--lantern-space-lg);padding-top:var(--lantern-space-lg);border-top:1px dashed rgba(255,204,102,.25);}',
      '.ss-tip-label{font-size:18px;font-weight:900;color:#ffcc66;margin-bottom:6px;}',
      '.ss-tip-text{font-size:22px;font-weight:800;color:#ffe6a8;line-height:1.4;}',
      '.ss-extra{font-size:20px;color:#9aaecf;margin-top:14px;font-style:italic;line-height:1.4;}',
      '.ss-next{margin-top:var(--lantern-space-lg);width:100%;padding:var(--lantern-space-lg);border-radius:16px;border:2px solid rgba(90,167,255,.5);background:linear-gradient(180deg,rgba(90,167,255,.28),rgba(90,167,255,.1));color:#eaf0ff;font-size:26px;font-weight:900;cursor:pointer;font-family:inherit;}',
      '.ss-spark{position:absolute;width:6px;height:6px;border-radius:50%;background:#fff;box-shadow:0 0 10px #9dd4f0;pointer-events:none;animation:ssSpark .65s ease-out forwards;}@keyframes ssSpark{0%{opacity:0;transform:scale(0)}30%{opacity:1;transform:scale(1.2)}100%{opacity:0;transform:scale(0.2) translateY(-28px);}}',
      '.ss-done-card{text-align:center;padding:var(--lantern-space-2xl) 22px var(--lantern-space-xl);border-radius:22px;border:1px solid rgba(255,255,255,.12);background:linear-gradient(185deg,rgba(56,208,124,.12),rgba(15,27,51,.95));}',
      '.ss-done-glow{animation:ssDoneGlow 1.2s ease-out;}@keyframes ssDoneGlow{0%{box-shadow:0 0 20px rgba(56,208,124,.2)}50%{box-shadow:0 0 40px rgba(135,206,235,.25)}100%{box-shadow:0 0 24px rgba(56,208,124,.15)}}',
      '.ss-done-emoji{font-size:64px;margin-bottom:18px;line-height:1;}',
      '.ss-done-card h2{font-size:34px;font-weight:1000;margin:0 0 14px;line-height:1.15;}',
      '.ss-done-card .ss-done-lead{font-size:24px;color:#b9c6ea;line-height:1.45;margin-bottom:16px;}',
      '.ss-done-card .ss-done-streak{font-size:22px;color:#9dd4f0;font-weight:800;margin-bottom:20px;}',
      '.ss-done-muted{font-size:20px;color:#8899bb;margin-top:18px;line-height:1.4;}',
    ].join('');
    document.head.appendChild(s);
  }

  function heroAltText(q) {
    var a = q.image_alt;
    if (a) return a;
    return 'Illustration for this round: ' + (q.category || 'question') + '.';
  }

  function renderHeroHtml(q) {
    var modeClass = 'ss-mode-' + esc(q.style_mode);
    var src = q.image_src;
    if (src) {
      var label = heroAltText(q);
      var onerr =
        "var h=this.closest('.ss-hero');if(h){h.classList.add('ss-hero-broken');this.classList.add('ss-img-hidden');}";
      return (
        '<div class="ss-hero has-img ' +
        modeClass +
        '" role="group" aria-label="' +
        esc(label) +
        '">' +
        '<img class="ss-hero-img" src="' +
        esc(src) +
        '" alt="' +
        esc(label) +
        '" loading="lazy" decoding="async" onerror="' +
        onerr +
        '" />' +
        '<div class="ss-hero-fallback" role="status">' +
        '<p>Picture didn’t load.</p>' +
        '<p class="ss-fallback-hint">Use the question and answers — you’ve got this.</p></div>' +
        '<div class="ss-hero-fg"><span class="ss-hero-mode">' +
        esc(MODE_LABELS[q.style_mode] || 'Scene') +
        '</span><span class="ss-hero-cat">' +
        esc(q.category) +
        '</span></div></div>'
      );
    }
    return (
      '<div class="ss-hero ' +
      modeClass +
      '" role="region" aria-label="Round theme">' +
      '<div class="ss-hero-fg ss-hero-noimg-fg"><span class="ss-hero-mode">' +
      esc(MODE_LABELS[q.style_mode] || 'Scene') +
      '</span><span class="ss-hero-cat">' +
      esc(q.category) +
      '</span>' +
      '<p class="ss-hero-soft">Look closely. Spot the details. This round is about what you notice.</p></div></div>'
    );
  }

  function streakLine(streak) {
    if (streak <= 0) return '<span class="ss-soft">Tap what fits — you’ll see the why.</span>';
    if (streak === 1) return '<span class="ss-streak-pill">1 in a row — nice start</span>';
    if (streak === 2) return '<span class="ss-streak-pill ss-hot">2 in a row</span>';
    if (streak === 3) return '<span class="ss-streak-pill ss-hot">3 in a row · on a roll</span>';
    return '<span class="ss-streak-pill ss-hot">On a roll: ' + streak + '</span>';
  }

  function getPackKey(opts) {
    var k = opts && opts.pack != null ? String(opts.pack).trim().toLowerCase() : '';
    if (!k && typeof location !== 'undefined' && location.search) {
      try {
        k = (new URLSearchParams(location.search).get('pack') || '').trim().toLowerCase();
      } catch (e) {}
    }
    if (
      k === 'trinidad-co' ||
      k === 'trinidad_co' ||
      k === 'trinidad' ||
      k === 'places' ||
      k === 'know-your-town'
    ) {
      return 'trinidad_co';
    }
    return 'school';
  }

  function questionsForPack(packKey) {
    if (packKey === 'trinidad_co') return TRINIDAD_CO_PILOT_QUESTIONS.map(normalizeQuestion);
    return TMS_SCHOOL_SURVIVAL_QUESTIONS.map(normalizeQuestion);
  }

  function mount(root, opts) {
    if (!root) return;
    injectStyles();
    var packKey = getPackKey(opts || {});
    var questions = questionsForPack(packKey);
    var idx = 0;
    var picked = null;
    var streak = 0;
    var maxStreak = 0;
    var phraseSeed = Math.floor(Math.random() * 50);

    function bannerText() {
      if (packKey === 'trinidad_co') {
        return 'Look closely. Use the picture clues. This round is all about what you notice around Trinidad.';
      }
      return 'Not a test. Every pick shows you what works.';
    }

    function bodyClassFor(q) {
      return q.image_src ? 'ss-body ss-image-first' : 'ss-body';
    }

    function setShellEnergy(shell, tier, settle) {
      if (!shell) return;
      shell.className =
        'ss-game-shell ss-e' +
        tier +
        (settle ? ' ss-settle' : '');
    }

    function render() {
      picked = null;
      if (idx >= questions.length) {
        var streakNote = '';
        if (maxStreak >= 3) {
          streakNote =
            '<p class="ss-done-streak">You hit <strong>' +
            maxStreak +
            '</strong> in a row at your best — nice focus.</p>';
        } else if (maxStreak >= 1) {
          streakNote = '<p class="ss-done-streak">You strung some right answers together. Proud of you.</p>';
        }
        var lead =
          packKey === 'trinidad_co'
            ? 'You paid attention to real places around town. That’s something to be proud of.'
            : 'You just practiced smart middle school moves. Nothing was graded — this was all about learning the flow.';
        var muted =
          packKey === 'trinidad_co'
            ? 'Walk the town again sometime — you’ll spot even more.'
            : 'You can run it again anytime. Same calm vibe.';
        root.innerHTML =
          '<div class="ss-game-shell ss-e0"><div class="ss-card-inner ss-done-card ss-done-glow">' +
          '<div class="ss-done-emoji" aria-hidden="true">✨</div>' +
          '<h2>You did it</h2>' +
          '<p class="ss-done-lead">' +
          esc(lead) +
          '</p>' +
          streakNote +
          '<button type="button" class="ss-next" id="ssPlayAgain">Play again</button>' +
          '<p class="ss-done-muted">' +
          esc(muted) +
          '</p>' +
          '<p style="margin-top:20px;"><a href="explore.html" style="color:#5aa7ff;font-weight:800;font-size:22px;">Back to Explore</a></p></div></div>';
        document.getElementById('ssPlayAgain').addEventListener('click', function () {
          questions = questionsForPack(packKey);
          idx = 0;
          streak = 0;
          maxStreak = 0;
          phraseSeed = Math.floor(Math.random() * 50);
          render();
        });
        return;
      }

      var q = questions[idx];
      var tier = energyTier(streak);
      var html =
        '<div class="ss-game-shell ss-e' +
        tier +
        '" id="ssShell">' +
        '<div class="ss-card-inner">' +
        '<div class="ss-topbar">' +
        streakLine(streak) +
        '<span class="ss-soft">' +
        (idx + 1) +
        ' / ' +
        questions.length +
        '</span></div>' +
        renderHeroHtml(q) +
        '<div class="' +
        bodyClassFor(q) +
        '">' +
        '<p class="ss-banner">' +
        esc(bannerText()) +
        '</p>' +
        '<div class="ss-prompt">' +
        esc(q.prompt) +
        '</div>' +
        '<div class="ss-choices" id="ssChoices" role="group" aria-label="Choices">';
      q.choices.forEach(function (ch, i) {
        html +=
          '<button type="button" class="ss-choice-btn" data-i="' +
          i +
          '">' +
          esc(ch) +
          '</button>';
      });
      html += '</div><div class="ss-teach-wrap" id="ssTeachArea"></div></div></div>';
      root.innerHTML = html;

      var shell = root.querySelector('#ssShell');
      var hero = root.querySelector('.ss-hero');
      var choiceEls = root.querySelectorAll('.ss-choice-btn');
      var teachArea = root.querySelector('#ssTeachArea');

      choiceEls.forEach(function (btn) {
        btn.addEventListener('click', function () {
          if (picked !== null) return;
          picked = parseInt(btn.getAttribute('data-i'), 10);
          var correct = q.correctIndex;
          var right = picked === correct;

          choiceEls.forEach(function (b, j) {
            b.disabled = true;
            if (j === correct) b.classList.add('ss-correct');
            else if (j === picked && j !== correct) b.classList.add('ss-picked-wrong');
          });

          if (right) {
            streak++;
            if (streak > maxStreak) maxStreak = streak;
            burstSparkles(hero, 6, streak);
            setShellEnergy(shell, energyTier(streak), false);
          } else {
            streak = 0;
            setShellEnergy(shell, 0, true);
            setTimeout(function () {
              if (shell && shell.parentNode) setShellEnergy(shell, 0, false);
            }, 700);
          }

          phraseSeed++;
          var headline = right
            ? pickPhrase(PHRASES_OK, phraseSeed)
            : pickPhrase(PHRASES_MISS, phraseSeed + 17);
          var teach =
            '<div class="ss-teach-box">' +
            '<div class="ss-feedback-top ' +
            (right ? 'ok' : 'hmm') +
            '">' +
            esc(headline) +
            '</div>' +
            '<div class="ss-teach-sec"><div class="ss-teach-label">Smart move</div><div class="ss-teach-text">' +
            esc(q.choices[correct]) +
            '</div></div>' +
            '<div class="ss-teach-sec"><div class="ss-teach-label">Why it works</div><div class="ss-teach-text">' +
            esc(q.explanation) +
            '</div></div>' +
            '<div class="ss-teach-sec"><div class="ss-teach-label">' +
            (right ? 'Why the others fall short' : 'Why that pick trips people up') +
            '</div><div class="ss-teach-text">' +
            esc(q.wrongWhy) +
            '</div></div>' +
            '<div class="ss-tip-box"><div class="ss-tip-label">Quick tip</div><div class="ss-tip-text">' +
            esc(q.tip) +
            '</div></div>';
          if (q.extra_note) {
            teach += '<p class="ss-extra">' + esc(q.extra_note) + '</p>';
          }
          teach += '</div>';
          teach +=
            '<button type="button" class="ss-next" id="ssNextBtn">' +
            (idx + 1 >= questions.length ? 'Finish' : 'Next') +
            '</button>';
          teachArea.innerHTML = teach;
          document.getElementById('ssNextBtn').addEventListener('click', function () {
            idx++;
            render();
          });
          try {
            teachArea.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          } catch (e) {}
        });
      });
    }

    render();
  }

  global.LanternSchoolSurvival = {
    QUESTIONS: TMS_SCHOOL_SURVIVAL_QUESTIONS,
    TRINIDAD_CO_PILOT: TRINIDAD_CO_PILOT_QUESTIONS,
    mount: mount,
    normalizeQuestion: normalizeQuestion,
    resolveImageSrc: resolveImageSrc,
    getPackKey: getPackKey,
  };
})(typeof window !== 'undefined' ? window : this);
