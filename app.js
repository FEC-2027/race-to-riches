/* =====================================================================
   RACE TO RICHES – ENGLISH CAMP  |  app.js
   Game logic: screens, timer, music, scoring, scoreboard, podium, FX.
   Question data lives in questions.js.
   ===================================================================== */
(() => {
'use strict';

/* ---------------------------------------------------------------
   0. HELPERS & CONSTANTS
---------------------------------------------------------------- */
const $  = id => document.getElementById(id);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const rnd = (a, b) => a + Math.random() * (b - a);
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

const NUM_Q = 20, NUM_T = 4;
const COLOR_NAMES = ['BLUE', 'YELLOW', 'GREEN', 'RED'];   // answer order everywhere
const BASES = [10, 30, 60, 100];                          // scoring buttons (0 handled separately)
const TEAM_EMOJI = ['🦁', '🐯', '🐻', '🦊'];
const STORE_KEY = 'raceToRiches.v1';
const DEFAULT_MUSIC = 'assets/answering-music.mp3';

/* ---------------------------------------------------------------
   1. PERSISTENT STATE (localStorage)
---------------------------------------------------------------- */
const blankHistory = () => Array.from({ length: NUM_Q }, () => Array(NUM_T).fill(0));
const defaults = () => ({
  teams: ['TEAM 1', 'TEAM 2', 'TEAM 3', 'TEAM 4'],
  settings: { intro: 15, answer: 20, volume: 0.7, muted: false, musicName: '' },
  history: blankHistory(),      // history[q][team] = points earned on that question
  qIndex: 0,
  revealed: false,
  started: false,
  inFinal: false,
  podium: { 1: null, 2: null, 3: null },
  podOrder: [],                 // order in which places were filled (for undo)
  customQ: null                 // teacher-edited questions (null = use questions.js)
});
let G = defaults();

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return;
    const d = JSON.parse(raw), base = defaults();
    G = { ...base, ...d, settings: { ...base.settings, ...(d.settings || {}) }, podium: { ...base.podium, ...(d.podium || {}) } };
    if (!Array.isArray(G.teams) || G.teams.length !== NUM_T) G.teams = base.teams;
    const okHist = Array.isArray(G.history) && G.history.length === NUM_Q &&
                   G.history.every(r => Array.isArray(r) && r.length === NUM_T);
    if (!okHist) G.history = blankHistory();
    if (!Array.isArray(G.podOrder)) G.podOrder = [];
    G.qIndex = Math.min(Math.max(0, G.qIndex | 0), NUM_Q - 1);
  } catch (e) { G = defaults(); }
}
function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(G)); } catch (e) { /* storage full / blocked */ } }

/* ---------------------------------------------------------------
   2. QUESTIONS (questions.js + optional teacher edits)
---------------------------------------------------------------- */
function baseQ(i) {
  const d = (typeof QUESTIONS !== 'undefined') && QUESTIONS[i];
  return d || { q: `Question ${i + 1} — add it in questions.js`, a: ['A', 'B', 'C', 'D'], correct: 0 };
}
const getQ = i => (G.customQ && G.customQ[i]) || baseQ(i);

/* ---------------------------------------------------------------
   3. RUNTIME STATE
---------------------------------------------------------------- */
let screen = 'home', prevScreen = 'home';
let phase = 'intro';                       // intro | answer | reveal
let seq = newSeq();                        // per-team doubling counters for the CURRENT question
let lastAward = [0, 0, 0, 0];
let undoStack = [];
let heldByUi = false, settingsOpen = false;

function newSeq() { return Array.from({ length: NUM_T }, () => ({ 10: 0, 30: 0, 60: 0, 100: 0 })); }
const teamTotal = t => G.history.reduce((s, r) => s + (r[t] || 0), 0);
const totals = () => Array.from({ length: NUM_T }, (_, t) => teamTotal(t));
function ranksOf(tot) { return tot.map(v => 1 + tot.filter(x => x > v).length); }

/* ---------------------------------------------------------------
   4. UI UTILITIES
---------------------------------------------------------------- */
let toastTimer = null;
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}

/* shrink font until the element fits its container */
function fit(el, box, maxPx, minPx, reserve = 0) {
  if (!el || !box || !box.clientHeight) return;
  let size = maxPx;
  el.style.fontSize = size + 'px';
  let guard = 60;
  while (guard-- > 0 && size > minPx &&
         (el.offsetHeight > box.clientHeight - reserve || el.scrollWidth > box.clientWidth)) {
    size = Math.max(minPx, size * 0.93);
    el.style.fontSize = size + 'px';
  }
}
function fitAll() {
  const vh = innerHeight, vw = innerWidth;
  if (screen === 'game') {
    const qBox = $('qBox'), qText = $('qText');
    const compact = phase !== 'intro';
    fit(qText, qBox, compact ? vh * 0.07 : Math.min(vh * 0.16, vw * 0.075), compact ? 12 : 22, vh * 0.04);
    if (phase !== 'intro') {
      $$('.ans').forEach(a => fit($('.atext', a), $('.atxt', a), phase === 'reveal' ? vh * 0.045 : vh * 0.085, 11, $('.aname', a).offsetHeight + 4));
    }
  }
  if (screen === 'final' && !$('champ').classList.contains('hidden')) {
    const n = $('champName'); n.style.fontSize = Math.min(vh * 0.2, vw * 0.14) + 'px';
    fit(n, $('finalTop'), Math.min(vh * 0.2, vw * 0.14), 24, vh * 0.12);
  }
}
const fitSoon = () => requestAnimationFrame(() => requestAnimationFrame(fitAll));
addEventListener('resize', () => { fitSoon(); updateCtrlHeight(); });

function animateNum(el, to, dur = 700) {
  const from = el._cur !== undefined ? el._cur : (parseInt(el.textContent, 10) || 0);
  cancelAnimationFrame(el._raf);
  if (from === to) { el.textContent = to; el._cur = to; return; }
  const t0 = performance.now();
  const step = now => {
    const p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3);
    el._cur = Math.round(from + (to - from) * e);
    el.textContent = el._cur;
    if (p < 1) el._raf = requestAnimationFrame(step); else { el._cur = to; el.textContent = to; }
  };
  el._raf = requestAnimationFrame(step);
}

