// player.js — Sprite du cycliste (silhouette "B — penché en avant", choisie
// par l'artiste parmi 3 propositions à l'étape 3). Pixel art dessiné une
// seule fois sur un canvas hors-écran 26×34, puis blit à l'échelle chaque
// frame (image-rendering "pixelated" : pas de flou en agrandissant).

const SPRITE_W = 26;
const SPRITE_H = 34;

// Hauteur réelle du sprite dans le monde du jeu (unités-monde) — sert à
// road.project() pour calculer sa taille à l'écran selon la profondeur.
export const HEIGHT_WORLD = 1.9;

const PAL = {
  hair: "#241609",
  hairHi: "#3c2712",
  skin: "#c98a5b",
  green: "#2f7a46",
  white: "#f0ead9",
  pants: "#22242b",
  pantsLo: "#20232b",
  // Chaussures nettement plus claires que la roue (pneu/jante très sombres) :
  // au rayon d'origine, les deux se confondaient et les pieds se lisaient
  // comme deux petites roues supplémentaires de part et d'autre de la
  // vraie roue (retour playtest : "on dirait que j'ai deux roues à droite
  // et à gauche"). semelle = liseré clair pour renforcer la silhouette.
  shoe: "#565a66",
  shoeSole: "#e8dcc0",
  frame: "#1b1b21",
  rim: "#5a5b64",
  // Liseré clair sur la jante (playtest/DA : « manque de contact/lisibilité
  // avec la route, jantes », 2 références envoyées — vélos avec jantes
  // nettement découpées, contraste net plutôt que plat, esprit Pokémon).
  // Un simple dégradé tire→rim ne suffisait pas à la lire comme une jante à
  // cette résolution ; un arc clair net, façon reflet métallique, fait le
  // travail en un seul bloc de couleur au lieu d'un flou.
  rimHi: "#c7c9d2",
  tire: "#0e0e11",
  grip: "#33333b",
};

