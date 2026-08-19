// entities-render.js — Rendu des bonus/obstacles calés sur les beats : icônes
// pré-rendues en pixel art, voitures/pont en faux-3D. Extrait de entities.js
// (dette documentée dans ARCHITECTURE.md §11) : ce fichier ne décide jamais
// QUOI apparaît ni OÙ (spawn, collision, quota d'étoiles restent dans
// entities.js, ARCHITECTURE.md §5.2) — seulement COMMENT c'est dessiné.
// Dépendance à sens unique : ce module importe entities.js pour lire l'état
// déjà calculé (slotsFor/isConsumed/isBridgeSlot/isCarSlot/isAirBonus/hash),
// jamais l'inverse — entities.js ne sait pas que ce fichier existe.

import { clock } from "./clock.js";
import * as road from "./road.js";
import { HEIGHT_WORLD } from "./player.js";
import * as pedestrians from "./pedestrians.js";
import * as cyclists from "./cyclists.js";
import {
  hash,
  CAR_ROOF_H,
  slotsFor,
  isConsumed,
  isBridgeSlot,
  isCarSlot,
  isAirBonus,
  VISIBLE_Z_MAX,
  FADE_BAND,
} from "./entities.js";

// Dimensions d'une voiture, en unités-monde (inchangées) : ~4 m × 1,8 m ×
// 1,5 m à l'échelle du jeu (ROAD_HALF_WIDTH = 4), 1,5× la taille d'origine
// (demande playtest antérieure). CAR_HALF_W = 0,85 : une voie fait 2 unités,
// la voiture la remplit visiblement sans mordre sur les voisines.
// CAR_ROOF_H (hauteur du toit, importée d'entities.js) est la seule
// dimension qui compte aussi pour la collision/le saut — source unique
// partagée entre logique et rendu.
const CAR_HALF_W = 0.85;
const CAR_HALF_L = 1.275;
const CAR_BODY_H = 0.825;

// Variantes de carrosserie (demandé explicitement : « des voitures bleues,
// des voitures vertes, des voitures noires »). Rouge de charte gardé comme
// variante parmi d'autres plutôt que seule couleur possible. Chaque teinte
// vient avec sa propre ombre (`dark`, faces latérales/pare-chocs) et son
// reflet (`hi`, arête du toit) — même triplet que DANGER/DANGER_DARK/
// DANGER_HI, juste par couleur plutôt qu'une seule teinte figée.
const CAR_COLORS = [
  { base: "#e13e26", dark: "#a12c1c", hi: "#ff8a72" }, // rouge (charte)
  { base: "#2f5fb0", dark: "#20406e", hi: "#8fb3e8" }, // bleu
  { base: "#3a8f5c", dark: "#276140", hi: "#8fd4ab" }, // vert
  { base: "#1c1c22", dark: "#0d0d10", hi: "#54545c" }, // noir
  { base: "#e9e4d8", dark: "#b8b2a4", hi: "#ffffff" }, // blanc cassé
];
// Une voiture est identifiée par (slotIndex, indice dans la rangée) — stable
// tant qu'elle est visible, jamais deux fois le même hash qu'une voiture
// voisine de la même rangée (offset multiplié par un nombre premier distinct
// des autres hash() du module).
function carColorFor(slotIndex, laneOffset) {
  const h = hash(slotIndex * 97 + laneOffset * 31 + 501);
  return CAR_COLORS[Math.floor(h * CAR_COLORS.length) % CAR_COLORS.length];
}
// Phares/feux allumés (demandé explicitement : « des voitures dont les fards
// sont allumés ») — on ne voit que l'arrière d'une voiture depuis la route,
// donc ce sont les feux ARRIÈRE qui s'allument (halo rouge/ambré). ~60 % des
// voitures, pour garder de la variété plutôt qu'un allumage systématique.
function carLitFor(slotIndex, laneOffset) {
  return hash(slotIndex * 61 + laneOffset * 19 + 777) < 0.6;
}

// Hauteur des piliers, nettement au-dessus de l'apex de saut (~2,28 u avec
// hauteurSaut = 2.0, voir main.js) : le pont est infranchissable par nature,
// pas par un hitbox qui triche par rapport à ce qu'on voit à l'écran.
// DA revue le 12 août 2026 sur retour direct (« les ponts sont vraiment pas
// beaux ») — piliers en pierre de taille (palette reprise de world.js,
// FACADE_PALETTE/CORNICE_COLOR, pour rester dans la même famille que les
// façades haussmanniennes) surmontés d'une corniche claire, puis d'une
// poutre en treillis métallique vert type viaduc du métro parisien (ligne 2/6),
// d'après une référence Street View envoyée par l'artiste — plus le pont en
// bois générique d'avant.
const BRIDGE_PILLAR_HALF_W = 0.55; // un peu moins large qu'une voie (2 u), la voie reste lisible autour
const BRIDGE_PILLAR_HALF_L = 0.4;
const BRIDGE_COPING_H = 0.16;  // corniche claire entre la pierre et le métal
const BRIDGE_BEAM_H = 0.7;
const BRIDGE_HEIGHT = 3.4;     // sommet de la pierre (sous la corniche)
// Pierre réchauffée le 12 août 2026 en même temps que world.js (même
// référence pixel art) pour rester dans la même famille que les façades.
const BRIDGE_STONE = { base: "#d69666", dark: "#a8734a", hi: "#f7ecd8" };
const BRIDGE_IRON = { base: "#3d5c42", dark: "#243a29", hi: "#6b9370" };

