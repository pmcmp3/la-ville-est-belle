// main.js — Bootstrap : canvas plein écran, boucle à pas de temps fixe
// (accumulateur + interpolation au rendu), orchestration route/input/debug.

import { clock } from "./clock.js";
import * as road from "./road.js";
import * as world from "./world.js";
import * as debugOverlay from "./debug.js";
import * as audio from "./audio.js";
import * as player from "./player.js";
import * as entities from "./entities.js";
import * as finish from "./finish.js";
import * as hud from "./hud.js";
import * as net from "./net.js";
import { consumeLaneMove, consumeJumpPress, consumeSlamDown } from "./input.js";

const FIXED_DT = 1 / 120; // simulation à 120 Hz, quel que soit le taux de rafraîchissement écran
const MAX_FRAME_TIME = 0.25; // anti spirale de la mort (onglet mis en arrière-plan, etc.)

// Rattrapage de la voie visée. Le joueur est TOUJOURS sur une voie d'un point
// de vue logique (playerState.lane) ; playerState.x n'est que la position
// affichée, qui court après le centre de cette voie.
// CONFIG.sensibiliteDirection module cette vitesse (seul réglage de pilotage
// qui garde un sens avec des voies) — sa valeur actuelle (2.2) a grimpé au
// fil de plusieurs playtests pour d'autres raisons (avant le passage aux 4
// voies, c'était la sensibilité d'un pilotage continu, pas d'un cran par
// swipe). Avec l'ancienne base LANE_TWEEN = 16, ça donnait un rattrapage à
// ~95 % en ~0,08 s — quasi instantané, un "snap" plutôt qu'un glissé (retour
// explicite : « un petit délai de 0,2 s pour que ça glisse plus »). Rebasée
// à 7 pour retomber sur ~0,2 s à sensibiliteDirection = 2.2 (rate ≈ 16*2.2/7
// ≈ 15 ⇒ 95 % en ln(20)/15 ≈ 0,2 s) : assez vif pour rester un "cran" de
// runner, assez glissé pour que le sprite s'incline et que le déplacement
// se voie vraiment.
const LANE_TWEEN = 7;
// Part du déport du joueur reprise par la caméra (voir road.setCameraX).
// 0 = caméra fixe (le joueur sortait du cadre sur les voies extérieures),
// 1 = caméra collée au joueur (il resterait toujours au centre de l'écran,
// et on perdrait la sensation de changer de voie). 0,55 garde un vrai
// déplacement visible du personnage tout en le maintenant dans le cadre.
const CAMERA_FOLLOW = 0.55;
const LATERAL_SPEED = 5.5;  // référence de vitesse latérale pour l'inclinaison du sprite
const MAX_LEAN = 0.16;      // inclinaison max du sprite dans les virages, en radians
// Flou de mouvement pendant le glissé de changement de voie (demandé
// explicitement, validé une première fois puis "exagéré" sur retour :
// « plus on va vite, plus intense »). Même référence de vitesse que le lean
// (LATERAL_SPEED) : le sprite est déjà à peu près à l'inclinaison max dès le
// début d'un changement de voie (vx dépasse largement LATERAL_SPEED sur un
// glissé de 2 unités), donc le flou suit le même profil — présent tout du
// long du glissé (~0,2 s), qui retombe à zéro une fois la voie atteinte.
// L'intensité MAX n'est plus une constante fixe : elle grandit avec
// road.getSpeedRatio() (0 en début de course, 1 à vitesseMax) — voir
// laneBlurMax() plus bas, appelée à chaque frame dans renderPlayer().
const LANE_BLUR_BASE = 1.6;  // px à vitesse de départ — intensité déjà validée, inchangée
const LANE_BLUR_SPEED_BOOST = 4.5; // px ajoutés progressivement jusqu'à vitesseMax
function laneBlurMax() {
  return LANE_BLUR_BASE + LANE_BLUR_SPEED_BOOST * road.getSpeedRatio();
}
const PEDAL_BOB = 0.05;     // amplitude du rebond de pédalage, en unités-monde
// Calé pour ~0,125 s par frame du cycle de pédalage (4 frames, player.js) à
// la vitesse de départ (BASE_SPEED × vitesseBase = 11 u/s) — 2x plus rapide
// que le calage initial (0,25 s), sur demande. Pédale plus vite à mesure que
// la vitesse monte, comme un vrai vélo.
// Cadence des jambes divisée par 2 (demande playtest : "réduire de 50 % la
// vitesse des pieds"). 1.14 → 0.57 : les pédales font toujours un tour
// complet à mesure que la vitesse monte, juste moitié moins vite.
const PEDAL_RATE = 0.57;

const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d");

let width = 0;
let height = 0;

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

window.addEventListener("resize", resize);
window.addEventListener("orientationchange", resize);
resize();

// La barre d'onglets/adresse de Safari iOS n'est pas comptée dans
// env(safe-area-inset-bottom) (qui ne couvre que le home indicator matériel)
// mais recouvre quand même le bas de l'écran en navigateur — c'est pour ça
// que des boutons "collés" au bord bas peuvent finir masqués/durs à taper
// sur iPhone. window.visualViewport donne la zone réellement visible (hors
// chrome du navigateur) ; on en déduit la hauteur mangée et on la pousse en
// CSS pour que #jump-button/#volume-control restent au-dessus.
function updateBrowserChromeInset() {
  const vv = window.visualViewport;
  if (!vv) return;
  // Plafonné : une mesure aberrante (clavier virtuel ouvert, zoom pincé…)
  // propulserait sinon les boutons en plein milieu de l'écran. Le plancher,
  // lui, est côté CSS (--controls-bottom).
  const hidden = Math.min(140, Math.max(0, window.innerHeight - vv.height - vv.offsetTop));
  document.documentElement.style.setProperty("--browser-chrome-bottom", `${hidden}px`);
}
if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", updateBrowserChromeInset);
  window.visualViewport.addEventListener("scroll", updateBrowserChromeInset);
  updateBrowserChromeInset();
}

// Geste de démarrage minimal (pas de menu avant l'étape 6) : la course et
// l'audio démarrent ensemble, au premier tap/clic/touche — jamais tout seuls
// (obligatoire sur iOS pour débloquer l'AudioContext).
let gameStarted = false;
let startRequested = false;
let startRequestedAt = 0;

// Horloge de secours : la même que celle de clock.js avant bascule sur l'audio.
const perfClock = () => performance.now() / 1000;

// L'horloge audio est la source maîtresse *quand elle avance*. Si elle ne
// démarre pas (contexte iOS resté suspendu, décodage en échec) ou se fige en
// cours de route (appel entrant, onglet en arrière-plan), on repasse sur
// perfClock : un jeu muet reste jouable, un jeu figé non. C'est ce qui s'est
// produit au playtest iPhone — décor qui défile (il avance sur dt) mais bonus
// et obstacles plantés sur place, parce qu'eux se positionnent sur le temps
// musical. Voir l'en-tête d'audio.js.
const AUDIO_START_TIMEOUT = 3; // s d'attente après le tap avant de jouer sans son
const AUDIO_STALL_TIMEOUT = 1; // s d'horloge audio figée avant bascule en secours
let audioDrivesClock = false;
let audioFallback = false; // vrai = on joue sans le morceau, à signaler au joueur
const audioWatch = { lastT: -1, lastReal: 0 };

function useFallbackClock(preserve) {
  clock.setTimeSource(perfClock, preserve);
  audioDrivesClock = false;
  audioFallback = true;
}

