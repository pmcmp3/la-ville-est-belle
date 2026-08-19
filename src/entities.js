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
// 10 → 16 le 19 août 2026, avec la hausse de VISIBLE_Z_MAX ci-dessous : à la
// vitesse de DÉPART (la plus contraignante, les créneaux n'y sont espacés que
// de ~14,9 u), couvrir 145 u de champ demande ~8,9 créneaux — 10 passait tout
// juste, sans marge pour le facteur d'approche des cyclistes (×1,35, qui les
// place plus loin). En manquer aurait fait apparaître les objets en plein
// milieu du champ au lieu de l'horizon, exactement le défaut qu'on corrige.
const LOOKAHEAD_SLOTS = 16;

// Distance (unités-monde) au-delà de laquelle un créneau n'est pas encore
// pris en compte par visibleSlots() — la vraie limite de visibilité utilisée
// par le jeu, indépendante du nombre de créneaux de lookahead (voir LEAD_IN
// ci-dessous, qui vise CE repère plutôt qu'un compte de créneaux).
// ⚠️ 90 → 145 le 19 août 2026 (« les objets chargent trop près du joueur, il
// faut qu'on les voie apparaître un peu plus loin »). C'ÉTAIT LE VRAI GOULOT :
// l'horizon valait déjà 136 u et les bâtiments s'y rendaient, mais les
// bonus/obstacles étaient coupés à 90 — ils surgissaient donc à mi-chemin,
// bien après le décor, ce qui se lit comme « ils chargent en retard ». Recalé
// juste sous le nouvel HORIZON_Z (≈ 155) pour que les objets sortent de la
// courbe en même temps que le reste de la scène.
export const VISIBLE_Z_MAX = 145;
// Fondu d'apparition des objets sur les dernières unités avant VISIBLE_Z_MAX
// (« il faut que le chargement soit plus progressif »). Même principe que
// FADE_BAND pour les bâtiments (world.js) : sans lui, un objet apparaît d'un
// coup à pleine opacité pile sur le seuil de coupure — un pop-in, d'autant
// plus visible maintenant que le seuil est loin. Consommé par
// entities-render.js, qui est seul à savoir peindre.
export const FADE_BAND = 34;
// Petite marge pour que le créneau 0 soit franchement DANS la fenêtre dès la
// première frame, pas pile sur le seuil de coupure (évite tout flottement).
const LEAD_IN_VISIBILITY_MARGIN = 2;

