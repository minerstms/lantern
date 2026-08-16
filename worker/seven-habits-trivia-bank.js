/**
 * Prompt #239 — original TMS/Lantern 7 Habits Challenge bank.
 * Habit names identify the established framework. All stems, stories,
 * choices, and explanations are original Lantern classroom content.
 */
export const SEVEN_HABITS_NAMES = [
  'Be Proactive',
  'Begin With the End in Mind',
  'Put First Things First',
  'Think Win-Win',
  'Seek First to Understand, Then to Be Understood',
  'Synergize',
  'Sharpen the Saw',
];

export const SEVEN_HABITS_QTYPES = ['recognition', 'application'];

const BP = 'Be Proactive';
const EM = 'Begin With the End in Mind';
const FF = 'Put First Things First';
const WW = 'Think Win-Win';
const SU = 'Seek First to Understand, Then to Be Understood';
const SY = 'Synergize';
const SS = 'Sharpen the Saw';
const R = 'recognition';
const A = 'application';

function q(id, habit, qtype, question, options, correctIndex, explanation) {
  return {
    id,
    category: 'seven_habits',
    habit,
    qtype,
    question,
    options,
    correctIndex,
    explanation,
  };
}

export const SEVEN_HABITS_TRIVIA_BANK = [
  q(
    '7h_bp_r1',
    BP,
    R,
    'Kai knocks over paint in art class. He cannot undo the spill, so he tells the teacher and starts cleaning it up.',
    [BP, FF, SS, 'Wait for someone else to notice'],
    0,
    'This shows Be Proactive because Kai owns the mistake and chooses a useful next step.'
  ),
  q(
    '7h_bp_r2',
    BP,
    R,
    'Friends dare Maya to skip her homework and play online instead. She says no and starts the assignment.',
    [EM, WW, BP, SY],
    2,
    'Be Proactive means choosing your own response instead of just following the group.'
  ),
  q(
    '7h_bp_r3',
    BP,
    R,
    'Which habit is mainly about taking responsibility and focusing on what you can control?',
    [FF, BP, SS, 'Seek First to Understand, Then to Be Understood'],
    1,
    'Be Proactive is about your choices and the parts of a problem you can actually change.'
  ),
  q(
    '7h_bp_r4',
    BP,
    R,
    'Which situation best shows Be Proactive?',
    [
      'Blaming the bus when homework is missing and doing nothing else',
      'Waiting until a parent notices a low grade',
      'Asking a teacher for help the same day a lesson feels confusing',
      'Hoping a group project fixes itself overnight',
    ],
    2,
    'Asking for help is a useful first step a student can choose.'
  ),
  q(
    '7h_bp_r5',
    BP,
    R,
    'Jordan finishes the important homework first, then plays a game. Kai cannot change a canceled practice, so he chooses to review notes instead of staying mad. Which habit is Kai using?',
    [FF, BP, EM, WW],
    1,
    'Kai is choosing his response to something he cannot control. That is Be Proactive, not just doing work early.'
  ),
  q(
    '7h_bp_r6',
    BP,
    R,
    'Priya forgot her book at home. She tells the teacher, borrows a classroom copy, and writes a reminder for tomorrow.',
    [SS, SY, EM, BP],
    3,
    'Priya takes charge of the problem instead of giving up or blaming the morning.'
  ),
  q(
    '7h_bp_a1',
    BP,
    A,
    'Jared is upset because his group’s design failed. He cannot change what already happened, but he can decide what to do next. Which response best shows Be Proactive?',
    [
      'Find someone to blame.',
      'Wait until someone else fixes it.',
      'Look at what failed and choose the next step he can control.',
      'Abandon the project and start something unrelated.',
    ],
    2,
    'Be Proactive means owning the next useful step instead of blaming or freezing.'
  ),
  q(
    '7h_bp_a2',
    BP,
    A,
    'Classmates tell Noor to copy answers so they can all finish faster. What should Noor do if she wants to Be Proactive?',
    [
      'Copy so the group will like her.',
      'Say no, do her own work, and ask the teacher if the time is too short.',
      'Wait to see who gets caught first.',
      'Post the answers in the group chat.',
    ],
    1,
    'She chooses an honest response and takes a useful step about the time problem.'
  ),
  q(
    '7h_bp_a3',
    BP,
    A,
    'Devin sent the wrong file to his group. Which next step best uses Be Proactive?',
    [
      'Hope nobody opens it.',
      'Blame the laptop.',
      'Stay silent so he does not look bad.',
      'Tell the group, send the right file, and ask what else they need.',
    ],
    3,
    'Owning the mistake and fixing it is a proactive choice.'
  ),
  q(
    '7h_bp_a4',
    BP,
    A,
    'Rain cancels outdoor recess. Elena cannot change the weather. Which choice best shows Be Proactive?',
    [
      'Complain until class is over.',
      'Pick a calm indoor activity she can control, like reading or stretching.',
      'Blame the office for the schedule.',
      'Refuse to do anything because the day feels ruined.',
    ],
    1,
    'She focuses on a choice she still has, not on the weather.'
  ),
  q(
    '7h_bp_a5',
    BP,
    A,
    'Sam’s partner is late with a slide. Sam cannot make the partner appear faster. What should Sam do first to Be Proactive?',
    [
      'Draft the missing slide from the notes they already have and message the partner once.',
      'Tell the class the partner ruined everything.',
      'Delete the whole presentation.',
      'Wait in silence until the due time passes.',
    ],
    0,
    'Sam works on what he can control and communicates, instead of only reacting.'
  ),
  q(
    '7h_bp_a6',
    BP,
    A,
    'A player fouls Caleb during a game and Caleb feels angry. Which response best uses Be Proactive?',
    [
      'Foul the other player back.',
      'Quit the game so nobody can bother him.',
      'Yell at the referee until the call changes.',
      'Take a breath, stay in the game, and talk to the coach after if needed.',
    ],
    3,
    'He chooses his response instead of letting anger make the next choice for him.'
  ),

  q(
    '7h_em_r1',
    EM,
    R,
    'Nina decides what she wants her finished project to accomplish before she starts choosing materials.',
    [FF, EM, BP, SS],
    1,
    'Begin With the End in Mind means picturing the result before you start the work.'
  ),
  q(
    '7h_em_r2',
    EM,
    R,
    'Mateo wants a bike later this year. He writes that goal and skips extra snacks so he can save.',
    [WW, SS, EM, 'Put First Things First'],
    2,
    'He is making today’s choices match a result he wants later.'
  ),
  q(
    '7h_em_r3',
    EM,
    R,
    'Which habit is mainly about deciding what success should look like before you begin?',
    [EM, FF, SY, BP],
    0,
    'Begin With the End in Mind starts with the goal, not with the first busy task.'
  ),
  q(
    '7h_em_r4',
    EM,
    R,
    'Which situation best shows Begin With the End in Mind?',
    [
      'Harper opens every craft bin and hopes a project appears.',
      'Omar writes the point of his speech before he picks slides.',
      'Riley answers messages until she feels ready to study.',
      'Quinn starts building before the group agrees what they are making.',
    ],
    1,
    'Omar decides the purpose first, then chooses tools that support it.'
  ),
  q(
    '7h_em_r5',
    EM,
    R,
    'Lila has a quiz tomorrow and a messy locker. She studies first because the quiz is more important right now. Theo sketches what a strong science-fair board should teach visitors before he prints photos. Which habit is Theo using?',
    [FF, BP, EM, WW],
    2,
    'Theo is defining the result. Lila is ranking today’s tasks, which is a different habit.'
  ),
  q(
    '7h_em_r6',
    EM,
    R,
    'Aisha lists what a good club poster should make people do: sign up by Friday. Then she starts the design.',
    [SY, SS, FF, EM],
    3,
    'She names the desired result before she starts decorating.'
  ),
  q(
    '7h_em_a1',
    EM,
    A,
    'The drama club needs a poster. Some students want cool drawings first. What should happen first if they Begin With the End in Mind?',
    [
      'Agree what the poster should make people do, then choose art that supports that.',
      'Print the first funny sketch they like.',
      'Use last year’s poster without a goal.',
      'Argue about colors until time runs out.',
    ],
    0,
    'The end in mind is the action they want, not the first decoration.'
  ),
  q(
    '7h_em_a2',
    EM,
    A,
    'Nia has money from chores. She wants concert tickets next month. Which choice best supports that end?',
    [
      'Spend it all on snacks today because later is far away.',
      'Lend it all to a friend with no plan to get it back.',
      'Set aside the ticket amount first, then decide what is left.',
      'Buy a new game and hope the tickets get cheaper.',
    ],
    2,
    'She protects the future result before spending on extras.'
  ),
  q(
    '7h_em_a3',
    EM,
    A,
    'Felix’s science-fair group has lots of supplies. What should they decide first?',
    [
      'Who gets the fanciest title on the board.',
      'What a visitor should understand after 30 seconds at their booth.',
      'How many stickers they can fit on the edges.',
      'Whether to start gluing before they have a question.',
    ],
    1,
    'The end in mind is what people should learn, not how busy the board looks.'
  ),
  q(
    '7h_em_a4',
    EM,
    A,
    'Sage wants to try out for the school play. Which weekend choice best fits that goal?',
    [
      'Skip the lines and only watch videos of other plays.',
      'Stay up late gaming both nights and hope tryouts feel easy.',
      'Quit the idea if the first page of the script looks hard.',
      'Practice the required lines and rest the night before tryouts.',
    ],
    3,
    'The choices match the result she wants: being ready to try out.'
  ),
  q(
    '7h_em_a5',
    EM,
    A,
    'Ivy, Ben, and Zara are making a short video for class. They keep filming random jokes. What would help most?',
    [
      'Agree on the last scene and the point of the video, then film shots that lead there.',
      'Film until the battery dies and edit later with no plan.',
      'Let each person make a separate video and turn in all three.',
      'Add more jokes until the teacher’s time limit is gone.',
    ],
    0,
    'A shared ending gives the group a target for every shot.'
  ),
  q(
    '7h_em_a6',
    EM,
    A,
    'Cole can pick one elective: coding, art, or study hall. He thinks he may want a tech club next year. Which choice best uses Begin With the End in Mind?',
    [
      'Pick study hall because it feels easiest today.',
      'Pick art only because a friend did, with no other reason.',
      'Pick coding because it supports the later club goal, unless he has a stronger reason for another class.',
      'Avoid choosing and ask to switch every week.',
    ],
    2,
    'He lets a real future goal help him choose, instead of only what feels easy today.'
  ),

  q(
    '7h_ff_r1',
    FF,
    R,
    'Which habit is mainly about deciding what matters most and taking care of important things before less-important things?',
    [BP, EM, FF, SS],
    2,
    'Put First Things First is about priorities and protecting time for what matters most.'
  ),
  q(
    '7h_ff_r2',
    FF,
    R,
    'Amara has a quiz in the morning. She studies, then plays a game. Which habit is she using?',
    [FF, WW, SY, 'Sharpen the Saw'],
    0,
    'She puts the important deadline ahead of the extra activity.'
  ),
  q(
    '7h_ff_r3',
    FF,
    R,
    'Wes finishes the essay due tomorrow before he organizes his locker for fun.',
    [EM, SS, BP, FF],
    3,
    'The deadline work comes before a less urgent tidy-up.'
  ),
  q(
    '7h_ff_r4',
    FF,
    R,
    'Which situation best shows Put First Things First?',
    [
      'Tessa scrolls until she feels like starting a project due tonight.',
      'Diego practices his presentation, then replies to friends.',
      'June buys supplies before she knows the assignment.',
      'Malik starts five hobbies in one night and finishes none.',
    ],
    1,
    'Diego protects time for the important task, then enjoys the rest.'
  ),
  q(
    '7h_ff_r5',
    FF,
    R,
    'Nora cannot change a delayed bus, so she uses the wait to read. Ash has two tasks: a form due today and a poster due next week. Ash does the form first. Which habit is Ash using?',
    [BP, FF, EM, WW],
    1,
    'Ash is ranking tasks by importance and deadline. Nora is choosing her response to a delay.'
  ),
  q(
    '7h_ff_r6',
    FF,
    R,
    'Pia turns off notifications while she finishes lab notes that are due after lunch.',
    [SY, SU, FF, SS],
    2,
    'She protects time for the important work instead of letting pings come first.'
  ),
  q(
    '7h_ff_a1',
    FF,
    A,
    'Ava has two things to do tonight: prepare for tomorrow’s presentation and answer a friend’s message. Both matter to her. Which choice best shows Put First Things First?',
    [
      'Decide which has the real deadline, prepare for the presentation, then reply.',
      'Ignore her friend for the rest of the week.',
      'Answer messages until she feels ready to work.',
      'Skip the presentation preparation because friendships matter too.',
    ],
    0,
    'The important deadline comes first. She can still be a good friend after that.'
  ),
  q(
    '7h_ff_a2',
    FF,
    A,
    'Tryouts are tomorrow. Leo also wants extra game time. What should happen first?',
    [
      'Play until he is too tired to practice.',
      'Skip tryouts because games are more fun.',
      'Practice the needed skills, then use leftover time to play.',
      'Do neither and hope he is ready.',
    ],
    2,
    'Preparation for the deadline comes before extra play, and play can still happen later.'
  ),
  q(
    '7h_ff_a3',
    FF,
    A,
    'Carmen promised to finish dishes after dinner. A new video just dropped. Which choice best uses Put First Things First?',
    [
      'Watch the whole series and do dishes at midnight.',
      'Do the dishes, then watch the video.',
      'Leave the dishes for a sibling without asking.',
      'Start the video and pause only if someone yells.',
    ],
    1,
    'The promised chore is the important task. The video can wait a short time.'
  ),
  q(
    '7h_ff_a4',
    FF,
    A,
    'Nate has math due tonight and a book report due in two weeks. He also wants to organize game stickers. What should he do first?',
    [
      'Organize stickers because they are more fun.',
      'Start the book report only, since it is a bigger project.',
      'Do a little of everything for five minutes and stop.',
      'Finish tonight’s math, then plan a later time for the book report.',
    ],
    3,
    'The closest important deadline comes first. The later project still gets a plan.'
  ),
  q(
    '7h_ff_a5',
    FF,
    A,
    'Skye finished her study block. Friends invite her to a short game. Which choice still fits Put First Things First?',
    [
      'Play for a while, because the important work is already done.',
      'Never play again this year, because fun wastes time.',
      'Start another huge project at 11 p.m. just to stay busy.',
      'Cancel sleep so she can study even more.',
    ],
    0,
    'This habit is about order, not about never having fun.'
  ),
  q(
    '7h_ff_a6',
    FF,
    A,
    'Hugo’s club meeting starts in 20 minutes and he still needs to print his notes. His chat keeps buzzing. What would help most?',
    [
      'Answer every chat first so people do not wait.',
      'Mute the chat, print the notes, then reply after the meeting.',
      'Skip the meeting because the chat feels urgent.',
      'Show up with no notes and scroll during the meeting.',
    ],
    1,
    'The meeting prep is the important timed task. Messages can wait a little.'
  ),

  q(
    '7h_ww_r1',
    WW,
    R,
    'Jimmy and Marcus both need the same piece of equipment. Jimmy suggests a schedule that gives both students enough time to finish their work. Which habit is Jimmy using?',
    [BP, WW, SS, FF],
    1,
    'This shows Think Win-Win because Jimmy looks for a solution that works for both people.'
  ),
  q(
    '7h_ww_r2',
    WW,
    R,
    'Which habit is mainly about looking for a fair result where both sides can gain?',
    [SY, SU, WW, EM],
    2,
    'Think Win-Win is about mutual benefit, not about beating the other person.'
  ),
  q(
    '7h_ww_r3',
    WW,
    R,
    'Dana and Remy both need the classroom markers. Dana offers to share colors and take turns with the rare ones.',
    [FF, BP, SS, WW],
    3,
    'She looks for a way both students can finish, not a way to keep every marker.'
  ),
  q(
    '7h_ww_r4',
    WW,
    R,
    'Which situation best shows Think Win-Win?',
    [
      'One student hides the good scissors so nobody else can use them.',
      'Two students agree that one uses the computer for research while the other types, then they switch.',
      'A student says the only fair deal is that nobody gets the computer.',
      'A captain benches a teammate so the captain can take every shot.',
    ],
    1,
    'Both students get what they need by taking turns with a limited tool.'
  ),
  q(
    '7h_ww_r5',
    WW,
    R,
    'Two groups want the same lunch table. One group offers to share the table and split the seats. Another pair mixes their poster ideas into one stronger design. Which habit is the lunch-table group using?',
    [SY, WW, SU, FF],
    1,
    'Sharing the table is a fair deal for both groups. Mixing ideas into something stronger is Synergize.'
  ),
  q(
    '7h_ww_r6',
    WW,
    R,
    'A rumor starts after a disagreement. Instead of “winning” the argument, Junie asks what the other student needs and looks for a deal both can accept.',
    [WW, SU, BP, SS],
    0,
    'Junie is aiming for a result that works for both people, not only for herself.'
  ),
  q(
    '7h_ww_a1',
    WW,
    A,
    'Two students need the only working classroom computer before class ends. What should they do to Think Win-Win?',
    [
      'The faster typer keeps it the whole time.',
      'Neither uses it so it stays “fair.”',
      'They split the time so each person can finish the required part.',
      'They argue until the bell rings.',
    ],
    2,
    'Both people get enough time. Win-Win is not the same as nobody getting a turn.'
  ),
  q(
    '7h_ww_a2',
    WW,
    A,
    'In soccer, two friends both want to take the last shot in practice. Which plan best uses Think Win-Win?',
    [
      'One friend takes every last shot this week.',
      'They alternate last shots and help each other warm up.',
      'They refuse to practice if they cannot both shoot at once.',
      'They ask the coach to cancel practice.',
    ],
    1,
    'Both get a real chance, and they still help each other.'
  ),
  q(
    '7h_ww_a3',
    WW,
    A,
    'There are four cookies and two students. One student cannot eat nuts, and two cookies have nuts. What is the best Win-Win choice?',
    [
      'Split every cookie in half, including the nut cookies.',
      'Give both nut cookies to the student who can eat them and the safe cookies to the other student.',
      'Throw all the cookies away so nobody wins.',
      'Let one student take all four.',
    ],
    1,
    'Win-Win is a fair result that fits both needs. It is not always a 50/50 split.'
  ),
  q(
    '7h_ww_a4',
    WW,
    A,
    'Ava and Ben are in the same history contest. Which choice best shows Think Win-Win?',
    [
      'Hide the study notes so the other person does worse.',
      'Quiz each other so both are more ready, even though only one trophy exists.',
      'Skip the contest unless they can both get first place.',
      'Copy the other person’s script.',
    ],
    1,
    'They can both gain skill and confidence. Winning a trophy is not the only kind of win.'
  ),
  q(
    '7h_ww_a5',
    WW,
    A,
    'Siblings both want the TV at 7:00. One has a show; the other has a recorded game. What should they try first?',
    [
      'Whoever grabs the remote first wins.',
      'Watch neither show to punish each other.',
      'Pick one night for the show and one night for the game, or watch one now and save the other.',
      'Turn the volume up so the other person leaves.',
    ],
    2,
    'A schedule or a saved show can give both people a real win.'
  ),
  q(
    '7h_ww_a6',
    WW,
    A,
    'In a group grade, one student wants to do every slide “to keep the grade safe.” What mistake is the group making if they let that happen?',
    [
      'They are being too fair.',
      'They are looking for a result where only one person wins control.',
      'They are combining different strengths.',
      'They are putting first things first.',
    ],
    1,
    'One person doing everything is not Win-Win. Others lose practice, and the group loses shared ownership.'
  ),

  q(
    '7h_su_r1',
    SU,
    R,
    'Riley is upset. Sam lets Riley finish the whole story and then asks a question before giving advice.',
    [WW, SY, SU, BP],
    2,
    'Sam listens first. That is Seek First to Understand, Then to Be Understood.'
  ),
  q(
    '7h_su_r2',
    SU,
    R,
    'Which habit is mainly about listening and checking you understand before you explain your own side?',
    [SU, WW, FF, EM],
    0,
    'The habit name itself says understand first, then be understood.'
  ),
  q(
    '7h_su_r3',
    SU,
    R,
    'A teacher writes “add evidence” on Tessa’s paper. Tessa asks what kind of evidence the teacher wants before she rewrites.',
    [BP, SU, SS, SY],
    1,
    'She checks the meaning of the feedback before she argues or guesses.'
  ),
  q(
    '7h_su_r4',
    SU,
    R,
    'Which situation best shows Seek First to Understand, Then to Be Understood?',
    [
      'Interrupting a friend to prove you are right',
      'Repeating a rumor because it sounds exciting',
      'Asking, “Did you mean I missed a step, or that the answer is wrong?”',
      'Agreeing with every idea so nobody feels sad',
    ],
    2,
    'A clarifying question shows you want the real meaning first.'
  ),
  q(
    '7h_su_r5',
    SU,
    R,
    'Two students want the same calculator. One offers a time split. The other student first asks why the classmate needs it right now. Which habit is the student who asks using?',
    [WW, SU, SY, FF],
    1,
    'Asking why comes first. A fair split can come after you understand the need.'
  ),
  q(
    '7h_su_r6',
    SU,
    R,
    'A chat message says Diego “ruined the project.” Before Diego replies in anger, he asks the sender what part went wrong.',
    [SS, EM, BP, SU],
    3,
    'He checks the real problem before he defends himself.'
  ),
  q(
    '7h_su_a1',
    SU,
    A,
    'Two friends argue because one joke felt mean. What should happen first?',
    [
      'The jokester should explain why the joke was funny.',
      'They should stop being friends at once.',
      'The jokester should ask how it landed, then share the intended meaning.',
      'They should post the joke so others can vote.',
    ],
    2,
    'Understand the hurt first. Then it is fair to explain what you meant.'
  ),
  q(
    '7h_su_a2',
    SU,
    A,
    'A teacher’s comment feels harsh to June. Which response best uses this habit?',
    [
      'Ask what the comment is asking her to change, then share if a part still feels unclear.',
      'Crumple the paper and say the teacher is unfair.',
      'Agree with every word even if she does not understand it.',
      'Ignore the comment and turn the paper back in.',
    ],
    0,
    'She seeks the meaning first, then she can be understood about what is still confusing.'
  ),
  q(
    '7h_su_a3',
    SU,
    A,
    'Malik looks quiet after group work. What should a teammate do first?',
    [
      'Tell Malik to cheer up.',
      'Ask Malik what is going on and listen to the answer.',
      'Talk about Malik with other students.',
      'Give Malik extra jobs without asking.',
    ],
    1,
    'A real question and real listening come before advice or extra work.'
  ),
  q(
    '7h_su_a4',
    SU,
    A,
    'Nora gets a short online message that looks rude. What is the strongest next step?',
    [
      'Send a rude message back right away.',
      'Share a screenshot with the whole class.',
      'Assume the worst and block every friend.',
      'Ask what the person meant, then explain how the message read to her.',
    ],
    3,
    'She checks the meaning before she answers as if she already knows it.'
  ),
  q(
    '7h_su_a5',
    SU,
    A,
    'Two friends tell Ash different stories about the same lunch argument. What should Ash do?',
    [
      'Pick a side from the first story and repeat it.',
      'Ask each person what they saw, then share Ash’s own view if needed.',
      'Add a new rumor to make the story bigger.',
      'Ignore both friends forever.',
    ],
    1,
    'Understanding both views comes before choosing a side or spreading a story.'
  ),
  q(
    '7h_su_a6',
    SU,
    A,
    'After listening, Pia still disagrees with her partner’s plan. What should she do?',
    [
      'Pretend to agree so the habit is “done.”',
      'Stay silent and later change the work alone.',
      'Say what she understood, then calmly explain her own idea.',
      'Talk louder until the partner stops.',
    ],
    2,
    'This habit is not “always agree.” After you understand, you still get to be understood.'
  ),

  q(
    '7h_sy_r1',
    SY,
    R,
    'Which habit is mainly about combining different strengths so the result is stronger than one person alone?',
    [WW, SY, FF, SS],
    1,
    'Synergize is more than sitting in a group. The mix should make better work.'
  ),
  q(
    '7h_sy_r2',
    SY,
    R,
    'Leo draws well. Carmen writes clear captions. They build one poster that is clearer than either idea alone.',
    [SY, WW, EM, BP],
    0,
    'Different strengths together made a stronger poster.'
  ),
  q(
    '7h_sy_r3',
    SY,
    R,
    'A group tests two science ideas and keeps the best parts of each.',
    [FF, SU, SY, SS],
    2,
    'They combine ideas instead of picking only one person’s plan.'
  ),
  q(
    '7h_sy_r4',
    SY,
    R,
    'Which situation best shows Synergize?',
    [
      'Four students sit together and each copies the same sentence.',
      'One student does all the work while others watch.',
      'Students argue until the quietest person gives up.',
      'One student builds the model, one times the trials, and one records results, then they improve the design together.',
    ],
    3,
    'Roles plus shared improvement make a stronger result than any one job alone.'
  ),
  q(
    '7h_sy_r5',
    SY,
    R,
    'Two students split computer time so both can finish. Two other students blend a joke script and a serious fact list into one better video. Which pair is using Synergize?',
    [WW, SY, FF, SU],
    1,
    'The video pair combines ideas into something stronger. The computer split is Think Win-Win.'
  ),
  q(
    '7h_sy_r6',
    SY,
    R,
    'A team sits at one table but each person works on a separate poster and never shares. Is that Synergize?',
    [
      'Yes, because they are in a group.',
      'Yes, because the table is shared.',
      'No. Synergize needs the combination to make the work stronger.',
      'Yes, if they are quiet.',
    ],
    2,
    'Being near other people is not enough. The ideas have to work together.'
  ),
  q(
    '7h_sy_a1',
    SY,
    A,
    'For a STEM build, Nate is careful with measurements and Skye is fast at cutting pieces. What should the group do?',
    [
      'Let only Nate work so nothing is wrong.',
      'Let only Skye work so it goes fast.',
      'Have Nate measure and Skye cut, then check the fit together.',
      'Make both do the same step twice.',
    ],
    2,
    'Different strengths, used together, can be both careful and quick.'
  ),
  q(
    '7h_sy_a2',
    SY,
    A,
    'Hugo likes a loud cheer. Dana likes a clear spoken line. Their club needs one opening. What would help most?',
    [
      'Pick only the cheer and drop Dana’s idea.',
      'Use a short cheer, then Dana’s line, and test it with the group.',
      'Do two openings at the same time so nobody hears either.',
      'Skip the opening to avoid choosing.',
    ],
    1,
    'They keep the useful part of each idea and test the mix.'
  ),
  q(
    '7h_sy_a3',
    SY,
    A,
    'A quiet student has a useful idea, but louder students keep talking. What should the group do to Synergize?',
    [
      'Pause, hear the quiet idea, and see how it can improve the plan.',
      'Keep talking because loud ideas must be better.',
      'Vote without listening.',
      'Ask the quiet student to write notes only.',
    ],
    0,
    'A missed idea cannot make the group result stronger.'
  ),
  q(
    '7h_sy_a4',
    SY,
    A,
    'In basketball, one player is a strong passer and another is a strong shooter. What is the best team choice?',
    [
      'The passer should also take every shot.',
      'The shooter should never pass.',
      'They should run a play that uses the pass and the shot together.',
      'They should take turns ignoring each other.',
    ],
    2,
    'The combination is stronger than either skill used alone.'
  ),
  q(
    '7h_sy_a5',
    SY,
    A,
    'For a fundraiser, one student can bake, one can make signs, and one can talk to people. What should they do?',
    [
      'All three bake, because food is the only useful job.',
      'Let one student do every job “to keep it simple.”',
      'Assign jobs by strength and check that the sale plan fits together.',
      'Work on three separate fundraisers in the same hour.',
    ],
    2,
    'Different jobs plus one shared plan is synergy, not three lonely projects.'
  ),
  q(
    '7h_sy_a6',
    SY,
    A,
    'A group’s first draft is weak. Everyone wrote the same introduction. What mistake are they making?',
    [
      'They used too many different strengths.',
      'They combined too many new ideas.',
      'They listened too carefully.',
      'They repeated one idea instead of using different strengths to improve it.',
    ],
    3,
    'Copying the same start is group work without synergy.'
  ),

  q(
    '7h_ss_r1',
    SS,
    R,
    'Which habit is mainly about rest, learning, hobbies, and healthy routines so you can return ready to do good work?',
    [FF, BP, SS, EM],
    2,
    'Sharpen the Saw is renewal. It is not the same as quitting when work feels hard.'
  ),
  q(
    '7h_ss_r2',
    SS,
    R,
    'After a long study block, Nia takes a short walk and drinks water, then comes back to finish two problems.',
    [SS, FF, SY, WW],
    0,
    'The break helps her return ready. She does not drop the work.'
  ),
  q(
    '7h_ss_r3',
    SS,
    R,
    'Theo goes to bed on time the night before a test instead of gaming until midnight.',
    [EM, SS, BP, SU],
    1,
    'Sleep is a way to take care of his body and mind before important work.'
  ),
  q(
    '7h_ss_r4',
    SS,
    R,
    'Which situation best shows Sharpen the Saw?',
    [
      'Quitting a project the first time it feels hard',
      'Skipping every practice to stay comfortable',
      'Playing guitar for fun after homework, then sleeping on time',
      'Staying up to redo easy work that is already finished',
    ],
    2,
    'A hobby plus rest can renew a person. Quitting is not the same thing.'
  ),
  q(
    '7h_ss_r5',
    SS,
    R,
    'Remy is tired and keeps missing easy math steps. A friend says, “Just push through all night.” Another friend says, “Take a 10-minute stretch, then try five more problems.” Which advice fits Sharpen the Saw?',
    [
      'Push through all night with no break',
      'Take a short reset, then return to the work',
      'Delete the assignment',
      'Copy a friend’s paper so you can sleep',
    ],
    1,
    'A short reset can help you return ready. All-night grinding is not the only brave choice.'
  ),
  q(
    '7h_ss_r6',
    SS,
    R,
    'June spends Saturday morning at the library learning a new drawing skill, then meets a friend at the park.',
    [WW, FF, EM, SS],
    3,
    'Learning and time with a friend are both ways to grow and recharge.'
  ),
  q(
    '7h_ss_a1',
    SS,
    A,
    'Wes gamed late and now feels foggy before school. What should he do tonight if he wants to Sharpen the Saw?',
    [
      'Game even later to “make up” the fun.',
      'Skip dinner and study standing up all night.',
      'Set a bedtime, finish the must-do homework earlier, and save extra games for the weekend.',
      'Quit the class so mornings feel easier.',
    ],
    2,
    'Sleep and a better schedule help him return ready. Quitting class is not renewal.'
  ),
  q(
    '7h_ss_a2',
    SS,
    A,
    'Zara is frustrated after a hard essay paragraph. Which choice best uses Sharpen the Saw?',
    [
      'Take a short stretch or snack, then write the next paragraph.',
      'Throw the essay away and tell herself she is done forever.',
      'Scroll for an hour and never return.',
      'Rewrite the same sentence 40 times without a break.',
    ],
    0,
    'A short reset is useful when she comes back to the work.'
  ),
  q(
    '7h_ss_a3',
    SS,
    A,
    'Omar does homework, chores, and club work every day and has not talked with friends in two weeks. He feels worn out. What could improve this?',
    [
      'Add more tasks so he feels busier.',
      'Drop every responsibility tomorrow and never return.',
      'Keep the same pace until he gets sick.',
      'Keep his important work, and also plan a short visit or call with a friend.',
    ],
    3,
    'Relationships can renew a person. The habit is balance, not disappearing from work.'
  ),
  q(
    '7h_ss_a4',
    SS,
    A,
    'Priya wants to grow, not only rest. Which choice best fits Sharpen the Saw?',
    [
      'Only sleep and never learn anything new.',
      'Spend 20 minutes learning a skill she enjoys, then rest.',
      'Read until she cannot keep her eyes open.',
      'Copy someone else’s hobby list without trying anything.',
    ],
    1,
    'Learning a little and resting a little both sharpen the saw.'
  ),
  q(
    '7h_ss_a5',
    SS,
    A,
    'After sitting through classes, Kai feels restless and snappy. What would help most?',
    [
      'A short outdoor walk or stretch, then return to homework.',
      'Another hour of sitting with three screens.',
      'Skipping homework for the rest of the week.',
      'Drinking an energy drink and staying up later.',
    ],
    0,
    'Movement can reset his body. It should help him come back, not replace every job.'
  ),
  q(
    '7h_ss_a6',
    SS,
    A,
    'A group project is hard, and Harper wants to quit. A classmate says Sharpen the Saw means stopping whenever work feels hard. What is the better way to handle this?',
    [
      'Quit the group so she can feel comfortable.',
      'Work with no breaks until she cries.',
      'Take a short healthy break, ask for help, and return to her part.',
      'Let the group fail so she can rest all month.',
    ],
    2,
    'Renewal helps a person return ready. It is not a reason to abandon the work.'
  ),
];