function px(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

// Torse rayé (maillot rugby), largeur variable en haut/bas pour la posture.
function stripedTorso(ctx, x0, y0, widthTop, widthBottom, height) {
  for (let i = 0; i < height; i++) {
    const t = i / (height - 1);
    const w = Math.round(widthTop + (widthBottom - widthTop) * t);
    const x = Math.round(x0 - w / 2);
    const stripe = Math.floor(i / 2) % 2 === 0;
    px(ctx, x, y0 + i, w, 1, stripe ? PAL.green : PAL.white);
  }
}

// Vue de dos du vélo : le disque de la roue arrière est perpendiculaire à la
// caméra. On ne voit donc PAS un cercle plein (qui se lirait comme une roue
// couchée, une planche à roulettes) mais l'épaisseur du pneu — une ellipse
// haute et étroite (demandé au playtest : « ta roue est toujours à plat,
// il faut la faire tourner de 90° pour qu'elle soit dans le sens de la
// route »). Petit reflet clair sur la face avant de la jante pour donner
// l'idée du disque intérieur qu'on devine à peine par le côté.
function wheel(ctx, cx, cy, r) {
  const halfW = Math.max(2, r * 0.32);
  const halfH = r;
  ctx.fillStyle = PAL.tire;
  ctx.beginPath();
  ctx.ellipse(cx, cy, halfW, halfH, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PAL.rim;
  ctx.beginPath();
  ctx.ellipse(cx, cy, halfW * 0.4, halfH * 0.86, 0, 0, Math.PI * 2);
  ctx.fill();
  // Reflet de jante : arc clair sur le bord haut, en aplat net (pas de
  // dégradé) — c'est ce qui manquait pour lire "jante métallique" plutôt
  // qu'un simple disque gris uni.
  ctx.fillStyle = PAL.rimHi;
  ctx.beginPath();
  ctx.ellipse(cx - halfW * 0.15, cy - halfH * 0.35, halfW * 0.32, halfH * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
}

// Ombre de contact au sol : ellipse aplatie sous la roue, non tournée par le
// lean (une ombre reste plaquée au sol même quand le personnage penche dans
// un virage). Absente jusqu'ici — retour DA : « le vélo manque de contact
// avec la route ». Dessinée à part du sprite pré-rendu (elle dépend de x/
// groundY à l'écran, pas d'un pixel art figé), même technique que les ombres
// de véhicules dans entities.js (ellipse noire semi-transparente).
function groundShadow(ctx, x, groundY, w) {
  ctx.save();
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = "#000000";
  ctx.beginPath();
  ctx.ellipse(x, groundY - w * 0.02, w * 0.24, w * 0.09, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Cheveux bouclés : anneau complet de bosses tout autour de l'ellipse de
// base (pas juste au sommet) pour lire clairement "boucles" — un contour
// lisse avec 2-3 bosses ne se voit pas assez à 32 px, une silhouette en
// "nuage"/chou-fleur sur tout le pourtour se reconnaît d'un coup d'œil.
function hair(ctx, cx, topY, w, h, bumps) {
  ctx.fillStyle = PAL.hair;
  ctx.beginPath();
  ctx.ellipse(cx, topY + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  ctx.fill();
  for (const [bx, by, br] of bumps) {
    ctx.beginPath();
    ctx.arc(cx + bx * w, topY + h / 2 + by * h, br * w, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = PAL.hairHi;
  ctx.beginPath();
  ctx.arc(cx - w * 0.18, topY + h * 0.28, w * 0.16, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + w * 0.32, topY + h * 0.62, w * 0.1, 0, Math.PI * 2);
  ctx.fill();
}

// Mollet + pied d'une jambe, remontés de `lift` px (genou plus ou moins
// plié). Les 4 frames du cycle de pédalage (PEDAL_FRAMES ci-dessous) ne
// sont qu'une paire (liftGauche, liftDroite) différente à chaque fois — sans
// cette variation, le personnage ne fait que tanguer d'un bloc, comme posé
// sur une trottinette plutôt qu'à vélo. Semelle claire en pied de chaussure :
// contraste avec la roue derrière, pour bien lire "pied" et pas "roue".
function drawLeg(ctx, calfX, footX, lift) {
  px(ctx, calfX, 31 - lift, 4, 3, PAL.pantsLo);
  px(ctx, footX, 33 - lift, 5, 1, PAL.shoe);
  px(ctx, footX, 34 - lift, 5, 1, PAL.shoeSole);
}

// "Penché en avant" : buste tassé et plus large (épaules hunchées), prise de
// guidon avancée et basse, jambes plus visibles que la silhouette assise.
// `liftLeft`/`liftRight` (0..3 px) positionnent chaque jambe pour cette frame.
//
// Vue de dos : UNE seule roue (arrière), et les deux pieds pédalent devant
// elle, resserrés près de l'axe central plutôt qu'écartés à ses deux bords —
// demandé explicitement après playtest ("j'ai l'impression d'avoir deux
// roues à droite et à gauche") : avec l'écartement précédent (~7px) et une
// couleur de chaussure trop proche du pneu, les deux pieds se lisaient comme
// deux petites roues supplémentaires flanquant la vraie. Bassin réduit et
// remonté (au lieu de recouvrir presque toute la roue) pour la laisser
// apparaître clairement en dessous, comme un vrai arrière-plan.
function draw(ctx, liftLeft, liftRight) {
  wheel(ctx, 13, 28, 7);
  px(ctx, 12, 20, 2, 7, PAL.frame);
  px(ctx, 10.5, 19, 5, 2, PAL.frame);
  hair(ctx, 13, 3, 11, 7, [
    [-0.55, -0.32, 0.30], [0, -0.55, 0.30], [0.55, -0.32, 0.30],
    [-0.68, 0.1, 0.26], [0.68, 0.1, 0.26],
    [-0.5, 0.48, 0.26], [0, 0.6, 0.26], [0.5, 0.48, 0.26],
  ]);
  px(ctx, 11.5, 9.5, 3, 1.5, PAL.skin);
  stripedTorso(ctx, 13, 11, 17, 15, 9);
  px(ctx, 2, 13, 4, 2, PAL.green);
  px(ctx, 1, 15, 3, 2, PAL.grip);
  px(ctx, 21, 13, 4, 2, PAL.green);
  px(ctx, 22, 15, 3, 2, PAL.grip);
  stripedTorso(ctx, 13, 20, 12, 10, 4);
  px(ctx, 9, 23, 8, 5, PAL.pants);
  drawLeg(ctx, 9, 9, liftLeft);
  drawLeg(ctx, 12, 12, liftRight);
}

function makeSprite(liftLeft, liftRight) {
  const c = document.createElement("canvas");
  c.width = SPRITE_W;
  c.height = SPRITE_H;
  const cctx = c.getContext("2d");
  cctx.imageSmoothingEnabled = false;
  draw(cctx, liftLeft, liftRight);
  return c;
}

// Cycle de pédalage à 4 frames (jambe gauche, jambe droite), pré-rendues une
// fois. render() choisit celle qui correspond à la phase courante.
const PEDAL_FRAMES = [
  makeSprite(3, 0), // jambe gauche en haut, droite en bas
  makeSprite(2, 1), // transition
  makeSprite(0, 3), // jambe droite en haut, gauche en bas
  makeSprite(1, 2), // transition (retour)
];

// Dessine le sprite dans `ctx`, ancré par le bas (contact roue/sol) au point
// écran (x, groundY), à l'échelle `pxPerWorldUnit`. `lean` (radians) incline
// légèrement le cycliste dans les virages. `pedalPhase` choisit la frame du
// cycle de pédalage — même phase que le rebond de pédalage dans main.js,
// pour que jambes et rebond restent synchronisés.
export function render(ctx, x, groundY, pxPerWorldUnit, lean = 0, pedalPhase = 0) {
  const scale = (HEIGHT_WORLD / SPRITE_H) * pxPerWorldUnit;
  const w = SPRITE_W * scale;
  const h = SPRITE_H * scale;
  const twoPi = Math.PI * 2;
  const normalized = ((pedalPhase % twoPi) + twoPi) % twoPi;
  const frameIndex = Math.floor((normalized / twoPi) * PEDAL_FRAMES.length);
  const sprite = PEDAL_FRAMES[frameIndex];

  groundShadow(ctx, x, groundY, w);

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.translate(x, groundY);
  ctx.rotate(lean);
  ctx.drawImage(sprite, -w / 2, -h, w, h);
  ctx.restore();
}

// Halo au ramassage d'un bonus (demandé au playtest : « une très, très légère
// animation, que ça devienne un tout petit peu lumineux à l'endroit du
// joueur »). Volontairement discret : additif, opacité basse, ~0,35 s — il
// doit confirmer le ramassage du coin de l'œil, pas éclairer la scène ni
// masquer la route juste devant. `intensity` va de 1 (impact) à 0 (fini).
const GLOW_COLOR = "255, 255, 255"; // suit l'anneau des bonus (entities.js), passé au blanc avec la nouvelle DA
const GLOW_MAX_ALPHA = 0.3;         // le blanc éclaire plus fort que le vert à opacité égale

// Enveloppe du halo à partir de `intensity` (1 à l'impact → 0 à la fin).
// Montée rapide sur les 18 premiers pour cent puis longue descente en cosinus :
// le halo s'allume et s'éteint au lieu d'apparaître net et de disparaître d'un
// coup (playtest : « j'aimerais un peu plus de fade in/fade out dans le temps,
// là elle disparaît trop vite »).
const GLOW_ATTACK = 0.18;

function glowEnvelope(intensity) {
  const t = 1 - intensity; // 0 à l'impact → 1 à la fin
  if (t < GLOW_ATTACK) return t / GLOW_ATTACK;
  const u = (t - GLOW_ATTACK) / (1 - GLOW_ATTACK); // 0..1 sur la descente
  return 0.5 * (1 + Math.cos(u * Math.PI));        // 1 → 0, sans rupture de pente
}

export function renderPickupGlow(ctx, x, groundY, pxPerWorldUnit, intensity) {
  if (intensity <= 0) return;

  const envelope = glowEnvelope(intensity);
  if (envelope <= 0.001) return;

  // Grossit légèrement tout au long de l'effet : l'œil lit une impulsion qui
  // se dilate, pas un simple fondu. Centré sur le buste plutôt que sur la roue.
  const radius = HEIGHT_WORLD * pxPerWorldUnit * (0.75 + (1 - intensity) * 0.5);
  const cy = groundY - HEIGHT_WORLD * pxPerWorldUnit * 0.45;
  const alpha = GLOW_MAX_ALPHA * envelope;

  const gradient = ctx.createRadialGradient(x, cy, 0, x, cy, radius);
  gradient.addColorStop(0, `rgba(${GLOW_COLOR}, ${alpha})`);
  gradient.addColorStop(0.55, `rgba(${GLOW_COLOR}, ${alpha * 0.35})`);
  gradient.addColorStop(1, `rgba(${GLOW_COLOR}, 0)`);

  ctx.save();
  ctx.globalCompositeOperation = "lighter"; // additif : éclaire, ne repeint pas
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, cy, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
