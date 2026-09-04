// main.js — « J'ai un pote », version Crossy Road (4 septembre 2026, refonte
// après retour : « pas la fausse 3D [...] une perspective comme ça avec des
// poules et des trucs qui traversent dans tous les sens »).
// Boucle à pas fixe 120 Hz, horloge = audio (comme le premier jeu), vue 3/4
// du dessus (iso.js), rangées et traversants (rows.js), peloton en serpent
// derrière le joueur (friends.js). Gestes : swipe = colonne, tap = saut.

import * as audio from "./audio.js";
import { clock } from "./clock.js";
import * as iso from "./iso.js";
import * as rows from "./rows.js";
import * as props from "./props.js";
import * as friends from "./friends.js";
import * as hud from "./hud.js";
import * as screens from "./screens.js";
import * as debugOverlay from "./debug.js";
import { consumeJumpPress, consumeLaneMove } from "./input.js";
import { PALETTES } from "./rider.js";
import { drawRider, RIDER_HEIGHT } from "./voxrider.js";
import { drawStar3D } from "./star3d.js";

const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d");
let width = 0, height = 0;

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  iso.setViewport(width, height);
}
window.addEventListener("resize", resize);
resize();

function updateBrowserChromeInset() {
  if (!window.visualViewport) return;
  const inset = Math.max(0, window.innerHeight - window.visualViewport.height - window.visualViewport.offsetTop);
  document.documentElement.style.setProperty("--browser-chrome-bottom", `${Math.round(inset)}px`);
}
if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", updateBrowserChromeInset);
  window.visualViewport.addEventListener("scroll", updateBrowserChromeInset);
  updateBrowserChromeInset();
}

// --- Horloge ---------------------------------------------------------------
const perfClock = () => performance.now() / 1000;
const AUDIO_START_TIMEOUT = 3;
const AUDIO_STALL_TIMEOUT = 1;
let gameStarted = false;
let startRequested = false;
let startRequestedAt = 0;
let audioDrivesClock = false;
let audioFallback = false;
const audioWatch = { lastT: -1, lastReal: 0 };

function useFallbackClock(preserve) {
  clock.setTimeSource(perfClock, preserve);
  audioDrivesClock = false;
  audioFallback = true;
}

const COUNT_IN_BEATS = 3;
const COUNT_IN_GO_LINGER_S = 0.55;
const LEAD_IN = 3.3; // secondes entre le départ et le GO (le décompte)
function ancrerDepartSurLaGrille() {
  const pos = audioDrivesClock ? audio.now() : 0;
  const pas = clock.beatPeriod;
  const go = Math.ceil((pos + LEAD_IN) / pas) * pas;
  clock.jumpBy(-(go - pos));
}

// --- Pause -------------------------------------------------------------------
let manualPaused = false, hiddenPaused = false, revivePaused = false;
let pauseStartedAt = 0;
function isPaused() { return manualPaused || hiddenPaused || revivePaused; }
function applyPauseState() {
  const next = revivePaused ? "revive" : hiddenPaused ? "silent" : manualPaused ? "muffled" : "running";
  audio.setPlaybackMode(next);
  if (next !== "running") {
    if (pauseStartedAt === 0) pauseStartedAt = perfClock();
  } else {
    if (pauseStartedAt > 0) {
      const ecart = perfClock() - pauseStartedAt;
      if (!audioDrivesClock) clock.jumpBy(-Math.round(ecart / clock.beatPeriod) * clock.beatPeriod);
      if (startRequested && !gameStarted) startRequestedAt += ecart;
    }
    pauseStartedAt = 0;
    audioWatch.lastT = audio.now();
    audioWatch.lastReal = perfClock();
  }
}
document.addEventListener("visibilitychange", () => { hiddenPaused = document.hidden; applyPauseState(); });

