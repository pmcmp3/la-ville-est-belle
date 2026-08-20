// world.js — Façades haussmanniennes en vrai volume 3D, de part et d'autre de
// la route : pierre parisienne crème/ocre, toit mansardé zinc-vert, fenêtres,
// balcons filants, corniche, cheminées.
//
// Avant cette refonte, chaque bâtiment était une carte plate (un seul point
// z, projeté en un rectangle) qui faisait TOUJOURS face à la caméra, comme un
// décor en carton — ça cassait la perspective. Ici chaque bâtiment est un
// vrai bloc avec une profondeur le long de la route (DEPTH) et une largeur
// perpendiculaire (GIRTH), rendu comme deux faces projetées via road.project()
// (même principe que renderCar3D/renderBus3D dans entities.js) :
//   - la FAÇADE (le long mur qui longe la rue, x = xInner fixe, z de zNear à
//     zFar) — c'est elle qui porte la rangée de fenêtres et balcons ;
//   - le RETOUR D'ANGLE (le mur pignon perpendiculaire, à z = zNear, x de
//     xInner à xOuter) — c'est lui qui donne la sensation de volume/profil,
//     comme sur un immeuble d'angle parisien.
// La façade s'étire en perspective (near/far n'ont pas la même échelle) donc
// tout son détail (fenêtres, corniche, toit) est peint puis DÉCOUPÉ (ctx.clip)
// sur le vrai quadrilatère projeté plutôt que sur un rectangle axé écran — le
// retour d'angle, lui, est à z constant donc un vrai rectangle (pas de clip
// nécessaire, mais on le fait quand même pour garder un seul chemin de code).

import {
  project,
  ROAD_HALF_WIDTH,
  HORIZON_Z,
  HAZE_MAX_Z,
  HAZE_STRENGTH,
  hexToRgb,
  buildHazeGradient,
  buildHazeGradientFromRgb,
  gradientStep,
  WORLD_GRID_SPACING,
  isCrossingSlot,
} from "./road.js";

// Alias local : SPACING vient de road.js (source unique, partagée avec les
// croisements d'avenue — voir isCrossingSlot) pour que bâtiments et carrefour
// tombent toujours sur la même grille sans jamais pouvoir diverger.
const SPACING = WORLD_GRID_SPACING;
const SIDEWALK_MARGIN = 0.5; // marge entre le bord de route et le pied des bâtiments
// Plus rien n'est visible au-delà de l'horizon courbe (HORIZON_Z ≈ 136 depuis
// le 17 août 2026, soit ≈ 13-14 bâtiments à SPACING = 10) : inutile d'en
// préparer davantage. Calculé à partir de HORIZON_Z (road.js), jamais en dur
// — suit automatiquement si CURVATURE rebouge encore.
const DEPTH_COUNT = Math.ceil(HORIZON_Z / SPACING) + 1;
// Profondeur du bloc le long de la route (< SPACING pour laisser tout juste
// un filet — une ruelle latérale — entre deux bâtiments) et largeur
// perpendiculaire (retour d'angle).
// ⚠️ Revu le 12 août 2026 (retour direct : « les bâtiments ne font pas du
// tout parisien »). Deux défauts de FORME, pas seulement de détail :
// 1. Gabarit trop variable (9 à 22, ×2,4) → skyline de tours dépareillées au
//    lieu de la ligne de corniche QUASI UNIFORME qui définit un boulevard
//    haussmannien (hauteur réglementée à l'époque). Resserré à 16-19.
// 2. Trop d'écart entre bâtiments (jusqu'à 5 unités de vide sur 10) → lecture
//    "tours isolées" plutôt que mur continu de mitoyens. Resserré à 7,5-9,3
//    (le filet de ruelle reste, juste plus étroit).
const DEPTH_MIN = 7.5, DEPTH_MAX = 9.3;
const GIRTH_MIN = 5.5, GIRTH_MAX = 9;
// 16-19 → 12-14 le 20 août 2026 (« les façades sont très verticales ») : le
// canyon écrasait la scène, un boulevard haussmannien fait 6-7 niveaux, pas
// une tour. La ligne de corniche reste quasi uniforme (écart max 2 unités).
const MIN_HEIGHT = 12, MAX_HEIGHT = 14;
// En dessous de cette profondeur caméra, la projection (focal/z) explose —
// même garde défensive que renderCar3D/renderBus3D dans entities.js.
const NEAR_Z_CLAMP = 0.6;
// ⚠️ Culling dédié aux bâtiments/props de décor, plus loin que NEAR_Z_CLAMP.
// Retour du 12 août 2026 : « ils passent en dessous de la route ça va pas ».
// En resserrant DEPTH_MIN/MAX (plus haut) pour un mur plus continu, le bord
// proche d'un bâtiment pouvait maintenant approcher z=0,6 — bien plus près
// que le joueur lui-même (PLAYER_NEAR_Z=13) — où l'échelle (focal/z) explose
// et le point au sol projeté part très loin sous l'écran, donnant
// l'impression que le bâtiment traverse la route. Aucune scénographie ne
// dépend de voir un bâtiment d'aussi près (il sort de toute façon du cadre
// par les bords à cette distance) : coupé bien plus tôt.
const SCENERY_MIN_Z = 3;

