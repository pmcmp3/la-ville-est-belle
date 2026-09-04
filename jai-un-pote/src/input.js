// input.js — Deux gestes (refonte Crossy Road, 4 septembre 2026) :
//   swipe gauche / droite → une colonne (un cran par contact)
//   tap (toucher-relâcher sans bouger) → saut
// Le saut part au RELÂCHER : c'est ce qui permet de distinguer un tap d'un
// début de swipe (~80 ms de latence, imperceptible). Clavier : flèches/QD,
// espace / flèche haut.

const SWIPE_THRESHOLD = 28;
const laneQueue = [];
let jumpPressed = false;

export function consumeLaneMove() { return laneQueue.length ? laneQueue.shift() : 0; }
export function consumeJumpPress() { if (jumpPressed) { jumpPressed = false; return true; } return false; }
export function isHolding() { return false; }

const overlayEl = document.getElementById("overlay");
function onOverlay(target) { return overlayEl && target instanceof Node && overlayEl.contains(target); }

let activeId = null, originX = 0, originY = 0, consumed = false;

function begin(x, y, id, target) {
  if (onOverlay(target)) return;
  activeId = id; originX = x; originY = y; consumed = false;
}
function move(x, y) {
  if (activeId === null || consumed) return;
  const dx = x - originX, dy = y - originY;
  if (Math.abs(dx) >= SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy) * 1.2) {
    if (laneQueue.length < 2) laneQueue.push(dx > 0 ? 1 : -1);
    consumed = true;
  } else if (Math.abs(dy) >= SWIPE_THRESHOLD && dy < 0 && Math.abs(dy) > Math.abs(dx) * 1.2) {
    jumpPressed = true; // swipe vers le haut = saut aussi (réflexe du premier jeu)
    consumed = true;
  }
}
function end() {
  if (activeId === null) return;
  if (!consumed) jumpPressed = true; // tap
  activeId = null;
}

window.addEventListener("touchstart", (e) => { if (activeId !== null) return; const t = e.changedTouches[0]; begin(t.clientX, t.clientY, t.identifier, e.target); }, { passive: true });
window.addEventListener("touchmove", (e) => { for (const t of e.changedTouches) if (t.identifier === activeId) move(t.clientX, t.clientY); }, { passive: true });
window.addEventListener("touchend", (e) => { for (const t of e.changedTouches) if (t.identifier === activeId) end(); }, { passive: true });
window.addEventListener("touchcancel", () => { activeId = null; }, { passive: true });
window.addEventListener("mousedown", (e) => begin(e.clientX, e.clientY, "mouse", e.target));
window.addEventListener("mousemove", (e) => { if (activeId === "mouse") move(e.clientX, e.clientY); });
window.addEventListener("mouseup", () => { if (activeId === "mouse") end(); });

export function isTypingTarget(target) {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
}
window.addEventListener("keydown", (e) => {
  if (e.repeat || isTypingTarget(e.target)) return;
  if (e.code === "ArrowLeft" || e.code === "KeyA" || e.code === "KeyQ") laneQueue.push(-1);
  else if (e.code === "ArrowRight" || e.code === "KeyD") laneQueue.push(1);
  else if (e.code === "Space" || e.code === "ArrowUp") jumpPressed = true;
});
