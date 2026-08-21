// screens.js — Écrans hors-jeu : menu/onboarding (pseudo → jouer), décompte,
// panneau son, menu pause, écran de fin + classement. Extrait de main.js
// (dette documentée dans ARCHITECTURE.md §11 : "à découper — comme passe
// séparée, jamais mélangé à un changement de gameplay") : ce module ne
// contient QUE du câblage DOM et de la présentation, jamais de physique ni de
// boucle de jeu. Aucun changement de comportement voulu dans cette
// extraction — le code est déplacé tel quel, seules les frontières entre
// fichiers sont nouvelles.
//
// main.js reste le seul propriétaire de l'état de partie (`game`,
// `playerState`, `jump`, l'horloge, la boucle à pas fixe) : ce module lui
// emprunte une référence à `game` (lecture seule en pratique : score/pseudo
// affichés) et reçoit en retour, via init(), les quelques actions qui doivent
// rester décidées par main.js (démarrer réellement la course, rejouer, entrer/
// sortir de la pause) — jamais l'inverse, pour ne pas créer de dépendance
// circulaire (aucun module ne doit importer main.js, voir ARCHITECTURE.md §4).

import * as audio from "./audio.js";
import * as net from "./net.js";
import * as debugOverlay from "./debug.js";
import * as share from "./share.js";
import * as tutorial from "./tutorial.js";

let deps = null;

// Format « 11 octobre » pour la date de fin du concours (même recette que
// dateFormatter dans hud.js, dupliquée — les deux fichiers ne s'importent pas).
const dateFmtFin = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long" });

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
// Même lien, deux emplacements : le CTA flottant (menu) et l'action principale
// de la carte de fin. C'est toujours config.js qui fait foi (lienEP).
const endCta = document.getElementById("end-cta");
const shareButton = document.getElementById("share-button");
const fanNote = document.getElementById("fan-note");
const nowPlaying = document.getElementById("now-playing");
const contestDeadline = document.getElementById("contest-deadline");
const runsCount = document.getElementById("runs-count");
// Pop-up de verrou depuis le bas (remplace l'ancienne note statique sous
// REJOUER et le lien « Suis PMC » — voir syncVerrouRejeu).
const unlockSheet = document.getElementById("unlock-sheet");
const unlockSheetVeil = document.getElementById("unlock-sheet-veil");
const unlockSheetText = document.getElementById("unlock-sheet-text");
const unlockSheetCta = document.getElementById("unlock-sheet-cta");
const unlockSheetCtaLabel = document.getElementById("unlock-sheet-cta-label");
const unlockSheetClose = document.getElementById("unlock-sheet-close");

// --- Verrou de rejeu (19 août 2026) --------------------------------------
// Version retenue du « mur » demandé par l'artiste : il voulait mettre la
// partie en pause à 50 000 points pour forcer un passage sur le lien du
// morceau. Deux problèmes rédhibitoires à cet endroit-là — le seuil n'était
// quasiment jamais atteignable (maximum théorique 61 400), et quitter la page
// en pleine course sur mobile fait perdre le run (onglet rechargé, ou morceau
// rembobiné au-delà de pauseDeriveMax). Le mur est donc posé ICI, sur l'écran
// de fin : il n'y a plus de partie à casser, et c'est déjà une pause naturelle.
// Mémorisé une fois pour toutes : on ne redemande pas à chaque game over.
const CLE_MORCEAU_OUVERT = "morceauOuvert";
// Second verrou doux (20 août 2026) : après 3 parties, REJOUER demande de
// suivre PMC sur Spotify — même mécanique (clic = levée, mémorisé à vie).
const CLE_PMC_SUIVI = "pmcSuivi";
const CLE_PARTIES = "partiesJouees";
const SEUIL_SUIVRE = 3;

function morceauDejaOuvert() {
  try { return localStorage.getItem(CLE_MORCEAU_OUVERT) === "1"; } catch (e) { return true; }
}

// Boost fan (+10 % de score, voir main.js) : la même info que le verrou,
// exposée à la boucle de jeu. Mise en cache — lue à chaque étoile ramassée,
// pas question de taper localStorage dans la boucle.
let fanCache = morceauDejaOuvert();
export function estFan() { return fanCache; }

