// track.js — La grille rythmique : un créneau tous les `cadenceSpawnBeats`
// temps du morceau, chaque créneau porte une étoile OU un obstacle. Même
// principe que entities.js du premier jeu (aucune position stockée : la
// profondeur se recalcule à chaque frame depuis le temps musical), en bien
// plus court : pas de voies, pas de rangées, pas de ponts.
//
//   z = PLAYER_NEAR_Z + (temps d'arrivée du créneau − maintenant) × vitesse
//
// Les étoiles tombent sur une des trois COLONNES de la chaussée : le joueur
// roule au centre, ses potes à gauche et à droite (friends.js). Une étoile
// latérale n'est ramassée que si un pote y roule — plus on a de potes, plus
// on ramasse, plus on gagne de potes : c'est la boule de neige voulue.

import { clock } from "./clock.js";
import { PLAYER_NEAR_Z, getSpeed } from "./road.js";
import { OBSTACLES, WEIGHTS, CLEAR_HEIGHT } from "./obstacles.js";

const CADENCE = window.CONFIG.cadenceSpawnBeats;
export const VISIBLE_Z_MAX = 170;
export const FADE_BAND = 50;
const LEAD_IN_START_Z = 80;
export const LEAD_IN = (LEAD_IN_START_Z - 2 - PLAYER_NEAR_Z) / getSpeed() - window.CONFIG.premierTempsOffset;

// Premiers créneaux sans obstacle : le temps de voir arriver la route.
const GRACE_SLOTS = 6;
// Densité d'obstacles : de 32 % des créneaux au départ à 62 % au bout de
// DIFF_RAMP_S secondes de course, puis constante.
const RATIO_START = 0.32, RATIO_MAX = 0.62, DIFF_RAMP_S = 150;

let runSeed = 0;
export function reseed() { runSeed = Math.floor(Math.random() * 100000); }
export function getRunSeed() { return runSeed; }
reseed();

function hash(n) {
  const x = Math.sin(n * 91.173 + runSeed * 0.731) * 43758.5453;
  return x - Math.floor(x);
}

function timeOfSlot(k) { return clock.timeOfBeat(k * CADENCE); }
function slotZ(k, now, speed) { return PLAYER_NEAR_Z + (timeOfSlot(k) - now) * speed; }

function ratioAt(k) {
  const t = Math.max(0, timeOfSlot(k));
  return RATIO_START + (RATIO_MAX - RATIO_START) * Math.min(1, t / DIFF_RAMP_S);
}

const KINDS = Object.keys(OBSTACLES);

function pickKind(k) {
  const t = Math.max(0, timeOfSlot(k));
  // Les gros obstacles (coût 3) montent avec le temps.
  const late = 1 + Math.min(2.5, t / 60);
  let total = 0;
  const weights = KINDS.map((kind) => {
    const w = WEIGHTS[kind] * (OBSTACLES[kind].cout >= 3 ? late : OBSTACLES[kind].cout === 2 ? (1 + late) / 2 : 1);
    total += w;
    return w;
  });
  let r = hash(k * 13 + 5) * total;
  for (let i = 0; i < KINDS.length; i++) {
    r -= weights[i];
    if (r <= 0) return KINDS[i];
  }
  return KINDS[0];
}

const cache = new Map();

// Contenu d'un créneau — fonction pure de l'index (et de la graine), mémoïsée.
// Règle de jouabilité : jamais deux obstacles « longs » d'affilée, et un
// obstacle après un obstacle court seulement passé 45 s (et une fois sur
// trois) — un tap par 1,06 s, c'est le rythme maximal tenable.
export function contentAt(k) {
  if (cache.has(k)) return cache.get(k);
  let c;
  if (k < GRACE_SLOTS) {
    c = star(k);
  } else {
    const prev = k > 0 ? contentAt(k - 1) : null;
    const prevObs = prev && !prev.isBonus;
    let obstacle = hash(k * 7 + 1) < ratioAt(k);
    if (prevObs) {
      const t = timeOfSlot(k);
      if (OBSTACLES[prev.kind].saut === "long" || t < 45 || hash(k * 3 + 9) > 0.33) obstacle = false;
    }
    c = obstacle ? { isBonus: false, kind: pickKind(k) } : star(k);
  }
  cache.set(k, c);
  return c;
}

function star(k) {
  const r = hash(k * 5 + 2);
  const tier = r < 0.6 ? "petite" : r < 0.9 ? "moyenne" : "grosse";
  const rc = hash(k * 11 + 4);
  const col = rc < 0.5 ? 0 : rc < 0.75 ? -1 : 1;
  // Les grosses sont aériennes : il faut sauter pour les prendre.
  return { isBonus: true, tier, col, aerial: tier === "grosse" };
}

const resolved = new Set();
const consumed = new Set();
export function isConsumed(k) { return consumed.has(k); }

export function reset() {
  resolved.clear();
  consumed.clear();
  cache.clear();
}

// Créneaux visibles, triés du plus loin au plus proche (ordre du peintre).
let lastKey = null, lastSlots = [];
export function slotsFor(now, speed) {
  const key = now * 1000003 + speed;
  if (key === lastKey) return lastSlots;
  const out = [];
  // Premier créneau pas encore passé loin derrière le joueur.
  const kMin = Math.max(0, Math.floor(clock.beatIndexAt(now - 3 / Math.max(1, speed) * 20) / CADENCE));
  for (let k = kMin; k < kMin + 400; k++) {
    const z = slotZ(k, now, speed);
    if (z > VISIBLE_Z_MAX) break;
    if (z < -2) continue;
    out.push({ index: k, z, ...contentAt(k) });
  }
  out.sort((a, b) => b.z - a.z);
  lastKey = key;
  lastSlots = out;
  return out;
}

const Z_WINDOW = 1.0;
const Z_WINDOW_AIR = 2.0;

// Collisions du pas. `cols` = colonnes occupées par le peloton (0 = joueur,
// toujours ; ±1 si un pote y roule). Renvoie les événements survenus.
export function update(now, speed, jumpY, cols) {
  const events = [];
  for (const s of slotsFor(now, speed)) {
    if (resolved.has(s.index)) continue;
    if (s.isBonus) {
      const win = s.aerial ? Z_WINDOW_AIR : Z_WINDOW;
      if (s.z > PLAYER_NEAR_Z + win) continue;
      if (s.z < PLAYER_NEAR_Z - win) { resolved.add(s.index); continue; }
      const reachable = cols.has(s.col) && (!s.aerial || jumpY > 0.7);
      if (reachable) {
        resolved.add(s.index);
        consumed.add(s.index);
        events.push({ type: "etoile", tier: s.tier, col: s.col, aerial: s.aerial, index: s.index });
      }
    } else {
      if (s.z > PLAYER_NEAR_Z) continue;
      resolved.add(s.index);
      const o = OBSTACLES[s.kind];
      const cleared = jumpY >= CLEAR_HEIGHT[o.saut];
      events.push({ type: "obstacle", kind: s.kind, cleared, cout: o.cout, index: s.index });
    }
  }
  return events;
}
