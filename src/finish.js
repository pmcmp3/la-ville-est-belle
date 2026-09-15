// finish.js — Ligne d'arrivée façon Formule 1, projetée dans les 5 dernières
// secondes avant la fin du PARCOURS (config.dureeCourse, distinct de la durée
// du morceau — voir entities.js/finishTime()). Demandé par l'artiste depuis
// plusieurs sessions, puis explicitement précisé le 12 août 2026 : « une
// vraie ligne d'arrivée formule 1 ».
//
// Principe inchangé : pas d'entité stockée, position calculée à la frame
// courante. La ligne est à z = PLAYER_NEAR_Z + (finishTime - now) * speed —
// elle arrive donc pile au niveau du joueur quand now == finishTime(),
// cohérent avec la fin du parcours qui met déjà fin à la course (main.js).
//
// Deux éléments, même bande z (avant/arrière) pour rester un seul objet
// cohérent visuellement :
// - le damier AU SOL (existant depuis la première version) — largeur de la
//   chaussée, épaisseur ~0.6 unité-monde ;
// - le PORTIQUE au-dessus (ajouté le 12 août 2026) — deux pylônes + une
//   poutre à damier qui enjambe la route, ce qui manquait pour vraiment lire
//   "ligne d'arrivée de course" plutôt que "marquage au sol". Même grammaire
//   de rendu que le reste du décor en volume (piliers de pont/têtes de feux,
//   voir entities.js/world.js) : flancs projetés + fillPoly.

import { clock } from "./clock.js";
import * as road from "./road.js";
import { finishTime } from "./entities.js";

const SHOW_BEFORE_END = 5;   // s : la ligne devient visible au plus tôt
const THICKNESS = 0.6;       // unités-monde : épaisseur "profondeur" de la bande
const CHECKER_COLS = 8;      // nombre de cases sur la largeur de la route (damier au sol)

// Portique : hauteur choisie au-dessus du dégagement du pont (BRIDGE_HEIGHT +
// BRIDGE_COPING_H + BRIDGE_BEAM_H ≈ 4,26 dans entities.js) pour qu'aucune
// confusion ne soit possible avec l'obstacle pont si les deux se
// chevauchaient jamais visuellement (ils ne se chevauchent pas dans les
// faits : la ligne n'apparaît que dans les 5 dernières secondes du parcours).
const GANTRY_HEIGHT = 4.6;
const GANTRY_BEAM_H = 0.55;
const GANTRY_MARGIN = 0.35;       // pylônes plantés un peu au-delà du bord de route
const GANTRY_PYLON_HALF_W = 0.16;
const GANTRY_CHECKER_COLS = 10;
const PYLON_COLOR = "#1c1c20";
const PYLON_HI = "#3a3a40";       // reflet métallique, même recette que le poteau des feux (world.js)
const GANTRY_UNDERSIDE = "#141419";

function fillPoly(ctx, pts, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.fill();
}

// Poteau fin : dégradé 2 tons plutôt qu'un vrai flanc projeté (trop fin pour
// qu'il reste visible à cette largeur) — même technique que le poteau des
// feux de circulation (world.js, renderTrafficLight).
function renderPylon(ctx, width, height, xCenter, zF) {
  const ground = road.project(xCenter, zF, width, height);
  const topY = ground.y - GANTRY_HEIGHT * ground.scale;
  const poleW = Math.max(2, GANTRY_PYLON_HALF_W * 2 * ground.scale * 3);
  const poleX = ground.x - poleW / 2;
  ctx.fillStyle = PYLON_COLOR;
  ctx.fillRect(poleX, topY, poleW, ground.y - topY);
  if (poleW >= 3) {
    ctx.fillStyle = PYLON_HI;
    ctx.fillRect(poleX + poleW * 0.6, topY, Math.max(1, poleW * 0.22), ground.y - topY);
  }
}

