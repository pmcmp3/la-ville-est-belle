// road.js — Projection pseudo-3D et route de campagne. Forké du road.js du
// premier jeu (même caméra sténopé, même courbure de planète, même brume)
// avec un sol de campagne : bas-côtés en herbe, bande de terre, asphalte
// gris-brun sans marquage de bord, une ligne centrale pointillée. Le ciel
// est un LEVER de soleil (fin de nuit d'été, il fait un peu frais).
//
// project() reste la seule fonction qui connaît la caméra ; fields.js,
// rider.js, track.js, obstacles.js et debug.js passent tous par elle.

export const ROAD_HALF_WIDTH = 4;
export const PLAYER_NEAR_Z = 13;

// Trois colonnes sur la chaussée : le joueur roule au centre, ses potes se
// répartissent à gauche et à droite (friends.js). Les étoiles tombent sur une
// colonne — une étoile latérale n'est ramassée que si un pote y roule.
export const COL_X = 2.0; // 2,3 → 2,0 : le pote de la rangée de tête frôlait le bord de l'écran
export function colX(c) { return c * COL_X; }

const CAMERA_HEIGHT = 4.8;
const HORIZON_RATIO = 0.30;
const CURVATURE = 0.00011;
export const HORIZON_Z = Math.sqrt(CAMERA_HEIGHT / CURVATURE); // ≈ 209

function curvedHorizonY(horizonY, focal) {
  return horizonY + focal * 2 * Math.sqrt(CURVATURE * CAMERA_HEIGHT);
}
const FOCAL_RATIO = 1.1;
const BAND_LENGTH = 4;
const BASE_SPEED = 11;
const SPEED_SMOOTHING = 3;
// Montée de vitesse plus lente que le premier jeu (43,8 s) : c'est un jeu
// d'endurance, la vitesse plafonne vers ~90 s puis reste constante.
const SPEED_DOUBLING_TIME = 62;
const MAX_ROWS = 160;

export const WORLD_GRID_SPACING = 10;

// Brume du petit matin : claire et chaude (les champs se dissolvent dans une
// nappe de lumière, pas dans la nuit). Même mécanique de dégradés
// précalculés que le premier jeu.
export const HAZE_COLOR = "#f1d9b3";
export const HAZE_MAX_Z = HORIZON_Z;
export const HAZE_STRENGTH = 0.62;

let distanceScrolled = 0;
let prevDistanceScrolled = 0;
let currentSpeed = BASE_SPEED * window.CONFIG.vitesseBase;
let courseStartDistance = 0;

const GRADIENT_STEPS = 16;