// Décalage à appliquer à l'horloge de jeu au tout début d'une course (voir
// main.js, appelé juste après clock.setTimeSource) — corrige un vrai bug
// visuel signalé au playtest : « animation bizarre au tout début, les
// étoiles apparaissent et disparaissent, comme si tout était déjà chargé ».
// Cause : clock.now() vaut exactement 0 à l'instant où gameStarted passe à
// vrai, or le créneau 0 (premier temps du morceau) est censé arriver PILE à
// cet instant — sans décalage, le tout premier lot de créneaux (la période
// de grâce) se retrouve donc déjà À la position du joueur dès la toute
// première frame au lieu d'avoir défilé depuis l'horizon comme n'importe
// quel créneau plus tard dans la partie (seuls ceux-là "popent" au lieu de
// glisser, parce qu'ils n'ont jamais eu de frame précédente pour approcher
// progressivement).
//
// ⚠️ Recalé le 12 août 2026 — l'ancienne formule (LOOKAHEAD_SLOTS × CADENCE ×
// beatPeriod = 7,5 s) visait le mauvais repère : un nombre de créneaux de
// délai MUSICAL, pas la distance de visibilité RÉELLE (VISIBLE_Z_MAX). À la
// vitesse de départ, le créneau 0 démarrait donc à z ≈ 162 — largement
// au-delà de VISIBLE_Z_MAX — et restait invisible pendant near 3,6 s à
// CHAQUE partie avant de franchir le seuil. Signalé par l'artiste : « au
// démarrage, il n'y a rien du tout comme objet ». Nouvelle formule : on
// résout directement le décalage qui place le créneau 0 à VISIBLE_Z_MAX
// (moins une petite marge) à la vitesse de départ — il est donc déjà visible
// dès la première frame, puis glisse normalement jusqu'au joueur comme tous
// les créneaux suivants.
export const LEAD_IN =
  (VISIBLE_Z_MAX - LEAD_IN_VISIBILITY_MARGIN - road.PLAYER_NEAR_Z) / road.getSpeed() -
  window.CONFIG.premierTempsOffset;

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
// 200 → 140 le 17 août 2026 : dureeCourse a été raccourcie à 70 % (205 → 143,5
// s, "course trop longue") — à quota FIXE, un parcours 30 % plus court aurait
// laissé moins de créneaux totaux (TOTAL_OBJECTS) que d'étoiles à y caser,
// rendant BONUS_RATIO_START > 1 (le cas dégénéré déjà rencontré une fois, qui
// avait fait perdre une étoile en silence — voir isBonusQuota plus bas).
// TOTAL_STARS baisse donc à la MÊME proportion (×0,7) pour garder la même
// densité de jeu sur un parcours plus court, pas juste éviter le bug.
// ⚠️ N'est plus une constante écrite à la main depuis le 19 août 2026 : c'est
// désormais le nombre d'étoiles que produit la loi de difficulté
// (obstacleRatioAt, plus bas), COMPTÉ sur le parcours réel. Défini tout en bas
// du fichier, une fois `isBonusQuota` construit — voir la note d'arbitrage
// là-bas. La propriété produit ne bouge pas (« chaque partie a exactement le
// même nombre d'étoiles, le score max est un nombre connu »), seule sa valeur
// est maintenant une conséquence de la difficulté demandée au lieu d'une
// contrainte qui la bridait.
// ⚠️ Deuxième renversement (12 août 2026, même jour, retour ultérieur) : la
// ligne d'arrivée n'est plus calée sur la fin du morceau (`dureeMorceau`) mais
// sur `dureeCourse` (config.js, 205 s = "03:25"), un réglage séparé — demandé
// explicitement pour que la course soit plus courte que le morceau. Le
// morceau, lui, continue de jouer après la ligne jusqu'à sa fin réelle
// (257,9 s) : l'écran de fin/le classement s'affichent pendant que le
// morceau tourne encore ~53 s, cohérent avec l'objectif "donner envie
// d'écouter le morceau". Dernier créneau qui tient AVANT dureeCourse.
export const TOTAL_OBJECTS = Math.floor(
  (window.CONFIG.dureeCourse - window.CONFIG.premierTempsOffset) / (CADENCE * clock.beatPeriod)
);
// Ce qui reste une fois les étoiles placées. ⚠️ Commentaire remis à jour le
// 19 août 2026 : il décrivait encore l'état du 12 août (« les 200 étoiles ne
// bougent pas », course de 205 s) et concluait qu'il faudrait un jour baisser
// TOTAL_STARS pour retrouver la densité de danger d'avant. C'est fait depuis
// le 17 août — TOTAL_STARS est passé à 140, à la même proportion que
// dureeCourse (×0,7), donc la densité par créneau ne bouge plus. Valeurs
// actuelles : 191 créneaux, 140 étoiles, 51 obstacles (vérifié par balayage
// hors ligne, voir ARCHITECTURE.md §5.4).
// (TOTAL_STARS / TOTAL_OBSTACLES sont définis plus bas, après isBonusQuota :
// ils se COMPTENT sur le quota réellement produit par la loi de difficulté.)
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
const Z_WINDOW_AIR = 2.2;  // fenêtre élargie pour les bonus aériens (le timing du saut doit être tolérant)
// Plus de rayon de collision en unités-monde : depuis le passage aux 4 voies,
// tout est posé sur une voie et la collision est un test d'ÉGALITÉ de voie.
// C'est ce qui règle les deux reproches du playtest d'un coup — « t'es short
// sur les hitbox » (on touchait à côté de ce qu'on voyait) et « je peux rester
// là indéfiniment » (il n'existe plus de position hors-voie où camper).
const GRACE_BEATS = 4;     // ~2s à 120 bpm sans obstacle, juste le temps de voir la route avant le premier danger
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
// ⚠️ RAMPE INVERSÉE (12 août 2026). Elle allait de 0,8 à 0,53 : beaucoup
// d'étoiles tôt, de moins en moins tard (« plus on avance, plus ça doit être
// difficile de récolter », playtest antérieur). Le retour sur iPhone dit
// l'inverse : « les étoiles, faut pas qu'il y en ait autant au début, faut que
// ce soit assez progressif » — le début se jouait tout seul, on ramassait sans
// rien risquer, et le score était déjà fait à mi-parcours.
// La difficulté ne disparaît pas pour autant en fin de course : elle change de
// nature. Tôt, elle vient de la DENSITÉ d'obstacles (55 % des créneaux) ;
// tard, de la VITESSE (66 u/s contre 19,8 au départ, soit 3,3× moins de temps
// pour lire la route et se déporter). Les étoiles se font plus nombreuses au
// moment précis où elles deviennent difficiles à aller chercher.
// ⚠️ RAMPE REMPLACÉE PAR UN DOUBLEMENT EXPONENTIEL (19 août 2026, demandé
// explicitement : « multiplie par deux le nombre d'obstacles toutes les 25
// secondes, parce que c'est trop facile, il faut vraiment que ce soit
// extrêmement difficile »).
//
// Ce qu'il y avait avant : une rampe LINÉAIRE du ratio d'étoiles, de 0,62 à
// 0,84 — autrement dit la densité d'OBSTACLES *baissait* de 38 % à 16 % au fil
// de la course. Le raisonnement d'alors (la difficulté change de nature :
// densité tôt, vitesse tard) ne tenait plus à l'usage : c'est exactement la
// plainte remontée deux fois de suite (« ça manque d'obstacles dès que je suis
// à 80000 », puis « c'est trop facile »). La fin de course était la portion la
// plus vide du jeu.
//
// Maintenant : la densité d'obstacles DOUBLE toutes les 25 s, plafonnée. Elle
// monte donc au lieu de descendre, ce qui est tout l'objet de la demande.
//
// ⚠️ Arbitrage tranché par l'artiste (les deux contraintes sont
// mathématiquement incompatibles) : un créneau porte soit une étoile soit un
// obstacle, et il y en a 191 — doubler les obstacles fait donc forcément
// tomber le quota d'étoiles, qui était « verrouillé » à 140. Trois scénarios
// chiffrés lui ont été soumis ; il a choisi le plafond à 60 %, qui plus que
// DOUBLE les obstacles (51 → ~111) tout en gardant le combo atteignable —
// à 85 % de plafond, enchaîner 5 étoiles devenait statistiquement impossible
// et le combo, ajouté deux jours plus tôt, serait mort avec.
// Le quota reste EXACT et connu d'avance (même mécanique de diffusion
// d'erreur, voir plus bas) : c'est sa VALEUR qui change, pas la propriété.
// TOTAL_STARS en est désormais DÉRIVÉ au lieu d'être écrit à la main.
const OBSTACLE_DOUBLING_TIME_S = 25;
// Densité d'obstacles au tout début : celle d'avant (0,381), pour que
// l'ouverture de course garde exactement le rythme déjà validé au playtest —
// c'est la SUITE qui change, en montant au lieu de descendre.
const OBSTACLE_RATIO_START = 0.381;
// Plafond : au-delà, la route n'offre plus assez d'étoiles pour que le combo
// existe, et un ratio qui approcherait 1 ferait replonger dans le cas dégénéré
// documenté plus bas (un créneau ne peut porter qu'UN objet). Atteint vers
// 16 s de course, la densité reste donc à 60 % tout le reste du parcours.
const OBSTACLE_RATIO_MAX = 0.60;

// Densité d'obstacles visée au créneau `i`, d'après le temps musical où il
// arrive (donc une fonction pure de l'index, comme tout ce fichier).
function obstacleRatioAt(slotIndex) {
  const t = clock.timeOfBeat(slotIndex * CADENCE);
  const brut = OBSTACLE_RATIO_START * Math.pow(2, t / OBSTACLE_DOUBLING_TIME_S);
  return Math.min(OBSTACLE_RATIO_MAX, brut);
}
// ⚠️ L'invariant qui compte n'a PAS changé : un ratio est une probabilité de
// tramage par créneau, et un créneau ne peut porter qu'UN SEUL objet — au-delà
// de 1, un même créneau franchirait plus d'un palier entier d'un coup et
// l'étoile « en trop » disparaîtrait en silence (c'est le bug qui a coûté deux
// sessions, voir l'historique en ARCHITECTURE.md §5.4). Ici le ratio d'étoiles
// vaut 1 − obstacleRatioAt(), donc il vit entre 0,40 (plafond d'obstacles
// atteint) et 0,62 (départ) : jamais près de 1, la marge est structurelle et
// non plus le fruit d'une dérivation à surveiller.

