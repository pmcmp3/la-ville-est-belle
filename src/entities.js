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
const LOOKAHEAD_SLOTS = 18;

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
// 145 → 170 le 19 août 2026 (deuxième passe : « charger encore plus loin »),
// en même temps que l'horizon repoussé à ≈179 (road.js). Reste sous HORIZON_Z :
// au-delà, la projection se replie.
export const VISIBLE_Z_MAX = 170;
// Fondu d'apparition des objets sur les dernières unités avant VISIBLE_Z_MAX
// (« il faut que le chargement soit plus progressif »). Même principe que
// FADE_BAND pour les bâtiments (world.js) : sans lui, un objet apparaît d'un
// coup à pleine opacité pile sur le seuil de coupure — un pop-in, d'autant
// plus visible maintenant que le seuil est loin. Consommé par
// entities-render.js, qui est seul à savoir peindre.
// 34 → 50 avec l'allongement de la distance de vue : c'est ce fondu qui
// remplace désormais le repli de la courbe (voir CURVATURE, road.js) pour
// éviter « la ligne d'horizon » — un objet doit se dissoudre dans la brume,
// jamais apparaître d'un coup sur une limite nette.
export const FADE_BAND = 50;
// Petite marge pour que le créneau 0 soit franchement DANS la fenêtre dès la
// première frame, pas pile sur le seuil de coupure (évite tout flottement).
const LEAD_IN_VISIBILITY_MARGIN = 2;

// ⚠️ Profondeur de départ du créneau 0, raccourcie le 20 août 2026 (« à la fin
// du tuto c'est trop long pour commencer le jeu vraiment ») : calé sur
// VISIBLE_Z_MAX (≈168 u), le premier objet mettait ~7,8 s à atteindre le
// joueur à la vitesse de départ (19,8 u/s) — huit secondes de route vide entre
// la fin du tutoriel et la première étoile, et autant à chaque REJOUER. Ramené
// à 80 u : ~3,4 s d'approche. Compromis assumé avec le vieux bug du pop-in
// (« comme si tout était déjà chargé ») : les 2-3 créneaux entre 80 u et le
// début du FADE_BAND apparaissent d'un coup à la première frame, mais LOIN
// (petits, à 4+ secondes du joueur) — rien à voir avec l'époque où le créneau
// 0 naissait À la position du joueur. Ne change rien au régime de croisière :
// passé ce départ, tous les créneaux continuent de sortir de la brume à
// VISIBLE_Z_MAX comme avant.
const LEAD_IN_START_Z = 80;

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
  (LEAD_IN_START_Z - LEAD_IN_VISIBILITY_MARGIN - road.PLAYER_NEAR_Z) / road.getSpeed() -
  window.CONFIG.premierTempsOffset;