/* ---------------------------------------------------------------
   5. DECORATION: MALL BACKGROUND + FLOATERS
---------------------------------------------------------------- */
function buildMall() {
  const signs = ['DIAMONDS', 'GOLD', 'JEWELS', 'WATCHES', 'LUXE', 'COUTURE', 'PEARLS', 'CROWNS', 'TREASURE'];
  const cols = ['#ff7aa8', '#6fd6ff', '#ffd24a', '#b48cff', '#7dffb0', '#ff9a5a'];
  let h = '<div class="roof"><div class="chand"></div></div>';
  for (let r = 0; r < 3; r++) {
    h += `<div class="tier t${r}">`;
    const n = r === 1 ? 7 : 8;
    for (let i = 0; i < n; i++) {
      h += `<div class="shop" style="--c:${cols[(i * 2 + r) % cols.length]}"><span class="sign">${signs[(i + r * 3) % signs.length]}</span><i class="gemd"></i></div>`;
    }
    h += '<div class="rail"></div></div>';
  }
  h += '<div class="marble"></div>';
  $('mallLayers').innerHTML = h;
  // If the supplied artwork exists, use it instead of the CSS-drawn mall
  const img = new Image();
  img.onload = () => $('mall').classList.add('has-bg');
  img.src = 'assets/race-to-riches-bg.png';
}
function buildFloaters() {
  const f = $('floaters'); const types = ['coin', 'gem', 'bill', 'coin', 'gem', 'crown-f', 'coin', 'gem'];
  for (let i = 0; i < 20; i++) {
    const ty = types[i % types.length], d = document.createElement('div');
    d.className = 'fl ' + ty;
    d.style.cssText = `left:${rnd(0, 96)}%;--s:${rnd(3.2, 7).toFixed(1)}vmin;animation-duration:${rnd(14, 30).toFixed(1)}s;animation-delay:${(-rnd(0, 28)).toFixed(1)}s`;
    if (ty === 'coin') d.textContent = '$';
    if (ty === 'bill') d.textContent = '$';
    if (ty === 'crown-f') d.textContent = i % 2 ? '👑' : '💍';
    f.appendChild(d);
  }
}

/* ---------------------------------------------------------------
   6. FX ENGINE  (confetti, coins, diamonds, fireworks on a canvas)
---------------------------------------------------------------- */
const FX = (() => {
  const cv = $('fx'), c = cv.getContext('2d');
  let W = 0, H = 0, P = [], raf = null, rain = false, fwTimer = null;
  const CONF = ['#ffd700', '#ffffff', '#ff4d6d', '#4dabff', '#3ddc84', '#c77dff', '#ffb703'];
  function size() { const d = devicePixelRatio || 1; W = innerWidth; H = innerHeight; cv.width = W * d; cv.height = H * d; c.setTransform(d, 0, 0, d, 0, 0); }
  addEventListener('resize', size); size();

  function add(p) { if (P.length < 750) P.push(p); if (!raf) raf = requestAnimationFrame(loop); }
  function confetti(x, y, vx, vy) { add({ t: 'c', x, y, vx, vy, g: .13, r: rnd(0, 6.28), vr: rnd(-.25, .25), s: rnd(7, 13), col: CONF[(Math.random() * CONF.length) | 0], life: 1 }); }
  function coin(x, y, vx, vy) { add({ t: 'o', x, y, vx, vy, g: .16, r: rnd(0, 6.28), vr: rnd(.08, .2), s: rnd(13, 24), life: 1 }); }
  function gem(x, y, vx, vy) { add({ t: 'd', x, y, vx, vy, g: .12, r: rnd(-.5, .5), vr: rnd(-.05, .05), s: rnd(12, 22), life: 1 }); }
  function spark(x, y, vx, vy, col) { add({ t: 's', x, y, vx, vy, g: .05, s: rnd(1.6, 3.6), col, life: 1, decay: rnd(.012, .026) }); }

  function burst(x, y, n = 50, cols = ['#ffd700', '#fff6b0', '#ffffff', '#ffb703']) {
    for (let i = 0; i < n; i++) { const a = rnd(0, 6.28), s = rnd(1.5, 8); spark(x, y, Math.cos(a) * s, Math.sin(a) * s, cols[(Math.random() * cols.length) | 0]); }
  }
  function blast(x, y, n = 60) {
    for (let i = 0; i < n; i++) {
      const a = rnd(-3.14, 0), s = rnd(4, 15), r = Math.random();
      (r < .55 ? confetti : r < .8 ? coin : gem)(x, y, Math.cos(a) * s, Math.sin(a) * s);
    }
  }
  function shower(n = 40, ms = 1600) {
    for (let i = 0; i < n; i++) setTimeout(() => {
      const r = Math.random();
      (r < .4 ? confetti : r < .75 ? coin : gem)(rnd(0, W), -20, rnd(-1.5, 1.5), rnd(1, 5));
    }, rnd(0, ms));
  }
  function setRain(on) { rain = on; if (on && !raf) raf = requestAnimationFrame(loop); }
  function setFireworks(on) {
    clearInterval(fwTimer); fwTimer = null;
    if (!on) return;
    const go = () => {
      const pal = [['#ff4d6d', '#ffd1dc'], ['#4dabff', '#d6ecff'], ['#ffd700', '#fff6b0'], ['#3ddc84', '#d3ffe6'], ['#c77dff', '#ecd9ff']][(Math.random() * 5) | 0];
      burst(rnd(W * .1, W * .9), rnd(H * .1, H * .5), 70, pal);
    };
    go(); fwTimer = setInterval(go, 650);
  }
  function clear() { P = []; rain = false; clearInterval(fwTimer); fwTimer = null; c.clearRect(0, 0, W, H); }

  function draw(p) {
    c.save(); c.translate(p.x, p.y);
    if (p.t === 'c') { c.rotate(p.r); c.scale(1, Math.abs(Math.sin(p.r * 2)) * .8 + .2); c.fillStyle = p.col; c.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); }
    else if (p.t === 'o') {
      c.scale(Math.abs(Math.cos(p.r)) * .9 + .1, 1);
      const g = c.createRadialGradient(-p.s * .3, -p.s * .3, 1, 0, 0, p.s);
      g.addColorStop(0, '#fff7b0'); g.addColorStop(.5, '#ffd700'); g.addColorStop(1, '#b8860b');
      c.fillStyle = g; c.strokeStyle = '#8a5a00'; c.lineWidth = 2; c.beginPath(); c.arc(0, 0, p.s, 0, 6.28); c.fill(); c.stroke();
    } else if (p.t === 'd') {
      c.rotate(p.r); const s = p.s;
      const g = c.createLinearGradient(-s, -s, s, s); g.addColorStop(0, '#ffffff'); g.addColorStop(.5, '#8fe3ff'); g.addColorStop(1, '#3fa7ff');
      c.fillStyle = g; c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(-s * .5, -s * .6); c.lineTo(s * .5, -s * .6); c.lineTo(s, -s * .1); c.lineTo(0, s); c.lineTo(-s, -s * .1); c.closePath(); c.fill(); c.stroke();
    } else { c.globalAlpha = Math.max(0, p.life); c.fillStyle = p.col; c.shadowColor = p.col; c.shadowBlur = 8; c.beginPath(); c.arc(0, 0, p.s, 0, 6.28); c.fill(); }
    c.restore();
  }
  function loop() {
    c.clearRect(0, 0, W, H);
    if (rain && Math.random() < .55) { const r = Math.random(); (r < .35 ? confetti : r < .75 ? coin : gem)(rnd(0, W), -20, rnd(-1, 1), rnd(1.5, 5)); }
    for (const p of P) {
      p.vy += p.g; p.x += p.vx; p.y += p.vy;
      if (p.t === 's') { p.vx *= .985; p.life -= p.decay; } else { p.r += p.vr; p.vx *= .995; }
      draw(p);
    }
    P = P.filter(p => (p.t === 's' ? p.life > 0 : p.y < H + 60));
    if (P.length || rain) raf = requestAnimationFrame(loop); else { raf = null; c.clearRect(0, 0, W, H); }
  }
  return { burst, blast, shower, setRain, setFireworks, clear };
})();

