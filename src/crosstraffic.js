// crosstraffic.js — Voitures et camions de livraison qui TRAVERSENT la
// chaussée aux carrefours (demandé le 19 août 2026 : « au endroit où il y a
// des routes et des feux, ça serait trop bien que tu arrives à faire traverser
// des voitures au moment où je passe [...] et comme ça je suis obligé de [me
// déporter], ou un camion de livraison »).
//
// ⚠️ Ce module fait basculer les carrefours de DÉCOR à GAMEPLAY. Jusqu'ici
// l'invariant documenté était « les croisements sont volontairement purement
// décoratifs, aucune règle de collision n'a besoin de savoir qu'un croisement
// existe » (ARCHITECTURE.md §6bis). Il tombe ici, en connaissance de cause —
// mais proprement : `road.isCrossingSlot()` reste la source unique de la
// grille, partagée avec `world.js` (bâtiments/feux), donc le véhicule tombe
// forcément sur le carrefour qu'on voit à l'écran, sans grille parallèle.
//
// Deux grilles cohabitent dans ce jeu, et c'est le piège à connaître ici :
// bonus/obstacles vivent sur la grille MUSICALE (index de créneau → temps),
// alors que bâtiments/carrefours vivent sur la grille de DISTANCE
// (`distanceScrolled`). Ce module appartient à la seconde. Il ne passe donc
// PAS par entities.js : il a son propre jeu de collisions, son propre `Set`
// de résolus, et il est fusionné au rendu par le mécanisme `extras`
// d'entities-render.js — le même que le caméo et le joueur — pour que sa
// profondeur soit respectée par l'algorithme du peintre.
//
// Coût d'une collision : -1 vie, JAMAIS fatal (contrairement à voiture/pont).
// Raison assumée : les deux grilles étant indépendantes, un véhicule
// traversant peut coïncider avec le seul passage laissé par un pont — cas
// rare mais possible, et impossible à exclure par construction sans faire
// dépendre une grille de l'autre. À -1 vie, ce cas coûte un cœur au lieu de
// terminer la course sur une situation que le joueur ne pouvait pas éviter.

import * as road from "./road.js";

// Probabilité qu'un carrefour porte un véhicule. ⚠️ Nulle en début de course,
// et c'est tout l'intérêt : retour direct du 19 août 2026 — « c'est très très
// bien, la quantité et la densité d'objets au tout début, mais du coup il faut
// vraiment ça sur la fin, ça fait plus facile la fin que le début », doublé de
// « je ne veux pas que les premières étoiles arrivent plus vite au tout
// départ ». Ce module ajoute donc de la difficulté UNIQUEMENT à partir du
// milieu de course, sans toucher d'un pouce à l'ouverture déjà validée.
// Repères mesurés (index de grille atteints au fil d'une course) :
// 25 s → n≈60, 50 s → n≈150, 75 s → n≈283, 100 s → n≈481, arrivée → n≈911.
const RAMP_START_SLOT = 150; // ≈ 50 s : premiers véhicules
const RAMP_FULL_SLOT = 481;  // ≈ 100 s : densité maximale
const MAX_PROBABILITY = 0.7;

// Vitesse latérale de traversée, en unités-monde par seconde. Le véhicule est
// positionné d'après le TEMPS qui le sépare du joueur, pas d'après sa
// profondeur : à z fixe, un même écart de distance représente 5 fois moins de
// temps en fin de course qu'au début (19,8 → 99 u/s), et le véhicule aurait
// alors surgi 0,2 s avant l'impact — injouable. Ici il entre dans le champ
// toujours ~1,5 s avant, quelle que soit la vitesse de la course.
const CROSS_SPEED = 8;
// Fenêtre longitudinale de collision, alignée sur celle des obstacles de la
// grille musicale (Z_WINDOW dans entities.js) pour que les deux se ressentent
// pareil.
const Z_WINDOW = 1.0;

// Dimensions en unités-monde. Le véhicule traverse, donc sa LONGUEUR court le
// long de x et sa largeur le long de z — l'inverse d'une voiture de la
// chaussée (entities-render.js).
const VEHICULES = {
  voiture: { demiLongueur: 1.35, demiLargeur: 0.8, hauteur: 1.25, toit: 0.62 },
  camion: { demiLongueur: 2.1, demiLargeur: 0.95, hauteur: 2.35, toit: 0 },
};

