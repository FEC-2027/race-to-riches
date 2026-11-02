// RACE TO RICHES – edit questions here. correctAnswer: "blue" | "yellow" | "green" | "red"
const questions = [
  { question: "What is the opposite of 'expensive'?", options: { blue: "Cheap", yellow: "Heavy", green: "Late", red: "Quiet" }, correctAnswer: "blue" },
  { question: "Which word means a place where you buy things?", options: { blue: "Library", yellow: "Shop", green: "Stadium", red: "Airport" }, correctAnswer: "yellow" },
  { question: "Choose the correct sentence.", options: { blue: "She go to school.", yellow: "She going school.", green: "She goes to school.", red: "She goed to school." }, correctAnswer: "green" },
  { question: "What is the past tense of 'buy'?", options: { blue: "Buyed", yellow: "Bought", green: "Boughten", red: "Buys" }, correctAnswer: "yellow" },
  { question: "How many days are in a week?", options: { blue: "Five", yellow: "Six", green: "Seven", red: "Eight" }, correctAnswer: "green" },
  { question: "Which one is a fruit?", options: { blue: "Carrot", yellow: "Potato", green: "Onion", red: "Mango" }, correctAnswer: "red" },
  { question: "'I ___ a student.' Fill in the blank.", options: { blue: "am", yellow: "is", green: "are", red: "be" }, correctAnswer: "blue" },
  { question: "What colour do you get from mixing blue and yellow?", options: { blue: "Purple", yellow: "Orange", green: "Green", red: "Brown" }, correctAnswer: "green" },
  { question: "Which word is a synonym of 'big'?", options: { blue: "Tiny", yellow: "Huge", green: "Thin", red: "Short" }, correctAnswer: "yellow" },
  { question: "What do you use to tell the time?", options: { blue: "A watch", yellow: "A spoon", green: "A pillow", red: "A ticket" }, correctAnswer: "blue" },
  { question: "Choose the plural of 'child'.", options: { blue: "Childs", yellow: "Childes", green: "Children", red: "Childrens" }, correctAnswer: "green" },
  { question: "Which month comes after March?", options: { blue: "May", yellow: "February", green: "June", red: "April" }, correctAnswer: "red" },
  { question: "'She is ___ than her sister.' (tall)", options: { blue: "taller", yellow: "tallest", green: "more tall", red: "tallier" }, correctAnswer: "blue" },
  { question: "Which jewel is clear and very hard?", options: { blue: "Pearl", yellow: "Diamond", green: "Coal", red: "Pebble" }, correctAnswer: "yellow" },
  { question: "What is the opposite of 'rich'?", options: { blue: "Happy", yellow: "Fast", green: "Poor", red: "Kind" }, correctAnswer: "green" },
  { question: "Which sentence is a question?", options: { blue: "I like pizza.", yellow: "Close the door.", green: "What a nice day!", red: "Where do you live?" }, correctAnswer: "red" },
  { question: "'There ___ two apples on the table.'", options: { blue: "are", yellow: "is", green: "am", red: "be" }, correctAnswer: "blue" },
  { question: "Which word has the SAME sound as 'two'?", options: { blue: "Tow", yellow: "Too", green: "Toe", red: "Tie" }, correctAnswer: "yellow" },
  { question: "What do we call money in coins and notes?", options: { blue: "Weather", yellow: "Furniture", green: "Cash", red: "Fashion" }, correctAnswer: "green" },
  { question: "Which is the correct spelling?", options: { blue: "Recieve", yellow: "Receve", green: "Receeve", red: "Receive" }, correctAnswer: "red" }
];

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
// If a file is missing, that sound is simply skipped (the game keeps working).
const soundFiles = {
  gong: "assets/kahoot-gong.mp3",
  points: "assets/kahoot-point.mp3",
};

// RACE TO RICHES – background music (volume: 0 = silent ... 1 = full; keep it lower than the applause so cheers can be heard).
//   homeMusic   : HOMEPAGE (and Settings) - loops until you start the game
//   podiumMusic : FINAL PODIUM - starts automatically when the podium opens and plays ONCE (no repeat)
// Both are silent during the questions.
const homeMusic = { file: "assets/kahoot-lobby.mp3", volume: 0.8 };
const podiumMusic = { file: "assets/kahoot-podium.mp3", volume: 0.5 };