/* ---------------------------------------------------------------
   7. MUSIC  (HTML Audio + built-in synth fallback)
---------------------------------------------------------------- */
const MusicStore = {   // IndexedDB keeps the uploaded MP3 between sessions
  open() { return new Promise((res, rej) => { const r = indexedDB.open('raceToRichesDB', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); },
  async put(k, v) { const db = await this.open(); return new Promise((res, rej) => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(v, k); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); },
  async get(k) { const db = await this.open(); return new Promise((res, rej) => { const rq = db.transaction('kv').objectStore('kv').get(k); rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); }); },
  async del(k) { const db = await this.open(); return new Promise((res, rej) => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').delete(k); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); }
};

const Music = {
  el: $('bgm'), ctx: null, master: null, synthTimer: null, step: 0,
  useSynth: false, want: false, paused: false, previewing: false, previewTimer: null, blobUrl: null,

  init() {
    this.el.addEventListener('error', () => {           // file missing / unsupported -> synth fallback
      this.useSynth = true; updateMusicLabel();
      if (this.want && !this.paused) this._synthStart();
    });
    this.el.addEventListener('canplay', () => { if (!this.blobUrl && !this.useSynth) updateMusicLabel(); });
    this.applyVolume();
    // unlock Web Audio on the first click (browser autoplay rules)
    document.addEventListener('pointerdown', () => this.ensureCtx(), { once: true });
  },
  ensureCtx() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
      this.ctx = new AC(); this.master = this.ctx.createGain(); this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.applyVolume(); return this.ctx;
  },
  applyVolume() {
    const v = G.settings.muted ? 0 : G.settings.volume;
    this.el.volume = Math.min(1, Math.max(0, v));
    if (this.master) this.master.gain.value = v * 0.6;
  },
  /* --- game music (answering period) --- */
  play() {
    this.stop(); this.want = true; this.paused = false; this._start();
  },
  _start() {
    this.applyVolume();
    if (this.useSynth) { this._synthStart(); return; }
    const p = this.el.play();
    if (p && p.catch) p.catch(err => {
      if (!this.want) return;
      if (this.el.error || err.name === 'NotSupportedError') { this.useSynth = true; this._synthStart(); }
      else { toast('🔇 Click anywhere on the page to allow sound'); const retry = () => { if (this.want && !this.paused) this._start(); }; document.addEventListener('pointerdown', retry, { once: true }); }
    });
  },
  pause() { if (!this.want) return; this.paused = true; this.el.pause(); this._synthStop(); },
  resume() { if (!this.want || !this.paused) return; this.paused = false; this._start(); },
  stop() {
    this.want = false; this.paused = false; this.previewing = false; clearTimeout(this.previewTimer);
    try { this.el.pause(); this.el.currentTime = 0; } catch (e) {}
    this._synthStop(); updatePreviewBtn();
  },
  preview() {
    if (this.previewing) { this.stop(); return; }
    if (this.want) { toast('Preview is not available while a question is running'); return; }
    this.want = true; this.paused = false; this.previewing = true; this._start(); updatePreviewBtn();
    this.previewTimer = setTimeout(() => this.stop(), 12000);
  },
  /* --- tick sound for last 5 seconds --- */
  tick() { if (G.settings.muted || !this.ensureCtx()) return; this._note(1300, .09, 'square', .3); },

  /* --- built-in synth fallback (used when no mp3 is available) --- */
  _synthStart() {
    if (!this.ensureCtx() || this.synthTimer) return;
    this.synthTimer = setInterval(() => this._beat(), 230);
  },
  _synthStop() { clearInterval(this.synthTimer); this.synthTimer = null; },
  _beat() {
    const arp = [220, 261.63, 329.63, 392, 329.63, 261.63, 293.66, 349.23], bass = [110, 110, 87.31, 98];
    const s = this.step++;
    this._note(arp[s % 8] * 2, .2, 'triangle', .5);
    if (s % 2 === 0) this._note(bass[(s / 2 | 0) % 4], .32, 'sine', .9);
    if (s % 4 === 0) this._kick();
  },
  _note(freq, dur, type, vol) {
    const ctx = this.ctx; if (!ctx) return;
    const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime;
    o.type = type; o.frequency.value = freq; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + .02);
  },
  _kick() {
    const ctx = this.ctx; if (!ctx) return;
    const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime;
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(40, t + .15);
    g.gain.setValueAtTime(1, t); g.gain.exponentialRampToValueAtTime(.001, t + .2);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + .22);
  },
  /* --- uploaded file --- */
  setBlob(blob, name, persist = true) {
    if (this.blobUrl) URL.revokeObjectURL(this.blobUrl);
    this.stop(); this.blobUrl = URL.createObjectURL(blob);
    this.useSynth = false; this.el.src = this.blobUrl; this.el.load();
    G.settings.musicName = name || 'uploaded music'; save();
    if (persist) MusicStore.put('music', blob).catch(() => toast('Music will not be remembered after closing the browser'));
    updateMusicLabel();
  },
  useDefault() {
    this.stop(); if (this.blobUrl) { URL.revokeObjectURL(this.blobUrl); this.blobUrl = null; }
    MusicStore.del('music').catch(() => {});
    this.useSynth = false; this.el.src = DEFAULT_MUSIC; this.el.load();
    G.settings.musicName = ''; save(); updateMusicLabel();
  }
};
function updateMusicLabel() {
  const l = $('musicName'); if (!l) return;
  if (G.settings.musicName && Music.blobUrl) l.textContent = '🎵 Current music: ' + G.settings.musicName;
  else if (Music.useSynth) l.textContent = '🎵 No file found at assets/answering-music.mp3 — using the built-in tune. Upload an MP3 to replace it.';
  else l.textContent = '🎵 Current music: assets/answering-music.mp3';
}
function updatePreviewBtn() { const b = $('btnPreview'); if (b) b.textContent = Music.previewing ? '■ STOP PREVIEW' : '▶ PREVIEW MUSIC'; }

