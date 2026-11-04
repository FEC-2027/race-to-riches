/* RACE TO RICHES – game logic. Vanilla JS, no backend. State lives in localStorage. */
(() => {
'use strict';
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const KEY = 'rtr_state_v1';
const N = questions.length, COLORS = ['blue', 'yellow', 'green', 'red'], BTNS = [10, 30, 60, 100];

/* ---------- State ---------- */
const fresh = () => ({
  names: ['TEAM 1', 'TEAM 2', 'TEAM 3', 'TEAM 4'], pre: 10, ans: 20, vol: 0.6, mute: false, fs: false,
  q: 0, hist: Array.from({ length: N }, () => [0, 0, 0, 0]),
  seqs: Array.from({ length: N }, () => [{}, {}, {}, {}]), podium: [], started: false
});
let S = fresh();
try { const r = JSON.parse(localStorage.getItem(KEY)); if (r && r.hist && r.hist.length === N) S = Object.assign(fresh(), r); } catch (e) {}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };
const total = t => S.hist.reduce((a, h) => a + h[t], 0) ;
let phase = 'preview', tm = null, timerId = null, undoStack = [];

/* ---------- Responsive fitting ---------- */
function setVh() { document.documentElement.style.setProperty('--vh', (window.visualViewport ? visualViewport.height : innerHeight) * 0.01 + 'px'); }
function setBar() { document.documentElement.style.setProperty('--bar', document.body.classList.contains('ingame') ? $('#bar').offsetHeight + 'px' : '0px'); }
function fitQ() { // preview: make the question as LARGE as possible while still fitting its box
  const q = $('#qbox'); q.style.fontSize = '';
  if (phase !== 'preview' || !$('#game').classList.contains('active')) return;
  const vh = (window.visualViewport ? visualViewport.height : innerHeight) / 100;
  let fs = Math.min(innerWidth * 0.11, vh * 22), n = 0; q.style.fontSize = fs + 'px';
  const floor = Math.max(28, vh * 7); if (q.clientHeight < 60) return;
  while (q.scrollHeight > q.clientHeight + 2 && fs > floor && n++ < 80) { fs *= 0.95; q.style.fontSize = fs + 'px'; }
}
function refit() { setVh(); setBar(); fitQ(); requestAnimationFrame(fitQ); setTimeout(fitQ, 400); }
setVh(); window.addEventListener('resize', refit); window.addEventListener('orientationchange', () => setTimeout(refit, 250));
if (window.visualViewport) visualViewport.addEventListener('resize', refit);
if (window.ResizeObserver) { new ResizeObserver(() => { setBar(); }).observe($('#bar')); new ResizeObserver(() => { if (phase === 'preview') fitQ(); }).observe($('#qbox')); }
if (document.fonts && document.fonts.ready) document.fonts.ready.then(refit);

/* ---------- Helpers ---------- */
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.id); toast.id = setTimeout(() => t.classList.remove('show'), 1800); }
function show(id) {
  $$('.screen').forEach(s => s.classList.toggle('active', s.id === id));
  document.body.classList.toggle('ingame', id === 'game'); setBar();
  $('#mall').classList.toggle('dim', id !== 'home');
  $('#mall').classList.toggle('art', id === 'home' && !!artUrl);
  if (id !== 'podium') { stopFx(); clearTimeout(podTimer); stopSfx(['applause']); }
  if (id === 'game') { stopHome(); stopPodMusic(); }                       // silent during questions
  else if (id === 'podium') { stopHome(); playPodMusic(); }                 // podium tune plays once, automatically
  else { stopPodMusic(); playHome(); }                                       // lobby tune on home / settings
  if (id === 'home') startCash(); else stopCash();                            // falling cash only on the homepage
}
function animNum(el, to) {
  const from = el._v === undefined ? to : el._v; el._v = to; cancelAnimationFrame(el._r);
  const t0 = performance.now();
  (function step(now) { const p = Math.min(1, (now - t0) / 700); el.textContent = Math.round(from + (to - from) * p); if (p < 1) el._r = requestAnimationFrame(step); })(t0);
}

