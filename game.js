'use strict';
/* =========================================================================
   Chronoloop — a time-loop incremental
   Loop: gather Moments with timepieces until the clock runs out.
   Rewind: Moments earned this loop become Echoes (permanent currency).
   Paradox: collapse your echo progress into Paradox Shards (second prestige).
   ========================================================================= */

const SAVE_KEY = 'chronoloop_save_v1';
const TICK_MS = 50;
const OFFLINE_CAP = 2 * 3600;      // seconds
const MILESTONE = 25;              // every 25 owned doubles a timepiece's output
const MAXNUM = 1e300;
const ECHO_DIVISOR = 100;          // echoes = sqrt(moments / 100) * mult
const PARADOX_REQ = 1e5;           // echoes earned this paradox run

/* ---------- Content ---------- */
const TIERS = [
  { name: 'Spark',       flavor: 'a flicker of a second',      cost: 10,    prod: 1,    growth: 1.15, unlock: 0 },
  { name: 'Pendulum',    flavor: 'swings steady and true',     cost: 120,   prod: 8,    growth: 1.16, unlock: 0 },
  { name: 'Hourglass',   flavor: 'sand that never settles',    cost: 1800,  prod: 60,   growth: 1.17, unlock: 0 },
  { name: 'Clockwork',   flavor: 'gears inside gears',         cost: 3e4,   prod: 450,  growth: 1.18, unlock: 1 },
  { name: 'Sundial',     flavor: 'measures borrowed light',    cost: 6e5,   prod: 4000, growth: 1.19, unlock: 2 },
  { name: 'Orrery',      flavor: 'planets ticking in orbit',   cost: 1.5e7, prod: 4e4,  growth: 1.20, unlock: 3 },
  { name: 'Singularity', flavor: 'where all seconds converge', cost: 5e8,   prod: 5e5,  growth: 1.21, unlock: 'p' },
];

const ECHO_UPGRADES = [
  { id: 'stretch', name: 'Stretched Seconds', base: 2, growth: 1.9, max: 20,
    desc: l => `Each loop lasts 5s longer. (${fmtTime(loopLength(l))} → ${fmtTime(loopLength(l + 1))})` },
  { id: 'hand', name: 'Steady Hand', base: 1, growth: 1.8, max: 15,
    desc: l => `Gathering is twice as strong, and adds 2% of your moments/s per level. (now x${fmt(2 ** l)}, +${l * 2}%)` },
  { id: 'resonance', name: 'Resonance', base: 4, growth: 2.4, max: Infinity,
    desc: l => `All timepieces produce 1.6x as much. (x${fmt(1.6 ** l)} → x${fmt(1.6 ** (l + 1))})` },
  { id: 'pocket', name: 'Pocket Watch', base: 3, growth: 4, max: 25,
    desc: l => `Start each loop with more moments. (${fmt(startMoments(l))} → ${fmt(startMoments(l + 1))})` },
  { id: 'deeper', name: 'Deeper Time', costs: [10, 150, 2500], max: 3,
    desc: l => l < 3 ? `Unlock the ${TIERS[3 + l].name}.` : 'All deep timepieces are unlocked.' },
  { id: 'muscle', name: 'Muscle Memory', base: 15, growth: 2.6, max: 50,
    desc: l => `Start each loop with ${l + 1} of every unlocked timepiece (now ${l}).` },
  { id: 'ghost', name: 'Echo of Self', base: 8, growth: 3.5, max: 4,
    desc: l => `Your busiest loop replays on its own, gathering at ${(l + 1) * 50}% power (now ${l * 50}%).` },
  { id: 'hands', name: 'Clockwork Hands', base: 30, growth: 4, max: 7,
    desc: l => l < 7 ? `Automatically buy ${plural(TIERS[l].name)} every tick.` : 'Every timepiece is automated.' },
  { id: 'amp', name: 'Echo Chamber', base: 25, growth: 3, max: Infinity,
    desc: l => `Gain 30% more echoes per rewind. (x${fmt(1.3 ** l)} → x${fmt(1.3 ** (l + 1))})` },
];

