// rows.js — La route, rangée par rangée, fonction pure de l'index et de la
// graine (sauf l'ARMEMENT des traversées, qui dépend du moment où le joueur
// arrive — voir armer()).
//   - « safe » : rien, ou une pièce, ou une brique de lait, ou une pièce ROUGE,
//     ou une flaque de boue sur une voie ;
//   - « statique » : animal / fermier / botte / voiture garée posé dans une
//     colonne — on le saute s'il est bas, on le contourne sinon ;
//   - « traverse » : un TRACTEUR qui traverse, ou une POULE LANCÉE par un
//     fermier posté au bord. ⚠️ Calés sur le passage du joueur (6 septembre
//     2026 : « quand il y a un tracteur qui traverse, il faut vraiment qu'il
//     traverse quand on est là ») : la traversée s'arme ~2,6 s avant l'arrivée
//     du joueur et vise une colonne au moment où il passe.

import { COLS, colU, ROAD_HALF } from "./iso.js";

export const KINDS = {
  tracteur:  { traverse: true,  saut: false, cout: 3, vitesse: 2.2, long: 2.4, larg: 1.05, h: 1.4, nom: "un tracteur" },
  poulelancee: { traverse: true, saut: true, cout: 1, vitesse: 4.5, long: 0.55, larg: 0.5, h: 0.55, nom: "une poule lancée" },
  poule:    { traverse: false, saut: true,  cout: 1, long: 0.55, larg: 0.5,  h: 0.55, nom: "une poule" },
  chat:     { traverse: false, saut: true,  cout: 1, long: 0.6,  larg: 0.35, h: 0.4,  nom: "un chat" },
  chien:    { traverse: false, saut: true,  cout: 1, long: 0.8,  larg: 0.4,  h: 0.6,  nom: "un chien" },
  mouton:   { traverse: false, saut: true,  cout: 1, long: 0.9,  larg: 0.6,  h: 0.7,  nom: "un mouton" },
  botte:    { traverse: false, saut: true,  cout: 1, long: 0.9,  larg: 0.9,  h: 0.75, nom: "une botte de foin" },
  cochon:   { traverse: false, saut: false, cout: 2, long: 1.0,  larg: 0.6,  h: 0.7,  nom: "un cochon" },
  vache:    { traverse: false, saut: false, cout: 2, long: 1.5,  larg: 0.8,  h: 1.1,  nom: "une vache" },
  fermier:  { traverse: false, saut: false, cout: 2, long: 0.5,  larg: 0.5,  h: 1.8,  nom: "un fermier" },
  voiture:  { traverse: false, saut: false, cout: 2, long: 0.95, larg: 2.0,  h: 0.75, nom: "une voiture garée" },
};

const GRACE_ROWS = 40;    // 10 → 40 (« laisse vraiment du temps au début ») : ~9 s sans rien
const RAMP_ROWS = 1000;
const P_DANGER_START = 0.10, P_DANGER_MAX = 0.30; // 0,42 → 0,30 (« trop d'informations en même temps »)
const LAIT_EVERY = 48;    // brique de lait : une chance toutes les ~48 rangées
const ROUGE_EVERY = 70;   // pièce rouge : toutes les ~70 rangées

let runSeed = 0;
export function reseed(force) { runSeed = force !== undefined ? force : Math.floor(Math.random() * 100000); }
reseed();
function hash(n) {
  const x = Math.sin(n * 91.173 + runSeed * 0.731) * 43758.5453;
  return x - Math.floor(x);
}

const cache = new Map();
let fenetreSure = null; // [from, to] : rangées forcées sûres (turbo lait)
export function reset() { cache.clear(); resolved.clear(); coins.clear(); fenetreSure = null; }

// TURBO LAIT (7 septembre 2026 : « quand ça va plus vite, il faudrait qu'à ce
// moment il n'y ait pas d'obstacles, sinon personne ne voudra aller plus
// vite ») : les rangées [from, to] deviennent sûres, avec une pièce sur deux
// — même celles déjà hachées, tant qu'elles ne sont pas encore à l'écran.
export function ouvrirFenetreSure(from, to) {
  fenetreSure = [from, to];
  for (let r = from; r <= to; r++) cache.set(r, { type: "safe", coins: r % 3 === 1 ? [Math.floor(hash(r * 11 + 4) * COLS)] : [], boue: null });
}

function pick(list, h) {
  let total = 0;
  for (const [, w] of list) total += w;
  let r = h * total;
  for (const [k, w] of list) { r -= w; if (r <= 0) return k; }
  return list[0][0];
}