// --- Course INFINIE (24 août 2026) -----------------------------------------
// La ligne d'arrivée est SUPPRIMÉE (demandé explicitement : « on peut
// supprimer le principe de la ligne d'arrivée, puisque le jeu va devenir
// infini »). Motif : trois ou quatre joueurs ont atteint le score maximum
// théorique — le concours ne départage plus personne. Un parcours sans fin
// n'a plus de score max : le classement redevient un vrai classement.
// La partie ne se termine plus que par la mort (game over). La vitesse, elle,
// reste plafonnée à `vitesseMax` (road.js) — plafond déjà atteint vers 102 s,
// AVANT l'ancienne ligne d'arrivée : « garde la vitesse au moment de la ligne
// d'arrivée actuelle » est donc déjà la valeur en place, rien à changer.
// TOTAL_OBJECTS ne marque plus une fin : c'est la LONGUEUR DE LA RAMPE de
// difficulté (timeRampT plus bas) — au-delà, tous les réglages restent à leur
// valeur de fin de rampe (régime de croisière le plus dur).
export const TOTAL_OBJECTS = Math.floor(
  (window.CONFIG.dureeCourse - window.CONFIG.premierTempsOffset) / (CADENCE * clock.beatPeriod)
);
// Gardés pour les modules qui les importent (cameo.js pose son caméo
// d'arrivée sur finishTime() : à l'infini, il n'apparaît simplement jamais).
export function finishTime() { return Infinity; }
export function isFinished() { return false; }
const Z_WINDOW = 1.0;      // fenêtre (unités-monde) autour du joueur pour tester la collision
const Z_WINDOW_AIR = 2.2;  // fenêtre élargie pour les bonus aériens (le timing du saut doit être tolérant)
// Plus de rayon de collision en unités-monde : depuis le passage aux 4 voies,
// tout est posé sur une voie et la collision est un test d'ÉGALITÉ de voie.
// C'est ce qui règle les deux reproches du playtest d'un coup — « t'es short
// sur les hitbox » (on touchait à côté de ce qu'on voyait) et « je peux rester
// là indéfiniment » (il n'existe plus de position hors-voie où camper).
// 4 → 8 le 21 août 2026 (« Soberland au tout début, rien autour de lui »,
// cameo.js) : Soberland a été avancé à CAMEO_TIME_S = 3 s pour être la toute
// première chose vue, visible jusqu'à ~3,6 s (SHOW_AFTER). L'ancienne grâce
// (~2 s, GRACE_SLOTS = 3) se terminait AVANT qu'il ait fini de traverser
// l'écran — le premier obstacle forcé (OPENING_KIND_OVERRIDE, un cycliste)
// apparaissait donc pile pendant qu'il était encore là, d'où « difficile à
// esquiver » alors qu'il est censé être purement décoratif.
// ⚠️ 8 → 7 le 21 août 2026 (retour direct, même jour : « énormément d'étoiles
// au tout début, ça va pas du tout »). GRACE_SLOTS force TOUS ses créneaux en
// étoile (aucun état "vide" n'existe dans ce système, voir isBonusQuota) —
// passer de 4 à 8 battements avait donc DOUBLÉ le nombre d'étoiles forcées
// (3 → 6), toutes visibles DÈS LA PREMIÈRE FRAME (LEAD_IN place le créneau 0
// à z≈78, largement dans VISIBLE_Z_MAX=170) et cantonnées à 2 voies sur 3
// (jamais la centrale, réservée à Soberland) : un mur de 6 étoiles identiques
// dès l'ouverture, encore plus marqué depuis leur refonte 3D (plus grandes,
// tournantes) que ça ne l'était avec les anciennes icônes plates. Redescendu
// à 7 battements (GRACE_SLOTS = 5, un créneau de moins) : c'est le PLANCHER
// mathématique qui reste sûr pour Soberland — le créneau juste en dessous (4)
// arrive à 3,0 s, AVANT sa disparition à 3,6 s (SHOW_AFTER, cameo.js), donc
// rouvrirait exactement le bug que ces battements existent pour éviter. À 5,
// l'arrivée tombe à 3,75 s : 0,15 s de marge, contre 0,9 s avant — mesuré
// (§12), le premier obstacle (OPENING_KIND_OVERRIDE) reste bien après lui.
// Aller plus bas exigerait de raccourcir Soberland lui-même (cameo.js),
// décision distincte à reconfirmer séparément si le mur reste trop dense.
const GRACE_BEATS = 7;
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

// ⚠️ Détente de FIN de course (21 août 2026 : « j'aimerais un peu plus
// d'étoiles à la fin, ça va super vite mais il n'y a pas beaucoup d'étoiles
// alors qu'il y a beaucoup d'obstacles ») : à partir de 100 s, le ratio
// d'obstacles redescend linéairement de 0,60 vers 0,45 à la ligne d'arrivée.
// Le contexte a changé depuis l'arbitrage du plafond à 60 % : les véhicules
// traversants (crosstraffic.js, hors de ce quota) sont à densité MAXIMALE
// après ~100 s — la fin de course cumule donc les deux sources de danger, et
// c'est précisément la portion où le combo a besoin d'étoiles pour exister.
// Le seuil de 100 s est calé sur cette rampe-là. L'invariant tient toujours :
// le ratio d'étoiles reste entre 0,40 et 0,62, jamais près de 1.
const OBSTACLE_END_TAPER_START_S = 100;
const OBSTACLE_RATIO_END = 0.45;

