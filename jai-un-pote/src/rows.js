// rows.js — La route, rangée par rangée. Chaque rangée entière `r` (1 unité
// de profondeur) est une fonction pure de son index et de la graine :
//   - « safe » : rien, parfois une pièce ;
//   - un STATIQUE posé dans une ou deux colonnes : animaux de la ferme,
//     fermier, botte, voiture garée, avion — on le saute s'il est bas, on le
//     contourne sinon ;
//   - une TRAVERSÉE : seulement des TRACTEURS (6 septembre 2026, retour :
//     « les voitures qui traversent n'ont pas de sens, il n'y a pas de route
//     [...] ne fais pas trop traverser, juste des tracteurs pour l'instant »),
//     position = fonction du temps, rien de stocké.
// Densité volontairement BASSE et progressive (« beaucoup trop d'objets au
// mètre carré [...] c'est trop difficile »).

import { COLS, colU, ROAD_HALF } from "./iso.js";

export const KINDS = {
  tracteur: { traverse: true,  saut: false, cout: 3, vitesse: 1.6, long: 2.4, larg: 1.05, h: 1.4, nom: "un tracteur" },
  poule:    { traverse: false, saut: true,  cout: 1, long: 0.55, larg: 0.5, h: 0.55, nom: "une poule" },
  mouton:   { traverse: false, saut: true,  cout: 1, long: 0.9,  larg: 0.6, h: 0.7,  nom: "un mouton" },
  botte:    { traverse: false, saut: true,  cout: 1, long: 0.9,  larg: 0.9, h: 0.75, nom: "une botte de foin" },
  cochon:   { traverse: false, saut: false, cout: 2, long: 1.0,  larg: 0.6, h: 0.7,  nom: "un cochon" },
  vache:    { traverse: false, saut: false, cout: 2, long: 1.5,  larg: 0.8, h: 1.1,  nom: "une vache" },
  fermier:  { traverse: false, saut: false, cout: 2, long: 0.5,  larg: 0.5, h: 1.8,  nom: "un fermier" },
  voiture:  { traverse: false, saut: false, cout: 2, long: 0.95, larg: 2.0, h: 0.75, nom: "une voiture garée" },
  avion:    { traverse: false, saut: false, cout: 3, long: 2.3,  larg: 2.6, h: 1.3,  nom: "un avion" },
};

const GRACE_ROWS = 10;
const RAMP_ROWS = 1200;         // ~3-4 minutes de course avant la pleine difficulté
const P_DANGER_START = 0.2, P_DANGER_MAX = 0.5;

let runSeed = 0;
export function reseed() { runSeed = Math.floor(Math.random() * 100000); }
reseed();
function hash(n) {
  const x = Math.sin(n * 91.173 + runSeed * 0.731) * 43758.5453;
  return x - Math.floor(x);
}

const cache = new Map();
export function reset() { cache.clear(); resolved.clear(); coins.clear(); }

function pick(list, h) {
  let total = 0;
  for (const [, w] of list) total += w;
  let r = h * total;
  for (const [k, w] of list) { r -= w; if (r <= 0) return k; }
  return list[0][0];
}

