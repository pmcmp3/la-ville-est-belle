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
// Plus rien n'est visible au-delà de l'horizon courbe (HORIZON_Z ≈ 95, soit
// une dizaine de bâtiments à SPACING = 10) : inutile d'en préparer davantage.
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
const MIN_HEIGHT = 16, MAX_HEIGHT = 19;
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
const FACADE_PALETTE = ["#d9c9a3", "#c7b48c", "#e6d8b8", "#b5a37e"];
// Zinc plutôt que noir plat : très légèrement bleuté, la silhouette reste
// franche sur le ciel (l'essentiel du contraste vient toujours du fait que
// c'est quasi noir) mais lit "métal" plutôt que "trou".
const ROOF_COLOR = "#20242c";
const ROOF_RIDGE_COLOR = "#0d0d10"; // faîtage + cheminées + balcons : le noir le plus dense
const CORNICE_COLOR = "#f2efe9";   // bandeau blanc cassé, le trait clair qui découpe la façade
const WINDOW_DARK = "#15151a";     // fenêtre non éclairée : trou noir dans le béton
const WINDOW_LIT = "#ff5a34";      // rares fenêtres éclairées, orange-rouge de la charte
// Volets (12 août 2026, retour direct après plusieurs références Street View
// envoyées : « revois la manière dont c'est fait [...] immeuble parisien »).
// C'est le détail le plus identifiable d'une façade haussmannienne à cette
// échelle, avant même la pierre — vert bouteille/gris ardoise/brun, jamais la
// couleur vive de charte (réservée aux objets à ramasser, voir plus haut).
const SHUTTER_PALETTE = ["#2f4a3a", "#37424a", "#4a3a2f"];
// Rez-de-chaussée : vitrine plus sombre (jamais de volets, fenêtres hautes),
// distinct des étages — signal "commerce au pied de l'immeuble" plutôt qu'un
// mur de fenêtres identiques du sol au toit.
const SHOPFRONT_COLOR = "#0e0e12";
// Auvents de commerce (référence Minecraft/Haussmann envoyée le 12 août
// 2026) : vert bouteille, bordeaux, bleu nuit — la seule touche de couleur
// franche au ras du sol, jamais le rouge/orange de charte (déjà partout sur
// le ciel et les objets à ramasser).
const AWNING_PALETTE = ["#2f6b52", "#6b2530", "#243a5e"];
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
const WINDOW_MIN_PX = 9;        // sous cette largeur/hauteur écran, pas de fenêtres (trop petit pour se lire)
// Lucarnes (dormer windows) : LE détail qui fait "toit mansardé parisien"
// plutôt que "toit en pente générique" — sans elles le toit n'était qu'un
// aplat sombre. Une par façade assez large, jamais sur le retour d'angle
// (trop étroit pour rester lisible).
const DORMER_MIN_ROOF_PX = 14;

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

const roofGradient = buildHazeGradient(ROOF_COLOR, HAZE_STRENGTH * 0.7);
const roofRidgeGradient = buildHazeGradient(ROOF_RIDGE_COLOR, HAZE_STRENGTH * 0.7);
const corniceGradient = buildHazeGradient(CORNICE_COLOR);
const windowLitGradient = buildHazeGradient(WINDOW_LIT, HAZE_STRENGTH * 0.5);
const windowDarkGradient = buildHazeGradient(WINDOW_DARK);
const shutterGradients = SHUTTER_PALETTE.map((hex) => buildHazeGradient(hex));
const shopfrontGradient = buildHazeGradient(SHOPFRONT_COLOR);
const awningGradients = AWNING_PALETTE.map((hex) => buildHazeGradient(hex));