// --- État de partie ------------------------------------------------------------
const game = {
  metres: 0, points: 0, potesGagnes: 0, etoiles: 0,
  ended: false, endReason: null, reviveOffered: false, sansFaute: true, startedAt: 0,
};
const player = { col: 1, u: iso.colU(1), prevU: iso.colU(1), v: 0, prevV: 0, jumpY: 0, prevJumpY: 0, jumpVy: 0, pedal: 0, prevPedal: 0 };
const LANE_TWEEN = 11;
let camU = 0; // suivi latéral lissé de la caméra
// Vitesse d'avance en rangées/s : 2,6 × vitesseBase au départ, doublement
// toutes les 70 s, plafond 2,6 × vitesseMax.
const V_UNIT = 2.6, V_DOUBLING_S = 70;
let speed = V_UNIT * window.CONFIG.vitesseBase;
function targetSpeed(t) {
  const { vitesseBase, vitesseMax } = window.CONFIG;
  return V_UNIT * Math.min(vitesseMax, vitesseBase * Math.pow(2, Math.max(0, t) / V_DOUBLING_S));
}
function jumpPhysics() {
  const T = window.CONFIG.sautDuree, apex = window.CONFIG.sautHauteur;
  return { vJump: 4 * apex / T, g: 8 * apex / (T * T) };
}
function multiplicateur() { return 1 + window.CONFIG.potesBonusMetres * friends.count(); }
function palierPrecedent() { const p = window.CONFIG.potesPaliers; return game.potesGagnes === 0 ? 0 : p[game.potesGagnes - 1]; }
function prochainPalier() { const p = window.CONFIG.potesPaliers; return p[Math.min(game.potesGagnes, p.length - 1)]; }

// --- Effets ------------------------------------------------------------------
const popups = [];
function pousserPopup(texte, couleur) {
  const decalage = popups.filter((p) => p.age < 0.5).length * 24;
  popups.push({ texte, couleur, age: 0, decalage });
  if (popups.length > 3) popups.shift();
}
let banner = null;
function afficherBanner(titre, sous, couleur, duree = 2.4) { banner = { titre, sous, couleur, duree, timer: duree }; }
const shake = { time: 0, duration: 0.5, amp: 6 };
let damageFlash = 0;
let hudAlpha = 0;
const HUD_FADE = 0.6;
let hintTimer = 0;
let reviveShieldUntil = -Infinity;
const JAUNE = "#ffcf2e", ROUGE = "#e13e26";

// --- Départ / rejeu -----------------------------------------------------------------
function requestGameStart() {
  game.startedAt = perfClock();
  startRequested = true;
  startRequestedAt = perfClock();
  hintTimer = 9;
}
function isGameStartRequested() { return startRequested; }

function resetRun() {
  game.metres = 0; game.points = 0; game.potesGagnes = 0; game.etoiles = 0;
  game.ended = false; game.endReason = null; game.reviveOffered = false; game.sansFaute = true;
  game.startedAt = perfClock();
  player.col = 1; player.u = iso.colU(1); player.prevU = player.u; player.v = 0; player.prevV = 0;
  player.jumpY = 0; player.prevJumpY = 0; player.jumpVy = 0;
  speed = V_UNIT * window.CONFIG.vitesseBase;
  friends.reset();
  rows.reseed();
  rows.reset();
  popups.length = 0; banner = null; damageFlash = 0; shake.time = 0; hudAlpha = 0; hintTimer = 6;
  canvas.classList.remove("game-over-bw", "danger");
}

function restartGame() {
  audio.restart();
  if (audio.isRunning()) {
    clock.setTimeSource(audio.now);
    audioDrivesClock = true; audioFallback = false;
    audioWatch.lastT = -1; audioWatch.lastReal = perfClock();
  } else {
    useFallbackClock(false);
  }
  resetRun();
  ancrerDepartSurLaGrille();
  gameStarted = true;
  startRequested = true;
}

