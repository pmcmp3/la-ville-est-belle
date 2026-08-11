// entities.js — Bonus et obstacles qui apparaissent calés sur les beats.
//
// Même principe que la grille rythmique de debug (voir debug.js) : chaque
// "créneau" de spawn correspond à un temps musical futur, positionné dans
// le monde pour arriver pile au niveau du joueur à cet instant précis.
// Formule pure (pas de tableau d'instances à gérer) : le contenu d'un
// créneau est entièrement déterminé par son index (hash déterministe),
// seul un Set d'index déjà résolus est gardé en mémoire.

import { clock } from "./clock.js";
import * as road from "./road.js";
import { HEIGHT_WORLD } from "./player.js";
import * as pedestrians from "./pedestrians.js";
import * as cyclists from "./cyclists.js";

const CADENCE = window.CONFIG.cadenceSpawnBeats; // un événement tous les N temps
const LOOKAHEAD_SLOTS = 10;

// --- Ligne d'arrivée + quota exact d'étoiles -------------------------------
// Demandé : la course se termine après un nombre fixe d'objets, pas au bout
// du morceau. Le morceau lui, continue à jouer jusqu'à la fin — cohérent
// avec l'objectif "donner envie d'écouter le morceau".
// TOTAL_STARS est désormais LE réglage central (demandé explicitement :
// « chaque partie doit avoir le même nombre d'étoiles [...] admettons que le
// total soit 200, pour que le meilleur score soit extrêmement difficile à
// atteindre — sous-entendu qu'il faut prendre toutes les étoiles »).
// TOTAL_OBSTACLES fixe la difficulté en face (voitures tripées, voir plus
// bas) ; TOTAL_OBJECTS (= la ligne d'arrivée) en découle.
export const TOTAL_STARS = 200;
const TOTAL_OBSTACLES = 100;
export const TOTAL_OBJECTS = TOTAL_STARS + TOTAL_OBSTACLES; // 300 créneaux
export function finishBeatN() { return TOTAL_OBJECTS * CADENCE; }
export function finishTime() { return clock.timeOfBeat(finishBeatN()); }
// Nombre d'objets déjà "passés" au sens du parcours (créneaux au niveau ou
// derrière le joueur). Sert au HUD/écran de fin. Formule pure — pas besoin
// d'un compteur incrémenté à chaque frame.
export function objectsPassed(now = clock.now()) {
  return Math.max(0, Math.min(TOTAL_OBJECTS, Math.floor(clock.beatIndexAt(now) / CADENCE)));
}
export function isFinished(now = clock.now()) {
  return now >= finishTime();
}
const Z_WINDOW = 1.0;      // fenêtre (unités-monde) autour du joueur pour tester la collision
// Plus de rayon de collision en unités-monde : depuis le passage aux 4 voies,
// tout est posé sur une voie et la collision est un test d'ÉGALITÉ de voie.
// C'est ce qui règle les deux reproches du playtest d'un coup — « t'es short
// sur les hitbox » (on touchait à côté de ce qu'on voyait) et « je peux rester
// là indéfiniment » (il n'existe plus de position hors-voie où camper).
const GRACE_BEATS = 16;    // ~8s à 120 bpm sans aucun obstacle, le temps de prendre en main les contrôles
const GRACE_SLOTS = Math.ceil(GRACE_BEATS / CADENCE); // créneaux forcés étoile en tout début de course