/* ---------------------------------------------------------------
   8. TIMER  (elapsed-time based; only ONE can exist)
---------------------------------------------------------------- */
const T = { id: null, total: 0, remaining: 0, last: 0, running: false, active: false, token: 0 };
let lastSec = null;

function startTimer(sec) {
  stopTimer();
  T.total = sec * 1000; T.remaining = T.total; T.last = performance.now();
  T.running = true; T.active = true; lastSec = null;
  const tok = ++T.token;
  T.id = setInterval(() => tick(tok), 50);
  paintTimer(); updateControls();
}
function stopTimer() {
  clearInterval(T.id); T.id = null; T.running = false; T.active = false; T.token++;
  $('game').classList.remove('danger'); $('timerWrap').classList.remove('danger');
}
function tick(tok) {
  if (tok !== T.token || !T.running) return;
  const now = performance.now();
  T.remaining -= now - T.last; T.last = now;
  if (T.remaining <= 0) {
    T.remaining = 0; paintTimer();
    const p = phase; stopTimer(); onTimerEnd(p); return;
  }
  paintTimer();
}
function pauseTimer() {
  if (!T.running) return;
  const now = performance.now();
  T.remaining = Math.max(1, T.remaining - (now - T.last)); T.running = false;
  Music.pause(); paintTimer(); updateControls();
}
function resumeTimer() {
  if (T.running || !T.active) return;
  T.last = performance.now(); T.running = true;
  Music.resume(); updateControls();
}
function holdTimer() { if (T.running) { pauseTimer(); heldByUi = true; } }
function releaseTimer() {
  if (heldByUi && screen === 'game' && !settingsOpen) { heldByUi = false; resumeTimer(); }
}
function paintTimer() {
  const sec = Math.max(0, Math.ceil(T.remaining / 1000));
  const frac = T.total ? T.remaining / T.total : 0;
  $('ring').style.strokeDashoffset = (283 * (1 - frac)).toFixed(2);
  const danger = phase === 'answer' && sec <= 5 && sec > 0 && T.active;
  if (sec !== lastSec) {
    lastSec = sec;
    const n = $('timerNum'); n.textContent = sec; n.classList.remove('pop'); void n.offsetWidth; n.classList.add('pop');
    if (danger) Music.tick();
  }
  $('game').classList.toggle('danger', danger); $('timerWrap').classList.toggle('danger', danger);
}
function onTimerEnd(p) {
  if (p === 'intro') enterAnswer();
  else if (p === 'answer') enterReveal();
}

/* ---------------------------------------------------------------
   9. SCREENS
---------------------------------------------------------------- */
function showScreen(name) {
  prevScreen = screen; screen = name;
  $$('.screen').forEach(s => s.classList.toggle('active', s.id === name));
  document.body.dataset.screen = name;
  $('mall').classList.toggle('dim', name !== 'home');
  $('controls').classList.toggle('hidden', !(name === 'game' || name === 'scoreboard'));
  updateCtrlHeight(); updateControls(); fitSoon();
}
function updateCtrlHeight() {
  const c = $('controls');
  document.documentElement.style.setProperty('--ctrl-h', c.classList.contains('hidden') ? '0px' : c.offsetHeight + 'px');
}
if (window.ResizeObserver) new ResizeObserver(updateCtrlHeight).observe($('controls'));

function goHome() {
  stopTimer(); Music.stop(); FX.clear(); heldByUi = false;
  showScreen('home'); refreshHome();
}
function refreshHome() { $('btnContinue').classList.toggle('hidden', !G.started); }

/* ---------------------------------------------------------------
   10. GAME FLOW
---------------------------------------------------------------- */
function applyPhase() {
  const g = $('game');
  g.classList.remove('phase-intro', 'phase-answer', 'phase-reveal');
  g.classList.add('phase-' + phase);
  $('timerLbl').textContent = phase === 'intro' ? 'GET READY' : 'RUN!';
  fitSoon();
}

