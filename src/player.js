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
// 34 → 40 le 20 août 2026 (« on doit absolument avoir la sensation que je
// pédale ») : les 6 px gagnés vont TOUS sous le personnage — la roue arrière
// dépasse maintenant nettement sous le short et les jambes, au lieu d'être
// presque entièrement cachée derrière le bassin. Le CORPS garde exactement ses
// pixels et sa taille monde d'avant (voir BODY_H ci-dessous).
const SPRITE_H = 40;
// Hauteur du CORPS en pixels sprite — c'est elle qui étalonne l'échelle
// (HEIGHT_WORLD / BODY_H), pas SPRITE_H : le personnage garde sa taille, seul
// le vélo gagne de la place en dessous. Le sprite complet fait donc
// ~2,24 unités-monde de haut à l'écran.
const BODY_H = 34;

// Hauteur réelle du PERSONNAGE dans le monde du jeu (unités-monde) — sert à
// road.project() pour calculer sa taille à l'écran selon la profondeur.
// ⚠️ NE PAS toucher en retouchant le sprite : la physique du saut (main.js,
// jumpPhysics) et la hauteur des étoiles aériennes (entities-render.js) en
// dérivent — c'est pour ça que l'agrandissement du sprite passe par BODY_H.
export const HEIGHT_WORLD = 1.9;