// --- Difficulté progressive + quota EXACT d'étoiles -----------------------
// Demandé explicitement au playtest : « plus on avance, plus ça doit être
// difficile de récolter des objets » — ET, cette session, « chaque partie
// doit avoir le même nombre d'étoiles » (200, pile). Un tirage probabiliste
// par créneau (l'ancienne technique : `hash(slot) < ratio`) est bien
// déterministe d'une partie à l'autre (même hash, toujours la même suite),
// mais le TOTAL d'étoiles qui en résulte n'est pas un nombre rond choisi à
// l'avance — c'est juste "ce qui tombe". Remplacé par une diffusion d'erreur
// (même principe qu'un tramage d'image) : `cumul` accumule le ratio cible
// créneau après créneau, et un créneau est une étoile SEULEMENT s'il fait
// franchir un palier entier à ce cumul. Propriété utile : le nombre total de
// paliers franchis sur N créneaux vaut exactement floor(somme des ratios) —
// en calant la moyenne des ratios sur le quota voulu, le total tombe pile
// dessus (à 1 près, résiduel du floor final), tout en suivant la même courbe
// décroissante qu'avant (beaucoup d'étoiles tôt, de moins en moins tard).
// GRACE_SLOTS est traité à part (toujours étoile, jamais compté dans le
// calcul de rampe) pour garder intact le filet de sécurité « pas d'obstacle
// avant que le joueur ait pris les commandes en main ».
const BONUS_RATIO_START = 0.8; // juste après la période de grâce : encore très généreux en étoiles
// Dérivé (pas une constante à la main) pour que la MOYENNE du ratio sur les
// créneaux restants (hors grâce) retombe exactement sur le quota d'étoiles
// restant — c'est ce qui garantit le total de TOTAL_STARS, quels que soient
// TOTAL_STARS/TOTAL_OBSTACLES/GRACE_SLOTS si on les retouche un jour.
const BONUS_RATIO_END =
  2 * ((TOTAL_STARS - GRACE_SLOTS) / (TOTAL_OBJECTS - GRACE_SLOTS)) - BONUS_RATIO_START;

// Marge après la ligne d'arrivée : visibleSlots() peut regarder jusqu'à
// LOOKAHEAD_SLOTS créneaux au-delà du dernier passé, il faut donc un tableau
// un peu plus long que TOTAL_OBJECTS pour ne jamais lire hors limites.
const QUOTA_MARGIN = LOOKAHEAD_SLOTS + 1;
const isBonusQuota = (() => {
  const arr = new Array(TOTAL_OBJECTS + QUOTA_MARGIN).fill(false);
  for (let i = 0; i < GRACE_SLOTS && i < arr.length; i++) arr[i] = true;

  const remainingSlots = TOTAL_OBJECTS - GRACE_SLOTS;
  let cumul = 0;
  let prevFloor = 0;
  for (let i = GRACE_SLOTS; i < arr.length; i++) {
    const t = Math.min(1, (i - GRACE_SLOTS) / remainingSlots);
    const ratio = BONUS_RATIO_START + (BONUS_RATIO_END - BONUS_RATIO_START) * t;
    cumul += ratio;
    const floor = Math.floor(cumul);
    arr[i] = floor > prevFloor;
    prevFloor = floor;
  }
  return arr;
})();

function isBonusAt(slotIndex) {
  return slotIndex >= 0 && slotIndex < isBonusQuota.length && isBonusQuota[slotIndex];
}

// Bonus musique/studio (voir config.js pour les scores). Poids inchangés
// depuis les anciens noms (clementine→cd, clavier→piano, sourire→appareil,
// etoile→guitare, collierPerles→ident) : mêmes fréquences de spawn,
// nouvelles icônes.
// Poids rééquilibrés au playtest (« il faut des objets spéciaux en l'air ») :
// les deux bonus les plus chers sont désormais les deux bonus AÉRIENS (voir
// AIR_BONUS_KINDS), et ils pèsent ensemble 28 % des bonus au lieu des 5 % de
// la seule guitare — les objets à sauter cessent d'être une curiosité qu'on
// croise deux fois par partie.
const BONUS_TYPES = [
  { kind: "cd", weight: 0.32 },
  { kind: "piano", weight: 0.22 },
  { kind: "appareil", weight: 0.18 },
  { kind: "collierPerles", weight: 0.18 },
  { kind: "guitare", weight: 0.10 },
];
// pieton : à éviter en se déportant. cone (plot de chantier) : dans sa voie,
// à éviter en se déportant OU en sautant par-dessus (le saut reste utile
// mais n'est plus le seul recours si le joueur n'est pas sur sa trajectoire).
// Renommés pour lisibilité (playtest : "c'est quoi ces trucs rouges") — voir
// OBSTACLE_ICONS ci-dessous pour le rendu.
// voiture : plus un simple type parmi d'autres — voir "Rangées de voitures"
// plus bas. Poids nettement plus élevé que pieton/cone (retour playtest :
// « multiplie par trois le nombre de voitures présentes partout ») : un
// obstacle "voiture" est ~3× plus fréquent qu'un pieton OU un cone.
// bus retiré (retour explicite : « enlève les énormes bus larges qui
// prennent plusieurs voies, je préfère que tu mettes plusieurs voitures ») —
// son rôle "force à changer de voie" est repris par les rangées de voitures
// multi-voies ci-dessous.
const OBSTACLE_WEIGHTS = [
  { kind: "voiture", weight: 0.6 },
  { kind: "pieton", weight: 0.2 },
  { kind: "cone", weight: 0.2 },
];

