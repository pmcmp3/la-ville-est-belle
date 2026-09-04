// iso.js — Vue 3/4 du dessus façon Crossy Road (refonte du 4 septembre 2026,
// retour direct : « pas la fausse 3D [...] revoir pour avoir une perspective
// comme ça »). Plus de point de fuite : projection OBLIQUE à échelle
// constante, la route monte tout droit vers le haut de l'écran, chaque objet
// est un cube avec trois faces visibles (dessus clair, face avant, flanc
// droit sombre). Le décor et les obstacles partagent drawBox().
//
//   sx = centre + (u − camU)·K + h·K·SHEAR      (u = latéral, h = hauteur)
//   sy = base   − (v − camV)·K·TILT − h·K·VERT  (v = avance sur la route)
//
// La route reste tout droit (pas de diagonale comme Crossy) : un runner qui
// avance tout seul a besoin de VOIR loin devant, et en portrait c'est la
// hauteur de l'écran qui donne cette distance.

import { shade } from "./voxel.js";

export const COLS = 3;
export const COL_W = 1.25;                     // largeur d'une colonne de route
export const ROAD_HALF = (COLS * COL_W) / 2;   // 1,875
export const UNITS_ACROSS = 9;                 // unités-monde visibles en largeur
const TILT = 0.74;
const SHEAR = 0.28;
const VERT = 0.86;
const PLAYER_SCREEN_Y = 0.72;                  // fraction de la hauteur où roule le joueur
export const PLAYER_BACK_ROWS = 3.5;           // rangées visibles derrière le joueur
export const ROWS_AHEAD = 15;                  // rangées calculées devant
export const ROWS_BEHIND = 8;                  // rangées dessinées derrière la caméra (bas d'écran)

let W = 375, H = 812, K = 41.7, baseY = 585;
let camV = 0, camU = 0;

export function setViewport(width, height) {
  W = width; H = height;
  K = width / UNITS_ACROSS;
  baseY = height * PLAYER_SCREEN_Y;
}
export function setCamera(v, u = 0) { camV = v - PLAYER_BACK_ROWS; camU = u; }
export function getCamV() { return camV; }
export function scale() { return K; }
export function colU(c) { return (c - (COLS - 1) / 2) * COL_W; }

export function project(u, v, h = 0) {
  return {
    x: W / 2 + (u - camU) * K + h * K * SHEAR,
    y: baseY - (v - camV) * K * TILT - h * K * VERT,
  };
}

function poly(ctx, pts, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.fill();
}

// Cube posé au sol : empreinte (u, v) → (u+du, v+dv), hauteur h, surélevé de
// `lift`. Trois faces, de l'arrière vers l'avant.
export function drawBox(ctx, u, v, du, dv, h, color, lift = 0) {
  const A = project(u, v, lift), B = project(u + du, v, lift);
  const C = project(u + du, v + dv, lift), Dp = project(u, v + dv, lift + h);
  const A2 = project(u, v, lift + h), B2 = project(u + du, v, lift + h);
  const C2 = project(u + du, v + dv, lift + h);
  poly(ctx, [B, C, C2, B2], shade(color, -38));     // flanc droit
  poly(ctx, [A, B, B2, A2], color);                  // face avant
  poly(ctx, [A2, B2, C2, Dp], shade(color, 26));     // dessus
}

// Aplat au sol (pas de hauteur) : dalle, ombre, marquage.
export function drawFlat(ctx, u, v, du, dv, color) {
  const A = project(u, v), B = project(u + du, v), C = project(u + du, v + dv), D = project(u, v + dv);
  poly(ctx, [A, B, C, D], color);
}

