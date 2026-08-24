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
import { slotsFor, isBridgeSlot, getRunSeed } from "./entities.js";
import { clock } from "./clock.js";

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
// toujours ~2 s avant, quelle que soit la vitesse de la course.
// 8 → 5,6 le 20 août 2026 (« ralentis de 30 % la vitesse des véhicules qui
// traversent la route ») : traversée plus lente, donc visible plus longtemps
// et plus lisible à l'approche.
const CROSS_SPEED = 5.6;

// Ligne des façades : au-delà, le véhicule est censé être DERRIÈRE les
// immeubles. Même valeur que `SIDEWALK_MARGIN` dans world.js (0,5 unité au-delà
// du bord de chaussée), qui fixe où commence le pied des bâtiments — recopiée
// plutôt qu'importée, world.js ne l'exporte pas et c'est le seul lien entre les
// deux fichiers.
const BORD_RUE = road.ROAD_HALF_WIDTH + 0.5;
// Fenêtre longitudinale de collision, alignée sur celle des obstacles de la
// grille musicale (Z_WINDOW dans entities.js) pour que les deux se ressentent
// pareil.
const Z_WINDOW = 1.0;

// Dimensions en unités-monde. Le véhicule traverse, donc sa LONGUEUR court le
// long de x et sa largeur le long de z — l'inverse d'une voiture de la
// chaussée (entities-render.js).
// ⚠️ Le CAMION a été retiré le 21 août 2026 (« il faut pas qu'il y ait des
// camions qui traversent, je veux que ce soient des voitures, sinon c'est
// trop ») : à 4,2 unités de long il couvrait plus d'une voie et demie et
// rendait l'esquive latérale illisible. Ne pas le réintroduire sans
// redemander — seule la voiture traverse désormais.
const VEHICULES = {
  voiture: { demiLongueur: 1.35, demiLargeur: 0.8, hauteur: 1.25, toit: 0.62 },
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

// Hash local (même recette que world.js/entities.js, multiplicateur distinct)
// pour que ce module reste une fonction pure de l'index de carrefour.
// ⚠️ Seedé par partie depuis le 24 août 2026 (même graine que la grille
// musicale, via entities.getRunSeed) : les traversantes changent de carrefour
// et de sens à chaque partie, comme tout le reste du parcours.
function hash(n) {
  const x = Math.sin(n * 45.164 + getRunSeed()) * 43758.5453;
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
  return {
    type: "voiture", // plus jamais de camion, voir VEHICULES ci-dessus
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

// ⚠️ Anti-collision avec les PONTS (21 août 2026, retour direct : « les ponts
// et les voitures qui traversent s'entrechoquent, on peut juste pas passer »).
// Les deux grilles sont indépendantes par construction (voir l'en-tête), donc
// un véhicule pouvait traverser PILE sous un pont : la seule voie ouverte du
// pont se retrouvait barrée au même instant — situation inesquivable au sol.
// Correctif : quand un carrefour porteur d'un véhicule entre dans le champ, on
// regarde si un pont de la grille MUSICALE occupe la même bande de profondeur ;
// si oui, le véhicule est supprimé (comme si le hash n'en avait pas mis).
// C'est une dépendance à sens unique crosstraffic → entities, assumée : c'est
// exactement le cas que l'en-tête déclarait « impossible à exclure sans faire
// dépendre une grille de l'autre » — le retour joueur a tranché.
// ⚠️ Une suppression est DÉFINITIVE (Set vidé par reset()), mais un carrefour
// « gardé » est revérifié à chaque frame : la fenêtre des créneaux musicaux
// (visibleSlots s'arrête à z ≈ 90) est bien plus courte que le champ des
// carrefours (z ≤ HORIZON_Z ≈ 209) — un pont coïncident peut donc n'entrer
// dans slotsFor() qu'après la première vérification. Monotone gardé → supprimé
// uniquement : jamais de véhicule qui clignote, au pire un véhicule lointain
// qui s'efface quand son pont se révèle.
// ⚠️ Marge exprimée en TEMPS, pas en unités : le joueur a besoin d'un délai
// fixe pour se replacer entre le passage du pont et celui du véhicule (~0,5 s
// de chaque côté), or une marge en unités-monde fond avec la vitesse — le
// premier réglage (9 unités fixes) valait 0,45 s au départ mais 0,1 s au
// plafond de vitesse : mesuré par balayage, il ne supprimait RIEN, alors que
// le retour venait justement de la fin de course. Le plancher de 4 unités
// couvre la géométrie pure (demi-largeur du véhicule + fenêtres de collision
// + profondeur visuelle de la poutre) au cas où la vitesse serait minuscule.
// ⚠️ Recalibrée le 21 août 2026, mesure zDerniere à l'appui : à 0,5 s la
// marge valait 42 unités au plafond de vitesse et supprimait 20 traversées
// sur 58 — plus d'un tiers du levier de difficulté de fin de course rasé,
// masqué jusqu'ici par une mesure qui comptait « vu une frame = conservé ».
// Le cas INJUSTE n'est pas le voisinage (un pont PUIS une voiture 0,4 s plus
// tard se joue très bien : on passe la trouée, puis on gère la voiture),
// c'est le CHEVAUCHEMENT : la voiture qui occupe la trouée pendant la fenêtre
// où le joueur doit y être. D'où 0,15 s (un délai de réaction) + un plancher
// géométrique de 6 unités (demi-voiture + fenêtres de collision + profondeur
// de la poutre). Mesuré après recalibrage (balayage zDerniere complet) :
// 5 suppressions sur 58, toutes des chevauchements réels — contre 20 à 0,5 s.
// ⚠️ 0,15 → 0,35 s le 24 août 2026 (retour direct après mise en ligne :
// « parfois on ne peut juste pas passer, pont + voiture qui passe au
// centre ») : à 0,15 s la traversante pouvait occuper la trouée du pont
// 0,2 s après son passage — le joueur devait passer la trouée AU SOL puis
// sauter dans le même souffle, un enchaînement au-delà du temps de réaction.
// À 0,35 s (~29 unités au plafond de vitesse), la trouée et la traversante
// redeviennent deux problèmes successifs, pas un seul mur. Le plancher
// géométrique monte à 8 unités pour la même raison aux vitesses basses.
const PONT_MARGE_S = 0.35;
const PONT_MARGE_Z_MIN = 8;
const supprimes = new Set();

// Les z des ponts visibles + la marge, calculés UNE fois par balayage de
// carrefours et passés en paramètre. ⚠️ Ne PAS relire clock.now() par
// carrefour (revue du 21 août 2026) : le slotCache d'entities.js est mémoïsé
// sur égalité stricte (now, speed) — une relecture qui tombe sur un tick
// d'horloge différent invalide le cache partagé et reconstruit toute la
// fenêtre de créneaux, jusqu'à une fois par carrefour et par frame ; sur
// l'horloge de secours performance.now() (chaque lecture unique), c'était
// systématique, ×10 sur le coût de la grille pour les appareils dégradés.
function pontsVisibles() {
  const speed = road.getSpeed();
  const marge = Math.max(PONT_MARGE_Z_MIN, speed * PONT_MARGE_S);
  const zs = [];
  for (const s of slotsFor(clock.now(), speed)) {
    if (isBridgeSlot(s)) zs.push(s.z);
  }
  return { zs, marge };
}

function sousUnPont(n, zCarrefour, ponts) {
  if (supprimes.has(n)) return true;
  const coincide = ponts.zs.some((z) => Math.abs(z - zCarrefour) < ponts.marge);
  if (coincide) supprimes.add(n);
  return coincide;
}

// Carrefours porteurs d'un véhicule actuellement dans le champ.
function* carrefoursVisibles(distance) {
  const premier = Math.floor(distance / road.WORLD_GRID_SPACING) - 1;
  const dernier = Math.ceil((distance + road.HORIZON_Z) / road.WORLD_GRID_SPACING) + 1;
  const ponts = pontsVisibles();
  for (let n = premier; n <= dernier; n++) {
    const vehicule = vehiculeAu(n);
    if (!vehicule) continue;
    const z = profondeurDu(n, distance);
    if (z < 0.5 || z > road.HORIZON_Z) continue;
    if (sousUnPont(n, z, ponts)) continue;
    yield { n, vehicule, z };
  }
}

const resolus = new Set();

export function reset() {
  resolus.clear();
  supprimes.clear();
}

// Collisions du tick. Même contrat que entities.update() : renvoie les
// événements survenus, à charge de main.js d'en tirer vies et score.
// `inAir` sauve TOUJOURS (« il faut qu'on ait la possibilité de les esquiver
// ou de sauter par-dessus ») : les deux grilles étant indépendantes, un
// véhicule traversant peut coïncider avec un obstacle musical qui bloque les
// voies de repli — le saut doit rester une porte de sortie universelle.
// (Le camion insurvolable a d'abord été rendu sautable le 20 août 2026, puis
// carrément supprimé le 21 — voir VEHICULES.)
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
    // Sauter sauve toujours, camion compris — voir le commentaire au-dessus
    // de la fonction.
    const sauteDessus = inAir;

    if (touche && !sauteDessus) {
      events.push({ type: "obstacle", kind: "traversee" });
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
  // ⚠️ Rien ne se dessine au-delà de la ligne des immeubles (retour direct du
  // 19 août 2026, capture à l'appui : « on les voit de trop loin, il faut
  // qu'elles soient cachées derrière les bâtiments »). Au premier jet la marge
  // valait ROAD_HALF_WIDTH + 9, soit 13 unités : le véhicule était donc peint
  // en plein sur les trottoirs ET par-dessus les façades, flottant dans le
  // décor plusieurs secondes avant d'arriver — au lieu de surgir d'une rue
  // transversale. Il n'est visible que dans la trouée de la rue, exactement
  // comme une voiture qui débouche d'un croisement.
  if (xD < -BORD_RUE || xG > BORD_RUE) return;

  // Découpe sur la trouée de la rue : tout ce qui dépasse la ligne des façades
  // est masqué, donc le véhicule ÉMERGE de derrière l'immeuble au lieu d'être
  // peint par-dessus. Les bâtiments étant dessinés avant les entités
  // (world.render puis entities-render.render dans main.js), c'est bien ce
  // découpage — et non l'ordre du peintre — qui produit l'occultation.
  const bordGauche = road.project(-BORD_RUE, z, width, height);
  const bordDroit = road.project(BORD_RUE, z, width, height);
  ctx.save();
  ctx.beginPath();
  ctx.rect(bordGauche.x, 0, bordDroit.x - bordGauche.x, height);
  ctx.clip();

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

  // Vitres latérales de la voiture. (La cabine de camion a disparu avec le
  // camion lui-même, voir VEHICULES.)
  ctx.fillStyle = "#141419";
  const wVitres = Math.abs(gND.x - gNG.x);
  ctx.fillRect(gNG.x + wVitres * 0.22, gNG.y - hN * 0.92, wVitres * 0.56, hN * 0.34);

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

  ctx.restore(); // ferme la découpe sur la trouée de la rue
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