function renderQuestion(animate = false) {
  const q = getQ(G.qIndex);
  $('qCounter').textContent = `QUESTION ${G.qIndex + 1} / ${NUM_Q}`;
  const qt = $('qText'); qt.textContent = q.q;
  if (animate) { qt.classList.remove('enter'); void qt.offsetWidth; qt.classList.add('enter'); }
  $$('.ans').forEach((a, i) => {
    $('.atext', a).textContent = q.a[i] ?? '';
    a.classList.remove('correct', 'wrong');
  });
  if (phase === 'reveal') markCorrect();
  fitSoon();
}
function markCorrect() {
  const q = getQ(G.qIndex);
  $$('.ans').forEach((a, i) => { a.classList.toggle('correct', i === q.correct); a.classList.toggle('wrong', i !== q.correct); });
  $('revealText').textContent = `${COLOR_NAMES[q.correct]} — ${q.a[q.correct]}`;
}

/* Open question i (starts the intro unless opts.reveal) */
function openQuestion(i, opts = {}) {
  stopTimer(); Music.stop(); FX.clear(); heldByUi = false;
  G.qIndex = Math.min(Math.max(0, i), NUM_Q - 1);
  G.revealed = false; G.started = true; G.inFinal = false;
  seq = newSeq(); lastAward = [0, 0, 0, 0]; undoStack = [];
  phase = 'intro';
  showScreen('game');
  applyPhase(); renderQuestion(true); updateScorePanel(false);
  if (opts.reveal) enterReveal(true);
  else { startTimer(G.settings.intro); }
  save(); updateControls();
}
function enterAnswer() {
  stopTimer(); phase = 'answer';
  applyPhase(); renderQuestion(false);
  startTimer(G.settings.answer);
  Music.play();
}
function enterReveal(silent = false) {
  stopTimer(); Music.stop(); heldByUi = false;
  phase = 'reveal'; G.revealed = true;
  applyPhase(); markCorrect(); updateScorePanel(false); save(); updateControls();
  if (!silent) { FX.shower(26, 1400); const r = $('answers').getBoundingClientRect(); FX.burst(innerWidth / 2, Math.max(120, r.top), 70); }
}
function skipIntro() { if (phase === 'intro') enterAnswer(); }
function skipToReveal() { if (screen === 'game' && phase !== 'reveal') enterReveal(); }
function nextQuestion() {
  if (G.qIndex >= NUM_Q - 1) { showFinal(); return; }
  openQuestion(G.qIndex + 1);
}
function prevQuestion() { if (G.qIndex > 0) openQuestion(G.qIndex - 1); }
function restartQuestion() { openQuestion(G.qIndex); toast('Question restarted (scores kept)'); }

function startNew() {
  if (G.started && !confirm('Start a NEW game? All scores and history will be cleared.')) return;
  resetData(); openQuestion(0);
}
function resetData() {
  stopTimer(); Music.stop(); FX.clear(); heldByUi = false;
  const keep = { teams: G.teams, settings: G.settings, customQ: G.customQ };
  G = { ...defaults(), ...keep };
  seq = newSeq(); lastAward = [0, 0, 0, 0]; undoStack = [];
  clearPodiumUI(); save();
  updateScorePanel(false); updateRank(); refreshHome();
}
function continueGame() {
  if (G.inFinal) { showFinal(); return; }
  if (G.revealed) openQuestion(G.qIndex, { reveal: true }); else openQuestion(G.qIndex);
}

/* ---------------------------------------------------------------
   11. SCORING
---------------------------------------------------------------- */
function buildScorePanel() {
  const sp = $('scorePanel'); sp.innerHTML = '';
  for (let t = 0; t < NUM_T; t++) {
    const d = document.createElement('div'); d.className = 'tcard'; d.dataset.t = t;
    d.innerHTML = `
      <div class="tc-head"><span class="tc-emoji">${TEAM_EMOJI[t]}</span><span class="tc-name"></span><span class="tc-last"></span></div>
      <div class="tc-nums">
        <div><small>THIS QUESTION</small><b class="tc-q">0</b></div>
        <div><small>TOTAL</small><b class="tc-total">0</b></div>
      </div>
      <div class="tc-btns">
        <button class="sb zero" data-base="0" title="Reset this question's points for the team">0</button>
        ${BASES.map(b => `<button class="sb" data-base="${b}"><span>+${b}</span><small></small></button>`).join('')}
      </div>`;
    sp.appendChild(d);
  }
  sp.addEventListener('click', e => {
    const b = e.target.closest('.sb'); if (!b) return;
    const card = b.closest('.tcard'); award(+card.dataset.t, +b.dataset.base);
  });
}
function updateScorePanel(animate = true) {
  const tot = totals();
  $$('.tcard').forEach(card => {
    const t = +card.dataset.t;
    $('.tc-name', card).textContent = G.teams[t];
    const qv = $('.tc-q', card), tv = $('.tc-total', card);
    if (animate) { animateNum(qv, G.history[G.qIndex][t]); animateNum(tv, tot[t]); }
    else { qv._cur = G.history[G.qIndex][t]; qv.textContent = qv._cur; tv._cur = tot[t]; tv.textContent = tot[t]; }
    $('.tc-last', card).textContent = lastAward[t] > 0 ? `+${lastAward[t]}` : '';
    $$('.sb[data-base]', card).forEach(b => {
      const base = +b.dataset.base; if (!base) return;
      const next = base * Math.pow(2, seq[t][base]);
      $('small', b).textContent = seq[t][base] > 0 ? `next +${next}` : '';
    });
  });
}
function award(t, base) {
  const q = G.qIndex;
  undoStack.push({ q, t, prevPts: G.history[q][t], prevSeq: { ...seq[t] }, prevLast: lastAward[t] });
  let shown;
  if (base === 0) {                                   // reset this team's current-question points
    G.history[q][t] = 0; seq[t] = { 10: 0, 30: 0, 60: 0, 100: 0 }; lastAward[t] = 0; shown = 'RESET';
  } else {
    const amt = base * Math.pow(2, seq[t][base]);     // independent doubling per team per button
    seq[t][base]++; G.history[q][t] += amt; lastAward[t] = amt; shown = '+' + amt;
  }
  save(); updateScorePanel(true); updateRank();
  const card = $(`.tcard[data-t="${t}"]`);
  card.classList.remove('bump'); void card.offsetWidth; card.classList.add('bump');
  const pop = document.createElement('div'); pop.className = 'popup'; pop.textContent = shown;
  card.appendChild(pop); setTimeout(() => pop.remove(), 1400);
  if (base !== 0) { const r = card.getBoundingClientRect(); FX.burst(r.left + r.width / 2, r.top + r.height * .3, 22); }
}
function undo() {
  const a = undoStack.pop();
  if (!a) { toast('Nothing to undo'); return; }
  G.history[a.q][a.t] = a.prevPts; seq[a.t] = a.prevSeq; lastAward[a.t] = a.prevLast;
  save(); updateScorePanel(true); updateRank(); refreshHistoryTotals();
  toast(`↶ Undid last action for ${G.teams[a.t]}`);
}

