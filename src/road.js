// road.js — Moteur pseudo-3D "sol qui défile vers un point de fuite".
//
// Projection façon caméra sténopé (pinhole), rendue en scanlines : une bande
// horizontale par ligne d'écran, du bas (proche) vers l'horizon (loin).
// project() est la seule fonction qui connaît les paramètres caméra — elle
// est réutilisée par debug.js (grille rythmique), world.js (immeubles),
// player.js (joueur) et entities.js (bonus/obstacles).

export const ROAD_HALF_WIDTH = 4;  // largeur de route en unités-monde, de part et d'autre du centre
export const PLAYER_NEAR_Z = 13;   // profondeur à laquelle se tient le joueur (plus loin = paraît plus petit/reculé)

// --- Voies -----------------------------------------------------------------
// Refonte demandée au playtest : « fais quatre voies, le personnage est soit
// sur la voie 1, soit 2, soit 3, soit 4 — jamais entre deux voies ni en dehors
// de la route ». Tout le jeu (joueur, étoiles, voitures, bus, piétons) se
// positionne désormais sur un INDEX de voie, plus sur un x continu.
// La chaussée fait ROAD_HALF_WIDTH × 2 = 8 unités → 4 voies de 2 unités,
// centres à -3, -1, +1, +3. C'est la source unique : road.js dessine les
// séparateurs à partir des mêmes valeurs, donc les objets tombent forcément
// au milieu du couloir qu'on voit à l'écran.
export const LANE_COUNT = 4;
export const LANE_WIDTH = (ROAD_HALF_WIDTH * 2) / LANE_COUNT; // 2 unités
export function laneX(lane) {
  return (lane - (LANE_COUNT - 1) / 2) * LANE_WIDTH;
}
// Voie la plus proche d'une position continue (sert au repli/aux garde-fous).
export function laneOf(x) {
  const i = Math.round(x / LANE_WIDTH + (LANE_COUNT - 1) / 2);
  return Math.max(0, Math.min(LANE_COUNT - 1, i));
}

const CAMERA_HEIGHT = 4.8;  // hauteur caméra au-dessus du sol, en unités-monde (plus haut = moins "au ras du sol")
const HORIZON_RATIO = 0.30; // horizon *théorique* d'un sol plat (asymptote) — l'horizon réellement visible est plus bas, voir CURVATURE

// --- Courbure de la planète ------------------------------------------------
// Demandé : « on a une piste plate, j'aimerais la sensation que la Terre est
// ronde, que l'horizon disparaisse, qu'on voie sur 10 bâtiments en longueur ».
//
// Modèle : le sol s'enfonce de CURVATURE·z² sous le plan de la caméra à mesure
// qu'il s'éloigne (approximation parabolique d'une sphère, z²/2R). La caméra
// se retrouve donc *de plus en plus haut* au-dessus du sol lointain, et les
// points éloignés redescendent à l'écran au lieu de s'empiler sur une ligne
// d'horizon. Conséquence : la route ne converge plus vers un point, elle
// bascule derrière la courbe et disparaît.
//
// Il existe alors une distance maximale visible — le vrai horizon d'une
// sphère : au-delà, le sol est passé sous la ligne de visée. C'est HORIZON_Z,
// dérivé de CURVATURE, et c'est lui qui règle « 10 bâtiments » (SPACING = 10
// unités dans world.js, donc HORIZON_Z ≈ 95 ⇒ une dizaine de bâtiments).
// 0.000532 → 0.0004 (retour explicite : « génère plus d'horizon », les
// bâtiments/monuments ont besoin de plus de recul pour apparaître en fondu
// plutôt que de surgir) — HORIZON_Z ≈ 95 → ≈ 110 unités-monde, +15 %.
const CURVATURE = 0.0004;
export const HORIZON_Z = Math.sqrt(CAMERA_HEIGHT / CURVATURE); // ≈ 110 unités-monde

// Enfoncement du sol à la distance z, en unités-monde.
function groundDrop(z) {
  return CURVATURE * z * z;
}

