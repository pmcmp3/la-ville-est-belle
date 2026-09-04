// main.js — « J'ai un pote » : boucle à pas fixe, état de partie, saut,
// peloton, score en mètres, mort et seconde chance. Même squelette que le
// premier jeu (horloge = audio, pas fixe 120 Hz, ancrage du départ sur la
// grille du morceau, décompte 3-2-1-GO), gameplay réécrit.

import * as audio from "./audio.js";
import { clock } from "./clock.js";
import * as road from "./road.js";
import * as fields from "./fields.js";
import * as track from "./track.js";
import * as obstacles from "./obstacles.js";
import * as friends from "./friends.js";
import * as hud from "./hud.js";
import * as screens from "./screens.js";
import * as debugOverlay from "./debug.js";
import { consumeJumpPress, isHolding } from "./input.js";
import { makeRider, PALETTES, HEIGHT_WORLD, DRAW_SCALE } from "./rider.js";
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
function ancrerDepartSurLaGrille() {
  const pos = audioDrivesClock ? audio.now() : 0;
  const pas = clock.beatPeriod;
  const go = Math.ceil((pos + track.LEAD_IN) / pas) * pas;
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
  metres: 0,
  points: 0,        // points d'étoiles cumulés (font venir les potes)
  potesGagnes: 0,   // nombre de paliers franchis
  etoiles: 0,
  ended: false,
  endReason: null,
  reviveOffered: false,
  sansFaute: true,
  startedAt: 0,
};
const playerRider = makeRider(PALETTES.pmc);
const playerState = { pedalPhase: 0, prevPedalPhase: 0, lean: 0 };

// Saut : parabole à gravité constante, gravité ALLÉGÉE tant que le doigt reste
// posé (tap long = plus haut, plus loin), gravité renforcée dès qu'on lâche
// en montée (tap court = petit saut). C'est la recette Mario.
const jump = { mode: "ground", y: 0, prevY: 0, vy: 0, held: false };
function jumpPhysics() {
  const T = window.CONFIG.dureeSaut;
  const apex = window.CONFIG.hauteurSaut * HEIGHT_WORLD * 0.6;
  return { vJump: 4 * apex / T, g: 8 * apex / (T * T) };
}
const RELEASE_GRAVITY = 3.2; // multiplicateur de gravité en montée après relâchement

function multiplicateur() {
  return 1 + window.CONFIG.potesBonusMetres * friends.count();
}
function prochainPalier() {
  const paliers = window.CONFIG.potesPaliers;
  return paliers[Math.min(game.potesGagnes, paliers.length - 1)];
}
function palierPrecedent() {
  const paliers = window.CONFIG.potesPaliers;
  return game.potesGagnes === 0 ? 0 : paliers[game.potesGagnes - 1];
}

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
const JAUNE = "#ffcf2e", ROUGE = "#e13e26", BLANC = "#ffffff";