/* ---------------------------------------------------------------
   12. SCOREBOARD + HISTORY
---------------------------------------------------------------- */
function buildRank() {
  const w = $('rankList'); w.innerHTML = '';
  for (let t = 0; t < NUM_T; t++) {
    const d = document.createElement('div'); d.className = 'rrow'; d.dataset.t = t;
    d.innerHTML = `<div class="r-pos">1</div><div class="r-emoji">${TEAM_EMOJI[t]}</div><div class="r-name"></div><div class="r-barwrap"><div class="r-bar"></div></div><div class="r-total">0</div>`;
    d.style.setProperty('--r', t); w.appendChild(d);
  }
}
function updateRank() {
  const tot = totals(), rk = ranksOf(tot), max = Math.max(1, ...tot);
  const order = [0, 1, 2, 3].sort((a, b) => tot[b] - tot[a] || a - b);
  $$('.rrow').forEach(row => {
    const t = +row.dataset.t;
    row.style.setProperty('--r', order.indexOf(t));
    row.classList.toggle('r1', rk[t] === 1 && tot[t] > 0);
    $('.r-pos', row).textContent = rk[t];
    $('.r-name', row).textContent = G.teams[t];
    $('.r-bar', row).style.width = (tot[t] > 0 ? Math.max(2, tot[t] / max * 100) : 0) + '%';
    animateNum($('.r-total', row), tot[t], 900);
  });
}
function buildHistory() {
  let h = '<thead><tr><th>TEAM</th>';
  for (let q = 0; q < NUM_Q; q++) h += `<th class="${q === G.qIndex ? 'cur' : ''}">Q${q + 1}</th>`;
  h += '<th class="totcol">TOTAL</th></tr></thead><tbody>';
  for (let t = 0; t < NUM_T; t++) {
    h += `<tr><th class="tn">${TEAM_EMOJI[t]} ${esc(G.teams[t])}</th>`;
    for (let q = 0; q < NUM_Q; q++) h += `<td class="${q === G.qIndex ? 'cur' : ''}"><input type="number" step="10" data-q="${q}" data-t="${t}" value="${G.history[q][t]}"></td>`;
    h += `<td class="tot" data-tot="${t}">${teamTotal(t)}</td></tr>`;
  }
  $('histTable').innerHTML = h + '</tbody>';
}
function refreshHistoryTotals() {
  $$('#histTable td.tot').forEach(td => td.textContent = teamTotal(+td.dataset.tot));
  $$('#histTable input').forEach(i => { if (document.activeElement !== i) i.value = G.history[+i.dataset.q][+i.dataset.t]; });
}
function openScoreboard() {
  if (screen === 'scoreboard') return;
  holdTimer();
  const from = screen;
  showScreen('scoreboard'); prevScreen = from;
  buildHistory(); updateRank(); updateControls();
}
function closeScoreboard() {
  const back = prevScreen === 'scoreboard' ? 'home' : prevScreen;
  if (back === 'game') { showScreen('game'); releaseTimer(); fitSoon(); }
  else if (back === 'final') showScreen('final');
  else { showScreen('home'); refreshHome(); }
}

