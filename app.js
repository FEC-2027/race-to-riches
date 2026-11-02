/* RACE TO RICHES – game logic. Vanilla JS, no backend. State lives in localStorage. */
(() => {
'use strict';
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const KEY = 'rtr_state_v1', BGKEY = 'rtr_bg', MKEY = 'rtr_music';
const N = questions.length, COLORS = ['blue', 'yellow', 'green', 'red'], BTNS = [10, 30, 60, 100];

/* ---------- State ---------- */
const fresh = () => ({
  names: ['TEAM 1', 'TEAM 2', 'TEAM 3', 'TEAM 4'], pre: 10, ans: 20, vol: 0.6, mute: false, fs: false,
  q: 0, hist: Array.from({ length: N }, () => [0, 0, 0, 0]),
  seqs: Array.from({ length: N }, () => [{}, {}, {}, {}]), adj: [0, 0, 0, 0], podium: [], started: false
});
let S = fresh();
try { const r = JSON.parse(localStorage.getItem(KEY)); if (r && r.hist && r.hist.length === N) S = Object.assign(fresh(), r); } catch (e) {}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };
const total = t => S.hist.reduce((a, h) => a + h[t], 0) + S.adj[t];
let phase = 'preview', tm = null, timerId = null, undoStack = [], prevScreen = 'home';

/* ---------- Responsive fitting ---------- */
function setVh() { document.documentElement.style.setProperty('--vh', (window.visualViewport ? visualViewport.height : innerHeight) * 0.01 + 'px'); }
function setBar() { document.documentElement.style.setProperty('--bar', document.body.classList.contains('ingame') ? $('#bar').offsetHeight + 'px' : '0px'); }
function fitQ() { // shrink very long questions until they fit the box during the big preview
  const q = $('#qbox'); q.style.fontSize = '';
  if (phase !== 'preview' || !$('#game').classList.contains('active')) return;
  let fs = parseFloat(getComputedStyle(q).fontSize), n = 0;
  while (q.scrollHeight > q.clientHeight + 2 && fs > 14 && n++ < 60) { fs *= 0.93; q.style.fontSize = fs + 'px'; }
}
function refit() { setVh(); setBar(); fitQ(); }
setVh(); window.addEventListener('resize', refit); window.addEventListener('orientationchange', () => setTimeout(refit, 250));
if (window.visualViewport) visualViewport.addEventListener('resize', refit);
if (window.ResizeObserver) new ResizeObserver(() => { setBar(); }).observe($('#bar'));
if (document.fonts && document.fonts.ready) document.fonts.ready.then(refit);

/* ---------- Helpers ---------- */
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.id); toast.id = setTimeout(() => t.classList.remove('show'), 1800); }
function show(id) {
  $$('.screen').forEach(s => s.classList.toggle('active', s.id === id));
  document.body.classList.toggle('ingame', id === 'game'); setBar();
  $('#mall').classList.toggle('dim', id !== 'home');
  $('#mall').classList.toggle('art', id === 'home' && !!artUrl);
  if (id !== 'podium') stopFx();
  prevScreen = id === 'score' ? prevScreen : id;
}
function animNum(el, to) {
  const from = el._v === undefined ? to : el._v; el._v = to; cancelAnimationFrame(el._r);
  const t0 = performance.now();
  (function step(now) { const p = Math.min(1, (now - t0) / 700); el.textContent = Math.round(from + (to - from) * p); if (p < 1) el._r = requestAnimationFrame(step); })(t0);
}

/* ---------- Background art & decorations ---------- */
let artUrl = null;
function setArt(url) { artUrl = url; $('#mall').style.setProperty('--art', url ? `url("${url}")` : 'none'); $('#mall').classList.toggle('art', !!url && $('#home').classList.contains('active')); }
(function loadArt() {
  const up = localStorage.getItem(BGKEY); if (up) return setArt(up);
  const im = new Image(); im.onload = () => setArt('assets/race-to-riches-bg.png'); im.src = 'assets/race-to-riches-bg.png';
})();
(function decor() {
  const c = $('#coins'); let h = '';
  for (let i = 0; i < 6; i++) h += `<div class="gem" style="left:${Math.random() * 95}%;top:${Math.random() * 85}%;font-size:${22 + Math.random() * 26}px;animation-delay:${-Math.random() * 6}s">${['💎', '👑', '✨', '💍', '⌚'][i % 5]}</div>`;
  c.innerHTML = h;
})();

