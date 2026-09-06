// main.js — « J'ai un pote », vue 3/4 à 30° (6 septembre 2026). Boucle à pas
// fixe 120 Hz, horloge = audio (comme le premier jeu), rangées et traversants
// (rows.js), peloton en file indienne (friends.js). Gestes : swipe = colonne,
// tap = saut, re-tap en l'air = salto.
//
// ⚠️ CONTRE-LA-MONTRE (6 septembre 2026) : la course dure exactement le
// morceau (config.dureeMorceau, 173,65 s), qui ne boucle pas. Sa fin termine
// la partie (« TERMINÉ ! »), sauf mort avant. Le score reste en mètres.

import * as audio from "./audio.js";
import * as sfx from "./sfx.js";
import { clock } from "./clock.js";
import * as iso from "./iso.js";
import * as rows from "./rows.js";
import * as props from "./props.js";
import * as friends from "./friends.js";
import * as hud from "./hud.js";
import * as screens from "./screens.js";
import * as debugOverlay from "./debug.js";
import { consumeJumpPress, consumeLaneMove, setAirborne } from "./input.js";
import { PALETTES } from "./rider.js";
import { drawRider, RIDER_HEIGHT } from "./voxrider.js";
import { drawCoin } from "./coin.js";

const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d");
let width = 0, height = 0, safeTop = 0;
const safeProbe = document.getElementById("safe-probe");

function resize() {
  // DPR plafonné à 1,5 sur mobile (2 sur ordinateur) : la scène est faite de
  // cubes à bords nets, la différence ne se voit pas, le coût de remplissage
  // baisse de 44 %.
  const mobile = Math.min(window.innerWidth, window.innerHeight) < 600;
  const dpr = Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2);
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  iso.setViewport(width, height);
  // Encoche / barre d'état (iPhone en plein écran) : le HUD descend d'autant.
  safeTop = safeProbe ? Math.max(0, Math.round(safeProbe.getBoundingClientRect().top)) : 0;
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

// Vibrations : Android (Chrome/Firefox) seulement — Safari iOS n'expose pas
// navigator.vibrate, et aucune API web ne fait vibrer un iPhone. Sans effet là-bas.
function vibrer(motif) { try { if (navigator.vibrate) navigator.vibrate(motif); } catch (e) { /* rien */ } }

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
const LEAD_IN = 3.3;
let departMorceau = 0; // position du morceau au GO (le contre-la-montre compte à partir de là)
function ancrerDepartSurLaGrille() {
  const pos = audioDrivesClock ? audio.now() : 0;
  const pas = clock.beatPeriod;
  const go = Math.ceil((pos + LEAD_IN) / pas) * pas;
  departMorceau = go;
  clock.jumpBy(-(go - pos));
}
// Temps restant avant la fin du morceau (= de la course).
function tempsRestant() {
  const duree = window.CONFIG.dureeMorceau;
  const pos = audioDrivesClock ? audio.now() : departMorceau + clock.now();
  return duree - pos;
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
  turbo: 0, finAge: -1, boue: 0,
};
const player = { col: 1, u: iso.colU(1), prevU: iso.colU(1), v: 0, prevV: 0, jumpY: 0, prevJumpY: 0, jumpVy: 0, pedal: 0, prevPedal: 0, doubled: false, flip: 0, prevFlip: 0, elan: 1 };
const LANE_TWEEN = 11;
let camU = 0;
const V_UNIT = 2.6, V_DOUBLING_S = 70;
let speed = V_UNIT * window.CONFIG.vitesseBase;
let slowMul = 1; // boue (lissé)
function targetSpeed(t) {
  const { vitesseBase, vitesseMax } = window.CONFIG;
  return V_UNIT * Math.min(vitesseMax, vitesseBase * Math.pow(2, Math.max(0, t) / V_DOUBLING_S));
}
function jumpPhysics() {
  const T = window.CONFIG.sautDuree, apex = window.CONFIG.sautHauteur;
  return { vJump: 4 * apex / T, g: 8 * apex / (T * T) };
}
function multiplicateur() { return (1 + window.CONFIG.potesBonusMetres * friends.count()) * (game.turbo > 0 ? 2 : 1); }
function palierPrecedent() { const p = window.CONFIG.potesPaliers; return game.potesGagnes === 0 ? 0 : p[game.potesGagnes - 1]; }
function prochainPalier() { const p = window.CONFIG.potesPaliers; return p[Math.min(game.potesGagnes, p.length - 1)]; }
const sparkles = [];
function semerSparkles(u, v, n = 9, couleur = null) {
  for (let i = 0; i < n; i++) sparkles.push({ u, v, h: 0.6, vu: (Math.random() - 0.5) * 3, vv: (Math.random() - 0.5) * 3, vh: 1.5 + Math.random() * 2.5, age: 0, couleur });
}
const ghosts = []; // traînée du salto

