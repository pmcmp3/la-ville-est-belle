// pmc.js — PMC qui fait coucou pendant le menu pause (demandé le 22 août
// 2026 : « pendant l'écran Pause, mets PMC en train de faire coucou
// doucement »). Purement décoratif : aucune collision, aucun créneau, aucun
// score — comme cameo.js, dont ce module reprend la grammaire.
//
// Trois choix qui expliquent le reste du fichier :
//
// 1. **Il est dessiné dans la SCÈNE, pas dans la carte de pause.** Le menu
//    pause est du DOM (#pause-screen) posé sur un canvas qui continue de
//    peindre la dernière frame (voir frameInterne dans main.js) : PMC vit
//    donc dans le monde du jeu, sur la route figée, derrière le voile de la
//    pause. C'est ce qui le rend "présent" plutôt que collé en sticker.
//
// 2. **Il est placé en bas à GAUCHE, près de la caméra** (PMC_Z / PMC_X) :
//    la carte de pause occupe presque toute la largeur au centre (elle est
//    zoomée ×1,2, voir index.html), donc tout ce qui est peint au milieu de
//    l'écran est masqué. Le trottoir, lui, sort du champ dès qu'on s'approche
//    de la caméra (à z = 8 la fenêtre visible ne fait que ±1,7 unité) — d'où
//    une position SUR la chaussée, seul endroit à la fois grand et visible.
//
// 3. **Il s'anime sur `performance.now()`, pas sur l'horloge de jeu.** Pendant
//    la pause l'horloge musicale est GELÉE (audio.js, pauseAnchor) : un geste
//    calé dessus resterait figé sur place, ce qui est exactement l'inverse de
//    ce qu'on veut ici. C'est le seul sprite du jeu dans ce cas, et c'est
//    voulu : il bouge PARCE QUE le reste est arrêté.

import * as road from "./road.js";
import { blk } from "./voxel.js";

const SPRITE_W = 16; // même gabarit que pedestrians.js/cameo.js : silhouette éprouvée
const SPRITE_H = 26;

// Position dans le monde, calée sur la géométrie réelle (mesurée avec
// road.project sur 375×812, le format de référence) : il occupe le tiers bas
// gauche de l'écran, sous la carte de pause, à ~235 px de haut — assez grand
// pour qu'on lise le geste, assez bas pour ne rien cacher.
const PMC_Z = 7.8;
const PMC_X = -1.0;
const HEIGHT_WORLD = 2.05;

// --- Palette : charte du jeu, reprise de pedestrians.js -------------------
const SKIN = "#c98a5b";
const SKIN_DARK = "#a86f45";
const HAIR = "#0d0d0f";
const PANTS = "#22242b";
const SHOE = "#565a66";
const SHOE_SOLE = "#e8dcc0";
const ROUGE = "#e13e26";
const ROUGE_SOMBRE = "#a12c1c";
const CREME = "#f0ead9";
const CREME_OMBRE = "#c9c2ac"; // même valeur que `topShade` du piéton crème : détache les bras du buste