// --- Icônes pré-rendues en pixel art (basse résolution + pas de lissage),
// même traitement que le sprite du joueur — pas de formes vectorielles à
// bords doux/contours épais qui jureraient avec le reste. ---

// Résolution native de chaque icône, en pixels. 20 → 40 en même temps que le
// doublement de ICON_WORLD ci-dessous : sans ça, une icône deux fois plus
// grosse à l'écran serait dessinée avec des pixels deux fois plus gros
// (bouillie à faible distance). Tous les dessins d'icônes sont exprimés en
// fonction de `r` (dérivé de ICON_SIZE), donc ce changement est proportionnel
// et ne touche à aucune silhouette.
const ICON_SIZE = 40;
// Taille de l'icône dans le monde (unités), au sol. 0.85 → 1.02 (+20 %) →
// 2.04 (×2, demandé : "grossir les objets en fois deux").
// ⚠️ Depuis le passage aux voies, la taille de l'icône n'a plus AUCUN effet
// sur la collision : celle-ci est un test d'égalité de voie. La taille est
// donc purement une question de lisibilité — un objet doit se lire comme
// « il est dans cette voie-là », sans mordre visuellement sur les voisines
// (une voie fait `road.LANE_WIDTH` unités de large — 2 à l'origine (4 voies),
// ≈2,67 depuis le passage à 3 voies le 17 août 2026, voir road.js).
const ICON_WORLD = 2.04;
// Les ÉTOILES bonus sont 30 % plus petites que les obstacles (demandé après
// coup : « fais 30 % plus petit »). Elles restent nettement plus grosses
// qu'avant (1.02 → 1.43), mais ne mangent plus la route. Les objets rouges,
// eux, gardent leur taille doublée — c'était la demande d'origine.
const BONUS_ICON_WORLD = ICON_WORLD * 0.7;

