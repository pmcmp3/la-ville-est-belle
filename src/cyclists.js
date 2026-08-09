// cyclists.js — Cyclistes NPC en sens inverse, sur certaines voies (playtest
// iPhone 16 : « des cyclistes en sens inverse sur certaines voies »).
// Purement décoratifs : ils n'entrent dans AUCUN test de collision — la
// décision verrouillée « 3 obstacles » (CLAUDE.md) n'est pas touchée. Ils
// habillent la rue et appuient l'identité "vélo" du jeu.
//
// Même technique/DA que player.js (dont la géométrie est reprise telle
// quelle : roue, cadre, cheveux bouclés, jambes qui pédalent) avec un maillot
// recoloré par instance — mêmes 4 teintes que pedestrians.js (rouge/crème/
// sombre/brique) — pour qu'on les distingue du joueur (maillot rayé vert/
// blanc) au premier coup d'œil, sans réinventer une silhouette.

const SPRITE_W = 26;
const SPRITE_H = 34;

// Un peu plus petit que le joueur (HEIGHT_WORLD = 1.9 dans player.js) : se
// lit comme "un autre cycliste", pas un clone à l'identique.
export const HEIGHT_WORLD = 1.75;

const SKIN = "#c98a5b";
const PANTS = "#22242b";
const PANTS_LO = "#20232b";
const SHOE = "#565a66";
const SHOE_SOLE = "#e8dcc0";
const FRAME = "#1b1b21";
const RIM = "#5a5b64";
const RIM_HI = "#c7c9d2";
const TIRE = "#0e0e11";
const GRIP = "#33333b";

// 4 maillots (charte rouge/crème/sombre/brique, mêmes valeurs que
// pedestrians.js) : PAS de bande claire horizontale type "gilet" — ce signal
// est réservé aux obstacles/danger, un cycliste NPC n'en est pas un.
const OUTFITS = [
  { top: "#e13e26", topLo: "#a12c1c", hair: "#241609", hairHi: "#3c2712" },
  { top: "#f0ead9", topLo: "#c9c2ac", hair: "#3c2712", hairHi: "#5a3c1e" },
  { top: "#2b2b33", topLo: "#1b1b21", hair: "#241609", hairHi: "#3c2712" },
  { top: "#a12c1c", topLo: "#7d2011", hair: "#241609", hairHi: "#3c2712" },
];