/* ---------------------------------------------------------------
   13. FINAL PODIUM
---------------------------------------------------------------- */
let trailTimer = null;
function slotOf(place) { return document.querySelector(`.pod-col[data-place="${place}"] .pod-slot`); }
function clearPodiumUI() {
  [1, 2, 3].forEach(p => slotOf(p).innerHTML = '');
  $('champ').classList.add('hidden'); $('finalTitle').classList.remove('hidden');
  FX.setRain(false); FX.setFireworks(false); clearInterval(trailTimer);
}
function showFinal() {
  stopTimer(); Music.stop(); FX.clear(); heldByUi = false;
  G.inFinal = true; save();
  showScreen('final');
  clearPodiumUI();
  [3, 2, 1].forEach(p => { if (G.podium[p] !== null && G.podium[p] !== undefined) placeTeam(p, G.podium[p], false); });
  renderPodSelect();
}
function podTaken() { return [1, 2, 3].map(p => G.podium[p]).filter(v => v !== null && v !== undefined); }
function placeTeam(place, t, animate) {
  G.podium[place] = t;
  if (!G.podOrder.includes(place)) G.podOrder.push(place);
  const slot = slotOf(place); slot.innerHTML = '';
  const card = document.createElement('div');
  card.className = `pcard place${place}` + (animate ? ' rise' : '');
  card.title = 'Click to remove from podium';
  card.innerHTML = `<div class="crown">${place === 1 ? '👑' : place === 2 ? '🥈' : '🥉'}</div><div class="pemoji">${TEAM_EMOJI[t]}</div><div class="pname">${esc(G.teams[t])}</div><div class="pscore">${teamTotal(t)} pts</div>`;
  card.addEventListener('click', () => removePlace(place));
  slot.appendChild(card);

  if (animate) {
    clearInterval(trailTimer);
    trailTimer = setInterval(() => {            // sparkle trail during the ascent
      const r = card.getBoundingClientRect();
      FX.burst(r.left + r.width / 2, r.top + r.height / 2, place === 1 ? 14 : 7);
    }, 140);
    card.addEventListener('animationend', e => {
      if (e.animationName !== 'rise') return;
      clearInterval(trailTimer);
      const r = card.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top;
      if (place === 3) { FX.blast(cx, cy, 40); FX.shower(14, 900); }
      else if (place === 2) { FX.blast(cx, cy, 70); FX.shower(24, 1200); }
      else { FX.blast(cx, cy, 120); showChampion(true); }
    });
  } else if (place === 1) showChampion(false);
  save(); renderPodSelect();
}
function showChampion(celebrate) {
  const t = G.podium[1]; if (t === null || t === undefined) return;
  $('champName').textContent = G.teams[t].toUpperCase();
  $('finalTitle').classList.add('hidden'); $('champ').classList.remove('hidden');
  fitSoon();
  FX.setRain(true); FX.setFireworks(true);
  if (celebrate) FX.shower(50, 1500);
}
function removePlace(place) {
  if (G.podium[place] === null || G.podium[place] === undefined) return;
  G.podium[place] = null; G.podOrder = G.podOrder.filter(p => p !== place);
  slotOf(place).innerHTML = '';
  if (place === 1) { $('champ').classList.add('hidden'); $('finalTitle').classList.remove('hidden'); FX.setRain(false); FX.setFireworks(false); }
  clearInterval(trailTimer); save(); renderPodSelect();
}
function podUndo() {
  const last = G.podOrder[G.podOrder.length - 1];
  if (last === undefined) { toast('Nothing to undo'); return; }
  removePlace(last);
}
function renderPodSelect() {
  const step = [3, 2, 1].find(p => G.podium[p] === null || G.podium[p] === undefined);
  const names = { 3: '3RD PLACE 🥉', 2: '2ND PLACE 🥈', 1: '1ST PLACE 👑' };
  const box = $('podChoices'); box.innerHTML = '';
  if (!step) { $('podLabel').textContent = '🎉 All podium places assigned! (click a team on the podium to change it)'; return; }
  $('podLabel').textContent = `Select the team for ${names[step]}`;
  const taken = podTaken();
  for (let t = 0; t < NUM_T; t++) {
    if (taken.includes(t)) continue;                    // each team can only occupy one place
    const b = document.createElement('button'); b.className = 'btn'; b.textContent = `${TEAM_EMOJI[t]} ${G.teams[t]}`;
    b.addEventListener('click', () => placeTeam(step, t, true));
    box.appendChild(b);
  }
}

/* ---------------------------------------------------------------
   14. CONTROLS BAR STATE
---------------------------------------------------------------- */
function updateControls() {
  const inGame = screen === 'game', inSB = screen === 'scoreboard';
  const show = (id, v) => $(id).classList.toggle('hidden', !v);
  const timing = inGame && phase !== 'reveal';
  show('btnHome', inGame || inSB);
  show('btnPause', timing && T.running);
  show('btnResume', timing && T.active && !T.running);
  show('btnSkipIntro', inGame && phase === 'intro');
  show('btnSkip', timing);
  show('btnRestartQ', inGame);
  show('btnUndo', inGame);
  show('btnScoreboard', inGame);
  show('btnPrev', inGame && G.qIndex > 0);
  show('btnNext', inGame);
  show('btnReturn', inSB);
  $('btnNext').textContent = G.qIndex >= NUM_Q - 1 ? 'FINISH → PODIUM 🏅' : 'NEXT QUESTION ▶';
  $('btnReturn').textContent = prevScreen === 'game' ? '↩ RETURN TO GAME' : '↩ BACK';
  $('btnSbReturn').textContent = $('btnReturn').textContent;
  $('pausedTag').classList.toggle('hidden', !(inGame && timing && T.active && !T.running));
  $$('.js-mute').forEach(b => { const ic = G.settings.muted ? '🔇' : '🔊'; b.textContent = b.closest('#home') ? `${ic} SOUND` : ic; });
  updateCtrlHeight();
}

/* ---------------------------------------------------------------
   15. SETTINGS
---------------------------------------------------------------- */
function openSettings() { settingsOpen = true; holdTimer(); fillSettings(); $('settings').classList.add('open'); }
function closeSettings() {
  if (Music.previewing) Music.stop();
  $('settings').classList.remove('open'); settingsOpen = false;
  renderAll(); releaseTimer();
}
function fillSettings() {
  for (let t = 0; t < NUM_T; t++) $('setTeam' + t).value = G.teams[t];
  $('setIntro').value = G.settings.intro; $('setAnswer').value = G.settings.answer;
  $('setVol').value = Math.round(G.settings.volume * 100); $('setMute').checked = G.settings.muted;
  updateMusicLabel(); updatePreviewBtn(); fillQuestionEditor();
}
function fillQuestionEditor() {
  const sel = $('qSel'), keep = sel.value || '0';
  sel.innerHTML = '';
  for (let i = 0; i < NUM_Q; i++) {
    const o = document.createElement('option'); o.value = i; o.textContent = `Q${i + 1}: ${getQ(i).q.slice(0, 48)}`; sel.appendChild(o);
  }
  sel.value = keep; loadEditor();
}
function loadEditor() {
  const q = getQ(+$('qSel').value);
  $('qEdit').value = q.q; for (let i = 0; i < 4; i++) $('qA' + i).value = q.a[i] ?? '';
  $('qCorrect').value = q.correct;
}
function saveEditor() {
  const i = +$('qSel').value;
  if (!G.customQ) G.customQ = Array.from({ length: NUM_Q }, (_, k) => JSON.parse(JSON.stringify(baseQ(k))));
  G.customQ[i] = { q: $('qEdit').value, a: [0, 1, 2, 3].map(k => $('qA' + k).value), correct: +$('qCorrect').value };
  save();
  $('qSel').options[i].textContent = `Q${i + 1}: ${G.customQ[i].q.slice(0, 48)}`;
}
function setMuted(m) { G.settings.muted = m; Music.applyVolume(); $('setMute').checked = m; save(); updateControls(); }
function toggleFS() {
  if (!document.fullscreenElement) { const r = document.documentElement.requestFullscreen; if (r) r.call(document.documentElement).catch(() => {}); }
  else if (document.exitFullscreen) document.exitFullscreen();
}
function renderAll() {
  if (screen === 'game') renderQuestion(false);
  updateScorePanel(false); updateRank();
  if (screen === 'scoreboard') buildHistory();
  if (screen === 'final') { [1, 2, 3].forEach(p => { if (G.podium[p] != null) { const n = $('.pname', slotOf(p)); if (n) n.textContent = G.teams[G.podium[p]]; } }); renderPodSelect(); if (G.podium[1] != null) $('champName').textContent = G.teams[G.podium[1]].toUpperCase(); }
}

