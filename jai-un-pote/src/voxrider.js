// voxrider.js — Le cycliste en VRAIS cubes isométriques (retour du
// 4 septembre 2026 : « mon joueur, il faut le redessiner dans la logique, il
// va pas dans le bon sens »). Plus de sprite plat vu de dos : roues, cadre,
// jambes, torse rayé, tête, cheveux, casquette sont des boîtes posées dans
// le monde via iso.drawBox — donc orientées comme la route, comme les
// voitures, quelle que soit la projection. Palette par personnage
// (rider.js, PALETTES). Pédalage : les deux jambes montent et descendent en
// opposition, le buste tangue avec.

import { drawBox, drawShadow, depth, project } from "./iso.js";

const TIRE = "#151518", RIM = "#8a8d98", FRAME = "#1b1b21", SKIN_SHOE = "#565a66";

// Ancré au sol en (u, v) = centre du vélo. `lift` = hauteur de saut.
// `flip` (0..2π) = angle du salto (double saut) : tout le vélo tourne
// autour de son axe latéral — le corps décrit un cercle vers l'avant.
export function drawRider(ctx, u, v, lift, P, pedal, alpha = 1, flip = 0, ombre = true) {
  if (alpha < 1) { ctx.save(); ctx.globalAlpha = alpha; }
  // L'ombre reste au sol, dessinée AVANT la rotation du salto (retour :
  // « tu as des ombres horribles » — elle tournait avec le vélo).
  if (ombre) drawShadow(ctx, u, v, 0.3, 0.575, 0.24);
  let spinning = false;
  if (flip > 0.01) {
    // Salto = le vélo ENTIER tourne à l'écran autour de son centre (6
    // septembre 2026 : « il faut que ce soit vraiment visible » — l'ancienne
    // version déplaçait les cubes sur un cercle, ça ne se lisait pas).
    const c = project(u, v, lift + 0.9);
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(flip);
    ctx.translate(-c.x, -c.y);
    spinning = true;
  }
  const W = 0.36;              // largeur du vélo (u)
  const L = 1.15;              // longueur (v)
  const x = u - W / 2, y = v - L / 2;
  const s = Math.sin(pedal), c = Math.cos(pedal);
  const grandBi = P.velo === "grandbi";
  if (grandBi) {
    // GRAND BI : grande roue avant (0,9), petite roue arrière (0,3), le
    // cycliste perché 0,4 plus haut — il se voit de loin.
    drawBox(ctx, x + W / 2 - 0.05, y + L - 0.95, 0.1, 0.95, 0.95, TIRE, lift);
    drawBox(ctx, x + W / 2 - 0.05, y, 0.1, 0.32, 0.32, TIRE, lift);
    drawBox(ctx, x + W / 2 - 0.03, y + L - 0.8, 0.06, 0.65, 0.65, RIM, lift + 0.15);
    lift += 0.4;
  } else {
    // Roues : deux boîtes fines le long de v.
    drawBox(ctx, x + W / 2 - 0.05, y + L - 0.5, 0.1, 0.5, 0.5, TIRE, lift);
    drawBox(ctx, x + W / 2 - 0.05, y, 0.1, 0.5, 0.5, TIRE, lift);
    drawBox(ctx, x + W / 2 - 0.03, y + L - 0.4, 0.06, 0.3, 0.3, RIM, lift + 0.1);
    drawBox(ctx, x + W / 2 - 0.03, y + 0.1, 0.06, 0.3, 0.3, RIM, lift + 0.1);
  }
  // Cadre + selle + guidon.
  drawBox(ctx, x + W / 2 - 0.04, y + 0.3, 0.08, 0.6, 0.1, FRAME, lift + 0.4);
  drawBox(ctx, x + W / 2 - 0.05, y + 0.35, 0.1, 0.1, 0.35, FRAME, lift + 0.45);
  drawBox(ctx, x + W / 2 - 0.05, y + 0.85, 0.1, 0.1, 0.4, FRAME, lift + 0.45);
  drawBox(ctx, x - 0.08, y + 0.92, W + 0.16, 0.08, 0.08, "#33333b", lift + 0.85);
  drawBox(ctx, x + W / 2 - 0.12, y + 0.28, 0.24, 0.18, 0.08, P.pants, lift + 0.8);
  // Jambes : en opposition, autour du pédalier. Le pied décrit un cercle
  // dans le SENS DE LA MARCHE (7 septembre 2026, « j'ai l'impression de
  // pédaler à l'envers ») : en haut il part vers l'AVANT (+v), puis descend —
  // hauteur ~ cos, avance ~ sin.
  const legL = 0.5 + 0.12 * c, legR = 0.5 - 0.12 * c;
  const hL = lift + 0.08 + 0.1 * (1 + c) / 2, hR = lift + 0.08 + 0.1 * (1 - c) / 2;
  drawBox(ctx, x - 0.02, y + 0.42 + 0.06 * s, 0.14, 0.2, legL, P.pants, hL);
  drawBox(ctx, x + W - 0.12, y + 0.42 - 0.06 * s, 0.14, 0.2, legR, P.pants, hR);
  drawBox(ctx, x - 0.04, y + 0.46 + 0.06 * s, 0.16, 0.18, 0.1, P.shoe, hL);
  drawBox(ctx, x + W - 0.12, y + 0.46 - 0.06 * s, 0.16, 0.18, 0.1, P.shoe, hR);
  // Torse rayé, penché vers l'avant (guidon), tangue avec le pédalage.
  const sway = 0.03 * s;
  const tx = x - 0.06 + sway, ty = y + 0.36;
  if (P.motif === "carreaux") {
    // Carreaux : chaque tranche coupée en deux, couleurs alternées.
    const hw = (W + 0.12) / 2;
    drawBox(ctx, tx, ty, hw, 0.34, 0.17, P.top1, lift + 0.86); drawBox(ctx, tx + hw, ty, hw, 0.34, 0.17, P.top2, lift + 0.86);
    drawBox(ctx, tx, ty + 0.06, hw, 0.34, 0.17, P.top2, lift + 1.03); drawBox(ctx, tx + hw, ty + 0.06, hw, 0.34, 0.17, P.top1, lift + 1.03);
    drawBox(ctx, tx, ty + 0.12, hw, 0.34, 0.17, P.top1, lift + 1.2); drawBox(ctx, tx + hw, ty + 0.12, hw, 0.34, 0.17, P.top2, lift + 1.2);
  } else {
    drawBox(ctx, tx, ty, W + 0.12, 0.34, 0.17, P.top1, lift + 0.86);
    drawBox(ctx, tx, ty + 0.06, W + 0.12, 0.34, 0.17, P.top2, lift + 1.03);
    drawBox(ctx, tx, ty + 0.12, W + 0.12, 0.34, 0.17, P.top1, lift + 1.2);
  }
  // Bras vers le guidon.
  drawBox(ctx, tx - 0.1, ty + 0.3, 0.12, 0.42, 0.1, P.top2, lift + 1.05);
  drawBox(ctx, tx + W + 0.1, ty + 0.3, 0.12, 0.42, 0.1, P.top2, lift + 1.05);
  // Tête, cheveux, casquette.
  const hx = x + W / 2 - 0.15 + sway, hy = y + 0.5;
  drawBox(ctx, hx, hy, 0.3, 0.3, 0.3, P.skin, lift + 1.37);
  drawBox(ctx, hx - 0.02, hy - 0.02, 0.34, 0.34, 0.14, P.hair, lift + 1.66);
  if (P.beard) drawBox(ctx, hx, hy + 0.22, 0.3, 0.1, 0.12, P.hair, lift + 1.37);
  const hat = P.hat !== undefined ? P.hat : (P.cap ? "casquette" : null);
  const hatColor = P.hatColor || P.cap;
  if (hat === "casquette") {
    drawBox(ctx, hx - 0.03, hy - 0.03, 0.36, 0.36, 0.1, hatColor, lift + 1.78);
    drawBox(ctx, hx, hy + 0.3, 0.3, 0.16, 0.05, hatColor, lift + 1.78);
  } else if (hat === "bob") {
    drawBox(ctx, hx - 0.02, hy - 0.02, 0.34, 0.34, 0.16, hatColor, lift + 1.74);
    drawBox(ctx, hx - 0.1, hy - 0.1, 0.5, 0.5, 0.05, hatColor, lift + 1.74);
  } else if (hat === "paille") {
    drawBox(ctx, hx - 0.01, hy - 0.01, 0.32, 0.32, 0.14, hatColor, lift + 1.76);
    drawBox(ctx, hx - 0.16, hy - 0.16, 0.62, 0.62, 0.04, hatColor, lift + 1.76);
    drawBox(ctx, hx - 0.01, hy - 0.01, 0.32, 0.32, 0.04, "#8a3a1a", lift + 1.84);
  }
  if (spinning) ctx.restore();
  if (alpha < 1) ctx.restore();
}

export const RIDER_HEIGHT = 1.9;
export function riderDepth(u, v) { return depth(u, v); }