// ⚠️ Volontairement SANS la variante noire qui existe pour les voitures de la
// chaussée (entities-render.js) : constaté à l'écran, un véhicule sombre posé
// en travers du bitume nocturne devient quasi invisible — inacceptable pour un
// obstacle qu'on découvre 1,5 s avant l'impact. Les voitures de la chaussée,
// elles, peuvent se permettre le noir : elles arrivent de face, feux arrière
// allumés, et bien plus tôt dans le champ.
const COULEURS = [
  { base: "#2f5fb0", dark: "#20406e", hi: "#8fb3e8" },
  { base: "#3a8f5c", dark: "#276140", hi: "#8fd4ab" },
  { base: "#e9e4d8", dark: "#b8b2a4", hi: "#ffffff" },
  { base: "#e13e26", dark: "#a12c1c", hi: "#ff8a72" },
  { base: "#c8963a", dark: "#8f6a24", hi: "#f0cd7f" },
];
const CABINE = { base: "#d8d3c6", dark: "#a49f93", hi: "#ffffff" };

// Hash local (même recette que world.js/entities.js, multiplicateur distinct)
// pour que ce module reste une fonction pure de l'index de carrefour, sans
// dépendre d'un autre module de gameplay.
function hash(n) {
  const x = Math.sin(n * 45.164) * 43758.5453;
  return x - Math.floor(x);
}

function probabiliteAu(n) {
  if (n < RAMP_START_SLOT) return 0;
  const t = Math.min(1, (n - RAMP_START_SLOT) / (RAMP_FULL_SLOT - RAMP_START_SLOT));
  return t * MAX_PROBABILITY;
}

// Contenu d'un carrefour : `null` s'il n'y a pas de véhicule. Fonction pure de
// l'index, donc identique à chaque partie comme tout le reste du jeu.
function vehiculeAu(n) {
  if (!road.isCrossingSlot(n)) return null;
  if (hash(n * 3 + 11) >= probabiliteAu(n)) return null;
  const h = hash(n * 7 + 23);
  return {
    type: h < 0.32 ? "camion" : "voiture", // le camion reste le cas marquant, pas la norme
    voie: Math.min(road.LANE_COUNT - 1, Math.floor(hash(n * 13 + 5) * road.LANE_COUNT)),
    sens: hash(n * 17 + 3) < 0.5 ? -1 : 1,  // vient de la gauche ou de la droite
    couleur: COULEURS[Math.floor(hash(n * 29 + 7) * COULEURS.length) % COULEURS.length],
  };
}

// Profondeur du carrefour `n` à l'instant courant.
function profondeurDu(n, distance) {
  return (n + 0.5) * road.WORLD_GRID_SPACING - distance;
}

// Position latérale du véhicule : il est PILE au centre de sa voie cible quand
// le carrefour atteint le joueur, et s'en écarte proportionnellement au temps
// qui reste avant/après. C'est ce qui garantit que « une voiture traverse au
// moment où je passe » sans jamais dépendre de la vitesse de la course.
function positionLaterale(vehicule, z, speed) {
  const secondesAvantLeJoueur = (z - road.PLAYER_NEAR_Z) / Math.max(1, speed);
  return road.laneX(vehicule.voie) + vehicule.sens * secondesAvantLeJoueur * CROSS_SPEED;
}

// Carrefours porteurs d'un véhicule actuellement dans le champ.
function* carrefoursVisibles(distance) {
  const premier = Math.floor(distance / road.WORLD_GRID_SPACING) - 1;
  const dernier = Math.ceil((distance + road.HORIZON_Z) / road.WORLD_GRID_SPACING) + 1;
  for (let n = premier; n <= dernier; n++) {
    const vehicule = vehiculeAu(n);
    if (!vehicule) continue;
    const z = profondeurDu(n, distance);
    if (z < 0.5 || z > road.HORIZON_Z) continue;
    yield { n, vehicule, z };
  }
}

const resolus = new Set();

export function reset() {
  resolus.clear();
}

// Collisions du tick. Même contrat que entities.update() : renvoie les
// événements survenus, à charge de main.js d'en tirer vies et score.
// `inAir` sauve, exactement comme pour une voiture de la chaussée — le
// véhicule reste franchissable au saut, seul le camion est trop haut.
export function update(playerLane, inAir) {
  const distance = road.getDistanceScrolled();
  const speed = road.getSpeed();
  const events = [];

  for (const { n, vehicule, z } of carrefoursVisibles(distance)) {
    if (resolus.has(n)) continue;
    if (z > road.PLAYER_NEAR_Z + Z_WINDOW) continue;
    if (z < road.PLAYER_NEAR_Z - Z_WINDOW) { resolus.add(n); continue; }

    // Voie réellement occupée à cet instant : on repart de la position
    // latérale, pas de `vehicule.voie` en dur — le véhicule bouge, et c'est ce
    // qu'on voit à l'écran qui doit toucher.
    const x = positionLaterale(vehicule, z, speed);
    const { demiLongueur } = VEHICULES[vehicule.type];
    const touche = Math.abs(road.laneX(playerLane) - x) < demiLongueur;
    // Le camion est trop haut pour être survolé ; la voiture, non — même règle
    // que sa cousine de la chaussée.
    const sauteDessus = inAir && vehicule.type === "voiture";

    if (touche && !sauteDessus) {
      events.push({ type: "obstacle", kind: vehicule.type === "camion" ? "camion" : "traversee" });
      resolus.add(n);
    }
  }

  return events;
}