// ⚠️ Tension de DA identifiée le 12 août 2026 en creusant pourquoi « les
// bâtiments ne font pas parisien » : la palette d'origine ("DA pochette")
// visait des TOURS DE BÉTON BRUT d'après une photo de l'artiste — gris
// sourds, délibérément désaturés pour ne pas virer au "brun boueux" une fois
// mélangés à la brume rouge du couchant. L'en-tête du fichier promettait
// « pierre parisienne crème/ocre » sans jamais y toucher : les ajouts
// haussmanniens (volets, corniche, balcons) habillaient donc une teinte
// béton, pas de la pierre. Réchauffée ici — plus crème/ocre, luminosité
// gardée haute (même stratégie qu'avant : partir plus clair pour que le
// mélange avec la brume reste minéral plutôt que de virer boueux).
// ⚠️ Palette réchauffée une seconde fois le 12 août 2026, d'après une
// référence pixel art envoyée par l'artiste (cathédrale gothique, pierre
// rosée/dorée, ciel flamboyant) : « tu peux me faire des bâtiments qui
// ressemblent à ça ». Clarifié ensuite : pas question de transformer chaque
// immeuble en église (pas de tours jumelles ni de rosace généralisées, la
// forme haussmannienne reste inchangée) — « la couleur de la pierre c'est ce
// qui compte ». Seuls les tons ci-dessous bougent, la géométrie ne change pas.
// ⚠️ Palette refaite une TROISIÈME fois le 20 août 2026, d'après une photo
// d'immeuble haussmannien d'angle envoyée par l'artiste (« refais les
// immeubles sur les côtés ») : pierre CRÈME PÂLE et dorée (bien moins orangée
// que la version "cathédrale" précédente), toits mansardés en ARDOISE
// gris-bleu (retour du froid, contraste net avec la pierre chaude — c'est le
// couple pierre claire/ardoise sombre qui fait le boulevard parisien de la
// photo), ferronnerie NOIRE des balcons filants, devantures sombres à
// enseigne dorée au rez-de-chaussée.
const FACADE_PALETTE = ["#ecdcb2", "#e0cb97", "#d6bf8c", "#c9ad77"];
const ROOF_COLOR = "#3d434e";       // ardoise gris-bleu de la photo
const ROOF_RIDGE_COLOR = "#252a33"; // faîtage + cheminées : l'ardoise la plus dense
// Ferronnerie des balcons filants : quasi-noir, distinct du toit — sur la
// photo c'est le réseau de lignes sombres qui strie toute la façade claire.
const IRON_COLOR = "#1e2126";
const CORNICE_COLOR = "#f7efdc";   // bandeau crème clair, le trait qui découpe la façade
const WINDOW_DARK = "#242c3a";     // fenêtre non éclairée : vitre gris-bleu sombre (reflets de ciel)
const WINDOW_LIT = "#ff5a34";      // rares fenêtres éclairées, orange-rouge de la charte
// Rez-de-chaussée : vitrine sombre (photo : devantures noires/vert très
// profond), distinct des étages — signal "commerce au pied de l'immeuble".
const SHOPFRONT_COLOR = "#15100c";
// Auvents de commerce : teintes profondes de la photo (vert bouteille sombre,
// bordeaux, bleu nuit) — jamais le rouge/orange de charte.
const AWNING_PALETTE = ["#1f3d2f", "#471d26", "#1c2a44"];
// Enseigne dorée au-dessus des vitrines : le liseré chaud des devantures de
// la photo (lettres dorées sur fond noir) — un simple bandeau à cette échelle.
const SIGN_GOLD = "#c9a24a";
// Retour d'angle : plus sombre que la façade principale (face qui reçoit
// moins la lumière rasante du couchant) — lit comme un vrai profil. Assombri
// le 12 août 2026 (0,82 → 0,68) : retour direct « faut que tu fasses des
// immeubles en 3D quand même » — un contraste trop faible entre les deux
// faces se lit comme un mur plat plutôt qu'un vrai coin de bâtiment.
const SIDE_SHADE = 0.68;
// HAZE_MAX_Z/HAZE_STRENGTH viennent de road.js : même brume, même distance
// de fondu que le sol (via les mêmes buildHazeGradient/gradientStep), pour
// une atmosphère cohérente sur toute la scène.

const ROOF_RATIO = 0.22;        // fraction de la hauteur (monde) occupée par le toit mansardé
// ⚠️ Il n'existe PLUS de seuil de détail par taille écran (WINDOW_MIN_PX,
// DORMER_MIN_ROOF_PX — supprimés à la revue de code du 21 août 2026, ils ne
// branchaient plus sur rien depuis le passage au régime unique de façade,
// « un seul type de façade, chargé le plus tôt possible »). Tout le détail se
// peint à toute distance, seules restent des gardes à 2-3 px là où rien n'est
// traçable. Si un « pop de détail » réapparaît un jour, ce n'est PAS ici
// qu'il faut chercher — voir drawFacade3D/drawRoofAndCornice directement.