/* ---------- Music ---------- */
const music = new Audio('assets/answering-music.mp3'); music.loop = true; music.preload = 'auto';
try { const m = localStorage.getItem(MKEY); if (m) music.src = m; } catch (e) {}
const applyVol = () => { music.volume = S.vol; music.muted = S.mute; };
function playMusic(restart) { applyVol(); if (restart) music.currentTime = 0; const p = music.play(); if (p) p.catch(() => toast('Music blocked or missing – click anywhere & resume')); }
function stopMusic() { music.pause(); try { music.currentTime = 0; } catch (e) {} }
function unlockAudio() { // called from a click so browsers allow later playback
  music.muted = true; const p = music.play(); const done = () => { music.pause(); music.currentTime = 0; applyVol(); };
  p ? p.then(done).catch(done) : done();
}

/* ---------- Timer (elapsed-time based, single instance) ---------- */
function stopTimer() { clearInterval(timerId); timerId = null; tm = null; }
function startPhase(name, secs) {
  stopTimer(); phase = name; tm = { name, endAt: performance.now() + secs * 1000, rem: secs * 1000, paused: false };
  $('#game').className = 'screen active p-' + name; setBar(); fitQ(); $('#bPause').textContent = 'PAUSE TIMER';
  setTimerText(secs); if (name === 'answer') playMusic(true); else stopMusic();
  timerId = setInterval(tick, 100); updateBar();
}
function setTimerText(sec) { const t = $('#timer'); t.textContent = sec; t.classList.toggle('warn', phase === 'answer' && sec <= 5 && sec > 0); t.classList.toggle('zero', sec === 0); }
function tick() {
  if (!tm || tm.paused) return;
  const rem = Math.max(0, tm.endAt - performance.now()); setTimerText(Math.ceil(rem / 1000));
  if (rem > 0) return;
  const n = tm.name; stopTimer();             // stop first => no double transitions
  if (n === 'preview') startPhase('answer', S.ans); else reveal();
}
function togglePause() {
  if (!tm) return;
  if (!tm.paused) { tm.rem = Math.max(0, tm.endAt - performance.now()); tm.paused = true; music.pause(); $('#bPause').textContent = 'RESUME TIMER'; }
  else { tm.endAt = performance.now() + tm.rem; tm.paused = false; if (tm.name === 'answer') playMusic(false); $('#bPause').textContent = 'PAUSE TIMER'; }
}