// Contenu d'une rangée. Au moins UNE rangée sûre entre deux obstacles
// (deux en début de course) : il faut toujours pouvoir se replacer.
export function rowAt(r) {
  if (cache.has(r)) return cache.get(r);
  let row;
  const t = Math.min(1, Math.max(0, r) / RAMP_ROWS);
  if (r < GRACE_ROWS) {
    row = { type: "safe", coins: r % 3 === 1 ? [1] : [] };
  } else {
    const prev1 = rowAt(r - 1), prev2 = rowAt(r - 2);
    const gapMin = t < 0.35 ? 2 : 1;
    const recentDanger = prev1.type !== "safe" || (gapMin === 2 && prev2.type !== "safe");
    const pDanger = P_DANGER_START + (P_DANGER_MAX - P_DANGER_START) * t;
    const danger = !recentDanger && hash(r * 7 + 1) < pDanger;
    if (!danger) {
      const h = hash(r * 5 + 2);
      const c0 = Math.floor(hash(r * 11 + 4) * COLS);
      const coins = h < 0.5 ? [] : h < 0.92 ? [c0] : [c0, (c0 + 1 + Math.floor(hash(r * 13 + 6) * (COLS - 1))) % COLS];
      row = { type: "safe", coins };
    } else {
      const late = 1 + t * 2;
      const kind = pick([
        ["poule", 3], ["mouton", 2], ["botte", 1.8], ["cochon", 1.2 * late], ["vache", 1.1 * late],
        ["fermier", 0.9 * late], ["voiture", 0.7 * late], ["tracteur", 0.5 * late], ["avion", 0.25 * late],
      ], hash(r * 17 + 3));
      const K = KINDS[kind];
      if (K.traverse) {
        const dir = hash(r * 19 + 8) < 0.5 ? -1 : 1;
        const period = Math.max(K.long * 3, 14 - 5 * t);
        row = { type: "traverse", kind, dir, vitesse: K.vitesse * (0.9 + hash(r * 23 + 9) * 0.3), period, phase: hash(r * 29 + 5) * period, coins: [] };
      } else {
        const c = Math.floor(hash(r * 19 + 8) * COLS);
        const cols = kind === "avion" ? [c, (c + 1) % COLS] : [c];
        const libres = [0, 1, 2].filter((x) => !cols.includes(x));
        row = { type: "statique", kind, cols, coins: hash(r * 31 + 7) < 0.35 ? [libres[Math.floor(hash(r * 37 + 2) * libres.length)]] : [] };
      }
    }
  }
  cache.set(r, row);
  return row;
}

const LIMIT = ROAD_HALF + 4.5;
export function crossersAt(r, row, t) {
  const out = [];
  const K = KINDS[row.kind];
  const head = row.phase + row.dir * row.vitesse * t;
  const kMin = Math.ceil((-LIMIT - head) / row.period), kMax = Math.floor((LIMIT - head) / row.period);
  for (let k = kMin; k <= kMax; k++) {
    out.push({ id: r * 100003 + k, r, u: head + k * row.period, dir: row.dir, kind: row.kind, K });
  }
  return out;
}

// --- Résolution ------------------------------------------------------------------
const resolved = new Set();
const coins = new Set();
export function coinTaken(r, c) { return coins.has(`${r}:${c}`); }

export function checkMember(id, u, v, airborne, t) {
  const r = Math.floor(v + 0.5);
  const row = rowAt(r);
  const events = [];
  for (const c of row.coins) {
    if (coins.has(`${r}:${c}`)) continue;
    if (Math.abs(u - colU(c)) < 0.55 && Math.abs(v - r) < 0.45) {
      coins.add(`${r}:${c}`);
      events.push({ type: "piece", r, c });
    }
  }
  if (row.type === "traverse") {
    for (const inst of crossersAt(r, row, t)) {
      const key = `${inst.id}:${id}`;
      if (resolved.has(key)) continue;
      if (Math.abs(inst.u - u) < inst.K.long / 2 + 0.3 && Math.abs(v - r) < 0.5) {
        resolved.add(key);
        if (!(airborne && inst.K.saut)) events.push({ type: "obstacle", kind: inst.kind, cout: inst.K.cout, saut: inst.K.saut });
      }
    }
  } else if (row.type === "statique") {
    const key = `s${r}:${id}`;
    if (!resolved.has(key)) {
      const K = KINDS[row.kind];
      for (const c of row.cols) {
        if (Math.abs(u - colU(c)) < 0.58 && Math.abs(v - r) < K.larg / 2 + 0.15) {
          resolved.add(key);
          if (!(airborne && K.saut)) events.push({ type: "obstacle", kind: row.kind, cout: K.cout, saut: K.saut });
          break;
        }
      }
    }
  }
  return events;
}