// --- Pause (perte de focus OU menu pause manuel) -----------------------------
// Deux sources indépendantes peuvent demander la pause : la perte de focus de
// l'onglet/l'app (retour de playtest iPhone : le morceau continuait de jouer
// en arrière-plan) et le bouton pause dédié (voir plus bas, section "Son
// pendant la partie" pour le câblage du panneau). Elles partagent la même
// mécanique côté audio.js — mais les deux ne veulent PAS la même chose du
// son : onglet quitté = silence complet (personne n'écoute), menu pause = le
// morceau continue derrière un filtre passe-bas à 800 Hz, on n'entend plus
// que les basses (demandé explicitement). Les deux figent en revanche
// l'horloge de jeu de la même façon, donc la course, elle, gèle pareil.
let manualPaused = false;  // menu pause ouvert (bouton dédié)
let hiddenPaused = false;  // document.hidden

function isPaused() {
  return manualPaused || hiddenPaused;
}

// À appeler après avoir changé manualPaused OU hiddenPaused. Le mode audio se
// déduit entièrement des deux drapeaux (l'onglet caché l'emporte sur le menu
// pause : inutile de jouer même étouffé pour un écran que personne ne
// regarde), et audio.setPlaybackMode() ignore un mode identique au courant —
// donc plus besoin de guetter les transitions à la main ici.
function applyPauseState() {
  const next = hiddenPaused ? "silent" : manualPaused ? "muffled" : "running";
  audio.setPlaybackMode(next);
  if (next === "running") {
    // Piège documenté de longue date : sans repousser `audioWatch.lastReal`/
    // `lastT`, le chien de garde (AUDIO_STALL_TIMEOUT = 1 s) verrait une
    // horloge figée depuis tout le temps passé en pause et basculerait à tort
    // sur l'horloge de secours juste au moment de reprendre.
    audioWatch.lastT = audio.now();
    audioWatch.lastReal = perfClock();
  }
}

document.addEventListener("visibilitychange", () => {
  hiddenPaused = document.hidden;
  applyPauseState();
});

// --- Écrans hors-jeu (menu de démarrage / fin de partie) -----------------
// Le même conteneur DOM sert aux deux, avec fondu à l'ouverture comme à la
// fermeture. Il a remplacé le « touche l'écran pour jouer » dessiné dans le
// canvas : au playtest, personne ne savait où démarrer une fois l'inclinaison
// activée, parce que la zone de départ était l'écran entier et donc invisible.
// Une action = un bouton.
const overlay = document.getElementById("overlay");
// Le résultat de la partie s'affiche désormais dans l'eyebrow du bandeau de
// la carte de fin (même emplacement que "Étape 1/2 — Ton pseudo" sur le
// menu), et plus dans #menu-title, qui garde le titre du jeu sur tous les
// écrans — cohérence avec le design system du premier écran (demandé).
const endEyebrow = document.getElementById("end-eyebrow");
const scoreNum = document.getElementById("score-num");
const leaderboard = document.getElementById("leaderboard");
const leaderboardList = document.getElementById("leaderboard-list");
const playButton = document.getElementById("play-button");
const replayButton = document.getElementById("replay-button");
const loadingBlock = document.getElementById("loading");
const loadingFill = document.getElementById("loading-fill");
const loadingLabel = document.getElementById("loading-label");
const ctaLink = document.getElementById("cta-link");
ctaLink.href = window.CONFIG.lienEP;

function showOverlay() {
  overlay.classList.add("visible");
}

function hideOverlay() {
  overlay.classList.remove("visible");
}

// --- Accueil en 2 vues : onboarding (pseudo → jouer) → décompte → écran ---
// de fin. Une seule "vue" active à la fois dans #overlay, et à l'intérieur
// de l'onboarding une seule "étape" à la fois. L'étape "inclinaison" a été
// retirée avec le gyroscope (voir input.js) — le tutoriel du contrôle
// tactile se fait maintenant pendant le décompte (voir runCountdown()).
const onboardingEl = document.getElementById("onboarding");
const countdownEl = document.getElementById("countdown");
const endScreenEl = document.getElementById("end-screen");
const countdownNum = document.getElementById("countdown-num");
const countdownCaption = document.getElementById("countdown-caption");

const stepEls = {
  pseudo: document.querySelector('.menu-step[data-step="pseudo"]'),
  play: document.querySelector('.menu-step[data-step="play"]'),
};
const stepOrder = ["pseudo", "play"];
const stepDotEls = document.querySelectorAll(".step-dot");
let stepIndex = 0;
let currentView = "onboarding";

// Le CTA morceau ne s'affiche que là où il ne dispute la place à aucune
// autre décision : la dernière étape de l'onboarding (à côté de JOUER, comme
// avant) et l'écran de fin. Caché pendant les étapes 1/2 et pendant le
// décompte.
function refreshCtaVisibility() {
  const onPlayStep = currentView === "onboarding" && stepOrder[stepIndex] === "play";
  ctaLink.style.display = currentView === "end" || onPlayStep ? "" : "none";
}

function showStep(i) {
  stepIndex = i;
  stepOrder.forEach((name, idx) => {
    stepEls[name].classList.toggle("active", idx === i);
  });
  stepDotEls.forEach((dot, idx) => dot.classList.toggle("active", idx === i));
  // Titre du jeu masqué sur l'étape "JOUER" (retour explicite : « à partir du
  // moment où on passe à l'étape 2, tu peux enlever le titre ») — même
  // traitement que pendant le décompte (#overlay.countdown-view), qui cache
  // déjà #menu-title pour la même raison (écran encombré).
  overlay.classList.toggle("play-step-view", stepOrder[i] === "play");
  refreshCtaVisibility();
}

function nextStep() {
  if (stepIndex < stepOrder.length - 1) showStep(stepIndex + 1);
  // Musique en fond de menu à partir de l'étape 2 (playtest : « le morceau
  // se lance dès qu'on quitte le premier écran, pour qu'il tourne pendant
  // qu'ils choisissent leur pseudo/volume »). Le tap "Suivant" est un vrai
  // geste utilisateur — la seule fenêtre où iOS accepte d'ouvrir la sortie
  // audio. On unlock ET on demande la lecture ici ; audio.play() attend
  // internement que le buffer soit décodé, la musique commence donc dès que
  // le chargement se termine, sans nouvelle interaction requise.
  audio.unlock();
  audio.play();
}

document.querySelectorAll(".menu-step [data-next]").forEach((btn) => {
  btn.addEventListener("click", nextStep);
});

function setView(view) {
  currentView = view;
  onboardingEl.classList.toggle("active", view === "onboarding");
  countdownEl.classList.toggle("active", view === "countdown");
  endScreenEl.classList.toggle("active", view === "end");
  // Voile allégé pendant le décompte : le personnage doit rester visible
  // derrière (demandé explicitement), pas noyé sous le fond sombre standard.
  overlay.classList.toggle("countdown-view", view === "countdown");
  refreshCtaVisibility();
}

showStep(0);

// --- Décompte avant course -----------------------------------------------
// "Réalise le meilleur score, et gagne le vinyl de l'EP" pendant 20 → 1,
// entre le tap JOUER et le vrai début (demandé explicitement, allongé de
// 15s à 20s après un premier test réel avec un joueur externe — le temps de
// bien lire chaque message). Le geste iOS (déblocage audio) a déjà eu lieu
// au tap — voir startGame() plus bas — donc ce décompte n'a besoin d'aucun
// geste supplémentaire à la fin. Sert aussi de tutoriel : la bande de
// pilotage et le bouton saut sont déjà affichés et utilisables pendant le
// compte à rebours (voir CSS #steer-control, le personnage y répond en
// direct — demandé explicitement, "garder le bonhomme visible tant que le
// décompte n'est pas fini").
const COUNTDOWN_START = 20;
let countdownTimer = null;