// --- Mort ----------------------------------------------------------------------
function mourir() {
  game.sansFaute = false;
  triggerShake(10, 0.6);
  damageFlash = 1;
  if (!game.reviveOffered) {
    game.reviveOffered = true;
    revivePaused = true;
    applyPauseState();
    screens.hidePauseButton();
    canvas.classList.add("game-over-bw");
    screens.openReviveSheet({
      metres: game.metres,
      potes: friends.maxReached(),
      onAccept: () => {
        canvas.classList.remove("game-over-bw");
        revivePaused = false;
        applyPauseState();
        screens.showPauseButton();
        consumeJumpPress();
        const retour = Math.min(2, friends.maxReached());
        for (let i = 0; i < retour; i++) friends.join(player);
        afficherBanner(retour > 1 ? "TES POTES SONT REVENUS" : retour === 1 ? "TON POTE EST REVENU" : "C'EST REPARTI", null, JAUNE);
        reviveShieldUntil = clock.now() + 2.5;
      },
      onDecline: () => { revivePaused = false; applyPauseState(); endGame("mort"); },
      onReplay: () => { revivePaused = false; applyPauseState(); restartGame(); },
    });
  } else {
    endGame("mort");
  }
}

function endGame(reason) {
  game.ended = true;
  game.endReason = reason;
  canvas.classList.add("game-over-bw");
  screens.hidePauseButton();
  const record = game.metres > screens.getRecord();
  if (record) screens.setRecord(game.metres);
  screens.showEndScreen({ metres: game.metres, potesMax: friends.maxReached(), record });
}

function triggerShake(amp, duration) { shake.amp = amp; shake.duration = duration; shake.time = duration; }

function gagnerEtoile() {
  const pts = 150;
  const mult = multiplicateur();
  const m = 5 * mult;
  game.points += pts;
  game.metres += m;
  game.etoiles += 1;
  if (game.etoiles <= 5) pousserPopup(`+${Math.round(m)} m`, JAUNE);
  while (game.potesGagnes < window.CONFIG.potesPaliers.length && game.points >= window.CONFIG.potesPaliers[game.potesGagnes]) {
    game.potesGagnes += 1;
    const pote = friends.join(player);
    if (pote) {
      if (pote.name) afficherBanner(`@${pote.name.toUpperCase()} EST LÀ !`, "ton premier pote débarque du champ", JAUNE, 2.8);
      else afficherBanner("+1 POTE", `${friends.count()} dans le peloton · ×${String(multiplicateur()).replace(".", ",")} mètres`, JAUNE);
      audio.playComboJingle(Math.min(6, friends.count()));
    }
  }
}

function toucherJoueur(ev) {
  if (clock.now() < reviveShieldUntil || invincible) return;
  const nom = rows.KINDS[ev.kind].nom;
  if (friends.count() > 0) {
    const perdus = friends.lose(ev.cout);
    game.sansFaute = false;
    triggerShake(6, 0.45);
    damageFlash = 0.8;
    afficherBanner(perdus.length > 1 ? `−${perdus.length} POTES` : "−1 POTE", `${nom}${ev.saut ? " — il fallait sauter" : ""}`, ROUGE, 2);
  } else {
    mourir();
  }
}

// --- Simulation ------------------------------------------------------------------
const STEP = 1 / 120;
const MAX_FRAME_TIME = 0.1;

