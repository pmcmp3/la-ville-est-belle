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
// Profondeur du bloc le long de la route (< SPACING pour laisser un espace —
// une ruelle latérale — entre deux bâtiments, ce qui aide à lire des volumes
// séparés plutôt qu'un mur continu) et largeur perpendiculaire (retour d'angle).
// GIRTH agrandi pour une meilleure sensation de volume en 3D (retours d'angle
// plus visibles en perspective, coins du bâtiment plus prononcés).
const DEPTH_MIN = 5, DEPTH_MAX = 8;
const GIRTH_MIN = 5.5, GIRTH_MAX = 9;
const MIN_HEIGHT = 9, MAX_HEIGHT = 22;
// En dessous de cette profondeur caméra, la projection (focal/z) explose —
// même garde défensive que renderCar3D/renderBus3D dans entities.js.
const NEAR_Z_CLAMP = 0.6;

// DA pochette : tours de béton brut, gris chauds et sourds, tranchées par des
// toits quasi noirs et des corniches blanches. Le décor tient le fond du
// cadre en noir/blanc/béton ; la couleur vive est réservée au ciel, au rouge
// de la charte et aux objets à ramasser — comme sur la photo, où seuls le
// mur rouge et le bleu du ciel claquent sur le béton.
// Gris clairs : mélangés au rouge de la brume, des gris moyens viraient au
// brun boueux et la ville perdait son côté béton. Il faut partir plus haut
// en luminosité pour que le mélange reste minéral.
const FACADE_PALETTE = ["#bdb2a6", "#a89c90", "#cdc4ba", "#95897e"];
const ROOF_COLOR = "#1a1a1e";      // toiture quasi noire, silhouette franche sur le ciel
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
// Retour d'angle : légèrement plus sombre que la façade principale (face qui
// reçoit moins la lumière rasante du couchant) — lit comme un vrai profil.
const SIDE_SHADE = 0.82;
// HAZE_MAX_Z/HAZE_STRENGTH viennent de road.js : même brume, même distance
// de fondu que le sol (via les mêmes buildHazeGradient/gradientStep), pour
// une atmosphère cohérente sur toute la scène.

const ROOF_RATIO = 0.22;        // fraction de la hauteur (monde) occupée par le toit mansardé
const WINDOW_MIN_PX = 9;        // sous cette largeur/hauteur écran, pas de fenêtres (trop petit pour se lire)

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

function buildingShape(slotIndex, sideKey) {
  const h1 = hash(slotIndex * 2 + sideKey);
  const h2 = hash(slotIndex * 2 + sideKey + 100);
  const h3 = hash(slotIndex * 7 + sideKey);
  const h4 = hash(slotIndex * 11 + sideKey);
  const h5 = hash(slotIndex * 13 + sideKey);
  const h6 = hash(slotIndex * 17 + sideKey);
  const h7 = hash(slotIndex * 19 + sideKey); // teinte des volets
  const h8 = hash(slotIndex * 23 + sideKey); // 2e rangée de balcon (dernier étage noble)

  const depth = DEPTH_MIN + h1 * (DEPTH_MAX - DEPTH_MIN);   // le long de la route (façade)
  const girth = GIRTH_MIN + h5 * (GIRTH_MAX - GIRTH_MIN);   // perpendiculaire (retour d'angle)
  const height = MIN_HEIGHT + h2 * (MAX_HEIGHT - MIN_HEIGHT);
  const paletteIndex = Math.floor(h3 * FACADE_PALETTE.length);
  const brightnessIndex = Math.floor(h4 * BRIGHTNESS_STEPS);
  const rows = Math.max(3, Math.min(7, Math.round(height / 3)));

  // Balcons filants : 2e étage (le plus fréquent, typologie haussmannienne),
  // et parfois un 2e rang au dernier étage noble juste sous le toit — jamais
  // au rez-de-chaussée (SHOPFRONT_COLOR plus bas) ni sur un immeuble trop
  // petit pour avoir un "dernier étage" distinct du 2e.
  const balconyRows = [];
  if (h6 < 0.5) balconyRows.push(Math.floor(rows * 0.55));
  if (h8 < 0.4 && rows >= 5) balconyRows.push(1);

  return {
    depth,
    girth,
    height,
    facadeGradient: facadeGradients[paletteIndex][brightnessIndex],
    sideGradient: sideGradients[paletteIndex][brightnessIndex],
    shutterGradient: shutterGradients[Math.floor(h7 * shutterGradients.length)],
    facadeWindowCols: Math.max(3, Math.min(7, Math.round(depth * 0.9))),
    sideWindowCols: Math.max(2, Math.min(3, Math.round(girth / 2.5))),
    windowRows: rows,
    balconyRows,
  };
}