export function rowAt(r) {
  if (cache.has(r)) return cache.get(r);
  let row;
  const t = Math.min(1, Math.max(0, r) / RAMP_ROWS);
  if (r < GRACE_ROWS || (fenetreSure && r >= fenetreSure[0] && r <= fenetreSure[1])) {
    row = { type: "safe", coins: r % 3 === 1 ? [Math.floor(hash(r * 11 + 4) * COLS)] : [], boue: null };
  } else {
    const prev1 = rowAt(r - 1), prev2 = rowAt(r - 2), prev3 = rowAt(r - 3);
    const gapMin = 3; // toujours 3 rangées sûres entre deux dangers
    const recentDanger = prev1.type !== "safe" || prev2.type !== "safe" || (gapMin === 3 && prev3.type !== "safe");
    const pDanger = P_DANGER_START + (P_DANGER_MAX - P_DANGER_START) * t;
    const danger = !recentDanger && hash(r * 7 + 1) < pDanger;
    if (!danger) {
      const h = hash(r * 5 + 2);
      const c0 = Math.floor(hash(r * 11 + 4) * COLS);
      // Pièces sur 25 % des rangées sûres (40 % avant : « beaucoup trop »),
      // jamais juste après un danger (une chose à la fois).
      const coins = h < 0.75 || prev1.type !== "safe" ? [] : [c0];
      row = { type: "safe", coins, boue: null };
      // Boue : une flaque de 3 rangées sur une voie, de temps en temps.
      const boueDe = prev1.type === "safe" && prev1.boue !== null && prev1.boueLen < 3 ? prev1.boue : null;
      if (boueDe !== null) { row.boue = boueDe; row.boueLen = prev1.boueLen + 1; }
      else if (t > 0.08 && hash(r * 43 + 6) < 0.05) { row.boue = Math.floor(hash(r * 47 + 1) * COLS); row.boueLen = 1; }
      // Lait et pièce rouge : rares, jamais sur une rangée à pièce.
      if (r % LAIT_EVERY === 24 && !coins.length) row.lait = Math.floor(hash(r * 53 + 2) * COLS);
      if (r % ROUGE_EVERY === 40 && !coins.length && row.lait === undefined) row.rouge = Math.floor(hash(r * 59 + 3) * COLS);
    } else {
      const late = 1 + t * 2;
      const kind = pick([
        ["poule", 3], ["chat", 1.6], ["chien", 1.2], ["mouton", 2], ["botte", 1.8], ["cochon", 1.2 * late],
        ["vache", 1.1 * late], ["fermier", 0.9 * late], ["voiture", 0.7 * late], ["tracteur", 1.3 * late], ["poulelancee", 0.9 * late],
      ], hash(r * 17 + 3));
      const K = KINDS[kind];
      if (K.traverse) {
        const dir = hash(r * 19 + 8) < 0.5 ? -1 : 1;
        // Colonne visée au moment où le joueur passe : le tracteur couvre deux
        // voies, la poule une seule — il reste toujours de quoi passer.
        const cible = Math.floor(hash(r * 23 + 9) * COLS);
        row = { type: "traverse", kind, dir, cible, armed: false, t0: 0, u0: 0, vitesse: K.vitesse, coins: [], boue: null };
      } else {
        const c = Math.floor(hash(r * 19 + 8) * COLS);
        const libres = [0, 1, 2].filter((x) => x !== c);
        row = { type: "statique", kind, cols: [c], coins: [], boue: null };
      }
    }
  }
  cache.set(r, row);
  return row;
}

// Armement d'une traversée : elle part du bord et atteint la colonne visée
// exactement à `tArrivee` (instant où le joueur sera sur la rangée).
export function armer(row, now, tArrivee) {
  if (row.armed) return;
  row.armed = true;
  row.t0 = now;
  row.u0 = -row.dir * (ROAD_HALF + 6.0); // part hors champ (l'écran montre ~±7 unités)
  const dist = Math.abs(colU(row.cible) - row.u0);
  const dt = Math.max(0.6, tArrivee - now);
  row.vitesse = Math.max(1.8, Math.min(9, dist / dt));
}

// Instance visible d'une traversée à l'instant t (une seule par rangée).
export function crossersAt(r, row, t) {
  if (!row.armed) return [];
  const K = KINDS[row.kind];
  const u = row.u0 + row.dir * row.vitesse * (t - row.t0);
  if (Math.abs(u) > ROAD_HALF + 6.4) return [];
  return [{ id: r * 100003, r, u, dir: row.dir, kind: row.kind, K }];
}

// --- Résolution ------------------------------------------------------------------
const resolved = new Set();
const coins = new Set();
export function coinTaken(r, c) { return coins.has(`${r}:${c}`); }
export function bonusTaken(r, kind) { return coins.has(`${r}:${kind}`); }

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
  for (const kind of ["lait", "rouge"]) {
    if (row[kind] === undefined || coins.has(`${r}:${kind}`)) continue;
    if (Math.abs(u - colU(row[kind])) < 0.55 && Math.abs(v - r) < 0.45) {
      coins.add(`${r}:${kind}`);
      events.push({ type: kind, r, c: row[kind] });
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
