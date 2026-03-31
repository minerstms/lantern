/**
 * Lantern — Game content for culture/community games.
 * Structure supports expansion: add questions by appending to arrays.
 * Categories: handbook (expectations, digital citizenship), local_history (Trinidad/school/community).
 * Format: { id, category, question, options: string[], correctIndex: number, explanation?: string }
 */
(function (global) {
  var HANDBOOK_TRIVIA = [
    { id: 'hb1', category: 'handbook', question: 'What should you do if you see something online that makes you uncomfortable?', options: ['Ignore it', 'Tell a trusted adult', 'Share it with everyone', 'Delete your account'], correctIndex: 1, explanation: 'Talking to a trusted adult keeps you safe and helps you know what to do next.' },
    { id: 'hb2', category: 'handbook', question: 'Which is an example of good digital citizenship?', options: ['Posting mean comments', 'Asking before sharing someone else\'s photo', 'Using someone else\'s password', 'Spreading rumors'], correctIndex: 1, explanation: 'Respecting others\' privacy and asking permission shows good digital citizenship.' },
    { id: 'hb3', category: 'handbook', question: 'When is it okay to use school devices?', options: ['Only for games', 'For schoolwork and approved activities', 'Whenever you want', 'Never'], correctIndex: 1, explanation: 'School devices are for learning and approved use according to school expectations.' },
    { id: 'hb4', category: 'handbook', question: 'What does "BE KIND" mean in our school expectations?', options: ['Only in person', 'Online and in person', 'Only when someone is watching', 'Only to friends'], correctIndex: 1, explanation: 'We are kind everywhere — in the classroom, in the hallways, and online.' },
    { id: 'hb5', category: 'handbook', question: 'Who should you go to if you need to report something that isn\'t safe?', options: ['Only friends', 'A trusted adult or Safe2Tell', 'Nobody', 'Post it online'], correctIndex: 1, explanation: 'Trusted adults and Safe2Tell are there to help when something isn\'t safe.' },
    { id: 'hb6', category: 'handbook', question: 'Your password should be:', options: ['Shared with friends', 'Easy to guess', 'Kept private and strong', 'The same for everything'], correctIndex: 2, explanation: 'Keeping passwords private and using strong ones helps protect your accounts.' },
    { id: 'hb7', category: 'handbook', question: 'If someone is being mean to you online, you should:', options: ['Be mean back', 'Block, save evidence, and tell an adult', 'Delete everything', 'Keep it a secret'], correctIndex: 1, explanation: 'Block the person, save evidence, and tell a trusted adult so they can help.' },
    { id: 'hb8', category: 'handbook', question: 'What is positive behavior at school?', options: ['Talking during instructions', 'Following directions and respecting others', 'Leaving class without asking', 'Ignoring the teacher'], correctIndex: 1, explanation: 'Following directions and respecting others helps everyone learn and feel safe.' },
    { id: 'hb9', category: 'handbook', question: 'When you work in a group, you should:', options: ['Do everything yourself', 'Listen and contribute fairly', 'Let others do all the work', 'Only talk about off-topic things'], correctIndex: 1, explanation: 'Good teamwork means listening to others and contributing your ideas.' },
    { id: 'hb10', category: 'handbook', question: 'Digital citizenship includes:', options: ['Only playing games', 'Being responsible, respectful, and safe online', 'Using as many apps as possible', 'Never going online'], correctIndex: 1, explanation: 'Being responsible, respectful, and safe online is what digital citizenship is about.' },
  ];

  var LOCAL_HISTORY_TRIVIA = [
    { id: 'lh1', category: 'local_history', question: 'Trinidad, Colorado is in which county?', options: ['Pueblo County', 'Las Animas County', 'El Paso County', 'Douglas County'], correctIndex: 1, explanation: 'Trinidad is the county seat of Las Animas County.' },
    { id: 'lh2', category: 'local_history', question: 'What river runs near Trinidad?', options: ['Arkansas River', 'Rio Grande', 'Purgatoire River', 'Colorado River'], correctIndex: 2, explanation: 'The Purgatoire River flows through the Trinidad area.' },
    { id: 'lh3', category: 'local_history', question: 'Why is community pride important at school?', options: ['It doesn\'t matter', 'It helps us care for our place and each other', 'Only for adults', 'Only on special days'], correctIndex: 1, explanation: 'Caring for our community and each other makes school and town better for everyone.' },
    { id: 'lh4', category: 'local_history', question: 'What can we do to show school pride?', options: ['Ignore school events', 'Participate, be respectful, and support others', 'Only show up for games', 'Complain about everything'], correctIndex: 1, explanation: 'Participating and supporting others shows pride in our school.' },
    { id: 'lh5', category: 'local_history', question: 'Our school is part of our community. That means:', options: ['We have nothing to do with the town', 'We can help make our community stronger', 'Only teachers matter', 'Community doesn\'t affect us'], correctIndex: 1, explanation: 'Students and schools can help make the community stronger together.' },
    { id: 'lh6', category: 'local_history', question: 'Which is a way to learn about local history?', options: ['Only from the internet', 'Visiting local museums, reading, and asking elders', 'Ignoring it', 'Only in class'], correctIndex: 1, explanation: 'Museums, books, and talking to people who know the area teach us local history.' },
    { id: 'lh7', category: 'local_history', question: 'Being a good community member includes:', options: ['Only looking out for yourself', 'Helping others and following shared rules', 'Staying home only', 'Ignoring neighbors'], correctIndex: 1, explanation: 'Helping others and following shared rules makes our community better.' },
    { id: 'lh8', category: 'local_history', question: 'Why do schools teach about local history?', options: ['To fill time', 'So we understand and value where we live', 'Only for tests', 'They don\'t'], correctIndex: 1, explanation: 'Understanding where we live helps us value and care for our community.' },
    { id: 'lh9', category: 'local_history', question: 'What makes a school a good place to learn?', options: ['Only the building', 'Safe, respectful students and staff working together', 'No rules', 'Only grades'], correctIndex: 1, explanation: 'When everyone works together with respect, school is a better place to learn.' },
    { id: 'lh10', category: 'local_history', question: 'How can you contribute to your school community?', options: ['By doing nothing', 'By joining activities, helping others, and being respectful', 'Only by winning', 'Only online'], correctIndex: 1, explanation: 'Joining in, helping others, and being respectful are ways to contribute.' },
  ];

  /** Game categories for future expansion (Identity, Handbook, Local History, Safety, Leadership). */
  var GAME_CATEGORIES = {
    identity: { id: 'identity', label: 'Identity Games', description: 'Avatar match, name recognition, teacher/club recognition' },
    handbook: { id: 'handbook', label: 'Handbook / Expectations', description: 'Behavior expectations, digital citizenship, scenario choices' },
    local_history: { id: 'local_history', label: 'Local History / Community', description: 'Trinidad and school history, community pride' },
    safety: { id: 'safety', label: 'Safety / Support Awareness', description: 'Safe2Tell awareness, trusted adults, support resources' },
    leadership: { id: 'leadership', label: 'Leadership / 7 Habits', description: 'Habit recognition, scenario matching, better choices' },
  };

  function getHandbookQuestions() { return HANDBOOK_TRIVIA.slice(); }
  function getLocalHistoryQuestions() { return LOCAL_HISTORY_TRIVIA.slice(); }
  function getCategories() { return GAME_CATEGORIES; }

  function shuffleArray(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  global.LANTERN_GAME_CONTENT = {
    HANDBOOK_TRIVIA: HANDBOOK_TRIVIA,
    LOCAL_HISTORY_TRIVIA: LOCAL_HISTORY_TRIVIA,
    GAME_CATEGORIES: GAME_CATEGORIES,
    getHandbookQuestions: getHandbookQuestions,
    getLocalHistoryQuestions: getLocalHistoryQuestions,
    getCategories: getCategories,
    shuffleArray: shuffleArray,
  };
})(typeof window !== 'undefined' ? window : this);