// Ordonnée écran de l'horizon courbe : le minimum de y(z), atteint en
// z = HORIZON_Z. Toujours SOUS l'horizon plat (donc plus de ciel visible).
function curvedHorizonY(horizonY, focal) {
  return horizonY + focal * 2 * Math.sqrt(CURVATURE * CAMERA_HEIGHT);
}
const FOCAL_RATIO = 1.1;    // longueur focale, en fraction de la hauteur d'écran
const BAND_LENGTH = 4;      // longueur d'une bande de chaussée en unités-monde (effet de défilement)
const BASE_SPEED = 11;      // vitesse de base du défilement, en unités-monde/seconde
const SPEED_SMOOTHING = 3;  // vitesse de rattrapage de currentSpeed vers sa cible (voir update())
// s au bout desquelles la vitesse double (voir update()). Retour explicite :
// « accélère un peu plus l'accélération », +20 % — le TAUX d'accélération
// (1/temps de doublement) monte de 20 %, donc le temps de doublement est
// divisé par 1,2 : 90 → 68 (playtest précédent) → 68/1,2 ≈ 57.
const SPEED_DOUBLING_TIME = 57;
// Démarrage progressif (retour explicite : « on part de 0 km/h et on va à 5,
// puis 7, puis 10... puis vitesse constante » — vitesseBase démarrait déjà
// lancé, sans montée en régime perceptible). Voir update().
const START_RAMP_DURATION = 4;
const EDGE_WIDTH = 0.25;    // largeur des bords de chaussée, en unités-monde
const CENTER_LINE_WIDTH = 0.12;
const MAX_ROWS = 160;       // plafond de bandes dessinées par frame (budget perf mobile)

// Brume du lointain : sol (ci-dessous) et bâtiments (world.js, qui importe
// ces constantes) se fondent tous les deux vers cette teinte à distance, au
// même rythme — cohérence de l'atmosphère sur toute la scène. Couleur = le
// dernier stop du dégradé du ciel (voir render()), pour que l'horizon se
// fonde vraiment dedans plutôt que vers une teinte différente.
// Bleu nuit très sombre — PAS le rouge de charte (retour explicite : « il y a
// des choses rouges qui arrivent, l'horizon est vraiment rouge », les
// obstacles/voitures rouges s'y fondaient et devenaient invisibles au loin).
// Le rouge/orange du coucher de soleil reste présent comme bande intermédiaire
// dans le dégradé du ciel (voir render()) — seul le point de fonte le plus
// lointain change, pour redonner du contraste aux objets rouges.
export const HAZE_COLOR = "#12101f";
export const HAZE_MAX_Z = HORIZON_Z;   // un élément est fondu au maximum pile là où la courbe l'avale
// 0.45 → 0.36 (retour explicite : « tu peux réduire un tout petit peu la
// quantité de noir, montre un peu plus de route devant ») — le bleu nuit
// mange moins la route/les façades à mi-distance, la route reste lisible
// plus loin ; seul le tout dernier tronçon (voir le dégradé du ciel dans
// render()) reste franchement sombre.
export const HAZE_STRENGTH = 0.36;

let distanceScrolled = 0;     // unités-monde parcourues depuis le départ
let prevDistanceScrolled = 0; // valeur au pas précédent, pour l'interpolation au rendu
let currentSpeed = BASE_SPEED * window.CONFIG.vitesseBase;

// --- Dégradés vers la brume, précalculés une fois (pas à chaque ligne/frame :
// le rendu du sol boucle jusqu'à MAX_ROWS fois par frame, éviter de reparser
// des couleurs hex ou reconstruire des chaînes "rgb(...)" dans cette boucle
// chaude). gradientStep() ne fait plus qu'une indexation de tableau. ---

const GRADIENT_STEPS = 16;