/* ---------- Question flow ---------- */
function beginQuestion(i) {
  stopTimer(); stopMusic(); S.q = i; undoStack = []; save(); show('game');
  const q = questions[i];
  $('#qnum').textContent = `QUESTION ${i + 1} / ${N}`; $('#qbox').textContent = q.question;
  $$('.ans').forEach(a => { a.classList.remove('win', 'dim'); a.querySelector('.atext').textContent = q.options[a.dataset.c]; });
  $('#scorepanel').innerHTML = ''; shown = []; startPhase('preview', S.pre);
}
function reveal() {
  stopTimer(); stopMusic(); phase = 'reveal'; $('#game').className = 'screen active p-reveal'; fitQ();
  const c = questions[S.q].correctAnswer;
  $$('.ans').forEach(a => { a.classList.toggle('win', a.dataset.c === c); a.classList.toggle('dim', a.dataset.c !== c); });
  $('#banner').textContent = `CORRECT ANSWER! ${c.toUpperCase()} – ${questions[S.q].options[c]}`;
  buildScore(); updateBar();
}
let shown = [];
function buildScore() {
  $('#scorepanel').innerHTML = S.names.map((n, t) => `<div class="team" id="team${t}"><div class="tname">${esc(n)}</div>
    <div class="tpts">This question<br><b id="cur${t}">0</b></div><div class="tpts">Total<br><b id="tot${t}">0</b></div>
    <div class="sbtns">${BTNS.map(b => `<button class="sbtn" data-t="${t}" data-b="${b}">+${b}<small id="nx${t}_${b}"></small></button>`).join('')}
    <button class="sbtn zero" data-t="${t}" data-b="0">0<small>reset</small></button></div></div>`).join('');
  $$('.sbtn').forEach(b => b.onclick = () => +b.dataset.b ? award(+b.dataset.t, +b.dataset.b) : zero(+b.dataset.t));
  refreshScore(true);
}
function refreshScore(init) {
  for (let t = 0; t < 4; t++) {
    animNum($('#cur' + t), S.hist[S.q][t]); animNum($('#tot' + t), total(t));
    BTNS.forEach(b => { const n = S.seqs[S.q][t][b] || 0; $(`#nx${t}_${b}`).textContent = n ? `next +${b * 2 ** n} (×${n})` : ''; });
  }
}
function award(t, b) {
  const seq = S.seqs[S.q][t], n = seq[b] || 0, pts = b * 2 ** n;
  undoStack.push({ q: S.q, t, pts: S.hist[S.q][t], seq: { ...seq } });
  S.hist[S.q][t] += pts; seq[b] = n + 1; save(); refreshScore();
  const el = $('#team' + t); el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); toast(`${S.names[t]}: +${pts}`);
}
function zero(t) {
  undoStack.push({ q: S.q, t, pts: S.hist[S.q][t], seq: { ...S.seqs[S.q][t] } });
  S.hist[S.q][t] = 0; S.seqs[S.q][t] = {}; save(); refreshScore(); toast(`${S.names[t]}: question points reset`);
}
function undo() {
  const u = undoStack.pop(); if (!u || u.q !== S.q) return toast('Nothing to undo');
  S.hist[u.q][u.t] = u.pts; S.seqs[u.q][u.t] = u.seq; save();
  if (phase === 'reveal') refreshScore(); toast('Last action undone');
}
function next() {
  if (phase !== 'reveal') return;
  if (S.q >= N - 1) { openPodium(); return; }
  beginQuestion(S.q + 1);
}
function prev() { if (S.q > 0) { beginQuestion(S.q - 1); toast('Previous question – scores kept'); } }
function restartQuestion() {
  S.hist[S.q] = [0, 0, 0, 0]; S.seqs[S.q] = [{}, {}, {}, {}]; beginQuestion(S.q);
}
function updateBar() { $('#bNext').disabled = phase !== 'reveal'; $('#bPause').disabled = phase === 'reveal'; $('#bSkip').disabled = phase === 'reveal'; $('#bUndo').disabled = phase !== 'reveal'; $('#bNext').textContent = S.q >= N - 1 ? 'FINAL PODIUM ▶' : 'NEXT QUESTION ▶'; }
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------- Start / navigation ---------- */
function startGame() {
  unlockAudio();
  const hasProg = S.started && (S.q > 0 || S.hist.some(h => h.some(v => v)));
  if (hasProg && !confirm('Continue the saved game?\nOK = continue, Cancel = start a new game')) { resetGame(); }
  S.started = true; if (S.fs) toggleFs(true);
  beginQuestion(S.q);
}
function resetGame() { stopTimer(); stopMusic(); const keep = { names: S.names, pre: S.pre, ans: S.ans, vol: S.vol, mute: S.mute, fs: S.fs }; S = Object.assign(fresh(), keep); S.started = true; undoStack = []; save(); }
function goHome() { stopTimer(); stopMusic(); show('home'); }
function toggleFs(force) {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen && document.documentElement.requestFullscreen().catch(() => {});
  else if (!force) document.exitFullscreen();
}

/* ---------- Scoreboard ---------- */
function openScore() { if (phase !== undefined && $('#game').classList.contains('active')) { stopMusicPauseOnly(); } renderScore(); const p = prevScreen; show('score'); prevScreen = p; }
function stopMusicPauseOnly() { if (tm && !tm.paused) togglePause(); } // freeze timer while scoreboard is open
function renderScore() {
  const order = [0, 1, 2, 3].sort((a, b) => total(b) - total(a));
  const rc = $('#rank'); rc.innerHTML = order.map((t, i) => `<div class="rcard"><div class="rk">#${i + 1}</div><div class="rn">${esc(S.names[t])}</div><div class="rs" data-v="${total(t)}">0</div></div>`).join('');
  $$('#rank .rs').forEach(e => animNum(e, +e.dataset.v));
  $('#hist').innerHTML = `<tr><th>TEAM</th>${questions.map((_, i) => `<th>Q${i + 1}</th>`).join('')}<th>ADJ</th><th>TOTAL</th></tr>` +
    order.map(t => `<tr><td>${esc(S.names[t])}</td>${S.hist.map(h => `<td>${h[t]}</td>`).join('')}<td>${S.adj[t]}</td><td class="tot">${total(t)}</td></tr>`).join('');
  $('#adjust').innerHTML = S.names.map((n, t) => `<span>${esc(n)}: <input type="number" id="adj${t}" value="0"> <button class="btn small" data-t="${t}">Apply adjustment</button></span>`).join('');
  $$('#adjust button').forEach(b => b.onclick = () => { const t = +b.dataset.t; S.adj[t] += parseInt($('#adj' + t).value, 10) || 0; save(); renderScore(); if (phase === 'reveal') refreshScore(); });
}
function closeScore() { if (prevScreen === 'game') { show('game'); if (tm && tm.paused) toast('Timer is paused – press RESUME'); } else show(prevScreen || 'home'); }