function fillPoly(ctx, pts, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.fill();
}

// Volume faux-3D d'un véhicule vu de PROFIL (il traverse). Même technique que
// renderCar3D/les piliers de pont : on projette les coins au sol aux deux
// profondeurs, on monte les hauteurs à l'échelle de chacune, on peint les
// faces visibles de la plus lointaine à la plus proche.
function dessiner(ctx, vehicule, z, width, height) {
  const speed = road.getSpeed();
  const x = positionLaterale(vehicule, z, speed);
  const dims = VEHICULES[vehicule.type];
  const zNear = z - dims.demiLargeur;
  const zFar = z + dims.demiLargeur;
  if (zNear < 0.4) return;

  const xG = x - dims.demiLongueur;
  const xD = x + dims.demiLongueur;
  // Entièrement hors de la rue (il arrive ou il est déjà reparti) : rien à
  // peindre, et surtout pas de polygone géant hors cadre.
  const limite = road.ROAD_HALF_WIDTH + 9;
  if (xD < -limite || xG > limite) return;

  const gNG = road.project(xG, zNear, width, height);
  const gND = road.project(xD, zNear, width, height);
  const gFG = road.project(xG, zFar, width, height);
  const gFD = road.project(xD, zFar, width, height);
  const hN = dims.hauteur * gNG.scale;
  const hF = dims.hauteur * gFG.scale;

  const couleur = vehicule.couleur;

  // Ombre au sol
  ctx.save();
  ctx.globalAlpha = 0.32;
  ctx.fillStyle = "#000000";
  ctx.beginPath();
  ctx.ellipse((gNG.x + gFD.x) / 2, (gNG.y + gFD.y) / 2,
    Math.abs(gND.x - gNG.x) / 2 * 1.05, Math.max(2, Math.abs(gFG.y - gNG.y) / 2 * 0.9), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Toit (face du dessus), puis flanc face à la caméra par-dessus.
  fillPoly(ctx, [
    { x: gNG.x, y: gNG.y - hN }, { x: gND.x, y: gND.y - hN },
    { x: gFD.x, y: gFD.y - hF }, { x: gFG.x, y: gFG.y - hF },
  ], couleur.dark);
  fillPoly(ctx, [
    gNG, gND, { x: gND.x, y: gND.y - hN }, { x: gNG.x, y: gNG.y - hN },
  ], couleur.base);

  // Cabine claire à l'avant du camion : c'est ce qui le fait lire « camion de
  // livraison » plutôt que « gros bloc coloré ».
  if (vehicule.type === "camion") {
    const avantX = vehicule.sens > 0 ? gND.x : gNG.x;
    const largeurCabine = Math.abs(gND.x - gNG.x) * 0.3;
    const cabX = vehicule.sens > 0 ? avantX - largeurCabine : avantX;
    ctx.fillStyle = CABINE.base;
    ctx.fillRect(cabX, gNG.y - hN * 0.62, largeurCabine, hN * 0.62);
    ctx.fillStyle = "#141419"; // pare-brise
    ctx.fillRect(cabX + largeurCabine * 0.18, gNG.y - hN * 0.55, largeurCabine * 0.64, hN * 0.26);
  } else {
    // Vitres latérales de la voiture
    ctx.fillStyle = "#141419";
    const w = Math.abs(gND.x - gNG.x);
    ctx.fillRect(gNG.x + w * 0.22, gNG.y - hN * 0.92, w * 0.56, hN * 0.34);
  }

  // Bandeau clair sur l'arête haute : détache le véhicule du bitume sombre.
  ctx.fillStyle = couleur.hi;
  ctx.fillRect(Math.min(gNG.x, gND.x), gNG.y - hN, Math.abs(gND.x - gNG.x), Math.max(1, hN * 0.05));

  // Roues
  ctx.fillStyle = "#0e0e11";
  const largeur = Math.abs(gND.x - gNG.x);
  const rayon = Math.max(1, largeur * 0.07);
  for (const f of [0.22, 0.78]) {
    ctx.beginPath();
    ctx.arc(Math.min(gNG.x, gND.x) + largeur * f, gNG.y, rayon, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Éléments à peindre pour cette frame, chacun avec sa profondeur — fusionnés
// par entities-render.render(..., extras) dans l'ordre du peintre, exactement
// comme le caméo et le joueur. Jamais un rendu séparé : un véhicule traversant
// doit pouvoir passer DERRIÈRE un pont et DEVANT une étoile plus lointaine.
export function getExtras(ctx, width, height) {
  const distance = road.getDistanceScrolled();
  const extras = [];
  for (const { vehicule, z } of carrefoursVisibles(distance)) {
    extras.push({ z, draw: () => dessiner(ctx, vehicule, z, width, height) });
  }
  return extras;
}