export function drawShadow(ctx, u, v, ru, rv, alpha = 0.28) {
  const p = project(u, v);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, ru * K, rv * K * TILT, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// --- Sol et décor --------------------------------------------------------------
const GRASS = ["#6f8f34", "#66852f"];
const DIRT = "#9a7a4e";
const ROAD = ["#4d4945", "#524e49"];
const LINE = "#f2ead8";
const HAZE = "#f1d9b3";

function hash(n) {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

const ZONE_ROWS = 90; // blé → tournesols → vignes, par tranches de 90 rangées
function zoneAt(r) { return ["ble", "tournesol", "vigne"][Math.floor(Math.max(0, r) / ZONE_ROWS) % 3]; }
const SOIL = { ble: "#c9a648", tournesol: "#6f8c2f", vigne: "#8a6a45" };

// Une rangée = une bande de 1 unité de profondeur, sur toute la largeur.
function renderRow(ctx, r) {
  const v = r - 0.5; // la rangée r couvre [r − 0,5 ; r + 0,5[ (rows.js : floor(v + 0,5))
  const g = GRASS[r % 2];
  const soil = SOIL[zoneAt(r)];
  const half = UNITS_ACROSS / 2 + 1;
  // Champs de chaque côté, puis herbe, terre, asphalte.
  drawFlat(ctx, -half, v, half - ROAD_HALF - 0.9, 1, r % 6 < 3 ? soil : shade(soil, -10));
  drawFlat(ctx, ROAD_HALF + 0.9, v, half - ROAD_HALF - 0.9, 1, r % 6 < 3 ? soil : shade(soil, -10));
  drawFlat(ctx, -ROAD_HALF - 0.9, v, 0.9, 1, g);
  drawFlat(ctx, ROAD_HALF, v, 0.9, 1, g);
  drawFlat(ctx, -ROAD_HALF - 0.25, v, 0.25, 1, DIRT);
  drawFlat(ctx, ROAD_HALF, v, 0.25, 1, DIRT);
  drawFlat(ctx, -ROAD_HALF, v, ROAD_HALF * 2, 1, ROAD[r % 2]);
  if (r % 2 === 0) drawFlat(ctx, -0.06, v + 0.2, 0.12, 0.6, LINE);
}

// Plantes et props d'une rangée : blocs hashés, stables d'une frame à l'autre.
function renderRowProps(ctx, r) {
  const zone = zoneAt(r);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const a = hash(r * 31 + i * 7 + side * 101);
      const b = hash(r * 17 + i * 5 + side * 53);
      const u = side * (ROAD_HALF + 1.1 + a * 2.6);
      const v = r - 0.5 + b * 0.8;
      if (zone === "ble") {
        drawBox(ctx, u, v, 0.28, 0.28, 0.55 + a * 0.35, "#c9a23b");
        drawBox(ctx, u, v, 0.28, 0.28, 0.16, "#e8c65a", 0.55 + a * 0.35);
      } else if (zone === "tournesol") {
        drawBox(ctx, u + 0.1, v + 0.1, 0.1, 0.1, 0.9, "#4f7a2a");
        drawBox(ctx, u - 0.05, v - 0.05, 0.42, 0.24, 0.42, "#f2c02c", 0.85);
        drawBox(ctx, u + 0.08, v - 0.08, 0.18, 0.1, 0.2, "#5a3a1a", 0.95);
      } else {
        drawBox(ctx, u + 0.1, v, 0.1, 0.1, 0.8, "#6b4b2e");
        drawBox(ctx, u - 0.15, v - 0.1, 0.6, 0.35, 0.4, "#3f7a2a", 0.55);
      }
    }
    // Ligne d'arbres au fond, un sur deux.
    if ((r + (side > 0 ? 1 : 0)) % 2 === 0) {
      const a = hash(r * 13 + side * 7);
      const u = side * (ROAD_HALF + 4.2 + a * 0.6);
      drawBox(ctx, u, r - 0.4, 0.3, 0.3, 0.7, "#5c4a3a");
      drawBox(ctx, u - 0.35, r - 0.7, 1.0, 0.9, 1.1 + a * 0.6, "#2f6a2a", 0.7);
    }
    // Poteau électrique côté droit toutes les 5 rangées.
    if (side > 0 && r % 5 === 0) {
      drawBox(ctx, ROAD_HALF + 0.45, r - 0.1, 0.14, 0.14, 2.6, "#5c4a3a");
      drawBox(ctx, ROAD_HALF + 0.05, r - 0.08, 0.95, 0.1, 0.1, "#3a2e24", 2.35);
    }
    // Botte de foin de temps en temps sur l'herbe.
    if (hash(r * 41 + side) < 0.12) drawBox(ctx, side * (ROAD_HALF + 0.35) - (side < 0 ? 0.5 : 0), r - 0.25, 0.55, 0.55, 0.5, "#d0a84a");
  }
}

