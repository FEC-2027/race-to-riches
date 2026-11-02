(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const STORAGE_KEY = "raceToRiches_v1";
  const COLOURS = ["blue", "yellow", "green", "red"];
  const DEFAULTS = {
    teams: ["TEAM 1", "TEAM 2", "TEAM 3", "TEAM 4"],
    previewSeconds: 10, answerSeconds: 20, volume: 0.65, muted: false
  };
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const bank = Array.isArray(window.questions) ? window.questions : [];
  const safeQuestions = bank.length ? bank : [{
    question: "Add your questions in questions.js.", options: {blue:"A",yellow:"B",green:"C",red:"D"}, correctAnswer:"blue"
  }];
  const freshHistory = () => safeQuestions.map(() => [0,0,0,0]);
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); } catch {}
  let settings = {...DEFAULTS, ...(saved.settings || {})};
  let teamNames = Array.isArray(saved.teamNames) && saved.teamNames.length === 4 ? saved.teamNames : [...settings.teams];
  let totals = Array.isArray(saved.totals) && saved.totals.length === 4 ? saved.totals : [0,0,0,0];
  let history = Array.isArray(saved.history) && saved.history.length === safeQuestions.length ? saved.history : freshHistory();
  let questionIndex = Math.min(Math.max(0, Number(saved.questionIndex) || 0), safeQuestions.length - 1);
  let phase = "home";
  let timerMode = "preview";
  let remainingMs = settings.previewSeconds * 1000;
  let deadline = 0, ticker = null, paused = false;
  let currentPoints = [0,0,0,0];
  let reviewMode = false;
  let sequences = Array.from({length:4}, () => ({10:0,30:0,60:0,100:0}));
  let undoStack = [];
  let audioUrl = null, backgroundUrl = null;
  let podium = {third:null, second:null, first:null};
  let podiumStep = "third";
  const audio = $("answer-audio");

  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({settings,teamNames,totals,history,questionIndex}));
  }
  function showToast(message) {
    const el = $("toast"); el.textContent = message; el.classList.add("show");
    clearTimeout(showToast.timeout); showToast.timeout = setTimeout(() => el.classList.remove("show"), 2300);
  }
  function showScreen(name) {
    document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
    $(name + "-screen").classList.add("active");
    phase = name;
    $("round-indicator").textContent = name === "game" ? `QUESTION ${questionIndex+1} / ${safeQuestions.length}` : "ENGLISH CAMP";
  }
  function stopTimer() { if (ticker) clearInterval(ticker); ticker = null; }
  function stopAudio() { audio.pause(); try { audio.currentTime = 0; } catch {} }
  function pauseAudio() { audio.pause(); }
  function playAudio() {
    if (settings.muted || !audio.src) return;
    audio.volume = settings.volume;
    const p = audio.play(); if (p && p.catch) p.catch(() => showToast("Click START GAME once more to enable audio."));
  }
  function setTimer(seconds, mode) {
    stopTimer(); timerMode = mode; remainingMs = seconds * 1000; deadline = Date.now() + remainingMs; paused = false;
    updateTimerDisplay();
    ticker = setInterval(tick, 100);
    if (mode === "answer") playAudio(); else stopAudio();
    $("pause-button").disabled = false; $("resume-button").disabled = true;
  }
  function tick() {
    if (paused) return;
    remainingMs = Math.max(0, deadline - Date.now());
    updateTimerDisplay();
    if (remainingMs <= 0) {
      stopTimer();
      if (timerMode === "preview") beginAnswering();
      else if (timerMode === "answer") revealAnswer();
    }
  }
  function updateTimerDisplay() {
    const seconds = Math.ceil(remainingMs / 1000);
    if (timerMode === "preview") $("preview-timer").textContent = seconds;
    else $("answer-timer").textContent = seconds;
    $("answer-timer").classList.toggle("urgent", timerMode === "answer" && seconds <= 5);
    $("preview-timer").classList.toggle("urgent", timerMode === "preview" && seconds <= 3);
  }
  function currentQuestion() { return safeQuestions[questionIndex]; }
  function beginQuestion(index = questionIndex) {
    stopTimer(); stopAudio(); questionIndex = Math.max(0, Math.min(index, safeQuestions.length - 1));
    currentPoints = [0,0,0,0]; reviewMode = false; sequences = Array.from({length:4}, () => ({10:0,30:0,60:0,100:0})); undoStack = [];
    const q = currentQuestion();
    $("question-count").textContent = `QUESTION ${questionIndex+1} / ${safeQuestions.length}`;
    $("preview-question").textContent = q.question;
    $("answer-q-number").textContent = `Q${questionIndex+1}`;
    $("answer-question").textContent = q.question;
    COLOURS.forEach(c => { $("option-"+c).textContent = q.options[c]; $("reveal-"+c).textContent = q.options[c]; });
    $("preview-panel").classList.remove("hidden"); $("answer-layout").classList.add("hidden"); $("reveal-layout").classList.add("hidden");
    $("phase-label").textContent = "QUESTION PREVIEW";
    renderScoring();
    showScreen("game"); persist();
    setTimer(settings.previewSeconds, "preview");
  }
  function beginAnswering() {
    stopAudio(); $("preview-panel").classList.add("hidden"); $("answer-layout").classList.remove("hidden");
    $("reveal-layout").classList.add("hidden"); $("phase-label").textContent = "CHOOSE YOUR ANSWER ZONE";
    setTimer(settings.answerSeconds, "answer");
  }
  function revealAnswer() {
    stopTimer(); stopAudio(); remainingMs = 0;
    $("preview-panel").classList.add("hidden"); $("answer-layout").classList.add("hidden"); $("reveal-layout").classList.remove("hidden");
    $("phase-label").textContent = "ANSWER REVEAL & SCORING";
    const q = currentQuestion(); const correct = COLOURS.includes(q.correctAnswer) ? q.correctAnswer : "blue";
    $("correct-answer-copy").textContent = `${correct.toUpperCase()} — ${q.options[correct]}`;
    COLOURS.forEach(c => {
      const tile = document.querySelector(`#reveal-layout [data-colour="${c}"]`);
      tile.classList.toggle("correct", c === correct); tile.classList.toggle("dimmed", c !== correct);
    });
    renderScoring(); $("pause-button").disabled = true; $("resume-button").disabled = true;
  }
  function pauseTimer() {
    if (!ticker || paused) return;
    remainingMs = Math.max(0, deadline - Date.now()); paused = true; stopTimer(); pauseAudio(); updateTimerDisplay();
    $("pause-button").disabled = true; $("resume-button").disabled = false; showToast("Timer paused.");
  }
  function resumeTimer() {
    if (!paused) return;
    paused = false; deadline = Date.now() + remainingMs; ticker = setInterval(tick,100);
    if (timerMode === "answer") { audio.volume = settings.volume; if (!settings.muted) audio.play().catch(()=>{}); }
    $("pause-button").disabled = false; $("resume-button").disabled = true;
  }
  function renderScoring() {
    $("team-scoring").innerHTML = teamNames.map((name,i) => `
      <article class="team-card">
        <h3>${escapeHTML(name)}</h3>
        <div class="team-points">${currentPoints[i].toLocaleString()}</div>
        <div class="team-total">TOTAL ${totals[i].toLocaleString()}</div>
        <div class="score-buttons">
          <button data-score="${i}:0" title="Reset current question" ${reviewMode?"disabled":""}>0</button>
          <button data-score="${i}:10" ${reviewMode?"disabled":""}>+10</button><button data-score="${i}:30" ${reviewMode?"disabled":""}>+30</button>
          <button data-score="${i}:60" ${reviewMode?"disabled":""}>+60</button><button data-score="${i}:100" ${reviewMode?"disabled":""}>+100</button>
        </div>
      </article>`).join("");
    $("team-scoring").querySelectorAll("[data-score]").forEach(btn => btn.addEventListener("click", () => award(...btn.dataset.score.split(":").map(Number))));
  }
  function award(team, base) {
    if (phase !== "game" || $("reveal-layout").classList.contains("hidden") || reviewMode) return;
    const before = {current:[...currentPoints], totals:[...totals], sequences:clone(sequences)};
    if (base === 0) {
      totals[team] = Math.max(0, totals[team] - currentPoints[team]);
      currentPoints[team] = 0;
      sequences[team] = {10:0,30:0,60:0,100:0};
    } else {
      const multiplier = 2 ** sequences[team][base];
      const points = base * multiplier;
      currentPoints[team] += points; totals[team] += points; sequences[team][base] += 1;
      showToast(`${teamNames[team]} +${points.toLocaleString()} points!`);
    }
    undoStack.push(before); renderScoring(); persist();
  }
  function undo() {
    const before = undoStack.pop(); if (!before) return showToast("Nothing to undo.");
    currentPoints = before.current; totals = before.totals; sequences = before.sequences;
    renderScoring(); persist(); showToast("Last scoring action undone.");
  }
  function commitQuestion() {
    history[questionIndex] = [...currentPoints];
    if (questionIndex >= safeQuestions.length - 1) {
      persist(); stopTimer(); stopAudio(); startPodium(); return;
    }
    questionIndex++; persist(); beginQuestion(questionIndex);
  }
  function previousQuestion() {
    if (questionIndex === 0) return showToast("You are already at Question 1.");
    stopTimer(); stopAudio(); questionIndex--;
    currentPoints = [...(history[questionIndex] || [0,0,0,0])];
    reviewMode = true; sequences = Array.from({length:4}, () => ({10:0,30:0,60:0,100:0})); undoStack = [];
    const q = currentQuestion();
    $("question-count").textContent = `QUESTION ${questionIndex+1} / ${safeQuestions.length}`;
    $("preview-question").textContent = q.question;
    $("answer-q-number").textContent = `Q${questionIndex+1}`;
    $("answer-question").textContent = q.question;
    COLOURS.forEach(c => { $("option-"+c).textContent=q.options[c]; $("reveal-"+c).textContent=q.options[c]; });
    $("preview-panel").classList.add("hidden"); $("answer-layout").classList.add("hidden"); $("reveal-layout").classList.remove("hidden");
    $("phase-label").textContent = "REVIEW — PREVIOUS QUESTION";
    const correct = COLOURS.includes(q.correctAnswer) ? q.correctAnswer : "blue";
    $("correct-answer-copy").textContent = `${correct.toUpperCase()} — ${q.options[correct]}`;
    COLOURS.forEach(c => {
      const tile=document.querySelector(`#reveal-layout [data-colour="${c}"]`);
      tile.classList.toggle("correct",c===correct); tile.classList.toggle("dimmed",c!==correct);
    });
    renderScoring(); showScreen("game"); $("pause-button").disabled=true; $("resume-button").disabled=true;
  }
  function restartCurrentQuestion() {
    // Remove this question's already-awarded points before starting it again.
    if (reviewMode) {
      for (let i=0;i<4;i++) totals[i]=Math.max(0,totals[i]-(history[questionIndex]?.[i]||0));
      history[questionIndex]=[0,0,0,0];
    } else {
      for (let i=0;i<4;i++) totals[i]=Math.max(0,totals[i]-currentPoints[i]);
    }
    currentPoints=[0,0,0,0]; reviewMode=false; persist(); beginQuestion(questionIndex);
  }
  function renderLeaderboard() {
    const ranking = teamNames.map((name,i)=>({name,score:totals[i],i})).sort((a,b)=>b.score-a.score);
    $("leaderboard").innerHTML = ranking.map((t,rank)=>`
      <article class="leader-card ${rank===0?'rank-1':''}">
        <div class="leader-rank">${["♛ 1ST","2ND","3RD","4TH"][rank]}</div>
        <div class="leader-name">${escapeHTML(t.name)}</div><div class="leader-score">${t.score.toLocaleString()}</div>
        <label>Adjust total score<input type="number" data-adjust="${t.i}" value="${t.score}"></label>
      </article>`).join("");
    $("leaderboard").querySelectorAll("[data-adjust]").forEach(input=>input.addEventListener("change",()=>{
      const i=Number(input.dataset.adjust), value=Math.max(0,Number(input.value)||0);
      const old=totals[i]; totals[i]=value;
      const historySum=history.reduce((sum,row)=>sum+(Number(row[i])||0),0);
      // Score adjustment is stored as an offset in totals; history remains a question-by-question record.
      persist(); renderLeaderboard(); showToast(`${teamNames[i]} total adjusted (${old} → ${value}).`);
    }));
    const head = `<tr><th>TEAM</th>${safeQuestions.map((_,i)=>`<th>Q${i+1}</th>`).join("")}<th>TOTAL</th></tr>`;
    $("history-table").querySelector("thead").innerHTML = head;
    $("history-table").querySelector("tbody").innerHTML = teamNames.map((name,i)=>{
      const cells=history.map(row=>`<td>${Number(row[i]||0).toLocaleString()}</td>`).join("");
      return `<tr><td>${escapeHTML(name)}</td>${cells}<td><b>${totals[i].toLocaleString()}</b></td></tr>`;
    }).join("");
  }
  function openScoreboard() {
    if (phase === "game" && ticker && !paused) pauseTimer();
    renderLeaderboard(); showScreen("scoreboard");
  }
  function returnGame() { showScreen("game"); if (paused) resumeTimer(); }
  function buildSettings() {
    $("team-name-fields").innerHTML = teamNames.map((n,i)=>`<label>Team ${i+1}<input id="team-name-${i}" maxlength="24" value="${escapeAttr(n)}"></label>`).join("");
    $("preview-duration").value=settings.previewSeconds; $("answer-duration").value=settings.answerSeconds;
    $("music-volume").value=Math.round(settings.volume*100); $("volume-value").textContent=Math.round(settings.volume*100)+"%";
    $("music-muted").checked=settings.muted;
    $("music-status").textContent=audio.src?"Custom answering track selected.":"No custom track selected.";
  }
  function saveSettings() {
    teamNames=teamNames.map((_,i)=>($("team-name-"+i).value.trim()||`TEAM ${i+1}`).toUpperCase());
    settings.previewSeconds=clamp(Number($("preview-duration").value)||10,3,60);
    settings.answerSeconds=clamp(Number($("answer-duration").value)||20,5,120);
    settings.volume=Number($("music-volume").value)/100; settings.muted=$("music-muted").checked;
    audio.volume=settings.volume; persist(); buildSettings(); showToast("Settings saved.");
  }
  function startPodium() {
    stopTimer(); stopAudio(); podium={third:null,second:null,first:null}; podiumStep="third";
    ["third","second","first"].forEach(k=>{$("podium-"+k).textContent=({third:"3RD PLACE",second:"2ND PLACE",first:"1ST PLACE"})[k];});
    $("champion-banner").classList.add("hidden"); showScreen("podium"); renderPodiumChoices();
  }
  function renderPodiumChoices() {
    const labels={third:"third place",second:"second place",first:"first place"};
    $("podium-instruction").textContent=podiumStep==="done"?"The podium is complete!":`Choose the team taking ${labels[podiumStep]}.`;
    const used=Object.values(podium).filter(Boolean);
    $("podium-choices").innerHTML=podiumStep==="done"?"":teamNames.map((name,i)=>used.includes(i)?"":`<button data-podium="${i}">${escapeHTML(name)}</button>`).join("");
    $("podium-choices").querySelectorAll("[data-podium]").forEach(btn=>btn.addEventListener("click",()=>selectPodium(Number(btn.dataset.podium))));
  }
  function selectPodium(team) {
    if (Object.values(podium).includes(team)) return;
    podium[podiumStep]=team;
    $("podium-"+podiumStep).textContent=teamNames[team];
    $("podium-"+podiumStep).classList.add("landed");
    if (podiumStep==="third") podiumStep="second";
    else if (podiumStep==="second") podiumStep="first";
    else {
      podiumStep="done"; $("champion-name").textContent=teamNames[team];
      $("champion-banner").classList.remove("hidden");
      showToast("A new champion has been crowned!");
    }
    renderPodiumChoices();
  }
  function undoPodium() {
    if (podiumStep === "done") {
      podium.first = null; $("podium-first").textContent = "1ST PLACE";
      $("champion-banner").classList.add("hidden"); podiumStep = "first";
    } else if (podiumStep === "first" && podium.second !== null) {
      podium.second = null; $("podium-second").textContent = "2ND PLACE"; podiumStep = "second";
    } else if (podiumStep === "second" && podium.third !== null) {
      podium.third = null; $("podium-third").textContent = "3RD PLACE"; podiumStep = "third";
    } else return showToast("There is no podium selection to undo.");
    renderPodiumChoices();
  }
  function restartGame() {
    stopTimer(); stopAudio(); totals=[0,0,0,0]; history=freshHistory(); questionIndex=0;
    currentPoints=[0,0,0,0]; persist(); beginQuestion(0);
  }
  function exportCSV() {
    const rows=[["TEAM",...safeQuestions.map((_,i)=>`Q${i+1}`),"TOTAL"]];
    teamNames.forEach((name,i)=>rows.push([name,...history.map(r=>r[i]||0),totals[i]]));
    const csv=rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
    const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));a.download="race-to-riches-score-history.csv";a.click();URL.revokeObjectURL(a.href);
  }
  function escapeHTML(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
  function escapeAttr(s){return escapeHTML(s);}
  function clamp(n,min,max){return Math.max(min,Math.min(max,n));}
  function handleAction(action) {
    switch(action){
      case "home": stopTimer();stopAudio();showScreen("home");break;
      case "start": beginQuestion(0);break;
      case "settings": buildSettings();showScreen("settings");break;
      case "scoreboard": openScoreboard();break;
      case "return-game": returnGame();break;
      case "pause": pauseTimer();break;
      case "resume": resumeTimer();break;
      case "skip": revealAnswer();break;
      case "restart-question": restartCurrentQuestion();break;
      case "previous": previousQuestion();break;
      case "undo": undo();break;
      case "next": if(!$("reveal-layout").classList.contains("hidden")) commitQuestion();break;
      case "save-settings": saveSettings();break;
      case "preview-music": if(audio.src){audio.currentTime=0;audio.volume=settings.volume;audio.play().catch(()=>showToast("Your browser blocked audio preview."));}else showToast("Upload an MP3 first.");break;
      case "stop-music": stopAudio();break;
      case "clear-background": if(backgroundUrl)URL.revokeObjectURL(backgroundUrl);backgroundUrl=null;document.body.classList.remove("custom-background");document.body.style.backgroundImage="";showToast("Default night theme restored.");break;
      case "export":exportCSV();break;
      case "restart-game":restartGame();break;
      case "undo-podium":undoPodium();break;
      case "fullscreen":if(!document.fullscreenElement)document.documentElement.requestFullscreen?.();else document.exitFullscreen?.();break;
    }
  }
  document.addEventListener("click",e=>{const btn=e.target.closest("[data-action]");if(btn)handleAction(btn.dataset.action);});
  $("music-volume").addEventListener("input",e=>{$("volume-value").textContent=e.target.value+"%";audio.volume=Number(e.target.value)/100;});
  $("music-upload").addEventListener("change",e=>{
    const file=e.target.files[0];if(!file)return;
    if(audioUrl)URL.revokeObjectURL(audioUrl);audioUrl=URL.createObjectURL(file);audio.src=audioUrl;
    $("music-status").textContent=`Selected: ${file.name}`;showToast("Answering music loaded.");
  });
  $("background-upload").addEventListener("change",e=>{
    const file=e.target.files[0];if(!file)return;
    if(backgroundUrl)URL.revokeObjectURL(backgroundUrl);backgroundUrl=URL.createObjectURL(file);
    document.body.style.backgroundImage=`linear-gradient(rgba(4,8,15,.72),rgba(4,8,15,.82)),url("${backgroundUrl}")`;
    document.body.classList.add("custom-background");showToast("Background updated.");
  });
  document.addEventListener("keydown",e=>{
    if(e.key==="Escape" && document.fullscreenElement)document.exitFullscreen?.();
    if(e.code==="Space" && phase==="game"){e.preventDefault();if(paused)resumeTimer();else pauseTimer();}
  });
  function makeDecorations(){
    const coinLayer=$("coin-layer"),sparkles=$("sparkle-layer");
    for(let i=0;i<17;i++){const c=document.createElement("span");c.className="coin";c.textContent=["◉","◈","✦"][i%3];c.style.left=(Math.random()*100)+"%";c.style.top=(Math.random()*100)+"%";c.style.setProperty("--duration",(5+Math.random()*8)+"s");c.style.animationDelay=(-Math.random()*8)+"s";coinLayer.append(c);}
    for(let i=0;i<26;i++){const s=document.createElement("span");s.className="sparkle";s.textContent="✧";s.style.left=(Math.random()*100)+"%";s.style.top=(Math.random()*100)+"%";s.style.animationDelay=(Math.random()*3)+"s";sparkles.append(s);}
  }
  function loadOptionalAssets() {
    fetch("assets/race-to-riches-bg.png", {method:"HEAD"}).then(r => {
      if (r.ok && !backgroundUrl) {
        document.body.style.backgroundImage='linear-gradient(rgba(4,8,15,.72),rgba(4,8,15,.82)),url("assets/race-to-riches-bg.png")';
        document.body.classList.add("custom-background");
      }
    }).catch(()=>{});
    fetch("assets/answering-music.mp3", {method:"HEAD"}).then(r => {
      if (r.ok && !audioUrl) { audio.src="assets/answering-music.mp3"; $("music-status").textContent="Loaded assets/answering-music.mp3"; }
    }).catch(()=>{});
  }
  makeDecorations(); buildSettings(); loadOptionalAssets(); persist();
  // If the page is refreshed mid-game, resume safely at the saved question's preview.
  showScreen("home");
})();