// Hash déterministe : un bâtiment garde toujours la même forme/teinte au
// même endroit (sinon ça scintille en boucle quand on repasse dessus).
function hash(n) {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

// Dégradés précalculés une seule fois au chargement du module (même
// technique que road.js pour le sol, réutilisée via buildHazeGradient/
// gradientStep plutôt que reparser des couleurs à chaque bâtiment, chaque
// frame — jusqu'à ~28 faces visibles simultanément, 2 par bâtiment).
const BRIGHTNESS_STEPS = 6; // quantise la variation continue d'origine (0.92..1.08) en paliers précalculables
const BRIGHTNESS_MIN = 0.92;
const BRIGHTNESS_MAX = 1.08;

function buildVariants(hex, shadeFactor = 1) {
  const [r, g, b] = hexToRgb(hex);
  const variants = [];
  for (let i = 0; i < BRIGHTNESS_STEPS; i++) {
    const factor = (BRIGHTNESS_MIN + (i / (BRIGHTNESS_STEPS - 1)) * (BRIGHTNESS_MAX - BRIGHTNESS_MIN)) * shadeFactor;
    variants.push(buildHazeGradientFromRgb([r * factor, g * factor, b * factor]));
  }
  return variants;
}

const facadeGradients = FACADE_PALETTE.map((hex) => buildVariants(hex, 1));
const sideGradients = FACADE_PALETTE.map((hex) => buildVariants(hex, SIDE_SHADE));

// --- Trottoirs + bordures ----------------------------------------------------
// Ajoutés le 20 août 2026 (« on a l'impression que les façades sont en dessous
// de la route ») : les immeubles posaient leurs pieds directement sur le même
// bitume sombre que la chaussée — rien ne disait où finissait la route et où
// commençait le sol des bâtiments, donc l'œil lisait les façades comme
// enfoncées. Une bande de trottoir plus claire + une bordure encore plus
// claire au ras de la chaussée ancrent les immeubles SUR un sol à eux.
const SIDEWALK_W = 1.7;              // largeur du trottoir (les bâtiments commencent à +0,5)
const SIDEWALK_COLOR = "#565049";    // pavé gris chaud, nettement plus clair que le bitume
const CURB_COLOR = "#989083";        // bordure de pierre, le trait qui sépare route/trottoir
const sidewalkGradient = buildHazeGradient(SIDEWALK_COLOR);
const curbGradient = buildHazeGradient(CURB_COLOR);

function renderSidewalks(ctx, width, height) {
  // Segments de ~14 unités : le trottoir suit la même projection que tout le
  // reste (assez court pour épouser la courbe de l'horizon, assez long pour
  // rester bon marché — ~13 quads par côté).
  const step = 14;
  for (const side of [-1, 1]) {
    const x0 = side * ROAD_HALF_WIDTH;
    const xCurb = side * (ROAD_HALF_WIDTH + 0.22);
    const x1 = side * (ROAD_HALF_WIDTH + SIDEWALK_W);
    for (let z = SCENERY_MIN_Z; z < HORIZON_Z; z += step) {
      const z2 = Math.min(z + step, HORIZON_Z);
      const distT = Math.min(1, ((z + z2) / 2) / HAZE_MAX_Z);
      const a = project(x0, z, width, height);
      const b = project(x1, z, width, height);
      const c = project(x1, z2, width, height);
      const d = project(x0, z2, width, height);
      fillPoly(ctx, [a, b, c, d], gradientStep(sidewalkGradient, distT));
      const cb = project(xCurb, z, width, height);
      const cc = project(xCurb, z2, width, height);
      fillPoly(ctx, [a, cb, cc, d], gradientStep(curbGradient, distT));
    }
  }
}

const roofGradient = buildHazeGradient(ROOF_COLOR, HAZE_STRENGTH * 0.7);
const roofRidgeGradient = buildHazeGradient(ROOF_RIDGE_COLOR, HAZE_STRENGTH * 0.7);
const ironGradient = buildHazeGradient(IRON_COLOR);
const corniceGradient = buildHazeGradient(CORNICE_COLOR);
const windowLitGradient = buildHazeGradient(WINDOW_LIT, HAZE_STRENGTH * 0.5);
const windowDarkGradient = buildHazeGradient(WINDOW_DARK);
const shopfrontGradient = buildHazeGradient(SHOPFRONT_COLOR);
const awningGradients = AWNING_PALETTE.map((hex) => buildHazeGradient(hex));
const signGoldGradient = buildHazeGradient(SIGN_GOLD);

function buildingShape(slotIndex, sideKey) {
  const h1 = hash(slotIndex * 2 + sideKey);
  const h2 = hash(slotIndex * 2 + sideKey + 100);
  const h3 = hash(slotIndex * 7 + sideKey);
  const h4 = hash(slotIndex * 11 + sideKey);
  const h5 = hash(slotIndex * 13 + sideKey);
  const h6 = hash(slotIndex * 17 + sideKey); // teinte de l'auvent

  const depth = DEPTH_MIN + h1 * (DEPTH_MAX - DEPTH_MIN);   // le long de la route (façade)
  const girth = GIRTH_MIN + h5 * (GIRTH_MAX - GIRTH_MIN);   // perpendiculaire (retour d'angle)
  const height = MIN_HEIGHT + h2 * (MAX_HEIGHT - MIN_HEIGHT);
  const paletteIndex = Math.floor(h3 * FACADE_PALETTE.length);
  const brightnessIndex = Math.floor(h4 * BRIGHTNESS_STEPS);
  // /3 → /2.4 avec la baisse de hauteur : garde 5-6 niveaux par immeuble.
  const rows = Math.max(3, Math.min(7, Math.round(height / 2.4)));

  return {
    depth,
    girth,
    height,
    facadeGradient: facadeGradients[paletteIndex][brightnessIndex],
    sideGradient: sideGradients[paletteIndex][brightnessIndex],
    awningGradient: awningGradients[Math.floor(h6 * awningGradients.length)],
    facadeWindowCols: Math.max(3, Math.min(7, Math.round(depth * 0.9))),
    sideWindowCols: Math.max(2, Math.min(3, Math.round(girth / 2.5))),
    windowRows: rows,
  };
}

function windowIsLit(slotIndex, faceKey, r, c) {
  return hash(slotIndex * 131 + faceKey * 977 + r * 17 + c * 31) < 0.07;
}

// (Les ouvertures en plein cintre du 12 août — référence cathédrale — ont été
// abandonnées le 20 août 2026 avec la photo d'immeuble haussmannien : toutes
// les fenêtres de la photo sont des rectangles hauts et droits, l'arc lisait
// "église" plus que "boulevard". Les ouvertures redeviennent des fillRect.)

// Peint une face (façade ou retour d'angle) déjà réduite à un quadrilatère
// écran { gA, gB, eaveA, eaveB, ridgeA, ridgeB } — gA/gB = coins au sol,
// eaveA/eaveB = coins à hauteur d'avant-toit, ridgeA/ridgeB = coins au faîtage.
// windowCols = nombre de colonnes de fenêtres pour CETTE face (dépend de sa
// largeur réelle en unités-monde, façade et retour d'angle n'ont pas la même).
function drawFace(ctx, corners, shape, distT, windowCols, windowKey, isFacade) {
  const { gA, gB, eaveA, eaveB, ridgeA, ridgeB } = corners;

  const wallLeft = Math.min(gA.x, gB.x, eaveA.x, eaveB.x);
  const wallRight = Math.max(gA.x, gB.x, eaveA.x, eaveB.x);
  const wallTop = Math.min(eaveA.y, eaveB.y);
  const wallBottom = Math.max(gA.y, gB.y);
  const wallW = wallRight - wallLeft;
  const wallH = wallBottom - wallTop;
  if (wallW < 1 || wallH < 1) return;

  const gradients = isFacade ? shape.facadeGradient : shape.sideGradient;
  const facadeColor = gradientStep(gradients, distT);

  // --- Mur (fenêtres, balcons) ---------------------------------------------
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(gA.x, gA.y);
  ctx.lineTo(gB.x, gB.y);
  ctx.lineTo(eaveB.x, eaveB.y);
  ctx.lineTo(eaveA.x, eaveA.y);
  ctx.closePath();
  ctx.clip();

  ctx.fillStyle = facadeColor;
  ctx.fillRect(wallLeft, wallTop, wallW, wallH);

  if (wallW >= 2 && wallH >= 2) { // plus de seuil WINDOW_MIN_PX (21 août 2026, « un seul type de façade »)
    const cols = windowCols;
    const rows = Math.max(1, Math.min(shape.windowRows, Math.floor(wallH / 6)));
    const marginX = wallW * 0.12;
    const cellW = (wallW - marginX * 2) / cols;
    // Fenêtres hautes et étroites (porte-fenêtre à la française) plutôt que
    // carrées — retour du 12 août 2026, l'un des écarts qui faisait lire
    // "immeuble de bureaux" plutôt que "immeuble parisien".
    // ⚠️ 0,78 (première tentative) laissait à peine 22 % de cellH entre deux
    // étages : à l'écran ça fusionnait en bandes verticales continues (« pas
    // du tout immeuble parisien », capture à l'appui) au lieu d'une grille de
    // fenêtres distinctes. Redescendu à 0,5 — bien plus de pierre visible
    // entre les étages, quitte à perdre un peu de l'effet "porte-fenêtre".
    // Fenêtres HAUTES et droites (photo du 20 août 2026 : portes-fenêtres
    // rectangulaires serrées, pas d'arc) — un peu plus larges qu'avant (0,42 →
    // 0,46), les volets ayant disparu il reste de la pierre entre colonnes.
    const winW = cellW * 0.46;
    const marginY = wallH * 0.1;
    const cellH = (wallH - marginY) / rows;
    const winH = cellH * 0.58;
    const litColor = gradientStep(windowLitGradient, distT);
    const darkColor = gradientStep(windowDarkGradient, distT);
    const balconyColor = gradientStep(ironGradient, distT);
    const shopfrontColor = gradientStep(shopfrontGradient, distT);
    const bandeauColor = gradientStep(corniceGradient, distT);
    const frameColor = gradientStep(corniceGradient, distT);
    const signColor = gradientStep(signGoldGradient, distT);
    // Rez-de-chaussée = dernière rangée (r croît du toit vers le sol) —
    // traité à part (vitrine, pas de volets) seulement si l'immeuble a bien
    // un "étage" distinct au-dessus (sinon rows === 1, rien à séparer).
    const groundRow = rows > 1 ? rows - 1 : -1;

    for (let r = 0; r < rows; r++) {
      const rowY = wallTop + marginY + r * cellH;
      const isGround = r === groundRow;
      // Bandeau : ligne claire juste au-dessus du rez-de-chaussée, sépare
      // visuellement "commerce" et "étages" — un des repères les plus lisibles
      // d'une façade haussmannienne à cette échelle (retour direct : « revois
      // la manière dont c'est fait [...] immeuble parisien »).
      if (isGround && wallW > 2) { // plus de seuil (21 août 2026)
        ctx.fillStyle = bandeauColor;
        ctx.fillRect(wallLeft, rowY - cellH * 0.06, wallW, Math.max(1, wallH * 0.012));
      }
      for (let c = 0; c < cols; c++) {
        const wx = wallLeft + marginX + c * cellW + (cellW - winW) / 2;
        if (isGround) {
          // Vitrine droite et sombre, presque toute la hauteur du
          // rez-de-chaussée — les devantures de la photo sont des caissons
          // noirs à peine plus étroits que la travée.
          const shopW = cellW * 0.72;
          const sx = wallLeft + marginX + c * cellW + (cellW - shopW) / 2;
          const shopH = Math.min(cellH * 0.92, winH * 1.6);
          const shopTop = wallBottom - shopH;
          ctx.fillStyle = shopfrontColor;
          ctx.fillRect(sx, shopTop, shopW, shopH);
          // Bandeau d'enseigne DORÉ en haut du caisson (photo : lettres d'or
          // sur fond noir) — remplace l'auvent incliné une vitrine sur deux,
          // l'autre garde son store de couleur profonde.
          const signH = Math.max(1, cellH * 0.1);
          if (windowIsLit(windowKey, 3, 0, c) || c % 2 === 0) {
            ctx.fillStyle = signColor;
            ctx.fillRect(sx + shopW * 0.08, shopTop + signH * 0.6, shopW * 0.84, signH * 0.8);
          } else {
            const awningH = cellH * 0.16;
            const awningSlant = shopW * 0.14;
            ctx.fillStyle = shape.awningGradient ? gradientStep(shape.awningGradient, distT) : shopfrontColor;
            ctx.beginPath();
            ctx.moveTo(sx - 1, shopTop);
            ctx.lineTo(sx + shopW + 1, shopTop);
            ctx.lineTo(sx + shopW + 1 - awningSlant, shopTop + awningH);
            ctx.lineTo(sx - 1 + awningSlant, shopTop + awningH);
            ctx.closePath();
            ctx.fill();
          }
          continue;
        }
        // Fenêtre rectangulaire haute (photo du 20 août 2026 — l'arc en plein
        // cintre de l'ancienne référence cathédrale lisait "église").
        ctx.fillStyle = windowIsLit(windowKey, isFacade ? 0 : 1, r, c) ? litColor : darkColor;
        ctx.fillRect(wx, rowY, winW, winH);
        // Encadrement clair (pierre de taille autour de l'ouverture) — sans
        // lui la fenêtre se lisait comme un trou plaqué sur le mur plutôt
        // qu'une ouverture taillée dedans.
        if (winW >= 5 && winH >= 5) {
          ctx.strokeStyle = frameColor;
          ctx.lineWidth = 1;
          ctx.strokeRect(wx, rowY, winW, winH);
        }
      }

      // Balcon filant en ferronnerie NOIRE à chaque étage : sur la photo du
      // 20 août 2026 c'est le réseau de lignes sombres qui strie toute la
      // façade claire. Le garde-corps passe DEVANT le bas des fenêtres (main
      // courante + barreaux serrés) — peint APRÈS elles, sinon les vitres le
      // recouvraient.
      if (isFacade && !isGround && wallW > 2) { // plus de seuil (21 août 2026)
        const railH = wallH * 0.032;                  // hauteur du garde-corps
        const railY = rowY + winH - railH;            // devant le BAS de la fenêtre
        const railL = wallLeft + marginX * 0.4;
        const railW = wallW - marginX * 0.8;
        ctx.fillStyle = balconyColor;
        ctx.fillRect(railL, railY, railW, Math.max(1, wallH * 0.008));
        const ticks = Math.max(6, Math.floor(cols * 3));
        const tickSpacing = railW / ticks;
        for (let t = 0; t <= ticks; t++) {
          ctx.fillRect(railL + t * tickSpacing, railY, Math.max(1, wallH * 0.005), railH);
        }
      }
    }

    // Bossage (refends) au soubassement : blocs de pierre alternés clair/
    // sombre sur les deux arêtes verticales du mur, sur la hauteur des 2
    // premiers étages — signature très reconnaissable des références
    // envoyées, absente jusqu'ici (le mur était uni jusqu'en bas).
    if (wallW > 3) { // plus de seuil (21 août 2026) — 3 px : sous ça les blocs alternés ne sont pas traçables
      const quoinRows = Math.min(rows, 2);
      const quoinH = quoinRows * cellH + marginY;
      const quoinW = Math.min(wallW * 0.07, 6);
      const blockH = Math.max(3, quoinH / 8);
      for (let i = 0; i * blockH < quoinH; i++) {
        const by = Math.max(wallTop, wallBottom - (i + 1) * blockH);
        const bh = wallBottom - (i * blockH) - by;
        if (bh <= 0) continue;
        ctx.fillStyle = i % 2 === 0 ? frameColor : facadeColor;
        ctx.fillRect(wallLeft, by, quoinW, bh);
        ctx.fillRect(wallRight - quoinW, by, quoinW, bh);
      }
    }
  }
  ctx.restore();

  // --- Toit mansardé + corniche (partagés avec drawFacade3D) ----------------
  drawRoofAndCornice(ctx, corners, distT, windowKey, isFacade, wallH);
}

// Toit mansardé (ardoise) + faîtage + cheminées + lucarnes + corniche, peints
// depuis les coins projetés — extrait de drawFace pour être partagé avec la
// façade 3D (drawFacade3D). `withDetail` = cheminées + lucarnes (façade
// principale seulement, le pignon est trop étroit).
function drawRoofAndCornice(ctx, corners, distT, windowKey, withDetail, wallH) {
  const { eaveA, eaveB, ridgeA, ridgeB } = corners;
  const roofLeft = Math.min(eaveA.x, eaveB.x, ridgeA.x, ridgeB.x);
  const roofRight = Math.max(eaveA.x, eaveB.x, ridgeA.x, ridgeB.x);
  const roofTop = Math.min(ridgeA.y, ridgeB.y);
  const roofBottom = Math.max(eaveA.y, eaveB.y);
  const roofW = roofRight - roofLeft;
  const roofH = roofBottom - roofTop;
  if (roofW < 1 || roofH < 1) return;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(eaveA.x, eaveA.y);
  ctx.lineTo(eaveB.x, eaveB.y);
  ctx.lineTo(ridgeB.x, ridgeB.y);
  ctx.lineTo(ridgeA.x, ridgeA.y);
  ctx.closePath();
  ctx.clip();

  // Cheminées, sur la façade principale (plus de seuil de taille depuis le
  // 21 août 2026 — « un seul type de façade », voir drawFacade3D).
  if (withDetail && roofW > 2) {
    const chimW = Math.max(2, roofW * 0.05);
    ctx.fillStyle = gradientStep(roofRidgeGradient, distT);
    ctx.fillRect(roofLeft + roofW * 0.2, roofTop, chimW, roofH * 0.7);
    ctx.fillRect(roofLeft + roofW * 0.68, roofTop, chimW, roofH * 0.5);
  }

  ctx.fillStyle = gradientStep(roofGradient, distT);
  ctx.fillRect(roofLeft, roofTop, roofW, roofH);
  ctx.fillStyle = gradientStep(roofRidgeGradient, distT);
  ctx.fillRect(roofLeft, roofTop, roofW, Math.max(1, roofH * 0.22));

  // Lucarnes : petites fenêtres qui percent le bas du toit, pignon
  // triangulaire au-dessus — LE détail qui distingue un vrai toit mansardé
  // parisien d'un simple pan incliné uni (retour du 12 août 2026).
  if (withDetail && roofW > 2) { // plus de seuil DORMER_MIN_ROOF_PX (21 août 2026)
    const dormerW = roofW * 0.16;
    const dormerH = roofH * 0.42;
    const dormerY = roofBottom - roofH * 0.5;
    const frameStone = gradientStep(corniceGradient, distT);
    for (const fx of [0.38, 0.58]) {
      const dx = roofLeft + roofW * fx;
      ctx.fillStyle = frameStone;
      ctx.beginPath();
      ctx.moveTo(dx, dormerY);
      ctx.lineTo(dx + dormerW / 2, dormerY - dormerW * 0.5);
      ctx.lineTo(dx + dormerW, dormerY);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(dx + dormerW * 0.12, dormerY, dormerW * 0.76, dormerH);
      ctx.fillStyle = windowIsLit(windowKey, 2, 0, Math.round(fx * 10))
        ? gradientStep(windowLitGradient, distT)
        : gradientStep(windowDarkGradient, distT);
      ctx.fillRect(dx + dormerW * 0.22, dormerY + dormerH * 0.15, dormerW * 0.56, dormerH * 0.7);
    }
  }

  ctx.restore();

  // Corniche : fine bande claire entre mur et toit (hors clip, tracée en
  // travers de l'arête pour rester nette même si le quad est très incliné).
  ctx.strokeStyle = gradientStep(corniceGradient, distT);
  ctx.lineWidth = Math.max(1, wallH * 0.02);
  ctx.beginPath();
  ctx.moveTo(eaveA.x, eaveA.y);
  ctx.lineTo(eaveB.x, eaveB.y);
  ctx.stroke();
}

function faceCorners(xA, zA, xB, zB, wallHeight, roofHeight, width, height) {
  const gA = project(xA, zA, width, height);
  const gB = project(xB, zB, width, height);
  return {
    gA,
    gB,
    eaveA: { x: gA.x, y: gA.y - wallHeight * gA.scale },
    eaveB: { x: gB.x, y: gB.y - wallHeight * gB.scale },
    ridgeA: { x: gA.x, y: gA.y - (wallHeight + roofHeight) * gA.scale },
    ridgeB: { x: gB.x, y: gB.y - (wallHeight + roofHeight) * gB.scale },
  };
}

// Fondu d'apparition juste avant l'horizon courbe (retour explicite : « les
// bâtiments mettent trop de temps à charger [...] qu'il apparaisse un peu
// plus loin et qu'il soit un peu plus agréable ») — en réalité ils
// surgissaient d'un coup à pleine opacité pile à la limite de la courbe.
// Un alpha 0→1 sur les FADE_BAND dernières unités avant HORIZON_Z fait
// matérialiser le bâtiment depuis la brume au lieu d'un pop-in. Toujours
// dans la plage de projection valide (jamais z > HORIZON_Z, voir le culling
// juste en dessous) — seule l'opacité change, pas la géométrie.
// ⚠️ 16 → 36 le 12 août 2026 (même retour, une seconde fois : « les bâtiments
// chargent très tard [...] trop proche de mon joueur »). La cause principale
// mesurée était ailleurs (les seuils de détail par taille écran, voir
// WINDOW_MIN_PX plus haut — fenêtres/lucarnes/balcons qui popent un par un
// près du joueur), mais élargir aussi cette bande rend le tout début de
// matérialisation plus doux et plus loin, en cohérence.
// 36 → 48 le 19 août 2026, avec l'horizon repoussé à ≈155 u (road.js) et le
// fondu jumeau ajouté côté objets (entities.js, FADE_BAND) : même demande
// (« que le chargement soit plus progressif »), et il faut que décor et objets
// se matérialisent au même rythme, sinon l'un des deux a l'air en retard sur
// l'autre — c'est précisément ce décalage qui a fait remonter le problème.
const FADE_BAND = 62;

// --- Feux de circulation, aux croisements -----------------------------------
// Demandé le 12 août 2026 avec les croisements (« tu peux rajouter des feux
// d'ailleurs sur le côté »). Prop simple posée au même endroit que le
// bâtiment sauté par isCrossingSlot (voir renderBuilding) : un poteau + une
// tête tricolore. Revu le 12 août 2026 (« les poteaux des feux fais pareil »,
// même retour que les piliers du pont) : un poteau plat en un seul fillRect
// lisait "carton", pas "objet planté au bord du trottoir". Le poteau (fin,
// rond) prend un dégradé 3 tons façon métal cintré ; la tête (un vrai volume
// carré) prend un flanc projeté à z différent, même technique que les
// piliers de pont/renderCar3D (road.project + polygone).
const TRAFFIC_POLE_COLOR = "#2a2a2e";
const TRAFFIC_POLE_HI = "#5a5d68";   // reflet métallique sur l'arête éclairée du poteau
const TRAFFIC_BOX_COLOR = "#1c1c20";
const TRAFFIC_BOX_DARK = "#0e0e11";  // flanc de la tête, dans l'ombre
const TRAFFIC_RED = "#e13e26";   // rouge de charte, cohérent avec le reste des accents
const TRAFFIC_YELLOW = "#f0a83c";
const TRAFFIC_GREEN = "#3a8f5c";
const TRAFFIC_POLE_HEIGHT = 3.2;
const TRAFFIC_POLE_HALF_W = 0.05; // demi-épaisseur du poteau, en unités-monde
const TRAFFIC_BOX_H = 0.9;
const TRAFFIC_BOX_HALF_W = 0.17;
const TRAFFIC_BOX_HALF_D = 0.14; // profondeur de la tête — c'est elle qui donne le flanc

const trafficPoleGradient = buildHazeGradient(TRAFFIC_POLE_COLOR);
const trafficPoleHiGradient = buildHazeGradient(TRAFFIC_POLE_HI);
const trafficBoxGradient = buildHazeGradient(TRAFFIC_BOX_COLOR);
const trafficBoxDarkGradient = buildHazeGradient(TRAFFIC_BOX_DARK);
const trafficRedGradient = buildHazeGradient(TRAFFIC_RED);
const trafficYellowGradient = buildHazeGradient(TRAFFIC_YELLOW);
const trafficGreenGradient = buildHazeGradient(TRAFFIC_GREEN);

function fillPoly(ctx, pts, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.fill();
}

function renderTrafficLight(ctx, n, side, distance, width, height) {
  // ⚠️ AVANT l'entrée du carrefour, plus en son centre (retour du 20 août
  // 2026 : « tu les as mis au milieu de la route quand ça croise, c'est pas
  // très logique — il faudrait qu'ils soient un peu avant, par rapport à
  // moi »). Le créneau de croisement s'étend de n·SPACING à (n+1)·SPACING :
  // à (n + 0,5) le feu était planté au milieu de l'avenue transversale.
  // Posé à 0,3 unité avant le bord du carrefour — dans le filet de ruelle
  // qui suit le bâtiment du créneau n−1 (sa profondeur max laisse 0,35 u de
  // vide avant la limite, voir DEPTH_MAX/SPACING), donc jamais recouvert par
  // la façade peinte après lui dans l'ordre du peintre.
  const z = n * SPACING - 0.3 - distance;
  if (z < SCENERY_MIN_Z || z > HORIZON_Z) return;
  const fadeAlpha = Math.min(1, (HORIZON_Z - z) / FADE_BAND);
  if (fadeAlpha <= 0.02) return;

  // Un peu plus près du bord de route que les bâtiments (SIDEWALK_MARGIN
  // complet) : le feu doit lire comme posé au bord du trottoir, pas en
  // retrait dans la ruelle entre deux immeubles.
  const x = side * (ROAD_HALF_WIDTH + SIDEWALK_MARGIN * 0.6);
  const distT = Math.min(1, z / HAZE_MAX_Z);

  const wasAlpha = ctx.globalAlpha;
  if (fadeAlpha < 1) ctx.globalAlpha = wasAlpha * fadeAlpha;

  // Poteau : base + reflet vertical décalé (façon tube cintré), pas un vrai
  // volume — trop fin pour qu'un flanc projeté reste visible, mais un aplat
  // seul ne suffisait pas non plus.
  const ground = project(x, z, width, height);
  const poleTopY = ground.y - TRAFFIC_POLE_HEIGHT * ground.scale;
  const poleW = Math.max(2, TRAFFIC_POLE_HALF_W * 2 * ground.scale * 3);
  const poleX = ground.x - poleW / 2;
  ctx.fillStyle = gradientStep(trafficPoleGradient, distT);
  ctx.fillRect(poleX, poleTopY, poleW, ground.y - poleTopY);
  if (poleW >= 3) {
    ctx.fillStyle = gradientStep(trafficPoleHiGradient, distT);
    ctx.fillRect(poleX + poleW * 0.62, poleTopY, Math.max(1, poleW * 0.2), ground.y - poleTopY);
  }

  // Tête tricolore : vrai volume, flanc projeté à zFar pour donner un profil
  // (même principe que les piliers de pont/renderCar3D).
  const zNear = z - TRAFFIC_BOX_HALF_D;
  const zFar = z + TRAFFIC_BOX_HALF_D;
  const gN = project(x - TRAFFIC_BOX_HALF_W, zNear, width, height);
  const gNR = project(x + TRAFFIC_BOX_HALF_W, zNear, width, height);
  const gF = project(x - TRAFFIC_BOX_HALF_W, zFar, width, height);
  const gFR = project(x + TRAFFIC_BOX_HALF_W, zFar, width, height);
  const boxBotN = poleTopY;
  const boxTopN = poleTopY - TRAFFIC_BOX_H * gN.scale;
  const boxBotF = gF.y - TRAFFIC_POLE_HEIGHT * gF.scale;
  const boxTopF = boxBotF - TRAFFIC_BOX_H * gF.scale;
  const topN = { x: gN.x, y: boxTopN };
  const topNR = { x: gNR.x, y: boxTopN };
  const topF = { x: gF.x, y: boxTopF };
  const topFR = { x: gFR.x, y: boxTopF };
  const botN = { x: gN.x, y: boxBotN };
  const botNR = { x: gNR.x, y: boxBotN };
  const botF = { x: gF.x, y: boxBotF };

  const leftVisible = x > 0;
  const boxDark = gradientStep(trafficBoxDarkGradient, distT);
  const boxBase = gradientStep(trafficBoxGradient, distT);
  // Un seul flanc visible à la fois (celui qui fait face au centre de
  // l'écran), même règle que renderCar3D/les piliers de pont.
  if (leftVisible) fillPoly(ctx, [botN, botF, topF, topN], boxDark);
  else fillPoly(ctx, [botNR, botF, topF, topNR], boxDark);
  fillPoly(ctx, [botN, botNR, topNR, topN], boxBase);

  const boxW = gNR.x - gN.x;
  // Trois pastilles seulement si la tête est assez large pour rester lisible
  // (garde dégénérée à 3 px — sous ça, trois cercles ne sont pas traçables).
  if (Math.abs(boxW) >= 3) {
    const dotR = Math.abs(boxW) * 0.28;
    const cx = (gN.x + gNR.x) / 2;
    const dotColors = [
      gradientStep(trafficRedGradient, distT),
      gradientStep(trafficYellowGradient, distT),
      gradientStep(trafficGreenGradient, distT),
    ];
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = dotColors[i];
      const cy = boxTopN + (boxBotN - boxTopN) * (0.22 + i * 0.28);
      ctx.beginPath();
      ctx.arc(cx, cy, dotR, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.globalAlpha = wasAlpha;
}

// --- Façade en VRAIE perspective (20 août 2026) ------------------------------
// « Il faut que ce soit des bâtiments en 3D — là ils sont en 2D. » Le
// diagnostic : drawFace peint fenêtres et balcons sur une GRILLE ÉCRAN plaquée
// dans le quadrilatère projeté — les ouvertures ne fuient pas vers l'horizon
// avec le mur qui les porte, donc l'œil lit un décor plat. Ici, chaque
// fenêtre, vitrine, bandeau et balcon est positionné en COORDONNÉES MONDE
// (hauteur h, profondeur z le long de la rue) et projeté individuellement —
// même technique que les toits des voitures ou les piliers de pont. Les
// balcons, eux, sont en VRAIE SAILLIE : une dalle qui avance vers la route
// (x plus proche de l'axe), garde-corps de fer à son bord — c'est le relief
// qui manquait. Le pignon (retour d'angle, à z constant) garde drawFace : sa
// face est un vrai rectangle écran, la grille y est déjà juste.
const BALCONY_DEPTH = 0.38; // saillie de la dalle vers la route, en unités-monde
const BALCONY_RAIL_H = 0.7; // hauteur du garde-corps au bord de la dalle

function drawBalcony(ctx, side, xInner, zA, zB, h, width, height, ironColor, slabColor) {
  const xOut = xInner - side * BALCONY_DEPTH; // vers l'axe de la route
  const gInA = project(xInner, zA, width, height);
  const gInB = project(xInner, zB, width, height);
  const gOutA = project(xOut, zA, width, height);
  const gOutB = project(xOut, zB, width, height);
  const at = (g, hh) => ({ x: g.x, y: g.y - hh * g.scale });

  // Dalle : vue d'en bas (la caméra est au ras du sol), c'est son dessous qui
  // se voit — un quad sombre qui AVANCE du mur vers la rue.
  fillPoly(ctx, [at(gInA, h), at(gInB, h), at(gOutB, h), at(gOutA, h)], slabColor);

  // Garde-corps au bord extérieur : main courante + barreaux interpolés entre
  // les deux extrémités projetées (chaque barreau est droit à l'écran, mais
  // leurs pieds suivent la fuite de la dalle — c'est ça qui "fait 3D").
  // ⚠️ Motif enrichi le 20 août 2026 (« il me faudrait des balcons beaucoup
  // plus parisiens ») : des barreaux verticaux seuls lisaient "barrière de
  // chantier". Un garde-corps haussmannien, c'est de la ferronnerie OUVRAGÉE —
  // ici la version la moins chère qui la fasse lire : une lisse basse en plus
  // de la main courante, et des CROISILLONS (X de fer forgé) entre les
  // barreaux, le motif le plus reconnaissable des balcons parisiens.
  const botA = at(gOutA, h);
  const botB = at(gOutB, h);
  const topA = at(gOutA, h + BALCONY_RAIL_H);
  const topB = at(gOutB, h + BALCONY_RAIL_H);
  const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  ctx.strokeStyle = ironColor;
  ctx.lineWidth = Math.max(1, gOutA.scale * 0.045);
  ctx.beginPath();
  // Main courante + lisse basse (à ~15 % au-dessus de la dalle).
  ctx.moveTo(topA.x, topA.y);
  ctx.lineTo(topB.x, topB.y);
  const lowA = lerp(botA, topA, 0.15);
  const lowB = lerp(botB, topB, 0.15);
  ctx.moveTo(lowA.x, lowA.y);
  ctx.lineTo(lowB.x, lowB.y);
  const bars = 9;
  for (let i = 0; i <= bars; i++) {
    const t = i / bars;
    ctx.moveTo(botA.x + (botB.x - botA.x) * t, botA.y + (botB.y - botA.y) * t);
    ctx.lineTo(topA.x + (topB.x - topA.x) * t, topA.y + (topB.y - topA.y) * t);
  }
  ctx.stroke();
  // Croisillons entre la lisse basse et ~70 % de la hauteur, un X par travée.
  // Trait plus fin que les barreaux (la dentelle, pas la structure). Plus de
  // seuil de taille (21 août 2026, « un seul type de façade ») : au loin les X
  // fusionnent en un liseré dense — la même ferronnerie, juste plus loin.
  {
    ctx.lineWidth = Math.max(0.6, gOutA.scale * 0.025);
    ctx.beginPath();
    for (let i = 0; i < bars; i++) {
      const t0 = i / bars;
      const t1 = (i + 1) / bars;
      const b0 = lerp(lerp(botA, botB, t0), lerp(topA, topB, t0), 0.15);
      const b1 = lerp(lerp(botA, botB, t1), lerp(topA, topB, t1), 0.15);
      const h0 = lerp(lerp(botA, botB, t0), lerp(topA, topB, t0), 0.7);
      const h1 = lerp(lerp(botA, botB, t1), lerp(topA, topB, t1), 0.7);
      ctx.moveTo(b0.x, b0.y);
      ctx.lineTo(h1.x, h1.y);
      ctx.moveTo(b1.x, b1.y);
      ctx.lineTo(h0.x, h0.y);
    }
    ctx.stroke();
  }
}

function drawFacade3D(ctx, shape, side, xInner, zNear, zFar, wallHeight, roofHeight, distT, windowKey, width, height) {
  const corners = faceCorners(xInner, zNear, xInner, zFar, wallHeight, roofHeight, width, height);
  const { gA, gB, eaveA, eaveB } = corners;

  // Mur de fond, sur le vrai quadrilatère projeté.
  fillPoly(ctx, [gA, gB, eaveB, eaveA], gradientStep(shape.facadeGradient, distT));

  const facadePxW = Math.abs(gB.x - gA.x);
  const nearPxH = Math.abs(gA.y - eaveA.y);
  drawRoofAndCornice(ctx, corners, distT, windowKey, true, nearPxH); // détail toujours, voir plus bas

  // ⚠️ UN SEUL régime de rendu depuis le 21 août 2026, plus aucun seuil de
  // distance. Retour direct, le troisième sur le même sujet : « il y a un
  // type de façade chargé à distance, un deuxième à distance intermédiaire et
  // un troisième très proche — je veux UN SEUL type, le plus proche, chargé
  // le plus tôt possible ». Les paliers de détail par taille écran (mur nu →
  // grille de fenêtres → grille + garde-corps/balcons) faisaient exactement
  // ces trois familles d'immeubles ; ils sautent tous : la façade complète
  // (fenêtres, vitrines, enseignes, garde-corps, balcons en saillie) se peint
  // dès que le bâtiment sort de la brume, à n'importe quelle distance. À 5 px
  // de large, la grille devient une texture serrée — c'est voulu, ça se lit
  // « immeuble habité » et surtout ça ne CHANGE plus en approchant. Seule
  // garde restante : une façade sous 2 px, où rien n'est traçable.
  if (facadePxW < 2 || nearPxH < 2) return;

  const at = (z, h) => {
    const g = project(xInner, z, width, height);
    return { x: g.x, y: g.y - h * g.scale, scale: g.scale };
  };

  const rows = shape.windowRows;             // r = 0 : rez-de-chaussée
  const rowH = wallHeight / rows;
  const darkColor = gradientStep(windowDarkGradient, distT);
  const cols = shape.facadeWindowCols;
  const colD = (zFar - zNear) / cols;
  const litColor = gradientStep(windowLitGradient, distT);
  const ironColor = gradientStep(ironGradient, distT);
  const shopColor = gradientStep(shopfrontGradient, distT);
  const bandeauColor = gradientStep(corniceGradient, distT);
  const signColor = gradientStep(signGoldGradient, distT);
  const slabColor = gradientStep(roofRidgeGradient, distT);
  const detail = true; // plus de palier : garde-corps et balcons toujours peints

  for (let r = 0; r < rows; r++) {
    const isGround = r === 0;
    const hBot = r * rowH + (isGround ? 0.08 : rowH * 0.2);
    const hTop = (r + 1) * rowH - rowH * (isGround ? 0.24 : 0.14);

    for (let c = 0; c < cols; c++) {
      const zA = zNear + c * colD + colD * (isGround ? 0.16 : 0.3);
      const zB = zNear + (c + 1) * colD - colD * (isGround ? 0.16 : 0.3);
      const pTL = at(zA, hTop), pTR = at(zB, hTop), pBR = at(zB, hBot), pBL = at(zA, hBot);
      if (isGround) {
        // Vitrine sombre pleine hauteur + enseigne (dorée une travée sur
        // deux, store de couleur profonde sinon).
        fillPoly(ctx, [pTL, pTR, pBR, pBL], shopColor);
        const hSign = hTop - rowH * 0.16;
        const bande = windowIsLit(windowKey, 3, 0, c) || c % 2 === 0
          ? signColor
          : gradientStep(shape.awningGradient, distT);
        fillPoly(ctx, [at(zA, hTop), at(zB, hTop), at(zB, hSign), at(zA, hSign)], bande);
      } else {
        fillPoly(ctx, [pTL, pTR, pBR, pBL],
          windowIsLit(windowKey, 0, r, c) ? litColor : darkColor);
        // Garde-corps de fenêtre (ferronnerie devant le bas de l'ouverture) :
        // main courante + quelques barreaux — la ligne seule ne lisait pas
        // "fer forgé" (« des balcons beaucoup plus parisiens », 20 août 2026).
        if (detail) {
          const hRail = hBot + (hTop - hBot) * 0.3;
          ctx.strokeStyle = ironColor;
          ctx.lineWidth = 1;
          ctx.beginPath();
          const rA = at(zA, hRail), rB = at(zB, hRail);
          const bA = at(zA, hBot), bB = at(zB, hBot);
          ctx.moveTo(rA.x, rA.y);
          ctx.lineTo(rB.x, rB.y);
          for (let i = 1; i < 4; i++) {
            const t = i / 4;
            ctx.moveTo(rA.x + (rB.x - rA.x) * t, rA.y + (rB.y - rA.y) * t);
            ctx.lineTo(bA.x + (bB.x - bA.x) * t, bA.y + (bB.y - bA.y) * t);
          }
          ctx.stroke();
        }
      }
    }

    // Bandeau de pierre claire au-dessus du rez-de-chaussée.
    if (isGround) {
      const hBande = rowH;
      fillPoly(ctx, [at(zNear, hBande + 0.1), at(zFar, hBande + 0.1), at(zFar, hBande), at(zNear, hBande)], bandeauColor);
    }

    // Balcon filant EN SAILLIE aux étages nobles (2e et dernier — c'est le
    // rythme de la photo : deux lignes fortes, pas une grille sur chaque
    // niveau, les autres étages gardant leurs garde-corps de fenêtre).
    // Plus aucun seuil de taille depuis le 21 août 2026 (« un seul type de
    // façade, chargé le plus tôt possible ») — voir le commentaire de tête.
    if (!isGround && (r === 2 || r === rows - 1)) {
      drawBalcony(ctx, side, xInner, zNear + colD * 0.12, zFar - colD * 0.12, r * rowH, width, height, ironColor, slabColor);
    }
  }
}

function renderBuilding(ctx, n, sideKey, side, distance, width, height) {
  if (isCrossingSlot(n)) return; // carrefour : pas de bâtiment ici, voir renderTrafficLight
  const shape = buildingShape(n, sideKey);
  const centerAbsolute = (n + 0.5) * SPACING;
  let zNear = centerAbsolute - distance - shape.depth / 2;
  let zFar = centerAbsolute - distance + shape.depth / 2;
  if (zFar < SCENERY_MIN_Z) return;  // entièrement passé derrière la caméra (ou trop proche, voir SCENERY_MIN_Z)
  if (zNear > HORIZON_Z) return;     // entièrement au-delà de l'horizon courbe
  zNear = Math.max(zNear, SCENERY_MIN_Z);
  zFar = Math.min(zFar, HORIZON_Z);

  const fadeAlpha = Math.min(1, (HORIZON_Z - zNear) / FADE_BAND);
  if (fadeAlpha <= 0.02) return; // encore fondu dans la brume, pas la peine de peindre

  const xInner = side * (ROAD_HALF_WIDTH + SIDEWALK_MARGIN);
  const xOuter = side * (ROAD_HALF_WIDTH + SIDEWALK_MARGIN + shape.girth);
  const wallHeight = shape.height * (1 - ROOF_RATIO);
  const roofHeight = shape.height * ROOF_RATIO;

  const distT = Math.min(1, ((zNear + zFar) / 2) / HAZE_MAX_Z);
  const windowKey = n * 4 + sideKey;

  const wasAlpha = ctx.globalAlpha;
  if (fadeAlpha < 1) ctx.globalAlpha = wasAlpha * fadeAlpha;

  // Retour d'angle (mur pignon, perpendiculaire à la route, à z = zNear) —
  // toujours face à la caméra puisque c'est le bord le plus proche du bloc :
  // c'est lui qui porte la sensation de volume/profil.
  const sideCorners = faceCorners(xInner, zNear, xOuter, zNear, wallHeight, roofHeight, width, height);
  drawFace(ctx, sideCorners, shape, distT, shape.sideWindowCols, windowKey, false);

  // Façade (le long mur qui longe la rue, à x = xInner, de zNear à zFar) —
  // dessinée par-dessus, en VRAIE perspective (voir drawFacade3D) : chaque
  // ouverture est projetée à sa position monde, les balcons sont en saillie.
  drawFacade3D(ctx, shape, side, xInner, zNear, zFar, wallHeight, roofHeight, distT, windowKey, width, height);

  ctx.globalAlpha = wasAlpha;
}

function renderSide(ctx, width, height, distance, side) {
  const sideKey = side < 0 ? 0 : 1;
  const startSlot = Math.floor(distance / SPACING) - 1;

  for (let n = startSlot + DEPTH_COUNT; n >= startSlot; n--) {
    if (isCrossingSlot(n)) {
      renderTrafficLight(ctx, n, side, distance, width, height);
      continue;
    }
    renderBuilding(ctx, n, sideKey, side, distance, width, height);
  }
}

export function render(ctx, width, height, distance) {
  // Trottoirs d'abord : les bâtiments (et les feux) se posent dessus.
  renderSidewalks(ctx, width, height);
  renderSide(ctx, width, height, distance, -1);
  renderSide(ctx, width, height, distance, 1);
}