/* ---------- Background art & decorations ---------- */
let artUrl = null;
function setArt(url) { artUrl = url; $('#mall').style.setProperty('--art', url ? `url("${url}")` : 'none'); $('#mall').classList.toggle('art', !!url && $('#home').classList.contains('active')); }
(function loadArt() { const im = new Image(); im.onload = () => setArt('assets/race-to-riches-bg.png'); im.src = 'assets/race-to-riches-bg.png'; })();

/* ---------- Music: 3 embedded tracks, random per question ---------- */
const tracks = (typeof musicFiles !== 'undefined' ? musicFiles : []).map(src => { const t = new Audio(src); t.loop = true; t.preload = 'auto'; t.volume = 1; return t; });
let bag = [], cur = null;
function pickTrack() { // shuffled "bag" so every track plays once before any repeats
  if (!tracks.length) return null;
  if (!bag.length) {
    bag = tracks.map((_, i) => i);
    for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; }
    if (cur && bag.length > 1 && bag[0] === tracks.indexOf(cur)) bag.push(bag.shift());
  }
  return tracks[bag.shift()];
}
function stopMusic() { tracks.forEach(t => { t.pause(); try { t.currentTime = 0; } catch (e) {} }); }
function playMusic() { stopMusic(); cur = pickTrack(); if (!cur) return; const p = cur.play(); if (p) p.catch(() => toast('Music could not play – check the audio files in assets/')); }
function unlockAudio() { // called from the START click so iPad/Chrome allow playback later
  [...tracks, ...Object.values(sfx), bgHome, bgPod].forEach(t => { t.muted = true; const p = t.play(); const done = () => { t.pause(); try { t.currentTime = 0; } catch (e) {} t.muted = false; }; p ? p.then(done).catch(done) : done(); });
}

/* ---------- Sound effects: gong (answer reveal), points (+ buttons), applause (podium) ---------- */
const sfxFiles = Object.assign({ gong: 'assets/kahoot-gong.mp3', points: 'assets/kahoot-point.mp3' }, typeof soundFiles !== 'undefined' ? soundFiles : {});
const sfx = {};
Object.keys(sfxFiles).forEach(k => { const a = new Audio(sfxFiles[k]); a.preload = 'auto'; a.volume = 1; sfx[k] = a; });
function playSfx(name) { // restarts from the beginning each time, so fast repeated clicks still sound
  const a = sfx[name]; if (!a || S.mute) return;
  try { a.pause(); a.currentTime = 0; } catch (e) {}
  const p = a.play(); if (p) p.catch(() => {});
}
/* ---------- Background music: homepage (loops) + podium (plays once, automatically). Own audio elements, never touched by countdown tracks or sound effects ---------- */
const homeCfg = Object.assign({ file: 'assets/kahoot-lobby.mp3', volume: 0.5 }, typeof homeMusic !== 'undefined' ? homeMusic : {});
const podCfg = Object.assign({ file: 'assets/kahoot-podium.mp3', volume: 0.5 }, typeof podiumMusic !== 'undefined' ? podiumMusic : {});
const vol01 = v => Math.min(1, Math.max(0, Number(v) || 0)); // browsers throw an error for volume outside 0-1, which used to freeze every button
const bgHome = new Audio(homeCfg.file); bgHome.loop = true; bgHome.preload = 'auto'; bgHome.volume = vol01(homeCfg.volume);
const bgPod = new Audio(podCfg.file); bgPod.loop = false; bgPod.preload = 'auto'; bgPod.volume = vol01(podCfg.volume);
let homeWant = false;
function playHome() { homeWant = true; if (S.mute || !bgHome.paused) return; const p = bgHome.play(); if (p) p.catch(() => {}); } // already playing => keeps going
function stopHome() { homeWant = false; bgHome.pause(); try { bgHome.currentTime = 0; } catch (e) {} }
function playPodMusic() { try { bgPod.pause(); bgPod.currentTime = 0; } catch (e) {} if (S.mute) return; const p = bgPod.play(); if (p) p.catch(() => {}); } // once, from the start
function stopPodMusic() { bgPod.pause(); try { bgPod.currentTime = 0; } catch (e) {} }
// Browsers block autoplay on a fresh page, so the homepage music starts on the first click/key press (but not on the START click itself)
['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, e => {
  if (homeWant && bgHome.paused && !S.mute && !(e.target.closest && e.target.closest('#btnStart'))) { const p = bgHome.play(); if (p) p.catch(() => {}); }
}));
function stopSfx(names) { (names || Object.keys(sfx)).forEach(k => { const a = sfx[k]; if (a) { a.pause(); try { a.currentTime = 0; } catch (e) {} } }); }