// Légende du décompte : une phrase à la fois, en fondu, plutôt que les 3
// empilées d'un coup (retour de test : illisible, ça débordait sur le
// personnage). ~7s hype, ~7s tuto du contrôle tactile, ~6s rappel son.
// Icônes/flèches ajoutées explicitement après le premier vrai test (« les
// instructions un peu plus grosses, avec des icônes, des flèches ») —
// notamment sur le message de tuto, où les flèches remplacent une partie du
// texte (plus rapide à lire d'un coup d'œil qu'une phrase).
const COUNTDOWN_MESSAGES = [
  "Réalise le meilleur score, gagne le vinyl de l'EP",
  "Swipe gauche ou droite pour changer de voie, swipe vers le haut pour sauter",
  "Attrape les étoiles et évite les obstacles",
];
const CAPTION_FADE_MS = 300;
let captionTimeout = null;
let captionIndex = -1;

function setCaption(text) {
  countdownCaption.classList.add("hidden");
  clearTimeout(captionTimeout);
  captionTimeout = setTimeout(() => {
    countdownCaption.textContent = text;
    countdownCaption.classList.remove("hidden");
  }, CAPTION_FADE_MS);
}

function updateCaption(n) {
  const elapsed = COUNTDOWN_START - n; // 0..19
  const idx = elapsed < 7 ? 0 : elapsed < 14 ? 1 : 2;
  if (idx === captionIndex) return;
  captionIndex = idx;
  setCaption(COUNTDOWN_MESSAGES[idx]);
}

function runCountdown() {
  setView("countdown");
  let n = COUNTDOWN_START;
  countdownNum.textContent = String(n);
  captionIndex = -1;
  updateCaption(n);
  countdownTimer = setInterval(() => {
    n -= 1;
    if (n <= 0) {
      clearInterval(countdownTimer);
      countdownTimer = null;
      clearTimeout(captionTimeout);
      beginRun();
      return;
    }
    countdownNum.textContent = String(n);
    updateCaption(n);
  }, 1000);
}

function beginRun() {
  hideOverlay();
  showPauseButton();
  // audio.play() N'est PLUS appelé ici — le morceau tourne depuis nextStep()
  // (étape pseudo → étape volume), on ne veut surtout pas le relancer et
  // perdre la position courante (le score dépend de la position musicale).
  startRequested = true;
  startRequestedAt = perfClock();
}

function startGame() {
  if (startRequested || countdownTimer !== null) return;
  // audio.unlock() a déjà eu lieu au nextStep() de l'étape pseudo. Idempotent
  // de toute façon (armed = true dès le 1er appel), donc on ne re-tente pas
  // pour éviter la moindre confusion.
  runCountdown();
}

playButton.addEventListener("click", startGame);
replayButton.addEventListener("click", restartGame);

// Entrée/espace au clavier : confort de test sur desktop uniquement.
window.addEventListener("keydown", (e) => {
  if (e.code !== "Enter" && e.code !== "Space") return;
  if (!overlay.classList.contains("visible")) return;
  if (currentView === "end") { restartGame(); return; }
  if (currentView === "onboarding" && stepOrder[stepIndex] === "play" && !playButton.disabled) {
    startGame();
  }
});

// Progression du chargement, poussée dans la barre à chaque frame tant que le
// morceau n'est pas prêt. Le bouton JOUER reste désactivé jusqu'à 100 % : on
// ne peut de toute façon rien lancer avant, autant que ça se voie.
let loadingDone = false;

function syncLoadingUi() {
  if (loadingDone) return;
  const p = audio.getProgress();
  loadingFill.style.width = `${Math.round(p * 100)}%`;
  loadingLabel.textContent = `${Math.round(p * 100)} %`;
  if (p >= 1) {
    loadingDone = true;
    loadingBlock.classList.add("done");
    playButton.disabled = false;
  }
}

// --- Son pendant la partie ----------------------------------------------
// Le curseur vertical collé au bord droit n'était « pas très intuitif »
// (playtest) : il est remonté dans le menu, à l'horizontale. Ne reste en jeu
// qu'une bascule son, hors de l'axe de lecture de la route.
// Le curseur a quitté le menu d'avant-partie (demandé : « on supprime dans le
// menu avant de commencer la partie ») pour devenir un petit MENU DÉPLIANT en
// haut à gauche : on règle le son quand on l'entend, pas avant. Un tap sur le
// bouton ouvre/ferme le panneau ; un tap ailleurs le referme.
const soundControl = document.getElementById("sound-control");
const soundPanel = document.getElementById("sound-panel");
const volumeSlider = document.getElementById("volume-slider");
const muteButton = document.getElementById("mute-button");

audio.setVolume(Number(volumeSlider.value) / 100);

function syncMuteIcon() {
  const coupe = audio.getVolume() <= 0;
  muteButton.classList.toggle("muted", coupe);
  muteButton.textContent = coupe ? "✕" : "♪";
}

function setSoundPanelOpen(open) {
  soundPanel.hidden = !open;
  muteButton.setAttribute("aria-expanded", String(open));
}

volumeSlider.addEventListener("input", () => {
  audio.setVolume(Number(volumeSlider.value) / 100);
  syncMuteIcon();
});
// Le curseur est superposé au canvas, qui écoute les swipes : sans ces
// gardes, le régler ferait aussi changer de voie.
["pointerdown", "pointerup", "touchstart", "touchmove", "touchend", "mousedown"].forEach((type) => {
  soundPanel.addEventListener(type, (e) => e.stopPropagation());
});
// Tap hors du panneau = fermeture (un panneau ouvert en pleine course
// masquerait une partie de la route).
window.addEventListener("pointerdown", (e) => {
  if (!soundPanel.hidden && !soundControl.contains(e.target)) setSoundPanelOpen(false);
});

// --- Menu pause -----------------------------------------------------------
// Demandé explicitement : « mets un menu pause avec le volume ». Bouton
// dédié (visible uniquement en cours de course — showPauseButton()/
// hidePauseButton() sont appelées depuis beginRun()/restartGame()/endGame()/
// beginFinish() plus bas) plutôt qu'un tap sur l'écran : même règle que
// partout ailleurs dans le jeu, une action = un bouton visible. La
// coordination avec la pause "perte de focus" (manualPaused/hiddenPaused/
// applyPauseState) vit plus haut, juste après la déclaration d'audioWatch.
//
// Retour : « le bouton Pause, il faut le mettre à la place du bouton Volume ».
// Les deux boutons occupent maintenant le MÊME coin (haut gauche, voir CSS) et
// ne sont jamais affichés en même temps : Pause remplace la bascule son
// pendant la course (le menu pause contient déjà le volume, plus besoin d'un
// second contrôle) ; la bascule son revient sur les écrans hors-jeu (menu,
// décompte, fin), exactement comme avant.
const pauseButton = document.getElementById("pause-button");
const pauseScreen = document.getElementById("pause-screen");
const pauseVolumeSlider = document.getElementById("pause-volume-slider");
const resumeButton = document.getElementById("resume-button");
const pauseReplayButton = document.getElementById("pause-replay-button");

