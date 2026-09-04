// obstacles.js — Les obstacles de campagne, absurdes assumés (demandé : « un
// avion arrêté en plein milieu d'une voie, des trucs comme ça »). Chacun
// barre TOUTE la route (il n'y a pas de changement de voie dans ce jeu) et se
// franchit au saut : `saut: "court"` = un tap suffit, `saut: "long"` = il
// faut maintenir. `cout` = nombre de potes perdus si on le touche.
//
// Rendu : sprites voxel pré-rendus une fois (blk, voxel.js), blit à l'échelle
// au point projeté. Le fossé est le seul obstacle « plat » : un trou sombre
// peint sur la chaussée.

import { blk } from "./voxel.js";
import { project } from "./road.js";

export const OBSTACLES = {
  poule:     { w: 0.9, h: 0.75, len: 0.8, cout: 1, saut: "court", nom: "une poule" },
  botte:     { w: 1.7, h: 1.1,  len: 1.4, cout: 1, saut: "court", nom: "une botte de foin" },
  canape:    { w: 2.7, h: 1.05, len: 1.2, cout: 1, saut: "court", nom: "un canapé" },
  baignoire: { w: 2.5, h: 0.95, len: 1.2, cout: 2, saut: "court", nom: "une baignoire" },
  vache:     { w: 2.3, h: 1.7,  len: 2.6, cout: 2, saut: "long",  nom: "une vache" },
  piano:     { w: 2.5, h: 1.6,  len: 1.6, cout: 2, saut: "long",  nom: "un piano" },
  tracteur:  { w: 3.1, h: 2.3,  len: 3.4, cout: 3, saut: "long",  nom: "un tracteur" },
  fosse:     { w: 8.0, h: 0,    len: 3.2, cout: 3, saut: "long",  nom: "un fossé" },
  avion:     { w: 7.6, h: 1.5,  len: 3.0, cout: 3, saut: "long",  nom: "un avion" },
};

// Hauteur de saut (unités-monde) qu'il faut avoir AU MOMENT où l'obstacle
// passe le joueur pour le franchir. Le tap court culmine à ~1,1 u, le
// maintien à ~2,3 u (voir jumpPhysics, main.js).
export const CLEAR_HEIGHT = { court: 0.75, long: 1.55 };

// Poids de tirage. Les gros (cout 3) montent avec le temps — voir track.js.
export const WEIGHTS = {
  poule: 3, botte: 3, canape: 2, baignoire: 1.2, vache: 1.4, piano: 0.8, tracteur: 0.5, fosse: 0.5, avion: 0.35,
};

const PX = 14; // pixels de sprite par unité-monde

function makeSprite(kind, drawFn) {
  const o = OBSTACLES[kind];
  const c = document.createElement("canvas");
  c.width = Math.ceil(o.w * PX) + 2;
  c.height = Math.ceil(o.h * PX) + 2;
  const ctx = c.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  // Origine : bas-centre du sprite. `b(x, y, w, h, color)` en unités-monde,
  // y vers le HAUT depuis le sol.
  const cx = c.width / 2, base = c.height - 1;
  const b = (x, y, w, h, color) => blk(ctx, Math.round(cx + x * PX - (w * PX) / 2), Math.round(base - (y + h) * PX), Math.max(1, Math.round(w * PX)), Math.max(1, Math.round(h * PX)), color);
  drawFn(b);
  return c;
}

