// friends.js — Le peloton, version « horde » (retour du 4 septembre 2026 :
// « il faut que les copains se déplacent avec nous et qu'ils tournent un peu
// autour », « l'ami arrive d'un champ sur le côté »). Chaque pote a une place
// AUTOUR du joueur (à côté, juste derrière) qu'il rejoint en douceur et
// autour de laquelle il ondule ; il arrive en roulant depuis le champ, sur
// le côté, et repart éjecté quand il est touché. Il saute quand le joueur
// saute, avec un petit décalage selon sa place.

import { colU, project, scale, ROAD_HALF } from "./iso.js";
import { makeRider, PALETTES, HEIGHT_WORLD, DRAW_SCALE } from "./rider.js";

// Places autour du joueur : (décalage latéral, décalage d'avance).
const SLOTS = [
  { u: -1.15, v: -0.9 }, { u: 1.15, v: -0.9 },
  { u: 0, v: -1.7 },
  { u: -1.15, v: -2.5 }, { u: 1.15, v: -2.5 },
  { u: 0, v: -3.3 },
  { u: -1.15, v: -4.1 }, { u: 1.15, v: -4.1 },
];
const U_LIMIT = ROAD_HALF - 0.35;
const FOLLOW = 5.5;      // vitesse de rattrapage latéral (1/s)
const LEAVE_S = 0.7;

let potes = [];
let maxCount = 0;
let nextPalette = 0;

export function reset() { potes = []; maxCount = 0; nextPalette = 0; }
export function alive() { return potes.filter((p) => !p.leave); }
export function count() { return alive().length; }
export function maxReached() { return maxCount; }
export function max() { return window.CONFIG.potesMax; }

export function join(player) {
  const vivants = alive();
  if (vivants.length >= max()) return null;
  const used = new Set(vivants.map((p) => p.slot));
  let slot = 0;
  while (used.has(slot)) slot++;
  let name = null, palette;
  if (maxCount === 0 && nextPalette === 0) { name = "soberland"; palette = PALETTES.soberland; }
  else palette = PALETTES.potes[nextPalette % PALETTES.potes.length];
  nextPalette += 1;
  // Arrive depuis le champ, du côté de sa place.
  const side = SLOTS[slot].u < 0 ? -1 : SLOTS[slot].u > 0 ? 1 : (slot % 2 ? 1 : -1);
  const pote = {
    slot, rider: makeRider(palette), name,
    u: side * (ROAD_HALF + 3.2), v: player.v + SLOTS[slot].v - 0.5,
    arrive: 0, leave: null, pedal: Math.random() * 6, phase: Math.random() * 6.28,
    jumpY: 0, jumpVy: 0, jumpDelay: -1,
  };
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
export function loseOne(pote) { if (!pote.leave) pote.leave = { t: 0, dir: pote.u >= 0 ? 1 : -1 }; }

// Le joueur vient de sauter : chacun suit, décalé selon sa place.
export function onPlayerJump() {
  for (const p of alive()) if (p.arrive >= 1 && p.jumpY <= 0) p.jumpDelay = Math.abs(SLOTS[p.slot].v) * 0.08;
}

export function update(dt, player, phys, t) {
  const vivants = alive().sort((a, b) => a.slot - b.slot);
  vivants.forEach((p, i) => { p.slot = i; });
  for (const p of potes) {
    const s = SLOTS[p.slot];
    if (p.leave) {
      p.leave.t += dt / LEAVE_S;
      continue;
    }
    // Ondulation autour de la place : « ils tournent un peu autour ».
    const wu = Math.sin(t * 1.4 + p.phase) * 0.22, wv = Math.sin(t * 1.1 + p.phase * 1.7) * 0.18;
    const targetU = Math.max(-U_LIMIT, Math.min(U_LIMIT, player.u + s.u)) + wu;
    const targetV = player.v + s.v + wv;
    const k = Math.min(1, (p.arrive < 1 ? 2.2 : FOLLOW) * dt);
    p.u += (targetU - p.u) * k;
    p.v += (targetV - p.v) * Math.min(1, 9 * dt);
    if (p.arrive < 1) {
      p.arrive = Math.min(1, p.arrive + dt / 1.1);
    }
    if (p.jumpDelay >= 0) { p.jumpDelay -= dt; if (p.jumpDelay < 0) { p.jumpVy = phys.vJump; p.jumpY = 0.001; } }
    if (p.jumpY > 0) { p.jumpVy -= phys.g * dt; p.jumpY += p.jumpVy * dt; if (p.jumpY <= 0) { p.jumpY = 0; p.jumpVy = 0; } }
  }
  potes = potes.filter((p) => !p.leave || p.leave.t < 1);
}

// Membres à tester en collision : arrivés sur la route, pas en train de partir.
export function members() {
  return alive().filter((p) => p.arrive >= 1 && Math.abs(p.u) <= ROAD_HALF).map((p) => ({ id: `p${p.slot}`, u: p.u, v: p.v, airborne: p.jumpY > 0.25, pote: p }));
}

export function drawables(ctx, pedalPhase) {
  const out = [];
  for (const p of potes) {
    let u = p.u, y = p.jumpY, alpha = 1;
    if (p.leave) {
      const t = p.leave.t;
      u += p.leave.dir * t * 4;
      y += Math.sin(Math.min(1, t) * Math.PI) * 1.6;
      alpha = 1 - t;
    }
    out.push({
      u, v: p.v, draw: () => {
        const g = project(u, p.v, 0);
        const K = scale();
        if (y > 0.05) p.rider.shadow(ctx, g.x, g.y, K * 0.95, alpha);
        p.rider.render(ctx, g.x, g.y - y * K * 0.95, K * 0.95, 0, pedalPhase + p.pedal, alpha);
        if (p.name && p.arrive >= 1 && !p.leave) {
          ctx.save();
          ctx.font = `700 11px "Stage Grotesk", system-ui, sans-serif`;
          ctx.textAlign = "center"; ctx.textBaseline = "bottom";
          ctx.shadowColor = "rgba(0,0,0,0.6)"; ctx.shadowBlur = 6;
          ctx.fillStyle = "#fff";
          ctx.fillText(`@${p.name}`, g.x, g.y - y * K * 0.95 - HEIGHT_WORLD * DRAW_SCALE * K * 0.95 * 1.12);
          ctx.restore();
        }
      },
    });
  }
  return out;
}