const PARADOX_UPGRADES = [
  { id: 'quick', name: 'Quickened Time', base: 1, growth: 2, max: 10,
    desc: l => `Time runs 25% faster. Loops end sooner, but everything else speeds up too. (x${fmt(1.25 ** l)} → x${fmt(1.25 ** (l + 1))})` },
  { id: 'spark', name: 'Primordial Spark', base: 1, growth: 3, max: Infinity,
    desc: l => `All timepieces produce 2x as much. (x${fmt(2 ** l)} → x${fmt(2 ** (l + 1))})` },
  { id: 'keepHands', name: 'Retained Hands', base: 3, max: 1,
    desc: () => 'Keep Clockwork Hands when you collapse the timeline.' },
  { id: 'keepDeep', name: 'Retained Depth', base: 2, max: 1,
    desc: () => 'Keep Deeper Time when you collapse the timeline.' },
  { id: 'bargain', name: 'Bargain Echoes', base: 2, growth: 2.5, max: 8,
    desc: l => `Echo upgrades cost 15% less. (x${fmt(0.85 ** l)} → x${fmt(0.85 ** (l + 1))})` },
  { id: 'longmem', name: 'Long Memory', base: 3, growth: 3, max: 5,
    desc: l => `Loops last 1.5x as long. (x${fmt(1.5 ** l)} → x${fmt(1.5 ** (l + 1))})` },
  { id: 'shardres', name: 'Shard Resonance', base: 5, growth: 3, max: 5,
    desc: l => `Production x(1 + shards earned)^${((l + 1) * 0.05).toFixed(2)}. (x${fmt(shardProdMult(l))} → x${fmt(shardProdMult(l + 1))})` },
  { id: 'seventh', name: 'The Seventh Tier', base: 15, max: 1,
    desc: () => 'Unlock the Singularity.' },
];

const FEATS = [
  { id: 'loop1',   name: 'Déjà Vu',            desc: 'Finish your first loop.',              check: s => s.stats.loops >= 1 },
  { id: 'loop10',  name: 'Groundhog',          desc: 'Finish 10 loops.',                    check: s => s.stats.loops >= 10 },
  { id: 'loop100', name: 'Creature of Habit',  desc: 'Finish 100 loops.',                   check: s => s.stats.loops >= 100 },
  { id: 'loop1k',  name: 'Eternal Return',     desc: 'Finish 1,000 loops.',                 check: s => s.stats.loops >= 1000 },
  { id: 'm3',      name: 'A Thousand Moments', desc: 'Earn 1K moments in one loop.',        check: s => s.stats.bestLoop >= 1e3 },
  { id: 'm6',      name: 'Million-Moment Man', desc: 'Earn 1M moments in one loop.',        check: s => s.stats.bestLoop >= 1e6 },
  { id: 'm9',      name: 'Billions of Now',    desc: 'Earn 1B moments in one loop.',        check: s => s.stats.bestLoop >= 1e9 },
  { id: 'm12',     name: 'Trillion Ticks',     desc: 'Earn 1T moments in one loop.',        check: s => s.stats.bestLoop >= 1e12 },
  { id: 'm18',     name: 'Time Hoarder',       desc: 'Earn 1Qi moments in one loop.',       check: s => s.stats.bestLoop >= 1e18 },
  { id: 'm25',     name: 'Beyond the Clock',   desc: 'Earn 1e25 moments in one loop.',      check: s => s.stats.bestLoop >= 1e25 },
  { id: 'e100',    name: 'Reverberation',      desc: 'Earn 100 echoes in total.',           check: s => s.stats.totalEchoes >= 100 },
  { id: 'e1e4',    name: 'Choir of Echoes',    desc: 'Earn 10K echoes in total.',           check: s => s.stats.totalEchoes >= 1e4 },
  { id: 'e1e6',    name: 'Wall of Sound',      desc: 'Earn 1M echoes in total.',            check: s => s.stats.totalEchoes >= 1e6 },
  { id: 'big',     name: 'Jackpot Rewind',     desc: 'Earn 1K echoes from a single loop.',  check: s => s.stats.bestEchoGain >= 1e3 },
  { id: 'spark25', name: 'Firestarter',        desc: 'Own 25 Sparks at once.',              check: s => s.gens[0] >= 25 },
  { id: 'own100',  name: 'Collector',          desc: 'Own 100 of any timepiece.',           check: s => s.gens.some(g => g >= 100) },
  { id: 'cw',      name: 'Gearhead',           desc: 'Own a Clockwork.',                    check: s => s.gens[3] >= 1 },
  { id: 'orr',     name: 'Stargazer',          desc: 'Own an Orrery.',                      check: s => s.gens[5] >= 1 },
  { id: 'sing',    name: 'Event Horizon',      desc: 'Own a Singularity.',                  check: s => s.gens[6] >= 1 },
  { id: 'click1k', name: 'Busy Hands',         desc: 'Gather by hand 1,000 times.',         check: s => s.stats.clicks >= 1000 },
  { id: 'ghost',   name: 'Haunted',            desc: 'Unlock Echo of Self.',                check: s => lvl('ghost') >= 1 },
  { id: 'eager',   name: 'Impatient',          desc: 'Rewind early with 25+ echoes pending.', check: s => s.flags.eager },
  { id: 'par1',    name: 'Paradox',            desc: 'Collapse the timeline once.',         check: s => s.stats.paradoxes >= 1 },
  { id: 'par10',   name: 'Grandfather',        desc: 'Collapse the timeline 10 times.',     check: s => s.stats.paradoxes >= 10 },
];