export function hexToRgb(hex) {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

// Précalcule GRADIENT_STEPS teintes entre `base` ([r,g,b]) et HAZE_COLOR,
// jusqu'à `strength`. À indexer avec gradientStep() plutôt que de reparser
// des couleurs à chaque frame. Exporté (avec gradientStep/hexToRgb) pour que
// world.js partage la même technique pour ses façades au lieu d'en
// réimplémenter une autre — les deux fondent vers la même brume.
export function buildHazeGradientFromRgb(base, strength = HAZE_STRENGTH) {
  const haze = hexToRgb(HAZE_COLOR);
  const steps = [];
  for (let i = 0; i < GRADIENT_STEPS; i++) {
    const t = (i / (GRADIENT_STEPS - 1)) * strength;
    const r = Math.round(base[0] + (haze[0] - base[0]) * t);
    const g = Math.round(base[1] + (haze[1] - base[1]) * t);
    const b = Math.round(base[2] + (haze[2] - base[2]) * t);
    steps.push(`rgb(${r},${g},${b})`);
  }
  return steps;
}

export function buildHazeGradient(hex, strength = HAZE_STRENGTH) {
  return buildHazeGradientFromRgb(hexToRgb(hex), strength);
}

export function gradientStep(gradient, t) {
  return gradient[Math.min(GRADIENT_STEPS - 1, Math.floor(Math.max(0, t) * GRADIENT_STEPS))];
}

// Wrapper en fléchée explicite : .map(buildHazeGradient) passerait l'index
// de tableau en 2e argument (strength), qui écraserait la valeur par défaut.
// DA pochette : béton chaud pour les trottoirs, bitume quasi noir pour la
// chaussée, marquages blanc pur — c'est ce contraste noir/blanc qui porte
// toute la lisibilité, les objets colorés se détachant ensuite dessus.
const sidewalkGradients = ["#5c5349", "#665c51"].map((hex) => buildHazeGradient(hex));
const roadGradients = ["#141419", "#1b1b22"].map((hex) => buildHazeGradient(hex));
const lineGradient = buildHazeGradient("#ffffff");

// --- Caméra qui suit latéralement ------------------------------------------
// Avec 4 voies sur une chaussée de 8 unités, les voies extérieures tombent
// hors de l'écran à la profondeur du joueur (constaté à l'écran : le sprite
// sortait à moitié du cadre sur la voie 4). Plutôt que de rétrécir la route —
// ce qui aurait obligé à réduire toutes les tailles d'objets déjà réglées au
// playtest — la caméra se décale latéralement vers le joueur, comme dans un
// Subway Surfers. Bonus : la ville défile légèrement de côté quand on change
// de voie, ce qui donne du relief au changement.
// Le décalage est appliqué EN UNITÉS-MONDE, donc son effet à l'écran diminue
// naturellement avec la distance (parallaxe correcte) : le lointain ne bouge
// presque pas, le premier plan suit.
let cameraX = 0;
export function setCameraX(x) { cameraX = x; }
export function getCameraX() { return cameraX; }

function cameraParams(width, height) {
  return {
    centerX: width / 2,
    horizonY: height * HORIZON_RATIO,
    focal: height * FOCAL_RATIO,
    cameraHeight: CAMERA_HEIGHT,
  };
}

// Projette un point du monde (x latéral, z profondeur > 0) en coordonnées écran.
// La courbure est intégrée ICI et nulle part ailleurs : world.js, player.js,
// entities.js et debug.js passent tous par cette fonction, donc toute la scène
// épouse la même courbe sans qu'aucun d'eux ait à la connaître.
export function project(x, z, width, height) {
  const { centerX, horizonY, focal, cameraHeight } = cameraParams(width, height);
  const scale = focal / z;
  return {
    x: centerX + (x - cameraX) * scale,
    y: horizonY + (cameraHeight + groundDrop(z)) * scale,
    scale,
  };
}

export function getSpeed() {
  return currentSpeed;
}

// Progression 0..1 entre vitesseBase et vitesseMax (config.js) — sert au flou
// de mouvement du joueur (main.js), qui doit s'intensifier avec la vitesse
// plutôt que de rester fixe (demandé explicitement : « plus on va vite, plus
// intense »). speedMultiplier n'existe plus (jauge d'énergie retirée) :
// currentSpeed / BASE_SPEED redonne directement la "vitesse logique".
export function getSpeedRatio() {
  const { vitesseBase, vitesseMax } = window.CONFIG;
  const vitesse = currentSpeed / BASE_SPEED;
  return Math.min(1, Math.max(0, (vitesse - vitesseBase) / (vitesseMax - vitesseBase)));
}

// Remet le défilement à zéro (rejouer après un game over/fin de course).
export function reset() {
  distanceScrolled = 0;
  prevDistanceScrolled = 0;
  cameraX = 0;
  currentSpeed = BASE_SPEED * window.CONFIG.vitesseBase;
}

// Décélération douce vers 0 utilisée pendant la séquence de fin (le joueur
// franchit la ligne d'arrivée, la caméra s'arrête smooth pendant que le
// personnage continue de s'éloigner vers l'horizon — voir main.js).
// Facteur explicite plus faible que SPEED_SMOOTHING (utilisé par update()
// pour rattraper la vitesse cible) : on veut vraiment sentir la décélération
// s'étaler sur plusieurs secondes, pas un stop brusque.
const BRAKE_DECAY = 1.2; // 1/s : après ~3 s, currentSpeed ≈ 3 % de sa valeur initiale
export function brake(dt) {
  prevDistanceScrolled = distanceScrolled;
  currentSpeed += (0 - currentSpeed) * Math.min(1, BRAKE_DECAY * dt);
  distanceScrolled += currentSpeed * dt;
}

export function getDistanceScrolled() {
  return distanceScrolled;
}

// Distance interpolée entre le pas de simulation précédent et le courant
// (alpha = fraction d'accumulateur, voir la boucle à pas fixe dans main.js).
export function getRenderDistance(alpha) {
  return prevDistanceScrolled + (distanceScrolled - prevDistanceScrolled) * alpha;
}

// Avance le défilement. `elapsedSeconds` = clock.now() côté main.js, pilote
// la montée de vitesse vitesseBase → vitesseMax de config.js.
export function update(dt, elapsedSeconds) {
  prevDistanceScrolled = distanceScrolled;

  // Courbe exponentielle : la vitesse DOUBLE toutes les SPEED_DOUBLING_TIME
  // secondes (fondu continu, pas de palier sec).
  // Période raccourcie 90 → 68 s au playtest (« accélère un peu plus vite le
  // rythme »). La vitesse de DÉPART ne bouge pas — un playtest précédent
  // avait justement fait baisser vitesseBase (« trop intense au début ») — ce
  // qui change, c'est la pente :
  //   t=30 s → ×1,36 (avant ×1,26)   t=60 s → ×1,84 (×1,59)
  //   t=112 s (ligne d'arrivée) → ×3,12 (×2,37)
  // Plafonnée à vitesseMax pour ne pas partir en vrille sur la dernière
  // portion du parcours.
  const { vitesseBase, vitesseMax } = window.CONFIG;
  const t = Math.max(0, elapsedSeconds);
  const vitesse = Math.min(vitesseMax, vitesseBase * Math.pow(2, t / SPEED_DOUBLING_TIME));
  // Démarrage progressif superposé à la courbe ci-dessus (pas à sa place) :
  // à t=0 la cible part de 0, remonte en douceur (smoothstep, plus agréable
  // qu'une simple rampe linéaire) jusqu'à sa valeur normale vers
  // START_RAMP_DURATION, après quoi ce facteur vaut 1 et n'a plus d'effet.
  const rampT = Math.min(1, t / START_RAMP_DURATION);
  const ramp = rampT * rampT * (3 - 2 * rampT);
  const targetSpeed = BASE_SPEED * vitesse * ramp;
  // Lissé plutôt que recopié tel quel : entities.js positionne chaque bonus/
  // obstacle pas encore arrivé à partir de la vitesse *courante* (temps
  // restant × vitesse, pas de position propre stockée) — un saut brutal de
  // currentSpeed décalerait visiblement d'un coup tous les objets pas encore
  // arrivés.
  currentSpeed += (targetSpeed - currentSpeed) * Math.min(1, SPEED_SMOOTHING * dt);
  distanceScrolled += currentSpeed * dt;
}

export function render(ctx, width, height, distance) {
  const { centerX, horizonY, focal, cameraHeight } = cameraParams(width, height);

  // Le ciel descend jusqu'à l'horizon COURBE, plus bas que l'horizon plat :
  // la planète mange du sol, l'écran gagne du ciel.
  const skyBottom = curvedHorizonY(horizonY, focal);

  // Ciel : bleu profond de la pochette en haut, bascule vers le rouge/orange
  // du coucher de soleil, puis vers un bleu nuit très sombre PILE à l'horizon
  // (retour explicite : « qu'on passe presque du bleu nuit, puis aux rouges,
  // puis aux oranges, puis il y a le ciel » — l'horizon lui-même doit être
  // plus sombre que le rouge de charte, sans quoi les obstacles/voitures
  // rouges s'y fondent et deviennent invisibles). Le rouge/orange reste comme
  // bande intermédiaire, la nuit ne mange que les derniers % vers le sol.
  const sky = ctx.createLinearGradient(0, 0, 0, skyBottom);
  sky.addColorStop(0, "#04225e");
  sky.addColorStop(0.38, "#0d5cae");
  sky.addColorStop(0.64, "#4f9fd6");
  sky.addColorStop(0.80, "#f0813c");
  sky.addColorStop(0.93, "#e13e26"); // rouge de charte, gardé en dur ici (HAZE_COLOR ne le porte plus)
  // 0.97 → 0.985 (retour explicite : « réduis un peu la quantité de noir ») —
  // bande de bleu nuit resserrée aux tout derniers % avant l'horizon, le
  // rouge/orange du coucher de soleil garde plus de place au-dessus.
  sky.addColorStop(0.985, HAZE_COLOR);
  sky.addColorStop(1, HAZE_COLOR);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, skyBottom);

  const groundHeight = height - skyBottom;
  const rowStep = Math.max(1, Math.floor(groundHeight / MAX_ROWS));

  for (let y = height; y > skyBottom; y -= rowStep) {
    // Inversion de la projection courbe : y = horizonY + (h + c·z²)·focal/z
    // donne c·z² − Y·z + h = 0 avec Y = (y − horizonY)/focal. On prend la
    // racine proche, sous la forme 2h/(Y + √Δ) plutôt que (Y − √Δ)/2c :
    // mathématiquement identique, mais sans l'annulation catastrophique de la
    // soustraction de deux nombres voisins près de l'horizon.
    const Y = (y - horizonY) / focal;
    const disc = Y * Y - 4 * CURVATURE * cameraHeight;
    if (disc <= 0) continue; // au-dessus de l'horizon courbe : plus de sol
    const z = (2 * cameraHeight) / (Y + Math.sqrt(disc));
    const scale = focal / z;
    const roadHalfPx = ROAD_HALF_WIDTH * scale;
    const camPx = cameraX * scale; // même décalage que project(), voir setCameraX
    const roadCenterX = centerX - camPx;
    const edgePx = EDGE_WIDTH * scale;
    const centerPx = CENTER_LINE_WIDTH * scale;
    const band = Math.floor((z + distance) / BAND_LENGTH) % 2 === 0;
    const rectY = y - rowStep;
    const hazeT = z / HAZE_MAX_Z; // sol teinté par la lumière chaude à distance, comme les bâtiments (world.js)

    // Trottoirs de part et d'autre de la chaussée.
    ctx.fillStyle = gradientStep(sidewalkGradients[band ? 1 : 0], hazeT);
    ctx.fillRect(0, rectY, width, rowStep);

    // Chaussée (nettement plus claire que les trottoirs pour bien se détacher).
    ctx.fillStyle = gradientStep(roadGradients[band ? 1 : 0], hazeT);
    ctx.fillRect(roadCenterX - roadHalfPx, rectY, roadHalfPx * 2, rowStep);

    // Bords de chaussée + ligne centrale (même teinte, même dégradé).
    const lineColor = gradientStep(lineGradient, hazeT);
    ctx.fillStyle = lineColor;
    ctx.fillRect(roadCenterX - roadHalfPx, rectY, edgePx, rowStep);
    ctx.fillRect(roadCenterX + roadHalfPx - edgePx, rectY, edgePx, rowStep);

    // Séparateurs de voies pointillés (une bande sur deux) : LANE_COUNT - 1
    // lignes au lieu de l'unique ligne centrale d'avant. C'est ce qui rend
    // les 4 couloirs lisibles — sans elles, le joueur ne voit pas où il a le
    // droit de se placer.
    if (band) {
      ctx.fillStyle = lineColor;
      for (let i = 1; i < LANE_COUNT; i++) {
        const lx = roadCenterX + (-ROAD_HALF_WIDTH + i * LANE_WIDTH) * scale;
        ctx.fillRect(lx - centerPx / 2, rectY, centerPx, rowStep);
      }
    }
  }
}