// Marge après la ligne d'arrivée : visibleSlots() peut regarder jusqu'à
// LOOKAHEAD_SLOTS créneaux au-delà du dernier passé, il faut donc un tableau
// un peu plus long que TOTAL_OBJECTS pour ne jamais lire hors limites.
const QUOTA_MARGIN = LOOKAHEAD_SLOTS + 1;
const isBonusQuota = (() => {
  const arr = new Array(TOTAL_OBJECTS + QUOTA_MARGIN).fill(false);
  for (let i = 0; i < GRACE_SLOTS && i < arr.length; i++) arr[i] = true;

  let cumul = 0;
  let prevFloor = 0;
  for (let i = GRACE_SLOTS; i < arr.length; i++) {
    const ratio = 1 - obstacleRatioAt(i);
    cumul += ratio;
    // Epsilon : le cumul final vaut EXACTEMENT le quota par construction, donc
    // il tombe pile sur un entier — l'endroit précis où une addition flottante
    // qui atterrit à 196,999999 coûte une étoile pour rien.
    const floor = Math.floor(cumul + 1e-9);
    arr[i] = floor > prevFloor;
    prevFloor = floor;
  }
  return arr;
})();

function isBonusAt(slotIndex) {
  return slotIndex >= 0 && slotIndex < isBonusQuota.length && isBonusQuota[slotIndex];
}

// Quota réellement produit par la loi de difficulté, COMPTÉ sur les créneaux
// du parcours (la marge de lookahead est exclue : ces créneaux-là sont
// calculés mais jamais joués, visibleSlots() s'arrête à TOTAL_OBJECTS).
// C'est ce comptage qui garantit la propriété produit : le nombre est le même
// à chaque partie (tout est déterministe, ARCHITECTURE.md §5.2) et connu
// d'avance, donc le score maximum reste calculable — c'est seulement sa VALEUR
// qui a changé le 19 août 2026 avec le doublement de difficulté (140 → ~80).
export const TOTAL_STARS = isBonusQuota
  .slice(0, TOTAL_OBJECTS)
  .reduce((n, estEtoile) => n + (estEtoile ? 1 : 0), 0);
export const TOTAL_OBSTACLES = TOTAL_OBJECTS - TOTAL_STARS;

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
// cycliste : 4e type d'obstacle, ajouté quand les cyclistes en sens inverse
// sont passés de décor à vrai danger (« on fait en sorte que les cyclistes
// deviennent tous des obstacles »). Il remplace l'ancien générateur NPC
// séparé qui vivait en bas de ce fichier — voir la note sur OBSTACLE_KINDS
// plus bas pour la raison. Son poids est pris SUR celui des trois autres, pas
// ajouté par-dessus : TOTAL_OBSTACLES reste à 100, donc la difficulté globale
// du parcours et le quota exact de 200 étoiles ne bougent pas d'un pouce.
// La voiture reste largement dominante (retour playtest : « multiplie par
// trois le nombre de voitures présentes partout »).
// Poids revus le 12 août 2026 sur retour iPhone : « il faut que tu mettes
// beaucoup plus de gens qui font du vélo » et « tu peux mettre un petit peu
// plus de voiture ». Le piéton garde à peu près son effectif absolu (son poids
// baisse, mais il y a 143 obstacles au lieu de 100) — il n'a rien fait de mal,
// il ne devait juste plus être le seul obstacle humain.
// `pont` (5e type, viaduc du métro) ajouté ensuite : poids pris SUR les
// quatre autres au prorata (même convention que pour le cycliste plus haut),
// TOTAL_OBSTACLES ne bouge pas. 10 % de départ, confirmé/ajusté par le
// recensement hors ligne décrit en ARCHITECTURE.md §12.
// 0,10 → 0,30 le 17 août 2026 (« beaucoup plus de ponts », demandé
// explicitement) : même convention, pris au prorata sur les quatre autres
// (facteur ×0,7̄ appliqué à chacun pour que la somme retombe pile sur 1).
// Voir aussi PONT_TIME_BOOST_FACTOR plus bas pour l'intensification
// supplémentaire en fin de course (« surtout sur la fin »), composée
// par-dessus CETTE table (et par-dessus les boosts voiture/cycliste
// existants) plutôt que d'être une 5e table nommée séparée.
const OBSTACLE_WEIGHTS = [
  { kind: "voiture", weight: 0.366 },
  { kind: "cycliste", weight: 0.194 },
  { kind: "pieton", weight: 0.086 },
  { kind: "cone", weight: 0.054 },
  { kind: "pont", weight: 0.30 },
];

function scaleWeights(list, factors) {
  const scaled = list.map((item) => (factors[item.kind] ? { kind: item.kind, weight: item.weight * factors[item.kind] } : item));
  const total = scaled.reduce((sum, item) => sum + item.weight, 0);
  return scaled.map((item) => ({ kind: item.kind, weight: item.weight / total }));
}

