// finish.js — Ligne d'arrivée à damier, projetée dans les 5 dernières
// secondes du morceau. Demandé par l'artiste depuis plusieurs sessions
// (question ouverte : "est-ce que tu as pensé à mettre une ligne d'arrivée").
//
// Principe : pas d'entité stockée, position calculée à la frame courante.
// La ligne est à z = PLAYER_NEAR_Z + (dureeMorceau - now) * speed — elle
// arrive donc pile au niveau du joueur quand now == dureeMorceau, cohérent
// avec la fin du morceau qui met déjà fin à la partie (voir main.js).
//
// Rendu en damier noir/blanc classique, largeur = celle de la chaussée
// (2 × ROAD_HALF_WIDTH), épaisseur ~0.6 unité-monde pour rester visible
// même en approche rapide. Projetée en 4 points (2 coins avant, 2 arrière)
// pour dessiner un quadrilatère qui suit la perspective de la route.

import { clock } from "./clock.js";
import * as road from "./road.js";
import { finishTime } from "./entities.js";

const SHOW_BEFORE_END = 5;   // s : la ligne devient visible au plus tôt
const THICKNESS = 0.6;       // unités-monde : épaisseur "profondeur" de la bande
const CHECKER_COLS = 8;      // nombre de cases sur la largeur de la route

export function render(ctx, width, height) {
  const now = clock.now();
  // Ligne d'arrivée = passage du 150e objet (voir entities.js), plus la fin
  // du morceau. Le morceau continue jusqu'au bout, la course s'arrête ici.
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

  // Damier : on subdivise la largeur en CHECKER_COLS quadrilatères
  // (interpolation linéaire des coins gauche/droite).
  ctx.save();
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
  ctx.restore();
}