function windowIsLit(slotIndex, faceKey, r, c) {
  return hash(slotIndex * 131 + faceKey * 977 + r * 17 + c * 31) < 0.07;
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
    const winW = cellW * 0.55;
    const marginY = wallH * 0.1;
    const cellH = (wallH - marginY) / rows;
    const winH = cellH * 0.6;
    const litColor = gradientStep(windowLitGradient, distT);
    const darkColor = gradientStep(windowDarkGradient, distT);
    const balconyColor = gradientStep(roofRidgeGradient, distT);
    const shutterColor = gradientStep(shape.shutterGradient, distT);
    const shopfrontColor = gradientStep(shopfrontGradient, distT);
    const bandeauColor = gradientStep(corniceGradient, distT);
    // Rez-de-chaussée = dernière rangée (r croît du toit vers le sol) —
    // traité à part (vitrine, pas de volets) seulement si l'immeuble a bien
    // un "étage" distinct au-dessus (sinon rows === 1, rien à séparer).
    const groundRow = rows > 1 ? rows - 1 : -1;

    for (let r = 0; r < rows; r++) {
      const rowY = wallTop + marginY + r * cellH;
      const isGround = r === groundRow;
      if (isFacade && shape.balconyRows.includes(r) && wallW > 16) {
        // Balcon filant : fine bande sombre courant sur toute la largeur du
        // mur, juste sous la rangée de fenêtres, + quelques piquets (garde-
        // corps) pour qu'on lise "ferronnerie" plutôt qu'un simple trait.
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
          // Vitrine sombre et plus haute que les fenêtres d'étage, jamais de
          // volets — sans ça la façade était uniforme du sol au toit.
          ctx.fillStyle = shopfrontColor;
          const shopH = Math.min(cellH * 0.92, winH * 1.6);
          ctx.fillRect(wx, wallBottom - shopH, winW, shopH);
          continue;
        }
        ctx.fillStyle = windowIsLit(windowKey, isFacade ? 0 : 1, r, c) ? litColor : darkColor;
        ctx.fillRect(wx, rowY, winW, winH);
        // Volets, seulement si assez de place pour rester lisibles (pas de
        // bouillie à distance) — deux blocs de part et d'autre de la fenêtre.
        const shutterW = Math.min(winW * 0.4, (cellW - winW) / 2 - 1);
        if (shutterW >= 2) {
          ctx.fillStyle = shutterColor;
          ctx.fillRect(wx - shutterW - 1, rowY, shutterW, winH);
          ctx.fillRect(wx + winW + 1, rowY, shutterW, winH);
        }
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
// tête tricolore, même technique project()+fillRect que le reste du décor.
const TRAFFIC_POLE_COLOR = "#2a2a2e";
const TRAFFIC_BOX_COLOR = "#1c1c20";
const TRAFFIC_RED = "#e13e26";   // rouge de charte, cohérent avec le reste des accents
const TRAFFIC_YELLOW = "#f0a83c";
const TRAFFIC_GREEN = "#3a8f5c";
const TRAFFIC_POLE_HEIGHT = 3.2;
const TRAFFIC_BOX_H = 0.9;
const TRAFFIC_BOX_W = 0.35;

const trafficPoleGradient = buildHazeGradient(TRAFFIC_POLE_COLOR);
const trafficBoxGradient = buildHazeGradient(TRAFFIC_BOX_COLOR);
const trafficRedGradient = buildHazeGradient(TRAFFIC_RED);
const trafficYellowGradient = buildHazeGradient(TRAFFIC_YELLOW);
const trafficGreenGradient = buildHazeGradient(TRAFFIC_GREEN);

function renderTrafficLight(ctx, n, side, distance, width, height) {
  const z = (n + 0.5) * SPACING - distance;
  if (z < NEAR_Z_CLAMP || z > HORIZON_Z) return;
  const fadeAlpha = Math.min(1, (HORIZON_Z - z) / FADE_BAND);
  if (fadeAlpha <= 0.02) return;

  // Un peu plus près du bord de route que les bâtiments (SIDEWALK_MARGIN
  // complet) : le feu doit lire comme posé au bord du trottoir, pas en
  // retrait dans la ruelle entre deux immeubles.
  const x = side * (ROAD_HALF_WIDTH + SIDEWALK_MARGIN * 0.6);
  const distT = Math.min(1, z / HAZE_MAX_Z);

  const wasAlpha = ctx.globalAlpha;
  if (fadeAlpha < 1) ctx.globalAlpha = wasAlpha * fadeAlpha;

  const ground = project(x, z, width, height);
  const poleTopY = ground.y - TRAFFIC_POLE_HEIGHT * ground.scale;
  const poleW = Math.max(1, 0.08 * ground.scale);
  ctx.fillStyle = gradientStep(trafficPoleGradient, distT);
  ctx.fillRect(ground.x - poleW / 2, poleTopY, poleW, ground.y - poleTopY);

  const boxW = TRAFFIC_BOX_W * ground.scale;
  const boxH = TRAFFIC_BOX_H * ground.scale;
  const boxX = ground.x - boxW / 2;
  const boxY = poleTopY - boxH;
  ctx.fillStyle = gradientStep(trafficBoxGradient, distT);
  ctx.fillRect(boxX, boxY, boxW, boxH);

  // Trois pastilles seulement si la tête est assez large pour rester lisible
  // (même garde que les autres détails fins du décor, voir WINDOW_MIN_PX).
  if (boxW >= 3) {
    const dotR = boxW * 0.28;
    const cx = boxX + boxW / 2;
    const dotColors = [
      gradientStep(trafficRedGradient, distT),
      gradientStep(trafficYellowGradient, distT),
      gradientStep(trafficGreenGradient, distT),
    ];
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = dotColors[i];
      const cy = boxY + boxH * (0.22 + i * 0.28);
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
  if (zFar < NEAR_Z_CLAMP) return;   // entièrement passé derrière la caméra
  if (zNear > HORIZON_Z) return;     // entièrement au-delà de l'horizon courbe
  zNear = Math.max(zNear, NEAR_Z_CLAMP);
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