// Poutre à damier : vrai volume (dessous + face avant), même principe que la
// tête des feux tricolores ou les piliers de pont (project() + fillPoly).
function renderBeam(ctx, xL, xR, zF, zB, width, height) {
  const gNL = road.project(xL, zF, width, height);
  const gNR = road.project(xR, zF, width, height);
  const gFL = road.project(xL, zB, width, height);
  const gFR = road.project(xR, zB, width, height);

  const topNL = { x: gNL.x, y: gNL.y - (GANTRY_HEIGHT + GANTRY_BEAM_H) * gNL.scale };
  const topNR = { x: gNR.x, y: gNR.y - (GANTRY_HEIGHT + GANTRY_BEAM_H) * gNR.scale };
  const botNL = { x: gNL.x, y: gNL.y - GANTRY_HEIGHT * gNL.scale };
  const botNR = { x: gNR.x, y: gNR.y - GANTRY_HEIGHT * gNR.scale };
  const botFL = { x: gFL.x, y: gFL.y - GANTRY_HEIGHT * gFL.scale };
  const botFR = { x: gFR.x, y: gFR.y - GANTRY_HEIGHT * gFR.scale };

  // Dessous de la poutre : seule face qui se voit en passant dessous, un
  // aplat sombre suffit (jamais vu sous un autre angle).
  fillPoly(ctx, [botNL, botNR, botFR, botFL], GANTRY_UNDERSIDE);

  // Face avant à damier, subdivisée horizontalement — même principe que le
  // damier au sol plus bas dans ce fichier.
  for (let i = 0; i < GANTRY_CHECKER_COLS; i++) {
    const t0 = i / GANTRY_CHECKER_COLS;
    const t1 = (i + 1) / GANTRY_CHECKER_COLS;
    fillPoly(ctx, [
      { x: botNL.x + (botNR.x - botNL.x) * t0, y: botNL.y + (botNR.y - botNL.y) * t0 },
      { x: botNL.x + (botNR.x - botNL.x) * t1, y: botNL.y + (botNR.y - botNL.y) * t1 },
      { x: topNL.x + (topNR.x - topNL.x) * t1, y: topNL.y + (topNR.y - topNL.y) * t1 },
      { x: topNL.x + (topNR.x - topNL.x) * t0, y: topNL.y + (topNR.y - topNL.y) * t0 },
    ], i % 2 === 0 ? "#ffffff" : "#141419");
  }
}

export function render(ctx, width, height) {
  const now = clock.now();
  // Ligne d'arrivée = fin du PARCOURS (config.dureeCourse, voir
  // entities.js/finishTime()), plus tôt que la fin du morceau — celui-ci
  // continue de jouer, seule la course s'arrête ici.
  const remaining = finishTime() - now;
  if (remaining > SHOW_BEFORE_END) return;   // pas encore visible
  if (remaining < -0.5) return;              // déjà franchie, on nettoie

  const speed = road.getSpeed();
  const zFront = road.PLAYER_NEAR_Z + remaining * speed;
  const zBack = zFront + THICKNESS;

  // Si la ligne est passée derrière le joueur ou trop loin devant, rien à
  // faire. La borne haute reprend HORIZON_Z (idem entities.js) pour ne pas
  // projeter au-delà du repliement de la courbe.
  if (zBack < 0.5) return;
  if (zFront > road.HORIZON_Z) return;

  // Coins projetés (avant/arrière, gauche/droite), en clampant zFront à une
  // valeur positive pour éviter l'infini quand la ligne est au niveau exact
  // du joueur (z → 0).
  const zF = Math.max(0.5, zFront);
  const zB = Math.max(zF + 0.05, zBack);
  const fl = road.project(-road.ROAD_HALF_WIDTH, zF, width, height);
  const fr = road.project(+road.ROAD_HALF_WIDTH, zF, width, height);
  const bl = road.project(-road.ROAD_HALF_WIDTH, zB, width, height);
  const br = road.project(+road.ROAD_HALF_WIDTH, zB, width, height);

  ctx.save();

  // Damier au sol : on subdivise la largeur en CHECKER_COLS quadrilatères
  // (interpolation linéaire des coins gauche/droite).
  for (let i = 0; i < CHECKER_COLS; i++) {
    const t0 = i / CHECKER_COLS;
    const t1 = (i + 1) / CHECKER_COLS;
    ctx.fillStyle = i % 2 === 0 ? "#ffffff" : "#141419";
    ctx.beginPath();
    ctx.moveTo(fl.x + (fr.x - fl.x) * t0, fl.y + (fr.y - fl.y) * t0);
    ctx.lineTo(fl.x + (fr.x - fl.x) * t1, fl.y + (fr.y - fl.y) * t1);
    ctx.lineTo(bl.x + (br.x - bl.x) * t1, bl.y + (br.y - bl.y) * t1);
    ctx.lineTo(bl.x + (br.x - bl.x) * t0, bl.y + (br.y - bl.y) * t0);
    ctx.closePath();
    ctx.fill();
  }

  // Portique : pylônes plantés au bord de la ligne (zF, comme les feux de
  // circulation) + poutre à damier qui enjambe toute la largeur.
  const xL = -(road.ROAD_HALF_WIDTH + GANTRY_MARGIN);
  const xR = road.ROAD_HALF_WIDTH + GANTRY_MARGIN;
  renderPylon(ctx, width, height, xL, zF);
  renderPylon(ctx, width, height, xR, zF);
  renderBeam(ctx, xL, xR, zF, zB, width, height);

  ctx.restore();
}