export function hexToRgb(hex) {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

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

// Sol de campagne : herbe des bas-côtés (deux verts qui alternent par bande,
// comme les bandes de chaussée), terre battue entre l'asphalte et l'herbe,
// asphalte gris-brun un peu délavé, ligne centrale blanche pointillée.
const grassGradients = ["#6c8a34", "#63802f"].map((hex) => buildHazeGradient(hex));
const dirtGradient = buildHazeGradient("#9a7a4e");
const roadGradients = ["#4a4642", "#514d48"].map((hex) => buildHazeGradient(hex));
const lineGradient = buildHazeGradient("#f2ead8");
const DIRT_W = 0.6;
const CENTER_LINE_WIDTH = 0.14;

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

export function project(x, z, width, height) {
  const { centerX, horizonY, focal, cameraHeight } = cameraParams(width, height);
  const scale = focal / z;
  return {
    x: centerX + (x - cameraX) * scale,
    y: horizonY + (cameraHeight + CURVATURE * z * z) * scale,
    scale,
  };
}

// Ordonnée écran de l'horizon courbe (là où le ciel s'arrête) — utile aux
// éléments de décor lointains (soleil, ligne d'arbres).
export function horizonScreenY(width, height) {
  const { horizonY, focal } = cameraParams(width, height);
  return curvedHorizonY(horizonY, focal);
}

export function getSpeed() { return currentSpeed; }
export function getDistanceScrolled() { return distanceScrolled; }
export function getRenderDistance(alpha) {
  return prevDistanceScrolled + (distanceScrolled - prevDistanceScrolled) * alpha;
}
export function markCourseStart() { courseStartDistance = distanceScrolled; }
export function getCourseDistance() { return distanceScrolled - courseStartDistance; }

export function reset() {
  distanceScrolled = 0;
  prevDistanceScrolled = 0;
  courseStartDistance = 0;
  cameraX = 0;
  currentSpeed = BASE_SPEED * window.CONFIG.vitesseBase;
}

export function update(dt, elapsedSeconds) {
  prevDistanceScrolled = distanceScrolled;
  const { vitesseBase, vitesseMax } = window.CONFIG;
  const t = Math.max(0, elapsedSeconds);
  const vitesse = Math.min(vitesseMax, vitesseBase * Math.pow(2, t / SPEED_DOUBLING_TIME));
  const targetSpeed = BASE_SPEED * vitesse;
  currentSpeed += (targetSpeed - currentSpeed) * Math.min(1, SPEED_SMOOTHING * dt);
  distanceScrolled += currentSpeed * dt;
}

// Défilement « sur place » (menu, décompte) : la route avance à la vitesse
// de départ sans faire monter la courbe.
export function idle(dt) {
  update(dt, 0);
}

// --- Ciel de lever de soleil ------------------------------------------------
// Bleu nuit qui s'éclaircit vers le haut, rose puis or à l'horizon, un disque
// de soleil très bas à droite de la route avec un halo. Les tons chauds du
// bas se fondent dans HAZE_COLOR, donc les champs lointains disparaissent
// dans la lumière et non sur une ligne.
export function renderSky(ctx, width, height) {
  const skyBottom = horizonScreenY(width, height);
  const sky = ctx.createLinearGradient(0, 0, 0, skyBottom);
  sky.addColorStop(0, "#1c2f6e");
  sky.addColorStop(0.35, "#4c6fb5");
  sky.addColorStop(0.62, "#9fa9c9");
  sky.addColorStop(0.78, "#e2a9a2");
  sky.addColorStop(0.9, "#f4c47a");
  sky.addColorStop(1, HAZE_COLOR);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, skyBottom);

  // Soleil : disque plat, halo doux. Posé juste au-dessus de l'horizon, à
  // droite de la route — l'ombre des potes ne le suit pas, c'est un décor.
  const sx = width * 0.66;
  const sy = skyBottom - height * 0.035;
  const r = Math.max(14, height * 0.045);
  const halo = ctx.createRadialGradient(sx, sy, r * 0.4, sx, sy, r * 4.2);
  halo.addColorStop(0, "rgba(255, 226, 150, 0.55)");
  halo.addColorStop(0.5, "rgba(255, 200, 120, 0.18)");
  halo.addColorStop(1, "rgba(255, 200, 120, 0)");
  ctx.fillStyle = halo;
  ctx.fillRect(sx - r * 4.2, sy - r * 4.2, r * 8.4, r * 4.2 + (skyBottom - sy));
  ctx.fillStyle = "#ffe08a";
  ctx.beginPath();
  ctx.arc(sx, sy, r, 0, Math.PI * 2);
  ctx.fill();
  // Le soleil disparaît sous la ligne d'horizon : on repeint la bande de
  // brume par-dessus sa moitié basse.
  ctx.fillStyle = HAZE_COLOR;
  ctx.fillRect(0, skyBottom, width, height - skyBottom);
  return skyBottom;
}

export function render(ctx, width, height, distance) {
  const { centerX, horizonY, focal, cameraHeight } = cameraParams(width, height);
  const skyBottom = renderSky(ctx, width, height);

  const groundHeight = height - skyBottom;
  const rowStep = Math.max(1, Math.floor(groundHeight / MAX_ROWS));

  for (let y = height; y > skyBottom; y -= rowStep) {
    const Y = (y - horizonY) / focal;
    const disc = Y * Y - 4 * CURVATURE * cameraHeight;
    if (disc <= 0) continue;
    const z = (2 * cameraHeight) / (Y + Math.sqrt(disc));
    const scale = focal / z;
    const roadHalfPx = ROAD_HALF_WIDTH * scale;
    const camPx = cameraX * scale;
    const roadCenterX = centerX - camPx;
    const dirtPx = DIRT_W * scale;
    const centerPx = CENTER_LINE_WIDTH * scale;
    const band = Math.floor((z + distance) / BAND_LENGTH) % 2 === 0;
    const rectY = y - rowStep;
    const hazeT = z / HAZE_MAX_Z;

    // Herbe des bas-côtés sur toute la largeur.
    ctx.fillStyle = gradientStep(grassGradients[band ? 1 : 0], hazeT);
    ctx.fillRect(0, rectY, width, rowStep);
    // Terre battue de part et d'autre de l'asphalte.
    ctx.fillStyle = gradientStep(dirtGradient, hazeT);
    ctx.fillRect(roadCenterX - roadHalfPx - dirtPx, rectY, roadHalfPx * 2 + dirtPx * 2, rowStep);
    // Asphalte.
    ctx.fillStyle = gradientStep(roadGradients[band ? 1 : 0], hazeT);
    ctx.fillRect(roadCenterX - roadHalfPx, rectY, roadHalfPx * 2, rowStep);
    // Ligne centrale pointillée (une bande sur deux).
    if (band) {
      ctx.fillStyle = gradientStep(lineGradient, hazeT);
      ctx.fillRect(roadCenterX - centerPx / 2, rectY, centerPx, rowStep);
    }
  }
}
