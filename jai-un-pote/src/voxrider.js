// voxrider.js — Le cycliste en VRAIS cubes isométriques (retour du
// 4 septembre 2026 : « mon joueur, il faut le redessiner dans la logique, il
// va pas dans le bon sens »). Plus de sprite plat vu de dos : roues, cadre,
// jambes, torse rayé, tête, cheveux, casquette sont des boîtes posées dans
// le monde via iso.drawBox — donc orientées comme la route, comme les
// voitures, quelle que soit la projection. Palette par personnage
// (rider.js, PALETTES). Pédalage : les deux jambes montent et descendent en
// opposition, le buste tangue avec.

import { drawBox, drawShadow, depth } from "./iso.js";

const TIRE = "#151518", RIM = "#8a8d98", FRAME = "#1b1b21", SKIN_SHOE = "#565a66";

// Ancré au sol en (u, v) = centre du vélo. `lift` = hauteur de saut.
export function drawRider(ctx, u, v, lift, P, pedal, alpha = 1) {
  if (alpha < 1) { ctx.save(); ctx.globalAlpha = alpha; }
  const W = 0.36;              // largeur du vélo (u)
  const L = 1.15;              // longueur (v)
  drawShadow(ctx, u, v, 0.3, L / 2, 0.24);
  const x = u - W / 2, y = v - L / 2;
  const s = Math.sin(pedal), c = Math.cos(pedal);
  // Roues : deux boîtes fines le long de v.
  drawBox(ctx, x + W / 2 - 0.05, y + L - 0.5, 0.1, 0.5, 0.5, TIRE, lift);
  drawBox(ctx, x + W / 2 - 0.05, y, 0.1, 0.5, 0.5, TIRE, lift);
  drawBox(ctx, x + W / 2 - 0.03, y + L - 0.4, 0.06, 0.3, 0.3, RIM, lift + 0.1);
  drawBox(ctx, x + W / 2 - 0.03, y + 0.1, 0.06, 0.3, 0.3, RIM, lift + 0.1);
  // Cadre + selle + guidon.
  drawBox(ctx, x + W / 2 - 0.04, y + 0.3, 0.08, 0.6, 0.1, FRAME, lift + 0.4);
  drawBox(ctx, x + W / 2 - 0.05, y + 0.35, 0.1, 0.1, 0.35, FRAME, lift + 0.45);
  drawBox(ctx, x + W / 2 - 0.05, y + 0.85, 0.1, 0.1, 0.4, FRAME, lift + 0.45);
  drawBox(ctx, x - 0.08, y + 0.92, W + 0.16, 0.08, 0.08, "#33333b", lift + 0.85);
  drawBox(ctx, x + W / 2 - 0.12, y + 0.28, 0.24, 0.18, 0.08, P.pants, lift + 0.8);
  // Jambes : en opposition, autour du pédalier.
  const legL = 0.5 + 0.12 * s, legR = 0.5 - 0.12 * s;
  drawBox(ctx, x - 0.02, y + 0.42 + 0.06 * c, 0.14, 0.2, legL, P.pants, lift + 0.08 + 0.1 * (1 + s) / 2);
  drawBox(ctx, x + W - 0.12, y + 0.42 - 0.06 * c, 0.14, 0.2, legR, P.pants, lift + 0.08 + 0.1 * (1 - s) / 2);
  drawBox(ctx, x - 0.04, y + 0.46 + 0.06 * c, 0.16, 0.18, 0.1, P.shoe, lift + 0.08 + 0.1 * (1 + s) / 2);
  drawBox(ctx, x + W - 0.12, y + 0.46 - 0.06 * c, 0.16, 0.18, 0.1, P.shoe, lift + 0.08 + 0.1 * (1 - s) / 2);
  // Torse rayé, penché vers l'avant (guidon), tangue avec le pédalage.
  const sway = 0.03 * s;
  const tx = x - 0.06 + sway, ty = y + 0.36;
  drawBox(ctx, tx, ty, W + 0.12, 0.34, 0.17, P.top1, lift + 0.86);
  drawBox(ctx, tx, ty + 0.06, W + 0.12, 0.34, 0.17, P.top2, lift + 1.03);
  drawBox(ctx, tx, ty + 0.12, W + 0.12, 0.34, 0.17, P.top1, lift + 1.2);
  // Bras vers le guidon.
  drawBox(ctx, tx - 0.1, ty + 0.3, 0.12, 0.42, 0.1, P.top2, lift + 1.05);
  drawBox(ctx, tx + W + 0.1, ty + 0.3, 0.12, 0.42, 0.1, P.top2, lift + 1.05);
  // Tête, cheveux, casquette.
  const hx = x + W / 2 - 0.15 + sway, hy = y + 0.5;
  drawBox(ctx, hx, hy, 0.3, 0.3, 0.3, P.skin, lift + 1.37);
  drawBox(ctx, hx - 0.02, hy - 0.02, 0.34, 0.34, 0.14, P.hair, lift + 1.66);
  if (P.beard) drawBox(ctx, hx, hy + 0.22, 0.3, 0.1, 0.12, P.hair, lift + 1.37);
  if (P.cap) {
    drawBox(ctx, hx - 0.03, hy - 0.03, 0.36, 0.36, 0.1, P.cap, lift + 1.78);
    drawBox(ctx, hx, hy + 0.3, 0.3, 0.16, 0.05, P.cap, lift + 1.78);
  }
  if (alpha < 1) ctx.restore();
}

export const RIDER_HEIGHT = 1.9;
export function riderDepth(u, v) { return depth(u, v); }