const PAL = {
  // Noir (retour direct : « je veux cheveux noirs »). Le highlight reste un
  // gris très sombre plutôt que du noir pur : sans lui, le bloc de reflet
  // (hairHi) disparaîtrait dans la base et les cheveux perdraient tout relief.
  hair: "#0d0d0f",
  hairHi: "#2a2a2e",
  skin: "#c98a5b",
  green: "#2f7a46",
  white: "#f0ead9",
  // Éclaircis le 20 août 2026 (ardoise moyenne au lieu de quasi-noir) : à
  // #22242b le pantalon se fondait dans le pneu (#0e0e11) — jambes et roue ne
  // faisaient qu'une masse sombre, et tout le pédalage se perdait. C'est LE
  // contraste qui fait exister le vélo derrière les jambes.
  pants: "#3a3e4e",
  pantsLo: "#31353f",
  // Chaussures nettement plus claires que la roue (pneu très sombre) : au
  // rayon d'origine, les deux se confondaient (retour playtest : "on dirait
  // que j'ai deux roues à droite et à gauche"). semelle = liseré clair pour
  // renforcer la silhouette.
  shoe: "#565a66",
  shoeSole: "#e8dcc0",
  // Plateforme de pédale sous la semelle, 1 px plus large que le pied de
  // chaque côté : gris métal clair, nettement distinct du pneu ET de la
  // chaussure — c'est elle qui dit « les pieds sont SUR des pédales ».
  pedal: "#7c8090",
  frame: "#1b1b21",
  // Crans du pneu qui défilent (1 px, à peine plus clair que le pneu) : le
  // mouvement se lit du coin de l'œil dans les bandes de roue visibles.
  tread: "#262635",
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
// ⚠️ Élargie 5 → 8 px (12 août 2026, retour direct : « mes pieds ne bougent
// pas dans le vide, on ne voit pas que je suis sur un vélo ») : à 5 px elle
// était presque entièrement recouverte par les jambes qui pédalent devant
// (voir drawLeg), donc quasi invisible en jeu malgré l'ordre de peinture
// roue→jambes.
// ⚠️ 20 août 2026 : elle descend maintenant jusqu'à y=40 (sprite agrandi) et
// dépasse nettement sous les jambes — plus des crans de pneu (`treadShift`)
// qui défilent vers le bas d'une frame à l'autre : la roue TOURNE, dans les
// bandes visibles sous le pied levé et sous les pédales.
function wheelEdge(ctx, cx, yTop, yBot, treadShift) {
  const w = 8;
  blk(ctx, cx - w / 2, yTop, w, yBot - yTop, PAL.tire);
  // Crans : une rangée claire tous les 5 px, décalée de `treadShift` px vers
  // le bas à chaque frame — boucle sans couture (5 divise l'amplitude totale).
  for (let y = yTop + (treadShift % 5); y < yBot; y += 5) {
    blk(ctx, cx - w / 2, y, w, 1, PAL.tread);
  }
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

// Une jambe complète : cuisse + mollet + pied + PÉDALE, remontés de `lift` px
// (0 = pédale en bas de course, LIFT_MAX = pédale en haut) et décalés de
// `swing` px sur le côté (genou remonté = légèrement écarté, comme un vrai
// coup de pédale vu de dos). La cuisse ne suit que la moitié du mouvement
// (elle pivote depuis la hanche, son extrémité bouge moins que le pied).
// ⚠️ Refonte du 20 août 2026 (« on doit absolument avoir la sensation que je
// pédale ») : l'amplitude passe de 3 à 6 px, la cuisse devient visible et
// mobile, et une plateforme de pédale dépasse d'1 px de chaque côté du pied —
// avant ça, seuls 3 px de mollet bougeaient et rien ne disait « vélo ».
const LIFT_MAX = 6;

function drawLeg(ctx, x, lift, swing) {
  // Cuisse : suit la moitié du mouvement, en restant raccordée au haut du
  // mollet à toutes les phases (bas de course comme genou remonté).
  blk(ctx, x + swing, 27 + Math.round((LIFT_MAX - lift) / 2), 5, 3, PAL.pants);
  blk(ctx, x + swing, 30 - lift, 4, 4, PAL.pantsLo);                                   // mollet
  blk(ctx, x - 1 + swing, 33 - lift, 5, 2, PAL.shoe);                                  // chaussure
  blk(ctx, x - 1 + swing, 35 - lift, 5, 1, PAL.shoeSole);                              // semelle
  // Pédale en bas de course à y=36 : il reste 4 px de pneu dessous — le pied
  // ne descend jamais au ras du sol, il tourne autour d'un pédalier.
  blk(ctx, x - 2 + swing, 36 - lift, 7, 1, PAL.pedal);
}

// "Penché en avant" : buste tassé et plus large (épaules hunchées), prise de
// guidon avancée et basse, jambes plus visibles que la silhouette assise.
//
// Vue de dos : UNE seule roue (arrière), les deux pieds pédalent devant elle.
// Ordre de peinture : roue → cheveux → torse → bras/guidon → bassin/short →
// jambes. `theta` est l'angle de manivelle de la frame (jambe gauche ; la
// droite est en opposition de phase) ; il en sort :
//   - lift par jambe (position verticale du pied sur le cercle de pédalier),
//   - swing par jambe (genou remonté légèrement écarté),
//   - un BALANCEMENT du buste de ±1 px à contretemps de la jambe qui pousse —
//     le « tout petit mouvement » qui fait vivre le haut du corps,
//   - le défilement des crans du pneu (la roue tourne au rythme du pédalage).
function draw(ctx, theta, frameIndex) {
  const liftL = Math.round(((1 + Math.cos(theta)) / 2) * LIFT_MAX);
  const liftR = LIFT_MAX - liftL;
  const swingL = liftL >= LIFT_MAX - 1 ? -1 : liftL <= 1 ? 1 : 0;
  const swingR = liftR >= LIFT_MAX - 1 ? 1 : liftR <= 1 ? -1 : 0;
  const sway = Math.round(Math.sin(theta));

  wheelEdge(ctx, 13, 23, 40, frameIndex);

  hair(ctx, 13 + sway);
  blk(ctx, 11 + sway, 9, 4, 2, PAL.skin);    // nuque

  // Torse rayé (maillot), taperé en escalier au lieu d'un dégradé continu de
  // largeur par ligne — c'est justement l'escalier qui fait "voxel" plutôt
  // que "silhouette lissée". Balancé de `sway` px avec le pédalage ; les bras
  // restent fixes (les mains tiennent le guidon, lui ne bouge pas).
  blk(ctx, 5 + sway, 11, 16, 3, PAL.white);
  blk(ctx, 6 + sway, 14, 14, 3, PAL.green);
  blk(ctx, 7 + sway, 17, 12, 3, PAL.white);

  // Bras vers le guidon, en deux marches (épaule → poignée).
  blk(ctx, 2, 13, 4, 3, PAL.green);
  blk(ctx, 1, 16, 4, 3, PAL.grip);
  blk(ctx, 20, 13, 4, 3, PAL.green);
  blk(ctx, 21, 16, 4, 3, PAL.grip);

  blk(ctx, 8, 20, 10, 4, PAL.green);  // bassin
  blk(ctx, 9, 24, 8, 5, PAL.pants);   // short

  drawLeg(ctx, 8, liftL, swingL);
  drawLeg(ctx, 14, liftR, swingR);
}

function makeSprite(theta, frameIndex) {
  const c = document.createElement("canvas");
  c.width = SPRITE_W;
  c.height = SPRITE_H;
  const cctx = c.getContext("2d");
  cctx.imageSmoothingEnabled = false;
  draw(cctx, theta, frameIndex);
  return c;
}

// Cycle de pédalage à 6 frames (4 avant le 20 août 2026) : l'amplitude ayant
// doublé, 4 frames faisaient sauter les jambes de 3 px d'un coup — 6 lissent
// le cercle sans coûter plus cher au rendu (toujours pré-rendues une fois).
const FRAME_COUNT = 6;
const PEDAL_FRAMES = Array.from({ length: FRAME_COUNT }, (_, k) =>
  makeSprite((k / FRAME_COUNT) * Math.PI * 2, k)
);

// Dessine le sprite dans `ctx`, ancré par le bas (contact roue/sol) au point
// écran (x, groundY), à l'échelle `pxPerWorldUnit`. `lean` (radians) incline
// légèrement le cycliste dans les virages. `pedalPhase` choisit la frame du
// cycle de pédalage — même phase que le rebond de pédalage dans main.js,
// pour que jambes et rebond restent synchronisés.
export function render(ctx, x, groundY, pxPerWorldUnit, lean = 0, pedalPhase = 0) {
  // Échelle étalonnée sur le CORPS (BODY_H), pas sur le sprite complet : le
  // personnage garde exactement sa taille d'avant l'agrandissement du canvas,
  // les 6 px ajoutés (la roue sous lui) s'affichent EN PLUS vers le bas.
  const scale = (HEIGHT_WORLD / BODY_H) * pxPerWorldUnit;
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
// 0,3 → 0,55 le 19 août 2026 (« une animation légère au moment où je
// réceptionne une étoile pour comprendre que l'étoile a bien été prise » —
// le halo existait déjà mais restait trop discret pour se voir en pleine
// course). Reste un halo additif court : il confirme le ramassage du coin de
// l'œil, il n'éclaire pas la scène et ne masque pas la route juste devant.
// Complété par les points qui s'envolent au-dessus du joueur (main.js,
// renderPickupPopups) : le halo dit « pris », le chiffre dit « combien ».
const GLOW_MAX_ALPHA = 0.55;

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
  // se dilate, pas un simple fondu. Centré sur le buste plutôt que sur la roue
  // (0,45 → 0,62 : le corps est monté avec la roue ajoutée sous lui).
  const radius = HEIGHT_WORLD * pxPerWorldUnit * (0.75 + (1 - intensity) * 0.5);
  const cy = groundY - HEIGHT_WORLD * pxPerWorldUnit * 0.62;
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