function step(dt) {
  if (!gameStarted && startRequested) {
    if (audio.isRunning()) {
      clock.setTimeSource(audio.now);
      audioDrivesClock = true;
      audioWatch.lastT = -1; audioWatch.lastReal = perfClock();
      gameStarted = true;
    } else if (perfClock() - startRequestedAt > AUDIO_START_TIMEOUT) {
      useFallbackClock(false);
      gameStarted = true;
    }
    if (gameStarted) ancrerDepartSurLaGrille();
  }
  if (gameStarted && audioDrivesClock && !game.ended) {
    const audioT = audio.now();
    if (audioT > audioWatch.lastT + 1e-4) { audioWatch.lastT = audioT; audioWatch.lastReal = perfClock(); }
    else if (perfClock() - audioWatch.lastReal > AUDIO_STALL_TIMEOUT) useFallbackClock(true);
  }

  player.prevU = player.u; player.prevV = player.v; player.prevJumpY = player.jumpY; player.prevPedal = player.pedal;

  for (let i = popups.length - 1; i >= 0; i--) { popups[i].age += dt; if (popups[i].age >= 1.1) popups.splice(i, 1); }
  if (banner) { banner.timer -= dt; if (banner.timer <= 0) banner = null; }
  if (damageFlash > 0) damageFlash = Math.max(0, damageFlash - dt);
  if (shake.time > 0) shake.time = Math.max(0, shake.time - dt);
  if (hintTimer > 0 && gameStarted) hintTimer -= dt;

  if (gameStarted) {
    const enDecompte = clock.now() < -COUNT_IN_BEATS * clock.beatPeriod;
    const cible = game.ended || enDecompte ? 0 : 1;
    if (hudAlpha !== cible) { const pas = dt / HUD_FADE; hudAlpha = cible > hudAlpha ? Math.min(cible, hudAlpha + pas) : Math.max(cible, hudAlpha - pas); }
  }

  if (!gameStarted) {
    // Menu : le personnage pédale sur place, les traversants vivent.
    player.pedal += 4.5 * dt;
    return;
  }
  if (game.ended || isPaused()) return;

  const now = clock.now();
  const phys = jumpPhysics();

  // --- Colonne ---
  const move = consumeLaneMove();
  if (move) player.col = Math.max(0, Math.min(iso.COLS - 1, player.col + move));
  player.u += (iso.colU(player.col) - player.u) * Math.min(1, LANE_TWEEN * dt);

  // --- Saut ---
  let jumped = false;
  if (consumeJumpPress() && player.jumpY <= 0) { player.jumpVy = phys.vJump; player.jumpY = 0.001; jumped = true; friends.onPlayerJump(); }
  if (player.jumpY > 0) {
    player.jumpVy -= phys.g * dt;
    player.jumpY += player.jumpVy * dt;
    if (player.jumpY <= 0) { player.jumpY = 0; player.jumpVy = 0; }
  }

  // --- Avance ---
  speed += (targetSpeed(now) - speed) * Math.min(1, 3 * dt);
  if (now >= 0) {
    const dv = speed * dt;
    player.v += dv;
    game.metres += dv * window.CONFIG.metresParUnite * multiplicateur();
  }
  player.pedal += speed * dt * 3.2; // « il faut qu'on pédale un peu plus vite »
  friends.update(dt, player, phys, now);

  // --- Collisions et étoiles : le joueur puis chaque pote ---
  if (now >= 0) {
    for (const ev of rows.checkMember("j", player.u, player.v, player.jumpY > 0.25, now)) {
      if (ev.type === "etoile") gagnerEtoile();
      else { toucherJoueur(ev); if (game.ended || revivePaused) break; }
    }
    // Les potes ne prennent AUCUN dégât eux-mêmes (retour : « il faut que les
    // dégâts que tu prennes, ce soit toi et pas tes potes ») : ils se faufilent.
    // Ils ramassent quand même les étoiles qu'ils croisent.
    for (const m of friends.members()) {
      for (const ev of rows.checkMember(m.id, m.u, m.v, true, now)) if (ev.type === "etoile") gagnerEtoile();
    }
  }

  if (friends.count() > 0 || friends.maxReached() === 0) canvas.classList.remove("danger");
  else if (!game.ended) canvas.classList.add("danger");
}

// Touches de debug (avec ?debug) : P = +1 pote, O = −1 pote, G = mourir,
// I = invincible (pour filmer une longue course sans jouer).
let invincible = false;
window.addEventListener("keydown", (e) => {
  if (!debugOverlay.isEnabled() || !gameStarted || game.ended) return;
  if (e.code === "KeyI") { invincible = !invincible; afficherBanner(invincible ? "INVINCIBLE" : "VULNÉRABLE", "debug", JAUNE, 1.2); }
  if (e.code === "KeyP") { const p = friends.join(player); if (p) afficherBanner(p.name ? `@${p.name.toUpperCase()} EST LÀ !` : "+1 POTE", "debug", JAUNE); }
  if (e.code === "KeyO") { friends.lose(1); afficherBanner("−1 POTE", "debug", ROUGE); }
  if (e.code === "KeyG") mourir();
});

