// friends.js — Le peloton. Chaque pote gagné roule DEVANT le joueur (plus loin
// sur la route, donc plus petit, visible au-dessus de lui) sur une des trois
// colonnes de la chaussée. Ils sautent avec lui. Un obstacle touché en
// enlève `cout` — les derniers arrivés partent en premier ; le joueur est le
// dernier à tomber (main.js).
//
// Arrivée : le pote TOMBE DU CIEL et atterrit dans le peloton (demandé :
// « il faut qu'ils tombent un peu du ciel »). Départ : éjecté sur le côté.

import { project, PLAYER_NEAR_Z, colX } from "./road.js";
import { makeRider, PALETTES, HEIGHT_WORLD, DRAW_SCALE } from "./rider.js";

const FORMATION = [
  { col: -1, dz: 2.4 }, { col: 1, dz: 2.4 },
  { col: 0, dz: 4.2 },
  { col: -1, dz: 6.0 }, { col: 1, dz: 6.0 },
  { col: 0, dz: 7.8 },
  { col: -1, dz: 9.6 }, { col: 1, dz: 9.6 },
];

const ARRIVAL_S = 0.9;
const LEAVE_S = 0.75;
const DROP_HEIGHT = 14; // unités-monde au-dessus de la route au départ de la chute

let potes = [];
let maxCount = 0;
let nextPalette = 0;

export function reset() {
  potes = [];
  maxCount = 0;
  nextPalette = 0;
}

export function alive() { return potes.filter((p) => !p.leave); }
export function count() { return alive().length; }
export function maxReached() { return maxCount; }
export function max() { return window.CONFIG.potesMax; }

// Le premier pote est Soberland (le pote de l'EP), les suivants tournent
// sur les palettes génériques.
export function join() {
  const vivants = alive();
  if (vivants.length >= max()) return null;
  const used = new Set(vivants.map((p) => p.slot));
  const slot = FORMATION.findIndex((_, i) => !used.has(i));
  if (slot < 0) return null;
  let name, palette;
  if (maxCount === 0 && nextPalette === 0) {
    name = "soberland";
    palette = PALETTES.soberland;
  } else {
    palette = PALETTES.potes[nextPalette % PALETTES.potes.length];
    name = null;
  }
  nextPalette += 1;
  const pote = { slot, rider: makeRider(palette), name, arrive: 0, leave: null, pedal: Math.random() * 6 };
  potes.push(pote);
  maxCount = Math.max(maxCount, vivants.length + 1);
  return pote;
}

// Enlève jusqu'à n potes, les derniers arrivés d'abord. Renvoie les perdus.
export function lose(n) {
  const vivants = alive().sort((a, b) => b.slot - a.slot);
  const perdus = vivants.slice(0, n);
  for (const p of perdus) p.leave = { t: 0, dir: FORMATION[p.slot].col || (Math.random() < 0.5 ? -1 : 1) };
  return perdus;
}

// Colonnes occupées : le joueur (0) toujours, plus celles des potes posés.
export function occupiedCols() {
  const s = new Set([0]);
  for (const p of alive()) if (p.arrive >= 0.85) s.add(FORMATION[p.slot].col);
  return s;
}

export function update(dt) {
  for (const p of potes) {
    if (p.arrive < 1) p.arrive = Math.min(1, p.arrive + dt / ARRIVAL_S);
    if (p.leave) p.leave.t += dt / LEAVE_S;
  }
  potes = potes.filter((p) => !p.leave || p.leave.t < 1);
}

// Éléments à peindre, au format `extras` (z + draw), à trier avec le reste.
export function extras(ctx, width, height, jumpY, pedalPhase, lean) {
  const out = [];
  for (const p of potes) {
    const f = FORMATION[p.slot];
    const z = PLAYER_NEAR_Z + f.dz;
    let x = colX(f.col);
    let y = jumpY;
    let alpha = 1;
    if (p.arrive < 1) {
      // Chute : hauteur qui décroît en accélérant, petit rebond à l'arrivée.
      const t = p.arrive;
      const fall = (1 - t) * (1 - t) * DROP_HEIGHT;
      const bounce = t > 0.82 ? Math.sin(((t - 0.82) / 0.18) * Math.PI) * 0.35 : 0;
      y = jumpY + fall + bounce;
    }
    if (p.leave) {
      const t = p.leave.t;
      x += p.leave.dir * t * 7;
      y = jumpY + Math.sin(Math.min(1, t) * Math.PI) * 2.2 - t * t * 1.5;
      alpha = 1 - t;
    }
    out.push({
      z,
      draw: () => {
        const g = project(x, z, width, height);
        if (y > 0.05) p.rider.shadow(ctx, g.x, g.y, g.scale, alpha);
        p.rider.render(ctx, g.x, g.y - y * g.scale, g.scale, lean * 0.5, pedalPhase + p.pedal, alpha);
        if (p.name && p.arrive >= 1 && !p.leave) {
          const top = g.y - y * g.scale - HEIGHT_WORLD * DRAW_SCALE * g.scale * 1.18;
          ctx.save();
          ctx.font = `700 ${Math.max(9, Math.min(13, g.scale * 0.45))}px "Stage Grotesk", system-ui, sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "bottom";
          ctx.shadowColor = "rgba(0,0,0,0.6)";
          ctx.shadowBlur = 6;
          ctx.fillStyle = "#ffffff";
          ctx.fillText(`@${p.name}`, g.x, top);
          ctx.restore();
        }
      },
    });
  }
  return out;
}