const PLACEHOLDER_RE = /\bTODO\b|\bTBD\b|\.\.\./i;

export function validateSevenHabitsBank(bank = SEVEN_HABITS_TRIVIA_BANK) {
  const errors = [];
  if (!Array.isArray(bank) || bank.length !== 84) {
    errors.push('expected exactly 84 questions, got ' + (bank && bank.length));
  }
  const ids = new Set();
  const stems = new Set();
  const habitCounts = Object.create(null);
  SEVEN_HABITS_NAMES.forEach((h) => {
    habitCounts[h] = { recognition: 0, application: 0 };
  });
  (bank || []).forEach((item, i) => {
    if (!item || typeof item !== 'object') {
      errors.push('blank item at ' + i);
      return;
    }
    if (!item.id || typeof item.id !== 'string' || !String(item.id).trim()) {
      errors.push('missing id at ' + i);
    } else if (ids.has(item.id)) {
      errors.push('duplicate id ' + item.id);
    } else {
      ids.add(item.id);
    }
    const stem = String(item.question || '').trim();
    if (!stem) errors.push('blank question ' + item.id);
    else if (stems.has(stem)) errors.push('duplicate question text ' + item.id);
    else stems.add(stem);
    if (PLACEHOLDER_RE.test(stem) || PLACEHOLDER_RE.test(JSON.stringify(item))) {
      errors.push('placeholder text in ' + item.id);
    }
    if (!SEVEN_HABITS_NAMES.includes(item.habit)) errors.push('invalid habit on ' + item.id);
    if (!SEVEN_HABITS_QTYPES.includes(item.qtype)) errors.push('invalid qtype on ' + item.id);
    if (!Array.isArray(item.options) || item.options.length !== 4) {
      errors.push('need 4 options on ' + item.id);
    } else {
      item.options.forEach((opt, oi) => {
        if (!String(opt || '').trim()) errors.push('blank choice ' + item.id + ' #' + oi);
        if (PLACEHOLDER_RE.test(String(opt || ''))) errors.push('placeholder choice ' + item.id);
      });
    }
    if (!Number.isInteger(item.correctIndex) || item.correctIndex < 0 || item.correctIndex > 3) {
      errors.push('bad correctIndex on ' + item.id);
    }
    if (!String(item.explanation || '').trim()) errors.push('missing explanation on ' + item.id);
    if (habitCounts[item.habit] && SEVEN_HABITS_QTYPES.includes(item.qtype)) {
      habitCounts[item.habit][item.qtype] += 1;
    }
  });
  let recTotal = 0;
  let appTotal = 0;
  SEVEN_HABITS_NAMES.forEach((h) => {
    const rec = habitCounts[h].recognition;
    const app = habitCounts[h].application;
    recTotal += rec;
    appTotal += app;
    if (rec !== 6) errors.push(h + ' recognition count ' + rec);
    if (app !== 6) errors.push(h + ' application count ' + app);
    if (rec + app !== 12) errors.push(h + ' total ' + (rec + app));
  });
  if (recTotal !== 42) errors.push('recognition total ' + recTotal);
  if (appTotal !== 42) errors.push('application total ' + appTotal);
  return { ok: errors.length === 0, errors, habitCounts, recTotal, appTotal };
}