// Intensification vélos/voitures/ponts par PALIERS DE SCORE, SANS PLAFOND
// (demandé le 17 août 2026 : « ça manque d'obstacles dès que je suis à
// 80000... où sont les ponts, les voitures ? complexifie et intensifie »).
// Remplace l'ancien seuil unique (« ×2 cycliste à partir de 10 000 points ») :
// celui-là arrêtait de faire quoi que ce soit une fois franchi, alors que le
// combo (voir main.js, comboMultiplier()) permet désormais de monter bien
// plus haut (jusqu'à ~195 000 en théorie) — un joueur doué restait ensuite
// sur la même difficulté quel que soit son score. Ici, tous les
// SCORE_TIER_SIZE points, TOUS les types dangereux (voiture, cycliste, pont)
// voient leur poids multiplié un peu plus, cumulativement, comme le combo.
// Composé dynamiquement (comme applyPontLateBoost plus bas) plutôt que
// précalculé : une échelle continue n'a pas de table finie à figer d'avance.
// ⚠️ 15 000 → 5 000 le 19 août 2026, mis à l'échelle du nouveau plafond de
// score. Ces paliers avaient été calibrés quand un run parfait montait à
// ~195 000 ; le doublement de difficulté (voir obstacleRatioAt) fait tomber ce
// plafond à ~61 400, et à 15 000 le pas n'aurait plus laissé que 4 paliers sur
// une partie entière au lieu de 13 — l'intensification par score se serait
// éteinte d'elle-même, exactement le défaut qu'elle avait été écrite pour
// corriger le 17 août. Le rapport ancien/nouveau plafond (≈ 0,31) donne ~4 700,
// arrondi à 5 000.
const SCORE_TIER_SIZE = 5000;
const SCORE_TIER_FACTOR = 0.35; // +0,35 par palier, cumulatif : 5k→×1,35, 10k→×1,7, 60k→×5,2 (12 paliers)
function scoreTierMultiplier() {
  return 1 + SCORE_TIER_FACTOR * Math.floor(currentScore / SCORE_TIER_SIZE);
}
function applyScoreTierBoost(weights) {
  const factor = scoreTierMultiplier();
  if (factor <= 1) return weights;
  return scaleWeights(weights, { voiture: factor, cycliste: factor, pont: factor });
}

// Intensification voitures/vélos à partir d'1/3 de course écoulé (demandé
// explicitement le 13 août 2026, retour ami — déclenché à l'origine à 1:30
// sur une course de 205 s). Déclenchée par le TEMPS écoulé (contrairement au
// boost vélo ci-dessus, déclenché par le SCORE) : c'est donc, comme le reste
// de ce fichier, une fonction pure de slotIndex — pas besoin d'un setter côté
// main.js. CAR_TIME_BOOST_SLOT convertit ce temps en index de créneau via la
// même conversion temps→battement→créneau que TOTAL_OBJECTS plus haut.
// 90 → 63 s le 17 août 2026 : dureeCourse a été raccourcie ×0,7 (205 → 143,5),
// le seuil suit la même proportion pour se déclencher au même MOMENT relatif
// de la course (≈ 44 % du parcours), pas 90 s absolues qui arriveraient
// beaucoup plus tard proportionnellement sur un parcours plus court.
const CAR_TIME_BOOST_TIME_S = 63;
const CAR_TIME_BOOST_SLOT = Math.floor(clock.beatIndexAt(CAR_TIME_BOOST_TIME_S) / CADENCE);
// « un petit peu plus de cyclistes » (13 août) : facteur modeste (1,3×).
// Intensifiés le 17 août 2026 (« intensification plus punitive » demandée
// avec le doublement de la difficulté) : voiture 2× → 2,5×, cycliste
// 1,3× → 1,6×. Se cumule avec le palier de score ci-dessus (composé par
// applyScoreTierBoost sur CETTE table, voir computeRawSlotContent plus bas) —
// plus de table "temps ET score" séparée depuis que le score-boost est
// devenu une échelle continue plutôt qu'un seuil unique.
const CAR_TIME_BOOST_FACTOR = 2.5;
const CYCLIST_TIME_BOOST_FACTOR = 1.6;
const TIME_BOOSTED_OBSTACLE_WEIGHTS = scaleWeights(OBSTACLE_WEIGHTS, {
  voiture: CAR_TIME_BOOST_FACTOR,
  cycliste: CYCLIST_TIME_BOOST_FACTOR,
});

// Intensification `pont` en fin de course (« surtout sur la fin », demandé le
// 17 août 2026, en même temps que le triplement du poids de base ci-dessus).
// Seuil plus TARDIF que CAR_TIME_BOOST_TIME_S (63 s, ≈44 % du parcours) :
// ≈95 s, ≈66 % de dureeCourse (143,5 s) — le dernier tiers de la course,
// cohérent avec « surtout sur la fin ». Composé PAR-DESSUS la table déjà
// choisie (une des 4 ci-dessus) plutôt que d'ajouter une 5e table nommée :
// scaleWeights() renormalise à chaque composition, donc l'ordre ne casse
// jamais l'invariant "la somme vaut 1" quel que soit le nombre de boosts
// cumulés (voir applyPontLateBoost() plus bas, appelé depuis
// computeRawSlotContent()).
const PONT_TIME_BOOST_TIME_S = 95;
const PONT_TIME_BOOST_SLOT = Math.floor(clock.beatIndexAt(PONT_TIME_BOOST_TIME_S) / CADENCE);
// ×2 initial jugé trop discret : la renormalisation qui suit le boost
// voiture/cycliste (×2,5/×1,6, voir TIME_BOOSTED_OBSTACLE_WEIGHTS plus haut)
// écrase déjà mécaniquement la part de `pont` avant même que ce facteur-ci
// s'applique (30 % de base → 18 % une fois voiture/cycliste boostés) — un
// simple ×2 ne faisait que la ramener à ~30 %, pas "beaucoup plus" comme
// demandé. ×4 pousse la part réelle de fin de course à ~47 % (vérifié par
// balayage hors ligne) : sur un tout petit échantillon (~12 obstacles après
// le seuil), ×2 pouvait statistiquement tomber presque à 0 pont par malchance
// du hash ; ×4 rend ce cas quasi impossible (< 0,3 % de probabilité).
const PONT_TIME_BOOST_FACTOR = 4;
function applyPontLateBoost(slotIndex, weights) {
  if (slotIndex < PONT_TIME_BOOST_SLOT) return weights;
  return scaleWeights(weights, { pont: PONT_TIME_BOOST_FACTOR });
}

// Score de la partie en cours, pour la même raison que currentScore plus bas
// dans ce fichier n'existe pas déjà : c'est la seule donnée de ce module qui
// vient du GAMEPLAY plutôt que d'un hash déterministe par index de créneau
// (voir ARCHITECTURE.md §5.2 — le reste du fichier est volontairement une
// fonction pure de l'index). Pilotée par main.js, une fois par frame.
let currentScore = 0;
export function setScore(score) { currentScore = score; }

