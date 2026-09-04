// rider.js — Cycliste VU DE DOS, en voxel (blocs extrudés, voxel.js). Forké
// du player.js du premier jeu et PARAMÉTRÉ par une palette : le même sprite
// sert au joueur (pull rayé vert/blanc de PMC) et à chacun de ses potes
// (tenues différentes, casquette, barbe). Chaque palette pré-rend ses 6
// frames de pédalage une seule fois.

import { blk } from "./voxel.js";

const SPRITE_W = 26;
const SPRITE_H = 40;
const BODY_H = 34;
export const HEIGHT_WORLD = 1.9;
export const DRAW_SCALE = 0.8;
const FRAME_COUNT = 6;
const LIFT_MAX = 6;

const COMMON = {
  shoeSole: "#e8dcc0",
  pedal: "#7c8090",
  frame: "#1b1b21",
  tread: "#262635",
  rimHi: "#989cab",
  tire: "#0e0e11",
  grip: "#33333b",
};

// Palettes. `top1`/`top2` = les rayures du haut (identiques = uni),
// `cap` = casquette (null : tête nue), `beard` = barbe sous la nuque.
export const PALETTES = {
  pmc: { hair: "#0d0d0f", hairHi: "#2a2a2e", skin: "#c98a5b", top1: "#f0ead9", top2: "#2f7a46", pants: "#3a3e4e", pantsLo: "#31353f", shoe: "#565a66", cap: null, beard: false },
  soberland: { hair: "#3a2415", hairHi: "#5a3a22", skin: "#d69a68", top1: "#b8402c", top2: "#2b2c33", pants: "#2b2c33", pantsLo: "#1f2026", shoe: "#f2ede2", cap: "#f2ede2", beard: true },
  potes: [
    { hair: "#6b4426", hairHi: "#8a5c36", skin: "#e0b083", top1: "#f4f1ea", top2: "#4a72c8", pants: "#3f63b4", pantsLo: "#31509a", shoe: "#e0742e", cap: null, beard: false },
    { hair: "#241609", hairHi: "#3d2a14", skin: "#8a5a33", top1: "#e13e26", top2: "#e13e26", pants: "#33353d", pantsLo: "#26282f", shoe: "#f2ede2", cap: "#0d0d10", beard: true },
    { hair: "#3a2415", hairHi: "#5a3a22", skin: "#c98a5b", top1: "#2f6d4a", top2: "#f2ede2", pants: "#c8963a", pantsLo: "#a87b2c", shoe: "#33353d", cap: null, beard: false },
    { hair: "#1c1108", hairHi: "#33241a", skin: "#6f4526", top1: "#c8963a", top2: "#33353d", pants: "#4a5260", pantsLo: "#3a414d", shoe: "#d8442c", cap: "#d8442c", beard: false },
    { hair: "#d8b25a", hairHi: "#eccb7c", skin: "#e8c39a", top1: "#8a3fd4", top2: "#f2ede2", pants: "#0d0d10", pantsLo: "#1a1a1e", shoe: "#ffffff", cap: null, beard: false },
    { hair: "#0d0d0f", hairHi: "#2a2a2e", skin: "#b07a4e", top1: "#ffcf2e", top2: "#0d0d10", pants: "#3a3e4e", pantsLo: "#31353f", shoe: "#ffcf2e", cap: "#ffffff", beard: true },
    { hair: "#8a3a1a", hairHi: "#a85630", skin: "#d69a68", top1: "#f2ede2", top2: "#e13e26", pants: "#2b2c33", pantsLo: "#1f2026", shoe: "#2b2c33", cap: null, beard: false },
  ],
};