// --- Rendu ---------------------------------------------------------------------
function signAt(r) {
  const villages = window.CONFIG.villages || [];
  if (!villages.length || r % 45 !== 20) return null;
  const idx = Math.floor(r / 45) % villages.length;
  return { side: idx % 2 === 0 ? 1 : -1, village: villages[idx] };
}

function drawStar(r, c, now) {
  const p = iso.project(iso.colU(c), r, 0.5);
  const R = iso.scale() * 0.3;
  const spin = (now * Math.PI * 2) / (clock.beatPeriod * 4) + r * 0.7;
  iso.drawShadow(ctx, iso.colU(c), r, 0.25, 0.18, 0.2);
  ctx.save();
  ctx.translate(p.x, p.y);
  drawStar3D(ctx, R, spin, false);
  ctx.restore();
}

function render(alpha) {
  const now = clock.now();
  const u = player.prevU + (player.u - player.prevU) * alpha;
  const v = player.prevV + (player.v - player.prevV) * alpha;
  const jy = player.prevJumpY + (player.jumpY - player.prevJumpY) * alpha;
  const pedal = player.prevPedal + (player.pedal - player.prevPedal) * alpha;
  camU += (u * 0.35 - camU) * 0.08; // la vue glisse un peu avec la colonne, sans coller au joueur
  iso.setCamera(v, camU);

  const shakeActive = shake.time > 0;
  if (shakeActive) {
    const k = shake.time / shake.duration;
    ctx.save();
    ctx.translate((Math.random() - 0.5) * shake.amp * k, (Math.random() - 0.5) * shake.amp * k);
  }

  iso.renderGround(ctx);

  // Séquence du peintre : profondeur iso (u + v), du plus loin au plus près.
  const items = [];
  const { from, to } = iso.rowRange();
  for (let r = from; r <= to; r++) {
    for (const it of iso.rowDecor(ctx, r)) items.push(it);
    const sg = signAt(r);
    if (sg) { const su = sg.side * (iso.ROAD_HALF + 0.5); items.push({ d: iso.depth(su, r), draw: () => iso.drawSign(ctx, r, sg.side, sg.village) }); }
    if (r < 0) continue;
    const row = rows.rowAt(r);
    for (const c of row.stars) if (!rows.starTaken(r, c)) items.push({ d: iso.depth(iso.colU(c), r), draw: () => drawStar(r, c, now) });
    if (row.type === "statique") {
      const uc = row.cols.length === 2 ? (iso.colU(row.cols[0]) + iso.colU(row.cols[1])) / 2 : iso.colU(row.cols[0]);
      const K = rows.KINDS[row.kind];
      items.push({ d: iso.depth(uc - K.long / 2, r - K.larg / 2), draw: () => props.drawStatic(ctx, row.kind, uc, r) });
    } else if (row.type === "traverse") {
      const t = gameStarted ? now : perfClock();
      for (const inst of rows.crossersAt(r, row, t)) {
        items.push({ d: iso.depth(inst.u - inst.K.long / 2, r - inst.K.larg / 2), draw: () => props.drawCrosser(ctx, inst.kind, inst.u, r, inst.dir, t) });
      }
    }
  }
  if (gameStarted) for (const dr of friends.drawables(ctx, pedal)) items.push({ d: iso.depth(dr.u, dr.v), draw: dr.draw });
  items.push({ d: iso.depth(u, v), draw: () => drawRider(ctx, u, v, jy, PALETTES.pmc, pedal) });
  items.sort((a, b) => b.d - a.d);
  for (const it of items) it.draw();
  iso.renderHaze(ctx);

  if (damageFlash > 0) {
    ctx.fillStyle = `rgba(225, 62, 38, ${0.35 * damageFlash})`;
    ctx.fillRect(0, 0, width, height);
  }
  // Popups au-dessus du joueur.
  if (popups.length) {
    const g = iso.project(u, v, jy + RIDER_HEIGHT + 0.3);
    const base = g.y;
    ctx.save();
    ctx.textAlign = "center"; ctx.textBaseline = "bottom";
    for (const pop of popups) {
      const t = pop.age / 1.1;
      ctx.globalAlpha = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
      ctx.font = `900 18px "Stage Grotesk", system-ui, sans-serif`;
      ctx.shadowColor = "rgba(0,0,0,0.6)"; ctx.shadowBlur = 6;
      ctx.fillStyle = pop.couleur;
      ctx.fillText(pop.texte, g.x, base - t * 46 - pop.decalage);
    }
    ctx.restore();
  }
  if (shakeActive) ctx.restore();

  if (gameStarted && hudAlpha > 0.001) {
    ctx.save();
    ctx.globalAlpha = hudAlpha;
    const paliers = window.CONFIG.potesPaliers;
    const gaugeT = game.potesGagnes >= paliers.length ? 1 : (game.points - palierPrecedent()) / (prochainPalier() - palierPrecedent());
    hud.renderHud(ctx, width, height, { metres: game.metres, potes: friends.count(), potesMax: friends.max(), gaugeT, mult: Math.round(multiplicateur() * 100) / 100 });
    hud.renderBanner(ctx, width, height, banner);
    ctx.restore();
  }
  if (gameStarted && !game.ended) {
    if (now < COUNT_IN_GO_LINGER_S) hud.renderCountIn(ctx, width, height, now, clock.beatPeriod, COUNT_IN_BEATS, COUNT_IN_GO_LINGER_S);
    if (now >= 0 && !banner) hud.renderHint(ctx, width, height, Math.min(1, hintTimer));
  }

  debugOverlay.renderStats(ctx, {
    fps: perf.fps, frameMs: perf.frameMs, playerX: player.u,
    audioStatus: audio.getStatus(), clockSource: audioDrivesClock ? "audio" : "secours",
    conversion: screens.niveauConversionCourant(), classement: `potes ${friends.count()} · pts ${game.points} · v ${player.v.toFixed(1)} · ${speed.toFixed(1)} r/s`,
  });
}

