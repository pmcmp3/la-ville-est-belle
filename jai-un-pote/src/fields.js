// fields.js — Décor de campagne : champs de blé, tournesols puis vignes de
// part et d'autre de la route, ligne d'arbres au fond, poteaux électriques,
// bottes de foin, panneaux de village. Tout en BLOCS (voxel.js) projetés par
// road.project(), même grammaire Minecraft que les cyclistes. Purement
// décoratif : rien ici ne touche au gameplay.
//
// Découpage en cellules de WORLD_GRID_SPACING unités le long de la route, une
// par côté ; chaque cellule est une fonction pure de son index (hash) — le
// même champ revient toujours au même endroit, rien ne scintille.

import {
  project, ROAD_HALF_WIDTH, HORIZON_Z, HAZE_MAX_Z, HAZE_STRENGTH,
  WORLD_GRID_SPACING, buildHazeGradient, gradientStep, horizonScreenY,
} from "./road.js";
import { blk } from "./voxel.js";

const S = WORLD_GRID_SPACING;
const DEPTH_COUNT = Math.ceil(HORIZON_Z / S) + 1;
const SCENERY_MIN_Z = 2.5;
const X0 = ROAD_HALF_WIDTH + 1.2;   // début du champ (après la bande d'herbe)
const X1 = 70;                      // fin du champ (bien hors écran)
const TREE_X = 30;                  // ligne d'arbres, derrière les champs
// Une zone de culture dure ZONE_SLOTS cellules (700 u ≈ 35 s au départ) :
// blé → tournesols → vignes → blé…
const ZONE_SLOTS = 70;
const ZONES = ["ble", "tournesol", "vigne"];
// Panneau de village toutes les SIGN_EVERY cellules, côté alterné.
const SIGN_EVERY = 45;

