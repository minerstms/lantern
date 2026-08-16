/**
 * Educational trivia banks for Worker scoring (#150).
 * Content is a locked copy of app/js/lantern-game-content.js.
 * Do not author new Trinidad questions here. Do not introduce Trinidad and Tobago content.
 * Parity is enforced by worker/scripts/educational-trivia-missions-150-test.mjs.
 */
export { SRP_SAFETY_TRIVIA_BANK } from './srp-safety-trivia-bank.js';
export {
  SEVEN_HABITS_TRIVIA_BANK,
  SEVEN_HABITS_NAMES,
  validateSevenHabitsBank,
} from './seven-habits-trivia-bank.js';

export const HANDBOOK_TRIVIA_BANK = [
  {
    "id": "hb1",
    "category": "handbook",
    "question": "You are sick and have to miss school. What should happen?",
    "options": [
      "Nothing. The school will figure it out.",
      "A parent or guardian should contact the school.",
      "A friend should tell your teachers.",
      "You should wait until the next week."
    ],
    "correctIndex": 1,
    "explanation": "The school needs to know why you were absent."
  },
  {
    "id": "hb2",
    "category": "handbook",
    "question": "You come to school late in the morning. Where should you go first?",
    "options": [
      "The gym",
      "Your locker",
      "The main office",
      "The cafeteria"
    ],
    "correctIndex": 2,
    "explanation": "Students who arrive late must sign in at the main office."
  },
  {
    "id": "hb3",
    "category": "handbook",
    "question": "Your locker will not open and you may be late to class. What should you do?",
    "options": [
      "Skip the class.",
      "Stay at the locker until it opens.",
      "Go outside.",
      "Report to class and tell the teacher about the problem."
    ],
    "correctIndex": 3,
    "explanation": "A locker problem does not mean you should miss class."
  },
  {
    "id": "hb4",
    "category": "handbook",
    "question": "Which is an acceptable reason to miss school?",
    "options": [
      "You have a doctor appointment.",
      "You want to sleep longer.",
      "Your friend is staying home.",
      "You do not feel like going."
    ],
    "correctIndex": 0,
    "explanation": "Medical appointments can be excused when the school gets the needed information."
  },
  {
    "id": "hb5",
    "category": "handbook",
    "question": "Is simply being \"out of town\" an excused absence?",
    "options": [
      "Yes, always.",
      "Yes, if you tell a friend.",
      "No, not by itself.",
      "Only on Fridays."
    ],
    "correctIndex": 2,
    "explanation": "The handbook says being out of town is not automatically excused."
  },
  {
    "id": "hb6",
    "category": "handbook",
    "question": "You miss school and have classwork to finish. What should you do?",
    "options": [
      "Forget about the work.",
      "Make it up within the time your teacher gives you.",
      "Ask another student to do it.",
      "Wait until report cards come out."
    ],
    "correctIndex": 1,
    "explanation": "Students are expected to make up work after an absence."
  },
  {
    "id": "hb7",
    "category": "handbook",
    "question": "You need to sit out of PE for more than three days because of an injury. What is needed?",
    "options": [
      "A note from a friend",
      "Nothing",
      "A note from the bus driver",
      "A written note from a doctor"
    ],
    "correctIndex": 3,
    "explanation": "Longer PE excuses require a physician's note."
  },
  {
    "id": "hb8",
    "category": "handbook",
    "question": "Where should backpacks and purses normally be kept during class?",
    "options": [
      "In the assigned locker",
      "Under the classroom desk",
      "In the hallway",
      "By the classroom door"
    ],
    "correctIndex": 0,
    "explanation": "Backpacks and purses are not allowed in classrooms."
  },
  {
    "id": "hb9",
    "category": "handbook",
    "question": "What should you do with your locker combination?",
    "options": [
      "Post it online.",
      "Give it to your whole class.",
      "Keep it private.",
      "Write it on the locker door."
    ],
    "correctIndex": 2,
    "explanation": "Students should not give their locker combinations to other students."
  },
  {
    "id": "hb10",
    "category": "handbook",
    "question": "Can you switch to another locker whenever you want?",
    "options": [
      "Yes, if it is empty.",
      "No. You need permission from the office.",
      "Yes, if your friend agrees.",
      "Yes, during lunch."
    ],
    "correctIndex": 1,
    "explanation": "Students may not change assigned lockers without permission."
  },
  {
    "id": "hb11",
    "category": "handbook",
    "question": "Who is responsible for the things kept inside your assigned locker?",
    "options": [
      "The principal",
      "Your classmates",
      "The custodian",
      "You"
    ],
    "correctIndex": 3,
    "explanation": "Students are responsible for the contents of their lockers."
  },
  {
    "id": "hb12",
    "category": "handbook",
    "question": "When may students use a cell phone during the school day?",
    "options": [
      "Cell phones are not allowed to be used during the school day.",
      "During any class that feels boring",
      "Any time the teacher is not looking",
      "Between every class"
    ],
    "correctIndex": 0,
    "explanation": "The handbook says cell phone use is prohibited during the school day."
  },
  {
    "id": "hb13",
    "category": "handbook",
    "question": "What may happen if a student uses a cell phone at school?",
    "options": [
      "The student earns extra credit.",
      "Nothing can happen.",
      "The phone may be taken, and repeated problems bring stronger consequences.",
      "The student gets a longer lunch."
    ],
    "correctIndex": 2,
    "explanation": "Cell phones are confiscated when the rule is broken, and repeat violations become more serious."
  },
  {
    "id": "hb14",
    "category": "handbook",
    "question": "Which item is also listed as something students should not bring or use at school?",
    "options": [
      "Pencil",
      "Headphones or earbuds",
      "Notebook",
      "School textbook"
    ],
    "correctIndex": 1,
    "explanation": "Personal electronic items such as earbuds and headphones are not allowed."
  },
  {
    "id": "hb15",
    "category": "handbook",
    "question": "The school laptop you use belongs to whom?",
    "options": [
      "The student",
      "The teacher",
      "The computer company",
      "The school district"
    ],
    "correctIndex": 3,
    "explanation": "School laptops and chargers remain district property."
  },
  {
    "id": "hb16",
    "category": "handbook",
    "question": "What should you do with a school laptop or charger?",
    "options": [
      "Take care of it and report damage or loss.",
      "Trade it with another student.",
      "Put stickers over its ID numbers.",
      "Leave it outside."
    ],
    "correctIndex": 0,
    "explanation": "Students are responsible for taking care of school-owned devices."
  },
  {
    "id": "hb17",
    "category": "handbook",
    "question": "You lose or damage a school textbook. What can happen?",
    "options": [
      "Nothing, because books are free.",
      "The school automatically forgets about it.",
      "You may have to pay for the loss or damage.",
      "Another student must pay."
    ],
    "correctIndex": 2,
    "explanation": "Students are responsible for the proper care of school textbooks."
  },
  {
    "id": "hb18",
    "category": "handbook",
    "question": "Which drink may students have in a classroom?",
    "options": [
      "Soda in a can",
      "Water in a clear bottle",
      "Energy drink",
      "Milkshake"
    ],
    "correctIndex": 1,
    "explanation": "Food and drinks are not allowed in classrooms except water in a clear bottle."
  },
  {
    "id": "hb19",
    "category": "handbook",
    "question": "You need to leave class to go to the office or bathroom. What should you have?",
    "options": [
      "A pass from your planner or teacher",
      "Your lunch tray",
      "A note from another student",
      "Your backpack"
    ],
    "correctIndex": 0,
    "explanation": "Students need a proper pass when they are out of class."
  },
  {
    "id": "hb20",
    "category": "handbook",
    "question": "What should students do with their planners?",
    "options": [
      "Tear out pages when they are finished.",
      "Trade planners with friends.",
      "Leave them at home.",
      "Keep them intact and use them properly."
    ],
    "correctIndex": 3,
    "explanation": "The handbook says planners should be kept intact and used for passes."
  },
  {
    "id": "hb21",
    "category": "handbook",
    "question": "You are assigned after-school detention. What must you do?",
    "options": [
      "Leave without telling anyone.",
      "Call home to let your parent or guardian know.",
      "Ask another student to serve it.",
      "Ignore it."
    ],
    "correctIndex": 1,
    "explanation": "Students in after-school detention must notify home."
  },
  {
    "id": "hb22",
    "category": "handbook",
    "question": "Which situation best shows bullying?",
    "options": [
      "Two friends disagree one time.",
      "Someone accidentally bumps into another student.",
      "A student keeps hurting or controlling another student on purpose.",
      "Two students choose different lunch tables."
    ],
    "correctIndex": 2,
    "explanation": "Bullying involves harmful or controlling behavior and is often repeated."
  },
  {
    "id": "hb23",
    "category": "handbook",
    "question": "One student keeps picking on a younger student because the younger student feels unable to fight back. What should you do?",
    "options": [
      "Report it to a school adult.",
      "Record it for entertainment.",
      "Join in.",
      "Pretend it is funny."
    ],
    "correctIndex": 0,
    "explanation": "Students are expected to report bullying honestly and quickly."
  },
  {
    "id": "hb24",
    "category": "handbook",
    "question": "What should happen to a student who reports bullying?",
    "options": [
      "Other students should get even with them.",
      "They should be blamed for the problem.",
      "They should lose school privileges.",
      "They should not face retaliation for reporting it."
    ],
    "correctIndex": 3,
    "explanation": "Retaliation against someone who reports bullying is not allowed."
  },
  {
    "id": "hb25",
    "category": "handbook",
    "question": "A student is being harassed because of race, religion, sex, disability, or another personal trait. What is a good next step?",
    "options": [
      "Keep it secret forever.",
      "Tell school administration or another trusted school adult.",
      "Start a fight.",
      "Post insults back online."
    ],
    "correctIndex": 1,
    "explanation": "The handbook directs students to report harassment and discrimination."
  },
  {
    "id": "hb26",
    "category": "handbook",
    "question": "Which action best follows the school's anti-bullying pledge?",
    "options": [
      "Help and support a student who is being bullied.",
      "Laugh so the bully likes you.",
      "Spread the story to more students.",
      "Ignore every bullying problem."
    ],
    "correctIndex": 0,
    "explanation": "Students are expected to support others and help stop bullying."
  },
  {
    "id": "hb27",
    "category": "handbook",
    "question": "You copy your friend's homework and turn it in as your own. What is that?",
    "options": [
      "Teamwork",
      "Extra credit",
      "Cheating",
      "Tutoring"
    ],
    "correctIndex": 2,
    "explanation": "Copying another student's academic work is cheating."
  },
  {
    "id": "hb28",
    "category": "handbook",
    "question": "You use AI to write an assignment and turn the copied work in as if you wrote it yourself. What does the handbook call that?",
    "options": [
      "Free time",
      "Plagiarism or cheating",
      "Attendance",
      "School spirit"
    ],
    "correctIndex": 1,
    "explanation": "The handbook specifically includes plagiarizing from AI under cheating and dishonesty."
  },
  {
    "id": "hb29",
    "category": "handbook",
    "question": "Is forging someone else's signature allowed?",
    "options": [
      "Yes, if you are in a hurry.",
      "Yes, if it is your friend's signature.",
      "Only during lunch.",
      "No."
    ],
    "correctIndex": 3,
    "explanation": "Forging signatures is listed as academic dishonesty."
  },
  {
    "id": "hb30",
    "category": "handbook",
    "question": "A staff member asks what happened, and you knowingly give false information. Is that allowed?",
    "options": [
      "No",
      "Yes, if it keeps you out of trouble.",
      "Yes, if your friend agrees.",
      "Only once"
    ],
    "correctIndex": 0,
    "explanation": "Lying or giving false information to district staff is against the Code of Conduct."
  },
  {
    "id": "hb31",
    "category": "handbook",
    "question": "A student keeps yelling during class on purpose and stops others from learning. What kind of behavior is this?",
    "options": [
      "Helpful behavior",
      "Quiet study",
      "Disruptive behavior",
      "Perfect attendance"
    ],
    "correctIndex": 2,
    "explanation": "Behavior that deliberately disrupts class or school activities is prohibited."
  },
  {
    "id": "hb32",
    "category": "handbook",
    "question": "A teacher gives you a reasonable direction. What are you expected to do?",
    "options": [
      "Argue until the teacher changes it.",
      "Follow the direction.",
      "Walk out of class.",
      "Tell everyone else not to listen."
    ],
    "correctIndex": 1,
    "explanation": "Refusing to follow staff directions can be insubordination."
  },
  {
    "id": "hb33",
    "category": "handbook",
    "question": "Does disrespect toward adults at school have consequences?",
    "options": [
      "No, never.",
      "Only during sports.",
      "Only if another student complains.",
      "Yes. The consequence depends on how serious the behavior is."
    ],
    "correctIndex": 3,
    "explanation": "The handbook says disrespect toward adults can result in discipline based on severity."
  },
  {
    "id": "hb34",
    "category": "handbook",
    "question": "Which is the best way to handle a disagreement with a teacher?",
    "options": [
      "Speak respectfully and ask for help.",
      "Shout insults.",
      "Throw something.",
      "Refuse every direction."
    ],
    "correctIndex": 0,
    "explanation": "School rules expect respectful behavior even when students disagree."
  },
  {
    "id": "hb35",
    "category": "handbook",
    "question": "What is the main idea of the school dress rules?",
    "options": [
      "Everyone must wear the same color.",
      "Students must wear uniforms every day.",
      "Clothing should be safe, appropriate, and not disruptive.",
      "Students may wear anything at all."
    ],
    "correctIndex": 2,
    "explanation": "The dress code is meant to protect safety and keep clothing from disrupting school."
  },
  {
    "id": "hb36",
    "category": "handbook",
    "question": "Which clothing would clearly break the handbook rules?",
    "options": [
      "A plain school sweatshirt",
      "A shirt advertising drugs or alcohol",
      "Jeans that follow the dress code",
      "A school team shirt"
    ],
    "correctIndex": 1,
    "explanation": "Clothing that advertises drugs, alcohol, tobacco, violence, or profanity is not allowed."
  },
  {
    "id": "hb37",
    "category": "handbook",
    "question": "Two students decide to fight at school. Is that allowed?",
    "options": [
      "Yes, if both agree.",
      "Yes, outside the classroom.",
      "Yes, if no teacher is nearby.",
      "No. Fighting is a serious school violation."
    ],
    "correctIndex": 3,
    "explanation": "Fighting on school property or at school activities can lead to serious discipline."
  },
  {
    "id": "hb38",
    "category": "handbook",
    "question": "You encourage two students to fight even though you do not throw a punch. Can you still be involved in the violation?",
    "options": [
      "Yes",
      "No, because only punches count.",
      "No, if you are laughing.",
      "Only after school"
    ],
    "correctIndex": 0,
    "explanation": "The fighting rule also covers students who instigate a fight."
  },
  {
    "id": "hb39",
    "category": "handbook",
    "question": "Is pushing or rough horseplay okay if students say they are joking?",
    "options": [
      "Yes, always.",
      "Only in the hallway.",
      "No. It can still cause harm and lead to discipline.",
      "Yes, if no one tells a teacher."
    ],
    "correctIndex": 2,
    "explanation": "Pushing and horseplay are prohibited even when students mean it as a joke."
  },
  {
    "id": "hb40",
    "category": "handbook",
    "question": "A student throws rocks or other objects where someone could get hurt. What is the main problem?",
    "options": [
      "The rocks may get dirty.",
      "The action is dangerous and can hurt someone.",
      "It uses too much energy.",
      "The student might miss lunch."
    ],
    "correctIndex": 1,
    "explanation": "Dangerous or irresponsible acts that threaten others are prohibited."
  },
  {
    "id": "hb41",
    "category": "handbook",
    "question": "You take another student's property without asking but plan to return it later. Does that still break the theft rule?",
    "options": [
      "No, because you planned to return it.",
      "Only if the item costs money.",
      "Only if the student notices.",
      "Yes."
    ],
    "correctIndex": 3,
    "explanation": "Taking or using another person's property without permission counts as theft regardless of intent to return it."
  },
  {
    "id": "hb42",
    "category": "handbook",
    "question": "A student writes graffiti on school property. What rule does this break?",
    "options": [
      "Vandalism",
      "Attendance",
      "Homework",
      "Athletics"
    ],
    "correctIndex": 0,
    "explanation": "Tagging or purposely damaging property is vandalism."
  },
  {
    "id": "hb43",
    "category": "handbook",
    "question": "Are vape pens or other nicotine devices allowed at school?",
    "options": [
      "Yes, outside.",
      "Yes, if they stay in a backpack.",
      "No. Students may not use or possess them.",
      "Only during lunch."
    ],
    "correctIndex": 2,
    "explanation": "Tobacco and electronic nicotine products are prohibited on school property and at school activities."
  },
  {
    "id": "hb44",
    "category": "handbook",
    "question": "Which statement about drugs and alcohol is correct?",
    "options": [
      "They are allowed after lunch.",
      "Students may not use, possess, sell, or be under the influence of them at school or school activities.",
      "They are allowed if another student brings them.",
      "They are only against the rules inside classrooms."
    ],
    "correctIndex": 1,
    "explanation": "The rule covers use, possession, selling, and being under the influence."
  },
  {
    "id": "hb45",
    "category": "handbook",
    "question": "Which statement about weapons is correct?",
    "options": [
      "Weapons are allowed if they stay hidden.",
      "Fireworks are always okay.",
      "Students may carry harmful objects for fun.",
      "Weapons and objects that may harm others are prohibited."
    ],
    "correctIndex": 3,
    "explanation": "Weapons and potentially harmful objects, including fireworks, are not allowed."
  },
  {
    "id": "hb46",
    "category": "handbook",
    "question": "Which behavior breaks the school's verbal conduct rules?",
    "options": [
      "Using racial slurs or insulting names toward someone",
      "Asking a teacher a question",
      "Saying hello to a visitor",
      "Talking to a friend politely"
    ],
    "correctIndex": 0,
    "explanation": "Profanity, obscene gestures, slurs, name-calling, and abusive language are prohibited."
  },
  {
    "id": "hb47",
    "category": "handbook",
    "question": "What is expected when students ride a school bus?",
    "options": [
      "Students may ignore school rules.",
      "Students should follow bus rules and behave safely and respectfully.",
      "Students may move around however they want.",
      "Bus drivers cannot give consequences."
    ],
    "correctIndex": 1,
    "explanation": "Students must follow bus rules, common sense, and courtesy. Students can lose bus privileges for serious problems."
  },
  {
    "id": "hb48",
    "category": "handbook",
    "question": "How should students behave on the school computer network?",
    "options": [
      "Online rules do not matter.",
      "Anything is allowed if nobody knows your name.",
      "With the same good behavior expected elsewhere at school.",
      "Students may send abusive messages as jokes."
    ],
    "correctIndex": 2,
    "explanation": "The handbook says school behavior rules also apply to school networks."
  },
  {
    "id": "hb49",
    "category": "handbook",
    "question": "What personal information should you NOT share through the school network?",
    "options": [
      "Your favorite subject",
      "The name of your school mascot",
      "Your favorite book",
      "Your home address, phone number, or financial information"
    ],
    "correctIndex": 3,
    "explanation": "Students should protect private contact and financial information online."
  },
  {
    "id": "hb50",
    "category": "handbook",
    "question": "Which choice best sums up the handbook's rules?",
    "options": [
      "Be safe, be honest, respect people and property, follow directions, and help others learn.",
      "Follow rules only when a teacher is watching.",
      "School rules only matter in classrooms.",
      "Students should solve every problem by themselves."
    ],
    "correctIndex": 0,
    "explanation": "That is the broad idea behind the handbook: protect learning, safety, people, and property."
  }
];