function px(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

// Torse à 2 tons (haut clair / bas plus sombre) — écho du maillot rayé du
// joueur sans reprendre exactement le même motif, pour rester distinct.
function torso(ctx, x0, y0, widthTop, widthBottom, height, top, topLo) {
  for (let i = 0; i < height; i++) {
    const t = i / (height - 1);
    const w = Math.round(widthTop + (widthBottom - widthTop) * t);
    const x = Math.round(x0 - w / 2);
    px(ctx, x, y0 + i, w, 1, i < height * 0.35 ? top : topLo);
  }
}

// Roue vue de dos (même technique que player.js — ellipse haute/étroite,
// jante à liseré clair net plutôt qu'un dégradé, cf. retour DA "jantes
// lisibles").
function wheel(ctx, cx, cy, r) {
  const halfW = Math.max(2, r * 0.32);
  const halfH = r;
  ctx.fillStyle = TIRE;
  ctx.beginPath();
  ctx.ellipse(cx, cy, halfW, halfH, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = RIM;
  ctx.beginPath();
  ctx.ellipse(cx, cy, halfW * 0.4, halfH * 0.86, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = RIM_HI;
  ctx.beginPath();
  ctx.ellipse(cx - halfW * 0.15, cy - halfH * 0.35, halfW * 0.32, halfH * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
}

function hair(ctx, cx, topY, w, h, color, colorHi) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(cx, topY + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  ctx.fill();
  for (const [bx, by, br] of [
    [-0.55, -0.32, 0.30], [0, -0.55, 0.30], [0.55, -0.32, 0.30],
    [-0.68, 0.1, 0.26], [0.68, 0.1, 0.26],
    [-0.5, 0.48, 0.26], [0, 0.6, 0.26], [0.5, 0.48, 0.26],
  ]) {
    ctx.beginPath();
    ctx.arc(cx + bx * w, topY + h / 2 + by * h, br * w, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = colorHi;
  ctx.beginPath();
  ctx.arc(cx - w * 0.18, topY + h * 0.28, w * 0.16, 0, Math.PI * 2);
  ctx.fill();
}

function drawLeg(ctx, calfX, footX, lift) {
  px(ctx, calfX, 31 - lift, 4, 3, PANTS_LO);
  px(ctx, footX, 33 - lift, 5, 1, SHOE);
  px(ctx, footX, 34 - lift, 5, 1, SHOE_SOLE);
}

function draw(ctx, outfit, liftLeft, liftRight) {
  wheel(ctx, 13, 28, 7);
  px(ctx, 12, 20, 2, 7, FRAME);
  px(ctx, 10.5, 19, 5, 2, FRAME);
  hair(ctx, 13, 3, 11, 7, outfit.hair, outfit.hairHi);
  px(ctx, 11.5, 9.5, 3, 1.5, SKIN);
  torso(ctx, 13, 11, 17, 15, 9, outfit.top, outfit.topLo);
  px(ctx, 2, 13, 4, 2, outfit.top);
  px(ctx, 1, 15, 3, 2, GRIP);
  px(ctx, 21, 13, 4, 2, outfit.top);
  px(ctx, 22, 15, 3, 2, GRIP);
  torso(ctx, 13, 20, 12, 10, 4, outfit.top, outfit.topLo);
  px(ctx, 9, 23, 8, 5, PANTS);
  drawLeg(ctx, 9, 9, liftLeft);
  drawLeg(ctx, 12, 12, liftRight);
}

function makeSprite(outfit, liftLeft, liftRight) {
  const c = document.createElement("canvas");
  c.width = SPRITE_W;
  c.height = SPRITE_H;
  const cctx = c.getContext("2d");
  cctx.imageSmoothingEnabled = false;
  draw(cctx, outfit, liftLeft, liftRight);
  return c;
}

// 2 frames par outfit (jambe gauche haute / jambe droite haute) : suffisant
// pour un élément décoratif d'arrière-plan, pas besoin des 4 frames du
// joueur. 4 outfits × 2 frames = 8 petits canvas, pré-rendus une fois.
const FRAMES = OUTFITS.map((outfit) => [makeSprite(outfit, 3, 0), makeSprite(outfit, 0, 3)]);
export const OUTFIT_COUNT = OUTFITS.length;

const PEDAL_RATE = 2.2; // cycles par seconde, indépendant de la vitesse du joueur (ils pédalent à leur rythme)

// Dessine un cycliste NPC ancré par le bas (contact roue/sol), même
// signature que player.render() sans le lean (ils ne prennent pas les
// virages du joueur).
export function render(ctx, outfitIndex, x, groundY, pxPerWorldUnit, time = 0) {
  const frames = FRAMES[outfitIndex % FRAMES.length];
  const frame = frames[Math.floor(Math.abs(time) * PEDAL_RATE) % frames.length];
  const scale = (HEIGHT_WORLD / SPRITE_H) * pxPerWorldUnit;
  const w = SPRITE_W * scale;
  const h = SPRITE_H * scale;

  // Ombre de contact au sol — même traitement que le joueur (retour DA :
  // « manque de contact avec la route »).
  ctx.save();
  ctx.globalAlpha = 0.28;
  ctx.fillStyle = "#000000";
  ctx.beginPath();
  ctx.ellipse(x, groundY - w * 0.02, w * 0.24, w * 0.09, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(frame, x - w / 2, groundY - h, w, h);
  ctx.restore();
}
