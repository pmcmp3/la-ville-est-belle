// iso.js — Vue ISOMÉTRIQUE façon Crossy Road (troisième perspective du
// 4 septembre 2026, retour : « on n'a pas la perspective de Crossy Road, on a
// un entre-deux [...] j'aimerais vraiment une carte comme Crossy Road, tout
// en semi-3D »). Projection dimétrique 2:1, le monde tourné de 45° : la
// route file vers le HAUT-GAUCHE de l'écran, les traversants la coupent le
// long de l'autre diagonale (bas-gauche → haut-droite). Chaque objet est un
// cube à trois faces visibles : dessus, face gauche, face droite.
//
//   sx = ancre.x + (u − camU)·K − (v − camV)·K
//   sy = ancre.y − (u − camU)·K·ISO − (v − camV)·K·ISO − h·K·VERT
//
// La caméra suit le joueur ; il reste ancré en bas à droite de l'écran, la
// route devant lui occupe le haut-gauche. Ordre du peintre : profondeur
// = u + v (le plus grand = le plus loin), dessiné en premier.

import { shade } from "./voxel.js";

export const COLS = 3;
export const COL_W = 1.25;
export const ROAD_HALF = (COLS * COL_W) / 2;   // 1,875
const UNITS_ACROSS = 12.5;                     // K = largeur d'écran / ceci (plus petit = on voit plus loin)
const ISO = 0.5;                               // 2:1 — « baisse un peu la caméra » : 0,5 au lieu de 0,58
const VERT = 0.95;                             // hauteur des cubes (caméra basse = faces hautes)
const ANCHOR = { x: 0.66, y: 0.66 };           // joueur en bas à droite : ~8 rangées de route visibles devant lui
export const ROWS_AHEAD = 13;
export const ROWS_BEHIND = 9;
const U_SPAN = 9;                              // demi-largeur de monde dessinée en u

let W = 375, H = 812, K = 32.6;
let camV = 0, camU = 0;

export function setViewport(width, height) { W = width; H = height; K = width / UNITS_ACROSS; }
export function setCamera(v, u = 0) { camV = v; camU = u; }
export function getCamV() { return camV; }
export function scale() { return K; }
export function colU(c) { return (c - (COLS - 1) / 2) * COL_W; }

export function project(u, v, h = 0) {
  const du = u - camU, dv = v - camV;
  return {
    x: W * ANCHOR.x + du * K - dv * K,
    y: H * ANCHOR.y - du * K * ISO - dv * K * ISO - h * K * VERT,
  };
}

// Profondeur pour l'ordre du peintre (plus grand = plus loin de la caméra).
export function depth(u, v) { return u + v; }

function poly(ctx, pts, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.fill();
}

// Cube posé au sol : empreinte (u, v) → (u+du, v+dv), hauteur h, surélevé de
// `lift`. Faces visibles : gauche (u = u_min, éclairée), droite (v = v_min,
// dans l'ombre), dessus (la plus claire). Même vocabulaire que Crossy.
export function drawBox(ctx, u, v, du, dv, h, color, lift = 0) {
  const A = project(u, v, lift), B = project(u + du, v, lift), D = project(u, v + dv, lift);
  const A2 = project(u, v, lift + h), B2 = project(u + du, v, lift + h);
  const C2 = project(u + du, v + dv, lift + h), D2 = project(u, v + dv, lift + h);
  poly(ctx, [A, D, D2, A2], shade(color, -14));     // face gauche (le long de v)
  poly(ctx, [A, B, B2, A2], shade(color, -40));     // face droite (le long de u)
  poly(ctx, [A2, B2, C2, D2], shade(color, 24));    // dessus
}

// Aplat au sol : parallélogramme.
export function drawFlat(ctx, u, v, du, dv, color) {
  poly(ctx, [project(u, v), project(u + du, v), project(u + du, v + dv), project(u, v + dv)], color);
}