// Densité d'obstacles visée au créneau `i`, d'après le temps musical où il
// arrive (donc une fonction pure de l'index, comme tout ce fichier).
function obstacleRatioAt(slotIndex) {
  const t = clock.timeOfBeat(slotIndex * CADENCE);
  const brut = OBSTACLE_RATIO_START * Math.pow(2, t / OBSTACLE_DOUBLING_TIME_S);
  const ratio = Math.min(OBSTACLE_RATIO_MAX, brut);
  if (t <= OBSTACLE_END_TAPER_START_S) return ratio;
  const u = Math.min(1, (t - OBSTACLE_END_TAPER_START_S) /
    (window.CONFIG.dureeCourse - OBSTACLE_END_TAPER_START_S));
  return ratio + (OBSTACLE_RATIO_END - ratio) * u;
}
// ⚠️ L'invariant qui compte n'a PAS changé : un ratio est une probabilité de
// tramage par créneau, et un créneau ne peut porter qu'UN SEUL objet — au-delà
// de 1, un même créneau franchirait plus d'un palier entier d'un coup et
// l'étoile « en trop » disparaîtrait en silence (c'est le bug qui a coûté deux
// sessions, voir l'historique en ARCHITECTURE.md §5.4). Ici le ratio d'étoiles
// vaut 1 − obstacleRatioAt(), donc il vit entre 0,40 (plafond d'obstacles
// atteint) et 0,62 (départ) : jamais près de 1, la marge est structurelle et
// non plus le fruit d'une dérivation à surveiller.