function showPauseButton() {
  pauseButton.hidden = false;
  soundControl.hidden = true;
  setSoundPanelOpen(false); // referme le panneau volume s'il traînait ouvert
}
function hidePauseButton() {
  pauseButton.hidden = true;
  soundControl.hidden = false;
  // Le bouton disparaît (fin de partie, séquence d'arrivée...) : referme le
  // panneau s'il était resté ouvert, sinon la pause resterait active pour
  // toujours (plus aucun bouton "Reprendre" à l'écran pour en sortir).
  if (manualPaused) closePauseMenu();
}

function openPauseMenu() {
  if (manualPaused || pauseButton.hidden) return;
  manualPaused = true;
  pauseVolumeSlider.value = volumeSlider.value; // reflète le volume courant à l'ouverture
  setSoundPanelOpen(false); // évite les deux panneaux ouverts en même temps
  pauseScreen.classList.add("visible");
  applyPauseState();
}

function closePauseMenu() {
  if (!manualPaused) return;
  manualPaused = false;
  pauseScreen.classList.remove("visible");
  applyPauseState();
}

pauseButton.addEventListener("click", (e) => {
  e.stopPropagation();
  openPauseMenu();
});
resumeButton.addEventListener("click", (e) => {
  e.stopPropagation();
  closePauseMenu();
});
pauseReplayButton.addEventListener("click", (e) => {
  e.stopPropagation();
  closePauseMenu();
  restartGame();
});
pauseVolumeSlider.addEventListener("input", () => {
  audio.setVolume(Number(pauseVolumeSlider.value) / 100);
  volumeSlider.value = pauseVolumeSlider.value; // les deux curseurs (menu déroulant + pause) restent synchronisés
  syncMuteIcon();
});
// Même garde que le reste des contrôles superposés au canvas (voir plus
// haut) : sans stopPropagation, un tap sur le panneau atteindrait `window`
// et se ferait lire comme un swipe par input.js.
["pointerdown", "pointerup", "touchstart", "touchmove", "touchend", "mousedown"].forEach((type) => {
  pauseScreen.addEventListener(type, (e) => e.stopPropagation());
});
["pointerdown", "pointerup", "touchstart", "touchend"].forEach((type) => {
  pauseButton.addEventListener(type, (e) => e.stopPropagation());
});

// --- Pseudo Instagram (étape 7) -----------------------------------------
// Identifiant du classement (jamais un email, décision verrouillée). Purement
// facultatif : la partie reste jouable sans, seul l'envoi du score au
// backend est sauté (voir endGame() plus bas). Persisté en localStorage pour
// ne pas le retaper à chaque partie.
// Deux champs séparés depuis le playtest : « il faut demander pseudo ET
// insta, et on affiche à la fin le pseudo seulement, parce que l'Instagram
// c'est que pour moi — sinon tout le monde va voir l'insta du gagnant ».
//   - pseudo : OBLIGATOIRE, c'est la seule chose publiée au classement.
//   - insta  : optionnel, sert uniquement à l'artiste pour contacter le
//              gagnant. Il n'est jamais affiché, et n'est même pas LISIBLE
//              par le jeu : le classement passe par une vue publique qui ne
//              l'expose pas (voir supabase-schema.sql / net.js).
const pseudoInput = document.getElementById("pseudo-input");
const instaInput = document.getElementById("insta-input");
const pseudoNext = document.getElementById("pseudo-next");

pseudoInput.value = localStorage.getItem("pseudoJoueur") || "";
instaInput.value = localStorage.getItem("pseudoInsta") || "";

function cleanPseudo() { return pseudoInput.value.trim(); }
function cleanInsta() { return instaInput.value.trim().replace(/^@+/, ""); }

function syncPseudoStep() {
  // Les DEUX champs sont désormais obligatoires (retour de terrain : un
  // joueur a rempli son pseudo mais pas son Insta — PMC n'a alors aucun
  // moyen de le retrouver pour le contacter s'il gagne, un pseudo affiché
  // seul au classement ne suffit pas). On bloque l'étape plutôt que de
  // laisser jouer puis de découvrir un score orphelin au moment de remettre
  // le lot.
  pseudoNext.disabled = cleanPseudo().length === 0 || cleanInsta().length === 0;
}
syncPseudoStep();

pseudoInput.addEventListener("input", () => {
  localStorage.setItem("pseudoJoueur", cleanPseudo());
  syncPseudoStep();
});
instaInput.addEventListener("input", () => {
  localStorage.setItem("pseudoInsta", cleanInsta());
  syncPseudoStep();
});
// Empêche la frappe/le focus de fuiter vers les gestes de jeu (swipes),
// même traitement que les autres contrôles superposés au canvas.
[pseudoInput, instaInput].forEach((el) => {
  ["pointerdown", "touchstart", "touchmove", "mousedown"].forEach((type) => {
    el.addEventListener(type, (e) => e.stopPropagation());
  });
});

muteButton.addEventListener("click", (e) => {
  e.stopPropagation();
  setSoundPanelOpen(soundPanel.hidden);
});
// Le glissement tactile de secours écoute window : sans ces gardes, toucher
// la bascule son dirigerait aussi le personnage.
["pointerdown", "pointerup", "touchstart", "touchend"].forEach((type) => {
  muteButton.addEventListener(type, (e) => e.stopPropagation());
});

// Le glissement tactile sur la bande de pilotage (#steer-control) et sur le
// bouton saut gère lui-même sa propagation dans input.js — rien à faire ici.

const START_LANE = 1; // voie de départ (0..LANE_COUNT-1)

const playerState = {
  lane: START_LANE,
  x: road.laneX(START_LANE),
  prevX: road.laneX(START_LANE),
  vx: 0,     // vélocité latérale observée (sert uniquement à l'inclinaison du sprite)
  lean: 0,
  prevLean: 0,
  pedalPhase: 0,
  prevPedalPhase: 0,
};

// --- Saut ---------------------------------------------------------------
// Refonte physique demandée au playtest ("on reste un peu trop de temps en
// l'air, c'est bizarre avec la gravité") : au lieu d'une courbe sinusoïdale
// normalisée (qui plafonnait longuement au sommet, sensation "planante"), on
// intègre vraiment un vecteur vitesse verticale sous une gravité constante.
// La courbe devient une parabole classique — accélération descendante
// perceptible, "pesanteur" nette.
//
// État à 3 modes :
//   - 'ground' : au sol, prêt à sauter
//   - 'air'    : en l'air (saut normal OU chute après avoir quitté un toit)
//   - 'onCar'  : posé sur le toit d'un convoi (voir entities.js) — reste à
//                hauteur toit tant qu'aligné avec la file, peut re-sauter.
// Toutes les hauteurs sont en unités-monde ; renderPlayer convertit en pixels.
// Hauteur du toit d'une voiture : source unique = entities.CAR_ROOF_H (le
// rendu faux-3D de la voiture et la mécanique d'atterrissage doivent utiliser
// exactement la même valeur, sinon le joueur se poserait sur du vide ou dans
// la voiture).
const CAR_ROOF_Y = entities.CAR_ROOF_H;
const jump = {
  mode: 'ground',
  prevY: 0,
  y: 0,
  vy: 0,
};

