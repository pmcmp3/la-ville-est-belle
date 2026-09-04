// input.js — « J'ai un pote » se joue d'UN pouce, sans changement de voie :
//   tap court  → saut
//   tap long   → saut plus haut et plus long (tant que le doigt reste posé,
//                la gravité est allégée — même recette que Mario, voir
//                jumpPhysics dans main.js)
// Le saut part au TOUCHER (pas au relâcher), pour la réactivité ; la durée du
// maintien module ce qui suit. Clavier : espace / flèche haut.

let jumpPressed = false;
let holding = false;

export function consumeJumpPress() {
  if (jumpPressed) { jumpPressed = false; return true; }
  return false;
}

export function isHolding() { return holding; }

const overlayEl = document.getElementById("overlay");
function onOverlay(target) {
  return overlayEl && target instanceof Node && overlayEl.contains(target);
}

function press(target) {
  if (onOverlay(target)) return;
  jumpPressed = true;
  holding = true;
}
function release() { holding = false; }

window.addEventListener("touchstart", (e) => press(e.target), { passive: true });
window.addEventListener("touchend", release, { passive: true });
window.addEventListener("touchcancel", release, { passive: true });
window.addEventListener("mousedown", (e) => press(e.target));
window.addEventListener("mouseup", release);

export function isTypingTarget(target) {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
}

window.addEventListener("keydown", (e) => {
  if (e.repeat) return;
  if (isTypingTarget(e.target)) return;
  if (e.code === "Space" || e.code === "ArrowUp") { jumpPressed = true; holding = true; }
});
window.addEventListener("keyup", (e) => {
  if (e.code === "Space" || e.code === "ArrowUp") holding = false;
});