/* ---------- State ---------- */
function newState() {
  return {
    moments: 10, loopMoments: 0, loopTime: 0, loopNum: 1,
    gens: TIERS.map(() => 0),
    echoes: 0, echoesThisParadox: 0,
    eu: {}, pu: {},
    shards: 0, totalShards: 0,
    ach: {},
    clicksThisLoop: [], ghostLoop: [], ghostIdx: 0,
    history: [],
    flags: {},
    stats: { loops: 0, clicks: 0, bestLoop: 0, totalEchoes: 0, paradoxes: 0, played: 0, bestEchoGain: 0, totalMoments: 0 },
    settings: { notation: 'suffix', buyAmt: '1', particles: true, flash: true },
    lastTime: Date.now(),
  };
}
let S = newState();

/* ---------- Formatting ---------- */
const SUFFIX = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];
function fmt(n) {
  if (!isFinite(n)) return '∞';
  if (n < 0) return '-' + fmt(-n);
  if (n < 1000) {
    if (n >= 100 || Number.isInteger(n)) return String(Math.floor(n));
    return (Math.floor(n * 100) / 100).toString();
  }
  let e = Math.floor(Math.log10(n) / 3);
  if (S.settings.notation === 'suffix' && e < SUFFIX.length) {
    let m = n / 1000 ** e;
    if (m >= 999.995) { e++; m /= 1000; if (e >= SUFFIX.length) return n.toExponential(2).replace('+', ''); }
    return m.toFixed(2) + SUFFIX[e];
  }
  return n.toExponential(2).replace('+', '');
}
function plural(n) { return n.endsWith('s') ? n + 'es' : n.endsWith('y') ? n.slice(0, -1) + 'ies' : n + 's'; }
function fmtTime(s) {
  if (s < 60) return s.toFixed(1) + 's';
  if (s < 3600) return `${Math.floor(s / 60)}m ${Math.floor(s % 60)}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

/* ---------- Derived values ---------- */
const lvl = id => S.eu[id] || 0;
const plvl = id => S.pu[id] || 0;
const achCount = () => Object.keys(S.ach).length;

function loopLength(l = lvl('stretch')) { return (20 + 5 * l) * 1.5 ** plvl('longmem'); }
function timeSpeed() { return 1.25 ** plvl('quick'); }
function startMoments(l = lvl('pocket')) { return 10 * 5 ** l; }
function shardProdMult(l = plvl('shardres')) { return (1 + S.totalShards) ** (0.05 * l); }
function shardEchoMult() { return Math.sqrt(1 + S.totalShards); }
function tierUnlocked(i) {
  const u = TIERS[i].unlock;
  if (u === 'p') return plvl('seventh') >= 1;
  return lvl('deeper') >= u;
}
function globalMult() {
  return 1.6 ** lvl('resonance') * 2 ** plvl('spark') * (1 + 0.03 * achCount()) * shardProdMult();
}
function tierProd(i, owned = S.gens[i]) {
  return TIERS[i].prod * owned * 2 ** Math.floor(owned / MILESTONE) * globalMult();
}
function totalProd() {
  let p = 0;
  for (let i = 0; i < TIERS.length; i++) p += tierProd(i);
  return p;
}
function clickValue() {
  const l = lvl('hand');
  return 2 ** l * Math.sqrt(globalMult()) + totalProd() * 0.02 * l;
}
function ghostPower() { return 0.5 * lvl('ghost'); }
function echoMult() { return 1.3 ** lvl('amp') * shardEchoMult(); }
function echoesFor(m) { return Math.floor(Math.sqrt(m / ECHO_DIVISOR) * echoMult()); }
function pendingEchoes() { return echoesFor(S.loopMoments); }
function nextEchoAt() {
  const next = pendingEchoes() + 1;
  return ECHO_DIVISOR * (next / echoMult()) ** 2;
}
function pendingShards() { return Math.floor(3 * (S.echoesThisParadox / PARADOX_REQ) ** 0.3); }
function canParadox() { return S.echoesThisParadox >= PARADOX_REQ; }

/* ---------- Costs & buying ---------- */
function genCost(i, amount) {
  const t = TIERS[i], n = S.gens[i];
  const first = t.cost * t.growth ** n;
  return first * (t.growth ** amount - 1) / (t.growth - 1);
}
function genMaxAffordable(i, money = S.moments) {
  const t = TIERS[i], n = S.gens[i];
  const first = t.cost * t.growth ** n;
  if (money < first) return 0;
  return Math.floor(Math.log(money * (t.growth - 1) / first + 1) / Math.log(t.growth));
}
function buyGen(i, amt) {
  if (!tierUnlocked(i)) return false;
  let n = amt === 'max' ? genMaxAffordable(i) : +amt;
  if (n <= 0) return false;
  const cost = genCost(i, n);
  if (cost > S.moments * (1 + 1e-9)) return false;
  S.moments = Math.max(0, S.moments - cost);
  S.gens[i] += n;
  return true;
}

function upgCost(up, l, isEcho) {
  if (l >= up.max) return Infinity;
  let c = up.costs ? up.costs[l] : up.base * (up.growth || 1) ** l;
  if (isEcho) c *= 0.85 ** plvl('bargain');
  return Math.max(1, Math.ceil(c));
}
function buyEchoUpg(up) {
  const l = lvl(up.id), c = upgCost(up, l, true);
  if (S.echoes < c) return;
  S.echoes -= c;
  S.eu[up.id] = l + 1;
  // Unlocking/adding starting gens mid-loop shouldn't be lost: apply muscle memory immediately.
  if (up.id === 'muscle') for (let i = 0; i < TIERS.length; i++) if (tierUnlocked(i)) S.gens[i] = Math.max(S.gens[i], l + 1);
  checkFeats();
  renderAll();
}
function buyParadoxUpg(up) {
  const l = plvl(up.id), c = upgCost(up, l, false);
  if (S.shards < c) return;
  S.shards -= c;
  S.pu[up.id] = l + 1;
  checkFeats();
  renderAll();
}

/* ---------- Loop lifecycle ---------- */
function startLoop() {
  S.moments = startMoments();
  S.loopMoments = 0;
  S.loopTime = 0;
  const mm = lvl('muscle');
  S.gens = TIERS.map((_, i) => (tierUnlocked(i) ? mm : 0));
  S.clicksThisLoop = [];
  S.ghostIdx = 0;
}

function endLoop(manual, quiet) {
  // A loop that runs its full course always leaves at least one echo.
  const gain = manual ? pendingEchoes() : Math.max(1, pendingEchoes());
  if (manual && gain >= 25) S.flags.eager = true;
  S.echoes += gain;
  S.echoesThisParadox += gain;
  S.stats.totalEchoes += gain;
  S.stats.loops++;
  S.stats.bestLoop = Math.max(S.stats.bestLoop, S.loopMoments);
  S.stats.bestEchoGain = Math.max(S.stats.bestEchoGain, gain);
  S.history.push({ e: gain, m: manual ? 1 : 0 });
  if (S.history.length > 24) S.history.shift();
  if (S.clicksThisLoop.length >= S.ghostLoop.length) S.ghostLoop = S.clicksThisLoop.slice();
  const finished = S.loopNum;
  S.loopNum++;
  startLoop();
  if (!quiet) {
    rewindFx();
    toast(`Loop ${finished} ${manual ? 'rewound' : 'ended'} · +${fmt(gain)} echoes`);
    checkFeats();
    renderAll();
  }
  return gain;
}

function paradox() {
  if (!canParadox()) return;
  const gain = pendingShards();
  confirmModal('Collapse the timeline?',
    `<p>You will gain <b style="color:var(--shard)">${fmt(gain)} Paradox Shards</b>.</p>
     <p>Your echoes and echo upgrades will be reset${plvl('keepHands') || plvl('keepDeep') ? ', except the ones your Paradox upgrades keep' : ''}.</p>`,
    'Collapse', () => {
      S.shards += gain;
      S.totalShards += gain;
      const keep = {};
      if (plvl('keepHands')) keep.hands = lvl('hands');
      if (plvl('keepDeep')) keep.deeper = lvl('deeper');
      S.eu = keep;
      S.echoes = 0;
      S.echoesThisParadox = 0;
      S.stats.paradoxes++;
      S.history = [];
      S.loopNum++;
      startLoop();
      rewindFx(true);
      toast(`Timeline collapsed · +${fmt(gain)} shards`, 'shard');
      checkFeats();
      renderAll();
      save();
    });
}

/* ---------- Simulation ---------- */
let fx = { ghostHits: 0 };

function gather(fromGhost) {
  const v = clickValue() * (fromGhost ? ghostPower() : 1);
  S.moments += v;
  S.loopMoments += v;
  S.stats.totalMoments += v;
  if (!fromGhost) {
    S.stats.clicks++;
    if (S.clicksThisLoop.length < 4000) S.clicksThisLoop.push(S.loopTime);
  }
  return v;
}

function autoBuy() {
  const h = Math.min(lvl('hands'), TIERS.length);
  for (let i = h - 1; i >= 0; i--) if (tierUnlocked(i)) buyGen(i, 'max');
}

/** Advance the game by `dt` real seconds. Returns echoes gained from loops that ended. */
function update(dt, quiet) {
  S.stats.played += dt;
  let g = dt * timeSpeed();
  let gained = 0, loops = 0;
  let guard = 0;
  while (g > 1e-9 && guard++ < 10000) {
    const len = loopLength();
    const step = Math.min(g, Math.max(0, len - S.loopTime));
    const p = totalProd() * step;
    S.moments += p;
    S.loopMoments += p;
    S.stats.totalMoments += p;
    S.loopTime += step;
    g -= step;

    if (lvl('ghost') > 0) {
      const gl = S.ghostLoop;
      while (S.ghostIdx < gl.length && gl[S.ghostIdx] <= S.loopTime) {
        gather(true);
        S.ghostIdx++;
        fx.ghostHits++;
      }
    }
    autoBuy();

    if (S.loopTime >= len - 1e-9) {
      gained += endLoop(false, quiet);
      loops++;
    }
  }
  return { gained, loops };
}

function simulateOffline(seconds) {
  const sec = Math.min(seconds, OFFLINE_CAP);
  const before = { echoes: S.echoes, loops: S.stats.loops };
  const step = 0.25;
  let t = sec;
  while (t > 0) { const d = Math.min(step, t); update(d, true); t -= d; }
  checkFeats(true);
  return { sec, echoes: S.echoes - before.echoes, loops: S.stats.loops - before.loops };
}

let lastTick = performance.now();
function tick() {
  const now = performance.now();
  let dt = (now - lastTick) / 1000;
  lastTick = now;
  if (dt > 5) {
    const r = simulateOffline(dt);
    if (r.loops > 0) toast(`Time passed: ${r.loops} loops, +${fmt(r.echoes)} echoes`);
    renderAll();
  } else {
    update(dt, false);
  }
  S.lastTime = Date.now();
  render();
}

/* ---------- Feats ---------- */
function checkFeats(quiet) {
  for (const f of FEATS) {
    if (!S.ach[f.id] && f.check(S)) {
      S.ach[f.id] = 1;
      if (!quiet) toast(`Feat unlocked: ${f.name}`, 'feat');
      renderFeats();
    }
  }
}

/* ---------- DOM helpers ---------- */
const $ = id => document.getElementById(id);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

function toast(msg, kind = '') {
  const t = el('div', 'toast ' + kind, msg);
  const box = $('toasts');
  box.appendChild(t);
  while (box.children.length > 5) box.firstChild.remove();
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, 3200);
}

function confirmModal(title, body, okText, onOk) {
  $('modal-title').textContent = title;
  $('modal-body').innerHTML = body;
  const btns = $('modal-btns');
  btns.innerHTML = '';
  const cancel = el('button', 'btn', 'Cancel');
  const ok = el('button', 'btn ' + (okText === 'Reset' ? 'danger' : 'paradox'), okText);
  ok.style.width = 'auto'; ok.style.marginTop = '0';
  cancel.onclick = () => $('modal').classList.add('hidden');
  ok.onclick = () => { $('modal').classList.add('hidden'); onOk(); };
  btns.append(cancel, ok);
  $('modal').classList.remove('hidden');
}

function rewindFx(big) {
  const w = document.querySelector('.clock-wrap');
  w.classList.remove('rewinding'); void w.offsetWidth; w.classList.add('rewinding');
  if (S.settings.flash) {
    const f = $('flash');
    f.style.background = big
      ? 'radial-gradient(circle at 50% 50%, rgba(199,139,255,.45), transparent 70%)'
      : '';
    f.classList.remove('go'); void f.offsetWidth; f.classList.add('go');
  }
}

function particle(text, ghost) {
  if (!S.settings.particles) return;
  const box = $('particles');
  if (box.childElementCount > 40) return;
  const p = el('div', 'pt' + (ghost ? ' ghost' : ''), text);
  p.style.left = (50 + (Math.random() - 0.5) * 40) + '%';
  p.style.top = (38 + (Math.random() - 0.5) * 20) + '%';
  box.appendChild(p);
  setTimeout(() => p.remove(), 1000);
}
function ghostRing() {
  if (!S.settings.particles) return;
  const box = $('particles');
  if (box.querySelectorAll('.ghost-ring').length > 4) return;
  const r = el('div', 'ghost-ring');
  box.appendChild(r);
  setTimeout(() => r.remove(), 600);
}

/* ---------- Build static UI ---------- */
const genEls = [];
const RING_C = 2 * Math.PI * 96;

function buildUI() {
  // clock ticks
  const ticks = $('ticks');
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    l.setAttribute('x1', 110 + Math.sin(a) * 78); l.setAttribute('y1', 110 - Math.cos(a) * 78);
    l.setAttribute('x2', 110 + Math.sin(a) * 84); l.setAttribute('y2', 110 - Math.cos(a) * 84);
    ticks.appendChild(l);
  }
  $('ring').style.strokeDasharray = RING_C;

  // generators
  const gens = $('gens');
  TIERS.forEach((t, i) => {
    const row = el('div', 'gen');
    row.innerHTML = `
      <div class="g-name">${t.name}<small>${t.flavor}</small><span class="g-auto hidden">auto</span></div>
      <div class="g-sub"><span class="g-owned">0</span> owned · <span class="g-prod">0</span>/s</div>
      <button class="btn g-buy"></button>
      <div class="g-bar"><div></div></div>`;
    const btn = row.querySelector('.g-buy');
    btn.onclick = () => { if (buyGen(i, S.settings.buyAmt)) { checkFeats(); render(); } };
    gens.appendChild(row);
    genEls.push({
      row, btn,
      owned: row.querySelector('.g-owned'), prod: row.querySelector('.g-prod'),
      auto: row.querySelector('.g-auto'), bar: row.querySelector('.g-bar div'),
      name: row.querySelector('.g-name'),
    });
  });

  // upgrade lists
  buildUpgList($('echo-upgrades'), ECHO_UPGRADES, buyEchoUpg);
  buildUpgList($('paradox-upgrades'), PARADOX_UPGRADES, buyParadoxUpg);

  // feats
  renderFeats();

  // events
  const gatherBtn = $('gather');
  gatherBtn.addEventListener('pointerdown', e => {
    e.preventDefault();
    const v = gather(false);
    particle('+' + fmt(v));
  });
  gatherBtn.addEventListener('keydown', e => { if (e.key === 'Enter') { const v = gather(false); particle('+' + fmt(v)); } });
  $('rewind').onclick = () => endLoop(true, false);
  $('paradox-btn').onclick = paradox;

  document.querySelectorAll('#buy-amt button').forEach(b => {
    b.onclick = () => { S.settings.buyAmt = b.dataset.amt; syncBuyAmt(); render(); };
  });
  document.querySelectorAll('#tabs button').forEach(b => {
    b.onclick = () => {
      document.querySelectorAll('#tabs button').forEach(x => x.classList.toggle('on', x === b));
      document.querySelectorAll('.tab').forEach(x => x.classList.toggle('on', x.id === 'tab-' + b.dataset.tab));
      b.classList.remove('notify');
      if (b.dataset.tab === 'stats') renderStats();
    };
  });

  $('opt-notation').onchange = e => { S.settings.notation = e.target.value; renderAll(); };
  $('opt-particles').onchange = e => { S.settings.particles = e.target.checked; };
  $('opt-flash').onchange = e => { S.settings.flash = e.target.checked; };
  $('btn-save').onclick = () => { save(); toast('Game saved'); };
  $('btn-export').onclick = () => {
    const txt = btoa(unescape(encodeURIComponent(JSON.stringify(S))));
    $('save-text').value = txt;
    $('save-text').select();
    navigator.clipboard?.writeText(txt).then(() => toast('Save copied to clipboard'), () => {});
  };
  $('btn-import').onclick = () => {
    const txt = $('save-text').value.trim();
    if (!txt) { toast('Paste a save into the box first'); return; }
    try {
      const data = JSON.parse(decodeURIComponent(escape(atob(txt))));
      loadState(data);
      save();
      renderAll();
      toast('Save imported');
    } catch (err) { toast('That save could not be read'); }
  };
  $('btn-reset').onclick = () => confirmModal('Hard reset?', '<p>This deletes all progress permanently.</p>', 'Reset', () => {
    S = newState();
    startLoop();
    S.moments = 10;
    save();
    renderAll();
    toast('Progress reset');
  });

  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT' || !$('modal').classList.contains('hidden')) return;
    if (e.code === 'Space') {
      e.preventDefault();
      if (e.repeat) return;
      const v = gather(false); particle('+' + fmt(v));
    } else if (e.key === 'r' || e.key === 'R') {
      endLoop(true, false);
    } else if (/^[1-7]$/.test(e.key)) {
      if (buyGen(+e.key - 1, S.settings.buyAmt)) { checkFeats(); render(); }
    }
  });
  window.addEventListener('beforeunload', save);
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
}

function buildUpgList(container, list, onBuy) {
  container.innerHTML = '';
  list.forEach(up => {
    const row = el('div', 'upg');
    row.innerHTML = `<div class="u-name">${up.name}<span class="u-lvl"></span></div>
      <div class="u-desc"></div><button class="btn u-buy"></button>`;
    row.querySelector('.u-buy').onclick = () => onBuy(up);
    container.appendChild(row);
    up._el = { row, lvl: row.querySelector('.u-lvl'), desc: row.querySelector('.u-desc'), btn: row.querySelector('.u-buy') };
  });
}

function syncBuyAmt() {
  document.querySelectorAll('#buy-amt button').forEach(b => b.classList.toggle('on', b.dataset.amt === String(S.settings.buyAmt)));
}

/* ---------- Rendering ---------- */
let lastSlowRender = 0;

function render() {
  const mps = totalProd() * timeSpeed();
  $('c-moments').textContent = fmt(S.moments);
  $('c-mps').textContent = fmt(mps) + '/s';
  $('c-echoes').textContent = fmt(S.echoes);
  const pend = pendingEchoes();
  $('c-pending').textContent = `+${fmt(pend)} on rewind`;

  // clock
  const len = loopLength();
  const frac = Math.min(1, S.loopTime / len);
  $('ring').style.strokeDashoffset = RING_C * frac;
  $('hand').style.transform = `rotate(${frac * 360}deg)`;
  $('time-left').textContent = fmtTime(Math.max(0, (len - S.loopTime) / timeSpeed()));
  $('loop-num').textContent = S.loopNum;
  $('loop-moments').textContent = fmt(S.loopMoments);
  $('pending').textContent = fmt(pend);
  $('next-echo').textContent = fmt(nextEchoAt());
  $('click-val').textContent = '+' + fmt(clickValue());

  // ghost visuals
  if (fx.ghostHits > 0) {
    ghostRing();
    if (fx.ghostHits < 4) particle('+' + fmt(clickValue() * ghostPower()), true);
    fx.ghostHits = 0;
  }

  // generators
  const amt = S.settings.buyAmt;
  const hands = lvl('hands');
  TIERS.forEach((t, i) => {
    const g = genEls[i];
    const unlocked = tierUnlocked(i);
    g.row.classList.toggle('locked', !unlocked);
    if (!unlocked) {
      g.btn.disabled = true;
      g.btn.textContent = t.unlock === 'p' ? 'Paradox upgrade' : `Deeper Time ${['', 'I', 'II', 'III'][t.unlock]}`;
      g.owned.textContent = '0'; g.prod.textContent = '0';
      g.bar.style.width = '0%';
      g.auto.classList.add('hidden');
      return;
    }
    let n = amt === 'max' ? Math.max(1, genMaxAffordable(i)) : +amt;
    const cost = genCost(i, n);
    const can = cost <= S.moments;
    g.btn.disabled = !can;
    g.btn.classList.toggle('can', can);
    g.btn.innerHTML = `Buy ${n}<br><small>${fmt(cost)}</small>`;
    g.owned.textContent = S.gens[i];
    g.prod.textContent = fmt(tierProd(i) * timeSpeed());
    g.bar.style.width = ((S.gens[i] % MILESTONE) / MILESTONE * 100) + '%';
    g.auto.classList.toggle('hidden', i >= hands);
  });

  const now = performance.now();
  if (now - lastSlowRender > 250) { lastSlowRender = now; renderSlow(); }
}

function renderUpgList(list, level, currency, isEcho) {
  list.forEach(up => {
    const l = level(up.id), e = up._el;
    const max = l >= up.max;
    const c = upgCost(up, l, isEcho);
    e.lvl.textContent = up.max === 1 ? (max ? 'owned' : '') : `Lv ${l}${isFinite(up.max) ? '/' + up.max : ''}`;
    e.desc.textContent = up.desc(l);
    e.row.classList.toggle('maxed', max);
    e.btn.disabled = max || currency < c;
    e.btn.classList.toggle('can', !max && currency >= c);
    e.btn.innerHTML = max ? 'Maxed' : `${fmt(c)}<br><small>${isEcho ? 'echoes' : 'shards'}</small>`;
  });
}

function renderSlow() {
  renderUpgList(ECHO_UPGRADES, lvl, S.echoes, true);

  // paradox
  const showParadox = S.stats.totalEchoes >= 1000 || S.stats.paradoxes > 0;
  const pbtn = $('tab-paradox-btn');
  if (showParadox && pbtn.classList.contains('hidden')) {
    pbtn.classList.remove('hidden');
    pbtn.classList.add('notify');
    toast('A new layer opens: Paradox', 'shard');
  }
  $('cur-shards').classList.toggle('hidden', !(S.stats.paradoxes > 0 || S.totalShards > 0));
  $('c-shards').textContent = fmt(S.shards);
  $('c-shardinfo').textContent = `x${fmt(shardEchoMult())} echoes`;
  const prog = Math.min(1, S.echoesThisParadox / PARADOX_REQ);
  $('paradox-prog').style.width = (prog * 100) + '%';
  $('paradox-label').textContent = canParadox()
    ? `Ready: collapse now for ${fmt(pendingShards())} shards (${fmt(S.echoesThisParadox)} echoes earned this timeline)`
    : `${fmt(S.echoesThisParadox)} / ${fmt(PARADOX_REQ)} echoes earned this timeline`;
  $('paradox-btn').disabled = !canParadox();
  $('paradox-btn').textContent = canParadox() ? `Collapse timeline (+${fmt(pendingShards())} shards)` : 'Collapse timeline';
  renderUpgList(PARADOX_UPGRADES, plvl, S.shards, false);

  // history
  const bars = $('history-bars');
  const hist = S.history;
  const maxE = Math.max(1, ...hist.map(h => h.e));
  if (bars.childElementCount !== 24) { bars.innerHTML = ''; for (let i = 0; i < 24; i++) bars.appendChild(el('div')); }
  for (let i = 0; i < 24; i++) {
    const h = hist[hist.length - 24 + i];
    const b = bars.children[i];
    b.style.height = h ? Math.max(4, (h.e / maxE) * 100) + '%' : '0';
    b.className = h && h.m ? 'manual' : '';
    b.title = h ? `+${fmt(h.e)} echoes${h.m ? ' (rewound early)' : ''}` : '';
  }

  // ghost info
  const gi = $('ghost-info');
  if (lvl('ghost') > 0) {
    gi.classList.remove('hidden');
    gi.textContent = `👻 Your past self replays ${S.ghostLoop.length} gathers at ${ghostPower() * 100}% power`;
  } else gi.classList.add('hidden');

  $('feat-count').textContent = `${achCount()}/${FEATS.length}`;
  if (document.querySelector('#tab-stats.on')) renderStats();
}

function renderFeats() {
  const box = $('feats');
  box.innerHTML = '';
  FEATS.forEach(f => {
    const d = el('div', 'feat' + (S.ach[f.id] ? ' got' : ''), `<b>${f.name}</b><span>${f.desc}</span>`);
    box.appendChild(d);
  });
}

function renderStats() {
  const s = S.stats;
  const rows = [
    ['Time played', fmtTime(s.played)],
    ['Loops finished', fmt(s.loops)],
    ['Current loop length', fmtTime(loopLength() / timeSpeed()) + ' (real time)'],
    ['Time speed', 'x' + fmt(timeSpeed())],
    ['Production multiplier', 'x' + fmt(globalMult())],
    ['Echo multiplier', 'x' + fmt(echoMult())],
    ['Best loop (moments)', fmt(s.bestLoop)],
    ['Best single rewind (echoes)', fmt(s.bestEchoGain)],
    ['Total moments earned', fmt(s.totalMoments)],
    ['Total echoes earned', fmt(s.totalEchoes)],
    ['Times gathered by hand', fmt(s.clicks)],
    ['Timelines collapsed', fmt(s.paradoxes)],
    ['Paradox shards earned', fmt(S.totalShards)],
    ['Feats', `${achCount()} / ${FEATS.length} (+${achCount() * 3}% production)`],
  ];
  $('stats').innerHTML = rows.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`).join('');
}