function pmcDejaSuivi() {
  try { return localStorage.getItem(CLE_PMC_SUIVI) === "1"; } catch (e) { return true; }
}

function partiesJouees() {
  try { return Number(localStorage.getItem(CLE_PARTIES)) || 0; } catch (e) { return 0; }
}

function marquerMorceauOuvert() {
  try { localStorage.setItem(CLE_MORCEAU_OUVERT, "1"); } catch (e) { /* navigation privée : on n'insiste pas */ }
  fanCache = true;
  fanNote.classList.add("hidden"); // la promesse est tenue, plus rien à annoncer
  syncVerrouRejeu();
}

function marquerPmcSuivi() {
  try { localStorage.setItem(CLE_PMC_SUIVI, "1"); } catch (e) { /* idem */ }
  syncVerrouRejeu();
}

// ⚠️ Le verrou se lève au CLIC sur le lien, pas à un retour effectif sur la
// page : sur iOS le lien s'ouvre dans un autre onglet et rien ne garantit
// qu'on repasse par ici. Le lier à une preuve de lecture enfermerait le joueur
// dans un écran sans issue — ce qui coûterait bien plus que le clic gagné.
//
// ⚠️ Présentation revue le 20 août 2026 (« c'est quand les gens cliquent sur
// Rejouer que tu fais afficher ça en pop-up à partir du bas ») : REJOUER
// n'est plus disabled — il reste cliquable, et si un verrou est actif le clic
// ouvre le panneau #unlock-sheet au lieu de relancer. La note statique sous
// le bouton et le lien « Suis PMC » inline ont disparu avec ce changement.
// `verrouActif` : null (libre), "morceau" ou "suivre".
let verrouActif = null;

function syncVerrouRejeu() {
  const verrouMorceau = !morceauDejaOuvert();
  // Le verrou « suivre » n'arrive qu'APRÈS le verrou morceau (jamais les deux
  // en même temps) et seulement à partir de la 3e partie.
  const verrouSuivre = !verrouMorceau && partiesJouees() >= SEUIL_SUIVRE && !pmcDejaSuivi();
  verrouActif = verrouMorceau ? "morceau" : verrouSuivre ? "suivre" : null;
  replayButton.classList.toggle("locked", verrouActif !== null);
  if (!verrouActif) closeUnlockSheet();
}

function openUnlockSheet() {
  if (verrouActif === "suivre") {
    unlockSheetText.textContent = "Encore une chose : suis PMC sur Spotify pour débloquer une nouvelle course.";
    unlockSheetCtaLabel.textContent = "SUIVRE PMC SUR SPOTIFY";
    unlockSheetCta.href = window.CONFIG.lienSuivre || window.CONFIG.lienEP;
  } else {
    unlockSheetText.textContent = "Ajoute le morceau pour débloquer une nouvelle course — et gagne +10 % de score sur toutes tes courses.";
    unlockSheetCtaLabel.textContent = "AJOUTER LE MORCEAU";
    unlockSheetCta.href = window.CONFIG.lienEP;
  }
  unlockSheet.classList.add("visible");
  unlockSheet.setAttribute("aria-hidden", "false");
}

function closeUnlockSheet() {
  unlockSheet.classList.remove("visible");
  unlockSheet.setAttribute("aria-hidden", "true");
}

export function showOverlay() {
  overlay.classList.add("visible");
  syncEqLoop();
}

export function hideOverlay() {
  overlay.classList.remove("visible");
  // 🐛 Sans cet appel, REJOUER depuis l'écran de fin (qui ne change PAS
  // currentView, il ne fait que masquer l'overlay) laissait la boucle rAF de
  // l'equalizer tourner pendant TOUTE la course suivante — getEqLevels +
  // écritures de style chaque frame sur des barres invisibles. Trouvé à la
  // revue de code du 21 août 2026 ; la boucle est désormais conditionnée à
  // « vue de fin ET overlay visible ».
  syncEqLoop();
}

// Le menu monte en fondu sur la scène déjà dessinée plutôt que sur du noir :
// on laisse passer une frame pour que la route soit peinte derrière lui.
export function showOverlayOnLoad() {
  requestAnimationFrame(() => requestAnimationFrame(showOverlay));
}

