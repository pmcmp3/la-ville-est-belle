// input.js — Contrôles au geste (swipe), façon Temple Run / Subway Surfers.
//
// Refonte demandée au playtest : « on oublie le slider présent en bas et on
// oublie le bouton de saut — pour changer de voie, il faut swiper à gauche ou
// à droite ». Le jeu se joue **à un pouce**, écran tenu comme une Game Boy
// verticale, sans aucun contrôle qui occupe le bas de l'écran.
//
//   swipe gauche  → une voie à gauche
//   swipe droite  → une voie à droite
//   swipe haut    → saut (étoiles aériennes, toits de voitures)
//
// Un swipe = UN cran, verrouillé strictement : un seul cran par CONTACT
// (touchstart → touchend), quelle que soit la distance/vitesse parcourue
// ensuite par le doigt. Traverser de la voie 2 à la voie 4 demande donc deux
// contacts (lever puis reposer le doigt), pas un swipe long. Playtest iPhone :
// « si je swipe très fort, je peux traverser toutes les voies » — l'ancienne
// version réarmait l'origine dès qu'un cran était franchi, ce qui permettait
// d'en enchaîner plusieurs dans le même contact. Le geste reste reconnu dès
// que le seuil est franchi (pas d'attente du lever de doigt), pour la
// réactivité d'un runner mobile — mais une fois consommé, plus rien ne se
// passe jusqu'au prochain contact.
//
// Les intentions sont exposées en ÉVÉNEMENTS consommables (et non en axe
// continu comme l'ancienne bande de pilotage) : main.js appelle
// consumeLaneMove() / consumeJumpPress() une fois par pas de simulation.
//
// Clavier (confort de test desktop uniquement) : flèches/QD = un cran,
// espace/flèche haut = saut.

const SWIPE_THRESHOLD = 34;   // px parcourus avant que le geste compte
const AXIS_DOMINANCE = 1.2;   // un axe doit dépasser l'autre de 20 % pour être choisi

// File d'attente des changements de voie demandés (-1 / +1). Une file plutôt
// qu'un simple booléen : deux swipes rapides dans la même frame doivent tous
// les deux compter, sinon un enchaînement vif « en perd un » et le joueur a
// l'impression que le jeu ne répond pas.
const laneQueue = [];
let jumpPressed = false;

function pushLane(dir) {
  // Plafonné : au-delà de 2 crans en attente, c'est du martèlement, pas une
  // intention — on éviterait sinon que le personnage continue de glisser
  // plusieurs voies après que le joueur a lâché.
  if (laneQueue.length < 2) laneQueue.push(dir);
}

function triggerJump() {
  jumpPressed = true;
}

export function consumeLaneMove() {
  return laneQueue.length ? laneQueue.shift() : 0;
}

export function consumeJumpPress() {
  if (jumpPressed) {
    jumpPressed = false;
    return true;
  }
  return false;
}

// --- Gestes tactiles ------------------------------------------------------
// Écoutés sur la fenêtre entière : le jeu n'a plus AUCUN contrôle à l'écran,
// le geste doit donc marcher où que soit le pouce. Les éléments d'interface
// superposés (bascule son, panneau de volume, boutons des écrans hors-jeu)
// arrêtent eux-mêmes la propagation — patron déjà en place dans main.js.

let activeId = null;
let originX = 0;
let originY = 0;
// Vrai dès qu'un cran (voie ou saut) a été reconnu pour le contact en cours —
// verrouille le reste du geste jusqu'au prochain touchstart/mousedown.
let gestureConsumed = false;

// Un geste qui démarre sur un écran hors-jeu (menu, écran de fin) ne doit pas
// piloter la course : faire défiler le classement du bout du doigt mettrait
// sinon le personnage dans une voie avant même de rejouer. Le test marche
// aussi pour le décompte, qui est pourtant un overlay : il est en
// `pointer-events: none` (voir index.html), donc la cible d'un toucher y est
// le canvas, pas l'overlay — et le tutoriel du décompte reste jouable.
const overlayEl = document.getElementById("overlay");
function onOverlay(target) {
  return overlayEl && target instanceof Node && overlayEl.contains(target);
}

function beginGesture(x, y, id) {
  activeId = id;
  originX = x;
  originY = y;
  gestureConsumed = false;
}

// Renvoie true si un geste a été reconnu (et donc le contact verrouillé).
function trackGesture(x, y) {
  if (gestureConsumed) return false; // un cran déjà pris pour ce contact : plus rien jusqu'au prochain touchstart

  const dx = x - originX;
  const dy = y - originY;
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);

  if (adx >= SWIPE_THRESHOLD && adx > ady * AXIS_DOMINANCE) {
    pushLane(dx > 0 ? 1 : -1);
    gestureConsumed = true;
    return true;
  }
  if (ady >= SWIPE_THRESHOLD && dy < 0 && ady > adx * AXIS_DOMINANCE) {
    triggerJump();
    gestureConsumed = true;
    return true;
  }
  // Swipe vers le bas : volontairement sans effet (pas de "glissade" dans ce
  // jeu). On réarme quand même l'origine verticale pour ne pas qu'un
  // repositionnement du pouce vers le bas empêche le prochain saut.
  if (ady >= SWIPE_THRESHOLD && dy > 0) {
    originY = y;
  }
  return false;
}

window.addEventListener("touchstart", (e) => {
  if (activeId !== null) return;
  if (onOverlay(e.target)) return;
  const t = e.changedTouches[0];
  beginGesture(t.clientX, t.clientY, t.identifier);
}, { passive: true });

window.addEventListener("touchmove", (e) => {
  if (activeId === null) return;
  for (let i = 0; i < e.changedTouches.length; i++) {
    const t = e.changedTouches[i];
    if (t.identifier !== activeId) continue;
    trackGesture(t.clientX, t.clientY);
  }
}, { passive: true });

function endTouch(e) {
  for (let i = 0; i < e.changedTouches.length; i++) {
    if (e.changedTouches[i].identifier === activeId) activeId = null;
  }
}
window.addEventListener("touchend", endTouch, { passive: true });
window.addEventListener("touchcancel", endTouch, { passive: true });

// Souris : même geste, pour tester sur desktop sans écran tactile.
window.addEventListener("mousedown", (e) => {
  if (onOverlay(e.target)) return;
  beginGesture(e.clientX, e.clientY, "mouse");
});
window.addEventListener("mousemove", (e) => {
  if (activeId !== "mouse") return;
  trackGesture(e.clientX, e.clientY);
});
window.addEventListener("mouseup", () => { if (activeId === "mouse") activeId = null; });

// --- Clavier (dev) --------------------------------------------------------

window.addEventListener("keydown", (e) => {
  if (e.repeat) return;
  if (e.code === "ArrowLeft" || e.code === "KeyA") pushLane(-1);
  else if (e.code === "ArrowRight" || e.code === "KeyD") pushLane(1);
  else if (e.code === "Space" || e.code === "ArrowUp") triggerJump();
});