const SPRITES = {
  poule: makeSprite("poule", (b) => {
    b(0.05, 0, 0.08, 0.2, "#e08a2a"); b(-0.15, 0, 0.08, 0.2, "#e08a2a"); // pattes
    b(0, 0.2, 0.55, 0.38, "#f4efe4");                                       // corps
    b(-0.28, 0.32, 0.14, 0.2, "#f4efe4");                                    // queue
    b(0.22, 0.5, 0.22, 0.22, "#f4efe4");                                     // tête
    b(0.36, 0.55, 0.1, 0.06, "#e08a2a");                                     // bec
    b(0.22, 0.72, 0.1, 0.05, "#e13e26");                                     // crête
  }),
  botte: makeSprite("botte", (b) => {
    b(0, 0, 1.7, 1.1, "#d0a84a");
    b(0, 0.3, 1.7, 0.1, "#a8862f");
    b(0, 0.7, 1.7, 0.1, "#a8862f");
    b(-0.6, 0.1, 0.12, 0.9, "#e8c66a");
  }),
  canape: makeSprite("canape", (b) => {
    b(-1.1, 0, 0.12, 0.15, "#3a2a1a"); b(1.1, 0, 0.12, 0.15, "#3a2a1a");
    b(0, 0.15, 2.7, 0.45, "#c8442c");                 // assise
    b(0, 0.6, 2.7, 0.45, "#e05a3c");                  // dossier
    b(-1.2, 0.15, 0.3, 0.7, "#a83a26"); b(1.2, 0.15, 0.3, 0.7, "#a83a26"); // accoudoirs
    b(-0.6, 0.62, 0.9, 0.25, "#f0c060");              // coussin
  }),
  baignoire: makeSprite("baignoire", (b) => {
    b(-0.9, 0, 0.16, 0.18, "#8a8d98"); b(0.9, 0, 0.16, 0.18, "#8a8d98");
    b(0, 0.18, 2.5, 0.62, "#f4f1ea");
    b(0, 0.8, 2.6, 0.15, "#ffffff");
    b(0.95, 0.95, 0.08, 0.2, "#8a8d98"); b(0.95, 1.12, 0.22, 0.06, "#8a8d98"); // robinet
    b(0, 0.55, 2.2, 0.12, "#8fc7e6");                                       // eau
  }),
  vache: makeSprite("vache", (b) => {
    b(-0.7, 0, 0.18, 0.55, "#f4efe4"); b(-0.3, 0, 0.18, 0.55, "#f4efe4");
    b(0.3, 0, 0.18, 0.55, "#f4efe4"); b(0.7, 0, 0.18, 0.55, "#f4efe4");
    b(0, 0.55, 2.0, 0.75, "#f4efe4");
    b(-0.5, 0.7, 0.55, 0.4, "#1a1a1e"); b(0.45, 0.6, 0.4, 0.3, "#1a1a1e"); // taches
    b(0.05, 0.52, 0.4, 0.14, "#f0a0b0");                                     // pis
    b(0.95, 0.95, 0.5, 0.45, "#f4efe4");                                     // tête
    b(1.05, 0.9, 0.3, 0.2, "#f0a0b0");                                       // museau
    b(0.85, 1.4, 0.12, 0.25, "#d8c8a0"); b(1.15, 1.4, 0.12, 0.25, "#d8c8a0"); // cornes
  }),
  piano: makeSprite("piano", (b) => {
    b(-1.1, 0, 0.15, 0.2, "#0d0d10"); b(1.1, 0, 0.15, 0.2, "#0d0d10");
    b(0, 0.2, 2.5, 1.4, "#151517");
    b(0, 0.85, 2.3, 0.22, "#f4f1ea");                                       // touches
    for (let i = -1.0; i <= 1.0; i += 0.3) b(i, 0.95, 0.08, 0.12, "#0d0d10");
    b(0, 1.15, 2.3, 0.08, "#3a3a40");
  }),
  tracteur: makeSprite("tracteur", (b) => {
    b(-0.9, 0, 1.1, 1.1, "#1a1a1e"); b(-0.9, 0.35, 0.4, 0.4, "#f2c02c");      // grande roue
    b(0.95, 0, 0.7, 0.7, "#1a1a1e"); b(0.95, 0.2, 0.28, 0.28, "#f2c02c");     // petite roue
    b(0.2, 0.55, 2.2, 0.8, "#3a8a3a");                                          // corps
    b(0.7, 0.55, 1.2, 0.6, "#2f7a2f");                                          // capot
    b(-0.5, 1.35, 1.2, 0.95, "#2f7a2f");                                        // cabine
    b(-0.5, 1.5, 0.9, 0.6, "#a8d8f0");                                          // vitre
    b(1.1, 1.35, 0.12, 0.7, "#3a3a40");                                         // échappement
  }),
  fosse: makeSprite("fosse", () => {}),
  avion: makeSprite("avion", (b) => {
    b(-0.6, 0, 0.16, 0.3, "#3a3a40"); b(0.8, 0, 0.16, 0.3, "#3a3a40");        // roues
    b(0.1, 0.3, 3.0, 0.7, "#f4f1ea");                                           // fuselage
    b(0.1, 0.55, 3.0, 0.12, "#e13e26");                                         // liseré
    b(0, 0.85, 7.6, 0.22, "#f4f1ea");                                           // aile
    b(0, 0.85, 7.6, 0.06, "#c8c4b8");
    b(-1.2, 1.0, 0.7, 0.5, "#8fc7e6");                                          // verrière
    b(-1.7, 0.6, 0.35, 0.9, "#e13e26");                                         // dérive
    b(1.65, 0.45, 0.1, 0.9, "#3a3a40");                                         // hélice
  }),
};

// Fossé : trapèze sombre sur la chaussée, entre z − len/2 et z + len/2, plus
// une lèvre de terre claire côté joueur.
function renderFosse(ctx, z, width, height, alpha) {
  const o = OBSTACLES.fosse;
  const w = 4;
  const zn = Math.max(0.5, z - o.len / 2), zf = z + o.len / 2;
  const a = project(-w, zn, width, height), b = project(w, zn, width, height);
  const c = project(w, zf, width, height), d = project(-w, zf, width, height);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "#1a1512";
  ctx.beginPath();
  ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#8a6a45";
  ctx.fillRect(a.x, a.y - 2, b.x - a.x, Math.max(2, 0.12 * a.scale));
  ctx.restore();
}

export function renderObstacle(ctx, kind, z, width, height, alpha = 1) {
  if (z <= 0.5) return;
  if (kind === "fosse") { renderFosse(ctx, z, width, height, alpha); return; }
  const o = OBSTACLES[kind];
  const sprite = SPRITES[kind];
  const p = project(0, z, width, height);
  const sw = o.w * p.scale * (sprite.width / (o.w * PX));
  const sh = o.h * p.scale * (sprite.height / (o.h * PX));
  ctx.save();
  ctx.globalAlpha = alpha;
  // Ombre au sol.
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, o.w * p.scale * 0.5, o.len * p.scale * 0.12 + 1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sprite, Math.round(p.x - sw / 2), Math.round(p.y - sh), Math.round(sw), Math.round(sh));
  ctx.restore();
}