function hash(n) {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function zoneAt(n) {
  return ZONES[Math.floor(Math.max(0, n) / ZONE_SLOTS) % ZONES.length];
}

// Couleurs de sol par culture (deux tons qui alternent par demi-cellule :
// les sillons). Toutes précalculées vers la brume claire du matin.
const SOIL = {
  ble:       ["#c9a648", "#b9963e"].map((h) => buildHazeGradient(h)),
  tournesol: ["#6f8c2f", "#63802a"].map((h) => buildHazeGradient(h)),
  vigne:     ["#8a6a45", "#7a5c3c"].map((h) => buildHazeGradient(h)),
};
const TREE = buildHazeGradient("#2f5a2a", HAZE_STRENGTH * 0.9);
const TREE_HI = buildHazeGradient("#457a35", HAZE_STRENGTH * 0.9);
const GRASS_FAR = buildHazeGradient("#5d7a2f");

function fillQuad(ctx, a, b, c, d, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.lineTo(c.x, c.y);
  ctx.lineTo(d.x, d.y);
  ctx.closePath();
  ctx.fill();
}

// Un bloc posé au sol au point monde (x, z), de largeur w et hauteur h
// (unités-monde), éventuellement surélevé de `lift`. Rendu par blk() donc
// avec ses arêtes claires/sombres : c'est ce qui fait « cube » de loin.
function block(ctx, x, z, w, h, color, width, height, lift = 0) {
  const p = project(x, z, width, height);
  const pw = Math.max(1, Math.round(w * p.scale));
  const ph = Math.max(1, Math.round(h * p.scale));
  const py = Math.round(p.y - lift * p.scale);
  blk(ctx, Math.round(p.x - pw / 2), py - ph, pw, ph, color);
}

// --- Plantes ----------------------------------------------------------------
const WHEAT = "#c9a23b", WHEAT_HEAD = "#e8c65a";
const SUN_STALK = "#4f7a2a", SUN_HEAD = "#f2c02c", SUN_CORE = "#5a3a1a";
const VINE_POST = "#6b4b2e", VINE_LEAF = "#3f7a2a", GRAPE = "#5a2d6e";

function plant(ctx, kind, x, z, width, height, r) {
  if (kind === "ble") {
    // Touffe de 5 épis, serrés : de loin ça fait une masse dorée, de près des
    // tiges distinctes.
    for (let i = -2; i <= 2; i++) {
      const hh = 0.85 + hash(i * 7 + x * 3) * 0.4;
      block(ctx, x + i * 0.18, z + Math.abs(i) * 0.15, 0.09, hh, WHEAT, width, height);
      block(ctx, x + i * 0.18, z + Math.abs(i) * 0.15, 0.22, 0.34, WHEAT_HEAD, width, height, hh);
    }
  } else if (kind === "tournesol") {
    block(ctx, x, z, 0.12, 1.7, SUN_STALK, width, height);
    block(ctx, x - 0.3, z, 0.35, 0.12, SUN_STALK, width, height, 0.8);
    block(ctx, x, z, 0.62, 0.62, SUN_HEAD, width, height, 1.5);
    block(ctx, x, z, 0.26, 0.26, SUN_CORE, width, height, 1.68);
  } else {
    block(ctx, x, z, 0.14, 1.5, VINE_POST, width, height);
    block(ctx, x, z, 1.0, 0.7, VINE_LEAF, width, height, 0.9);
    block(ctx, x + 0.25, z, 0.16, 0.2, GRAPE, width, height, 0.75);
    block(ctx, x - 0.3, z, 0.16, 0.2, GRAPE, width, height, 0.8);
  }
}

// --- Props de bord de route ---------------------------------------------------
const POLE = "#5c4a3a", POLE_CROSS = "#3a2e24";
const BALE = "#d0a84a", BALE_DARK = "#a8862f";
const SIGN_POLE = "#8a8d98";

function pole(ctx, x, z, width, height) {
  block(ctx, x, z, 0.2, 5.2, POLE, width, height);
  block(ctx, x, z, 1.3, 0.16, POLE_CROSS, width, height, 4.7);
  block(ctx, x - 0.4, z, 0.14, 0.3, POLE_CROSS, width, height, 4.86);
  block(ctx, x + 0.4, z, 0.14, 0.3, POLE_CROSS, width, height, 4.86);
}

function bale(ctx, x, z, width, height) {
  block(ctx, x, z, 1.3, 1.25, BALE, width, height);
  block(ctx, x, z, 1.3, 0.14, BALE_DARK, width, height, 0.4);
  block(ctx, x, z, 1.3, 0.14, BALE_DARK, width, height, 0.85);
}

// Panneau d'entrée de village : poteau gris, plaque blanche à liseré rouge,
// nom en capitales + département. Le texte n'est peint qu'à partir de 6 px
// de haut (illisible en dessous, autant s'épargner le fillText).
function villageSign(ctx, x, z, side, village, width, height) {
  const [nom, dep] = village;
  const p = project(x, z, width, height);
  const scale = p.scale;
  const h = 0.8 * scale, w = 2.9 * scale, lift = 1.6 * scale;
  block(ctx, x, z, 0.14, 1.65, SIGN_POLE, width, height);
  const bx = Math.round(p.x - w / 2), by = Math.round(p.y - lift - h);
  ctx.fillStyle = "#e13e26";
  ctx.fillRect(bx, by, Math.round(w), Math.round(h));
  const b = Math.max(1, Math.round(0.06 * scale));
  ctx.fillStyle = "#f7f2e6";
  ctx.fillRect(bx + b, by + b, Math.round(w) - b * 2, Math.round(h) - b * 2);
  const px = 0.42 * scale;
  if (px >= 6) {
    ctx.fillStyle = "#0d0d10";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `900 ${px}px "Stage Grotesk", system-ui, sans-serif`;
    ctx.fillText(nom, p.x, by + h * 0.42);
    ctx.font = `500 ${px * 0.62}px "Stage Grotesk", system-ui, sans-serif`;
    ctx.fillText(`(${dep})`, p.x, by + h * 0.78);
  }
}

// --- Rendu -------------------------------------------------------------------
function renderCell(ctx, n, side, distance, width, height) {
  const z0raw = n * S - distance;
  const z1 = z0raw + S;
  if (z0raw > HORIZON_Z || z1 < SCENERY_MIN_Z) return;
  const z0 = Math.max(z0raw, SCENERY_MIN_Z * 0.6);
  const zone = zoneAt(n);
  const distT = Math.min(1, ((z0 + z1) / 2) / HAZE_MAX_Z);
  const soil = SOIL[zone];

  // Sol du champ en deux sillons (demi-cellules) : la texture de rangées se
  // lit même quand les plantes ne sont plus que des points.
  const xa = side * X0, xb = side * X1;
  const zm = Math.min(z1, Math.max(z0, z0raw + S / 2));
  fillQuad(ctx,
    project(xa, z0, width, height), project(xb, z0, width, height),
    project(xb, zm, width, height), project(xa, zm, width, height),
    gradientStep(soil[0], distT));
  fillQuad(ctx,
    project(xa, zm, width, height), project(xb, zm, width, height),
    project(xb, z1, width, height), project(xa, z1, width, height),
    gradientStep(soil[1], distT));

  // Ligne d'arbres au fond (deux masses par cellule, hauteur variable).
  if (z0raw > 6) {
    for (let i = 0; i < 2; i++) {
      const r = hash(n * 31 + i * 7 + (side + 2) * 101);
      const tx = side * (TREE_X + r * 4);
      const tz = z0raw + 1 + r * (S - 2);
      if (tz < SCENERY_MIN_Z || tz > HORIZON_Z) continue;
      const th = 3 + r * 2.5;
      block(ctx, tx, tz, 2.6 + r, th, gradientStep(TREE, Math.min(1, tz / HAZE_MAX_Z)), width, height);
      block(ctx, tx - 0.4, tz, 1.4, th * 0.5, gradientStep(TREE_HI, Math.min(1, tz / HAZE_MAX_Z)), width, height, th * 0.55);
    }
  }

  // Plantes : nombre dégressif avec la distance (elles ne sont plus que des
  // pixels au loin, le sol fait le reste).
  const zc = (z0 + z1) / 2;
  const count = zc < 40 ? 13 : zc < 80 ? 8 : zc < 130 ? 4 : zc < 170 ? 2 : 0;
  const items = [];
  for (let i = 0; i < count; i++) {
    const r1 = hash(n * 17 + i * 3 + (side + 2) * 53);
    const r2 = hash(n * 23 + i * 5 + (side + 2) * 71);
    const pz = z0raw + 0.4 + r2 * (S - 0.8);
    if (pz < SCENERY_MIN_Z || pz > HORIZON_Z) continue;
    items.push({ x: side * (X0 + 0.4 + r1 * 11), z: pz, r: r2 });
  }
  items.sort((a, b) => b.z - a.z);
  for (const it of items) plant(ctx, zone, it.x, it.z, width, height, it.r);

  // Props sur la bande d'herbe : poteau électrique tous les 3 cellules côté
  // droit, botte de foin au hasard, panneau de village à sa cellule.
  const pz = z0raw + S * 0.5;
  if (pz > SCENERY_MIN_Z && pz < HORIZON_Z) {
    const vx = side * (ROAD_HALF_WIDTH + 0.8);
    if (side > 0 && n % 3 === 0) pole(ctx, vx, pz, width, height);
    else if (hash(n * 41 + side) < 0.18) bale(ctx, side * (X0 + 0.9), pz, width, height);
    if (n % SIGN_EVERY === 20) {
      const villages = window.CONFIG.villages || [];
      const idx = Math.floor(n / SIGN_EVERY) % Math.max(1, villages.length);
      const signSide = idx % 2 === 0 ? 1 : -1;
      if (side === signSide && villages.length) villageSign(ctx, vx, pz, side, villages[idx], width, height);
    }
  }
}

// Bande d'herbe lointaine entre la fin des cellules visibles et l'horizon :
// évite un trou de brume nue au ras de la courbe.
function renderFarStrip(ctx, width, height) {
  const y = horizonScreenY(width, height);
  ctx.fillStyle = gradientStep(GRASS_FAR, 0.98);
  ctx.fillRect(0, y - 1, width, 3);
}

export function render(ctx, width, height, distance) {
  renderFarStrip(ctx, width, height);
  const startSlot = Math.floor(distance / S) - 1;
  for (let n = startSlot + DEPTH_COUNT; n >= startSlot; n--) {
    renderCell(ctx, n, -1, distance, width, height);
    renderCell(ctx, n, 1, distance, width, height);
  }
}