/* ---------- Settings ---------- */
function openSettings() {
  S.names.forEach((n, i) => $('#sName' + i).value = n);
  $('#sPre').value = S.pre; $('#sAns').value = S.ans; $('#sVol').value = S.vol; $('#sMute').checked = S.mute; $('#sFs').checked = S.fs; show('settings');
}
function saveSettings() {
  S.names = [0, 1, 2, 3].map(i => $('#sName' + i).value.trim() || 'TEAM ' + (i + 1));
  S.pre = Math.max(3, parseInt($('#sPre').value, 10) || 10); S.ans = Math.max(5, parseInt($('#sAns').value, 10) || 20);
  S.vol = +$('#sVol').value; S.mute = $('#sMute').checked; S.fs = $('#sFs').checked; applyVol(); save(); toast('Settings saved');
}
function readFile(f, cb) { const r = new FileReader(); r.onload = () => cb(r.result); r.readAsDataURL(f); }

/* ---------- Podium ---------- */
const RANKS = ['3rd', '2nd', '1st'], SLOT = ['p3', 'p2', 'p1'];
let podMode = 'auto', fx = null, fxRaf = 0, fxTimer = 0, lastAdded = -1;
function openPodium() { stopTimer(); stopMusic(); S.podium = []; lastAdded = -1; save(); show('podium'); renderPodium(); }
function renderPodium() {
  const p = S.podium, done = p.length === 3;
  const auto = podMode === 'auto', order = [0, 1, 2, 3].sort((x, y) => total(y) - total(x)), seq = [order[2], order[1], order[0]]; // 3rd, 2nd, 1st by score
  $('#btnPMode').textContent = auto ? 'SWITCH TO MANUAL PICK' : 'SWITCH TO AUTO (BY SCORE)';
  $('#pTitle').textContent = done ? 'CHAMPION!' : auto ? 'And the podium is…' : `Choose the ${RANKS[p.length]} place team`;
  $('#pChoices').innerHTML = done ? '' : auto ? `<button class="btn start" data-t="${seq[p.length]}">REVEAL ${RANKS[p.length].toUpperCase()} PLACE</button>`
    : [0, 1, 2, 3].filter(t => !p.includes(t)).map(t => `<button class="btn" data-t="${t}">${esc(S.names[t])}</button>`).join('');
  $$('#pChoices button').forEach(b => b.onclick = () => { if (S.podium.includes(+b.dataset.t)) return; S.podium.push(+b.dataset.t); lastAdded = S.podium.length - 1; save(); renderPodium(); });
  // DOM order: 3rd (left), 1st (centre), 2nd (right)
  $('#stage').innerHTML = [0, 2, 1].map(i => {
    const t = p[i], first = i === 2, cls = i === lastAdded ? '' : 'style="animation:none"';
    const card = t === undefined ? '' : `<div class="pcard ${first ? 'first' : ''}" ${cls}>${first ? '<span class="crown">👑</span>' : ''}${esc(S.names[t])}${first ? '<span class="champ">CHAMPION!</span>' : ''}</div>`;
    return `<div class="plat ${SLOT[i]}">${card}<span>${3 - i}</span></div>`;
  }).join('');
  stopFx(); if (p.length > 0 && p.length === lastAdded + 1) celebrate(p.length === 3 ? 2 : 1);
}
function undoPodium() { if (!S.podium.length) return; S.podium.pop(); lastAdded = -1; save(); renderPodium(); }
function stopFx() { cancelAnimationFrame(fxRaf); clearInterval(fxTimer); fxRaf = fxTimer = 0; fx = null; const c = $('#fx'); if (c) c.getContext('2d').clearRect(0, 0, c.width, c.height); $$('.spot').forEach(e => e.remove()); }
function celebrate(level) { // confetti, coin rain, fireworks-style bursts after the winner lands
  const c = $('#fx'); c.width = innerWidth; c.height = innerHeight; const g = c.getContext('2d'); const P = []; fx = true;
  if (level === 2) ['10%', '60%'].forEach(l => { const s = document.createElement('div'); s.className = 'spot'; s.style.left = l; $('#podium').appendChild(s); });
  const burst = (x, y, n, col) => { for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, v = 2 + Math.random() * 7; P.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: .12, life: 90, col, r: 3 }); } };
  const rain = n => { for (let i = 0; i < n; i++) P.push({ x: Math.random() * c.width, y: -20, vx: (Math.random() - .5) * 2, vy: 2 + Math.random() * 4, g: .03, life: 400, col: Math.random() < .5 ? '#ffd54a' : ['#ff4d6d', '#4da3ff', '#5be37d', '#fff'][i % 4], r: 4 + Math.random() * 6, coin: Math.random() < .4 }); };
  setTimeout(() => { if (!fx) return; if (level === 2) { rain(150); burst(c.width / 2, c.height * .3, 160, '#ffd54a'); } else { rain(90); burst(c.width / 2, c.height * .4, 70, '#ffd54a'); } }, level === 2 ? 2200 : 1300);
  if (level === 2) fxTimer = setInterval(() => { rain(8); if (Math.random() < .6) burst(Math.random() * c.width, Math.random() * c.height * .5, 50, ['#ffd54a', '#ff6b6b', '#7be0ff', '#fff'][Math.floor(Math.random() * 4)]); }, 700);
  (function loop() {
    g.clearRect(0, 0, c.width, c.height);
    for (let i = P.length - 1; i >= 0; i--) { const p = P[i]; p.x += p.vx; p.y += p.vy; p.vy += p.g; p.life--; if (p.life <= 0 || p.y > c.height + 30) { P.splice(i, 1); continue; }
      g.globalAlpha = Math.min(1, p.life / 40); g.fillStyle = p.col; g.beginPath(); if (p.coin) g.ellipse(p.x, p.y, p.r, p.r * Math.abs(Math.cos(p.life / 8)) + 1, 0, 0, 6.28); else g.rect(p.x, p.y, p.r, p.r); g.fill(); }
    if (P.length > 900) P.splice(0, P.length - 900);
    fxRaf = requestAnimationFrame(loop);
  })();
}