// Bonus AÉRIENS : ramassables uniquement en sautant. Playtest : « il faut des
// objets spéciaux en l'air » — il n'y en avait qu'un seul type (`guitare`,
// 5 % des bonus), donc quasiment jamais rencontré. Les DEUX bonus les plus
// chers le sont maintenant (250 et 500 pts), soit 28 % des bonus : sauter
// devient une vraie source de points, pas une figure de style.
// Rendu surélevé dans render() ci-dessous, à la hauteur du pic de saut, avec
// une ombre au sol et un flottement lent (le seul signal "celui-là est en
// l'air" quand on le voit arriver de loin).
const AIR_BONUS_KINDS = new Set(["guitare", "collierPerles"]);

// --- Rangées de voitures sur plusieurs voies -------------------------------
// Refonte demandée explicitement (remplace l'ancien "convoi" à 3 voitures
// alignées dans une SEULE voie, l'une derrière l'autre) : « essaye de mettre
// des rangées de trois voitures [...] il peut y avoir deux voitures sur deux
// voies différentes [...] on oublie la règle des trois voitures à la suite ».
// Un slot "voiture" pose maintenant 1 à 3 voitures à la MÊME profondeur, sur
// des voies DIFFÉRENTES (jamais les 4 — au moins une voie reste toujours
// libre pour passer, voir pickLanes()). Chaque voiture reste individuellement
// un volume faux-3D (renderCar3D, inchangé) : seule leur disposition change.
// Une SEULE résolution par slot logique — toucher n'importe laquelle des
// voitures de la rangée compte comme UNE collision, jamais plusieurs vies
// perdues d'un coup.
// Dimensions d'une voiture, en unités-monde (inchangées) : ~4 m × 1,8 m ×
// 1,5 m à l'échelle du jeu (ROAD_HALF_WIDTH = 4), 1,5× la taille d'origine
// (demande playtest antérieure). CAR_ROOF_H reste sous l'apex de saut
// (≈ 2,28 u avec hauteurSaut = 2.0) donc atterrissable. CAR_HALF_W = 0,85 :
// une voie fait 2 unités, la voiture la remplit visiblement sans mordre sur
// les voisines.
const CAR_HALF_W = 0.85;
const CAR_HALF_L = 1.275;
const CAR_BODY_H = 0.825;
export const CAR_ROOF_H = 1.35;
// Nombre de voitures par rangée : surtout 1 ou 2, occasionnellement 3 (le
// "rangée de trois" demandé reste possible mais reste le cas rare — avec 3
// voitures sur 4 voies, il ne reste qu'UNE voie de passage, à réserver aux
// moments qui doivent vraiment être durs).
const CAR_ROW_SIZES = [
  { kind: 1, weight: 0.45 },
  { kind: 2, weight: 0.40 },
  { kind: 3, weight: 0.15 },
];
// Tolérance longitudinale de "posé sur le toit". La tolérance LATÉRALE a
// disparu avec les voies : on est sur le toit si on est sur la voie de la
// rangée, point — plus de « je saute pile dessus et je retombe à côté ».
const ROOF_LONG_TOLERANCE = 0.7;

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

function isCarSlot(content) {
  return !content.isBonus && content.kind === "voiture";
}

// `count` voies DISTINCTES parmi les LANE_COUNT (permutation déterministe
// pilotée par hash, tronquée aux `count` premières) — jamais deux fois la
// même voie, jamais les LANE_COUNT voies à la fois (count ≤ 3 < LANE_COUNT).
function pickLanes(slotIndex, count) {
  const lanes = Array.from({ length: road.LANE_COUNT }, (_, i) => i);
  for (let i = lanes.length - 1; i > 0; i--) {
    const j = Math.floor(hash(slotIndex * 37 + i * 13) * (i + 1));
    [lanes[i], lanes[j]] = [lanes[j], lanes[i]];
  }
  return lanes.slice(0, count).sort((a, b) => a - b);
}