// --- Tutoriel ------------------------------------------------------------------
// Sur les `config.tutoParties` premières parties : consignes une à une au
// tout début, chacune validée par le geste (ou passée après 5 s). Pendant le
// tuto la vitesse est bridée et la route reste sans danger (rows.GRACE).
const TUTO_ETAPES = [
  { titre: "SWIPE = CHANGER DE VOIE", sous: "glisse à gauche ou à droite", test: (ev) => ev === "lane" },
  { titre: "TAP = SAUTER", sous: "les poules, les chats, les bottes se sautent", test: (ev) => ev === "jump" },
  { titre: "RE-TAP EN L'AIR = SALTO", sous: "quand la barre SALTO est pleine", test: (ev) => ev === "salto" },
  { titre: "LES PIÈCES APPELLENT TES POTES", sous: "plus de potes = plus de mètres", test: (ev) => ev === "piece" },
];
const tuto = { actif: false, index: 0, ok: 0, timer: 0, alpha: 0 };
function tutoDemarrer() { tuto.actif = true; tuto.index = 0; tuto.ok = 0; tuto.timer = 0; tuto.alpha = 0; }
function tutoEvenement(ev) {
  if (!tuto.actif || tuto.ok > 0) return;
  if (TUTO_ETAPES[tuto.index].test(ev)) { tuto.ok = 0.8; sfx.piece(); }
}
function tutoStep(dt, now) {
  if (!tuto.actif) return;
  if (now < 0) return;
  tuto.alpha = Math.min(1, tuto.alpha + dt * 3);
  if (tuto.ok > 0) {
    tuto.ok -= dt;
    if (tuto.ok <= 0) { tuto.ok = 0; tuto.index += 1; tuto.timer = 0; }
  } else {
    tuto.timer += dt;
    if (tuto.timer > 6) { tuto.index += 1; tuto.timer = 0; }
  }
  if (tuto.index >= TUTO_ETAPES.length) { tuto.actif = false; afficherBanner("À TOI DE JOUER !", null, JAUNE, 2); }
}
function tutoVue() {
  if (!tuto.actif) return null;
  const e = TUTO_ETAPES[tuto.index];
  return { titre: e.titre, sous: e.sous, index: tuto.index + 1, total: TUTO_ETAPES.length, ok: tuto.ok > 0, alpha: tuto.alpha };
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
let reviveShieldUntil = -Infinity;
const JAUNE = "#ffcf2e", ROUGE = "#e13e26";
let klaxonne = new Set();

// --- Départ / rejeu -----------------------------------------------------------------
function requestGameStart() {
  game.startedAt = perfClock();
  startRequested = true;
  startRequestedAt = perfClock();
  hintTimer = 9;
  if (screens.getParties() < (window.CONFIG.tutoParties || 0)) tutoDemarrer();
  screens.compterPartie();
}
function isGameStartRequested() { return startRequested; }

function resetRun() {
  game.metres = 0; game.points = 0; game.potesGagnes = 0; game.etoiles = 0;
  game.ended = false; game.endReason = null; game.reviveOffered = false; game.sansFaute = true;
  game.turbo = 0; game.finAge = -1; game.boue = 0;
  game.startedAt = perfClock();
  player.col = 1; player.u = iso.colU(1); player.prevU = player.u; player.v = 0; player.prevV = 0;
  player.jumpY = 0; player.prevJumpY = 0; player.jumpVy = 0; player.doubled = false; player.flip = 0; player.prevFlip = 0; player.elan = 1;
  sparkles.length = 0; ghosts.length = 0;
  speed = V_UNIT * window.CONFIG.vitesseBase; slowMul = 1; nuitDebut = null;
  friends.reset();
  rows.reseed();
  rows.reset();
  klaxonne = new Set();
  popups.length = 0; banner = null; damageFlash = 0; shake.time = 0; hudAlpha = 0; hintTimer = 6;
  canvas.classList.remove("game-over-bw", "danger", "turbo");
  iso.setNight(0);
}

function restartGame() {
  screens.preparerLigue();
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
  if (screens.getParties() < (window.CONFIG.tutoParties || 0)) tutoDemarrer();
  screens.compterPartie();
}

// --- Mort / fin ------------------------------------------------------------------
function mourir() {
  game.sansFaute = false;
  triggerShake(10, 0.6);
  damageFlash = 1;
  vibrer([120, 60, 200]);
  sfx.potePerdu();
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

// Fin du morceau : « TERMINÉ ! », le joueur continue de rouler 1,5 s en roue
// libre, puis l'écran de fin.
function terminer() {
  game.ended = true;
  game.endReason = "fin";
  game.finAge = 0;
  sfx.fin();
  vibrer([60, 40, 60, 40, 120]);
  screens.hidePauseButton();
  const record = game.metres > screens.getRecord();
  if (record) screens.setRecord(game.metres);
  screens.showEndScreen({ metres: game.metres, potesMax: friends.maxReached(), record, fin: true });
  screens.finLigue(game.metres, friends.maxReached());
}

function endGame(reason) {
  game.ended = true;
  game.endReason = reason;
  canvas.classList.add("game-over-bw");
  canvas.classList.remove("turbo");
  screens.hidePauseButton();
  const record = game.metres > screens.getRecord();
  if (record) screens.setRecord(game.metres);
  screens.showEndScreen({ metres: game.metres, potesMax: friends.maxReached(), record, fin: false });
  screens.finLigue(game.metres, friends.maxReached());
}

function triggerShake(amp, duration) { shake.amp = amp; shake.duration = duration; shake.time = duration; }

function arriveePote(pote, direct) {
  if (!pote) return;
  sfx.pote();
  vibrer(30);
  // Une seule ligne, courte (7 septembre 2026 : « trop d'infos au mètre carré »).
  afficherBanner(`@${(pote.name || "pote").toUpperCase()} EST LÀ !`, null, JAUNE, 1.6);
  audio.playComboJingle(Math.min(6, friends.count()));
}

function gagnerPiece(u, v) {
  const mult = multiplicateur();
  const m = window.CONFIG.pieceMetres * mult;
  game.points += 1;
  game.metres += m;
  game.etoiles += 1;
  player.elan = Math.min(1, player.elan + (window.CONFIG.elanParPiece || 0));
  semerSparkles(u, v);
  sfx.piece();
  tutoEvenement("piece");
  while (game.potesGagnes < window.CONFIG.potesPaliers.length && game.points >= window.CONFIG.potesPaliers[game.potesGagnes]) {
    game.potesGagnes += 1;
    arriveePote(friends.join(player), false);
  }
}
function gagnerLait(u, v) {
  game.turbo = window.CONFIG.laitDureeS || 5;
  sfx.lait();
  vibrer(40);
  semerSparkles(u, v, 16, "#ffffff");
  afficherBanner("TURBO LAIT ! ×2 MÈTRES", null, JAUNE, 1.4);
  canvas.classList.add("turbo");
  // Pas d'obstacles pendant le turbo : la route devient sûre au-delà de
  // l'écran (les rangées déjà visibles sont couvertes par l'invulnérabilité).
  const r0 = Math.floor(player.v + 0.5) + iso.ROWS_AHEAD + 1;
  rows.ouvrirFenetreSure(r0, r0 + Math.ceil(speed * (window.CONFIG.laitVitesse || 1.2) * (window.CONFIG.laitDureeS || 5)) + 12);
}
function gagnerRouge(u, v) {
  sfx.rouge();
  semerSparkles(u, v, 22, "#ff5a3c");
  const pote = friends.join(player);
  if (pote) arriveePote(pote, true);
  else { game.metres += 40 * multiplicateur(); pousserPopup("+40 m", ROUGE); }
}

function toucherJoueur(ev) {
  if (clock.now() < reviveShieldUntil || invincible || game.turbo > 0) return;
  if (friends.count() > 0) {
    const perdus = friends.lose(ev.cout);
    game.sansFaute = false;
    triggerShake(6, 0.45);
    damageFlash = 0.8;
    vibrer(60);
    sfx.potePerdu();
    // Juste « −1 POTE » au-dessus du joueur (« tu enlèves le wording, tu dis
    // juste −1 pote en pop-up par-dessus et voilà »).
    pousserPopup(perdus.length > 1 ? `−${perdus.length} POTES` : "−1 POTE", ROUGE);
  } else {
    mourir();
  }
}

// --- Traversées armées sur le passage du joueur --------------------------------
const ARM_AHEAD_S = 2.6;
function armerTraversees(now, vitesse) {
  const r0 = Math.floor(player.v + 0.5);
  const rMax = r0 + Math.ceil(vitesse * ARM_AHEAD_S) + 1;
  for (let r = Math.max(0, r0); r <= rMax; r++) {
    const row = rows.rowAt(r);
    if (row.type !== "traverse" || row.armed) continue;
    const tArr = now + (r - player.v) / Math.max(0.5, vitesse);
    if (tArr - now > ARM_AHEAD_S) continue;
    rows.armer(row, now, tArr);
    if (row.kind === "tracteur" && !klaxonne.has(r)) { klaxonne.add(r); sfx.klaxon(); }
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

  player.prevU = player.u; player.prevV = player.v; player.prevJumpY = player.jumpY; player.prevPedal = player.pedal; player.prevFlip = player.flip;
  for (let i = sparkles.length - 1; i >= 0; i--) {
    const sp = sparkles[i];
    sp.age += dt; sp.u += sp.vu * dt; sp.v += sp.vv * dt; sp.h += sp.vh * dt; sp.vh -= 9 * dt;
    if (sp.age > 0.6) sparkles.splice(i, 1);
  }
  for (let i = ghosts.length - 1; i >= 0; i--) { ghosts[i].age += dt; if (ghosts[i].age > 0.35) ghosts.splice(i, 1); }

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
    player.pedal += 4.5 * dt;
    return;
  }
  if (game.ended) {
    // Roue libre après « TERMINÉ ! » : on continue d'avancer, sans rien ramasser.
    if (game.finAge >= 0) { game.finAge += dt; player.v += speed * 0.6 * dt; player.pedal += speed * dt * 2; friends.recordPlayer(player.u, player.v, false); friends.update(dt, player, jumpPhysics()); }
    return;
  }
  if (isPaused()) return;

  const now = clock.now();
  const phys = jumpPhysics();
  tutoStep(dt, now);

  // --- Nuit : tombe à partir de nuitDebutS, 30 s de transition ---
  const nd = nuitDebut !== null ? nuitDebut : window.CONFIG.nuitDebutS;
  if (nd !== undefined) iso.setNight(Math.max(0, Math.min(1, (now - nd) / 30)));

  // --- Colonne ---
  const move = consumeLaneMove();
  if (move) { player.col = Math.max(0, Math.min(iso.COLS - 1, player.col + move)); tutoEvenement("lane"); }
  player.u += (iso.colU(player.col) - player.u) * Math.min(1, LANE_TWEEN * dt);

  // --- Saut / salto ---
  let jumped = false;
  const tap = consumeJumpPress();
  if (tap && player.jumpY <= 0) { player.jumpVy = phys.vJump; player.jumpY = 0.001; jumped = true; player.doubled = false; sfx.saut(); tutoEvenement("jump"); }
  else if (tap && player.jumpY > 0 && !player.doubled && player.elan >= 1) {
    player.jumpVy = phys.vJump * 1.0; player.doubled = true; player.elan = 0; player.flip = 0.001;
    sfx.salto(); vibrer(25);
    semerSparkles(player.u, player.v, 12);
    tutoEvenement("salto");
  }
  if (player.jumpY > 0) {
    player.jumpVy -= phys.g * dt;
    player.jumpY += player.jumpVy * dt;
    if (player.jumpY <= 0) { player.jumpY = 0; player.jumpVy = 0; player.doubled = false; player.flip = 0; }
  }
  if (player.flip > 0) {
    player.flip = Math.min(Math.PI * 2, player.flip + dt * (Math.PI * 2 / 0.5));
    const last = ghosts[ghosts.length - 1];
    if (!last || last.t + 0.04 < now) ghosts.push({ u: player.u, v: player.v, h: player.jumpY, flip: player.flip, age: 0, t: now });
  }
  setAirborne(player.jumpY > 0 && !player.doubled && player.elan >= 1);
  if (player.elan < 1) player.elan = Math.min(1, player.elan + dt / window.CONFIG.elanRechargeS);

  // --- Turbo lait ---
  if (game.turbo > 0) { game.turbo -= dt; if (game.turbo <= 0) { game.turbo = 0; canvas.classList.remove("turbo"); } }

  // --- Boue : une voie boueuse freine (au sol seulement) ---
  const rowIci = rows.rowAt(Math.max(0, Math.floor(player.v + 0.5)));
  const dansBoue = rowIci.boue !== null && rowIci.boue !== undefined && rowIci.boue === player.col && player.jumpY <= 0.1;
  slowMul += ((dansBoue ? 0.5 : 1) - slowMul) * Math.min(1, 8 * dt);
  if (dansBoue && game.boue <= 0) { game.boue = 1; }
  if (!dansBoue && game.boue > 0) game.boue = Math.max(0, game.boue - dt);

  // --- Avance ---
  speed += (targetSpeed(now) - speed) * Math.min(1, 3 * dt);
  const vitesse = speed * (game.turbo > 0 ? (window.CONFIG.laitVitesse || 1.2) : 1) * slowMul;
  if (now >= 0) {
    const dv = vitesse * dt;
    player.v += dv;
    game.metres += dv * window.CONFIG.metresParUnite * multiplicateur();
  }
  player.pedal += vitesse * dt * 3.2;
  friends.recordPlayer(player.u, player.v, jumped);
  friends.update(dt, player, phys);

  // --- Traversées : armées pour croiser le joueur ---
  if (now >= 0) armerTraversees(now, vitesse);

  // --- Collisions et pièces ---
  if (now >= 0) {
    for (const ev of rows.checkMember("j", player.u, player.v, player.jumpY > 0.25, now)) {
      if (ev.type === "piece") gagnerPiece(player.u, player.v);
      else if (ev.type === "lait") gagnerLait(player.u, player.v);
      else if (ev.type === "rouge") gagnerRouge(player.u, player.v);
      else { toucherJoueur(ev); if (game.ended || revivePaused) break; }
    }
    for (const m of friends.members()) {
      for (const ev of rows.checkMember(m.id, m.u, m.v, true, now)) {
        if (ev.type === "piece") gagnerPiece(m.u, m.v);
        else if (ev.type === "lait") gagnerLait(m.u, m.v);
        else if (ev.type === "rouge") gagnerRouge(m.u, m.v);
      }
    }
  }

  // --- Fin du morceau = fin de la course ---
  if (now >= 0 && !game.ended && tempsRestant() <= 0) { terminer(); return; }

  if (friends.count() > 0 || friends.maxReached() === 0) canvas.classList.remove("danger");
  else if (!game.ended) canvas.classList.add("danger");
}

// Touches de debug (avec ?debug) : P = +1 pote, O = −1 pote, G = mourir,
// I = invincible, L = turbo lait, N = nuit tout de suite, F = fin du morceau.
let invincible = false;
let nuitDebut = null; // surcharge debug (CONFIG est gelé)
window.addEventListener("keydown", (e) => {
  if (!debugOverlay.isEnabled() || !gameStarted || game.ended) return;
  if (e.code === "KeyI") { invincible = !invincible; afficherBanner(invincible ? "INVINCIBLE" : "VULNÉRABLE", "debug", JAUNE, 1.2); }
  if (e.code === "KeyP") arriveePote(friends.join(player), false);
  if (e.code === "KeyO") { friends.lose(1); pousserPopup("−1 POTE", ROUGE); }
  if (e.code === "KeyG") mourir();
  if (e.code === "KeyL") gagnerLait(player.u, player.v);
  if (e.code === "KeyN") { nuitDebut = clock.now() - 30; }
  if (e.code === "KeyF") terminer();
});

// --- Rendu ---------------------------------------------------------------------
const SIGN_EVERY = 45;
function signAt(r) {
  const villages = window.CONFIG.villages || [];
  if (!villages.length || r % SIGN_EVERY !== 20) return null;
  return villages[Math.floor(r / SIGN_EVERY) % villages.length];
}

function drawPiece(r, c, now, kind) {
  const bob = Math.sin(now * 3 + r) * 0.06;
  const u = iso.colU(c);
  if (kind === "lait") {
    // Brique de lait : cube blanc à bande bleue, flotte comme les pièces.
    iso.drawShadow(ctx, u, r, 0.22, 0.16, 0.2);
    iso.drawBox(ctx, u - 0.2, r - 0.2, 0.4, 0.4, 0.62, "#f6f6f2", 0.45 + bob);
    iso.drawBox(ctx, u - 0.21, r - 0.21, 0.42, 0.42, 0.16, "#2f7fd6", 0.65 + bob);
    iso.drawBox(ctx, u - 0.2, r - 0.2, 0.4, 0.4, 0.08, "#f6f6f2", 1.07 + bob);
    return;
  }
  const p = iso.project(u, r, 0.55 + bob);
  const R = iso.scale() * (kind === "rouge" ? 0.42 : 0.34);
  const spin = (now * Math.PI * 2) / (clock.beatPeriod * 2) + r * 0.9;
  iso.drawShadow(ctx, u, r, 0.22, 0.16, 0.2);
  ctx.save();
  ctx.translate(p.x, p.y);
  drawCoin(ctx, R, spin, kind === "rouge");
  ctx.restore();
}

function render(alpha) {
  const now = clock.now();
  const u = player.prevU + (player.u - player.prevU) * alpha;
  const v = player.prevV + (player.v - player.prevV) * alpha;
  const jy = player.prevJumpY + (player.jumpY - player.prevJumpY) * alpha;
  const pedal = player.prevPedal + (player.pedal - player.prevPedal) * alpha;
  const flip = player.prevFlip + (player.flip - player.prevFlip) * alpha;
  const tAnim = gameStarted ? Math.max(0, now) + 30 : perfClock();
  iso.setDecorTime(tAnim);
  camU += (u * 0.35 - camU) * 0.08;
  iso.setCamera(v, camU);

  const shakeActive = shake.time > 0;
  if (shakeActive) {
    const k = shake.time / shake.duration;
    ctx.save();
    ctx.translate((Math.random() - 0.5) * shake.amp * k, (Math.random() - 0.5) * shake.amp * k);
  }

  iso.renderGround(ctx, (r) => (r >= 0 ? rows.rowAt(r).boue : null));

  const items = [];
  const { from, to } = iso.rowRange();
  for (let r = from; r <= to; r++) {
    const row = r >= 0 ? rows.rowAt(r) : null;
    const clear = row && row.type === "traverse";
    for (const it of iso.rowDecor(ctx, r, clear)) items.push(it);
    const sg = signAt(r);
    if (sg) items.push({ d: iso.depth(-iso.ROAD_HALF - 0.6, r), draw: () => iso.drawSign(ctx, r, sg) });
    if (!row) continue;
    for (const c of row.coins) if (!rows.coinTaken(r, c)) items.push({ d: iso.depth(iso.colU(c), r), draw: () => drawPiece(r, c, now, "piece") });
    if (row.lait !== undefined && !rows.bonusTaken(r, "lait")) items.push({ d: iso.depth(iso.colU(row.lait), r), draw: () => drawPiece(r, row.lait, now, "lait") });
    if (row.rouge !== undefined && !rows.bonusTaken(r, "rouge")) items.push({ d: iso.depth(iso.colU(row.rouge), r), draw: () => drawPiece(r, row.rouge, now, "rouge") });
    if (row.type === "statique") {
      const uc = iso.colU(row.cols[0]);
      const K = rows.KINDS[row.kind];
      items.push({ d: iso.depth(uc - K.long / 2, r - K.larg / 2), draw: () => props.drawStatic(ctx, row.kind, uc, r, tAnim) });
    } else if (row.type === "traverse") {
      const t = gameStarted ? now : perfClock();
      if (row.kind === "poulelancee") {
        const fu = -row.dir * (iso.ROAD_HALF + 0.75);
        items.push({ d: iso.depth(fu, r), draw: () => props.drawLanceur(ctx, fu, r, tAnim, row.dir, row.armed) });
      }
      for (const inst of rows.crossersAt(r, row, t)) {
        items.push({ d: iso.depth(inst.u - inst.K.long / 2, r - inst.K.larg / 2), draw: () => props.drawCrosser(ctx, inst.kind, inst.u, r, inst.dir, t) });
      }
    }
  }
  if (gameStarted) for (const dr of friends.drawables(ctx, pedal)) items.push({ d: iso.depth(dr.u, dr.v), draw: dr.draw });
  for (const g of ghosts) items.push({ d: iso.depth(g.u, g.v) + 0.01, draw: () => drawRider(ctx, g.u, g.v, g.h, PALETTES.pmc, pedal, 0.22 * (1 - g.age / 0.35), g.flip, false) });
  items.push({ d: iso.depth(u, v), draw: () => drawRider(ctx, u, v, jy, PALETTES.pmc, pedal, 1, flip) });
  items.sort((a, b) => b.d - a.d);
  for (const it of items) it.draw();

  for (const sp of sparkles) {
    const g = iso.project(sp.u, sp.v, sp.h);
    ctx.globalAlpha = Math.max(0, 1 - sp.age / 0.6);
    ctx.fillStyle = sp.couleur || (sp.age < 0.2 ? "#fff6c0" : "#ffcf2e");
    const r = 2 + (1 - sp.age / 0.6) * 2;
    ctx.fillRect(g.x - r / 2, g.y - r / 2, r, r);
  }
  ctx.globalAlpha = 1;

  // Nuit : halos des lampadaires, par-dessus la scène.
  const night = iso.getNight();
  if (night > 0.2) {
    const a = Math.min(1, (night - 0.2) / 0.5);
    for (const l of iso.lampsIn(from, to)) {
      const p = iso.project(l.u, l.v, l.h);
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, iso.scale() * 2.6);
      g.addColorStop(0, `rgba(255,236,170,${0.55 * a})`);
      g.addColorStop(1, "rgba(255,236,170,0)");
      ctx.fillStyle = g;
      ctx.fillRect(p.x - iso.scale() * 2.6, p.y - iso.scale() * 2.6, iso.scale() * 5.2, iso.scale() * 5.2);
    }
  }
  iso.renderHaze(ctx);
  hud.renderTurbo(ctx, width, height, tAnim, Math.min(1, game.turbo * 2));

  if (damageFlash > 0) {
    ctx.fillStyle = `rgba(225, 62, 38, ${0.35 * damageFlash})`;
    ctx.fillRect(0, 0, width, height);
  }
  if (popups.length) {
    const g = iso.project(u, v, jy + RIDER_HEIGHT + 0.3);
    const base = g.y;
    ctx.save();
    ctx.textAlign = "center"; ctx.textBaseline = "bottom";
    for (const pop of popups) {
      const t = pop.age / 1.1;
      ctx.globalAlpha = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
      ctx.font = `900 18px "Stage Grotesk", system-ui, sans-serif`;
      ctx.lineWidth = 4; ctx.strokeStyle = "rgba(0,0,0,0.6)"; ctx.lineJoin = "round";
      ctx.strokeText(pop.texte, g.x, base - t * 46 - pop.decalage);
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
    hud.renderHud(ctx, width, height, {
      metres: game.metres, potes: friends.count(), potesMax: friends.max(), gaugeT,
      mult: Math.round(multiplicateur() * 100) / 100, restant: Math.max(0, prochainPalier() - game.points),
      elan: player.elan, restantS: game.ended ? 0 : tempsRestant(), turbo: game.turbo > 0, safeTop,
    });
    hud.renderBanner(ctx, width, height, banner, safeTop);
    ctx.restore();
  }
  if (gameStarted && !game.ended) {
    if (now < COUNT_IN_GO_LINGER_S) hud.renderCountIn(ctx, width, height, now, clock.beatPeriod, COUNT_IN_BEATS, COUNT_IN_GO_LINGER_S);
    hud.renderTuto(ctx, width, height, tutoVue());
    if (now >= 0 && !banner && !tuto.actif) hud.renderHint(ctx, width, height, Math.min(1, hintTimer));
  }
  if (game.finAge >= 0) hud.renderFin(ctx, width, height, game.finAge);

  debugOverlay.renderStats(ctx, {
    fps: perf.fps, frameMs: perf.frameMs, playerX: player.u,
    audioStatus: audio.getStatus(), clockSource: audioDrivesClock ? "audio" : "secours",
    conversion: screens.niveauConversionCourant(), classement: `potes ${friends.count()} · pts ${game.points} · v ${player.v.toFixed(1)} · ${speed.toFixed(1)} r/s · reste ${gameStarted ? tempsRestant().toFixed(0) : "-"} s · nuit ${night.toFixed(2)}`,
  });
}

// --- Préchauffage (pendant la barre de chargement) --------------------------------
// Construit 400 rangées, dessine chaque prop et chaque cycliste une fois hors
// écran : le premier vrai frame de course ne paie ni le hachage ni la
// compilation des chemins de rendu.
function prechauffer() {
  const off = document.createElement("canvas");
  off.width = 64; off.height = 64;
  const c = off.getContext("2d");
  let i = 0;
  const etapes = [
    () => { for (let r = 0; r < 400; r++) rows.rowAt(r); },
    () => { for (const k of Object.keys(rows.KINDS)) if (!rows.KINDS[k].traverse) props.drawStatic(c, k, 0, 5, 0); },
    () => { props.drawCrosser(c, "tracteur", 0, 5, 1, 0); props.drawCrosser(c, "poulelancee", 0, 5, 1, 0); props.drawLanceur(c, 0, 5, 0, 1, false); },
    () => { drawRider(c, 0, 0, 0, PALETTES.pmc, 0, 1, 0); drawRider(c, 0, 0, 0, PALETTES.soberland, 0, 1, 1); for (const P of PALETTES.potes) drawRider(c, 0, 0, 0, P, 0); },
    () => { c.translate(32, 32); drawCoin(c, 10, 0.3); drawCoin(c, 10, 0.3, true); c.setTransform(1, 0, 0, 1, 0, 0); iso.drawSign(c, 20, ["CYSOING", "59"]); },
    () => { for (let r = 0; r < 60; r++) iso.rowDecor(c, r, false).forEach((it) => it.draw()); },
  ];
  const suite = () => {
    try { etapes[i](); } catch (e) { /* le préchauffage ne doit jamais bloquer */ }
    i += 1;
    screens.setPrechauffage(i / etapes.length);
    if (i < etapes.length) setTimeout(suite, 60);
  };
  setTimeout(suite, 200);
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
prechauffer();
if (debugOverlay.isEnabled()) window.__pote = { player, game, rows, friends, clock };
requestAnimationFrame(frame);
