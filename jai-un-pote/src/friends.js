// friends.js — Le peloton en FILE INDIENNE (retour du 6 septembre 2026 :
// « il faudrait que les potes soient derrière moi comme un peloton [...] il
// faut qu'ils passent exactement dans la même voie que moi »). Chaque pote
// roule SPACING rangées derrière le précédent et suit la TRACE du joueur :
// il change de voie là où lui l'a fait, il saute là où lui a sauté. Il
// arrive en roulant depuis le champ, sur le côté, et repart éjecté quand le
// joueur perd des potes. Les potes ne prennent aucun dégât eux-mêmes.

import { project, ROAD_HALF } from "./iso.js";
import { PALETTES } from "./rider.js";
import { drawRider, RIDER_HEIGHT } from "./voxrider.js";

export const SPACING = 0.95;
const LEAVE_S = 0.7;
const ARRIVAL_S = 1.1;

let potes = [];
let maxCount = 0;
let nextPalette = 0;
let trail = [];      // { v, u } échantillons du joueur, tous les 0,2 v
let jumpMarks = [];  // v où le joueur a sauté

export function reset() { potes = []; maxCount = 0; nextPalette = 0; trail = []; jumpMarks = []; }
export function alive() { return potes.filter((p) => !p.leave); }
export function count() { return alive().length; }
export function maxReached() { return maxCount; }
export function max() { return window.CONFIG.potesMax; }

export function recordPlayer(u, v, jumped) {
  const last = trail[trail.length - 1];
  if (!last || v - last.v >= 0.2) trail.push({ v, u });
  if (jumped) jumpMarks.push(v);
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

export function join(player) {
  const vivants = alive();
  if (vivants.length >= max()) return null;
  const slot = vivants.length;
  const noms = window.CONFIG.potesNoms || ["soberland"];
  const name = noms[nextPalette % noms.length];
  const palette = nextPalette === 0 ? PALETTES.soberland : PALETTES.potes[(nextPalette - 1) % PALETTES.potes.length];
  nextPalette += 1;
  const side = slot % 2 ? 1 : -1;
  const pote = {
    slot, palette, name,
    u: side * (ROAD_HALF + 3.2), v: player.v - (slot + 1) * SPACING,
    arrive: 0, leave: null, pedal: Math.random() * 6,
    jumpY: 0, jumpVy: 0, lastMark: -Infinity,
  };
  potes.push(pote);
  maxCount = Math.max(maxCount, vivants.length + 1);
  return pote;
}

// Les derniers de la file partent en premier.
export function lose(n) {
  const vivants = alive().sort((a, b) => b.slot - a.slot);
  const perdus = vivants.slice(0, n);
  for (const p of perdus) p.leave = { t: 0, dir: p.u >= 0 ? 1 : -1 };
  return perdus;
}

export function update(dt, player, phys) {
  const vivants = alive().sort((a, b) => a.slot - b.slot);
  vivants.forEach((p, i) => { p.slot = i; });
  for (const p of potes) {
    if (p.leave) { p.leave.t += dt / LEAVE_S; continue; }
    p.v = player.v - (p.slot + 1) * SPACING;
    const cible = trailU(p.v);
    if (p.arrive < 1) {
      // Depuis le champ : glisse vers la trace, puis y reste collé.
      p.arrive = Math.min(1, p.arrive + dt / ARRIVAL_S);
      p.u += (cible - p.u) * Math.min(1, 3.2 * dt);
    } else {
      p.u = cible;
    }
    if (p.arrive >= 1) {
      const mark = jumpMarks.find((m) => m > p.lastMark && m <= p.v);
      if (mark !== undefined && p.jumpY <= 0) { p.jumpVy = phys.vJump; p.jumpY = 0.001; p.lastMark = mark; }
    }
    if (p.jumpY > 0) { p.jumpVy -= phys.g * dt; p.jumpY += p.jumpVy * dt; if (p.jumpY <= 0) { p.jumpY = 0; p.jumpVy = 0; } }
  }
  potes = potes.filter((p) => !p.leave || p.leave.t < 1);
}

// Potes sur la route : ils ramassent les pièces qu'ils croisent (aucun dégât).
export function members() {
  return alive().filter((p) => p.arrive >= 1).map((p) => ({ id: `p${p.slot}`, u: p.u, v: p.v, pote: p }));
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
        drawRider(ctx, u, p.v, y, p.palette, pedalPhase + p.pedal, alpha);
        if (p.name && p.arrive >= 1 && !p.leave) {
          const g = project(u, p.v, y + RIDER_HEIGHT + 0.15);
          ctx.save();
          ctx.font = `700 11px "Stage Grotesk", system-ui, sans-serif`;
          ctx.textAlign = "center"; ctx.textBaseline = "bottom";
          ctx.shadowColor = "rgba(0,0,0,0.6)"; ctx.shadowBlur = 6;
          ctx.fillStyle = "#fff";
          ctx.fillText(`@${p.name}`, g.x, g.y);
          ctx.restore();
        }
      },
    });
  }
  return out;
}