/* ---------- Timer (elapsed-time based, single instance) ---------- */
function stopTimer() { clearInterval(timerId); timerId = null; tm = null; }
function startPhase(name, secs) {
  stopTimer(); phase = name; tm = { name, endAt: performance.now() + secs * 1000, rem: secs * 1000, paused: false };
  $('#game').className = 'screen active p-' + name; setBar(); fitQ(); requestAnimationFrame(fitQ); setTimeout(fitQ, 400);
  setTimerText(secs); if (name === 'answer') playMusic(); else stopMusic();
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
/* ---------- Question flow ---------- */
function beginQuestion(i) {
  stopTimer(); stopMusic(); stopSfx(); S.q = i; undoStack = []; save(); show('game');
  const q = questions[i];
  $('#qnum').textContent = `QUESTION ${i + 1} / ${N}`; $('#qbox').textContent = q.question;
  $$('.ans').forEach(a => { a.classList.remove('win', 'dim'); a.querySelector('.atext').textContent = q.options[a.dataset.c]; });
  $('#scorepanel').innerHTML = ''; shown = []; startPhase('preview', S.pre);
}
function reveal() {
  stopTimer(); stopMusic(); stopSfx(); playSfx('gong'); phase = 'reveal'; $('#game').className = 'screen active p-reveal'; fitQ();
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
  S.hist[S.q][t] += pts; seq[b] = n + 1; save(); refreshScore(); playSfx('points');
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
function updateBar() { $('#bNext').disabled = phase !== 'reveal'; $('#bSkip').disabled = phase === 'reveal'; $('#bNext').textContent = S.q >= N - 1 ? 'FINAL PODIUM ▶' : 'NEXT QUESTION ▶'; }
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------- Start / navigation ---------- */
function startGame() {
  unlockAudio();
  const hasProg = S.started && (S.q > 0 || S.hist.some(h => h.some(v => v)));
  if (hasProg && !confirm('Continue the saved game?\nOK = continue, Cancel = start a new game')) { resetGame(); }
  S.started = true; 
  beginQuestion(S.q);
}
function resetGame() { stopTimer(); stopMusic(); stopSfx(); const keep = { names: S.names }; S = Object.assign(fresh(), keep); S.started = true; undoStack = []; save(); }
function goHome() { clearTimeout(podTimer); stopTimer(); stopMusic(); stopSfx(); show('home'); }
function toggleFs() {
  const d = document, el = d.documentElement, on = d.fullscreenElement || d.webkitFullscreenElement;
  try {
    if (!on) { const f = el.requestFullscreen || el.webkitRequestFullscreen; f ? f.call(el) : toast('Full-screen is not available here – on iPad use Share > Add to Home Screen'); }
    else (d.exitFullscreen || d.webkitExitFullscreen).call(d);
  } catch (e) {}
}

/* ---------- Settings ---------- */
function openSettings() { S.names.forEach((n, i) => $('#sName' + i).value = n); show('settings'); }
function saveSettings() { S.names = [0, 1, 2, 3].map(i => $('#sName' + i).value.trim() || 'TEAM ' + (i + 1)); save(); toast('Team names saved'); }

/* ---------- Podium ---------- */
const RANKS = ['4th', '3rd', '2nd', '1st'], SLOT = ['p4', 'p3', 'p2', 'p1'];
let podMode = 'auto', autoRun = true, podTimer = 0, fx = null, fxRaf = 0, fxTimer = 0, lastAdded = -1, newFrom = -1;
function openPodium() { stopTimer(); stopMusic(); stopSfx(); podMode = 'auto'; autoRun = true; S.podium = []; lastAdded = -1; save(); podStart = performance.now(); show('podium'); renderPodium(); }
let podStart = 0; // when the podium tune was started (fallback clock if the audio cannot play)
const podCues = (typeof podiumCues !== 'undefined' && podiumCues.length === 3) ? podiumCues : [3, 7.5, 13.5]; // seconds into the podium tune: 3rd, 2nd, 1st appear
function podClock() { return (!bgPod.paused && bgPod.currentTime > 0) ? bgPod.currentTime : (performance.now() - podStart) / 1000; }
function schedulePodium() { // 4th + 3rd appear TOGETHER at the first cue, then 2nd, then 1st - each when the podium tune reaches its cue time
  clearTimeout(podTimer); if (podMode !== 'auto' || !autoRun || S.podium.length >= 4) return;
  const n = S.podium.length ? S.podium.length - 1 : 0; // 0 = 4th & 3rd, 1 = 2nd, 2 = 1st
  podTimer = setInterval(() => {
    if (!$('#podium').classList.contains('active')) { clearInterval(podTimer); return; }
    if (podClock() < podCues[n]) return;
    clearInterval(podTimer);
    const o = [0, 1, 2, 3].sort((x, y) => total(y) - total(x)); newFrom = S.podium.length;
    if (n === 0) S.podium.push(o[3], o[2]); else if (n === 1) S.podium.push(o[1]); else S.podium.push(o[0]);
    lastAdded = S.podium.length - 1; save(); renderPodium();
  }, 40);
}
function renderPodium() {
  const p = S.podium, done = p.length === 4;
  const auto = podMode === 'auto', order = [0, 1, 2, 3].sort((x, y) => total(y) - total(x)), seq = [order[3], order[2], order[1], order[0]]; // 4th, 3rd, 2nd, 1st by score
  $('#btnPMode').textContent = auto ? 'SWITCH TO MANUAL PICK' : 'SWITCH TO AUTO (BY SCORE)';
  $('#pTitle').textContent = done ? 'CHAMPION!' : auto && autoRun ? 'FINAL PODIUM – drum roll…' : auto ? 'FINAL PODIUM' : `Choose the ${RANKS[p.length]} place team`;
  $('#pChoices').innerHTML = done || (auto && autoRun) ? '' : auto ? `<button class="btn start" data-t="${seq[p.length]}">REVEAL ${RANKS[p.length].toUpperCase()} PLACE</button>`
    : [0, 1, 2, 3].filter(t => !p.includes(t)).map(t => `<button class="btn" data-t="${t}">${esc(S.names[t])}</button>`).join('');
  $$('#pChoices button').forEach(b => b.onclick = () => { if (S.podium.includes(+b.dataset.t)) return; newFrom = S.podium.length; S.podium.push(+b.dataset.t); lastAdded = S.podium.length - 1; save(); renderPodium(); });
  // DOM order: 4th (ground, far left), 3rd, 1st (centre tower), 2nd
  $('#stage').innerHTML = [0, 1, 3, 2].map(i => {
    const t = p[i], first = i === 3, cls = (i >= newFrom && i <= lastAdded) ? '' : 'style="animation:none"';
    const card = t === undefined ? '' : `<div class="pcard ${first ? 'first' : ''}" ${cls}>${first ? '<span class="crown">👑</span>' : ''}${esc(S.names[t])}<span class="pts">${total(t)} pts</span>${first ? '<span class="champ">CHAMPION!</span>' : ''}</div>`;
    return `<div class="plat ${SLOT[i]}">${card}<span>${4 - i}</span></div>`;
  }).join('');
  fitPodCards(); stopFx(); schedulePodium(); const added = p.length > 0 && p.length === lastAdded + 1;
  if (added) { playSfx('applause'); celebrate(p.length === 4 ? 2 : 1); } else stopSfx(['applause']);
}
function fitPodCards() { // shrink each podium card's text until its longest word fits inside the tower width (words never split)
  $$('#stage .pcard').forEach(c => {
    c.style.fontSize = ''; let fs = parseFloat(getComputedStyle(c).fontSize), n = 0;
    while (c.scrollWidth > c.clientWidth + 1 && fs > 8 && n++ < 80) { fs *= 0.94; c.style.fontSize = fs + 'px'; }
  });
}
function undoPodium() { clearTimeout(podTimer); autoRun = false; if (!S.podium.length) return renderPodium(); S.podium.pop(); lastAdded = -1; save(); renderPodium(); }
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

/* ---------- Homepage coins: spinning retro golden coins drift down BEHIND the title, then vanish off the bottom (nothing piles up) ---------- */
const cashEl = $('#cash'), reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
let cashTimer = 0, cashN = 0;
const COIN = ['..XXXX..', '.XLLOOX.', 'XLOSSOOX', 'XLOSSOOX', 'XLOSSOOX', 'XLOSSOOX', 'XOOSSOOX', 'XOOOOOOX', '.XOOOOX.', '..XXXX..'], COIN_C = { X: '#8a3b00', O: '#ffcf1f', L: '#fff5a8', S: '#f08a00' };
const COIN_SVG = '<svg viewBox="0 0 8 10" preserveAspectRatio="none" shape-rendering="crispEdges" aria-hidden="true">' + COIN.map((row, y) => [...row].map((c, x) => COIN_C[c] ? `<rect x="${x}" y="${y}" width="1" height="1" fill="${COIN_C[c]}"/>` : '').join('')).join('') + '</svg>';
function spawnBill(delay) {
  if (cashN >= 16) return;
  const W = innerWidth, H = innerHeight, r = Math.random, el = document.createElement('div');
  const w = Math.max(30, Math.min(58, W * (.03 + r() * .018))), h = w * 1.25;
  el.className = 'bill'; el.style.width = w + 'px'; el.style.height = h + 'px'; el.innerHTML = COIN_SVG;
  el.firstChild.style.animationDuration = (.6 + r() * .5).toFixed(2) + 's';
  const sx = r() * (W - w), sy = -h * 2 - r() * 40, ex = sx + (r() - .5) * W * .08, ey = H + h * 2;   // start above the top, fall off the bottom
  cashEl.appendChild(el); cashN++;
  el.animate([{ transform: `translate(${sx}px,${sy}px)`, easing: 'cubic-bezier(.35,0,.9,.6)' }, { transform: `translate(${ex}px,${ey}px)` }],
    { duration: 3800 + r() * 2200, delay: delay, fill: 'both' }).onfinish = () => { el.remove(); cashN = Math.max(0, cashN - 1); };
}
function startCash() { if (reduceMotion || cashTimer) return; for (let i = 0; i < 6; i++) spawnBill(i * 500); cashTimer = setInterval(() => spawnBill(0), 480); }
function stopCash() { clearInterval(cashTimer); cashTimer = 0; cashEl.innerHTML = ''; cashN = 0; }

/* ---------- Wire up ---------- */
$('#btnStart').onclick = startGame;
$('#btnHomeSettings').onclick = openSettings;
$('#btnSave').onclick = saveSettings;
$('#btnSettingsHome').onclick = () => show('home');
$('#bSkip').onclick = () => { if (phase !== 'reveal') reveal(); };
$('#bNext').onclick = next; $('#bPrev').onclick = prev;

$('#bFs').onclick = toggleFs; $('#bHome').onclick = goHome;
$('#btnPUndo').onclick = undoPodium;
$('#btnPReplay').onclick = () => { clearTimeout(podTimer); podMode = 'auto'; autoRun = true; S.podium = []; lastAdded = -1; playPodMusic(); podStart = performance.now(); renderPodium(); };
$('#btnPMode').onclick = () => { clearTimeout(podTimer); podMode = podMode === 'auto' ? 'manual' : 'auto'; autoRun = podMode === 'auto'; S.podium = []; lastAdded = -1; if (autoRun) { playPodMusic(); podStart = performance.now(); } renderPodium(); };
let endArm = 0; // two-click confirm (browser pop-up dialogs can be blocked)
$('#bEnd').onclick = () => {
  const b = $('#bEnd'); if (endArm) { clearTimeout(endArm); endArm = 0; b.textContent = 'END GAME → PODIUM'; openPodium(); return; }
  b.textContent = 'CLICK AGAIN TO CONFIRM'; endArm = setTimeout(() => { endArm = 0; b.textContent = 'END GAME → PODIUM'; }, 3500);
};
$('#btnPRestart').onclick = () => { if (confirm('Erase all scores and restart the game?')) { resetGame(); beginQuestion(0); } };
$('#btnPHome').onclick = goHome;
window.addEventListener('resize', fitPodCards);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitPodCards);
window.addEventListener('resize', () => { const c = $('#fx'); if (fx) { c.width = innerWidth; c.height = innerHeight; } });
show('home');
})();