// Vitesse initiale et gravité dérivées de CONFIG (hauteurSaut + dureeSaut),
// pour que ces deux paramètres restent la source de vérité. Physique :
//   apex = v²/(2g), T = 2v/g  ⇒  v = 4·apex/T,  g = 8·apex/T².
// hauteurSaut est un multiplicateur d'échelle historique — l'apex "utile"
// combine hauteurSaut, HEIGHT_WORLD (1.9) et le facteur cosmétique 0.6 déjà
// présent dans l'ancien renderPlayer, pour que le saut visible ait la même
// amplitude qu'avant (pas de changement d'échelle en plus du changement de
// courbe).
function jumpPhysics() {
  const T = window.CONFIG.dureeSaut;
  const apex = window.CONFIG.hauteurSaut * player.HEIGHT_WORLD * 0.6;
  return { vJump: 4 * apex / T, g: 8 * apex / (T * T) };
}

// Halo de ramassage. `pickupFlash` descend de 1 à 0 sur PICKUP_FLASH_DURATION,
// et player.js en tire une enveloppe montée/descente. 0,35 s → 0,9 s : le halo
// « disparaissait trop vite » au playtest, il n'avait pas le temps de se lire.
// Purement cosmétique, ne touche à aucune mécanique.
const PICKUP_FLASH_DURATION = 0.9;
let pickupFlash = 0;

// Fondu d'entrée du HUD : il apparaît avec la partie au lieu de surgir d'un
// coup à la fermeture du menu. Même intention que les fondus CSS de l'overlay.
const HUD_FADE_DURATION = 0.6;
let hudAlpha = 0;

// État de partie (étape 5) : vies, score. `ended` gèle route/entités et
// affiche l'écran de fin. La jauge d'énergie (ralentissement à 0) a été
// retirée (demandé explicitement : « elle ne fait pas trop sens ») — la
// vitesse ne dépend plus que de la progression du morceau (road.js).
const game = {
  lives: window.CONFIG.viesDepart,
  score: 0,
  ended: false,
  endReason: null, // "gameover" | "finished"
};

// --- Séquence de fin (ligne d'arrivée franchie) --------------------------
// Playtest : "arrête la caméra de manière smooth mais laisse le personnage
// partir loin devant et disparaître à l'horizon". État intermédiaire entre
// la partie jouée et l'affichage de l'écran de fin : la route décélère
// (road.brake, ~3 s), le joueur continue d'avancer (sa profondeur monde
// grimpe de PLAYER_NEAR_Z jusque près de HORIZON_Z), son sprite se fond
// dans le lointain sur la dernière seconde, puis on bascule sur endGame().
// Aucune collision testée pendant cette phase (entities.update n'est plus
// appelé). Le mot "finishing" en anglais est utilisé pour ne pas confondre
// avec "finished" (l'état terminé après l'écran de fin).
const FINISH_DURATION = 3.5;
const FINISH_FADE = 1.0;

// --- Clignotement "dégât" ------------------------------------------------
// Playtest : "quand on prend un truc rouge, le perso doit clignoter 3 fois
// toutes les 0,3 s pour comprendre qu'on a pris un dommage". Durée totale
// = 3 × 0,3 = 0,9 s ; le sprite alterne visible/atténué à ~10 Hz sur cette
// fenêtre (6 alternances = 3 flashs). Feedback purement visuel, aucune
// mécanique associée (l'invincibilité temporaire post-hit n'a pas été
// demandée — un hit consécutif sur le même obstacle est impossible de
// toute façon, il est marqué résolu dès la première collision).
const DAMAGE_FLASH_DURATION = 0.9;
let damageFlash = 0;
const finishing = {
  active: false,
  elapsed: 0,
  playerZ: 0,
  playerSpeed: 0,
  alpha: 1,
};

function beginFinish() {
  finishing.active = true;
  finishing.elapsed = 0;
  finishing.playerZ = road.PLAYER_NEAR_Z;
  finishing.playerSpeed = road.getSpeed(); // vitesse relative héritée du moment du franchissement
  finishing.alpha = 1;
  hidePauseButton(); // la caméra freine jusqu'à l'écran de fin, plus rien à mettre en pause ici
}
function resetFinish() {
  finishing.active = false;
  finishing.elapsed = 0;
  finishing.alpha = 1;
}

// Classement (étape 7) : demandé explicitement au playtest ("j'espère qu'il
// y a un tableau avec les classements à la fin"). Masqué tant qu'il n'y a
// rien à montrer — backend pas encore configuré (CONFIG.apiScores vide,
// voir net.js) ou requête vide/en échec : jamais bloquant, jamais d'erreur
// visible, le pire cas est un bloc absent comme avant.
function renderLeaderboard(scores) {
  leaderboardList.innerHTML = "";
  if (!scores.length) {
    leaderboard.classList.add("hidden");
    return;
  }
  const pseudoJoueur = cleanPseudo();
  let current = null;   // la ligne du joueur, à centrer une fois la liste montée
  for (const [i, s] of scores.entries()) {
    const li = document.createElement("li");
    const rank = document.createElement("span");
    rank.className = "rank";
    rank.textContent = `${i + 1}`;
    const pseudo = document.createElement("span");
    pseudo.className = "pseudo";
    // Le classement ne connaît QUE le pseudo public : la vue Supabase
    // n'expose pas la colonne insta (voir net.js). Repli sur pseudo_insta
    // pour les lignes écrites avant la séparation des deux champs.
    const displayPseudo = (s.pseudo || s.pseudo_insta || "?").replace(/^@+/, "");
    pseudo.textContent = displayPseudo;
    const points = document.createElement("span");
    points.className = "points";
    points.textContent = `${s.score}`;
    li.append(rank, pseudo, points);
    // Surligner le score du joueur courant dans le classement. Le test est
    // prudent : même pseudo + même score, pour éviter de surligner des
    // homonymes avec un score différent.
    if (pseudoJoueur && displayPseudo === pseudoJoueur && s.score === game.score) {
      li.classList.add("current-score");
      current = li;
    }
    leaderboardList.appendChild(li);
  }
  leaderboard.classList.remove("hidden");
  scrollCurrentScoreIntoView(current);
}

// « Je suis 8e, je veux que ma ligne arrive au milieu de mon écran et qu'elle
// soit surlignée. » Le classement affiche jusqu'à 50 entrées dans une liste
// qui défile (CONFIG.apiScoresLimit) : sans ça, un joueur classé au-delà des
// 5 premières lignes ne voit jamais son propre score.
// `scrollIntoView({block:"center"})` est volontairement évité : sur Safari
// iOS il fait aussi remonter l'ANCÊTRE scrollable (donc la page entière, qui
// est en overflow:hidden ici) et provoque des sauts de mise en page. On
// positionne donc le scroll de la liste à la main.
function scrollCurrentScoreIntoView(li) {
  leaderboardList.style.paddingBottom = "";
  if (!li) return;
  // Après le repaint : tant que #leaderboard porte .hidden (display:none),
  // offsetTop/clientHeight valent 0 et le calcul serait faux.
  requestAnimationFrame(() => {
    // Position de la ligne DANS le contenu défilant. `li.offsetTop` ne
    // convient pas : il se mesure depuis le premier ancêtre positionné, qui
    // n'est pas la liste (bug constaté — la ligne finissait hors champ).
    const rectListe = leaderboardList.getBoundingClientRect();
    const haut = li.getBoundingClientRect().top - rectListe.top + leaderboardList.scrollTop;
    const centre = haut - (leaderboardList.clientHeight - li.offsetHeight) / 2;
    // Une liste ne défile pas au-delà de son contenu : sans ça, une ligne
    // parmi les dernières du classement se colle en bas de la fenêtre au lieu
    // d'être au milieu. On ajoute juste ce qu'il manque de vide sous la
    // dernière ligne pour que le centrage soit atteignable — et seulement
    // quand c'est nécessaire, donc aucun blanc visible dans les autres cas.
    const maxScroll = leaderboardList.scrollHeight - leaderboardList.clientHeight;
    if (centre > maxScroll) {
      leaderboardList.style.paddingBottom = `${Math.ceil(centre - maxScroll)}px`;
    }
    leaderboardList.scrollTop = Math.max(0, centre);
  });
}