function buildingShape(slotIndex, sideKey) {
  const h1 = hash(slotIndex * 2 + sideKey);
  const h2 = hash(slotIndex * 2 + sideKey + 100);
  const h3 = hash(slotIndex * 7 + sideKey);
  const h4 = hash(slotIndex * 11 + sideKey);
  const h5 = hash(slotIndex * 13 + sideKey);
  const h6 = hash(slotIndex * 17 + sideKey); // teinte de l'auvent
  const h7 = hash(slotIndex * 19 + sideKey); // teinte des volets

  const depth = DEPTH_MIN + h1 * (DEPTH_MAX - DEPTH_MIN);   // le long de la route (façade)
  const girth = GIRTH_MIN + h5 * (GIRTH_MAX - GIRTH_MIN);   // perpendiculaire (retour d'angle)
  const height = MIN_HEIGHT + h2 * (MAX_HEIGHT - MIN_HEIGHT);
  const paletteIndex = Math.floor(h3 * FACADE_PALETTE.length);
  const brightnessIndex = Math.floor(h4 * BRIGHTNESS_STEPS);
  const rows = Math.max(3, Math.min(7, Math.round(height / 3)));

  return {
    depth,
    girth,
    height,
    facadeGradient: facadeGradients[paletteIndex][brightnessIndex],
    sideGradient: sideGradients[paletteIndex][brightnessIndex],
    shutterGradient: shutterGradients[Math.floor(h7 * shutterGradients.length)],
    awningGradient: awningGradients[Math.floor(h6 * awningGradients.length)],
    facadeWindowCols: Math.max(3, Math.min(7, Math.round(depth * 0.9))),
    sideWindowCols: Math.max(2, Math.min(3, Math.round(girth / 2.5))),
    windowRows: rows,
  };
}

function windowIsLit(slotIndex, faceKey, r, c) {
  return hash(slotIndex * 131 + faceKey * 977 + r * 17 + c * 31) < 0.07;
}