// Mémoïsation du tirage de créneau (voir rawSlotContent plus bas) : sans
// elle, un score qui franchit un palier (voir applyScoreTierBoost) pendant
// qu'un vélo est déjà visible mais pas encore résolu lui ferait changer de
// nature EN COURS D'APPROCHE (le tirage dépend de `currentScore`, relu à
// chaque appel). La décision est donc figée au premier calcul de chaque
// créneau, comme si le score qui compte était celui du moment où le créneau
// "apparaît" au joueur.
const rawContentCache = new Map();

// Obstacles INFRANCHISSABLES AU SAUT : ils se contournent latéralement, point.
// Le piéton reste un « mur humain plein » (décision de playtest ancienne) :
// sauter ne l'évite pas, seul un changement de voie le fait. Le cycliste en
// est sorti le 12 août 2026 (demandé explicitement) — il rejoint voiture/cône
// dans les obstacles que le saut permet de franchir SANS risque (voir sa
// branche dédiée dans update(), même schéma que le cône). Le pont n'est PAS
// dans cet ensemble bien qu'il soit lui aussi infranchissable : contrairement
// au piéton, sauter y AGGRAVE le risque au lieu d'être neutre (voir sa
// branche dédiée dans update()) — le router ici appliquerait la mauvaise
// règle (sameLane seul, sans le OR inAir).
const UNJUMPABLE_KINDS = new Set(["pieton"]);

// Bonus AÉRIENS : ramassables uniquement en sautant. Playtest : « il faut des
// objets spéciaux en l'air » — il n'y en avait qu'un seul type (`guitare`,
// 5 % des bonus), donc quasiment jamais rencontré. Les DEUX bonus les plus
// chers le sont maintenant (250 et 500 pts), soit 28 % des bonus : sauter
// devient une vraie source de points, pas une figure de style.
// Rendu surélevé dans render() ci-dessous, à la hauteur du pic de saut, avec
// une ombre au sol et un flottement lent (le seul signal "celui-là est en
// l'air" quand on le voit arriver de loin).
const AIR_BONUS_KINDS = new Set(["guitare", "collierPerles"]);
// Exporté pour entities-render.js (ombre au sol + flottement des bonus
// aériens) — jamais le Set lui-même, pour ne pas exposer de mutation externe.
export function isAirBonus(kind) {
  return AIR_BONUS_KINDS.has(kind);
}

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
// CAR_ROOF_H : seule dimension de voiture qui compte pour la collision/le
// saut (roofOverlap plus bas) — reste sous l'apex de saut (≈ 2,28 u avec
// hauteurSaut = 2.0) donc atterrissable. Les autres dimensions (largeur,
// longueur, hauteur de carrosserie) sont purement visuelles et vivent dans
// entities-render.js, avec le rendu faux-3D qui les consomme.
export const CAR_ROOF_H = 1.35;
// Nombre de voitures par rangée : 1 ou 2, jamais LANE_COUNT à la fois (voir
// l'invariant de pickLanes plus bas — occuper TOUTES les voies ne laisserait
// plus aucune voie de passage). C'était 1, 2 ou occasionnellement 3 tant que
// LANE_COUNT valait 4 (3 voitures sur 4 voies laissait encore UNE voie
// libre) ; le palier "3" a été retiré le 17 août 2026 quand LANE_COUNT est
// passé à 3 (3 voitures sur 3 voies aurait occupé la route entière — plus
// aucun dodge possible, seul le saut aurait pu sauver, ce qui n'était pas le
// calibrage voulu). Son poids a rejoint la rangée de 2 (voir plus bas), la
// rampe de difficulté garde la même forme : en tout début de course, surtout
// des rangées de 1 (au moins 2 voies toujours libres) ; la rangée de 2 (1
// seule voie de passage) monte progressivement en cours de route, quand le
// joueur a eu le temps de prendre en main les voies.
// Progression temporelle 0→1 (créneau de grâce exclu), PARTAGÉE par les
// rangées de voitures et les ponts ci-dessous — c'était déjà la même formule
// dupliquée deux fois, factorisée le 17 août 2026 en même temps que
// scoreRampT() ci-dessous, son pendant côté score.
function timeRampT(slotIndex) {
  const remainingSlots = TOTAL_OBJECTS - GRACE_SLOTS;
  return remainingSlots > 0
    ? Math.min(1, Math.max(0, (slotIndex - GRACE_SLOTS) / remainingSlots))
    : 1;
}

// Complexité STRUCTURELLE par palier de score (demandé le 17 août 2026, avec
// applyScoreTierBoost plus haut) : ce dernier ne fait que réattribuer le
// MÊME nombre d'obstacles (TOTAL_OBSTACLES est fixe) entre les types déjà
// mineurs (cône/piéton) et les dangereux — marge limitée puisque cône/piéton
// pèsent déjà peu. Ici, à la place, on pousse les rangées de voitures et les
// ponts vers leur configuration la plus dure (kind le plus élevé = le moins
// de voies libres) EN AVANCE sur la rampe temporelle normale, sans attendre
// la fin de la course : à score élevé, une rangée de voitures rencontrée tôt
// se comporte déjà comme une rencontrée tard. `scoreRampT() = 0` tant que
// currentScore < SCORE_TIER_SIZE (aucun changement en dessous du premier
// palier) ; approche 1 (poussée maximale) vers le palier 6 (~90 000 pts).
function scoreRampT() {
  return Math.min(1, (scoreTierMultiplier() - 1) / 2);
}

const CAR_ROW_EARLY = [
  { kind: 1, weight: 0.75 },
  { kind: 2, weight: 0.25 },
];
const CAR_ROW_LATE = [
  { kind: 1, weight: 0.45 },
  { kind: 2, weight: 0.55 },
];
function carRowSizesAt(slotIndex) {
  const t = Math.min(1, timeRampT(slotIndex) + scoreRampT());
  return CAR_ROW_EARLY.map((early, i) => ({
    kind: early.kind,
    weight: early.weight + (CAR_ROW_LATE[i].weight - early.weight) * t,
  }));
}
// Tolérance longitudinale de "posé sur le toit". La tolérance LATÉRALE a
// disparu avec les voies : on est sur le toit si on est sur la voie de la
// rangée, point — plus de « je saute pile dessus et je retombe à côté ».
const ROOF_LONG_TOLERANCE = 0.7;