// Fin de partie : le menu revient en fondu, réutilisé tel quel — le titre
// devient le résultat, le bouton principal devient « Rejouer ». Un léger
// retard laisse la scène se figer à l'écran avant que l'overlay ne monte,
// sinon la transition écrase l'instant où on comprend ce qui vient d'arriver.
function endGame(reason) {
  game.ended = true;
  game.endReason = reason;
  hidePauseButton();

  // hud.contestStatus() ne pilote plus rien à l'écran (le statut technique
  // "Score valable pour le concours" était confus pour un joueur qui découvre
  // le jeu, retiré au playtest) — sert seulement à décider si le score part
  // vraiment vers Supabase, juste plus bas.
  const contest = hud.contestStatus();
  const finished = reason === "finished";

  endEyebrow.textContent = finished ? "Parcours terminé" : "Game Over";
  scoreNum.textContent = `${game.score}`;

  // CTA en vrai bouton sur un parcours terminé — c'est le joueur qui vient
  // d'entendre le morceau en entier, la meilleure fenêtre pour l'inviter à
  // l'écouter pour de vrai. Sur Game Over, on reste sur un simple lien :
  // l'enjeu y est de relancer vite, pas de retenir l'attention.
  ctaLink.classList.toggle("cta-minimal", !finished);
  // La bascule son n'est plus masquée ici : elle reste affichée sur TOUS les
  // écrans (demandé explicitement). Le morceau continue de tourner sur
  // l'écran de fin — c'est justement là qu'on peut vouloir le couper.
  leaderboard.classList.add("hidden"); // masqué le temps de la requête, évite d'afficher le classement de la partie précédente
  setTimeout(() => { setView("end"); showOverlay(); }, 600);

  // Envoi du score (étape 7) : seulement si le concours est ouvert et qu'un
  // pseudo a été renseigné — jamais bloquant, aucune UI d'attente (pas
  // d'anti-triche à confirmer, PLAN-ACTION.md §6). Se désactive tout seul si
  // CONFIG.apiScores/apiScoresKey ne sont pas encore renseignés (net.js).
  // Le classement est relu juste après l'envoi (même s'il n'a pas eu lieu)
  // pour avoir une chance d'y voir apparaître le score qu'on vient d'envoyer.
  // "@" éventuel retiré à l'envoi : la table Supabase stocke le pseudo brut,
  // sans préfixe (demandé explicitement). Défensif : accepte que le joueur
  // en tape un par habitude, on ne veut pas le forcer à connaître la règle.
  const pseudoJoueur = cleanPseudo();
  (async () => {
    if (contest.open && pseudoJoueur) {
      await net.postScore(pseudoJoueur, cleanInsta(), game.score);
    }
    renderLeaderboard(await net.getTopScores());
  })();
}

function restartGame() {
  audio.restart();
  // Même règle qu'au démarrage : on ne se cale sur l'audio que s'il tourne
  // vraiment, sinon la partie repartirait sur une horloge figée.
  if (audio.isRunning()) {
    clock.setTimeSource(audio.now);
    audioDrivesClock = true;
    audioFallback = false;
    audioWatch.lastT = -1;
    audioWatch.lastReal = perfClock();
  } else {
    useFallbackClock(false);
  }
  clock.jumpBy(-entities.LEAD_IN); // voir entities.LEAD_IN — même correctif qu'au premier départ

  playerState.lane = START_LANE;
  playerState.x = road.laneX(START_LANE);
  playerState.prevX = playerState.x;
  playerState.vx = 0;
  playerState.lean = 0;
  playerState.prevLean = 0;
  playerState.pedalPhase = 0;
  playerState.prevPedalPhase = 0;
  jump.mode = 'ground';
  jump.y = 0;
  jump.prevY = 0;
  jump.vy = 0;

  game.lives = window.CONFIG.viesDepart;
  game.score = 0;
  game.ended = false;
  game.endReason = null;

  entities.reset();
  road.reset();
  resetFinish();
  damageFlash = 0;
  pickupFlash = 0;
  hudAlpha = 0; // le HUD remonte en fondu, comme au premier départ

  hideOverlay();
  showPauseButton(); // rejoue depuis l'écran de fin OU depuis le menu pause : dans les deux cas on repart en course active
}

// Raccourcis debug (actifs uniquement si le mode debug est allumé — touche
// CONFIG.toucheDebug) : accélérer les tests d'écrans de fin/d'événements
// sans attendre un morceau entier. N'affectent que l'horloge de jeu, pas la
// lecture audio elle-même (qui continue depuis sa position réelle) —
// décalage assumé, c'est un outil de dev, pas un mode de jeu.
window.addEventListener("keydown", (e) => {
  if (!debugOverlay.isEnabled() || !gameStarted || game.ended) return;
  if (e.key === "ArrowUp") {
    clock.jumpBy(10); // avance l'horloge de jeu de 10s
  } else if (e.key === "f" || e.key === "F") {
    clock.jumpBy(window.CONFIG.dureeMorceau); // force la fin du morceau
  } else if (e.key === "g" || e.key === "G") {
    game.lives = 0; // force un game over au prochain tick
  } else if (e.key === "b" || e.key === "B") {
    entities.forceSpawn(true, "guitare", playerState.lane); // force un bonus (guitare aérienne) pile devant le joueur
  } else if (e.key === "o" || e.key === "O") {
    entities.forceSpawn(false, "cone", playerState.lane); // force un obstacle pile devant le joueur
  }
});

const perf = {
  fps: 0,
  frameMs: 0,
  accumTime: 0,
  frameCount: 0,
};

