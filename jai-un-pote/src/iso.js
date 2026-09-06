// iso.js — Vue 3/4 du dessus en cubes, monde tourné de ANGLE degrés
// (6 septembre 2026 : « 0° ce serait Subway Surfers, 90° Zombie Tsunami,
// j'aimerais 30°, un peu plus vers la verticale pour qu'on voie plus loin »).
// Le 45° de Crossy Road du 4 septembre est remplacé par 30° : la route file
// vers le haut-droite, plus dressée, ~20 rangées visibles devant le joueur.
//
//   x' = u·cos + v·sin        y' = −u·sin + v·cos        (plan du sol tourné)
//   sx = ancre.x + x'·K       sy = ancre.y − y'·K·TILT − h·K·VERT
//
// Ordre du peintre : profondeur = y' (plus grand = plus loin). Cubes à trois
// faces visibles : dessus, face v_min (éclairée), face u_max (dans l'ombre).

import { shade } from "./voxel.js";

export const COLS = 3;
export const COL_W = 1.25;
export const ROAD_HALF = (COLS * COL_W) / 2;   // 1,875
const ANGLE = (30 * Math.PI) / 180;
const SA = Math.sin(ANGLE), CA = Math.cos(ANGLE);
const UNITS_ACROSS = 14;
const TILT = 0.62;                             // caméra basse
const VERT = 0.92;
const ANCHOR = { x: 0.42, y: 0.72 };
export const ROWS_AHEAD = 24;
export const ROWS_BEHIND = 9;
const U_SPAN = 12;

let W = 375, H = 812, K = 26.8;
let camV = 0, camU = 0;
let night = 0;    // 0 = jour, 1 = nuit
let decorT = 0;

export function setViewport(width, height) { W = width; H = height; K = width / UNITS_ACROSS; }
export function setCamera(v, u = 0) { camV = v; camU = u; }
export function setNight(n) { night = Math.max(0, Math.min(1, n)); }
export function getNight() { return night; }
export function setDecorTime(t) { decorT = t; }
export function getCamV() { return camV; }
export function scale() { return K; }
export function colU(c) { return (c - (COLS - 1) / 2) * COL_W; }

export function project(u, v, h = 0) {
  const du = u - camU, dv = v - camV;
  const xp = du * CA + dv * SA;
  const yp = -du * SA + dv * CA;
  return { x: W * ANCHOR.x + xp * K, y: H * ANCHOR.y - yp * K * TILT - h * K * VERT };
}
export function depth(u, v) { return -u * SA + v * CA; }

function poly(ctx, pts, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.fill();
}

// Assombrissement de nuit appliqué aux couleurs des cubes et du sol.
function nightShade(color) { return night > 0.02 ? shade(color, -Math.round(48 * night)) : color; }

export function drawBox(ctx, u, v, du, dv, h, color, lift = 0) {
  const col = nightShade(color);
  const A = project(u, v, lift), B = project(u + du, v, lift), C = project(u + du, v + dv, lift);
  const A2 = project(u, v, lift + h), B2 = project(u + du, v, lift + h);
  const C2 = project(u + du, v + dv, lift + h), D2 = project(u, v + dv, lift + h);
  // Lumière (7 septembre 2026, « revois bien la lumière ») : le soleil est en
  // HAUT À DROITE de l'écran (renderHaze). La face u_max regarde vers la
  // droite → éclairée ; la face v_min regarde vers le bas-gauche → à l'ombre ;
  // le dessus reçoit le plus de lumière.
  poly(ctx, [A, B, B2, A2], shade(col, -38));
  poly(ctx, [B, C, C2, B2], shade(col, -10));
  poly(ctx, [A2, B2, C2, D2], shade(col, 26));
}

export function drawFlat(ctx, u, v, du, dv, color, raw = false) {
  poly(ctx, [project(u, v), project(u + du, v), project(u + du, v + dv), project(u, v + dv)], raw ? color : nightShade(color));
}

export function drawShadow(ctx, u, v, ru, rv, alpha = 0.26) {
  ctx.save();
  ctx.globalAlpha = alpha;
  // Ombre portée décalée à l'opposé du soleil (bas-gauche : −u, −v).
  drawFlat(ctx, u - ru - 0.14, v - rv - 0.1, ru * 2, rv * 2, "#000", true);
  ctx.restore();
}

// --- Sol et décor --------------------------------------------------------------
const GRASS = ["#6f8f34", "#66852f"];
const DIRT = "#9a7a4e";
const ROAD = ["#4b4743", "#565250"];
const LINE = "#f2ead8";
const MUD = "#5a3f22";
const HAZE = "#f1d9b3";
const HAZE_NIGHT = "#1a2244";