function renderAll() {
  $('opt-notation').value = S.settings.notation;
  $('opt-particles').checked = S.settings.particles;
  $('opt-flash').checked = S.settings.flash;
  syncBuyAmt();
  renderFeats();
  render();
  renderSlow();
}

/* ---------- Save / load ---------- */
function save() {
  try {
    S.lastTime = Date.now();
    localStorage.setItem(SAVE_KEY, JSON.stringify(S));
  } catch (e) { /* storage may be unavailable */ }
}

function loadState(data) {
  const base = newState();
  const merged = Object.assign(base, data);
  merged.stats = Object.assign(newState().stats, data.stats || {});
  merged.settings = Object.assign(newState().settings, data.settings || {});
  merged.flags = data.flags || {};
  merged.eu = data.eu || {};
  merged.pu = data.pu || {};
  merged.ach = data.ach || {};
  const g = Array.isArray(data.gens) ? data.gens : [];
  merged.gens = TIERS.map((_, i) => +g[i] || 0);
  for (const k of ['clicksThisLoop', 'ghostLoop', 'history']) if (!Array.isArray(merged[k])) merged[k] = [];
  S = merged;
}

function load() {
  let raw = null;
  try { raw = localStorage.getItem(SAVE_KEY); } catch (e) { /* ignore */ }
  if (!raw) return null;
  try {
    loadState(JSON.parse(raw));
    return (Date.now() - (S.lastTime || Date.now())) / 1000;
  } catch (e) { return null; }
}

/* ---------- Boot ---------- */
function boot() {
  const away = load();
  buildUI();
  renderAll();
  if (away && away > 10) {
    const r = simulateOffline(away);
    renderAll();
    if (r.loops > 0 || r.echoes > 0) {
      confirmModal('While you were away…',
        `<p>${fmtTime(r.sec)} passed${away > OFFLINE_CAP ? ' (capped at 2h)' : ''}.</p>
         <p>Your timeline looped <b>${fmt(r.loops)}</b> times and gathered <b style="color:var(--echo)">${fmt(r.echoes)} echoes</b>.</p>`,
        'Nice', () => {});
      document.querySelector('#modal-btns .btn').remove(); // only one button needed
    }
  }
  lastTick = performance.now();
  setInterval(tick, TICK_MS);
  setInterval(save, 10000);
}

if (typeof document !== 'undefined') boot();