// --- Accueil en 2 vues : onboarding (pseudo → jouer) → décompte → écran ---
// de fin. Une seule "vue" active à la fois dans #overlay, et à l'intérieur
// de l'onboarding une seule "étape" à la fois. L'étape "inclinaison" a été
// retirée avec le gyroscope (voir input.js) — le tutoriel du contrôle
// tactile se fait maintenant pendant le tutoriel interactif (runTutorial()).
const onboardingEl = document.getElementById("onboarding");
const countdownEl = document.getElementById("countdown");
const endScreenEl = document.getElementById("end-screen");
const countdownNum = document.getElementById("countdown-num");
const countdownCaption = document.getElementById("countdown-caption");
const skipCountdownBtn = document.getElementById("skip-countdown");

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
// ⚠️ Plus affiché sur l'écran de fin depuis le 12 août 2026 : le lien y est
// devenu l'action PRINCIPALE, dans la carte elle-même (#end-cta), donc le CTA
// flottant en bas d'écran ferait doublon avec lui.
function refreshCtaVisibility() {
  const onPlayStep = currentView === "onboarding" && stepOrder[stepIndex] === "play";
  ctaLink.style.display = onPlayStep ? "" : "none";
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

// --- Equalizer de l'écran de fin (20 août 2026) ---------------------------
// « Un égaliseur dynamique qui marche par rapport à la musique [...] même
// modèle que le Dynamic Island : les basses à gauche, les aigus à droite. »
// Les barres du bandeau « Tu écoutes » suivent le VRAI spectre du morceau
// (audio.getEqLevels, AnalyserNode en dérivation de la sortie) via une boucle
// rAF qui ne tourne QUE sur la vue de fin. Tant qu'aucune donnée n'arrive
// (contexte audio en panne), la classe .idle laisse l'ancienne animation CSS
// faire illusion — le vrai spectre la retire dès qu'il prend la main.
const eqEl = nowPlaying.querySelector(".eq");
const eqBars = Array.from(eqEl.children);
let eqRafId = 0;

function eqTick() {
  eqRafId = requestAnimationFrame(eqTick);
  const levels = audio.getEqLevels(eqBars.length);
  if (!levels) {
    eqEl.classList.add("idle");
    for (const bar of eqBars) bar.style.transform = "";
    return;
  }
  eqEl.classList.remove("idle");
  for (let i = 0; i < eqBars.length; i++) {
    // Plancher à 0,12 : une barre à zéro disparaît et l'ensemble lit
    // « cassé » plutôt que « silence dans cette bande ».
    eqBars[i].style.transform = `scaleY(${Math.max(0.12, levels[i]).toFixed(3)})`;
  }
}

function syncEqLoop() {
  const actif = currentView === "end" && overlay.classList.contains("visible");
  if (actif && !eqRafId) {
    eqTick();
  } else if (!actif && eqRafId) {
    cancelAnimationFrame(eqRafId);
    eqRafId = 0;
    eqEl.classList.add("idle");
    for (const bar of eqBars) bar.style.transform = "";
  }
}

function setView(view) {
  currentView = view;
  syncEqLoop();
  onboardingEl.classList.toggle("active", view === "onboarding");
  countdownEl.classList.toggle("active", view === "countdown");
  endScreenEl.classList.toggle("active", view === "end");
  // Voile allégé pendant le décompte : le personnage doit rester visible
  // derrière (demandé explicitement), pas noyé sous le fond sombre standard.
  overlay.classList.toggle("countdown-view", view === "countdown");
  // Vue de fin : le titre du jeu est masqué et l'overlay devient défilable —
  // la carte (score + classement + 3 boutons) est le plus grand écran du jeu
  // et débordait du cadre sur iPhone (voir #overlay.end-view dans index.html).
  overlay.classList.toggle("end-view", view === "end");
  refreshCtaVisibility();
}

// --- Tutoriel interactif avant course --------------------------------------
// ⚠️ Remplace le compte à rebours « 20 → 1 » le 19 août 2026 (demandé : « on
// peut remplacer les 20 secondes de début avec des exemples de swipe, comme un
// jeu Mario »). La vue DOM du décompte est réutilisée telle quelle — même
// voile, même légende, même bouton « Passer l'intro » — mais le contenu est
// piloté par tutorial.js : le joueur fait VRAIMENT les gestes (l'overlay est
// déjà en pointer-events:none, donc les swipes atteignent le canvas), et
// chaque étape se valide quand le geste est fait, pas quand le temps passe.
// Le gros chiffre devient la progression (« 1/4 »).
//
// Plafond de sécurité : un joueur qui n'arrive à rien part quand même en
// course au bout de TUTO_PLAFOND_S — un tutoriel ne doit jamais être un mur.
const TUTO_PLAFOND_S = 30;
let tutoDeadline = 0;
let tutoDernierTexte = "";
// Bouton "Passer l'intro" (demandé explicitement, pour qui a déjà joué).
const SKIP_BUTTON_DELAY = 4000;
let skipButtonTimer = null;

function runTutorial() {
  setView("countdown");
  tutorial.demarrer();
  tutoDeadline = performance.now() + TUTO_PLAFOND_S * 1000;
  tutoDernierTexte = "";
  countdownCaption.classList.remove("hidden");
  skipCountdownBtn.classList.remove("visible");
  clearTimeout(skipButtonTimer);
  skipButtonTimer = setTimeout(() => skipCountdownBtn.classList.add("visible"), SKIP_BUTTON_DELAY);
}

// Appelée à chaque frame par main.js (comme syncLoadingUi) : reflète l'état du
// tutoriel dans le DOM du décompte, et déclenche la course quand il est fini.
// ⚠️ Transitions revues le 20 août 2026 (« revois toutes les transitions entre
// les phrases ») : le texte changeait d'un coup, sec. Maintenant chaque
// changement de consigne passe par un fondu sortie → remplacement → fondu
// entrée (transition CSS 0,2 s de #countdown-caption), et le « 1/4 » rejoue
// une petite animation d'échelle à chaque changement d'étape (.step-pop).
let captionSwapTimer = null;

export function syncTutorialUi() {
  if (!tutorial.estActif()) return;

  if (tutorial.estFini() || performance.now() >= tutoDeadline) {
    tutorial.arreter();
    beginRun();
    return;
  }

  const a = tutorial.affichage();
  if (!a) return;
  const num = `${a.index}/${a.total}`;
  if (num !== countdownNum.textContent) {
    countdownNum.textContent = num;
    // Retirer puis reposer la classe (avec un reflow entre les deux) rejoue
    // l'animation CSS à chaque changement — technique standard.
    countdownNum.classList.remove("step-pop");
    void countdownNum.offsetWidth;
    countdownNum.classList.add("step-pop");
  }
  if (a.texte !== tutoDernierTexte) {
    tutoDernierTexte = a.texte;
    clearTimeout(captionSwapTimer);
    countdownCaption.classList.add("hidden");
    // Le remplacement attend la fin du fondu de sortie ; si une autre consigne
    // arrive entre-temps, le timer est remplacé et c'est la dernière qui gagne.
    captionSwapTimer = setTimeout(() => {
      countdownCaption.textContent = a.texte;
      countdownCaption.style.color = a.couleur;
      countdownCaption.classList.remove("hidden");
    }, 200);
  }
}

// Sur clic : coupe le tutoriel en cours et enchaîne directement sur la course.
function skipCountdown() {
  if (!tutorial.estActif()) return; // déjà fini ou pas démarré
  tutorial.arreter();
  beginRun();
}

function beginRun() {
  clearTimeout(skipButtonTimer);
  hideOverlay();
  showPauseButton();
  clearTimeout(skipButtonTimer);
  skipCountdownBtn.classList.remove("visible");
  // audio.play() N'est PLUS appelé ici — le morceau tourne depuis nextStep()
  // (étape pseudo → étape volume), on ne veut surtout pas le relancer et
  // perdre la position courante (le score dépend de la position musicale).
  // Le VRAI démarrage de la course (startRequested/startRequestedAt) reste
  // décidé par main.js — c'est lui qui pilote la boucle de jeu.
  deps.requestGameStart();
}

function startGame() {
  if (deps.isGameStartRequested() || tutorial.estActif()) return;
  // audio.unlock() a déjà eu lieu au nextStep() de l'étape pseudo. Idempotent
  // de toute façon (armed = true dès le 1er appel), donc on ne re-tente pas
  // pour éviter la moindre confusion.
  //
  // ⚠️ Tutoriel sauté pour qui a DÉJÀ joué sur ce téléphone (21 août 2026,
  // demandé : « ceux qui se sont déjà connectés avec leur téléphone peuvent
  // pas avoir le tuto de début »). Le tutoriel apprend le pont, les swipes et
  // le combo — une fois su, c'est 4 étapes à refaire avant CHAQUE course,
  // exactement le frein qu'on veut retirer à quelqu'un qui enchaîne les
  // parties pour battre son score.
  //
  // Pas de nouvelle clé : `partiesJouees` (incrémenté à chaque écran de fin,
  // voir renderEndScreen) répond déjà exactement à la question posée — il
  // vaut 0 tant qu'aucune course n'est allée à son terme. Conséquence voulue :
  // quelqu'un qui abandonne sa toute première course avant la fin la revoit,
  // et le repli de partiesJouees() en navigation privée (0) redonne le
  // tutoriel plutôt que de le retirer à un vrai débutant.
  if (partiesJouees() > 0) {
    beginRun();
    return;
  }
  runTutorial();
}

// --- Progression du chargement --------------------------------------------
// Poussée dans la barre à chaque frame tant que le morceau n'est pas prêt. Le
// bouton JOUER reste désactivé jusqu'à 100 % : on ne peut de toute façon rien
// lancer avant, autant que ça se voie.
let loadingDone = false;

export function syncLoadingUi() {
  if (loadingDone) return;

  // Échec de chargement du morceau (réseau coupé, fichier absent, décodage
  // impossible) : `progress` n'atteindra jamais 1, donc sans cette sortie le
  // bouton JOUER restait désactivé indéfiniment derrière une barre figée,
  // sans un mot d'explication. On débloque la partie — elle sait tourner sans
  // le morceau (horloge de secours, main.js, qui affiche déjà son propre
  // bandeau en jeu) — et on dit ce qui se passe. Même principe que partout
  // ailleurs dans ce projet : un jeu muet reste jouable, un jeu figé non.
  if (audio.getLoadError()) {
    loadingDone = true;
    loadingBlock.classList.add("failed"); // pas `done` : ça masque le bloc, or on a justement quelque chose à dire
    loadingLabel.textContent = "Son indisponible, le jeu reste jouable";
    playButton.disabled = false;
    return;
  }

  // `isReadyToStart()` plutôt que la seule progression : le téléchargement
  // peut être fini (90 %) avec un décodage repoussé au geste — il n'y a alors
  // plus rien à attendre, et compter sur `getProgress()` seul laissait la
  // barre plantée à 90 % indéfiniment (voir audio.js).
  const p = audio.isReadyToStart() ? 1 : audio.getProgress();
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

function syncMuteIcon() {
  const coupe = audio.getVolume() <= 0;
  muteButton.classList.toggle("muted", coupe);
  muteButton.textContent = coupe ? "✕" : "♪";
}

function setSoundPanelOpen(open) {
  soundPanel.hidden = !open;
  muteButton.setAttribute("aria-expanded", String(open));
}

// --- Menu pause -----------------------------------------------------------
// Demandé explicitement : « mets un menu pause avec le volume ». Bouton
// dédié (visible uniquement en cours de course — showPauseButton()/
// hidePauseButton() sont appelées depuis main.js : beginRun()/restartGame()/
// endGame()/beginFinish()) plutôt qu'un tap sur l'écran : même règle que
// partout ailleurs dans le jeu, une action = un bouton visible.
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

export function showPauseButton() {
  pauseButton.hidden = false;
  soundControl.hidden = true;
  setSoundPanelOpen(false); // referme le panneau volume s'il traînait ouvert
}
export function hidePauseButton() {
  pauseButton.hidden = true;
  soundControl.hidden = false;
  // Le bouton disparaît (fin de partie, séquence d'arrivée...) : referme le
  // panneau s'il était resté ouvert, sinon la pause resterait active pour
  // toujours (plus aucun bouton "Reprendre" à l'écran pour en sortir).
  if (deps.isManuallyPaused()) closePauseMenu();
}

function openPauseMenu() {
  if (deps.isManuallyPaused() || pauseButton.hidden) return;
  deps.openPause(); // manualPaused = true côté main.js + applyPauseState()
  pauseVolumeSlider.value = volumeSlider.value; // reflète le volume courant à l'ouverture
  setSoundPanelOpen(false); // évite les deux panneaux ouverts en même temps
  pauseScreen.classList.add("visible");
}

function closePauseMenu() {
  if (!deps.isManuallyPaused()) return;
  deps.closePause(); // manualPaused = false côté main.js + applyPauseState()
  pauseScreen.classList.remove("visible");
}

// --- Pseudo Instagram (étape 7) -----------------------------------------
// Identifiant du classement (jamais un email, décision verrouillée). Purement
// facultatif : la partie reste jouable sans, seul l'envoi du score au
// backend est sauté (voir endGame() dans main.js). Persisté en localStorage
// pour ne pas le retaper à chaque partie.
// Deux champs séparés depuis le playtest : « il faut demander pseudo ET
// insta, et on affiche à la fin le pseudo seulement, parce que l'Instagram
// c'est que pour moi — sinon tout le monde va voir l'insta du gagnant ».
//   - pseudo : OBLIGATOIRE, c'est la seule chose publiée au classement.
//   - insta  : optionnel à l'affichage, sert uniquement à l'artiste pour
//              contacter le gagnant. Il n'est jamais affiché, et n'est même
//              pas LISIBLE par le jeu : le classement passe par une vue
//              publique qui ne l'expose pas (voir supabase-schema.sql / net.js).
const pseudoInput = document.getElementById("pseudo-input");
const instaInput = document.getElementById("insta-input");
const pseudoNext = document.getElementById("pseudo-next");

function cleanPseudo() { return pseudoInput.value.trim(); }
function cleanInsta() { return instaInput.value.trim().replace(/^@+/, ""); }

export function getPseudo() { return cleanPseudo(); }
export function getInsta() { return cleanInsta(); }

function syncPseudoStep() {
  // Les DEUX champs sont désormais obligatoires (retour de terrain : un
  // joueur a rempli son pseudo mais pas son Insta — PMC n'a alors aucun
  // moyen de le retrouver pour le contacter s'il gagne, un pseudo affiché
  // seul au classement ne suffit pas). On bloque l'étape plutôt que de
  // laisser jouer puis de découvrir un score orphelin au moment de remettre
  // le lot.
  pseudoNext.disabled = cleanPseudo().length === 0 || cleanInsta().length === 0;
}

// --- Classement (étape 7) --------------------------------------------------
// Demandé explicitement au playtest ("j'espère qu'il y a un tableau avec les
// classements à la fin"). Masqué tant qu'il n'y a rien à montrer — backend
// pas encore configuré (CONFIG.apiScores vide, voir net.js) ou requête
// vide/en échec : jamais bloquant, jamais d'erreur visible, le pire cas est
// un bloc absent comme avant.
export function renderLeaderboard(scores) {
  leaderboardList.innerHTML = "";
  if (!scores.length) {
    // Table réellement vide (premier joueur du concours) : rien à montrer, on
    // masque comme avant. Mais si la requête a ÉCHOUÉ, se taire était le vrai
    // problème — « le classement n'apparaît pas chez moi » était
    // indistinguable d'un classement vide. On le dit, et on donne la raison
    // technique en mode ?debug (sur téléphone, c'est la seule console qu'on
    // ait). Voir net.getLastError().
    const raison = net.getLastError();
    if (!raison) {
      leaderboard.classList.add("hidden");
      return;
    }
    const li = document.createElement("li");
    li.className = "board-message";
    li.textContent = debugOverlay.isEnabled()
      ? `Classement indisponible — ${raison}`
      : "Classement indisponible pour le moment";
    leaderboardList.appendChild(li);
    leaderboard.classList.remove("hidden");
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
    if (pseudoJoueur && displayPseudo === pseudoJoueur && s.score === deps.game.score) {
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
    // ⚠️ Borné au contenu réel, SANS padding artificiel (revu le 20 août 2026,
    // capture à l'appui) : l'ancien code ajoutait du padding-bottom pour
    // rendre le centrage atteignable quand le joueur est en fin de classement
    // — mais la liste est en box-sizing par défaut (content-box), donc ce
    // padding s'AJOUTAIT à sa hauteur visible : un grand blanc apparaissait
    // sous la dernière ligne, dans la carte. Une ligne parmi les dernières
    // s'affiche donc près du bas de la fenêtre plutôt qu'au milieu — elle
    // reste surlignée et visible, c'est ce qui compte.
    const maxScroll = leaderboardList.scrollHeight - leaderboardList.clientHeight;
    leaderboardList.scrollTop = Math.min(Math.max(0, centre), Math.max(0, maxScroll));
  });
}

// Fin de partie : le menu revient en fondu, réutilisé tel quel — le titre
// devient le résultat, le bouton principal devient « Rejouer ». Un léger
// retard laisse la scène se figer à l'écran avant que l'overlay ne monte,
// sinon la transition écrase l'instant où on comprend ce qui vient d'arriver.
// L'envoi du score et la relecture du classement restent décidés par
// main.js (endGame()) : ce module ne fait qu'afficher le résultat.
export function showEndScreen(reason) {
  const finished = reason === "finished";
  // « Votre score » plutôt que « Game Over » (20 août 2026, demandé) : le
  // bandeau annonce ce que la carte montre, le constat d'échec n'apportait
  // rien — un parcours terminé garde son bandeau de victoire.
  endEyebrow.textContent = finished ? "Parcours terminé" : "Votre score";
  scoreNum.textContent = `${deps.game.score}`;

  // Compteur de parties : nourrit le verrou « suivre PMC » (3 parties).
  try { localStorage.setItem(CLE_PARTIES, String(partiesJouees() + 1)); } catch (e) { /* rien */ }

  // Boost fan : annoncé tant que le morceau n'a pas été ajouté — le moment le
  // plus lisible, c'est justement la fin de la première partie (« pour jouer,
  // si tu ajoutes le morceau, tu gagnes un boost fan »).
  fanNote.classList.toggle("hidden", estFan());

  // Preuve sociale : total des courses jouées (toutes personnes confondues).
  // Fire-and-forget des deux côtés — la ligne n'apparaît que si le compte est
  // arrivé (voir net.getRunsCount, null si table absente/réseau coupé).
  runsCount.classList.add("hidden");
  net.getRunsCount().then((total) => {
    if (total === null || total < 20) return; // sous 20 courses, un compteur fait vide plutôt que preuve
    runsCount.textContent = `${total.toLocaleString("fr-FR")} courses déjà jouées — à toi de faire mieux`;
    runsCount.classList.remove("hidden");
  });
  // (L'ancienne bascule `cta-minimal` du CTA flottant a disparu avec lui :
  // sur l'écran de fin, le lien est maintenant le bouton principal de la
  // carte, aussi bien après un game over qu'après un parcours terminé.)
  // La bascule son n'est plus masquée ici : elle reste affichée sur TOUS les
  // écrans (demandé explicitement). Le morceau continue de tourner sur
  // l'écran de fin — c'est justement là qu'on peut vouloir le couper.
  leaderboard.classList.add("hidden"); // masqué le temps de la requête, évite d'afficher le classement de la partie précédente
  syncVerrouRejeu();

  // Image de partage fabriquée MAINTENANT, pas au clic : navigator.share()
  // doit être appelé dans la pile d'appel du geste, et toute opération
  // asynchrone avant lui (dont canvas.toBlob) fait perdre le geste sur iOS.
  // Voir l'en-tête de share.js.
  shareButton.disabled = true;
  shareButton.textContent = "PRÉPARATION…";
  share.prepare({
    score: deps.game.score,
    pseudo: getPseudo(),
    etoiles: deps.game.stars,
    etoilesTotal: deps.etoilesTotal,
    meilleurCombo: deps.game.bestCombo,
    termine: finished,
  }).then(() => {
    shareButton.disabled = !share.estPret();
    shareButton.textContent = share.estPret() ? "PARTAGER MON SCORE" : "PARTAGE INDISPONIBLE";
  }).catch(() => {
    shareButton.disabled = true;
    shareButton.textContent = "PARTAGE INDISPONIBLE";
  });

  setTimeout(() => { setView("end"); showOverlay(); }, 600);
}

// deps = { game, requestGameStart, isGameStartRequested, restartGame,
//          openPause, closePause, isManuallyPaused }
// Voir l'en-tête du fichier pour le rôle exact de chaque callback.
export function init(d) {
  deps = d;

  ctaLink.href = window.CONFIG.lienEP;
  endCta.href = window.CONFIG.lienEP;
  nowPlaying.href = window.CONFIG.lienEP;

  // Panneau de verrou : le CTA lève le verrou COURANT (morceau ou suivre) au
  // clic — même règle que partout, le geste suffit, pas de preuve de lecture.
  unlockSheetCta.addEventListener("click", () => {
    if (verrouActif === "suivre") marquerPmcSuivi();
    else marquerMorceauOuvert();
    closeUnlockSheet();
  });
  unlockSheetClose.addEventListener("click", closeUnlockSheet);
  unlockSheetVeil.addEventListener("click", closeUnlockSheet);

  // Date de fin du concours, sous le classement : « on a une semaine pour
  // jouer » doit se lire sur l'écran, pas se deviner.
  const fermeture = new Date(window.CONFIG.dateFermeture);
  if (!Number.isNaN(fermeture.getTime())) {
    contestDeadline.textContent = `Concours ouvert jusqu'au ${dateFmtFin.format(fermeture)}`;
  }

  audio.setVolume(Number(volumeSlider.value) / 100);
  syncMuteIcon();

  pseudoInput.value = localStorage.getItem("pseudoJoueur") || "";
  instaInput.value = localStorage.getItem("pseudoInsta") || "";
  syncPseudoStep();

  showStep(0);

  document.querySelectorAll(".menu-step [data-next]").forEach((btn) => {
    btn.addEventListener("click", nextStep);
  });

  playButton.addEventListener("click", startGame);
  replayButton.addEventListener("click", () => {
    if (verrouActif) { openUnlockSheet(); return; }
    deps.restartGame();
  });

  // Le lien du morceau lève le verrou de rejeu (et donne le boost fan), sur
  // TOUS les emplacements — carte de fin, CTA flottant du menu, bandeau
  // « Tu écoutes » : le geste compte, d'où qu'il vienne.
  [endCta, ctaLink, nowPlaying].forEach((lien) => lien.addEventListener("click", marquerMorceauOuvert));

  shareButton.addEventListener("click", (e) => {
    e.stopPropagation();
    share.partager(); // synchrone : indispensable pour que le geste iOS tienne
  });
  syncVerrouRejeu();
  skipCountdownBtn.addEventListener("click", skipCountdown);

  // Entrée/espace au clavier : confort de test sur desktop uniquement.
  window.addEventListener("keydown", (e) => {
    if (e.code !== "Enter" && e.code !== "Space") return;
    if (!overlay.classList.contains("visible")) return;
    // Même règle qu'au clic : un verrou actif ouvre le panneau au lieu de
    // relancer (avant ce correctif, Entrée contournait le verrou de rejeu).
    if (currentView === "end") {
      if (verrouActif) openUnlockSheet();
      else deps.restartGame();
      return;
    }
    if (currentView === "onboarding" && stepOrder[stepIndex] === "play" && !playButton.disabled) {
      startGame();
    }
  });

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
  muteButton.addEventListener("click", (e) => {
    e.stopPropagation();
    setSoundPanelOpen(soundPanel.hidden);
  });
  // Le glissement tactile de secours écoute window : sans ces gardes, toucher
  // la bascule son dirigerait aussi le personnage.
  ["pointerdown", "pointerup", "touchstart", "touchend"].forEach((type) => {
    muteButton.addEventListener(type, (e) => e.stopPropagation());
  });

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
    deps.restartGame();
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

  // Le glissement tactile sur la bande de pilotage (#steer-control) et sur le
  // bouton saut gère lui-même sa propagation dans input.js — rien à faire ici.
}