/* ---------------------------------------------------------------
   16. EVENT WIRING
---------------------------------------------------------------- */
function bind() {
  $('btnStart').onclick = startNew;
  $('btnContinue').onclick = continueGame;
  $('btnHomeScore').onclick = openScoreboard;
  $('btnHomeSettings').onclick = openSettings;

  $('btnHome').onclick = goHome;
  $('btnPrev').onclick = prevQuestion;
  $('btnNext').onclick = nextQuestion;
  $('btnPause').onclick = pauseTimer;
  $('btnResume').onclick = resumeTimer;
  $('btnSkipIntro').onclick = skipIntro;
  $('btnSkip').onclick = skipToReveal;
  $('btnRestartQ').onclick = restartQuestion;
  $('btnUndo').onclick = undo; $('btnUndo2').onclick = undo;
  $('btnScoreboard').onclick = openScoreboard;
  $('btnReturn').onclick = closeScoreboard; $('btnSbReturn').onclick = closeScoreboard;
  $('btnSbFinal').onclick = () => { showFinal(); };

  $('btnPodUndo').onclick = podUndo;
  $('btnPodScore').onclick = openScoreboard;
  $('btnRestart').onclick = () => { if (confirm('Restart the whole game? All scores will be cleared.')) { resetData(); openQuestion(0); } };
  $('btnMenu').onclick = goHome;

  $$('.js-fs').forEach(b => b.onclick = toggleFS);
  $$('.js-mute').forEach(b => b.onclick = () => setMuted(!G.settings.muted));
  $$('.js-settings').forEach(b => b.onclick = openSettings);
  document.addEventListener('fullscreenchange', () => { fitSoon(); setTimeout(updateCtrlHeight, 200); });

  // scoreboard manual edits
  $('histTable').addEventListener('input', e => {
    const i = e.target; if (!i.matches('input[data-q]')) return;
    G.history[+i.dataset.q][+i.dataset.t] = parseInt(i.value, 10) || 0;
    save(); refreshHistoryTotals(); updateRank(); updateScorePanel(false);
  });

  // settings
  $('btnCloseSettings').onclick = closeSettings;
  $$('.tab').forEach(tb => tb.onclick = () => {
    $$('.tab').forEach(x => x.classList.toggle('active', x === tb));
    $$('.tabpane').forEach(p => p.classList.toggle('active', p.id === 'tab-' + tb.dataset.tab));
  });
  for (let t = 0; t < NUM_T; t++) $('setTeam' + t).oninput = e => { G.teams[t] = e.target.value.trim() || `TEAM ${t + 1}`; save(); renderAll(); };
  $('setIntro').onchange = e => { G.settings.intro = Math.min(120, Math.max(3, +e.target.value || 15)); e.target.value = G.settings.intro; save(); };
  $('setAnswer').onchange = e => { G.settings.answer = Math.min(180, Math.max(5, +e.target.value || 20)); e.target.value = G.settings.answer; save(); };
  $('setVol').oninput = e => { G.settings.volume = e.target.value / 100; Music.applyVolume(); save(); };
  $('setMute').onchange = e => setMuted(e.target.checked);
  $('musicFile').onchange = e => { const f = e.target.files[0]; if (f) { Music.setBlob(f, f.name); toast('🎵 Music loaded: ' + f.name); } };
  $('btnPreview').onclick = () => Music.preview();
  $('btnMusicDefault').onclick = () => { Music.useDefault(); toast('Default music restored'); };
  $('qSel').onchange = loadEditor;
  ['qEdit', 'qA0', 'qA1', 'qA2', 'qA3'].forEach(id => $(id).oninput = saveEditor);
  $('qCorrect').onchange = saveEditor;
  $('btnResetQ').onclick = () => { if (confirm('Discard all in-game question edits and use questions.js?')) { G.customQ = null; save(); fillQuestionEditor(); toast('Questions reset'); } };
  $('btnResetAll').onclick = () => { if (confirm('Erase ALL saved data (scores, names, settings, music)?')) { MusicStore.del('music').catch(() => {}); localStorage.removeItem(STORE_KEY); location.reload(); } };

  // keyboard: SPACE = pause/resume, F = full screen
  document.addEventListener('keydown', e => {
    if (/INPUT|TEXTAREA|SELECT/.test((e.target.tagName || ''))) return;
    if (e.code === 'Space' && screen === 'game' && phase !== 'reveal') { e.preventDefault(); T.running ? pauseTimer() : resumeTimer(); }
    else if (e.key === 'f' || e.key === 'F') toggleFS();
  });
}

/* ---------------------------------------------------------------
   17. INIT
---------------------------------------------------------------- */
function init() {
  load();
  buildMall(); buildFloaters(); buildScorePanel(); buildRank();
  bind(); Music.init(); updateMusicLabel();
  MusicStore.get('music').then(b => { if (b) Music.setBlob(b, G.settings.musicName, false); }).catch(() => {});
  showScreen('home'); refreshHome(); updateRank(); updateScorePanel(false);
}
init();

})();