function hash(n) {
  const x = Math.sin(n * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function pickWeighted(list, h) {
  let acc = 0;
  for (const item of list) {
    acc += item.weight;
    if (h < acc) return item.kind;
  }
  return list[list.length - 1].kind;
}

// DEBUG uniquement : contenu forcé pour un créneau précis (voir forceSpawn
// plus bas), vérifié avant la génération déterministe normale. Vide en jeu
// normal, donc sans coût réel — juste un Map.get() de plus par créneau visible.
const debugOverrides = new Map(); // slotIndex -> { isBonus, kind, x }

function slotContent(slotIndex) {
  const override = debugOverrides.get(slotIndex);
  if (override) return { isBonus: override.isBonus, kind: override.kind };
  if (isBonusAt(slotIndex)) {
    return { isBonus: true, kind: pickWeighted(BONUS_TYPES, hash(slotIndex * 3 + 1)) };
  }
  const kind = pickWeighted(OBSTACLE_WEIGHTS, hash(slotIndex * 3 + 1));
  if (kind === "voiture") {
    const carCount = pickWeighted(CAR_ROW_SIZES, hash(slotIndex * 3 + 10));
    return { isBonus: false, kind: "voiture", carCount };
  }
  return { isBonus: false, kind };
}

// Voies occupées par le contenu d'un créneau. Renvoie toujours un TABLEAU :
// un objet normal occupe une voie, une rangée de voitures 1 à 3. Tout le
// reste du module (collision, rendu, atterrissage sur toit) part de là.
function slotLanes(slotIndex, content) {
  const override = debugOverrides.get(slotIndex);
  if (override) return [override.lane];
  if (content && isCarSlot(content)) {
    return pickLanes(slotIndex, content.carCount || 1);
  }
  const h = hash(slotIndex * 3 + 2);
  return [Math.min(Math.floor(h * road.LANE_COUNT), road.LANE_COUNT - 1)];
}

// Position latérale (unités-monde) du centre du contenu — sert seulement aux
// objets à voie unique (une rangée de voitures s'affiche voie par voie, voir
// render(), et n'utilise pas ce centre).
function lanesCenterX(lanes) {
  let sum = 0;
  for (const l of lanes) sum += road.laneX(l);
  return sum / lanes.length;
}

function slotZ(slotIndex, now, speed) {
  const beatN = slotIndex * CADENCE;
  const deltaT = clock.timeOfBeat(beatN) - now;
  return road.PLAYER_NEAR_Z + deltaT * speed;
}

function* visibleSlots(now, speed) {
  const currentSlot = Math.floor(clock.beatIndexAt(now) / CADENCE);
  for (let n = Math.max(0, currentSlot - 1); n <= currentSlot + LOOKAHEAD_SLOTS; n++) {
    const z = slotZ(n, now, speed);
    if (z < 1 || z > 90) continue;
    const content = slotContent(n);
    const lanes = slotLanes(n, content);
    yield { slotIndex: n, z, lanes, x: lanesCenterX(lanes), ...content };
  }
}

// Cache par frame : update(), roofOverlap() et render() appellent tous
// visibleSlots() sur la même horloge/vitesse. Sans cache, c'est jusqu'à 3
// itérations complètes de la fenêtre (~11 slots × plusieurs hash chacun) par
// frame — pour rien, le résultat est identique. Invalidation implicite : dès
// que (now, speed) change, la clé change et on refait le tour.
const slotCache = { now: NaN, speed: NaN, list: [] };
function slotsFor(now, speed) {
  if (slotCache.now === now && slotCache.speed === speed) return slotCache.list;
  slotCache.list.length = 0;
  for (const e of visibleSlots(now, speed)) slotCache.list.push(e);
  slotCache.now = now;
  slotCache.speed = speed;
  return slotCache.list;
}
function invalidateSlotCache() {
  slotCache.now = NaN;
  slotCache.speed = NaN;
}

const resolved = new Set(); // plus retesté pour la collision (touché, ramassé, ou raté)
// Sous-ensemble de `resolved` réellement touché/ramassé : ceux-là disparaissent
// à l'impact (render() les saute). Un objet raté reste dans `resolved` (pour ne
// pas le retester) mais PAS dans `consumed` : il continue d'être dessiné et
// poursuit sa trajectoire jusqu'à sortir du champ de vision, comme un objet
// jamais évalué — cf. visibleSlots, coupure à z < 1.
const consumed = new Set();

// Avance la logique de collision/ramassage pour ce tick.
// `inAir` : true si le joueur est en 'air' ou 'onCar' (voir main.js). Rend
// les voitures et le cône non-mortels (on est au-dessus) et permet de choper
// une étoile aérienne (elle est en hauteur). Le piéton, lui, blesse toujours
// s'il y a alignement latéral — c'est un mur humain plein, on ne le saute pas.
// Renvoie les événements survenus : [{ type: "bonus"|"obstacle", kind }].
export function update(playerLane, inAir) {
  const now = clock.now();
  const speed = road.getSpeed();
  const events = [];
  // Le joueur est sur une voie et une seule : « même voie » remplace tous les
  // tests de distance latérale du modèle continu précédent.
  const sameLane = (e) => e.lanes.includes(playerLane);

  for (const e of slotsFor(now, speed)) {
    if (resolved.has(e.slotIndex)) continue;

    if (e.isBonus) {
      // Fenêtre "à la hauteur du joueur"
      if (e.z > road.PLAYER_NEAR_Z + Z_WINDOW) continue;
      if (e.z < road.PLAYER_NEAR_Z - Z_WINDOW) { resolved.add(e.slotIndex); continue; }
      const inReach = sameLane(e);
      const aerien = AIR_BONUS_KINDS.has(e.kind);
      if (inReach && (!aerien || inAir)) {
        events.push({ type: "bonus", kind: e.kind });
        resolved.add(e.slotIndex);
        consumed.add(e.slotIndex);
      }
    } else if (isCarSlot(e)) {
      // Rangée de voitures sur des voies différentes, à la même profondeur.
      // Une SEULE résolution pour toute la rangée — toucher n'importe
      // laquelle des voitures compte comme UNE collision, pas plusieurs.
      if (inAir) continue; // le joueur survole, aucune voiture n'est mortelle
      if (e.z > road.PLAYER_NEAR_Z + Z_WINDOW) continue;
      if (e.z < road.PLAYER_NEAR_Z - Z_WINDOW) { resolved.add(e.slotIndex); continue; }
      if (sameLane(e)) {
        events.push({ type: "obstacle", kind: "voiture" });
        resolved.add(e.slotIndex);
        consumed.add(e.slotIndex);
      }
    } else if (e.kind === "cone") {
      if (e.z > road.PLAYER_NEAR_Z + Z_WINDOW) continue;
      if (e.z < road.PLAYER_NEAR_Z - Z_WINDOW) { resolved.add(e.slotIndex); continue; }
      // Le cône se saute par-dessus OU se contourne en changeant de voie.
      if (sameLane(e) && !inAir) {
        events.push({ type: "obstacle", kind: e.kind });
        resolved.add(e.slotIndex);
        consumed.add(e.slotIndex);
      }
    } else {
      // Piéton : mur humain plein — collision fatale même en l'air. Ne se
      // saute pas, se contourne latéralement uniquement.
      if (e.z > road.PLAYER_NEAR_Z + Z_WINDOW) continue;
      if (e.z < road.PLAYER_NEAR_Z - Z_WINDOW) { resolved.add(e.slotIndex); continue; }
      if (sameLane(e)) {
        events.push({ type: "obstacle", kind: e.kind });
        resolved.add(e.slotIndex);
        consumed.add(e.slotIndex);
      }
    }
  }

  return events;
}

// Le joueur peut-il "atterrir sur" ou "rester sur" une rangée de voitures ?
// Consulté chaque frame par main.js (mode 'onCar'). Retourne true si le
// joueur est aligné latéralement avec une rangée non-résolue ET si sa
// profondeur est dans la fenêtre longue autour de PLAYER_NEAR_Z (le joueur
// est encore à sa hauteur, ni avant ni après).
export function roofOverlap(playerLane) {
  const now = clock.now();
  const speed = road.getSpeed();
  for (const e of slotsFor(now, speed)) {
    if (!isCarSlot(e)) continue;
    if (resolved.has(e.slotIndex)) continue;
    if (!e.lanes.includes(playerLane)) continue;
    if (e.z <= road.PLAYER_NEAR_Z + ROOF_LONG_TOLERANCE &&
        e.z >= road.PLAYER_NEAR_Z - ROOF_LONG_TOLERANCE) {
      return true;
    }
  }
  return false;
}

export function reset() {
  resolved.clear();
  consumed.clear();
  debugOverrides.clear();
  npcVisibilityDecision.clear();
  invalidateSlotCache();
}

// DEBUG uniquement : force l'apparition d'un bonus/obstacle donné pile devant
// le joueur, sans attendre son tour dans la grille de spawn calée sur les
// beats — passe par le même chemin de code (slotContent/slotLanes/update/render)
// que le spawn normal, pour tester la collision/le ramassage sans jouer une
// partie entière.
export function forceSpawn(isBonus, kind, playerLane) {
  const now = clock.now();
  const slotIndex = Math.floor(clock.beatIndexAt(now) / CADENCE);
  resolved.delete(slotIndex);
  consumed.delete(slotIndex);
  debugOverrides.set(slotIndex, { isBonus, kind, lane: playerLane });
  invalidateSlotCache();
}

// --- Rendu : icônes pré-rendues en pixel art (basse résolution + pas de
// lissage), même traitement que le sprite du joueur — pas de formes
// vectorielles à bords doux/contours épais qui jureraient avec le reste. ---

// Résolution native de chaque icône, en pixels. 20 → 40 en même temps que le
// doublement de ICON_WORLD ci-dessous : sans ça, une icône deux fois plus
// grosse à l'écran serait dessinée avec des pixels deux fois plus gros
// (bouillie à faible distance). Tous les dessins d'icônes sont exprimés en
// fonction de `r` (dérivé de ICON_SIZE), donc ce changement est proportionnel
// et ne touche à aucune silhouette.
const ICON_SIZE = 40;
// Taille de l'icône dans le monde (unités), au sol. 0.85 → 1.02 (+20 %) →
// 2.04 (×2, demandé : "grossir les objets en fois deux").
// ⚠️ Depuis le passage aux 4 voies, la taille de l'icône n'a plus AUCUN effet
// sur la collision : celle-ci est un test d'égalité de voie. La taille est
// donc purement une question de lisibilité — un objet doit se lire comme
// « il est dans cette voie-là », sans mordre visuellement sur les voisines
// (une voie fait 2 unités de large).
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
const DANGER_HI = "#ff8a72";
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
  const centerX = width / 2;
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
  // Feux arrière (rectangles clairs collés au bord droite/gauche). Allumés
  // (demandé explicitement) : halo rouge additif par-dessus, même technique
  // que le halo de ramassage du joueur (composite "lighter", voir player.js).
  const lightW = (gNR.x - gNL.x) * 0.14;
  const lightH = bhN * 0.28;
  const lightY = gNL.y - bhN * 0.85;
  ctx.fillStyle = lit ? "#ff5a3c" : REFLECT;
  ctx.fillRect(gNL.x + 2, lightY, lightW, lightH);
  ctx.fillRect(gNR.x - 2 - lightW, lightY, lightW, lightH);
  if (lit) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const lx of [gNL.x + 2 + lightW / 2, gNR.x - 2 - lightW / 2]) {
      const glow = ctx.createRadialGradient(lx, lightY + lightH / 2, 0, lx, lightY + lightH / 2, lightW * 1.8);
      glow.addColorStop(0, "rgba(255,90,60,0.55)");
      glow.addColorStop(1, "rgba(255,90,60,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(lx, lightY + lightH / 2, lightW * 1.8, 0, Math.PI * 2);
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

function fillPoly(ctx, pts, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.fill();
}

// --- Cyclistes NPC en sens inverse -----------------------------------------
// Playtest iPhone 16 : « des cyclistes en sens inverse sur certaines voies ».
// Entièrement DÉCORATIFS — pas de collision, pas de resolved/consumed, aucun
// des 3 obstacles verrouillés au brief n'est touché. Générateur indépendant
// du reste du module (créneaux/hash/cadence propres) pour ne jamais perturber
// les probabilités bonus/obstacle déjà réglées.
// Voies extérieures uniquement (0 et 3, les bords de chaussée) : ça se lit
// comme une bande cyclable plutôt que de se mêler au trafic des voies
// centrales, où se joue le vrai gameplay.
const NPC_CADENCE = CADENCE * 4;   // créneaux bien plus espacés que bonus/obstacles : rare, pas envahissant
const NPC_LOOKAHEAD = 6;
const NPC_SPAWN_CHANCE = 0.35;     // fraction des créneaux NPC qui contiennent vraiment un cycliste
const NPC_LANES = [0, road.LANE_COUNT - 1];
// Vitesse de rapprochement AJOUTÉE à celle de la route (contrairement aux
// bonus/obstacles, immobiles dans le monde — seul le défilement de la route
// les rapproche) : c'est ce qui donne la sensation "vient vers moi", pas
// juste "posé sur le trajet". ~2× la vitesse d'un piéton, cohérent avec un
// vélo roulant en sens inverse.
const NPC_CLOSING_EXTRA = 7;

function npcHash(slotIndex) {
  return hash(slotIndex * 53 + 991); // multiplicateurs distincts des autres hash() du module : pas de corrélation avec bonus/obstacles
}

// --- Anti-collision NPC / entités ------------------------------------------
// Playtest : « il y a des étoiles qui rentrent en collision avec des gens en
// vélo, je ne peux pas l'attraper » / « des cyclistes qui sont derrière des
// voitures ». Les cyclistes NPC sont un générateur entièrement indépendant
// (cadence propre, vitesse de rapprochement propre — voir NPC_CLOSING_EXTRA)
// des bonus/obstacles/voitures : rien n'empêchait qu'un cycliste et une
// étoile/voiture occupent la même voie à la même profondeur au même instant.
// Un cycliste est purement décoratif : en cas de conflit, c'est TOUJOURS lui
// qui s'efface, jamais l'inverse — score et vies ne doivent jamais dépendre
// de la présence d'un élément de décor.
// Fenêtre un peu plus large que la plus grande icône/voiture (ICON_WORLD
// 2.04, profondeur voiture 2×CAR_HALF_L ≈ 2.55) pour une vraie marge visuelle
// autour de l'objet, pas juste éviter la superposition pixel exacte.
const NPC_CONFLICT_WINDOW = 2.6;
function laneOccupiedByEntity(lane, z, now, speed) {
  for (const e of slotsFor(now, speed)) {
    if (consumed.has(e.slotIndex)) continue; // déjà ramassé/percuté : ne bloque plus rien
    if (!e.lanes.includes(lane)) continue;
    if (Math.abs(e.z - z) < NPC_CONFLICT_WINDOW) return true;
  }
  return false;
}

// 🐛 Playtest suivant : « j'ai vu un vélo qui s'est approché d'une étoile, et
// du coup le vélo a disparu » — laneOccupiedByEntity() re-testait la position
// EN DIRECT à chaque frame, donc un cycliste déjà affiché à l'écran pouvait se
// mettre à correspondre au critère de conflit en cours de route (l'étoile et
// lui se rapprochant à des vitesses différentes) et disparaître d'un coup en
// plein vol — un vrai bug visuel, pas juste "le principe est trop strict"
// (retour explicite : « je ne veux pas du tout du principe que si il y a une
// étoile, il ne peut pas y avoir un vélo qui fonce dessus »). Correctif : la
// décision n'est plus prise à chaque frame mais UNE SEULE FOIS par cycliste,
// à sa première apparition dans la fenêtre visible — mémorisée ensuite, donc
// stable jusqu'à sa sortie de l'écran. Un cycliste qui est visible reste
// visible ; celui qui aurait chevauché une étoile/voiture n'apparaît tout
// simplement jamais.
const npcVisibilityDecision = new Map(); // slotIndex -> boolean
function npcAllowed(slotIndex, lane, z, now, speed) {
  if (npcVisibilityDecision.has(slotIndex)) return npcVisibilityDecision.get(slotIndex);
  const allowed = !laneOccupiedByEntity(lane, z, now, speed);
  npcVisibilityDecision.set(slotIndex, allowed);
  return allowed;
}

function npcContentAt(slotIndex) {
  if (npcHash(slotIndex) > NPC_SPAWN_CHANCE) return null;
  const lane = NPC_LANES[Math.floor(hash(slotIndex * 29 + 17) * NPC_LANES.length) % NPC_LANES.length];
  const outfitIndex = Math.floor(hash(slotIndex * 71 + 3) * cyclists.OUTFIT_COUNT) % cyclists.OUTFIT_COUNT;
  return { lane, outfitIndex };
}

function* visibleNpcs(now, speed) {
  const currentSlot = Math.floor(clock.beatIndexAt(now) / NPC_CADENCE);
  for (let n = Math.max(0, currentSlot - 1); n <= currentSlot + NPC_LOOKAHEAD; n++) {
    const content = npcContentAt(n);
    if (!content) continue;
    const beatN = n * NPC_CADENCE;
    const deltaT = clock.timeOfBeat(beatN) - now;
    const z = road.PLAYER_NEAR_Z + deltaT * (speed + NPC_CLOSING_EXTRA);
    if (z < 1 || z > road.HORIZON_Z) continue;
    if (!npcAllowed(n, content.lane, z, now, speed)) continue;
    yield { z, x: road.laneX(content.lane), outfitIndex: content.outfitIndex };
  }
}

function renderNpcCyclists(ctx, width, height, now, speed) {
  const npcs = [];
  for (const n of visibleNpcs(now, speed)) npcs.push(n);
  npcs.sort((a, b) => b.z - a.z); // du plus loin au plus près, même algorithme du peintre que le reste
  for (const n of npcs) {
    const p = road.project(n.x, n.z, width, height);
    cyclists.render(ctx, n.outfitIndex, p.x, p.y, p.scale, now);
  }
}

export function render(ctx, width, height) {
  const now = clock.now();
  const speed = road.getSpeed();
  ctx.imageSmoothingEnabled = false;

  // Cyclistes NPC en sens inverse (décor) : peints EN PREMIER, sous les vrais
  // bonus/obstacles — un élément purement décoratif ne doit jamais recouvrir
  // ce qui compte pour le score/les vies.
  renderNpcCyclists(ctx, width, height, now, speed);

  // Un objet raté (dans `resolved` mais pas `consumed`) continue sa
  // trajectoire à l'écran jusqu'à sortir du champ de vision (voir
  // visibleSlots, z < 1) au lieu de disparaître pile à hauteur du joueur.
  // Seul un objet réellement touché/ramassé (`consumed`) disparaît ici,
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
  for (let i = slots.length - 1; i >= 0; i--) {
    const e = slots[i];
    if (consumed.has(e.slotIndex)) continue;
    // Même règle que les bâtiments : rien ne se dessine derrière l'horizon
    // courbe, où la projection se replierait. L'objet apparaît en surgissant
    // de derrière la courbe, ce qui est justement l'effet recherché.
    if (e.z > road.HORIZON_Z) continue;

    // Rangée de voitures : un volume faux-3D par voie occupée, toutes à la
    // même profondeur (plus de convoi étagé en Z) — l'ordre entre elles
    // n'a pas d'importance, leurs empans en x ne se recouvrent pas.
    if (isCarSlot(e)) {
      for (let i = 0; i < e.lanes.length; i++) {
        const color = carColorFor(e.slotIndex, i);
        const lit = carLitFor(e.slotIndex, i);
        renderCar3D(ctx, road.laneX(e.lanes[i]), e.z, width, height, color, lit);
      }
      continue;
    }

    // Piétons animés : jambes qui alternent au fil du temps, avec des outfits.
    if (!e.isBonus && e.kind === "pieton") {
      const p = road.project(e.x, e.z, width, height);
      // Outfit déterministe basé sur le slot du piéton (jamais aléatoire une
      // fois spawné, pour stabilité à l'écran). Hash du slot divise par
      // nombre d'outfits disponibles.
      const outfitIndex = Math.abs(hash(e.slotIndex * 7)) % Object.keys(pedestrians.PEDESTRIAN_ICONS).length;
      const outfitType = Object.keys(pedestrians.PEDESTRIAN_ICONS)[outfitIndex];
      const pedestrianDrawer = pedestrians.makePedestrianIcon(outfitType, clock.now());
      // p.y = point au SOL de la projection, et le dessinateur attend
      // justement les pieds du piéton en y (voir pedestrians.js). On passait
      // `p.y - largeur` jusqu'ici, ce qui le faisait flotter au-dessus de la
      // chaussée — d'autant plus visible depuis que les piétons ont doublé
      // de taille.
      pedestrianDrawer(ctx, p.x, p.y, p.scale);
      continue;
    }

    const p = road.project(e.x, e.z, width, height);
    const icon = e.isBonus ? BONUS_ICONS[e.kind] : OBSTACLE_ICONS[e.kind];
    const size = (e.isBonus ? BONUS_ICON_WORLD : ICON_WORLD) * p.scale;
    const aerien = e.isBonus && AIR_BONUS_KINDS.has(e.kind);
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
}