// Vue de FACE (il regarde le joueur), un bras levé qui salue. `wave` (-1/0/1)
// incline l'avant-bras et la main : c'est le seul paramètre de l'animation,
// même économie de frames que le cycle de marche des piétons — au-delà, le
// geste ne se lit pas mieux à cette taille.
function draw(ctx, wave) {
  // Cheveux + tête (bloc identique au piéton).
  blk(ctx, 5, 4, 6, 3, HAIR);
  blk(ctx, 5, 7, 6, 4, SKIN);
  blk(ctx, 5, 10, 6, 1, SKIN_DARK); // ombre sous le menton

  // Bras gauche : le long du corps, immobile — c'est le contraste avec le
  // bras levé qui fait lire « il salue » plutôt que « il gesticule ».
  // ⚠️ Teinte plus SOMBRE que le buste (CREME_OMBRE), et pas la même couleur
  // comme chez le piéton : ici les deux bras touchent un buste crème, et à
  // l'écran le tout se lisait comme un seul bloc informe. Le pixel art n'a pas
  // de contour, c'est la valeur qui doit détacher les membres.
  blk(ctx, 2, 12, 2, 6, CREME_OMBRE);
  blk(ctx, 2, 18, 2, 2, SKIN);

  // Bras droit LEVÉ : épaule fixe, avant-bras qui bascule, main ouverte au
  // bout. La main se déplace de deux pixels quand l'avant-bras d'un seul : le
  // geste part du poignet, comme un vrai coucou.
  blk(ctx, 12, 12, 2, 3, CREME_OMBRE);          // épaule
  blk(ctx, 13 + wave, 5, 2, 7, CREME_OMBRE);    // avant-bras dressé
  blk(ctx, 12 + wave, 1, 3, 4, SKIN);           // main ouverte, au-dessus de la tête

  // Buste crème à bande rouge (charte : le rouge ne sert qu'aux accents).
  blk(ctx, 4, 11, 8, 9, CREME);
  blk(ctx, 4, 15, 8, 2, ROUGE);
  blk(ctx, 4, 19, 8, 1, ROUGE_SOMBRE);

  // Jambes + chaussures, immobiles : il est planté là, il attend.
  blk(ctx, 4, 20, 3, 4, PANTS);
  blk(ctx, 9, 20, 3, 4, PANTS);
  blk(ctx, 3, 24, 4, 1, SHOE);
  blk(ctx, 3, 25, 4, 1, SHOE_SOLE);
  blk(ctx, 9, 24, 4, 1, SHOE);
  blk(ctx, 9, 25, 4, 1, SHOE_SOLE);
}

function makeSprite(wave) {
  const c = document.createElement("canvas");
  c.width = SPRITE_W;
  c.height = SPRITE_H;
  const cctx = c.getContext("2d");
  cctx.imageSmoothingEnabled = false;
  draw(cctx, wave);
  return c;
}

const FRAMES = [makeSprite(-1), makeSprite(0), makeSprite(1), makeSprite(0)];
// « Doucement » : 0,55 cycle complet par seconde, soit un aller-retour de la
// main toutes les ~1,8 s. Le caméo Soberland, lui, mixe à 1,6 — trois fois
// plus vite. Ici c'est un salut, pas une agitation.
const ANIM_RATE = 0.55;

const LABEL_POLICE = '"Stage Grotesk", system-ui, sans-serif';

function drawLabel(ctx, x, y, scale, alpha) {
  const size = Math.max(10, Math.min(17, scale * 0.13));
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `500 ${size}px ${LABEL_POLICE}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.shadowColor = "rgba(0,0,0,0.6)";
  ctx.shadowBlur = 3;
  ctx.fillStyle = "#f0ead9";
  ctx.fillText("@pmc.mp3", x, y);
  ctx.restore();
}

// Fondu d'apparition/disparition : il ne doit pas surgir sec à l'ouverture du
// menu, ni rester peint sur la première frame de la reprise. `alpha` monte et
// descend sur cette durée, l'appelant n'a qu'un booléen à passer.
const FADE_S = 0.35;
let alpha = 0;
let dernierT = 0;

// `actif` = le menu pause est ouvert. Appelé à chaque frame par main.js, y
// compris quand il est faux — c'est ce qui permet au fondu de sortie de
// s'achever au lieu de rester figé à mi-course.
export function render(ctx, width, height, actif, tMs = performance.now()) {
  const t = tMs / 1000;
  const dt = dernierT === 0 ? 0 : Math.min(0.1, Math.max(0, t - dernierT));
  dernierT = t;
  alpha = Math.max(0, Math.min(1, alpha + (actif ? dt : -dt) / FADE_S));
  if (alpha <= 0.001) return;

  const p = road.project(PMC_X, PMC_Z, width, height);
  const h = HEIGHT_WORLD * p.scale;
  const w = (SPRITE_W / SPRITE_H) * h;

  // Modulo normalisé : `t` est toujours positif ici (performance.now()), mais
  // la garde coûte un test et évite exactement le crash déjà vécu dans
  // cameo.js avec une horloge négative (voir ARCHITECTURE.md §11).
  const brut = Math.floor(t * ANIM_RATE * FRAMES.length) % FRAMES.length;
  const frame = FRAMES[(brut + FRAMES.length) % FRAMES.length];

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(frame, p.x - w / 2, p.y - h, w, h);
  ctx.restore();

  drawLabel(ctx, p.x, p.y - h - 0.3 * p.scale, p.scale, alpha);
}
