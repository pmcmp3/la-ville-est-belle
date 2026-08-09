// debug.js — Overlay de debug, togglable avec la touche CONFIG.toucheDebug :
// FPS, position du joueur, et grille rythmique (lignes de temps/mesure) en
// surimpression sur la route, pour valider à l'œil que le calage audio
// (BPM/offset) colle bien au morceau du début à la fin.

import { clock } from "./clock.js";
import { project, getSpeed, getDistanceScrolled, ROAD_HALF_WIDTH, PLAYER_NEAR_Z } from "./road.js";

const VISIBLE_BEATS = 8; // nombre de temps affichés à l'avance sur la grille

// Activable au clavier (desktop) OU via ?debug dans l'URL — indispensable sur
// téléphone, où il n'y a pas de clavier pour appuyer sur CONFIG.toucheDebug et
// pas de console pour lire quoi que ce soit. Ex : http://192.168.1.29:5173/?debug
let enabled = new URLSearchParams(window.location.search).has("debug");

window.addEventListener("keydown", (e) => {
  if (e.key.toLowerCase() === window.CONFIG.toucheDebug.toLowerCase()) {
    enabled = !enabled;
  }
});

export function isEnabled() {
  return enabled;
}

// Lignes de temps/mesure qui descendent vers le joueur au rythme du morceau.
export function renderBeatGrid(ctx, width, height) {
  if (!enabled) return;

  const now = clock.now();
  const speed = getSpeed();
  const firstBeat = Math.ceil(clock.beatIndexAt(now));

  for (let n = firstBeat; n < firstBeat + VISIBLE_BEATS; n++) {
    const deltaT = clock.timeOfBeat(n) - now;
    const z = PLAYER_NEAR_Z + deltaT * speed;
    if (z <= 0.05) continue;

    const left = project(-ROAD_HALF_WIDTH, z, width, height);
    const right = project(ROAD_HALF_WIDTH, z, width, height);
    const isMeasure = n % 4 === 0; // début de mesure (4/4)

    ctx.strokeStyle = isMeasure ? "#ffcf5c" : "rgba(255,255,255,0.45)";
    ctx.lineWidth = isMeasure ? 3 : 1.5;
    ctx.beginPath();
    ctx.moveTo(left.x, left.y);
    ctx.lineTo(right.x, right.y);
    ctx.stroke();
  }
}

// Panneau de stats (FPS + position). `stats` = { fps, frameMs, playerX }.
export function renderStats(ctx, stats) {
  if (!enabled) return;

  const now = clock.now();
  const lines = [
    `FPS ${stats.fps.toFixed(0)}  (${stats.frameMs.toFixed(1)} ms)`,
    `x=${stats.playerX.toFixed(2)}  vitesse=${getSpeed().toFixed(1)} u/s`,
    `distance=${getDistanceScrolled().toFixed(1)} u`,
    `temps=${now.toFixed(2)}s  beat=${clock.beatIndexAt(now).toFixed(2)}`,
    // Les deux lignes qui permettent de diagnostiquer à distance le blocage
    // audio/horloge remonté au playtest iPhone : si `horloge` reste sur
    // "secours" ou si `temps` ne bouge pas, le problème est là.
    `audio=${stats.audioStatus ?? "?"}`,
    `horloge=${stats.clockSource ?? "?"}`,
    `debug: ↑+10s  F=fin  G=game over  B=bonus  O=obstacle`,
  ];

  ctx.font = "12px monospace";
  ctx.textBaseline = "top";

  const padding = 8;
  const lineHeight = 16;
  const boxWidth = 300;
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(padding, padding, boxWidth, lines.length * lineHeight + padding);

  ctx.fillStyle = "#7CFC9A";
  lines.forEach((line, i) => {
    ctx.fillText(line, padding * 2, padding + i * lineHeight + 4);
  });

  ctx.textBaseline = "alphabetic"; // remis à la valeur par défaut du canvas
}