function hash(n) {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

// Biomes TRANCHÉS (« d'un seul coup on passe dans un champ, après la prairie,
// comme Minecraft ») : 55 rangées chacun, changement net.
const ZONE_ROWS = 55;
const ZONES = ["ble", "prairie", "tournesol", "foret", "vigne"];
export function zoneAt(r) { return ZONES[Math.floor(Math.max(0, r) / ZONE_ROWS) % ZONES.length]; }
const SOIL = { ble: "#c9a648", prairie: "#7aa63c", tournesol: "#6f8c2f", foret: "#3f5a2a", vigne: "#8a6a45" };
const GRASS_BY_ZONE = { ble: null, prairie: "#7aa63c", tournesol: null, foret: "#4a6a30", vigne: null };

// Une rangée r couvre v ∈ [r − 0,5 ; r + 0,5[. `boue` = colonne boueuse.
function renderRow(ctx, r, boue) {
  const v = r - 0.5;
  const zone = zoneAt(r);
  const g = GRASS_BY_ZONE[zone] ? shade(GRASS_BY_ZONE[zone], r % 2 ? -4 : 0) : GRASS[((r % 2) + 2) % 2];
  const soil = SOIL[zone];
  const sc = zone === "prairie" || zone === "foret" ? (r % 2 ? shade(soil, -5) : soil) : (r % 6 < 3 ? soil : shade(soil, -10));
  drawFlat(ctx, -U_SPAN, v, U_SPAN - ROAD_HALF - 0.9, 1, sc);
  drawFlat(ctx, ROAD_HALF + 0.9, v, U_SPAN - ROAD_HALF - 0.9, 1, sc);
  drawFlat(ctx, -ROAD_HALF - 0.9, v, 0.9, 1, g);
  drawFlat(ctx, ROAD_HALF, v, 0.9, 1, g);
  drawFlat(ctx, -ROAD_HALF - 0.22, v, 0.22, 1, DIRT);
  drawFlat(ctx, ROAD_HALF, v, 0.22, 1, DIRT);
  for (let c = 0; c < COLS; c++) {
    const tone = ((r % 2) + 2) % 2 === 0 ? ROAD[c % 2] : ROAD[(c + 1) % 2];
    drawFlat(ctx, -ROAD_HALF + c * COL_W, v, COL_W, 1, tone);
  }
  if (boue !== null && boue !== undefined) {
    // Boue : des LIGNES le long de la voie, pas des carrés (7 septembre 2026)
    // — une bande claire sur toute la rangée et deux ornières sombres, qui se
    // raccordent d'une rangée à l'autre en traits continus.
    const bx = -ROAD_HALF + boue * COL_W;
    drawFlat(ctx, bx + 0.12, v, COL_W - 0.24, 1, shade(MUD, 14));
    drawFlat(ctx, bx + 0.3, v, 0.13, 1, MUD);
    drawFlat(ctx, bx + COL_W - 0.43, v, 0.13, 1, MUD);
  }
  if (r % 2 === 0) {
    drawFlat(ctx, -COL_W / 2 - 0.04, v + 0.2, 0.08, 0.6, LINE);
    drawFlat(ctx, COL_W / 2 - 0.04, v + 0.2, 0.08, 0.6, LINE);
  }
}

// Décor d'une rangée : éléments triables. `clear` = rangée traversée par un
// tracteur ou une poule lancée : rien sur la trajectoire (« il faut qu'il n'y
// ait pas d'arbres sur son trajet »).
export function rowDecor(ctx, r, clear) {
  const out = [];
  if (clear) return out;
  const zone = zoneAt(r);
  const push = (u, v, draw) => out.push({ d: depth(u, v), draw });
  const sway = (k) => Math.sin(decorT * 1.6 + k) * 0.05;
  for (const side of [-1, 1]) {
    const n = zone === "foret" ? 2 : zone === "prairie" ? 3 : 4;
    for (let i = 0; i < n; i++) {
      const a = hash(r * 31 + i * 7 + side * 101);
      const b = hash(r * 17 + i * 5 + side * 53);
      const u = side * (ROAD_HALF + 1.1 + a * 4.5);
      const v = r - 0.5 + b * 0.8;
      const k = r * 3.1 + i * 1.7 + side;
      if (zone === "ble") {
        push(u, v, () => { const sw = sway(k); drawBox(ctx, u, v, 0.28, 0.28, 0.55 + a * 0.35, "#c9a23b"); drawBox(ctx, u + sw, v + sw * 0.5, 0.28, 0.28, 0.16, "#e8c65a", 0.55 + a * 0.35); });
      } else if (zone === "tournesol") {
        push(u, v, () => { const sw = sway(k); drawBox(ctx, u + 0.1, v + 0.1, 0.1, 0.1, 0.9, "#4f7a2a"); drawBox(ctx, u - 0.05 + sw, v - 0.05, 0.42, 0.24, 0.42, "#f2c02c", 0.85); drawBox(ctx, u + 0.08 + sw, v - 0.08, 0.18, 0.1, 0.2, "#5a3a1a", 0.95); });
      } else if (zone === "vigne") {
        push(u, v, () => { const sw = sway(k); drawBox(ctx, u + 0.1, v, 0.1, 0.1, 0.8, "#6b4b2e"); drawBox(ctx, u - 0.15 + sw, v - 0.1, 0.6, 0.35, 0.4, "#3f7a2a", 0.55); });
      } else if (zone === "prairie") {
        const fl = a < 0.5 ? "#ffffff" : "#ffcf2e";
        push(u, v, () => { const sw = sway(k); drawBox(ctx, u + 0.05, v + 0.05, 0.06, 0.06, 0.3, "#4f7a2a"); drawBox(ctx, u + sw, v, 0.16, 0.16, 0.1, fl, 0.3); });
      } else {
        const h = 1.4 + a * 1.2;
        push(u, v, () => { const sw = sway(k); drawBox(ctx, u + 0.15, v + 0.15, 0.2, 0.2, 0.5, "#5c4a3a"); drawBox(ctx, u - 0.2 + sw * 0.5, v - 0.2, 0.9, 0.9, h * 0.5, "#2f6a2a", 0.5); drawBox(ctx, u + sw, v, 0.5, 0.5, h * 0.45, "#3a7a33", 0.5 + h * 0.5); });
      }
    }
    if ((r + (side > 0 ? 1 : 0)) % 2 === 0) {
      const a = hash(r * 13 + side * 7);
      const u = side * (ROAD_HALF + 6.6 + a * 0.8), v = r - 0.4, k = r * 2.3 + side * 5;
      push(u, v, () => { const sw = sway(k) * 1.4; drawBox(ctx, u, v, 0.3, 0.3, 0.7, "#5c4a3a"); drawBox(ctx, u - 0.35 + sw, v - 0.3 + sw * 0.4, 1.0, 0.9, 1.1 + a * 0.6, "#2f6a2a", 0.7); });
    }
    // Poteaux électriques à droite, lampadaires à gauche (allumés la nuit).
    if (side > 0 && r % 5 === 0 && zone !== "foret") {
      const u = ROAD_HALF + 0.45, v = r - 0.1;
      push(u, v, () => { drawBox(ctx, u, v, 0.14, 0.14, 2.6, "#5c4a3a"); drawBox(ctx, u - 0.4, v + 0.02, 0.95, 0.1, 0.1, "#3a2e24", 2.35); });
    }
    if (side < 0 && r % 6 === 3) {
      const u = -ROAD_HALF - 0.45, v = r - 0.1;
      push(u, v, () => {
        drawBox(ctx, u, v, 0.12, 0.12, 2.2, "#3a3a40");
        drawBox(ctx, u - 0.05, v - 0.05, 0.4, 0.22, 0.14, "#3a3a40", 2.2);
        drawBox(ctx, u + 0.02, v + 0.02, 0.3, 0.16, 0.06, night > 0.2 ? "#fff1b0" : "#c8c4b8", 2.14);
      });
    }
    if (hash(r * 41 + side) < 0.12 && zone !== "foret") {
      const u = side * (ROAD_HALF + 0.35) - (side < 0 ? 0.5 : 0), v = r - 0.25;
      push(u, v, () => drawBox(ctx, u, v, 0.55, 0.55, 0.5, "#d0a84a"));
    }
  }
  return out;
}

// Lampadaires visibles (halos peints par-dessus la nuit, main.js).
export function lampsIn(from, to) {
  const out = [];
  for (let r = from; r <= to; r++) if (r % 6 === 3) out.push({ u: -ROAD_HALF - 0.45 + 0.17, v: r - 0.1 + 0.05, h: 2.2 });
  return out;
}

// Panneau de village, côté GAUCHE : poteau + plaque en cube, et le TEXTE
// est posé sur la face avant du cube (transformation affine de la face,
// 7 septembre 2026 : « mets la bonne perspective par rapport à la route »).
export function drawSign(ctx, r, village) {
  const [nom, dep] = village;
  const u = -ROAD_HALF - 0.6, v = r - 0.1;
  const w = 2.3, hb = 0.85, base = 1.5;
  drawBox(ctx, u - 0.07, v + 0.02, 0.14, 0.14, base, "#8a8d98");
  drawBox(ctx, u - w / 2, v, w, 0.1, hb, "#e13e26", base);
  // Face avant (v = v_min) : A = bas-gauche, B = bas-droite, A2 = haut-gauche.
  const A = project(u - w / 2, v, base), B = project(u + w / 2, v, base), A2 = project(u - w / 2, v, base + hb);
  const ex = { x: (B.x - A.x) / w, y: (B.y - A.y) / w };         // par unité u
  const ey = { x: (A.x - A2.x) / hb, y: (A.y - A2.y) / hb };     // par unité h, vers le BAS
  ctx.save();
  // Repère local en « pixels-monde » : x = u·K, y = h·K (vers le bas), origine en A2.
  ctx.transform(ex.x / K, ex.y / K, ey.x / K, ey.y / K, A2.x - 0.5, A2.y - 0.5);
  const m = 0.08 * K;
  ctx.fillStyle = nightShade("#f7f2e6");
  ctx.fillRect(m, m, w * K - 2 * m, hb * K - 2 * m);
  ctx.fillStyle = "#0d0d10";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  let taille = K * 0.3;
  ctx.font = `900 ${taille}px "Stage Grotesk", system-ui, sans-serif`;
  while (ctx.measureText(nom).width > w * K - 4 * m && taille > 5) { taille -= 1; ctx.font = `900 ${taille}px "Stage Grotesk", system-ui, sans-serif`; }
  ctx.fillText(nom, w * K / 2, hb * K * 0.4);
  ctx.font = `500 ${K * 0.17}px "Stage Grotesk", system-ui, sans-serif`;
  ctx.fillText(`(${dep})`, w * K / 2, hb * K * 0.74);
  ctx.restore();
}

export function rowRange() {
  const r0 = Math.floor(camV) - ROWS_BEHIND;
  return { from: r0, to: r0 + ROWS_BEHIND + ROWS_AHEAD };
}

function mix(a, b, t) {
  const A = [parseInt(a.slice(1, 3), 16), parseInt(a.slice(3, 5), 16), parseInt(a.slice(5, 7), 16)];
  const B = [parseInt(b.slice(1, 3), 16), parseInt(b.slice(3, 5), 16), parseInt(b.slice(5, 7), 16)];
  return [Math.round(A[0] + (B[0] - A[0]) * t), Math.round(A[1] + (B[1] - A[1]) * t), Math.round(A[2] + (B[2] - A[2]) * t)];
}
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

export function renderGround(ctx, boueAt) {
  ctx.fillStyle = rgba(mix(HAZE, HAZE_NIGHT, night), 1);
  ctx.fillRect(0, 0, W, H);
  const { from, to } = rowRange();
  for (let r = to; r >= from; r--) renderRow(ctx, r, boueAt ? boueAt(r) : null);
}

// Brume en haut de l'écran (le lointain se dissout), lueur du soleil à droite
// le jour, étoiles la nuit.
export function renderHaze(ctx) {
  const hz = mix(HAZE, HAZE_NIGHT, night);
  const g = ctx.createLinearGradient(0, 0, 0, H * 0.4);
  g.addColorStop(0, rgba(hz, 0.96));
  g.addColorStop(0.5, rgba(hz, 0.4));
  g.addColorStop(1, rgba(hz, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H * 0.4);
  if (night < 0.98) {
    const s = ctx.createRadialGradient(W * 0.86, H * 0.06, 0, W * 0.86, H * 0.06, W * 0.7);
    s.addColorStop(0, `rgba(255,214,150,${0.8 * (1 - night)})`);
    s.addColorStop(0.35, `rgba(240,160,130,${0.35 * (1 - night)})`);
    s.addColorStop(1, "rgba(120,110,190,0)");
    ctx.fillStyle = s;
    ctx.fillRect(0, 0, W, H * 0.45);
  }
  if (night > 0.3) {
    ctx.fillStyle = `rgba(255,255,255,${0.7 * (night - 0.3)})`;
    for (let i = 0; i < 26; i++) {
      const x = hash(i * 7.1) * W, y = hash(i * 3.3) * H * 0.22;
      ctx.fillRect(x, y, 2, 2);
    }
  }
}