// --- Démarrage / rejeu -----------------------------------------------------------
function requestGameStart() {
  road.markCourseStart();
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
  jump.mode = "ground"; jump.y = 0; jump.prevY = 0; jump.vy = 0;
  friends.reset();
  track.reseed();
  track.reset();
  road.reset();
  popups.length = 0; banner = null; damageFlash = 0; shake.time = 0; hudAlpha = 0; hintTimer = 6;
  canvas.classList.remove("game-over-bw");
  canvas.classList.remove("danger");
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
        // Les potes retombent du ciel : deux au plus (le ressort de la carte).
        const retour = Math.min(2, friends.maxReached());
        for (let i = 0; i < retour; i++) friends.join();
        afficherBanner(retour > 0 ? (retour > 1 ? "TES POTES SONT REVENUS" : "TON POTE EST REVENU") : "C'EST REPARTI", null, JAUNE);
        reviveShieldUntil = clock.now() + 2.5;
      },
      onDecline: () => { revivePaused = false; applyPauseState(); endGame("mort"); },
      onReplay: () => { revivePaused = false; applyPauseState(); restartGame(); },
    });
  } else {
    endGame("mort");
  }
}
let reviveShieldUntil = -Infinity;

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

  playerState.prevPedalPhase = playerState.pedalPhase;
  jump.prevY = jump.y;

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
    // Menu : la route défile déjà, le personnage pédale.
    road.idle(dt);
    playerState.pedalPhase += road.getSpeed() * dt * 0.55;
    return;
  }
  if (game.ended || isPaused()) return;

  const now = clock.now();
  const speed = road.getSpeed();
  road.update(dt, now);
  playerState.pedalPhase += speed * dt * 0.55;
  friends.update(dt);

  // --- Saut ---
  const { vJump, g } = jumpPhysics();
  const pressed = consumeJumpPress();
  if (jump.mode === "ground" && pressed) {
    jump.mode = "air"; jump.vy = vJump; jump.held = true;
  }
  if (jump.mode === "air") {
    if (jump.held && !isHolding()) jump.held = false;
    const gEff = jump.vy > 0 && !jump.held ? g * RELEASE_GRAVITY : g;
    jump.vy -= gEff * dt;
    jump.y += jump.vy * dt;
    if (jump.y <= 0) { jump.y = 0; jump.vy = 0; jump.mode = "ground"; }
  }

  // --- Mètres ---
  const mult = multiplicateur();
  if (now >= 0) game.metres += speed * dt * window.CONFIG.metresParUnite * mult;

  // --- Grille : étoiles et obstacles ---
  const events = track.update(now, speed, jump.y, friends.occupiedCols());
  for (const ev of events) {
    if (ev.type === "etoile") {
      const pts = window.CONFIG.etoiles[ev.tier];
      const m = window.CONFIG.etoileMetres[ev.tier] * mult;
      game.points += pts;
      game.metres += m;
      game.etoiles += 1;
      if (game.etoiles <= 5) pousserPopup(`+${Math.round(m)} m`, JAUNE);
      // Palier de pote franchi ?
      while (game.potesGagnes < window.CONFIG.potesPaliers.length && game.points >= window.CONFIG.potesPaliers[game.potesGagnes]) {
        game.potesGagnes += 1;
        const pote = friends.join();
        if (pote) {
          if (pote.name) afficherBanner(`@${pote.name.toUpperCase()} EST LÀ !`, "ton premier pote tombe du ciel", JAUNE, 2.8);
          else afficherBanner(`+1 POTE`, `${friends.count()} dans le peloton · ×${String(multiplicateur()).replace(".", ",")} mètres`, JAUNE);
          audio.playComboJingle(Math.min(6, friends.count()));
        }
      }
    } else if (ev.type === "obstacle" && !ev.cleared) {
      if (clock.now() < reviveShieldUntil) continue;
      const nom = obstacles.OBSTACLES[ev.kind].nom;
      if (friends.count() > 0) {
        const perdus = friends.lose(ev.cout);
        game.sansFaute = false;
        triggerShake(6, 0.45);
        damageFlash = 0.8;
        afficherBanner(perdus.length > 1 ? `−${perdus.length} POTES` : "−1 POTE", `${nom} en plein milieu de la route`, ROUGE, 2);
        if (friends.count() === 0) canvas.classList.add("danger");
      } else {
        mourir();
        break;
      }
    }
  }
  // Alerte N&B seulement quand on a EU des potes et qu'on les a tous perdus :
  // être seul au départ est l'état normal, pas un danger.
  if (friends.count() > 0 || friends.maxReached() === 0) canvas.classList.remove("danger");
  else if (!game.ended) canvas.classList.add("danger");
}

// Touches de debug (avec ?debug) : P = +1 pote, O = −1 pote, G = mourir.
window.addEventListener("keydown", (e) => {
  if (!debugOverlay.isEnabled() || !gameStarted || game.ended) return;
  if (e.code === "KeyP") { const p = friends.join(); if (p) afficherBanner(p.name ? `@${p.name.toUpperCase()} EST LÀ !` : "+1 POTE", "debug", JAUNE); }
  if (e.code === "KeyO") { friends.lose(1); afficherBanner("−1 POTE", "debug", ROUGE); }
  if (e.code === "KeyG") mourir();
});

// --- Rendu ---------------------------------------------------------------------
const STAR_R = { petite: 0.5, moyenne: 0.62, grosse: 0.78 };
const STAR_LIFT = { petite: 0.15, moyenne: 0.2, grosse: 1.8 };

