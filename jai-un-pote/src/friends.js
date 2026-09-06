// friends.js — Le peloton derrière le joueur (7 septembre 2026 : « ce qui
// serait dingue, c'est qu'ils ne soient pas assignés à une seule ligne mais
// qu'ils naviguent entre les lignes, et qu'ils réussissent TOUJOURS à éviter
// les objets »). Chaque pote roule SPACING rangées derrière le précédent,
// choisit sa propre voie : il se balade d'une voie à l'autre quand c'est
// libre, et change TOUJOURS de voie avant un obstacle posé, une flaque de
// boue ou une voiture garée. Il saute là où le joueur a sauté (pour le
// plaisir des yeux). Les potes ne prennent aucun dégât ; ils ramassent les
// pièces qu'ils croisent.

import { project, ROAD_HALF, COLS, colU } from "./iso.js";
import * as rows from "./rows.js";
import { PALETTES } from "./rider.js";
import { drawRider, RIDER_HEIGHT } from "./voxrider.js";

export const SPACING = 1.5;   // 0,95 → 1,5 (« beaucoup trop serré derrière moi, ça gêne la vue »)
const LEAVE_S = 0.7;
const ARRIVAL_S = 1.1;
const LANE_TWEEN = 7;
const LOOK_AHEAD = 3;   // rangées regardées devant pour éviter

let potes = [];
let maxCount = 0;
let joins = 0;
let jumpMarks = [];

export function reset() { potes = []; maxCount = 0; joins = 0; jumpMarks = []; }
export function alive() { return potes.filter((p) => !p.leave); }
export function count() { return alive().length; }
export function maxReached() { return maxCount; }
// En ligue, le peloton c'est LES MEMBRES de la ligue, rien d'autre (7 septembre
// 2026 : « c'est plus Soberland etc., juste les gens qui font partie de la
// ligue, donc le nombre de potes = le nombre de personnes dans la ligue »).
export function max() { return nomsLigue ? nomsLigue.length : window.CONFIG.potesMax; }

export function recordPlayer(u, v, jumped) {
  if (jumped) jumpMarks.push(v);
  const minV = v - (max() + 1) * SPACING - 1;
  jumpMarks = jumpMarks.filter((m) => m > minV);
}

// Les potes portent les pseudos de la LIGUE quand il y en a une (les autres
// membres, dans l'ordre d'arrivée), complétés par les prénoms par défaut.
let nomsLigue = null;
export function setNomsLigue(liste) { nomsLigue = Array.isArray(liste) ? liste : null; }
export function enLigue() { return nomsLigue !== null; }
function listeNoms() { return nomsLigue || window.CONFIG.potesNoms || ["soberland"]; }
// Prénom : le premier de la liste qui n'est pas déjà dans le peloton
// (Soberland revient en premier s'il est parti — plus de doublons).
function prochainNom() {
  const noms = listeNoms();
  const pris = new Set(alive().map((p) => p.name));
  return noms.find((n) => !pris.has(n)) || null;
}

export function join(player) {
  const vivants = alive();
  if (vivants.length >= max()) return null;
  const slot = vivants.length;
  const name = prochainNom();
  if (!name) return null;
  const idx = Math.max(0, listeNoms().indexOf(name));
  const palette = name === "soberland" ? PALETTES.soberland : PALETTES.potes[idx % PALETTES.potes.length];
  joins += 1;
  const side = slot % 2 ? 1 : -1;
  const pote = {
    slot, palette, name,
    col: player.col, u: side * (ROAD_HALF + 3.2), v: player.v - (slot + 1) * SPACING,
    arrive: 0, leave: null, pedal: Math.random() * 6,
    jumpY: 0, jumpVy: 0, lastMark: -Infinity, balade: 1 + Math.random() * 2.5,
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

// Voies bloquées sur les LOOK_AHEAD prochaines rangées : obstacle posé,
// boue, voiture garée. Les traversants ne comptent pas (les potes ne
// prennent pas de dégât, et un tracteur est imprévisible pour eux).
function voiesBloquees(v) {
  const r0 = Math.floor(v + 0.5);
  const bloc = new Set();
  for (let r = Math.max(0, r0); r <= r0 + LOOK_AHEAD; r++) {
    const row = rows.rowAt(r);
    if (row.type === "statique") for (const c of row.cols) bloc.add(c);
    if (row.boue !== null && row.boue !== undefined) bloc.add(row.boue);
  }
  return bloc;
}

function choisirVoie(p, bloc, forcer) {
  if (!forcer && !bloc.has(p.col)) return p.col;
  // Voisines d'abord, puis n'importe quelle voie libre.
  const cands = [p.col - 1, p.col + 1, 0, 1, 2].filter((c) => c >= 0 && c < COLS && c !== p.col && !bloc.has(c));
  if (!cands.length) return p.col;
  return cands[Math.floor(Math.random() * Math.min(2, cands.length))];
}

export function update(dt, player, phys) {
  const vivants = alive().sort((a, b) => a.slot - b.slot);
  vivants.forEach((p, i) => { p.slot = i; });
  for (const p of potes) {
    if (p.leave) { p.leave.t += dt / LEAVE_S; continue; }
    p.v = player.v - (p.slot + 1) * SPACING;
    if (p.arrive < 1) {
      p.arrive = Math.min(1, p.arrive + dt / ARRIVAL_S);
      p.u += (colU(p.col) - p.u) * Math.min(1, 3.2 * dt);
      continue;
    }
    const bloc = voiesBloquees(p.v);
    if (bloc.has(p.col)) {
      p.col = choisirVoie(p, bloc, true);
      p.balade = 1.5 + Math.random() * 2;
    } else {
      p.balade -= dt;
      if (p.balade <= 0) { p.col = choisirVoie(p, bloc, true); p.balade = 1.5 + Math.random() * 3; }
    }
    p.u += (colU(p.col) - p.u) * Math.min(1, LANE_TWEEN * dt);
    const mark = jumpMarks.find((m) => m > p.lastMark && m <= p.v);
    if (mark !== undefined && p.jumpY <= 0) { p.jumpVy = phys.vJump; p.jumpY = 0.001; p.lastMark = mark; }
    if (p.jumpY > 0) { p.jumpVy -= phys.g * dt; p.jumpY += p.jumpVy * dt; if (p.jumpY <= 0) { p.jumpY = 0; p.jumpVy = 0; } }
  }
  potes = potes.filter((p) => !p.leave || p.leave.t < 1);
}

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
          ctx.lineWidth = 3; ctx.strokeStyle = "rgba(0,0,0,0.55)"; ctx.lineJoin = "round";
          ctx.strokeText(`@${p.name}`, g.x, g.y);
          ctx.fillStyle = "#fff";
          ctx.fillText(`@${p.name}`, g.x, g.y);
          ctx.restore();
        }
      },
    });
  }
  return out;
}