function step(dt) {
  // Bascule l'horloge de jeu sur l'audio dès que la lecture tourne vraiment
  // (peut arriver un peu après le geste si le décodage n'était pas fini) —
  // isRunning(), pas hasStarted() : un contexte suspendu "a démarré" mais son
  // currentTime n'avance pas, et l'horloge resterait collée à 0.
  if (!gameStarted && startRequested) {
    if (audio.isRunning()) {
      clock.setTimeSource(audio.now);
      audioDrivesClock = true;
      audioWatch.lastT = -1;
      audioWatch.lastReal = perfClock();
      gameStarted = true;
    } else if (perfClock() - startRequestedAt > AUDIO_START_TIMEOUT) {
      useFallbackClock(false);
      gameStarted = true;
    }
    // Voir entities.LEAD_IN : sans ce recul, le premier lot de créneaux (la
    // période de grâce) apparaîtrait déjà à la position du joueur dès la
    // première frame au lieu de glisser depuis l'horizon.
    if (gameStarted) clock.jumpBy(-entities.LEAD_IN);
  }

  // Surveillance en cours de partie : si l'horloge audio cesse d'avancer, on
  // reprend la main sans perdre la progression (preserve = true).
  if (gameStarted && audioDrivesClock && !game.ended) {
    const audioT = audio.now();
    if (audioT > audioWatch.lastT + 1e-4) {
      audioWatch.lastT = audioT;
      audioWatch.lastReal = perfClock();
    } else if (perfClock() - audioWatch.lastReal > AUDIO_STALL_TIMEOUT) {
      useFallbackClock(true);
    }
  }

  playerState.prevX = playerState.x;
  playerState.prevLean = playerState.lean;
  playerState.prevPedalPhase = playerState.pedalPhase;

  // --- Changement de voie ------------------------------------------------
  // Un swipe = un cran (voir input.js). Le clamp aux bornes remplace tout
  // l'ancien bornage en unités-monde : sortir de la route est devenu
  // impossible par construction, pas par correction.
  const move = consumeLaneMove();
  if (move && !game.ended && !finishing.active) {
    playerState.lane = Math.max(0, Math.min(road.LANE_COUNT - 1, playerState.lane + move));
  }
  // x court après le centre de la voie visée.
  const targetX = road.laneX(playerState.lane);
  const tween = Math.min(1, LANE_TWEEN * window.CONFIG.sensibiliteDirection * dt);
  playerState.x += (targetX - playerState.x) * tween;
  // Vélocité observée (et non commandée) : sert uniquement à incliner le
  // sprite dans le sens du déplacement réel.
  playerState.vx = dt > 0 ? (playerState.x - playerState.prevX) / dt : 0;

  road.setCameraX(playerState.x * CAMERA_FOLLOW);

  const leanRaw = (playerState.vx / LATERAL_SPEED) * MAX_LEAN;
  playerState.lean = Math.max(-MAX_LEAN, Math.min(MAX_LEAN, leanRaw));

  // Rebond de pédalage, cadence proportionnelle à la vitesse d'avancement.
  playerState.pedalPhase += road.getSpeed() * PEDAL_RATE * dt;

  if (pickupFlash > 0) {
    pickupFlash = Math.max(0, pickupFlash - dt / PICKUP_FLASH_DURATION);
  }
  if (damageFlash > 0) {
    damageFlash = Math.max(0, damageFlash - dt);
  }

  if (gameStarted && hudAlpha < 1) {
    hudAlpha = Math.min(1, hudAlpha + dt / HUD_FADE_DURATION);
  }

  // --- Physique du saut : parabole + états ground/air/onCar --------------
  // Ancien modèle : t ∈ [0..dureeSaut], y = sin(t/T * PI) — lent au sommet
  // (sensation "planant"). Nouveau : vraie intégration Euler d'une gravité
  // constante — accélération descendante nette, comme demandé au playtest.
  jump.prevY = jump.y;
  const { vJump, g } = jumpPhysics();
  const jumpPressed = consumeJumpPress();
  const slamDown = consumeSlamDown();

  if (jumpPressed && (jump.mode === 'ground' || jump.mode === 'onCar')) {
    jump.vy = vJump;
    jump.mode = 'air';
  }

  if (slamDown && jump.mode === 'air') {
    jump.vy = -vJump * 1.5;
  }

  if (jump.mode === 'air') {
    jump.y += jump.vy * dt;
    jump.vy -= g * dt;
    // Atterrissage sur le toit d'un convoi ? On teste seulement en train de
    // *descendre* et proche du niveau du toit — pas de "collage" en montant
    // (sinon le saut normal serait interrompu à la 1ère voiture qu'on
    // survole). roofOverlap est safe même sans convoi visible (renvoie false).
    if (jump.vy < 0 && jump.y > 0 && jump.y <= CAR_ROOF_Y + 0.05 && entities.roofOverlap(playerState.lane)) {
      jump.y = CAR_ROOF_Y;
      jump.vy = 0;
      jump.mode = 'onCar';
    } else if (jump.y <= 0) {
      jump.y = 0;
      jump.vy = 0;
      jump.mode = 'ground';
    }
  } else if (jump.mode === 'onCar') {
    // Reste posé tant que le joueur ne sort pas du convoi (latéralement ou
    // parce que le dernier véhicule est passé). Sinon il retombe : on
    // repasse en mode 'air' avec vy = 0, la gravité fait le reste (chute
    // parabolique classique jusqu'au sol).
    if (!entities.roofOverlap(playerState.lane)) {
      jump.mode = 'air';
      jump.vy = 0;
      // jump.y garde CAR_ROOF_Y, il chutera à la frame suivante
    }
  }

  // La route ne défile qu'une fois la chanson lancée (course = durée du morceau),
  // et se fige à la fin de partie (game over ou morceau terminé).
  if (gameStarted && !game.ended) {
    // Pendant la séquence de fin (finishing) : plus aucune collision testée,
    // score/vies figés — le joueur est visuellement en train de s'éloigner
    // vers l'horizon, ça n'aurait aucun sens de continuer à décrocher des
    // bonus ou de perdre des vies sur des objets qu'il a "dépassés".
    if (!finishing.active) {
      // Une voiture au sol n'est mortelle que si le joueur est en 'ground'.
      // Le mode 'air' comme 'onCar' rendent le joueur invulnérable aux
      // voitures (mais pas au piéton/cône — voir entities.js pour le
      // comportement par kind).
      const events = entities.update(playerState.lane, jump.mode !== 'ground');
      for (const e of events) {
        if (e.type === "bonus") {
          game.score += window.CONFIG.bonus[e.kind];
          pickupFlash = 1;
        } else {
          // Playtest : "quand on se prend une voiture, game over". La
          // voiture est traitée comme un choc fatal (3 vies perdues d'un
          // coup, endGame déclenché juste après dans le même step) — le
          // convoi se voit à 100 m, se contourne, aucune raison d'être
          // clément. Les autres obstacles (piéton, cône, bus) restent à -1
          // vie chacun.
          if (e.kind === "voiture") {
            game.lives = 0;
          } else {
            game.lives -= 1;
          }
          damageFlash = DAMAGE_FLASH_DURATION;
        }
      }
    }

    const now = clock.now();
    if (game.lives <= 0) {
      endGame("gameover");
    } else if (entities.isFinished(now) || finishing.active) {
      // Ligne d'arrivée franchie (150 objets, voir entities.js). Le morceau
      // continue de jouer jusqu'au bout (objectif "donner envie d'écouter
      // le morceau"), mais la course s'arrête : caméra qui freine smooth,
      // personnage qui continue jusqu'à l'horizon (voir beginFinish/render).
      if (!finishing.active) beginFinish();
      road.brake(dt);
      finishing.elapsed += dt;
      finishing.playerZ += finishing.playerSpeed * dt;
      // Le joueur décélère moins vite que la route (0.5/s vs 1.2/s) : il
      // s'éloigne visiblement au lieu de s'immobiliser en même temps.
      finishing.playerSpeed += (0 - finishing.playerSpeed) * Math.min(1, 0.5 * dt);
      if (finishing.elapsed > FINISH_DURATION - FINISH_FADE) {
        finishing.alpha = Math.max(0, (FINISH_DURATION - finishing.elapsed) / FINISH_FADE);
      }
      if (finishing.elapsed >= FINISH_DURATION) {
        endGame("finished");
      }
    } else {
      road.update(dt, now);
    }
  }

  updateHealthFilterIfChanged();
}