// --- Pont (viaduc du métro parisien) ---------------------------------------
// Symétrique de la rangée de voitures : un slot "pont" pose des piliers sur
// PLUSIEURS voies à la même profondeur, une seule résolution de collision
// pour tout le pont. La différence structurelle : une rangée de voitures dit
// "voici les voies OCCUPÉES" (sameLane → collision) ; un pont dit "voici les
// voies OUVERTES" — mais en stockant directement le COMPLÉMENT (les voies
// BLOQUÉES) dans `content.lanes`/`slotLanes()`, la collision réutilise
// sameLane() telle quelle, sans logique inversée (voir update()).
// Palette/dimensions du pont (BRIDGE_STONE/IRON/hauteurs) sont purement
// visuelles et vivent dans entities-render.js avec renderBridge().
//
// Progression demandée : 2 voies ouvertes en début de course (précision
// confortable, le temps d'apprendre les voies), 1 seule en fin de course —
// même rampe `t` que les rangées de voitures. `kind` ici va jusqu'à 2, jamais
// LANE_COUNT (voir la note LANE_COUNT dans road.js) : toujours au moins une
// voie bloquée par le pont, quel que soit LANE_COUNT.
const BRIDGE_OPEN_EARLY = [
  { kind: 1, weight: 0.15 },
  { kind: 2, weight: 0.85 },
];
const BRIDGE_OPEN_LATE = [
  { kind: 1, weight: 0.75 },
  { kind: 2, weight: 0.25 },
];
function bridgeOpenLanesAt(slotIndex) {
  const t = Math.min(1, timeRampT(slotIndex) + scoreRampT());
  return BRIDGE_OPEN_EARLY.map((early, i) => ({
    kind: early.kind,
    weight: early.weight + (BRIDGE_OPEN_LATE[i].weight - early.weight) * t,
  }));
}

export function isCarSlot(content) {
  return !content.isBonus && content.kind === "voiture";
}

export function isBridgeSlot(content) {
  return !content.isBonus && content.kind === "pont";
}

// Voies OUVERTES d'un pont : la garde anti-piège (voir slotContent) peut
// imposer une combinaison différente de celle tirée au hash — c'est
// `openLanesOverride`, le pendant multi-voies de `laneOverride`.
function bridgeOpenLanes(slotIndex, content) {
  if (content.openLanesOverride) return content.openLanesOverride;
  return pickLanes(slotIndex, content.openCount || 1);
}