// --- Boucle ------------------------------------------------------------------------
const perf = { fps: 0, frameMs: 0, acc: 0, n: 0 };
let lastTime = perfClock();
let accumulator = 0;

if (document.fonts && document.fonts.load) {
  Promise.all([
    document.fonts.load('900 30px "Stage Grotesk"'),
    document.fonts.load('500 13px "Stage Grotesk"'),
    document.fonts.load('900 40px "Source Serif 2"'),
  ]).catch(() => {});
}

function frame(nowMs) {
  try { frameInterne(nowMs); } finally { requestAnimationFrame(frame); }
}
function frameInterne(nowMs) {
  const t0 = performance.now();
  const now = nowMs / 1000;
  const frameTime = Math.min(now - lastTime, MAX_FRAME_TIME);
  lastTime = now;
  accumulator += frameTime;
  while (accumulator >= STEP) { step(STEP); accumulator -= STEP; }
  render(accumulator / STEP);
  screens.syncLoadingUi();
  const ms = performance.now() - t0;
  perf.acc += frameTime; perf.n += 1; perf.frameMs = ms;
  if (perf.acc >= 0.5) { perf.fps = Math.round(perf.n / perf.acc); perf.acc = 0; perf.n = 0; }
}

screens.init({
  game,
  requestGameStart,
  isGameStartRequested,
  restartGame,
  openPause: () => { manualPaused = true; applyPauseState(); },
  closePause: () => { manualPaused = false; applyPauseState(); },
  isManuallyPaused: () => manualPaused,
});
screens.showOverlayOnLoad();
requestAnimationFrame(frame);