function groundShadow(ctx, x, groundY, w, alpha = 0.3) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "#000000";
  ctx.beginPath();
  ctx.ellipse(x, groundY - w * 0.02, w * 0.24, w * 0.09, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function wheelEdge(ctx, cx, yTop, yBot, treadShift) {
  const w = 4;
  blk(ctx, cx - w / 2, yTop, w, yBot - yTop, COMMON.tire);
  for (let y = yTop + (treadShift % 5); y < yBot; y += 5) {
    blk(ctx, cx - w / 2, y, w, 1, COMMON.tread);
  }
  blk(ctx, cx - 1, yTop + 2, 2, yBot - yTop - 4, COMMON.rimHi);
}

function hair(ctx, cx, P) {
  blk(ctx, cx - 4, 1, 8, 3, P.hair);
  blk(ctx, cx - 6, 4, 12, 3, P.hair);
  blk(ctx, cx - 5, 7, 10, 2, P.hair);
  blk(ctx, cx - 7, 5, 3, 3, P.hairHi);
  blk(ctx, cx + 4, 6, 3, 3, P.hairHi);
  if (P.cap) {
    // Casquette vue de dos : calotte sur les boucles, visière qui dépasse à
    // peine sur les côtés (elle est devant, on n'en voit que les bords).
    blk(ctx, cx - 5, 0, 10, 4, P.cap);
    blk(ctx, cx - 6, 3, 12, 2, P.cap);
  }
}

function drawLeg(ctx, x, lift, swing, P) {
  blk(ctx, x + swing, 27 + Math.round((LIFT_MAX - lift) / 2), 5, 3, P.pants);
  blk(ctx, x + swing, 30 - lift, 4, 4, P.pantsLo);
  blk(ctx, x - 1 + swing, 33 - lift, 5, 2, P.shoe);
  blk(ctx, x - 1 + swing, 35 - lift, 5, 1, COMMON.shoeSole);
  blk(ctx, x - 2 + swing, 36 - lift, 7, 1, COMMON.pedal);
}

function draw(ctx, theta, frameIndex, P) {
  const liftL = Math.round(((1 + Math.cos(theta)) / 2) * LIFT_MAX);
  const liftR = LIFT_MAX - liftL;
  const swingL = liftL >= LIFT_MAX - 1 ? -1 : liftL <= 1 ? 1 : 0;
  const swingR = liftR >= LIFT_MAX - 1 ? 1 : liftR <= 1 ? -1 : 0;
  const sway = Math.round(Math.sin(theta));

  hair(ctx, 13 + sway, P);
  blk(ctx, 11 + sway, 9, 4, 2, P.skin); // nuque
  if (P.beard) blk(ctx, 9 + sway, 9, 8, 2, P.hair); // barbe qui dépasse des joues, vue de dos

  blk(ctx, 5 + sway, 11, 16, 3, P.top1);
  blk(ctx, 6 + sway, 14, 14, 3, P.top2);
  blk(ctx, 7 + sway, 17, 12, 3, P.top1);

  blk(ctx, 2, 13, 4, 3, P.top2);
  blk(ctx, 1, 16, 4, 3, COMMON.grip);
  blk(ctx, 20, 13, 4, 3, P.top2);
  blk(ctx, 21, 16, 4, 3, COMMON.grip);

  drawLeg(ctx, 7, liftL, swingL, P);
  drawLeg(ctx, 15, liftR, swingR, P);

  wheelEdge(ctx, 13, 23, 40, frameIndex);

  blk(ctx, 8, 20, 10, 4, P.top2);
  blk(ctx, 9, 24, 8, 5, P.pants);
}

function makeSprite(theta, frameIndex, P) {
  const c = document.createElement("canvas");
  c.width = SPRITE_W;
  c.height = SPRITE_H;
  const cctx = c.getContext("2d");
  cctx.imageSmoothingEnabled = false;
  draw(cctx, theta, frameIndex, P);
  return c;
}

const cache = new Map();

// Un « rider » = les 6 frames d'une palette + une fonction de rendu.
export function makeRider(palette) {
  if (cache.has(palette)) return cache.get(palette);
  const frames = Array.from({ length: FRAME_COUNT }, (_, k) =>
    makeSprite((k / FRAME_COUNT) * Math.PI * 2, k, palette)
  );
  const rider = {
    // Ancré par le bas (contact roue/sol) au point écran (x, groundY).
    render(ctx, x, groundY, pxPerWorldUnit, lean = 0, pedalPhase = 0, alpha = 1) {
      const scale = (HEIGHT_WORLD / BODY_H) * pxPerWorldUnit * DRAW_SCALE;
      const w = SPRITE_W * scale;
      const h = SPRITE_H * scale;
      const twoPi = Math.PI * 2;
      const normalized = ((pedalPhase % twoPi) + twoPi) % twoPi;
      const frameIndex = Math.floor((normalized / twoPi) * frames.length);
      const sprite = frames[frameIndex];
      if (alpha < 1) { ctx.save(); ctx.globalAlpha = alpha; }
      groundShadow(ctx, x, groundY, w, 0.3 * alpha);
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.translate(x, groundY);
      ctx.rotate(lean);
      ctx.drawImage(sprite, -w / 2, -h, w, h);
      ctx.restore();
      if (alpha < 1) ctx.restore();
    },
    // Ombre seule (pendant un saut, l'ombre reste au sol).
    shadow(ctx, x, groundY, pxPerWorldUnit, alpha = 1) {
      const scale = (HEIGHT_WORLD / BODY_H) * pxPerWorldUnit * DRAW_SCALE;
      groundShadow(ctx, x, groundY, SPRITE_W * scale, 0.3 * alpha);
    },
  };
  cache.set(palette, rider);
  return rider;
}
