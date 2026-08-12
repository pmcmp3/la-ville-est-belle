// player.js — Sprite du cycliste joueur, VU DE DOS.
//
// Passé en voxel (blocs extrudés) pour matcher la DA de cyclists.js — c'était
// la moitié manquante du chantier « refais la DA du cycliste » (voir
// ARCHITECTURE.md §11) : les cyclistes en sens inverse avaient déjà cette
// grammaire, le joueur restait seul en pixel art plat. blk()/shade() sont le
// primitif partagé (voxel.js), la silhouette (roue de dos vs de face, sac à
// dos vs guidon) reste bespoke à chaque fichier — voir le commentaire en tête
// de cyclists.js pour la justification de la technique (pas de vrai voxel 3D
// possible en Canvas 2D, on en reprend les signaux : blocs, jamais de
// courbes).
//
// Dessiné une seule fois sur un canvas hors-écran 26×34, puis blit à
// l'échelle chaque frame (image-rendering "pixelated" : pas de flou en
// agrandissant).

import { blk } from "./voxel.js";

const SPRITE_W = 26;
const SPRITE_H = 34;

// Hauteur réelle du sprite dans le monde du jeu (unités-monde) — sert à
// road.project() pour calculer sa taille à l'écran selon la profondeur.
export const HEIGHT_WORLD = 1.9;

const PAL = {
  hair: "#241609",
  hairHi: "#3c2712",
  skin: "#c98a5b",
  green: "#2f7a46",
  white: "#f0ead9",
  pants: "#22242b",
  pantsLo: "#20232b",
  // Chaussures nettement plus claires que la roue (pneu très sombre) : au
  // rayon d'origine, les deux se confondaient (retour playtest : "on dirait
  // que j'ai deux roues à droite et à gauche"). semelle = liseré clair pour
  // renforcer la silhouette.
  shoe: "#565a66",
  shoeSole: "#e8dcc0",
  frame: "#1b1b21",
  // Liseré clair sur la jante (playtest/DA : « manque de contact/lisibilité
  // avec la route, jantes »).
  rimHi: "#c7c9d2",
  tire: "#0e0e11",
  grip: "#33333b",
};