function circle(ctx, x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function star(ctx, cx, cy, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const radius = i % 2 === 0 ? r : r * 0.45;
    const angle = (Math.PI / 5) * i - Math.PI / 2;
    const px = cx + Math.cos(angle) * radius;
    const py = cy + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

// Plus d'anneau autour des icônes (retiré, demandé au playtest : "enlève les
// cercles blancs/rouges autour de chaque élément, c'est moche"). Le signal
// bonus/obstacle passe maintenant uniquement par la couleur de l'objet
// lui-même : les obstacles sont rendus directement en rouge de charte
// (au lieu de formes sombres qui se lisaient comme des trous dans la route),
// les bonus gardent leurs couleurs propres.
function makeIcon(draw) {
  const c = document.createElement("canvas");
  c.width = ICON_SIZE;
  c.height = ICON_SIZE;
  const ictx = c.getContext("2d");
  ictx.imageSmoothingEnabled = false;
  draw(ictx, ICON_SIZE / 2, ICON_SIZE / 2, ICON_SIZE * 0.34);
  return c;
}

// Tous les bonus sont des ÉTOILES (demandé explicitement : « tous les objets
// doivent être des étoiles »). Les 5 types du brief restent en place — mêmes
// clés, mêmes poids de spawn, mêmes valeurs de score (config.js), même
// mécanique aérienne pour `guitare` : seule la silhouette change. La valeur
// se lit désormais à la TAILLE et au cœur de l'étoile, pas à l'objet dessiné :
// plus l'étoile est grosse et lumineuse, plus elle rapporte.
//
// Pourquoi ça marche mieux que 5 objets différents : à 40 px de résolution et
// à la vitesse où défile la route, un CD, un appareil photo et un piano se
// lisent tous comme "une petite tache claire". Une forme unique déclinée en
// taille est identifiable instantanément — le joueur n'a plus qu'une seule
// règle à retenir (étoile = à prendre, rouge = à éviter).
// Étoile "façon Mario" (demandé explicitement) : aplat jaune vif, contour
// sombre épais, et surtout les DEUX YEUX qui la rendent immédiatement
// reconnaissable — c'est le détail qui fait la différence entre "une forme
// d'étoile" et "l'étoile d'un jeu de plateforme".
const STAR_FILL = "#ffcf2e";    // jaune star
const STAR_SHADE = "#e8a012";   // ombre basse (volume)
const STAR_LINE = "#2b1a06";    // contour + yeux
const STAR_EYE_WHITE = "#ffffff";

// tier : facteur de rayon (échelonne la valeur du bonus).
function starBonus(tier) {
  return makeIcon((ictx, cx, cy, r) => {
    const R = r * tier;
    // Contour : la même étoile peinte un peu plus grande en sombre, puis
    // l'étoile jaune par-dessus. Plus fiable qu'un `stroke` à cette
    // résolution (les jointures de pointes bavent).
    star(ictx, cx, cy, R * 1.16, STAR_LINE);
    star(ictx, cx, cy, R, STAR_FILL);
    // Ombre douce sur le bas : donne du volume sans dégradé.
    ictx.save();
    ictx.beginPath();
    ictx.rect(cx - R, cy + R * 0.22, R * 2, R * 1.2);
    ictx.clip();
    star(ictx, cx, cy, R, STAR_SHADE);
    ictx.restore();
    // Yeux : deux ovales blancs cerclés de sombre avec la pupille, posés au
    // centre de l'étoile comme sur l'étoile d'invincibilité.
    const eyeDx = R * 0.26, eyeY = cy - R * 0.02;
    const eyeRx = R * 0.15, eyeRy = R * 0.26;
    for (const s of [-1, 1]) {
      ictx.fillStyle = STAR_EYE_WHITE;
      ictx.beginPath();
      ictx.ellipse(cx + s * eyeDx, eyeY, eyeRx * 1.35, eyeRy * 1.2, 0, 0, Math.PI * 2);
      ictx.fill();
      ictx.fillStyle = STAR_LINE;
      ictx.beginPath();
      ictx.ellipse(cx + s * eyeDx, eyeY, eyeRx, eyeRy, 0, 0, Math.PI * 2);
      ictx.fill();
    }
  });
}

const BONUS_ICONS = {
  cd:            starBonus(0.85),   //  50 pts — la plus commune, discrète
  piano:         starBonus(0.98),   // 100 pts
  appareil:      starBonus(1.10),   // 150 pts
  collierPerles: starBonus(1.22),   // 250 pts
  guitare:       starBonus(1.4),    // 500 pts — la plus grosse, aérienne (à sauter)
};

// Rouge de charte (+ une teinte plus sombre pour le modelé) : les obstacles
// eux-mêmes signalent le danger, plus besoin d'un anneau superposé.
// Playtest : « c'est quoi les trucs rouges qui font perdre, on ne comprend
// pas trop » — silhouettes intégralement repensées pour être *reconnaissables*
// à leur forme, pas juste identifiées par la couleur rouge.
// - `voiture` remplace `portiere` : vue de dos avec toit, lunette arrière,
//   phares — on lit tout de suite "arrière d'une voiture" là où l'ancienne
//   forme n'était qu'un rectangle vertical ambigu.
// - `cone` remplace `trottinette` : cône/plot de chantier universel (base
//   large, sommet pointu, bande blanche), signalisation "danger" évidente et
//   plus lisible à faible résolution que la silhouette de trottinette qui
//   ressemblait à un simple blob elliptique au sol.
// - `pieton` : silhouette humaine plus contrastée (contour blanc autour du
//   corps + tête bien détachée), pour ne pas être pris pour un poteau/petite
//   voiture. Cône blanc de sécurité type "gilet jaune" sur le buste pour
//   signaler mieux le danger.
// Rappel : ces changements sont purement visuels — la logique de collision
// (voie occupée, comportement au saut) ne dépend que du champ e.kind, pas de la
// forme dessinée. On peut donc renommer les kinds sans toucher au moteur.
const DANGER = "#e13e26";
const DANGER_DARK = "#a12c1c";
const REFLECT = "#f7f2e6";

const OBSTACLE_ICONS = {
  cone: makeIcon((ictx, cx, cy, r) => {
    // Base (semelle rectangulaire) + corps triangulaire + bande blanche.
    const baseW = r * 1.6, baseH = r * 0.28;
    const baseY = cy + r * 0.75;
    ictx.fillStyle = DANGER_DARK;
    ictx.fillRect(cx - baseW / 2, baseY, baseW, baseH);
    ictx.fillStyle = DANGER;
    ictx.beginPath();
    ictx.moveTo(cx, cy - r * 0.9);
    ictx.lineTo(cx + r * 0.75, baseY);
    ictx.lineTo(cx - r * 0.75, baseY);
    ictx.closePath();
    ictx.fill();
    // Bande blanche de signalisation, plus haute que la moyenne pour bien se
    // détacher sur bitume sombre.
    ictx.fillStyle = REFLECT;
    ictx.beginPath();
    ictx.moveTo(cx - r * 0.5, cy + r * 0.05);
    ictx.lineTo(cx + r * 0.5, cy + r * 0.05);
    ictx.lineTo(cx + r * 0.62, cy + r * 0.28);
    ictx.lineTo(cx - r * 0.62, cy + r * 0.28);
    ictx.closePath();
    ictx.fill();
  }),
  // (voiture n'est plus une icône plate : voir renderCar3D() ci-dessous —
  // faux-3D projeté à la volée pour qu'on lise vraiment un volume sur lequel
  // le joueur peut sauter, et pour que la taille corresponde à celle d'une
  // vraie voiture à cette profondeur.)
  pieton: makeIcon((ictx, cx, cy, r) => {
    // Bras (rectangles latéraux) DESSOUS pour ne pas déborder par-dessus le
    // buste, plus fins que la version précédente.
    ictx.fillStyle = DANGER_DARK;
    ictx.fillRect(cx - r * 0.65, cy - r * 0.1, r * 0.22, r * 0.75);
    ictx.fillRect(cx + r * 0.43, cy - r * 0.1, r * 0.22, r * 0.75);
    // Buste (torse rectangulaire rouge charte)
    ictx.fillStyle = DANGER;
    ictx.fillRect(cx - r * 0.42, cy - r * 0.25, r * 0.84, r * 1.05);
    // Bande blanche horizontale (« gilet ») — signal danger universel
    ictx.fillStyle = REFLECT;
    ictx.fillRect(cx - r * 0.42, cy + r * 0.1, r * 0.84, r * 0.16);
    // Tête (cercle rouge, un peu plus grosse pour se détacher)
    circle(ictx, cx, cy - r * 0.55, r * 0.36, DANGER);
    // Jambes (2 rectangles sombres qui dépassent en bas du buste)
    ictx.fillStyle = DANGER_DARK;
    ictx.fillRect(cx - r * 0.35, cy + r * 0.8, r * 0.28, r * 0.35);
    ictx.fillRect(cx + r * 0.07, cy + r * 0.8, r * 0.28, r * 0.35);
  }),
};

// Rendu faux-3D d'une voiture : on projette 8 sommets (4 au sol × 2 hauteurs
// pour la carrosserie + 4 sommets d'habitacle) via road.project, puis on
// peint 5 faces visibles dans le bon ordre (arrière → dessus). C'est ce qui
// donne un vrai volume lisible "on peut monter dessus", au lieu d'une icône
// plate posée au sol comme précédemment.
//
// Convention : Z croissant = plus loin de la caméra. Le joueur est derrière
// la voiture, donc la face qu'on voit majoritairement est la face ARRIÈRE
// (côté Z le plus petit — la plus proche de la caméra). Les faces latérales
// apparaissent quand la voiture est décalée latéralement par rapport au
// centre de l'écran (parallaxe naturelle donnée par project()).
function renderCar3D(ctx, cx, cz, width, height, color, lit) {
  const zNear = cz - CAR_HALF_L;
  const zFar = cz + CAR_HALF_L;
  if (zFar < 0.4) return;   // entièrement passée derrière la caméra
  // Garde défensive contre les crashes signalés par playtest quand on
  // sautait sur les voitures : si le pare-chocs avant (zNear) passe sous
  // 0.3, project() → 1/z explose (échelle énorme, polygones qui débordent
  // du canvas en pixels non finis). On coupe le rendu de la voiture pile
  // avant qu'elle traverse la caméra — visuellement identique (elle est
  // déjà sortie du champ), mais plus de valeurs infinies.
  if (zNear < 0.3) return;

  // Coins au sol
  const gNL = road.project(cx - CAR_HALF_W, zNear, width, height);
  const gNR = road.project(cx + CAR_HALF_W, zNear, width, height);
  const gFL = road.project(cx - CAR_HALF_W, zFar, width, height);
  const gFR = road.project(cx + CAR_HALF_W, zFar, width, height);

  // Hauteurs projetées : on garde la même hauteur-monde à l'avant et à
  // l'arrière du véhicule, mais chaque face utilise sa propre échelle
  // (project renvoie une scale différente selon z), sinon le toit serait
  // rectangulaire au lieu de suivre la perspective.
  const bhN = CAR_BODY_H * gNL.scale;
  const bhF = CAR_BODY_H * gFL.scale;
  const rhN = CAR_ROOF_H * gNL.scale;
  const rhF = CAR_ROOF_H * gFL.scale;

  // Habitacle rétréci latéralement (piliers) + rentré en longueur (pare-brise
  // incliné, lunette arrière inclinée) — cabineInsetL rentre l'avant *et*
  // l'arrière de l'habitacle vers le centre de la voiture.
  const cabinInsetW = 0.14; // en unités-monde (chaque côté)
  const cabinInsetL = 0.20; // en unités-monde (chaque bout)
  const chN_L = road.project(cx - CAR_HALF_W + cabinInsetW, zNear + cabinInsetL, width, height);
  const chN_R = road.project(cx + CAR_HALF_W - cabinInsetW, zNear + cabinInsetL, width, height);
  const chF_L = road.project(cx - CAR_HALF_W + cabinInsetW, zFar - cabinInsetL, width, height);
  const chF_R = road.project(cx + CAR_HALF_W - cabinInsetW, zFar - cabinInsetL, width, height);

  // Coordonnées écran : carrosserie basse
  const bNL = { x: gNL.x, y: gNL.y - bhN };
  const bNR = { x: gNR.x, y: gNR.y - bhN };
  const bFL = { x: gFL.x, y: gFL.y - bhF };
  const bFR = { x: gFR.x, y: gFR.y - bhF };
  // Coordonnées écran : sommet de l'habitacle (le toit)
  const tNL = { x: chN_L.x, y: chN_L.y - rhN };
  const tNR = { x: chN_R.x, y: chN_R.y - rhN };
  const tFL = { x: chF_L.x, y: chF_L.y - rhF };
  const tFR = { x: chF_R.x, y: chF_R.y - rhF };
  // Coordonnées écran : pied de l'habitacle sur la carrosserie
  const cNL = { x: chN_L.x, y: chN_L.y - bhN };
  const cNR = { x: chN_R.x, y: chN_R.y - bhN };
  const cFL = { x: chF_L.x, y: chF_L.y - bhF };
  const cFR = { x: chF_R.x, y: chF_R.y - bhF };

  // Ombre au sol (ellipse un peu débordante)
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = "#000000";
  ctx.beginPath();
  const shX = (gNL.x + gFR.x) / 2;
  const shY = (gNL.y + gFR.y) / 2;
  ctx.ellipse(shX, shY, (gNR.x - gNL.x) / 2 * 1.05, Math.max(2, (gFL.y - gNL.y) / 2 * 0.9), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // Faces latérales (visibles selon décalage latéral). L'ordre importe :
  // on peint la face opposée au centre écran d'abord, la face côté-centre
  // par-dessus.
  const leftSideVisible = cx > 0;   // voiture à droite → on voit son côté gauche (côté route)
  const rightSideVisible = cx < 0;

  if (leftSideVisible) fillPoly(ctx, [gNL, gFL, bFL, bNL], color.dark);
  if (rightSideVisible) fillPoly(ctx, [gNR, gFR, bFR, bNR], color.dark);

  // Face arrière (celle qu'on voit toujours, côté joueur)
  fillPoly(ctx, [gNL, gNR, bNR, bNL], color.base);
  // Pare-chocs arrière (bande sombre en bas de la face arrière)
  const bumperH = (bhN) * 0.18;
  ctx.fillStyle = color.dark;
  ctx.fillRect(gNL.x, gNL.y - bumperH, gNR.x - gNL.x, bumperH);
  // Feux arrière : plus gros et plus éblouissants (demandé : « augmente la
  // taille des phares pour qu'ils éblouissent un peu plus »).
  const lightW = (gNR.x - gNL.x) * 0.18;
  const lightH = bhN * 0.35;
  const lightY = gNL.y - bhN * 0.88;
  ctx.fillStyle = lit ? "#ff5a3c" : REFLECT;
  ctx.fillRect(gNL.x + 2, lightY, lightW, lightH);
  ctx.fillRect(gNR.x - 2 - lightW, lightY, lightW, lightH);
  if (lit) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const lx of [gNL.x + 2 + lightW / 2, gNR.x - 2 - lightW / 2]) {
      const glowR = lightW * 2.8;
      const glow = ctx.createRadialGradient(lx, lightY + lightH / 2, 0, lx, lightY + lightH / 2, glowR);
      glow.addColorStop(0, "rgba(255,90,60,0.7)");
      glow.addColorStop(0.4, "rgba(255,70,50,0.35)");
      glow.addColorStop(1, "rgba(255,60,40,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(lx, lightY + lightH / 2, glowR, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // Habitacle : vitres latérales foncées (piliers), lunette arrière noire,
  // toit dessus (même couleur que la carrosserie).
  fillPoly(ctx, [cNL, cNR, tNR, tNL], "#141419"); // lunette arrière
  if (leftSideVisible) fillPoly(ctx, [cNL, cFL, tFL, tNL], "#141419");
  if (rightSideVisible) fillPoly(ctx, [cNR, cFR, tFR, tNR], "#141419");
  // Toit (face du dessus) — c'est LA face qui doit lire "on peut sauter là"
  fillPoly(ctx, [tNL, tNR, tFR, tFL], color.base);
  // Léger reflet clair sur l'arête arrière du toit
  ctx.strokeStyle = color.hi;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(tNL.x, tNL.y);
  ctx.lineTo(tNR.x, tNR.y);
  ctx.stroke();
}

// Pont : piliers en pierre de taille (mêmes coins projetés proche/loin/sol/
// sommet qu'un flanc de voiture, un par voie bloquée) surmontés d'une
// corniche claire puis d'une poutre en treillis métallique vert qui court
// sur toute la largeur de la route — d'après une référence Street View d'un
// viaduc du métro parisien envoyée par l'artiste (le pont en béton/bois
// générique de la première passe « n'était pas beau »). Même technique que
// renderCar3D (road.project + fillPoly).
function renderBridge(ctx, blockedLanes, z, width, height) {
  const zNear = z - BRIDGE_PILLAR_HALF_L;
  const zFar = z + BRIDGE_PILLAR_HALF_L;

  // Corniche + poutre : un mur plat au premier plan du pont (profondeur
  // zNear uniquement, comme la face arrière d'une voiture) — c'est la
  // surface la plus grande et la plus longtemps visible, pas la peine d'un
  // volume complet pour un élément qui reste loin au-dessus du joueur.
  const edgeL = road.project(-road.ROAD_HALF_WIDTH, zNear, width, height);
  const edgeR = road.project(road.ROAD_HALF_WIDTH, zNear, width, height);
  const stoneTopY = edgeL.y - BRIDGE_HEIGHT * edgeL.scale;
  const copingTopY = edgeL.y - (BRIDGE_HEIGHT + BRIDGE_COPING_H) * edgeL.scale;
  const beamTopY = edgeL.y - (BRIDGE_HEIGHT + BRIDGE_COPING_H + BRIDGE_BEAM_H) * edgeL.scale;

  fillPoly(ctx, [
    { x: edgeL.x, y: stoneTopY }, { x: edgeR.x, y: stoneTopY },
    { x: edgeR.x, y: copingTopY }, { x: edgeL.x, y: copingTopY },
  ], BRIDGE_STONE.hi); // corniche
  fillPoly(ctx, [
    { x: edgeL.x, y: copingTopY }, { x: edgeR.x, y: copingTopY },
    { x: edgeR.x, y: beamTopY }, { x: edgeL.x, y: beamTopY },
  ], BRIDGE_IRON.base); // poutre

  // Treillis en X réparti sur la largeur (signal "viaduc métro" plutôt que
  // poutre pleine) — nombre de croix fixe, pas espacé en unités-monde : reste
  // lisible que le pont soit encore loin ou déjà tout proche.
  ctx.strokeStyle = BRIDGE_IRON.hi;
  ctx.lineWidth = Math.max(1, (edgeR.x - edgeL.x) * 0.01);
  const bays = 6;
  const bayW = (edgeR.x - edgeL.x) / bays;
  ctx.beginPath();
  for (let i = 0; i < bays; i++) {
    const x0 = edgeL.x + i * bayW;
    const x1 = x0 + bayW;
    ctx.moveTo(x0, copingTopY);
    ctx.lineTo(x1, beamTopY);
    ctx.moveTo(x0, beamTopY);
    ctx.lineTo(x1, copingTopY);
  }
  ctx.stroke();

  for (const lane of blockedLanes) {
    const cx = road.laneX(lane);
    const gNL = road.project(cx - BRIDGE_PILLAR_HALF_W, zNear, width, height);
    const gNR = road.project(cx + BRIDGE_PILLAR_HALF_W, zNear, width, height);
    const gFL = road.project(cx - BRIDGE_PILLAR_HALF_W, zFar, width, height);
    const gFR = road.project(cx + BRIDGE_PILLAR_HALF_W, zFar, width, height);
    const topN = { x: gNL.x, y: gNL.y - BRIDGE_HEIGHT * gNL.scale };
    const topF = { x: gFL.x, y: gFL.y - BRIDGE_HEIGHT * gFL.scale };
    const topNR = { x: gNR.x, y: gNR.y - BRIDGE_HEIGHT * gNR.scale };
    const topFR = { x: gFR.x, y: gFR.y - BRIDGE_HEIGHT * gFR.scale };

    // Faces latérales, seulement celle visible depuis le centre de l'écran
    // (même règle que renderCar3D).
    const leftVisible = cx > 0;
    const rightVisible = cx < 0;
    if (leftVisible) fillPoly(ctx, [gNL, gFL, topF, topN], BRIDGE_STONE.dark);
    if (rightVisible) fillPoly(ctx, [gNR, gFR, topFR, topNR], BRIDGE_STONE.dark);
    // Face arrière (toujours visible, côté joueur).
    fillPoly(ctx, [gNL, gNR, topNR, topN], BRIDGE_STONE.base);

    // Joints de maçonnerie : deux traits horizontaux plus foncés — pierre de
    // taille assemblée par blocs plutôt qu'un pilier uni.
    ctx.strokeStyle = BRIDGE_STONE.dark;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const t of [0.35, 0.7]) {
      const y = topN.y + (gNL.y - topN.y) * t;
      ctx.moveTo(gNL.x, y);
      ctx.lineTo(gNR.x, y);
    }
    ctx.stroke();
  }
}

function fillPoly(ctx, pts, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.fill();
}

// Peint UN créneau (bonus/obstacle/pont/voiture/pieton/cycliste) déjà résolu
// en x/z. Extrait de render() pour pouvoir l'intercaler avec des éléments
// hors créneaux (extras, voir plus bas) dans le même ordre du peintre.
// Exporté sous le nom `peindreObjet` pour le tutoriel (tutorial.js), qui pose
// ses objets de démonstration hors grille : c'est le MÊME rendu que le jeu,
// donc le tuto montre exactement ce que le joueur va rencontrer.
export { paintSlot as peindreObjet };
function paintSlot(ctx, width, height, now, e) {
  // Pont : un pilier par voie BLOQUÉE (e.lanes), plus une poutre sur toute
  // la largeur de la route — voir renderBridge().
  if (isBridgeSlot(e)) {
    renderBridge(ctx, e.lanes, e.z, width, height);
    return;
  }

  // Rangée de voitures : un volume faux-3D par voie occupée, toutes à la
  // même profondeur (plus de convoi étagé en Z) — l'ordre entre elles
  // n'a pas d'importance, leurs empans en x ne se recouvrent pas.
  if (isCarSlot(e)) {
    for (let i = 0; i < e.lanes.length; i++) {
      const color = carColorFor(e.slotIndex, i);
      const lit = carLitFor(e.slotIndex, i);
      renderCar3D(ctx, road.laneX(e.lanes[i]), e.z, width, height, color, lit);
    }
    return;
  }

  // Cyclistes en sens inverse : même traitement que le piéton (projeté au
  // sol, variante déterministe tirée du slot pour qu'elle ne change jamais
  // en cours d'approche). `now` pilote l'animation de pédalage.
  if (!e.isBonus && e.kind === "cycliste") {
    const p = road.project(e.x, e.z, width, height);
    const outfitIndex = Math.abs(hash(e.slotIndex * 71 + 3) * cyclists.OUTFIT_COUNT) % cyclists.OUTFIT_COUNT;
    cyclists.render(ctx, Math.floor(outfitIndex), p.x, p.y, p.scale, now);
    return;
  }

  // Piétons animés : jambes qui alternent au fil du temps, avec des outfits.
  if (!e.isBonus && e.kind === "pieton") {
    const p = road.project(e.x, e.z, width, height);
    // Outfit déterministe basé sur le slot du piéton (jamais aléatoire une
    // fois spawné, pour stabilité à l'écran).
    // 🐛 hash() renvoie un FLOTTANT dans [0,1) : `Math.abs(h) % 4` restait
    // donc un flottant (0,45…), l'indexation du tableau donnait `undefined`,
    // et makePedestrianIcon() retombait en silence sur son outfit par défaut.
    // Mesuré : 199 slots sur 200 — les quatre outfits n'ont jamais servi.
    // Même piège que le `fillStyle` invalide (ARCHITECTURE.md §10) : aucune
    // erreur levée, juste un repli muet.
    const outfitIndex = Math.floor(hash(e.slotIndex * 7) * pedestrians.OUTFIT_TYPES.length);
    const outfitType = pedestrians.OUTFIT_TYPES[outfitIndex];
    const pedestrianDrawer = pedestrians.makePedestrianIcon(outfitType, clock.now());
    // p.y = point au SOL de la projection, et le dessinateur attend
    // justement les pieds du piéton en y (voir pedestrians.js). On passait
    // `p.y - largeur` jusqu'ici, ce qui le faisait flotter au-dessus de la
    // chaussée — d'autant plus visible depuis que les piétons ont doublé
    // de taille.
    pedestrianDrawer(ctx, p.x, p.y, p.scale);
    return;
  }

  const p = road.project(e.x, e.z, width, height);
  const icon = e.isBonus ? BONUS_ICONS[e.kind] : OBSTACLE_ICONS[e.kind];
  const size = (e.isBonus ? BONUS_ICON_WORLD : ICON_WORLD) * p.scale;
  const aerien = e.isBonus && isAirBonus(e.kind);
  // Surélevé à la hauteur du pic de saut du joueur (même formule que le hop
  // du personnage dans main.js, mais figée à son maximum : l'étoile ne
  // rebondit pas, elle flotte pile où la tête du joueur arrive en sautant).
  // Flottement lent ajouté avec les nouveaux bonus aériens : à distance,
  // l'ombre au sol se confond avec le bitume sombre et rien ne disait
  // « celui-là est en hauteur ». Une oscillation de ±8 % de la hauteur de
  // saut suffit à le lire ; elle est calée sur l'horloge musicale (donc
  // synchrone entre tous les objets à l'écran) et n'entre dans AUCUN test
  // de collision — le ramassage ne dépend que de x et de `inAir`.
  const airBase = window.CONFIG.hauteurSaut * HEIGHT_WORLD * p.scale * 0.6;
  const airOffset = aerien
    ? airBase * (1 + 0.08 * Math.sin(now * 3 + e.slotIndex))
    : 0;

  if (aerien) {
    // Ombre au sol : seul indice visuel qu'il "manque" quelque chose entre
    // l'icône et la route — le signal universel "il faut sauter ici".
    ctx.globalAlpha = 0.32;
    ctx.fillStyle = "#000000";
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, size * 0.4, size * 0.14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  ctx.drawImage(icon, p.x - size / 2, p.y - size - airOffset, size, size);
}

// `extras` : éléments décoratifs hors créneaux (ex. cameo.js) à intercaler
// dans le MÊME ordre du peintre que les bonus/obstacles, chacun sous la
// forme `{ z, draw(ctx) }`. Sans ça, un élément hors créneaux se peint
// toujours au même endroit de la séquence (avant ou après TOUT le reste),
// quelle que soit sa profondeur réelle — signalé en jeu : Soberland
// (cameo.js) apparaissait devant un pont pourtant plus proche. Un objet trop
// gros ou trop lent pour ce mécanisme (ex. un futur second créneau simultané)
// resterait hors de propos ici : ceci ne fusionne qu'UN point de profondeur
// par extra, pas un volume étendu en z.
export function render(ctx, width, height, extras = []) {
  const now = clock.now();
  const speed = road.getSpeed();
  ctx.imageSmoothingEnabled = false;

  // Plus de passe de rendu séparée pour les cyclistes : ils sont maintenant
  // des obstacles ordinaires de la grille, donc peints dans la même boucle
  // que les autres, à leur profondeur, par l'algorithme du peintre ci-dessous.
  // C'est aussi ce qui règle « des cyclistes qui passent par-dessus des
  // étoiles » — il n'existe plus deux générateurs capables de se chevaucher.

  // Un objet raté (résolu mais pas consommé, voir isConsumed()) continue sa
  // trajectoire à l'écran jusqu'à sortir du champ de vision (voir
  // visibleSlots, z < 1) au lieu de disparaître pile à hauteur du joueur.
  // Seul un objet réellement touché/ramassé (consommé) disparaît ici,
  // à l'impact.
  //
  // 🐛 Ordre de peinture inversé (playtest : « fais gaffe que les objets
  // passent les uns devant les autres »). slotsFor() renvoie les créneaux par
  // index croissant, donc par profondeur CROISSANTE : peints dans cet ordre,
  // les objets lointains se dessinaient PAR-DESSUS les proches (un bus à 60 u
  // recouvrait l'étoile à 15 u). L'algorithme du peintre veut l'inverse — du
  // plus loin au plus près — d'où le parcours à rebours. Même principe que le
  // convoi de voitures, déjà peint de la dernière à la première.
  const slots = slotsFor(now, speed);
  const sortedExtras = extras.filter((x) => x.z <= road.HORIZON_Z).sort((a, b) => b.z - a.z);
  let ei = 0;

  for (let i = slots.length - 1; i >= 0; i--) {
    const e = slots[i];
    if (isConsumed(e.slotIndex)) continue;
    // Même règle que les bâtiments : rien ne se dessine derrière l'horizon
    // courbe, où la projection se replierait. L'objet apparaît en surgissant
    // de derrière la courbe, ce qui est justement l'effet recherché.
    if (e.z > road.HORIZON_Z) continue;

    // Tout extra plus loin que ce créneau se peint avant lui (loin → près).
    while (ei < sortedExtras.length && sortedExtras[ei].z > e.z) {
      sortedExtras[ei].draw(ctx);
      ei++;
    }

    // Fondu d'apparition sur les dernières unités avant la coupure de
    // visibilité (« il faut que le chargement soit plus progressif ») : l'objet
    // se matérialise depuis la brume au lieu de surgir d'un coup à pleine
    // opacité pile sur le seuil. Même recette que les bâtiments (world.js,
    // FADE_BAND) — c'est d'ailleurs le contraste entre les deux qui rendait le
    // pop-in des objets si voyant, le décor, lui, fondait déjà proprement.
    const fade = Math.min(1, Math.max(0, (VISIBLE_Z_MAX - e.z) / FADE_BAND));
    if (fade <= 0.02) continue;
    const wasAlpha = ctx.globalAlpha;
    if (fade < 1) ctx.globalAlpha = wasAlpha * fade;
    paintSlot(ctx, width, height, now, e);
    ctx.globalAlpha = wasAlpha;
  }
  while (ei < sortedExtras.length) {
    sortedExtras[ei].draw(ctx);
    ei++;
  }
}