// Trace un rectangle à sommet en plein cintre (arc en demi-cercle) — chaque
// ouverture du bâtiment (vitrine ET fenêtres d'étage depuis le 12 août 2026,
// références Minecraft/Haussmann envoyées) est taillée dans ce gabarit
// plutôt qu'un simple rectangle, qui lisait "immeuble de bureaux".
function archPath(ctx, x, top, w, h) {
  const archR = w / 2;
  ctx.beginPath();
  if (h > archR) {
    ctx.moveTo(x, top + archR);
    ctx.arc(x + archR, top + archR, archR, Math.PI, 0);
    ctx.lineTo(x + w, top + h);
    ctx.lineTo(x, top + h);
  } else {
    ctx.rect(x, top, w, h);
  }
  ctx.closePath();
}

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

  if (wallW >= WINDOW_MIN_PX && wallH >= WINDOW_MIN_PX) {
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
    const winW = cellW * 0.42;
    const marginY = wallH * 0.1;
    const cellH = (wallH - marginY) / rows;
    const winH = cellH * 0.5;
    const litColor = gradientStep(windowLitGradient, distT);
    const darkColor = gradientStep(windowDarkGradient, distT);
    const balconyColor = gradientStep(roofRidgeGradient, distT);
    const shutterColor = gradientStep(shape.shutterGradient, distT);
    const shopfrontColor = gradientStep(shopfrontGradient, distT);
    const bandeauColor = gradientStep(corniceGradient, distT);
    const frameColor = gradientStep(corniceGradient, distT);
    // Rez-de-chaussée = dernière rangée (r croît du toit vers le sol) —
    // traité à part (vitrine, pas de volets) seulement si l'immeuble a bien
    // un "étage" distinct au-dessus (sinon rows === 1, rien à séparer).
    const groundRow = rows > 1 ? rows - 1 : -1;

    for (let r = 0; r < rows; r++) {
      const rowY = wallTop + marginY + r * cellH;
      const isGround = r === groundRow;
      // Balcon filant : désormais à CHAQUE étage (plus seulement 1-2 tirés au
      // hash) — retour du 12 août 2026 avec les références Minecraft/
      // Haussmann : les façades montrées ont une ferronnerie quasi continue
      // sous chaque rangée de fenêtres, pas juste un ou deux étages isolés.
      if (isFacade && !isGround && wallW > 16) {
        const railY = rowY + winH + cellH * 0.06;
        ctx.fillStyle = balconyColor;
        ctx.fillRect(wallLeft + marginX * 0.4, railY, wallW - marginX * 0.8, Math.max(1, wallH * 0.012));
        const ticks = Math.max(4, Math.floor(cols * 2));
        const tickSpacing = (wallW - marginX * 0.8) / ticks;
        for (let t = 0; t <= ticks; t++) {
          ctx.fillRect(wallLeft + marginX * 0.4 + t * tickSpacing, railY, Math.max(1, wallH * 0.006), wallH * 0.03);
        }
      }
      // Bandeau : ligne claire juste au-dessus du rez-de-chaussée, sépare
      // visuellement "commerce" et "étages" — un des repères les plus lisibles
      // d'une façade haussmannienne à cette échelle (retour direct : « revois
      // la manière dont c'est fait [...] immeuble parisien »).
      if (isGround && wallW > 16) {
        ctx.fillStyle = bandeauColor;
        ctx.fillRect(wallLeft, rowY - cellH * 0.06, wallW, Math.max(1, wallH * 0.012));
      }
      for (let c = 0; c < cols; c++) {
        const wx = wallLeft + marginX + c * cellW + (cellW - winW) / 2;
        if (isGround) {
          // Vitrine en plein cintre — signal "devanture parisienne" bien plus
          // net qu'une fenêtre carrée.
          const shopH = Math.min(cellH * 0.92, winH * 1.7);
          const shopTop = wallBottom - shopH;
          archPath(ctx, wx, shopTop, winW, shopH);
          ctx.fillStyle = shopfrontColor;
          ctx.fill();
          // Auvent de commerce : petit pan coloré incliné au-dessus de la
          // vitrine — détail direct des références envoyées, et ça casse la
          // grille cream/ocre par une touche de couleur au ras du sol.
          const awningH = cellH * 0.16;
          const awningSlant = winW * 0.18;
          ctx.fillStyle = shape.awningGradient ? gradientStep(shape.awningGradient, distT) : shopfrontColor;
          ctx.beginPath();
          ctx.moveTo(wx - 1, shopTop);
          ctx.lineTo(wx + winW + 1, shopTop);
          ctx.lineTo(wx + winW + 1 - awningSlant, shopTop + awningH);
          ctx.lineTo(wx - 1 + awningSlant, shopTop + awningH);
          ctx.closePath();
          ctx.fill();
          continue;
        }
        // Fenêtre en plein cintre elle aussi (avant : rectangle nu, l'écart le
        // plus net avec les références envoyées — chaque ouverture y est
        // arquée, du rez-de-chaussée jusqu'au dernier étage).
        archPath(ctx, wx, rowY, winW, winH);
        ctx.fillStyle = windowIsLit(windowKey, isFacade ? 0 : 1, r, c) ? litColor : darkColor;
        ctx.fill();
        // Encadrement clair (pierre de taille autour de l'ouverture) — sans
        // lui la fenêtre se lisait comme un trou plaqué sur le mur plutôt
        // qu'une ouverture taillée dedans.
        if (winW >= 5 && winH >= 5) {
          ctx.strokeStyle = frameColor;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
        // Volets, seulement si assez de place pour rester lisibles (pas de
        // bouillie à distance) — deux blocs de part et d'autre de la fenêtre.
        // Marge -3 (pas -1) pour garder de la pierre visible entre colonnes.
        const shutterW = Math.min(winW * 0.35, (cellW - winW) / 2 - 3);
        if (shutterW >= 2) {
          ctx.fillStyle = shutterColor;
          ctx.fillRect(wx - shutterW - 1, rowY, shutterW, winH);
          ctx.fillRect(wx + winW + 1, rowY, shutterW, winH);
        }
      }
    }

    // Bossage (refends) au soubassement : blocs de pierre alternés clair/
    // sombre sur les deux arêtes verticales du mur, sur la hauteur des 2
    // premiers étages — signature très reconnaissable des références
    // envoyées, absente jusqu'ici (le mur était uni jusqu'en bas).
    if (wallW > 20) {
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

  // --- Toit mansardé + corniche --------------------------------------------
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

  // Cheminées, seulement sur la façade principale assez large à l'écran.
  if (isFacade && roofW > 12) {
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
  // parisien d'un simple pan incliné uni (retour du 12 août 2026, avec les
  // mêmes références Street View que les volets/façades).
  if (isFacade && roofW > DORMER_MIN_ROOF_PX) {
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
const FADE_BAND = 16;

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
  const z = (n + 0.5) * SPACING - distance;
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
  // (même garde que les autres détails fins du décor, voir WINDOW_MIN_PX).
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
  // dessinée par-dessus : c'est le bord partagé avec le retour d'angle, pas
  // de recouvrement fâcheux, juste la jointure du coin du bâtiment.
  const facadeCorners = faceCorners(xInner, zNear, xInner, zFar, wallHeight, roofHeight, width, height);
  drawFace(ctx, facadeCorners, shape, distT, shape.facadeWindowCols, windowKey, true);

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
  renderSide(ctx, width, height, distance, -1);
  renderSide(ctx, width, height, distance, 1);
}