// Ombre au sol : losange translucide de demi-côtés ru, rv, centré en (u, v).
export function drawShadow(ctx, u, v, ru, rv, alpha = 0.26) {
  ctx.save();
  ctx.globalAlpha = alpha;
  drawFlat(ctx, u - ru, v - rv, ru * 2, rv * 2, "#000");
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

const ZONE_ROWS = 90;
function zoneAt(r) { return ["ble", "tournesol", "vigne"][Math.floor(Math.max(0, r) / ZONE_ROWS) % 3]; }
const SOIL = { ble: "#c9a648", tournesol: "#6f8c2f", vigne: "#8a6a45" };

// Une rangée r couvre v ∈ [r − 0,5 ; r + 0,5[ sur toute la largeur.
function renderRow(ctx, r) {
  const v = r - 0.5;
  const g = GRASS[((r % 2) + 2) % 2];
  const soil = SOIL[zoneAt(r)];
  const sc = r % 6 < 3 ? soil : shade(soil, -10);
  drawFlat(ctx, -U_SPAN, v, U_SPAN - ROAD_HALF - 0.9, 1, sc);
  drawFlat(ctx, ROAD_HALF + 0.9, v, U_SPAN - ROAD_HALF - 0.9, 1, sc);
  drawFlat(ctx, -ROAD_HALF - 0.9, v, 0.9, 1, g);
  drawFlat(ctx, ROAD_HALF, v, 0.9, 1, g);
  drawFlat(ctx, -ROAD_HALF - 0.22, v, 0.22, 1, DIRT);
  drawFlat(ctx, ROAD_HALF, v, 0.22, 1, DIRT);
  drawFlat(ctx, -ROAD_HALF, v, ROAD_HALF * 2, 1, ROAD[((r % 2) + 2) % 2]);
  if (r % 2 === 0) drawFlat(ctx, -0.06, v + 0.2, 0.12, 0.6, LINE);
}

// Décor d'une rangée, renvoyé comme éléments à trier (ils ont une profondeur).
export function rowDecor(ctx, r) {
  const out = [];
  const zone = zoneAt(r);
  const push = (u, v, draw) => out.push({ d: depth(u, v), draw });
  for (const side of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      const a = hash(r * 31 + i * 7 + side * 101);
      const b = hash(r * 17 + i * 5 + side * 53);
      const u = side * (ROAD_HALF + 1.1 + a * 4.5);
      const v = r - 0.5 + b * 0.8;
      if (zone === "ble") {
        push(u, v, () => { drawBox(ctx, u, v, 0.28, 0.28, 0.55 + a * 0.35, "#c9a23b"); drawBox(ctx, u, v, 0.28, 0.28, 0.16, "#e8c65a", 0.55 + a * 0.35); });
      } else if (zone === "tournesol") {
        push(u, v, () => { drawBox(ctx, u + 0.1, v + 0.1, 0.1, 0.1, 0.9, "#4f7a2a"); drawBox(ctx, u - 0.05, v - 0.05, 0.42, 0.24, 0.42, "#f2c02c", 0.85); drawBox(ctx, u + 0.08, v - 0.08, 0.18, 0.1, 0.2, "#5a3a1a", 0.95); });
      } else {
        push(u, v, () => { drawBox(ctx, u + 0.1, v, 0.1, 0.1, 0.8, "#6b4b2e"); drawBox(ctx, u - 0.15, v - 0.1, 0.6, 0.35, 0.4, "#3f7a2a", 0.55); });
      }
    }
    if ((r + (side > 0 ? 1 : 0)) % 2 === 0) {
      const a = hash(r * 13 + side * 7);
      const u = side * (ROAD_HALF + 6.2 + a * 0.8), v = r - 0.4;
      push(u, v, () => { drawBox(ctx, u, v, 0.3, 0.3, 0.7, "#5c4a3a"); drawBox(ctx, u - 0.35, v - 0.3, 1.0, 0.9, 1.1 + a * 0.6, "#2f6a2a", 0.7); });
    }
    if (side > 0 && r % 5 === 0) {
      const u = ROAD_HALF + 0.45, v = r - 0.1;
      push(u, v, () => { drawBox(ctx, u, v, 0.14, 0.14, 2.6, "#5c4a3a"); drawBox(ctx, u - 0.4, v + 0.02, 0.95, 0.1, 0.1, "#3a2e24", 2.35); });
    }
    if (hash(r * 41 + side) < 0.12) {
      const u = side * (ROAD_HALF + 0.35) - (side < 0 ? 0.5 : 0), v = r - 0.25;
      push(u, v, () => drawBox(ctx, u, v, 0.55, 0.55, 0.5, "#d0a84a"));
    }
  }
  return out;
}

// Panneau de village : poteau + plaque, texte en étiquette écran au-dessus.
export function drawSign(ctx, r, side, village) {
  const [nom, dep] = village;
  const u = side * (ROAD_HALF + 0.5), v = r - 0.1;
  drawBox(ctx, u - 0.06, v, 0.12, 0.12, 1.3, "#8a8d98");
  drawBox(ctx, u - 0.8, v, 1.6, 0.1, 0.55, "#e13e26", 1.3);
  const p = project(u, v + 0.05, 1.58);
  const wpx = 1.5 * K, hpx = 0.42 * K;
  ctx.fillStyle = "#f7f2e6";
  ctx.fillRect(p.x - wpx / 2, p.y - hpx / 2, wpx, hpx);
  ctx.fillStyle = "#0d0d10";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `900 ${Math.max(6, K * 0.2)}px "Stage Grotesk", system-ui, sans-serif`;
  ctx.fillText(nom, p.x, p.y - hpx * 0.18);
  ctx.font = `500 ${Math.max(5, K * 0.13)}px "Stage Grotesk", system-ui, sans-serif`;
  ctx.fillText(`(${dep})`, p.x, p.y + hpx * 0.26);
}

export function rowRange() {
  const r0 = Math.floor(camV) - ROWS_BEHIND;
  return { from: r0, to: r0 + ROWS_BEHIND + ROWS_AHEAD };
}

// Fond + sol de toutes les rangées visibles.
export function renderGround(ctx) {
  ctx.fillStyle = HAZE;
  ctx.fillRect(0, 0, W, H);
  const { from, to } = rowRange();
  for (let r = to; r >= from; r--) renderRow(ctx, r);
}

// Brume du matin sur le haut de l'écran (le lointain se dissout), et une
// pointe de ciel rose dans le coin haut-gauche, là où la route s'en va.
export function renderHaze(ctx) {
  const g = ctx.createLinearGradient(0, 0, 0, H * 0.42);
  g.addColorStop(0, "rgba(241,217,179,0.95)");
  g.addColorStop(0.45, "rgba(241,217,179,0.45)");
  g.addColorStop(1, "rgba(241,217,179,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H * 0.42);
  const s = ctx.createRadialGradient(W * 0.12, H * 0.05, 0, W * 0.12, H * 0.05, W * 0.75);
  s.addColorStop(0, "rgba(255,214,150,0.85)");
  s.addColorStop(0.35, "rgba(240,160,130,0.35)");
  s.addColorStop(1, "rgba(120,110,190,0)");
  ctx.fillStyle = s;
  ctx.fillRect(0, 0, W, H * 0.5);
}