// Panneau de village : plaque blanche à liseré rouge sur un poteau, texte
// sur la face avant.
export function drawSign(ctx, r, side, village) {
  const [nom, dep] = village;
  const u = side * (ROAD_HALF + 0.5);
  drawBox(ctx, u - 0.06, r - 0.1, 0.12, 0.12, 1.3, "#8a8d98");
  const w = 1.7;
  drawBox(ctx, u - w / 2, r - 0.1, w, 0.08, 0.55, "#e13e26", 1.3);
  const p = project(u - w / 2 + 0.06, r - 0.1, 1.36);
  const wpx = (w - 0.12) * K, hpx = 0.43 * K * VERT;
  ctx.fillStyle = "#f7f2e6";
  ctx.fillRect(p.x, p.y - hpx, wpx, hpx);
  ctx.fillStyle = "#0d0d10";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `900 ${Math.max(6, K * 0.2)}px "Stage Grotesk", system-ui, sans-serif`;
  ctx.fillText(nom, p.x + wpx / 2, p.y - hpx * 0.62);
  ctx.font = `500 ${Math.max(5, K * 0.13)}px "Stage Grotesk", system-ui, sans-serif`;
  ctx.fillText(`(${dep})`, p.x + wpx / 2, p.y - hpx * 0.25);
}

// Ciel au-dessus de la dernière rangée + brume qui mange les rangées lointaines.
export function renderSky(ctx) {
  const top = project(0, camV + ROWS_AHEAD + 1).y;
  const sky = ctx.createLinearGradient(0, 0, 0, Math.max(1, top));
  sky.addColorStop(0, "#26397a");
  sky.addColorStop(0.5, "#7d8fc0");
  sky.addColorStop(0.85, "#efb890");
  sky.addColorStop(1, HAZE);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, Math.max(0, top));
  // Soleil bas à droite.
  const sx = W * 0.72, sy = top - K * 0.5, r = K * 0.9;
  const halo = ctx.createRadialGradient(sx, sy, r * 0.5, sx, sy, r * 3);
  halo.addColorStop(0, "rgba(255,226,150,0.5)");
  halo.addColorStop(1, "rgba(255,200,120,0)");
  ctx.fillStyle = halo;
  ctx.fillRect(sx - r * 3, sy - r * 3, r * 6, r * 3 + (top - sy));
  ctx.fillStyle = "#ffe08a";
  ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = HAZE;
  ctx.fillRect(0, top, W, H - top);
}

export function renderHaze(ctx) {
  const yFar = project(0, camV + ROWS_AHEAD + 1).y;
  const yNear = project(0, camV + ROWS_AHEAD - 7).y;
  const g = ctx.createLinearGradient(0, yNear, 0, yFar);
  g.addColorStop(0, "rgba(241,217,179,0)");
  g.addColorStop(1, "rgba(241,217,179,0.92)");
  ctx.fillStyle = g;
  ctx.fillRect(0, yFar - 2, W, yNear - yFar + 2);
}

// Sol + décor de toutes les rangées visibles, de la plus lointaine à la plus
// proche. Les objets de jeu (rows.js, friends, joueur) se peignent ensuite,
// rangée par rangée, dans main.js.
export function renderGround(ctx, signAt) {
  const r0 = Math.floor(camV) - ROWS_BEHIND;
  for (let r = r0 + ROWS_BEHIND + ROWS_AHEAD + 1; r >= r0; r--) renderRow(ctx, r);
}

export function renderProps(ctx, r, signAt) {
  renderRowProps(ctx, r);
  const s = signAt(r);
  if (s) drawSign(ctx, r, s.side, s.village);
}

export function rowRange() {
  const r0 = Math.floor(camV) - ROWS_BEHIND;
  return { from: r0, to: r0 + ROWS_BEHIND + ROWS_AHEAD + 1 };
}