// Voies BLOQUÉES d'un pont — le complément. C'est CE tableau que slotLanes()
// expose comme `lanes`, pour que la collision (sameLane) et le rendu
// (un pilier par voie bloquée) n'aient rien à inverser.
function bridgeBlockedLanes(slotIndex, content) {
  const open = new Set(bridgeOpenLanes(slotIndex, content));
  const blocked = [];
  for (let l = 0; l < road.LANE_COUNT; l++) if (!open.has(l)) blocked.push(l);
  return blocked;
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

// Exporté : entities-render.js s'en sert aussi (couleurs de voiture, choix
// d'outfit piéton/cycliste) — même source de hasard déterministe des deux
// côtés de la frontière logique/rendu.
export function hash(n) {
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

// Tirage brut, sans vérification des voisins — c'est CE tirage que
// slotContent() consulte pour ses voisins (jamais slotContent() lui-même,
// qui recréerait la même vérification en boucle et bouclerait à l'infini
// dès que deux créneaux voisins tombent tous les deux sur "piéton").
// Ouverture curatée (12 août 2026, retour direct : « à l'horizon, proche
// d'une étoile à attraper et d'un vélo qui arrive »). GRACE_SLOTS force déjà
// les tout premiers créneaux en étoiles pour la même raison de rythme
// d'ouverture (voir isBonusQuota) ; ceci en est le prolongement côté
// obstacle : le tout premier créneau qui PEUT être un obstacle
// (slotIndex === GRACE_SLOTS) est forcé "cycliste" plutôt que laissé au
// hash, pour qu'un vélo soit visible et lisible dès les premières secondes
// plutôt que si le hash y avait placé autre chose (ou rien avant longtemps —
// le premier cycliste naturel n'arrivait qu'au créneau 9). Poids/quota
// globaux inchangés : un seul créneau déplacé sur 143 obstacles.
const OPENING_KIND_OVERRIDE = { [GRACE_SLOTS]: "cycliste" };

function rawSlotContent(slotIndex) {
  const override = debugOverrides.get(slotIndex);
  if (override) return { isBonus: override.isBonus, kind: override.kind }; // jamais mémoïsé, doit rester réactif au debug
  const cached = rawContentCache.get(slotIndex);
  if (cached) return cached;
  const content = computeRawSlotContent(slotIndex);
  rawContentCache.set(slotIndex, content);
  return content;
}

function computeRawSlotContent(slotIndex) {
  if (isBonusAt(slotIndex)) {
    return { isBonus: true, kind: pickWeighted(BONUS_TYPES, hash(slotIndex * 3 + 1)) };
  }
  if (OPENING_KIND_OVERRIDE[slotIndex]) {
    return { isBonus: false, kind: OPENING_KIND_OVERRIDE[slotIndex] };
  }
  const timeBoost = slotIndex >= CAR_TIME_BOOST_SLOT;
  const baseWeights = timeBoost ? TIME_BOOSTED_OBSTACLE_WEIGHTS : OBSTACLE_WEIGHTS;
  const weights = applyPontLateBoost(slotIndex, applyScoreTierBoost(baseWeights));
  const kind = pickWeighted(weights, hash(slotIndex * 3 + 1));
  if (kind === "voiture") {
    const carCount = pickWeighted(carRowSizesAt(slotIndex), hash(slotIndex * 3 + 10));
    return { isBonus: false, kind: "voiture", carCount };
  }
  if (kind === "pont") {
    // Même offset de hash que carCount (*3+10) : les deux tirages ne
    // coexistent jamais sur le même slotIndex (un slot n'a qu'un seul kind),
    // donc aucun risque de collision entre les deux usages.
    const openCount = pickWeighted(bridgeOpenLanesAt(slotIndex), hash(slotIndex * 3 + 10));
    return { isBonus: false, kind: "pont", openCount };
  }
  return { isBonus: false, kind };
}

// Piéton = « mur humain plein », infranchissable même en sautant (voir
// update() plus bas). Signalé au playtest : « conflits personne et étoiles,
// ça doit jamais arriver » — si une étoile tombe dans la MÊME voie à un
// créneau tout proche d'un piéton, le joueur n'a plus aucun moyen de la
// ramasser sans risquer la collision, un piège injuste puisque rien d'autre
// dans le jeu ne force ce choix. Un piéton dont un voisin immédiat est un
// bonus dans sa voie est donc retiré du tirage et remplacé par un des deux
// autres types d'obstacle (tous deux franchissables au saut, donc jamais le
// même piège) — la voiture/le cône, eux, restent volontairement autorisés à
// partager une voie avec un bonus proche : sauter les évite sans sacrifier
// l'étoile.
// ⚠️ La garde s'applique à TOUT obstacle de UNJUMPABLE_KINDS, pas au seul
// piéton codé en dur — le cycliste y est passé puis en est ressorti le
// 12 août 2026 (rendu franchissable au saut) : tant qu'un type reste dans cet
// ensemble, l'oublier ici recréerait le même piège, avec un autre type.
const PIETON_BONUS_GUARD_SLOTS = 1; // ±1 créneau ≈ 0,75 s de battement à la cadence par défaut

// ⚠️ La garde DÉPLACE l'obstacle de voie ; elle ne change plus son type.
// Avant, un piéton en conflit était remplacé par une voiture ou un cône. Ça
// marchait tant que le piéton était le seul type concerné (~21 créneaux sur
// 100), mais dès que le cycliste a rejoint UNJUMPABLE_KINDS, la garde s'est
// mise à se déclencher sur 39 créneaux et à en convertir **51 %** : mesuré,
// 18 cyclistes tirés ne survivaient que 8 fois, le premier n'arrivant qu'à
// 67 s de course. Le type se vidait de lui-même, en silence.
// Le conflit est de toute façon un conflit de VOIE, pas de type : le résoudre
// dans l'espace des voies supprime exactement le même piège (l'obstacle
// infranchissable n'est plus dans la voie du bonus voisin) sans toucher à la
// distribution des types, qui redevient donc celle qu'annoncent les poids.
function slotContent(slotIndex) {
  const raw = rawSlotContent(slotIndex);
  if (raw.isBonus) return raw;
  if (raw.kind === "pont") return bridgeGuard(slotIndex, raw);
  if (!UNJUMPABLE_KINDS.has(raw.kind)) return raw;

  // Voies rendues interdites par un bonus voisin immédiat.
  const blocked = new Set();
  for (let d = -PIETON_BONUS_GUARD_SLOTS; d <= PIETON_BONUS_GUARD_SLOTS; d++) {
    if (d === 0) continue;
    const n = slotIndex + d;
    if (n < 0) continue;
    const neighbor = rawSlotContent(n);
    if (!neighbor.isBonus) continue;
    blocked.add(slotLanes(n, neighbor)[0]);
  }

  const lane = slotLanes(slotIndex, raw)[0];
  if (!blocked.has(lane)) return raw;

  // Première voie libre, parcourue depuis un décalage tiré au hash : sans ce
  // décalage tous les obstacles déplacés atterriraient sur "voie + 1" et on
  // verrait apparaître un motif régulier.
  const start = 1 + Math.floor(hash(slotIndex * 3 + 97) * (road.LANE_COUNT - 1));
  for (let i = 0; i < road.LANE_COUNT; i++) {
    const alt = (lane + start + i) % road.LANE_COUNT;
    if (!blocked.has(alt)) return { ...raw, laneOverride: alt };
  }
  return raw; // inatteignable quel que soit LANE_COUNT ≥ 3 pour 2 voisins (≤2 voies bloquées,
              // toujours ≥1 libre) ; garde-fou quand même, on ne renvoie jamais undefined
}

// Garde anti-piège, variante pont. Un piéton/cycliste n'a qu'UNE voie de
// repli possible (laneOverride) ; un pont a PLUSIEURS voies ouvertes à la
// fois, donc la question n'est pas "quelle voie libre choisir" mais "reste-
// t-il au moins une voie ouverte du pont qui ne coïncide pas avec un bonus
// voisin (±1 créneau) ». Si toutes ses voies ouvertes sont prises, on fait
// tourner (rotation modulo LANE_COUNT, décalage tiré au hash) la combinaison
// de voies ouvertes jusqu'à en trouver une qui en laisse au moins une libre —
// la rotation préserve le nombre de voies ouvertes et leur espacement.
function bridgeGuard(slotIndex, raw) {
  const blockedByBonus = new Set();
  for (let d = -PIETON_BONUS_GUARD_SLOTS; d <= PIETON_BONUS_GUARD_SLOTS; d++) {
    if (d === 0) continue;
    const n = slotIndex + d;
    if (n < 0) continue;
    const neighbor = rawSlotContent(n);
    if (!neighbor.isBonus) continue;
    blockedByBonus.add(slotLanes(n, neighbor)[0]);
  }

  const baseOpen = pickLanes(slotIndex, raw.openCount || 1);
  if (baseOpen.some((l) => !blockedByBonus.has(l))) return raw;

  const start = 1 + Math.floor(hash(slotIndex * 3 + 97) * (road.LANE_COUNT - 1));
  for (let i = 0; i < road.LANE_COUNT; i++) {
    const offset = (start + i) % road.LANE_COUNT;
    const candidate = baseOpen.map((l) => (l + offset) % road.LANE_COUNT);
    if (candidate.some((l) => !blockedByBonus.has(l))) {
      return { ...raw, openLanesOverride: candidate };
    }
  }
  return raw; // inatteignable quel que soit LANE_COUNT ≥ 3 pour 2 voisins de bonus (même
              // raisonnement que plus haut) ; garde-fou quand même, on ne renvoie jamais undefined
}

// Voies occupées par le contenu d'un créneau. Renvoie toujours un TABLEAU :
// un objet normal occupe une voie, une rangée de voitures 1 à 3. Tout le
// reste du module (collision, rendu, atterrissage sur toit) part de là.
function slotLanes(slotIndex, content) {
  const override = debugOverrides.get(slotIndex);
  if (override) return [override.lane];
  // Voie imposée par la garde anti-piège (voir slotContent) : elle prime sur
  // le tirage au hash, c'est tout l'intérêt du déplacement.
  if (content && content.laneOverride != null) return [content.laneOverride];
  if (content && isCarSlot(content)) {
    return pickLanes(slotIndex, content.carCount || 1);
  }
  if (content && isBridgeSlot(content)) {
    return bridgeBlockedLanes(slotIndex, content);
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

// Vitesse d'APPROCHE, relative à celle de la route. Retour iPhone du 12 août
// 2026 : « je n'ai vu que des gens en vélo statique ». Le diagnostic est
// exactement là — un cycliste en sens inverse était porté vers le joueur à la
// vitesse du décor, comme un cône posé au sol. Il pédalait (2 frames, 3,2 Hz)
// mais ne se rapprochait pas plus vite qu'un lampadaire : impossible de lire
// qu'il vient EN FACE.
//
// Le facteur ne touche QUE la vitesse de rapprochement, jamais l'instant
// d'arrivée : à deltaT = 0 le cycliste est au niveau du joueur quoi qu'il
// arrive, donc il tombe toujours pile sur son temps musical. Il part
// simplement de plus loin et fond sur nous — ce qui EST la définition d'un
// croisement à contresens.
const APPROACH_FACTOR = { cycliste: 1.35 };
function approachFactor(content) {
  return (content && APPROACH_FACTOR[content.kind]) || 1;
}

function slotZ(slotIndex, now, speed) {
  const beatN = slotIndex * CADENCE;
  const deltaT = clock.timeOfBeat(beatN) - now;
  return road.PLAYER_NEAR_Z + deltaT * speed;
}

function* visibleSlots(now, speed) {
  const currentSlot = Math.floor(clock.beatIndexAt(now) / CADENCE);
  for (let n = Math.max(0, currentSlot - 1); n <= currentSlot + LOOKAHEAD_SLOTS; n++) {
    // 🐛 Rien au-delà de la ligne d'arrivée (retour du 12 août 2026 : « à la
    // ligne d'arrivée, il y a des objets qui s'entremêlent »). Le parcours
    // continuait de peupler les créneaux d'APRÈS l'arrivée ; comme la caméra
    // freine pendant la séquence de fin (road.brake), leur profondeur — qui
    // est un temps restant × la vitesse — s'écrase d'un coup et les tassait
    // les uns dans les autres devant le joueur. Après la ligne, la route est
    // vide : c'est fini.
    if (n >= TOTAL_OBJECTS) break;
    // Le contenu se calcule AVANT la profondeur : c'est lui qui dit à quelle
    // vitesse le créneau se rapproche (voir APPROACH_FACTOR).
    const content = slotContent(n);
    const z = slotZ(n, now, speed * approachFactor(content));
    if (z < 1 || z > VISIBLE_Z_MAX) continue;
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
// Exporté : entities-render.js parcourt la même liste pour peindre exactement
// ce que update()/roofOverlap() viennent de tester, dans le même ordre.
export function slotsFor(now, speed) {
  if (slotCache.now === now && slotCache.speed === speed) return slotCache.list;
  slotCache.list.length = 0;
  for (const e of visibleSlots(now, speed)) slotCache.list.push(e);
  // ⚠️ Tri par profondeur croissante, désormais OBLIGATOIRE et non plus
  // automatique. L'ordre du peintre (voir render()) reposait sur « index
  // croissant = profondeur croissante » — vrai tant que tous les créneaux
  // approchaient à la même vitesse. Depuis APPROACH_FACTOR, un cycliste à plus
  // de ~2 s devant est plus LOIN que l'objet du créneau suivant : sans ce tri,
  // il se peindrait par-dessus lui. C'est exactement le bug « les objets ne
  // passent pas les uns devant les autres » déjà corrigé une fois.
  slotCache.list.sort((a, b) => a.z - b.z);
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
// Exporté pour entities-render.js — jamais le Set lui-même, pour ne pas
// exposer de mutation externe (seul update() doit écrire dedans).
export function isConsumed(slotIndex) {
  return consumed.has(slotIndex);
}

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
      const aerien = AIR_BONUS_KINDS.has(e.kind);
      const zw = aerien ? Z_WINDOW_AIR : Z_WINDOW;
      if (e.z > road.PLAYER_NEAR_Z + zw) continue;
      if (e.z < road.PLAYER_NEAR_Z - zw) { resolved.add(e.slotIndex); continue; }
      const inReach = sameLane(e);
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
    } else if (e.kind === "pont") {
      // ⚠️ Revu le 12 août 2026 sur retour direct après test réel : sauter
      // sous un pont doit TOUJOURS être dangereux, même dans une voie
      // ouverte — la poutre est basse, on ne passe dessous qu'au sol. Seul
      // obstacle où `inAir` AGGRAVE le risque au lieu de protéger. Fatal
      // comme la voiture (voir main.js `game.lives = 0` pour `kind ===
      // "pont"`) : un choc de pont met fin à la partie, pas juste −1 vie.
      if (e.z > road.PLAYER_NEAR_Z + Z_WINDOW) continue;
      if (e.z < road.PLAYER_NEAR_Z - Z_WINDOW) { resolved.add(e.slotIndex); continue; }
      if (sameLane(e) || inAir) {
        events.push({ type: "obstacle", kind: e.kind });
        resolved.add(e.slotIndex);
        consumed.add(e.slotIndex);
      }
    } else if (e.kind === "cycliste") {
      // ⚠️ Rendu franchissable au saut le 12 août 2026 (demandé explicitement
      // — auparavant un mur infranchissable comme le piéton, voir
      // UNJUMPABLE_KINDS). Même traitement que le cône : sauter l'évite,
      // rester au sol dans sa voie ne suffit plus.
      if (e.z > road.PLAYER_NEAR_Z + Z_WINDOW) continue;
      if (e.z < road.PLAYER_NEAR_Z - Z_WINDOW) { resolved.add(e.slotIndex); continue; }
      if (sameLane(e) && !inAir) {
        events.push({ type: "obstacle", kind: e.kind });
        resolved.add(e.slotIndex);
        consumed.add(e.slotIndex);
      }
    } else {
      // Piéton : mur infranchissable — la collision compte même en l'air
      // (voir UNJUMPABLE_KINDS), rester au sol dans la bonne voie suffit à
      // l'éviter (contrairement au pont ci-dessus, où sauter n'importe où
      // sous la structure coûte la partie).
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
  rawContentCache.clear();
  currentScore = 0;
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