// ⚠️ FIN DU QUOTA EXACT (24 août 2026). L'ancienne diffusion d'erreur
// garantissait le même nombre d'étoiles à chaque partie — c'était le socle du
// « score max connu », devenu LE problème (plusieurs joueurs à égalité au
// plafond). Le parcours est désormais infini ET tiré au hash SEEDÉ par partie
// (voir runSeed) : un créneau est une étoile avec la probabilité
// 1 − obstacleRatioAt(slot), la même courbe de difficulté qu'avant — mais le
// tirage change à chaque partie et ne s'arrête jamais.
function isBonusAt(slotIndex) {
  if (slotIndex < 0) return false;
  if (slotIndex < GRACE_SLOTS) return true;
  return hash(slotIndex * 3 + 55) < 1 - obstacleRatioAt(slotIndex);
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

// Vies courantes, même canal que le score : servent UNIQUEMENT à décider si
// un créneau bonus peut porter un CADEAU MAGIQUE (+1 cœur, voir GIFT_RATE) —
// inutile d'en faire apparaître quand le joueur est déjà au maximum. Comme le
// score, la décision est figée au premier calcul du créneau (rawContentCache) :
// un cadeau déjà visible ne disparaît pas si un cœur revient entre-temps.
let currentLives = window.CONFIG.viesDepart;
export function setLives(lives) { currentLives = lives; }

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

// --- Graine par partie (24 août 2026) --------------------------------------
// Demandé explicitement : « il faut s'assurer que chaque partie soit
// différente [...] pour les gens qui jouent plusieurs fois, c'est trop facile
// de faire le score maximum ». Le parcours reste une fonction pure de l'index
// de créneau PENDANT une partie (rien ne bouge sous les pieds du joueur),
// mais la graine change à chaque nouvelle course : types, voies, étoiles
// dorées, rangées de voitures — tout est retiré. reseed() est appelé par
// main.js/restartGame() ; la première partie utilise la graine tirée au
// chargement du module.
let runSeed = Math.random() * 1000;
export function reseed() {
  runSeed = Math.random() * 1000;
  rawContentCache.clear();
  invalidateSlotCache();
}
// Exposée pour crosstraffic.js : ses traversantes doivent changer de partie
// en partie comme le reste, avec la même graine.
export function getRunSeed() {
  return runSeed;
}

// Exporté : entities-render.js s'en sert aussi (couleurs de voiture, choix
// d'outfit piéton/cycliste) — même source de hasard déterministe des deux
// côtés de la frontière logique/rendu. ⚠️ Seedé par partie depuis le 24 août
// 2026 (voir runSeed ci-dessus).
export function hash(n) {
  const x = Math.sin(n * 78.233 + runSeed) * 43758.5453;
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

// Étoile DORÉE rare (20 août 2026, « excellente idée ») : ×2 sur les points de
// l'étoile, teinte particulière, rotation plus rapide ET badge « ×2 » affiché
// sur l'étoile elle-même (24 août 2026 : « il faudrait que l'étoile x2 ait
// marqué x2 sur l'étoile, ou qu'elle brille beaucoup plus » — les deux sont
// faits, voir entities-render.js). Tirée au hash SEEDÉ par partie : leur
// nombre et leurs positions changent à chaque course.
const GOLD_STAR_RATE = 0.12;

// CADEAU MAGIQUE (24 août 2026, demandé : « des cadeaux magiques qui
// permettent de récupérer un cœur ») : bonus rare qui rend UN cœur (plafonné
// à viesDepart, main.js). Ne remplace un créneau étoile que si le joueur a
// effectivement un cœur manquant au moment où le créneau se calcule (voir
// setLives) — jamais pendant la période de grâce.
const GIFT_RATE = 0.07;

// --- Vague de 3 vélos (24 août 2026) ---------------------------------------
// Demandé : « toutes les 45 secondes, trois vélos qui arrivent de manière un
// peu désynchronisée en même temps face à toi, et qui ne sont pas en conflit
// avec des voitures ou un pont ». Implémentation : toutes les
// WAVE_PERIOD_SLOTS (~45 s de créneaux), TROIS créneaux consécutifs sont
// forcés « cycliste », chacun sur une voie différente (permutation seedée des
// 3 voies) — l'écart d'un créneau (~0,75 s) entre eux fait la
// désynchronisation demandée, et le facteur d'approche des cyclistes (×1,35)
// les fait fondre sur le joueur. Les cyclistes restant franchissables au
// saut, une vague sur les 3 voies laisse toujours une porte de sortie.
// L'anti-conflit est traité aux deux bouts : les créneaux ±1 autour d'une
// vague ne peuvent porter ni voiture ni pont (convertis en cône, voir plus
// bas dans computeRawSlotContent).
const WAVE_PERIOD_SLOTS = Math.max(8, Math.round(45 / (CADENCE * clock.beatPeriod)));
const WAVE_SIZE = 3;
// Rang du créneau dans sa vague (0..WAVE_SIZE-1), ou -1 hors vague. La toute
// première vague arrive à ~45 s (jamais dans l'ouverture de course).
function waveMember(slotIndex) {
  if (slotIndex < WAVE_PERIOD_SLOTS) return -1;
  const k = slotIndex % WAVE_PERIOD_SLOTS;
  return k < WAVE_SIZE ? k : -1;
}
// Créneau immédiatement avant/après une vague : là où voiture et pont sont
// interdits (un pont collé à la vague fermerait la seule voie de repli).
function isWaveNeighbor(slotIndex) {
  const k = slotIndex % WAVE_PERIOD_SLOTS;
  return (k === WAVE_SIZE && slotIndex >= WAVE_PERIOD_SLOTS) ||
         (k === WAVE_PERIOD_SLOTS - 1 && slotIndex >= WAVE_PERIOD_SLOTS - 1);
}
// Voie du membre `k` de la vague : permutation de Fisher-Yates seedée par
// l'index de vague — les 3 vélos couvrent les 3 voies, dans un ordre qui
// change à chaque vague et à chaque partie.
function waveLaneFor(slotIndex) {
  const group = Math.floor(slotIndex / WAVE_PERIOD_SLOTS);
  const lanes = Array.from({ length: road.LANE_COUNT }, (_, i) => i);
  for (let i = lanes.length - 1; i > 0; i--) {
    const j = Math.floor(hash(group * 631 + i * 17 + 44) * (i + 1));
    [lanes[i], lanes[j]] = [lanes[j], lanes[i]];
  }
  return lanes[waveMember(slotIndex) % lanes.length];
}

// --- Boost de cyclistes après 1 min 30 (24 août 2026) ----------------------
// Demandé : « beaucoup plus de vélos qui apparaissent à partir d'une minute
// trente de jeu ». S'empile sur le boost temporel de 63 s (×1,6) et sur les
// paliers de score — scaleWeights renormalise à chaque composition.
const CYCLIST_LATE_BOOST_TIME_S = 90;
const CYCLIST_LATE_BOOST_SLOT = Math.floor(clock.beatIndexAt(CYCLIST_LATE_BOOST_TIME_S) / CADENCE);
const CYCLIST_LATE_BOOST_FACTOR = 2.2;
function applyCyclistLateBoost(slotIndex, weights) {
  if (slotIndex < CYCLIST_LATE_BOOST_SLOT) return weights;
  return scaleWeights(weights, { cycliste: CYCLIST_LATE_BOOST_FACTOR });
}

function computeRawSlotContent(slotIndex) {
  // Vague de 3 vélos : prime sur tout le reste (y compris le tirage étoile),
  // c'est un événement scripté du parcours.
  const membre = waveMember(slotIndex);
  if (membre >= 0) {
    return { isBonus: false, kind: "cycliste", waveLane: waveLaneFor(slotIndex) };
  }
  if (isBonusAt(slotIndex)) {
    if (slotIndex >= GRACE_SLOTS && currentLives < window.CONFIG.viesDepart &&
        hash(slotIndex * 3 + 91) < GIFT_RATE) {
      return { isBonus: true, kind: "cadeau" };
    }
    return {
      isBonus: true,
      kind: pickWeighted(BONUS_TYPES, hash(slotIndex * 3 + 1)),
      gold: hash(slotIndex * 3 + 77) < GOLD_STAR_RATE,
    };
  }
  if (OPENING_KIND_OVERRIDE[slotIndex]) {
    return { isBonus: false, kind: OPENING_KIND_OVERRIDE[slotIndex] };
  }
  const timeBoost = slotIndex >= CAR_TIME_BOOST_SLOT;
  const baseWeights = timeBoost ? TIME_BOOSTED_OBSTACLE_WEIGHTS : OBSTACLE_WEIGHTS;
  const weights = applyPontLateBoost(slotIndex, applyCyclistLateBoost(slotIndex, applyScoreTierBoost(baseWeights)));
  let kind = pickWeighted(weights, hash(slotIndex * 3 + 1));
  // Anti-conflit de vague : pas de voiture ni de pont collé à une vague de
  // vélos (voir isWaveNeighbor) — remplacé par un cône, petit et sautable.
  if (isWaveNeighbor(slotIndex) && (kind === "voiture" || kind === "pont")) {
    kind = "cone";
  }
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
  // ⚠️ Plus de garde côté PONT (l'ancien bridgeGuard tournait les voies
  // ouvertes pour fuir un bonus voisin) : depuis le 24 août 2026, c'est le
  // BONUS qui s'adapte au pont et aux voitures, jamais l'inverse — voir
  // lanesBlockedByNeighbors() dans slotLanes(). Deux gardes qui se déplacent
  // l'une l'autre auraient créé une dépendance circulaire (le pont fuit le
  // bonus qui vient de se caler sur ses voies ouvertes).
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

// Voies interdites à un BONUS par ses voisins immédiats (±1 créneau) :
// piliers de pont et voitures. Demandé le 24 août 2026 : « les étoiles ne
// doivent pas être positionnées au même endroit que les ponts, ni au même
// endroit que les voitures ». On lit le tirage BRUT des voisins (jamais
// slotContent, qui regarde lui-même ses voisins — récursion garantie sinon) :
// voitures et ponts ne sont jamais déplacés par une garde, leur tirage brut
// est donc leur position finale.
function lanesBlockedByNeighbors(slotIndex) {
  const blocked = new Set();
  for (let d = -PIETON_BONUS_GUARD_SLOTS; d <= PIETON_BONUS_GUARD_SLOTS; d++) {
    if (d === 0) continue;
    const n = slotIndex + d;
    if (n < 0) continue;
    const neighbor = rawSlotContent(n);
    if (neighbor.isBonus) continue;
    if (isCarSlot(neighbor)) {
      for (const l of pickLanes(n, neighbor.carCount || 1)) blocked.add(l);
    } else if (isBridgeSlot(neighbor)) {
      for (const l of bridgeBlockedLanes(n, neighbor)) blocked.add(l);
    }
  }
  return blocked;
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
  // Membre d'une vague de vélos : sa voie sort de la permutation de vague.
  if (content && content.waveLane != null) return [content.waveLane];
  if (content && isCarSlot(content)) {
    return pickLanes(slotIndex, content.carCount || 1);
  }
  if (content && isBridgeSlot(content)) {
    return bridgeBlockedLanes(slotIndex, content);
  }
  const h = hash(slotIndex * 3 + 2);
  // Créneaux de grâce (tous étoiles, début de course) : JAMAIS la voie
  // centrale — c'est celle de Soberland (cameo.js), avancé au tout début le
  // 21 août 2026 avec la consigne « rien autour de lui ». Leur fenêtre
  // d'arrivée (jusqu'à ≈3,76 s) recouvre exactement sa fenêtre de visibilité
  // (0 → 3,6 s) : les latérales seulement, tirées au même hash.
  if (slotIndex < GRACE_SLOTS) {
    return [h < 0.5 ? 0 : road.LANE_COUNT - 1];
  }
  const lane = Math.min(Math.floor(h * road.LANE_COUNT), road.LANE_COUNT - 1);
  // Garde côté BONUS : jamais dans une voie occupée par un pilier de pont ou
  // une voiture à ±1 créneau — une étoile inatteignable (derrière un pilier)
  // ou plantée « dans » une voiture est exactement le conflit signalé au
  // playtest. Déplacée vers la première voie libre, parcourue depuis un
  // décalage tiré au hash (sinon tout atterrirait sur « voie + 1 », motif
  // visible). Si tout est bloqué (rare : deux voisins qui couvrent les 3
  // voies à eux deux), on garde la voie tirée — l'étoile reste ramassable en
  // sautant par-dessus la voiture, seul le cas pont+pont total serait un vrai
  // piège et deux ponts ne sont jamais à ±1 (LARGE espacement des ponts).
  if (content && content.isBonus) {
    const blocked = lanesBlockedByNeighbors(slotIndex);
    if (blocked.has(lane)) {
      const start = 1 + Math.floor(hash(slotIndex * 3 + 97) * (road.LANE_COUNT - 1));
      for (let i = 0; i < road.LANE_COUNT; i++) {
        const alt = (lane + start + i) % road.LANE_COUNT;
        if (!blocked.has(alt)) return [alt];
      }
    }
  }
  return [lane];
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
    // Plus de coupure à TOTAL_OBJECTS : le parcours est infini (24 août 2026),
    // les créneaux se génèrent sans fin — TOTAL_OBJECTS ne sert plus qu'à
    // borner la rampe de difficulté (timeRampT).
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
        events.push({ type: "bonus", kind: e.kind, gold: !!e.gold });
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
  currentLives = window.CONFIG.viesDepart;
  invalidateSlotCache();
}

// DEBUG uniquement : force l'apparition d'un bonus/obstacle donné pile devant
// le joueur, sans attendre son tour dans la grille de spawn calée sur les
// beats — passe par le même chemin de code (slotContent/slotLanes/update/render)
// que le spawn normal, pour tester la collision/le ramassage sans jouer une
// partie entière.
// Aperçu PUR du contenu d'un créneau (isBonus/kind/gold), sans effet de bord :
// sert au balayage hors ligne qui recalcule le score maximum théorique
// (méthode ARCHITECTURE.md §12) — les créneaux bonus ne dépendent ni du score
// ni du temps, le résultat est donc le vrai parcours de chaque partie.
export function slotPreview(slotIndex) {
  return rawSlotContent(slotIndex);
}

export function forceSpawn(isBonus, kind, playerLane) {
  const now = clock.now();
  const slotIndex = Math.floor(clock.beatIndexAt(now) / CADENCE);
  resolved.delete(slotIndex);
  consumed.delete(slotIndex);
  debugOverrides.set(slotIndex, { isBonus, kind, lane: playerLane });
  invalidateSlotCache();
}