// Ombre de contact au sol : ellipse aplatie sous la roue, non tournée par le
// lean (une ombre reste plaquée au sol même quand le personnage penche dans
// un virage). Dessinée à part du sprite pré-rendu (elle dépend de x/groundY à
// l'écran, pas d'un pixel art figé), même technique que les ombres de
// véhicules dans entities.js (ellipse noire semi-transparente) — seule
// exception "courbe" du fichier, purement géométrique, pas de la DA du sprite.
function groundShadow(ctx, x, groundY, w) {
  ctx.save();
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = "#000000";
  ctx.beginPath();
  ctx.ellipse(x, groundY - w * 0.02, w * 0.24, w * 0.09, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Roue arrière, vue de DOS : le disque est perpendiculaire à la caméra, donc
// on ne voit pas sa face (contrairement à la roue avant des cyclistes, vue de
// face avec ses crampons en quinconce) mais sa TRANCHE — un bloc étroit et
// haut, sans crampons visibles par le côté. Bande claire fine au centre :
// même intention que l'ancien reflet de jante en ellipse, traduite en bloc.
function wheelEdge(ctx, cx, yTop, yBot) {
  const w = 5;
  blk(ctx, cx - w / 2, yTop, w, yBot - yTop, PAL.tire);
  blk(ctx, cx - 1, yTop + 2, 2, yBot - yTop - 4, PAL.rimHi);
}

// Cheveux bouclés en escalier de blocs (pas de courbes, cf. philosophie
// voxel) : un bloc de crâne, un étage plus large en dessous (les boucles
// débordent), un étage resserré au ras du cou. Deux petits blocs de reflet
// cassent la silhouette pour lire "boucles" plutôt que "casque plein".
function hair(ctx, cx) {
  blk(ctx, cx - 4, 1, 8, 3, PAL.hair);
  blk(ctx, cx - 6, 4, 12, 3, PAL.hair);
  blk(ctx, cx - 5, 7, 10, 2, PAL.hair);
  blk(ctx, cx - 7, 5, 3, 3, PAL.hairHi);
  blk(ctx, cx + 4, 6, 3, 3, PAL.hairHi);
}

// Mollet + pied d'une jambe, remontés de `lift` px (genou plus ou moins
// plié). Les 4 frames du cycle de pédalage (PEDAL_FRAMES ci-dessous) ne sont
// qu'une paire (liftGauche, liftDroite) différente à chaque fois — sans cette
// variation, le personnage ne fait que tanguer d'un bloc, comme posé sur une
// trottinette plutôt qu'à vélo. Semelle claire en pied de chaussure :
// contraste avec la roue derrière, pour bien lire "pied" et pas "roue".
function drawLeg(ctx, calfX, footX, lift) {
  blk(ctx, calfX, 31 - lift, 4, 3, PAL.pantsLo);
  blk(ctx, footX, 33 - lift, 5, 1, PAL.shoe);
  blk(ctx, footX, 34 - lift, 5, 1, PAL.shoeSole);
}

// "Penché en avant" : buste tassé et plus large (épaules hunchées), prise de
// guidon avancée et basse, jambes plus visibles que la silhouette assise.
// `liftLeft`/`liftRight` (0..3 px) positionnent chaque jambe pour cette frame.
//
// Vue de dos : UNE seule roue (arrière), et les deux pieds pédalent devant
// elle, resserrés près de l'axe central plutôt qu'écartés à ses deux bords —
// demandé explicitement après playtest ("j'ai l'impression d'avoir deux roues
// à droite et à gauche"). Bassin réduit et remonté (au lieu de recouvrir
// presque toute la roue) pour la laisser apparaître clairement en dessous,
// comme un vrai arrière-plan — ordre de peinture : roue → cadre → cheveux →
// torse → bras/guidon → bassin/short → jambes.
function draw(ctx, liftLeft, liftRight) {
  wheelEdge(ctx, 13, 21, 34);
  blk(ctx, 12, 19, 3, 3, PAL.frame);  // selle
  blk(ctx, 12, 16, 3, 5, PAL.frame);  // tube de selle

  hair(ctx, 13);
  blk(ctx, 11, 9, 4, 2, PAL.skin);    // nuque

  // Torse rayé (maillot), taperé en escalier au lieu d'un dégradé continu de
  // largeur par ligne — c'est justement l'escalier qui fait "voxel" plutôt
  // que "silhouette lissée".
  blk(ctx, 5, 11, 16, 3, PAL.white);
  blk(ctx, 6, 14, 14, 3, PAL.green);
  blk(ctx, 7, 17, 12, 3, PAL.white);

  // Bras vers le guidon, en deux marches (épaule → poignée).
  blk(ctx, 2, 13, 4, 3, PAL.green);
  blk(ctx, 1, 16, 4, 3, PAL.grip);
  blk(ctx, 20, 13, 4, 3, PAL.green);
  blk(ctx, 21, 16, 4, 3, PAL.grip);

  blk(ctx, 8, 20, 10, 4, PAL.green);  // bassin
  blk(ctx, 9, 24, 8, 5, PAL.pants);   // short

  drawLeg(ctx, 9, 9, liftLeft);
  drawLeg(ctx, 12, 12, liftRight);
}

function makeSprite(liftLeft, liftRight) {
  const c = document.createElement("canvas");
  c.width = SPRITE_W;
  c.height = SPRITE_H;
  const cctx = c.getContext("2d");
  cctx.imageSmoothingEnabled = false;
  draw(cctx, liftLeft, liftRight);
  return c;
}

// Cycle de pédalage à 4 frames (jambe gauche, jambe droite), pré-rendues une
// fois. render() choisit celle qui correspond à la phase courante. Gardé à 4
// frames (pas 2 comme les cyclistes) : c'est déjà le rendu le plus fluide
// pour le personnage qu'on regarde en continu, pas de raison de dégrader.
const PEDAL_FRAMES = [
  makeSprite(3, 0), // jambe gauche en haut, droite en bas
  makeSprite(2, 1), // transition
  makeSprite(0, 3), // jambe droite en haut, gauche en bas
  makeSprite(1, 2), // transition (retour)
];

// Dessine le sprite dans `ctx`, ancré par le bas (contact roue/sol) au point
// écran (x, groundY), à l'échelle `pxPerWorldUnit`. `lean` (radians) incline
// légèrement le cycliste dans les virages. `pedalPhase` choisit la frame du
// cycle de pédalage — même phase que le rebond de pédalage dans main.js,
// pour que jambes et rebond restent synchronisés.
export function render(ctx, x, groundY, pxPerWorldUnit, lean = 0, pedalPhase = 0) {
  const scale = (HEIGHT_WORLD / SPRITE_H) * pxPerWorldUnit;
  const w = SPRITE_W * scale;
  const h = SPRITE_H * scale;
  const twoPi = Math.PI * 2;
  const normalized = ((pedalPhase % twoPi) + twoPi) % twoPi;
  const frameIndex = Math.floor((normalized / twoPi) * PEDAL_FRAMES.length);
  const sprite = PEDAL_FRAMES[frameIndex];

  groundShadow(ctx, x, groundY, w);

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.translate(x, groundY);
  ctx.rotate(lean);
  ctx.drawImage(sprite, -w / 2, -h, w, h);
  ctx.restore();
}

// Halo au ramassage d'un bonus (demandé au playtest : « une très, très légère
// animation, que ça devienne un tout petit peu lumineux à l'endroit du
// joueur »). Volontairement discret : additif, opacité basse, ~0,35 s — il
// doit confirmer le ramassage du coin de l'œil, pas éclairer la scène ni
// masquer la route juste devant. `intensity` va de 1 (impact) à 0 (fini).
const GLOW_COLOR = "255, 255, 255"; // suit l'anneau des bonus (entities.js), passé au blanc avec la nouvelle DA
const GLOW_MAX_ALPHA = 0.3;         // le blanc éclaire plus fort que le vert à opacité égale

// Enveloppe du halo à partir de `intensity` (1 à l'impact → 0 à la fin).
// Montée rapide sur les 18 premiers pour cent puis longue descente en cosinus :
// le halo s'allume et s'éteint au lieu d'apparaître net et de disparaître d'un
// coup (playtest : « j'aimerais un peu plus de fade in/fade out dans le temps,
// là elle disparaît trop vite »).
const GLOW_ATTACK = 0.18;

function glowEnvelope(intensity) {
  const t = 1 - intensity; // 0 à l'impact → 1 à la fin
  if (t < GLOW_ATTACK) return t / GLOW_ATTACK;
  const u = (t - GLOW_ATTACK) / (1 - GLOW_ATTACK); // 0..1 sur la descente
  return 0.5 * (1 + Math.cos(u * Math.PI));        // 1 → 0, sans rupture de pente
}

export function renderPickupGlow(ctx, x, groundY, pxPerWorldUnit, intensity) {
  if (intensity <= 0) return;

  const envelope = glowEnvelope(intensity);
  if (envelope <= 0.001) return;

  // Grossit légèrement tout au long de l'effet : l'œil lit une impulsion qui
  // se dilate, pas un simple fondu. Centré sur le buste plutôt que sur la roue.
  const radius = HEIGHT_WORLD * pxPerWorldUnit * (0.75 + (1 - intensity) * 0.5);
  const cy = groundY - HEIGHT_WORLD * pxPerWorldUnit * 0.45;
  const alpha = GLOW_MAX_ALPHA * envelope;

  const gradient = ctx.createRadialGradient(x, cy, 0, x, cy, radius);
  gradient.addColorStop(0, `rgba(${GLOW_COLOR}, ${alpha})`);
  gradient.addColorStop(0.55, `rgba(${GLOW_COLOR}, ${alpha * 0.35})`);
  gradient.addColorStop(1, `rgba(${GLOW_COLOR}, 0)`);

  ctx.save();
  ctx.globalCompositeOperation = "lighter"; // additif : éclaire, ne repeint pas
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, cy, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
