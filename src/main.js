// main.js — Bootstrap : canvas plein écran, boucle à pas de temps fixe
// (accumulateur + interpolation au rendu), orchestration route/input/debug.

import { clock } from "./clock.js";
import * as road from "./road.js";
import * as world from "./world.js";
import * as debugOverlay from "./debug.js";
import * as audio from "./audio.js";
import * as player from "./player.js";
import * as entities from "./entities.js";
import * as entitiesRender from "./entities-render.js";
import * as finish from "./finish.js";
import * as cameo from "./cameo.js";
import * as crosstraffic from "./crosstraffic.js";
import * as tutorial from "./tutorial.js";
import * as hud from "./hud.js";
import * as net from "./net.js";
import * as screens from "./screens.js";
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

// Flou de mouvement supplémentaire autour de la ligne d'arrivée (demandé
// explicitement le 12 août 2026 : « augmente le flou de mouvement à partir du
// moment où je suis très, très proche de l'arrivée »). Monte en fondu à
// l'approche, plafonne pile sur la ligne, redescend pendant la séquence de
// fin (voir finishing.active plus bas) — même fenêtre des deux côtés plutôt
// qu'un pic asymétrique, pour rester simple. Indépendant du flou de
// changement de voie ci-dessus (le max des deux est pris, voir
// renderPlayer()) : les deux ne se cumulent pas, ils se complètent.
const FINISH_BLUR_WINDOW = 3; // s de part et d'autre de la ligne
const FINISH_BLUR_MAX = 3.5;  // px, au plus fort (pile sur la ligne)
function finishBlur(now) {
  // 🐛 Uniquement en course. Avant le départ, clock.now() compte le temps
  // écoulé depuis le CHARGEMENT de la page (voir clock.js) : un joueur qui
  // reste ~143 s sur le menu ou le décompte traversait la fenêtre de
  // finishTime() et voyait son personnage se flouter sur l'écran d'accueil,
  // sans qu'aucune course ait commencé.
  if (!gameStarted || game.ended) return 0;
  const remaining = entities.finishTime() - now;
  const t = Math.abs(remaining) / FINISH_BLUR_WINDOW;
  if (t >= 1) return 0;
  return FINISH_BLUR_MAX * (1 - t);
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
// L'horloge de jeu se gèle dans audio.js (`pauseAnchor`) — mais uniquement si
// c'est bien l'audio qui la pilote. Sur l'horloge de secours (perfClock), rien
// ne l'arrête : la course rattraperait d'un coup toute la durée de la pause à
// la reprise. On la recule donc du temps passé en pause, arrondi au temps
// musical près pour les mêmes raisons qu'en audio (voir setPlaybackMode) —
// même si, sans morceau, le calage n'a plus d'auditeur : la course, elle,
// reste construite sur cette grille.
let pauseStartedAt = 0;

function applyPauseState() {
  const next = hiddenPaused ? "silent" : manualPaused ? "muffled" : "running";
  audio.setPlaybackMode(next);

  if (next !== "running") {
    if (pauseStartedAt === 0) pauseStartedAt = perfClock();
  } else {
    if (pauseStartedAt > 0) {
      const ecart = perfClock() - pauseStartedAt;
      if (!audioDrivesClock) {
        clock.jumpBy(-Math.round(ecart / clock.beatPeriod) * clock.beatPeriod);
      }
      // La partie n'a pas encore démarré (décompte terminé pendant que l'appli
      // était en arrière-plan, par exemple) : le délai d'attente de l'audio ne
      // doit pas courir pendant ce temps-là. Sinon, au retour, les
      // AUDIO_START_TIMEOUT secondes sont déjà écoulées alors que le contexte
      // vient tout juste de reprendre (resume() est asynchrone) — la partie
      // basculait sur l'horloge de secours et se jouait en silence, sans
      // retour en arrière possible, pour un incident qui n'en était pas un.
      if (startRequested && !gameStarted) startRequestedAt += ecart;
    }
    pauseStartedAt = 0;
  }

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

// --- Messages qui s'envolent au-dessus du joueur -------------------------
// ⚠️ Revu le 19 août 2026, deuxième passe. Le « +150 » à CHAQUE étoile a été
// jugé « insupportable » — ce qui se comprend : à une étoile toutes les 0,75 s
// en plein combo, le chiffre clignotait en permanence au milieu de l'écran.
// Ne restent que deux usages, tous deux ponctuels :
//   1. les TROIS PREMIÈRES étoiles de la partie (« tu peux le mettre à la
//      limite sur les 3 premières pour que les gens comprennent, mais c'est
//      tout ») — le rôle est pédagogique, pas décoratif ;
//   2. le passage d'un PALIER de combo (« quand on passe de ×3,5 à ×4, tu peux
//      mettre un truc au-dessus du bonhomme pour dire que ça s'améliore ») —
//      un événement rare, donc un message qui garde sa valeur.
// --- Bandeau de palier de score (19 août 2026) ---------------------------
// Version NON BLOQUANTE du « mur » évoqué par l'artiste (« quand quelqu'un
// arrive à 50 000, le jeu se met en pause, il doit presser le lien »). Deux
// raisons de ne pas mettre le mur ici : à 50 000 sur un maximum théorique de
// 61 400, le seuil n'aurait quasiment jamais été atteint ; et interrompre une
// course pour envoyer le joueur sur une page externe, sur mobile, c'est risquer
// un onglet rechargé et un run perdu au meilleur moment (voir aussi
// pauseDeriveMax dans config.js — au-delà de 25 s d'absence, le morceau se
// rembobine). Le mur existe donc, mais sur l'ÉCRAN DE FIN (screens.js), là où
// il n'y a plus de partie à casser. Ici il ne reste qu'un rappel qui passe et
// s'efface, calé sur un seuil réellement atteignable.
const MILESTONE_SCORE = 12000;
const MILESTONE_DUREE = 4;

const PICKUP_POPUP_DURATION = 1.1;
const PICKUP_POPUP_RISE = 46;   // px parcourus vers le haut sur toute la durée
const PICKUP_POPUP_MAX = 3;
const POPUPS_PEDAGOGIQUES = 3;  // nombre d'étoiles en début de partie qui affichent encore leurs points
const popups = [];              // { texte, couleur, age }

function pousserPopup(texte, couleur) {
  popups.push({ texte, couleur, age: 0 });
  if (popups.length > PICKUP_POPUP_MAX) popups.shift();
}

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
  penaltyTimer: 0,   // s restantes d'affichage du "-500" sous le score (hud.js)
  penaltyAmount: 0,  // montant du dernier malus, pour l'afficher tel quel
  streak: 0,         // étoiles ramassées d'affilée depuis le dernier obstacle touché (combo, voir plus bas)
  // Deux compteurs de bilan, pour l'image de partage (share.js) : ils ne
  // pilotent aucune mécanique, ils racontent la partie une fois finie.
  stars: 0,          // étoiles ramassées sur toute la partie
  bestCombo: 1,      // plus haut multiplicateur atteint, même s'il a été cassé depuis
  // Palier de score déjà annoncé (bandeau « va écouter le morceau ») — évite
  // de le rejouer à chaque frame une fois le seuil franchi.
  milestoneShown: 0,
  milestoneTimer: 0,
  // Durée totale du bandeau, exposée pour que hud.js puisse calculer l'âge
  // de l'animation d'entrée (le timer seul ne dit pas d'où il part).
  milestoneDuree: MILESTONE_DUREE,
};

// Combo (demandé le 17 août 2026) : `streak` étoiles d'affilée → multiplicateur
// par palier de `comboSeuil` (5 → ×1,5, 10 → ×2, 15 → ×2,5...), remis à 0 au
// moindre obstacle touché. `Math.round` sur le résultat final : les points de
// base (config.js, `bonus`) sont tous ronds, mais ×1,5/×2,5 ne le garde pas
// forcément (ex. 150 × 1,5 = 225, mais 250 × 1,5 = 375 — jamais de décimale
// affichée dans tous les cas ici, mais l'arrondi protège les futurs réglages
// de comboBonusParPalier qui n'y donneraient pas forcément un entier).
function comboMultiplier() {
  const { comboSeuil, comboBonusParPalier } = window.CONFIG;
  return 1 + comboBonusParPalier * Math.floor(game.streak / comboSeuil);
}

// Jaune des étoiles (STAR_FILL, entities-render.js) : le multiplicateur de
// combo et son annonce de palier le reprennent, « pour que ce soit cohérent en
// termes de couleurs » — c'est la teinte du gain dans ce jeu, le rouge de
// charte restant celle du malus.
const JAUNE_ETOILE = "#ffcf2e";
// Compté sur la partie en cours : sert à n'afficher les points gagnés que sur
// les toutes premières étoiles (voir POPUPS_PEDAGOGIQUES).
let etoilesRamassees = 0;

// « ×2,5 » plutôt que « ×2.5 » : virgule décimale française, et pas de « ,0 »
// inutile sur les multiplicateurs entiers (×2, ×3).
function formatMultiplicateur(m) {
  return `×${String(m).replace(".", ",")}`;
}

// Interface étroite vers screens.js (écrans hors-jeu) : main.js reste seul
// maître de l'état de partie et de la boucle. screens.js ne peut pas importer
// main.js (dépendance circulaire, voir ARCHITECTURE.md §4), donc les quelques
// actions qu'il doit pouvoir déclencher lui sont passées ici en callbacks.
function requestGameStart() {
  // La route a défilé pendant le tutoriel (road.update avec temps 0) : on la
  // remet à zéro pour que la course parte de la distance 0 — la rampe des
  // véhicules traversants (crosstraffic.js) est calée sur la DISTANCE
  // parcourue, et ~20 s de tutoriel décaleraient leurs premiers passages
  // d'autant vers le début de course, ce qui changerait l'équilibrage mesuré.
  road.reset();
  startRequested = true;
  startRequestedAt = perfClock();
}
function isGameStartRequested() {
  return startRequested;
}
function openPauseMenuState() {
  manualPaused = true;
  applyPauseState();
}
function closePauseMenuState() {
  manualPaused = false;
  applyPauseState();
}

screens.init({
  game,
  etoilesTotal: entities.TOTAL_STARS, // pour le « x/y étoiles » de l'image de partage
  requestGameStart,
  isGameStartRequested,
  restartGame,
  openPause: openPauseMenuState,
  closePause: closePauseMenuState,
  isManuallyPaused: () => manualPaused,
});

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

// --- Secousse d'écran à l'impact (20 août 2026, validée « à 100 % ») --------
// Complète le clignotement du sprite : le choc se ressent sur toute la scène,
// pas seulement sur le personnage. Deux intensités — un choc fatal (voiture,
// pont) secoue plus fort et plus longtemps qu'une collision à -1 vie.
// Deux sinusoïdes désaccordées (x/y) plutôt qu'un aléatoire par frame : le
// mouvement reste continu (pas de téléportation d'un pixel à l'autre) et
// l'amplitude décroît en t² — sec à l'impact, s'éteint vite.
// ⚠️ Appliquée au CANVAS seulement, jamais au HUD : le score doit rester
// lisible pendant le choc (voir render()).
const shake = { time: 0, duration: 1, amp: 0 };

function triggerShake(amp, duration) {
  shake.amp = amp;
  shake.duration = duration;
  shake.time = duration;
}
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
  screens.hidePauseButton(); // la caméra freine jusqu'à l'écran de fin, plus rien à mettre en pause ici
}
function resetFinish() {
  finishing.active = false;
  finishing.elapsed = 0;
  finishing.alpha = 1;
}