// Dernier cœur : alternance couleur/N&B (classe .heart-warning, keyframe
// dans index.html) + noir et blanc statique total au game over (classe
// .game-over-bw). Fait en CSS sur le CANVAS uniquement (jamais sur
// #overlay) : le titre/bandeau de l'écran de fin est en DOM, il reste donc
// en couleur "sauf le titre" sans traitement particulier.
// Un premier essai en désaturation statique (grayscale(0.75) fixe au
// dernier cœur) a été jugé "trop en noir et blanc" au playtest — remplacé
// par le clignotement, qui signale le danger sans assombrir la lisibilité
// en continu.
let lastFilterLives = null;
function updateHealthFilterIfChanged() {
  // Une fois la partie terminée, plus aucun retour en arrière possible : on
  // fige sur le N&B statique une bonne fois pour toutes (sentinelle "ended"
  // plutôt qu'une valeur de vies, pour ne plus jamais rebasculer même si
  // `game.lives` bouge encore d'une façon inattendue). Défensif — signalé au
  // playtest : « il reste un cœur qui clignote alors qu'il y a marqué game
  // over ».
  if (game.ended) {
    if (lastFilterLives !== "ended") {
      lastFilterLives = "ended";
      canvas.classList.remove("heart-warning", "game-over-bw");
      canvas.classList.add("game-over-bw");
    }
    return;
  }
  if (game.lives === lastFilterLives) return;
  lastFilterLives = game.lives;
  canvas.classList.remove("heart-warning", "game-over-bw");
  if (game.lives <= 0) {
    canvas.classList.add("game-over-bw");
  } else if (game.lives === 1) {
    canvas.classList.add("heart-warning");
  }
}

function renderPlayer(renderX, renderLean, renderPedalPhase, renderY) {
  // Pendant la séquence de fin, on rend le perso à sa profondeur *courante*
  // au lieu de PLAYER_NEAR_Z fixe : il s'éloigne vers l'horizon, son
  // sprite rétrécit naturellement (project() gère la mise à l'échelle).
  const z = finishing.active ? finishing.playerZ : road.PLAYER_NEAR_Z;
  if (z >= road.HORIZON_Z) return; // déjà au-delà du repli de la courbe
  const p = road.project(renderX, z, width, height);
  const hop = renderY * p.scale;
  const bob = Math.sin(renderPedalPhase) * PEDAL_BOB * p.scale;
  const wasAlpha = ctx.globalAlpha;
  let alpha = wasAlpha;
  if (finishing.active) alpha *= finishing.alpha;
  // Clignotement dégât : 6 alternances sur DAMAGE_FLASH_DURATION → 3 flashs
  // (Math.floor(x * 10) % 2 : x va de 0 à 0.9, floor(x*10) va de 0 à 8,
  // donc 9 valeurs alternées visible/atténué ≈ 3 cycles complets).
  if (damageFlash > 0) {
    const elapsed = DAMAGE_FLASH_DURATION - damageFlash;
    const on = Math.floor(elapsed * 10) % 2 === 0;
    if (!on) alpha *= 0.15;
  }
  ctx.globalAlpha = alpha;
  // Flou de mouvement : proportionnel à la vitesse latérale courante (même
  // référence que le lean), donc actif pendant un changement de voie et nul
  // une fois la voie atteinte ; son plafond grandit lui-même avec la vitesse
  // de la route (voir laneBlurMax()). `ctx.filter` reste
  // bon marché ici : il ne s'applique qu'au sprite (26×34 mis à l'échelle),
  // jamais à toute la scène.
  const blurCap = laneBlurMax();
  const blurPx = Math.min(blurCap, (Math.abs(playerState.vx) / LATERAL_SPEED) * blurCap);
  if (blurPx > 0.05) ctx.filter = `blur(${blurPx.toFixed(2)}px)`;
  player.renderPickupGlow(ctx, p.x, p.y - hop - bob, p.scale, pickupFlash);
  player.render(ctx, p.x, p.y - hop - bob, p.scale, renderLean, renderPedalPhase);
  if (blurPx > 0.05) ctx.filter = "none";
  ctx.globalAlpha = wasAlpha;
}

function render(alpha) {
  const renderDistance = road.getRenderDistance(alpha);
  road.render(ctx, width, height, renderDistance);
  world.render(ctx, width, height, renderDistance);
  if (gameStarted && !game.ended) {
    entities.render(ctx, width, height);
    // Ligne d'arrivée : rien pendant l'essentiel du morceau, apparaît à 5s
    // de la fin et arrive au niveau du joueur pile quand la partie se
    // termine (voir finish.js). Dessinée APRÈS les entités pour que
    // portière/piéton/cône dépassent en la traversant (question ouverte
    // dans le plan : « ligne d'arrivée cosmétique » plutôt que d'inventer
    // une nouvelle condition de fin).
    finish.render(ctx, width, height);
  }

  const renderX = playerState.prevX + (playerState.x - playerState.prevX) * alpha;
  const renderLean = playerState.prevLean + (playerState.lean - playerState.prevLean) * alpha;
  const renderPedalPhase = playerState.prevPedalPhase + (playerState.pedalPhase - playerState.prevPedalPhase) * alpha;
  const renderY = jump.prevY + (jump.y - jump.prevY) * alpha;
  renderPlayer(renderX, renderLean, renderPedalPhase, renderY);

  // Le menu et l'écran de fin sont en DOM (#overlay) : il ne reste ici que le
  // HUD de jeu, monté en fondu.
  if (gameStarted && hudAlpha > 0.001) {
    ctx.save();
    ctx.globalAlpha = hudAlpha;
    hud.renderHud(ctx, width, height, game);
    if (audioFallback) hud.renderAudioWarning(ctx, width, height);
    ctx.restore();
  }

  debugOverlay.renderBeatGrid(ctx, width, height);
  debugOverlay.renderStats(ctx, {
    fps: perf.fps,
    frameMs: perf.frameMs,
    playerX: renderX,
    audioStatus: audio.getStatus(),
    clockSource: audioDrivesClock ? "audio" : "secours",
  });
}

// Le canvas ne participe pas au chargement de police du document : un
// ctx.font demandant "Stage Grotesk" avant que le fichier soit prêt retombe
// silencieusement sur la police système, et le texte déjà peint reste tel
// quel. On force donc le chargement des deux graisses utilisées par hud.js
// avant la première frame. Non bloquant en cas d'échec : on joue plutôt en
// police système que pas du tout.
if (document.fonts && document.fonts.load) {
  Promise.all([
    document.fonts.load('900 30px "Stage Grotesk"'),
    document.fonts.load('500 13px "Stage Grotesk"'),
  ]).catch(() => {});
}

let lastTime = performance.now() / 1000;
let accumulator = 0;

function frame(nowMs) {
  const now = nowMs / 1000;
  const frameTime = Math.min(now - lastTime, MAX_FRAME_TIME);
  lastTime = now;

  perf.frameMs = frameTime * 1000;
  perf.accumTime += frameTime;
  perf.frameCount += 1;
  if (perf.accumTime >= 0.5) {
    perf.fps = perf.frameCount / perf.accumTime;
    perf.accumTime = 0;
    perf.frameCount = 0;
  }

  // En pause (menu pause ou onglet caché) : `lastTime` continue d'être tenu
  // à jour ci-dessus à chaque frame (pas de gros `frameTime` à rattraper au
  // réveil), mais on n'avance plus l'accumulateur — la simulation reste
  // figée pile où elle en était, `render()` continue de peindre cette même
  // frame derrière le voile du menu pause.
  if (!isPaused()) {
    accumulator += frameTime;
    while (accumulator >= FIXED_DT) {
      step(FIXED_DT);
      accumulator -= FIXED_DT;
    }
  }

  syncLoadingUi();
  render(accumulator / FIXED_DT);
  requestAnimationFrame(frame);
}

// Le menu monte en fondu sur la scène déjà dessinée plutôt que sur du noir :
// on laisse passer une frame pour que la route soit peinte derrière lui.
requestAnimationFrame(() => requestAnimationFrame(showOverlay));

requestAnimationFrame(frame);
