// friends.js — Le peloton, version Crossy Road : les potes roulent DERRIÈRE
// le joueur en serpent, chacun 1,15 rangée derrière le précédent, et suivent
// sa TRACE (ils changent de colonne là où lui l'a fait). Ils sautent là où il
// a sauté. Chacun a sa propre collision (rows.checkMember) : une poule qui
// traverse derrière toi peut emporter le dernier de la file.
// Arrivée : il tombe du ciel sur sa place. Départ : éjecté sur le côté.

import { colU, project, scale } from "./iso.js";
import { makeRider, PALETTES, HEIGHT_WORLD, DRAW_SCALE } from "./rider.js";

export const SPACING = 1.15;
const ARRIVAL_S = 0.9;
const LEAVE_S = 0.7;
const DROP_HEIGHT = 9;

let potes = [];
let maxCount = 0;
let nextPalette = 0;
// Trace du joueur : échantillons (v, u) tous les 0,25 v, + marques de saut.
let trail = [];
let jumpMarks = [];

export function reset() { potes = []; maxCount = 0; nextPalette = 0; trail = []; jumpMarks = []; }
export function alive() { return potes.filter((p) => !p.leave); }
export function count() { return alive().length; }
export function maxReached() { return maxCount; }
export function max() { return window.CONFIG.potesMax; }

export function recordPlayer(u, v, jumped) {
  const last = trail[trail.length - 1];
  if (!last || v - last.v >= 0.25) trail.push({ v, u });
  if (jumped) jumpMarks.push(v);
  // On ne garde que ce qui sert encore : derrière le dernier pote.
  const minV = v - (max() + 1) * SPACING - 1;
  while (trail.length > 2 && trail[1].v < minV) trail.shift();
  jumpMarks = jumpMarks.filter((m) => m > minV);
}

function trailU(v) {
  if (!trail.length) return 0;
  if (v <= trail[0].v) return trail[0].u;
  for (let i = trail.length - 1; i >= 0; i--) {
    if (trail[i].v <= v) {
      const a = trail[i], b = trail[i + 1];
      if (!b) return a.u;
      const t = (v - a.v) / Math.max(1e-6, b.v - a.v);
      return a.u + (b.u - a.u) * t;
    }
  }
  return trail[trail.length - 1].u;
}

export function join() {
  const vivants = alive();
  if (vivants.length >= max()) return null;
  const used = new Set(vivants.map((p) => p.slot));
  let slot = 0;
  while (used.has(slot)) slot++;
  let name = null, palette;
  if (maxCount === 0 && nextPalette === 0) { name = "soberland"; palette = PALETTES.soberland; }
  else palette = PALETTES.potes[nextPalette % PALETTES.potes.length];
  nextPalette += 1;
  const pote = { slot, rider: makeRider(palette), name, arrive: 0, leave: null, pedal: Math.random() * 6, jumpY: 0, jumpVy: 0, lastMark: -Infinity, u: 0, v: 0 };
  potes.push(pote);
  maxCount = Math.max(maxCount, vivants.length + 1);
  return pote;
}

export function lose(n) {
  const vivants = alive().sort((a, b) => b.slot - a.slot);
  const perdus = vivants.slice(0, n);
  for (const p of perdus) p.leave = { t: 0, dir: p.u >= 0 ? 1 : -1 };
  return perdus;
}
export function loseOne(pote) {
  if (!pote.leave) pote.leave = { t: 0, dir: pote.u >= 0 ? 1 : -1 };
}

// Position et physique de chaque pote. `playerV` = avance du joueur,
// jumpPhysics = {vJump, g} identique au joueur.
export function update(dt, playerV, phys) {
  // Les places se resserrent quand un pote part : slot = rang dans la file.
  const vivants = alive().sort((a, b) => a.slot - b.slot);
  vivants.forEach((p, i) => { p.slot = i; });
  for (const p of potes) {
    if (p.arrive < 1) p.arrive = Math.min(1, p.arrive + dt / ARRIVAL_S);
    if (p.leave) p.leave.t += dt / LEAVE_S;
    p.v = playerV - (p.slot + 1) * SPACING;
    p.u = trailU(p.v);
    // Saute là où le joueur a sauté.
    if (!p.leave && p.arrive >= 1) {
      const mark = jumpMarks.find((m) => m > p.lastMark && m <= p.v);
      if (mark !== undefined && p.jumpY <= 0) { p.jumpVy = phys.vJump; p.jumpY = 0.001; p.lastMark = mark; }
      if (p.jumpY > 0) { p.jumpVy -= phys.g * dt; p.jumpY += p.jumpVy * dt; if (p.jumpY <= 0) { p.jumpY = 0; p.jumpVy = 0; } }
    }
  }
  potes = potes.filter((p) => !p.leave || p.leave.t < 1);
}

// Membres à tester pour les collisions : posés, pas en train de partir.
export function members() {
  return alive().filter((p) => p.arrive >= 1).map((p) => ({ id: `p${p.slot}`, u: p.u, v: p.v, airborne: p.jumpY > 0.25, pote: p }));
}

// Éléments à peindre, avec leur rangée (tri du peintre dans main.js).
export function drawables(ctx, pedalPhase) {
  const out = [];
  for (const p of potes) {
    let u = p.u, y = p.jumpY, alpha = 1;
    if (p.arrive < 1) {
      const t = p.arrive;
      y += (1 - t) * (1 - t) * DROP_HEIGHT + (t > 0.82 ? Math.sin(((t - 0.82) / 0.18) * Math.PI) * 0.3 : 0);
    }
    if (p.leave) {
      const t = p.leave.t;
      u += p.leave.dir * t * 4;
      y += Math.sin(Math.min(1, t) * Math.PI) * 1.6;
      alpha = 1 - t;
    }
    out.push({
      v: p.v, draw: () => {
        const g = project(u, p.v, 0);
        const K = scale();
        if (y > 0.05) p.rider.shadow(ctx, g.x, g.y, K * 0.86, alpha);
        p.rider.render(ctx, g.x, g.y - y * K * 0.86, K * 0.86, 0, pedalPhase + p.pedal, alpha);
        if (p.name && p.arrive >= 1 && !p.leave) {
          ctx.save();
          ctx.font = `700 11px "Stage Grotesk", system-ui, sans-serif`;
          ctx.textAlign = "center"; ctx.textBaseline = "bottom";
          ctx.shadowColor = "rgba(0,0,0,0.6)"; ctx.shadowBlur = 6;
          ctx.fillStyle = "#fff";
          ctx.fillText(`@${p.name}`, g.x, g.y - y * K * 0.86 - HEIGHT_WORLD * DRAW_SCALE * K * 0.86 * 1.12);
          ctx.restore();
        }
      },
    });
  }
  return out;
}