/* ---------- Wire up ---------- */
$('#btnStart').onclick = startGame;
$('#btnHomeScore').onclick = () => { prevScreen = 'home'; openScore(); };
$('#btnHomeSettings').onclick = openSettings;
$('#btnSave').onclick = saveSettings;
$('#btnSettingsHome').onclick = () => show('home');
$('#btnScoreBack').onclick = closeScore;
$('#btnMusicTest').onclick = () => { S.vol = +$('#sVol').value; S.mute = $('#sMute').checked; playMusic(true); };
$('#btnMusicStop').onclick = stopMusic;
$('#sVol').oninput = e => { S.vol = +e.target.value; applyVol(); };
$('#sMute').onchange = e => { S.mute = e.target.checked; applyVol(); };
$('#sMusic').onchange = e => { const f = e.target.files[0]; if (!f) return; music.src = URL.createObjectURL(f); readFile(f, d => { try { localStorage.setItem(MKEY, d); } catch (x) { toast('Music too large to remember after reload'); } }); toast('Music replaced'); };
$('#sBg').onchange = e => { const f = e.target.files[0]; if (!f) return; readFile(f, d => { try { localStorage.setItem(BGKEY, d); } catch (x) { toast('Image too large to save'); } setArt(d); toast('Background set'); }); };
$('#btnBgClear').onclick = () => { localStorage.removeItem(BGKEY); setArt(null); toast('Background removed'); };
$('#bPause').onclick = togglePause;
$('#bSkip').onclick = () => { if (phase !== 'reveal') reveal(); };
$('#bNext').onclick = next; $('#bPrev').onclick = prev; $('#bRestart').onclick = restartQuestion;
$('#bUndo').onclick = undo; $('#bScore').onclick = () => { prevScreen = 'game'; openScore(); };
$('#bFs').onclick = () => toggleFs(); $('#bHome').onclick = goHome;
$('#btnPUndo').onclick = undoPodium;
$('#btnPMode').onclick = () => { podMode = podMode === 'auto' ? 'manual' : 'auto'; S.podium = []; lastAdded = -1; renderPodium(); };
$('#bEnd').onclick = () => { if (confirm('End the quiz now and go to the final podium?')) openPodium(); };
$('#btnPRestart').onclick = () => { if (confirm('Erase all scores and restart the game?')) { resetGame(); beginQuestion(0); } };
$('#btnPHome').onclick = goHome;
document.addEventListener('visibilitychange', () => { if (document.hidden && tm && !tm.paused) togglePause(); });
window.addEventListener('resize', () => { const c = $('#fx'); if (fx) { c.width = innerWidth; c.height = innerHeight; } });
show('home');
})();