// Fin de partie : le menu revient en fondu, réutilisé tel quel — le titre
// devient le résultat, le bouton principal devient « Rejouer ». Un léger
// retard laisse la scène se figer à l'écran avant que l'overlay ne monte,
// sinon la transition écrase l'instant où on comprend ce qui vient d'arriver.
// Le rendu de l'écran de fin et du classement vit dans screens.js — ici, on
// ne décide que CE qui doit être affiché et envoyé.
function endGame(reason) {
  game.ended = true;
  game.endReason = reason;
  screens.hidePauseButton();

  // hud.contestStatus() ne pilote plus rien à l'écran (le statut technique
  // "Score valable pour le concours" était confus pour un joueur qui découvre
  // le jeu, retiré au playtest) — sert seulement à décider si le score part
  // vraiment vers Supabase, juste plus bas.
  const contest = hud.contestStatus();

  screens.showEndScreen(reason);

  // Envoi du score (étape 7) : seulement si le concours est ouvert et qu'un
  // pseudo a été renseigné — jamais bloquant, aucune UI d'attente (pas
  // d'anti-triche à confirmer, PLAN-ACTION.md §6). Se désactive tout seul si
  // CONFIG.apiScores/apiScoresKey ne sont pas encore renseignés (net.js).
  // Le classement est relu juste après l'envoi (même s'il n'a pas eu lieu)
  // pour avoir une chance d'y voir apparaître le score qu'on vient d'envoyer.
  // "@" éventuel retiré à l'envoi : la table Supabase stocke le pseudo brut,
  // sans préfixe (demandé explicitement). Défensif : accepte que le joueur
  // en tape un par habitude, on ne veut pas le forcer à connaître la règle.
  const pseudoJoueur = screens.getPseudo();
  (async () => {
    if (contest.open && pseudoJoueur) {
      await net.postScore(pseudoJoueur, screens.getInsta(), game.score);
    }
    screens.renderLeaderboard(await net.getTopScores());
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
  game.streak = 0;
  game.stars = 0;
  game.bestCombo = 1;
  game.milestoneShown = 0;
  game.milestoneTimer = 0;

  entities.reset();
  crosstraffic.reset(); // sinon les carrefours déjà traversés resteraient « résolus » au rejeu
  road.reset();
  resetFinish();
  damageFlash = 0;
  shake.time = 0; // sinon la secousse d'un choc de fin de partie survit au rejeu
  pickupFlash = 0;
  popups.length = 0;      // sinon un « +150 » de la partie précédente survit au rejeu
  etoilesRamassees = 0;   // les 3 popups pédagogiques reviennent à chaque nouvelle partie
  game.penaltyTimer = 0; // sinon le "-500" de la partie précédente survit au rejeu
  hudAlpha = 0; // le HUD remonte en fondu, comme au premier départ

  screens.hideOverlay();
  screens.showPauseButton(); // rejoue depuis l'écran de fin OU depuis le menu pause : dans les deux cas on repart en course active
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
  // (La démonstration automatique du tutoriel a été retirée : elle jouait de
  // vrais gestes que l'observateur comptait comme accomplis, donc les étapes
  // se validaient sans le joueur — « je ne fais rien, il bouge tout seul ».
  // La main fantôme de tutorial.js montre le geste, mais ne le fait plus.)
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

  // Le "-500" vit en temps réel (dt), pas en temps musical : c'est un retour
  // d'interface, il doit durer 3 s montre en main quelle que soit la vitesse.
  if (game.penaltyTimer > 0) {
    game.penaltyTimer = Math.max(0, game.penaltyTimer - dt);
  }
  if (game.milestoneTimer > 0) {
    game.milestoneTimer = Math.max(0, game.milestoneTimer - dt);
  }

  if (pickupFlash > 0) {
    pickupFlash = Math.max(0, pickupFlash - dt / PICKUP_FLASH_DURATION);
  }
  // Les points qui s'envolent vieillissent en temps RÉEL (dt), comme le "-500"
  // de pénalité : c'est un retour d'interface, il doit durer le même temps
  // montre en main quelle que soit la vitesse de la course.
  for (let i = popups.length - 1; i >= 0; i--) {
    popups[i].age += dt;
    if (popups[i].age >= PICKUP_POPUP_DURATION) popups.splice(i, 1);
  }
  if (damageFlash > 0) {
    damageFlash = Math.max(0, damageFlash - dt);
  }
  if (shake.time > 0) {
    shake.time = Math.max(0, shake.time - dt);
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
      entities.setScore(game.score); // intensification des vélos au-delà de CYCLIST_BOOST_SCORE (entities.js)
      // Deux sources de collisions, deux grilles indépendantes : la grille
      // MUSICALE (entities.js, bonus/obstacles calés sur les beats) et la
      // grille de DISTANCE (crosstraffic.js, véhicules qui traversent aux
      // carrefours — même grille que les bâtiments et les feux). Leurs
      // événements ont le même format et sont traités par la même boucle.
      const events = entities.update(playerState.lane, jump.mode !== 'ground')
        .concat(crosstraffic.update(playerState.lane, jump.mode !== 'ground'));
      for (const e of events) {
        if (e.type === "bonus") {
          const palierAvant = Math.floor(game.streak / window.CONFIG.comboSeuil);
          game.streak += 1;
          const gagne = Math.round(window.CONFIG.bonus[e.kind] * comboMultiplier());
          game.score += gagne;
          pickupFlash = 1;
          etoilesRamassees += 1;
          game.stars += 1;
          game.bestCombo = Math.max(game.bestCombo, comboMultiplier());
          const palierApres = Math.floor(game.streak / window.CONFIG.comboSeuil);
          if (palierApres > palierAvant && palierApres > 0) {
            // Passage de palier : LE moment qui mérite une annonce (« pour dire
            // que ça s'améliore »). Même jaune que les étoiles et que le
            // multiplicateur du HUD — c'est la couleur du gain dans ce jeu.
            pousserPopup(`COMBO ${formatMultiplicateur(comboMultiplier())}`, JAUNE_ETOILE);
            // Jingle 8-bit dans la tonalité du morceau (Ré♭ majeur, mesurée) —
            // demandé le 20 août 2026. S'allonge d'une note par palier.
            audio.playComboJingle(palierApres);
          } else if (etoilesRamassees <= POPUPS_PEDAGOGIQUES) {
            // Les toutes premières étoiles seulement : on montre une fois ce
            // que rapporte un ramassage, puis on se tait.
            pousserPopup(`+${gagne}`, "#ffffff");
          }
        } else {
          game.streak = 0; // tout obstacle touché casse le combo, voir comboMultiplier()
          // Playtest : "quand on se prend une voiture, game over". La
          // voiture est traitée comme un choc fatal (3 vies perdues d'un
          // coup, endGame déclenché juste après dans le même step) — le
          // convoi se voit à 100 m, se contourne, aucune raison d'être
          // clément. Le pont a rejoint la voiture le 12 août 2026 (retour
          // direct après test réel : « le pont doit arrêter la partie si je
          // me le prends ») — cohérent avec sa branche de collision dédiée
          // dans entities.js, où sauter dessous aggrave le risque au lieu de
          // le neutraliser. Les autres obstacles (piéton, cycliste, cône)
          // restent à -1 vie chacun.
          if (e.kind === "voiture" || e.kind === "pont") {
            game.lives = 0;
            triggerShake(13, 0.5);
          } else {
            game.lives -= 1;
            triggerShake(7, 0.32);
          }
          // Pénalité de score, demandée avec la perte de cœur : une collision
          // ne coûtait qu'une vie, donc rien tant qu'il en restait — on
          // pouvait foncer dans le tas sans que le score s'en aperçoive.
          // Une seule pénalité par collision : c'est le choc qui coûte, pas le
          // décompte des cœurs. Jamais de score négatif.
          // ⚠️ Plus AUCUNE pénalité sur le choc qui TERMINE la partie (20 août
          // 2026, « enlève le fait de perdre 500 points quand tu meurs
          // définitivement ») : la partie est déjà perdue, raboter en plus le
          // score affiché sur l'écran de fin ne punissait rien — un joueur
          // finissait à 0 pour un score réel de quelques centaines. Couvre la
          // voiture/le pont ET la dernière vie perdue sur un petit obstacle.
          if (game.lives > 0) {
            game.penaltyAmount = window.CONFIG.penaliteObstacle;
            game.score = Math.max(0, game.score - game.penaltyAmount);
            game.penaltyTimer = window.CONFIG.penaliteDuree;
          }
          damageFlash = DAMAGE_FLASH_DURATION;
        }
      }
    }

    if (game.milestoneShown === 0 && game.score >= MILESTONE_SCORE) {
      game.milestoneShown = MILESTONE_SCORE;
      game.milestoneTimer = MILESTONE_DUREE;
    }

    const now = clock.now();
    if (game.lives <= 0) {
      endGame("gameover");
    } else if (entities.isFinished(now) || finishing.active) {
      // Ligne d'arrivée franchie (TOTAL_OBJECTS créneaux, dérivé de
      // config.dureeCourse — voir entities.js). Le morceau continue de jouer
      // jusqu'à SA fin réelle (config.dureeMorceau, plus longue, objectif
      // "donner envie d'écouter le morceau"), mais la course s'arrête ici :
      // caméra qui freine smooth, personnage qui continue jusqu'à l'horizon
      // (voir beginFinish/render).
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
  } else if (tutorial.estActif()) {
    // Pendant le tutoriel, la route défile à la vitesse de DÉPART (temps
    // écoulé = 0 dans la courbe d'accélération) : la scène vit, le personnage
    // pédale, les objets de démonstration approchent — mais la course, elle,
    // n'a pas commencé (l'horloge musicale ne pilote encore rien).
    road.update(dt, 0);
    tutorial.avancer(dt, {
      voie: playerState.lane,
      auSol: jump.mode === 'ground',
      vientDeSauter: jumpPressed && jump.mode === 'air',
    });
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
  const laneBlurPx = Math.min(blurCap, (Math.abs(playerState.vx) / LATERAL_SPEED) * blurCap);
  const blurPx = Math.max(laneBlurPx, finishBlur(clock.now()));
  if (blurPx > 0.05) ctx.filter = `blur(${blurPx.toFixed(2)}px)`;
  player.renderPickupGlow(ctx, p.x, p.y - hop - bob, p.scale, pickupFlash);
  player.render(ctx, p.x, p.y - hop - bob, p.scale, renderLean, renderPedalPhase);
  if (blurPx > 0.05) ctx.filter = "none";
  ctx.globalAlpha = wasAlpha;
}

// Points gagnés qui montent et s'effacent au-dessus du joueur. Ancrés sur sa
// position projetée (donc ils suivent le changement de voie), mais peints
// hors de la séquence du peintre : c'est de l'interface, elle ne doit jamais
// passer derrière une voiture. Police du jeu, comme le HUD — le canvas ne lit
// pas les variables CSS, d'où la constante dupliquée ici aussi.
const POPUP_POLICE = '"Stage Grotesk", system-ui, sans-serif';

function renderPickupPopups(ctx, renderX) {
  if (!popups.length) return;
  const p = road.project(renderX, road.PLAYER_NEAR_Z, width, height);
  const base = p.y - player.HEIGHT_WORLD * p.scale * 1.15;

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = 6;
  for (const popup of popups) {
    const t = popup.age / PICKUP_POPUP_DURATION; // 0 à l'impact → 1 à la fin
    // Montée qui décélère (racine) : vif au départ, posé à l'arrivée — c'est
    // ce profil qui se lit comme « ça décolle » plutôt qu'un glissement plat.
    const monte = Math.sqrt(t) * PICKUP_POPUP_RISE;
    // Pleine opacité sur le premier tiers, fondu ensuite : le chiffre a le
    // temps d'être lu avant de disparaître.
    ctx.globalAlpha = t < 0.33 ? 1 : Math.max(0, 1 - (t - 0.33) / 0.67);
    // Léger sursaut d'échelle à l'impact, qui retombe tout de suite. Taille en
    // pixels fixes, comme tout le HUD (hud.js) : un chiffre d'interface doit
    // garder la même taille à l'écran, il ne s'éloigne pas avec la route.
    ctx.font = `900 ${t < 0.15 ? 28 : 23}px ${POPUP_POLICE}`;
    ctx.fillStyle = popup.couleur;
    ctx.fillText(popup.texte, p.x, base - monte);
  }
  ctx.restore();
}

function render(alpha) {
  // Secousse d'impact : toute la scène (route, monde, entités, popups) est
  // translatée, le HUD reste fixe — le ctx.restore() est plus bas, juste
  // avant le bloc HUD.
  const shakeActive = shake.time > 0;
  if (shakeActive) {
    const t = shake.time / shake.duration;         // 1 à l'impact → 0 à la fin
    const k = shake.amp * t * t;                   // décroissance en t²
    const phase = (shake.duration - shake.time) * 62; // ~10 oscillations/s
    ctx.save();
    ctx.translate(Math.sin(phase) * k, Math.cos(phase * 1.35) * k * 0.6);
  }

  const renderDistance = road.getRenderDistance(alpha);
  road.render(ctx, width, height, renderDistance);
  world.render(ctx, width, height, renderDistance);

  const renderX = playerState.prevX + (playerState.x - playerState.prevX) * alpha;
  const renderLean = playerState.prevLean + (playerState.lean - playerState.prevLean) * alpha;
  const renderPedalPhase = playerState.prevPedalPhase + (playerState.pedalPhase - playerState.prevPedalPhase) * alpha;
  const renderY = jump.prevY + (jump.y - jump.prevY) * alpha;

  if (gameStarted && !game.ended) {
    // Caméo Soberland (demandé le 17 août 2026) : purement décoratif, planté
    // dans les 10 premières secondes de course — voir cameo.js. Personnage
    // ET table de mixage passés en `extras` à entities-render.render()
    // plutôt que dessinés séparément : sinon ils se peindraient toujours au
    // même endroit de la séquence (avant OU après tous les bonus/obstacles),
    // indépendamment de leur profondeur réelle — bug remonté en jeu
    // (Soberland apparaissait devant un pont pourtant plus proche).
    // 🐛 Le JOUEUR passe lui aussi par `extras` depuis le 19 août 2026 (retour
    // direct : « quand je passe un pont et que je saute en l'air, on a
    // l'impression que je saute par-dessus le pont, alors que je suis derrière
    // le pont »). Il était peint APRÈS toute la scène, donc toujours au
    // premier plan — y compris devant un pont/une voiture déjà DÉPASSÉS, donc
    // physiquement plus proches de la caméra que lui. Le poser dans la
    // séquence du peintre à sa vraie profondeur suffit : tout ce qui a un z
    // plus petit que PLAYER_NEAR_Z se peint désormais par-dessus lui. Même
    // mécanisme exactement que le caméo, pour la même raison.
    const extras = cameo.getExtras(ctx, width, height, clock.now())
      .concat(crosstraffic.getExtras(ctx, width, height));
    extras.push({
      z: finishing.active ? finishing.playerZ : road.PLAYER_NEAR_Z,
      draw: () => renderPlayer(renderX, renderLean, renderPedalPhase, renderY),
    });
    entitiesRender.render(ctx, width, height, extras);
    // Ligne d'arrivée : rien pendant l'essentiel du morceau, apparaît à 5s
    // de la fin et arrive au niveau du joueur pile quand la partie se
    // termine (voir finish.js). Dessinée APRÈS les entités pour que
    // portière/piéton/cône dépassent en la traversant (question ouverte
    // dans le plan : « ligne d'arrivée cosmétique » plutôt que d'inventer
    // une nouvelle condition de fin).
    finish.render(ctx, width, height);
  } else if (tutorial.estActif()) {
    // Tutoriel : les objets de démonstration et le joueur sont triés par
    // profondeur et peints du plus loin au plus près — même ordre du peintre
    // que la course (un pont de démo doit passer devant le joueur une fois
    // dépassé, exactement comme le vrai). PAS via entitiesRender.render() :
    // celui-ci parcourt la grille musicale (slotsFor), qui n'a pas encore
    // démarré — on peindrait les créneaux de la future course.
    const elements = tutorial.getExtras(ctx, width, height, clock.now());
    elements.push({
      z: road.PLAYER_NEAR_Z,
      draw: () => renderPlayer(renderX, renderLean, renderPedalPhase, renderY),
    });
    elements.sort((a, b) => b.z - a.z);
    for (const e of elements) e.draw(ctx);
    tutorial.dessinerGeste(ctx, width, height);
  } else {
    // Hors course (menu d'accueil, écran de fin) : aucune entité n'est peinte,
    // donc personne pour porter le joueur dans la séquence du peintre — on le
    // dessine directement, comme avant.
    renderPlayer(renderX, renderLean, renderPedalPhase, renderY);
  }

  // Points gagnés qui s'envolent au-dessus du joueur : c'est de l'interface,
  // pas un objet du monde — donc peint APRÈS la scène, jamais masqué par une
  // voiture ou un pont qui passerait devant.
  renderPickupPopups(ctx, renderX);

  if (shakeActive) ctx.restore(); // fin de la secousse : le HUD ne bouge pas

  // Le menu et l'écran de fin sont en DOM (#overlay) : il ne reste ici que le
  // HUD de jeu, monté en fondu.
  if (gameStarted && hudAlpha > 0.001) {
    ctx.save();
    ctx.globalAlpha = hudAlpha;
    hud.renderHud(ctx, width, height, game);
    hud.renderMilestone(ctx, width, height, game);
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

  screens.syncLoadingUi();
  screens.syncTutorialUi();
  render(accumulator / FIXED_DT);
  requestAnimationFrame(frame);
}

screens.showOverlayOnLoad();

requestAnimationFrame(frame);