export const LOCAL_HISTORY_TRIVIA_BANK = [
  {
    "id": "lh1",
    "category": "local_history",
    "question": "What bluff overlooks Trinidad from the north?",
    "options": [
      "Simpson's Rest",
      "Fishers Peak",
      "Raton Pass",
      "Cokedale"
    ],
    "correctIndex": 0,
    "explanation": "Simpson's Rest is the sandstone bluff just north of Trinidad."
  },
  {
    "id": "lh2",
    "category": "local_history",
    "question": "What large word is spelled across the hillside at Simpson's Rest?",
    "options": [
      "COLORADO",
      "TRINIDAD",
      "RATON",
      "LAS ANIMAS"
    ],
    "correctIndex": 1,
    "explanation": "The huge TRINIDAD letters on Simpson's Rest are one of the city's best-known sights."
  },
  {
    "id": "lh3",
    "category": "local_history",
    "question": "What can be found in some of the sandstone at Simpson's Rest?",
    "options": [
      "Old railroad ties",
      "Prehistoric fossil remains",
      "Adobe bricks",
      "Coke ovens"
    ],
    "correctIndex": 1,
    "explanation": "The sandstone contains fossil remains from life that existed long before Trinidad did."
  },
  {
    "id": "lh4",
    "category": "local_history",
    "question": "Who is buried at Simpson's Rest?",
    "options": [
      "William Becknell",
      "Bat Masterson",
      "George S. Simpson",
      "Felipe Baca"
    ],
    "correctIndex": 2,
    "explanation": "The bluff is named for George S. Simpson, who is buried there."
  },
  {
    "id": "lh5",
    "category": "local_history",
    "question": "Which famous flat-topped peak stands near Trinidad?",
    "options": [
      "Pikes Peak",
      "Fishers Peak",
      "Spanish Peaks",
      "Mount Elbert"
    ],
    "correctIndex": 1,
    "explanation": "Fishers Peak rises above the Trinidad area and is one of the city's most recognizable landmarks."
  },
  {
    "id": "lh6",
    "category": "local_history",
    "question": "Which river runs alongside Trinidad?",
    "options": [
      "Arkansas River",
      "Rio Grande",
      "Purgatoire River",
      "South Platte River"
    ],
    "correctIndex": 2,
    "explanation": "Trinidad grew along the Purgatoire River."
  },
  {
    "id": "lh7",
    "category": "local_history",
    "question": "Trinidad is the county seat of which county?",
    "options": [
      "Huerfano County",
      "Pueblo County",
      "Otero County",
      "Las Animas County"
    ],
    "correctIndex": 3,
    "explanation": "Trinidad is the main center of county government for Las Animas County."
  },
  {
    "id": "lh8",
    "category": "local_history",
    "question": "Raton Pass sits on the border between which two states?",
    "options": [
      "Colorado and Kansas",
      "Colorado and New Mexico",
      "Colorado and Utah",
      "Colorado and Wyoming"
    ],
    "correctIndex": 1,
    "explanation": "Raton Pass crosses the Colorado-New Mexico border just south of Trinidad."
  },
  {
    "id": "lh9",
    "category": "local_history",
    "question": "What lake sits behind Trinidad Dam?",
    "options": [
      "Lake Pueblo",
      "Trinidad Lake",
      "John Martin Reservoir",
      "Blue Mesa Reservoir"
    ],
    "correctIndex": 1,
    "explanation": "Trinidad Dam holds back the water that forms Trinidad Lake."
  },
  {
    "id": "lh10",
    "category": "local_history",
    "question": "Who built Trinidad Dam?",
    "options": [
      "Colorado State Parks",
      "National Park Service",
      "U.S. Army Corps of Engineers",
      "Santa Fe Railway"
    ],
    "correctIndex": 2,
    "explanation": "The U.S. Army Corps of Engineers constructed Trinidad Dam."
  },
  {
    "id": "lh11",
    "category": "local_history",
    "question": "What are two important jobs of Trinidad Dam and Lake?",
    "options": [
      "Flood control and irrigation",
      "Shipping and ocean trade",
      "Snowmaking and skiing",
      "Gold mining and smelting"
    ],
    "correctIndex": 0,
    "explanation": "The lake helps control floods and stores water for irrigation."
  },
  {
    "id": "lh12",
    "category": "local_history",
    "question": "Trinidad Dam and Trinidad Lake were created in what year?",
    "options": [
      "1878",
      "1914",
      "1978",
      "2021"
    ],
    "correctIndex": 2,
    "explanation": "The modern lake is much newer than Trinidad itself."
  },
  {
    "id": "lh13",
    "category": "local_history",
    "question": "Which pair of activities is Trinidad Lake especially known for?",
    "options": [
      "Downhill skiing and snowboarding",
      "Boating and fishing",
      "Railroad rides and mine tours",
      "Cave tours and rock climbing"
    ],
    "correctIndex": 1,
    "explanation": "Trinidad Lake State Park is a popular place for water recreation."
  },
  {
    "id": "lh14",
    "category": "local_history",
    "question": "Before Trinidad grew into a city, what did settlers do along the Purgatoire River?",
    "options": [
      "Farmed along the river",
      "Built Trinidad Dam",
      "Built railroad tunnels",
      "Opened the state park"
    ],
    "correctIndex": 0,
    "explanation": "Early settlers farmed near the Purgatoire before the city grew around them."
  },
  {
    "id": "lh15",
    "category": "local_history",
    "question": "What industry began growing near Trinidad in the 1870s and later became a huge part of the area's story?",
    "options": [
      "Silver mining",
      "Coal mining",
      "Oil drilling",
      "Steel making"
    ],
    "correctIndex": 1,
    "explanation": "Coal mining shaped jobs, towns, railroads, and labor history across the region."
  },
  {
    "id": "lh16",
    "category": "local_history",
    "question": "Which museum campus includes both the Baca House and Bloom Mansion?",
    "options": [
      "Trinidad History Museum",
      "Colorado Railroad Museum",
      "Bent's Old Fort",
      "History Colorado Center"
    ],
    "correctIndex": 0,
    "explanation": "Both historic homes are part of the Trinidad History Museum campus."
  },
  {
    "id": "lh17",
    "category": "local_history",
    "question": "Which museum on the Trinidad History Museum campus focuses on an important old trade route?",
    "options": [
      "Coal Miners Museum",
      "Santa Fe Trail Museum",
      "Railroad Roundhouse Museum",
      "Fishers Peak Museum"
    ],
    "correctIndex": 1,
    "explanation": "It tells part of the story of the route that helped shape Trinidad."
  },
  {
    "id": "lh18",
    "category": "local_history",
    "question": "The Baca House and Bloom Mansion were built during which broad time period?",
    "options": [
      "Early 1700s",
      "Late 1800s",
      "1930s",
      "Late 1900s"
    ],
    "correctIndex": 1,
    "explanation": "Both homes reflect Trinidad's rapid growth during the late 19th century."
  },
  {
    "id": "lh19",
    "category": "local_history",
    "question": "What building material makes the Baca House especially interesting?",
    "options": [
      "Adobe",
      "Marble",
      "Steel",
      "Logs"
    ],
    "correctIndex": 0,
    "explanation": "The Baca House is an unusual adobe home tied to Southwestern building traditions."
  },
  {
    "id": "lh20",
    "category": "local_history",
    "question": "What did Felipe and Dolores Baca trade to get the Baca House?",
    "options": [
      "A herd of cattle",
      "Railroad land",
      "22,000 pounds of wool",
      "A coal mine"
    ],
    "correctIndex": 2,
    "explanation": "The Bacas traded a huge amount of wool for the house in 1873."
  },
  {
    "id": "lh21",
    "category": "local_history",
    "question": "What famous trail connected Missouri with Santa Fe, New Mexico?",
    "options": [
      "Oregon Trail",
      "Santa Fe Trail",
      "California Trail",
      "Mormon Trail"
    ],
    "correctIndex": 1,
    "explanation": "The trail carried people and goods across the Plains and through the Trinidad region."
  },
  {
    "id": "lh22",
    "category": "local_history",
    "question": "What was the Santa Fe Trail mainly used for?",
    "options": [
      "Trade and travel",
      "Gold mining only",
      "Cattle drives only",
      "Military patrols only"
    ],
    "correctIndex": 0,
    "explanation": "It was a major commercial route."
  },
  {
    "id": "lh23",
    "category": "local_history",
    "question": "Which Missouri trader is famous for helping pioneer the Santa Fe Trail?",
    "options": [
      "George Simpson",
      "Felipe Baca",
      "William Becknell",
      "Bat Masterson"
    ],
    "correctIndex": 2,
    "explanation": "Becknell helped open the trail for commercial trade."
  },
  {
    "id": "lh24",
    "category": "local_history",
    "question": "Which pass was an important part of the Mountain Branch of the Santa Fe Trail?",
    "options": [
      "Raton Pass",
      "Loveland Pass",
      "Monarch Pass",
      "Independence Pass"
    ],
    "correctIndex": 0,
    "explanation": "Wagons used Raton Pass to cross the mountains near Trinidad."
  },
  {
    "id": "lh25",
    "category": "local_history",
    "question": "Why was Raton Pass important to travelers with wagons?",
    "options": [
      "It gave wagons a route through the mountains",
      "It was the main bridge across the Arkansas River",
      "It was a large river port",
      "It was the end of the railroad"
    ],
    "correctIndex": 0,
    "explanation": "The pass provided a way through difficult mountain country."
  },
  {
    "id": "lh26",
    "category": "local_history",
    "question": "What marks from Santa Fe Trail travel can still be seen in some places?",
    "options": [
      "Wagon-wheel ruts",
      "Concrete highway lanes",
      "Coke ovens",
      "Railroad turntables"
    ],
    "correctIndex": 0,
    "explanation": "Thousands of wagons left tracks that can still be seen in some areas."
  },
  {
    "id": "lh27",
    "category": "local_history",
    "question": "In what year did Santa Fe railroad tracks reach Trinidad?",
    "options": [
      "1821",
      "1878",
      "1914",
      "1978"
    ],
    "correctIndex": 1,
    "explanation": "The railroad connected Trinidad to a much larger transportation network."
  },
  {
    "id": "lh28",
    "category": "local_history",
    "question": "What kind of travel did railroads begin replacing on the Santa Fe Trail?",
    "options": [
      "Long-distance wagon trade",
      "Air travel",
      "Riverboat travel",
      "Automobile traffic"
    ],
    "correctIndex": 0,
    "explanation": "Trains could move people and goods faster and in much larger amounts."
  },
  {
    "id": "lh29",
    "category": "local_history",
    "question": "Why did Trinidad's coal become important to railroads?",
    "options": [
      "Coal could fuel steam engines",
      "Coal was used to make wooden ties",
      "Coal cooled locomotives",
      "Coal made train windows"
    ],
    "correctIndex": 0,
    "explanation": "Steam locomotives needed fuel, and coal became a major part of the railroad economy."
  },
  {
    "id": "lh30",
    "category": "local_history",
    "question": "Which road near Trinidad is known as the Highway of Legends?",
    "options": [
      "Colorado Highway 12",
      "U.S. Highway 160",
      "Colorado Highway 350",
      "Interstate 25"
    ],
    "correctIndex": 0,
    "explanation": "Highway 12 carries the scenic route west of Trinidad."
  },
  {
    "id": "lh31",
    "category": "local_history",
    "question": "What national honor did the Highway of Legends receive in 2021?",
    "options": [
      "National Monument",
      "National Scenic Byway",
      "National Park",
      "National Historic Battlefield"
    ],
    "correctIndex": 1,
    "explanation": "The route earned recognition for its scenery, communities, and history."
  },
  {
    "id": "lh32",
    "category": "local_history",
    "question": "Which route begins around Trinidad and winds through mountain villages and ranch country?",
    "options": [
      "San Juan Skyway",
      "Highway of Legends",
      "Trail Ridge Road",
      "Gold Belt Tour"
    ],
    "correctIndex": 1,
    "explanation": "The route connects Trinidad with mountain communities and historic coal country."
  },
  {
    "id": "lh33",
    "category": "local_history",
    "question": "Which old mining town on the Highway of Legends is known for its coke ovens?",
    "options": [
      "Ludlow",
      "Segundo",
      "Cokedale",
      "Aguilar"
    ],
    "correctIndex": 2,
    "explanation": "Rows of historic coke ovens can still be seen at Cokedale."
  },
  {
    "id": "lh34",
    "category": "local_history",
    "question": "What did coke ovens do during the coal era?",
    "options": [
      "Processed coal into coke",
      "Stored irrigation water",
      "Melted railroad tracks",
      "Dried grain"
    ],
    "correctIndex": 0,
    "explanation": "Coke ovens heated coal in a special process that created coke for industry."
  },
  {
    "id": "lh35",
    "category": "local_history",
    "question": "Which mountain areas are a major part of Highway of Legends scenery?",
    "options": [
      "Sangre de Cristos and Spanish Peaks",
      "Front Range and Flatirons",
      "San Juans and Grand Mesa",
      "Sawatch Range and Elk Mountains"
    ],
    "correctIndex": 0,
    "explanation": "The route passes through dramatic southern Colorado mountain scenery."
  },
  {
    "id": "lh36",
    "category": "local_history",
    "question": "Which industry strongly shaped Trinidad in the late 1800s and early 1900s?",
    "options": [
      "Silver mining",
      "Oil drilling",
      "Coal mining",
      "Steel making"
    ],
    "correctIndex": 2,
    "explanation": "Coal brought jobs, workers, railroads, and communities to the Trinidad region."
  },
  {
    "id": "lh37",
    "category": "local_history",
    "question": "Which major event happened near Trinidad on April 20, 1914?",
    "options": [
      "The railroad first reached Trinidad",
      "The Ludlow Massacre",
      "Trinidad Lake opened",
      "Highway of Legends became a national byway"
    ],
    "correctIndex": 1,
    "explanation": "Ludlow was a deadly event during a major coal labor conflict."
  },
  {
    "id": "lh38",
    "category": "local_history",
    "question": "Who lived in the Ludlow tent colony?",
    "options": [
      "Striking coal miners and their families",
      "Railroad owners and their families",
      "State government workers",
      "Ranchers moving cattle north"
    ],
    "correctIndex": 0,
    "explanation": "Striking miners and their families lived there after leaving company housing."
  },
  {
    "id": "lh39",
    "category": "local_history",
    "question": "Which state force fought with strikers during the Ludlow conflict?",
    "options": [
      "Colorado National Guard",
      "New Mexico State Police",
      "U.S. Navy",
      "National Park Service rangers"
    ],
    "correctIndex": 0,
    "explanation": "The Colorado National Guard was involved in the fighting at Ludlow."
  },
  {
    "id": "lh40",
    "category": "local_history",
    "question": "What happened to the Ludlow tent colony during the violence?",
    "options": [
      "It was moved into Trinidad",
      "It burned",
      "It became a railroad station",
      "It was flooded"
    ],
    "correctIndex": 1,
    "explanation": "The colony burned during the conflict."
  },
  {
    "id": "lh41",
    "category": "local_history",
    "question": "Why is the Ludlow story especially serious?",
    "options": [
      "Families and children were caught in the violence",
      "It ended all mining in Colorado",
      "It created Las Animas County",
      "It moved Trinidad to a new location"
    ],
    "correctIndex": 0,
    "explanation": "Women and children were among those who died."
  },
  {
    "id": "lh42",
    "category": "local_history",
    "question": "Which union was connected to coal miners organizing in southern Colorado?",
    "options": [
      "Brotherhood of Locomotive Engineers",
      "United Mine Workers of America",
      "American Railway Union",
      "Western Federation of Miners"
    ],
    "correctIndex": 1,
    "explanation": "The union organized miners seeking changes in working and living conditions."
  },
  {
    "id": "lh43",
    "category": "local_history",
    "question": "The Ludlow Massacre was part of what larger conflict?",
    "options": [
      "Colorado Coalfield War",
      "American Civil War",
      "Spanish-American War",
      "Pueblo Steel Strike"
    ],
    "correctIndex": 0,
    "explanation": "Ludlow was one event in a larger labor conflict involving miners, companies, and armed forces."
  },
  {
    "id": "lh44",
    "category": "local_history",
    "question": "What did coal camps usually grow around?",
    "options": [
      "Mines",
      "Courthouses",
      "State parks",
      "College campuses"
    ],
    "correctIndex": 0,
    "explanation": "Workers and their families needed to live close to the mines."
  },
  {
    "id": "lh45",
    "category": "local_history",
    "question": "Which nearby museum is specifically dedicated to coal miners and their history?",
    "options": [
      "Santa Fe Trail Museum",
      "Southern Colorado Coal Miners Memorial & Museum",
      "Baca House",
      "Bloom Mansion"
    ],
    "correctIndex": 1,
    "explanation": "It preserves the stories of miners and coal communities in southern Colorado."
  },
  {
    "id": "lh46",
    "category": "local_history",
    "question": "Who was the settlement of Trinidad named for, according to Britannica?",
    "options": [
      "Dolores Baca",
      "Trinidad Baca",
      "Sarah Bloom",
      "Mary Harris Jones"
    ],
    "correctIndex": 1,
    "explanation": "The settlement was named for Trinidad Baca, the daughter of an early settler."
  },
  {
    "id": "lh47",
    "category": "local_history",
    "question": "Which famous Old West lawman served as Trinidad's city marshal in 1882?",
    "options": [
      "Wyatt Earp",
      "Doc Holliday",
      "Bat Masterson",
      "George Simpson"
    ],
    "correctIndex": 2,
    "explanation": "Bat Masterson spent part of his Old West career as Trinidad's city marshal."
  },
  {
    "id": "lh48",
    "category": "local_history",
    "question": "In the area's place-name history, what does \"Las Animas\" connect to?",
    "options": [
      "Rivers and lakes",
      "Souls or spirits",
      "Gold and silver",
      "Peaks and passes"
    ],
    "correctIndex": 1,
    "explanation": "The Spanish name behind Las Animas is connected with the idea of souls or spirits."
  },
  {
    "id": "lh49",
    "category": "local_history",
    "question": "Trinidad sits near the foothills of which large mountain region?",
    "options": [
      "Appalachian Mountains",
      "Wasatch Mountains",
      "Southern Rocky Mountains",
      "Sierra Nevada"
    ],
    "correctIndex": 2,
    "explanation": "Trinidad sits where the plains meet the foothills of the southern Rockies."
  },
  {
    "id": "lh50",
    "category": "local_history",
    "question": "What kind of stories helped give the Highway of Legends its name?",
    "options": [
      "Tall tales and legends",
      "Railroad timetables",
      "County laws",
      "Mining payroll records"
    ],
    "correctIndex": 0,
    "explanation": "The mountains and communities along the route have inspired stories and legends for generations."
  }
];
