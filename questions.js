// RACE TO RICHES – edit questions here. correctAnswer: "blue" | "yellow" | "green" | "red"
// ja: the Japanese translation, shown in ONE small line under the English question. Type it between the quotation marks.
//     Leave it as "" (empty) to show no Japanese for that question.
const questions = [
  { question: "What is the opposite of 'expensive'?", ja: "", options: { blue: "Cheap", yellow: "Heavy", green: "Late", red: "Quiet" }, correctAnswer: "blue" },
  { question: "Which word means a place where you buy things?", ja: "", options: { blue: "Library", yellow: "Shop", green: "Stadium", red: "Airport" }, correctAnswer: "yellow" },
  { question: "Choose the correct sentence.", ja: "", options: { blue: "She go to school.", yellow: "She going school.", green: "She goes to school.", red: "She goed to school." }, correctAnswer: "green" },
  { question: "What is the past tense of 'buy'?", ja: "", options: { blue: "Buyed", yellow: "Bought", green: "Boughten", red: "Buys" }, correctAnswer: "yellow" },
  { question: "How many days are in a week?", ja: "", options: { blue: "Five", yellow: "Six", green: "Seven", red: "Eight" }, correctAnswer: "green" },
  { question: "Which one is a fruit?", ja: "", options: { blue: "Carrot", yellow: "Potato", green: "Onion", red: "Mango" }, correctAnswer: "red" },
  { question: "'I ___ a student.' Fill in the blank.", ja: "", options: { blue: "am", yellow: "is", green: "are", red: "be" }, correctAnswer: "blue" },
  { question: "What colour do you get from mixing blue and yellow?", ja: "", options: { blue: "Purple", yellow: "Orange", green: "Green", red: "Brown" }, correctAnswer: "green" },
  { question: "Which word is a synonym of 'big'?", ja: "", options: { blue: "Tiny", yellow: "Huge", green: "Thin", red: "Short" }, correctAnswer: "yellow" },
  { question: "What do you use to tell the time?", ja: "", options: { blue: "A watch", yellow: "A spoon", green: "A pillow", red: "A ticket" }, correctAnswer: "blue" },
  { question: "Choose the plural of 'child'.", ja: "", options: { blue: "Childs", yellow: "Childes", green: "Children", red: "Childrens" }, correctAnswer: "green" },
  { question: "Which month comes after March?", ja: "", options: { blue: "May", yellow: "February", green: "June", red: "April" }, correctAnswer: "red" },
  { question: "'She is ___ than her sister.' (tall)", ja: "", options: { blue: "taller", yellow: "tallest", green: "more tall", red: "tallier" }, correctAnswer: "blue" },
  { question: "Which jewel is clear and very hard?", ja: "", options: { blue: "Pearl", yellow: "Diamond", green: "Coal", red: "Pebble" }, correctAnswer: "yellow" },
  { question: "What is the opposite of 'rich'?", ja: "", options: { blue: "Happy", yellow: "Fast", green: "Poor", red: "Kind" }, correctAnswer: "green" },
  { question: "Which sentence is a question?", ja: "", options: { blue: "I like pizza.", yellow: "Close the door.", green: "What a nice day!", red: "Where do you live?" }, correctAnswer: "red" },
  { question: "'There ___ two apples on the table.'", ja: "", options: { blue: "are", yellow: "is", green: "am", red: "be" }, correctAnswer: "blue" },
  { question: "Which word has the SAME sound as 'two'?", ja: "", options: { blue: "Tow", yellow: "Too", green: "Toe", red: "Tie" }, correctAnswer: "yellow" },
  { question: "What do we call money in coins and notes?", ja: "", options: { blue: "Weather", yellow: "Furniture", green: "Cash", red: "Fashion" }, correctAnswer: "green" },
  { question: "Which is the correct spelling?", ja: "", options: { blue: "Recieve", yellow: "Receve", green: "Receeve", red: "Receive" }, correctAnswer: "red" }
];

// RACE TO RICHES – PRACTICE QUESTION. Shown once, right after the homepage button, before Question 1.
// It is NOT counted: no points, not part of the 20 questions, and it never affects the podium.
// To remove the practice round completely, delete this whole block (or the lines of the practiceQuestion).
const practiceQuestion = { question: "Which is NOT an alphabet?", ja: "アルファベットではないのはどれ？", options: { blue: "H", yellow: "2", green: "O", red: "S" }, correctAnswer: "yellow" };

// RACE TO RICHES – answering (countdown) music. Put your 3 audio files in the assets folder and list them here.
// One track is picked at random for each question (all 3 are used before any repeats).
const musicFiles = [
  "assets/kahoot-game1.mp3",
  "assets/kahoot-game2.mp3",
  "assets/kahoot-game3.mp3"
];

// RACE TO RICHES – sound effects (put these files in the assets folder too).
//   gong     : plays when the correct answer is revealed (Kahoot-style gong)
//   points   : plays every time you click a +10 / +30 / +60 / +100 button
// (The podium music already contains the applause and cheers, so there is no separate applause file.)
// If a file is missing, that sound is simply skipped (the game keeps working).
const soundFiles = {
  gong: "assets/kahoot-gong.mp3",
  points: "assets/kahoot-point.mp3"
};

// RACE TO RICHES – background music (volume: 0 = silent ... 1 = full; 1 is the maximum; do NOT go above 1).
//   homeMusic   : HOMEPAGE (and Settings) - loops until you start the game
//   podiumMusic : FINAL PODIUM - starts automatically when the podium opens and plays ONCE (no repeat)
// Both are silent during the questions.
const homeMusic = { file: "assets/kahoot-lobby.mp3", volume: 1 };
const podiumMusic = { file: "assets/kahoot-podium.mp3", volume: 1 };

// RACE TO RICHES – podium timing (AUTO mode). Seconds into the podium music when each team starts to appear:
//   [ 4th AND 3rd place together, 2nd place, 1st place (champion) ]
// The card rises for about 2 seconds, so if you want it to LAND on a cheer, use a number about 2 seconds earlier.
const podiumCues = [3, 7.5, 13.5];