function renderStar(s, now) {
  const p = road.project(road.colX(s.col), s.z, width, height);
  const R = STAR_R[s.tier] * p.scale;
  const bob = s.aerial ? Math.sin(now * 3 + s.index) * 0.15 : 0;
  const cy = p.y - (STAR_LIFT[s.tier] + bob) * p.scale - R;
  const alpha = Math.max(0, Math.min(1, (track.VISIBLE_Z_MAX - s.z) / track.FADE_BAND));
  const spin = (now * Math.PI * 2) / (clock.beatPeriod * 4);
  ctx.save();
  ctx.globalAlpha = alpha;
  if (s.aerial) {
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.beginPath(); ctx.ellipse(p.x, p.y, R * 0.7, R * 0.22, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.translate(p.x, cy);
  drawStar3D(ctx, R, spin + s.index * 0.7, false);
  ctx.restore();
}

function renderPlayer(alpha) {
  const y = jump.prevY + (jump.y - jump.prevY) * alpha;
  const pedal = playerState.prevPedalPhase + (playerState.pedalPhase - playerState.prevPedalPhase) * alpha;
  const p = road.project(0, road.PLAYER_NEAR_Z, width, height);
  if (y > 0.05) playerRider.shadow(ctx, p.x, p.y, p.scale);
  playerRider.render(ctx, p.x, p.y - y * p.scale, p.scale, 0, pedal);
}

function renderPopups() {
  if (!popups.length) return;
  const p = road.project(0, road.PLAYER_NEAR_Z, width, height);
  const base = p.y - jump.y * p.scale - HEIGHT_WORLD * DRAW_SCALE * p.scale * 1.35;
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  for (const pop of popups) {
    const t = pop.age / 1.1;
    ctx.globalAlpha = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
    ctx.font = `900 18px "Stage Grotesk", system-ui, sans-serif`;
    ctx.shadowColor = "rgba(0,0,0,0.6)"; ctx.shadowBlur = 6;
    ctx.fillStyle = pop.couleur;
    ctx.fillText(pop.texte, p.x, base - t * 46 - pop.decalage);
  }
  ctx.restore();
}

function render(alpha) {
  const now = clock.now();
  const distance = road.getRenderDistance(alpha);
  const shakeActive = shake.time > 0;
  if (shakeActive) {
    const k = shake.time / shake.duration;
    ctx.save();
    ctx.translate((Math.random() - 0.5) * shake.amp * k, (Math.random() - 0.5) * shake.amp * k);
  }

  road.render(ctx, width, height, distance);
  fields.render(ctx, width, height, distance);

  // Séquence du peintre : étoiles, obstacles, potes, joueur, triés par z.
  const items = [];
  if (gameStarted) {
    for (const s of track.slotsFor(now, road.getSpeed())) {
      if (s.z <= 0.5) continue;
      if (s.isBonus) { if (!track.isConsumed(s.index)) items.push({ z: s.z, draw: () => renderStar(s, now) }); }
      else {
        // Fondu à l'entrée (brume) ET à la sortie : un obstacle passé sous la
        // caméra (z < joueur) deviendrait un mur de pixels plein écran.
        const aIn = Math.max(0, Math.min(1, (track.VISIBLE_Z_MAX - s.z) / track.FADE_BAND));
        const aOut = Math.max(0, Math.min(1, (s.z - 4) / 7));
        items.push({ z: s.z, draw: () => obstacles.renderObstacle(ctx, s.kind, s.z, width, height, aIn * aOut) });
      }
    }
    const pedal = playerState.prevPedalPhase + (playerState.pedalPhase - playerState.prevPedalPhase) * alpha;
    const y = jump.prevY + (jump.y - jump.prevY) * alpha;
    for (const e of friends.extras(ctx, width, height, y, pedal, 0)) items.push(e);
  }
  items.push({ z: road.PLAYER_NEAR_Z, draw: () => renderPlayer(alpha) });
  items.sort((a, b) => b.z - a.z);
  for (const it of items) it.draw();

  if (damageFlash > 0) {
    ctx.fillStyle = `rgba(225, 62, 38, ${0.35 * damageFlash})`;
    ctx.fillRect(0, 0, width, height);
  }
  renderPopups();
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

  debugOverlay.renderBeatGrid(ctx, width, height);
  debugOverlay.renderStats(ctx, {
    fps: perf.fps, frameMs: perf.frameMs, playerX: 0,
    audioStatus: audio.getStatus(), clockSource: audioDrivesClock ? "audio" : "secours",
    conversion: screens.niveauConversionCourant(), classement: `potes ${friends.count()} · pts ${game.points}`,
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
